import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, MapPin, Armchair, Settings, ArrowLeft, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { SeatChart } from '@/components/seat-chart';
import { AdminPanel } from '@/components/admin-panel';
import { NameModal } from '@/components/name-modal';
import { SeatEditModal } from '@/components/seat-edit-modal';
import { useWebSocket } from '@/hooks/use-websocket';
import { apiRequest } from '@/lib/queryClient';
import { countAvailableInZone } from '@/lib/zone-utils';
import type { Event, Seat, FloorConfig } from '@shared/schema';

function loadUserSeatId(): string | null {
  const email = localStorage.getItem("currentUserEmail");
  if (!email) return null;
  try {
    const raw = localStorage.getItem(`userData_${email}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.selectedSeatId || null;
  } catch {
    return null;
  }
}

function saveUserData(email: string, data: Record<string, any>) {
  try {
    const existing = JSON.parse(localStorage.getItem(`userData_${email}`) || '{}');
    localStorage.setItem(`userData_${email}`, JSON.stringify({ ...existing, ...data }));
  } catch {
    localStorage.setItem(`userData_${email}`, JSON.stringify(data));
  }
}

function loadUserTicketType(): string | null {
  const email = localStorage.getItem("currentUserEmail");
  if (!email) return null;
  try {
    const raw = localStorage.getItem(`userData_${email}`);
    if (!raw) return null;
    return JSON.parse(raw)?.ticketType || null;
  } catch { return null; }
}

export default function Home() {
  const [selectedSeat, setSelectedSeat] = useState<Seat | null>(null);
  const [currentEmail, setCurrentEmail] = useState<string>(() => localStorage.getItem("currentUserEmail") || "");
  const [userSelectedSeatId, setUserSelectedSeatId] = useState<string | null>(() => loadUserSeatId());
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => sessionStorage.getItem('adminLoggedIn') === 'true');
  const [showNameModal, setShowNameModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showSeatEditModal, setShowSeatEditModal] = useState(false);
  const [editingSeat, setEditingSeat] = useState<Seat | null>(null);
  const hasSeatRef = useRef<boolean>(!!loadUserSeatId());
  const [wsConnected, setWsConnected] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Reset per-email state whenever the user switches to a different email.
  // The Home component is never fully unmounted (EmailGate keeps it in the
  // blurred background), so we must reset refs and state manually here.
  useEffect(() => {
    const handleEmailChanged: EventListener = (e) => {
      const newEmail = (e as unknown as CustomEvent<{ email: string }>).detail.email;
      setCurrentEmail(newEmail);
      const seatId = (() => {
        try {
          const raw = localStorage.getItem(`userData_${newEmail}`);
          return raw ? JSON.parse(raw).selectedSeatId || null : null;
        } catch { return null; }
      })();
      setUserSelectedSeatId(seatId);
      hasSeatRef.current = !!seatId;
      lastSyncedSeatIdRef.current = null;
      setSelectedSeat(null);
      setShowNameModal(false);
      queryClient.removeQueries({ queryKey: ['/api/user-data'] });
    };
    window.addEventListener('email-changed', handleEmailChanged);
    return () => window.removeEventListener('email-changed', handleEmailChanged);
  }, [queryClient]);

  // ── Server user-data (source of truth, polled every 5s) ──────────────────
  const { data: userData } = useQuery({
    queryKey: ['/api/user-data', currentEmail],
    queryFn: async () => {
      if (!currentEmail) return null;
      const response = await apiRequest('GET', `/api/user-data?email=${encodeURIComponent(currentEmail)}`);
      return response.json();
    },
    enabled: !!currentEmail,
    refetchInterval: wsConnected ? false : 30000,
    refetchIntervalInBackground: false,
  });

  const userTicketType = userData?.ticketType || loadUserTicketType();

  // Sync server seat state to local - only when the value actually changes
  // NOTE: userSelectedSeatId intentionally EXCLUDED from deps to prevent loops
  const lastSyncedSeatIdRef = useRef<string | null>(undefined as any);
  useEffect(() => {
    if (!userData) return;
    const serverSeatId = userData.selectedSeat?.seatId || null;
    if (serverSeatId === lastSyncedSeatIdRef.current) return; // already in sync
    lastSyncedSeatIdRef.current = serverSeatId;

    setUserSelectedSeatId(serverSeatId);
    hasSeatRef.current = !!serverSeatId;

    const email = localStorage.getItem("currentUserEmail");
    if (email) {
      const existing = localStorage.getItem(`userData_${email}`);
      const parsed = existing ? JSON.parse(existing) : {};
      if (parsed.selectedSeatId !== serverSeatId || parsed.ticketType !== userData.ticketType) {
        saveUserData(email, { selectedSeatId: serverSeatId, ticketType: userData.ticketType });
      }
    }
  }, [userData]);

  // ── Bootstrap queries ─────────────────────────────────────────────────────
  useQuery({
    queryKey: ['/api/initialize'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/initialize');
      return response.json();
    }
  });

  const { data: event } = useQuery<Event>({
    queryKey: ['/api/event'],
    refetchOnWindowFocus: false
  });

  const { data: seats = [], isFetching: seatsFetching } = useQuery<Seat[]>({
    queryKey: ['/api/seats'],
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    refetchInterval: wsConnected ? false : 30000,
    refetchIntervalInBackground: false,
  });

  // Memoized stats - zone-aware available count
  const stats = useMemo(() => {
    const isActuallyAdmin = sessionStorage.getItem('adminLoggedIn') === 'true';
    const floorConfigs = (event?.floorConfigs as FloorConfig[]) || [];
    return {
      total: seats.length,
      booked: seats.filter(s => s.status === 'booked').length,
      available: countAvailableInZone(seats, floorConfigs, userTicketType, isActuallyAdmin),
    };
  }, [seats, userTicketType, event?.floorConfigs]);

  // ── Optimistic book mutation ──────────────────────────────────────────────
  const bookSeatMutation = useMutation({
    mutationFn: async ({ seatId, bookedBy, bookedByEmail }: { seatId: string; bookedBy: string; bookedByEmail: string }) => {
      const response = await apiRequest('POST', '/api/seats/book', { seatId, bookedBy, bookedByEmail });
      return response.json();
    },
    onMutate: async ({ seatId, bookedBy }) => {
      // Cancel any outgoing refetches so they don't overwrite the optimistic update
      await queryClient.cancelQueries({ queryKey: ['/api/seats'] });
      const previousSeats = queryClient.getQueryData<Seat[]>(['/api/seats']);

      // Optimistically mark the seat as booked immediately
      queryClient.setQueryData<Seat[]>(['/api/seats'], (old = []) =>
        old.map(s => s.id === seatId ? { ...s, status: 'booked' as const, bookedBy } : s)
      );
      return { previousSeats };
    },
    onSuccess: (seat: Seat) => {
      hasSeatRef.current = true;
      setUserSelectedSeatId(seat.id);
      const email = localStorage.getItem("currentUserEmail");
      if (email) saveUserData(email, { selectedSeatId: seat.id, fullName: seat.bookedBy });
      // Reconcile with server truth
      queryClient.invalidateQueries({ queryKey: ['/api/seats'] });
      toast({ title: "Booked!", description: `Floor ${seat.floor} - Seat ${seat.seatNumber} confirmed` });
    },
    onError: (error: any, _vars, context) => {
      // Roll back optimistic update
      if (context?.previousSeats) {
        queryClient.setQueryData(['/api/seats'], context.previousSeats);
      }
      hasSeatRef.current = !!userSelectedSeatId;
      // Force a refetch so the chart immediately reflects the latest server truth
      queryClient.invalidateQueries({ queryKey: ['/api/seats'] });

      const isConflict = error?.status === 409;
      const message = error instanceof Error ? error.message : "Failed to book seat";
      toast({
        title: isConflict ? "Seat Unavailable" : "Error",
        description: isConflict ? "Seat already booked, please select another seat." : message,
        variant: "destructive"
      });
    }
  });

  // ── WebSocket real-time sync ──────────────────────────────────────────────
  useWebSocket((message) => {
    switch (message.type) {
      case 'EVENT_UPDATED':
        queryClient.invalidateQueries({ queryKey: ['/api/event'] });
        break;

      // Single-seat change: apply the updated seat directly to the cache so
      // ALL views (SeatChart + AdminPanel management table) re-render
      // immediately - zero network round-trip, no stale data window.
      case 'SEAT_BOOKED':
      case 'SEAT_CANCELLED':
      case 'SEAT_UPDATED':
        if (message.seat) {
          queryClient.setQueryData<Seat[]>(['/api/seats'], (old = []) =>
            old.map(s => s.id === (message.seat as Seat).id ? (message.seat as Seat) : s)
          );
        }
        break;

      case 'SEATS_RESET':
        hasSeatRef.current = false;
        setUserSelectedSeatId(null);
        lastSyncedSeatIdRef.current = null;
        const email = localStorage.getItem("currentUserEmail");
        if (email) saveUserData(email, { selectedSeatId: null, fullName: null });
        queryClient.invalidateQueries({ queryKey: ['/api/seats'] });
        break;
    }
  }, {
    onConnect: () => setWsConnected(true),
    onDisconnect: () => setWsConnected(false),
  });

  // Guard: if the user's booked seat disappeared (admin reset), clear selection.
  // Skip while refetching or booking mutation is in flight.
  useEffect(() => {
    if (seatsFetching || bookSeatMutation.isPending) return;
    if (userSelectedSeatId && seats.length > 0) {
      const stillBooked = seats.find(s => s.id === userSelectedSeatId && s.status === 'booked');
      if (!stillBooked) {
        hasSeatRef.current = false;
        setUserSelectedSeatId(null);
        lastSyncedSeatIdRef.current = null;
        const email = localStorage.getItem("currentUserEmail");
        if (email) saveUserData(email, { selectedSeatId: null });
      }
    }
  }, [seats, userSelectedSeatId, seatsFetching, bookSeatMutation.isPending]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  // Single entry point for any seat click. Role determines behavior:
  //  - admin → open the dedicated SeatEditModal (PATCH via admin-only API)
  //  - user  → open the booking NameModal; cancellation is disabled by product rule.
  const handleSeatSelect = (seat: Seat) => {
    const isActuallyAdmin = sessionStorage.getItem('adminLoggedIn') === 'true';

    if (isActuallyAdmin) {
      setEditingSeat(seat);
      setShowSeatEditModal(true);
      return;
    }

    // Users may not modify or change a booking once it exists (final/immutable).
    if (hasSeatRef.current || bookSeatMutation.isPending) {
      toast({
        title: "Booking is Final",
        description: "Your seat booking has been confirmed and cannot be changed.",
        variant: "destructive"
      });
      return;
    }
    setSelectedSeat(seat);
    setShowNameModal(true);
  };

  const handleConfirmBooking = async (fullName: string, email: string) => {
    if (!selectedSeat) return;
    setShowNameModal(false);

    const isActuallyAdmin = sessionStorage.getItem('adminLoggedIn') === 'true';
    if (hasSeatRef.current && !isActuallyAdmin) {
      toast({
        title: "Booking is Final",
        description: "Your seat booking has been confirmed and cannot be changed.",
        variant: "destructive"
      });
      setSelectedSeat(null);
      return;
    }

    // Race-condition guard: re-fetch the latest seat state from the backend
    // BEFORE submitting so we don't try to book a seat someone just took.
    try {
      const freshSeatsRes = await apiRequest('GET', '/api/seats');
      const freshSeats: Seat[] = await freshSeatsRes.json();
      const fresh = freshSeats.find(s => s.id === selectedSeat.id);
      if (!fresh || fresh.status !== 'available') {
        // Update cache with fresh truth so the UI reflects reality immediately
        queryClient.setQueryData(['/api/seats'], freshSeats);
        toast({
          title: "Seat Unavailable",
          description: "Seat already booked, please select another seat.",
          variant: "destructive"
        });
        setSelectedSeat(null);
        return;
      }
    } catch {
      // If the revalidation request fails, fall through and let the backend
      // 409 response be the final guard.
    }

    if (!isActuallyAdmin) hasSeatRef.current = true;
    bookSeatMutation.mutate({ seatId: selectedSeat.id, bookedBy: fullName, bookedByEmail: email });
    setSelectedSeat(null);
  };

  const handleBackToEmail = async () => {
    // Revoke the admin token on the backend before clearing client state
    try {
      if (sessionStorage.getItem('adminToken')) {
        await apiRequest('POST', '/api/admin/logout');
      }
    } catch {}
    sessionStorage.removeItem('adminLoggedIn');
    sessionStorage.removeItem('adminToken');
    sessionStorage.removeItem('isAdmin');
    setIsAdminLoggedIn(false);
    window.dispatchEvent(new CustomEvent('reset-email-gate'));
  };

  const userSeat = seats.find(s => s.id === userSelectedSeatId);
  const userSeatDisplay = userSeat
    ? `Floor ${userSeat.floor} - ${userSeat.seatNumber}`
    : 'None Selected';

  if (!event) {
    return (
      <div className="min-h-screen bg-dark-bg text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <img src="/logo.png" alt="TEDx Logo" className="w-full h-full object-contain" />
          </div>
          <p>Loading event...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg text-white">

      {/* Header */}
      <header className="bg-dark-surface border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 flex items-center justify-center overflow-hidden bg-black rounded-xl border border-white/5 shadow-2xl group">
                <img
                  src="/logo.png"
                  alt="TEDx Logo"
                  className="h-full w-full object-contain scale-150 transform translate-y-[1px] transition-transform duration-300 group-hover:scale-[1.6]"
                />
              </div>
              <div className="flex flex-col justify-center">
                <h1 className="text-xl font-bold leading-tight tracking-tight">{event.name}</h1>
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] font-bold">IDEAS CHANGE EVERYTHING</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdminPanel(true)}
              className="text-gray-400 hover:text-tedx-red border-gray-600 hover:border-tedx-red"
            >
              <Settings className="w-3 h-3 mr-1" />
              Admin
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Back button */}
        <div className="flex justify-start">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToEmail}
            className="text-gray-400 hover:text-white hover:bg-white/5 flex items-center gap-2 px-3 h-9 rounded-xl transition-all duration-300 group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            <span className="text-sm font-medium tracking-wide">Back</span>
          </Button>
        </div>

        {/* Event Info */}
        <div className="bg-dark-surface rounded-2xl p-6 border border-white/5 shadow-2xl backdrop-blur-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:divide-x md:divide-white/5">
            <div className="flex flex-col md:flex-row items-center md:items-start justify-center md:justify-start gap-4 px-2">
              <div className="w-10 h-10 rounded-xl bg-tedx-red/10 flex items-center justify-center shrink-0 border border-tedx-red/20 shadow-[0_0_15px_rgba(235,0,40,0.1)]">
                <Calendar className="text-tedx-red w-5 h-5" />
              </div>
              <div className="text-center md:text-left space-y-1">
                <p className="text-gray-500 text-[10px] uppercase tracking-[0.2em] font-bold">Date & Time</p>
                <p className="font-semibold text-sm text-white/90 break-words">{event.datetime}</p>
              </div>
            </div>
            <div className="flex flex-col md:flex-row items-center md:items-start justify-center md:justify-start gap-4 px-2 md:pl-8">
              <div className="w-10 h-10 rounded-xl bg-tedx-red/10 flex items-center justify-center shrink-0 border border-tedx-red/20 shadow-[0_0_15px_rgba(235,0,40,0.1)]">
                <MapPin className="text-tedx-red w-5 h-5" />
              </div>
              <div className="text-center md:text-left space-y-1">
                <p className="text-gray-500 text-[10px] uppercase tracking-[0.2em] font-bold">Location</p>
                <p className="font-semibold text-sm text-white/90 break-words">{event.location}</p>
              </div>
            </div>
            <div className="flex flex-col md:flex-row items-center md:items-start justify-center md:justify-start gap-4 px-2 md:pl-8">
              <div className="w-10 h-10 rounded-xl bg-tedx-red/10 flex items-center justify-center shrink-0 border border-tedx-red/20 shadow-[0_0_15px_rgba(235,0,40,0.1)]">
                <Armchair className="text-tedx-red w-5 h-5" />
              </div>
              <div className="text-center md:text-left space-y-1">
                <p className="text-gray-500 text-[10px] uppercase tracking-[0.2em] font-bold">Your Seat</p>
                <p className="font-semibold text-sm text-white/90 break-words">{userSeatDisplay}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Seat Chart */}
        <div className="bg-dark-surface rounded-xl p-5 border border-gray-800 shadow-sm">
          <SeatChart
            seats={seats}
            floorConfigs={(event.floorConfigs as FloorConfig[]) || []}
            onSeatSelect={handleSeatSelect}
            userSelectedSeatId={userSelectedSeatId}
            ticketType={userTicketType}
            isAdmin={isAdminLoggedIn}
          />
        </div>

        {/* Booking confirmed - final, immutable from user side */}
        {userSelectedSeatId && !isAdminLoggedIn && (
          <div className="flex justify-center">
            <div className="h-11 px-8 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-xl flex items-center gap-2 font-bold text-sm shadow-[0_0_20px_rgba(16,185,129,0.08)]">
              <Lock className="w-4 h-4" />
              Booking Confirmed - Final
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="bg-dark-surface border-t border-gray-800 mt-8 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 text-sm text-gray-400">
            <div className="flex items-center space-x-2 group cursor-pointer">
              <div className="w-6 h-6 rounded-full bg-tedx-red/10 flex items-center justify-center text-tedx-red transition-colors group-hover:bg-tedx-red group-hover:text-white">
                <i className="fas fa-envelope text-[10px]" />
              </div>
              <span className="text-gray-500 font-medium">Email:</span>
              <span className="group-hover:text-white transition-colors tracking-wide">{event.contactEmail}</span>
            </div>
            <div className="flex items-center space-x-2 group cursor-pointer">
              <div className="w-6 h-6 rounded-full bg-tedx-red/10 flex items-center justify-center text-tedx-red transition-colors group-hover:bg-tedx-red group-hover:text-white">
                <i className="fas fa-phone text-[10px]" />
              </div>
              <span className="text-gray-500 font-medium">Telephone:</span>
              <span className="group-hover:text-white transition-colors tracking-wide">{event.contactPhone}</span>
            </div>
            <a
              href="https://www.facebook.com/TEDxFTU?locale=vi_VN"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 group cursor-pointer"
            >
              <div className="w-6 h-6 rounded-full bg-tedx-red/10 flex items-center justify-center text-tedx-red transition-colors group-hover:bg-tedx-red group-hover:text-white">
                <i className="fab fa-facebook text-[10px]" />
              </div>
              <span className="text-gray-500 font-medium">Facebook:</span>
              <span className="group-hover:text-white transition-colors tracking-wide">{event.contactFacebook}</span>
            </a>
          </div>
        </div>
        <span className="absolute bottom-2 right-3 text-[10px] opacity-30 text-gray-500 font-mono">
          byDoDucAnhKhoi
        </span>
      </footer>

      <NameModal
        open={showNameModal}
        onClose={() => setShowNameModal(false)}
        selectedSeat={selectedSeat ? `Floor ${selectedSeat.floor} - ${selectedSeat.seatNumber}` : null}
        onConfirm={handleConfirmBooking}
      />

      <AdminPanel
        open={showAdminPanel}
        onClose={() => {
          setShowAdminPanel(false);
          setIsAdminLoggedIn(sessionStorage.getItem('adminLoggedIn') === 'true');
        }}
        event={event}
        seats={seats}
      />

      <SeatEditModal
        open={showSeatEditModal}
        onClose={() => {
          setShowSeatEditModal(false);
          setEditingSeat(null);
        }}
        seat={editingSeat}
      />
    </div>
  );
}

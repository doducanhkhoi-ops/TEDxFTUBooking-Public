import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Settings, Save, Download, RotateCcw, Edit, Phone, Armchair, Cog, ArrowLeft, Eye, EyeOff, X, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { Event, Seat, FloorConfig, TierZones } from '@shared/schema';

interface AdminPanelProps {
  open: boolean;
  onClose: () => void;
  event: Event | null;
  seats: Seat[];
}

type EventFormData = {
  name: string;
  datetime: string;
  location: string;
  contactEmail: string;
  contactPhone: string;
  contactFacebook: string;
};

function buildEventFormData(event: Event | null): EventFormData {
  return {
    name: event?.name || '',
    datetime: event?.datetime || '',
    location: event?.location || '',
    contactEmail: event?.contactEmail || '',
    contactPhone: event?.contactPhone || '',
    contactFacebook: event?.contactFacebook || '',
  };
}

const DEFAULT_TIER_ZONES: TierZones = { Premium: "1", VIP: "1", Standard: "1" };

function buildFloorConfigs(event: Event | null): FloorConfig[] {
  const defaults = [
    { floor: 1, numRows: 5, seatsPerRow: 8, aislePositions: [3, 6], tierZones: DEFAULT_TIER_ZONES },
    { floor: 2, numRows: 5, seatsPerRow: 8, aislePositions: [3, 6], tierZones: DEFAULT_TIER_ZONES },
  ];
  if (!event) return defaults;
  const configs = (event.floorConfigs as FloorConfig[]) || defaults;
  return configs.map(c => ({ ...c, tierZones: c.tierZones || DEFAULT_TIER_ZONES }));
}

export function AdminPanel({ open, onClose, event, seats }: AdminPanelProps) {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return sessionStorage.getItem('adminLoggedIn') === 'true';
  });
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [formData, setFormData] = useState<EventFormData>(() => buildEventFormData(event));
  const [savedData, setSavedData] = useState<EventFormData>(() => buildEventFormData(event));
  const [floorConfigs, setFloorConfigs] = useState<FloorConfig[]>(() => buildFloorConfigs(event));
  const [aisleRawInputs, setAisleRawInputs] = useState<Record<number, string>>(() => {
    const configs = buildFloorConfigs(event);
    const raws: Record<number, string> = {};
    configs.forEach(c => {
      raws[c.floor] = c.aislePositions.join(',');
    });
    return raws;
  });
  type SeatOverride = { status: string; bookedBy: string; bookedByEmail: string; };
  const [localSeatOverrides, setLocalSeatOverrides] = useState<Record<string, SeatOverride>>({});
  const [adminActiveFloor, setAdminActiveFloor] = useState<number>(1);
  const [isSavingSeats, setIsSavingSeats] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open && sessionStorage.getItem('adminLoggedIn') === 'true') {
      setIsLoggedIn(true);
    }
  }, [open]);

  useEffect(() => {
    if (event) {
      const initial = buildEventFormData(event);
      setFormData(initial);
      setSavedData(initial);
      const configs = buildFloorConfigs(event);
      setFloorConfigs(configs);
      
      // Initialize raw inputs from saved positions
      const raws: Record<number, string> = {};
      configs.forEach(c => {
        raws[c.floor] = c.aislePositions.join(',');
      });
      setAisleRawInputs(raws);
    }
  }, [event?.id]);

  const hasChanges = useMemo(() => {
    return JSON.stringify(formData) !== JSON.stringify(savedData);
  }, [formData, savedData]);

  const hasSeatOverrides = useMemo(() => {
    return Object.keys(localSeatOverrides).length > 0;
  }, [localSeatOverrides]);

  const updateEventMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('PATCH', '/api/event', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/event'] });
      setSavedData({ ...formData });
      toast({ title: "Saved", description: "Event details updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save changes", variant: "destructive" });
    }
  });

  const updateFloorMutation = useMutation({
    mutationFn: async ({ floor, numRows, seatsPerRow, aislePositions, tierZones }: { floor: number; numRows: number; seatsPerRow: number; aislePositions: number[]; tierZones: TierZones }) => {
      const response = await apiRequest('PATCH', `/api/event/floors/${floor}`, { numRows, seatsPerRow, aislePositions, tierZones });
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/event'] });
      queryClient.invalidateQueries({ queryKey: ['/api/seats'] });
      toast({ title: `Floor ${variables.floor} Updated`, description: `Layout and Tier Zones saved successfully.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update floor config", variant: "destructive" });
    }
  });

  const addFloorMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/event/floors', { numRows: 5, seatsPerRow: 8, aislePositions: [3, 6], tierZones: DEFAULT_TIER_ZONES });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/event'] });
      queryClient.invalidateQueries({ queryKey: ['/api/seats'] });
      if (data.event?.floorConfigs) setFloorConfigs(data.event.floorConfigs as FloorConfig[]);
      toast({ title: "Floor Added", description: "New floor created with default layout and tier zones" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add floor", variant: "destructive" });
    }
  });

  const removeFloorMutation = useMutation({
    mutationFn: async (floor: number) => {
      const response = await apiRequest('DELETE', `/api/event/floors/${floor}`);
      return response.json();
    },
    onSuccess: (_data, floor) => {
      queryClient.invalidateQueries({ queryKey: ['/api/event'] });
      queryClient.invalidateQueries({ queryKey: ['/api/seats'] });
      setFloorConfigs(prev => prev.filter(c => c.floor !== floor));
      if (adminActiveFloor === floor) setAdminActiveFloor(1);
      toast({ title: "Floor Removed", description: `Floor ${floor} and its seats deleted` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove floor", variant: "destructive" });
    }
  });

  const resetSeatsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/seats/reset');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/seats'] });
      setLocalSeatOverrides({});
      toast({ title: "Success", description: "All seats have been reset" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset seats", variant: "destructive" });
    }
  });


  const handleLogin = async () => {
    try {
      // Backend is the source of truth for admin authorization. The passcode is
      // exchanged for a Bearer token; the token is what proves admin role on
      // every subsequent admin API call (see queryClient.ts buildHeaders).
      const res = await apiRequest('POST', '/api/admin/login', { passcode });
      const data = await res.json();
      if (data?.token) {
        sessionStorage.setItem('adminToken', data.token);
        sessionStorage.setItem('adminLoggedIn', 'true');
        setIsLoggedIn(true);
        setPasscode('');
      } else {
        throw new Error('Login response missing token');
      }
    } catch (err) {
      toast({ title: "Error", description: "Incorrect passcode", variant: "destructive" });
      setPasscode('');
    }
  };

  const handleClose = () => {
    setPasscode('');
    onClose();
  };

  const handleSaveChanges = () => {
    if (!formData.name || !formData.datetime || !formData.location || !formData.contactEmail) {
      toast({ title: "Validation Error", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    updateEventMutation.mutate(formData);
  };

  const handleCancelChanges = () => {
    setFormData({ ...savedData });
  };

  const handleUpdateFloor = (floor: number) => {
    const cfg = floorConfigs.find(c => c.floor === floor);
    if (!cfg) return;
    updateFloorMutation.mutate({ 
      floor, 
      numRows: cfg.numRows, 
      seatsPerRow: cfg.seatsPerRow, 
      aislePositions: cfg.aislePositions,
      tierZones: cfg.tierZones 
    });
  };

  const handleExportData = async () => {
    try {
      const token = sessionStorage.getItem('adminToken');
      if (!token) {
        toast({ title: "Error", description: "Admin session expired. Please log in again.", variant: "destructive" });
        return;
      }
      const res = await fetch('/api/export', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tedx-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: "Error", description: "Failed to export data", variant: "destructive" });
    }
  };

  const setFloorConfig = (floor: number, field: string, value: any) => {
    if (field === 'aislePositionsRaw') {
      // Always store exactly what the user typed in the raw input state
      setAisleRawInputs(prev => ({ ...prev, [floor]: value }));
      
      // Parse the positions for the layout logic, but ignore empty parts while typing
      const aislePositions = value
        .split(',')
        .map((pos: string) => pos.trim())
        .filter((pos: string) => pos !== "")
        .map((pos: string) => parseInt(pos))
        .filter((pos: number) => !isNaN(pos));
      
      setFloorConfigs(prev => prev.map(c => 
        c.floor === floor ? { ...c, aislePositions } : c
      ));
      return;
    }

    setFloorConfigs(prev => prev.map(c => {
      if (c.floor !== floor) return c;
      if (field === 'tierZone_Premium' || field === 'tierZone_VIP' || field === 'tierZone_Standard') {
        const tierKey = field.replace('tierZone_', '') as keyof TierZones;
        return { ...c, tierZones: { ...c.tierZones, [tierKey]: value } };
      }
      return { ...c, [field]: value };
    }));
  };

  const buildSeatOverride = (seatId: string, partial: Partial<SeatOverride>): SeatOverride => {
    const seat = seats.find(s => s.id === seatId);
    const existing = localSeatOverrides[seatId];
    return {
      status: existing?.status ?? seat?.status ?? 'available',
      bookedBy: existing?.bookedBy ?? seat?.bookedBy ?? '',
      bookedByEmail: existing?.bookedByEmail ?? seat?.bookedByEmail ?? '',
      ...partial,
    };
  };

  const handleLocalSeatChange = (seatId: string, field: keyof SeatOverride, value: string) => {
    const override = buildSeatOverride(seatId, { [field]: value });
    if (field === 'status' && (value === 'available' || value === 'disabled')) {
      override.bookedBy = '';
      override.bookedByEmail = '';
    }
    setLocalSeatOverrides(prev => ({ ...prev, [seatId]: override }));
  };

  const handleSaveSeatChanges = async () => {
    const entries = Object.entries(localSeatOverrides);
    if (entries.length === 0) return;

    for (const [, override] of entries) {
      if (override.status === 'booked') {
        if (!override.bookedBy.trim() || !override.bookedByEmail.trim()) {
          toast({ title: "Validation Error", description: "Booked seats require Full Name and Email", variant: "destructive" });
          return;
        }
      }
    }

    let successCount = 0;
    const failedIds: string[] = [];
    setIsSavingSeats(true);

    try {
      // Fire all PATCH requests in parallel and collect results.
      // We do NOT use the shared mutation hook here (to avoid shared isPending state
      // clobbering), but we manually apply each result to the cache so the UI
      // updates immediately - no refetch round-trip needed.
      await Promise.all(entries.map(async ([seatId, override]) => {
        const seat = seats.find(s => s.id === seatId);
        const updates: any = {
          status: override.status,
          bookedBy: override.status === 'booked' ? override.bookedBy : null,
          bookedByEmail: override.status === 'booked' ? override.bookedByEmail : null,
          bookedAt: override.status === 'booked' ? new Date().toISOString() : null,
        };

        // Sync localStorage for the previous booker (clear) and new booker (set)
        if (seat) {
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key?.startsWith('userData_')) {
              try {
                const raw = localStorage.getItem(key);
                const parsed = raw ? JSON.parse(raw) : {};
                if (parsed.selectedSeatId === seat.id) {
                  parsed.selectedSeatId = null;
                  localStorage.setItem(key, JSON.stringify(parsed));
                }
              } catch {}
            }
          }
          if (override.status === 'booked' && override.bookedByEmail) {
            try {
              const raw = localStorage.getItem(`userData_${override.bookedByEmail}`);
              const parsed = raw ? JSON.parse(raw) : {};
              parsed.selectedSeatId = seat.id;
              parsed.fullName = override.bookedBy;
              localStorage.setItem(`userData_${override.bookedByEmail}`, JSON.stringify(parsed));
            } catch {}
          }
        }

        try {
          const res = await apiRequest('PATCH', `/api/seats/${seatId}`, updates);
          const updatedSeat = await res.json();
          // Immediately patch this single seat in the shared cache so both the
          // SeatChart (behind the dialog) and this management table refresh with
          // the new data without waiting for a full refetch.
          queryClient.setQueryData<Seat[]>(['/api/seats'], (old = []) =>
            old.map(s => s.id === updatedSeat.id ? updatedSeat : s)
          );
          successCount++;
        } catch {
          failedIds.push(seatId);
        }
      }));
    } finally {
      setIsSavingSeats(false);
      setLocalSeatOverrides({});
      // Single refetch after all saves for server reconciliation
      queryClient.invalidateQueries({ queryKey: ['/api/seats'] });

      if (failedIds.length === 0) {
        toast({ title: "Seats Updated", description: `${successCount} seat(s) synced to public layout` });
      } else if (successCount > 0) {
        toast({ title: "Partial Update", description: `${successCount} saved, ${failedIds.length} failed`, variant: "destructive" });
      } else {
        toast({ title: "Error", description: "All seat updates failed", variant: "destructive" });
      }
    }
  };

  const handleCancelSeatChanges = () => {
    setLocalSeatOverrides({});
  };

  const inputClass = "h-12 bg-black/20 border-white/5 rounded-xl text-white placeholder:text-gray-700 focus:ring-1 focus:ring-tedx-red/50 focus:border-tedx-red/50 transition-all duration-300 shadow-inner";
  const inputSmClass = "h-10 bg-black/20 border-white/5 rounded-xl text-white placeholder:text-gray-700 focus:ring-1 focus:ring-tedx-red/50 focus:border-tedx-red/50 transition-all duration-300 shadow-inner";
  const labelClass = "text-[10px] uppercase tracking-[0.15em] font-bold text-gray-500 ml-1";
  const cardClass = "bg-[#1a1a1a]/40 backdrop-blur-md border-white/5 shadow-[0_10px_30px_rgba(0,0,0,0.4)] rounded-[20px] overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-white/10 group";
  const cardHeaderClass = "pb-4 border-b border-white/5";

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`${!isLoggedIn ? 'max-w-[440px]' : 'max-w-4xl'} bg-[#141414]/85 backdrop-blur-2xl border-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.6)] rounded-[20px] p-0 overflow-hidden outline-none ring-0`}>
        {!isLoggedIn && (
          <DialogHeader className="sr-only">
            <DialogTitle>Admin Login</DialogTitle>
          </DialogHeader>
        )}
        {isLoggedIn && (
          <DialogHeader className="p-6 border-b border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={handleClose}
                className="h-9 px-4 bg-transparent border-white/10 hover:bg-white/5 text-gray-400 hover:text-white rounded-xl transition-all duration-300 flex items-center gap-2 group border-dashed hover:border-solid"
              >
                <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                <span className="text-sm font-medium">Back to Main Page</span>
              </Button>
            </div>
            <DialogTitle className="flex items-center gap-3 text-lg font-bold tracking-tight text-white">
              <div className="w-8 h-8 bg-tedx-red/10 rounded-lg flex items-center justify-center border border-tedx-red/20">
                <Settings className="w-4 h-4 text-tedx-red" />
              </div>
              Admin Control Center
            </DialogTitle>
          </DialogHeader>
        )}

        <div className={isLoggedIn ? "p-6 max-h-[80vh] overflow-y-auto" : ""}>
          {!isLoggedIn ? (
            <div className="max-w-sm mx-auto py-10 px-4 space-y-8 animate-in fade-in zoom-in duration-300">
              <div className="text-center space-y-2">
                <div className="mx-auto w-12 h-12 bg-tedx-red/10 rounded-xl flex items-center justify-center mb-4 border border-tedx-red/20 shadow-[0_0_20px_rgba(235,0,40,0.1)]">
                  <Settings className="w-6 h-6 text-tedx-red" />
                </div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Admin Authentication</h2>
                <p className="text-sm text-gray-500">Secure access to event management</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="adminPasscode" className="text-[10px] uppercase tracking-widest font-bold text-gray-500 ml-1">Passcode</Label>
                  <div className="relative">
                    <Input
                      id="adminPasscode"
                      type={showPasscode ? "text" : "password"}
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder="••••••••"
                      className="h-12 bg-black/40 border-white/5 rounded-xl text-white placeholder:text-gray-700 focus:ring-1 focus:ring-tedx-red/50 focus:border-tedx-red/50 transition-all duration-200 pr-12"
                      onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasscode(!showPasscode)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                    >
                      {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  onClick={handleLogin}
                  className="w-full h-12 bg-gradient-to-r from-tedx-red to-red-600 hover:from-red-600 hover:to-tedx-red text-white font-bold rounded-xl shadow-[0_4px_20px_rgba(235,0,40,0.2)] transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] group"
                >
                  <span>Access Dashboard</span>
                  <Save className="w-4 h-4 ml-2 opacity-50 group-hover:opacity-100 transition-opacity" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Event Details */}
                <Card className={cardClass}>
                  <CardHeader className={cardHeaderClass}>
                    <CardTitle className="flex items-center gap-3 text-lg font-bold text-white">
                      <div className="w-8 h-8 bg-tedx-red/10 rounded-lg flex items-center justify-center border border-tedx-red/20 group-hover:bg-tedx-red group-hover:text-white transition-colors">
                        <Edit className="w-4 h-4" />
                      </div>
                      Event Details
                    </CardTitle>
                    <div className="w-12 h-1 bg-tedx-red mt-2 rounded-full opacity-50" />
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label className={labelClass}>Event Name</Label>
                        <Input
                          value={formData.name}
                          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className={labelClass}>Date & Time</Label>
                          <Input
                            value={formData.datetime}
                            onChange={(e) => setFormData(prev => ({ ...prev, datetime: e.target.value }))}
                            className={inputClass}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className={labelClass}>Location</Label>
                          <Input
                            value={formData.location}
                            onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                            className={inputClass}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Contact Info */}
                <Card className={cardClass}>
                  <CardHeader className={cardHeaderClass}>
                    <CardTitle className="flex items-center gap-3 text-lg font-bold text-white">
                      <div className="w-8 h-8 bg-tedx-red/10 rounded-lg flex items-center justify-center border border-tedx-red/20 group-hover:bg-tedx-red group-hover:text-white transition-colors">
                        <Phone className="w-4 h-4" />
                      </div>
                      Contact Info
                    </CardTitle>
                    <div className="w-12 h-1 bg-tedx-red mt-2 rounded-full opacity-50" />
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <div className="space-y-2">
                      <Label className={labelClass}>Email</Label>
                      <Input
                        type="email"
                        value={formData.contactEmail}
                        onChange={(e) => setFormData(prev => ({ ...prev, contactEmail: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className={labelClass}>Phone</Label>
                        <Input
                          value={formData.contactPhone}
                          onChange={(e) => setFormData(prev => ({ ...prev, contactPhone: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className={labelClass}>Facebook URL</Label>
                        <Input
                          value={formData.contactFacebook}
                          onChange={(e) => setFormData(prev => ({ ...prev, contactFacebook: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Per-floor Layout Configuration */}
              <Card className={cardClass}>
                <CardHeader className={cardHeaderClass}>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-3 text-lg font-bold text-white">
                      <div className="w-8 h-8 bg-tedx-red/10 rounded-lg flex items-center justify-center border border-tedx-red/20 group-hover:bg-tedx-red group-hover:text-white transition-colors">
                        <Armchair className="w-4 h-4" />
                      </div>
                      Floor Layouts
                    </CardTitle>
                    <Button
                      onClick={() => addFloorMutation.mutate()}
                      disabled={addFloorMutation.isPending}
                      className="h-8 px-3 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-600/30 rounded-lg transition-all duration-300 font-bold text-xs flex items-center gap-1.5"
                    >
                      <Plus className="w-3 h-3" />
                      Add Floor
                    </Button>
                  </div>
                  <div className="w-12 h-1 bg-tedx-red mt-2 rounded-full opacity-50" />
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <p className="text-[11px] text-gray-500 uppercase tracking-widest font-bold">
                    Each floor is independent - changing one floor does not affect the others.
                  </p>
                  <div className="space-y-4">
                    {floorConfigs.map((cfg) => (
                      <div
                        key={cfg.floor}
                        className="rounded-xl border border-white/5 bg-black/20 p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-white tracking-wide">
                            Floor {cfg.floor}
                            <span className="ml-2 text-[10px] font-normal text-gray-500 uppercase tracking-widest">
                              {cfg.numRows} rows × {cfg.seatsPerRow} seats = {cfg.numRows * cfg.seatsPerRow} total
                            </span>
                          </span>
                          {floorConfigs.length > 1 && (
                            <button
                              onClick={() => removeFloorMutation.mutate(cfg.floor)}
                              disabled={removeFloorMutation.isPending}
                              className="text-gray-600 hover:text-red-400 transition-colors p-1 rounded"
                              title={`Remove Floor ${cfg.floor}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className={labelClass}>Rows</Label>
                            <Input
                              type="number" min="1" max="26"
                              value={cfg.numRows}
                              onChange={(e) => setFloorConfig(cfg.floor, 'numRows', parseInt(e.target.value) || 5)}
                              className={inputSmClass}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className={labelClass}>Seats / Row</Label>
                            <Input
                              type="number" min="1" max="50"
                              value={cfg.seatsPerRow}
                              onChange={(e) => setFloorConfig(cfg.floor, 'seatsPerRow', parseInt(e.target.value) || 8)}
                              className={inputSmClass}
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className={labelClass}>Aisle Positions</Label>
                          <Input
                            value={aisleRawInputs[cfg.floor] ?? cfg.aislePositions.join(',')}
                            onChange={(e) => setFloorConfig(cfg.floor, 'aislePositionsRaw', e.target.value)}
                            placeholder="e.g., 3,6"
                            className={inputSmClass}
                          />
                        </div>
                        {/* Tier Zone Restrictions */}
                        <div className="pt-2 border-t border-white/5 space-y-2">
                          <p className="text-[10px] uppercase tracking-widest font-bold text-gray-600">
                            Ticket Tier Seat Zones
                            <span className="ml-2 font-normal normal-case text-gray-700">· "1" = full access · "0" = blocked · "A1:H8;J1:M5" = multiple zones</span>
                          </p>
                          {(['Premium', 'VIP', 'Standard'] as const).map(tier => (
                            <div key={tier} className="flex items-center gap-2">
                              <span className={`text-[11px] font-bold w-16 shrink-0 ${
                                tier === 'Premium' ? 'text-yellow-500' :
                                tier === 'VIP' ? 'text-purple-400' : 'text-gray-400'
                              }`}>{tier}</span>
                              <Input
                                value={cfg.tierZones?.[tier] ?? "1"}
                                onChange={(e) => setFloorConfig(cfg.floor, `tierZone_${tier}`, e.target.value)}
                                placeholder="1"
                                className="h-7 bg-black/40 border-white/5 rounded-lg text-xs text-white placeholder:text-gray-700 focus:ring-1 focus:ring-tedx-red/30"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleUpdateFloor(cfg.floor)}
                            disabled={updateFloorMutation.isPending}
                            className="flex-1 h-9 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-600/30 rounded-xl transition-all duration-300 font-bold text-xs"
                          >
                            <Save className="w-3.5 h-3.5 mr-1.5" />
                            Save Floor {cfg.floor}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setFloorConfigs(buildFloorConfigs(event))}
                            className="h-9 px-3 border-white/10 hover:bg-white/5 text-gray-400 rounded-xl"
                            title="Reset to last saved state"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* System Actions */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className={cardClass}>
                  <CardHeader className={cardHeaderClass}>
                    <CardTitle className="flex items-center gap-3 text-lg font-bold text-white">
                      <div className="w-8 h-8 bg-tedx-red/10 rounded-lg flex items-center justify-center border border-tedx-red/20 group-hover:bg-tedx-red group-hover:text-white transition-colors">
                        <Cog className="w-4 h-4" />
                      </div>
                      System Actions
                    </CardTitle>
                    <div className="w-12 h-1 bg-tedx-red mt-2 rounded-full opacity-50" />
                  </CardHeader>
                  <CardContent className="p-6 space-y-3">
                    <Button
                      onClick={handleExportData}
                      className="w-full h-11 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-600/30 rounded-xl transition-all duration-300 font-bold text-sm"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export Data (CSV)
                    </Button>
                    <Button
                      onClick={() => resetSeatsMutation.mutate()}
                      className="w-full h-11 bg-orange-600/20 hover:bg-orange-600 text-orange-400 hover:text-white border border-orange-600/30 rounded-xl transition-all duration-300 font-bold text-sm"
                      disabled={resetSeatsMutation.isPending}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset All Seats
                    </Button>
                  </CardContent>
                </Card>

                {/* Manual Seat Management */}
                <Card className={`${cardClass} lg:col-span-1`}>
                  <CardHeader className={cardHeaderClass}>
                    <CardTitle className="flex items-center gap-3 text-lg font-bold text-white">
                      <div className="w-8 h-8 bg-tedx-red/10 rounded-lg flex items-center justify-center border border-tedx-red/20 group-hover:bg-tedx-red group-hover:text-white transition-colors">
                        <Armchair className="w-4 h-4" />
                      </div>
                      Seat Overrides
                      {hasSeatOverrides && (
                        <span className="ml-2 text-[10px] uppercase tracking-widest font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
                          {Object.keys(localSeatOverrides).length} pending
                        </span>
                      )}
                    </CardTitle>
                    <div className="w-12 h-1 bg-tedx-red mt-2 rounded-full opacity-50" />
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    {/* Floor tabs */}
                    {(() => {
                      const floors = Array.from(new Set(seats.map(s => s.floor ?? 1))).sort((a, b) => a - b);
                      return floors.length > 1 ? (
                        <div className="flex gap-2 flex-wrap">
                          {floors.map(floor => (
                            <button
                              key={floor}
                              onClick={() => setAdminActiveFloor(floor)}
                              className={`px-4 py-1 rounded-lg text-xs font-bold uppercase tracking-widest transition-all duration-200 border ${
                                adminActiveFloor === floor
                                  ? 'bg-tedx-red text-white border-tedx-red'
                                  : 'bg-black/30 text-gray-400 border-white/10 hover:text-white hover:border-white/20'
                              }`}
                            >
                              Floor {floor}
                            </button>
                          ))}
                        </div>
                      ) : null;
                    })()}
                    <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                      {seats.filter(s => (s.floor ?? 1) === adminActiveFloor).map((seat) => {
                        const override = localSeatOverrides[seat.id];
                        const displayStatus = override?.status ?? seat.status;
                        const displayName = override?.bookedBy ?? seat.bookedBy ?? '';
                        const displayEmail = override?.bookedByEmail ?? seat.bookedByEmail ?? '';
                        const hasPending = !!override;
                        const isBooked = displayStatus === 'booked';
                        return (
                          <div key={seat.id} className={`rounded-xl p-3 transition-all border ${hasPending ? 'bg-amber-400/5 border-amber-400/20' : 'bg-black/30 border-white/5 hover:border-white/10'}`}>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                {hasPending && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />}
                                <span className="font-mono font-bold text-tedx-red text-sm">{seat.seatNumber}</span>
                              </div>
                              <Select
                                value={displayStatus}
                                onValueChange={(val) => handleLocalSeatChange(seat.id, 'status', val)}
                              >
                                <SelectTrigger className={`h-8 rounded-lg text-xs w-28 focus:ring-tedx-red/50 ${hasPending ? 'bg-amber-400/10 border-amber-400/30' : 'bg-black/40 border-white/10'}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#1a1a1a] border-white/10 text-white">
                                  <SelectItem value="available">Available</SelectItem>
                                  <SelectItem value="booked">Booked</SelectItem>
                                  <SelectItem value="disabled">Disabled</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {isBooked && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 pt-2 border-t border-white/5">
                                <Input
                                  value={displayName}
                                  onChange={(e) => handleLocalSeatChange(seat.id, 'bookedBy', e.target.value)}
                                  placeholder="Full Name"
                                  className="h-8 bg-black/40 border-white/10 rounded-lg text-xs text-white placeholder:text-gray-600 focus:ring-tedx-red/50"
                                />
                                <Input
                                  value={displayEmail}
                                  onChange={(e) => handleLocalSeatChange(seat.id, 'bookedByEmail', e.target.value)}
                                  placeholder="Email"
                                  type="email"
                                  className="h-8 bg-black/40 border-white/10 rounded-lg text-xs text-white placeholder:text-gray-600 focus:ring-tedx-red/50"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Seat Save/Cancel Bar */}
                    <div className={`transition-all duration-300 ease-in-out overflow-hidden ${hasSeatOverrides ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
                      <div className="flex items-center justify-between gap-3 bg-amber-400/5 border border-amber-400/20 rounded-[14px] px-4 py-3">
                        <div className="flex items-center gap-2 text-sm text-amber-400">
                          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                          <span className="text-xs font-bold uppercase tracking-widest">Unsaved changes</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={handleCancelSeatChanges}
                            className="h-8 px-4 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 rounded-lg transition-all duration-200 font-bold text-xs flex items-center gap-1.5"
                          >
                            <X className="w-3 h-3" />
                            Revert
                          </Button>
                          <Button
                            onClick={handleSaveSeatChanges}
                            disabled={isSavingSeats}
                            className="h-8 px-4 bg-amber-500 hover:bg-amber-400 text-black rounded-lg shadow-[0_4px_15px_rgba(245,158,11,0.3)] transition-all duration-200 font-bold text-xs flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Apply to Public
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Change Detection Bar (event details) */}
              <div className={`transition-all duration-400 ease-in-out overflow-hidden ${hasChanges ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
                <div className="flex items-center justify-between gap-4 bg-[#1a1a1a]/80 backdrop-blur-md border border-tedx-red/20 rounded-[16px] px-6 py-4 shadow-[0_0_20px_rgba(235,0,40,0.08)]">
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <div className="w-2 h-2 rounded-full bg-tedx-red animate-pulse" />
                    <span>You have unsaved event detail changes</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleCancelChanges}
                      className="h-10 px-5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 rounded-xl transition-all duration-300 font-bold text-sm flex items-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveChanges}
                      disabled={updateEventMutation.isPending}
                      className="h-10 px-5 bg-tedx-red hover:bg-red-600 text-white rounded-xl shadow-[0_4px_15px_rgba(235,0,40,0.3)] transition-all duration-300 font-bold text-sm flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Save Changes
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

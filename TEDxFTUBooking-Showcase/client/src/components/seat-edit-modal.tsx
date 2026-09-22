import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Pencil, Shield } from 'lucide-react';
import type { Seat } from '@shared/schema';

interface SeatEditModalProps {
  open: boolean;
  onClose: () => void;
  seat: Seat | null;
}

type SeatStatus = 'available' | 'booked' | 'disabled';

export function SeatEditModal({ open, onClose, seat }: SeatEditModalProps) {
  const [seatNumber, setSeatNumber] = useState('');
  const [status, setStatus] = useState<SeatStatus>('available');
  const [bookedBy, setBookedBy] = useState('');
  const [bookedByEmail, setBookedByEmail] = useState('');

  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (seat && open) {
      setSeatNumber(seat.seatNumber || '');
      setStatus((seat.status as SeatStatus) || 'available');
      setBookedBy(seat.bookedBy || '');
      setBookedByEmail(seat.bookedByEmail || '');
    }
  }, [seat, open]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!seat) throw new Error('No seat selected');
      const payload: any = {
        seatNumber: seatNumber.trim() || seat.seatNumber,
        status,
        bookedBy: status === 'booked' ? bookedBy.trim() : null,
        bookedByEmail: status === 'booked' ? bookedByEmail.trim().toLowerCase() : null,
        bookedAt: status === 'booked' ? new Date().toISOString() : null,
      };
      const res = await apiRequest('PATCH', `/api/seats/${seat.id}`, payload);
      return res.json();
    },
    onSuccess: (updatedSeat: Seat) => {
      queryClient.setQueryData(['/api/seats'], (old: Seat[] | undefined) => {
        if (!old) return [updatedSeat];
        return old.map(s => s.id === updatedSeat.id ? updatedSeat : s);
      });
      queryClient.invalidateQueries({ queryKey: ['/api/seats'] });
      toast({ title: 'Seat Updated', description: `Seat ${updatedSeat.seatNumber} saved successfully.` });
      onClose();
    },
    onError: (err: any) => {
      const isAuth = err?.status === 401;
      toast({
        title: isAuth ? 'Authorization Required' : 'Update Failed',
        description: isAuth ? 'Your admin session expired. Please log in again.' : (err?.message || 'Could not update seat'),
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'booked') {
      if (!bookedBy.trim() || !bookedByEmail.trim()) {
        toast({ title: 'Validation', description: 'Booked seats require name and email.', variant: 'destructive' });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bookedByEmail.trim())) {
        toast({ title: 'Validation', description: 'Invalid email address.', variant: 'destructive' });
        return;
      }
    }
    updateMutation.mutate();
  };

  if (!seat) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#141414]/95 backdrop-blur-2xl border-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.7)] rounded-[20px] p-0 overflow-hidden max-w-md">
        <DialogHeader className="bg-gradient-to-r from-amber-500/15 to-amber-700/10 border-b border-white/5 p-6 space-y-0">
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center border border-amber-500/30 shrink-0">
              <Shield className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-base font-bold text-white leading-tight">Edit Seat (Admin)</p>
              <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-amber-400 mt-0.5">
                Floor {seat.floor} - Row {seat.row} - Pos {seat.position}
              </p>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Edit seat properties as administrator
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-[0.15em] font-bold text-gray-500">
              Seat Number / Label
            </Label>
            <Input
              type="text"
              value={seatNumber}
              onChange={(e) => setSeatNumber(e.target.value)}
              placeholder={seat.seatNumber}
              maxLength={16}
              className="h-11 bg-black/30 border-white/10 rounded-xl text-white"
            />
            <p className="text-[10px] text-gray-600">Row & position are immutable (part of seat ID).</p>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-[0.15em] font-bold text-gray-500">
              Status / Type
            </Label>
            <Select value={status} onValueChange={(v) => setStatus(v as SeatStatus)}>
              <SelectTrigger className="h-11 bg-black/30 border-white/10 rounded-xl text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1a1a] border-white/10 text-white">
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="booked">Booked</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {status === 'booked' && (
            <>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-[0.15em] font-bold text-gray-500">
                  Booked By (Name) <span className="text-amber-400">*</span>
                </Label>
                <Input
                  type="text"
                  value={bookedBy}
                  onChange={(e) => setBookedBy(e.target.value)}
                  placeholder="Full name"
                  maxLength={80}
                  className="h-11 bg-black/30 border-white/10 rounded-xl text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-[0.15em] font-bold text-gray-500">
                  Booked By (Email) <span className="text-amber-400">*</span>
                </Label>
                <Input
                  type="email"
                  value={bookedByEmail}
                  onChange={(e) => setBookedByEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="h-11 bg-black/30 border-white/10 rounded-xl text-white"
                />
              </div>
            </>
          )}

          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 rounded-xl font-bold text-sm"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              className="flex-1 h-11 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-500 text-black font-bold rounded-xl shadow-[0_4px_20px_rgba(245,158,11,0.3)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Pencil className="w-4 h-4" />
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

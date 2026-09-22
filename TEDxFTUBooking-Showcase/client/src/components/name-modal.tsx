import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Armchair, Clock } from 'lucide-react';

interface NameModalProps {
  open: boolean;
  onClose: () => void;
  selectedSeat: string | null;
  onConfirm: (fullName: string, email: string) => void;
}

const INACTIVITY_TIMEOUT_MS = 30_000;

export function NameModal({ open, onClose, selectedSeat, onConfirm }: NameModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(INACTIVITY_TIMEOUT_MS / 1000));

  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Resets the inactivity timer on every interaction.
  // If the timer expires, the modal auto-closes WITHOUT submitting any data.
  const resetInactivityTimer = useCallback(() => {
    if (!open) return;
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    setSecondsLeft(Math.floor(INACTIVITY_TIMEOUT_MS / 1000));
    inactivityTimerRef.current = setTimeout(() => {
      onClose();
    }, INACTIVITY_TIMEOUT_MS);
  }, [open, onClose]);

  // Start/stop the inactivity timer + visual countdown when the modal opens/closes.
  useEffect(() => {
    if (!open) {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      return;
    }
    resetInactivityTimer();
    countdownIntervalRef.current = setInterval(() => {
      setSecondsLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [open, resetInactivityTimer]);

  useEffect(() => {
    if (open) {
      const savedEmail = localStorage.getItem('currentUserEmail') || '';
      setEmail(savedEmail);
      setEmailError('');
      try {
        const raw = savedEmail ? localStorage.getItem(`userData_${savedEmail}`) : null;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.fullName) setFullName(parsed.fullName);
        }
      } catch {}
    }
  }, [open]);

  const isEmailValid = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const isValid = fullName.trim().length > 0 && isEmailValid(email);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEmailValid(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    if (!isValid) return;
    onConfirm(fullName.trim(), email.toLowerCase().trim());
    setFullName('');
    setEmailError('');
  };

  const handleClose = () => {
    setFullName('');
    setEmailError('');
    onClose();
  };

  const showWarning = secondsLeft <= 10;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="bg-[#141414]/95 backdrop-blur-2xl border-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.7)] rounded-[20px] p-0 overflow-hidden max-w-md animate-in fade-in zoom-in-95 duration-200"
        onMouseMove={resetInactivityTimer}
        onMouseDown={resetInactivityTimer}
        onKeyDown={resetInactivityTimer}
        onTouchStart={resetInactivityTimer}
        onFocus={resetInactivityTimer}
      >
        <DialogHeader className="bg-gradient-to-r from-tedx-red/15 to-red-900/10 border-b border-white/5 p-6 space-y-0">
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 bg-tedx-red/20 rounded-xl flex items-center justify-center border border-tedx-red/30 shrink-0">
              <Armchair className="w-5 h-5 text-tedx-red" />
            </div>
            <div className="flex-1">
              <p className="text-base font-bold text-white leading-tight">Confirm Your Seat</p>
              <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-tedx-red mt-0.5">
                Seat {selectedSeat}
              </p>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Fill in your details to book seat {selectedSeat}. The form will auto-close after 30 seconds of inactivity.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-[0.15em] font-bold text-gray-500">
              Full Name <span className="text-tedx-red">*</span>
            </Label>
            <Input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              maxLength={80}
              className="h-11 bg-black/30 border-white/10 rounded-xl text-white placeholder:text-gray-600 focus:ring-1 focus:ring-tedx-red/50 focus:border-tedx-red/50 transition-all duration-200"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-[0.15em] font-bold text-gray-500">
              Email Address <span className="text-tedx-red">*</span>
            </Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(''); }}
              placeholder="your@email.com"
              className={`h-11 bg-black/30 rounded-xl text-white placeholder:text-gray-600 focus:ring-1 focus:ring-tedx-red/50 focus:border-tedx-red/50 transition-all duration-200 ${emailError ? 'border-red-500' : 'border-white/10'}`}
            />
            {emailError && <p className="text-xs text-red-400">{emailError}</p>}
          </div>

          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              onClick={handleClose}
              className="flex-1 h-11 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 rounded-xl transition-all duration-200 font-bold text-sm"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isValid}
              className="flex-1 h-11 bg-gradient-to-r from-tedx-red to-red-600 hover:from-red-600 hover:to-tedx-red text-white font-bold rounded-xl shadow-[0_4px_20px_rgba(235,0,40,0.3)] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none hover:-translate-y-0.5 active:translate-y-0"
            >
              Confirm Booking
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

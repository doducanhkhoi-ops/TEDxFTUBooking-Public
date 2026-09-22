import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function EmailGate({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState<string>("");
  const [ticketType, setTicketType] = useState<string>("");
  const [emailError, setEmailError] = useState<string>("");
  const [ticketError, setTicketError] = useState<string>("");
  const [isAccessGranted, setIsAccessGranted] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Clear admin session whenever the gate is visible
  useEffect(() => {
    if (!isAccessGranted) {
      sessionStorage.removeItem('adminLoggedIn');
      sessionStorage.removeItem('isAdmin');
    }
  }, [isAccessGranted]);

  useEffect(() => {
    const handleReset = () => {
      sessionStorage.clear();
      setIsAccessGranted(false);
    };
    window.addEventListener('reset-email-gate', handleReset);
    return () => window.removeEventListener('reset-email-gate', handleReset);
  }, []);

  const normalizedEmail = email.toLowerCase().trim();
  const existingDataRaw = localStorage.getItem(`userData_${normalizedEmail}`);
  let existingTier = "";
  try { 
    if (existingDataRaw) existingTier = JSON.parse(existingDataRaw).ticketType || ""; 
  } catch {}

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let valid = true;

    if (!emailRegex.test(email.toLowerCase())) {
      setEmailError("Please enter a valid email address");
      valid = false;
    } else {
      setEmailError("");
    }

    if (!existingTier && !ticketType) {
      setTicketError("Please select a ticket type");
      valid = false;
    } else {
      setTicketError("");
    }

    if (!valid) return;

    setIsLoading(true);
    try {
      // Step 1: Login via backend to get the single source of truth
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const serverUser = await response.json();

      let effectiveTicketType = serverUser?.ticketType || ticketType;

      if (!serverUser?.ticketLocked && ticketType) {
        // New user or unlocked - persist the selected ticket type
        await fetch(`/api/users/${encodeURIComponent(normalizedEmail)}/ticket-type`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketType }),
        }).catch(() => {});
        effectiveTicketType = ticketType;
      } else if (!effectiveTicketType) {
        setTicketError("Please select a ticket type");
        setIsLoading(false);
        return;
      }

      // Update localStorage with the LATEST data from DB
      const userData = {
        ticketType: effectiveTicketType,
        selectedSeatId: serverUser?.selectedSeat?.seatId || null,
        fullName: serverUser?.fullName || null
      };
      localStorage.setItem(`userData_${normalizedEmail}`, JSON.stringify(userData));
      localStorage.setItem("currentUserEmail", normalizedEmail);
      window.dispatchEvent(new CustomEvent('email-changed', { detail: { email: normalizedEmail } }));
      setIsAccessGranted(true);
    } catch (error) {
      setEmailError("Connection error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isAccessGranted) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="fixed inset-0 z-[-1] blur-md pointer-events-none overflow-hidden">
        {children}
      </div>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <Card className="w-full max-w-md shadow-2xl border-gray-800 bg-dark-surface text-white">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl font-bold text-white">Welcome to TEDxFTU</CardTitle>
            <CardDescription className="text-gray-400">
              Enter your email and select your ticket type to continue.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-[0.15em] font-bold text-gray-500 ml-1">
                  Email Address
                </Label>
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                  className={`bg-dark-bg border-tedx-red/50 text-white rounded-full focus:border-tedx-red focus:ring-tedx-red py-6 ${emailError ? "border-red-500" : ""}`}
                  required
                />
                {emailError && <p className="text-sm text-red-500 text-center font-medium">{emailError}</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-[0.15em] font-bold text-gray-500 ml-1">
                  Ticket Type
                </Label>
                <Select 
                  value={existingTier || ticketType} 
                  onValueChange={(v) => { setTicketType(v); setTicketError(""); }}
                  disabled={!!existingTier || isLoading}
                >
                  <SelectTrigger className={`h-12 bg-dark-bg border-tedx-red/50 rounded-full text-white focus:ring-tedx-red focus:border-tedx-red px-4 ${ticketError ? "border-red-500" : ""}`}>
                    <SelectValue placeholder="Select ticket type" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-white/10 text-white">
                    <SelectItem value="Premium">Premium</SelectItem>
                    <SelectItem value="VIP">VIP</SelectItem>
                    <SelectItem value="Standard">Standard</SelectItem>
                  </SelectContent>
                </Select>
                {existingTier ? (
                  <p className="text-[11px] text-tedx-red text-center font-medium mt-2">
                    Your ticket tier has already been selected and cannot be changed.
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-400 text-center font-medium mt-2">
                    Ticket tier can only be selected once and cannot be changed later.
                  </p>
                )}
                {ticketError && !existingTier && <p className="text-sm text-red-500 text-center font-medium">{ticketError}</p>}
              </div>
            </CardContent>
            <CardFooter>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-tedx-red hover:bg-red-700 text-white font-bold py-6 rounded-full transition-all duration-300 shadow-lg shadow-tedx-red/20"
              >
                {isLoading ? "Checking..." : "Continue"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </>
  );
}

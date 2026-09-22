import { useState } from 'react';
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/home";
import NotFound from "@/pages/not-found";
import { EmailGate } from "@/components/email-gate";
import { OnboardingModal } from "@/components/onboarding-modal";

function Router() {
  return (
    <EmailGate>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </EmailGate>
  );
}

function App() {
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => sessionStorage.getItem('instructions_seen') !== 'true');

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="dark">
          <Toaster />
          
          {/* Mandatory first-screen onboarding gate */}
          {showOnboarding && <OnboardingModal onContinue={() => setShowOnboarding(false)} />}
          
          {/* Main app (email gate + routing) - blocked by onboarding gate */}
          {!showOnboarding && <Router />}
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

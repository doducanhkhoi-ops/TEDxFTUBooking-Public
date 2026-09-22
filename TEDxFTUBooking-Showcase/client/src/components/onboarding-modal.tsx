import { useState } from 'react';
import { FileText, Armchair, CheckCircle2 } from 'lucide-react';

interface OnboardingModalProps {
  onContinue: () => void;
}

export function OnboardingModal({ onContinue }: OnboardingModalProps) {
  const [isClosing, setIsClosing] = useState(false);

  const handleContinue = () => {
    setIsClosing(true);
    setTimeout(() => {
      sessionStorage.setItem('instructions_seen', 'true');
      onContinue();
    }, 300);
  };

  return (
    <div
      className={`fixed inset-0 z-9999 flex items-center justify-center transition-opacity duration-300 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className={`relative w-full max-w-2xl mx-4 bg-dark-surface rounded-2xl shadow-2xl border border-gray-700/50 max-h-[90vh] overflow-y-auto transition-all duration-300 ${
          isClosing ? 'scale-95' : 'scale-100'
        }`}
      >
        <div className="p-8 md:p-10">
          <div className="mb-10 text-center">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-3 tracking-tight">
              Seat Selection Instructions
            </h1>
            <p className="text-gray-300 text-lg leading-relaxed">
              To select a seat that best suits your personal preference, please follow the steps below carefully.
            </p>
          </div>

          <div className="space-y-6 mb-10">
            <div className="bg-gray-900/50 border border-gray-700/30 rounded-xl p-6 md:p-7 hover:border-gray-700/50 transition-colors">
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-tedx-red/20 border border-tedx-red/40">
                    <FileText className="w-5 h-5 text-tedx-red" />
                  </div>
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-white mb-2">Step 1: Enter Your Registration Email</h2>
                  <p className="text-gray-300 mb-4 leading-relaxed">
                    Enter the email address <strong className="text-white">used in your registration form</strong>, then select your desired ticket category.
                  </p>
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                    <p className="text-amber-200/90 text-sm font-medium mb-2">⚠ Important Notice</p>
                    <p className="text-amber-100/70 text-sm leading-relaxed">
                      We reserve the right to <strong className="text-amber-200 bg-amber-500/30 px-1.5 py-0.5 rounded">cancel your seat selection</strong> and <strong className="text-amber-200 bg-amber-500/30 px-1.5 py-0.5 rounded">assign a random seat for the onsite day</strong> if your login credentials (email or name) do not match your initial registration.
                    </p>
                    <p className="text-amber-100/70 text-sm leading-relaxed mt-2">
                      <strong className="text-amber-200 bg-amber-500/30 px-1 py-0.5 rounded" style={{ boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>Please make sure your email address and name are consistent with the information provided in your registration form.</strong>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-900/50 border border-gray-700/30 rounded-xl p-6 md:p-7 hover:border-gray-700/50 transition-colors">
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-tedx-red/20 border border-tedx-red/40">
                    <Armchair className="w-5 h-5 text-tedx-red" />
                  </div>
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-white mb-2">Step 2: Select Your Seat</h2>
                  <p className="text-gray-300 mb-4 leading-relaxed">
                    Select your preferred seat, enter your <strong className="text-white">full name</strong>, and click <strong className="text-white">"Confirm Booking"</strong>.
                  </p>
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <p className="text-blue-200/90 text-sm font-medium mb-2">⚠ Important Notice</p>
                    <p className="text-blue-100/70 text-sm leading-relaxed mb-3">
                      Each email address is limited to{' '}
                      <strong className="text-white bg-blue-500/30 px-1.5 py-0.5 rounded font-bold">ONE</strong>
                      {' '}ticket reservation.
                    </p>
                    <p className="text-blue-100/70 text-sm font-medium mb-2">To book a Combo Ticket:</p>
                    <ul className="text-blue-100/70 text-sm space-y-1 ml-4">
                      <li>• First reserve your own seat using your email.</li>
                      <li>• Then navigate back using the button in the top-left corner and enter your friend's email to select their seat.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-900/50 border border-gray-700/30 rounded-xl p-6 md:p-7 hover:border-gray-700/50 transition-colors">
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-tedx-red/20 border border-tedx-red/40">
                    <CheckCircle2 className="w-5 h-5 text-tedx-red" />
                  </div>
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-white mb-2">Step 3: Complete Your Registration</h2>
                  <p className="text-gray-300 leading-relaxed">
                    Once your seat is reserved, please return to the registration form to finalize your payment.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleContinue}
            className="w-full bg-gradient-to-r from-tedx-red to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-200 shadow-lg hover:shadow-tedx-red/50 active:scale-95 text-center uppercase tracking-wide"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

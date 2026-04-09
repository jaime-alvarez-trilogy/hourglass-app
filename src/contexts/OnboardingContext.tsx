// Shared onboarding context so all auth screens access the same useSetup state
import React, { createContext, useContext } from 'react';
import { useSetup, type UseSetupResult } from '../hooks/useAuth';

const OnboardingContext = createContext<UseSetupResult | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const setup = useSetup();
  return (
    <OnboardingContext.Provider value={setup}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): UseSetupResult {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}

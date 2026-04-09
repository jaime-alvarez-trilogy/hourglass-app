// FR8: useSetup — onboarding state machine hook

import { useState, useRef } from 'react';
import { fetchAndBuildConfig, probeEnvironments } from '../api/auth';
import { ApiError, AuthError, NetworkError } from '../api/errors';
import type { CrossoverConfig } from '../types/config';

export type OnboardingStep = 'welcome' | 'credentials' | 'verifying' | 'env-select' | 'setup' | 'success';

export interface UseSetupResult {
  step: OnboardingStep;
  setEnvironment: (useQA: boolean) => void;
  submitCredentials: (username: string, password: string) => Promise<void>;
  selectEnvironment: (useQA: boolean) => Promise<void>;
  submitRate: (rate: number) => Promise<void>;
  pendingConfig: CrossoverConfig | null;
  pendingCredentials: { username: string; password: string } | null;
  hasBothEnvs: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useSetup(): UseSetupResult {
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfig, setPendingConfig] = useState<CrossoverConfig | null>(null);
  const [pendingCredentials, setPendingCredentials] = useState<{ username: string; password: string } | null>(null);
  const [hasBothEnvs, setHasBothEnvs] = useState(false);
  const useQARef = useRef(false);

  function setEnvironment(useQA: boolean): void {
    useQARef.current = useQA;
  }

  async function _buildConfig(username: string, password: string, useQA: boolean): Promise<void> {
    try {
      const config = await fetchAndBuildConfig(username, password, useQA);
      setPendingConfig(config);
      setPendingCredentials({ username, password });
      if (config.hourlyRate === 0) {
        setStep('setup');
      } else {
        setStep('success');
      }
    } catch (err) {
      if (err instanceof AuthError) {
        setStep('credentials');
        setError('Invalid email or password.');
      } else if (err instanceof NetworkError) {
        setStep('credentials');
        setError('Connection failed. Please check your network and try again.');
      } else if (err instanceof ApiError) {
        const now = new Date().toISOString();
        setPendingConfig({
          userId: '0', fullName: username, managerId: '0', primaryTeamId: '0',
          assignmentId: '0', hourlyRate: 0, weeklyLimit: 40, useQA,
          isManager: false, teams: [], lastRoleCheck: now,
          setupComplete: false, setupDate: now, debugMode: false,
        });
        setPendingCredentials({ username, password });
        setStep('setup');
      } else {
        setStep('credentials');
        setError('An unexpected error occurred. Please try again.');
      }
    }
  }

  async function submitCredentials(username: string, password: string): Promise<void> {
    if (isLoading) return;

    setIsLoading(true);
    setError(null);
    setStep('verifying');
    setPendingCredentials({ username, password });

    try {
      const probe = await probeEnvironments(username, password);

      if (probe.type === 'none') {
        setStep('credentials');
        setError('Invalid email or password.');
        return;
      }

      if (probe.type === 'both') {
        // Let user choose — show env-select screen
        setHasBothEnvs(true);
        setStep('env-select');
        return;
      }

      // Only one env works — proceed automatically
      const useQA = probe.type === 'qa_only';
      useQARef.current = useQA;
      await _buildConfig(username, password, useQA);
    } catch (err) {
      setStep('credentials');
      setError('Connection failed. Please check your network and try again.');
    } finally {
      setIsLoading(false);
    }
  }

  async function selectEnvironment(useQA: boolean): Promise<void> {
    if (!pendingCredentials || isLoading) return;

    setIsLoading(true);
    setError(null);
    useQARef.current = useQA;
    setStep('verifying');

    try {
      await _buildConfig(pendingCredentials.username, pendingCredentials.password, useQA);
    } finally {
      setIsLoading(false);
    }
  }

  async function submitRate(rate: number): Promise<void> {
    if (!pendingConfig) return;

    setIsLoading(true);
    setError(null);
    try {
      setPendingConfig({ ...pendingConfig, hourlyRate: rate });
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rate.');
    } finally {
      setIsLoading(false);
    }
  }

  return {
    step,
    setEnvironment,
    submitCredentials,
    selectEnvironment,
    submitRate,
    pendingConfig,
    pendingCredentials,
    hasBothEnvs,
    isLoading,
    error,
  };
}

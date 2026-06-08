// usePrescription — 03-pace-prescription FR5
// Composing hook: useHoursData + useWorkPattern + useConfig → Prescription | null.

import { useMemo } from 'react';
import { useHoursData } from './useHoursData';
import { useWorkPattern } from './useWorkPattern';
import { useConfig } from './useConfig';
import { computePrescription } from '../lib/prescription';
import type { Prescription } from '../lib/prescription';

/**
 * Returns the current pace prescription — per-remaining-workday hour breakdown
 * and a one-line summary string. Returns null while hoursData or config is loading.
 * Recomputes whenever hoursData, work pattern, or config changes.
 */
export function usePrescription(): Prescription | null {
  const { data: hoursData } = useHoursData();
  const pattern = useWorkPattern();
  const { config } = useConfig();

  return useMemo(() => {
    if (!hoursData || !config) return null;
    return computePrescription(hoursData, pattern, config.weeklyLimit);
  }, [hoursData, pattern, config]);
}

import { useState, useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';

/**
 * Returns a key that increments each time the screen re-focuses (after initial mount).
 * Use as a `key` prop on chart components to force them to remount and re-animate.
 */
export function useFocusKey(): number {
  const [key, setKey] = useState(0);
  const isFocused = useIsFocused();
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    if (isFocused) setKey(k => k + 1);
  }, [isFocused]);

  return key;
}

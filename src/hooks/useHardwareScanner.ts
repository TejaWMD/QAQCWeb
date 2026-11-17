import { useEffect, useRef } from 'react';

/**
 * Listens for USB/Bluetooth HID handheld barcode scanner bursts (< 80ms between keystrokes, terminated with Enter).
 */
export function useHardwareScanner(onScan: (value: string) => void, enabled = true) {
  const bufferRef = useRef('');
  const lastTimeRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) {
        return;
      }

      const now = Date.now();
      if (now - lastTimeRef.current > 80) {
        bufferRef.current = '';
      }
      lastTimeRef.current = now;

      if (e.key === 'Enter') {
        const scanned = bufferRef.current.trim();
        bufferRef.current = '';
        if (scanned.length >= 4) {
          onScan(scanned);
        }
        return;
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onScan, enabled]);
}

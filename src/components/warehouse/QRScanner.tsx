import React, { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Camera, CameraOff } from 'lucide-react';

export function CameraQRScanner({ onDecode }: { onDecode: (decodedText: string) => void }) {
  const [active, setActive] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const rawId = useId();
  const regionId = `camera-qr-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const stopScanner = async () => {
    try {
      if (scannerRef.current && scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }
      scannerRef.current?.clear();
    } catch {
      // ignore stop errors
    } finally {
      scannerRef.current = null;
      setActive(false);
    }
  };

  const startScanner = async () => {
    setErrMsg('');
    setActive(true);
    setTimeout(async () => {
      try {
        const html5Qr = new Html5Qrcode(regionId);
        scannerRef.current = html5Qr;
        await html5Qr.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            onDecode(decodedText);
            stopScanner();
          },
          () => {}
        );
      } catch (err: any) {
        setErrMsg(err?.message || 'Camera unavailable or permission denied.');
        setActive(false);
      }
    }, 100);
  };

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  return (
    <div className="space-y-2">
      {!active ? (
        <Button type="button" variant="outline" onClick={startScanner}>
          <Camera className="w-4 h-4 mr-1" /> Scan with Camera
        </Button>
      ) : (
        <div className="space-y-2">
          <div id={regionId} className="w-full max-w-sm rounded-md overflow-hidden border bg-black" />
          <Button type="button" variant="secondary" size="sm" onClick={stopScanner}>
            <CameraOff className="w-4 h-4 mr-1" /> Stop Camera
          </Button>
        </div>
      )}
      {errMsg && <p className="text-xs text-rose-600">{errMsg}</p>}
    </div>
  );
}

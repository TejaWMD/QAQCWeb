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
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setErrMsg('Camera API unavailable. Please open this app over HTTPS and allow camera access.');
      return;
    }

    setActive(true);
    setTimeout(async () => {
      try {
        const html5Qr = new Html5Qrcode(regionId);
        scannerRef.current = html5Qr;
        const config = {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          aspectRatio: 1.0,
        };

        const handleSuccess = (decodedText: string) => {
          onDecode(decodedText);
          stopScanner();
        };

        try {
          await html5Qr.start({ facingMode: 'environment' }, config, handleSuccess, () => {});
        } catch (primaryErr) {
          // Fallback for devices where facingMode: 'environment' is overconstrained
          const cameras = await Html5Qrcode.getCameras();
          if (!cameras || cameras.length === 0) {
            throw primaryErr;
          }
          const backCam =
            cameras.find((c) => /back|rear|environment/i.test(c.label)) ||
            cameras[cameras.length - 1];
          await html5Qr.start(backCam.id, config, handleSuccess, () => {});
        }

        // Ensure iOS Safari / PWA plays video inline without going fullscreen
        const container = document.getElementById(regionId);
        const video = container?.querySelector('video');
        if (video) {
          video.setAttribute('playsinline', 'true');
          video.muted = true;
        }
      } catch (err: any) {
        const msg = err?.message || String(err || '');
        if (/NotAllowedError|Permission/i.test(msg)) {
          setErrMsg('Camera permission denied. Please allow camera access in your browser/app settings.');
        } else if (/NotFoundError|Requested device not found/i.test(msg)) {
          setErrMsg('No camera found on this device.');
        } else {
          setErrMsg(msg || 'Camera unavailable or permission denied.');
        }
        setActive(false);
      }
    }, 120);
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

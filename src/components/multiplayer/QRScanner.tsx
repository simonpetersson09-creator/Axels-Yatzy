import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ScanLine } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { useTranslation } from '@/lib/i18n';

interface QRScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

export function QRScanner({ open, onClose, onScan }: QRScannerProps) {
  const { t } = useTranslation();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const startedRef = useRef(false);

  // Keep latest callbacks in refs so the effect doesn't re-run on every render
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    handledRef.current = false;
    startedRef.current = false;
    setError(null);
    setScanning(true);

    const scanner = new Html5Qrcode('qr-reader', { verbose: false });
    scannerRef.current = scanner;

    const handleDecoded = (decodedText: string) => {
      if (handledRef.current) return;
      let code: string | null = null;
      try {
        const url = new URL(decodedText);
        const c = url.searchParams.get('code');
        if (c && /^[A-Z0-9]{6}$/i.test(c)) code = c.toUpperCase();
      } catch {
        const raw = decodedText.trim().toUpperCase();
        if (/^[A-Z0-9]{6}$/.test(raw)) code = raw;
      }
      if (!code) return;
      handledRef.current = true;
      const finish = () => {
        onScanRef.current(code!);
        onCloseRef.current();
      };
      // Always attempt to stop the underlying camera stream. A fast decode can
      // fire before scanner.start().then() has had a chance to flip
      // startedRef — in that case getState() still reports SCANNING and the
      // stream needs to be stopped to release the camera.
      let state: Html5QrcodeScannerState | null = null;
      try { state = scanner.getState(); } catch { /* not initialised yet */ }
      if (state === Html5QrcodeScannerState.SCANNING) {
        scanner.stop().then(finish).catch(finish);
      } else {
        finish();
      }
    };

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        handleDecoded,
        () => {
          // Ignore per-frame decode failures
        },
      )
      .then(() => {
        startedRef.current = true;
        // If the component unmounted OR a code was decoded during start-up,
        // stop the stream now — the success path already returned without
        // being able to stop it.
        if (cancelled || handledRef.current) {
          scanner.stop().catch(() => {});
        }
      })
      .catch((err: unknown) => {
        console.error('[QRScanner] start failed', err);
        if (cancelled) return;
        setScanning(false);
        const name = (err as { name?: string })?.name ?? '';
        const msg = (err as { message?: string })?.message ?? String(err);
        let friendly = t('errGeneric');
        if (name === 'NotAllowedError' || /permission|denied|not allowed/i.test(msg)) {
          friendly = t('errCameraBlocked');
        } else if (name === 'NotFoundError' || /no camera|not found/i.test(msg)) {
          friendly = t('errCameraNotFound');
        } else if (name === 'NotReadableError' || /in use|busy/i.test(msg)) {
          friendly = t('errCameraInUse');
        } else if (/secure|https/i.test(msg)) {
          friendly = t('errCameraInsecure');
        } else if (msg) {
          friendly = t('errCameraStart', { msg });
        }
        setError(friendly);
      });

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (!s) return;
      try {
        if (s.getState() === Html5QrcodeScannerState.SCANNING) {
          s.stop()
            .then(() => s.clear())
            .catch(() => {});
        } else {
          try { s.clear(); } catch { /* noop */ }
        }
      } catch {
        // noop
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 bg-black flex flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 safe-top">
            <div className="flex items-center gap-2 text-white">
              <ScanLine className="w-5 h-5" />
              <span className="font-display font-bold">{t('scanQR')}</span>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Camera view */}
          <div className="flex-1 relative flex items-center justify-center overflow-hidden">
            <div id="qr-reader" className="w-full h-full" />

            {/* Corner brackets overlay */}
            {!error && scanning && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="relative w-56 h-56">
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-primary" />
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-primary" />
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-primary" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-primary" />
                </div>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <div className="glass-card p-6 text-center space-y-3">
                  <p className="text-destructive font-medium">{error}</p>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold"
                  >
                    {t('ok')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bottom hint */}
          <div className="px-6 py-4 safe-bottom text-center">
            <p className="text-white/60 text-sm">{t('scanQR')}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

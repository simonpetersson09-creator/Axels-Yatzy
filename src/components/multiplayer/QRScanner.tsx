import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ScanLine } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { useTranslation } from '@/lib/i18n';

interface QRScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

export function QRScanner({ open, onClose, onScan }: QRScannerProps) {
  const { t } = useTranslation();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setScanning(true);

    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 200, height: 200 } },
        (decodedText) => {
          try {
            const url = new URL(decodedText);
            const code = url.searchParams.get('code');
            if (code && /^[A-Z0-9]{6}$/i.test(code)) {
              scanner.stop().then(() => {
                onScan(code.toUpperCase());
                onClose();
              });
            }
          } catch {
            // Not a valid URL — try treating the whole text as a code
            const raw = decodedText.trim().toUpperCase();
            if (/^[A-Z0-9]{6}$/.test(raw)) {
              scanner.stop().then(() => {
                onScan(raw);
                onClose();
              });
            }
          }
        },
        () => {
          // Intentionally ignore decode failures (no QR in frame)
        }
      )
      .catch((err) => {
        setScanning(false);
        if (typeof err === 'string' && err.includes('Permission')) {
          setError(t('errGeneric'));
        } else {
          setError(t('errGeneric'));
        }
      });

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [open, onScan, onClose, t]);

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
          <div className="flex-1 relative flex items-center justify-center">
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

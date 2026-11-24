import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Share2, X } from 'lucide-react';
import type { GeneratedRoute } from '../types';
import { buildShareUrl } from '../utils/shareRoute';

interface ShareRouteModalProps {
  route: GeneratedRoute;
  cityName?: string;
  onClose: () => void;
}

export function ShareRouteModal({ route, cityName, onClose }: ShareRouteModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const shareUrl = buildShareUrl(route, cityName);

  useEffect(() => {
    QRCode.toDataURL(shareUrl, {
      width: 220,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [shareUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleNativeShare = async () => {
    if ('share' in navigator) {
      try {
        await navigator.share({
          title: `CityExplorer+ · ${route.name}`,
          text: `Bekijk mijn ${route.activity === 'walking' ? 'wandellus' : 'fietslus'}: ${route.name}`,
          url: shareUrl,
        });
      } catch {
        // Cancelled
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200">
          <h3 className="text-base font-extrabold text-slate-900">Route delen</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluit"
            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col items-center space-y-4">
          <div className="text-center">
            <div className="text-sm font-bold text-slate-900">{route.name}</div>
            <p className="text-xs text-slate-500 mt-0.5">
              Scan de QR-code of deel de link om deze lus direct te openen.
            </p>
          </div>

          {qrDataUrl && (
            <div className="p-3 bg-white rounded-2xl border-2 border-slate-200 shadow-xs">
              <img src={qrDataUrl} alt="QR-code voor route" className="w-48 h-48" />
            </div>
          )}

          <div className="w-full flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Gekopieerd!' : 'Kopieer link'}
            </button>
            <button
              type="button"
              onClick={handleNativeShare}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              Deel nu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

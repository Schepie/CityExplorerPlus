import { useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  KeyRound,
  Lock,
  QrCode,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  buildKeySyncUrl,
  decryptKeysPayload,
  encryptKeysPayload,
} from '../services/syncService';
import type { AppSettings } from '../types';

interface KeySyncModalProps {
  settings: AppSettings;
  initialIncomingCode?: string | null;
  onImportSettings: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
}

export function KeySyncModal({
  settings,
  initialIncomingCode,
  onImportSettings,
  onClose,
}: KeySyncModalProps) {
  const [mode, setMode] = useState<'export' | 'import'>(initialIncomingCode ? 'import' : 'export');

  // Export state
  const [exportPin, setExportPin] = useState('');
  const [syncUrl, setSyncUrl] = useState('');
  const [encryptedCode, setEncryptedCode] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState<'url' | 'code' | null>(null);

  // Import state
  const [importCode, setImportCode] = useState(initialIncomingCode || '');
  const [importPin, setImportPin] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null);

  const configuredKeyCount = [
    settings.orsApiKey,
    settings.maptilerApiKey,
    settings.geminiApiKey,
    settings.geoapifyApiKey,
    settings.opentripmapApiKey,
  ].filter((k) => k.trim().length > 5).length;

  const handleGenerateQr = async () => {
    if (exportPin.trim().length < 4) return;
    const code = await encryptKeysPayload(settings, exportPin.trim());
    const url = buildKeySyncUrl(code);
    setEncryptedCode(code);
    setSyncUrl(url);
    const qr = await QRCode.toDataURL(url, {
      width: 240,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
    setQrDataUrl(qr);
  };

  const handleCopy = async (type: 'url' | 'code') => {
    try {
      await navigator.clipboard.writeText(type === 'url' ? syncUrl : encryptedCode);
      setCopied(type);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Ignore clipboard error
    }
  };

  const handleUnlockImport = async () => {
    setImportError(null);
    if (!importCode.trim() || importPin.trim().length < 4) {
      setImportError('Vul zowel de sync-code als je PIN/wachtwoord (min. 4 tekens) in.');
      return;
    }
    try {
      const payload = await decryptKeysPayload(importCode, importPin.trim());
      const patch: Partial<AppSettings> = {};
      let count = 0;
      if (payload.orsApiKey) {
        patch.orsApiKey = payload.orsApiKey;
        count++;
      }
      if (payload.maptilerApiKey) {
        patch.maptilerApiKey = payload.maptilerApiKey;
        count++;
      }
      if (payload.geminiApiKey) {
        patch.geminiApiKey = payload.geminiApiKey;
        count++;
      }
      if (payload.geoapifyApiKey) {
        patch.geoapifyApiKey = payload.geoapifyApiKey;
        count++;
      }
      if (payload.opentripmapApiKey) {
        patch.opentripmapApiKey = payload.opentripmapApiKey;
        count++;
      }
      if (payload.voiceRegion) patch.voiceRegion = payload.voiceRegion;
      if (payload.voiceGender) patch.voiceGender = payload.voiceGender;

      onImportSettings(patch);
      setImportSuccessCount(count);
    } catch {
      setImportError('Verkeerd wachtwoord/PIN of ongeldige sync-code. Probeer opnieuw.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-teal-600" />
            <h3 className="text-base font-extrabold text-slate-900">
              API-keys synchroniseren (QR)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluit"
            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-2 gap-1 p-1.5 bg-slate-100 mx-4 mt-3 rounded-2xl">
          <button
            type="button"
            onClick={() => setMode('export')}
            className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              mode === 'export' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Versturen (QR maken)
          </button>
          <button
            type="button"
            onClick={() => setMode('import')}
            className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              mode === 'import' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Ontvangen (Ontgrendel)
          </button>
        </div>

        <div className="p-4 space-y-3.5 max-h-[75vh] overflow-y-auto">
          {mode === 'export' ? (
            <>
              <div className="p-3 rounded-2xl bg-teal-50 border border-teal-200/80 flex gap-2 text-xs text-teal-900">
                <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                <span>
                  Je <strong>{configuredKeyCount} API-key(s)</strong> en stemvoorkeur worden met{' '}
                  <strong>AES-256</strong> versleuteld met jouw eigen PIN/wachtwoord. Geen extern
                  account nodig!
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Kies een PIN of wachtwoord (min. 4 tekens)
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={exportPin}
                    onChange={(e) => {
                      setExportPin(e.target.value);
                      setQrDataUrl('');
                    }}
                    placeholder="Bijv. 1234 of een wachtwoord..."
                    className="flex-1 text-sm px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 focus:outline-none focus:border-teal-600"
                  />
                  <button
                    type="button"
                    disabled={exportPin.trim().length < 4 || configuredKeyCount === 0}
                    onClick={handleGenerateQr}
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer shrink-0"
                  >
                    Maak QR
                  </button>
                </div>
                {configuredKeyCount === 0 && (
                  <p className="text-[11px] text-amber-700 font-medium">
                    Vul eerst minstens 1 API-key in bij het tabblad API’s.
                  </p>
                )}
              </div>

              {qrDataUrl && (
                <div className="flex flex-col items-center space-y-3 pt-1">
                  <div className="p-3 bg-white rounded-2xl border-2 border-slate-200 shadow-xs">
                    <img src={qrDataUrl} alt="Versleutelde API-sync QR" className="w-52 h-52" />
                  </div>
                  <p className="text-[11px] text-center text-slate-600">
                    Scan deze QR-code met de camera van je GSM en vul daar dezelfde PIN/wachtwoord
                    in.
                  </p>
                  <div className="w-full grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy('url')}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold cursor-pointer"
                    >
                      {copied === 'url' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copied === 'url' ? 'Gekopieerd!' : 'Kopieer link'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy('code')}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold cursor-pointer"
                    >
                      {copied === 'code' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <KeyRound className="w-3.5 h-3.5" />
                      )}
                      {copied === 'code' ? 'Gekopieerd!' : 'Kopieer code'}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : importSuccessCount !== null ? (
            <div className="py-6 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <div>
                <div className="text-base font-extrabold text-slate-900">
                  Synchronisatie geslaagd!
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  {importSuccessCount} API-key(s) en je stemvoorkeur zijn veilig opgeslagen op dit
                  toestel.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold cursor-pointer"
              >
                Klaar
              </button>
            </div>
          ) : (
            <>
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex gap-2 text-xs text-slate-700">
                <Lock className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                <span>
                  {initialIncomingCode
                    ? 'QR-code herkend! Vul je gekozen PIN/wachtwoord in om je API-keys lokaal te ontgrendelen.'
                    : 'Plak een versleutelde sync-link of code en vul je PIN/wachtwoord in.'}
                </span>
              </div>

              {!initialIncomingCode && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Sync-link of code</label>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const txt = await navigator.clipboard.readText();
                          if (txt) setImportCode(txt.trim());
                        } catch {
                          // Ignore
                        }
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 cursor-pointer"
                    >
                      <ClipboardPaste className="w-3.5 h-3.5" />
                      Plak
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={importCode}
                    onChange={(e) => setImportCode(e.target.value)}
                    placeholder="Plak de gekopieerde sync-link of code..."
                    className="w-full text-xs p-2.5 rounded-xl bg-slate-50 border border-slate-300 focus:outline-none focus:border-teal-600"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  Jouw PIN / wachtwoord
                </label>
                <input
                  type="password"
                  value={importPin}
                  onChange={(e) => setImportPin(e.target.value)}
                  placeholder="Vul je PIN of wachtwoord in..."
                  className="w-full text-sm px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 focus:outline-none focus:border-teal-600"
                />
              </div>

              {importError && (
                <div className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  {importError}
                </div>
              )}

              <button
                type="button"
                onClick={handleUnlockImport}
                className="w-full py-3 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold shadow-md cursor-pointer"
              >
                Ontgrendel &amp; sla op dit toestel op
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

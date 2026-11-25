import { useState } from 'react';
import {
  CheckCircle2,
  ClipboardPaste,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  QrCode,
  Trash2,
  XCircle,
} from 'lucide-react';
import { clearLocalPoiCache, getLocalPoiCacheCount } from '../services/poiService';
import type { AppSettings } from '../types';
import { KeySyncModal } from './KeySyncModal';

interface ApiKeysPanelProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}

type ApiKeyField =
  | 'orsApiKey'
  | 'maptilerApiKey'
  | 'geminiApiKey'
  | 'geoapifyApiKey'
  | 'opentripmapApiKey';

interface ApiProviderConfig {
  field: ApiKeyField;
  name: string;
  badge: string;
  description: string;
  signupUrl: string;
  placeholder: string;
  testFn: (key: string) => Promise<boolean>;
}

const API_PROVIDERS: ApiProviderConfig[] = [
  {
    field: 'orsApiKey',
    name: 'OpenRouteService',
    badge: 'Betere fiets/wandelpaden',
    description: 'Gratis ~2.000 routes/dag. Extra nauwkeurige wandel- & fietsrouting.',
    signupUrl: 'https://openrouteservice.org/dev/#/signup',
    placeholder: 'Plak OpenRouteService API-key...',
    testFn: async (key) => {
      const resp = await fetch('https://api.openrouteservice.org/v2/directions/foot-walking', {
        method: 'POST',
        headers: { Authorization: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coordinates: [
            [5.1214, 52.0907],
            [5.124, 52.092],
          ],
        }),
      });
      return resp.ok;
    },
  },
  {
    field: 'maptilerApiKey',
    name: 'MapTiler Outdoor',
    badge: 'Komoot Topo-kaart',
    description: 'Gratis 100k tiles/mnd. Ontgrendelt wandelpaden, fietsroutes & hoogtelijnen.',
    signupUrl: 'https://cloud.maptiler.com/account/keys/',
    placeholder: 'Plak MapTiler API-key...',
    testFn: async (key) => {
      const resp = await fetch(
        `https://api.maptiler.com/maps/outdoor-v2/tiles.json?key=${encodeURIComponent(key)}`
      );
      return resp.ok;
    },
  },
  {
    field: 'geminiApiKey',
    name: 'Google Gemini (Flash-Lite)',
    badge: 'AI Audiogids (gecachet)',
    description:
      'Schrijft korte Nederlandse verhaaltjes voor POIs zonder Wikipedia-artikel. Lokaal gecachet.',
    signupUrl: 'https://aistudio.google.com/apikey',
    placeholder: 'Plak Gemini API-key (AIza...)',
    testFn: async (key) => {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite?key=${encodeURIComponent(
          key
        )}`
      );
      return resp.ok;
    },
  },
  {
    field: 'geoapifyApiKey',
    name: 'Geoapify Places',
    badge: 'Extra POIs & Horeca',
    description: 'Gratis 3.000 calls/dag. Extra snelle POI- en terrasjeszoeker zonder rate-limits.',
    signupUrl: 'https://myprojects.geoapify.com/',
    placeholder: 'Plak Geoapify API-key...',
    testFn: async (key) => {
      const resp = await fetch(
        `https://api.geoapify.com/v2/places?categories=tourism.sights&filter=circle:5.1214,52.0907,500&limit=1&apiKey=${encodeURIComponent(
          key
        )}`
      );
      return resp.ok;
    },
  },
  {
    field: 'opentripmapApiKey',
    name: 'OpenTripMap',
    badge: 'Toeristische 1-3★ POIs',
    description: 'Gratis tier. Speciaal voor toeristische highlights met populariteitsrating.',
    signupUrl: 'https://dev.opentripmap.org/',
    placeholder: 'Plak OpenTripMap API-key...',
    testFn: async (key) => {
      const resp = await fetch(
        `https://api.opentripmap.com/0.1/en/places/radius?radius=1000&lon=5.1214&lat=52.0907&limit=1&format=json&apikey=${encodeURIComponent(
          key
        )}`
      );
      return resp.ok;
    },
  },
];

export function ApiKeysPanel({ settings, onUpdateSettings }: ApiKeysPanelProps) {
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
  const [testState, setTestState] = useState<
    Record<string, 'idle' | 'testing' | 'ok' | 'fail'>
  >({});
  const [cacheCount, setCacheCount] = useState<number>(() => getLocalPoiCacheCount());
  const [syncModalOpen, setSyncModalOpen] = useState(false);

  const handlePaste = async (field: ApiKeyField) => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) {
        onUpdateSettings({ [field]: text });
        setTestState((prev) => ({ ...prev, [field]: 'idle' }));
      }
    } catch {
      // Clipboard permission denied — user can paste normally in input
    }
  };

  const handleTest = async (provider: ApiProviderConfig) => {
    const val = settings[provider.field].trim();
    if (!val) return;
    setTestState((prev) => ({ ...prev, [provider.field]: 'testing' }));
    try {
      const ok = await provider.testFn(val);
      setTestState((prev) => ({ ...prev, [provider.field]: ok ? 'ok' : 'fail' }));
    } catch {
      setTestState((prev) => ({ ...prev, [provider.field]: 'fail' }));
    }
  };

  const activeCount = API_PROVIDERS.filter((p) => settings[p.field].trim().length > 5).length;

  return (
    <div className="space-y-3">
      {/* Privacy & Local Storage Banner */}
      <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200/80 space-y-2.5">
        <div className="flex gap-2.5">
          <Lock className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <div className="text-xs text-emerald-900 leading-relaxed">
            <div className="font-bold">
              100% lokaal op jouw toestel ({activeCount}/{API_PROVIDERS.length} actief)
            </div>
            Alle API-keys en gecachete POIs blijven uitsluitend op dit toestel bewaard.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSyncModalOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
        >
          <QrCode className="w-4 h-4" />
          Sync keys tussen PC &amp; GSM (Versleutelde QR)
        </button>
      </div>

      {syncModalOpen && (
        <KeySyncModal
          settings={settings}
          onImportSettings={onUpdateSettings}
          onClose={() => setSyncModalOpen(false)}
        />
      )}

      {/* API Provider Cards */}
      {API_PROVIDERS.map((provider) => {
        const value = settings[provider.field];
        const isActive = value.trim().length > 5;
        const isShown = Boolean(visibleFields[provider.field]);
        const status = testState[provider.field] ?? 'idle';

        return (
          <div
            key={provider.field}
            className="p-3 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <KeyRound className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span className="text-xs font-extrabold text-slate-900">{provider.name}</span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {isActive ? 'Actief ✓' : provider.badge}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                  {provider.description}
                </p>
              </div>
              <a
                href={provider.signupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-teal-700 hover:underline bg-white border border-teal-200 px-2 py-1 rounded-lg"
              >
                Key halen
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Fast Input Row: input + show/hide + 1-tap Paste + 1-tap Test */}
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1 min-w-0">
                <input
                  type={isShown ? 'text' : 'password'}
                  value={value}
                  placeholder={provider.placeholder}
                  onChange={(e) => {
                    onUpdateSettings({ [provider.field]: e.target.value });
                    setTestState((prev) => ({ ...prev, [provider.field]: 'idle' }));
                  }}
                  className="w-full text-xs pl-2.5 pr-8 py-2 rounded-xl bg-white border border-slate-300 focus:outline-none focus:border-teal-600"
                />
                <button
                  type="button"
                  onClick={() =>
                    setVisibleFields((prev) => ({ ...prev, [provider.field]: !isShown }))
                  }
                  aria-label="Toon of verberg key"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {isShown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <button
                type="button"
                onClick={() => handlePaste(provider.field)}
                title="Plak key uit klembord"
                className="px-2.5 py-2 rounded-xl bg-white hover:bg-teal-50 border border-slate-200 text-slate-700 hover:text-teal-700 text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Plak</span>
              </button>

              {isActive && (
                <button
                  type="button"
                  disabled={status === 'testing'}
                  onClick={() => handleTest(provider)}
                  className="px-2.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer shrink-0 disabled:opacity-60"
                >
                  {status === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Test'}
                </button>
              )}
            </div>

            {status === 'ok' && (
              <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Key werkt perfect! Direct actief in de app.
              </div>
            )}
            {status === 'fail' && (
              <div className="flex items-center gap-1 text-[11px] font-bold text-rose-600">
                <XCircle className="w-3.5 h-3.5" />
                Key geweigerd of geen verbinding — controleer of je de juiste key plakte.
              </div>
            )}
          </div>
        );
      })}

      {/* Local POI Cache Management */}
      <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-2xl flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-bold text-slate-800">Lokale POI- &amp; AI-cache</div>
          <div className="text-[11px] text-slate-500">
            {cacheCount} verrijkte POIs lokaal opgeslagen (bespaart API-calls &amp; tokens)
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            clearLocalPoiCache();
            setCacheCount(0);
          }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white hover:bg-rose-50 border border-slate-200 text-slate-600 hover:text-rose-700 text-xs font-bold cursor-pointer shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Wis
        </button>
      </div>
    </div>
  );
}

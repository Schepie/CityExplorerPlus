import { useEffect, useState } from 'react';
import {
  Award,
  Bell,
  Bookmark,
  CheckCircle2,
  CloudDownload,
  Download,
  RefreshCw,
  Smartphone,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { APP_VERSION, CHANGELOG } from '../data/changelog';
import { audioService } from '../services/audioService';
import { applyAppUpdate, type UpdateCheckResult } from '../services/updateService';
import type { AppSettings, CompletedTrip, GeneratedRoute, SavedRoute } from '../types';
import { formatDistance, formatDuration } from '../utils/geo';

interface SettingsDrawerProps {
  isOpen: boolean;
  initialTab?: 'options' | 'saved' | 'diary';
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  savedRoutes: SavedRoute[];
  completedTrips: CompletedTrip[];
  updateInfo: UpdateCheckResult | null;
  checkingUpdate: boolean;
  onCheckUpdate: () => void;
  onLoadSavedRoute: (route: GeneratedRoute) => void;
  onDeleteSavedRoute: (id: string) => void;
  onDownloadOfflineRoute: (item: SavedRoute) => void;
  onDeleteCompletedTrip: (id: string) => void;
}

export function SettingsDrawer({
  isOpen,
  initialTab = 'options',
  onClose,
  settings,
  onUpdateSettings,
  savedRoutes,
  completedTrips,
  updateInfo,
  checkingUpdate,
  onCheckUpdate,
  onLoadSavedRoute,
  onDeleteSavedRoute,
  onDownloadOfflineRoute,
  onDeleteCompletedTrip,
}: SettingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<'options' | 'saved' | 'diary'>(initialTab);
  const [showChangelog, setShowChangelog] = useState(false);
  const [dutchVoices, setDutchVoices] = useState<SpeechSynthesisVoice[]>(() =>
    audioService.getDutchVoices()
  );

  useEffect(() => {
    const unsub = audioService.onVoicesChange(() => {
      setDutchVoices(audioService.getDutchVoices());
    });
    setDutchVoices(audioService.getDutchVoices());
    return unsub;
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200 pt-safe">
          <h2 className="text-lg font-extrabold text-slate-900">Opties &amp; Routes</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluit optiemenu"
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1.5 bg-slate-100 mx-4 mt-3 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('options')}
            className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'options' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Opties
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('saved')}
            className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'saved' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            Trips ({savedRoutes.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('diary')}
            className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'diary' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            Dagboek ({completedTrips.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-safe">
          {activeTab === 'options' ? (
            <>
              {/* Audio & TTS toggles */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Geluid &amp; Voorlezen
                </h3>

                <label className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200/80 cursor-pointer">
                  <div>
                    <div className="text-sm font-bold text-slate-900">Turn-by-Turn spraak</div>
                    <div className="text-xs text-slate-500">Spreek afslagen uit tijdens navigatie</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.turnByTurnVoice}
                    onChange={(e) => onUpdateSettings({ turnByTurnVoice: e.target.checked })}
                    className="w-5 h-5 accent-teal-600 rounded"
                  />
                </label>

                <label className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200/80 cursor-pointer">
                  <div>
                    <div className="text-sm font-bold text-slate-900">POI geluidssignaal</div>
                    <div className="text-xs text-slate-500">Speel een belletje in de buurt van een POI</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.poiSoundEnabled}
                    onChange={(e) => onUpdateSettings({ poiSoundEnabled: e.target.checked })}
                    className="w-5 h-5 accent-teal-600 rounded"
                  />
                </label>

                <label className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200/80 cursor-pointer">
                  <div>
                    <div className="text-sm font-bold text-slate-900">POI automatisch voorlezen</div>
                    <div className="text-xs text-slate-500">
                      Lees de POI-omschrijving direct voor bij nadering
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.poiAutoReadAloud}
                    onChange={(e) => onUpdateSettings({ poiAutoReadAloud: e.target.checked })}
                    className="w-5 h-5 accent-teal-600 rounded"
                  />
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      audioService.unlock();
                      audioService.playPoiChime();
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold cursor-pointer"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    Test POI-geluid
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      audioService.unlock();
                      audioService.speakPoiNow(
                        'Welkom bij CityExplorerPlus. Je nadert een mooie bezienswaardigheid!',
                        settings.speechRate
                      );
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    Test voorlezen
                  </button>
                </div>

                {/* Voice accent (Vlaams / Nederlands) & gender (Vrouw / Man) */}
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-slate-700">Taal / Accent</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings({ voiceRegion: 'nl-BE', preferredVoiceURI: '' })
                        }
                        className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          settings.voiceRegion === 'nl-BE'
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-teal-400'
                        }`}
                      >
                        🇧🇪 Vlaams
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings({ voiceRegion: 'nl-NL', preferredVoiceURI: '' })
                        }
                        className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          settings.voiceRegion === 'nl-NL'
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-teal-400'
                        }`}
                      >
                        🇳🇱 Nederlands
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-bold text-slate-700">Stemtype</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'auto', label: 'Auto' },
                          { id: 'female', label: '👩 Vrouw' },
                          { id: 'male', label: '👨 Man' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            onUpdateSettings({ voiceGender: opt.id, preferredVoiceURI: '' })
                          }
                          className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                            settings.voiceGender === opt.id
                              ? 'bg-teal-600 text-white border-teal-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-teal-400'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {dutchVoices.length > 0 && (
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-slate-600">
                        Specifieke stem op dit toestel (optioneel)
                      </label>
                      <select
                        value={settings.preferredVoiceURI}
                        onChange={(e) => onUpdateSettings({ preferredVoiceURI: e.target.value })}
                        className="w-full text-xs px-2.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-teal-600"
                      >
                        <option value="">
                          Automatisch ({settings.voiceRegion === 'nl-BE' ? 'Vlaams' : 'Nederlands'}
                          {settings.voiceGender === 'female'
                            ? ' · Vrouw'
                            : settings.voiceGender === 'male'
                              ? ' · Man'
                              : ''}
                          )
                        </option>
                        {dutchVoices.map((v) => (
                          <option key={v.voiceURI} value={v.voiceURI}>
                            {v.name} ({v.lang})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Speech rate */}
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span>Spraaksnelheid</span>
                    <span>{settings.speechRate.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min={0.8}
                    max={1.3}
                    step={0.1}
                    value={settings.speechRate}
                    onChange={(e) => onUpdateSettings({ speechRate: parseFloat(e.target.value) })}
                    className="w-full accent-teal-600"
                  />
                </div>
              </div>

              {/* Navigation preferences */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Snelheid &amp; Geofencing
                </h3>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                  <div>
                    <div className="flex justify-between text-xs font-bold text-slate-700">
                      <span>Gem. wandelsnelheid</span>
                      <span>{settings.walkingSpeedKmh} km/u</span>
                    </div>
                    <input
                      type="range"
                      min={3}
                      max={7}
                      step={0.2}
                      value={settings.walkingSpeedKmh}
                      onChange={(e) =>
                        onUpdateSettings({ walkingSpeedKmh: parseFloat(e.target.value) })
                      }
                      className="w-full accent-teal-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold text-slate-700">
                      <span>Gem. fietssnelheid</span>
                      <span>{settings.cyclingSpeedKmh} km/u</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={30}
                      step={1}
                      value={settings.cyclingSpeedKmh}
                      onChange={(e) =>
                        onUpdateSettings({ cyclingSpeedKmh: parseInt(e.target.value, 10) })
                      }
                      className="w-full accent-teal-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold text-slate-700">
                      <span>POI meldingsafstand</span>
                      <span>{settings.poiTriggerRadiusMeters} meter</span>
                    </div>
                    <input
                      type="range"
                      min={30}
                      max={120}
                      step={10}
                      value={settings.poiTriggerRadiusMeters}
                      onChange={(e) =>
                        onUpdateSettings({ poiTriggerRadiusMeters: parseInt(e.target.value, 10) })
                      }
                      className="w-full accent-teal-600"
                    />
                  </div>
                </div>

                <label className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200/80 cursor-pointer">
                  <div>
                    <div className="text-sm font-bold text-slate-900">Scherm wakker houden</div>
                    <div className="text-xs text-slate-500">Voorkom slaapstand tijdens navigeren</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.keepScreenAwake}
                    onChange={(e) => onUpdateSettings({ keepScreenAwake: e.target.checked })}
                    className="w-5 h-5 accent-teal-600 rounded"
                  />
                </label>
              </div>

              {/* Optional OpenRouteService Key */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Routing API (Optioneel)
                </h3>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    De app werkt standaard <strong>100% gratis zonder API-key</strong> via
                    OpenStreetMap (OSRM). Heb je een gratis{' '}
                    <span className="font-semibold">OpenRouteService</span> key? Vul die hier in
                    voor extra uitgebreide fiets-/wandelpaden.
                  </p>
                  <input
                    type="password"
                    placeholder="Optionele OpenRouteService API-key..."
                    value={settings.orsApiKey}
                    onChange={(e) => onUpdateSettings({ orsApiKey: e.target.value })}
                    className="w-full text-xs px-3 py-2 rounded-xl bg-white border border-slate-300 focus:outline-none focus:border-teal-600"
                  />
                </div>
              </div>

              {/* PWA Install Tip */}
              <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-200/80 flex gap-3">
                <Smartphone className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
                <div className="text-xs text-teal-900 space-y-1">
                  <div className="font-bold">Installeer als App op je telefoon</div>
                  <p className="text-teal-800 leading-relaxed">
                    <strong>iPhone (Safari):</strong> Tik op <em>Deel</em> →{' '}
                    <em>Zet op beginscherm</em>.<br />
                    <strong>Android (Chrome):</strong> Tik op het menu ⋮ →{' '}
                    <em>App installeren</em>.
                  </p>
                </div>
              </div>

              {/* App Version, Live Update Check & What's New Changelog */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Versie &amp; Updates
                </h3>
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-extrabold text-slate-900">
                        CityExplorer+ <span className="text-teal-600">v{APP_VERSION}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {updateInfo?.status === 'update-available'
                          ? `Nieuwe versie v${updateInfo.latestVersion} beschikbaar!`
                          : updateInfo?.status === 'up-to-date'
                            ? 'Je gebruikt de nieuwste versie ✓'
                            : 'Controleer online voor nieuwe updates'}
                      </div>
                    </div>

                    {updateInfo?.status === 'update-available' ? (
                      <button
                        type="button"
                        onClick={applyAppUpdate}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm cursor-pointer shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Nu updaten
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={checkingUpdate}
                        onClick={onCheckUpdate}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold cursor-pointer shrink-0 disabled:opacity-60"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`}
                        />
                        {checkingUpdate ? 'Checken...' : 'Check update'}
                      </button>
                    )}
                  </div>

                  {/* Highlights of newly available remote update if present */}
                  {updateInfo?.status === 'update-available' &&
                    updateInfo.highlights &&
                    updateInfo.highlights.length > 0 && (
                      <div className="bg-teal-50 border border-teal-200 rounded-xl p-2.5 space-y-1">
                        <div className="text-[11px] font-bold text-teal-900">
                          Nieuw in v{updateInfo.latestVersion}:
                        </div>
                        <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-teal-800">
                          {updateInfo.highlights.map((h, i) => (
                            <li key={i}>{h}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {/* Toggle full "Wat is er nieuw?" release notes */}
                  <button
                    type="button"
                    onClick={() => setShowChangelog((v) => !v)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white hover:bg-teal-50 border border-slate-200 text-xs font-bold text-teal-700 transition cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {showChangelog ? 'Verberg nieuwigheden' : 'Bekijk wat er nieuw is'}
                  </button>

                  {showChangelog && (
                    <div className="space-y-3 pt-1 border-t border-slate-200">
                      {CHANGELOG.map((rel) => (
                        <div key={rel.version} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-extrabold text-slate-900">
                              v{rel.version} · {rel.title}
                            </span>
                            <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                              {rel.date}
                            </span>
                          </div>
                          <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-600 leading-relaxed">
                            {rel.items.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : activeTab === 'saved' ? (
            <div className="space-y-2.5">
              {savedRoutes.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm px-4">
                  Nog geen opgeslagen trips. Kies een stad of vertrekpunt, stippel een lusroute uit
                  en tik op <strong>Trip opslaan &amp; offline klaarzetten</strong>!
                </div>
              ) : (
                savedRoutes.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onLoadSavedRoute(item.route);
                          onClose();
                        }}
                        className="text-left min-w-0 flex-1 cursor-pointer"
                      >
                        <div className="text-sm font-bold text-slate-900 truncate">
                          {item.route.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {item.cityName ? `${item.cityName} · ` : ''}
                          {formatDistance(item.route.actualDistanceMeters)} ·{' '}
                          {formatDuration(item.route.estimatedDurationSeconds)} ·{' '}
                          {item.route.pois.length} POIs
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSavedRoute(item.id)}
                        aria-label="Verwijder route"
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70">
                      {item.isOfflineReady ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Offline beschikbaar ({item.cachedTileCount ?? 0} tegels)
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onDownloadOfflineRoute(item)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 hover:underline cursor-pointer"
                        >
                          <CloudDownload className="w-3.5 h-3.5" />
                          Offline kaart downloaden
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          onLoadSavedRoute(item.route);
                          onClose();
                        }}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-teal-600 text-white hover:bg-teal-700 cursor-pointer"
                      >
                        Open trip
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {completedTrips.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm px-4">
                  Nog geen voltooide tochten in je dagboek. Start een wandeling of fietstocht om je
                  prestaties en ontdekte POIs vast te leggen!
                </div>
              ) : (
                completedTrips.map((trip) => (
                  <div
                    key={trip.id}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900 truncate">
                          {trip.routeName}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {new Date(trip.completedAt).toLocaleDateString('nl-NL', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}{' '}
                          · {formatDistance(trip.distanceMeters)} ·{' '}
                          {formatDuration(trip.durationSeconds)} ·{' '}
                          {trip.avgSpeedKmh.toFixed(1).replace('.', ',')} km/u
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteCompletedTrip(trip.id)}
                        aria-label="Verwijder uit dagboek"
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="text-[11px] font-semibold text-emerald-700">
                      ✓ {trip.discoveredPois.length}/{trip.totalPoisOnRoute} POIs ontdekt
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CloudDownload,
  Download,
  Loader2,
  MapPin,
  Navigation,
  Play,
  Plus,
  RefreshCw,
  Share2,
  Wind,
  X,
} from 'lucide-react';
import { INTEREST_MAP } from '../data/interests';
import { searchPlaces } from '../services/geocodingService';
import type { GeneratedRoute, POI, SavedRoute, SearchPlace, WeatherInfo } from '../types';
import { formatDistance, formatDuration } from '../utils/geo';
import { ElevationChart } from './ElevationChart';

interface RoutePreviewSheetProps {
  route: GeneratedRoute;
  weather: WeatherInfo | null;
  isGenerating: boolean;
  isOffline: boolean;
  savedEntry?: SavedRoute;
  offlineProgress: { pct: number; label: string } | null;
  onBack: () => void;
  onAlternativeLoop: () => void;
  onStartNavigation: () => void;
  onStartSimulation: () => void;
  onSaveOffline: () => void;
  onShareRoute: () => void;
  onExportGpx: () => void;
  onSelectPoi: (poi: POI) => void;
  onRemovePoi: (poiId: string) => void;
  onAddCustomStop: (place: SearchPlace) => void;
}

export function RoutePreviewSheet({
  route,
  weather,
  isGenerating,
  isOffline,
  savedEntry,
  offlineProgress,
  onBack,
  onAlternativeLoop,
  onStartNavigation,
  onStartSimulation,
  onSaveOffline,
  onShareRoute,
  onExportGpx,
  onSelectPoi,
  onRemovePoi,
  onAddCustomStop,
}: RoutePreviewSheetProps) {
  const isOfflineReady = Boolean(savedEntry?.isOfflineReady);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [addingStop, setAddingStop] = useState(false);
  const [stopQuery, setStopQuery] = useState('');
  const [stopResults, setStopResults] = useState<SearchPlace[]>([]);
  const [searchingStop, setSearchingStop] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!addingStop) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = stopQuery.trim();
    if (q.length < 2) {
      setStopResults([]);
      setSearchingStop(false);
      return;
    }
    setSearchingStop(true);
    debounceRef.current = window.setTimeout(async () => {
      const res = await searchPlaces(q, route.startLocation);
      setStopResults(res);
      setSearchingStop(false);
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [stopQuery, addingStop, route.startLocation]);

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center pointer-events-none px-2 sm:px-4 pb-2 sm:pb-4">
      <div className="pointer-events-auto w-full max-w-lg bg-white/96 backdrop-blur-md rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden pb-safe">
        <button
          type="button"
          onClick={() => setIsCollapsed((c) => !c)}
          aria-label={isCollapsed ? 'Klap route-overzicht open' : 'Klap route-overzicht dicht'}
          className="w-full flex items-center justify-center gap-2 pt-2 pb-1 px-4 cursor-pointer group"
        >
          <div className="w-10 h-1.5 rounded-full bg-slate-300 group-hover:bg-teal-500 transition" />
          <span className="text-[11px] font-bold text-teal-700 inline-flex items-center gap-0.5">
            {isCollapsed ? (
              <>
                Details <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                Kaart <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </span>
        </button>

        {isCollapsed ? (
          <div className="px-4 pb-3 pt-1 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-900 truncate">{route.name}</div>
              <div className="text-xs text-slate-500">
                {formatDistance(route.actualDistanceMeters)} ·{' '}
                {formatDuration(route.estimatedDurationSeconds)} · {route.pois.length} POIs
              </div>
            </div>
            <button
              type="button"
              onClick={onStartNavigation}
              className="shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-xs font-bold shadow-md cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5 fill-white" />
              Start
            </button>
          </div>
        ) : (
        <div className="p-4 pt-2 space-y-2.5 max-h-[68vh] overflow-y-auto no-scrollbar">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={onBack}
                aria-label="Terug naar planner"
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <h2 className="font-extrabold text-slate-900 text-base truncate">{route.name}</h2>
                <p className="text-xs text-slate-500">
                  Lusroute · {route.pois.length} stops
                  {route.surfacePreference === 'trails'
                    ? ' · 🥾 Incl. onverhard'
                    : route.surfacePreference === 'paved'
                      ? ' · 🛣️ Verhard'
                      : ''}
                  {savedEntry?.cityName ? ` · ${savedEntry.cityName}` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onShareRoute}
                title="Deel route via link of QR-code"
                className="p-2 rounded-xl bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-700 transition cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onExportGpx}
                title="Exporteer als GPX"
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Live Weather & Wind Pill */}
          {weather && (
            <div className="flex items-center justify-between bg-sky-50/90 border border-sky-200/80 rounded-2xl px-3 py-1.5 text-xs text-sky-950">
              <span className="font-bold flex items-center gap-1.5">
                <span>{weather.emoji}</span>
                <span>
                  {weather.temperatureC}°C · {weather.conditionLabel}
                </span>
              </span>
              <span className="flex items-center gap-2 font-semibold text-sky-800">
                <span className="flex items-center gap-0.5">
                  <Wind className="w-3.5 h-3.5" />
                  {weather.windSpeedKmh} km/u {weather.windDirectionLabel}
                </span>
                <span>🌧️ {weather.precipitationProbPct}%</span>
              </span>
            </div>
          )}

          {/* Offline Save / Download Banner */}
          {offlineProgress ? (
            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-teal-900">
                <span className="flex items-center gap-1.5 truncate">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="truncate">{offlineProgress.label}</span>
                </span>
                <span className="shrink-0 ml-2">{offlineProgress.pct}%</span>
              </div>
              <div className="w-full h-1.5 bg-teal-200/70 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-600 transition-all duration-200"
                  style={{ width: `${offlineProgress.pct}%` }}
                />
              </div>
            </div>
          ) : isOfflineReady ? (
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-2xl px-3 py-1.5 text-xs">
              <span className="flex items-center gap-1.5 font-bold text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                Opgeslagen &amp; offline klaar
              </span>
              <span className="text-[11px] text-emerald-700 font-medium">
                {savedEntry?.cachedTileCount ?? 0} tegels · {savedEntry?.cachedImageCount ?? 0} foto’s
              </span>
            </div>
          ) : (
            <button
              type="button"
              disabled={isOffline}
              onClick={onSaveOffline}
              className="w-full flex items-center justify-between bg-slate-100 hover:bg-teal-50 border border-slate-200 hover:border-teal-300 disabled:opacity-50 rounded-2xl px-3 py-2 text-xs font-bold text-slate-700 hover:text-teal-800 transition cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <CloudDownload className="w-4 h-4 text-teal-600" />
                <span>Trip opslaan &amp; offline klaarzetten</span>
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-teal-700">
                Opslaan
              </span>
            </button>
          )}

          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-2 bg-slate-50 border border-slate-200/80 rounded-2xl p-2 text-center">
            <div>
              <div className="text-base font-extrabold text-slate-900">
                {formatDistance(route.actualDistanceMeters)}
              </div>
              <div className="text-[11px] font-medium text-slate-500">Afstand</div>
            </div>
            <div className="border-x border-slate-200">
              <div className="text-base font-extrabold text-slate-900">
                {formatDuration(route.estimatedDurationSeconds)}
              </div>
              <div className="text-[11px] font-medium text-slate-500">Geschatte tijd</div>
            </div>
            <div>
              <div className="text-base font-extrabold text-teal-700">
                {route.elevationGainMeters !== undefined
                  ? `+${route.elevationGainMeters} m`
                  : `${route.pois.length} POIs`}
              </div>
              <div className="text-[11px] font-medium text-slate-500">
                {route.elevationGainMeters !== undefined ? 'Stijging' : 'Onderweg'}
              </div>
            </div>
          </div>

          {/* Elevation Profile Chart */}
          {route.elevationProfile && route.elevationProfile.length > 1 && (
            <ElevationChart
              profile={route.elevationProfile}
              gainMeters={route.elevationGainMeters}
            />
          )}

          {/* Highlights + Add Custom Stop / Remove POI */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Stops onderweg ({route.pois.length})
              </span>
              {!isOffline && (
                <button
                  type="button"
                  onClick={() => {
                    setAddingStop((v) => !v);
                    setStopQuery('');
                    setStopResults([]);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 hover:text-teal-800 bg-teal-50 px-2 py-0.5 rounded-lg cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  Eigen stop
                </button>
              )}
            </div>

            {addingStop && (
              <div className="bg-slate-50 border border-teal-300 rounded-2xl p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={stopQuery}
                    onChange={(e) => setStopQuery(e.target.value)}
                    placeholder="Zoek café, museum of adres als tussenstop..."
                    className="flex-1 text-xs bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
                  />
                  {searchingStop && <Loader2 className="w-4 h-4 text-teal-600 animate-spin" />}
                  <button
                    type="button"
                    onClick={() => setAddingStop(false)}
                    className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {stopResults.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-32 overflow-y-auto">
                    {stopResults.map((place) => (
                      <button
                        key={place.id}
                        type="button"
                        onClick={() => {
                          onAddCustomStop(place);
                          setAddingStop(false);
                          setStopQuery('');
                          setStopResults([]);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-teal-50 cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {place.name}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">{place.subtitle}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {route.pois.length > 0 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {route.pois.map((poi, idx) => {
                  const cfg = INTEREST_MAP[poi.category];
                  return (
                    <div
                      key={poi.id}
                      className="relative flex items-center gap-2 shrink-0 max-w-[225px] bg-white border border-slate-200 hover:border-teal-400 rounded-2xl p-2 pr-7 shadow-xs transition"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectPoi(poi)}
                        className="flex items-center gap-2 text-left min-w-0 cursor-pointer"
                      >
                        {poi.imageUrl ? (
                          <img
                            src={poi.imageUrl}
                            alt={poi.name}
                            className="w-10 h-10 rounded-xl object-cover shrink-0 bg-slate-100"
                          />
                        ) : (
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                            style={{ backgroundColor: cfg.color }}
                          >
                            {cfg.emoji}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {idx + 1}. {poi.name}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {poi.isCustomStop ? 'Eigen stop' : cfg.shortLabel}
                            {poi.routeDistanceMeters !== undefined
                              ? ` · ${formatDistance(poi.routeDistanceMeters)}`
                              : ''}
                          </div>
                        </div>
                      </button>

                      {!isOffline && route.pois.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onRemovePoi(poi.id)}
                          title="Verwijder deze stop en herbereken"
                          aria-label={`Verwijder ${poi.name}`}
                          className="absolute top-1.5 right-1.5 p-1 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={onStartNavigation}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-sm shadow-lg shadow-teal-600/25 transition cursor-pointer"
            >
              <Navigation className="w-4 h-4 fill-white" />
              <span>Start Navigatie</span>
            </button>

            <button
              type="button"
              onClick={onStartSimulation}
              title="Simuleer de route om navigatie & POI-popups direct te testen"
              className="flex items-center justify-center gap-1.5 py-3.5 px-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Simuleer</span>
            </button>

            <button
              type="button"
              disabled={isGenerating || isOffline}
              onClick={onAlternativeLoop}
              title="Genereer lus in andere richting"
              className="p-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer disabled:opacity-40"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

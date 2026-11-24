import {
  ArrowLeft,
  CheckCircle2,
  CloudDownload,
  Download,
  Loader2,
  Navigation,
  Play,
  RefreshCw,
} from 'lucide-react';
import { INTEREST_MAP } from '../data/interests';
import type { GeneratedRoute, POI, SavedRoute } from '../types';
import { formatDistance, formatDuration } from '../utils/geo';

interface RoutePreviewSheetProps {
  route: GeneratedRoute;
  isGenerating: boolean;
  isOffline: boolean;
  savedEntry?: SavedRoute;
  offlineProgress: { pct: number; label: string } | null;
  onBack: () => void;
  onAlternativeLoop: () => void;
  onStartNavigation: () => void;
  onStartSimulation: () => void;
  onSaveOffline: () => void;
  onExportGpx: () => void;
  onSelectPoi: (poi: POI) => void;
}

export function RoutePreviewSheet({
  route,
  isGenerating,
  isOffline,
  savedEntry,
  offlineProgress,
  onBack,
  onAlternativeLoop,
  onStartNavigation,
  onStartSimulation,
  onSaveOffline,
  onExportGpx,
  onSelectPoi,
}: RoutePreviewSheetProps) {
  const isOfflineReady = Boolean(savedEntry?.isOfflineReady);

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center pointer-events-none px-2 sm:px-4 pb-2 sm:pb-4">
      <div className="pointer-events-auto w-full max-w-lg bg-white/96 backdrop-blur-md rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden pb-safe">
        <div className="p-4 space-y-3">
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
                  Lusroute · {route.pois.length} bezienswaardigheden
                  {savedEntry?.cityName ? ` · ${savedEntry.cityName}` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
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
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-2xl px-3 py-2 text-xs">
              <span className="flex items-center gap-1.5 font-bold text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                Opgeslagen &amp; offline klaar
              </span>
              <span className="text-[11px] text-emerald-700 font-medium">
                {savedEntry?.cachedTileCount ?? 0} kaarttegels · {savedEntry?.cachedImageCount ?? 0}{' '}
                foto’s
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
                <span>Trip opslaan &amp; offline klaarzetten (kaart + POIs)</span>
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-teal-700">
                Opslaan
              </span>
            </button>
          )}

          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-2 bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5 text-center">
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
              <div className="text-base font-extrabold text-teal-700">{route.pois.length} POIs</div>
              <div className="text-[11px] font-medium text-slate-500">Onderweg</div>
            </div>
          </div>

          {/* Horizontally scrollable POI highlights */}
          {route.pois.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Highlights op jouw route (tik voor info)
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {route.pois.map((poi, idx) => {
                  const cfg = INTEREST_MAP[poi.category];
                  return (
                    <button
                      key={poi.id}
                      type="button"
                      onClick={() => onSelectPoi(poi)}
                      className="flex items-center gap-2.5 shrink-0 max-w-[220px] bg-white border border-slate-200 hover:border-teal-400 rounded-2xl p-2 text-left shadow-xs transition cursor-pointer"
                    >
                      {poi.imageUrl ? (
                        <img
                          src={poi.imageUrl}
                          alt={poi.name}
                          className="w-11 h-11 rounded-xl object-cover shrink-0 bg-slate-100"
                        />
                      ) : (
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                          style={{ backgroundColor: cfg.color }}
                        >
                          {cfg.emoji}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {idx + 1}. {poi.name}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{cfg.shortLabel}</div>
                        {poi.routeDistanceMeters !== undefined && (
                          <div className="text-[10px] font-semibold text-teal-700">
                            Op {formatDistance(poi.routeDistanceMeters)}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2">
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
      </div>
    </div>
  );
}

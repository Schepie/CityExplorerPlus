import {
  AlertTriangle,
  ArrowUp,
  Bell,
  BellOff,
  CheckCircle2,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { AppSettings, GeneratedRoute, ManeuverType, NavigationStatus } from '../types';
import { formatDistance, formatDuration, formatEta } from '../utils/geo';

interface NavigationOverlayProps {
  route: GeneratedRoute;
  navState: NavigationStatus;
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onOpenSettings: () => void;
  onStop: () => void;
  onSetSimSpeed: (mult: number) => void;
}

function ManeuverIcon({ type }: { type: ManeuverType }) {
  const cls = 'w-9 h-9 text-white shrink-0';
  switch (type) {
    case 'turn-left':
    case 'turn-slight-left':
    case 'turn-sharp-left':
    case 'fork-left':
      return <CornerUpLeft className={cls} />;
    case 'turn-right':
    case 'turn-slight-right':
    case 'turn-sharp-right':
    case 'fork-right':
      return <CornerUpRight className={cls} />;
    case 'roundabout':
      return <RotateCw className={cls} />;
    case 'uturn':
      return <RotateCcw className={cls} />;
    case 'arrive':
      return <Flag className={cls} />;
    default:
      return <ArrowUp className={cls} />;
  }
}

export function NavigationOverlay({
  route,
  navState,
  settings,
  onUpdateSettings,
  onOpenSettings,
  onStop,
  onSetSimSpeed,
}: NavigationOverlayProps) {
  const currentStep = route.steps[navState.currentStepIndex] ?? route.steps[route.steps.length - 1];
  const nextStep = route.steps[navState.currentStepIndex + 1];

  return (
    <>
      {/* TOP TURN-BY-TURN BANNER */}
      <div className="absolute inset-x-0 top-0 z-30 flex justify-center pointer-events-none px-2 sm:px-4 pt-safe">
        <div className="pointer-events-auto w-full max-w-lg space-y-2">
          {navState.hasArrived ? (
            <div className="bg-emerald-600 text-white rounded-3xl p-4 shadow-2xl flex items-center gap-3">
              <CheckCircle2 className="w-10 h-10 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-lg font-extrabold">Lusroute voltooid!</div>
                <div className="text-xs text-emerald-100">
                  Je hebt {formatDistance(route.actualDistanceMeters)} afgelegd en{' '}
                  {navState.triggeredPoiIds.length} POIs bezocht.
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/95 backdrop-blur-md text-white rounded-3xl shadow-2xl border border-slate-700/80 overflow-hidden">
              <div className="flex items-center gap-3.5 px-4 py-3.5">
                <div className="w-14 h-14 rounded-2xl bg-teal-600 flex items-center justify-center shadow-inner shrink-0">
                  <ManeuverIcon type={currentStep?.maneuverType ?? 'straight'} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-2xl font-black tracking-tight leading-none text-teal-300">
                    {formatDistance(navState.distanceToNextTurnMeters)}
                  </div>
                  <div className="text-sm sm:text-base font-bold leading-snug mt-1 line-clamp-2">
                    {currentStep?.instruction || 'Volg de route'}
                  </div>
                </div>
              </div>
              {nextStep && (
                <div className="bg-slate-800/90 px-4 py-1.5 text-xs text-slate-300 flex items-center justify-between">
                  <span className="truncate">Daarna: {nextStep.instruction}</span>
                  <span className="shrink-0 ml-2 font-semibold text-teal-300">
                    POIs: {navState.triggeredPoiIds.length}/{route.pois.length}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Off-route warning */}
          {!navState.isSimulating && navState.offRouteMeters > 45 && (
            <div className="bg-amber-500 text-slate-950 rounded-2xl px-3.5 py-2 shadow-lg flex items-center gap-2 text-xs font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Je wijkt {Math.round(navState.offRouteMeters)} m af van de lusroute</span>
            </div>
          )}

          {/* Simulation speed bar */}
          {navState.isSimulating && !navState.hasArrived && (
            <div className="bg-slate-900/85 backdrop-blur-md text-white rounded-2xl px-3 py-1.5 shadow-lg flex items-center justify-between text-xs">
              <span className="font-semibold text-amber-300">GPS Simulatie actief</span>
              <div className="flex items-center gap-1">
                {[4, 8, 20].map((mult) => (
                  <button
                    key={mult}
                    type="button"
                    onClick={() => onSetSimSpeed(mult)}
                    className={`px-2 py-0.5 rounded-lg font-bold transition cursor-pointer ${
                      navState.simulationSpeedMultiplier === mult
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                    }`}
                  >
                    {mult}x
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM NAVIGATION HUD */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center pointer-events-none px-2 sm:px-4 pb-2 sm:pb-4">
        <div className="pointer-events-auto w-full max-w-lg bg-slate-900/95 backdrop-blur-md text-white rounded-3xl shadow-2xl border border-slate-700/80 p-3.5 pb-safe space-y-3">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-lg font-black text-white">
                {formatDistance(navState.distanceRemainingMeters)}
              </div>
              <div className="text-[11px] text-slate-400">Resterend</div>
            </div>
            <div className="border-x border-slate-700">
              <div className="text-lg font-black text-teal-400">
                {formatDuration(navState.etaSeconds)}
              </div>
              <div className="text-[11px] text-slate-400">Tijd</div>
            </div>
            <div>
              <div className="text-lg font-black text-white">{formatEta(navState.etaSeconds)}</div>
              <div className="text-[11px] text-slate-400">Aankomst</div>
            </div>
          </div>

          {/* Quick Controls */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onUpdateSettings({ turnByTurnVoice: !settings.turnByTurnVoice })}
              className={`flex-1 flex flex-col items-center py-2 rounded-2xl text-[11px] font-semibold transition cursor-pointer ${
                settings.turnByTurnVoice
                  ? 'bg-teal-600/25 text-teal-300 border border-teal-500/40'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {settings.turnByTurnVoice ? (
                <Volume2 className="w-4 h-4 mb-0.5" />
              ) : (
                <VolumeX className="w-4 h-4 mb-0.5" />
              )}
              Stem
            </button>

            <button
              type="button"
              onClick={() => onUpdateSettings({ poiSoundEnabled: !settings.poiSoundEnabled })}
              className={`flex-1 flex flex-col items-center py-2 rounded-2xl text-[11px] font-semibold transition cursor-pointer ${
                settings.poiSoundEnabled
                  ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {settings.poiSoundEnabled ? (
                <Bell className="w-4 h-4 mb-0.5" />
              ) : (
                <BellOff className="w-4 h-4 mb-0.5" />
              )}
              POI-toon
            </button>

            <button
              type="button"
              onClick={() => onUpdateSettings({ poiAutoReadAloud: !settings.poiAutoReadAloud })}
              className={`flex-1 flex flex-col items-center py-2 rounded-2xl text-[11px] font-semibold transition cursor-pointer ${
                settings.poiAutoReadAloud
                  ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              <Volume2 className="w-4 h-4 mb-0.5" />
              Voorlezen
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Opties"
              className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onStop}
              className="flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-lg transition cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-white" />
              Stop
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

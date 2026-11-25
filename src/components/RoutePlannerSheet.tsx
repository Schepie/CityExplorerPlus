import { useEffect, useRef, useState } from 'react';
import {
  Bike,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Crosshair,
  Footprints,
  Loader2,
  MapPin,
  Ruler,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { INTERESTS } from '../data/interests';
import { searchPlaces } from '../services/geocodingService';
import type {
  ActivityMode,
  InterestId,
  LatLng,
  SearchPlace,
  SurfacePreference,
  TargetType,
} from '../types';
import { formatDuration } from '../utils/geo';

interface RoutePlannerSheetProps {
  activity: ActivityMode;
  onActivityChange: (a: ActivityMode) => void;
  surfacePreference: SurfacePreference;
  onSurfacePreferenceChange: (s: SurfacePreference) => void;
  targetType: TargetType;
  onTargetTypeChange: (t: TargetType) => void;
  distanceKm: number;
  onDistanceKmChange: (km: number) => void;
  durationMin: number;
  onDurationMinChange: (min: number) => void;
  selectedInterests: InterestId[];
  onToggleInterest: (id: InterestId) => void;
  speedKmh: number;
  startLocation: LatLng;
  locationLabel: string;
  gpsStatus: 'locating' | 'ready' | 'manual';
  isOffline: boolean;
  onRequestGps: () => void;
  onSelectPlace: (place: SearchPlace) => void;
  onOpenSavedTrips: () => void;
  savedTripsCount: number;
  isGenerating: boolean;
  progressText: string;
  errorText: string | null;
  onGenerate: () => void;
}

export function RoutePlannerSheet({
  activity,
  onActivityChange,
  surfacePreference,
  onSurfacePreferenceChange,
  targetType,
  onTargetTypeChange,
  distanceKm,
  onDistanceKmChange,
  durationMin,
  onDurationMinChange,
  selectedInterests,
  onToggleInterest,
  speedKmh,
  startLocation,
  locationLabel,
  gpsStatus,
  isOffline,
  onRequestGps,
  onSelectPlace,
  onOpenSavedTrips,
  savedTripsCount,
  isGenerating,
  progressText,
  errorText,
  onGenerate,
}: RoutePlannerSheetProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = window.setTimeout(async () => {
      const results = await searchPlaces(trimmed, startLocation);
      setSearchResults(results);
      setIsSearching(false);
      setShowDropdown(true);
    }, 320);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [searchQuery, startLocation]);

  const minKm = activity === 'walking' ? 1.5 : 4;
  const maxKm = activity === 'walking' ? 15 : 45;
  const stepKm = activity === 'walking' ? 0.5 : 1;

  const computedKm =
    targetType === 'distance'
      ? distanceKm
      : Math.max(1, Number(((durationMin / 60) * speedKmh).toFixed(1)));
  const computedDurationSec =
    targetType === 'duration' ? durationMin * 60 : Math.round((distanceKm / speedKmh) * 3600);

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center pointer-events-none px-2 sm:px-4 pb-2 sm:pb-4">
      <div className="pointer-events-auto w-full max-w-lg bg-white/96 backdrop-blur-md rounded-3xl shadow-2xl border border-slate-200/80 overflow-visible pb-safe transition-all duration-200">
        {/* Clickable Collapse / Expand Header Bar */}
        <button
          type="button"
          onClick={() => setIsCollapsed((c) => !c)}
          aria-label={isCollapsed ? 'Klap routeplanner open' : 'Klap routeplanner dicht om kaart te zien'}
          className="w-full flex flex-col items-center pt-2 pb-1.5 px-4 cursor-pointer group"
        >
          <div className="w-10 h-1.5 rounded-full bg-slate-300 group-hover:bg-teal-500 transition" />
          <div className="w-full flex items-center justify-between mt-1">
            <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1 truncate">
              {isCollapsed ? (
                <>
                  <MapPin className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span className="truncate text-slate-800">{locationLabel}</span>
                </>
              ) : (
                'Klap dicht om vertrekpunt op kaart aan te duiden'
              )}
            </span>
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-teal-700 shrink-0 ml-2">
              {isCollapsed ? (
                <>
                  Openen <ChevronUp className="w-4 h-4" />
                </>
              ) : (
                <>
                  Kaart <ChevronDown className="w-4 h-4" />
                </>
              )}
            </span>
          </div>
        </button>

        {isCollapsed ? (
          <div className="px-4 pb-3 pt-0.5 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500 leading-tight">
              Tik op de kaart of sleep de groene pin voor jouw startpunt.
            </span>
            <button
              type="button"
              disabled={isGenerating || isOffline}
              onClick={onGenerate}
              className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-xs font-bold shadow-md disabled:opacity-60 cursor-pointer"
            >
              {isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Compass className="w-3.5 h-3.5" />
              )}
              <span>Stippel uit</span>
            </button>
          </div>
        ) : (
        <div className="px-4 pb-4 space-y-3 max-h-[68vh] overflow-y-auto no-scrollbar">
          {/* City / Starting Point Search Box */}
          <div className="relative space-y-1">
            <div className="flex items-center gap-1.5 bg-slate-100/95 border border-slate-200/90 focus-within:border-teal-500 focus-within:bg-white rounded-2xl px-2.5 py-1.5 transition">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Zoek stad, adres of vertrekpunt..."
                disabled={isOffline}
                className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none py-1 disabled:opacity-50"
              />
              {isSearching && <Loader2 className="w-4 h-4 text-teal-600 animate-spin shrink-0" />}
              {searchQuery && !isSearching && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setShowDropdown(false);
                  }}
                  aria-label="Wis zoekveld"
                  className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setShowDropdown(false);
                  onRequestGps();
                }}
                title="Gebruik mijn huidige GPS-locatie"
                className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition cursor-pointer shrink-0 ${
                  gpsStatus === 'ready'
                    ? 'bg-teal-600 text-white'
                    : 'bg-white text-slate-700 shadow-xs hover:bg-teal-50 border border-slate-200'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>{gpsStatus === 'locating' ? 'GPS...' : 'GPS'}</span>
              </button>
            </div>

            {/* Active Start Point Status Line */}
            <div className="flex items-center justify-between px-1 text-[11px] text-slate-500">
              <span className="flex items-center gap-1 truncate font-medium text-slate-700">
                <MapPin className="w-3 h-3 text-teal-600 shrink-0" />
                <span className="truncate">{locationLabel}</span>
              </span>
              <button
                type="button"
                onClick={() => setIsCollapsed(true)}
                className="shrink-0 ml-2 text-[11px] font-bold text-teal-700 hover:underline cursor-pointer"
              >
                Kies op kaart
              </button>
            </div>

            {/* Search Autocomplete Results */}
            {showDropdown && searchResults.length > 0 && (
              <div className="mt-1 bg-white rounded-2xl shadow-xl border border-slate-200 divide-y divide-slate-100 max-h-48 overflow-y-auto z-30">
                {searchResults.map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => {
                      onSelectPlace(place);
                      setSearchQuery('');
                      setSearchResults([]);
                      setShowDropdown(false);
                    }}
                    className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-teal-50/70 transition cursor-pointer"
                  >
                    <MapPin className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">{place.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">{place.subtitle}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Offline Notice Banner inside Planner */}
          {isOffline && (
            <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2">
              <span className="text-xs font-semibold text-amber-900">
                Je bent offline. Nieuwe routes berekenen vereist internet, maar opgeslagen trips werken volledig offline!
              </span>
              {savedTripsCount > 0 && (
                <button
                  type="button"
                  onClick={onOpenSavedTrips}
                  className="shrink-0 px-2.5 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-bold cursor-pointer"
                >
                  Mijn Trips
                </button>
              )}
            </div>
          )}

          {/* Activity Switcher: Wandelen vs Fietsen */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => onActivityChange('walking')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer ${
                activity === 'walking'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Footprints className="w-4 h-4" />
              Wandelen
            </button>
            <button
              type="button"
              onClick={() => onActivityChange('cycling')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer ${
                activity === 'cycling'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bike className="w-4 h-4" />
              Fietsen
            </button>
          </div>

          {/* Surface / Trail Preference: Unpaved Trails vs Balanced vs Paved */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-2xl">
            {(
              [
                {
                  id: 'trails',
                  label: activity === 'walking' ? '🥾 Onverhard' : '🚵 Gravel/Bos',
                  title: 'Voorkeur voor wandelpaden, bospaden en onverharde wegen',
                },
                {
                  id: 'balanced',
                  label: '⚖️ Mix',
                  title: 'Combinatie van verharde en onverharde paden',
                },
                {
                  id: 'paved',
                  label: '🛣️ Verhard',
                  title: 'Vooral verharde wegen en fietspaden',
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                title={opt.title}
                onClick={() => onSurfacePreferenceChange(opt.id)}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                  surfacePreference === opt.id
                    ? 'bg-white text-teal-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Distance / Duration selector */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="inline-flex bg-slate-200/80 rounded-xl p-0.5">
                <button
                  type="button"
                  onClick={() => onTargetTypeChange('distance')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    targetType === 'distance' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  <Ruler className="w-3.5 h-3.5" />
                  Afstand
                </button>
                <button
                  type="button"
                  onClick={() => onTargetTypeChange('duration')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    targetType === 'duration' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  Tijd
                </button>
              </div>

              <div className="text-right">
                <span className="text-lg font-extrabold text-slate-900">
                  {targetType === 'distance'
                    ? `${distanceKm.toFixed(1).replace('.', ',')} km`
                    : formatDuration(durationMin * 60)}
                </span>
                <span className="block text-[11px] text-slate-500">
                  {targetType === 'distance'
                    ? `≈ ${formatDuration(computedDurationSec)}`
                    : `≈ ${computedKm.toFixed(1).replace('.', ',')} km`}
                </span>
              </div>
            </div>

            {targetType === 'distance' ? (
              <input
                type="range"
                min={minKm}
                max={maxKm}
                step={stepKm}
                value={Math.min(maxKm, Math.max(minKm, distanceKm))}
                onChange={(e) => onDistanceKmChange(parseFloat(e.target.value))}
                className="w-full accent-teal-600 h-2 bg-slate-200 rounded-lg cursor-pointer"
              />
            ) : (
              <input
                type="range"
                min={20}
                max={180}
                step={10}
                value={durationMin}
                onChange={(e) => onDurationMinChange(parseInt(e.target.value, 10))}
                className="w-full accent-teal-600 h-2 bg-slate-200 rounded-lg cursor-pointer"
              />
            )}
          </div>

          {/* Interests chips */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Jouw interesses
              </span>
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                {selectedInterests.length === 0
                  ? 'Standaard: Toeristische attracties'
                  : `${selectedInterests.length} gekozen`}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {INTERESTS.map((item) => {
                const active = selectedInterests.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onToggleInterest(item.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition cursor-pointer ${
                      active
                        ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-teal-400'
                    }`}
                  >
                    <span>{item.emoji}</span>
                    <span>{item.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {errorText && (
            <div className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              {errorText}
            </div>
          )}

          {/* Primary CTA */}
          <button
            type="button"
            disabled={isGenerating || isOffline}
            onClick={onGenerate}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-[0.99] disabled:opacity-60 text-white font-bold text-base shadow-lg shadow-teal-600/25 transition cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="truncate text-sm">{progressText || 'Route berekenen...'}</span>
              </>
            ) : (
              <>
                <Compass className="w-5 h-5" />
                <span>Stippel lusroute uit</span>
              </>
            )}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}

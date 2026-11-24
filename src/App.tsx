import { useCallback, useEffect, useState } from 'react';
import { Bookmark, Compass, Crosshair, Layers, Moon, Settings, Sun, WifiOff } from 'lucide-react';
import { MapView } from './components/MapView';
import { NavigationOverlay } from './components/NavigationOverlay';
import { PoiPopupModal } from './components/PoiPopupModal';
import { RoutePlannerSheet } from './components/RoutePlannerSheet';
import { RoutePreviewSheet } from './components/RoutePreviewSheet';
import { SettingsDrawer } from './components/SettingsDrawer';
import { ShareRouteModal } from './components/ShareRouteModal';
import { TripSummaryModal } from './components/TripSummaryModal';
import { APP_VERSION } from './data/changelog';
import { useNavigation } from './hooks/useNavigation';
import { audioService } from './services/audioService';
import { reverseGeocode } from './services/geocodingService';
import {
  addCompletedTrip,
  getAllCompletedTrips,
  getAllSavedRoutes,
  prepareRouteForOffline,
  removeCompletedTrip,
  removeSavedRoute,
} from './services/offlineService';
import { fetchNearbyPitstops } from './services/pitstopService';
import { generateLoopRoute, rebuildRouteWithPois } from './services/routingService';
import { loadSettings, saveSettings } from './services/storageService';
import {
  applyAppUpdate,
  checkForAppUpdate,
  type UpdateCheckResult,
} from './services/updateService';
import { fetchWeatherAt } from './services/weatherService';
import type {
  ActivityMode,
  AppSettings,
  CompletedTrip,
  GeneratedRoute,
  InterestId,
  LatLng,
  MapStyleMode,
  Pitstop,
  PitstopType,
  POI,
  SavedRoute,
  SearchPlace,
  TargetType,
  WeatherInfo,
} from './types';
import { generateGpx } from './utils/geo';
import { parseShareFromUrl } from './utils/shareRoute';

const FALLBACK_POS: LatLng = { lat: 52.0907, lng: 5.1214 };

export function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [completedTrips, setCompletedTrips] = useState<CompletedTrip[]>([]);
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  // Location state
  const [startLocation, setStartLocation] = useState<LatLng>(FALLBACK_POS);
  const [locationLabel, setLocationLabel] = useState<string>('Locatie bepalen...');
  const [selectedCityName, setSelectedCityName] = useState<string | undefined>('Utrecht');
  const [gpsStatus, setGpsStatus] = useState<'locating' | 'ready' | 'manual'>('locating');
  const [recenterSignal, setRecenterSignal] = useState(0);

  // Planner form state
  const [activity, setActivity] = useState<ActivityMode>('walking');
  const [targetType, setTargetType] = useState<TargetType>('distance');
  const [distanceKm, setDistanceKm] = useState<number>(4.5);
  const [durationMin, setDurationMin] = useState<number>(60);
  const [selectedInterests, setSelectedInterests] = useState<InterestId[]>([]);

  // Route, Map & UI state
  const [mapStyle, setMapStyle] = useState<MapStyleMode>('standard');
  const [is3D, setIs3D] = useState<boolean>(false);
  const [route, setRoute] = useState<GeneratedRoute | null>(null);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [pitstops, setPitstops] = useState<Pitstop[]>([]);
  const [loadingPitstops, setLoadingPitstops] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [inspectedPoi, setInspectedPoi] = useState<POI | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [summaryTrip, setSummaryTrip] = useState<CompletedTrip | null>(null);
  const [drawerState, setDrawerState] = useState<{
    open: boolean;
    tab: 'options' | 'saved' | 'diary';
  }>({
    open: false,
    tab: 'options',
  });
  const [offlineProgress, setOfflineProgress] = useState<{ pct: number; label: string } | null>(
    null
  );
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      const res = await checkForAppUpdate();
      setUpdateInfo(res);
    } finally {
      setCheckingUpdate(false);
    }
  }, []);

  // Sync user's selected voice region (Vlaams / Nederlands), gender & device voice into audioService
  useEffect(() => {
    audioService.configureVoice({
      voiceRegion: settings.voiceRegion,
      voiceGender: settings.voiceGender,
      preferredVoiceURI: settings.preferredVoiceURI,
    });
  }, [settings.voiceRegion, settings.voiceGender, settings.preferredVoiceURI]);

  // Automatically check for app updates on startup
  useEffect(() => {
    handleCheckUpdate();
  }, [handleCheckUpdate]);

  const {
    navState,
    isRerouting,
    startNavigation,
    stopNavigation,
    dismissPoiPopup,
    openPoiPopup,
    setSimulationSpeed,
    triggerReroute,
    getElapsedSeconds,
  } = useNavigation({
    route,
    settings,
    onRouteReplaced: (newRoute) => setRoute(newRoute),
  });

  // Load saved routes & completed trips diary from IndexedDB
  useEffect(() => {
    getAllSavedRoutes().then(setSavedRoutes);
    getAllCompletedTrips().then(setCompletedTrips);
  }, []);

  // Track online/offline status
  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Fetch live weather when previewing a route
  useEffect(() => {
    if (!route || isOffline) {
      setWeather(null);
      return;
    }
    fetchWeatherAt(route.startLocation).then(setWeather);
  }, [route?.id, isOffline]);

  // Restore a shared route link (?share=...) automatically on mount
  useEffect(() => {
    const shared = parseShareFromUrl();
    if (!shared) return;

    setStartLocation(shared.start);
    setActivity(shared.activity);
    setDistanceKm(shared.targetDistanceKm);
    setSelectedInterests(shared.interests);
    if (shared.cityName) {
      setSelectedCityName(shared.cityName);
      setLocationLabel(shared.cityName);
    }
    setGpsStatus('manual');

    // Clean query string so refreshing doesn't re-trigger
    window.history.replaceState({}, '', window.location.pathname);

    const spd =
      shared.activity === 'walking' ? settings.walkingSpeedKmh : settings.cyclingSpeedKmh;
    setIsGenerating(true);
    generateLoopRoute({
      start: shared.start,
      activity: shared.activity,
      targetDistanceKm: shared.targetDistanceKm,
      selectedInterests: shared.interests,
      sectorIndex: shared.sectorIndex,
      speedKmh: spd,
      orsApiKey: settings.orsApiKey,
      onProgress: setProgressText,
    })
      .then((gen) => {
        if (shared.cityName) {
          const prefix = shared.activity === 'walking' ? 'Wandellus' : 'Fietslus';
          gen.name = gen.name.replace(prefix, `${prefix} ${shared.cityName}`);
        }
        setRoute(gen);
      })
      .catch(() => {})
      .finally(() => {
        setIsGenerating(false);
        setProgressText('');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpdateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const requestGps = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGpsStatus('manual');
      setLocationLabel('Utrecht Centrum');
      setSelectedCityName('Utrecht');
      return;
    }
    setGpsStatus('locating');
    setLocationLabel('GPS-locatie zoeken...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setStartLocation(coords);
        setGpsStatus('ready');
        setLocationLabel('Huidige GPS-locatie');
        setRecenterSignal((n) => n + 1);
        const rev = await reverseGeocode(coords);
        if (rev.city) setSelectedCityName(rev.city);
        if (rev.label && !rev.label.startsWith('Startpunt')) {
          setLocationLabel(`GPS: ${rev.label}`);
        }
      },
      () => {
        setGpsStatus('manual');
        setLocationLabel('Utrecht Centrum');
        setSelectedCityName('Utrecht');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }, []);

  useEffect(() => {
    if (!parseShareFromUrl()) {
      requestGps();
    }
  }, [requestGps]);

  const handlePickManualStart = useCallback(async (pos: LatLng) => {
    setStartLocation(pos);
    setGpsStatus('manual');
    setSelectedCityName(undefined);
    setLocationLabel(`Vertrekpunt (${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)})`);
    const rev = await reverseGeocode(pos);
    setLocationLabel(rev.label);
    if (rev.city) setSelectedCityName(rev.city);
  }, []);

  const handleSelectPlace = useCallback((place: SearchPlace) => {
    setStartLocation({ lat: place.lat, lng: place.lng });
    setGpsStatus('manual');
    setLocationLabel(place.subtitle ? `${place.name}, ${place.subtitle.split(',')[0]}` : place.name);
    setSelectedCityName(place.city || place.name);
    setRecenterSignal((n) => n + 1);
  }, []);

  const handleActivityChange = (next: ActivityMode) => {
    setActivity(next);
    if (next === 'cycling' && distanceKm < 8) {
      setDistanceKm(15);
    } else if (next === 'walking' && distanceKm > 15) {
      setDistanceKm(5);
    }
  };

  const handleToggleInterest = (id: InterestId) => {
    setSelectedInterests((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const speedKmh = activity === 'walking' ? settings.walkingSpeedKmh : settings.cyclingSpeedKmh;

  const runRouteGeneration = async (sectorIndex: number) => {
    setIsGenerating(true);
    setErrorText(null);
    setProgressText('Lusroute voorbereiden...');

    const effectiveDistanceKm =
      targetType === 'distance'
        ? distanceKm
        : Math.max(1.2, Number(((durationMin / 60) * speedKmh).toFixed(1)));

    try {
      const generated = await generateLoopRoute({
        start: startLocation,
        activity,
        targetDistanceKm: effectiveDistanceKm,
        selectedInterests,
        sectorIndex,
        speedKmh,
        orsApiKey: settings.orsApiKey,
        onProgress: setProgressText,
      });

      if (selectedCityName) {
        const prefix = activity === 'walking' ? 'Wandellus' : 'Fietslus';
        generated.name = generated.name.replace(prefix, `${prefix} ${selectedCityName}`);
      }

      setRoute(generated);
      setInspectedPoi(null);
    } catch (err) {
      setErrorText(
        err instanceof Error
          ? err.message
          : 'Er ging iets mis bij het berekenen van de route. Probeer het opnieuw.'
      );
    } finally {
      setIsGenerating(false);
      setProgressText('');
    }
  };

  const handleRemovePoi = async (poiId: string) => {
    if (!route || route.pois.length <= 1) return;
    const remaining = route.pois.filter((p) => p.id !== poiId);
    setIsGenerating(true);
    try {
      const rebuilt = await rebuildRouteWithPois(route, remaining, speedKmh, settings.orsApiKey);
      setRoute(rebuilt);
    } catch {
      // Keep previous route if network error
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddCustomStop = async (place: SearchPlace) => {
    if (!route) return;
    const customPoi: POI = {
      id: `custom-${Date.now()}`,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      category: 'toerisme',
      categoryLabel: 'Eigen tussenstop',
      description: `${place.name}${place.subtitle ? ` (${place.subtitle})` : ''} — jouw zelf toegevoegde tussenstop.`,
      descriptionLang: 'nl',
      tags: {},
      score: 100,
      isCustomStop: true,
    };
    setIsGenerating(true);
    try {
      const rebuilt = await rebuildRouteWithPois(
        route,
        [...route.pois, customPoi],
        speedKmh,
        settings.orsApiKey
      );
      setRoute(rebuilt);
    } catch {
      // Ignore error
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportGpx = () => {
    if (!route) return;
    const gpx = generateGpx(route);
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${route.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveOffline = async (targetRoute?: GeneratedRoute, cityOverride?: string) => {
    const r = targetRoute ?? route;
    if (!r) return;
    setOfflineProgress({ pct: 5, label: 'Starten met offline opslaan...' });
    try {
      await prepareRouteForOffline(r, cityOverride ?? selectedCityName, (pct, label) => {
        setOfflineProgress({ pct, label });
      });
      const updated = await getAllSavedRoutes();
      setSavedRoutes(updated);
    } finally {
      window.setTimeout(() => setOfflineProgress(null), 600);
    }
  };

  const handleStopNavigationWithSummary = async () => {
    if (route && navState && navState.distanceCoveredMeters > 80) {
      const elapsedSec = getElapsedSeconds();
      const distKm = navState.distanceCoveredMeters / 1000;
      const avgSpeed = elapsedSec > 0 ? Math.min(45, (distKm / elapsedSec) * 3600) : speedKmh;
      const triggeredSet = new Set(navState.triggeredPoiIds);

      const trip: CompletedTrip = {
        id: `trip-${Date.now()}`,
        routeName: route.name,
        cityName: selectedCityName,
        activity: route.activity,
        completedAt: new Date().toISOString(),
        distanceMeters: Math.round(navState.distanceCoveredMeters),
        durationSeconds: elapsedSec,
        avgSpeedKmh: Number(avgSpeed.toFixed(1)),
        discoveredPois: route.pois
          .filter((p) => triggeredSet.has(p.id))
          .map((p) => ({ id: p.id, name: p.name, category: p.category })),
        totalPoisOnRoute: route.pois.length,
      };
      const updatedTrips = await addCompletedTrip(trip);
      setCompletedTrips(updatedTrips);
      setSummaryTrip(trip);
    }
    setPitstops([]);
    setIs3D(false);
    stopNavigation();
  };

  const handleSearchPitstops = async (type: PitstopType) => {
    const center = navState?.currentPosition ?? startLocation;
    setLoadingPitstops(true);
    try {
      const found = await fetchNearbyPitstops(center, type, 900);
      setPitstops(found);
    } finally {
      setLoadingPitstops(false);
    }
  };

  const cycleMapStyle = () => {
    setMapStyle((prev) =>
      prev === 'standard' ? 'dark' : prev === 'dark' ? 'satellite' : 'standard'
    );
  };

  const mapStyleLabel =
    mapStyle === 'standard' ? 'Kaart' : mapStyle === 'dark' ? 'Nacht' : 'Satelliet';

  const handleSelectPoi = (poi: POI) => {
    if (navState?.isActive) {
      openPoiPopup(poi);
    } else {
      setInspectedPoi(poi);
    }
  };

  const activePopupPoi = navState?.isActive ? navState.activePoiPopup : inspectedPoi;
  const savedEntry = route ? savedRoutes.find((s) => s.id === route.id) : undefined;

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-900">
      {/* Full-screen MapLibre GL Map */}
      <MapView
        center={startLocation}
        route={route}
        navState={navState}
        mapStyle={mapStyle}
        is3D={is3D}
        pitstops={pitstops}
        onPitchChange={setIs3D}
        onSelectPoi={handleSelectPoi}
        onMapClickStart={!route && !navState?.isActive ? handlePickManualStart : undefined}
        recenterSignal={recenterSignal}
      />

      {/* Top Floating Brand & Controls (Hidden during active navigation) */}
      {!navState?.isActive && (
        <>
          <div className="absolute inset-x-0 top-0 z-20 px-2.5 sm:px-4 pt-safe pointer-events-none space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="pointer-events-auto flex items-center gap-2 bg-white/95 backdrop-blur-md px-2.5 sm:px-3 py-2 rounded-2xl shadow-lg border border-slate-200/80 min-w-0">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-teal-600 to-emerald-700 flex items-center justify-center text-white shadow-xs shrink-0">
                  <Compass className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-black text-slate-900 leading-none truncate">
                    CityExplorer<span className="text-teal-600">+</span>{' '}
                    <span className="text-[10px] font-bold text-slate-400">v{APP_VERSION}</span>
                  </div>
                  <div className="hidden sm:block text-[10px] font-semibold text-slate-500 leading-tight">
                    Fiets &amp; Wandel Lusroutes
                  </div>
                </div>
              </div>

              <div className="pointer-events-auto flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setDrawerState({ open: true, tab: 'saved' })}
                  aria-label="Mijn opgeslagen trips"
                  className="flex items-center gap-1 px-2.5 py-2.5 rounded-2xl bg-white/95 backdrop-blur-md hover:bg-teal-50 text-slate-800 shadow-lg border border-slate-200/80 text-xs font-bold transition cursor-pointer"
                >
                  <Bookmark className="w-4 h-4 text-teal-600" />
                  <span className="text-xs font-bold">Trips</span>
                  {savedRoutes.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-teal-600 text-white text-[10px] leading-none">
                      {savedRoutes.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setDrawerState({ open: true, tab: 'options' })}
                  aria-label="Open opties, updates en dagboek"
                  className="relative p-2.5 rounded-2xl bg-white/95 backdrop-blur-md hover:bg-slate-50 text-slate-700 shadow-lg border border-slate-200/80 transition cursor-pointer"
                >
                  <Settings className="w-4 h-4" />
                  {updateInfo?.status === 'update-available' && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rose-500 border-2 border-white" />
                  )}
                </button>
              </div>
            </div>

            {updateInfo?.status === 'update-available' && (
              <div className="pointer-events-auto flex items-center justify-between gap-2 bg-teal-700 text-white text-xs font-bold px-3 py-2 rounded-2xl shadow-lg max-w-md">
                <span className="truncate">
                  Nieuwe versie v{updateInfo.latestVersion} beschikbaar!
                </span>
                <button
                  type="button"
                  onClick={applyAppUpdate}
                  className="shrink-0 px-2.5 py-1 rounded-xl bg-white text-teal-800 text-[11px] font-extrabold cursor-pointer"
                >
                  Updaten
                </button>
              </div>
            )}

            {isOffline && (
              <div className="pointer-events-auto inline-flex items-center gap-1.5 bg-slate-900/90 text-amber-300 text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                <WifiOff className="w-3.5 h-3.5" />
                Offline modus · Opgeslagen trips &amp; GPS actief
              </div>
            )}
          </div>

          {/* Vertical Map Controls Rail (right side, Google Maps style — always fits on any phone) */}
          <div className="fixed right-2.5 sm:right-4 top-20 z-20 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setIs3D((prev) => !prev)}
              aria-label="Wissel tussen 2D en 3D kaartweergave"
              title={is3D ? 'Schakel naar 2D' : 'Kantel kaart naar 3D'}
              className={`w-10 h-10 flex items-center justify-center rounded-2xl backdrop-blur-md shadow-lg border text-xs font-extrabold transition cursor-pointer ${
                is3D
                  ? 'bg-teal-600 text-white border-teal-500'
                  : 'bg-white/95 hover:bg-slate-50 text-slate-700 border-slate-200/80'
              }`}
            >
              {is3D ? '3D' : '2D'}
            </button>

            <button
              type="button"
              onClick={cycleMapStyle}
              aria-label="Wissel kaartstijl (Kaart, Nacht, Satelliet)"
              title={`Kaartstijl: ${mapStyleLabel}`}
              className={`w-10 h-10 flex items-center justify-center rounded-2xl backdrop-blur-md shadow-lg border transition cursor-pointer ${
                mapStyle !== 'standard'
                  ? 'bg-slate-900 text-white border-slate-700'
                  : 'bg-white/95 hover:bg-slate-50 text-slate-700 border-slate-200/80'
              }`}
            >
              {mapStyle === 'dark' ? (
                <Moon className="w-4 h-4 text-amber-300" />
              ) : mapStyle === 'satellite' ? (
                <Layers className="w-4 h-4 text-teal-300" />
              ) : (
                <Sun className="w-4 h-4 text-teal-600" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (gpsStatus !== 'ready') {
                  requestGps();
                } else {
                  setRecenterSignal((n) => n + 1);
                }
              }}
              aria-label="Centreer op locatie"
              title="Centreer op huidige locatie"
              className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white/95 backdrop-blur-md hover:bg-slate-50 text-slate-700 shadow-lg border border-slate-200/80 transition cursor-pointer"
            >
              <Crosshair className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      {/* Mode 1: Route Planner Sheet */}
      {!route && !navState?.isActive && (
        <RoutePlannerSheet
          activity={activity}
          onActivityChange={handleActivityChange}
          targetType={targetType}
          onTargetTypeChange={setTargetType}
          distanceKm={distanceKm}
          onDistanceKmChange={setDistanceKm}
          durationMin={durationMin}
          onDurationMinChange={setDurationMin}
          selectedInterests={selectedInterests}
          onToggleInterest={handleToggleInterest}
          speedKmh={speedKmh}
          startLocation={startLocation}
          locationLabel={locationLabel}
          gpsStatus={gpsStatus}
          isOffline={isOffline}
          onRequestGps={requestGps}
          onSelectPlace={handleSelectPlace}
          onOpenSavedTrips={() => setDrawerState({ open: true, tab: 'saved' })}
          savedTripsCount={savedRoutes.length}
          isGenerating={isGenerating}
          progressText={progressText}
          errorText={errorText}
          onGenerate={() => runRouteGeneration(0)}
        />
      )}

      {/* Mode 2: Route Preview Sheet */}
      {route && !navState?.isActive && (
        <RoutePreviewSheet
          route={route}
          weather={weather}
          isGenerating={isGenerating}
          isOffline={isOffline}
          savedEntry={savedEntry}
          offlineProgress={offlineProgress}
          onBack={() => {
            setRoute(null);
            setInspectedPoi(null);
          }}
          onAlternativeLoop={() => runRouteGeneration((route.sectorIndex + 1) % 4)}
          onStartNavigation={() => {
            setIs3D(true);
            startNavigation(false);
          }}
          onStartSimulation={() => {
            setIs3D(true);
            startNavigation(true);
          }}
          onSaveOffline={() => handleSaveOffline()}
          onShareRoute={() => setShareModalOpen(true)}
          onExportGpx={handleExportGpx}
          onSelectPoi={handleSelectPoi}
          onRemovePoi={handleRemovePoi}
          onAddCustomStop={handleAddCustomStop}
        />
      )}

      {/* Mode 3: Active Turn-by-Turn Navigation Overlay */}
      {route && navState?.isActive && (
        <>
          <div className="fixed right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setIs3D((prev) => !prev)}
              aria-label="Wissel tussen 2D en 3D navigatie"
              className={`w-11 h-11 rounded-2xl shadow-xl border backdrop-blur-md text-xs font-black transition cursor-pointer ${
                is3D
                  ? 'bg-teal-600 text-white border-teal-400'
                  : 'bg-slate-900/90 text-white border-slate-700 hover:bg-slate-800'
              }`}
            >
              {is3D ? '3D' : '2D'}
            </button>
            <button
              type="button"
              onClick={cycleMapStyle}
              aria-label="Wissel kaartstijl (Kaart, Nacht, Satelliet)"
              title={`Kaartstijl: ${mapStyleLabel}`}
              className={`w-11 h-11 flex items-center justify-center rounded-2xl shadow-xl border backdrop-blur-md transition cursor-pointer ${
                mapStyle !== 'standard'
                  ? 'bg-teal-600 text-white border-teal-400'
                  : 'bg-slate-900/90 text-white border-slate-700 hover:bg-slate-800'
              }`}
            >
              {mapStyle === 'dark' ? (
                <Moon className="w-5 h-5 text-amber-300" />
              ) : mapStyle === 'satellite' ? (
                <Layers className="w-5 h-5" />
              ) : (
                <Sun className="w-5 h-5" />
              )}
            </button>
          </div>
          <NavigationOverlay
            route={route}
            navState={navState}
            settings={settings}
            isRerouting={isRerouting}
            pitstops={pitstops}
            loadingPitstops={loadingPitstops}
            onUpdateSettings={handleUpdateSettings}
            onOpenSettings={() => setDrawerState({ open: true, tab: 'options' })}
            onStop={handleStopNavigationWithSummary}
            onSetSimSpeed={setSimulationSpeed}
            onTriggerReroute={triggerReroute}
            onSearchPitstops={handleSearchPitstops}
            onClearPitstops={() => setPitstops([])}
          />
        </>
      )}

      {/* POI Info Popup Modal */}
      {activePopupPoi && (
        <PoiPopupModal
          poi={activePopupPoi}
          speechRate={settings.speechRate}
          isNearbyTrigger={Boolean(navState?.isActive)}
          onClose={() => {
            if (navState?.isActive) {
              dismissPoiPopup();
            } else {
              setInspectedPoi(null);
            }
          }}
        />
      )}

      {/* Share Route Modal (Link & QR Code) */}
      {shareModalOpen && route && (
        <ShareRouteModal
          route={route}
          cityName={selectedCityName}
          onClose={() => setShareModalOpen(false)}
        />
      )}

      {/* Completed Trip Summary Modal */}
      {summaryTrip && (
        <TripSummaryModal trip={summaryTrip} onClose={() => setSummaryTrip(null)} />
      )}

      {/* Settings, Saved Offline Trips & Trip Diary Drawer */}
      <SettingsDrawer
        isOpen={drawerState.open}
        initialTab={drawerState.tab}
        onClose={() => setDrawerState((prev) => ({ ...prev, open: false }))}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        savedRoutes={savedRoutes}
        completedTrips={completedTrips}
        updateInfo={updateInfo}
        checkingUpdate={checkingUpdate}
        onCheckUpdate={handleCheckUpdate}
        onLoadSavedRoute={(loaded) => {
          stopNavigation();
          setStartLocation(loaded.startLocation);
          setRoute(loaded);
        }}
        onDeleteSavedRoute={async (id) => setSavedRoutes(await removeSavedRoute(id))}
        onDownloadOfflineRoute={(item) => handleSaveOffline(item.route, item.cityName)}
        onDeleteCompletedTrip={async (id) => setCompletedTrips(await removeCompletedTrip(id))}
      />
    </div>
  );
}

export default App;

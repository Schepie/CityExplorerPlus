import { useCallback, useEffect, useState } from 'react';
import { Bookmark, Compass, Crosshair, Layers, Settings, WifiOff } from 'lucide-react';
import { MapView } from './components/MapView';
import { NavigationOverlay } from './components/NavigationOverlay';
import { PoiPopupModal } from './components/PoiPopupModal';
import { RoutePlannerSheet } from './components/RoutePlannerSheet';
import { RoutePreviewSheet } from './components/RoutePreviewSheet';
import { SettingsDrawer } from './components/SettingsDrawer';
import { useNavigation } from './hooks/useNavigation';
import { reverseGeocode } from './services/geocodingService';
import {
  getAllSavedRoutes,
  prepareRouteForOffline,
  removeSavedRoute,
} from './services/offlineService';
import { generateLoopRoute } from './services/routingService';
import { loadSettings, saveSettings } from './services/storageService';
import type {
  ActivityMode,
  AppSettings,
  GeneratedRoute,
  InterestId,
  LatLng,
  POI,
  SavedRoute,
  SearchPlace,
  TargetType,
} from './types';
import { generateGpx } from './utils/geo';

// Default fallback start location (Utrecht Centrum) if GPS is unavailable on desktop
const FALLBACK_POS: LatLng = { lat: 52.0907, lng: 5.1214 };

export function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
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

  // Route & UI state
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard');
  const [is3D, setIs3D] = useState<boolean>(false);
  const [route, setRoute] = useState<GeneratedRoute | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [inspectedPoi, setInspectedPoi] = useState<POI | null>(null);
  const [drawerState, setDrawerState] = useState<{ open: boolean; tab: 'options' | 'saved' }>({
    open: false,
    tab: 'options',
  });
  const [offlineProgress, setOfflineProgress] = useState<{ pct: number; label: string } | null>(
    null
  );

  const {
    navState,
    startNavigation,
    stopNavigation,
    dismissPoiPopup,
    openPoiPopup,
    setSimulationSpeed,
  } = useNavigation({ route, settings });

  // Load saved routes from IndexedDB on startup
  useEffect(() => {
    getAllSavedRoutes().then(setSavedRoutes);
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
    requestGps();
  }, [requestGps]);

  const handlePickManualStart = useCallback(async (pos: LatLng) => {
    setStartLocation(pos);
    setGpsStatus('manual');
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

      // Include chosen city in route title for easy recognition in Saved Trips
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

  const handleDeleteSavedRoute = async (id: string) => {
    const updated = await removeSavedRoute(id);
    setSavedRoutes(updated);
  };

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
        onPitchChange={setIs3D}
        onSelectPoi={handleSelectPoi}
        onMapClickStart={!route && !navState?.isActive ? handlePickManualStart : undefined}
        recenterSignal={recenterSignal}
      />

      {/* Top Floating Brand & Controls (Hidden during active navigation) */}
      {!navState?.isActive && (
        <div className="absolute inset-x-0 top-0 z-20 px-3 sm:px-4 pt-safe pointer-events-none space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="pointer-events-auto flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-2 rounded-2xl shadow-lg border border-slate-200/80">
              <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-teal-600 to-emerald-700 flex items-center justify-center text-white shadow-xs">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-black text-slate-900 leading-none">
                  CityExplorer<span className="text-teal-600">+</span>
                </div>
                <div className="text-[10px] font-semibold text-slate-500 leading-tight">
                  Fiets &amp; Wandel Lusroutes
                </div>
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-1.5">
              {/* Prominent "Mijn Trips" button for prepared & offline trips */}
              <button
                type="button"
                onClick={() => setDrawerState({ open: true, tab: 'saved' })}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl bg-white/95 backdrop-blur-md hover:bg-teal-50 text-slate-800 shadow-lg border border-slate-200/80 text-xs font-bold transition cursor-pointer"
              >
                <Bookmark className="w-4 h-4 text-teal-600" />
                <span className="hidden xs:inline">Trips</span>
                {savedRoutes.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-teal-600 text-white text-[10px] leading-none">
                    {savedRoutes.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIs3D((prev) => !prev)}
                aria-label="Wissel tussen 2D en 3D kaartweergave"
                title={is3D ? 'Schakel naar 2D bovenaanzicht' : 'Kantel kaart naar 3D (zoals Google Maps)'}
                className={`px-2.5 py-2.5 rounded-2xl backdrop-blur-md shadow-lg border text-xs font-extrabold transition cursor-pointer ${
                  is3D
                    ? 'bg-teal-600 text-white border-teal-500'
                    : 'bg-white/95 hover:bg-slate-50 text-slate-700 border-slate-200/80'
                }`}
              >
                {is3D ? '3D' : '2D'}
              </button>

              <button
                type="button"
                onClick={() =>
                  setMapStyle((prev) => (prev === 'standard' ? 'satellite' : 'standard'))
                }
                aria-label="Wissel tussen kaart en satelliet"
                title={mapStyle === 'satellite' ? 'Toon gewone kaart' : 'Toon satellietbeeld'}
                className={`flex items-center gap-1.5 px-2.5 py-2.5 rounded-2xl backdrop-blur-md shadow-lg border text-xs font-bold transition cursor-pointer ${
                  mapStyle === 'satellite'
                    ? 'bg-teal-600 text-white border-teal-500'
                    : 'bg-white/95 hover:bg-slate-50 text-slate-700 border-slate-200/80'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {mapStyle === 'satellite' ? 'Kaart' : 'Satelliet'}
                </span>
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
                className="p-2.5 rounded-2xl bg-white/95 backdrop-blur-md hover:bg-slate-50 text-slate-700 shadow-lg border border-slate-200/80 transition cursor-pointer"
              >
                <Crosshair className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={() => setDrawerState({ open: true, tab: 'options' })}
                aria-label="Open opties"
                className="p-2.5 rounded-2xl bg-white/95 backdrop-blur-md hover:bg-slate-50 text-slate-700 shadow-lg border border-slate-200/80 transition cursor-pointer"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>

          {isOffline && (
            <div className="pointer-events-auto inline-flex items-center gap-1.5 bg-slate-900/90 text-amber-300 text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
              <WifiOff className="w-3.5 h-3.5" />
              Offline modus · Opgeslagen trips &amp; GPS actief
            </div>
          )}
        </div>
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
          onExportGpx={handleExportGpx}
          onSelectPoi={handleSelectPoi}
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
              title={is3D ? 'Schakel naar 2D bovenaanzicht' : 'Schakel naar 3D navigatie'}
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
              onClick={() =>
                setMapStyle((prev) => (prev === 'standard' ? 'satellite' : 'standard'))
              }
              aria-label="Wissel tussen kaart en satelliet"
              title={mapStyle === 'satellite' ? 'Toon gewone kaart' : 'Toon satellietbeeld'}
              className={`w-11 h-11 flex items-center justify-center rounded-2xl shadow-xl border backdrop-blur-md transition cursor-pointer ${
                mapStyle === 'satellite'
                  ? 'bg-teal-600 text-white border-teal-400'
                  : 'bg-slate-900/90 text-white border-slate-700 hover:bg-slate-800'
              }`}
            >
              <Layers className="w-5 h-5" />
            </button>
          </div>
          <NavigationOverlay
            route={route}
            navState={navState}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onOpenSettings={() => setDrawerState({ open: true, tab: 'options' })}
            onStop={() => {
              setIs3D(false);
              stopNavigation();
            }}
            onSetSimSpeed={setSimulationSpeed}
          />
        </>
      )}

      {/* POI Info Popup Modal (triggered by geofencing or tapping a POI marker) */}
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

      {/* Settings & Saved Offline Trips Drawer */}
      <SettingsDrawer
        isOpen={drawerState.open}
        initialTab={drawerState.tab}
        onClose={() => setDrawerState((prev) => ({ ...prev, open: false }))}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        savedRoutes={savedRoutes}
        onLoadSavedRoute={(loaded) => {
          stopNavigation();
          setStartLocation(loaded.startLocation);
          setRoute(loaded);
        }}
        onDeleteSavedRoute={handleDeleteSavedRoute}
        onDownloadOfflineRoute={(item) => handleSaveOffline(item.route, item.cityName)}
      />
    </div>
  );
}

export default App;

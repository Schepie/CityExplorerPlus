import { useCallback, useEffect, useRef, useState } from 'react';
import { audioService } from '../services/audioService';
import type { AppSettings, GeneratedRoute, LatLng, NavigationStatus, POI } from '../types';
import { haversineMeters, interpolateAlongRoute, projectOntoRoute } from '../utils/geo';
import { useWakeLock } from './useWakeLock';

interface UseNavigationProps {
  route: GeneratedRoute | null;
  settings: AppSettings;
}

export function useNavigation({ route, settings }: UseNavigationProps) {
  const [navState, setNavState] = useState<NavigationStatus | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const routeRef = useRef(route);
  routeRef.current = route;

  const lastCoordIndexRef = useRef<number>(0);
  const announcedStepRef = useRef<Set<number>>(new Set());
  const triggeredPoisRef = useRef<Set<string>>(new Set());
  const simDistanceRef = useRef<number>(0);
  const simSpeedRef = useRef<number>(8); // 8x default simulation speed

  useWakeLock(Boolean(navState?.isActive && settings.keepScreenAwake));

  /** Core update handler shared between real GPS and simulation mode */
  const processPositionUpdate = useCallback(
    (pos: LatLng, gpsHeading: number | null, forcedDistanceAlong?: number) => {
      const currentRoute = routeRef.current;
      if (!currentRoute) return;

      const curSettings = settingsRef.current;
      const totalDist = currentRoute.actualDistanceMeters;

      let distanceAlong: number;
      let offRouteMeters: number;
      let heading: number;

      if (forcedDistanceAlong !== undefined) {
        distanceAlong = forcedDistanceAlong;
        offRouteMeters = 0;
        heading = gpsHeading ?? 0;
      } else {
        const proj = projectOntoRoute(
          pos,
          currentRoute.coordinates,
          currentRoute.cumulativeDistances,
          lastCoordIndexRef.current
        );
        lastCoordIndexRef.current = proj.nearestIndex;
        distanceAlong = proj.distanceAlongMeters;
        offRouteMeters = proj.offRouteMeters;
        heading = gpsHeading !== null && !Number.isNaN(gpsHeading) ? gpsHeading : proj.heading;
      }

      const distanceRemaining = Math.max(0, totalDist - distanceAlong);
      const speedKmh =
        currentRoute.activity === 'walking'
          ? curSettings.walkingSpeedKmh
          : curSettings.cyclingSpeedKmh;
      const etaSeconds = Math.round((distanceRemaining / 1000 / Math.max(1, speedKmh)) * 3600);

      // Determine current upcoming turn step
      const steps = currentRoute.steps;
      let nextStepIdx = steps.length - 1;
      for (let i = 0; i < steps.length; i++) {
        if (steps[i].cumulativeDistanceMeters > distanceAlong + 15) {
          nextStepIdx = i;
          break;
        }
      }
      const nextStep = steps[nextStepIdx];
      const distanceToNextTurn = nextStep
        ? Math.max(0, nextStep.cumulativeDistanceMeters - distanceAlong)
        : 0;

      // Announce upcoming turn via TTS when within 75m (cycling) or 45m (walking)
      const announceThreshold = currentRoute.activity === 'cycling' ? 85 : 50;
      if (
        nextStep &&
        distanceToNextTurn <= announceThreshold &&
        !announcedStepRef.current.has(nextStepIdx)
      ) {
        announcedStepRef.current.add(nextStepIdx);
        if (curSettings.turnByTurnVoice) {
          const prefix =
            distanceToNextTurn > 20
              ? `Over ${Math.round(distanceToNextTurn / 10) * 10} meter: `
              : '';
          audioService.speak(`${prefix}${nextStep.instruction}`, 'navigation', curSettings.speechRate);
        }
      }

      // Geofencing check for POIs along the route
      let newlyTriggeredPoi: POI | null = null;
      for (const poi of currentRoute.pois) {
        if (triggeredPoisRef.current.has(poi.id)) continue;
        const distToPoi = haversineMeters(pos, { lat: poi.lat, lng: poi.lng });
        if (distToPoi <= curSettings.poiTriggerRadiusMeters) {
          triggeredPoisRef.current.add(poi.id);
          newlyTriggeredPoi = poi;
          break;
        }
      }

      if (newlyTriggeredPoi) {
        if (curSettings.poiSoundEnabled) {
          audioService.playPoiChime();
        }
        if (curSettings.poiAutoReadAloud) {
          audioService.speak(
            `Bezienswaardigheid in de buurt: ${newlyTriggeredPoi.name}. ${newlyTriggeredPoi.description}`,
            'poi',
            curSettings.speechRate
          );
        }
      }

      const hasArrived = distanceRemaining <= 25 && distanceAlong > totalDist * 0.7;
      if (hasArrived && !announcedStepRef.current.has(-999)) {
        announcedStepRef.current.add(-999);
        if (curSettings.turnByTurnVoice) {
          audioService.speak(
            'Je hebt de lusroute voltooid! Goed gedaan.',
            'navigation',
            curSettings.speechRate
          );
        }
      }

      setNavState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          currentPosition: pos,
          heading,
          distanceCoveredMeters: distanceAlong,
          distanceRemainingMeters: distanceRemaining,
          etaSeconds,
          currentStepIndex: nextStepIdx,
          distanceToNextTurnMeters: distanceToNextTurn,
          triggeredPoiIds: Array.from(triggeredPoisRef.current),
          activePoiPopup: newlyTriggeredPoi ?? prev.activePoiPopup,
          offRouteMeters,
          hasArrived,
        };
      });
    },
    []
  );

  /** Start navigation in either live GPS mode or interactive simulation mode */
  const startNavigation = useCallback(
    (simulate = false) => {
      if (!route) return;
      audioService.unlock();
      lastCoordIndexRef.current = 0;
      announcedStepRef.current = new Set([0]);
      triggeredPoisRef.current = new Set();
      simDistanceRef.current = 0;

      const startPos = route.startLocation;
      const firstStep = route.steps[0];
      if (settings.turnByTurnVoice && firstStep) {
        audioService.speak(
          `Navigatie gestart. ${firstStep.instruction}`,
          'navigation',
          settings.speechRate
        );
      }

      setNavState({
        isActive: true,
        isSimulating: simulate,
        simulationSpeedMultiplier: simSpeedRef.current,
        currentPosition: startPos,
        heading: 0,
        distanceCoveredMeters: 0,
        distanceRemainingMeters: route.actualDistanceMeters,
        etaSeconds: route.estimatedDurationSeconds,
        currentStepIndex: route.steps.length > 1 ? 1 : 0,
        distanceToNextTurnMeters: route.steps[1]?.cumulativeDistanceMeters ?? 0,
        triggeredPoiIds: [],
        activePoiPopup: null,
        offRouteMeters: 0,
        hasArrived: false,
      });
    },
    [route, settings.speechRate, settings.turnByTurnVoice]
  );

  const stopNavigation = useCallback(() => {
    audioService.stopSpeaking();
    setNavState(null);
  }, []);

  const dismissPoiPopup = useCallback(() => {
    setNavState((prev) => (prev ? { ...prev, activePoiPopup: null } : prev));
  }, []);

  const openPoiPopup = useCallback((poi: POI) => {
    setNavState((prev) => (prev ? { ...prev, activePoiPopup: poi } : prev));
  }, []);

  const setSimulationSpeed = useCallback((multiplier: number) => {
    simSpeedRef.current = multiplier;
    setNavState((prev) => (prev ? { ...prev, simulationSpeedMultiplier: multiplier } : prev));
  }, []);

  // Active GPS watcher or Simulation timer loop
  useEffect(() => {
    if (!navState?.isActive || !route) return;

    if (navState.isSimulating) {
      const tickMs = 350;
      const timer = window.setInterval(() => {
        const curRoute = routeRef.current;
        if (!curRoute) return;
        const baseSpeedMps =
          (curRoute.activity === 'walking'
            ? settingsRef.current.walkingSpeedKmh
            : settingsRef.current.cyclingSpeedKmh) / 3.6;
        const deltaMeters = baseSpeedMps * simSpeedRef.current * (tickMs / 1000);
        simDistanceRef.current = Math.min(
          curRoute.actualDistanceMeters,
          simDistanceRef.current + deltaMeters
        );

        const interp = interpolateAlongRoute(
          simDistanceRef.current,
          curRoute.coordinates,
          curRoute.cumulativeDistances
        );
        processPositionUpdate(interp.position, interp.heading, simDistanceRef.current);

        if (simDistanceRef.current >= curRoute.actualDistanceMeters) {
          window.clearInterval(timer);
        }
      }, tickMs);

      return () => window.clearInterval(timer);
    }

    // Real GPS watchPosition
    if (!('geolocation' in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        processPositionUpdate(
          { lat: position.coords.latitude, lng: position.coords.longitude },
          position.coords.heading
        );
      },
      (err) => {
        console.warn('GPS watch error:', err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [navState?.isActive, navState?.isSimulating, route, processPositionUpdate]);

  return {
    navState,
    startNavigation,
    stopNavigation,
    dismissPoiPopup,
    openPoiPopup,
    setSimulationSpeed,
  };
}

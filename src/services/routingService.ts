import { DEFAULT_INTEREST, INTEREST_MAP } from '../data/interests';
import type {
  ActivityMode,
  GeneratedRoute,
  InterestId,
  LatLng,
  ManeuverType,
  POI,
  TurnStep,
} from '../types';
import {
  computeCumulativeDistances,
  destinationPoint,
  haversineMeters,
  projectOntoRoute,
} from '../utils/geo';
import { fetchElevationProfile } from './elevationService';
import { enrichPoisWithWikipedia, fetchPoisAround } from './poiService';

interface RoutingResult {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  steps: TurnStep[];
  provider: 'openrouteservice' | 'osrm';
}

interface LoopWaypointBuild {
  waypoints: LatLng[];
  selectedPois: POI[];
}

/**
 * Build an oval/teardrop loop skeleton of radius `loopRadiusMeters` in compass direction
 * `sectorCenterDeg`, snapping each geometric anchor to the highest-scoring nearby POI
 * so the route hits maximum POIs while accurately achieving the requested distance.
 */
function buildCalibratedLoopWaypoints(
  start: LatLng,
  allPois: POI[],
  loopRadiusMeters: number,
  sectorCenterDeg: number,
  targetDistanceKm: number
): LoopWaypointBuild {
  // 4 anchors for short routes (<5km), 5 anchors for medium/long routes (>=5km)
  const anchorTemplates: Array<{ angleOffset: number; radiusFactor: number }> =
    targetDistanceKm < 5
      ? [
          { angleOffset: -42, radiusFactor: 0.65 },
          { angleOffset: -12, radiusFactor: 0.96 },
          { angleOffset: 18, radiusFactor: 0.94 },
          { angleOffset: 44, radiusFactor: 0.62 },
        ]
      : [
          { angleOffset: -44, radiusFactor: 0.56 },
          { angleOffset: -22, radiusFactor: 0.9 },
          { angleOffset: 0, radiusFactor: 1.0 },
          { angleOffset: 22, radiusFactor: 0.9 },
          { angleOffset: 44, radiusFactor: 0.56 },
        ];

  const snapRadius = Math.max(220, Math.min(loopRadiusMeters * 0.42, 1600));
  const minPoiSpacing = Math.max(180, loopRadiusMeters * 0.25);

  const usedPoiIds = new Set<string>();
  const selectedPois: POI[] = [];
  const innerWaypoints: LatLng[] = [];

  for (const tpl of anchorTemplates) {
    const bearing = (sectorCenterDeg + tpl.angleOffset + 360) % 360;
    const anchor = destinationPoint(start, bearing, loopRadiusMeters * tpl.radiusFactor);

    // Find best unused POI within snapRadius of this anchor
    let bestPoi: POI | null = null;
    let bestCombinedScore = -Infinity;

    for (const poi of allPois) {
      if (usedPoiIds.has(poi.id)) continue;
      const distToAnchor = haversineMeters(anchor, { lat: poi.lat, lng: poi.lng });
      if (distToAnchor > snapRadius) continue;

      // Avoid snapping two anchors onto nearly the same spot
      const tooCloseToPicked = selectedPois.some(
        (p) => haversineMeters({ lat: p.lat, lng: p.lng }, { lat: poi.lat, lng: poi.lng }) < minPoiSpacing
      );
      if (tooCloseToPicked) continue;

      // Also avoid snapping back right onto the start point
      if (haversineMeters(start, { lat: poi.lat, lng: poi.lng }) < Math.max(140, loopRadiusMeters * 0.18)) {
        continue;
      }

      // Balance POI quality with proximity to the geometric anchor so loop length stays accurate
      const proximityBonus = (1 - distToAnchor / snapRadius) * 45;
      const combined = poi.score * 0.65 + proximityBonus;

      if (combined > bestCombinedScore) {
        bestCombinedScore = combined;
        bestPoi = poi;
      }
    }

    if (bestPoi) {
      usedPoiIds.add(bestPoi.id);
      selectedPois.push(bestPoi);
      innerWaypoints.push({ lat: bestPoi.lat, lng: bestPoi.lng });
    } else {
      // Keep the geometric shaping point so the loop STILL reaches the target distance!
      innerWaypoints.push(anchor);
    }
  }

  return {
    waypoints: [start, ...innerWaypoints, start],
    selectedPois,
  };
}

/** Map OSRM maneuver type + modifier to our ManeuverType + Dutch instruction */
function translateOsrmStep(
  maneuver: { type: string; modifier?: string; exit?: number; location: [number, number] },
  streetName: string,
  index: number,
  distanceMeters: number,
  durationSeconds: number,
  cumulativeDistanceMeters: number
): TurnStep {
  const street = streetName?.trim() || '';
  const opStraat = street ? ` op ${street}` : '';
  const naarStraat = street ? ` naar ${street}` : '';
  const mod = maneuver.modifier || '';

  let maneuverType: ManeuverType = 'straight';
  let instruction = `Ga rechtdoor${opStraat}`;

  if (maneuver.type === 'depart') {
    maneuverType = 'depart';
    instruction = street ? `Vertrek via ${street}` : 'Start de lusroute';
  } else if (maneuver.type === 'arrive') {
    maneuverType = 'arrive';
    instruction = 'Je bent terug bij het startpunt!';
  } else if (maneuver.type === 'roundabout' || maneuver.type === 'rotary') {
    maneuverType = 'roundabout';
    const exit = maneuver.exit || 1;
    instruction = `Neem op de rotonde de ${exit}e afslag${naarStraat}`;
  } else if (maneuver.type === 'fork') {
    if (mod.includes('left')) {
      maneuverType = 'fork-left';
      instruction = `Houd links aan bij de splitsing${opStraat}`;
    } else {
      maneuverType = 'fork-right';
      instruction = `Houd rechts aan bij de splitsing${opStraat}`;
    }
  } else {
    switch (mod) {
      case 'left':
        maneuverType = 'turn-left';
        instruction = `Sla linksaf${opStraat}`;
        break;
      case 'right':
        maneuverType = 'turn-right';
        instruction = `Sla rechtsaf${opStraat}`;
        break;
      case 'slight left':
        maneuverType = 'turn-slight-left';
        instruction = `Buig flauw links af${opStraat}`;
        break;
      case 'slight right':
        maneuverType = 'turn-slight-right';
        instruction = `Buig flauw rechts af${opStraat}`;
        break;
      case 'sharp left':
        maneuverType = 'turn-sharp-left';
        instruction = `Sla scherp linksaf${opStraat}`;
        break;
      case 'sharp right':
        maneuverType = 'turn-sharp-right';
        instruction = `Sla scherp rechtsaf${opStraat}`;
        break;
      case 'uturn':
        maneuverType = 'uturn';
        instruction = `Keer om${opStraat}`;
        break;
      default:
        maneuverType = 'straight';
        instruction = `Volg de weg rechtdoor${opStraat}`;
    }
  }

  return {
    index,
    instruction,
    streetName: street,
    distanceMeters,
    durationSeconds,
    maneuverType,
    location: { lat: maneuver.location[1], lng: maneuver.location[0] },
    cumulativeDistanceMeters,
  };
}

/** Route via OpenRouteService (if user supplied a free ORS key) */
async function routeWithOpenRouteService(
  waypoints: LatLng[],
  activity: ActivityMode,
  apiKey: string
): Promise<RoutingResult> {
  const profile = activity === 'walking' ? 'foot-walking' : 'cycling-regular';
  const resp = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      coordinates: waypoints.map((p) => [p.lng, p.lat]),
      language: 'nl',
      instructions: true,
    }),
  });

  if (!resp.ok) {
    throw new Error(`OpenRouteService fout (${resp.status})`);
  }

  const data = await resp.json();
  const feature = data.features?.[0];
  if (!feature) throw new Error('Geen route gevonden via OpenRouteService');

  const coords: [number, number][] = feature.geometry.coordinates;
  const summary = feature.properties.summary;
  const segments = feature.properties.segments || [];

  const steps: TurnStep[] = [];
  let cumDist = 0;

  const mapOrsType = (type: number): ManeuverType => {
    switch (type) {
      case 0:
        return 'turn-left';
      case 1:
        return 'turn-right';
      case 2:
        return 'turn-sharp-left';
      case 3:
        return 'turn-sharp-right';
      case 4:
      case 12:
        return 'turn-slight-left';
      case 5:
      case 13:
        return 'turn-slight-right';
      case 6:
        return 'straight';
      case 7:
      case 8:
        return 'roundabout';
      case 9:
        return 'uturn';
      case 10:
        return 'arrive';
      case 11:
        return 'depart';
      default:
        return 'straight';
    }
  };

  for (const seg of segments) {
    for (const st of seg.steps || []) {
      const wpIdx = st.way_points?.[0] ?? 0;
      const coord = coords[wpIdx] ?? coords[0];
      steps.push({
        index: steps.length,
        instruction: st.instruction,
        streetName: st.name && st.name !== '-' ? st.name : '',
        distanceMeters: st.distance || 0,
        durationSeconds: st.duration || 0,
        maneuverType: mapOrsType(st.type),
        location: { lat: coord[1], lng: coord[0] },
        cumulativeDistanceMeters: cumDist,
      });
      cumDist += st.distance || 0;
    }
  }

  return {
    coordinates: coords,
    distanceMeters: summary.distance,
    durationSeconds: summary.duration,
    steps,
    provider: 'openrouteservice',
  };
}

/** Route via free public OSRM OpenStreetMap.de foot/bike servers (0 API key needed!) */
async function routeWithOsrm(waypoints: LatLng[], activity: ActivityMode): Promise<RoutingResult> {
  const coordStr = waypoints.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const endpoints =
    activity === 'walking'
      ? [
          `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coordStr}?overview=full&geometries=geojson&steps=true`,
          `https://router.project-osrm.org/route/v1/foot/${coordStr}?overview=full&geometries=geojson&steps=true`,
        ]
      : [
          `https://routing.openstreetmap.de/routed-bike/route/v1/bike/${coordStr}?overview=full&geometries=geojson&steps=true`,
          `https://router.project-osrm.org/route/v1/bike/${coordStr}?overview=full&geometries=geojson&steps=true`,
        ];

  let data: any = null;
  let lastErr: unknown = null;

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 14000);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`OSRM HTTP ${resp.status}`);
      const json = await resp.json();
      if (json.code === 'Ok' && json.routes?.[0]) {
        data = json;
        break;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  if (!data?.routes?.[0]) {
    throw new Error(`Kon geen route berekenen via OSRM (${String(lastErr)})`);
  }

  const route = data.routes[0];
  const coords: [number, number][] = route.geometry.coordinates;
  const steps: TurnStep[] = [];
  let cumDist = 0;

  for (let legIdx = 0; legIdx < route.legs.length; legIdx++) {
    const leg = route.legs[legIdx];
    const isLastLeg = legIdx === route.legs.length - 1;

    for (const st of leg.steps || []) {
      if (st.maneuver?.type === 'arrive' && !isLastLeg) {
        continue;
      }
      if (st.maneuver?.type === 'depart' && legIdx > 0) {
        continue;
      }

      steps.push(
        translateOsrmStep(
          st.maneuver,
          st.name || '',
          steps.length,
          st.distance || 0,
          st.duration || 0,
          cumDist
        )
      );
      cumDist += st.distance || 0;
    }
  }

  return {
    coordinates: coords,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    steps,
    provider: 'osrm',
  };
}

/** Main entry point: discover POIs, calibrate loop waypoints to within ±10% of target distance, and enrich POIs */
export async function generateLoopRoute(params: {
  start: LatLng;
  activity: ActivityMode;
  targetDistanceKm: number;
  selectedInterests: InterestId[];
  sectorIndex: number;
  speedKmh: number;
  orsApiKey?: string;
  onProgress?: (message: string) => void;
}): Promise<GeneratedRoute> {
  const {
    start,
    activity,
    targetDistanceKm,
    selectedInterests,
    sectorIndex,
    speedKmh,
    orsApiKey,
    onProgress,
  } = params;

  const effectiveInterests: InterestId[] =
    selectedInterests.length > 0 ? selectedInterests : [DEFAULT_INTEREST];

  const targetMeters = targetDistanceKm * 1000;
  const sectorCenterDeg = (sectorIndex * 90 + 35) % 360;

  // Initial teardrop loop radius: street perimeter ≈ 3.35 * R
  let loopRadius = Math.max(320, targetMeters / 3.35);

  onProgress?.('Interessante plekken (POIs) zoeken langs de beoogde lus...');
  // Center the POI search around the midpoint of the loop so outer POIs are found too!
  const searchCenter = destinationPoint(start, sectorCenterDeg, loopRadius * 0.55);
  const searchRadius = Math.max(1000, Math.round(loopRadius * 0.95));
  const allPois = await fetchPoisAround(searchCenter, searchRadius, effectiveInterests);

  const computeRoute = async (wps: LatLng[]): Promise<RoutingResult> => {
    if (orsApiKey && orsApiKey.trim().length > 10) {
      try {
        return await routeWithOpenRouteService(wps, activity, orsApiKey.trim());
      } catch (err) {
        console.warn('ORS failed, falling back to OSRM:', err);
      }
    }
    return routeWithOsrm(wps, activity);
  };

  onProgress?.(
    activity === 'walking'
      ? `Wandellus van ${targetDistanceKm.toFixed(1).replace('.', ',')} km uitstippelen...`
      : `Fietslus van ${targetDistanceKm.toFixed(1).replace('.', ',')} km uitstippelen...`
  );

  let bestRouting: RoutingResult | null = null;
  let bestSelectedPois: POI[] = [];
  let bestErrorRatio = Infinity;

  // Up to 4 fast calibration passes to converge reliably within ±10% (0.90..1.10)
  const MAX_ITERATIONS = 4;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const built = buildCalibratedLoopWaypoints(
      start,
      allPois,
      loopRadius,
      sectorCenterDeg,
      targetDistanceKm
    );

    const candidate = await computeRoute(built.waypoints);
    const ratio = candidate.distanceMeters / targetMeters;
    const errorRatio = Math.abs(ratio - 1);

    if (errorRatio < bestErrorRatio) {
      bestErrorRatio = errorRatio;
      bestRouting = candidate;
      bestSelectedPois = built.selectedPois;
    }

    // Within ±9% -> great match, stop immediately!
    if (errorRatio <= 0.09) {
      break;
    }

    if (iter < MAX_ITERATIONS - 1) {
      onProgress?.(
        `Afstand kalibreren (${(candidate.distanceMeters / 1000).toFixed(1).replace('.', ',')} km → ${targetDistanceKm.toFixed(1).replace('.', ',')} km)...`
      );
      // Scale radius proportionally toward target distance (with gentle clamping to avoid overshoot)
      const rawScale = targetMeters / Math.max(250, candidate.distanceMeters);
      const dampedScale = 1 + (rawScale - 1) * 0.9;
      const clampedScale = Math.min(2.1, Math.max(0.45, dampedScale));
      loopRadius = Math.max(250, loopRadius * clampedScale);
    }
  }

  if (!bestRouting) {
    throw new Error('Kon geen geschikte lusroute berekenen.');
  }

  const cumulativeDistances = computeCumulativeDistances(bestRouting.coordinates);

  // Also include bonus POIs that lie within 95m of the calibrated route!
  const selectedIds = new Set(bestSelectedPois.map((p) => p.id));
  const bonusPois: POI[] = [];
  for (const poi of allPois) {
    if (selectedIds.has(poi.id) || bestSelectedPois.length + bonusPois.length >= 12) continue;
    const proj = projectOntoRoute({ lat: poi.lat, lng: poi.lng }, bestRouting.coordinates, cumulativeDistances);
    if (proj.offRouteMeters <= 95) {
      bonusPois.push({ ...poi, routeDistanceMeters: proj.distanceAlongMeters });
      selectedIds.add(poi.id);
    }
  }

  // Order all route POIs along the route progression
  const routePoisRaw = [...bestSelectedPois, ...bonusPois]
    .map((p) => {
      const proj = projectOntoRoute({ lat: p.lat, lng: p.lng }, bestRouting!.coordinates, cumulativeDistances);
      return { ...p, routeDistanceMeters: proj.distanceAlongMeters };
    })
    .sort((a, b) => (a.routeDistanceMeters ?? 0) - (b.routeDistanceMeters ?? 0));

  onProgress?.('Verhalen, foto’s & hoogteprofiel ophalen...');
  const [enrichedPois, elevation] = await Promise.all([
    enrichPoisWithWikipedia(routePoisRaw),
    fetchElevationProfile(bestRouting.coordinates, cumulativeDistances),
  ]);

  const estimatedDurationSeconds = Math.round(
    (bestRouting.distanceMeters / 1000 / Math.max(1, speedKmh)) * 3600
  );

  const primaryLabel =
    selectedInterests.length === 0
      ? 'Toeristische highlights'
      : selectedInterests
          .slice(0, 2)
          .map((id) => INTEREST_MAP[id].shortLabel)
          .join(' & ');

  const modeLabel = activity === 'walking' ? 'Wandellus' : 'Fietslus';

  return {
    id: `route-${Date.now()}`,
    name: `${modeLabel} · ${primaryLabel}`,
    activity,
    targetDistanceKm,
    actualDistanceMeters: bestRouting.distanceMeters,
    estimatedDurationSeconds,
    coordinates: bestRouting.coordinates,
    cumulativeDistances,
    elevationProfile: elevation?.profile,
    elevationGainMeters: elevation?.gainMeters,
    pois: enrichedPois,
    steps: bestRouting.steps,
    interestsUsed: effectiveInterests,
    sectorIndex,
    startLocation: start,
    createdAt: new Date().toISOString(),
    routingProvider: bestRouting.provider,
  };
}

/** Rebuild an existing loop after the user removes a POI or adds a custom stop */
export async function rebuildRouteWithPois(
  baseRoute: GeneratedRoute,
  updatedPois: POI[],
  speedKmh: number,
  orsApiKey?: string
): Promise<GeneratedRoute> {
  const waypoints: LatLng[] = [
    baseRoute.startLocation,
    ...updatedPois.map((p) => ({ lat: p.lat, lng: p.lng })),
    baseRoute.startLocation,
  ];

  let routing: RoutingResult;
  if (orsApiKey && orsApiKey.trim().length > 10) {
    try {
      routing = await routeWithOpenRouteService(waypoints, baseRoute.activity, orsApiKey.trim());
    } catch {
      routing = await routeWithOsrm(waypoints, baseRoute.activity);
    }
  } else {
    routing = await routeWithOsrm(waypoints, baseRoute.activity);
  }

  const cumulativeDistances = computeCumulativeDistances(routing.coordinates);
  const reorderedPois = updatedPois
    .map((p) => {
      const proj = projectOntoRoute({ lat: p.lat, lng: p.lng }, routing.coordinates, cumulativeDistances);
      return { ...p, routeDistanceMeters: proj.distanceAlongMeters };
    })
    .sort((a, b) => (a.routeDistanceMeters ?? 0) - (b.routeDistanceMeters ?? 0));

  const elevation = await fetchElevationProfile(routing.coordinates, cumulativeDistances);

  return {
    ...baseRoute,
    actualDistanceMeters: routing.distanceMeters,
    estimatedDurationSeconds: Math.round((routing.distanceMeters / 1000 / Math.max(1, speedKmh)) * 3600),
    coordinates: routing.coordinates,
    cumulativeDistances,
    elevationProfile: elevation?.profile,
    elevationGainMeters: elevation?.gainMeters,
    pois: reorderedPois,
    steps: routing.steps,
    routingProvider: routing.provider,
  };
}

/** Recalculate route from current GPS position back onto the remaining loop POIs & finish */
export async function rerouteFromCurrentPosition(
  currentPos: LatLng,
  activeRoute: GeneratedRoute,
  visitedPoiIds: string[],
  speedKmh: number,
  orsApiKey?: string
): Promise<GeneratedRoute> {
  const visitedSet = new Set(visitedPoiIds);
  const remainingPois = activeRoute.pois.filter((p) => !visitedSet.has(p.id));
  const waypoints: LatLng[] = [
    currentPos,
    ...remainingPois.slice(0, 5).map((p) => ({ lat: p.lat, lng: p.lng })),
    activeRoute.startLocation,
  ];

  let routing: RoutingResult;
  if (orsApiKey && orsApiKey.trim().length > 10) {
    try {
      routing = await routeWithOpenRouteService(waypoints, activeRoute.activity, orsApiKey.trim());
    } catch {
      routing = await routeWithOsrm(waypoints, activeRoute.activity);
    }
  } else {
    routing = await routeWithOsrm(waypoints, activeRoute.activity);
  }

  const cumulativeDistances = computeCumulativeDistances(routing.coordinates);
  const updatedPois = activeRoute.pois.map((p) => {
    const proj = projectOntoRoute({ lat: p.lat, lng: p.lng }, routing.coordinates, cumulativeDistances);
    return { ...p, routeDistanceMeters: proj.distanceAlongMeters };
  });

  return {
    ...activeRoute,
    actualDistanceMeters: routing.distanceMeters,
    estimatedDurationSeconds: Math.round((routing.distanceMeters / 1000 / Math.max(1, speedKmh)) * 3600),
    coordinates: routing.coordinates,
    cumulativeDistances,
    pois: updatedPois,
    steps: routing.steps,
    routingProvider: routing.provider,
  };
}

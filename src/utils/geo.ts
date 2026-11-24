import type { GeneratedRoute, LatLng } from '../types';

const EARTH_RADIUS_M = 6371000;

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Haversine distance in meters between two coordinates */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing (0..360 degrees, 0 = North) from a to b */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Destination point given start, bearing (deg), and distance (meters) */
export function destinationPoint(start: LatLng, bearingDeg: number, distanceMeters: number): LatLng {
  const angDist = distanceMeters / EARTH_RADIUS_M;
  const brng = toRad(bearingDeg);
  const lat1 = toRad(start.lat);
  const lng1 = toRad(start.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angDist) + Math.cos(lat1) * Math.sin(angDist) * Math.cos(brng)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(angDist) * Math.cos(lat1),
      Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2)
    );

  return { lat: toDeg(lat2), lng: toDeg(lng2) };
}

/** Compute cumulative distances (meters) along a [lng, lat][] polyline */
export function computeCumulativeDistances(coords: [number, number][]): number[] {
  const result: number[] = [0];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = haversineMeters(
      { lat: coords[i - 1][1], lng: coords[i - 1][0] },
      { lat: coords[i][1], lng: coords[i][0] }
    );
    total += d;
    result.push(total);
  }
  return result;
}

/** Find closest point on route polyline and return distance along route + off-route distance */
export function projectOntoRoute(
  point: LatLng,
  coords: [number, number][],
  cumulativeDistances: number[],
  hintIndex?: number
): {
  distanceAlongMeters: number;
  offRouteMeters: number;
  nearestIndex: number;
  heading: number;
} {
  if (coords.length === 0) {
    return { distanceAlongMeters: 0, offRouteMeters: 0, nearestIndex: 0, heading: 0 };
  }

  let bestIdx = 0;
  let bestDist = Infinity;

  // Search full polyline (for loops, prefer near hintIndex if provided to avoid jumping to end at start!)
  const startSearch = hintIndex !== undefined ? Math.max(0, hintIndex - 20) : 0;
  const endSearch =
    hintIndex !== undefined ? Math.min(coords.length - 1, hintIndex + 60) : coords.length - 1;

  for (let i = startSearch; i <= endSearch; i++) {
    const d = haversineMeters(point, { lat: coords[i][1], lng: coords[i][0] });
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  // Fallback global search if user is far from hint window
  if (bestDist > 120 && hintIndex !== undefined) {
    for (let i = 0; i < coords.length; i++) {
      const d = haversineMeters(point, { lat: coords[i][1], lng: coords[i][0] });
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
  }

  const nextIdx = Math.min(coords.length - 1, bestIdx + 1);
  const prevIdx = Math.max(0, bestIdx - 1);
  const heading =
    nextIdx !== bestIdx
      ? bearingDegrees(
          { lat: coords[bestIdx][1], lng: coords[bestIdx][0] },
          { lat: coords[nextIdx][1], lng: coords[nextIdx][0] }
        )
      : bearingDegrees(
          { lat: coords[prevIdx][1], lng: coords[prevIdx][0] },
          { lat: coords[bestIdx][1], lng: coords[bestIdx][0] }
        );

  return {
    distanceAlongMeters: cumulativeDistances[bestIdx] ?? 0,
    offRouteMeters: bestDist,
    nearestIndex: bestIdx,
    heading,
  };
}

/** Interpolate position and heading along polyline at a given distance in meters */
export function interpolateAlongRoute(
  distanceMeters: number,
  coords: [number, number][],
  cumulativeDistances: number[]
): { position: LatLng; heading: number; index: number } {
  if (coords.length === 0) {
    return { position: { lat: 0, lng: 0 }, heading: 0, index: 0 };
  }
  const total = cumulativeDistances[cumulativeDistances.length - 1] || 0;
  if (distanceMeters <= 0) {
    const heading =
      coords.length > 1
        ? bearingDegrees(
            { lat: coords[0][1], lng: coords[0][0] },
            { lat: coords[1][1], lng: coords[1][0] }
          )
        : 0;
    return { position: { lat: coords[0][1], lng: coords[0][0] }, heading, index: 0 };
  }
  if (distanceMeters >= total) {
    const last = coords.length - 1;
    const heading =
      last > 0
        ? bearingDegrees(
            { lat: coords[last - 1][1], lng: coords[last - 1][0] },
            { lat: coords[last][1], lng: coords[last][0] }
          )
        : 0;
    return { position: { lat: coords[last][1], lng: coords[last][0] }, heading, index: last };
  }

  // Binary search
  let lo = 0;
  let hi = cumulativeDistances.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cumulativeDistances[mid] <= distanceMeters) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const segStart = cumulativeDistances[lo];
  const segEnd = cumulativeDistances[hi];
  const segLen = Math.max(0.001, segEnd - segStart);
  const t = Math.max(0, Math.min(1, (distanceMeters - segStart) / segLen));

  const p1 = { lat: coords[lo][1], lng: coords[lo][0] };
  const p2 = { lat: coords[hi][1], lng: coords[hi][0] };
  return {
    position: {
      lat: p1.lat + (p2.lat - p1.lat) * t,
      lng: p1.lng + (p2.lng - p1.lng) * t,
    },
    heading: bearingDegrees(p1, p2),
    index: lo,
  };
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters / 10) * 10} m`;
  }
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) {
    return `${mins} min`;
  }
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} u` : `${h} u ${m} min`;
}

export function formatEta(remainingSeconds: number): string {
  const eta = new Date(Date.now() + remainingSeconds * 1000);
  return eta.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

export function generateGpx(route: GeneratedRoute): string {
  const escapeXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const waypoints = route.pois
    .map(
      (p) =>
        `  <wpt lat="${p.lat}" lon="${p.lng}"><name>${escapeXml(p.name)}</name><desc>${escapeXml(
          p.description
        )}</desc></wpt>`
    )
    .join('\n');

  const trackPoints = route.coordinates
    .map(([lng, lat]) => `      <trkpt lat="${lat}" lon="${lng}"></trkpt>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="CityExplorerPlus" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(route.name)}</name>
    <time>${route.createdAt}</time>
  </metadata>
${waypoints}
  <trk>
    <name>${escapeXml(route.name)}</name>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>`;
}

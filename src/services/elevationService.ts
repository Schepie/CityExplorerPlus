import type { ElevationPoint } from '../types';

/**
 * Fetch elevation profile along a route using the free Open-Meteo Elevation API (0 API key, 0 tokens).
 * Samples up to 40 evenly distributed points along the route.
 */
export async function fetchElevationProfile(
  coordinates: [number, number][],
  cumulativeDistances: number[]
): Promise<{ profile: ElevationPoint[]; gainMeters: number } | null> {
  if (coordinates.length < 2) return null;

  const sampleCount = Math.min(40, coordinates.length);
  const lats: string[] = [];
  const lngs: string[] = [];
  const sampleDistsKm: number[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const idx = Math.min(
      coordinates.length - 1,
      Math.round((i / (sampleCount - 1)) * (coordinates.length - 1))
    );
    lngs.push(coordinates[idx][0].toFixed(5));
    lats.push(coordinates[idx][1].toFixed(5));
    sampleDistsKm.push((cumulativeDistances[idx] ?? 0) / 1000);
  }

  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats.join(',')}&longitude=${lngs.join(',')}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;

    const json = await resp.json();
    const elevations: number[] = json?.elevation;
    if (!Array.isArray(elevations) || elevations.length !== sampleCount) return null;

    const profile: ElevationPoint[] = elevations.map((el, i) => ({
      distanceKm: Number(sampleDistsKm[i].toFixed(2)),
      elevationM: Math.round(el),
    }));

    // Compute smoothed ascent gain (ignore tiny 1m DEM jitter)
    let gain = 0;
    for (let i = 1; i < elevations.length; i++) {
      const diff = elevations[i] - elevations[i - 1];
      if (diff > 1.5) gain += diff;
    }

    return { profile, gainMeters: Math.round(gain) };
  } catch {
    return null;
  }
}

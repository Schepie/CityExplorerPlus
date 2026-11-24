import type { ActivityMode, GeneratedRoute, InterestId, LatLng } from '../types';

export interface SharedRoutePayload {
  v: 1;
  a: ActivityMode;
  d: number;
  s: [number, number]; // [lat, lng]
  i: InterestId[];
  sec: number;
  c?: string;
}

/** Encode a loop route blueprint into a compact shareable URL */
export function buildShareUrl(route: GeneratedRoute, cityName?: string): string {
  const payload: SharedRoutePayload = {
    v: 1,
    a: route.activity,
    d: Number(route.targetDistanceKm.toFixed(1)),
    s: [Number(route.startLocation.lat.toFixed(5)), Number(route.startLocation.lng.toFixed(5))],
    i: route.interestsUsed,
    sec: route.sectorIndex,
    c: cityName,
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?share=${encodeURIComponent(encoded)}`;
}

/** Parse a shared route blueprint from the current URL if present */
export function parseShareFromUrl(): {
  activity: ActivityMode;
  targetDistanceKm: number;
  start: LatLng;
  interests: InterestId[];
  sectorIndex: number;
  cityName?: string;
} | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('share');
    if (!raw) return null;
    const json = decodeURIComponent(escape(atob(raw)));
    const payload = JSON.parse(json) as SharedRoutePayload;
    if (payload.v !== 1 || !Array.isArray(payload.s) || payload.s.length !== 2) return null;
    return {
      activity: payload.a === 'cycling' ? 'cycling' : 'walking',
      targetDistanceKm: payload.d || 5,
      start: { lat: payload.s[0], lng: payload.s[1] },
      interests: Array.isArray(payload.i) ? payload.i : [],
      sectorIndex: typeof payload.sec === 'number' ? payload.sec : 0,
      cityName: payload.c,
    };
  } catch {
    return null;
  }
}

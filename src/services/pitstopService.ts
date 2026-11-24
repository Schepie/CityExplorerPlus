import type { LatLng, Pitstop, PitstopType } from '../types';
import { haversineMeters } from '../utils/geo';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const PITSTOP_TAGS: Record<PitstopType, { osm: string; defaultName: string }> = {
  toilet: { osm: '["amenity"="toilets"]', defaultName: 'Openbaar toilet' },
  water: { osm: '["amenity"="drinking_water"]', defaultName: 'Drinkwaterpunt' },
  cafe: { osm: '["amenity"="cafe"]', defaultName: 'Koffie / Café' },
};

/** Find nearby toilets, drinking water, or cafes within 900m via OpenStreetMap Overpass (0 tokens) */
export async function fetchNearbyPitstops(
  center: LatLng,
  type: PitstopType,
  radiusMeters = 900
): Promise<Pitstop[]> {
  const cfg = PITSTOP_TAGS[type];
  const query = `[out:json][timeout:12];(node${cfg.osm}(around:${radiusMeters},${center.lat},${center.lng});way${cfg.osm}(around:${radiusMeters},${center.lat},${center.lng}););out center 25;`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) continue;

      const data = await resp.json();
      const elements: any[] = data?.elements || [];

      return elements
        .map((el) => {
          const lat = el.lat ?? el.center?.lat;
          const lng = el.lon ?? el.center?.lon;
          if (lat === undefined || lng === undefined) return null;
          const tags = el.tags || {};
          const name = tags.name || cfg.defaultName;
          return {
            id: `pit-${type}-${el.id}`,
            type,
            name,
            lat,
            lng,
            distanceMeters: Math.round(haversineMeters(center, { lat, lng })),
          } as Pitstop;
        })
        .filter((item): item is Pitstop => item !== null)
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, 8);
    } catch {
      // Try next mirror
    }
  }

  return [];
}

import type { LatLng, SearchPlace } from '../types';

/**
 * Free geocoding search using Komoot's Photon API (OpenStreetMap data, 0 tokens, no API key)
 * with automatic fallback to Nominatim.
 */
export async function searchPlaces(query: string, bias?: LatLng): Promise<SearchPlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  // 1. Try Photon (fast, autocomplete-friendly)
  try {
    const params = new URLSearchParams({
      q,
      limit: '6',
      lang: 'nl',
    });
    if (bias) {
      params.set('lat', bias.lat.toFixed(4));
      params.set('lon', bias.lng.toFixed(4));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const resp = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (resp.ok) {
      const data = await resp.json();
      const features: any[] = data?.features || [];
      if (features.length > 0) {
        return features.map((f, idx) => {
          const props = f.properties || {};
          const [lng, lat] = f.geometry.coordinates;
          const name = props.name || props.street || props.city || q;
          const city = props.city || props.town || props.village || props.municipality || props.name;
          const subtitleParts = [
            props.street && props.housenumber
              ? `${props.street} ${props.housenumber}`
              : props.street,
            props.city || props.town || props.village,
            props.state,
            props.country,
          ].filter((v, i, arr) => Boolean(v) && v !== name && arr.indexOf(v) === i);

          return {
            id: `photon-${props.osm_id || idx}-${lat.toFixed(4)}`,
            name,
            subtitle: subtitleParts.join(', ') || props.country || 'Locatie',
            city,
            lat,
            lng,
          };
        });
      }
    }
  } catch {
    // Fall through to Nominatim
  }

  // 2. Fallback: Nominatim OpenStreetMap search
  try {
    const params = new URLSearchParams({
      q,
      format: 'json',
      addressdetails: '1',
      limit: '6',
      'accept-language': 'nl',
    });
    const resp = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
    if (!resp.ok) return [];
    const items: any[] = await resp.json();
    return items.map((item) => {
      const addr = item.address || {};
      const city = addr.city || addr.town || addr.village || addr.municipality || item.name;
      const parts = (item.display_name as string).split(',').map((s) => s.trim());
      return {
        id: `nom-${item.place_id}`,
        name: parts[0] || q,
        subtitle: parts.slice(1, 4).join(', '),
        city,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      };
    });
  } catch {
    return [];
  }
}

/** Reverse geocode a coordinate to a short human-readable Dutch place/city name */
export async function reverseGeocode(pos: LatLng): Promise<{ label: string; city?: string }> {
  try {
    const resp = await fetch(
      `https://photon.komoot.io/reverse?lat=${pos.lat.toFixed(5)}&lon=${pos.lng.toFixed(5)}&lang=nl`
    );
    if (resp.ok) {
      const data = await resp.json();
      const props = data?.features?.[0]?.properties;
      if (props) {
        const city = props.city || props.town || props.village || props.municipality;
        const street = props.street
          ? props.housenumber
            ? `${props.street} ${props.housenumber}`
            : props.street
          : props.name;
        const label = [street, city].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i).join(', ');
        if (label) return { label, city };
      }
    }
  } catch {
    // Ignore offline / network errors
  }
  return { label: `Startpunt (${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)})` };
}

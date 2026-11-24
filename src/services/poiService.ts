import { DEFAULT_INTEREST, INTEREST_MAP } from '../data/interests';
import type { InterestId, LatLng, POI } from '../types';
import { haversineMeters } from '../utils/geo';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const POI_CACHE_KEY = 'cep_poi_wiki_cache_v2';

interface WikiSummary {
  description: string;
  descriptionLang?: 'nl' | 'en' | 'de' | 'fr';
  imageUrl?: string;
  wikipediaUrl?: string;
  cachedAt: number;
}

function loadWikiCache(): Record<string, WikiSummary> {
  try {
    const raw = localStorage.getItem(POI_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveWikiCache(cache: Record<string, WikiSummary>) {
  try {
    const keys = Object.keys(cache);
    if (keys.length > 250) {
      keys
        .sort((a, b) => (cache[a].cachedAt || 0) - (cache[b].cachedAt || 0))
        .slice(0, keys.length - 200)
        .forEach((k) => delete cache[k]);
    }
    localStorage.setItem(POI_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage quota errors
  }
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Determine which selected interest category best matches an OSM element */
function matchCategory(tags: Record<string, string>, activeInterests: InterestId[]): InterestId {
  for (const interestId of activeInterests) {
    const cfg = INTEREST_MAP[interestId];
    for (const rule of cfg.osmTags) {
      if (tags[rule.key] && (!rule.value || tags[rule.key] === rule.value)) {
        return interestId;
      }
    }
  }
  return activeInterests[0] ?? DEFAULT_INTEREST;
}

/** Build a friendly Dutch fallback description from OSM tags (0 AI tokens!) */
function buildOsmFallbackDescription(
  name: string,
  tags: Record<string, string>,
  categoryLabel: string
): string {
  if (tags['description:nl']) return tags['description:nl'];
  if (tags.description) return tags.description;

  const parts: string[] = [];
  const typeLabels: Record<string, string> = {
    castle: 'historisch kasteel',
    monument: 'monument',
    memorial: 'gedenkteken',
    ruins: 'historische ruïne',
    windmill: 'historische molen',
    watermill: 'watermolen',
    city_gate: 'stadspoort',
    museum: 'museum',
    artwork: 'kunstwerk',
    gallery: 'kunstgalerie',
    viewpoint: 'uitkijkpunt',
    attraction: 'bezienswaardigheid',
    park: 'stadspark',
    garden: 'tuin',
    nature_reserve: 'natuurgebied',
    fountain: 'fontein',
    cafe: 'gezellig café',
    biergarten: 'terras',
    brewery: 'brouwerij',
    theatre: 'theater',
    tower: 'toren',
  };

  const subtype =
    typeLabels[tags.historic] ||
    typeLabels[tags.tourism] ||
    typeLabels[tags.leisure] ||
    typeLabels[tags.amenity] ||
    typeLabels[tags.man_made] ||
    typeLabels[tags.craft];

  if (subtype) {
    parts.push(`${name} is een ${subtype} in de categorie ${categoryLabel.toLowerCase()}.`);
  } else {
    parts.push(`${name} is een interessante stop in de categorie ${categoryLabel.toLowerCase()}.`);
  }

  if (tags.artist_name) parts.push(`Gemaakt door ${tags.artist_name}.`);
  if (tags.start_date) parts.push(`Dateert uit ${tags.start_date}.`);
  if (tags['addr:street']) {
    const addr = tags['addr:housenumber']
      ? `${tags['addr:street']} ${tags['addr:housenumber']}`
      : tags['addr:street'];
    parts.push(`Gelegen aan ${addr}.`);
  }
  if (tags.opening_hours) parts.push(`Openingstijden: ${tags.opening_hours}.`);

  return parts.join(' ');
}

/** Fetch POIs from OpenStreetMap Overpass API (fast nwr query + 3 mirrors) */
async function fetchOverpassPois(
  center: LatLng,
  clampedRadius: number,
  effectiveInterests: InterestId[]
): Promise<POI[]> {
  const filterClauses: string[] = [];
  const seenFilter = new Set<string>();

  for (const interestId of effectiveInterests) {
    const cfg = INTEREST_MAP[interestId];
    for (const rule of cfg.osmTags) {
      const expr = rule.value
        ? `["${rule.key}"="${rule.value}"]["name"]`
        : `["${rule.key}"]["name"]`;
      if (!seenFilter.has(expr)) {
        seenFilter.add(expr);
        // `nwr` queries nodes + ways + relations in one compact clause
        filterClauses.push(
          `nwr${expr}(around:${Math.round(clampedRadius)},${center.lat.toFixed(5)},${center.lng.toFixed(5)});`
        );
      }
    }
  }

  const query = `[out:json][timeout:12];(\n${filterClauses.join('\n')}\n);out center 120;`;

  let data: { elements?: OverpassElement[] } | null = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!resp.ok) continue;
      data = await resp.json();
      if (data?.elements) break;
    } catch {
      // Try next mirror
    }
  }

  if (!data?.elements) return [];

  const pois: POI[] = [];
  for (const el of data.elements) {
    const tags = el.tags || {};
    const name = (tags['name:nl'] || tags.name || '').trim();
    if (!name || name.length < 2) continue;

    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat === undefined || lng === undefined) continue;

    const dist = haversineMeters(center, { lat, lng });
    const category = matchCategory(tags, effectiveInterests);
    const categoryLabel = INTEREST_MAP[category].label;

    let score = 25; // Bonus for direct interest-tag match from OpenStreetMap
    if (tags.wikipedia || tags['wikipedia:nl']) score += 45;
    if (tags.wikidata) score += 25;
    if (tags.description || tags['description:nl']) score += 15;
    if (tags.heritage) score += 15;
    if (tags.tourism === 'attraction' || tags.tourism === 'museum' || tags.historic === 'castle') {
      score += 20;
    }
    if (tags.tourism === 'viewpoint' || tags.historic === 'monument') score += 14;

    pois.push({
      id: `${el.type}-${el.id}`,
      name,
      lat,
      lng,
      category,
      categoryLabel,
      description: buildOsmFallbackDescription(name, tags, categoryLabel),
      wikipediaTag: tags['wikipedia:nl'] || tags.wikipedia,
      wikidataTag: tags.wikidata,
      tags,
      score,
      distanceFromStart: dist,
    });
  }

  return pois;
}

/**
 * Fast, rock-solid Wikipedia GeoSearch (NL + EN in parallel, up to 50 POIs each, 0 tokens, never rate-limited!).
 * Filters out non-POI articles like metro stations, streets, or districts when better landmarks exist.
 */
async function fetchWikipediaGeoPois(
  center: LatLng,
  radiusMeters: number,
  category: InterestId
): Promise<POI[]> {
  const r = Math.min(10000, Math.max(500, Math.round(radiusMeters)));
  const langs: Array<'nl' | 'en'> = ['nl', 'en'];

  const skipPattern =
    /^(lijst van|metrostation|station |tramhalte|busstation|spoorlijn|gemeente |arrondissement|list of |.*metro station)/i;

  const results = await Promise.all(
    langs.map(async (lang) => {
      try {
        const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${center.lat.toFixed(5)}|${center.lng.toFixed(5)}&gsradius=${r}&gslimit=50&format=json&origin=*`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 7000);
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!resp.ok) return [];
        const json = await resp.json();
        const list: Array<{ pageid: number; title: string; lat: number; lon: number; dist: number }> =
          json?.query?.geosearch || [];

        return list
          .filter((item) => !skipPattern.test(item.title))
          .map((item) => ({
            id: `wiki-${lang}-${item.pageid}`,
            name: item.title,
            lat: item.lat,
            lng: item.lon,
            category,
            categoryLabel: INTEREST_MAP[category].label,
            description: `${item.title} — bezienswaardigheid langs jouw route.`,
            descriptionLang: lang,
            wikipediaTag: `${lang}:${item.title}`,
            tags: {},
            score: lang === 'nl' ? 58 : 44,
            distanceFromStart: item.dist,
          }));
      } catch {
        return [];
      }
    })
  );

  return results.flat();
}

/**
 * Discover POIs around a coordinate by running OpenStreetMap Overpass AND
 * Wikipedia GeoSearch (NL + EN) in parallel, so we ALWAYS return rich POIs
 * even when Overpass rate-limits (HTTP 429).
 */
export async function fetchPoisAround(
  center: LatLng,
  radiusMeters: number,
  selectedInterests: InterestId[]
): Promise<POI[]> {
  const effectiveInterests: InterestId[] =
    selectedInterests.length > 0 ? selectedInterests : [DEFAULT_INTEREST];

  const clampedRadius = Math.min(Math.max(radiusMeters, 800), 10000);

  // Run Overpass + Wikipedia GeoSearch in parallel!
  const [osmPois, wikiPois] = await Promise.all([
    fetchOverpassPois(center, clampedRadius, effectiveInterests),
    fetchWikipediaGeoPois(center, clampedRadius, effectiveInterests[0]),
  ]);

  // Merge & deduplicate (OSM matches win over duplicate Wikipedia entries by name or <45m proximity)
  const merged: POI[] = [];
  const seenNames = new Set<string>();

  const addIfUnique = (poi: POI) => {
    const key = poi.name.toLowerCase().trim();
    if (seenNames.has(key)) return;
    const duplicateCoord = merged.some(
      (m) => haversineMeters({ lat: m.lat, lng: m.lng }, { lat: poi.lat, lng: poi.lng }) < 40
    );
    if (duplicateCoord) return;
    seenNames.add(key);
    merged.push(poi);
  };

  // Prioritize OSM POIs matching exact selected interests, then Wikipedia highlights
  osmPois.sort((a, b) => b.score - a.score).forEach(addIfUnique);
  wikiPois.sort((a, b) => b.score - a.score).forEach(addIfUnique);

  return merged.sort((a, b) => b.score - a.score);
}

/** Enrich a list of selected route POIs with free Dutch/English Wikipedia summaries & photos */
export async function enrichPoisWithWikipedia(pois: POI[]): Promise<POI[]> {
  const cache = loadWikiCache();
  let cacheDirty = false;

  const enriched = await Promise.all(
    pois.map(async (poi) => {
      const cacheKey = poi.wikipediaTag || `name:${poi.name.toLowerCase()}`;
      if (cache[cacheKey]) {
        return {
          ...poi,
          description: cache[cacheKey].description,
          descriptionLang: cache[cacheKey].descriptionLang ?? 'nl',
          imageUrl: cache[cacheKey].imageUrl,
          wikipediaUrl: cache[cacheKey].wikipediaUrl,
        };
      }

      const summary = await fetchWikipediaSummary(poi);
      if (summary) {
        cache[cacheKey] = { ...summary, cachedAt: Date.now() };
        cacheDirty = true;
        return {
          ...poi,
          description: summary.description,
          descriptionLang: summary.descriptionLang ?? 'nl',
          imageUrl: summary.imageUrl,
          wikipediaUrl: summary.wikipediaUrl,
        };
      }
      return { ...poi, descriptionLang: (poi.descriptionLang ?? 'nl') as 'nl' | 'en' | 'de' | 'fr' };
    })
  );

  if (cacheDirty) {
    saveWikiCache(cache);
  }
  return enriched;
}

async function fetchWikipediaSummary(
  poi: POI
): Promise<{
  description: string;
  descriptionLang: 'nl' | 'en' | 'de' | 'fr';
  imageUrl?: string;
  wikipediaUrl?: string;
} | null> {
  // 1. Try Dutch Wikipedia first by name
  const nlByName = await queryWikiRestSummary('nl', poi.name);
  if (nlByName) return nlByName;

  // 2. Try explicit wikipedia tag
  if (poi.wikipediaTag) {
    const parts = poi.wikipediaTag.split(':');
    const rawLang = parts.length > 1 ? parts[0].toLowerCase() : 'nl';
    const lang: 'nl' | 'en' | 'de' | 'fr' =
      rawLang === 'en' || rawLang === 'de' || rawLang === 'fr' ? rawLang : 'nl';
    const title = parts.length > 1 ? parts.slice(1).join(':') : parts[0];
    const res = await queryWikiRestSummary(lang, title);
    if (res) return res;
  }

  // 3. Fallback to English Wikipedia
  const enByName = await queryWikiRestSummary('en', poi.name);
  if (enByName) return enByName;

  return null;
}

async function queryWikiRestSummary(
  lang: 'nl' | 'en' | 'de' | 'fr',
  title: string
): Promise<{
  description: string;
  descriptionLang: 'nl' | 'en' | 'de' | 'fr';
  imageUrl?: string;
  wikipediaUrl?: string;
} | null> {
  try {
    const cleanTitle = encodeURIComponent(title.trim().replace(/ /g, '_'));
    const resp = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${cleanTitle}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data?.extract || data.type === 'disambiguation') return null;

    const sentences = (data.extract as string).match(/[^.!?]+[.!?]+/g) || [data.extract];
    const shortText = sentences.slice(0, 3).join(' ').trim();

    return {
      description: shortText,
      descriptionLang: lang,
      imageUrl: data.thumbnail?.source,
      wikipediaUrl: data.content_urls?.mobile?.page || data.content_urls?.desktop?.page,
    };
  } catch {
    return null;
  }
}

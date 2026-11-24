import { DEFAULT_INTEREST, INTEREST_MAP } from '../data/interests';
import type { InterestId, LatLng, POI } from '../types';
import { haversineMeters } from '../utils/geo';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const POI_CACHE_KEY = 'cep_poi_wiki_cache_v1';

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
    // Keep cache compact (max 250 entries)
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
function buildOsmFallbackDescription(name: string, tags: Record<string, string>, categoryLabel: string): string {
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

  if (tags.artist_name) {
    parts.push(`Gemaakt door ${tags.artist_name}.`);
  }
  if (tags.start_date) {
    parts.push(`Dateert uit ${tags.start_date}.`);
  }
  if (tags['addr:street']) {
    const addr = tags['addr:housenumber']
      ? `${tags['addr:street']} ${tags['addr:housenumber']}`
      : tags['addr:street'];
    parts.push(`Gelegen aan ${addr}.`);
  }
  if (tags.opening_hours) {
    parts.push(`Openingstijden: ${tags.opening_hours}.`);
  }

  return parts.join(' ');
}

/** Fetch POIs around a center coordinate using OpenStreetMap Overpass API (0 tokens!) */
export async function fetchPoisAround(
  center: LatLng,
  radiusMeters: number,
  selectedInterests: InterestId[]
): Promise<POI[]> {
  const effectiveInterests: InterestId[] =
    selectedInterests.length > 0 ? selectedInterests : [DEFAULT_INTEREST];

  // Clamp radius so Overpass stays fast
  const clampedRadius = Math.min(Math.max(radiusMeters, 800), 12000);

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
        filterClauses.push(`node${expr}(around:${Math.round(clampedRadius)},${center.lat},${center.lng});`);
        filterClauses.push(`way${expr}(around:${Math.round(clampedRadius)},${center.lat},${center.lng});`);
      }
    }
  }

  const query = `[out:json][timeout:18];(\n${filterClauses.join('\n')}\n);out center 120;`;

  let data: { elements?: OverpassElement[] } | null = null;
  let lastError: unknown = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 16000);
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);
      data = await resp.json();
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!data?.elements) {
    console.warn('Overpass fallback triggered:', lastError);
    return fetchWikipediaGeoPoisFallback(center, clampedRadius, effectiveInterests[0]);
  }

  const seenNames = new Set<string>();
  const pois: POI[] = [];

  for (const el of data.elements) {
    const tags = el.tags || {};
    const name = (tags['name:nl'] || tags.name || '').trim();
    if (!name || name.length < 2) continue;

    const normalizedName = name.toLowerCase();
    if (seenNames.has(normalizedName)) continue;
    seenNames.add(normalizedName);

    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat === undefined || lng === undefined) continue;

    const dist = haversineMeters(center, { lat, lng });
    // Skip POIs directly on top of the start point (< 80m) so the loop actually goes somewhere
    if (dist < 80) continue;

    const category = matchCategory(tags, effectiveInterests);
    const categoryLabel = INTEREST_MAP[category].label;

    // Score POI quality (prefer POIs with Wikipedia/Wikidata/heritage/images)
    let score = 10;
    if (tags.wikipedia || tags['wikipedia:nl']) score += 45;
    if (tags.wikidata) score += 25;
    if (tags.description || tags['description:nl']) score += 15;
    if (tags.heritage) score += 15;
    if (tags.tourism === 'attraction' || tags.tourism === 'museum' || tags.historic === 'castle') {
      score += 18;
    }
    if (tags.tourism === 'viewpoint' || tags.historic === 'monument') score += 12;

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

  // If Overpass returned very few results, supplement with Wikipedia GeoSearch!
  if (pois.length < 3) {
    const wikiPois = await fetchWikipediaGeoPoisFallback(center, clampedRadius, effectiveInterests[0]);
    for (const wp of wikiPois) {
      if (!seenNames.has(wp.name.toLowerCase())) {
        seenNames.add(wp.name.toLowerCase());
        pois.push(wp);
      }
    }
  }

  return pois.sort((a, b) => b.score - a.score);
}

/** Free Wikipedia GeoSearch fallback if Overpass has sparse data */
async function fetchWikipediaGeoPoisFallback(
  center: LatLng,
  radiusMeters: number,
  category: InterestId
): Promise<POI[]> {
  try {
    const r = Math.min(10000, Math.max(500, Math.round(radiusMeters)));
    const url = `https://nl.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${center.lat}|${center.lng}&gsradius=${r}&gslimit=25&format=json&origin=*`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const json = await resp.json();
    const list: Array<{ pageid: number; title: string; lat: number; lon: number; dist: number }> =
      json?.query?.geosearch || [];

    return list
      .filter((item) => item.dist >= 80)
      .map((item) => ({
        id: `wiki-${item.pageid}`,
        name: item.title,
        lat: item.lat,
        lng: item.lon,
        category,
        categoryLabel: INTEREST_MAP[category].label,
        description: `${item.title} — bezienswaardigheid langs jouw route.`,
        wikipediaTag: `nl:${item.title}`,
        tags: {},
        score: 50,
        distanceFromStart: item.dist,
      }));
  } catch {
    return [];
  }
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
      return { ...poi, descriptionLang: 'nl' as const };
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
  // 1. Try Dutch Wikipedia first by name (best experience for Dutch users)
  const nlByName = await queryWikiRestSummary('nl', poi.name);
  if (nlByName) return nlByName;

  // 2. Try explicit wikipedia tag (e.g. "nl:Domtoren", "en:Eiffel Tower", "fr:Tour Eiffel", "de:Brandenburger Tor")
  if (poi.wikipediaTag) {
    const parts = poi.wikipediaTag.split(':');
    const rawLang = parts.length > 1 ? parts[0].toLowerCase() : 'nl';
    const lang: 'nl' | 'en' | 'de' | 'fr' =
      rawLang === 'en' || rawLang === 'de' || rawLang === 'fr' ? rawLang : 'nl';
    const title = parts.length > 1 ? parts.slice(1).join(':') : parts[0];
    const res = await queryWikiRestSummary(lang, title);
    if (res) return res;
  }

  // 3. Fallback to English Wikipedia (great for international city trips like Paris, London, Rome)
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

    // Trim extract to 2-3 clear sentences for pleasant popup & TTS reading
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

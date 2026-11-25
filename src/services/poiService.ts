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

/** Title patterns for mundane infrastructure (roads, highway bridges, stations, schools) that are NOT scenic POIs */
const NON_POI_TITLE_PATTERN =
  /^(lijst van|list of |metrostation|station |spoorwegstation|tramhalte|busstation|spoorlijn|spoorbrug|gemeente |arrondissement|gewestweg|rijksweg|provinciale weg|autosnelweg|snelweg|ringweg|ring van |grote ring|kleine ring|knooppunt |verkeerswisselaar|viaduct |brug bij |brug over |fietsbrug|voetgangersbrug|verkeersbrug|afrit |oprit |tunnel |bedrijventerrein|industrieterrein|ziekenhuis|campus |hogeschool|universiteit|basisschool|middelbare school)|\b(N\d{1,3}|R\d{1,2}|A\d{1,3}|E\d{2,3})\b|\((ring|N\d+|R\d+|A\d+|E\d+|brug|weg|station|metro|tram)\)|(highway|motorway|interchange|junction|metro station|railway station|train station|ring road)/i;

/** Description patterns indicating mundane road/bridge infrastructure with no historical value */
const INFRA_DESC_PATTERN =
  /\b(gewestweg|rijksweg|provinciale weg|autosnelweg|snelweg|ringweg|grote ring|kleine ring|verkeerswisselaar|knooppunt|liggerbrug|plaatbrug|balkbrug|viaduct|spoorbrug|spoorlijn|spoorweg|verkeersbrug|weg in belgië|weg in nederland|nationale weg|motorway|expressway|ring road|highway bridge|railway bridge)\b/i;

/** Positive historical / heritage signals that allow a truly historic bridge or ancient road */
const HISTORIC_VALUE_PATTERN =
  /\b(historisch|monument|erfgoed|beschermd|middeleeuw|romeins|oudste|eeuwse|1[0-8]e eeuw|1[0-8]\d{2}|unesco|werelderfgoed|historic|heritage|medieval|ancient|roman|listed building|monumental)\b/i;

export function isNonScenicInfrastructurePoi(poi: POI): boolean {
  if (poi.isCustomStop) return false;
  // OSM POIs explicitly tagged as historic or heritage are always kept
  if (poi.tags?.historic || poi.tags?.heritage) return false;

  // Check title first
  if (NON_POI_TITLE_PATTERN.test(poi.name)) {
    return !HISTORIC_VALUE_PATTERN.test(poi.description);
  }

  // Check description for mundane roads/bridges without historical value
  if (INFRA_DESC_PATTERN.test(poi.description) && !HISTORIC_VALUE_PATTERN.test(poi.description)) {
    return true;
  }

  return false;
}

/**
 * Fast, rock-solid Wikipedia GeoSearch (NL + EN in parallel, up to 50 POIs each, 0 tokens, never rate-limited!).
 * Filters out mundane infrastructure like highway bridges, ring roads, metro stations, and schools.
 */
async function fetchWikipediaGeoPois(
  center: LatLng,
  radiusMeters: number,
  category: InterestId
): Promise<POI[]> {
  const r = Math.min(10000, Math.max(500, Math.round(radiusMeters)));
  const langs: Array<'nl' | 'en'> = ['nl', 'en'];

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
          .filter((item) => !NON_POI_TITLE_PATTERN.test(item.title))
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

const GEOAPIFY_CAT_MAP: Record<InterestId, string> = {
  toerisme: 'tourism.sights,tourism.attraction',
  erfgoed: 'heritage,tourism.sights.castle,tourism.sights.memorial',
  natuur: 'leisure.park,natural',
  kunst: 'entertainment.culture.gallery,tourism.sights.artwork',
  cultuur: 'entertainment.museum,entertainment.culture.theatre',
  uitzicht: 'tourism.sights.tower,tourism.attraction.viewpoint',
  horeca: 'catering.cafe,catering.pub,catering.biergarten',
  water: 'natural.water,leisure.marina',
};

/** Optional fast Geoapify Places POI search (only runs if user configured their free Geoapify key) */
async function fetchGeoapifyPois(
  center: LatLng,
  clampedRadius: number,
  effectiveInterests: InterestId[],
  apiKey: string
): Promise<POI[]> {
  if (!apiKey.trim()) return [];
  try {
    const categories = Array.from(
      new Set(effectiveInterests.map((id) => GEOAPIFY_CAT_MAP[id]).join(',').split(','))
    ).join(',');
    const url = `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(
      categories
    )}&filter=circle:${center.lng.toFixed(5)},${center.lat.toFixed(5)},${Math.round(
      clampedRadius
    )}&limit=40&apiKey=${encodeURIComponent(apiKey.trim())}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) return [];
    const data = await resp.json();
    const features: any[] = data?.features || [];
    const primaryCat = effectiveInterests[0] ?? DEFAULT_INTEREST;

    return features
      .map((f) => {
        const props = f.properties || {};
        const name = (props.name || '').trim();
        const [lng, lat] = f.geometry?.coordinates || [];
        if (!name || lat === undefined || lng === undefined) return null;
        if (NON_POI_TITLE_PATTERN.test(name)) return null;
        const address = props.address_line2 || props.street || '';
        const poi: POI = {
          id: `geoapify-${props.place_id || `${lat}-${lng}`}`,
          name,
          lat,
          lng,
          category: primaryCat,
          categoryLabel: INTEREST_MAP[primaryCat].label,
          description: address
            ? `${name}, gelegen aan ${address}.`
            : `${name} — aanbevolen stop in de categorie ${INTEREST_MAP[primaryCat].label.toLowerCase()}.`,
          descriptionLang: 'nl',
          tags: {},
          score: 52,
          distanceFromStart: haversineMeters(center, { lat, lng }),
        };
        return poi;
      })
      .filter((p): p is POI => p !== null);
  } catch {
    return [];
  }
}

/** Optional Gemini Flash-Lite audiogids story for POIs without a Wikipedia summary (100% locally cached!) */
async function generateGeminiPoiStory(
  poi: POI,
  apiKey: string
): Promise<{ description: string; descriptionLang: 'nl' } | null> {
  if (!apiKey.trim()) return null;
  try {
    const prompt = `Schrijf een korte, boeiende audiogids-uitleg van maximaal 2 à 3 zinnen in natuurlijk Nederlands over de bezienswaardigheid "${poi.name}" (categorie: ${poi.categoryLabel}, coördinaten: ${poi.lat.toFixed(4)}, ${poi.lng.toFixed(4)}). Geen opsommingstekens, geen aanhef, alleen de gesproken tekst.`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${encodeURIComponent(
      apiKey.trim()
    )}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 120, temperature: 0.5 },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const json = await resp.json();
    const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return null;
    return { description: text, descriptionLang: 'nl' };
  } catch {
    return null;
  }
}

export function clearLocalPoiCache(): void {
  try {
    localStorage.removeItem(POI_CACHE_KEY);
  } catch {
    // Ignore
  }
}

export function getLocalPoiCacheCount(): number {
  return Object.keys(loadWikiCache()).length;
}

/**
 * Fetch real unpaved / forest / hiking trail anchor points around `center` from OpenStreetMap
 * so loop routes actively follow genuine walking trails & unpaved tracks instead of paved roads.
 */
export async function fetchTrailNodesAround(
  center: LatLng,
  radiusMeters: number
): Promise<LatLng[]> {
  const r = Math.min(Math.max(Math.round(radiusMeters), 800), 9000);
  const query = `[out:json][timeout:10];(
way["highway"~"^(path|track|bridleway)$"]["access"!="private"]["access"!="no"](around:${r},${center.lat.toFixed(5)},${center.lng.toFixed(5)});
way["highway"="footway"]["surface"~"^(unpaved|gravel|fine_gravel|compacted|dirt|earth|ground|sand|grass|woodchips)$"](around:${r},${center.lat.toFixed(5)},${center.lng.toFixed(5)});
);out center 80;`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7500);
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) continue;
      const data = await resp.json();
      const elements: OverpassElement[] = data?.elements || [];
      const pts: LatLng[] = [];
      for (const el of elements) {
        const lat = el.center?.lat ?? el.lat;
        const lng = el.center?.lon ?? el.lon;
        if (lat !== undefined && lng !== undefined) {
          pts.push({ lat, lng });
        }
      }
      if (pts.length > 0) return pts;
    } catch {
      // Try next Overpass mirror
    }
  }
  return [];
}

/** Descriptions on Wikidata that indicate administrative areas or non-POI items */
const WIKIDATA_SKIP_DESC_PATTERN =
  /\b(plaats in|dorp in|gehucht in|deelgemeente|gemeente in|stad in|arrondissement|provincie|spoorwegstation|metrostation|tramhalte|vereniging|voetbalclub|sportclub|school|ziekenhuis|rivier in|beek in|waterloop|gewestweg|rijksweg|autosnelweg|snelweg|ringweg|verkeersbrug|liggerbrug|bedrijventerrein|village in|municipality in|town in|city in|district in|railway station|river in)\b/i;

/**
 * Fast, 100% free Wikidata GeoSearch + Entity enrichment (0 API key, 0 tokens, CORS-enabled).
 * Discovers real local heritage (kapellen, kastelen, natuurgebieden, monumenten) with
 * sitelinks popularity scores and direct Wikimedia Commons P18 photos!
 */
async function fetchWikidataGeoPois(
  center: LatLng,
  radiusMeters: number,
  category: InterestId
): Promise<POI[]> {
  try {
    const r = Math.min(10000, Math.max(600, Math.round(radiusMeters)));
    const geoUrl = `https://www.wikidata.org/w/api.php?action=query&list=geosearch&gscoord=${center.lat.toFixed(
      5
    )}|${center.lng.toFixed(5)}&gsradius=${r}&gslimit=35&format=json&origin=*`;
    const c1 = new AbortController();
    const t1 = setTimeout(() => c1.abort(), 7000);
    const geoResp = await fetch(geoUrl, { signal: c1.signal });
    clearTimeout(t1);
    if (!geoResp.ok) return [];
    const geoJson = await geoResp.json();
    const items: Array<{ title: string; lat: number; lon: number; dist: number }> =
      geoJson?.query?.geosearch || [];
    if (items.length === 0) return [];

    const ids = items.map((i) => i.title).join('|');
    const entUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(
      ids
    )}&props=labels|descriptions|claims|sitelinks&languages=nl|en&format=json&origin=*`;
    const c2 = new AbortController();
    const t2 = setTimeout(() => c2.abort(), 7000);
    const entResp = await fetch(entUrl, { signal: c2.signal });
    clearTimeout(t2);
    if (!entResp.ok) return [];
    const entJson = await entResp.json();
    const entities: Record<string, any> = entJson?.entities || {};

    const pois: POI[] = [];
    for (const item of items) {
      const ent = entities[item.title];
      if (!ent) continue;

      const labelNl: string | undefined = ent.labels?.nl?.value;
      const labelEn: string | undefined = ent.labels?.en?.value;
      const name = (labelNl || labelEn || '').trim();
      if (!name || name.length < 2 || NON_POI_TITLE_PATTERN.test(name)) continue;

      const descNl: string | undefined = ent.descriptions?.nl?.value;
      const descEn: string | undefined = ent.descriptions?.en?.value;
      const rawDesc = (descNl || descEn || '').trim();
      if (rawDesc && WIKIDATA_SKIP_DESC_PATTERN.test(rawDesc)) continue;
      if (rawDesc && INFRA_DESC_PATTERN.test(rawDesc) && !HISTORIC_VALUE_PATTERN.test(rawDesc)) {
        continue;
      }

      // Extract Wikimedia Commons P18 photo if available
      const p18File: string | undefined =
        ent.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      const imageUrl = p18File
        ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
            p18File.replace(/ /g, '_')
          )}?width=480`
        : undefined;

      // Sitelinks count = popularity signal; also get exact nlwiki/enwiki title if present
      const sitelinks = ent.sitelinks || {};
      const sitelinkCount = Object.keys(sitelinks).length;
      const nlWikiTitle: string | undefined = sitelinks.nlwiki?.title;
      const enWikiTitle: string | undefined = sitelinks.enwiki?.title;
      const wikipediaTag = nlWikiTitle
        ? `nl:${nlWikiTitle}`
        : enWikiTitle
          ? `en:${enWikiTitle}`
          : undefined;

      // Infer better category from Dutch/English description
      let inferredCat: InterestId = category;
      if (/natuurgebied|bos|park|tuin|heide|nature reserve|forest/i.test(rawDesc)) {
        inferredCat = 'natuur';
      } else if (/kasteel|kapel|kerk|hoeve|molen|monument|erfgoed|castle|chapel|church/i.test(rawDesc)) {
        inferredCat = 'erfgoed';
      } else if (/museum|theater|cultuur/i.test(rawDesc)) {
        inferredCat = 'cultuur';
      } else if (/beeld|kunst|standbeeld|sculpture|artwork/i.test(rawDesc)) {
        inferredCat = 'kunst';
      }

      const description = rawDesc
        ? `${name} — ${rawDesc.charAt(0).toUpperCase()}${rawDesc.slice(1)}.`
        : `${name} — erfgoed- of bezienswaardigheid langs jouw route.`;

      const score = 46 + Math.min(30, sitelinkCount * 4) + (imageUrl ? 12 : 0);

      pois.push({
        id: `wd-${item.title}`,
        name,
        lat: item.lat,
        lng: item.lon,
        category: inferredCat,
        categoryLabel: INTEREST_MAP[inferredCat].label,
        description,
        descriptionLang: descNl ? 'nl' : descEn ? 'en' : 'nl',
        imageUrl,
        wikipediaTag,
        wikidataTag: item.title,
        tags: {},
        score,
        distanceFromStart: item.dist,
      });
    }

    return pois;
  } catch {
    return [];
  }
}

/** Optional OpenTripMap tourist POI search with built-in 1-3★ popularity ratings */
async function fetchOpenTripMapPois(
  center: LatLng,
  clampedRadius: number,
  effectiveInterests: InterestId[],
  apiKey: string
): Promise<POI[]> {
  if (!apiKey.trim()) return [];
  try {
    const url = `https://api.opentripmap.com/0.1/en/places/radius?radius=${Math.round(
      clampedRadius
    )}&lon=${center.lng.toFixed(5)}&lat=${center.lat.toFixed(
      5
    )}&rate=2&limit=35&format=json&apikey=${encodeURIComponent(apiKey.trim())}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) return [];
    const list: Array<{
      xid: string;
      name: string;
      rate: number;
      kinds: string;
      dist: number;
      point: { lon: number; lat: number };
    }> = await resp.json();
    const primaryCat = effectiveInterests[0] ?? DEFAULT_INTEREST;

    return list
      .filter((item) => item.name && item.name.trim().length > 1 && !NON_POI_TITLE_PATTERN.test(item.name))
      .map((item) => ({
        id: `otm-${item.xid}`,
        name: item.name.trim(),
        lat: item.point.lat,
        lng: item.point.lon,
        category: primaryCat,
        categoryLabel: INTEREST_MAP[primaryCat].label,
        description: `${item.name.trim()} — populaire toeristische highlight langs jouw route.`,
        descriptionLang: 'nl' as const,
        tags: {},
        score: 50 + (item.rate || 1) * 12,
        distanceFromStart: item.dist,
      }));
  } catch {
    return [];
  }
}

/**
 * Discover POIs around a coordinate by running OpenStreetMap Overpass,
 * Wikidata GeoSearch, Wikipedia GeoSearch (NL + EN), and optional Geoapify/OpenTripMap in parallel.
 */
export async function fetchPoisAround(
  center: LatLng,
  radiusMeters: number,
  selectedInterests: InterestId[],
  geoapifyApiKey?: string,
  opentripmapApiKey?: string
): Promise<POI[]> {
  const effectiveInterests: InterestId[] =
    selectedInterests.length > 0 ? selectedInterests : [DEFAULT_INTEREST];

  const clampedRadius = Math.min(Math.max(radiusMeters, 800), 10000);

  // Run Overpass + Wikidata + Wikipedia (+ optional Geoapify & OpenTripMap) in parallel!
  const [osmPois, wikidataPois, wikiPois, geoapifyPois, otmPois] = await Promise.all([
    fetchOverpassPois(center, clampedRadius, effectiveInterests),
    fetchWikidataGeoPois(center, clampedRadius, effectiveInterests[0]),
    fetchWikipediaGeoPois(center, clampedRadius, effectiveInterests[0]),
    geoapifyApiKey
      ? fetchGeoapifyPois(center, clampedRadius, effectiveInterests, geoapifyApiKey)
      : Promise.resolve([]),
    opentripmapApiKey
      ? fetchOpenTripMapPois(center, clampedRadius, effectiveInterests, opentripmapApiKey)
      : Promise.resolve([]),
  ]);

  // Merge & deduplicate
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

  osmPois.sort((a, b) => b.score - a.score).forEach(addIfUnique);
  otmPois.sort((a, b) => b.score - a.score).forEach(addIfUnique);
  geoapifyPois.sort((a, b) => b.score - a.score).forEach(addIfUnique);
  wikidataPois.sort((a, b) => b.score - a.score).forEach(addIfUnique);
  wikiPois.sort((a, b) => b.score - a.score).forEach(addIfUnique);

  return merged.sort((a, b) => b.score - a.score);
}

/** Enrich a list of selected route POIs with free Wikipedia summaries & optional locally-cached Gemini audiogids */
export async function enrichPoisWithWikipedia(
  pois: POI[],
  geminiApiKey?: string
): Promise<POI[]> {
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

      // Optional Gemini enrichment ONLY when no Wikipedia article exists (result is cached locally!)
      if (geminiApiKey && geminiApiKey.trim().length > 10) {
        const aiStory = await generateGeminiPoiStory(poi, geminiApiKey);
        if (aiStory) {
          cache[cacheKey] = { ...aiStory, cachedAt: Date.now() };
          cacheDirty = true;
          return {
            ...poi,
            description: aiStory.description,
            descriptionLang: aiStory.descriptionLang,
          };
        }
      }

      return { ...poi, descriptionLang: (poi.descriptionLang ?? 'nl') as 'nl' | 'en' | 'de' | 'fr' };
    })
  );

  if (cacheDirty) {
    saveWikiCache(cache);
  }
  // Drop any Wikipedia POI whose fetched summary reveals it is a non-historic road or highway bridge
  return enriched.filter((poi) => !isNonScenicInfrastructurePoi(poi));
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

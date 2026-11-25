import type { InterestConfig, InterestId } from '../types';

export const INTERESTS: InterestConfig[] = [
  {
    id: 'toerisme',
    label: 'Toeristische attracties',
    shortLabel: 'Attracties',
    description: 'Bekende bezienswaardigheden en highlights',
    color: '#d97706',
    bgClass: 'bg-amber-500',
    emoji: '⭐',
    osmTags: [
      { key: 'tourism', value: 'attraction' },
      { key: 'tourism', value: 'viewpoint' },
      { key: 'historic', value: 'monument' },
      { key: 'historic', value: 'castle' },
    ],
  },
  {
    id: 'erfgoed',
    label: 'Erfgoed & Geschiedenis',
    shortLabel: 'Erfgoed',
    description: 'Kastelen, monumenten, kerken & historische gebouwen',
    color: '#b45309',
    bgClass: 'bg-amber-700',
    emoji: '🏰',
    osmTags: [
      { key: 'historic', value: 'castle' },
      { key: 'historic', value: 'monument' },
      { key: 'historic', value: 'memorial' },
      { key: 'historic', value: 'ruins' },
      { key: 'historic', value: 'manor' },
      { key: 'historic', value: 'city_gate' },
      { key: 'historic', value: 'windmill' },
    ],
  },
  {
    id: 'natuur',
    label: 'Natuur & Parken',
    shortLabel: 'Natuur',
    description: 'Stadsparken, bossen, tuinen en natuurgebieden',
    color: '#15803d',
    bgClass: 'bg-emerald-600',
    emoji: '🌿',
    osmTags: [
      { key: 'leisure', value: 'park' },
      { key: 'leisure', value: 'garden' },
      { key: 'leisure', value: 'nature_reserve' },
      { key: 'natural', value: 'wood' },
    ],
  },
  {
    id: 'kunst',
    label: 'Kunst & Street Art',
    shortLabel: 'Kunst',
    description: 'Beelden, muurschilderingen, kunstwerken & galeries',
    color: '#9333ea',
    bgClass: 'bg-purple-600',
    emoji: '🎨',
    osmTags: [
      { key: 'tourism', value: 'artwork' },
      { key: 'tourism', value: 'gallery' },
      { key: 'amenity', value: 'arts_centre' },
    ],
  },
  {
    id: 'cultuur',
    label: 'Musea & Cultuur',
    shortLabel: 'Cultuur',
    description: 'Musea, theaters en culturele hotspots',
    color: '#2563eb',
    bgClass: 'bg-blue-600',
    emoji: '🏛️',
    osmTags: [
      { key: 'tourism', value: 'museum' },
      { key: 'amenity', value: 'theatre' },
      { key: 'amenity', value: 'library' },
      { key: 'historic', value: 'archaeological_site' },
    ],
  },
  {
    id: 'uitzicht',
    label: 'Uitkijkpunten',
    shortLabel: 'Uitzicht',
    description: 'Mooie panorama’s, torens en uitzichtplekken',
    color: '#0284c7',
    bgClass: 'bg-sky-600',
    emoji: '🔭',
    osmTags: [
      { key: 'tourism', value: 'viewpoint' },
      { key: 'man_made', value: 'tower' },
      { key: 'man_made', value: 'lighthouse' },
    ],
  },
  {
    id: 'horeca',
    label: 'Eten & Terrasjes',
    shortLabel: 'Horeca',
    description: 'Gezellige cafés, brouwerijen en terrasjes',
    color: '#e11d48',
    bgClass: 'bg-rose-600',
    emoji: '☕',
    osmTags: [
      { key: 'amenity', value: 'cafe' },
      { key: 'amenity', value: 'biergarten' },
      { key: 'craft', value: 'brewery' },
      { key: 'amenity', value: 'ice_cream' },
    ],
  },
  {
    id: 'water',
    label: 'Water & Bruggen',
    shortLabel: 'Water',
    description: 'Havens, fonteinen, watermolens en kades',
    color: '#0891b2',
    bgClass: 'bg-cyan-600',
    emoji: '🌊',
    osmTags: [
      { key: 'amenity', value: 'fountain' },
      { key: 'leisure', value: 'marina' },
      { key: 'historic', value: 'watermill' },
      { key: 'natural', value: 'water' },
    ],
  },
];

export const INTEREST_MAP: Record<InterestId, InterestConfig> = INTERESTS.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<InterestId, InterestConfig>
);

export const DEFAULT_INTEREST: InterestId = 'toerisme';

export const DEFAULT_SETTINGS = {
  turnByTurnVoice: true,
  poiSoundEnabled: true,
  poiAutoReadAloud: false,
  speechRate: 1.0,
  voiceRegion: 'nl-BE' as const,
  voiceGender: 'auto' as const,
  preferredVoiceURI: '',
  walkingSpeedKmh: 4.8,
  cyclingSpeedKmh: 18,
  poiTriggerRadiusMeters: 60,
  keepScreenAwake: true,
  poiSources: {
    osm: true,
    wikidata: true,
    commons: true,
    wikipedia: true,
    googlePlaces: true,
    geoapify: true,
    opentripmap: true,
  },
  orsApiKey: '',
  maptilerApiKey: '',
  geminiApiKey: '',
  googlePlacesApiKey: '',
  geoapifyApiKey: '',
  opentripmapApiKey: '',
};

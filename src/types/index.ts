export type ActivityMode = 'walking' | 'cycling';
export type TargetType = 'distance' | 'duration';
export type SurfacePreference = 'balanced' | 'trails' | 'paved';

export type InterestId =
  | 'toerisme'
  | 'erfgoed'
  | 'natuur'
  | 'kunst'
  | 'cultuur'
  | 'uitzicht'
  | 'horeca'
  | 'water';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface InterestConfig {
  id: InterestId;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  bgClass: string;
  emoji: string;
  /** OSM Overpass tag filters (node/way) */
  osmTags: Array<{ key: string; value?: string }>;
}

export interface POI {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: InterestId;
  categoryLabel: string;
  description: string;
  descriptionLang?: 'nl' | 'en' | 'de' | 'fr';
  imageUrl?: string;
  wikipediaUrl?: string;
  wikipediaTag?: string;
  wikidataTag?: string;
  tags: Record<string, string>;
  score: number;
  /** Distance from route start in meters */
  distanceFromStart?: number;
  /** Distance along the generated route in meters */
  routeDistanceMeters?: number;
  isCustomStop?: boolean;
}

export type ManeuverType =
  | 'depart'
  | 'arrive'
  | 'turn-left'
  | 'turn-right'
  | 'turn-slight-left'
  | 'turn-slight-right'
  | 'turn-sharp-left'
  | 'turn-sharp-right'
  | 'straight'
  | 'uturn'
  | 'roundabout'
  | 'fork-left'
  | 'fork-right';

export interface TurnStep {
  index: number;
  instruction: string;
  streetName: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuverType: ManeuverType;
  location: LatLng;
  /** Cumulative distance from start where this maneuver occurs */
  cumulativeDistanceMeters: number;
}

export interface ElevationPoint {
  distanceKm: number;
  elevationM: number;
}

export interface WeatherInfo {
  temperatureC: number;
  windSpeedKmh: number;
  windDirectionLabel: string;
  precipitationProbPct: number;
  conditionLabel: string;
  emoji: string;
}

export type PitstopType = 'toilet' | 'water' | 'cafe';

export interface Pitstop {
  id: string;
  type: PitstopType;
  name: string;
  lat: number;
  lng: number;
  distanceMeters: number;
}

export interface CompletedTrip {
  id: string;
  routeName: string;
  cityName?: string;
  activity: ActivityMode;
  completedAt: string;
  distanceMeters: number;
  durationSeconds: number;
  avgSpeedKmh: number;
  discoveredPois: Array<{ id: string; name: string; category: InterestId }>;
  totalPoisOnRoute: number;
}

export type MapStyleMode = 'standard' | 'outdoor' | 'dark' | 'satellite';

export interface GeneratedRoute {
  id: string;
  name: string;
  activity: ActivityMode;
  surfacePreference?: SurfacePreference;
  unpavedPercent?: number;
  targetDistanceKm: number;
  actualDistanceMeters: number;
  estimatedDurationSeconds: number;
  /** GeoJSON LineString coordinates [lng, lat][] */
  coordinates: [number, number][];
  /** Cumulative distance at each coordinate index */
  cumulativeDistances: number[];
  elevationProfile?: ElevationPoint[];
  elevationGainMeters?: number;
  pois: POI[];
  steps: TurnStep[];
  interestsUsed: InterestId[];
  sectorIndex: number;
  startLocation: LatLng;
  createdAt: string;
  routingProvider: 'brouter' | 'openrouteservice' | 'osrm';
}

export type VoiceRegion = 'nl-BE' | 'nl-NL';
export type VoiceGender = 'auto' | 'female' | 'male';

export interface AppSettings {
  turnByTurnVoice: boolean;
  poiSoundEnabled: boolean;
  poiAutoReadAloud: boolean;
  speechRate: number; // 0.8 - 1.3
  voiceRegion: VoiceRegion;
  voiceGender: VoiceGender;
  preferredVoiceURI: string;
  walkingSpeedKmh: number; // default 4.8
  cyclingSpeedKmh: number; // default 18
  poiTriggerRadiusMeters: number; // default 60
  keepScreenAwake: boolean;
  orsApiKey: string;
  maptilerApiKey: string;
  geminiApiKey: string;
  geoapifyApiKey: string;
  opentripmapApiKey: string;
}

export interface SavedRoute {
  id: string;
  savedAt: string;
  cityName?: string;
  isOfflineReady?: boolean;
  offlineCachedAt?: string;
  cachedTileCount?: number;
  cachedImageCount?: number;
  route: GeneratedRoute;
}

export interface SearchPlace {
  id: string;
  name: string;
  subtitle: string;
  city?: string;
  lat: number;
  lng: number;
}

export interface NavigationStatus {
  isActive: boolean;
  isSimulating: boolean;
  simulationSpeedMultiplier: number;
  currentPosition: LatLng;
  heading: number;
  distanceCoveredMeters: number;
  distanceRemainingMeters: number;
  etaSeconds: number;
  currentStepIndex: number;
  distanceToNextTurnMeters: number;
  triggeredPoiIds: string[];
  activePoiPopup: POI | null;
  offRouteMeters: number;
  hasArrived: boolean;
}

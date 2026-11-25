export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  items: string[];
}

export const APP_VERSION = '1.7.0';

export const CHANGELOG: ReleaseNote[] = [
  {
    version: '1.7.0',
    date: '25 nov 2026',
    title: 'Echte BRouter wandel- & onverharde paden',
    items: [
      'BRouter (hiking-mountain / MTB / trekking) toegevoegd als primaire route-engine voor onverharde paden — vermijdt drukke gewestwegen (N-wegen) en kiest echte wandel- en bospaden.',
      'Toont nu het exacte percentage onverhard/wandelpad in het route-overzicht.',
      'Fix: stadsnaam "Utrecht" wordt niet meer onterecht getoond op andere GPS-locaties.',
    ],
  },
  {
    version: '1.6.1',
    date: '25 nov 2026',
    title: 'Gratis donkere nachtkaart zonder API-key',
    items: [
      'CARTO Dark Matter (die nu een API-key vereist) vervangen door gratis Esri Dark Gray nachtkaart + straat-/plaatsnamen (0 API-key nodig).',
    ],
  },
  {
    version: '1.6.0',
    date: '25 nov 2026',
    title: 'Onverharde paden & echte wandel-/bospaden',
    items: [
      'Nieuwe padkeuze in de routeplanner: 🥾 Onverhard (wandel-/bospaden & gravel), ⚖️ Mix of 🛣️ Verhard.',
      'Gebruikt automatisch de hiking- en MTB-profielen (foot-hiking / cycling-mountain) bij OpenRouteService én trekt de lus via echte OpenStreetMap onverharde paden.',
    ],
  },
  {
    version: '1.5.0',
    date: '24 nov 2026',
    title: 'Versleutelde QR- & PIN-sync tussen PC en GSM',
    items: [
      'Zet al je API-keys en stemvoorkeur met één AES-256 versleutelde QR-code of sync-link over van PC naar GSM (zonder extern account).',
      'Scan de QR-code met je telefooncamera, vul je zelfgekozen PIN/wachtwoord in en al je keys zijn direct actief.',
    ],
  },
  {
    version: '1.4.0',
    date: '24 nov 2026',
    title: 'Snelle eigen API-keys & lokale POI-cache',
    items: [
      'Nieuw API’s-tabblad met 1-tik Plak, live Test-knop en directe aanmaaklinks voor OpenRouteService, MapTiler Outdoor, Google Gemini en Geoapify.',
      'MapTiler-key ontgrendelt automatisch een extra Outdoor/Topo wandel- & fietskaartlaag.',
      'Gemini Flash-Lite schrijft optioneel Nederlandse audiogids-verhaaltjes voor POIs zonder Wikipedia, 100% lokaal gecachet.',
      'Lokale POI-cache teller en Wis-knop; alle keys blijven uitsluitend op jouw eigen toestel.',
    ],
  },
  {
    version: '1.3.1',
    date: '24 nov 2026',
    title: 'App-informatie & stemkeuze',
    items: [
      'Ontwikkelaarsvermelding (Geert Schepers) toegevoegd in het optiemenu en de app-metadata.',
    ],
  },
  {
    version: '1.3.0',
    date: '24 nov 2026',
    title: 'Stemkeuze: Vlaams / Nederlands & Vrouw / Man',
    items: [
      'Kies zelf tussen Vlaams (BE) of Nederlands (NL) voor turn-by-turn navigatie en POI-uitleg.',
      'Kies tussen vrouwelijke of mannelijke stem, of selecteer direct een specifieke stem van je toestel.',
    ],
  },
  {
    version: '1.2.0',
    date: '24 nov 2026',
    title: 'Mobiele verfijning, slimme POI-filter & Updates',
    items: [
      'Versienummer, live update-controle en "Wat is er nieuw?"-overzicht toegevoegd.',
      'Alle iconen op GSM-schermen netjes zichtbaar via de verticale kaartbalk rechts.',
      'Niet-historische gewestwegen en verkeersbruggen worden automatisch uit POIs gefilterd.',
      'Inklapbaar startmenu & route-overzicht om op je telefoon makkelijk je vertrekpunt aan te duiden.',
      'Verbeterde POI-ontdekking (parallel OpenStreetMap + NL/EN Wikipedia) en ±10% afstandskalibratie.',
    ],
  },
  {
    version: '1.1.0',
    date: '24 nov 2026',
    title: 'Komoot- & Google Maps-uitbreiding',
    items: [
      'Hoogteprofiel met stijgingsmeters & actuele weer- en wind-badge op de startlocatie.',
      'POIs verwijderen of eigen tussenstops toevoegen met directe herberekening.',
      'Automatisch herberekenen bij afwijken + Pitstop-zoeker (koffie, toilet, drinkwater).',
      'Route delen via link & QR-code, ritsamenvatting & Dagboek.',
      'Google Maps-stijl 2D/3D kantelen, Satelliet- en Nachtmodus + meertalige voorleesstem.',
    ],
  },
  {
    version: '1.0.0',
    date: '24 nov 2026',
    title: 'Eerste release van CityExplorerPlus',
    items: [
      'Installeerbare PWA voor Android & iPhone met fiets- en wandellusroutes op afstand of tijd.',
      'Interesse-selectie met standaard toeristische attracties, turn-by-turn navigatie & GPS-simulatie.',
      'POI-geofencing met geluidssignaal, popup met foto en tekst-naar-spraak voorleesfunctie.',
      'Stad & vertrekpunt zoeken en routes volledig offline opslaan (kaarttegels + POIs).',
    ],
  },
];

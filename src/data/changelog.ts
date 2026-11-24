export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  items: string[];
}

export const APP_VERSION = '1.2.0';

export const CHANGELOG: ReleaseNote[] = [
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

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { INTEREST_MAP } from '../data/interests';
import type { GeneratedRoute, LatLng, NavigationStatus, POI } from '../types';

interface MapViewProps {
  center: LatLng;
  route: GeneratedRoute | null;
  navState: NavigationStatus | null;
  mapStyle: 'standard' | 'satellite';
  onSelectPoi: (poi: POI) => void;
  onMapClickStart?: (pos: LatLng) => void;
  recenterSignal: number;
}

const ROUTE_SOURCE_ID = 'cep-route-source';
const ROUTE_CASING_LAYER = 'cep-route-casing';
const ROUTE_LINE_LAYER = 'cep-route-line';
const SATELLITE_SOURCE_ID = 'cep-satellite-source';
const SATELLITE_LAYER_ID = 'cep-satellite-layer';
const SATELLITE_LABELS_SOURCE_ID = 'cep-satellite-labels-source';
const SATELLITE_LABELS_LAYER_ID = 'cep-satellite-labels-layer';

export function MapView({
  center,
  route,
  navState,
  mapStyle,
  onSelectPoi,
  onMapClickStart,
  recenterSignal,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const poiMarkersRef = useRef<maplibregl.Marker[]>([]);
  const mapLoadedRef = useRef(false);

  const onSelectPoiRef = useRef(onSelectPoi);
  onSelectPoiRef.current = onSelectPoi;

  const onMapClickStartRef = useRef(onMapClickStart);
  onMapClickStartRef.current = onMapClickStart;

  const isNavigatingRef = useRef(false);
  isNavigatingRef.current = Boolean(navState?.isActive);

  // Initialize MapLibre GL map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [center.lng, center.lat],
      zoom: 14,
      pitch: 0,
      bearing: 0,
      attributionControl: { compact: true },
    });

    map.on('load', () => {
      mapLoadedRef.current = true;

      // Satellite imagery & place labels overlay (toggled smoothly without resetting route layers)
      map.addSource(SATELLITE_SOURCE_ID, {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
      });

      map.addLayer({
        id: SATELLITE_LAYER_ID,
        type: 'raster',
        source: SATELLITE_SOURCE_ID,
        layout: {
          visibility: mapStyle === 'satellite' ? 'visible' : 'none',
        },
      });

      map.addSource(SATELLITE_LABELS_SOURCE_ID, {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 19,
      });

      map.addLayer({
        id: SATELLITE_LABELS_LAYER_ID,
        type: 'raster',
        source: SATELLITE_LABELS_SOURCE_ID,
        layout: {
          visibility: mapStyle === 'satellite' ? 'visible' : 'none',
        },
        paint: {
          'raster-opacity': 0.9,
        },
      });

      map.addSource(ROUTE_SOURCE_ID, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [] },
        },
      });

      map.addLayer({
        id: ROUTE_CASING_LAYER,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': 9,
          'line-opacity': 0.95,
        },
      });

      map.addLayer({
        id: ROUTE_LINE_LAYER,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#0d9488',
          'line-width': 5.5,
          'line-opacity': 0.98,
        },
      });
    });

    // Long/simple click to reposition start point when planning (not navigating)
    map.on('click', (e) => {
      if (!isNavigatingRef.current && onMapClickStartRef.current) {
        onMapClickStartRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      }
    });

    // User / Start location marker (draggable in planning mode!)
    const el = document.createElement('div');
    el.className = 'relative flex items-center justify-center w-9 h-9 cursor-grab active:cursor-grabbing';
    el.title = 'Sleep om exact vertrekpunt te kiezen';
    el.innerHTML = `
      <span class="gps-pulse absolute w-8 h-8 rounded-full bg-teal-500/40 pointer-events-none"></span>
      <span class="relative w-5 h-5 rounded-full bg-teal-600 border-[3px] border-white shadow-lg"></span>
    `;
    const userMarker = new maplibregl.Marker({ element: el, anchor: 'center', draggable: true })
      .setLngLat([center.lng, center.lat])
      .addTo(map);

    userMarker.on('dragend', () => {
      if (!isNavigatingRef.current && onMapClickStartRef.current) {
        const lngLat = userMarker.getLngLat();
        onMapClickStartRef.current({ lat: lngLat.lat, lng: lngLat.lng });
      }
    });

    mapRef.current = map;
    userMarkerRef.current = userMarker;

    return () => {
      poiMarkersRef.current.forEach((m) => m.remove());
      poiMarkersRef.current = [];
      userMarker.remove();
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update user marker position, draggability & style
  useEffect(() => {
    const pos = navState?.isActive ? navState.currentPosition : center;
    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([pos.lng, pos.lat]);
      userMarkerRef.current.setDraggable(!navState?.isActive && !route);
      const el = userMarkerRef.current.getElement();
      if (navState?.isActive) {
        el.className = 'relative flex items-center justify-center w-9 h-9 pointer-events-none';
        el.innerHTML = `
          <span class="gps-pulse absolute w-10 h-10 rounded-full bg-teal-500/35"></span>
          <div class="relative w-8 h-8 rounded-full bg-teal-600 border-[3px] border-white shadow-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="12,3 20,20 12,16 4,20"/></svg>
          </div>
        `;
      } else {
        el.className = !route
          ? 'relative flex items-center justify-center w-9 h-9 cursor-grab active:cursor-grabbing'
          : 'relative flex items-center justify-center w-8 h-8 pointer-events-none';
        el.innerHTML = `
          <span class="gps-pulse absolute w-8 h-8 rounded-full bg-teal-500/40 pointer-events-none"></span>
          <span class="relative w-5 h-5 rounded-full bg-teal-600 border-[3px] border-white shadow-lg"></span>
        `;
      }
    }
  }, [center, route, navState?.isActive, navState?.currentPosition]);

  // Toggle between standard street map and satellite imagery smoothly
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const vis = mapStyle === 'satellite' ? 'visible' : 'none';
    if (map.getLayer(SATELLITE_LAYER_ID)) {
      map.setLayoutProperty(SATELLITE_LAYER_ID, 'visibility', vis);
    }
    if (map.getLayer(SATELLITE_LABELS_LAYER_ID)) {
      map.setLayoutProperty(SATELLITE_LABELS_LAYER_ID, 'visibility', vis);
    }
    if (map.getLayer(ROUTE_LINE_LAYER)) {
      map.setPaintProperty(
        ROUTE_LINE_LAYER,
        'line-color',
        mapStyle === 'satellite' ? '#14b8a6' : '#0d9488'
      );
    }
  }, [mapStyle]);

  // Recenter camera when recenterSignal changes or start location changes (outside nav)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || navState?.isActive) return;
    if (!route) {
      map.easeTo({
        center: [center.lng, center.lat],
        zoom: Math.max(map.getZoom(), 14),
        pitch: 0,
        bearing: 0,
        duration: 600,
      });
    }
  }, [center, recenterSignal, route, navState?.isActive]);

  // Stable key so POI markers are only rebuilt when route or visited set actually changes
  const triggeredPoisKey = navState?.triggeredPoiIds?.join(',') ?? '';

  // Draw route GeoJSON and POI markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyRoute = () => {
      const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;

      if (!route) {
        source.setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [] },
        });
      } else {
        source.setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: route.coordinates },
        });

        // Fit map to loop bounds when previewing
        if (!navState?.isActive && route.coordinates.length > 1) {
          const bounds = new maplibregl.LngLatBounds();
          route.coordinates.forEach(([lng, lat]) => bounds.extend([lng, lat]));
          map.fitBounds(bounds, {
            padding: { top: 70, left: 36, right: 36, bottom: 320 },
            duration: 800,
            maxZoom: 16,
          });
        }
      }
    };

    if (mapLoadedRef.current) {
      applyRoute();
    } else {
      map.once('load', applyRoute);
    }

    // Rebuild POI markers
    poiMarkersRef.current.forEach((m) => m.remove());
    poiMarkersRef.current = [];

    if (route) {
      const triggeredSet = new Set(triggeredPoisKey ? triggeredPoisKey.split(',') : []);
      route.pois.forEach((poi, idx) => {
        const cfg = INTEREST_MAP[poi.category];
        const isVisited = triggeredSet.has(poi.id);

        // Outer wrapper has NO transform/scale classes so MapLibre's translate() stays intact
        const wrapper = document.createElement('div');
        wrapper.className = 'w-10 h-10 flex items-center justify-center cursor-pointer';
        wrapper.style.zIndex = '10';

        const pin = document.createElement('button');
        pin.type = 'button';
        pin.title = poi.name;
        pin.setAttribute('aria-label', `Toon info over ${poi.name}`);
        pin.className =
          'flex items-center justify-center w-8 h-8 rounded-full border-2 border-white shadow-lg transition-transform duration-150 hover:scale-115 active:scale-95 cursor-pointer';
        pin.style.backgroundColor = isVisited ? '#64748b' : cfg.color;
        pin.innerHTML = `<span class="text-xs font-bold text-white leading-none pointer-events-none">${idx + 1}</span>`;

        const handleOpen = (ev: Event) => {
          ev.stopPropagation();
          onSelectPoiRef.current(poi);
        };

        wrapper.addEventListener('click', handleOpen);
        wrapper.appendChild(pin);

        const marker = new maplibregl.Marker({ element: wrapper, anchor: 'center' })
          .setLngLat([poi.lng, poi.lat])
          .addTo(map);
        poiMarkersRef.current.push(marker);
      });
    }
  }, [route, navState?.isActive, triggeredPoisKey]);

  // Smooth heading-up camera follow during active navigation
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !navState?.isActive) return;

    map.easeTo({
      center: [navState.currentPosition.lng, navState.currentPosition.lat],
      bearing: navState.heading,
      pitch: 48,
      zoom: 16.5,
      duration: 380,
    });
  }, [navState?.isActive, navState?.currentPosition, navState?.heading]);

  // Reset pitch/bearing when exiting navigation
  useEffect(() => {
    const map = mapRef.current;
    if (!map || navState?.isActive) return;
    if (map.getPitch() > 0 || map.getBearing() !== 0) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
    }
  }, [navState?.isActive]);

  return <div ref={containerRef} className="w-full h-full" />;
}

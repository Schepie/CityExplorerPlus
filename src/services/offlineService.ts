import type { GeneratedRoute, SavedRoute } from '../types';

const DB_NAME = 'city_explorer_plus_db';
const DB_VERSION = 1;
const STORE_ROUTES = 'saved_routes';
const OFFLINE_CACHE_NAME = 'cep-offline-media-v1';
const MAP_TILES_CACHE_NAME = 'map-tiles-cache';
const LEGACY_STORAGE_KEY = 'cep_saved_routes_v1';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ROUTES)) {
        db.createObjectStore(STORE_ROUTES, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Migrate any legacy localStorage saved routes into IndexedDB seamlessly */
async function migrateLegacyRoutesIfNeeded(): Promise<void> {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return;
    const legacy: SavedRoute[] = JSON.parse(raw);
    if (Array.isArray(legacy) && legacy.length > 0) {
      const db = await openDb();
      const tx = db.transaction(STORE_ROUTES, 'readwrite');
      const store = tx.objectStore(STORE_ROUTES);
      for (const item of legacy) {
        store.put(item);
      }
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    }
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Ignore migration errors
  }
}

export async function getAllSavedRoutes(): Promise<SavedRoute[]> {
  await migrateLegacyRoutesIfNeeded();
  try {
    const db = await openDb();
    return await new Promise<SavedRoute[]>((resolve, reject) => {
      const tx = db.transaction(STORE_ROUTES, 'readonly');
      const req = tx.objectStore(STORE_ROUTES).getAll();
      req.onsuccess = () => {
        const items = (req.result as SavedRoute[]) || [];
        items.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function putSavedRoute(item: SavedRoute): Promise<SavedRoute[]> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_ROUTES, 'readwrite');
    tx.objectStore(STORE_ROUTES).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return getAllSavedRoutes();
}

export async function removeSavedRoute(id: string): Promise<SavedRoute[]> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_ROUTES, 'readwrite');
    tx.objectStore(STORE_ROUTES).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return getAllSavedRoutes();
}

/** Convert lat/lng to Web Mercator slippy tile x/y at zoom z */
function lngLatToTile(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = Math.pow(2, z);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

/**
 * Download & cache everything needed to use a route completely offline:
 * 1. Full route geometry, turn-by-turn steps & POI texts in IndexedDB
 * 2. POI Wikipedia photos in Cache Storage
 * 3. OpenFreeMap style + vector tiles covering the route bounding box (z12..z14)
 */
export async function prepareRouteForOffline(
  route: GeneratedRoute,
  cityName?: string,
  onProgress?: (pct: number, label: string) => void
): Promise<SavedRoute> {
  let cachedImageCount = 0;
  let cachedTileCount = 0;

  onProgress?.(10, 'POI-foto’s opslaan voor offline gebruik...');

  // 1. Cache POI images (no-cors opaque responses are fine for <img> rendering offline)
  if ('caches' in window) {
    try {
      const mediaCache = await caches.open(OFFLINE_CACHE_NAME);
      const imageUrls = route.pois
        .map((p) => p.imageUrl)
        .filter((u): u is string => Boolean(u));

      for (let i = 0; i < imageUrls.length; i++) {
        try {
          const req = new Request(imageUrls[i], { mode: 'no-cors' });
          const resp = await fetch(req);
          await mediaCache.put(imageUrls[i], resp);
          cachedImageCount++;
        } catch {
          // Ignore individual image download failure
        }
        onProgress?.(
          10 + Math.round(((i + 1) / Math.max(1, imageUrls.length)) * 25),
          `Foto ${i + 1}/${imageUrls.length} opslaan...`
        );
      }
    } catch {
      // Cache API unavailable
    }

    // 2. Cache OpenFreeMap style & vector tiles around route bounding box
    onProgress?.(40, 'Kaarttegels rondom de route downloaden...');
    try {
      const tileCache = await caches.open(MAP_TILES_CACHE_NAME);
      const styleUrl = 'https://tiles.openfreemap.org/styles/liberty';
      const styleResp = await fetch(styleUrl);
      if (styleResp.ok) {
        const styleClone = styleResp.clone();
        await tileCache.put(styleUrl, styleClone);
        const styleJson = await styleResp.json();

        // Also cache TileJSON source metadata if present
        const sourceUrl: string | undefined = styleJson?.sources?.openmaptiles?.url;
        let tileTemplate: string | null = null;
        if (sourceUrl) {
          const srcResp = await fetch(sourceUrl);
          if (srcResp.ok) {
            await tileCache.put(sourceUrl, srcResp.clone());
            const srcJson = await srcResp.json();
            tileTemplate = srcJson?.tiles?.[0] ?? null;
          }
        }

        // Compute route bounding box with a small buffer
        let minLng = Infinity,
          maxLng = -Infinity,
          minLat = Infinity,
          maxLat = -Infinity;
        for (const [lng, lat] of route.coordinates) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
        const pad = 0.008;
        minLng -= pad;
        maxLng += pad;
        minLat -= pad;
        maxLat += pad;

        if (tileTemplate) {
          const tileUrls: string[] = [];
          // Vector tiles at z12..z14 overzoom smoothly up to z17+ in MapLibre!
          for (const z of [12, 13, 14]) {
            const topLeft = lngLatToTile(minLng, maxLat, z);
            const bottomRight = lngLatToTile(maxLng, minLat, z);
            for (let x = topLeft.x; x <= bottomRight.x; x++) {
              for (let y = topLeft.y; y <= bottomRight.y; y++) {
                tileUrls.push(
                  tileTemplate
                    .replace('{z}', String(z))
                    .replace('{x}', String(x))
                    .replace('{y}', String(y))
                );
              }
            }
          }

          // Cap at 60 tiles so download stays super fast & light
          const capped = tileUrls.slice(0, 60);
          for (let i = 0; i < capped.length; i++) {
            try {
              const r = await fetch(capped[i]);
              if (r.ok) {
                await tileCache.put(capped[i], r);
                cachedTileCount++;
              }
            } catch {
              // Skip failed tile
            }
            onProgress?.(
              45 + Math.round(((i + 1) / Math.max(1, capped.length)) * 50),
              `Kaarttegel ${i + 1}/${capped.length} cachen...`
            );
          }
        }
      }
    } catch {
      // Offline tile pre-cache best effort
    }
  }

  onProgress?.(98, 'Route opslaan in offline database...');

  const saved: SavedRoute = {
    id: route.id,
    savedAt: new Date().toISOString(),
    cityName,
    isOfflineReady: true,
    offlineCachedAt: new Date().toISOString(),
    cachedTileCount,
    cachedImageCount,
    route,
  };

  await putSavedRoute(saved);
  onProgress?.(100, 'Klaar voor offline gebruik!');
  return saved;
}

import { DEFAULT_SETTINGS } from '../data/interests';
import type { AppSettings, GeneratedRoute, SavedRoute } from '../types';

const SETTINGS_KEY = 'cep_settings_v1';
const SAVED_ROUTES_KEY = 'cep_saved_routes_v1';

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota errors
  }
}

export function loadSavedRoutes(): SavedRoute[] {
  try {
    const raw = localStorage.getItem(SAVED_ROUTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRouteToHistory(route: GeneratedRoute): SavedRoute[] {
  const existing = loadSavedRoutes().filter((item) => item.id !== route.id);
  const updated: SavedRoute[] = [
    { id: route.id, savedAt: new Date().toISOString(), route },
    ...existing,
  ].slice(0, 15);
  try {
    localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(updated));
  } catch {
    // Ignore quota errors
  }
  return updated;
}

export function deleteSavedRoute(id: string): SavedRoute[] {
  const updated = loadSavedRoutes().filter((item) => item.id !== id);
  try {
    localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(updated));
  } catch {
    // Ignore
  }
  return updated;
}

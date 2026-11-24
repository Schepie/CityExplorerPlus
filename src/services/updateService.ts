import { APP_VERSION } from '../data/changelog';

export interface UpdateCheckResult {
  status: 'up-to-date' | 'update-available' | 'offline-or-error';
  currentVersion: string;
  latestVersion: string;
  releasedAt?: string;
  highlights?: string[];
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Check GitHub Pages / server version.json + Service Worker registration for newer app updates */
export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  try {
    // Trigger background Service Worker update check if installed
    let swWaiting = false;
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          swWaiting = Boolean(reg.waiting);
        }
      } catch {
        // Ignore SW update check errors in dev mode
      }
    }

    const resp = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!resp.ok) {
      return {
        status: swWaiting ? 'update-available' : 'offline-or-error',
        currentVersion: APP_VERSION,
        latestVersion: APP_VERSION,
      };
    }

    const data = await resp.json();
    const remoteVersion: string = data?.version || APP_VERSION;
    const isNewer = compareSemver(remoteVersion, APP_VERSION) > 0 || swWaiting;

    return {
      status: isNewer ? 'update-available' : 'up-to-date',
      currentVersion: APP_VERSION,
      latestVersion: remoteVersion,
      releasedAt: data?.releasedAt,
      highlights: Array.isArray(data?.highlights) ? data.highlights : undefined,
    };
  } catch {
    return {
      status: 'offline-or-error',
      currentVersion: APP_VERSION,
      latestVersion: APP_VERSION,
    };
  }
}

/** Activate waiting Service Worker and hard-reload into the latest PWA version */
export async function applyAppUpdate(): Promise<void> {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      if (reg) {
        await reg.update();
      }
    } catch {
      // Ignore
    }
  }
  window.location.reload();
}

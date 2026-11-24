import type { AppSettings } from '../types';

export interface SyncedKeysPayload {
  v: 1;
  orsApiKey?: string;
  maptilerApiKey?: string;
  geminiApiKey?: string;
  geoapifyApiKey?: string;
  voiceRegion?: AppSettings['voiceRegion'];
  voiceGender?: AppSettings['voiceGender'];
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Encrypt API keys & voice settings using AES-256-GCM + PBKDF2 with user's PIN/passphrase */
export async function encryptKeysPayload(
  settings: AppSettings,
  passphrase: string
): Promise<string> {
  const payload: SyncedKeysPayload = {
    v: 1,
    orsApiKey: settings.orsApiKey.trim() || undefined,
    maptilerApiKey: settings.maptilerApiKey.trim() || undefined,
    geminiApiKey: settings.geminiApiKey.trim() || undefined,
    geoapifyApiKey: settings.geoapifyApiKey.trim() || undefined,
    voiceRegion: settings.voiceRegion,
    voiceGender: settings.voiceGender,
  };

  const salt = crypto.getRandomValues(new Uint8Array(12));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  );

  // Format: [salt (12B) | iv (12B) | ciphertext]
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.length);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(ciphertext, salt.length + iv.length);
  return bytesToBase64Url(combined);
}

/** Decrypt an encrypted sync code (or full ?keysync=... URL) using the user's PIN/passphrase */
export async function decryptKeysPayload(
  rawInput: string,
  passphrase: string
): Promise<SyncedKeysPayload> {
  let token = rawInput.trim();
  // Allow pasting the full URL directly
  if (token.includes('keysync=')) {
    try {
      const url = new URL(token);
      token = url.searchParams.get('keysync') || token;
    } catch {
      const idx = token.indexOf('keysync=');
      if (idx >= 0) token = decodeURIComponent(token.slice(idx + 8).split('&')[0]);
    }
  }

  const combined = base64UrlToBytes(token);
  if (combined.length < 28) {
    throw new Error('Ongeldige sync-code');
  }

  const salt = combined.slice(0, 12);
  const iv = combined.slice(12, 24);
  const ciphertext = combined.slice(24);

  const key = await deriveAesKey(passphrase, salt);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as SyncedKeysPayload;
  if (parsed.v !== 1) throw new Error('Niet-ondersteunde sync-versie');
  return parsed;
}

export function buildKeySyncUrl(encryptedCode: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?keysync=${encodeURIComponent(encryptedCode)}`;
}

export function extractKeySyncFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('keysync');
  } catch {
    return null;
  }
}

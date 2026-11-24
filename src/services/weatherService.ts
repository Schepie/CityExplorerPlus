import type { LatLng, WeatherInfo } from '../types';

function windDirectionToDutch(deg: number): string {
  const dirs = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

function wmoCodeToCondition(code: number): { label: string; emoji: string } {
  if (code === 0) return { label: 'Helder', emoji: '☀️' };
  if (code <= 2) return { label: 'Licht bewolkt', emoji: '⛅' };
  if (code === 3) return { label: 'Bewolkt', emoji: '☁️' };
  if (code <= 48) return { label: 'Mistig', emoji: '🌫️' };
  if (code <= 57) return { label: 'Motregen', emoji: '🌦️' };
  if (code <= 67) return { label: 'Regen', emoji: '🌧️' };
  if (code <= 77) return { label: 'Sneeuw', emoji: '❄️' };
  if (code <= 82) return { label: 'Buien', emoji: '🌧️' };
  if (code >= 95) return { label: 'Onweer', emoji: '⛈️' };
  return { label: 'Wisselvallig', emoji: '🌤️' };
}

/** Free current weather & wind forecast via Open-Meteo (0 API key, 0 tokens) */
export async function fetchWeatherAt(pos: LatLng): Promise<WeatherInfo | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${pos.lat.toFixed(4)}&longitude=${pos.lng.toFixed(4)}` +
      `&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m&hourly=precipitation_probability&forecast_hours=3&timezone=auto`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;

    const data = await resp.json();
    const cur = data?.current;
    if (!cur) return null;

    const precipProbs: number[] = data?.hourly?.precipitation_probability || [0];
    const maxPrecip = Math.max(0, ...precipProbs.slice(0, 3));
    const cond = wmoCodeToCondition(cur.weather_code ?? 0);

    return {
      temperatureC: Math.round(cur.temperature_2m ?? 0),
      windSpeedKmh: Math.round(cur.wind_speed_10m ?? 0),
      windDirectionLabel: windDirectionToDutch(cur.wind_direction_10m ?? 0),
      precipitationProbPct: Math.round(maxPrecip),
      conditionLabel: cond.label,
      emoji: cond.emoji,
    };
  } catch {
    return null;
  }
}

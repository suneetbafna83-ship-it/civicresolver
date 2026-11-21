import type { IssueStatus } from '../../../shared/types/civic.js';

export interface NeighborhoodPreset {
  readonly label: string;
  readonly lat: number;
  readonly lng: number;
  readonly address: string;
}

export const NEIGHBORHOOD_PRESETS: ReadonlyArray<NeighborhoodPreset> = [
  {
    label: 'Central Market',
    lat: 37.7749,
    lng: -122.4194,
    address: '240 Market St, Downtown District',
  },
  {
    label: 'Civic Center',
    lat: 37.7792,
    lng: -122.4148,
    address: '88 Oakwood Ave, Civic Center',
  },
  {
    label: 'Elm Park',
    lat: 37.7685,
    lng: -122.4261,
    address: '512 Elm Park North Path',
  },
  {
    label: 'Harbor Plaza',
    lat: 37.7841,
    lng: -122.4072,
    address: '19 Harbor Plaza Service Alley',
  },
  {
    label: 'Lincoln School',
    lat: 37.7718,
    lng: -122.4319,
    address: '105 Lincoln Way & 9th Ave',
  },
];

const coordAddressCache = new Map<string, string>();

export function formatCivicAddress(lat: number, lng: number): string {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = coordAddressCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  let closest = NEIGHBORHOOD_PRESETS[0]!;
  let minDistance = Number.POSITIVE_INFINITY;
  for (const preset of NEIGHBORHOOD_PRESETS) {
    const dist = Math.hypot(preset.lat - lat, preset.lng - lng);
    if (dist < minDistance) {
      minDistance = dist;
      closest = preset;
    }
  }

  const label =
    minDistance < 0.003
      ? closest.address
      : minDistance < 0.08
        ? `Near ${closest.label} (${lat.toFixed(4)}, ${lng.toFixed(4)})`
        : `Pinned Civic Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  coordAddressCache.set(key, label);
  return label;
}

export async function resolveStreetAddressAsync(
  lat: number,
  lng: number,
): Promise<string | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (typeof fetch !== 'function') {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2200);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      },
    );
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as {
      readonly display_name?: unknown;
    };
    if (typeof data.display_name === 'string' && data.display_name.trim()) {
      const shortParts = data.display_name
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(', ');
      if (shortParts.length > 3) {
        const clean = shortParts.replace(/[<>]/g, '').slice(0, 140);
        coordAddressCache.set(key, clean);
        return clean;
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function getStatusDotColor(status: IssueStatus): string {
  switch (status) {
    case 'Resolved':
      return '#059669';
    case 'In Progress':
      return '#1d4ed8';
    case 'Reported':
    default:
      return '#d97706';
  }
}

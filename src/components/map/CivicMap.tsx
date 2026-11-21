import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import L from 'leaflet';
import { Crosshair, MapPin, Navigation } from 'lucide-react';
import type {
  CivicIssue,
  IssueLocation,
  IssueStatus,
} from '../../../shared/types/civic.js';

interface ViteMapsEnvShape {
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}

interface ImportMetaWithMapsEnv extends ImportMeta {
  readonly env?: ViteMapsEnvShape;
}

function readGoogleMapsApiKey(): string | null {
  const meta: ImportMetaWithMapsEnv = import.meta;
  const raw = meta.env?.VITE_GOOGLE_MAPS_API_KEY;
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (
    trimmed.length < 12 ||
    trimmed.toLowerCase().startsWith('your_') ||
    trimmed.toLowerCase() === 'placeholder'
  ) {
    return null;
  }
  return trimmed;
}

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
      : `Near ${closest.label} (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  coordAddressCache.set(key, label);
  return label;
}

function getStatusDotColor(status: IssueStatus): string {
  switch (status) {
    case 'Resolved':
      return '#059669'; // Emerald 600
    case 'In Progress':
      return '#1d4ed8'; // Civic Cobalt
    case 'Reported':
    default:
      return '#d97706'; // Amber 600
  }
}

export interface CivicMapProps {
  readonly mode: 'picker' | 'overview';
  readonly darkTheme: boolean;
  readonly selectedLocation?: IssueLocation;
  readonly onSelectLocation?: (location: IssueLocation) => void;
  readonly issues?: ReadonlyArray<CivicIssue>;
  readonly selectedIssueId?: string | null;
  readonly onSelectIssue?: (issueId: string) => void;
  readonly heightClassName?: string;
}

interface LeafletFallbackMapProps {
  readonly mode: 'picker' | 'overview';
  readonly center: { readonly lat: number; readonly lng: number };
  readonly selectedLocation?: IssueLocation;
  readonly onSelectLocation?: (location: IssueLocation) => void;
  readonly issues: ReadonlyArray<CivicIssue>;
  readonly selectedIssueId?: string | null;
  readonly onSelectIssue?: (issueId: string) => void;
}

function LeafletFallbackMap({
  mode,
  center,
  selectedLocation,
  onSelectLocation,
  issues,
  selectedIssueId,
  onSelectIssue,
}: LeafletFallbackMapProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const [leafletFailed, setLeafletFailed] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (el === null || mapInstanceRef.current !== null) {
      return;
    }
    try {
      const map = L.map(el, {
        center: [center.lat, center.lng],
        zoom: 14,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      const group = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
      layerGroupRef.current = group;
    } catch {
      setLeafletFailed(true);
    }

    return () => {
      try {
        mapInstanceRef.current?.remove();
      } catch {
        // Ignore teardown issues in headless test environments
      }
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
    };
  }, [center.lat, center.lng]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (map === null) {
      return;
    }
    const handleClick = (event: L.LeafletMouseEvent): void => {
      if (mode === 'picker' && onSelectLocation) {
        const lat = Number(event.latlng.lat.toFixed(5));
        const lng = Number(event.latlng.lng.toFixed(5));
        onSelectLocation({
          lat,
          lng,
          address: formatCivicAddress(lat, lng),
        });
      }
    };
    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [mode, onSelectLocation]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (map === null || group === null) {
      return;
    }

    group.clearLayers();

    if (mode === 'picker' && selectedLocation) {
      const marker = L.circleMarker(
        [selectedLocation.lat, selectedLocation.lng],
        {
          radius: 10,
          color: '#ffffff',
          weight: 2.5,
          fillColor: '#1d4ed8',
          fillOpacity: 0.95,
        },
      );
      marker.addTo(group);
      map.setView([selectedLocation.lat, selectedLocation.lng], map.getZoom());
    }

    for (const issue of issues) {
      const isSelected = issue.id === selectedIssueId;
      const color = getStatusDotColor(issue.status);
      const circle = L.circleMarker([issue.location.lat, issue.location.lng], {
        radius: isSelected ? 11 : 8,
        color: isSelected ? '#0f172a' : '#ffffff',
        weight: isSelected ? 3 : 2,
        fillColor: color,
        fillOpacity: 0.9,
      });
      circle.on('click', () => {
        onSelectIssue?.(issue.id);
      });
      circle.addTo(group);
    }
  }, [issues, mode, onSelectIssue, selectedIssueId, selectedLocation]);

  if (leafletFailed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-sm text-slate-600 dark:text-slate-300">
        <MapPin className="mb-2 h-6 w-6 text-blue-700" aria-hidden="true" />
        <p className="font-medium">Interactive Coordinate Selector Active</p>
        <p className="mt-1 text-xs text-slate-500">
          Use the quick neighborhood buttons below to pin the exact street location.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      aria-label="Interactive civic issue map"
    />
  );
}

export function CivicMap({
  mode,
  darkTheme,
  selectedLocation,
  onSelectLocation,
  issues = [],
  selectedIssueId = null,
  onSelectIssue,
  heightClassName = 'h-72',
}: CivicMapProps): React.ReactElement {
  const apiKey = useMemo(() => readGoogleMapsApiKey(), []);
  const [googleAuthFailed, setGoogleAuthFailed] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const winRecord = window as unknown as Record<string, unknown>;
    const previousHandler = winRecord['gm_authFailure'];
    winRecord['gm_authFailure'] = () => {
      setGoogleAuthFailed(true);
      if (typeof previousHandler === 'function') {
        previousHandler();
      }
    };
    return () => {
      winRecord['gm_authFailure'] = previousHandler;
    };
  }, []);

  const useGoogleEngine = apiKey !== null && !googleAuthFailed;

  const activeCenter = useMemo(() => {
    if (selectedLocation) {
      return { lat: selectedLocation.lat, lng: selectedLocation.lng };
    }
    const selectedIssue = issues.find((item) => item.id === selectedIssueId);
    if (selectedIssue) {
      return {
        lat: selectedIssue.location.lat,
        lng: selectedIssue.location.lng,
      };
    }
    const firstIssue = issues[0];
    if (firstIssue) {
      return { lat: firstIssue.location.lat, lng: firstIssue.location.lng };
    }
    return { lat: 37.7749, lng: -122.4194 };
  }, [issues, selectedIssueId, selectedLocation]);

  const handleUseBrowserGps = useCallback(() => {
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.geolocation?.getCurrentPosition !== 'function'
    ) {
      const preset = NEIGHBORHOOD_PRESETS[0]!;
      onSelectLocation?.({
        lat: preset.lat,
        lng: preset.lng,
        address: preset.address,
      });
      setGpsStatus('Pinned to Central Market default.');
      return;
    }

    setGpsStatus('Locating GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        const address = formatCivicAddress(lat, lng);
        onSelectLocation?.({ lat, lng, address });
        setGpsStatus('GPS coordinates locked.');
      },
      () => {
        const preset = NEIGHBORHOOD_PRESETS[0]!;
        onSelectLocation?.({
          lat: preset.lat,
          lng: preset.lng,
          address: preset.address,
        });
        setGpsStatus('GPS permission declined — pinned to Central Market.');
      },
      { timeout: 6000 },
    );
  }, [onSelectLocation]);

  const handleGoogleMapClick = useCallback(
    (event: MapMouseEvent) => {
      if (mode !== 'picker' || !onSelectLocation) {
        return;
      }
      const latLng = event.detail.latLng;
      if (!latLng) {
        return;
      }
      const lat = Number(latLng.lat.toFixed(5));
      const lng = Number(latLng.lng.toFixed(5));
      onSelectLocation({
        lat,
        lng,
        address: formatCivicAddress(lat, lng),
      });
    },
    [mode, onSelectLocation],
  );

  const glassHudClass = darkTheme ? 'glass-surface-dark' : 'glass-surface-light';

  return (
    <div className="flex flex-col gap-2.5">
      <div
        className={`relative w-full overflow-hidden card-inner-well border border-slate-200/90 bg-slate-100 dark:border-slate-800 dark:bg-slate-900 ${heightClassName}`}
      >
        {/* Top Translucent Status & Engine HUD */}
        <div
          className={`pointer-events-none absolute top-3 right-3 left-3 z-[400] flex flex-wrap items-center justify-between gap-2 rounded-full px-4 py-2 text-xs shadow-xs ${glassHudClass}`}
        >
          <div className="flex items-center gap-1.5 font-bold text-[#11131a] dark:text-white">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="max-w-[230px] truncate sm:max-w-[300px]">
              {mode === 'picker'
                ? selectedLocation?.address ?? 'Click map or pick a street below'
                : `${issues.length} civic reports mapped`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selectedLocation && mode === 'picker' && (
              <span className="tabular-nums font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                {selectedLocation.lat.toFixed(4)}, {selectedLocation.lng.toFixed(4)}
              </span>
            )}
            <span
              className="rounded-full bg-[#11131a] px-2.5 py-0.5 text-[11px] font-semibold text-white dark:bg-white dark:text-[#11131a]"
              title="Active Map Engine with Zero-Downtime Failover"
            >
              {useGoogleEngine ? 'Google Maps' : 'OSM Live Map'}
            </span>
          </div>
        </div>

        {/* Map Canvas */}
        {useGoogleEngine && apiKey !== null ? (
          <APIProvider
            apiKey={apiKey}
            onError={() => setGoogleAuthFailed(true)}
          >
            <GoogleMap
              defaultCenter={activeCenter}
              defaultZoom={14}
              mapId="DEMO_MAP_ID"
              internalUsageAttributionIds={['gmp_git_agentskills_v1']}
              onClick={handleGoogleMapClick}
              gestureHandling="greedy"
              disableDefaultUI={false}
              className="h-full w-full"
            >
              {mode === 'picker' && selectedLocation && (
                <AdvancedMarker
                  position={{
                    lat: selectedLocation.lat,
                    lng: selectedLocation.lng,
                  }}
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-blue-700 text-white shadow-md">
                    <Navigation className="h-3 w-3" />
                  </div>
                </AdvancedMarker>
              )}

              {issues.map((issue) => (
                <AdvancedMarker
                  key={issue.id}
                  position={{
                    lat: issue.location.lat,
                    lng: issue.location.lng,
                  }}
                  onClick={() => onSelectIssue?.(issue.id)}
                >
                  <div
                    className="h-4 w-4 rounded-full border-2 border-white shadow-sm"
                    style={{ backgroundColor: getStatusDotColor(issue.status) }}
                  />
                </AdvancedMarker>
              ))}
            </GoogleMap>
          </APIProvider>
        ) : (
          <LeafletFallbackMap
            mode={mode}
            center={activeCenter}
            {...(selectedLocation !== undefined ? { selectedLocation } : {})}
            {...(onSelectLocation !== undefined ? { onSelectLocation } : {})}
            issues={issues}
            selectedIssueId={selectedIssueId}
            {...(onSelectIssue !== undefined ? { onSelectIssue } : {})}
          />
        )}

        {/* Bottom Legend Overlay for Overview Mode */}
        {mode === 'overview' && (
          <div
            className={`pointer-events-none absolute right-2.5 bottom-2.5 left-2.5 z-[400] flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-[11px] ${glassHudClass}`}
          >
            <div className="flex items-center gap-3 text-slate-700 dark:text-slate-200">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-600" />
                Reported
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-700" />
                In Progress
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                Resolved
              </span>
            </div>
            <span className="text-slate-500 dark:text-slate-400">
              Click any pin to highlight report
            </span>
          </div>
        )}
      </div>

      {/* Only 2 Clean Location Options: 1. Use My GPS Location & 2. Pin Point on Map */}
      {mode === 'picker' && onSelectLocation && (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleUseBrowserGps}
              className="press-feedback inline-flex items-center gap-1.5 rounded-full bg-[#11131a] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 dark:bg-white dark:text-[#11131a]"
            >
              <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
              <span>1. Use My GPS Location</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setGpsStatus('Pin-Point Mode active: click anywhere on the map above to drop your pin.')
              }
              className="press-feedback inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-[#11131a] hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              <span>2. Pin Point on Map</span>
            </button>
          </div>

          {gpsStatus && (
            <span
              className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              aria-live="polite"
            >
              {gpsStatus}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import L from 'leaflet';
import { Crosshair, MapPin, Navigation, Search, Target } from 'lucide-react';
import type {
  CivicIssue,
  IssueLocation,
  IssueStatus,
} from '../../../shared/types/civic.js';
import {
  getUiStrings,
  type AppLanguage,
} from '../../lib/i18n/translations.js';

declare global {
  interface ImportMetaEnv {
    readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  }
}

function readGoogleMapsApiKey(): string | null {
  const raw = import.meta.env?.VITE_GOOGLE_MAPS_API_KEY;
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
      : minDistance < 0.08
        ? `Near ${closest.label} (${lat.toFixed(4)}, ${lng.toFixed(4)})`
        : `Pinned Civic Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  coordAddressCache.set(key, label);
  return label;
}

async function resolveStreetAddressAsync(
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
      readonly name?: unknown;
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

function getStatusDotColor(status: IssueStatus): string {
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

export interface CivicMapProps {
  readonly mode: 'picker' | 'overview';
  readonly darkTheme: boolean;
  readonly language?: AppLanguage;
  readonly selectedLocation?: IssueLocation;
  readonly onSelectLocation?: (location: IssueLocation) => void;
  readonly issues?: ReadonlyArray<CivicIssue>;
  readonly selectedIssueId?: string | null;
  readonly onSelectIssue?: (issueId: string) => void;
  readonly heightClassName?: string;
}

interface LeafletFallbackMapProps {
  readonly mode: 'picker' | 'overview';
  readonly initialCenter: { readonly lat: number; readonly lng: number };
  readonly isPinPointMode: boolean;
  readonly selectedLocation?: IssueLocation;
  readonly onCoordinatePicked?: (lat: number, lng: number) => void;
  readonly onMapCenterAvailable?: (getter: () => { lat: number; lng: number }) => void;
  readonly issues: ReadonlyArray<CivicIssue>;
  readonly selectedIssueId?: string | null;
  readonly onSelectIssue?: (issueId: string) => void;
}

function createPinMarkerIcon(): L.DivIcon {
  return L.divIcon({
    className: 'civic-pin-marker-icon',
    html: `<div style="position:relative;width:30px;height:30px;display:flex;align-items:center;justify-content:center;cursor:grab;">
      <span style="position:absolute;width:28px;height:28px;border-radius:9999px;background:rgba(17,19,26,0.22);border:2px solid #ffffff;"></span>
      <span style="position:relative;width:16px;height:16px;border-radius:9999px;background:#11131a;border:3px solid #ffffff;box-shadow:0 3px 8px rgba(0,0,0,0.4);"></span>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function LeafletFallbackMap({
  mode,
  initialCenter,
  isPinPointMode,
  selectedLocation,
  onCoordinatePicked,
  onMapCenterAvailable,
  issues,
  selectedIssueId,
  onSelectIssue,
}: LeafletFallbackMapProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const initialCenterRef = useRef(initialCenter);
  const modeRef = useRef(mode);
  const onCoordinatePickedRef = useRef(onCoordinatePicked);
  const [leafletFailed, setLeafletFailed] = useState(false);

  useEffect(() => {
    modeRef.current = mode;
    onCoordinatePickedRef.current = onCoordinatePicked;
  }, [mode, onCoordinatePicked]);

  // Initialize Leaflet map ONCE per mount so clicking never destroys/recreates the map instance
  useEffect(() => {
    const el = containerRef.current;
    if (el === null || mapInstanceRef.current !== null) {
      return;
    }
    try {
      const map = L.map(el, {
        center: [initialCenterRef.current.lat, initialCenterRef.current.lng],
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

      map.on('click', (event: L.LeafletMouseEvent) => {
        if (modeRef.current === 'picker' && onCoordinatePickedRef.current) {
          const lat = Number(event.latlng.lat.toFixed(5));
          const lng = Number(event.latlng.lng.toFixed(5));
          onCoordinatePickedRef.current(lat, lng);
        }
      });

      onMapCenterAvailable?.(() => {
        const c = map.getCenter();
        return {
          lat: Number(c.lat.toFixed(5)),
          lng: Number(c.lng.toFixed(5)),
        };
      });

      // Ensure accurate click projection after CSS tab-switch entrance animation completes
      const t1 = setTimeout(() => {
        try {
          map.invalidateSize();
        } catch {
          // ignore
        }
      }, 140);
      const t2 = setTimeout(() => {
        try {
          map.invalidateSize();
        } catch {
          // ignore
        }
      }, 340);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        try {
          mapInstanceRef.current?.remove();
        } catch {
          // Ignore teardown issues in headless test environments
        }
        mapInstanceRef.current = null;
        layerGroupRef.current = null;
      };
    } catch {
      setLeafletFailed(true);
      return undefined;
    }
  }, [onMapCenterAvailable]);

  // Re-validate map size when Pin-Point Mode toggles
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) {
      return;
    }
    try {
      map.invalidateSize();
    } catch {
      // ignore
    }
  }, [isPinPointMode]);

  // Sync markers and smoothly pan when selectedLocation or issues change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (map === null || group === null) {
      return;
    }

    group.clearLayers();

    for (const issue of issues) {
      const isSelected = issue.id === selectedIssueId;
      const color = getStatusDotColor(issue.status);
      const circle = L.circleMarker([issue.location.lat, issue.location.lng], {
        radius: isSelected ? 11 : 7,
        color: isSelected ? '#0f172a' : '#ffffff',
        weight: isSelected ? 3 : 2,
        fillColor: color,
        fillOpacity: 0.9,
      });
      circle.on('click', (e: L.LeafletMouseEvent) => {
        if (modeRef.current === 'picker' && onCoordinatePickedRef.current) {
          const lat = Number(e.latlng.lat.toFixed(5));
          const lng = Number(e.latlng.lng.toFixed(5));
          onCoordinatePickedRef.current(lat, lng);
          return;
        }
        onSelectIssue?.(issue.id);
      });
      circle.addTo(group);
    }

    if (mode === 'picker' && selectedLocation) {
      try {
        const draggablePin = L.marker(
          [selectedLocation.lat, selectedLocation.lng],
          {
            draggable: true,
            icon: createPinMarkerIcon(),
          },
        );
        draggablePin.on('dragend', () => {
          const pos = draggablePin.getLatLng();
          if (onCoordinatePickedRef.current) {
            onCoordinatePickedRef.current(
              Number(pos.lat.toFixed(5)),
              Number(pos.lng.toFixed(5)),
            );
          }
        });
        draggablePin.addTo(group);
      } catch {
        // Fallback for minimal DOM environments
        const fallbackCircle = L.circleMarker(
          [selectedLocation.lat, selectedLocation.lng],
          {
            radius: 10,
            color: '#ffffff',
            weight: 2.5,
            fillColor: '#11131a',
            fillOpacity: 0.95,
          },
        );
        fallbackCircle.addTo(group);
      }

      map.setView(
        [selectedLocation.lat, selectedLocation.lng],
        map.getZoom() || 14,
        { animate: false },
      );
    }
  }, [issues, mode, onSelectIssue, selectedIssueId, selectedLocation]);

  if (leafletFailed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-sm text-slate-600 dark:text-slate-300">
        <MapPin className="mb-2 h-6 w-6 text-blue-700" aria-hidden="true" />
        <p className="font-medium">Interactive Coordinate Selector Active</p>
        <p className="mt-1 text-xs text-slate-500">
          Use the quick neighborhood buttons or coordinate pin bar below to pin the exact street location.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`h-full w-full ${isPinPointMode ? 'cursor-crosshair' : ''}`}
      aria-label="Interactive civic issue map"
    />
  );
}

export function CivicMap({
  mode,
  darkTheme,
  language = 'en',
  selectedLocation,
  onSelectLocation,
  issues = [],
  selectedIssueId = null,
  onSelectIssue,
  heightClassName = 'h-72',
}: CivicMapProps): React.ReactElement {
  const t = getUiStrings(language);
  const apiKey = useMemo(() => readGoogleMapsApiKey(), []);
  const [googleAuthFailed, setGoogleAuthFailed] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [isPinPointMode, setIsPinPointMode] = useState(mode === 'picker');
  const [pinQuery, setPinQuery] = useState('');
  const mapCenterGetterRef = useRef<(() => { lat: number; lng: number }) | null>(
    null,
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const winRecord = window as unknown as Record<string, unknown>;
    const previousHandler = Reflect.get(winRecord, 'gm_authFailure');
    Reflect.set(winRecord, 'gm_authFailure', () => {
      setGoogleAuthFailed(true);
      if (typeof previousHandler === 'function') {
        (previousHandler as () => void)();
      }
    });
    return () => {
      Reflect.set(winRecord, 'gm_authFailure', previousHandler);
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

  const applyPinnedCoordinate = useCallback(
    (lat: number, lng: number, explicitLabel?: string) => {
      if (!onSelectLocation) {
        return;
      }
      const clampedLat = Math.max(-90, Math.min(90, Number(lat.toFixed(5))));
      const clampedLng = Math.max(-180, Math.min(180, Number(lng.toFixed(5))));
      const immediateAddress =
        explicitLabel?.trim() || formatCivicAddress(clampedLat, clampedLng);

      onSelectLocation({
        lat: clampedLat,
        lng: clampedLng,
        address: immediateAddress,
      });
      setGpsStatus(
        `Pinned (${clampedLat.toFixed(4)}, ${clampedLng.toFixed(4)}) — ${immediateAddress}`,
      );

      if (!explicitLabel) {
        void resolveStreetAddressAsync(clampedLat, clampedLng).then(
          (resolved) => {
            if (resolved) {
              onSelectLocation({
                lat: clampedLat,
                lng: clampedLng,
                address: resolved,
              });
              setGpsStatus(
                `Pinned (${clampedLat.toFixed(4)}, ${clampedLng.toFixed(4)}) — ${resolved}`,
              );
            }
          },
        );
      }
    },
    [onSelectLocation],
  );

  const handleUseBrowserGps = useCallback(() => {
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.geolocation?.getCurrentPosition !== 'function'
    ) {
      const preset = NEIGHBORHOOD_PRESETS[0]!;
      applyPinnedCoordinate(preset.lat, preset.lng, preset.address);
      return;
    }

    setGpsStatus('Locating GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyPinnedCoordinate(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        const preset = NEIGHBORHOOD_PRESETS[0]!;
        applyPinnedCoordinate(preset.lat, preset.lng, preset.address);
        setGpsStatus('GPS unavailable — pinned to Central Market.');
      },
      { timeout: 6000, enableHighAccuracy: true },
    );
  }, [applyPinnedCoordinate]);

  const handleGoogleMapClick = useCallback(
    (event: MapMouseEvent) => {
      if (mode !== 'picker' || !onSelectLocation) {
        return;
      }
      const latLng = event.detail.latLng;
      if (!latLng) {
        return;
      }
      applyPinnedCoordinate(latLng.lat, latLng.lng);
    },
    [applyPinnedCoordinate, mode, onSelectLocation],
  );

  const handleDropPinAtCenter = useCallback(() => {
    const center = mapCenterGetterRef.current
      ? mapCenterGetterRef.current()
      : activeCenter;
    applyPinnedCoordinate(center.lat, center.lng);
  }, [activeCenter, applyPinnedCoordinate]);

  const handleQuickPinQuerySubmit = useCallback(() => {
    const q = pinQuery.trim();
    if (!q) {
      handleDropPinAtCenter();
      return;
    }
    // Check if user entered "lat, lng" without nested regex quantifiers
    const commaParts = q.split(',');
    if (commaParts.length === 2) {
      const parsedLat = Number(commaParts[0]?.trim());
      const parsedLng = Number(commaParts[1]?.trim());
      if (
        commaParts[0]?.trim() !== '' &&
        commaParts[1]?.trim() !== '' &&
        Number.isFinite(parsedLat) &&
        Number.isFinite(parsedLng)
      ) {
        applyPinnedCoordinate(parsedLat, parsedLng);
        setPinQuery('');
        return;
      }
    }
    // Check if query matches one of our known neighborhood presets
    const matchedPreset = NEIGHBORHOOD_PRESETS.find(
      (p) =>
        p.label.toLowerCase().includes(q.toLowerCase()) ||
        p.address.toLowerCase().includes(q.toLowerCase()),
    );
    if (matchedPreset) {
      applyPinnedCoordinate(
        matchedPreset.lat,
        matchedPreset.lng,
        matchedPreset.address,
      );
      setPinQuery('');
      return;
    }
    // Otherwise pin at current map center with the user's custom street label
    const center = mapCenterGetterRef.current
      ? mapCenterGetterRef.current()
      : activeCenter;
    applyPinnedCoordinate(center.lat, center.lng, q.replace(/[<>]/g, '').slice(0, 140));
    setPinQuery('');
  }, [activeCenter, applyPinnedCoordinate, handleDropPinAtCenter, pinQuery]);

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
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="max-w-[210px] truncate sm:max-w-[290px]">
              {mode === 'picker'
                ? selectedLocation?.address ?? 'Click or drag pin on map'
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

        {/* Center Crosshair Target Indicator when Pin-Point Mode is Active */}
        {mode === 'picker' && isPinPointMode && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[350] flex items-center justify-center"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#11131a]/60 bg-white/40 shadow-xs dark:border-white/70 dark:bg-slate-900/40">
              <div className="h-2 w-2 rounded-full bg-[#11131a] dark:bg-white" />
            </div>
          </div>
        )}

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
                  gmpDraggable={true}
                  onDragEnd={(e) => {
                    const pos = e.latLng;
                    if (pos) {
                      applyPinnedCoordinate(pos.lat(), pos.lng());
                    }
                  }}
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#11131a] text-white shadow-md">
                    <Navigation className="h-3.5 w-3.5" />
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
            initialCenter={activeCenter}
            isPinPointMode={isPinPointMode}
            {...(selectedLocation !== undefined ? { selectedLocation } : {})}
            onCoordinatePicked={(lat, lng) => applyPinnedCoordinate(lat, lng)}
            onMapCenterAvailable={(getter) => {
              mapCenterGetterRef.current = getter;
            }}
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

      {/* 2 Location Controls: 1. Use My GPS Location & 2. Pin Point on Map + Precision Pin Toolbar */}
      {mode === 'picker' && onSelectLocation && (
        <div className="mt-1 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleUseBrowserGps}
                className="press-feedback inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-[#11131a] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 dark:bg-white dark:text-[#11131a]"
              >
                <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t.useGps}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsPinPointMode(true);
                  handleDropPinAtCenter();
                }}
                className={`press-feedback inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold ${
                  isPinPointMode
                    ? 'bg-[#11131a] text-white ring-2 ring-[#3730a3] dark:bg-white dark:text-[#11131a]'
                    : 'border border-slate-300 bg-white text-[#11131a] hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white'
                }`}
              >
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t.pinOnMap}</span>
              </button>

              <button
                type="button"
                onClick={handleDropPinAtCenter}
                title="Drop pin at current map crosshair center"
                className="press-feedback inline-flex min-h-[36px] items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#11131a] hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <Target className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Drop at Center</span>
              </button>
            </div>
          </div>

          {/* Interactive Street / Coordinate Quick-Pin Bar */}
          {isPinPointMode && (
            <div className="surface-well flex flex-col gap-1.5 p-2">
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-slate-500"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    aria-label="Pin street name or coordinates"
                    value={pinQuery}
                    onChange={(e) => setPinQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleQuickPinQuerySubmit();
                      }
                    }}
                    placeholder="Click/drag map pin, or type street / lat,lng..."
                    className="w-full rounded-full border border-slate-300 bg-white py-1 pr-3 pl-8 text-[11px] font-medium text-[#11131a] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleQuickPinQuerySubmit}
                  className="press-feedback shrink-0 rounded-full bg-[#11131a] px-3 py-1 text-[11px] font-bold text-white dark:bg-white dark:text-[#11131a]"
                >
                  Pin Here
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {NEIGHBORHOOD_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      applyPinnedCoordinate(
                        preset.lat,
                        preset.lng,
                        preset.address,
                      )
                    }
                    className="press-feedback rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:border-slate-400 hover:text-[#11131a] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {gpsStatus && (
            <span
              className="truncate text-[11px] font-semibold text-slate-700 dark:text-slate-300"
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

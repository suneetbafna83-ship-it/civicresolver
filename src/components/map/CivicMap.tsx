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
import { Crosshair, MapPin, Navigation, Search, Target } from 'lucide-react';
import type { CivicIssue, IssueLocation } from '../../../shared/types/civic.js';
import {
  getUiStrings,
  type AppLanguage,
} from '../../lib/i18n/translations.js';
import { LeafletFallbackMap } from './LeafletFallbackMap.js';
import {
  NEIGHBORHOOD_PRESETS,
  formatCivicAddress,
  getStatusDotColor,
  resolveStreetAddressAsync,
  type NeighborhoodPreset,
} from './mapGeocoding.js';

export { NEIGHBORHOOD_PRESETS, formatCivicAddress, type NeighborhoodPreset };

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
      (pos) => applyPinnedCoordinate(pos.coords.latitude, pos.coords.longitude),
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
      if (mode !== 'picker' || !onSelectLocation || !event.detail.latLng) {
        return;
      }
      applyPinnedCoordinate(event.detail.latLng.lat, event.detail.latLng.lng);
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
    const center = mapCenterGetterRef.current
      ? mapCenterGetterRef.current()
      : activeCenter;
    applyPinnedCoordinate(
      center.lat,
      center.lng,
      q.replace(/[<>]/g, '').slice(0, 140),
    );
    setPinQuery('');
  }, [activeCenter, applyPinnedCoordinate, handleDropPinAtCenter, pinQuery]);

  const glassHudClass = darkTheme ? 'glass-surface-dark' : 'glass-surface-light';

  return (
    <div className="flex flex-col gap-2.5">
      <div
        className={`relative w-full overflow-hidden card-inner-well border border-slate-200/90 bg-slate-100 dark:border-slate-800 dark:bg-slate-900 ${heightClassName}`}
      >
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
                    <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
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

        {mode === 'overview' && (
          <div
            className={`pointer-events-none absolute right-2.5 bottom-2.5 left-2.5 z-[400] flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-[11px] ${glassHudClass}`}
          >
            <div className="flex items-center gap-3 text-slate-700 dark:text-slate-200">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-600" aria-hidden="true" />
                Reported
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-700" aria-hidden="true" />
                In Progress
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden="true" />
                Resolved
              </span>
            </div>
            <span className="text-slate-500 dark:text-slate-400">
              Click any pin to highlight report
            </span>
          </div>
        )}
      </div>

      {mode === 'picker' && onSelectLocation && (
        <div className="mt-1 flex flex-col gap-2">
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

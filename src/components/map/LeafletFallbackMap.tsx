import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapPin } from 'lucide-react';
import type { CivicIssue, IssueLocation } from '../../../shared/types/civic.js';
import { getStatusDotColor } from './mapGeocoding.js';

export interface LeafletFallbackMapProps {
  readonly mode: 'picker' | 'overview';
  readonly initialCenter: { readonly lat: number; readonly lng: number };
  readonly isPinPointMode: boolean;
  readonly selectedLocation?: IssueLocation;
  readonly onCoordinatePicked?: (lat: number, lng: number) => void;
  readonly onMapCenterAvailable?: (
    getter: () => { lat: number; lng: number },
  ) => void;
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

export function LeafletFallbackMap({
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
          onCoordinatePickedRef.current(
            Number(event.latlng.lat.toFixed(5)),
            Number(event.latlng.lng.toFixed(5)),
          );
        }
      });

      onMapCenterAvailable?.(() => {
        const c = map.getCenter();
        return {
          lat: Number(c.lat.toFixed(5)),
          lng: Number(c.lng.toFixed(5)),
        };
      });

      const invalidate = () => {
        try {
          map.invalidateSize();
        } catch {
          // ignore
        }
      };
      const t1 = setTimeout(invalidate, 140);
      const t2 = setTimeout(invalidate, 340);

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

  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (map === null || group === null) {
      return;
    }

    group.clearLayers();

    for (const issue of issues) {
      const isSelected = issue.id === selectedIssueId;
      const circle = L.circleMarker([issue.location.lat, issue.location.lng], {
        radius: isSelected ? 11 : 7,
        color: isSelected ? '#0f172a' : '#ffffff',
        weight: isSelected ? 3 : 2,
        fillColor: getStatusDotColor(issue.status),
        fillOpacity: 0.9,
      });
      circle.on('click', (e: L.LeafletMouseEvent) => {
        if (modeRef.current === 'picker' && onCoordinatePickedRef.current) {
          onCoordinatePickedRef.current(
            Number(e.latlng.lat.toFixed(5)),
            Number(e.latlng.lng.toFixed(5)),
          );
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
          { draggable: true, icon: createPinMarkerIcon() },
        );
        draggablePin.on('dragend', () => {
          const pos = draggablePin.getLatLng();
          onCoordinatePickedRef.current?.(
            Number(pos.lat.toFixed(5)),
            Number(pos.lng.toFixed(5)),
          );
        });
        draggablePin.addTo(group);
      } catch {
        L.circleMarker([selectedLocation.lat, selectedLocation.lng], {
          radius: 10,
          color: '#ffffff',
          weight: 2.5,
          fillColor: '#11131a',
          fillOpacity: 0.95,
        }).addTo(group);
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

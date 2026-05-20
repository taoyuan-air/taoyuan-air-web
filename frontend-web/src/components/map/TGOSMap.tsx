'use client';

import { useCallback, useEffect, useRef } from 'react';
import { GridCell } from '@shared/types';

interface TGOSMapProps {
  gridCells: GridCell[];
  onGridPress?: (grid: GridCell) => void;
  focusGrid?: GridCell | null;
}

const getGridColor = (value: number) => {
  const stops = [[0,0,228,0],[50,255,255,0],[100,255,126,0],[150,255,0,0],[200,126,0,35]];
  const clamped = Math.max(0, Math.min(200, value));
  let lower = stops[0], upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i][0] && clamped <= stops[i + 1][0]) { lower = stops[i]; upper = stops[i + 1]; break; }
  }
  const ratio = (clamped - lower[0]) / (upper[0] - lower[0]);
  const r = Math.round(lower[1] + (upper[1] - lower[1]) * ratio);
  const g = Math.round(lower[2] + (upper[2] - lower[2]) * ratio);
  const b = Math.round(lower[3] + (upper[3] - lower[3]) * ratio);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
};

type RuntimeWindow = Window & Record<string, unknown>;

interface TGOSPoint {
  x?: number;
  y?: number;
}

interface TGOSMapInstance {
  setCenter: (point: TGOSPoint) => void;
  setZoom: (zoom: number) => void;
}

interface TGOSFillInstance {
  destroy?: () => void;
}

interface TGOSEvent {
  coord?: { x?: number; y?: number };
  lonlat?: { lng?: number; lat?: number };
}

interface TGOSApi {
  Point: new (longitude: number, latitude: number) => TGOSPoint;
  LineString: new (points: TGOSPoint[]) => unknown;
  LinearRing: new (lineString: unknown) => unknown;
  Polygon: new (rings: unknown[]) => unknown;
  Fill: new (map: TGOSMapInstance, polygon: unknown, options: Record<string, unknown>) => TGOSFillInstance;
  OnlineMap: new (
    container: HTMLElement,
    projection: string,
    options: Record<string, unknown>,
    ready: () => void
  ) => TGOSMapInstance;
  Event: {
    addListener: (target: TGOSMapInstance, event: 'click', handler: (event: TGOSEvent) => void) => void;
  };
}

const getTGOS = () => (window as unknown as RuntimeWindow).TGOS as TGOSApi | undefined;

let tgosInitialized = false;

export default function TGOSMap({ gridCells, onGridPress, focusGrid }: TGOSMapProps) {
  const tgosMapRef = useRef<TGOSMapInstance | null>(null);
  const fillsRef = useRef<TGOSFillInstance[]>([]);
  const apiKey = process.env.NEXT_PUBLIC_TGOS_API_KEY;

  const renderPolygons = useCallback((cells: GridCell[], TGOS: TGOSApi, map: TGOSMapInstance) => {
    fillsRef.current.forEach((fill) => { try { fill.destroy?.(); } catch {} });
    fillsRef.current = [];
    cells.forEach((grid) => {
      const points = grid.polygonCoords.map((c) => new TGOS.Point(c.longitude, c.latitude));
      const lineString = new TGOS.LineString(points);
      const ring = new TGOS.LinearRing(lineString);
      const polygon = new TGOS.Polygon([ring]);
      const fill = new TGOS.Fill(map, polygon, { fillColor: getGridColor(grid.values.value), fillopacity: 0.5, strokeColor: '#E76595', strokeWeight: 1, strokeOpacity: 0.4 });
      fillsRef.current.push(fill);
    });
    if (onGridPress) {
      TGOS.Event.addListener(map, 'click', (event) => {
        const lng = event.coord?.x ?? event.lonlat?.lng;
        const lat = event.coord?.y ?? event.lonlat?.lat;
        if (lng == null || lat == null) return;
        const hit = cells.find((grid) => {
          const lngs = grid.polygonCoords.map((c) => c.longitude);
          const lats = grid.polygonCoords.map((c) => c.latitude);
          return lng >= Math.min(...lngs) && lng <= Math.max(...lngs) && lat >= Math.min(...lats) && lat <= Math.max(...lats);
        });
        if (hit) onGridPress(hit);
      });
    }
  }, [onGridPress]);

  useEffect(() => {
    const loadScript = (src: string, id: string) => new Promise((resolve, reject) => {
      if (document.getElementById(id)) return resolve(true);
      const s = document.createElement('script'); s.id = id; s.src = src; s.charset = 'utf-8';
      s.onload = () => resolve(true); s.onerror = reject;
      document.head.appendChild(s);
    });

    const init = async () => {
      if (tgosInitialized) return;
      if (!apiKey) return;
      tgosInitialized = true;
      try {
        await loadScript(`https://api.tgos.tw/TGOS_MAP_API_3?APIKEY=${apiKey}`, 'tgos-sdk');
        const TGOS = getTGOS();
        if (!TGOS) return;
        const container = document.getElementById('tgos-map');
        if (!container) return;
        const map = new TGOS.OnlineMap(container, 'EPSG4326', { mapMode: 3 }, () => {
          map.setCenter(new TGOS.Point(121.25, 25.0));
          map.setZoom(11);
          if (gridCells.length > 0) renderPolygons(gridCells, TGOS, map);
        });
        tgosMapRef.current = map;
      } catch {
        tgosInitialized = false;
      }
    };
    init();
  }, [apiKey, gridCells, renderPolygons]);

  useEffect(() => {
    const TGOS = getTGOS();
    if (!tgosMapRef.current || !TGOS) return;
    renderPolygons(gridCells, TGOS, tgosMapRef.current);
  }, [gridCells, renderPolygons]);

  useEffect(() => {
    const TGOS = getTGOS();
    if (!focusGrid || !tgosMapRef.current || !TGOS) return;
    tgosMapRef.current.setCenter(new TGOS.Point(focusGrid.centerLatLng.longitude, focusGrid.centerLatLng.latitude));
    tgosMapRef.current.setZoom(13);
  }, [focusGrid]);

  if (!apiKey) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFF6F9',
        color: '#7F5A6A',
        fontSize: 14,
        fontWeight: 600,
      }}>
        TGOS map requires NEXT_PUBLIC_TGOS_API_KEY
      </div>
    );
  }

  return <div id="tgos-map" style={{ width: '100%', height: '100%' }} />;
}

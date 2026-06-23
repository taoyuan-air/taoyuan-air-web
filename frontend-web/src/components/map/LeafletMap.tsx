'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GridCell, TEDSPoint } from '@shared/types';

interface LeafletMapProps {
  gridCells: GridCell[];
  tedsPoints?: TEDSPoint[];
  mapMode: '2D' | 'Satellite';
  onGridPress?: (grid: GridCell) => void;
  focusGrid?: GridCell | null;
}

type LatLngTuple = [number, number];
type RuntimeWindow = Window & Record<string, unknown>;

interface LeafletClickEvent {
  originalEvent?: {
    stopPropagation?: () => void;
  };
}

interface LeafletMapInstance {
  options: { maxZoom?: number };
  setMaxZoom?: (zoom: number) => void;
  getCenter: () => unknown;
  getZoom: () => number;
  invalidateSize: () => void;
  setView: (center: unknown, zoom: number, options?: { animate?: boolean }) => void;
  on: (event: 'zoomend', handler: () => void) => void;
}

interface LeafletLayerGroup {
  clearLayers: () => void;
  addTo: (map: LeafletMapInstance) => LeafletLayerGroup;
}

interface LeafletPolygon {
  on: (event: 'click', handler: (event: LeafletClickEvent) => void) => void;
  addTo: (layerGroup: LeafletLayerGroup) => void;
}

interface LeafletTileLayer {
  addTo: (map: LeafletMapInstance) => void;
}

// ── 💡 修正後的核心 Leaflet API 介面 ──────────────────────────────────
interface LeafletMarkerInstance {
  addTo: (map: LeafletMapInstance | LeafletLayerGroup) => LeafletMarkerInstance;
  bindPopup: (text: string) => LeafletMarkerInstance; // 移除問號，確保絕對安全
}

interface LeafletApi {
  map: (id: string, options: Record<string, unknown>) => LeafletMapInstance;
  tileLayer: (url: string, options: Record<string, unknown>) => LeafletTileLayer;
  layerGroup: () => LeafletLayerGroup;
  marker?: (pos: LatLngTuple, options?: Record<string, unknown>) => { addTo: (map: LeafletMapInstance | LeafletLayerGroup) => any; bindPopup?: (text: string) => any };
  polygon: (positions: LatLngTuple[], options: Record<string, unknown>) => LeafletPolygon;
}

interface WindyColors {
  changeColor: (colors: [number, [number, number, number, number]][]) => void;
  toDefault: () => void;
}

interface WindyApi {
  map: LeafletMapInstance;
  store: { set: (key: string, value: string) => void };
  colors?: { wind?: WindyColors };
  L?: LeafletApi;
}

type WindyInit = (options: Record<string, unknown>, callback: (api: WindyApi) => void) => void;

// Module-level shim: Turbopack wraps inline async callbacks into annotated objects,
// which breaks Windy's minified code when it tries to call the second arg as a function.
// A module-level function reference is not wrapped.
let _windyReadyCallback: ((api: WindyApi) => void) | null = null;
const WINDY_CALLBACK_NAME = '__taoyuanAirWindyReady';
const scriptLoaders = new Map<string, Promise<boolean>>();
const WINDY_DETAIL_ZOOM = 11;
const DETAIL_MAX_ZOOM = 19;
const MAP_FADE_MS = 220;

const getWindowValue = <T,>(key: string) => (window as unknown as RuntimeWindow)[key] as T | undefined;

const getRuntimeWindyCallback = () => {
  (window as unknown as RuntimeWindow)[WINDY_CALLBACK_NAME] = (api: WindyApi) => _windyReadyCallback?.(api);
  return new Function(`return window["${WINDY_CALLBACK_NAME}"]`)() as (api: WindyApi) => void;
};

const getRuntimeWindyInit = () => new Function('return window.windyInit')() as WindyInit | undefined;

const createScriptLoadError = (src: string) => new Error(`Failed to load map script: ${src}`);

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
  return `rgba(${r},${g},${b},0.4)`;
};

export default function LeafletMap({ gridCells, tedsPoints, mapMode, onGridPress, focusGrid }: LeafletMapProps) {
  const [isDetailMode, setIsDetailMode] = useState(false);
  const mapRef = useRef<LeafletMapInstance | null>(null);
  const windyLeafletRef = useRef<LeafletApi | null>(null);
  const polygonLayerGroupRef = useRef<LeafletLayerGroup | null>(null);
  const detailMapRef = useRef<LeafletMapInstance | null>(null);
  const detailLayerGroupRef = useRef<LeafletLayerGroup | null>(null);
  const satMapRef = useRef<LeafletMapInstance | null>(null);
  const satLayerGroupRef = useRef<LeafletLayerGroup | null>(null);
  const tedsPointsLayerGroupRef = useRef<LeafletLayerGroup | null>(null);
  const initStartedRef = useRef(false);
  const isSyncingRef = useRef(false);
  const isDetailModeRef = useRef(false);
  const mapModeRef = useRef(mapMode);
  const gridCellsRef = useRef<GridCell[]>(gridCells);
  const onGridPressRef = useRef(onGridPress);
  const tedsPointsRef = useRef<TEDSPoint[]>(tedsPoints || []);

  const updateDetailMode = useCallback((next: boolean) => {
    isDetailModeRef.current = next;
    setIsDetailMode(next);
  }, []);

  const renderTEDSPoints = useCallback((points: TEDSPoint[], L: LeafletApi, layerGroup: LeafletLayerGroup, mapInstance?: LeafletMapInstance) => {
    if (!L || !layerGroup || !mapInstance) return;
    layerGroup.clearLayers();
    
    const zoom = mapInstance.getZoom();
    // Only render TEDS points at high zoom to prevent performance issues
    if (zoom < 14) return;
    
    if (!L.marker) return;
    
    // Even at high zoom, limit to prevent lag
    const maxMarkers = zoom >= 15 ? 2000 : 1000;
    const pointsToRender = points.slice(0, maxMarkers);
    
    pointsToRender.forEach((point) => {
      const pos: LatLngTuple = [point.latLng.latitude, point.latLng.longitude];
      try {
        const marker = L.marker?.(pos, { 
          title: point.name || point.id,
        });
        if (marker) {
          marker.addTo(layerGroup);
          if (typeof marker.bindPopup === 'function') {
            marker.bindPopup(`<strong>${point.name || point.id}</strong><br/>Height: ${point.heightM || 'N/A'}m`);
          }
        }
      } catch (e) {
        // Silently skip markers that fail to render
      }
    });
  }, []);

  useEffect(() => {
    gridCellsRef.current = gridCells;
  }, [gridCells]);

  useEffect(() => {
    tedsPointsRef.current = tedsPoints || [];
  }, [tedsPoints]);

  useEffect(() => {
    mapModeRef.current = mapMode;
  }, [mapMode]);

  useEffect(() => {
    onGridPressRef.current = onGridPress;
  }, [onGridPress]);

  const syncDetailFromWindy = useCallback(() => {
    const windyMap = mapRef.current;
    const detailMap = detailMapRef.current;
    if (!windyMap || !detailMap) return;

    const center = windyMap.getCenter();
    const zoom = Math.min(Math.max(windyMap.getZoom(), WINDY_DETAIL_ZOOM + 1), DETAIL_MAX_ZOOM);

    isSyncingRef.current = true;
    detailMap.invalidateSize();
    detailMap.setView(center, zoom, { animate: false });
    window.requestAnimationFrame(() => {
      updateDetailMode(true);
      window.setTimeout(() => { isSyncingRef.current = false; }, MAP_FADE_MS);
    });
  }, [updateDetailMode]);

  const syncWindyFromDetail = useCallback(() => {
    const windyMap = mapRef.current;
    const detailMap = detailMapRef.current;
    if (!windyMap || !detailMap) return;

    const center = detailMap.getCenter();
    const zoom = Math.min(detailMap.getZoom(), WINDY_DETAIL_ZOOM);

    isSyncingRef.current = true;
    windyMap.invalidateSize();
    windyMap.setView(center, zoom, { animate: false });
    window.requestAnimationFrame(() => {
      updateDetailMode(false);
      window.setTimeout(() => { isSyncingRef.current = false; }, MAP_FADE_MS);
    });
  }, [updateDetailMode]);

  const renderPolygons = useCallback((cells: GridCell[], L: LeafletApi, layerGroup: LeafletLayerGroup) => {
    if (!L || !layerGroup) return;
    layerGroup.clearLayers();
    cells.forEach((grid) => {
      const positions = grid.polygonCoords.map((c) => [c.latitude, c.longitude] as LatLngTuple);
      const polygon = L.polygon(positions, { fillColor: getGridColor(grid.values.value), fillOpacity: 0.6, color: 'rgba(106,141,115,0.3)', weight: 1 });
      polygon.on('click', (e) => { e.originalEvent?.stopPropagation?.(); onGridPressRef.current?.(grid); });
      polygon.addTo(layerGroup);
    });
  }, []);

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (event.reason instanceof Error) return;
      console.error('Map SDK rejected with a non-Error value:', event.reason);
      event.preventDefault();
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  }, []);

  useEffect(() => {
    const loadScript = (src: string, id: string) => new Promise((resolve, reject) => {
      const existingScript = document.getElementById(id) as HTMLScriptElement | null;
      if (existingScript?.dataset.loaded === 'true') return resolve(true);
      if (scriptLoaders.has(id)) return scriptLoaders.get(id)?.then(resolve).catch(reject);
      if (existingScript) {
        const loader = new Promise<boolean>((loaderResolve, loaderReject) => {
          existingScript.addEventListener('load', () => {
            existingScript.dataset.loaded = 'true';
            loaderResolve(true);
          }, { once: true });
          existingScript.addEventListener('error', () => loaderReject(createScriptLoadError(src)), { once: true });
        });
        scriptLoaders.set(id, loader);
        return loader.then(resolve).catch(reject);
      }

      const s = document.createElement('script'); s.id = id; s.src = src;
      const loader = new Promise<boolean>((loaderResolve, loaderReject) => {
        s.onload = () => {
          s.dataset.loaded = 'true';
          loaderResolve(true);
        };
        s.onerror = () => loaderReject(createScriptLoadError(src));
      });
      scriptLoaders.set(id, loader);
      loader.then(resolve).catch(reject);
      document.head.appendChild(s);
    });
    const loadLink = (href: string, id: string) => new Promise((resolve) => {
      if (document.getElementById(id)) return resolve(true);
      const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = href;
      l.onload = () => resolve(true); document.head.appendChild(l);
    });

    const init = async () => {
      if (initStartedRef.current) return;
      if (mapRef.current && satMapRef.current) return;
      initStartedRef.current = true;

      try {
        await loadLink('https://unpkg.com/leaflet@1.4.0/dist/leaflet.css', 'leaflet-css');
        await loadScript('https://unpkg.com/leaflet@1.4.0/dist/leaflet.js', 'leaflet-js');
        const L = getWindowValue<LeafletApi>('L');
        if (!L) return;

        const satContainer = document.getElementById('satellite-map');
        if (satContainer && !satMapRef.current) {
          const satMap = L.map('satellite-map', { center: [25.0, 121.25], zoom: WINDY_DETAIL_ZOOM, maxZoom: DETAIL_MAX_ZOOM, zoomControl: false });
          L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri', maxZoom: DETAIL_MAX_ZOOM }).addTo(satMap);
          satMapRef.current = satMap;
          satLayerGroupRef.current = L.layerGroup().addTo(satMap);
          if (gridCellsRef.current.length > 0) renderPolygons(gridCellsRef.current, L, satLayerGroupRef.current);
          const satLayerGroup = satLayerGroupRef.current;
          if (satLayerGroup && tedsPointsRef.current.length > 0) renderTEDSPoints(tedsPointsRef.current, L, satLayerGroup, satMap);
          satMap.on('zoomend', () => {
            if (satLayerGroup && tedsPointsRef.current.length > 0) renderTEDSPoints(tedsPointsRef.current, L, satLayerGroup, satMap);
          });
        }

        const detailContainer = document.getElementById('detail-map');
        if (detailContainer && !detailMapRef.current) {
          const detailMap = L.map('detail-map', { center: [25.0, 121.25], zoom: WINDY_DETAIL_ZOOM, maxZoom: DETAIL_MAX_ZOOM, zoomControl: false });
          L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri',
            maxZoom: DETAIL_MAX_ZOOM,
          }).addTo(detailMap);
          detailMapRef.current = detailMap;
          detailLayerGroupRef.current = L.layerGroup().addTo(detailMap);
          if (gridCellsRef.current.length > 0) renderPolygons(gridCellsRef.current, L, detailLayerGroupRef.current);
          const detailLayerGroup = detailLayerGroupRef.current;
          if (detailLayerGroup && tedsPointsRef.current.length > 0) renderTEDSPoints(tedsPointsRef.current, L, detailLayerGroup, detailMap);
          detailMap.on('zoomend', () => {
            if (isSyncingRef.current || mapModeRef.current !== '2D') return;
            if (detailMap.getZoom() <= WINDY_DETAIL_ZOOM && isDetailModeRef.current) {
              syncWindyFromDetail();
            } else if (detailLayerGroup && tedsPointsRef.current.length > 0) {
              renderTEDSPoints(tedsPointsRef.current, L, detailLayerGroup, detailMap);
            }
          });
        }

        await loadScript('https://api.windy.com/assets/map-forecast/libBoot.js', 'windy-sdk');
        const apikey = process.env.NEXT_PUBLIC_WINDY_API_KEY;
        if (!apikey) return;
        _windyReadyCallback = (windyAPI: WindyApi) => {
          if (!windyAPI) return;
          const { map, store } = windyAPI;
          const WL = windyAPI.L || getWindowValue<LeafletApi>('L');
          if (!WL || !map) return;
          store.set('overlay', 'wind');
          const targetLayer = windyAPI.colors?.wind;
          if (targetLayer && typeof targetLayer.changeColor === 'function') {
            targetLayer.changeColor([
              [0,   [128, 128, 128, 255]],
              [1,   [128, 128, 128, 255]],
              [3,   [128, 128, 128, 255]],
              [5,   [128, 128, 128, 255]],
              [7,   [128, 128, 128, 255]],
              [9,   [128, 128, 128, 255]],
              [11,  [128, 128, 128, 255]],
              [13,  [128, 128, 128, 255]],
              [15,  [128, 128, 128, 255]],
              [17,  [128, 128, 128, 255]],
              [19,  [128, 128, 128, 255]],
              [21,  [128, 128, 128, 255]],
              [24,  [128, 128, 128, 255]],
              [27,  [128, 128, 128, 255]],
              [29,  [128, 128, 128, 255]],
              [36,  [128, 128, 128, 255]],
              [46,  [128, 128, 128, 255]],
              [51,  [128, 128, 128, 255]],
              [77,  [128, 128, 128, 255]],
              [104, [128, 128, 128, 255]],
            ]);
          }
          mapRef.current = map;
          windyLeafletRef.current = WL;
          map.options.maxZoom = DETAIL_MAX_ZOOM;
          map.setMaxZoom?.(DETAIL_MAX_ZOOM);
          polygonLayerGroupRef.current = WL.layerGroup().addTo(map);
          const polygonLayerGroup = polygonLayerGroupRef.current;
          if (polygonLayerGroup && tedsPointsRef.current.length > 0) renderTEDSPoints(tedsPointsRef.current, WL, polygonLayerGroup, map);
          map.on('zoomend', () => {
            if (isSyncingRef.current || mapModeRef.current !== '2D') return;
            if (map.getZoom() > WINDY_DETAIL_ZOOM) {
              syncDetailFromWindy();
            } else if (polygonLayerGroup && tedsPointsRef.current.length > 0) {
              // Re-render TEDS points at appropriate zoom level
              renderTEDSPoints(tedsPointsRef.current, WL, polygonLayerGroup, map);
            }
          });
          if (gridCellsRef.current.length > 0) renderPolygons(gridCellsRef.current, WL, polygonLayerGroupRef.current);
        };
        const windyInit = getRuntimeWindyInit();
        if (typeof windyInit !== 'function') return;

        windyInit({
          key: apikey,
          domElement: document.getElementById('windy'),
          lat: 25.0,
          lon: 121.25,
          zoom: 11,
        }, getRuntimeWindyCallback());
      } catch (err) {
        initStartedRef.current = false;
        console.error('地圖初始化失敗:', err);
      }
    };
    init();
  }, [renderPolygons, syncDetailFromWindy, syncWindyFromDetail]);

  useEffect(() => {
    const L = getWindowValue<LeafletApi>('L');
    if (L || windyLeafletRef.current) {
      if (mapRef.current && polygonLayerGroupRef.current) {
        const windyLeaflet = windyLeafletRef.current || L;
        if (windyLeaflet) renderPolygons(gridCells, windyLeaflet, polygonLayerGroupRef.current);
      }
      if (L && detailMapRef.current && detailLayerGroupRef.current) renderPolygons(gridCells, L, detailLayerGroupRef.current);
      if (L && satMapRef.current && satLayerGroupRef.current) renderPolygons(gridCells, L, satLayerGroupRef.current);
    }
  }, [gridCells, renderPolygons]);

  useEffect(() => {
    const L = getWindowValue<LeafletApi>('L');
    const windyLeaflet = windyLeafletRef.current || L;
    if (!windyLeaflet) return;
    if (polygonLayerGroupRef.current && mapRef.current) renderTEDSPoints(tedsPointsRef.current, windyLeaflet, polygonLayerGroupRef.current, mapRef.current);
    if (L && detailLayerGroupRef.current && detailMapRef.current) renderTEDSPoints(tedsPointsRef.current, L, detailLayerGroupRef.current, detailMapRef.current);
    if (L && satLayerGroupRef.current && satMapRef.current) renderTEDSPoints(tedsPointsRef.current, L, satLayerGroupRef.current, satMapRef.current);
  }, [tedsPoints, renderTEDSPoints]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapMode === '2D' && !isDetailMode && mapRef.current) mapRef.current.invalidateSize();
      if (mapMode === '2D' && detailMapRef.current) detailMapRef.current.invalidateSize();
      if (mapMode === 'Satellite' && satMapRef.current) satMapRef.current.invalidateSize();
    }, 100);
    return () => clearTimeout(timer);
  }, [mapMode, isDetailMode]);

  useEffect(() => {
    if (!focusGrid) return;
    const center = [focusGrid.centerLatLng.latitude, focusGrid.centerLatLng.longitude];
    const zoom = 13;
    if (mapMode === 'Satellite' && satMapRef.current) {
      satMapRef.current.setView(center, zoom, { animate: true });
      return;
    }
    if (isDetailMode && detailMapRef.current) {
      detailMapRef.current.setView(center, zoom, { animate: true });
      return;
    }
    if (mapRef.current) {
      mapRef.current.setView(center, Math.min(zoom, WINDY_DETAIL_ZOOM), { animate: true });
    }
  }, [focusGrid, isDetailMode, mapMode]);

  const showSatelliteMap = mapMode === 'Satellite';
  const showDetailMap = mapMode === '2D' && isDetailMode;
  const showWindyMap = mapMode === '2D' && !isDetailMode;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: showWindyMap ? 1 : 0,
        pointerEvents: showWindyMap ? 'auto' : 'none',
        transition: `opacity ${MAP_FADE_MS}ms ease`,
        zIndex: showWindyMap ? 2 : 1,
      }}>
        <div id="windy" style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: showDetailMap ? 1 : 0,
        pointerEvents: showDetailMap ? 'auto' : 'none',
        transition: `opacity ${MAP_FADE_MS}ms ease`,
        zIndex: showDetailMap ? 3 : 1,
        filter: 'saturate(0.88) brightness(0.98)',
      }}>
        <div id="detail-map" style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: showSatelliteMap ? 1 : 0,
        pointerEvents: showSatelliteMap ? 'auto' : 'none',
        transition: `opacity ${MAP_FADE_MS}ms ease`,
        zIndex: showSatelliteMap ? 4 : 1,
      }}>
        <div id="satellite-map" style={{ width: '100%', height: '100%' }} />
      </div>
      {mapMode === '2D' && isDetailMode && (
        <div style={{
          position: 'absolute',
          right: 20,
          top: 20,
          zIndex: 450,
          padding: '7px 12px',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.9)',
          border: '1px solid rgba(255,255,255,0.75)',
          boxShadow: '0 4px 16px rgba(58,30,45,0.12)',
          color: '#7b6271',
          fontSize: 12,
          fontWeight: 700,
          pointerEvents: 'none',
        }}>
          高倍率地圖
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { GridCell } from '@shared/types';

interface LeafletMapProps {
  gridCells: GridCell[];
  mapMode: '2D' | 'Satellite';
  onGridPress?: (grid: GridCell) => void;
}

// Module-level shim: Turbopack wraps inline async callbacks into annotated objects,
// which breaks Windy's minified code when it tries to call the second arg as a function.
// A module-level function reference is not wrapped.
let _windyReadyCallback: ((api: any) => void) | null = null;
const WINDY_CALLBACK_NAME = '__taoyuanAirWindyReady';
const scriptLoaders = new Map<string, Promise<boolean>>();

const getRuntimeWindyCallback = () => {
  (window as any)[WINDY_CALLBACK_NAME] = (api: any) => _windyReadyCallback?.(api);
  return new Function(`return window["${WINDY_CALLBACK_NAME}"]`)();
};

const getRuntimeWindyInit = () => new Function('return window.windyInit')();

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

export default function LeafletMap({ gridCells, mapMode, onGridPress }: LeafletMapProps) {
  const mapRef = useRef<any>(null);
  const windyLeafletRef = useRef<any>(null);
  const polygonLayerGroupRef = useRef<any>(null);
  const satMapRef = useRef<any>(null);
  const satLayerGroupRef = useRef<any>(null);
  const initStartedRef = useRef(false);
  const gridCellsRef = useRef<GridCell[]>(gridCells);
  const onGridPressRef = useRef(onGridPress);

  useEffect(() => {
    gridCellsRef.current = gridCells;
  }, [gridCells]);

  useEffect(() => {
    onGridPressRef.current = onGridPress;
  }, [onGridPress]);

  const renderPolygons = (cells: GridCell[], L: any, layerGroup: any) => {
    if (!L || !layerGroup) return;
    layerGroup.clearLayers();
    cells.forEach((grid) => {
      const positions = grid.polygonCoords.map((c) => [c.latitude, c.longitude] as [number, number]);
      const polygon = L.polygon(positions, { fillColor: getGridColor(grid.values.value), fillOpacity: 0.6, color: 'rgba(106,141,115,0.3)', weight: 1 });
      polygon.on('click', (e: any) => { e.originalEvent?.stopPropagation(); onGridPressRef.current?.(grid); });
      polygon.addTo(layerGroup);
    });
  };

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
          existingScript.addEventListener('error', loaderReject, { once: true });
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
        s.onerror = loaderReject;
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
        const L = (window as any).L;
        if (!L) return;

        const satContainer = document.getElementById('satellite-map');
        if (satContainer && !satMapRef.current) {
          const satMap = L.map('satellite-map', { center: [25.0, 121.25], zoom: 11, zoomControl: false });
          L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri', maxZoom: 19 }).addTo(satMap);
          satMapRef.current = satMap;
          satLayerGroupRef.current = L.layerGroup().addTo(satMap);
        }

        await loadScript('https://api.windy.com/assets/map-forecast/libBoot.js', 'windy-sdk');
        const apikey = process.env.NEXT_PUBLIC_WINDY_API_KEY;
        if (!apikey) return;
        _windyReadyCallback = (windyAPI: any) => {
          if (!windyAPI) return;
          const { map, store } = windyAPI;
          const WL = windyAPI.L || (window as any).L;
          if (!WL || !map) return;
          store.set('overlay', 'wind');
          mapRef.current = map;
          windyLeafletRef.current = WL;
          polygonLayerGroupRef.current = WL.layerGroup().addTo(map);
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
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    if (L || windyLeafletRef.current) {
      if (mapRef.current && polygonLayerGroupRef.current) {
        renderPolygons(gridCells, windyLeafletRef.current || L, polygonLayerGroupRef.current);
      }
      if (satMapRef.current && satLayerGroupRef.current) renderPolygons(gridCells, L, satLayerGroupRef.current);
    }
  }, [gridCells]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapMode === '2D' && mapRef.current) mapRef.current.invalidateSize();
      if (mapMode === 'Satellite' && satMapRef.current) satMapRef.current.invalidateSize();
    }, 100);
    return () => clearTimeout(timer);
  }, [mapMode]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 0, display: mapMode === 'Satellite' ? 'none' : 'block' }}>
        <div id="windy" style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={{ position: 'absolute', inset: 0, display: mapMode === 'Satellite' ? 'block' : 'none' }}>
        <div id="satellite-map" style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}

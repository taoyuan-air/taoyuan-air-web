import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { GridCell } from '../types';

interface LeafletMapProps {
  gridCells: GridCell[];
  mapMode: '2D' | 'Satellite';
  onGridPress?: (grid: GridCell) => void;
}

// Grid 線性色階函式，根據數值返回對應的 RGBA 顏色
const getGridColor = (value: number) => {
  // 定義色階錨點 [數值, r, g, b]
  const stops = [
    [0,   0,   228, 0  ],  // 綠
    [50,  255, 255, 0  ],  // 黃
    [100, 255, 126, 0  ],  // 橘
    [150, 255, 0,   0  ],  // 紅
    [200, 126, 0,   35 ],  // 深紅紫
  ];
  const clamped = Math.max(0, Math.min(200, value));
  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i][0] && clamped <= stops[i + 1][0]) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }
  const ratio = (clamped - lower[0]) / (upper[0] - lower[0]);
  const r = Math.round(lower[1] + (upper[1] - lower[1]) * ratio);
  const g = Math.round(lower[2] + (upper[2] - lower[2]) * ratio);
  const b = Math.round(lower[3] + (upper[3] - lower[3]) * ratio);
  return `rgba(${r}, ${g}, ${b}, 0.4)`;
};

let windyInitialized = false;

export const LeafletMap: React.FC<LeafletMapProps> = ({ gridCells, mapMode, onGridPress }) => {
  // —— 2D (Windy) refs ——
  const mapRef = useRef<any>(null);
  const windyStoreRef = useRef<any>(null);
  const polygonLayerGroupRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  // —— Satellite refs ——
  const satMapRef = useRef<any>(null);
  const satLayerGroupRef = useRef<any>(null);

  // ——————————————————————————————————————————
  // 通用：將 gridCells 畫入指定的 layerGroup
  // ——————————————————————————————————————————
  const renderPolygonsToGroup = (
    cells: GridCell[],
    L: any,
    layerGroup: any,
  ) => {
    if (!L || !layerGroup) return;

    cells.forEach((grid) => {
      const positions = grid.polygonCoords.map(
        (coord) => [coord.latitude, coord.longitude] as [number, number],
      );

      const polygon = L.polygon(positions, {
        fillColor: getGridColor(grid.values.value),
        fillOpacity: 0.6,
        color: 'rgba(106, 141, 115, 0.3)',
        weight: 1,
      });

      polygon.on('click', (e: any) => {
        if (e.originalEvent) e.originalEvent.stopPropagation();
        onGridPress?.(grid);
      });

      polygon.addTo(layerGroup);
    });
  };

  // ——————————————————————————————————————————
  // 初始化：Leaflet → Satellite map → Windy map
  // ——————————————————————————————————————————
  useEffect(() => {
    const loadScript = (src: string, id: string) =>
      new Promise((resolve, reject) => {
        if (document.getElementById(id)) return resolve(true);
        const script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.onload = () => resolve(true);
        script.onerror = reject;
        document.head.appendChild(script);
      });

    const loadLink = (href: string, id: string) =>
      new Promise((resolve) => {
        if (document.getElementById(id)) return resolve(true);
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = () => resolve(true);
        document.head.appendChild(link);
      });

    const initAll = async () => {
      if (windyInitialized) return;
      windyInitialized = true;

      try {
        // 1. 載入 Leaflet CSS + JS
        await loadLink(
          'https://unpkg.com/leaflet@1.4.0/dist/leaflet.css',
          'leaflet-css',
        );
        await loadScript(
          'https://unpkg.com/leaflet@1.4.0/dist/leaflet.js',
          'leaflet-js',
        );

        // 2. 初始化 Satellite Leaflet map（在 Windy 之前，共用同一個 L）
        const L = (window as any).L;
        if (L && !satMapRef.current) {
          const satMap = L.map('satellite-map', {
            center: [25.0, 121.25],
            zoom: 11,
            zoomControl: false,
          });

          // ArcGIS 衛星底圖
          L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            {
              attribution:
                'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
              maxZoom: 19,
            },
          ).addTo(satMap);

          satMapRef.current = satMap;
          satLayerGroupRef.current = L.layerGroup().addTo(satMap);

          // 初始渲染
          if (gridCells && gridCells.length > 0) {
            renderPolygonsToGroup(gridCells, L, satLayerGroupRef.current);
          }
        }

        // 3. 載入 Windy SDK
        await loadScript(
          'https://api.windy.com/assets/map-forecast/libBoot.js',
          'windy-sdk',
        );

        // 4. 初始化 Windy
        const apikey = process.env.EXPO_PUBLIC_WINDY_API_KEY;
        const options = { key: apikey, lat: 25.0, lon: 121.25, zoom: 11 };

        // @ts-ignore
        window.windyInit(options, (windyAPI: any) => {
          if (!windyAPI) {
            console.error('Windy API 初始化失敗，未回傳物件');
            return;
          }

          const WL = windyAPI.L || (window as any).L;
          const { colors, store, map } = windyAPI;
          if (!WL) {
            console.error('無法取得 Leaflet (L) 實例');
            return;
          }

          // 修改風速圖背景色
          const targetLayer = colors.wind;
          if (targetLayer && typeof targetLayer.changeColor === 'function') {
            try {
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
              console.log('wind 色階自定義成功');
            } catch (e) {
              console.error('執行 changeColor 時出錯:', e);
            }
          } else {
            console.warn(
              '找不到該圖層的顏色定義，目前的圖層清單：',
              Object.keys(colors),
            );
          }
          store.set('overlay', 'wind');

          mapRef.current = map;
          windyStoreRef.current = store;
          LRef.current = WL;

          try {
            polygonLayerGroupRef.current = WL.layerGroup().addTo(map);
            console.log('Windy 圖層組建立成功');
          } catch (e) {
            console.error('建立 layerGroup 時出錯:', e);
          }

          if (gridCells && gridCells.length > 0) {
            renderPolygonsToGroup(gridCells, WL, polygonLayerGroupRef.current);
          }
        });
      } catch (err) {
        console.error('地圖載入失敗:', err);
      }
    };

    initAll();
  }, []);

  // ——————————————————————————————————————————
  // gridCells 更新時，同步重繪兩個地圖的網格
  // ——————————————————————————————————————————
  useEffect(() => {
    // 更新 Windy (2D) 地圖
    if (mapRef.current && polygonLayerGroupRef.current && LRef.current) {
      polygonLayerGroupRef.current.clearLayers();
      if (gridCells && gridCells.length > 0) {
        renderPolygonsToGroup(gridCells, LRef.current, polygonLayerGroupRef.current);
      }
    }

    // 更新 Satellite 地圖
    if (satMapRef.current && satLayerGroupRef.current) {
      const L = (window as any).L;
      satLayerGroupRef.current.clearLayers();
      if (gridCells && gridCells.length > 0) {
        renderPolygonsToGroup(gridCells, L, satLayerGroupRef.current);
      }
    }
  }, [gridCells]);

  // ——————————————————————————————————————————
  // mapMode 切換時，通知 Leaflet invalidateSize
  // （避免 display:none 後 tile 排版錯亂）
  // ——————————————————————————————————————————
  useEffect(() => {
    const delay = setTimeout(() => {
      if (mapMode === '2D' && mapRef.current) {
        mapRef.current.invalidateSize();
      }
      if (mapMode === 'Satellite' && satMapRef.current) {
        satMapRef.current.invalidateSize();
      }
    }, 50);
    return () => clearTimeout(delay);
  }, [mapMode]);

  // ——————————————————————————————————————————
  // Render
  // ——————————————————————————————————————————
  return (
    <View style={styles.container}>
      {/* 2D 模式：Windy */}
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { display: mapMode === 'Satellite' ? 'none' : 'flex' },
        ]}
      >
        <style dangerouslySetInnerHTML={{ __html: `
          #windy #ovr-select,
          #windy #mobile-ovr-select,
          #windy #logo {
            display: none !important;
          }
        `}} />
        <div id="windy" style={{ width: '100%', height: '100%' }} />
      </View>

      {/* Satellite 模式：Leaflet + ArcGIS 衛星圖磚 */}
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { display: mapMode === 'Satellite' ? 'flex' : 'none' },
        ]}
      >
        <div id="satellite-map" style={{ width: '100%', height: '100%' }} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
  },
});



/*———————————————————————————————————————————————————————
   Backup: LeafletMap.web.tsx (Frirst original version)
—————————————————————————————————————————————————————————

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { MapContainer, TileLayer, Polygon, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { GridCell } from '../types';

interface LeafletMapProps {
  gridCells: GridCell[];
  mapMode: '2D' | 'Satellite';
  onGridPress?: (grid: GridCell) => void;
}

const getGridColor = (value: number) => {
  const opacity = Math.min(0.8, Math.max(0.12, value / 100));
  return `rgba(106, 141, 115, ${opacity})`;
};

export const LeafletMap: React.FC<LeafletMapProps> = ({ gridCells, mapMode, onGridPress }) => {
  const tileUrl = mapMode === 'Satellite'
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  return (
    <MapContainer
      center={[25.0, 121.25]}
      zoom={11}
      style={{ width: '100%', height: '100%' }}
      zoomControl={false}
    >
      <TileLayer
        url={tileUrl}
        attribution='&copy; OpenStreetMap contributors'
      />
      
      {gridCells.map((grid) => {
        const positions = grid.polygonCoords.map(coord => [coord.latitude, coord.longitude] as [number, number]);
        
        return (
          <Polygon
            key={grid.gridId}
            positions={positions}
            pathOptions={{
              fillColor: getGridColor(grid.values.value),
              fillOpacity: 0.6,
              color: 'rgba(106, 141, 115, 0.3)',
              weight: 1,
            }}
            eventHandlers={{
              click: () => onGridPress?.(grid),
            }}
          />
        );
      })}
    </MapContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
  },
});*/
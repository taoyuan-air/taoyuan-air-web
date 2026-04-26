import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { GridCell } from '../types';

interface LeafletMapProps {
  gridCells: GridCell[];
  mapMode: '2D' | 'Satellite';
  onGridPress?: (grid: GridCell) => void;
  isVisible?: boolean;
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

let mapInitialized = false;

export const LeafletMap: React.FC<LeafletMapProps> = ({ gridCells, mapMode, onGridPress, isVisible = true }) => {
  const mapRef = useRef<any>(null);
  const polygonLayerGroupRef = useRef<any>(null);
  const satMapRef = useRef<any>(null);
  const satLayerGroupRef = useRef<any>(null);

  // 渲染多邊形到指定的圖層組
  const renderPolygonsToGroup = (
    cells: GridCell[],
    L: any,
    layerGroup: any,
  ) => {
    if (!L || !layerGroup) return;

    layerGroup.clearLayers();

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

    const initMaps = async () => {
      if (mapInitialized) return;
      mapInitialized = true;

      try {
        console.log('開始載入 Leaflet...');
        
        // 載入 Leaflet CSS + JS
        await loadLink(
          'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
          'leaflet-css',
        );
        await loadScript(
          'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
          'leaflet-js',
        );

        console.log('Leaflet 載入完成');

        const L = (window as any).L;
        if (!L) {
          console.error('Leaflet 載入失敗');
          return;
        }

        // 初始化衛星地圖
        const satMapContainer = document.getElementById('satellite-map');
        if (satMapContainer && !satMapRef.current) {
          console.log('初始化衛星地圖...');
          const satMap = L.map('satellite-map', {
            center: [25.0, 121.25],
            zoom: 11,
            zoomControl: false,
          });

          // ArcGIS 衛星底圖
          L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            {
              attribution: 'Tiles &copy; Esri',
              maxZoom: 19,
            },
          ).addTo(satMap);

          satMapRef.current = satMap;
          satLayerGroupRef.current = L.layerGroup().addTo(satMap);
          console.log('衛星地圖初始化完成');
        }

        // 初始化 Windy 地圖
        console.log('開始載入 Windy...');
        await loadScript(
          'https://api.windy.com/assets/map-forecast/libBoot.js',
          'windy-sdk',
        );

        const apikey = process.env.EXPO_PUBLIC_WINDY_API_KEY;
        console.log('Windy API Key:', apikey ? '已設置' : '未設置');
        
        if (!apikey) {
          console.error('Windy API Key 未設置');
          return;
        }

        const options = { key: apikey, lat: 25.0, lon: 121.25, zoom: 11 };

        // @ts-ignore
        window.windyInit(options, (windyAPI: any) => {
          console.log('Windy 初始化回調執行', windyAPI ? '成功' : '失敗');
          
          if (!windyAPI) {
            console.error('Windy API 初始化失敗');
            return;
          }

          const { map, store } = windyAPI;
          const WL = windyAPI.L || (window as any).L;
          
          if (!WL || !map) {
            console.error('Windy 地圖或 Leaflet 實例獲取失敗');
            return;
          }

          console.log('Windy 地圖初始化成功');
          
          // 設置風速圖層
          store.set('overlay', 'wind');

          mapRef.current = map;
          polygonLayerGroupRef.current = WL.layerGroup().addTo(map);

          // 初始渲染網格
          if (gridCells && gridCells.length > 0) {
            renderPolygonsToGroup(gridCells, WL, polygonLayerGroupRef.current);
          }
        });

      } catch (err) {
        console.error('地圖初始化失敗:', err);
      }
    };

    initMaps();
  }, []);

  // 當 gridCells 更新時重新渲染
  useEffect(() => {
    console.log('GridCells 更新:', gridCells.length, '個網格');
    
    // 更新 Windy 地圖
    if (mapRef.current && polygonLayerGroupRef.current) {
      const WL = (window as any).L;
      if (WL) {
        renderPolygonsToGroup(gridCells, WL, polygonLayerGroupRef.current);
      }
    }

    // 更新衛星地圖
    if (satMapRef.current && satLayerGroupRef.current) {
      const L = (window as any).L;
      if (L) {
        renderPolygonsToGroup(gridCells, L, satLayerGroupRef.current);
      }
    }
  }, [gridCells]);

  // 當 mapMode 切換時調整地圖大小
  useEffect(() => {
    const delay = setTimeout(() => {
      if (mapMode === '2D' && mapRef.current) {
        mapRef.current.invalidateSize();
      }
      if (mapMode === 'Satellite' && satMapRef.current) {
        satMapRef.current.invalidateSize();
      }
    }, 100);
    return () => clearTimeout(delay);
  }, [mapMode]);

  return (
    <View style={styles.container}>
      {/* 2D 模式：Windy */}
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { display: mapMode === 'Satellite' ? 'none' : 'flex' },
        ]}
      >
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
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { GridCell } from '../types';
import { DeckGL } from '@deck.gl/react';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import { HexagonLayer } from '@deck.gl/aggregation-layers';
import type { MapViewState } from '@deck.gl/core';

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
  // 找到 value 落在哪兩個錨點之間
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
  // 計算該區間內的比例
  const ratio = (clamped - lower[0]) / (upper[0] - lower[0]);
  // 線性插值 RGB
  const r = Math.round(lower[1] + (upper[1] - lower[1]) * ratio);
  const g = Math.round(lower[2] + (upper[2] - lower[2]) * ratio);
  const b = Math.round(lower[3] + (upper[3] - lower[3]) * ratio);

  return `rgba(${r}, ${g}, ${b}, 0.4)`;
};

let windyInitialized = false;

export const LeafletMap: React.FC<LeafletMapProps> = ({ gridCells, mapMode, onGridPress }) => {
  const mapRef = useRef<any>(null); // 儲存 Leaflet Map 實例
  const windyStoreRef = useRef<any>(null); // 儲存 Windy Store 實例
  const polygonLayerGroupRef = useRef<any>(null); // 用來管理網格圖層
  const LRef = useRef<any>(null); // 儲存 Windy 提供的 Leaflet 實例

  // Taoyuan 區域的模擬 PM2.5 點位資料
  const MOCK_DATA = Array.from({ length: 300 }, () => ({
    coordinates: [
      121.1 + Math.random() * 0.5,  // 經度：121.1 ~ 121.6
      24.9 + Math.random() * 0.3,   // 緯度：24.9 ~ 25.2
    ] as [number, number],
    value: Math.random() * 150,
  }));

  const INITIAL_VIEW_STATE: MapViewState = {
    longitude: 121.25,
    latitude: 25.0,
    zoom: 10,
    pitch: 45,
    bearing: 0,
  };

  const deckLayers = [
    new TileLayer({
      data: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
      renderSubLayers: (props: any) => {
        const { bbox: { west, south, east, north } } = props.tile;
        return new BitmapLayer({
          id: props.id,
          image: props.data,
          bounds: [west, south, east, north],
        });
      },
    }),
    new HexagonLayer({
      id: 'pm25-hexagon',
      data: MOCK_DATA,
      getPosition: (d: any) => d.coordinates,
      getElevationWeight: (d: any) => d.value,
      elevationScale: 80,
      extruded: true,
      radius: 500,           // 每個六角形的半徑（公尺）
      coverage: 1,
      upperPercentile: 100,
      colorRange: [
        [0, 228, 0],
        [255, 255, 0],
        [255, 126, 0],
        [255, 0, 0],
        [126, 0, 35],
      ],
      pickable: true,
      onHover: (info: any) => { console.log('Hovered:', info); return true; },
    }),
  ];

  useEffect(() => {
    // 1. 定義載入腳本的輔助函式
    const loadScript = (src: string, id: string) => {
      return new Promise((resolve, reject) => {
        if (document.getElementById(id)) return resolve(true);
        const script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.onload = () => resolve(true);
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    const initAll = async () => {
      
      if (windyInitialized) return; 
      windyInitialized = true;

      try {
        // 第一步：載入 Leaflet 1.4.0
        await loadScript('https://unpkg.com/leaflet@1.4.0/dist/leaflet.js', 'leaflet-js');
        
        // 第二步：載入 Windy API
        await loadScript('https://api.windy.com/assets/map-forecast/libBoot.js', 'windy-sdk');

        // 第三步：開始初始化地圖
        const apikey = process.env.EXPO_PUBLIC_WINDY_API_KEY;
        const options = {
          key: apikey,
          lat: 25.0,
          lon: 121.25,
          zoom: 11,
        };

        // @ts-ignore
        window.windyInit(options, (windyAPI: any) => {
          // 1. 先確認 windyAPI 是否存在
          if (!windyAPI) {
            console.error("Windy API 初始化失敗，未回傳物件");
            return;
          }

          // 2. 嘗試從 windyAPI 取得 L，如果沒有則嘗試從 window 取得
          const L = windyAPI.L || (window as any).L;
          const { colors, store, map } = windyAPI;
          if (!L) {
            console.error("無法取得 Leaflet (L) 實例");
            return;
          }

          // 3. 修改風速圖背景顏色
          const targetLayer = colors.wind; 
          if (targetLayer && typeof targetLayer.changeColor === 'function') {
            try {
              // 呼叫該圖層專屬的 changeColor 方法
              targetLayer.changeColor([
                [0,[128, 128, 128, 255]],
                [1,[128, 128, 128, 255]],
                [3,[128, 128, 128, 255]],
                [5,[128, 128, 128, 255]],
                [7,[128, 128, 128, 255]],
                [9,[128, 128, 128, 255]],
                [11,[128, 128, 128, 255]],
                [13,[128, 128, 128, 255]],
                [15,[128, 128, 128, 255]],
                [17,[128, 128, 128, 255]],
                [19,[128, 128, 128, 255]],
                [21,[128, 128, 128, 255]],
                [24,[128, 128, 128, 255]],
                [27,[128, 128, 128, 255]],
                [29,[128, 128, 128, 255]],
                [36,[128, 128, 128, 255]],
                [46,[128, 128, 128, 255]],
                [51,[128, 128, 128, 255]],
                [77,[128, 128, 128, 255]],
                [104,[128,128,128,255]]
              ]);
              console.log("wind 色階自定義成功");
            } catch (e) {
              console.error("執行 changeColor 時出錯:", e);
            }
          } else {
            console.warn("找不到該圖層的顏色定義，請檢查名稱是否正確。目前的圖層清單：", Object.keys(colors));
          }
          store.set('overlay', 'wind');

          // 4. 賦值給 Ref
          mapRef.current = map;
          windyStoreRef.current = store;
          LRef.current = L;

          // 5. 建立圖層組
          try {
            polygonLayerGroupRef.current = L.layerGroup().addTo(map);
            console.log("Windy 圖層組建立成功");
          } catch (e) {
            console.error("建立 layerGroup 時出錯:", e);
          }

          // 6. 渲染網格
          if (gridCells && gridCells.length > 0) {
            renderPolygons(gridCells);
          }
        });
      } catch (err) {
        console.error("Windy 載入失敗:", err);
      }
    };

    initAll();
  }, []);

  // 當網格資料更新時，重新畫網格
  useEffect(() => {
    if (mapRef.current && polygonLayerGroupRef.current && LRef.current) {
      polygonLayerGroupRef.current.clearLayers(); // 清除舊的
      if (gridCells && gridCells.length > 0) {
        renderPolygons(gridCells);
      }
    }
  }, [gridCells]);
  

  const renderPolygons = (cells: GridCell[]) => {
    const L = LRef.current;
    const layerGroup = polygonLayerGroupRef.current;

    if (!L || !layerGroup) return;

    cells.forEach((grid) => {
      const positions = grid.polygonCoords.map(coord => [coord.latitude, coord.longitude] as [number, number]);
      
      const polygon = L.polygon(positions, {
        fillColor: getGridColor(grid.values.value),
        fillOpacity: 0.6,
        color: 'rgba(106, 141, 115, 0.3)',
        weight: 1,
      });

      polygon.on('click', (e: any) => {
        // 防止地圖點擊事件冒泡
        if (e.originalEvent) e.originalEvent.stopPropagation();
        onGridPress?.(grid);
      });
      polygon.addTo(polygonLayerGroupRef.current);
    });
  };

  return (
    <View style={styles.container}>
      {/* Satellite 模式：deck.gl */}
      {mapMode === 'Satellite' && (
        <View style={StyleSheet.absoluteFillObject}>
          <DeckGL
            initialViewState={INITIAL_VIEW_STATE}
            controller={true}
            layers={deckLayers}
            style={{ width: '100%', height: '100%' }}
          />
        </View>
      )}

      {/* 2D 模式：Windy，用 display 控制顯示，不卸載 */}
      <View style={[StyleSheet.absoluteFillObject, { display: mapMode === 'Satellite' ? 'none' : 'flex' }]}>
        <style dangerouslySetInnerHTML={{ __html: `
          #windy #ovr-select, 
          #windy #mobile-ovr-select,
          #windy #logo {
            display: none !important;
          }
}
        `}} />
        <div id="windy" style={{ width: '100%', height: '100%' }}></div>
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


/*import React, { useEffect } from 'react';
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

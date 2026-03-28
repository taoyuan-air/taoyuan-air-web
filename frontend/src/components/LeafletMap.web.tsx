import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
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
  const mapRef = useRef<any>(null); // 儲存 Leaflet Map 實例
  const windyStoreRef = useRef<any>(null); // 儲存 Windy Store 實例
  const polygonLayerGroupRef = useRef<any>(null); // 用來管理網格圖層

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
      try {
        // 第一步：載入 Leaflet 1.4.0
        await loadScript('https://unpkg.com/leaflet@1.4.0/dist/leaflet.js', 'leaflet-js');
        
        // 第二步：載入 Windy API
        await loadScript('https://api.windy.com/assets/map-forecast/libBoot.js', 'windy-sdk');

        // 第三步：開始初始化地圖
        const options = {
          key: "YOUR_WINDY_API_KEY",
          lat: 25.0,
          lon: 121.25,
          zoom: 11,
        };

        // @ts-ignore
        window.windyInit(options, (windyAPI: any) => {
          const { map, store, L } = windyAPI;
          mapRef.current = map;
          windyStoreRef.current = store;
          
          // 準備好圖層組
          polygonLayerGroupRef.current = L.layerGroup().addTo(map);
          
          // 畫出網格
          renderPolygons(L, gridCells);
        });
      } catch (err) {
        console.error("Windy 載入失敗:", err);
      }
    };

    initAll();
  }, []);

  // 當網格資料更新時，重新畫網格
  useEffect(() => {
    if (mapRef.current && polygonLayerGroupRef.current) {
      // @ts-ignore
      const L = window.L; // 獲取全域 Leaflet
      polygonLayerGroupRef.current.clearLayers(); // 清除舊的
      renderPolygons(L, gridCells);
    }
  }, [gridCells]);

  // 當 mapMode 改變時切換底圖
  useEffect(() => {
    if (windyStoreRef.current) {
      // Windy 的 satellite 模式是透過 store 切換的
      windyStoreRef.current.set('overlay', mapMode === 'Satellite' ? 'satellite' : 'pm25');
    }
  }, [mapMode]);

  const renderPolygons = (L: any, cells: GridCell[]) => {
    cells.forEach((grid) => {
      const positions = grid.polygonCoords.map(coord => [coord.latitude, coord.longitude]);
      
      const polygon = L.polygon(positions, {
        fillColor: getGridColor(grid.values.value),
        fillOpacity: 0.6,
        color: 'rgba(106, 141, 115, 0.3)',
        weight: 1,
      });

      polygon.on('click', () => onGridPress?.(grid));
      polygon.addTo(polygonLayerGroupRef.current);
    });
  };

  return (
    <View style={styles.container}>
      {/* Windy 需要一個 ID 為 windy 的 div */}
      <div id="windy" style={{ width: '100%', height: '100%' }}></div>
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

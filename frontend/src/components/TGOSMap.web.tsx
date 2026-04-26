import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { GridCell } from '../types';

interface TGOSMapProps {
  gridCells: GridCell[];
  onGridPress?: (grid: GridCell) => void;
}

const getGridColor = (value: number) => {
  const stops = [
    [0,   0,   228, 0  ],
    [50,  255, 255, 0  ],
    [100, 255, 126, 0  ],
    [150, 255, 0,   0  ],
    [200, 126, 0,   35 ],
  ];
  const clamped = Math.max(0, Math.min(200, value));
  let lower = stops[0], upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i][0] && clamped <= stops[i + 1][0]) {
      lower = stops[i]; upper = stops[i + 1]; break;
    }
  }
  const ratio = (clamped - lower[0]) / (upper[0] - lower[0]);
  const r = Math.round(lower[1] + (upper[1] - lower[1]) * ratio);
  const g = Math.round(lower[2] + (upper[2] - lower[2]) * ratio);
  const b = Math.round(lower[3] + (upper[3] - lower[3]) * ratio);
  // [修改] fillColor 改回傳 hex，opacity 另外在 fillOptions 設定
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
};

let tgosInitialized = false;

export const TGOSMap: React.FC<TGOSMapProps> = ({ gridCells, onGridPress }) => {
  // [修改] ref 改存 TGOS.Fill 物件陣列，而不是 feature
  const tgosMapRef = useRef<any>(null);
  const fillsRef = useRef<any[]>([]);

  const renderPolygons = (cells: GridCell[], TGOS: any, map: any) => {
    // [修改] 清除舊 fills：改用 fill.destory()，移除不存在的 earth.removeFeature()
    fillsRef.current.forEach((fill) => {
      try { fill.destory(); } catch (_) {}
    });
    fillsRef.current = [];

    cells.forEach((grid) => {
      // [修改] 座標改用 TGOS.Point(x, y)，移除不存在的 TGOS.TELonLat
      const points = grid.polygonCoords.map(
        (c) => new TGOS.Point(c.longitude, c.latitude)
      );

      // [修改] LinearRing 需先建立 LineString 再傳入，
      //        而不是直接傳點陣列給 TELinearRing
      const lineString = new TGOS.LineString(points);
      const ring = new TGOS.LinearRing(lineString);

      // [修改] 改用 TGOS.Polygon，移除不存在的 TGOS.TEPolygon
      const polygon = new TGOS.Polygon([ring]);

      // [修改] 改用 TGOS.Fill(map, polygon, fillOptions)
      //        移除不存在的 TEFillStyle + TEFeature
      const fill = new TGOS.Fill(map, polygon, {
        fillColor: getGridColor(grid.values.value),
        fillopacity: 0.5,
        strokeColor: '#6a8d73',
        strokeWeight: 1,
        strokeOpacity: 0.4,
      });

      fillsRef.current.push(fill);
    });

    // [修改] TGOS.Fill 不支援直接 click 事件
    //        改監聽地圖 click，再以 bounding box 判斷點擊落在哪個 gridCell
    if (onGridPress) {
      TGOS.Event.addListener(map, 'click', (event: any) => {
        const clickedLng = event.coord?.x ?? event.lonlat?.lng;
        const clickedLat = event.coord?.y ?? event.lonlat?.lat;
        if (clickedLng == null || clickedLat == null) return;

        const hit = cells.find((grid) => {
          const lngs = grid.polygonCoords.map((c) => c.longitude);
          const lats = grid.polygonCoords.map((c) => c.latitude);
          const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
          const minLat = Math.min(...lats), maxLat = Math.max(...lats);
          return (
            clickedLng >= minLng && clickedLng <= maxLng &&
            clickedLat >= minLat && clickedLat <= maxLat
          );
        });
        if (hit) onGridPress(hit);
      });
    }
  };

  useEffect(() => {
    const loadScript = (src: string, id: string) =>
      new Promise((resolve, reject) => {
        if (document.getElementById(id)) return resolve(true);
        const script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.charset = 'utf-8';
        script.onload = () => resolve(true);
        script.onerror = reject;
        document.head.appendChild(script);
      });

    const initTGOS = async () => {
      if (tgosInitialized) return;
      tgosInitialized = true;

      const apiKey = process.env.EXPO_PUBLIC_TGOS_API_KEY;

      const scriptUrl = `https://api.tgos.tw/TGOS_MAP_API_3?APIKEY=${apiKey}`;
      console.log('準備載入 script，網址為:', scriptUrl);
      console.log('APIKey 值為:', apiKey);  // 確認有沒有讀到環境變數

      try {
        await loadScript(scriptUrl, 'tgos-sdk');
      } catch (scriptErr: any) {
          console.error('Script 載入失敗:', {
            message: scriptErr?.message,
            type: typeof scriptErr,
            raw: scriptErr,
          });
          return;
        }

        const TGOS = (window as any).TGOS;
        if (!TGOS) {
          console.error('TGOS SDK 載入失敗，window.TGOS 為:', typeof (window as any).TGOS);
          console.error('window 上所有 TGOS 相關 key:', Object.keys(window).filter(k => k.toLowerCase().includes('tgos')));
          return;
        }

        const container = document.getElementById('tgos-map');
        if (!container) return;

        try{
        // [修改] 改用 TGOS.OnlineMap(div, epsgCode, opts, callback)
        //        - 移除不存在的 TGOS.TEOnlineMap
        //        - mapMode: 3 開啟三維模式
        //        - 初始化完成邏輯移到第四個參數 callback（取代不存在的 'initialized' 事件）
        const map = new TGOS.OnlineMap(
          container,
          'EPSG4326',
          { mapMode: 3 },
          () => {
            // [修改] 改用 setCenter + setZoom，移除不存在的 flyTo
            map.setCenter(new TGOS.Point(121.25, 25.0));
            map.setZoom(11);

            if (gridCells && gridCells.length > 0) {
              renderPolygons(gridCells, TGOS, map);
            }
          }
        );

        tgosMapRef.current = map;

      } catch (err) {
        console.error('TGOS 地圖載入失敗:', err);
      }
    };

    initTGOS();
  }, []);

  useEffect(() => {
    const TGOS = (window as any).TGOS;
    if (!tgosMapRef.current || !TGOS) return;

    renderPolygons(gridCells, TGOS, tgosMapRef.current);
  }, [gridCells]);

  return (
    <View style={styles.container}>
      <div id="tgos-map" style={{ width: '100%', height: '100%' }} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { width: '100%', height: '100%' },
});

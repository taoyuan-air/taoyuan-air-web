import React, { useEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { GridCell } from "../types";

interface TGOSMapProps {
  gridCells: GridCell[];
  onGridPress?: (grid: GridCell) => void;
}

const getGridColor = (value: number) => {
  const stops = [
    [0, 0, 228, 0],
    [50, 255, 255, 0],
    [100, 255, 126, 0],
    [150, 255, 0, 0],
    [200, 126, 0, 35],
  ];
  const clamped = Math.max(0, Math.min(200, value));
  let lower = stops[0],
    upper = stops[stops.length - 1];
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
  // [備註] fillColor 使用 hex 格式，opacity 請透過 fillOptions 的 fillopacity 設定
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
};

let tgosInitialized = false;

export const TGOSMap: React.FC<TGOSMapProps> = ({ gridCells, onGridPress }) => {
  // [備註] ref 儲存 TGOS.Fill 實例，用來追蹤與清除已繪製的 feature
  const tgosMapRef = useRef<any>(null);
  const fillsRef = useRef<any[]>([]);

  const renderPolygons = (cells: GridCell[], TGOS: any, map: any) => {
    // [備註] 清除舊的 fills，呼叫 fill.destroy()，舊版 API 用 earth.removeFeature()
    fillsRef.current.forEach((fill) => {
      try {
        fill.destory();
      } catch (_) {}
    });
    fillsRef.current = [];

    cells.forEach((grid) => {
      // [備註] 建立座標點使用 TGOS.Point(x, y)，舊版 API 用 TGOS.TELonLat
      const points = grid.polygonCoords.map(
        (c) => new TGOS.Point(c.longitude, c.latitude),
      );

      // [備註] LinearRing 需要先包裝成 LineString 才能建立
      //        舊版 API 對應的類別為 TELinearRing
      const lineString = new TGOS.LineString(points);
      const ring = new TGOS.LinearRing(lineString);

      // [備註] 建立 TGOS.Polygon，舊版 API 用 TGOS.TEPolygon
      const polygon = new TGOS.Polygon([ring]);

      // [備註] 建立 TGOS.Fill(map, polygon, fillOptions)
      //        舊版 API 對應的是 TEFillStyle + TEFeature 的組合
      const fill = new TGOS.Fill(map, polygon, {
        fillColor: getGridColor(grid.values.value),
        fillopacity: 0.5,
        strokeColor: "#E76595",
        strokeWeight: 1,
        strokeOpacity: 0.4,
      });

      fillsRef.current.push(fill);
    });

    // [備註] TGOS.Fill 不支援直接綁定 click 事件
    //        改為監聽地圖的 click 事件，再透過 bounding box 判斷點擊到哪個 gridCell
    if (onGridPress) {
      TGOS.Event.addListener(map, "click", (event: any) => {
        const clickedLng = event.coord?.x ?? event.lonlat?.lng;
        const clickedLat = event.coord?.y ?? event.lonlat?.lat;
        if (clickedLng == null || clickedLat == null) return;

        const hit = cells.find((grid) => {
          const lngs = grid.polygonCoords.map((c) => c.longitude);
          const lats = grid.polygonCoords.map((c) => c.latitude);
          const minLng = Math.min(...lngs),
            maxLng = Math.max(...lngs);
          const minLat = Math.min(...lats),
            maxLat = Math.max(...lats);
          return (
            clickedLng >= minLng &&
            clickedLng <= maxLng &&
            clickedLat >= minLat &&
            clickedLat <= maxLat
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
        const script = document.createElement("script");
        script.id = id;
        script.src = src;
        script.charset = "utf-8";
        script.onload = () => resolve(true);
        script.onerror = reject;
        document.head.appendChild(script);
      });

    const initTGOS = async () => {
      if (tgosInitialized) return;
      tgosInitialized = true;

      const apiKey = process.env.EXPO_PUBLIC_TGOS_API_KEY;

      const scriptUrl = `https://api.tgos.tw/TGOS_MAP_API_3?APIKEY=${apiKey}`;
      console.log("正在載入 script，網址如下:", scriptUrl);
      console.log("APIKey 確認:", apiKey);

      try {
        await loadScript(scriptUrl, "tgos-sdk");
      } catch (scriptErr: any) {
        console.error("Script 載入失敗:", {
          message: scriptErr?.message,
          type: typeof scriptErr,
          raw: scriptErr,
        });
        return;
      }

      const TGOS = (window as any).TGOS;
      if (!TGOS) {
        console.error(
          "TGOS SDK 載入失敗，window.TGOS 未定義，型別為:",
          typeof (window as any).TGOS,
        );
        console.error(
          "window 中包含 TGOS 相關的 key:",
          Object.keys(window).filter((k) => k.toLowerCase().includes("tgos")),
        );
        return;
      }

      const container = document.getElementById("tgos-map");
      if (!container) return;

      try {
        // [備註] 建立 TGOS.OnlineMap(div, epsgCode, opts, callback)
        //        - 舊版 API 對應的類別為 TGOS.TEOnlineMap
        //        - mapMode: 3 代表衛星圖模式
        //        - 舊版 API 沒有 callback 參數，需改為監聽 'initialized' 事件
        const map = new TGOS.OnlineMap(
          container,
          "EPSG4326",
          { mapMode: 3 },
          () => {
            // [備註] 設定中心點與縮放層級使用 setCenter + setZoom，舊版 API 用 flyTo
            map.setCenter(new TGOS.Point(121.25, 25.0));
            map.setZoom(11);

            if (gridCells && gridCells.length > 0) {
              renderPolygons(gridCells, TGOS, map);
            }
          },
        );

        tgosMapRef.current = map;
      } catch (err) {
        console.error("TGOS 地圖初始化失敗:", err);
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
      <div id="tgos-map" style={{ width: "100%", height: "100%" }} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { width: "100%", height: "100%" },
});
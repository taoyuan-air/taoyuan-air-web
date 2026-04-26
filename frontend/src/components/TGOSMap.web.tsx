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
  // [靽格] fillColor ?孵???hex嚗pacity ?血???fillOptions 閮剖?
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
};

let tgosInitialized = false;

export const TGOSMap: React.FC<TGOSMapProps> = ({ gridCells, onGridPress }) => {
  // [靽格] ref ?孵? TGOS.Fill ?拐辣???嚗???feature
  const tgosMapRef = useRef<any>(null);
  const fillsRef = useRef<any[]>([]);

  const renderPolygons = (cells: GridCell[], TGOS: any, map: any) => {
    // [靽格] 皜??fills嚗??fill.destory()嚗宏?支?摮??earth.removeFeature()
    fillsRef.current.forEach((fill) => {
      try {
        fill.destory();
      } catch (_) {}
    });
    fillsRef.current = [];

    cells.forEach((grid) => {
      // [靽格] 摨扳??寧 TGOS.Point(x, y)嚗宏?支?摮??TGOS.TELonLat
      const points = grid.polygonCoords.map(
        (c) => new TGOS.Point(c.longitude, c.latitude),
      );

      // [靽格] LinearRing ??遣蝡?LineString ??伐?
      //        ???舐?亙暺?策 TELinearRing
      const lineString = new TGOS.LineString(points);
      const ring = new TGOS.LinearRing(lineString);

      // [靽格] ?寧 TGOS.Polygon嚗宏?支?摮??TGOS.TEPolygon
      const polygon = new TGOS.Polygon([ring]);

      // [靽格] ?寧 TGOS.Fill(map, polygon, fillOptions)
      //        蝘駁銝??函? TEFillStyle + TEFeature
      const fill = new TGOS.Fill(map, polygon, {
        fillColor: getGridColor(grid.values.value),
        fillopacity: 0.5,
        strokeColor: "#E76595",
        strokeWeight: 1,
        strokeOpacity: 0.4,
      });

      fillsRef.current.push(fill);
    });

    // [靽格] TGOS.Fill 銝?渡??click 鈭辣
    //        ?寧?賢??click嚗?隞?bounding box ?斗暺??賢?芸?gridCell
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
      console.log("皞?頛 script嚗雯???", scriptUrl);
      console.log("APIKey ?潛:", apiKey); // 蝣箄??????啁憓???

      try {
        await loadScript(scriptUrl, "tgos-sdk");
      } catch (scriptErr: any) {
        console.error("Script 頛憭望?:", {
          message: scriptErr?.message,
          type: typeof scriptErr,
          raw: scriptErr,
        });
        return;
      }

      const TGOS = (window as any).TGOS;
      if (!TGOS) {
        console.error(
          "TGOS SDK 頛憭望?嚗indow.TGOS ??",
          typeof (window as any).TGOS,
        );
        console.error(
          "window 銝???TGOS ?賊? key:",
          Object.keys(window).filter((k) => k.toLowerCase().includes("tgos")),
        );
        return;
      }

      const container = document.getElementById("tgos-map");
      if (!container) return;

      try {
        // [靽格] ?寧 TGOS.OnlineMap(div, epsgCode, opts, callback)
        //        - 蝘駁銝??函? TGOS.TEOnlineMap
        //        - mapMode: 3 ??銝雁璅∪?
        //        - ??????頛舐宏?啁洵????callback嚗?隞??摮??'initialized' 鈭辣嚗?
        const map = new TGOS.OnlineMap(
          container,
          "EPSG4326",
          { mapMode: 3 },
          () => {
            // [靽格] ?寧 setCenter + setZoom嚗宏?支?摮??flyTo
            map.setCenter(new TGOS.Point(121.25, 25.0));
            map.setZoom(11);

            if (gridCells && gridCells.length > 0) {
              renderPolygons(gridCells, TGOS, map);
            }
          },
        );

        tgosMapRef.current = map;
      } catch (err) {
        console.error("TGOS ?啣?頛憭望?:", err);
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

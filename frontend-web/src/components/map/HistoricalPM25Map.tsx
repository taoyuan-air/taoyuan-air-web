'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { FeatureCollection, Geometry } from 'geojson';
import 'leaflet/dist/leaflet.css';
import styles from './HistoricalPM25Map.module.css';
import { pm25Color, roundPm25 } from '@/lib/pm25Palette';

export type HistoryProperties = {
  cell_id: string; pm25: number; color: string; range: string;
  nearest_station_km: number; confidence_level: string; visible_area_m2: number;
};
export type HistoryGrid = FeatureCollection<Geometry, HistoryProperties> & {
  metadata: { timestamp: string; method: string; note: string; run_id: string };
};

export default function HistoricalPM25Map({ data }: { data: HistoryGrid | null }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.GeoJSON | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current).setView([24.9, 121.28], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 18,
      className: styles.basemap,
      opacity: .75,
    }).addTo(instance);
    L.control.scale({ imperial: false }).addTo(instance);
    map.current = instance;
    const observer = new ResizeObserver(() => instance.invalidateSize({ pan: false }));
    observer.observe(container.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; fitted.current = false; };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    layer.current?.remove();
    layer.current = null;
    if (!data) return;
    const next = L.geoJSON(data, {
      style: feature => ({ color: '#737373', weight: .5, fillOpacity: .8,
        fillColor: feature?.properties.color ?? '#94a3b8' }),
      onEachFeature: (feature, polygon) => {
        const p = feature.properties;
        const popup = document.createElement('div');
        popup.className = styles.card;

        const heading = document.createElement('div');
        heading.className = styles.heading;
        const dot = document.createElement('span');
        dot.className = styles.dot;
        dot.style.background = pm25Color(p.pm25);
        const label = document.createElement('span');
        label.textContent = 'PM2.5';
        const badge = document.createElement('span');
        badge.className = styles.badge;
        badge.textContent = '小時推估';
        heading.append(dot, label, badge);

        const reading = document.createElement('div');
        reading.className = styles.reading;
        const value = document.createElement('strong');
        value.className = styles.value;
        value.textContent = roundPm25(p.pm25).toFixed(1);
        const unit = document.createElement('span');
        unit.className = styles.unit;
        unit.textContent = 'µg/m³';
        reading.append(value, unit);

        const timestamp = document.createElement('time');
        timestamp.className = styles.timestamp;
        timestamp.dateTime = data.metadata.timestamp;
        timestamp.textContent = data.metadata.timestamp.slice(0, 16).replaceAll('-', '/').replace('T', '　');
        popup.append(heading, reading, timestamp);
        polygon.bindPopup(popup, { className: styles.popup, minWidth: 200, maxWidth: 230 });
      },
    }).addTo(map.current);
    layer.current = next;
    if (!fitted.current && next.getBounds().isValid()) {
      map.current.fitBounds(next.getBounds(), { padding: [16, 16] });
      fitted.current = true;
    }
  }, [data]);

  return <div ref={container} className={styles.map} style={{ height: '100%', width: '100%' }} aria-label="桃園歷史 PM2.5 三公里網格地圖" />;
}

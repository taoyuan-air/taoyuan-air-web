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
});

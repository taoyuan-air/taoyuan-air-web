import React from 'react';
import { View, StyleSheet } from 'react-native';

interface WebMapProps {
  latitude: number;
  longitude: number;
  zoom?: number;
}

export const WebMap: React.FC<WebMapProps> = ({ latitude, longitude, zoom = 11 }) => {
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.2},${latitude - 0.2},${longitude + 0.2},${latitude + 0.2}&layer=mapnik&marker=${latitude},${longitude}`;

  return (
    <View style={styles.container}>
      <iframe
        src={mapUrl}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
        }}
        title="Map"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
  },
});

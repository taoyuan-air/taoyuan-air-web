import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TopNavigation } from '../navigation/TopNavigation';

export const MapScreen = () => {
  return (
    <View style={styles.container}>
      <TopNavigation title="Map View" subtitle="WEB VERSION" />
      <View style={styles.content}>
        <Text style={styles.title}>地圖功能</Text>
        <Text style={styles.message}>
          地圖功能目前僅支援手機版本。
        </Text>
        <Text style={styles.hint}>
          請使用 Expo Go 在手機上查看完整地圖功能。
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F2E9',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  hint: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});

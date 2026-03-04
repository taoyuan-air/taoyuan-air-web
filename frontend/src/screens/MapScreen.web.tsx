import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { TopNavigation } from '../navigation/TopNavigation';
import { useStore } from '../store';

const { width: screenWidth } = Dimensions.get('window');

export const MapScreen = () => {
  const { selectedPollutant, setSelectedPollutant, mode, setMode } = useStore();

  const getPollutantLabel = () => {
    switch (selectedPollutant) {
      case 'PM25': return 'PM2.5';
      case 'O3': return 'O₃';
      case 'NOX': return 'NOₓ';
      case 'VOCs': return 'VOCs';
      default: return selectedPollutant;
    }
  };

  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=120.95,24.8,121.55,25.2&layer=mapnik`;

  return (
    <View style={styles.container}>
      <TopNavigation title="Map View" subtitle="REAL-TIME MONITORING" />
      
      {/* Top Controls */}
      <View style={styles.topControls}>
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'NOW' && styles.activeModeButton]}
            onPress={() => setMode('NOW')}
          >
            <Text style={[styles.modeButtonText, mode === 'NOW' && styles.activeModeButtonText]}>
              REAL-TIME
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'FORECAST' && styles.activeModeButton]}
            onPress={() => setMode('FORECAST')}
          >
            <Text style={[styles.modeButtonText, mode === 'FORECAST' && styles.activeModeButtonText]}>
              FORECAST
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        <iframe
          src={mapUrl}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          title="Taoyuan Map"
        />
        
        <View style={styles.webNotice}>
          <Text style={styles.webNoticeText}>🌐 Web 預覽版本</Text>
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legendPanel}>
        <View style={styles.legendCard}>
          <View style={styles.pollutantSwitcher}>
            {(['PM25', 'O3', 'NOX', 'VOCs'] as const).map((pollutant) => {
              const isActive = selectedPollutant === pollutant;
              return (
                <TouchableOpacity
                  key={pollutant}
                  style={[styles.pollutantDot, isActive && styles.activePollutantDot]}
                  onPress={() => setSelectedPollutant(pollutant)}
                >
                  <Text style={[styles.pollutantDotText, isActive && styles.activePollutantDotText]}>
                    {pollutant === 'PM25' ? 'P' : pollutant === 'NOX' ? 'N' : pollutant === 'VOCs' ? 'V' : 'O'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          
          <Text style={styles.legendTitle}>{getPollutantLabel()} (µg/m³)</Text>
          
          <LinearGradient
            colors={['rgba(106, 141, 115, 0.2)', 'rgba(106, 141, 115, 0.8)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientBar}
          />
          <View style={styles.legendLabels}>
            <Text style={styles.legendLabel}>0</Text>
            <Text style={styles.legendLabel}>50</Text>
            <Text style={styles.legendLabel}>100+</Text>
          </View>
        </View>
      </View>

      {/* Info Panel */}
      <View style={styles.infoPanel}>
        <Text style={styles.infoText}>📱 完整互動功能請使用手機版</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F2E9' },
  topControls: {
    position: 'absolute',
    top: 120,
    left: 20,
    right: 20,
    zIndex: 10,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 25,
    padding: 4,
    alignSelf: 'flex-start',
  },
  modeButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  activeModeButton: { backgroundColor: '#B5C99A' },
  modeButtonText: { fontSize: 14, fontWeight: '600', color: '#666' },
  activeModeButtonText: { color: 'white' },
  mapContainer: {
    flex: 1,
    marginTop: 100,
    position: 'relative',
  },
  webNotice: {
    position: 'absolute',
    top: 80,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  webNoticeText: { fontSize: 12, fontWeight: '600', color: '#6A8D73' },
  legendPanel: {
    position: 'absolute',
    left: 20,
    bottom: 120,
    zIndex: 10,
  },
  legendCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 16,
    padding: 16,
    minWidth: 140,
  },
  pollutantSwitcher: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  pollutantDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(106, 141, 115, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activePollutantDot: { backgroundColor: '#6A8D73' },
  pollutantDotText: { fontSize: 10, fontWeight: '600', color: '#6A8D73' },
  activePollutantDotText: { color: 'white' },
  legendTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6A8D73',
    textAlign: 'left',
    marginBottom: 12,
  },
  gradientBar: { height: 8, borderRadius: 4, marginBottom: 4 },
  legendLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  legendLabel: { fontSize: 10, color: '#666' },
  infoPanel: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(181, 201, 154, 0.95)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  infoText: { fontSize: 14, fontWeight: '600', color: 'white' },
});

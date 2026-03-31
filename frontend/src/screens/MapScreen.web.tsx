import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, Animated, Dimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { TopNavigation } from '../navigation/TopNavigation';
import { useStore } from '../store';
import { LeafletMap } from '../components/LeafletMap.web';
import { GridCell } from '../types';
import { Linking } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export const MapScreen = () => {
  const { selectedPollutant, setSelectedPollutant, mode, setMode, gridCells, setSelectedGridId } = useStore();
  const [mapMode, setMapMode] = useState<'2D' | 'Satellite'>('2D');
  const [selectedGrid, setSelectedGrid] = useState<GridCell | null>(null);
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const slideAnim = React.useRef(new Animated.Value(screenHeight)).current;

  const getPollutantLabel = () => {
    switch (selectedPollutant) {
      case 'PM25': return 'PM2.5';
      case 'O3': return 'O₃';
      case 'NOX': return 'NOₓ';
      case 'VOCs': return 'VOCs';
      default: return selectedPollutant;
    }
  };

  const handleGridPress = (grid: GridCell) => {
    setSelectedGrid(grid);
    setSelectedGridId(grid.gridId);
    setShowBottomSheet(true);
    Animated.timing(slideAnim, {
      toValue: screenHeight * 0.5,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const closeBottomSheet = () => {
    Animated.timing(slideAnim, {
      toValue: screenHeight,
      duration: 300,
      useNativeDriver: false,
    }).start(() => {
      setShowBottomSheet(false);
    });
  };

  const toggleMapMode = () => {
    setMapMode(mapMode === '2D' ? 'Satellite' : '2D');
  };

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
        
        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search districts or monitoring sites"
            placeholderTextColor="#999"
          />
          <View style={styles.searchDivider} />
          <TouchableOpacity style={styles.mapModeButton} onPress={toggleMapMode}>
            <Ionicons 
              name={mapMode === '2D' ? 'map' : 'globe'} 
              size={20} 
              color="#6A8D73" 
            />
            <Text style={styles.mapModeText}>{mapMode}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        <LeafletMap 
          gridCells={gridCells} 
          mapMode={mapMode}
          onGridPress={handleGridPress}
        />
      </View>

      {/* 來源標記 (依地圖模式切換) */}
      {mapMode === '2D' ? (
        <View style={styles.windyAttribution}>
          <Text style={styles.windyAttributionText}>Source：</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://www.windy.com')}>
            <Text style={[styles.windyAttributionText, styles.windyLink]}>Windy.com</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.windyAttribution}>
          <Text style={styles.windyAttributionText}>© Esri, Maxar, Earthstar Geographics</Text>
        </View>
      )}

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

      {/* Bottom Sheet Modal */}
      <Modal
        visible={showBottomSheet}
        transparent
        animationType="none"
        onRequestClose={closeBottomSheet}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalBackground} 
            activeOpacity={1} 
            onPress={closeBottomSheet}
          />
          <Animated.View style={[styles.bottomSheet, { top: slideAnim }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.bottomSheetContent}>
              {selectedGrid && (
                <>
                  <View style={styles.sheetHeader}>
                    <View style={styles.locationInfo}>
                      <Text style={styles.districtName}>{(selectedGrid as any) .district|| '桃園市'}</Text>
                      {/*這邊.district原本有紅字是還沒實作其他地區(縣市的名字)*/}
                      <Text style={styles.gridId}>GRID ID: {selectedGrid.gridId}</Text>
                    </View>
                    <View style={styles.riskBadge}>
                      <Text style={styles.riskText}>中等風險</Text>
                    </View>
                  </View>

                  <View style={styles.pollutantSection}>
                    <View style={styles.pollutantItem}>
                      <Text style={styles.pollutantLabel}>{getPollutantLabel()} 濃度</Text>
                      <View style={styles.pollutantValue}>
                        <Text style={styles.pollutantNumber}>{Math.round(selectedGrid.values.value)}</Text>
                        <Text style={styles.pollutantUnit}>μg/m³</Text>
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity style={styles.analysisButton} onPress={closeBottomSheet}>
                    <Text style={styles.analysisButtonText}>完整分析</Text>
                    <Ionicons name="arrow-forward" size={20} color="white" />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </Animated.View>
        </View>
      </Modal>
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  searchIcon: { marginRight: 12 },
  searchInput: { 
    flex: 1, 
    fontSize: 16, 
    color: '#333',
    ...Platform.select({
      web: {
        outlineStyle: 'none' as any,
      },
    }),
  },
  searchDivider: { width: 1, height: 20, backgroundColor: '#E0E0E0', marginHorizontal: 12 },
  mapModeButton: { flexDirection: 'row', alignItems: 'center' },
  mapModeText: { fontSize: 12, color: '#6A8D73', fontWeight: '600', marginLeft: 4 },
  mapContainer: {
    flex: 1,
    marginTop: 80,
  },
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
    marginBottom: 12,
  },
  pollutantDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(106, 141, 115, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
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
  modalOverlay: { flex: 1 },
  modalBackground: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: Dimensions.get('window').height * 0.5,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  bottomSheetContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  locationInfo: { flex: 1 },
  districtName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  gridId: {
    fontSize: 14,
    color: '#666',
    letterSpacing: 1,
  },
  riskBadge: {
    backgroundColor: '#B5C99A',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  riskText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  pollutantSection: {
    marginBottom: 24,
  },
  pollutantItem: {
    marginBottom: 16,
  },
  pollutantLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pollutantValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  pollutantNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
  },
  pollutantUnit: {
    fontSize: 14,
    color: '#666',
    marginLeft: 4,
  },
  analysisButton: {
    backgroundColor: '#333',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
  },
  analysisButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  windyAttribution: {
    position: 'absolute',
    right: 20,  
    bottom: 120,
    zIndex: 20, 
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.7)', 
    paddingHorizontal: 6,
    paddingVertical: 4.5,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  windyAttributionText: {
    fontSize: 10,
    color: '#444',
    fontWeight: '500',
  },
  windyLink: {
    textDecorationLine: 'underline',
    color: '#6A8D73', 
  },
});
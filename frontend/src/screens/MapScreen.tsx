import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Dimensions,
  Modal,
  Animated,
  PanResponder
} from 'react-native';
import MapView, { Polygon, Marker, Region } from 'react-native-maps';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { GlassCard } from '../components/GlassCard';
import { Logo } from '../components/Logo';
import { HealthBadge } from '../components/HealthBadge';
import { TopNavigation } from '../navigation/TopNavigation';
import { getGrid, getVerticalProfile, setScenario } from '../api';
import { GridCell, VerticalProfile } from '../types';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const TAOYUAN_REGION: Region = {
  latitude: 25.0,
  longitude: 121.25,
  latitudeDelta: 0.4,
  longitudeDelta: 0.5,
};

interface MapScreenProps {
  scrollRef?: (ref: any) => void;
}

export const MapScreen: React.FC<MapScreenProps> = ({ scrollRef }) => {
  // MapView doesn't have scroll functionality, so we'll ignore the scrollRef
  React.useEffect(() => {
    if (scrollRef) {
      scrollRef(null); // Pass null since MapView doesn't scroll
    }
  }, [scrollRef]);
  const { 
    selectedPollutant,
    setSelectedPollutant,
    mode,
    setMode,
    selectedScenario,
    gridCells,
    setGridCells,
    selectedGridId,
    setSelectedGridId,
    isLoading,
    setIsLoading
  } = useStore();

  const [mapMode, setMapMode] = React.useState<'2D' | '3D' | 'Satellite'>('2D');
  const [selectedGrid, setSelectedGrid] = React.useState<GridCell | null>(null);
  const [showBottomSheet, setShowBottomSheet] = React.useState(false);
  const slideAnim = React.useRef(new Animated.Value(screenHeight)).current;

  React.useEffect(() => {
    loadGridData();
  }, [selectedPollutant, selectedScenario]);

  const loadGridData = async () => {
    setIsLoading(true);
    try {
      setScenario(selectedScenario);
      const grid = await getGrid({ pollutant: selectedPollutant });
      setGridCells(grid);
    } catch (error) {
      console.error('Failed to load grid data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGridPress = async (grid: GridCell) => {
    setSelectedGrid(grid);
    setSelectedGridId(grid.gridId);
    setShowBottomSheet(true);
    Animated.timing(slideAnim, {
      toValue: screenHeight * 0.5,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const toggleMapMode = () => {
    const modes: ('2D' | '3D' | 'Satellite')[] = ['2D', '3D', 'Satellite'];
    const currentIndex = modes.indexOf(mapMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setMapMode(modes[nextIndex]);
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

  const getGridColor = (value: number) => {
    // 定義色階錨點 [數值, r, g, b]
    const stops = [
      [0,   0,   228, 0  ],  // 綠
      [50,  255, 255, 0  ],  // 黃
      [100, 255, 126, 0  ],  // 橘
      [150, 255, 0,   0  ],  // 紅
      [200, 126, 0,   35 ],  // 深紅紫
    ];

    // 找到 value 落在哪兩個錨點之間
    const clamped = Math.max(0, Math.min(200, value));
    let lower = stops[0];
    let upper = stops[stops.length - 1];

    for (let i = 0; i < stops.length - 1; i++) {
      if (clamped >= stops[i][0] && clamped <= stops[i + 1][0]) {
        lower = stops[i];
        upper = stops[i + 1];
        break;
      }
    }

    // 計算該區間內的比例
    const ratio = (clamped - lower[0]) / (upper[0] - lower[0]);

    // 線性插值 RGB
    const r = Math.round(lower[1] + (upper[1] - lower[1]) * ratio);
    const g = Math.round(lower[2] + (upper[2] - lower[2]) * ratio);
    const b = Math.round(lower[3] + (upper[3] - lower[3]) * ratio);

    return `rgba(${r}, ${g}, ${b}, 0.55)`;
  };

  const getPollutantLabel = () => {
    switch (selectedPollutant) {
      case 'PM25': return 'PM2.5';
      case 'O3': return 'O₃';
      case 'NOX': return 'NOₓ';
      case 'VOCs': return 'VOCs';
      default: return selectedPollutant;
    }
  };

  return (
    <View style={styles.container}>
      <TopNavigation title="Map View" subtitle="REAL-TIME MONITORING" />
      
      {/* Top Controls */}
      <View style={styles.topControls}>
        {/* Mode Toggle */}
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
              name={mapMode === '2D' ? 'map' : mapMode === '3D' ? 'cube-outline' : 'globe'} 
              size={20} 
              color="#6A8D73" 
            />
            <Text style={styles.mapModeText}>{mapMode}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <MapView
        style={styles.map}
        initialRegion={TAOYUAN_REGION}
        showsUserLocation={false}
        showsMyLocationButton={false}
        mapType={mapMode === 'Satellite' ? 'satellite' : 'standard'}
        pitchEnabled={mapMode === '3D'}
        rotateEnabled={mapMode === '3D'}
        camera={mapMode === '3D' ? {
          center: TAOYUAN_REGION,
          pitch: 45,
          heading: 0,
          altitude: 3000,
          zoom: 10
        } : undefined}
      >
        {/* Grid Polygons - Different rendering based on mode */}
        {mapMode === '2D' && gridCells.map((grid) => (
          <Polygon
            key={grid.gridId}
            coordinates={grid.polygonCoords}
            fillColor={getGridColor(grid.values.value)}
            strokeColor="rgba(106, 141, 115, 0.3)"
            strokeWidth={1}
            onPress={() => handleGridPress(grid)}
          />
        ))}
        
        {/* 3D Mode - Hexagonal markers with elevation effect */}
        {mapMode === '3D' && gridCells.map((grid) => {
          const centerLat = grid.polygonCoords.reduce((sum, coord) => sum + coord.latitude, 0) / grid.polygonCoords.length;
          const centerLng = grid.polygonCoords.reduce((sum, coord) => sum + coord.longitude, 0) / grid.polygonCoords.length;
          return (
            <Marker
              key={grid.gridId}
              coordinate={{ latitude: centerLat, longitude: centerLng }}
              onPress={() => handleGridPress(grid)}
            >
              <View style={[styles.hexMarker, { backgroundColor: getGridColor(grid.values.value) }]}>
                <Text style={styles.hexValue}>{Math.round(grid.values.value)}</Text>
              </View>
            </Marker>
          );
        })}
        
        {/* Satellite Mode - Circular markers with glow effect */}
        {mapMode === 'Satellite' && gridCells.map((grid) => {
          const centerLat = grid.polygonCoords.reduce((sum, coord) => sum + coord.latitude, 0) / grid.polygonCoords.length;
          const centerLng = grid.polygonCoords.reduce((sum, coord) => sum + coord.longitude, 0) / grid.polygonCoords.length;
          return (
            <Marker
              key={grid.gridId}
              coordinate={{ latitude: centerLat, longitude: centerLng }}
              onPress={() => handleGridPress(grid)}
            >
              <View style={styles.satelliteMarker}>
                <View style={[styles.satelliteGlow, { backgroundColor: getGridColor(grid.values.value) }]} />
                <View style={styles.satelliteCore}>
                  <Text style={styles.satelliteValue}>{Math.round(grid.values.value)}</Text>
                </View>
              </View>
            </Marker>
          );
        })}
        
        {/* Selected Grid Highlight - Only for 2D mode */}
        {mapMode === '2D' && selectedGrid && (
          <Polygon
            coordinates={selectedGrid.polygonCoords}
            fillColor="rgba(106, 141, 115, 0.9)"
            strokeColor="#6A8D73"
            strokeWidth={3}
          />
        )}
      </MapView>

      {/* Legend */}
      <View style={styles.legendPanel}>
        <View style={styles.legendCard}>
          {/* Pollutant Switcher */}
          <View style={styles.pollutantSwitcher}>
            {(['PM25', 'O3', 'NOX', 'VOCs'] as const).map((pollutant) => {
              const isActive = selectedPollutant === pollutant;
              return (
                <TouchableOpacity
                  key={pollutant}
                  style={[
                    styles.pollutantDot,
                    isActive && styles.activePollutantDot
                  ]}
                  onPress={() => setSelectedPollutant(pollutant)}
                >
                  <Text style={[
                    styles.pollutantDotText,
                    isActive && styles.activePollutantDotText
                  ]}>
                    {pollutant === 'PM25' ? 'P' : pollutant === 'NOX' ? 'N' : pollutant === 'VOCs' ? 'V' : 'O'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          
          {/* Pollutant Name */}
          <Text style={styles.legendTitle}>{getPollutantLabel()} (µg/m³)</Text>
          
          {/* Gradient Bar */}
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

      {/* Loading Indicator */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#6A8D73" />
        </View>
      )}

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
                  {/* Header with location and risk */}
                  <View style={styles.sheetHeader}>
                    <View style={styles.locationInfo}>
                      <Text style={styles.districtName}>蘆竹區</Text>
                      <Text style={styles.gridId}>GRID ID: {selectedGrid.gridId}</Text>
                    </View>
                    <View style={styles.riskBadge}>
                      <Text style={styles.riskText}>中等風險</Text>
                    </View>
                  </View>

                  {/* Pollutant levels */}
                  <View style={styles.pollutantSection}>
                    <View style={styles.pollutantItem}>
                      <Text style={styles.pollutantLabel}>PM2.5 濃度</Text>
                      <View style={styles.pollutantValue}>
                        <Text style={styles.pollutantNumber}>{selectedGrid.values.value}</Text>
                        <Text style={styles.pollutantUnit}>μg/m³</Text>
                      </View>
                      <View style={styles.levelIndicator}>
                        {[1,2,3,4,5].map((level) => (
                          <View 
                            key={level}
                            style={[
                              styles.levelBar,
                              level <= 3 && styles.activeLevelBar
                            ]} 
                          />
                        ))}
                      </View>
                    </View>

                    <View style={styles.pollutantItem}>
                      <Text style={styles.pollutantLabel}>O3 濃度</Text>
                      <View style={styles.pollutantValue}>
                        <Text style={styles.pollutantNumber}>42</Text>
                        <Text style={styles.pollutantUnit}>ppb</Text>
                      </View>
                      <View style={styles.levelIndicator}>
                        {[1,2,3,4,5].map((level) => (
                          <View 
                            key={level}
                            style={[
                              styles.levelBar,
                              level <= 2 && styles.activeLevelBar
                            ]} 
                          />
                        ))}
                      </View>
                    </View>
                  </View>

                  {/* AI Insight */}
                  <View style={styles.aiSection}>
                    <View style={styles.aiHeader}>
                      <Ionicons name="bulb" size={16} color="#B5C99A" />
                      <Text style={styles.aiTitle}>AI 分析</Text>
                    </View>
                    <Text style={styles.aiText}>
                      預計空氣品質將在 2 小時內因風向變化而下降。建議敏感族群配戴口罩。
                    </Text>
                  </View>

                  {/* Full Analysis Button */}
                  <TouchableOpacity style={styles.analysisButton}>
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
  container: {
    flex: 1,
  },
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
  activeModeButton: {
    backgroundColor: '#B5C99A',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  activeModeButtonText: {
    color: 'white',
  },
  map: {
    flex: 1,
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
  activePollutantDot: {
    backgroundColor: '#6A8D73',
  },
  pollutantDotText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6A8D73',
  },
  activePollutantDotText: {
    color: 'white',
  },
  legendTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6A8D73',
    textAlign: 'left',
    marginBottom: 12,
  },
  gradientBar: {
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  legendLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legendLabel: {
    fontSize: 10,
    color: '#666',
  },

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
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  searchDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 12,
  },
  mapModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mapModeText: {
    fontSize: 12,
    color: '#6A8D73',
    fontWeight: '600',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(244, 242, 233, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: screenHeight * 0.5,
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
  locationInfo: {
    flex: 1,
  },
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  pollutantItem: {
    flex: 1,
    marginHorizontal: 8,
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
    marginBottom: 12,
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
  levelIndicator: {
    flexDirection: 'row',
    gap: 4,
  },
  levelBar: {
    width: 16,
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
  },
  activeLevelBar: {
    backgroundColor: '#B5C99A',
  },
  aiSection: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  aiTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B5C99A',
    marginLeft: 6,
  },
  aiText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  analysisButton: {
    backgroundColor: '#333',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  analysisButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  hexMarker: {
    width: 40,
    height: 40,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  hexValue: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  satelliteMarker: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  satelliteGlow: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    opacity: 0.3,
  },
  satelliteCore: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#6A8D73',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  satelliteValue: {
    color: '#6A8D73',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
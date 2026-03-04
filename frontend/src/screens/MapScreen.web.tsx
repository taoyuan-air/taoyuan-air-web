import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { TopNavigation } from '../navigation/TopNavigation';
import { useStore } from '../store';

export const MapScreen = () => {
  const { selectedPollutant, setSelectedPollutant, gridCells } = useStore();

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
    <LinearGradient colors={['#F4F2E9', '#E8E6D3']} style={styles.container}>
      <TopNavigation title="Map View" subtitle="WEB VERSION" />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.iconContainer}>
            <Ionicons name="map" size={48} color="#6A8D73" />
          </View>
          <Text style={styles.title}>互動式地圖功能</Text>
          <Text style={styles.message}>
            完整的 3D 地圖、即時網格數據和空間分析功能目前僅支援手機版本。
          </Text>
          <View style={styles.divider} />
          <Text style={styles.hint}>
            💡 請使用 Expo Go 在手機上查看完整功能
          </Text>
        </View>

        {/* Pollutant Selector */}
        <View style={styles.selectorCard}>
          <Text style={styles.selectorTitle}>選擇污染物</Text>
          <View style={styles.pollutantGrid}>
            {(['PM25', 'O3', 'NOX', 'VOCs'] as const).map((pollutant) => {
              const isActive = selectedPollutant === pollutant;
              const labels = { PM25: 'PM2.5', O3: 'O₃', NOX: 'NOₓ', VOCs: 'VOCs' };
              return (
                <TouchableOpacity
                  key={pollutant}
                  style={[styles.pollutantButton, isActive && styles.activePollutant]}
                  onPress={() => setSelectedPollutant(pollutant)}
                >
                  <Text style={[styles.pollutantText, isActive && styles.activePollutantText]}>
                    {labels[pollutant]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Grid Data Preview */}
        <View style={styles.dataCard}>
          <Text style={styles.dataTitle}>網格數據預覽 - {getPollutantLabel()}</Text>
          <Text style={styles.dataSubtitle}>共 {gridCells.length} 個監測網格</Text>
          
          <View style={styles.gridList}>
            {gridCells.slice(0, 6).map((grid) => (
              <View key={grid.gridId} style={styles.gridItem}>
                <View style={styles.gridInfo}>
                  <Text style={styles.gridId}>{grid.gridId}</Text>
                  <Text style={styles.gridDistrict}>{grid.district || '桃園市'}</Text>
                </View>
                <View style={styles.gridValue}>
                  <Text style={styles.valueNumber}>{Math.round(grid.values.value)}</Text>
                  <Text style={styles.valueUnit}>μg/m³</Text>
                </View>
              </View>
            ))}
          </View>
          
          {gridCells.length > 6 && (
            <Text style={styles.moreText}>還有 {gridCells.length - 6} 個網格...</Text>
          )}
        </View>

        {/* Features List */}
        <View style={styles.featuresCard}>
          <Text style={styles.featuresTitle}>手機版專屬功能</Text>
          {[
            { icon: 'map', text: '3D 互動式地圖視圖' },
            { icon: 'grid', text: '即時污染網格覆蓋' },
            { icon: 'location', text: 'GPS 定位與導航' },
            { icon: 'analytics', text: '空間數據分析' },
          ].map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              <Ionicons name={feature.icon as any} size={20} color="#6A8D73" />
              <Text style={styles.featureText}>{feature.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 20 },
  infoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(106, 141, 115, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 12, textAlign: 'center' },
  message: { fontSize: 16, color: '#666', textAlign: 'center', lineHeight: 24, marginBottom: 20 },
  divider: { width: '100%', height: 1, backgroundColor: '#E0E0E0', marginVertical: 20 },
  hint: { fontSize: 14, color: '#6A8D73', textAlign: 'center', fontWeight: '600' },
  selectorCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  selectorTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 16 },
  pollutantGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  pollutantButton: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(106, 141, 115, 0.1)',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  activePollutant: {
    backgroundColor: '#6A8D73',
    borderColor: '#6A8D73',
  },
  pollutantText: { fontSize: 16, fontWeight: '600', color: '#6A8D73' },
  activePollutantText: { color: 'white' },
  dataCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  dataTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  dataSubtitle: { fontSize: 14, color: '#999', marginBottom: 16 },
  gridList: { gap: 12 },
  gridItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(106, 141, 115, 0.05)',
    borderRadius: 12,
  },
  gridInfo: { flex: 1 },
  gridId: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 4 },
  gridDistrict: { fontSize: 14, color: '#666' },
  gridValue: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  valueNumber: { fontSize: 24, fontWeight: 'bold', color: '#6A8D73' },
  valueUnit: { fontSize: 12, color: '#999' },
  moreText: { fontSize: 14, color: '#999', textAlign: 'center', marginTop: 12, fontStyle: 'italic' },
  featuresCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 100,
  },
  featuresTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 16 },
  featureItem: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  featureText: { fontSize: 16, color: '#666' },
});

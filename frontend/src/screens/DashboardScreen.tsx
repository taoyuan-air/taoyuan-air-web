import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  ActivityIndicator 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useStore } from '../store';
import { TopNavigation } from '../navigation/TopNavigation';
import { getMeta, getGrid, getAlerts, getEvents, setScenario } from '../api';
import { StationCarousel } from '../components';

interface DashboardScreenProps {
  scrollRef?: (ref: any) => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ scrollRef }) => {
  const { 
    selectedScenario, 
    gridCells,
    setGridCells,
    alerts,
    setAlerts,
    events,
    setEvents,
    isLoading,
    setIsLoading
  } = useStore();

  useEffect(() => {
    loadData();
  }, [selectedScenario]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      setScenario(selectedScenario);
      const [meta, grid, alertsData, eventsData] = await Promise.all([
        getMeta(),
        getGrid({ pollutant: 'PM25' }),
        getAlerts(),
        getEvents()
      ]);
      
      setGridCells(grid);
      setAlerts(alertsData);
      setEvents(eventsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getAQIData = () => {
    if (gridCells.length === 0) return { aqi: 65, level: '普通' };
    
    const avgPM25 = Math.round(
      gridCells.reduce((sum, cell) => sum + cell.values.value, 0) / gridCells.length
    );
    
    let level = '良好';
    if (avgPM25 > 75) level = '對敏感族群不健康';
    else if (avgPM25 > 50) level = '普通';
    
    return { aqi: avgPM25, level };
  };

  const getPollutantData = () => {
    if (gridCells.length === 0) return [
      { name: 'PM2.5', value: 12, unit: 'μg/m³', icon: 'wind' },
      { name: 'PM10', value: 24, unit: 'μg/m³', icon: 'layers' },
      { name: 'O3', value: 48, unit: 'ppb', icon: 'sun' },
      { name: 'NO2', value: 15, unit: 'ppb', icon: 'cloud' },
    ];
    
    const avgPM25 = Math.round(
      gridCells.reduce((sum, cell) => sum + cell.values.value, 0) / gridCells.length
    );
    
    return [
      { name: 'PM2.5', value: avgPM25, unit: 'μg/m³', icon: 'wind' },
      { name: 'PM10', value: Math.round(avgPM25 * 1.3), unit: 'μg/m³', icon: 'layers' },
      { name: 'O3', value: Math.round(avgPM25 * 0.8), unit: 'ppb', icon: 'sun' },
      { name: 'NO2', value: Math.round(avgPM25 * 0.3), unit: 'ppb', icon: 'cloud' },
    ];
  };

  const aqiData = getAQIData();
  const pollutantData = getPollutantData();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6abe74" />
        <Text style={styles.loadingText}>載入中...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView ref={scrollRef} style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <TopNavigation />

        {/* Large AQI Gauge */}
        <View style={styles.gaugeSection}>
          <View style={styles.gaugeContainer}>
            {/* Outer ring with gradient effect */}
            <View style={styles.gaugeOuterRing}>
              <View style={styles.gaugeProgressRing} />
            </View>
            {/* Inner white circle */}
            <View style={styles.gaugeInnerCircle}>
              <Text style={styles.gaugeLabel}>CURRENT AQI</Text>
              <Text style={styles.gaugeValue}>{aqiData.aqi}</Text>
              <View style={styles.gaugeBadge}>
                <Feather name="check-circle" size={12} color="#6abe74" />
                <Text style={styles.gaugeBadgeText}>Moderate</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Station Carousel */}
        <StationCarousel />

        {/* AI Trend Analysis Block */}
        <View style={styles.insightSection}>
          <View style={styles.insightCard}>
            <View style={styles.insightIconContainer}>
              <View style={styles.insightIconBg}>
                <Feather name="trending-up" size={20} color="#6abe74" />
              </View>
            </View>
            <View style={styles.insightContent}>
              <Text style={styles.insightTitle}>AI TREND ANALYSIS</Text>
              <Text style={styles.insightText}>
                PM2.5 濃度預計在未來3小時內因海風輻合影響下降 <Text style={styles.highlightText}>12%</Text>。
              </Text>
            </View>
          </View>
        </View>

        {/* Ozone Concentration Block */}
        <View style={styles.ozoneSection}>
          <View style={styles.ozoneCard}>
            <View style={styles.ozoneHeader}>
              <Text style={styles.ozoneTitle}>OZONE CONCENTRATION</Text>
              <Feather name="cloud-rain" size={20} color="#6abe74" />
            </View>
            <View style={styles.ozoneContent}>
              <Text style={styles.ozoneValue}>32</Text>
              <Text style={styles.ozoneLabel}>SAFE LEVELS</Text>
            </View>
            <View style={styles.ozoneBar}>
              <View style={styles.ozoneProgress} />
            </View>
            <View style={styles.ozoneRange}>
              <Text style={styles.rangeText}>0 PPB</Text>
              <Text style={styles.rangeText}>100 PPB</Text>
            </View>
          </View>
        </View>

        {/* Pollutant Cards Grid - Only 2 cards */}
        <View style={styles.cardsSection}>
          <View style={styles.cardsGrid}>
            <View style={styles.pollutantCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>PM2.5</Text>
                <Text style={styles.cardStatus}>LOW</Text>
              </View>
              <View style={styles.cardValue}>
                <Text style={styles.valueNumber}>12</Text>
                <Text style={styles.valueUnit}>μg/m³</Text>
              </View>
              <View style={styles.chartContainer}>
                <View style={styles.trendLine}>
                  <View style={[styles.trendDot, { left: '10%', bottom: '40%' }]} />
                  <View style={[styles.trendDot, { left: '30%', bottom: '30%' }]} />
                  <View style={[styles.trendDot, { left: '50%', bottom: '50%' }]} />
                  <View style={[styles.trendDot, { left: '70%', bottom: '70%' }]} />
                  <View style={[styles.trendDot, { left: '90%', bottom: '80%' }]} />
                </View>
              </View>
            </View>
            <View style={styles.pollutantCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>NO2</Text>
                <Text style={styles.cardStatusStable}>STABLE</Text>
              </View>
              <View style={styles.cardValue}>
                <Text style={styles.valueNumber}>08</Text>
                <Text style={styles.valueUnit}>ppb</Text>
              </View>
              <View style={styles.chartContainer}>
                <View style={styles.trendLineFlat}>
                  <View style={[styles.trendDotGray, { left: '10%', bottom: '50%' }]} />
                  <View style={[styles.trendDotGray, { left: '30%', bottom: '45%' }]} />
                  <View style={[styles.trendDotGray, { left: '50%', bottom: '50%' }]} />
                  <View style={[styles.trendDotGray, { left: '70%', bottom: '48%' }]} />
                  <View style={[styles.trendDotGray, { left: '90%', bottom: '52%' }]} />
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F2E9',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F4F2E9',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6abe74',
  },
  scrollView: {
    flex: 1,
  },

  gaugeSection: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingBottom: 8,
  },
  gaugeContainer: {
    position: 'relative',
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gaugeOuterRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(106, 190, 116, 0.1)',
    borderWidth: 14,
    borderColor: 'rgba(106, 190, 116, 0.2)',
  },
  gaugeProgressRing: {
    position: 'absolute',
    width: 172,
    height: 172,
    borderRadius: 86,
    top: -7,
    left: -7,
    borderWidth: 14,
    borderColor: 'transparent',
    borderLeftColor: '#6abe74',
    borderBottomColor: '#6abe74',
    transform: [{ rotate: '-45deg' }],
  },
  gaugeInnerCircle: {
    width: 158,
    height: 158,
    borderRadius: 79,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  gaugeLabel: {
    fontSize: 10,
    color: '#9ca3af',
    fontWeight: '500',
    letterSpacing: 2,
    marginBottom: 6,
  },
  gaugeValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#6abe74',
    lineHeight: 48,
    marginBottom: 6,
  },
  gaugeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gaugeBadgeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6abe74',
  },
  insightSection: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  insightCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  insightIconContainer: {
    marginTop: 2,
  },
  insightIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(106, 190, 116, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
    letterSpacing: 1,
    marginBottom: 8,
  },
  insightText: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  highlightText: {
    color: '#6abe74',
    fontWeight: 'bold',
  },
  ozoneSection: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  ozoneCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  ozoneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  ozoneTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
    letterSpacing: 1,
  },
  ozoneContent: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    marginBottom: 20,
  },
  ozoneValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#333',
  },
  ozoneLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  ozoneBar: {
    height: 8,
    backgroundColor: 'rgba(106, 190, 116, 0.2)',
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  ozoneProgress: {
    height: '100%',
    width: '32%',
    backgroundColor: '#6abe74',
    borderRadius: 4,
  },
  ozoneRange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rangeText: {
    fontSize: 12,
    color: '#999',
  },
  cardsSection: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  pollutantCard: {
    width: '47%',
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardStatus: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#6abe74',
  },
  cardStatusStable: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#999',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6b7280',
  },
  cardValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 12,
  },
  valueNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#131613',
    lineHeight: 32,
  },
  valueUnit: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#9ca3af',
    textTransform: 'uppercase',
  },
  chartContainer: {
    height: 40,
    marginTop: 'auto',
  },
  trendLine: {
    flex: 1,
    position: 'relative',
    backgroundColor: 'rgba(106, 190, 116, 0.1)',
    borderRadius: 2,
  },
  trendLineFlat: {
    flex: 1,
    position: 'relative',
    backgroundColor: 'rgba(153, 153, 153, 0.1)',
    borderRadius: 2,
  },
  trendDot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#6abe74',
  },
  trendDotGray: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#999',
  },
  bottomSpacing: {
    height: 100,
  },
});
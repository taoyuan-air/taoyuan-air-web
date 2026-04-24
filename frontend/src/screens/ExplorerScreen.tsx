import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from "expo-linear-gradient";
import { TopNavigation } from "../navigation/TopNavigation";
import { useStore } from "../store";

interface ExplorerScreenProps {
  scrollRef?: (ref: any) => void;
}

export const ExplorerScreen: React.FC<ExplorerScreenProps> = ({ scrollRef }) => {
  const [searchText, setSearchText] = useState("");
  const [selectedTimeFilter, setSelectedTimeFilter] = useState("近24小時");
  const [selectedPollutantFilter, setSelectedPollutantFilter] = useState("PM2.5");
  const [selectedRegionFilter, setSelectedRegionFilter] = useState("全部");
  const [selectedDataSources, setSelectedDataSources] = useState<string[]>(["MOE"]);
  const [showTimeFilter, setShowTimeFilter] = useState(false);
  const [showPollutantFilter, setShowPollutantFilter] = useState(false);
  const [showRegionFilter, setShowRegionFilter] = useState(false);
  const [showDataSourceFilter, setShowDataSourceFilter] = useState(false);

  const timeOptions = ["近24小時", "近一週", "近一月"];
  const pollutantOptions = ["PM2.5", "O3", "NOX", "VOCs"];
  const regionOptions = ["全部", "北區", "桃園市", "新竹縣市", "苗栗縣"];
  const dataSourceOptions = ["MOE", "微型感測", "光達", "LUV"];

  const toggleDataSource = (source: string) => {
    setSelectedDataSources(prev => 
      prev.includes(source) 
        ? prev.filter(s => s !== source)
        : [...prev, source]
    );
  };

  const allMonitoringData = [
    {
      id: 1,
      district: "桃園市",
      station: "Station TY-09",
      time: "14:02 PM",
      passed: true,
      pollutant: "PM2.5",
      value: 12,
      unit: "μg/m³",
      source: "MOE",
      version: "v2.1",
      color: "#4CAF50",
      timeCategory: "近24小時",
      region: "桃園市"
    },
    {
      id: 2,
      district: "中壢平鎮區",
      station: "Grid Alpha-4",
      time: "13:45 PM",
      passed: false,
      pollutant: "PM2.5",
      value: 48,
      unit: "μg/m³",
      source: "微型感測",
      version: "v2.0",
      color: "#FFA868",
      timeCategory: "近24小時",
      region: "北區"
    },
    {
      id: 3,
      district: "龜山林口區",
      station: "Sensor TY-42",
      time: "13:20 PM",
      passed: true,
      pollutant: "PM2.5",
      value: 8,
      unit: "μg/m³",
      source: "光達",
      version: "v2.1",
      color: "#4CAF50",
      timeCategory: "近24小時",
      region: "苗栗縣"
    },
    {
      id: 4,
      district: "新竹市平鎮區",
      station: "Station TY-15",
      time: "12:30 PM",
      passed: true,
      pollutant: "O3",
      value: 35,
      unit: "ppb",
      source: "MOE",
      version: "v2.1",
      color: "#4CAF50",
      timeCategory: "近24小時",
      region: "新竹縣市"
    },
    {
      id: 5,
      district: "北區大同",
      station: "Micro-Sensor B12",
      time: "11:15 AM",
      passed: false,
      pollutant: "NOX",
      value: 85,
      unit: "ppb",
      source: "微型感測",
      version: "v1.8",
      color: "#FF6B6B",
      timeCategory: "近24小時",
      region: "北區"
    },
    {
      id: 6,
      district: "桃園市平鎮",
      station: "LUV-Station C3",
      time: "10:45 AM",
      passed: true,
      pollutant: "VOCs",
      value: 22,
      unit: "ppb",
      source: "LUV",
      version: "v3.0",
      color: "#4CAF50",
      timeCategory: "近24小時",
      region: "桃園市"
    },
    {
      id: 7,
      district: "苗栗縣頭份市",
      station: "Grid Beta-7",
      time: "昨日 23:30",
      passed: false,
      pollutant: "PM2.5",
      value: 52,
      unit: "μg/m³",
      source: "微型感測",
      version: "v2.0",
      color: "#FFA868",
      timeCategory: "近一週",
      region: "苗栗縣"
    },
    {
      id: 8,
      district: "新竹縣竹北市",
      station: "Station TY-22",
      time: "昨日 22:15",
      passed: true,
      pollutant: "O3",
      value: 28,
      unit: "ppb",
      source: "MOE",
      version: "v2.1",
      color: "#4CAF50",
      timeCategory: "近一週",
      region: "新竹縣市"
    },
    {
      id: 9,
      district: "北區仁愛路",
      station: "LIDAR-Point A1",
      time: "昨日 20:00",
      passed: true,
      pollutant: "NOX",
      value: 42,
      unit: "ppb",
      source: "光達",
      version: "v2.3",
      color: "#4CAF50",
      timeCategory: "近一週",
      region: "新竹縣市"
    },
    {
      id: 10,
      district: "桃園市中壢區",
      station: "Micro-Array D5",
      time: "昨日 18:45",
      passed: false,
      pollutant: "VOCs",
      value: 78,
      unit: "ppb",
      source: "微型感測",
      version: "v1.9",
      color: "#FF6B6B",
      timeCategory: "近一週",
      region: "桃園市"
    },
    {
      id: 11,
      district: "北區民生路",
      station: "LUV-Hub M1",
      time: "3天前 16:30",
      passed: true,
      pollutant: "PM2.5",
      value: 18,
      unit: "μg/m³",
      source: "LUV",
      version: "v3.0",
      color: "#4CAF50",
      timeCategory: "近一週",
      region: "北區"
    },
    {
      id: 12,
      district: "苗栗縣苑裡鎮",
      station: "Station TY-35",
      time: "4天前 14:20",
      passed: true,
      pollutant: "O3",
      value: 31,
      unit: "ppb",
      source: "MOE",
      version: "v2.1",
      color: "#4CAF50",
      timeCategory: "近一週",
      region: "苗栗縣"
    },
    {
      id: 13,
      district: "新竹縣關西鎮",
      station: "LIDAR-Grid F8",
      time: "5天前 12:10",
      passed: false,
      pollutant: "NOX",
      value: 95,
      unit: "ppb",
      source: "光達",
      version: "v2.3",
      color: "#FF6B6B",
      timeCategory: "近一週",
      region: "新竹縣市"
    },
    {
      id: 14,
      district: "桃園市復興區",
      station: "Micro-Net G2",
      time: "6天前 09:45",
      passed: true,
      pollutant: "VOCs",
      value: 25,
      unit: "ppb",
      source: "微型感測",
      version: "v2.0",
      color: "#4CAF50",
      timeCategory: "近一週",
      region: "桃園市"
    },
    {
      id: 15,
      district: "北區大雅",
      station: "LUV-Station H4",
      time: "7天前 15:30",
      passed: true,
      pollutant: "PM2.5",
      value: 15,
      unit: "μg/m³",
      source: "LUV",
      version: "v3.0",
      color: "#4CAF50",
      timeCategory: "近一週",
      region: "北區"
    }
  ];

  const getFilteredData = () => {
    return allMonitoringData.filter(item => {
      // 搜尋篩選
      if (searchText && !item.district.toLowerCase().includes(searchText.toLowerCase()) && 
          !item.station.toLowerCase().includes(searchText.toLowerCase())) {
        return false;
      }
      
      // 時間篩選
      if (selectedTimeFilter !== "近24小時" && item.timeCategory !== selectedTimeFilter) {
        return false;
      }
      
      // 污染物篩選
      if (selectedPollutantFilter !== "PM2.5" && item.pollutant !== selectedPollutantFilter) {
        return false;
      }
      
      // 地區篩選
      if (selectedRegionFilter !== "全部" && item.region !== selectedRegionFilter) {
        return false;
      }
      
      // 資料來源篩選
      if (selectedDataSources.length > 0 && !selectedDataSources.includes(item.source)) {
        return false;
      }
      
      return true;
    });
  };

  const monitoringData = getFilteredData();

  return (
    <LinearGradient colors={["#F4F2E9", "#E8E6D3"]} style={styles.container}>
      <TopNavigation title="資料探索" subtitle="QUERY & ANALYSIS" />
      
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="搜尋地區或測站ID"
              placeholderTextColor="#999"
              value={searchText}
              onChangeText={setSearchText}
            />
          </View>
        </View>

        {/* Filter Buttons */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.filterScrollView}
          contentContainerStyle={styles.filterContainer}
        >
          <TouchableOpacity 
            style={[styles.filterButton, showTimeFilter && styles.activeFilter]}
            onPress={() => setShowTimeFilter(!showTimeFilter)}
          >
            <Text style={[styles.filterText, showTimeFilter && styles.activeFilterText]}>{selectedTimeFilter}</Text>
            <Ionicons name="chevron-down" size={16} color={showTimeFilter ? "white" : "#6A8D73"} />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.filterButton, showPollutantFilter && styles.activeFilter]}
            onPress={() => setShowPollutantFilter(!showPollutantFilter)}
          >
            <Text style={[styles.filterText, showPollutantFilter && styles.activeFilterText]}>{selectedPollutantFilter}</Text>
            <Ionicons name="chevron-down" size={16} color={showPollutantFilter ? "white" : "#6A8D73"} />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.filterButton, showRegionFilter && styles.activeFilter]}
            onPress={() => setShowRegionFilter(!showRegionFilter)}
          >
            <Text style={[styles.filterText, showRegionFilter && styles.activeFilterText]}>{selectedRegionFilter}</Text>
            <Ionicons name="chevron-down" size={16} color={showRegionFilter ? "white" : "#6A8D73"} />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.filterButton, showDataSourceFilter && styles.activeFilter]}
            onPress={() => setShowDataSourceFilter(!showDataSourceFilter)}
          >
            <Text style={[styles.filterText, showDataSourceFilter && styles.activeFilterText]}>資料來源</Text>
            <Ionicons name="chevron-down" size={16} color={showDataSourceFilter ? "white" : "#6A8D73"} />
          </TouchableOpacity>
        </ScrollView>

        {/* Filter Dropdowns */}
        {showTimeFilter && (
          <View style={styles.dropdownContainer}>
            {timeOptions.map(option => (
              <TouchableOpacity 
                key={option}
                style={styles.dropdownItem}
                onPress={() => {
                  setSelectedTimeFilter(option);
                  setShowTimeFilter(false);
                }}
              >
                <Text style={styles.dropdownText}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {showPollutantFilter && (
          <View style={styles.dropdownContainer}>
            {pollutantOptions.map(option => (
              <TouchableOpacity 
                key={option}
                style={styles.dropdownItem}
                onPress={() => {
                  setSelectedPollutantFilter(option);
                  setShowPollutantFilter(false);
                }}
              >
                <Text style={styles.dropdownText}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {showRegionFilter && (
          <View style={styles.dropdownContainer}>
            {regionOptions.map(option => (
              <TouchableOpacity 
                key={option}
                style={styles.dropdownItem}
                onPress={() => {
                  setSelectedRegionFilter(option);
                  setShowRegionFilter(false);
                }}
              >
                <Text style={styles.dropdownText}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {showDataSourceFilter && (
          <View style={styles.dropdownContainer}>
            {dataSourceOptions.map(option => (
              <TouchableOpacity 
                key={option}
                style={[styles.dropdownItem, styles.checkboxItem]}
                onPress={() => toggleDataSource(option)}
              >
                <Text style={styles.dropdownText}>{option}</Text>
                {selectedDataSources.includes(option) && (
                  <Ionicons name="checkmark" size={16} color="#6A8D73" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Monitoring Feed Header */}
        <View style={styles.feedHeader}>
          <Text style={styles.feedTitle}>監測資料</Text>
        </View>

        {/* Monitoring Cards */}
        <View style={styles.cardsContainer}>
          {monitoringData.map((item) => (
            <View key={item.id} style={styles.monitoringCard}>
              {/* Top Section: District, Station, Time, Status Badge */}
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleContainer}>
                  <Text style={styles.cardTitle}>{item.district}</Text>
                  <Text style={styles.cardSubtitle}>{item.station} · {item.time}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: item.passed ? '#A8D5A8' : '#FFD4B3' }]}>
                  <Text style={[styles.statusBadgeText, { color: item.passed ? '#2E7D32' : '#D2691E' }]}>{item.passed ? '通過' : '異常'}</Text>
                </View>
              </View>
              
              {/* Bottom Section */}
              <View style={styles.cardBottom}>
                {/* Left: Pollutant, Source, Version */}
                <View style={styles.cardInfo}>
                  <Text style={styles.pollutantName}>{item.pollutant}</Text>
                  <Text style={styles.infoText}>來源: {item.source}</Text>
                  <Text style={styles.infoText}>版本: {item.version}</Text>
                </View>
                
                {/* Right: Value */}
                <View style={styles.valueContainer}>
                  <Text style={styles.value}>{item.value}</Text>
                  <Text style={styles.unit}>{item.unit}</Text>
                </View>
              </View>
              
              <View style={styles.progressContainer}>
                <LinearGradient
                  colors={[item.color, `${item.color}80`]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[
                    styles.progressBar,
                    { width: `${Math.min(item.value * 1.5, 80)}%` }
                  ]}
                />
              </View>
            </View>
          ))}
        </View>

        {/* Health Advisory */}
        <View style={styles.advisoryContainer}>
          <View style={styles.advisoryHeader}>
            <Text style={styles.advisoryTitle}>健康建議</Text>
          </View>
          <View style={styles.advisoryContent}>
            <View style={styles.advisoryIcon}>
              <Ionicons name="sparkles" size={24} color="white" />
            </View>
            <Text style={styles.advisoryText}>
              北區空氣品質良好，適合戶外活動，請注意防曬。
            </Text>
          </View>
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  voiceButton: {
    marginLeft: 12,
  },
  dropdownContainer: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  checkboxItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownText: {
    fontSize: 14,
    color: '#333',
  },
  filterScrollView: {
    paddingBottom: 20,
  },
  filterContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 20,
    gap: 6,
  },
  activeFilter: {
    backgroundColor: '#6A8D73',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6A8D73',
  },
  activeFilterText: {
    color: 'white',
  },
  feedHeader: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  feedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6A8D73',
    letterSpacing: 2,
  },
  statusDots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  pollutantName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  cardsContainer: {
    paddingHorizontal: 20,
    gap: 16,
  },
  monitoringCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardTitleContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(106, 141, 115, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardInfo: {
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
  },
  infoValue: {
    fontSize: 12,
    color: '#333',
    fontWeight: '600',
  },
  progressContainer: {
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  valueContainer: {
    alignItems: 'flex-end',
  },
  value: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
  },
  unit: {
    fontSize: 14,
    color: '#666',
    marginTop: -4,
  },
  advisoryContainer: {
    marginHorizontal: 20,
    marginTop: 24,
    backgroundColor: '#B5C99A',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  advisoryHeader: {
    marginBottom: 12,
  },
  advisoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    letterSpacing: 2,
  },
  advisoryContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  advisoryIcon: {
    marginRight: 12,
  },
  advisoryText: {
    flex: 1,
    fontSize: 14,
    color: 'white',
    lineHeight: 20,
  },
  bottomSpacing: {
    height: 100,
  },
});

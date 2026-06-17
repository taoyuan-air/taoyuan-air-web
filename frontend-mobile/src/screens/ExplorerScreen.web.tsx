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

interface ExplorerScreenProps {
  scrollRef?: (ref: any) => void;
}

export const ExplorerScreen: React.FC<ExplorerScreenProps> = ({ scrollRef }) => {
  const [searchText, setSearchText] = useState("");
  const [selectedTimeFilter, setSelectedTimeFilter] = useState("近24小時");
  const [selectedPollutantFilter, setSelectedPollutantFilter] = useState("PM2.5");
  const [selectedRegionFilter, setSelectedRegionFilter] = useState("全市");
  const [selectedDataSources, setSelectedDataSources] = useState<string[]>(["MOE"]);
  const [showTimeFilter, setShowTimeFilter] = useState(false);
  const [showPollutantFilter, setShowPollutantFilter] = useState(false);
  const [showRegionFilter, setShowRegionFilter] = useState(false);
  const [showDataSourceFilter, setShowDataSourceFilter] = useState(false);

  const timeOptions = ["近24小時", "近3天", "近7天"];
  const pollutantOptions = ["PM2.5", "O3", "NOX", "VOCs"];
  const regionOptions = ["全市", "桃園區", "中壢區", "大園區", "觀音區"];
  const dataSourceOptions = ["MOE", "微感測", "光達", "LUV"];

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
      district: "中壢區",
      station: "Station TY-09",
      time: "14:02 PM",
      passed: true,
      pollutant: "PM2.5",
      value: 12,
      unit: "μg/m³",
      source: "MOE",
      version: "v2.1",
      color: "#E76595",
      timeCategory: "近24小時",
      region: "中壢區"
    },
    {
      id: 2,
      district: "蘆竹工業區",
      station: "Grid Alpha-4",
      time: "13:45 PM",
      passed: false,
      pollutant: "PM2.5",
      value: 48,
      unit: "μg/m³",
      source: "微感測",
      version: "v2.0",
      color: "#FFA868",
      timeCategory: "近24小時",
      region: "桃園區"
    },
    {
      id: 3,
      district: "觀音海岸",
      station: "Sensor TY-42",
      time: "13:20 PM",
      passed: true,
      pollutant: "PM2.5",
      value: 8,
      unit: "μg/m³",
      source: "光達",
      version: "v2.1",
      color: "#E76595",
      timeCategory: "近24小時",
      region: "觀音區"
    },
    {
      id: 4,
      district: "大園工業區",
      station: "Station TY-15",
      time: "12:30 PM",
      passed: true,
      pollutant: "O3",
      value: 35,
      unit: "ppb",
      source: "MOE",
      version: "v2.1",
      color: "#E76595",
      timeCategory: "近24小時",
      region: "大園區"
    },
    {
      id: 5,
      district: "桃園市區",
      station: "Micro-Sensor B12",
      time: "11:15 AM",
      passed: false,
      pollutant: "NOX",
      value: 85,
      unit: "ppb",
      source: "微感測",
      version: "v1.8",
      color: "#FF6B6B",
      timeCategory: "近24小時",
      region: "桃園區"
    },
    {
      id: 6,
      district: "中壢商業區",
      station: "LUV-Station C3",
      time: "10:45 AM",
      passed: true,
      pollutant: "VOCs",
      value: 22,
      unit: "ppb",
      source: "LUV",
      version: "v3.0",
      color: "#E76595",
      timeCategory: "近24小時",
      region: "中壢區"
    },
    {
      id: 7,
      district: "觀音工業區",
      station: "Grid Beta-7",
      time: "昨日 23:30",
      passed: false,
      pollutant: "PM2.5",
      value: 52,
      unit: "μg/m³",
      source: "微感測",
      version: "v2.0",
      color: "#FFA868",
      timeCategory: "近3天",
      region: "觀音區"
    },
    {
      id: 8,
      district: "大園住宅區",
      station: "Station TY-22",
      time: "昨日 22:15",
      passed: true,
      pollutant: "O3",
      value: 28,
      unit: "ppb",
      source: "MOE",
      version: "v2.1",
      color: "#E76595",
      timeCategory: "近3天",
      region: "大園區"
    },
    {
      id: 9,
      district: "桃園機場周邊",
      station: "LIDAR-Point A1",
      time: "昨日 20:00",
      passed: true,
      pollutant: "NOX",
      value: 42,
      unit: "ppb",
      source: "光達",
      version: "v2.3",
      color: "#E76595",
      timeCategory: "近3天",
      region: "大園區"
    },
    {
      id: 10,
      district: "中壢工業區",
      station: "Micro-Array D5",
      time: "昨日 18:45",
      passed: false,
      pollutant: "VOCs",
      value: 78,
      unit: "ppb",
      source: "微感測",
      version: "v1.9",
      color: "#FF6B6B",
      timeCategory: "近3天",
      region: "中壢區"
    },
    {
      id: 11,
      district: "桃園都會區",
      station: "LUV-Hub M1",
      time: "3天前 16:30",
      passed: true,
      pollutant: "PM2.5",
      value: 18,
      unit: "μg/m³",
      source: "LUV",
      version: "v3.0",
      color: "#E76595",
      timeCategory: "近7天",
      region: "桃園區"
    },
    {
      id: 12,
      district: "觀音沿海",
      station: "Station TY-35",
      time: "4天前 14:20",
      passed: true,
      pollutant: "O3",
      value: 31,
      unit: "ppb",
      source: "MOE",
      version: "v2.1",
      color: "#E76595",
      timeCategory: "近7天",
      region: "觀音區"
    },
    {
      id: 13,
      district: "大園農業區",
      station: "LIDAR-Grid F8",
      time: "5天前 12:10",
      passed: false,
      pollutant: "NOX",
      value: 95,
      unit: "ppb",
      source: "光達",
      version: "v2.3",
      color: "#FF6B6B",
      timeCategory: "近7天",
      region: "大園區"
    },
    {
      id: 14,
      district: "中壢市中心",
      station: "Micro-Net G2",
      time: "6天前 09:45",
      passed: true,
      pollutant: "VOCs",
      value: 25,
      unit: "ppb",
      source: "微感測",
      version: "v2.0",
      color: "#E76595",
      timeCategory: "近7天",
      region: "中壢區"
    },
    {
      id: 15,
      district: "桃園高鐵區",
      station: "LUV-Station H4",
      time: "7天前 15:30",
      passed: true,
      pollutant: "PM2.5",
      value: 15,
      unit: "μg/m³",
      source: "LUV",
      version: "v3.0",
      color: "#E76595",
      timeCategory: "近7天",
      region: "桃園區"
    }
  ];

  const getFilteredData = () => {
    return allMonitoringData.filter(item => {
      // 搜尋文字篩選
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

      // 區域篩選
      if (selectedRegionFilter !== "全市" && item.region !== selectedRegionFilter) {
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
    <LinearGradient colors={["#FFF6F9", "#FFEAF0"]} style={styles.container}>
      {/* ── TOP BAR: Title + Search + Filters ── */}
      <View style={styles.topBar}>
        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="搜尋區域或感測器 ID"
            placeholderTextColor="#999"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>

        {/* Filters Row */}
        <View style={styles.filtersRow}>

          {/* Time Filter */}
          <View style={styles.topFilterGroup}>
            <TouchableOpacity
              style={[styles.topFilterButton, showTimeFilter && styles.activeFilter]}
              onPress={() => setShowTimeFilter(!showTimeFilter)}
            >
              <Text style={[styles.filterText, showTimeFilter && styles.activeFilterText]}>
                {selectedTimeFilter}
              </Text>
              <Ionicons name="chevron-down" size={14} color={showTimeFilter ? "white" : "#E76595"} />
            </TouchableOpacity>
            {showTimeFilter && (
              <View style={styles.topDropdown}>
                {timeOptions.map(option => (
                  <TouchableOpacity
                    key={option}
                    style={styles.sidebarDropdownItem}
                    onPress={() => { setSelectedTimeFilter(option); setShowTimeFilter(false); }}
                  >
                    <Text style={styles.dropdownText}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Pollutant Filter */}
          <View style={styles.topFilterGroup}>
            <TouchableOpacity
              style={[styles.topFilterButton, showPollutantFilter && styles.activeFilter]}
              onPress={() => setShowPollutantFilter(!showPollutantFilter)}
            >
              <Text style={[styles.filterText, showPollutantFilter && styles.activeFilterText]}>
                {selectedPollutantFilter}
              </Text>
              <Ionicons name="chevron-down" size={14} color={showPollutantFilter ? "white" : "#E76595"} />
            </TouchableOpacity>
            {showPollutantFilter && (
              <View style={styles.topDropdown}>
                {pollutantOptions.map(option => (
                  <TouchableOpacity
                    key={option}
                    style={styles.sidebarDropdownItem}
                    onPress={() => { setSelectedPollutantFilter(option); setShowPollutantFilter(false); }}
                  >
                    <Text style={styles.dropdownText}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Region Filter */}
          <View style={styles.topFilterGroup}>
            <TouchableOpacity
              style={[styles.topFilterButton, showRegionFilter && styles.activeFilter]}
              onPress={() => setShowRegionFilter(!showRegionFilter)}
            >
              <Text style={[styles.filterText, showRegionFilter && styles.activeFilterText]}>
                {selectedRegionFilter}
              </Text>
              <Ionicons name="chevron-down" size={14} color={showRegionFilter ? "white" : "#E76595"} />
            </TouchableOpacity>
            {showRegionFilter && (
              <View style={styles.topDropdown}>
                {regionOptions.map(option => (
                  <TouchableOpacity
                    key={option}
                    style={styles.sidebarDropdownItem}
                    onPress={() => { setSelectedRegionFilter(option); setShowRegionFilter(false); }}
                  >
                    <Text style={styles.dropdownText}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Data Source Filter */}
          <View style={styles.topFilterGroup}>
            <TouchableOpacity
              style={[styles.topFilterButton, showDataSourceFilter && styles.activeFilter]}
              onPress={() => setShowDataSourceFilter(!showDataSourceFilter)}
            >
              <Text style={[styles.filterText, showDataSourceFilter && styles.activeFilterText]}>
                資料來源
              </Text>
              <Ionicons name="chevron-down" size={14} color={showDataSourceFilter ? "white" : "#E76595"} />
            </TouchableOpacity>
            {showDataSourceFilter && (
              <View style={styles.topDropdown}>
                {dataSourceOptions.map(option => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.sidebarDropdownItem, styles.checkboxItem]}
                    onPress={() => toggleDataSource(option)}
                  >
                    <Text style={styles.dropdownText}>{option}</Text>
                    {selectedDataSources.includes(option) && (
                      <Ionicons name="checkmark" size={14} color="#E76595" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Health Advisory (inline chip) */}
          <View style={styles.advisoryChip}>
            <Ionicons name="sparkles" size={14} color="white" style={{ marginRight: 6 }} />
            <Text style={styles.advisoryChipText}>桃園空氣品質保持穩定。今日適合戶外活動。</Text>
          </View>

        </View>
      </View>

      {/* ── MAIN CONTENT ── */}
      <ScrollView
          ref={scrollRef}
          style={styles.mainContent}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.mainContentInner}
        >
          {/* Feed Header */}
          <View style={styles.feedHeader}>
            <Text style={styles.feedTitle}>監測動態</Text>
            <Text style={styles.feedCount}>{monitoringData.length} 筆結果</Text>
          </View>

          {/* Cards Grid */}
          <View style={styles.cardsGrid}>
            {monitoringData.map((item) => (
              <View key={item.id} style={styles.monitoringCard}>
                {/* Top Section */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleContainer}>
                    <Text style={styles.cardTitle}>{item.district}</Text>
                    <Text style={styles.cardSubtitle}>{item.station} • {item.time}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: item.passed ? '#F8D0DA' : '#FFD4B3' }]}>
                    <Text style={[styles.statusBadgeText, { color: item.passed ? '#E76595' : '#D2691E' }]}>
                      {item.passed ? '通過' : '異常'}
                    </Text>
                  </View>
                </View>

                {/* Bottom Section */}
                <View style={styles.cardBottom}>
                  <View style={styles.cardInfo}>
                    <Text style={styles.pollutantName}>{item.pollutant}</Text>
                    <Text style={styles.infoText}>來源: {item.source}</Text>
                    <Text style={styles.infoText}>版本: {item.version}</Text>
                  </View>
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

          <View style={styles.bottomSpacing} />
        </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  // ── Root ──
  container: {
    flex: 1,
  },

  // ── Top Bar ──
  topBar: {
    paddingHorizontal: 70,
    paddingTop: 40,
    paddingBottom: 16,
    gap: 12,
    zIndex: 10,
  },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  topFilterGroup: {
    marginTop: 10,
    position: 'relative' as any,
    zIndex: 20,
  },
  topFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(231, 101, 149, 0.07)',
    borderRadius: 20,
    gap: 6,
  },
  topDropdown: {
    position: 'absolute' as any,
    top: '110%' as any,
    left: 0,
    minWidth: 140,
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(231, 101, 149, 0.15)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },

  // Advisory chip (inline in filters row)
  advisoryChip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FBA7BC',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginLeft: 'auto' as any,
  },
  advisoryChipText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '500',
  },

  // ── Title ──
  titleMain: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    letterSpacing: 1,
  },
  titleSub: {
    fontSize: 11,
    color: '#E76595',
    letterSpacing: 3,
    marginTop: 2,
  },

  // ── Shared dropdown item ──
  sidebarDropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
  },

  // ── Shared filter/dropdown ──
  activeFilter: {
    backgroundColor: '#E76595',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E76595',
  },
  activeFilterText: {
    color: 'white',
  },
  dropdownText: {
    fontSize: 14,
    color: '#333',
  },
  checkboxItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  // ── Search bar ──
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },

  // ── Main Content ──
  mainContent: {
    flex: 1,
  },
  mainContentInner: {
    paddingHorizontal: 28,
    paddingTop: 28,
  },

  // ── Feed header ──
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    marginLeft: 50,
  },
  feedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E76595',
    letterSpacing: 2,
  },
  feedCount: {
    fontSize: 13,
    color: '#aaa',
    marginRight: 50,
  },

  // ── Cards Grid (3 columns on wide screens) ──
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginHorizontal: 40,
  },
  monitoringCard: {
    // 3 columns with gap: approx (100% - 2*16) / 3
    // React Native web flexbox: use minWidth + flex to approximate
    flex: 1,
    minWidth: 260,
    maxWidth: 420,
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
    fontSize: 17,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
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
  cardInfo: {
    flex: 1,
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
  valueContainer: {
    alignItems: 'flex-end',
  },
  value: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
  },
  unit: {
    fontSize: 13,
    color: '#666',
    marginTop: -4,
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

  bottomSpacing: {
    height: 40,
  },
});

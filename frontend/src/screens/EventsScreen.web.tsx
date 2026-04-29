import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ViewStyle,
  Dimensions,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { TopNavigation } from "../navigation/TopNavigation";
import { gradients, palette } from "../styles/theme";

const { width: screenWidth } = Dimensions.get('window');
const isTablet = screenWidth >= 768 && screenWidth < 1200;
const isDesktop = screenWidth >= 1200;

interface EventsScreenProps {
  scrollRef?: (ref: any) => void;
}

export const EventsScreen: React.FC<EventsScreenProps> = ({ scrollRef }) => {
  const [selectedFilter, setSelectedFilter] = useState("活躍事件");
  const [selectedDistrict, setSelectedDistrict] = useState("所有區域");
  const [selectedSeverity, setSelectedSeverity] = useState("嚴重度");
  const [showFilterDropdown, setShowFilterDropdown] = useState<string | null>(
    null,
  );

  const filterOptions = {
    events: ["活躍事件", "歷史事件", "已解決事件"],
    districts: ["所有區域", "蘆竹區", "觀音區", "中壢區", "桃園區", "大園區"],
    severity: ["嚴重度", "高風險", "中等風險", "低風險"],
  };

  const allEventData = [
    {
      id: 1,
      category: "工業聚集區",
      title: "觀音中心排放",
      description: "在工業區範圍內檢測到局部 SO2 尖峰。",
      severity: "中等風險",
      status: "固定站",
      trend: "穩定中",
      exposure: "~1.2k 人",
      duration: "45分鐘 持續",
      location: "觀音區",
      healthIndex: "敏感警告",
      severityColor: palette.accentMint,
      icon: "business",
      isActive: true,
      isResolved: false,
    },
    {
      id: 2,
      category: "大氣流入",
      title: "重度 PM2.5 流入",
      description: "跨境污染物影響北部住宅區域。",
      severity: "高風險",
      status: "AI 識別",
      trend: "上升中",
      exposure: "~3.5k 人",
      duration: "2小時15分鐘 活躍",
      location: "蘆竹區",
      confidence: "98.4%",
      severityColor: palette.accentYellow,
      icon: "warning",
      isActive: true,
      isResolved: false,
    },
    {
      id: 3,
      category: "交通排放",
      title: "中壢交流道壅塞",
      description: "尖峰時段車流導致 NOx 濃度升高。",
      severity: "低風險",
      status: "固定站",
      trend: "下降中",
      exposure: "~800 人",
      duration: "1小時30分鐘 持續",
      location: "中壢區",
      healthIndex: "良好",
      severityColor: palette.accentLime,
      icon: "car",
      isActive: true,
      isResolved: false,
    },
    {
      id: 4,
      category: "工業聚集區",
      title: "大園工業區異常",
      description: "檢測到 VOCs 濃度異常升高。",
      severity: "中等風險",
      status: "AI 識別",
      trend: "已穩定",
      exposure: "~2.1k 人",
      duration: "已解決",
      location: "大園區",
      confidence: "92.1%",
      severityColor: palette.primaryMid,
      icon: "business",
      isActive: false,
      isResolved: true,
    },
    {
      id: 5,
      category: "區域性事件",
      title: "桃園市區空品惡化",
      description: "多個測站同時檢測到 PM2.5 升高。",
      severity: "高風險",
      status: "固定站",
      trend: "持平",
      exposure: "~5.8k 人",
      duration: "3小時 持續",
      location: "桃園區",
      healthIndex: "不健康",
      severityColor: palette.accentYellow,
      icon: "alert-circle",
      isActive: true,
      isResolved: false,
    },
  ];

  const getFilteredEvents = () => {
    return allEventData.filter((event) => {
      if (selectedFilter === "活躍事件" && !event.isActive) return false;
      if (selectedFilter === "已解決事件" && !event.isResolved) return false;
      if (selectedFilter === "歷史事件" && event.isActive) return false;

      if (
        selectedDistrict !== "所有區域" &&
        event.location !== selectedDistrict
      )
        return false;

      if (selectedSeverity === "高風險" && event.severity !== "高風險")
        return false;
      if (selectedSeverity === "中等風險" && event.severity !== "中等風險")
        return false;
      if (selectedSeverity === "低風險" && event.severity !== "低風險")
        return false;

      return true;
    });
  };

  const filteredEvents = getFilteredEvents();

  const eventImagePlaceholder: ViewStyle = {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: "#FFF1FF",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  };

  return (
    <LinearGradient colors={gradients.page} style={styles.container}>
      <TopNavigation title="事件庫" subtitle="INCIDENT TRACKING" />

      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScrollView}
          contentContainerStyle={styles.filterContainer}
        >
          <TouchableOpacity
            style={[
              styles.filterButton,
              showFilterDropdown === "events" && styles.activeFilter,
            ]}
            onPress={() =>
              setShowFilterDropdown(
                showFilterDropdown === "events" ? null : "events",
              )
            }
          >
            <Text
              style={[
                styles.filterText,
                showFilterDropdown === "events" && styles.activeFilterText,
              ]}
            >
              {selectedFilter}
            </Text>
            <Ionicons
              name="chevron-down"
              size={16}
              color={
                showFilterDropdown === "events"
                  ? palette.bgCard
                  : palette.primaryDeep
              }
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterButton,
              showFilterDropdown === "districts" && styles.activeFilter,
            ]}
            onPress={() =>
              setShowFilterDropdown(
                showFilterDropdown === "districts" ? null : "districts",
              )
            }
          >
            <Text
              style={[
                styles.filterText,
                showFilterDropdown === "districts" && styles.activeFilterText,
              ]}
            >
              {selectedDistrict}
            </Text>
            <Ionicons
              name="chevron-down"
              size={16}
              color={
                showFilterDropdown === "districts"
                  ? palette.bgCard
                  : palette.primaryDeep
              }
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterButton,
              showFilterDropdown === "severity" && styles.activeFilter,
            ]}
            onPress={() =>
              setShowFilterDropdown(
                showFilterDropdown === "severity" ? null : "severity",
              )
            }
          >
            <Text
              style={[
                styles.filterText,
                showFilterDropdown === "severity" && styles.activeFilterText,
              ]}
            >
              {selectedSeverity}
            </Text>
            <Ionicons
              name="filter"
              size={16}
              color={
                showFilterDropdown === "severity"
                  ? palette.bgCard
                  : palette.primaryDeep
              }
            />
          </TouchableOpacity>
        </ScrollView>

        {showFilterDropdown === "events" && (
          <View style={styles.dropdownContainer}>
            {filterOptions.events.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.dropdownItem}
                onPress={() => {
                  setSelectedFilter(option);
                  setShowFilterDropdown(null);
                }}
              >
                <Text style={styles.dropdownText}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {showFilterDropdown === "districts" && (
          <View style={styles.dropdownContainer}>
            {filterOptions.districts.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.dropdownItem}
                onPress={() => {
                  setSelectedDistrict(option);
                  setShowFilterDropdown(null);
                }}
              >
                <Text style={styles.dropdownText}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {showFilterDropdown === "severity" && (
          <View style={styles.dropdownContainer}>
            {filterOptions.severity.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.dropdownItem}
                onPress={() => {
                  setSelectedSeverity(option);
                  setShowFilterDropdown(null);
                }}
              >
                <Text style={styles.dropdownText}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={[
          styles.eventsContainer,
          isDesktop && styles.eventsContainerDesktop,
          isTablet && styles.eventsContainerTablet
        ]}>
          {filteredEvents.map((event) => (
            <View key={event.id} style={[
              styles.eventCard,
              isDesktop && styles.eventCardDesktop,
              isTablet && styles.eventCardTablet
            ]}>
              <View style={[
                eventImagePlaceholder,
                isDesktop && styles.eventImageDesktop,
                isTablet && styles.eventImageTablet
              ]}>
                <iframe
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=121.15,24.95,121.35,25.05&layer=mapnik&marker=25.0,121.25`}
                  style={{
                    width: "100%",
                    height: "100%",
                    border: "none",
                  }}
                  title={`Map of ${event.location}`}
                />
                <View style={styles.topBadges}>
                  <View
                    style={[
                      styles.severityBadge,
                      { backgroundColor: event.severityColor },
                    ]}
                  >
                    <Text style={styles.badgeText}>{event.severity}</Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <Text
                      style={[styles.badgeText, { color: palette.textMain }]}
                    >
                      {event.status}
                    </Text>
                  </View>
                </View>
                <View style={styles.bottomInfo}>
                  <Text style={styles.categoryText}>影響類別</Text>
                  <Text style={styles.categoryTitle}>{event.category}</Text>
                </View>
              </View>

              <View style={[
                styles.eventContent,
                isDesktop && styles.eventContentDesktop,
                isTablet && styles.eventContentTablet
              ]}>
                <View style={styles.eventHeader}>
                  <View style={styles.eventTitleContainer}>
                    <Text style={[
                      styles.eventTitle,
                      isDesktop && { fontSize: 18 },
                      isTablet && { fontSize: 19 }
                    ]}>{event.title}</Text>
                    <Text style={[
                      styles.eventDescription,
                      isDesktop && { fontSize: 13 },
                      isTablet && { fontSize: 13 }
                    ]}>
                      {event.description}
                    </Text>
                  </View>
                  <View style={[
                    styles.eventIcon,
                    isDesktop && { width: 40, height: 40 },
                    isTablet && { width: 44, height: 44 }
                  ]}>
                    <Ionicons
                      name={event.icon as any}
                      size={isDesktop ? 24 : isTablet ? 26 : 28}
                      color={palette.primaryDeep}
                    />
                  </View>
                </View>

                <View style={[
                  styles.detailsGrid,
                  isDesktop && { gap: 12 },
                  isTablet && { gap: 14 }
                ]}>
                  <View style={styles.detailItem}>
                    <View style={styles.detailIcon}>
                      <Ionicons
                        name="time"
                        size={isDesktop ? 16 : isTablet ? 18 : 20}
                        color={palette.textSecondary}
                      />
                    </View>
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>持續時間</Text>
                      <Text style={styles.detailValue}>{event.duration}</Text>
                    </View>
                  </View>

                  <View style={styles.detailItem}>
                    <View style={styles.detailIcon}>
                      <Ionicons
                        name="location"
                        size={isDesktop ? 16 : isTablet ? 18 : 20}
                        color={palette.textSecondary}
                      />
                    </View>
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>位置</Text>
                      <Text style={styles.detailValue}>{event.location}</Text>
                    </View>
                  </View>

                  {event.trend && (
                    <View style={styles.detailItem}>
                      <View style={styles.detailIcon}>
                        <Ionicons
                          name="trending-up"
                          size={isDesktop ? 16 : isTablet ? 18 : 20}
                          color={palette.textSecondary}
                        />
                      </View>
                      <View style={styles.detailContent}>
                        <Text style={styles.detailLabel}>趨勢</Text>
                        <Text style={styles.detailValue}>{event.trend}</Text>
                      </View>
                    </View>
                  )}

                  {event.exposure && (
                    <View style={styles.detailItem}>
                      <View style={styles.detailIcon}>
                        <Ionicons
                          name="people"
                          size={isDesktop ? 16 : isTablet ? 18 : 20}
                          color={palette.textSecondary}
                        />
                      </View>
                      <View style={styles.detailContent}>
                        <Text style={styles.detailLabel}>暴露人口</Text>
                        <Text style={styles.detailValue}>{event.exposure}</Text>
                      </View>
                    </View>
                  )}
                </View>

                <View style={styles.eventFooter}>
                  <View style={styles.confidenceContainer}>
                    <Text style={styles.confidenceLabel}>
                      {event.confidence ? "AI 信心分數" : "健康指數"}
                    </Text>
                    <Text
                      style={[
                        styles.confidenceValue,
                        isDesktop && { fontSize: 16 },
                        isTablet && { fontSize: 17 },
                        {
                          color: event.confidence
                            ? palette.primaryDeep
                            : palette.accentYellow,
                        },
                      ]}
                    >
                      {event.confidence || event.healthIndex}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      isDesktop && { paddingHorizontal: 16, paddingVertical: 10 },
                      isTablet && { paddingHorizontal: 18, paddingVertical: 11 },
                      event.confidence
                        ? styles.primaryActionButton
                        : styles.secondaryActionButton,
                    ]}
                  >
                    <Text
                      style={[
                        styles.actionButtonText,
                        isDesktop && { fontSize: 13 },
                        isTablet && { fontSize: 13 },
                        event.confidence
                          ? styles.primaryActionText
                          : styles.secondaryActionText,
                      ]}
                    >
                      {event.confidence ? "AI 證據" : "完整分析"}
                    </Text>
                    <Ionicons
                      name={event.confidence ? "analytics" : "trending-up"}
                      size={isDesktop ? 16 : isTablet ? 17 : 18}
                      color={
                        event.confidence ? palette.bgCard : palette.textMain
                      }
                    />
                  </TouchableOpacity>
                </View>
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
  container: { flex: 1 },
  scrollView: { flex: 1 },
  filterScrollView: { paddingBottom: 20 },
  filterContainer: { paddingHorizontal: 20, gap: 12 },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "rgba(255, 255, 255, 0.75)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    gap: 6,
  },
  filterText: { fontSize: 14, fontWeight: "600", color: palette.primaryDeep },
  activeFilter: { backgroundColor: palette.primaryDeep },
  activeFilterText: { color: palette.bgCard },
  dropdownContainer: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 16,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: palette.borderSoft,
  },
  dropdownItem: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(95, 83, 104, 0.15)",
  },
  dropdownText: { fontSize: 16, color: palette.textMain, fontWeight: "500" },
  
  // 事件容器 - 響應式
  eventsContainer: { 
    paddingHorizontal: 20, 
    gap: 24 
  },
  eventsContainerTablet: {
    paddingHorizontal: 40,
    gap: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  eventsContainerDesktop: {
    paddingHorizontal: 60,
    gap: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  
  // 事件卡片 - 響應式
  eventCard: {
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 32,
    overflow: "hidden",
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 5,
  },
  eventCardTablet: {
    width: '48%',
    borderRadius: 20,
    marginBottom: 16,
  },
  eventCardDesktop: {
    width: '31%',
    borderRadius: 16,
    marginBottom: 20,
    minWidth: 320,
    maxWidth: 400,
  },
  
  // 事件圖片 - 響應式
  eventImageDesktop: {
    aspectRatio: 16 / 9, // 更適合桌面的比例
  },
  eventImageTablet: {
    aspectRatio: 3 / 2,
  },
  
  topBadges: {
    position: "absolute",
    top: 16,
    left: 16,
    flexDirection: "row",
    gap: 8,
  },
  severityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "white",
    textTransform: "uppercase",
  },
  bottomInfo: {
    position: "absolute",
    bottom: 16,
    left: 16,
    zIndex: 10,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "bold",
    color: palette.textMain,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
    textShadowColor: "rgba(255, 255, 255, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  categoryTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: palette.textMain,
    lineHeight: 28,
    textShadowColor: "rgba(255, 255, 255, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  
  // 事件內容 - 響應式
  eventContent: { 
    padding: 24 
  },
  eventContentTablet: {
    padding: 20,
  },
  eventContentDesktop: {
    padding: 16,
  },
  
  eventHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  eventTitleContainer: { flex: 1, marginRight: 16 },
  eventTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: palette.textMain,
    marginBottom: 8,
  },
  eventDescription: {
    fontSize: 14,
    color: palette.textSecondary,
    lineHeight: 20,
  },
  eventIcon: {
    width: 48,
    height: 48,
    backgroundColor: palette.primarySoft,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  detailsGrid: { gap: 16 },
  detailItem: { flexDirection: "row", alignItems: "center" },
  detailIcon: {
    width: 40,
    height: 40,
    backgroundColor: "rgba(255, 51, 255, 0.1)",
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  detailContent: { flex: 1 },
  detailLabel: {
    fontSize: 12,
    color: palette.textSecondary,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  detailValue: { fontSize: 16, color: palette.textMain, fontWeight: "600" },
  eventFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
  },
  confidenceContainer: { flex: 1 },
  confidenceLabel: {
    fontSize: 12,
    color: palette.textSecondary,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  confidenceValue: { fontSize: 18, fontWeight: "bold" },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
  },
  primaryActionButton: { backgroundColor: palette.primaryDeep },
  secondaryActionButton: {
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.1)",
  },
  actionButtonText: { fontSize: 14, fontWeight: "600" },
  primaryActionText: { color: "white" },
  secondaryActionText: { color: palette.textMain },
  bottomSpacing: { height: 100 },
});

export default EventsScreen;

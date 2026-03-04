import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { TopNavigation } from "../navigation/TopNavigation";

interface EventsScreenProps {
  scrollRef?: (ref: any) => void;
}

export const EventsScreen: React.FC<EventsScreenProps> = ({ scrollRef }) => {
  const [selectedFilter, setSelectedFilter] = useState("活躍事件");
  const [selectedDistrict, setSelectedDistrict] = useState("所有區域");
  const [selectedSeverity, setSelectedSeverity] = useState("嚴重度");
  const [showFilterDropdown, setShowFilterDropdown] = useState<string | null>(null);

  const filterOptions = {
    events: ["活躍事件", "歷史事件", "已解決事件"],
    districts: ["所有區域", "蘆竹區", "觀音區", "中壢區", "桃園區", "大園區"],
    severity: ["嚴重度", "高風險", "中等風險", "低風險"]
  };

  const eventData = [
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
      severityColor: "#FFB74D",
      icon: "business",
    },
    {
      id: 2,
      category: "大氣流入",
      title: "重度 PM2.5 流入",
      description: "跨境污染物影響北部住宅區域。",
      severity: "嚴重程度",
      status: "AI 識別",
      duration: "2小時15分鐘 活躍",
      location: "蘆竹區",
      confidence: "98.4%",
      severityColor: "#E57373",
      icon: "warning",
    },
  ];

  const eventImagePlaceholder: ViewStyle = {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: "#E8E6D3",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  };

  return (
    <LinearGradient colors={["#F4F2E9", "#E8E6D3"]} style={styles.container}>
      <TopNavigation title="事件庫" subtitle="INCIDENT TRACKING" />

      <ScrollView ref={scrollRef} style={styles.scrollView} showsVerticalScrollIndicator={false}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScrollView}
        contentContainerStyle={styles.filterContainer}
      >
        <TouchableOpacity 
          style={[styles.filterButton, showFilterDropdown === 'events' && styles.activeFilter]}
          onPress={() => setShowFilterDropdown(showFilterDropdown === 'events' ? null : 'events')}
        >
          <Text style={[styles.filterText, showFilterDropdown === 'events' && styles.activeFilterText]}>
            {selectedFilter}
          </Text>
          <Ionicons name="chevron-down" size={16} color={showFilterDropdown === 'events' ? "white" : "#6A8D73"} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.filterButton, showFilterDropdown === 'districts' && styles.activeFilter]}
          onPress={() => setShowFilterDropdown(showFilterDropdown === 'districts' ? null : 'districts')}
        >
          <Text style={[styles.filterText, showFilterDropdown === 'districts' && styles.activeFilterText]}>{selectedDistrict}</Text>
          <Ionicons name="chevron-down" size={16} color={showFilterDropdown === 'districts' ? "white" : "#6A8D73"} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.filterButton, showFilterDropdown === 'severity' && styles.activeFilter]}
          onPress={() => setShowFilterDropdown(showFilterDropdown === 'severity' ? null : 'severity')}
        >
          <Text style={[styles.filterText, showFilterDropdown === 'severity' && styles.activeFilterText]}>{selectedSeverity}</Text>
          <Ionicons name="filter" size={16} color={showFilterDropdown === 'severity' ? "white" : "#6A8D73"} />
        </TouchableOpacity>
      </ScrollView>

        <View style={styles.eventsContainer}>
          {eventData.map((event) => (
            <View key={event.id} style={styles.eventCard}>
              <View style={eventImagePlaceholder}>
                <iframe
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${event.id === 1 ? '121.2,25.0,121.4,25.1' : '121.15,24.95,121.35,25.05'}&layer=mapnik&marker=${event.id === 1 ? '25.035,121.3' : '25.0,121.25'}`}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                  }}
                  title={`Map of ${event.location}`}
                />
                <View style={styles.topBadges}>
                  <View style={[styles.severityBadge, { backgroundColor: event.severityColor }]}>
                    <Text style={styles.badgeText}>{event.severity}</Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <Text style={[styles.badgeText, { color: "#333" }]}>{event.status}</Text>
                  </View>
                </View>
                <View style={styles.bottomInfo}>
                  <Text style={styles.categoryText}>影響類別</Text>
                  <Text style={styles.categoryTitle}>{event.category}</Text>
                </View>
              </View>

              <View style={styles.eventContent}>
                <View style={styles.eventHeader}>
                  <View style={styles.eventTitleContainer}>
                    <Text style={styles.eventTitle}>{event.title}</Text>
                    <Text style={styles.eventDescription}>{event.description}</Text>
                  </View>
                  <View style={styles.eventIcon}>
                    <Ionicons name={event.icon as any} size={28} color="#6ABD73" />
                  </View>
                </View>

                <View style={styles.detailsGrid}>
                  <View style={styles.detailItem}>
                    <View style={styles.detailIcon}>
                      <Ionicons name="time" size={20} color="#666" />
                    </View>
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>持續時間</Text>
                      <Text style={styles.detailValue}>{event.duration}</Text>
                    </View>
                  </View>

                  <View style={styles.detailItem}>
                    <View style={styles.detailIcon}>
                      <Ionicons name="location" size={20} color="#666" />
                    </View>
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>位置</Text>
                      <Text style={styles.detailValue}>{event.location}</Text>
                    </View>
                  </View>

                  {event.trend && (
                    <View style={styles.detailItem}>
                      <View style={styles.detailIcon}>
                        <Ionicons name="trending-up" size={20} color="#666" />
                      </View>
                      <View style={styles.detailContent}>
                        <Text style={styles.detailLabel}>趋勢</Text>
                        <Text style={styles.detailValue}>{event.trend}</Text>
                      </View>
                    </View>
                  )}

                  {event.exposure && (
                    <View style={styles.detailItem}>
                      <View style={styles.detailIcon}>
                        <Ionicons name="people" size={20} color="#666" />
                      </View>
                      <View style={styles.detailContent}>
                        <Text style={styles.detailLabel}>暴露人口</Text>
                        <Text style={styles.detailValue}>{event.exposure}</Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Bottom Action */}
                <View style={styles.eventFooter}>
                  <View style={styles.confidenceContainer}>
                    <Text style={styles.confidenceLabel}>
                      {event.confidence ? "AI 信心分數" : "健康指數"}
                    </Text>
                    <Text
                      style={[
                        styles.confidenceValue,
                        { color: event.confidence ? "#6ABD73" : "#F59E0B" },
                      ]}
                    >
                      {event.confidence || event.healthIndex}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      event.confidence
                        ? styles.primaryActionButton
                        : styles.secondaryActionButton,
                    ]}
                  >
                    <Text
                      style={[
                        styles.actionButtonText,
                        event.confidence
                          ? styles.primaryActionText
                          : styles.secondaryActionText,
                      ]}
                    >
                      {event.confidence ? "AI 證據" : "完整分析"}
                    </Text>
                    <Ionicons
                      name={event.confidence ? "analytics" : "trending-up"}
                      size={18}
                      color={event.confidence ? "white" : "#333"}
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
  filterScrollView: {
    paddingBottom: 20,
  },
  filterContainer: { paddingHorizontal: 20, gap: 12 },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.8)",
    gap: 6,
  },
  filterText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6A8D73",
  },
  activeFilterText: { color: "white" },
  activeFilter: {
    backgroundColor: "#6ABD73",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  activeFilterText: { fontSize: 14, fontWeight: "600", color: "white" },
  eventsContainer: { paddingHorizontal: 20, gap: 24 },
  eventCard: {
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 32,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 5,
  },
  mapPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  locationText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6A8D73',
  },
  topBadges: {
    position: "absolute",
    top: 16,
    left: 16,
    flexDirection: "row",
    gap: 8,
  },
  severityBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
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
  eventContent: { padding: 24 },
  eventHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 20 },
  eventTitleContainer: { flex: 1, marginRight: 16 },
  eventTitle: { fontSize: 20, fontWeight: "bold", color: "#333", marginBottom: 8 },
  eventDescription: { fontSize: 14, color: "#666", lineHeight: 20 },
  eventIcon: {
    width: 48,
    height: 48,
    backgroundColor: "rgba(106, 189, 115, 0.1)",
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  detailsGrid: { gap: 16 },
  detailItem: { flexDirection: "row", alignItems: "center" },
  detailIcon: {
    width: 40,
    height: 40,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  detailContent: { flex: 1 },
  detailLabel: {
    fontSize: 12,
    color: "#999",
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  detailValue: { fontSize: 16, color: "#333", fontWeight: "600" },
  bottomInfo: {
    position: "absolute",
    bottom: 16,
    left: 16,
    zIndex: 10,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "rgba(255, 255, 255, 0.8)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  categoryTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    lineHeight: 28,
  },
  eventFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
  },
  confidenceContainer: {
    flex: 1,
  },
  confidenceLabel: {
    fontSize: 12,
    color: "#999",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  confidenceValue: {
    fontSize: 18,
    fontWeight: "bold",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
  },
  primaryActionButton: {
    backgroundColor: "#6ABD73",
  },
  secondaryActionButton: {
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.1)",
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  primaryActionText: {
    color: "white",
  },
  secondaryActionText: {
    color: "#333",
  },
  bottomSpacing: { height: 100 },
});

export default EventsScreen;

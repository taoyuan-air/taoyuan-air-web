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

  const eventData = [
    {
      id: 1,
      category: "工業聚集區",
      title: "觀音中心排放",
      description: "在工業區範圍內檢測到局部 SO2 尖峰。",
      severity: "中等風險",
      status: "固定站",
      duration: "45分鐘 持續",
      location: "觀音區",
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
        <View style={styles.filterContainer}>
          <TouchableOpacity style={styles.activeFilter}>
            <Text style={styles.activeFilterText}>{selectedFilter}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.eventsContainer}>
          {eventData.map((event) => (
            <View key={event.id} style={styles.eventCard}>
              <View style={eventImagePlaceholder}>
                <View style={styles.mapPlaceholder}>
                  <Ionicons name="location" size={40} color="#6A8D73" />
                  <Text style={styles.locationText}>{event.location}</Text>
                </View>
                <View style={styles.topBadges}>
                  <View style={[styles.severityBadge, { backgroundColor: event.severityColor }]}>
                    <Text style={styles.badgeText}>{event.severity}</Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <Text style={[styles.badgeText, { color: "#333" }]}>{event.status}</Text>
                  </View>
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
  filterContainer: { paddingHorizontal: 20, paddingBottom: 20 },
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
  bottomSpacing: { height: 100 },
});

export default EventsScreen;

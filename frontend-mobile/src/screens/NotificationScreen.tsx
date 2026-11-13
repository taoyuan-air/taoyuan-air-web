import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

interface NotificationScreenProps {
  visible: boolean;
  onClose: () => void;
}

export const NotificationScreen: React.FC<NotificationScreenProps> = ({
  visible,
  onClose,
}) => {
  const notifications = [
    {
      id: 1,
      type: "alert",
      icon: "warning",
      iconColor: "#E76595",
      iconBg: "rgba(143, 169, 111, 0.1)",
      title: "空氣品質警報",
      subtitle: "中壢區",
      time: "2小時前",
      content: "AI 洞察：PM2.5 濃度超過 35µg/m³。檢測到局部工業排放。建議室內使用空氣清淨機。",
    },
    {
      id: 2,
      type: "health",
      icon: "fitness",
      iconColor: "#E76595",
      iconBg: "rgba(143, 169, 111, 0.1)",
      title: "健康建議",
      subtitle: "戶外活動指引",
      time: "5小時前",
      content: "AI 洞察：紫外線指數較低且空氣品質在桃園區達到最佳狀態。現在是在虎頭山步道進行有氧運動的絕佳時機。",
    },
    {
      id: 3,
      type: "system",
      icon: "refresh",
      iconColor: "#7F5A6A",
      iconBg: "rgba(85, 90, 79, 0.1)",
      title: "系統更新",
      subtitle: "版本 2.4.0 上線",
      time: "昨天",
      content: "蘆竹地區增強 3D 網格視覺化，並更新沿海風場模式的 AI 預測模型。",
    },
    {
      id: 4,
      type: "grid",
      icon: "grid",
      iconColor: "#E76595",
      iconBg: "rgba(143, 169, 111, 0.1)",
      title: "新網格啟用",
      subtitle: "龍潭監測站",
      time: "2天前",
      content: "AI 洞察：已建立即時資料同步。龍潭現在具備 500m 超高解析度的濕度和懸浮微粒追蹤功能。",
    },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <LinearGradient colors={["#FFF6F9", "#FFEAF0"]} style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#2D3129" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>系統通知</Text>
          </View>
          <View style={styles.placeholder} />
        </View>

        {/* Notifications List */}
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {notifications.map((notification) => (
            <View key={notification.id} style={styles.notificationCard}>
              <View style={styles.notificationHeader}>
                <View style={[styles.iconContainer, { backgroundColor: notification.iconBg }]}>
                  <Ionicons
                    name={notification.icon as any}
                    size={20}
                    color={notification.iconColor}
                  />
                </View>
                <View style={styles.notificationInfo}>
                  <Text style={styles.notificationTitle}>{notification.title}</Text>
                  <Text style={styles.notificationSubtitle}>{notification.subtitle}</Text>
                </View>
                <Text style={styles.notificationTime}>{notification.time}</Text>
              </View>
              <Text style={styles.notificationContent}>
                <Text style={styles.aiInsight}>AI 洞察：</Text>
                {notification.content.replace("AI 洞察：", "")}
              </Text>
            </View>
          ))}
          <View style={styles.bottomSpacing} />
        </ScrollView>
      </LinearGradient>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerContent: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#2D3129",
  },
  placeholder: {
    width: 40,
    height: 40,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 24,
  },
  notificationCard: {
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.6)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  notificationInfo: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2D3129",
    marginBottom: 2,
  },
  notificationSubtitle: {
    fontSize: 14,
    color: "#7F5A6A",
  },
  notificationTime: {
    fontSize: 12,
    color: "#E76595",
    fontWeight: "500",
  },
  notificationContent: {
    fontSize: 14,
    color: "#7F5A6A",
    lineHeight: 20,
  },
  aiInsight: {
    color: "#E76595",
    fontWeight: "bold",
  },
  bottomSpacing: {
    height: 100,
  },
});
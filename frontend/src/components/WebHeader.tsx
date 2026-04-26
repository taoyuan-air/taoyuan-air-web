import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Modal,
  Platform,
  Dimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Colors } from "../styles/theme";
import { Layout, isWeb } from "../styles/responsive";
import { SettingsScreen } from "../screens/SettingsScreen";
import { NotificationScreen } from "../screens/NotificationScreen";

const { width: screenWidth } = Dimensions.get('window');

interface WebHeaderProps {
  currentRoute?: string;
  onNavigate?: (route: string) => void;
}

const navigationItems = [
  { key: "Dashboard", label: "空氣總覽", icon: "home" },
  { key: "Map", label: "監測地圖", icon: "map" },
  { key: "Explorer", label: "數據檢索", icon: "search" },
  { key: "Events", label: "事件記錄", icon: "calendar" },
  { key: "Alerts", label: "警報通知", icon: "bell" },
];

export const WebHeader: React.FC<WebHeaderProps> = ({
  currentRoute = "Dashboard",
  onNavigate,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  if (!isWeb) return null;

  // 手機版網頁使用原本的 TopNavigation
  if (screenWidth < 768) {
    return null; // 讓手機版網頁使用 TopNavigation 組件
  }

  const isTablet = screenWidth >= 768 && screenWidth < 1200;
  const isDesktop = screenWidth >= 1200;

  return (
    <>
      <View style={[styles.header, isTablet && styles.headerTablet]}>
        <View style={[
          styles.headerContainer,
          isTablet && styles.headerContainerTablet
        ]}>
          {/* Logo 區域 */}
          <View style={styles.logoSection}>
            <Image
              source={{ uri: "/logo-air.webp" }}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.brandTitle}>Taoyuan Air</Text>
          </View>

          {/* 導航選單 */}
          <View style={[styles.navigation, isTablet && styles.navigationTablet]}>
            {navigationItems.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.navItem,
                  isTablet && styles.navItemTablet,
                  currentRoute === item.key && styles.navItemActive,
                ]}
                onPress={() => onNavigate?.(item.key)}
              >
                <Text
                  style={[
                    styles.navText,
                    isTablet && styles.navTextTablet,
                    currentRoute === item.key && styles.navTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 右側功能區 */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setShowNotifications(true)}
            >
              <Feather name="bell" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setShowSettings(true)}
            >
              <Feather name="settings" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* 設定頁面 Modal */}
      <Modal
        visible={showSettings}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSettings(false)}
      >
        <SettingsScreen onClose={() => setShowSettings(false)} />
      </Modal>

      {/* 通知頁面 */}
      <NotificationScreen
        visible={showNotifications}
        onClose={() => setShowNotifications(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  header: {
    color: "#E76595",
    backgroundColor: "#FFF6F9",
    paddingVertical: 20,
    transition: "all 0.5s",
    zIndex: 997,
  },
  headerTablet: {
    paddingVertical: 18,
  },
  headerContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    backdropFilter: "blur(8px)",
    borderRadius: 50,
    paddingVertical: 5,
    paddingHorizontal: 25,
    shadowColor: "rgba(231, 101, 149, 0.08)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    borderColor: "rgba(231, 101, 149, 0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: "auto",
    maxWidth: 1200,
  },
  headerContainerTablet: {
    marginHorizontal: 20,
    maxWidth: 900,
  },
  logoSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 200,
  },
  logo: {
    width: 36,
    height: 36,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: "600",
    color: "#E76595",
    letterSpacing: 0.5,
    paddingLeft: 5,
  },
  navigation: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  navigationTablet: {
    paddingHorizontal: 20,
  },
  navItem: {
    paddingVertical: 18,
    paddingHorizontal: 15,
    position: "relative",
  },
  navItemTablet: {
    paddingHorizontal: 10,
  },
  navItemActive: {
    // 活躍狀態由文字顏色處理
  },
  navText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#FBA7BC",
    fontFamily: Platform.select({
      web: '"Noto Sans", sans-serif',
      default: "System",
    }),
    transition: "color 0.3s ease",
  },
  navTextTablet: {
    fontSize: 14,
  },
  navTextActive: {
    color: "#E76595",
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 120,
    justifyContent: "flex-end",
    paddingRight: 15,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
    borderWidth: 1,
    borderColor: "rgba(231, 101, 149, 0.1)",
    transition: "all 0.3s ease",
  },
});

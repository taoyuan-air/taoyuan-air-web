import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { SettingsScreen } from "../screens/SettingsScreen";
import { NotificationScreen } from "../screens/NotificationScreen";
import { Colors } from "../styles/theme";

interface TopNavigationProps {
  title?: string;
  subtitle?: string;
  onMenuPress?: () => void;
  onNotificationPress?: () => void;
}

export const TopNavigation: React.FC<TopNavigationProps> = ({
  title = "Map View",
  subtitle = "REAL-TIME MONITORING",
  onMenuPress,
  onNotificationPress,
}) => {
  // 1. Hook 必須放在元件最頂層
  const { width } = useWindowDimensions();
  const [showSettings, setShowSettings] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // 2. 判斷是否為桌面版網頁（寬度大於等於 768）
  // 如果是 Web 且寬螢幕，則直接不渲染
  if (Platform.OS === "web" && width >= 768) {
    return null;
  }

  const handleMenuPress = () => {
    setShowSettings(true);
    onMenuPress?.();
  };

  const handleNotificationPress = () => {
    setShowNotifications(true);
    onNotificationPress?.();
  };

  return (
    <>
      <View style={styles.container}>
        <TouchableOpacity onPress={handleMenuPress} style={styles.iconButton}>
          <Feather name="menu" size={20} color="#666" />
        </TouchableOpacity>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        <TouchableOpacity
          onPress={handleNotificationPress}
          style={styles.iconButton}
        >
          <Feather name="bell" size={20} color="#666" />
        </TouchableOpacity>
      </View>

      <Modal
        visible={showSettings}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSettings(false)}
      >
        <SettingsScreen onClose={() => setShowSettings(false)} />
      </Modal>

      <NotificationScreen
        visible={showNotifications}
        onClose={() => setShowNotifications(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 65,
    paddingBottom: 12,
    backgroundColor: "#FFF6F9",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(231, 101, 149, 0.1)",
    shadowColor: "rgba(231, 101, 149, 0.08)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderWidth: 1,
    borderColor: "rgba(231, 101, 149, 0.1)",
  },
  titleContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  subtitle: {
    fontSize: 11,
    color: "#666",
    marginTop: 2,
    letterSpacing: 1,
    fontWeight: "500",
  },
});

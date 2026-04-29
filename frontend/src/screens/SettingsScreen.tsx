import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { GlassCard } from "../components/GlassCard";

interface SettingsScreenProps {
  onClose: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onClose }) => {
  return (
    <LinearGradient colors={["#FFF6F9", "#FFEAF0"]} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <Feather name="chevron-left" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>用戶設定</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Section */}
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>陳</Text>
            </View>
            <View style={styles.premiumBadge}>
              <Feather name="star" size={12} color="white" />
              <Text style={styles.premiumText}>PREMIUM</Text>
            </View>
          </View>
          <Text style={styles.userName}>陳曉明</Text>
          <Text style={styles.userEmail}>wei-ting.chen@taoyuan.io</Text>
        </View>

        {/* Settings Options */}
        <View style={styles.settingsSection}>
          <GlassCard style={styles.settingItem}>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View
                  style={[styles.settingIcon, { backgroundColor: "#E76595" }]}
                >
                  <Feather name="shield" size={20} color="white" />
                </View>
                <Text style={styles.settingTitle}>帳戶安全</Text>
              </View>
              <Feather name="chevron-right" size={20} color="#999" />
            </View>
          </GlassCard>

          <GlassCard style={styles.settingItem}>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View
                  style={[styles.settingIcon, { backgroundColor: "#FBA7BC" }]}
                >
                  <Feather name="user-check" size={20} color="white" />
                </View>
                <Text style={styles.settingTitle}>身份驗證</Text>
              </View>
              <Feather name="chevron-right" size={20} color="#999" />
            </View>
          </GlassCard>

          <GlassCard style={styles.settingItem}>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View
                  style={[styles.settingIcon, { backgroundColor: "#E76595" }]}
                >
                  <Feather name="heart" size={20} color="white" />
                </View>
                <View>
                  <Text style={styles.settingTitle}>健康檔案設定</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={20} color="#999" />
            </View>
          </GlassCard>

          <GlassCard style={styles.settingItem}>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View
                  style={[styles.settingIcon, { backgroundColor: "#FBA7BC" }]}
                >
                  <Feather name="bell" size={20} color="white" />
                </View>
                <Text style={styles.settingTitle}>通知偏好設定</Text>
              </View>
              <Feather name="chevron-right" size={20} color="#999" />
            </View>
          </GlassCard>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton}>
          <View style={styles.logoutIcon}>
            <Feather name="log-out" size={16} color="#E76F51" />
          </View>
          <Text style={styles.logoutText}>登出</Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
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
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  placeholder: {
    width: 40,
    height: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  profileSection: {
    alignItems: "center",
    marginBottom: 24,
    paddingTop: 20,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 20,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#D4B896",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
  },
  premiumBadge: {
    position: "absolute",
    bottom: -8,
    right: -4,
    backgroundColor: "#E76595",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
    borderWidth: 2,
    borderColor: "white",
  },
  premiumText: {
    fontSize: 10,
    color: "white",
    fontWeight: "bold",
  },
  userName: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
    marginTop: 4,
  },
  userEmail: {
    fontSize: 15,
    color: "#666",
    marginBottom: 8,
  },
  settingsSection: {
    gap: 12,
    marginBottom: 24,
  },
  settingItem: {
    padding: 0,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  settingIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  settingSubtitle: {
    fontSize: 12,
    color: "#E76595",
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: "rgba(231, 111, 81, 0.08)",
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(231, 111, 81, 0.2)",
  },
  logoutIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(231, 111, 81, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  logoutText: {
    fontSize: 14,
    color: "#E76F51",
    fontWeight: "600",
  },
});

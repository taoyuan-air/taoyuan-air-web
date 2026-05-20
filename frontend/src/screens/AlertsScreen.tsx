import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import { MobileTopAppbar } from "../navigation/MobileTopAppbar";
import { useStore } from "../store";
import { getAlerts, setScenario } from "../api";
import { PentagonRadar } from "../components/PentagonRadar";
import { CustomSwitch } from "../components/CustomSwitch";
import { Layout } from "../styles/responsive";

interface AlertsScreenProps {
  scrollRef?: (ref: any) => void;
}

export const AlertsScreen: React.FC<AlertsScreenProps> = ({ scrollRef }) => {
  const { alerts, setAlerts, selectedScenario, isLoading, setIsLoading } = useStore();
  const [activeTab, setActiveTab] = useState<"HEALTH" | "GOV">("HEALTH");
  const [healthGuardEnabled, setHealthGuardEnabled] = useState(true);
  const [thresholds, setThresholds] = useState({
    asthma: 35,
    activity: 80,
    urgency: 20,
  });
  const [govThresholds, setGovThresholds] = useState({
    industrial: 10,   
    traffic: "輕度" as "輕度" | "中管制" | "強管制" | "極強管制",  
    alert: 30,        
  });
  const getGovThresholdLabel = (type: string, value: number) => {
    switch (type) {
      case "industrial":
        return `削減 ${value}%`;
      case "traffic":
        return govThresholds.traffic; 
      case "alert":
        return `AQI > ${value}`;
      default:
        return `${value}`;
    }
  };
  const { width: windowWidth } = useWindowDimensions();
  const isMobile = windowWidth < Layout.breakpoints.mobile;

  useEffect(() => {
    loadAlerts();
  }, [selectedScenario]);

  const loadAlerts = async () => {
    setIsLoading(true);
    try {
      setScenario(selectedScenario);
      const alertsData = await getAlerts();
      setAlerts(alertsData);
    } catch (error) {
      console.error("Failed to load alerts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getThresholdLabel = (type: string, value: number) => {
    switch (type) {
      case "asthma":
        return `${value} µg/m³`;
      case "activity":
        return value > 70 ? "劇烈運動" : value > 40 ? "中等運動" : "輕度運動";
      case "urgency":
        return value < 30 ? "僅重要" : value < 70 ? "一般" : "全部";
      default:
        return `${value}`;
    }
  };

  return (
    <View style={[!isMobile && styles.webContentRow]}>

      {/* ── 左上角 Tab 按鈕（Web 版獨立在最頂端左側） ── */}
      {!isMobile && (
        <View style={styles.webTabBar}>
          <TouchableOpacity
            style={[styles.webTabBtn, activeTab === "HEALTH" && styles.webTabBtnActive]}
            onPress={() => setActiveTab("HEALTH")}
          >
            <View style={[styles.webTabDot, activeTab === "HEALTH" && styles.webTabDotActive]} />
            <Text style={[styles.webTabText, activeTab === "HEALTH" && styles.webTabTextActive]}>
              個人健康
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.webTabBtn, activeTab === "GOV" && styles.webTabBtnActive]}
            onPress={() => setActiveTab("GOV")}
          >
            <View style={[styles.webTabDot, activeTab === "GOV" && styles.webTabDotActive]} />
            <Text style={[styles.webTabText, activeTab === "GOV" && styles.webTabTextActive]}>
              治理支援
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Mobile 版 Tab（保留原有） ── */}
      {isMobile && (
        <View style={styles.tabContainer}>
          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[styles.segment, activeTab === "HEALTH" && styles.activeSegment]}
              onPress={() => setActiveTab("HEALTH")}
            >
              <Text style={[styles.segmentText, activeTab === "HEALTH" && styles.activeSegmentText]}>
                個人健康
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segment, activeTab === "GOV" && styles.activeSegment]}
              onPress={() => setActiveTab("GOV")}
            >
              <Text style={[styles.segmentText, activeTab === "GOV" && styles.activeSegmentText]}>
                治理支援
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ════════════════════════════════════════
          個人健康頁面
      ════════════════════════════════════════ */}
      {activeTab === "HEALTH" && (
        <View style={[!isMobile && styles.webTwoCol]}>

          {/* 左欄：參數調整 */}
          <View style={[!isMobile && styles.webColLeft]}>
            <View style={styles.sectionLabelRow}>
              <View style={styles.sectionDot} />
              <Text style={styles.sectionTitle}>健康守護設定</Text>
            </View>

            <View style={[styles.healthGuardCard, !isMobile && { marginHorizontal: 0 }]}>
              <View style={styles.healthGuardHeader}>
                <View>
                  <Text style={styles.healthGuardTitle}>主動健康守護</Text>
                  <Text style={styles.healthGuardSubtitle}>自訂敏感度</Text>
                </View>
                <CustomSwitch
                  value={healthGuardEnabled}
                  onValueChange={setHealthGuardEnabled}
                  trackColor={{ false: "#E0E0E0", true: "#E76595" }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.thresholdSection}>
                {/* 氣喘門檻 */}
                <View style={styles.thresholdItem}>
                  <View style={styles.thresholdHeader}>
                    <View style={styles.thresholdLabelContainer}>
                      <Ionicons name="medical" size={18} color="#E76595" />
                      <Text style={styles.thresholdLabel}>氣喘門檻</Text>
                    </View>
                    <Text style={styles.thresholdValue}>
                      {getThresholdLabel("asthma", thresholds.asthma)}
                    </Text>
                  </View>
                  <Slider
                    style={styles.slider}
                    minimumValue={0}
                    maximumValue={100}
                    value={thresholds.asthma}
                    onValueChange={(v) => setThresholds((p) => ({ ...p, asthma: Math.round(v) }))}
                    minimumTrackTintColor="#E76595"
                    maximumTrackTintColor="rgba(255,255,255,0.3)"
                    thumbTintColor="white"
                  />
                  <View style={styles.sliderLabels}>
                    <Text style={styles.sliderLabel}>嚴格</Text>
                    <Text style={styles.sliderLabel}>寬鬆</Text>
                  </View>
                </View>

                {/* 活動強度 */}
                <View style={styles.thresholdItem}>
                  <View style={styles.thresholdHeader}>
                    <View style={styles.thresholdLabelContainer}>
                      <Ionicons name="fitness" size={18} color="#E76595" />
                      <Text style={styles.thresholdLabel}>活動強度</Text>
                    </View>
                    <Text style={styles.thresholdValue}>
                      {getThresholdLabel("activity", thresholds.activity)}
                    </Text>
                  </View>
                  <Slider
                    style={styles.slider}
                    minimumValue={0}
                    maximumValue={100}
                    value={thresholds.activity}
                    onValueChange={(v) => setThresholds((p) => ({ ...p, activity: Math.round(v) }))}
                    minimumTrackTintColor="#E76595"
                    maximumTrackTintColor="rgba(255,255,255,0.3)"
                    thumbTintColor="white"
                  />
                  <View style={styles.sliderLabels}>
                    <Text style={styles.sliderLabel}>輕度</Text>
                    <Text style={styles.sliderLabel}>劇烈</Text>
                  </View>
                </View>

                {/* 通知緊急度 */}
                <View style={styles.thresholdItem}>
                  <View style={styles.thresholdHeader}>
                    <View style={styles.thresholdLabelContainer}>
                      <Ionicons name="flash" size={18} color="#E76595" />
                      <Text style={styles.thresholdLabel}>通知緊急度</Text>
                    </View>
                    <Text style={styles.thresholdValue}>
                      {getThresholdLabel("urgency", thresholds.urgency)}
                    </Text>
                  </View>
                  <Slider
                    style={styles.slider}
                    minimumValue={0}
                    maximumValue={100}
                    value={thresholds.urgency}
                    onValueChange={(v) => setThresholds((p) => ({ ...p, urgency: Math.round(v) }))}
                    minimumTrackTintColor="#E76595"
                    maximumTrackTintColor="rgba(255,255,255,0.3)"
                    thumbTintColor="white"
                  />
                  <View style={styles.sliderLabels}>
                    <Text style={styles.sliderLabel}>全部</Text>
                    <Text style={styles.sliderLabel}>緊急</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* 右欄：分析結果 */}
          <View style={[!isMobile && styles.webColRight]}>
            <View style={styles.sectionLabelRow}>
              <View style={styles.sectionDot} />
              <Text style={styles.sectionTitle}>分析結果</Text>
            </View>

            {/* AI Cards */}
            <View style={[styles.aiCardsContainer, !isMobile && { paddingHorizontal: 0, marginTop: 0 }]}>
              <View style={styles.aiCard}>
                <View style={styles.aiCardHeader}>
                  <Text style={styles.aiCardTitle}>異常偵測</Text>
                  <Text style={styles.aiCardSubtitle}>穩定指數: 92%</Text>
                </View>
                <View style={styles.radarContainer}>
                  <PentagonRadar
                    data={[0.9, 0.7, 0.8, 0.6, 0.75]}
                    labels={['化學', '粉塵', '生物', '氣體', '氣候']}
                    size={100}
                  />
                </View>
              </View>

              <View style={styles.aiCard}>
                <View style={styles.aiCardHeader}>
                  <Text style={styles.aiCardTitle}>來源歸因</Text>
                  <Text style={styles.aiCardSubtitle}>影響鄰近度</Text>
                </View>
                <View style={styles.chartContainer}>
                  <View style={styles.donutChart}>
                    <Text style={styles.donutValue}>70%</Text>
                  </View>
                </View>
                <View style={styles.legendContainer}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: "#E76595" }]} />
                    <Text style={styles.legendLabel}>工廠</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: "#7F5A6A" }]} />
                    <Text style={styles.legendLabel}>交通</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Critical Thresholds */}
            <View style={[styles.criticalSection, !isMobile && { paddingHorizontal: 0 }]}>
              <View style={styles.sectionLabelRow}>
                <View style={styles.sectionDot} />
                <Text style={styles.criticalTitle}>重要門檻</Text>
              </View>
              <View style={styles.criticalAlert}>
                <View style={styles.criticalIcon}>
                  <Ionicons name="medical" size={24} color="#F97316" />
                </View>
                <View style={styles.criticalContent}>
                  <View style={styles.criticalHeader}>
                    <Text style={styles.criticalAlertTitle}>PM2.5 注意</Text>
                    <View style={styles.activeBadge}>
                      <Text style={styles.activeBadgeText}>啟用</Text>
                    </View>
                  </View>
                  <Text style={styles.criticalDescription}>
                    中壢區濃度超過 35µg/m³ 時通知
                  </Text>
                </View>
              </View>
            </View>

            {/* AI Health Tip */}
            <View style={[styles.healthTipCard, !isMobile && { marginHorizontal: 0, marginTop: 16 }]}>
              <View style={styles.healthTipIcon}>
                <Ionicons name="bulb" size={20} color="#E76595" />
              </View>
              <View style={styles.healthTipContent}>
                <Text style={styles.healthTipTitle}>AI 健康建議</Text>
                <Text style={styles.healthTipText}>
                  觀音區晨間空氣品質連續 4 天達到最佳狀態。適合晨跑。
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* ════════════════════════════════════════
          治理支援頁面
      ════════════════════════════════════════ */}
      {activeTab === "GOV" && (
        <View style={[!isMobile && styles.webTwoCol]}>

          {/* 左欄：治理參數調整 */}
          <View style={[!isMobile && styles.webColLeft]}>
            <View style={styles.sectionLabelRow}>
              <View style={styles.sectionDot} />
              <Text style={styles.sectionTitle}>治理參數調整</Text>
            </View>

            <View style={[styles.healthGuardCard, !isMobile && { marginHorizontal: 0 }]}>
              <View style={styles.healthGuardHeader}>
                <View>
                  <Text style={styles.healthGuardTitle}>政策模擬參數</Text>
                  <Text style={styles.healthGuardSubtitle}>調整治理強度</Text>
                </View>
                <View style={styles.workbenchIcon}>
                  <Ionicons name="analytics" size={20} color="#E76595" />
                </View>
              </View>

              <View style={styles.thresholdSection}>
                {/* 工業產出削減 */}
                <View style={styles.thresholdItem}>
                  <View style={styles.thresholdHeader}>
                    <View style={styles.thresholdLabelContainer}>
                      <Ionicons name="business" size={18} color="#E76595" />
                      <Text style={styles.thresholdLabel}>工業產出汙染物削減</Text>
                    </View>
                    <Text style={styles.thresholdValue}>
                      {getGovThresholdLabel("industrial", govThresholds.industrial)}
                    </Text>
                  </View>
                  <Slider
                    style={styles.slider}
                    minimumValue={0}
                    maximumValue={50}
                    value={govThresholds.industrial}
                    onValueChange={(v) => setGovThresholds((p) => ({ ...p, industrial: Math.round(v) }))}
                    minimumTrackTintColor="#E76595"
                    maximumTrackTintColor="rgba(255,255,255,0.3)"
                    thumbTintColor="white"
                  />
                  <View style={styles.sliderLabels}>
                    <Text style={styles.sliderLabel}>0%</Text>
                    <Text style={styles.sliderLabel}>50%</Text>
                  </View>
                </View>

                {/* 交通管制強度 */}
                <View style={styles.thresholdItem}>
                  <View style={styles.thresholdHeader}>
                    <View style={styles.thresholdLabelContainer}>
                      <Ionicons name="car" size={18} color="#3B82F6" />
                      <Text style={styles.thresholdLabel}>交通管制強度</Text>
                    </View>
                    <Text style={[styles.thresholdValue, { color: "#3B82F6" }]}>
                      {govThresholds.traffic}
                    </Text>
                  </View>
                  <View style={styles.trafficOptions}>
                    {(["輕度", "中管制", "強管制", "極強管制"] as const).map((option) => (
                      <TouchableOpacity
                        key={option}
                        style={[
                          styles.trafficOption,
                          govThresholds.traffic === option && styles.trafficOptionActive,
                        ]}
                        onPress={() => setGovThresholds((p) => ({ ...p, traffic: option }))}
                      >
                        <Text style={[
                          styles.trafficOptionText,
                          govThresholds.traffic === option && styles.trafficOptionTextActive,
                        ]}>
                          {option}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* 公眾警報門檻 */}
                <View style={styles.thresholdItem}>
                  <View style={styles.thresholdHeader}>
                    <View style={styles.thresholdLabelContainer}>
                      <Ionicons name="megaphone" size={18} color="#F97316" />
                      <Text style={styles.thresholdLabel}>公眾警報門檻</Text>
                    </View>
                    <Text style={[styles.thresholdValue, { color: "#F97316" }]}>
                      {getGovThresholdLabel("alert", govThresholds.alert)}
                    </Text>
                  </View>
                  <Slider
                    style={styles.slider}
                    minimumValue={0}
                    maximumValue={200}
                    value={govThresholds.alert}
                    onValueChange={(v) => setGovThresholds((p) => ({ ...p, alert: Math.round(v) }))}
                    minimumTrackTintColor="#F97316"
                    maximumTrackTintColor="rgba(255,255,255,0.3)"
                    thumbTintColor="white"
                  />
                  <View style={styles.sliderLabels}>
                    <Text style={styles.sliderLabel}>AQI 0</Text>
                    <Text style={styles.sliderLabel}>AQI 200</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* 右欄：治理分析結果 */}
          <View style={[!isMobile && styles.webColRight]}>
            <View style={styles.sectionLabelRow}>
              <View style={styles.sectionDot} />
              <Text style={styles.sectionTitle}>治理分析結果</Text>
            </View>

            {/* 區域影響矩陣 — 兩個獨立小卡 */}
            <View style={[styles.aiCardsContainer, !isMobile && { paddingHorizontal: 0, marginTop: 0 }]}>
              {/* 異常偵測 */}
              <View style={styles.aiCard}>
                <View style={styles.aiCardHeader}>
                  <Text style={styles.aiCardTitle}>異常偵測</Text>
                  <Text style={styles.aiCardSubtitle}>穩定指數: 85%</Text>
                </View>
                <View style={styles.radarContainer}>
                  <PentagonRadar
                    data={[0.8, 0.6, 0.7, 0.9, 0.5]}
                    labels={['化學', '粉塵', '生物', '氣體', '氣候']}
                    size={110}
                  />
                </View>
              </View>

              {/* 來源歸因 */}
              <View style={styles.aiCard}>
                <View style={styles.aiCardHeader}>
                  <Text style={styles.aiCardTitle}>來源歸因</Text>
                  <Text style={styles.aiCardSubtitle}>區域影響鄰近度</Text>
                </View>
                <View style={styles.chartContainer}>
                  <View style={styles.donutChart}>
                    <Text style={styles.donutValue}>70%</Text>
                  </View>
                </View>
                <View style={styles.legendContainer}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: "#E76595" }]} />
                    <Text style={styles.legendLabel}>工業</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: "#7F5A6A" }]} />
                    <Text style={styles.legendLabel}>交通</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* 政策模擬結果 */}
            <View style={[styles.policyCard, !isMobile && { marginHorizontal: 0, marginTop: 16 }]}>
              <View style={styles.policyHeader}>
                <Text style={styles.policyTitle}>政策模擬結果</Text>
                <Text style={styles.policyTarget}>-{govThresholds.industrial}% 工業 · AQI 目標</Text>
              </View>
              <View style={styles.policyContent}>
                <Text style={styles.policyLabel}>工業產出削減</Text>
                <Text style={styles.policyValue}>{govThresholds.industrial}%</Text>
              </View>
              <View style={styles.outcomeSection}>
                <Text style={styles.outcomeLabel}>預估結果</Text>
                <Text style={styles.outcomeText}>
                  大園區 48 小時內預計改善 {Math.round(govThresholds.industrial * 0.8)}%
                </Text>
              </View>
            </View>

            {/* AI 策略推薦 */}
            <View style={[styles.strategySection, !isMobile && { paddingHorizontal: 0, marginTop: 16 }]}>
              <View style={styles.sectionLabelRow}>
                <View style={styles.sectionDot} />
                <Text style={styles.strategyTitle}>AI 策略推薦</Text>
              </View>

              <View style={styles.strategyCard}>
                <View style={styles.strategyIcon}>
                  <Ionicons name="business" size={20} color="#E76595" />
                </View>
                <View style={styles.strategyContent}>
                  <View style={styles.strategyHeader}>
                    <Text style={styles.strategyItemTitle}>工業管制</Text>
                    <View style={styles.priorityBadge}>
                      <Text style={styles.priorityText}>高優先</Text>
                    </View>
                  </View>
                  <Text style={styles.strategyDescription}>
                    建議觀音工業區明日活動削減 {govThresholds.industrial}%，因預測風向停滯將持續至明日。
                  </Text>
                </View>
              </View>

              <View style={styles.strategyCard}>
                <View style={[styles.strategyIcon, { backgroundColor: "rgba(59,130,246,0.1)" }]}>
                  <Ionicons name="car" size={20} color="#3B82F6" />
                </View>
                <View style={styles.strategyContent}>
                  <View style={styles.strategyHeader}>
                    <Text style={styles.strategyItemTitle}>交通分流</Text>
                    <View style={[styles.priorityBadge, { backgroundColor: "rgba(59,130,246,0.2)" }]}>
                      <Text style={[styles.priorityText, { color: "#1D4ED8" }]}>例行</Text>
                    </View>
                  </View>
                  <Text style={styles.strategyDescription}>
                    優化中壢區晚間號誌時序，預防晚間尖峰時段 NO2 累積。
                  </Text>
                </View>
              </View>

              <View style={styles.strategyCard}>
                <View style={[styles.strategyIcon, { backgroundColor: "rgba(249,115,22,0.1)" }]}>
                  <Ionicons name="megaphone" size={20} color="#F97316" />
                </View>
                <View style={styles.strategyContent}>
                  <View style={styles.strategyHeader}>
                    <Text style={styles.strategyItemTitle}>公眾健康通知</Text>
                    <View style={[styles.priorityBadge, { backgroundColor: "rgba(249,115,22,0.2)" }]}>
                      <Text style={[styles.priorityText, { color: "#C2410C" }]}>建議</Text>
                    </View>
                  </View>
                  <Text style={styles.strategyDescription}>
                    門檻 AQI {'>'} {govThresholds.alert} 時，針對中壢區發布「低暴露」窗口警示給年長居民。
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      )}

      <View style={styles.bottomSpacing} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  tabContainer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  segmentedControl: {
    flexDirection: "row",
    padding: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.4)",
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 12,
  },
  activeSegment: {
    backgroundColor: "white",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "rgba(85, 90, 79, 0.6)",
    textTransform: "uppercase",
  },
  activeSegmentText: {
    color: "#2D3129",
  },
  healthGuardCard: {
    marginHorizontal: 24,
    marginTop: 8,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.6)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  healthGuardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 32,
  },
  healthGuardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2D3129",
  },
  healthGuardSubtitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#7F5A6A",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginTop: 2,
  },
  thresholdSection: {
    gap: 32,
  },
  thresholdItem: {
    gap: 12,
  },
  thresholdHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  thresholdLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  thresholdLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#2D3129",
  },
  thresholdValue: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#E76595",
  },
  slider: {
    width: "100%",
    height: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  sliderLabel: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#7F5A6A",
    textTransform: "uppercase",
  },
  aiCardsContainer: {
    flexDirection: "row",
    paddingHorizontal: 24,
    marginTop: 24,
    gap: 16,
  },
  aiCard: {
    flex: 1,
    height: 200,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.6)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    justifyContent: "space-between",
  },
  aiCardHeader: {
    gap: 4,
  },
  aiCardTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#2D3129",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  aiCardSubtitle: {
    fontSize: 10,
    color: "#7F5A6A",
  },
  radarContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  chartContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  donutChart: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 12,
    borderColor: "rgba(255, 255, 255, 0.3)",
    borderTopColor: "#E76595",
    borderRightColor: "#E76595",
    borderBottomColor: "#7F5A6A",
    alignItems: "center",
    justifyContent: "center",
  },
  donutValue: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#2D3129",
  },
  legendContainer: {
    gap: 4,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendLabel: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#7F5A6A",
    textTransform: "uppercase",
  },
  criticalSection: {
    paddingHorizontal: 24,
    marginTop: 24,
    gap: 12,
  },
  criticalTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#7F5A6A",
    textTransform: "uppercase",
    letterSpacing: 2,
    paddingHorizontal: 4,
  },
  criticalAlert: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.6)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    alignItems: "center",
    gap: 16,
  },
  criticalIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(249, 115, 22, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(249, 115, 22, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  criticalContent: {
    flex: 1,
  },
  criticalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  criticalAlertTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#2D3129",
  },
  activeBadge: {
    backgroundColor: "rgba(249, 115, 22, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#C2410C",
    textTransform: "uppercase",
  },
  criticalDescription: {
    fontSize: 12,
    color: "#7F5A6A",
    lineHeight: 16,
  },
  healthTipCard: {
    flexDirection: "row",
    marginHorizontal: 24,
    marginTop: 24,
    backgroundColor: "rgba(248, 208, 218, 0.1)",
    borderWidth: 2,
    borderColor: "rgba(248, 208, 218, 0.2)",
    borderRadius: 24,
    padding: 20,
    alignItems: "flex-start",
    gap: 16,
  },
  healthTipIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: "rgba(248, 208, 218, 0.1)",
  },
  healthTipContent: {
    flex: 1,
  },
  healthTipTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#7F5A6A",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  healthTipText: {
    fontSize: 14,
    color: "#2D3129",
    lineHeight: 18,
    fontWeight: "500",
  },
  bottomSpacing: {
    height: 100,
  },
  workbenchCard: {
    marginHorizontal: 24,
    marginTop: 8,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.6)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  workbenchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  workbenchTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2D3129",
  },
  workbenchSubtitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#7F5A6A",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginTop: 2,
  },
  workbenchIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(231, 101, 149, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  analysisSection: {
    gap: 16,
  },
  analysisRow: {
    flexDirection: "row",
    gap: 16,
  },
  analysisItem: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  analysisLabel: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#7F5A6A",
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  policyCard: {
    marginHorizontal: 24,
    marginTop: 16,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.6)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  policyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  policyTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2D3129",
  },
  policyTarget: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#E76595",
  },
  policyContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  policyLabel: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#7F5A6A",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  policyValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2D3129",
  },
  outcomeSection: {
    gap: 4,
  },
  outcomeLabel: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#E76595",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  outcomeText: {
    fontSize: 12,
    color: "#7F5A6A",
    lineHeight: 16,
  },
  strategySection: {
    paddingHorizontal: 24,
    marginTop: 24,
    gap: 12,
  },
  strategyTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#7F5A6A",
    textTransform: "uppercase",
    letterSpacing: 2,
    paddingHorizontal: 4,
  },
  strategyCard: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.6)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    alignItems: "flex-start",
    gap: 12,
  },
  strategyIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(231, 101, 149, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  strategyContent: {
    flex: 1,
  },
  strategyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  strategyItemTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#2D3129",
  },
  priorityBadge: {
    backgroundColor: "rgba(231, 101, 149, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  priorityText: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#7F5A6A",
    textTransform: "uppercase",
  },
  strategyDescription: {
    fontSize: 12,
    color: "#7F5A6A",
    lineHeight: 16,
  },
  webContainer: {
    backgroundColor: '#FFF6F9',
  },

  // ── Web Tab Bar（左上角兩個按鈕）──
  webTabBar: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 10,
    paddingTop: 28,
    paddingBottom: 20,
    width: "100%",  // 佔滿整行，讓下面的 webTwoCol 從左排列
  },
  webTabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.52)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    shadowColor: "rgba(180,140,160,0.14)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  webTabBtnActive: {
    backgroundColor: "rgba(212,86,122,0.12)",
    borderColor: "rgba(212,86,122,0.30)",
  },
  webTabDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(180,140,160,0.30)",
  },
  webTabDotActive: {
    backgroundColor: "#D4567A",
  },
  webTabText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#b0a0b8",
    letterSpacing: 0.3,
  },
  webTabTextActive: {
    color: "#D4567A",
  },

  // ── Web 頁面主結構 ──
  webContentRow: {
    flexDirection: "column",   // Tab Bar 佔第一行，內容佔第二行
    paddingHorizontal: 40,
    paddingBottom: 28,
  },
  webTwoCol: {
    flexDirection: "row",
    gap: 20,
    alignItems: "flex-start",
    marginTop: 8,
  },
  webColLeft: {
    flex: 1,
  },
  webColRight: {
    flex: 1.7,
  },

  // ── Section 標題列（玫瑰色小豎條） ──
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 12,
    marginLeft: 10,
  },
  sectionDot: {
    width: 3,
    height: 14,
    backgroundColor: "#D4567A",
    borderRadius: 2,
    shadowColor: "rgba(212,86,122,0.22)",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1a1220",
    letterSpacing: 0.2,
  },
  trafficOptions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  trafficOption: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
  },
  trafficOptionActive: {
    backgroundColor: "rgba(59,130,246,0.12)",
    borderColor: "rgba(59,130,246,0.35)",
  },
  trafficOptionText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#7F5A6A",
  },
  trafficOptionTextActive: {
    color: "#3B82F6",
  },
});

export default AlertsScreen;

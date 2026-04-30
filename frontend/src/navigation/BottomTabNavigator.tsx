import React, { useRef } from "react";
import {
  BottomTabBarProps,
  createBottomTabNavigator,
} from "@react-navigation/bottom-tabs";
import {
  TouchableOpacity,
  View,
  StyleSheet,
  Text,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { DashboardScreen } from "../screens/DashboardScreen.web";
import { MapScreen } from "../screens/MapScreen";
import { ExplorerScreen } from "../screens/ExplorerScreen";
import { EventsScreen } from "../screens/EventsScreen";
import { AlertsScreen } from "../screens/AlertsScreen";
import { Logo } from "../components/Logo";
import { palette, elevation } from "../styles/theme";

const Tab = createBottomTabNavigator();

const ROUTE_META: Record<
  string,
  { label: string; icon: keyof typeof Feather.glyphMap }
> = {
  Dashboard: { label: "總覽", icon: "home" },
  Map: { label: "地圖", icon: "map" },
  Explorer: { label: "檢索", icon: "search" },
  Events: { label: "事件", icon: "calendar" },
  Alerts: { label: "警報", icon: "bell" },
};

const WebTopBar: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
  return (
    <View style={styles.webTopBarWrap}>
      <View style={styles.webTopBarBrand}>
        <Logo size="large" />
        <View style={styles.webTitleBlock}>
          <Text style={styles.webBrandTitle}>Taoyuan Air</Text>
          <Text style={styles.webBrandSub}>Air Quality Monitoring</Text>
        </View>
      </View>

      <View style={styles.webTopTabs}>
        {state.routes.map((route, index) => {
          const meta = ROUTE_META[route.name] ?? {
            label: route.name,
            icon: "circle" as const,
          };
          const isFocused = state.index === index;

          return (
            <TouchableOpacity
              key={route.key}
              style={[
                styles.webTopTabButton,
                isFocused && styles.webTopTabButtonActive,
              ]}
              onPress={() => navigation.navigate(route.name)}
            >
              <Feather
                name={meta.icon}
                size={16}
                color={isFocused ? palette.bgCard : palette.textSecondary}
              />
              <Text
                style={[
                  styles.webTopTabText,
                  isFocused && styles.webTopTabTextActive,
                ]}
              >
                {meta.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export const BottomTabNavigator: React.FC = () => {
  const scrollRefs = useRef<{ [key: string]: any }>({});
  const lastTapTime = useRef<{ [key: string]: number }>({});
  const webTabBarProps =
    Platform.OS === "web"
      ? { tabBar: (props: BottomTabBarProps) => <WebTopBar {...props} /> }
      : {};

  const handleTabPress = (
    routeName: string,
    navigate?: (name: string) => void,
  ) => {
    const now = Date.now();
    const lastTap = lastTapTime.current[routeName] || 0;

    if (navigate) {
      navigate(routeName);
    }

    setTimeout(() => {
      if (scrollRefs.current[routeName]) {
        scrollRefs.current[routeName].scrollTo({ y: 0, animated: true });
      }
    }, 100);

    if (now - lastTap < 300) {
      setTimeout(() => {
        if (scrollRefs.current[routeName]) {
          scrollRefs.current[routeName].scrollTo({ y: 0, animated: true });
        }
      }, 200);
    }

    lastTapTime.current[routeName] = now;
  };

  return (
    <Tab.Navigator
      {...webTabBarProps}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarPosition: Platform.OS === "web" ? "top" : "bottom",
        tabBarIcon: ({ focused }) => {
          const iconName = ROUTE_META[route.name]?.icon ?? "circle";
          return (
            <Feather
              name={iconName}
              size={24}
              color={focused ? palette.primaryDeep : palette.textSecondary}
            />
          );
        },
        tabBarActiveTintColor: palette.primaryDeep,
        tabBarInactiveTintColor: palette.textSecondary,
        tabBarStyle:
          Platform.OS === "web"
            ? { display: "none" }
            : {
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 90,
                backgroundColor: palette.bgBase,
                paddingBottom: 30,
                paddingTop: 10,
                elevation: 8,
                shadowColor: palette.shadow,
                shadowOffset: { width: 0, height: -2 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
                borderTopWidth: 1,
                borderTopColor: palette.borderSoft,
              },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "500",
          marginTop: 4,
        },
        tabBarItemStyle: {
          paddingTop: 5,
        },
        sceneContainerStyle:
          Platform.OS === "web" ? styles.webScene : undefined,
      })}
    >
      <Tab.Screen
        name="Dashboard"
        options={({ navigation }) => ({
          tabBarLabel: ROUTE_META.Dashboard.label,
          tabBarButton: (props) => (
            <TouchableOpacity
              {...props}
              onPress={() => handleTabPress("Dashboard", navigation.navigate)}
            />
          ),
        })}
      >
        {() => (
          <DashboardScreen
            scrollRef={(ref: any) => {
              scrollRefs.current.Dashboard = ref;
            }}
          />
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Map"
        options={({ navigation }) => ({
          tabBarLabel: ROUTE_META.Map.label,
          tabBarButton: (props) => (
            <TouchableOpacity
              {...props}
              onPress={() => handleTabPress("Map", navigation.navigate)}
            />
          ),
        })}
      >
        {() => (
          <MapScreen
            scrollRef={(ref: any) => {
              scrollRefs.current.Map = ref;
            }}
          />
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Explorer"
        options={({ navigation }) => ({
          tabBarLabel: ROUTE_META.Explorer.label,
          tabBarButton: (props) => (
            <TouchableOpacity
              {...props}
              onPress={() => handleTabPress("Explorer", navigation.navigate)}
            />
          ),
        })}
      >
        {() => (
          <ExplorerScreen
            scrollRef={(ref: any) => {
              scrollRefs.current.Explorer = ref;
            }}
          />
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Events"
        options={({ navigation }) => ({
          tabBarLabel: ROUTE_META.Events.label,
          tabBarButton: (props) => (
            <TouchableOpacity
              {...props}
              onPress={() => handleTabPress("Events", navigation.navigate)}
            />
          ),
        })}
      >
        {() => (
          <EventsScreen
            scrollRef={(ref: any) => {
              scrollRefs.current.Events = ref;
            }}
          />
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Alerts"
        options={({ navigation }) => ({
          tabBarLabel: ROUTE_META.Alerts.label,
          tabBarButton: (props) => (
            <TouchableOpacity
              {...props}
              onPress={() => handleTabPress("Alerts", navigation.navigate)}
            />
          ),
        })}
      >
        {() => (
          <AlertsScreen
            scrollRef={(ref: any) => {
              scrollRefs.current.Alerts = ref;
            }}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  webTopBarWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: palette.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderSoft,
    ...elevation.card,
  },
  webTopBarBrand: {
    flexDirection: "row",
    alignItems: "center",
  },
  webTitleBlock: {
    marginLeft: 10,
  },
  webBrandTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: palette.textMain,
  },
  webBrandSub: {
    fontSize: 12,
    color: palette.textSecondary,
    marginTop: 2,
    letterSpacing: 0.6,
  },
  webTopTabs: {
    flexDirection: "row",
    alignItems: "center",
  },
  webTopTabButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginLeft: 8,
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
    borderWidth: 1,
    borderColor: palette.borderSoft,
  },
  webTopTabButtonActive: {
    backgroundColor: palette.primaryDeep,
    borderColor: palette.primaryDeep,
  },
  webTopTabText: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: "600",
    color: palette.textMain,
  },
  webTopTabTextActive: {
    color: palette.bgCard,
  },
  webScene: {
    backgroundColor: palette.bgBase,
  },
});

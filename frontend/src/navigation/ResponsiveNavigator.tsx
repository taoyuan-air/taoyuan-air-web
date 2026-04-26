import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { Colors } from '../styles/theme';
import { Layout, isWeb } from '../styles/responsive';
import { WebHeader } from '../components/WebHeader';

import { DashboardScreen } from '../screens/DashboardScreen';
import { ExplorerScreen } from '../screens/ExplorerScreen';
import { EventsScreen } from '../screens/EventsScreen';
import { AlertsScreen } from '../screens/AlertsScreen';

// 根據平台導入不同的 MapScreen
const MapScreen = isWeb 
  ? require('../screens/MapScreen.web').MapScreen
  : require('../screens/MapScreen').MapScreen;

const Tab = createBottomTabNavigator();

export const ResponsiveNavigator: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState('Dashboard');

  const handleWebNavigation = (route: string) => {
    setCurrentRoute(route);
  };

  const renderCurrentScreen = () => {
    switch (currentRoute) {
      case 'Dashboard': return <DashboardScreen />;
      case 'Map': return <MapScreen />;
      case 'Explorer': return <ExplorerScreen />;
      case 'Events': return <EventsScreen />;
      case 'Alerts': return <AlertsScreen />;
      default: return <DashboardScreen />;
    }
  };

  if (isWeb) {
    // Web 版本：使用頂部導航 + 內容區域
    return (
      <View style={styles.webContainer}>
        <WebHeader 
          currentRoute={currentRoute} 
          onNavigate={handleWebNavigation} 
        />
        <View style={styles.webContent}>
          {renderCurrentScreen()}
        </View>
      </View>
    );
  }

  // 移動版本：保持原有的底部標籤導航
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, size }) => {
          let iconName: keyof typeof Feather.glyphMap;
          switch (route.name) {
            case 'Dashboard': iconName = 'home'; break;
            case 'Map': iconName = 'map'; break;
            case 'Explorer': iconName = 'search'; break;
            case 'Events': iconName = 'calendar'; break;
            case 'Alerts': iconName = 'bell'; break;
            default: iconName = 'circle';
          }
          return (
            <Feather 
              name={iconName} 
              size={24} 
              color={focused ? Colors.primary : Colors.textMuted} 
            />
          );
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: Layout.tabBarHeight,
          backgroundColor: Colors.surface,
          paddingBottom: 30,
          paddingTop: 10,
          elevation: 8,
          shadowColor: Colors.shadow,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          borderTopWidth: 1,
          borderTopColor: Colors.borderLight,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
          marginTop: 4,
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ tabBarLabel: '總覽' }} />
      <Tab.Screen name="Map" component={MapScreen} options={{ tabBarLabel: '地圖' }} />
      <Tab.Screen name="Explorer" component={ExplorerScreen} options={{ tabBarLabel: '檢索' }} />
      <Tab.Screen name="Events" component={EventsScreen} options={{ tabBarLabel: '事件' }} />
      <Tab.Screen name="Alerts" component={AlertsScreen} options={{ tabBarLabel: '警報' }} />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  webContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  webContent: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
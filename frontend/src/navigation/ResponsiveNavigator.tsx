import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { Colors } from '../styles/theme';
import { Layout, isWeb } from '../styles/responsive';
import { WebHeader } from '../components/WebHeader';
import { DashboardScreen } from '../screens/DashboardScreen.web';
import { ExplorerScreen } from '../screens/ExplorerScreen';
import { AlertsScreen } from '../screens/AlertsScreen';
import { DashboardScreenMobile } from '../screens';

// 根據平台和螢幕大小導入不同的組件
const MapScreen = isWeb 
  ? require('../screens/MapScreen.web').MapScreen
  : require('../screens/MapScreen').MapScreen;

// EventsScreen 也需要根據螢幕大小選擇
const getEventsScreen = (useMobileLayout: boolean) => {
  if (isWeb && !useMobileLayout) {
    return require('../screens/EventsScreen.web').EventsScreen;
  }
  return require('../screens/EventsScreen').EventsScreen;
};

// 為手機版網頁取得正確的 MapScreen
const getMobileMapScreen = () => {
  if (isWeb) {
    // 手機版網頁使用手機版 MapScreen
    return require('../screens/MapScreen').MapScreen;
  }
  return require('../screens/MapScreen').MapScreen;
};

const Tab = createBottomTabNavigator();

export const ResponsiveNavigator: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState('Dashboard');
  const [screenWidth, setScreenWidth] = useState(Dimensions.get('window').width);

  // 監聽螢幕尺寸變化
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setScreenWidth(window.width);
    });

    return () => subscription?.remove();
  }, []);

  // 判斷是否使用手機版佈局（螢幕寬度小於 768px 時使用手機版）
  const useMobileLayout = !isWeb || screenWidth < 768;

  const handleWebNavigation = (route: string) => {
    setCurrentRoute(route);
  };

  const renderCurrentScreen = () => {
    const EventsScreen = getEventsScreen(useMobileLayout);
    const MobileMapScreen = getMobileMapScreen();
    
    switch (currentRoute) {
      case 'Dashboard': return useMobileLayout ? <DashboardScreenMobile /> : <DashboardScreen />;
      case 'Map': return useMobileLayout ? <MobileMapScreen /> : <MapScreen />;
      case 'Explorer': return <ExplorerScreen />;
      case 'Events': return <EventsScreen />;
      case 'Alerts': return <AlertsScreen />;
    }
  };

  if (isWeb && !useMobileLayout) {
    // 網頁版本（螢幕寬度 >= 768px）：使用頂部導航 + 內容區域
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

  // 手機版本或網頁版小螢幕：使用底部標籤導航
  return (
    <View style={styles.mobileContainer}>
      <Tab.Navigator
        initialRouteName="Dashboard"
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
        <Tab.Screen 
          name="Dashboard" 
          component={DashboardScreen} 
          options={{ tabBarLabel: '總覽' }} 
        />
        <Tab.Screen 
          name="Map" 
          children={() => {
            const MobileMapScreen = getMobileMapScreen();
            return <MobileMapScreen />;
          }} 
          options={{ tabBarLabel: '地圖' }} 
        />
        <Tab.Screen 
          name="Explorer" 
          component={ExplorerScreen} 
          options={{ tabBarLabel: '檢索' }} 
        />
        <Tab.Screen 
          name="Events" 
          children={() => {
            const EventsScreen = getEventsScreen(useMobileLayout);
            return <EventsScreen />;
          }} 
          options={{ tabBarLabel: '事件' }} 
        />
        <Tab.Screen 
          name="Alerts" 
          component={AlertsScreen} 
          options={{ tabBarLabel: '警報' }} 
        />
      </Tab.Navigator>
    </View>
  );
};

const styles = StyleSheet.create({
  webContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: 10,
  },
  webContent: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: 100,
  },
  mobileContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
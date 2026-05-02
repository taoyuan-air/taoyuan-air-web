import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { Colors } from '../styles/theme';
import { Layout, isWeb } from '../styles/responsive';
import { WebHeader } from '../components/WebHeader';


import { DashboardScreenMobile } from '../screens/DashboardScreenMobile';
import { DashboardScreen } from '../screens/DashboardScreen.web';
import { MapScreen }       from '../screens/MapScreen';          // → MapScreen.web on web
import { EventsScreen }    from '../screens/EventsScreen';       // → EventsScreen.web on web
import { ExplorerScreen }  from '../screens/ExplorerScreen';
import { AlertsScreen }    from '../screens/AlertsScreen';

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

  // isWeb + 寬度 >= Layout.breakpoints.mobile → 使用頂部導航（Web 版） 
  // 否則使用底部標籤導航（Mobile 版） 
  const useWebLayout = isWeb && screenWidth >= Layout.breakpoints.mobile;

  // ── Web 版：頂部導航 ──────────────────────────────────────────
  if (useWebLayout) {
    const renderScreen = () => {
      switch (currentRoute) {
        case 'Dashboard': return <DashboardScreen/>;
        case 'Map':       return <MapScreen />;
        case 'Explorer':  return <ExplorerScreen />;
        case 'Events':    return <EventsScreen />;
        case 'Alerts':    return <AlertsScreen />;
        default:          return <DashboardScreen />;
      }
    };

    return (
      <View style={styles.webContainer}>
        <WebHeader
          currentRoute={currentRoute}
          onNavigate={setCurrentRoute}
        />
        <View style={styles.webContent}>
          {renderScreen()}
        </View>
      </View>
    );
  }

  // ── Mobile 版：底部標籤導航 ───────────────────────────────────
  return (
    <View style={styles.mobileContainer}>
      <Tab.Navigator
        initialRouteName="Dashboard"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ focused }) => {
            const icons: Record<string, keyof typeof Feather.glyphMap> = {
              Dashboard: 'home',
              Map:       'map',
              Explorer:  'search',
              Events:    'calendar',
              Alerts:    'bell',
            };
            return (
              <Feather
                name={icons[route.name] ?? 'circle'}
                size={24}
                color={focused ? Colors.primary : Colors.textMuted}
              />
            );
          },
          tabBarActiveTintColor:   Colors.primary,
          tabBarInactiveTintColor: Colors.textMuted,
          tabBarStyle: {
            position:        'absolute',
            bottom:          0,
            left:            0,
            right:           0,
            height:          Layout.tabBarHeight,
            backgroundColor: Colors.surface,
            paddingBottom:   30,
            paddingTop:      10,
            elevation:       8,
            shadowColor:     Colors.shadow,
            shadowOffset:    { width: 0, height: -2 },
            shadowOpacity:   0.15,
            shadowRadius:    12,
            borderTopWidth:  1,
            borderTopColor:  Colors.borderLight,
          },
          tabBarLabelStyle: {
            fontSize:   12,
            fontWeight: '500',
            marginTop:  4,
          },
        })}
      >
        <Tab.Screen name="Dashboard" component={DashboardScreenMobile} options={{ tabBarLabel: '總覽' }} />
        <Tab.Screen name="Map"       component={MapScreen}       options={{ tabBarLabel: '地圖' }} />
        <Tab.Screen name="Explorer"  component={ExplorerScreen}  options={{ tabBarLabel: '檢索' }} />
        <Tab.Screen name="Events"    component={EventsScreen}    options={{ tabBarLabel: '事件' }} />
        <Tab.Screen name="Alerts"    component={AlertsScreen}    options={{ tabBarLabel: '警報' }} />
      </Tab.Navigator>
    </View>
  );
};

const styles = StyleSheet.create({
  webContainer: {
    flex:            1,
    backgroundColor: Colors.background,
    paddingTop:      10,
  },
  webContent: {
    flex:            1,
    backgroundColor: Colors.background,
    paddingTop:      100,   // 為 WebHeader 留空間
  },
  mobileContainer: {
    flex:            1,
    backgroundColor: Colors.background,
  },
});

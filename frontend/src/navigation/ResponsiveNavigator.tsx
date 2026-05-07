import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Layout, isWeb } from '../styles/responsive';
import { WebTopNavigator } from './WebTopNavigator';
import { MobileBottomNavigator } from './MobileBottomNavigator';
import { DashboardScreen } from '../screens/DashboardScreen.web';
import { MapScreen }       from '../screens/MapScreen';          // → MapScreen.web on web
import { EventsScreen }    from '../screens/EventsScreen';       // → EventsScreen.web on web
import { ExplorerScreen }  from '../screens/ExplorerScreen';
import { AlertsScreen }    from '../screens/AlertsScreen';
import { Colors } from '../styles/theme';


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

  // 判斷螢幕大小，決定使用 WebTopNavigator 還是 BottomTabNavigator
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
        <WebTopNavigator 
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
    <MobileBottomNavigator />
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
 
});

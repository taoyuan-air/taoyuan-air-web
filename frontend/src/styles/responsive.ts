import { Platform, Dimensions } from 'react-native';

export const isWeb = Platform.OS === 'web';
export const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export const Layout = {
  headerHeight: 64,
  tabBarHeight: 80,
  breakpoints: {
    mobile: 768,
    tablet: 1024,
    desktop: 1200,
  },
} as const;
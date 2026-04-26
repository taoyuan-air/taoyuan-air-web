import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { View, StyleSheet } from "react-native";

import { ResponsiveNavigator } from "./src/navigation/ResponsiveNavigator";
import { palette } from "./src/styles/theme";

export default function App() {
  return (
    <View style={styles.container}>
      <NavigationContainer>
        <StatusBar style="dark" backgroundColor={palette.bgBase} />
        <ResponsiveNavigator />
      </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bgBase,
    minHeight: '100vh',
  },
});

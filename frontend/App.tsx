import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";

import { ResponsiveNavigator } from "./src/navigation/ResponsiveNavigator";
import { palette } from "./src/styles/theme";

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="dark" backgroundColor={palette.bgBase} />
      <ResponsiveNavigator />
    </NavigationContainer>
  );
}

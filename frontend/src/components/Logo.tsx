import React from "react";
import { View, Text, StyleSheet, Image, Platform } from "react-native";
import { palette } from "../styles/theme";

interface LogoProps {
  size?: "small" | "medium" | "large";
}

export const Logo: React.FC<LogoProps> = ({ size = "medium" }) => {
  const sizeStyles = {
    small: { width: 24, height: 24, fontSize: 12 },
    medium: { width: 32, height: 32, fontSize: 16 },
    large: { width: 40, height: 40, fontSize: 20 },
  };

  const currentSize = sizeStyles[size];

  if (Platform.OS === "web") {
    return (
      <Image
        source={{ uri: "/logo-air.png" }}
        style={{
          width: currentSize.width,
          height: currentSize.height,
          borderRadius: 8,
        }}
        resizeMode="contain"
      />
    );
  }

  return (
    <View
      style={[
        styles.container,
        { width: currentSize.width, height: currentSize.height },
      ]}
    >
      <Text style={[styles.text, { fontSize: currentSize.fontSize }]}>T</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: palette.primary,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    color: "white",
    fontWeight: "bold",
  },
});

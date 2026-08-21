import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { HealthLevel } from '../types';

interface HealthBadgeProps {
  level: HealthLevel;
  size?: 'small' | 'medium' | 'large';
}

export const HealthBadge: React.FC<HealthBadgeProps> = ({ level, size = 'medium' }) => {
  const getColor = () => {
    switch (level) {
      case '良好': return '#315E8F';
      case '普通': return '#6F91B2';
      case '對敏感族群不健康': return '#6AA6B8';
      case '對所有族群不健康': return '#346D9C';
      default: return '#315E8F';
    }
  };

  const getSize = () => {
    switch (size) {
      case 'small': return { padding: 4, fontSize: 10 };
      case 'large': return { padding: 12, fontSize: 16 };
      default: return { padding: 8, fontSize: 12 };
    }
  };

  const sizeStyle = getSize();

  return (
    <View style={[styles.badge, { backgroundColor: getColor(), padding: sizeStyle.padding }]}>
      <Text style={[styles.text, { fontSize: sizeStyle.fontSize }]}>{level}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  text: {
    color: 'white',
    fontWeight: '600',
  }
});
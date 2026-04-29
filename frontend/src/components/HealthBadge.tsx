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
      case '良好': return '#E76595';
      case '普通': return '#FBA7BC';
      case '對敏感族群不健康': return '#F4A261';
      case '對所有族群不健康': return '#E76F51';
      default: return '#E76595';
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
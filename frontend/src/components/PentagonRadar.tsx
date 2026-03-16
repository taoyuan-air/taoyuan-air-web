import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polygon, Line, Circle } from 'react-native-svg';

interface PentagonRadarProps {
  data?: number[];
  labels?: string[];
  size?: number;
}

export const PentagonRadar: React.FC<PentagonRadarProps> = ({
  data = [0.8, 0.6, 0.7, 0.9, 0.5],
  labels = ['化學', '粉塵', '生物', '氣體', '氣候'],
  size = 100
}) => {
  const center = size / 2;
  const radius = size * 0.4;
  
  // 計算五邊形頂點座標 (從頂部開始，順時針)
  const getPoint = (index: number, scale: number = 1) => {
    const angle = (index * 72 - 90) * (Math.PI / 180); // -90度讓第一個點在頂部
    const x = center + radius * scale * Math.cos(angle);
    const y = center + radius * scale * Math.sin(angle);
    return { x, y };
  };

  // 生成五邊形路徑
  const generatePentagon = (scale: number) => {
    const points = [];
    for (let i = 0; i < 5; i++) {
      const point = getPoint(i, scale);
      points.push(`${point.x},${point.y}`);
    }
    return points.join(' ');
  };

  // 生成數據多邊形
  const generateDataPolygon = () => {
    const points = [];
    for (let i = 0; i < 5; i++) {
      const point = getPoint(i, data[i]);
      points.push(`${point.x},${point.y}`);
    }
    return points.join(' ');
  };

  // 標籤位置
  const getLabelPosition = (index: number) => {
    const point = getPoint(index, 1.3);
    return { x: point.x, y: point.y };
  };

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* 網格層 */}
        <Polygon
          points={generatePentagon(1)}
          fill="none"
          stroke="rgba(143,169,111,0.2)"
          strokeWidth="1"
        />
        <Polygon
          points={generatePentagon(0.7)}
          fill="none"
          stroke="rgba(143,169,111,0.25)"
          strokeWidth="1"
        />
        <Polygon
          points={generatePentagon(0.4)}
          fill="none"
          stroke="rgba(143,169,111,0.3)"
          strokeWidth="1"
        />
        
        {/* 軸線 */}
        {[0, 1, 2, 3, 4].map(i => {
          const point = getPoint(i);
          return (
            <Line
              key={i}
              x1={center}
              y1={center}
              x2={point.x}
              y2={point.y}
              stroke="rgba(143,169,111,0.3)"
              strokeWidth="1"
            />
          );
        })}
        
        {/* 數據多邊形 */}
        <Polygon
          points={generateDataPolygon()}
          fill="rgba(120,170,140,0.35)"
          stroke="rgba(120,170,140,0.8)"
          strokeWidth="2"
        />
        
        {/* 中心點 */}
        <Circle
          cx={center}
          cy={center}
          r="2"
          fill="#8FA96F"
        />
      </Svg>
      
      {/* 標籤 */}
      {labels.map((label, index) => {
        const pos = getLabelPosition(index);
        return (
          <Text
            key={index}
            style={[
              styles.label,
              {
                position: 'absolute',
                left: pos.x - 15,
                top: pos.y - 8,
              }
            ]}
          >
            {label}
          </Text>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: '#555A4F',
    textAlign: 'center',
    width: 30,
  },
});
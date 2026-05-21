import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

interface HeatGridProps {
  data: Array<{
    id: string;
    value: number;
    row: number;
    col: number;
  }>;
  onCellPress?: (cellId: string) => void;
  maxValue?: number;
  minValue?: number;
}

export default function HeatGrid({ 
  data, 
  onCellPress, 
  maxValue = 100, 
  minValue = 0 
}: HeatGridProps) {
  const getOpacity = (value: number) => {
    const normalized = (value - minValue) / (maxValue - minValue);
    return Math.max(0.1, Math.min(0.9, normalized));
  };

  const renderCell = (item: any) => {
    const opacity = getOpacity(item.value);
    
    const CellContent = () => (
      <View 
        style={[
          styles.cell, 
          { backgroundColor: `rgba(15, 118, 110, ${opacity})` }
        ]}
      >
        <Text style={styles.cellText}>{Math.round(item.value)}</Text>
      </View>
    );

    if (onCellPress) {
      return (
        <TouchableOpacity 
          key={item.id} 
          onPress={() => onCellPress(item.id)}
        >
          <CellContent />
        </TouchableOpacity>
      );
    }

    return <CellContent key={item.id} />;
  };

  // 組織成網格結構
  const gridRows = [];
  const maxRow = Math.max(...data.map(d => d.row));
  const maxCol = Math.max(...data.map(d => d.col));

  for (let row = 0; row <= maxRow; row++) {
    const rowCells = [];
    for (let col = 0; col <= maxCol; col++) {
      const cell = data.find(d => d.row === row && d.col === col);
      if (cell) {
        rowCells.push(renderCell(cell));
      } else {
        rowCells.push(
          <View key={`${row}-${col}`} style={[styles.cell, styles.emptyCell]} />
        );
      }
    }
    gridRows.push(
      <View key={row} style={styles.row}>
        {rowCells}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>即時 PM2.5 分布（示意）</Text>
      <View style={styles.grid}>
        {gridRows}
      </View>
      <View style={styles.legend}>
        <Text style={styles.legendText}>低</Text>
        <View style={styles.legendBar} />
        <Text style={styles.legendText}>高</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 12,
  },
  grid: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    width: 24,
    height: 24,
    margin: 1,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCell: {
    backgroundColor: '#F1F5F9',
  },
  cellText: {
    fontSize: 8,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  legendBar: {
    width: 100,
    height: 8,
    marginHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#0F766E',
    opacity: 0.3,
  },
  legendText: {
    fontSize: 12,
    color: '#64748B',
  },
});
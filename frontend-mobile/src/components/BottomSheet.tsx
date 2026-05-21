import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface BottomSheetProps {
  isVisible: boolean;
  onClose: () => void;
  gridData?: any;
  verticalProfile?: Array<{ altitudeM: number; value: number }>;
}

const { height: screenHeight } = Dimensions.get('window');

export default function BottomSheet({ 
  isVisible, 
  onClose, 
  gridData, 
  verticalProfile
}: BottomSheetProps) {
  if (!gridData) return null;

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.handle} />
          
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>網格 {gridData.gridId}</Text>
                <Text style={styles.subtitle}>詳細資訊</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.content}>
              <Text style={styles.valueText}>
                PM2.5: {gridData.values?.value || 0} µg/m³
              </Text>
              <Text style={styles.infoText}>
                這是一個示例彈出層，顯示網格詳細資訊。
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: screenHeight * 0.8,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E293B',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 16,
  },
  valueText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F766E',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
});
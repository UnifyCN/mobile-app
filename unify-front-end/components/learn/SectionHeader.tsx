import { typography } from '@/constants/Typography';
import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';

type Props = { title: string; style?: ViewStyle };

export default function SectionHeader({ title, style }: Props) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  title: {
    ...typography.section,
    color: '#343232',
  },
});

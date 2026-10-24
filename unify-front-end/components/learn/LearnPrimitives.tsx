import { typography } from '@/constants/Typography';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import CategorySymbol from './CategorySymbol';

export const learnStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  content: {
    paddingHorizontal: 17,
    paddingTop: 12,
    paddingBottom: 100,
    gap: 20,
  },
  title: { ...typography.title, color: '#191919' },
  subtitle: { ...typography.body, color: '#353535' },
  heading: { ...typography.section, color: '#191919' },
  meta: { ...typography.caption, color: '#62605B' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, gap: 4 },
  card: {
    borderWidth: 1,
    borderColor: '#E3E3E3',
    borderRadius: 16,
    padding: 13,
    gap: 12,
  },
  rowTitle: {
    ...typography.cardTitle,
    color: '#191919',
  },
  pressed: { opacity: 0.65 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#E3E3E3' },
  action: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#191919',
  },
  actionText: { ...typography.button, color: '#FFFFFF' },
});

export function LearnBack({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        learnStyles.row,
        {
          minHeight: 44,
          gap: 4,
          alignSelf: 'flex-start',
          maxWidth: '100%',
          paddingHorizontal: 15,
          paddingVertical: 8,
          borderRadius: 24,
          backgroundColor: '#F2F2F2',
        },
        pressed && learnStyles.pressed,
      ]}
    >
      <Feather name='chevron-left' size={20} color='#242424' />
      <Text style={{ ...typography.label, color: '#242424', flexShrink: 1 }}>
        {title}
      </Text>
    </Pressable>
  );
}

export function LearnProgress({
  value,
  label,
  color = '#2C4976',
}: {
  value: number;
  label: string;
  color?: string;
}) {
  const progress = Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : 0;
  return (
    <View
      accessibilityRole='progressbar'
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: progress }}
      style={{
        height: 6,
        backgroundColor: '#E9E9E9',
        borderRadius: 3,
        overflow: 'hidden',
        flex: 1,
      }}
    >
      <View
        style={{
          width: `${progress}%`,
          height: 6,
          backgroundColor: color,
          borderRadius: 3,
        }}
      />
    </View>
  );
}

export function ResumeRow({
  title,
  subtitle,
  moduleId,
  icon,
  onPress,
  isNext = false,
}: {
  title: string;
  subtitle: string;
  moduleId: string;
  icon?: string;
  onPress: () => void;
  isNext?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={`${t(isNext ? 'learn.home.upNext' : 'learn.home.continue')}. ${title}. ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [
        learnStyles.row,
        {
          padding: 12,
          borderRadius: 16,
          backgroundColor: '#F5F5F7',
          minHeight: 85,
        },
        pressed && learnStyles.pressed,
      ]}
    >
      <CategorySymbol moduleId={moduleId} icon={icon} size={38} />
      <View style={learnStyles.grow}>
        <Text
          style={{ ...typography.caption, fontWeight: '600', color: '#2C4976' }}
        >
          {t(isNext ? 'learn.home.upNext' : 'learn.home.continue')}
        </Text>
        <Text style={learnStyles.rowTitle}>{title}</Text>
        <Text style={learnStyles.meta}>{subtitle}</Text>
      </View>
      <Feather name='chevron-right' size={18} color='#8E8E93' />
    </Pressable>
  );
}

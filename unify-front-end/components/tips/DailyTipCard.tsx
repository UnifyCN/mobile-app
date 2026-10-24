import { typography, typographyColors } from '@/constants/Typography';
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { DailyTip } from '@/types/dailyTip';
import { useAnalytics } from '@/utils/analytics';

export const CATEGORY_CONFIG: Record<
  string,
  { gradient: [string, string]; icon: string; accent: string }
> = {
  documents: {
    gradient: ['#F0F4F8', '#E2E8F0'],
    icon: 'file-text',
    accent: '#64748B',
  },
  finance: {
    gradient: ['#EFF6F0', '#E0EDE2'],
    icon: 'dollar-sign',
    accent: '#5B8A65',
  },
  housing: {
    gradient: ['#F5F0EC', '#EBE3DA'],
    icon: 'home',
    accent: '#8B7355',
  },
  employment: {
    gradient: ['#F2F0F5', '#E5E1ED'],
    icon: 'briefcase',
    accent: '#7B6B8A',
  },
  healthcare: {
    gradient: ['#F5EFF2', '#EDE3E8'],
    icon: 'heart',
    accent: '#8A6575',
  },
  immigration: {
    gradient: ['#EEF4F4', '#E0EAEB'],
    icon: 'globe',
    accent: '#5B7D82',
  },
  settlement: {
    gradient: ['#F4F2EC', '#EAE6DA'],
    icon: 'users',
    accent: '#7D7455',
  },
  general: {
    gradient: ['#F2F2F2', '#E8E8E8'],
    icon: 'star',
    accent: '#6B6B6B',
  },
};

interface DailyTipCardProps {
  tip: DailyTip;
  maxWidth?: number;
  onPress?: () => void;
}

export function DailyTipCard({ tip, maxWidth, onPress }: DailyTipCardProps) {
  const { t } = useTranslation();
  const { trackTipViewed, trackTipTapped } = useAnalytics();
  const lastTrackedTipId = useRef<string | null>(null);

  const config = CATEGORY_CONFIG[tip.category] || CATEGORY_CONFIG.general;

  useEffect(() => {
    if (lastTrackedTipId.current !== tip.id) {
      trackTipViewed({
        tip_id: tip.id,
        category: tip.category,
        persona: tip.persona,
        stage: tip.stage,
        date: tip.date,
      });
      lastTrackedTipId.current = tip.id;
    }
  }, [tip.id]);

  const handlePress = () => {
    trackTipTapped(tip.id, tip.category);
    onPress?.();
  };

  return (
    <TouchableOpacity
      style={[
        styles.card,
        maxWidth !== undefined ? { width: maxWidth } : { width: '100%' },
      ]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <LinearGradient
        colors={config.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <View
            style={[styles.badge, { backgroundColor: config.accent + '14' }]}
          >
            <Text
              style={[styles.badgeText, { color: typographyColors.secondary }]}
            >
              {t('tips.dailyTip')}
            </Text>
          </View>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: config.accent + '10' },
            ]}
          >
            <Feather
              name={config.icon as any}
              size={18}
              color={config.accent}
            />
          </View>
        </View>
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={2}>
            {tip.title}
          </Text>
          <Text style={styles.tipText} numberOfLines={2} ellipsizeMode='tail'>
            {tip.tipText}
          </Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 332,
    minHeight: 168,
    borderRadius: 16,
    overflow: 'hidden',
  },
  gradient: {
    flex: 1,
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    ...typography.caption,

    letterSpacing: 0.3,
  },
  iconContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    ...typography.cardTitle,

    color: '#1a1a1a',
    marginBottom: 4,
  },
  tipText: {
    ...typography.secondary,

    color: typographyColors.secondary,
  },
});

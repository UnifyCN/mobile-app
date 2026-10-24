import { typography } from '@/constants/Typography';
import React from 'react';
import { Text, StyleSheet, TextStyle, StyleProp } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useGiveawayCountdown } from '@/hooks/giveaway/useGiveawayCountdown';

interface CountdownTimerProps {
  style?: StyleProp<TextStyle>;
  showPrefix?: boolean;
}

/**
 * Live countdown text. Pure display layer — all logic lives in the hook.
 * Renders nothing once the giveaway is past its deadline.
 */
export function CountdownTimer({
  style,
  showPrefix = true,
}: CountdownTimerProps) {
  const { t } = useTranslation();
  const { isActive, display } = useGiveawayCountdown();

  if (!isActive) return null;

  const prefix = showPrefix ? `${t('giveaway.banner.countdownPrefix')} ` : '';
  return (
    <Text style={[styles.text, style]}>
      {prefix}
      {display}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { ...typography.secondary, fontWeight: '600' },
});

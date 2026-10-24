import { typography } from '@/constants/Typography';
import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Theme } from '@/constants/Theme';

interface InfoBadgeProps {
  label: string;
  iconName?: keyof typeof Feather.glyphMap;
  style?: ViewStyle;
  textStyle?: TextStyle;
  backgroundColor?: string;
  textColor?: string;
  iconColor?: string;
}

const InfoBadge = ({
  label,
  iconName,
  style,
  textStyle,
  backgroundColor,
  textColor,
  iconColor,
}: InfoBadgeProps) => {
  const effectiveTextColor = textColor ?? Theme.textAlternateGray;
  const effectiveIconColor = iconColor ?? effectiveTextColor;
  const containerStyle = backgroundColor
    ? [styles.container, { backgroundColor }]
    : styles.container;

  return (
    <View style={[containerStyle, style]}>
      {iconName ? (
        <Feather
          name={iconName}
          size={12}
          color={effectiveIconColor}
          style={styles.icon}
        />
      ) : null}
      <Text style={[styles.text, { color: effectiveTextColor }, textStyle]}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Theme.surfaceGray,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  icon: {
    marginRight: 4,
  },
  text: {
    ...typography.caption,
    color: Theme.textAlternateGray,
    flexShrink: 1,
    fontWeight: '500',
  },
});

export default InfoBadge;

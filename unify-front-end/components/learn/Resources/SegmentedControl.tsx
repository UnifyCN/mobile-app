import { typography } from '@/constants/Typography';
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { RESOURCE_THEME } from '@/constants/ResourceTheme';

type Props<T extends string> = {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  style?: ViewStyle;
};

/**
 * Two-or-more-option toggle. Used at the top of Learn to switch between
 * Lessons (existing CMS-driven content) and Resources (partner directory).
 *
 * Figma 8129:32563 draws a 37pt segment; `hitSlop` lifts the tap target back
 * over the 44pt minimum without making the pill taller than the design.
 */
export default function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  style,
}: Props<T>) {
  return (
    <View style={[styles.container, style]}>
      {options.map(option => {
        const isActive = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            activeOpacity={0.85}
            onPress={() => onChange(option.value)}
            style={[styles.segment, isActive && styles.segmentActive]}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole='button'
            accessibilityState={{ selected: isActive }}
          >
            <Text
              style={[styles.label, isActive && styles.labelActive]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: RESOURCE_THEME.surfaceSegment,
    borderRadius: 999,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: RESOURCE_THEME.surface,
    // Figma's `drop-shadow(0 1px 1.5px rgba(0,0,0,0.08))`.
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 1.5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: {
    ...typography.label,

    color: RESOURCE_THEME.textSegmentInactive,
  },
  labelActive: {
    fontWeight: '700',
    color: RESOURCE_THEME.textSegmentActive,
  },
});

import { typography } from '@/constants/Typography';
/**
 * ChecklistCheckboxBlock
 *
 * Renders a single interactive checkbox row from a Sanity `checklist_checkbox`
 * portable-text block.  State is local — no sync back to Sanity.
 *
 * -- Where Portable Text is rendered --
 * All rich-text content passes through RichTextRenderer.tsx
 * (components/sanity/RichTextRenderer.tsx).  To add a new block type, add a
 * branch `if (block._type === 'your_type')` inside its `renderBlock` function,
 * following the same pattern as `example_box`, `tip_box`, `note_box`, etc.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';

interface ChecklistCheckboxBlockProps {
  label: string;
  defaultChecked?: boolean;
}

export default function ChecklistCheckboxBlock({
  label,
  defaultChecked = false,
}: ChecklistCheckboxBlockProps) {
  const [checked, setChecked] = useState(defaultChecked);

  if (!label) return null;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => setChecked(prev => !prev)}
      activeOpacity={0.7}
      accessibilityRole='checkbox'
      accessibilityState={{ checked }}
      accessibilityLabel={label}
    >
      <View
        style={[styles.checkbox, checked && styles.checkboxChecked]}
        // Prevents the inner View from swallowing the touch on Android
        pointerEvents='none'
      >
        {checked && (
          <Text style={styles.checkmark} allowFontScaling={false}>
            {Platform.OS === 'ios' ? '✓' : '✓'}
          </Text>
        )}
      </View>
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 6,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#000',
    borderRadius: 4,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: '#000',
  },
  checkmark: { ...typography.caption, color: '#fff', fontWeight: 'bold' },
  label: { ...typography.reading, flex: 1, color: '#374151' },
});

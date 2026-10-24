import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  getPickerOptions,
  setPickerPart,
  type PickerPart,
} from '@/helpers/arrivalDatePicker';

interface Props {
  value: Date;
  min: Date;
  max: Date;
  /** BCP 47 tag for month names and column order. */
  language: string;
  onChange: (date: Date) => void;
}

const ROW_HEIGHT = 44;
const VISIBLE_ROWS = 5;

interface Option {
  value: number;
  label: string;
}

function PickerColumn({
  options,
  selected,
  flex,
  onSelect,
}: {
  options: Option[];
  selected: number;
  flex: number;
  onSelect: (value: number) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const selectedIndex = options.findIndex(option => option.value === selected);

  // Keep the selected row centred, also after the option list changes.
  useEffect(() => {
    if (selectedIndex < 0) return;
    scrollRef.current?.scrollTo({
      y: selectedIndex * ROW_HEIGHT,
      animated: false,
    });
  }, [selectedIndex, options.length]);

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.column, { flex }]}
      contentContainerStyle={styles.columnContent}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
    >
      {options.map(option => {
        const isSelected = option.value === selected;
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            accessibilityRole='button'
            accessibilityLabel={option.label}
            accessibilityState={{ selected: isSelected }}
            style={styles.row}
          >
            <Text
              style={[styles.rowText, isSelected && styles.rowTextSelected]}
              maxFontSizeMultiplier={1.3}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const columnOrder = (language: string): PickerPart[] => {
  try {
    const order = new Intl.DateTimeFormat(language, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
      .formatToParts(new Date(2026, 0, 1))
      .map(part => part.type)
      .filter((type): type is PickerPart =>
        ['year', 'month', 'day'].includes(type)
      );
    if (order.length === 3) return order;
  } catch {
    // Fall through to the default order.
  }
  return ['month', 'day', 'year'];
};

/**
 * Day-level date picker built from three scroll columns, the same pattern as
 * the onboarding month/year picker. One implementation for iOS and Android.
 */
export function ArrivalDatePicker({
  value,
  min,
  max,
  language,
  onChange,
}: Props) {
  const range = useMemo(() => ({ min, max }), [min, max]);
  const options = getPickerOptions(value, range);

  const monthNames = useMemo(() => {
    let format: Intl.DateTimeFormat;
    try {
      format = new Intl.DateTimeFormat(language, { month: 'long' });
    } catch {
      format = new Intl.DateTimeFormat('en', { month: 'long' });
    }
    return Array.from({ length: 12 }, (_, m) =>
      format.format(new Date(2026, m, 1))
    );
  }, [language]);

  const columns: Record<PickerPart, { options: Option[]; flex: number }> = {
    month: {
      options: options.months.map(m => ({ value: m, label: monthNames[m] })),
      flex: 1.7,
    },
    day: {
      options: options.days.map(d => ({ value: d, label: String(d) })),
      flex: 1,
    },
    year: {
      options: options.years.map(y => ({ value: y, label: String(y) })),
      flex: 1.2,
    },
  };
  const selectedValue: Record<PickerPart, number> = {
    month: value.getMonth(),
    day: value.getDate(),
    year: value.getFullYear(),
  };

  return (
    <View style={styles.container}>
      <View pointerEvents='none' style={styles.selectionBand} />
      {columnOrder(language).map(part => (
        <PickerColumn
          key={part}
          options={columns[part].options}
          selected={selectedValue[part]}
          flex={columns[part].flex}
          onSelect={next => onChange(setPickerPart(value, part, next, range))}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: ROW_HEIGHT * VISIBLE_ROWS,
    flexDirection: 'row',
    gap: 4,
  },
  selectionBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ROW_HEIGHT * Math.floor(VISIBLE_ROWS / 2),
    height: ROW_HEIGHT,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
  },
  column: {
    height: ROW_HEIGHT * VISIBLE_ROWS,
  },
  // Blank rows above and below let the first and last option sit in the band.
  columnContent: {
    paddingVertical: ROW_HEIGHT * Math.floor(VISIBLE_ROWS / 2),
  },
  row: {
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    fontSize: 18,
    color: '#686464',
  },
  rowTextSelected: {
    fontWeight: '600',
    color: '#000',
  },
});

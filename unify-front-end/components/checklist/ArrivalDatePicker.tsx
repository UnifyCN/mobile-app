import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { typography } from '@/constants/Typography';
import {
  getPickerOptions,
  setPickerPart,
  type PickerPart,
} from '@/helpers/arrivalDatePicker';

interface Props {
  /** The date shown. It may lie outside min and max when it is a saved date. */
  value: Date;
  min: Date;
  max: Date;
  /** BCP 47 tag for month names and column order. */
  language: string;
  onChange: (date: Date) => void;
}

const MIN_ROW_HEIGHT = 44;
const ROW_PADDING = 8;
const VISIBLE_ROWS = 5;
const MIN_VISIBLE_ROWS = 3;
// On a short screen the picker may not take more than this share of the window.
const MAX_WINDOW_SHARE = 0.34;

interface Option {
  value: number;
  label: string;
}

interface RowLayout {
  y: number;
  height: number;
}

/**
 * One scrolling column. The selected row is centred from measured row and
 * viewport sizes, so scaled text and wrapped labels stay centred. Same method
 * as the onboarding MonthPicker.
 */
function PickerColumn({
  options,
  selected,
  flex,
  rowHeight,
  viewportHeight,
  onSelect,
  onSelectedHeight,
}: {
  options: Option[];
  selected: number;
  flex: number;
  rowHeight: number;
  viewportHeight: number;
  onSelect: (value: number) => void;
  onSelectedHeight: (height: number) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const rows = useRef(new Map<number, RowLayout>());

  const center = useCallback(() => {
    const row = rows.current.get(selected);
    if (!row || !viewportHeight) return;
    onSelectedHeight(row.height);
    scrollRef.current?.scrollTo({
      y: Math.max(0, row.y + row.height / 2 - viewportHeight / 2),
      animated: false,
    });
  }, [selected, viewportHeight, onSelectedHeight]);

  // Re-centre when the selection, the viewport or the option list changes.
  useEffect(center, [center, options.length]);

  const measure = (value: number, event: LayoutChangeEvent) => {
    rows.current.set(value, event.nativeEvent.layout);
    if (value === selected) center();
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.column, { flex }]}
      contentContainerStyle={{
        // Blank space above and below lets the first and last row reach the middle.
        paddingVertical: Math.max(0, (viewportHeight - rowHeight) / 2),
      }}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
    >
      {options.map(option => {
        const isSelected = option.value === selected;
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            onLayout={event => measure(option.value, event)}
            accessibilityRole='button'
            accessibilityLabel={option.label}
            accessibilityState={{ selected: isSelected }}
            style={[styles.row, { minHeight: rowHeight }]}
          >
            <Text
              style={[styles.rowText, isSelected && styles.rowTextSelected]}
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
 * Row height follows the user's font scale. The viewport is shorter on a short
 * screen, and the selection band follows the measured viewport and row.
 */
export function ArrivalDatePicker({
  value,
  min,
  max,
  language,
  onChange,
}: Props) {
  const { fontScale, height: windowHeight } = useWindowDimensions();
  const rowHeight = Math.max(
    MIN_ROW_HEIGHT,
    Math.ceil(typography.body.lineHeight * fontScale) + ROW_PADDING * 2
  );
  // Five rows, fewer on a short screen, never fewer than three.
  const nominalViewport = Math.max(
    rowHeight * MIN_VISIBLE_ROWS,
    Math.min(rowHeight * VISIBLE_ROWS, windowHeight * MAX_WINDOW_SHARE)
  );

  const [measuredViewport, setMeasuredViewport] = useState<number | null>(null);
  const viewportHeight = measuredViewport ?? nominalViewport;
  const [selectedHeights, setSelectedHeights] = useState<
    Partial<Record<PickerPart, number>>
  >({});
  const bandHeight = Math.max(rowHeight, ...Object.values(selectedHeights));

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
    // Month names are the longest labels, so that column gets the most width.
    month: {
      options: options.months.map(m => ({ value: m, label: monthNames[m] })),
      flex: 2.2,
    },
    day: {
      options: options.days.map(d => ({ value: d, label: String(d) })),
      flex: 0.8,
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

  const reportHeight = useCallback(
    (part: PickerPart) => (height: number) =>
      setSelectedHeights(prev =>
        prev[part] === height ? prev : { ...prev, [part]: height }
      ),
    []
  );
  const reporters = useMemo(
    () => ({
      month: reportHeight('month'),
      day: reportHeight('day'),
      year: reportHeight('year'),
    }),
    [reportHeight]
  );

  return (
    <View
      testID='arrival-date-picker'
      onLayout={event => setMeasuredViewport(event.nativeEvent.layout.height)}
      style={[styles.container, { height: nominalViewport }]}
    >
      <View
        testID='arrival-date-picker-band'
        pointerEvents='none'
        style={[
          styles.selectionBand,
          { top: (viewportHeight - bandHeight) / 2, height: bandHeight },
        ]}
      />
      {columnOrder(language).map(part => (
        <PickerColumn
          key={part}
          options={columns[part].options}
          selected={selectedValue[part]}
          flex={columns[part].flex}
          rowHeight={rowHeight}
          viewportHeight={viewportHeight}
          onSelect={next => {
            // Pressing the value that is already shown changes nothing. This
            // keeps a saved date outside the range from becoming a pick.
            if (next === selectedValue[part]) return;
            onChange(setPickerPart(value, part, next, range));
          }}
          onSelectedHeight={reporters[part]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 4,
  },
  selectionBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
  },
  column: {
    alignSelf: 'stretch',
  },
  row: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: ROW_PADDING,
    paddingHorizontal: 4,
  },
  rowText: {
    ...typography.body,
    textAlign: 'center',
    color: '#686464',
  },
  rowTextSelected: {
    ...typography.cardTitle,
    color: '#000',
  },
});

import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { parseLocalDate, toISODate } from '@/utils/checklistHorizons';

interface DatePickerFieldProps {
  /** ISO calendar date, YYYY-MM-DD, or null. */
  value: string | null;
  onChange: (iso: string) => void;
  placeholder: string;
}

/**
 * A calendar-grid picker in the app's own style (the onboarding MonthPicker
 * sets the precedent for a JS picker over a native one). Past dates are
 * allowed: an overdue date is a valid thing to record.
 */
export const DatePickerField: React.FC<DatePickerFieldProps> = ({
  value,
  onChange,
  placeholder,
}) => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const initial = value ? parseLocalDate(value) : new Date();
  const [cursor, setCursor] = useState(
    new Date(initial.getFullYear(), initial.getMonth(), 1)
  );

  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' });
    // Sunday-first, like the iOS calendar in en-CA.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 1 + i)));
  }, [i18n.language]);

  const monthLabel = cursor.toLocaleDateString(i18n.language, {
    month: 'long',
    year: 'numeric',
  });

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const lead = first.getDay();
    const out: (Date | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= daysInMonth; d++) {
      out.push(new Date(cursor.getFullYear(), cursor.getMonth(), d, 12));
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const todayISO = toISODate(new Date());
  const display = value
    ? parseLocalDate(value).toLocaleDateString(i18n.language, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const shiftMonth = (delta: number) =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));

  return (
    <>
      <TouchableOpacity
        style={styles.field}
        onPress={() => setOpen(true)}
        accessibilityRole='button'
        accessibilityLabel={display ?? placeholder}
        activeOpacity={0.7}
      >
        <Text style={[styles.fieldText, !display && styles.placeholder]}>
          {display ?? placeholder}
        </Text>
        <MaterialIcons name='event' size={20} color='#64748B' />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType='fade'
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.panel} onPress={() => undefined}>
            <View style={styles.monthRow}>
              <TouchableOpacity
                onPress={() => shiftMonth(-1)}
                hitSlop={12}
                accessibilityRole='button'
                accessibilityLabel='Previous month'
              >
                <MaterialIcons name='chevron-left' size={26} color='#0F172A' />
              </TouchableOpacity>
              <Text style={styles.monthLabel}>{monthLabel}</Text>
              <TouchableOpacity
                onPress={() => shiftMonth(1)}
                hitSlop={12}
                accessibilityRole='button'
                accessibilityLabel='Next month'
              >
                <MaterialIcons name='chevron-right' size={26} color='#0F172A' />
              </TouchableOpacity>
            </View>
            <View style={styles.grid}>
              {weekdays.map((w, i) => (
                <Text key={`w${i}`} style={styles.weekday}>
                  {w}
                </Text>
              ))}
              {cells.map((d, i) => {
                if (!d) return <View key={`e${i}`} style={styles.cell} />;
                const iso = toISODate(d);
                const selected = iso === value;
                const isToday = iso === todayISO;
                return (
                  <TouchableOpacity
                    key={iso}
                    style={[styles.cell, selected && styles.cellSelected]}
                    onPress={() => {
                      onChange(iso);
                      setOpen(false);
                    }}
                    accessibilityRole='button'
                    accessibilityLabel={d.toLocaleDateString(i18n.language, {
                      month: 'long',
                      day: 'numeric',
                    })}
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[
                        styles.cellText,
                        isToday && !selected && styles.cellToday,
                        selected && styles.cellTextSelected,
                      ]}
                    >
                      {d.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  field: {
    borderWidth: 1,
    borderColor: '#D6D5D5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  fieldText: { fontSize: 15, color: '#0F172A' },
  placeholder: { color: '#9AA3AF' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  monthLabel: { fontSize: 16, fontWeight: '600', color: '#0F172A' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    paddingVertical: 6,
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  cellSelected: { backgroundColor: '#000' },
  cellText: { fontSize: 15, color: '#0F172A' },
  cellToday: { color: '#E03B3B', fontWeight: '700' },
  cellTextSelected: { color: '#fff', fontWeight: '700' },
});

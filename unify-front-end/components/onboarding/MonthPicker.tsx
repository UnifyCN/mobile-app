import { typography } from '@/constants/Typography';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  ScrollView,
  LayoutChangeEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '@/constants/Theme';
import { getBottomSheetPadding } from '@/utils/safeAreaSpacing';

interface MonthPickerProps {
  value: Date | null;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
}

// Measure rows and the viewport so translated labels and Dynamic Type stay centered.
function useCenteredPickerScroll(selectedKey: number) {
  const ref = useRef<ScrollView>(null);
  const viewportHeight = useRef(0);
  const rows = useRef(new Map<number, { y: number; height: number }>());
  const center = useCallback(() => {
    const row = rows.current.get(selectedKey);
    if (!row || !viewportHeight.current) return;
    ref.current?.scrollTo({
      y: Math.max(0, row.y + row.height / 2 - viewportHeight.current / 2),
      animated: false,
    });
  }, [selectedKey]);
  useEffect(center, [center]);
  const onLayout = (event: LayoutChangeEvent) => {
    viewportHeight.current = event.nativeEvent.layout.height;
    center();
  };
  const measure = (key: number, event: LayoutChangeEvent) => {
    rows.current.set(key, event.nativeEvent.layout);
    if (key === selectedKey) center();
  };
  return { ref, onLayout, measure, center };
}

const MonthPicker: React.FC<MonthPickerProps> = ({
  value,
  onChange,
  minimumDate = new Date(new Date().getFullYear() - 20, 0),
  maximumDate = new Date(new Date().getFullYear() + 10, 11),
}) => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [showPicker, setShowPicker] = useState(false);
  const [selectedYear, setSelectedYear] = useState(
    value?.getFullYear() ?? new Date().getFullYear()
  );
  const [selectedMonth, setSelectedMonth] = useState(
    value?.getMonth() ?? new Date().getMonth()
  );

  const months = React.useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { month: 'long' });
    return Array.from({ length: 12 }, (_, m) =>
      fmt.format(new Date(2020, m, 1))
    );
  }, [i18n.language]);

  const generateYears = () => {
    const startYear = minimumDate.getFullYear();
    const endYear = maximumDate.getFullYear();
    const years = [];
    for (let i = endYear; i >= startYear; i--) {
      years.push(i);
    }
    return years;
  };

  const years = generateYears();
  const yearScroll = useCenteredPickerScroll(selectedYear);
  const monthScroll = useCenteredPickerScroll(selectedMonth);

  const handleOpenPicker = () => setShowPicker(true);

  const handleConfirm = () => {
    const newDate = new Date(selectedYear, selectedMonth, 1);
    onChange(newDate);
    setShowPicker(false);
  };

  const handleCancel = () => {
    setShowPicker(false);
  };

  return (
    <>
      <TouchableOpacity style={styles.dateInput} onPress={handleOpenPicker}>
        <Text
          style={[
            typography.body,
            { color: value ? Theme.black : Theme.textInput },
          ]}
        >
          {value
            ? value.toLocaleDateString(i18n.language, {
                month: 'long',
                year: 'numeric',
              })
            : t('onboarding.selectMonthYear')}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={showPicker}
        transparent={true}
        animationType='slide'
        onRequestClose={handleCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.header}>
              <Text style={styles.headerText}>
                {t('onboarding.monthPickerTitle')}
              </Text>
            </View>

            <View style={styles.scrollContainer}>
              {/* Month Selector */}
              <View style={styles.column}>
                <Text style={styles.columnTitle}>
                  {t('onboarding.monthLabel')}
                </Text>
                <ScrollView
                  testID='month-picker-months'
                  ref={monthScroll.ref}
                  style={styles.scrollList}
                  onLayout={monthScroll.onLayout}
                  onContentSizeChange={monthScroll.center}
                >
                  {months.map((month, index) => (
                    <TouchableOpacity
                      key={month}
                      onLayout={event => monthScroll.measure(index, event)}
                      style={[
                        styles.item,
                        selectedMonth === index && styles.selectedItem,
                      ]}
                      onPress={() => setSelectedMonth(index)}
                    >
                      <Text
                        style={[
                          styles.itemText,
                          selectedMonth === index && styles.selectedItemText,
                        ]}
                      >
                        {month}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Year Selector */}
              <View style={styles.column}>
                <Text style={styles.columnTitle}>
                  {t('onboarding.yearLabel')}
                </Text>
                <ScrollView
                  testID='month-picker-years'
                  ref={yearScroll.ref}
                  style={styles.scrollList}
                  onLayout={yearScroll.onLayout}
                  onContentSizeChange={yearScroll.center}
                >
                  {years.map(year => (
                    <TouchableOpacity
                      key={year}
                      onLayout={event => yearScroll.measure(year, event)}
                      style={[
                        styles.item,
                        selectedYear === year && styles.selectedItem,
                      ]}
                      onPress={() => setSelectedYear(year)}
                    >
                      <Text
                        style={[
                          styles.itemText,
                          selectedYear === year && styles.selectedItemText,
                        ]}
                      >
                        {year}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            <View
              style={[
                styles.buttonContainer,
                { paddingBottom: getBottomSheetPadding(insets.bottom, 16) },
              ]}
            >
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={handleCancel}
              >
                <Text style={styles.cancelButtonText}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.confirmButton]}
                onPress={handleConfirm}
              >
                <Text style={styles.confirmButtonText}>
                  {t('onboarding.confirm')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  dateInput: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInfoText,
    backgroundColor: Theme.white,
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: Theme.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceGray,
  },
  headerText: {
    ...typography.cardTitle,
    color: Theme.black,
    textAlign: 'center',
  },
  scrollContainer: {
    flexDirection: 'row',
    height: 300,
  },
  column: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: Theme.surfaceGray,
  },
  columnTitle: {
    ...typography.secondary,
    color: Theme.textInput,
    textAlign: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceGray,
    fontWeight: '600',
  },
  scrollList: {
    flex: 1,
  },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceGray,
  },
  selectedItem: {
    backgroundColor: '#FFF5F3',
  },
  itemText: { ...typography.body, color: Theme.black, textAlign: 'center' },
  selectedItemText: {
    fontWeight: '700',
    color: Theme.primaryGatherRed,
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceGray,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: Theme.surfaceGray,
  },
  confirmButton: {
    backgroundColor: Theme.primaryGatherRed,
  },
  cancelButtonText: { ...typography.button, color: Theme.black },
  confirmButtonText: { ...typography.button, color: Theme.white },
});

export default MonthPicker;

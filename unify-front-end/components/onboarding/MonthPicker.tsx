import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  ScrollView,
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
  const yearScrollRef = useRef<ScrollView>(null);
  const monthScrollRef = useRef<ScrollView>(null);

  const ITEM_HEIGHT = 45; // paddingVertical(12)*2 + lineHeight(~20) + border(1)
  const SCROLL_LIST_HEIGHT = 300 - 33; // scrollContainer height minus columnTitle

  const handleOpenPicker = useCallback(() => {
    setShowPicker(true);
    // Scroll to selected year/month after modal renders
    setTimeout(() => {
      const yearIndex = years.indexOf(selectedYear);
      if (yearIndex >= 0 && yearScrollRef.current) {
        const offset = Math.max(
          0,
          yearIndex * ITEM_HEIGHT - SCROLL_LIST_HEIGHT / 2 + ITEM_HEIGHT / 2
        );
        yearScrollRef.current.scrollTo({ y: offset, animated: false });
      }
      if (monthScrollRef.current) {
        const monthOffset = Math.max(
          0,
          selectedMonth * ITEM_HEIGHT - SCROLL_LIST_HEIGHT / 2 + ITEM_HEIGHT / 2
        );
        monthScrollRef.current.scrollTo({ y: monthOffset, animated: false });
      }
    }, 100);
  }, [selectedYear, selectedMonth, years]);

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
        <Text style={{ color: value ? Theme.black : Theme.textInput }}>
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
              <Text style={styles.headerText}>{t('onboarding.monthPickerTitle')}</Text>
            </View>

            <View style={styles.scrollContainer}>
              {/* Month Selector */}
              <View style={styles.column}>
                <Text style={styles.columnTitle}>{t('onboarding.monthLabel')}</Text>
                <ScrollView ref={monthScrollRef} style={styles.scrollList}>
                  {months.map((month, index) => (
                    <TouchableOpacity
                      key={month}
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
                <Text style={styles.columnTitle}>{t('onboarding.yearLabel')}</Text>
                <ScrollView ref={yearScrollRef} style={styles.scrollList}>
                  {years.map(year => (
                    <TouchableOpacity
                      key={year}
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
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.confirmButton]}
                onPress={handleConfirm}
              >
                <Text style={styles.confirmButtonText}>{t('onboarding.confirm')}</Text>
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
    fontSize: 18,
    fontWeight: '700',
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
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textInput,
    textAlign: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceGray,
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
  itemText: {
    fontSize: 16,
    color: Theme.black,
    textAlign: 'center',
  },
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
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.black,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.white,
  },
});

export default MonthPicker;

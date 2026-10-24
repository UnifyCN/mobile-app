import { typography } from '@/constants/Typography';
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Theme } from '@/constants/Theme';

interface Option {
  value: string;
  label: string;
  hasOther?: boolean;
  icon?: React.ComponentProps<typeof Feather>['name'];
}

interface MultiSelectQuestionProps {
  question: string;
  options: Option[];
  selectedValues: string[];
  otherValue: string | null;
  onToggle: (value: string) => void;
  onOtherChange: (value: string) => void;
  required?: boolean;
  error?: string;
}

export default function MultiSelectQuestion({
  question,
  options,
  selectedValues,
  otherValue,
  onToggle,
  onOtherChange,
  required = false,
  error,
}: MultiSelectQuestionProps) {
  const { t } = useTranslation();
  const otherOption = options.find(opt => opt.hasOther);
  const showOtherInput =
    otherOption && selectedValues.includes(otherOption.value);

  return (
    <View style={styles.container}>
      <Text style={styles.question}>{question}</Text>
      {required && selectedValues.length === 0 && error && (
        <Text style={styles.errorText}>{error}</Text>
      )}

      <View style={styles.optionsContainer}>
        {options.map(option => {
          const isSelected = selectedValues.includes(option.value);
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.optionCard, isSelected && styles.optionSelected]}
              onPress={() => onToggle(option.value)}
              activeOpacity={0.85}
            >
              <View style={styles.cardHeader}>
                {option.icon ? (
                  <View style={styles.iconBadge}>
                    <Feather
                      name={option.icon}
                      size={16}
                      color={Theme.textInput}
                    />
                  </View>
                ) : (
                  <View style={styles.iconPlaceholder} />
                )}
                <View
                  style={[
                    styles.checkBadge,
                    isSelected && styles.checkBadgeSelected,
                  ]}
                >
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </View>
              </View>
              <Text
                style={[
                  styles.optionText,
                  isSelected && styles.optionTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {showOtherInput && (
        <View style={styles.otherInputContainer}>
          <TextInput
            style={styles.otherInput}
            placeholder={t('onboarding.pleaseSpecify')}
            value={otherValue || ''}
            onChangeText={onOtherChange}
            placeholderTextColor={Theme.textInput}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 28,
  },
  question: { ...typography.title, color: Theme.black, marginBottom: 16 },
  errorText: { ...typography.secondary, color: '#f00', marginBottom: 12 },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    columnGap: 12,
  },
  optionCard: {
    width: '48%',
    minHeight: 84,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.surfaceGray,
    backgroundColor: Theme.white,
    justifyContent: 'center',
  },
  optionSelected: {
    borderColor: Theme.primaryGatherRed,
    backgroundColor: '#FFF7F4',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  iconBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPlaceholder: {
    width: 24,
    height: 24,
  },
  checkBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Theme.surfaceGray,
    backgroundColor: Theme.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkBadgeSelected: {
    borderColor: Theme.primaryGatherRed,
    backgroundColor: Theme.primaryGatherRed,
  },
  checkmark: { ...typography.caption, color: Theme.white, fontWeight: '700' },
  optionText: { ...typography.body, color: Theme.black, paddingRight: 18 },
  optionTextSelected: {
    fontWeight: '600',
  },
  otherInputContainer: {
    marginTop: 16,
  },
  otherInput: {
    ...typography.body,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInfoText,
    backgroundColor: Theme.white,
    color: Theme.black,
  },
});

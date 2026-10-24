import { typography } from '@/constants/Typography';
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Theme } from '@/constants/Theme';

interface Option {
  value: string;
  label: string;
  hasOther?: boolean;
}

interface SingleSelectQuestionProps {
  question: string;
  options: Option[];
  selectedValue: string | null;
  otherValue: string | null;
  onSelect: (value: string) => void;
  onOtherChange: (value: string) => void;
  required?: boolean;
  error?: string;
}

export default function SingleSelectQuestion({
  question,
  options,
  selectedValue,
  otherValue,
  onSelect,
  onOtherChange,
  required = false,
  error,
}: SingleSelectQuestionProps) {
  const { t } = useTranslation();
  const selectedOption = options.find(opt => opt.value === selectedValue);
  const showOtherInput = selectedOption?.hasOther;

  return (
    <View style={styles.container}>
      <Text style={styles.question}>{question}</Text>
      {required && !selectedValue && error && (
        <Text style={styles.errorText}>{error}</Text>
      )}

      <View style={styles.optionsContainer}>
        {options.map(option => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.option,
              selectedValue === option.value && styles.optionSelected,
            ]}
            onPress={() => onSelect(option.value)}
          >
            <View style={styles.radioContainer}>
              <View
                style={[
                  styles.radio,
                  selectedValue === option.value && styles.radioSelected,
                ]}
              >
                {selectedValue === option.value && (
                  <View style={styles.radioInner} />
                )}
              </View>
              <Text
                style={[
                  styles.optionText,
                  selectedValue === option.value && styles.optionTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
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
    paddingHorizontal: 24,
  },
  question: { ...typography.title, color: Theme.black, marginBottom: 24 },
  errorText: { ...typography.secondary, color: '#f00', marginBottom: 16 },
  optionsContainer: {
    gap: 12,
  },
  option: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInfoText,
    backgroundColor: Theme.white,
  },
  optionSelected: {
    borderColor: Theme.primaryGatherRed,
    backgroundColor: '#FFF5F3',
  },
  radioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Theme.borderInfoText,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    borderColor: Theme.primaryGatherRed,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Theme.primaryGatherRed,
  },
  optionText: { ...typography.body, color: Theme.black, flex: 1 },
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

import { typography } from '@/constants/Typography';
import React from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { RESOURCE_THEME } from '@/constants/ResourceTheme';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
};

/** Search field above the category grid (Figma 8129:32580). */
export default function ResourcesSearchBar({ value, onChangeText }: Props) {
  const { t } = useTranslation();
  const placeholder = t('learn.resources.searchPlaceholder');

  return (
    <View style={styles.field}>
      <MaterialIcons
        name='search'
        size={20}
        color={RESOURCE_THEME.textPlaceholder}
      />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={RESOURCE_THEME.textPlaceholder}
        style={styles.input}
        autoCorrect={false}
        autoCapitalize='none'
        returnKeyType='search'
        clearButtonMode='never'
        accessibilityLabel={placeholder}
      />
      {value.length > 0 && (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          hitSlop={10}
          accessibilityRole='button'
          accessibilityLabel={t('learn.resources.clearSearch')}
        >
          <MaterialIcons
            name='cancel'
            size={18}
            color={RESOURCE_THEME.textPlaceholder}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: RESOURCE_THEME.surfaceSearch,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  input: {
    ...typography.body,
    flex: 1,
    color: RESOURCE_THEME.textHeading,
    padding: 0,
    ...(Platform.OS === 'android' ? { textAlignVertical: 'center' } : null),
    fontWeight: '400',
  },
});

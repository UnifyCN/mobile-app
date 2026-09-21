import React, { useMemo, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Layout } from '@/constants/Layout';
import { supabase } from '@/lib/supabase';
import { createCustomChecklistTask } from '@/services/checklist/customChecklistTasks';
import { queryClient } from '@/lib/queryClient';
import { invalidateChecklistTasksQueries } from '@/hooks/checklist/checklistQueryKeys';
import { CustomPriority } from '@/types/checklist';
import { PRIORITY_CONFIG } from '@/constants/ChecklistPriority';

const PRIORITY_OPTIONS: CustomPriority[] = [
  'Do now',
  'Do soon',
  'Explore and connect',
  'Optional / later',
];

const PRIORITY_COLORS: Record<
  CustomPriority,
  { color: string; backgroundColor: string }
> = {
  'Do now': { color: '#E03B3B', backgroundColor: '#FBCFCF' },
  'Do soon': { color: '#F47734', backgroundColor: '#FBE4CF' },
  'Explore and connect': { color: '#F49E34', backgroundColor: '#FFEDBD' },
  'Optional / later': { color: '#5E8651', backgroundColor: '#CDE9D2' },
};

export default function CreateCustomItemScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [priority, setPriority] = useState<CustomPriority>('Do now');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const trimmedTitle = title.trim();
  const isFormValid = useMemo(() => trimmedTitle.length > 0, [trimmedTitle]);

  const handleSave = async () => {
    if (!isFormValid || isSaving) return;

    try {
      setIsSaving(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert(t('common.error'), t('common.errorSignIn'));
        return;
      }

      await createCustomChecklistTask({
        userId: user.id,
        priority,
        title: trimmedTitle,
        description,
      });

      await invalidateChecklistTasksQueries(queryClient);
      router.back();
    } catch (error) {
      Alert.alert(t('common.error'), t('common.errorGeneric'));
      console.error('Error creating custom checklist task:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + Layout.header.topInsetOffset },
      ]}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <MaterialIcons name='close' size={24} color='#111' />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('checklist.createItem.headerTitle')}</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={!isFormValid || isSaving}
          style={[
            styles.saveButton,
            (!isFormValid || isSaving) && styles.saveButtonDisabled,
          ]}
        >
          <Text
            style={[
              styles.saveButtonText,
              (!isFormValid || isSaving) && styles.saveButtonTextDisabled,
            ]}
          >
            {isSaving ? t('common.saving') : t('common.save')}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>{t('checklist.createItem.categoryLabel')}</Text>
      <View style={styles.priorityContainer}>
        {PRIORITY_OPTIONS.map(option => {
          const selected = priority === option;
          const { color, backgroundColor } = PRIORITY_COLORS[option];
          return (
            <TouchableOpacity
              key={option}
              onPress={() => setPriority(option)}
              style={[styles.priorityOption, selected && { backgroundColor }]}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.priorityOptionText,
                  selected && { color, fontWeight: '600' },
                ]}
              >
                {t(PRIORITY_CONFIG[option].labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>{t('checklist.createItem.titleLabel')}</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={t('checklist.createItem.titlePlaceholder')}
        placeholderTextColor='#8E8E93'
        style={styles.input}
        maxLength={120}
      />

      <Text style={styles.sectionLabel}>{t('checklist.createItem.descriptionLabel')}</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder={t('checklist.createItem.descriptionPlaceholder')}
        placeholderTextColor='#8E8E93'
        multiline
        style={[styles.input, styles.descriptionInput]}
        maxLength={280}
      />

      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.cancelButton}
      >
        <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '600',
    color: '#111',
    marginHorizontal: 8,
  },
  saveButton: {
    minWidth: 64,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  saveButtonDisabled: {
    backgroundColor: '#E5E5E5',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  saveButtonTextDisabled: {
    color: '#9E9E9E',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F1F1F',
    marginBottom: 8,
    marginTop: 6,
  },
  priorityContainer: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    padding: 6,
    marginBottom: 14,
  },
  priorityOption: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  priorityOptionText: {
    fontSize: 15,
    color: '#3A3A3A',
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111',
    marginBottom: 14,
  },
  descriptionInput: {
    minHeight: 108,
    textAlignVertical: 'top',
  },
  cancelButton: {
    alignSelf: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B6B6B',
  },
});

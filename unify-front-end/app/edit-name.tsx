import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import BackHeader from '@/components/BackHeader';
import { Theme } from '@/constants/Theme';
import { useCurrentUser } from '@/context/UserContext';
import { updateUsername } from '@/services/users/updateUsername';
import { updateFirstName } from '@/services/users/updateFirstName';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/context/ToastContext';

export default function EditNamePage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { currentUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [firstName, setFirstName] = useState(currentUser?.firstName ?? '');
  const [username, setUsername] = useState(currentUser?.username || '');
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (currentUser?.firstName !== undefined) {
      setFirstName(currentUser.firstName ?? '');
    }
    if (currentUser?.username) {
      setUsername(currentUser.username);
    }
  }, [currentUser]);

  const handleSave = async () => {
    setFirstNameError(null);
    setUsernameError(null);

    const normalizedFirstName = firstName.trim();
    const normalizedUsername = username.trim();
    const firstNameChanged =
      normalizedFirstName !== (currentUser?.firstName ?? '');
    const usernameChanged =
      normalizedUsername !== (currentUser?.username ?? '');

    if (!firstNameChanged && !usernameChanged) {
      router.back();
      return;
    }

    setIsSaving(true);
    let firstNameSucceeded = !firstNameChanged;
    let usernameSucceeded = !usernameChanged;

    try {
      if (firstNameChanged) {
        const result = await updateFirstName(normalizedFirstName);
        if (result.success) {
          firstNameSucceeded = true;
        } else {
          setFirstNameError(t('editName.failedUpdate'));
        }
      }

      if (usernameChanged) {
        const result = await updateUsername(normalizedUsername);
        if (result.success) {
          usernameSucceeded = true;
        } else {
          setUsernameError(result.error || t('editName.failedUpdate'));
        }
      }

      if (firstNameSucceeded && usernameSucceeded) {
        void queryClient.invalidateQueries({ queryKey: ['userInfo'] });
        Keyboard.dismiss();
        router.back();
        showToast(t('editName.successMessage'));
      } else {
        // Partial success — invalidate so the screen reflects the saved fields,
        // stay on the page so the user can retry the failed field.
        queryClient.invalidateQueries({ queryKey: ['userInfo'] });
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('editName.failedUpdate'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <BackHeader title={t('editName.title')} onBack={() => router.back()} />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps='handled'
      >
        {/* First name field */}
        <Text style={styles.label}>{t('editName.firstNameLabel')}</Text>
        <TextInput
          style={[styles.input, firstNameError && styles.inputError]}
          value={firstName}
          onChangeText={setFirstName}
          placeholder={t('editName.firstNamePlaceholder')}
          placeholderTextColor='#999'
          maxLength={24}
          autoCapitalize='words'
          autoCorrect={false}
        />
        <Text style={styles.characterCount}>{firstName.length}/24</Text>
        {firstNameError ? (
          <Text style={styles.errorText}>{firstNameError}</Text>
        ) : (
          <Text style={styles.helper}>{t('editName.firstNameHelper')}</Text>
        )}

        {/* Username field */}
        <Text style={[styles.label, styles.labelSpaced]}>
          {t('editName.usernameLabel')}
        </Text>
        <TextInput
          style={[styles.input, usernameError && styles.inputError]}
          value={username}
          onChangeText={setUsername}
          placeholder={t('editName.placeholder')}
          placeholderTextColor='#999'
          maxLength={20}
          autoCapitalize='none'
          autoCorrect={false}
        />
        <Text style={styles.characterCount}>{username.length}/20</Text>
        {usernameError ? (
          <Text style={styles.errorText}>{usernameError}</Text>
        ) : (
          <Text style={styles.helper}>{t('editName.usernameHelper')}</Text>
        )}

        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Text style={styles.saveButtonText}>
            {isSaving ? t('common.saving') : t('common.save')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  label: {
    fontSize: 20,
    fontWeight: '700',
    color: Theme.black,
    marginBottom: 12,
  },
  labelSpaced: {
    marginTop: 24,
  },
  input: {
    height: 56,
    borderWidth: 1,
    borderColor: Theme.black,
    borderRadius: 10,
    paddingHorizontal: 20,
    fontSize: 16,
    color: Theme.black,
  },
  inputError: {
    borderColor: '#f00',
  },
  characterCount: {
    fontSize: 12,
    color: Theme.textPostTime,
    marginTop: 8,
    textAlign: 'left',
  },
  helper: {
    fontSize: 12,
    color: Theme.textPostTime,
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#f00',
    marginTop: 4,
  },
  saveButton: {
    marginTop: 32,
    backgroundColor: Theme.primaryGatherRed,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.white,
  },
});

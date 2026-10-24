import { typography } from '@/constants/Typography';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Profile from '@/components/profile/Profile';
import { Theme } from '@/constants/Theme';

interface ProfilePageWrapperProps {
  userId?: string | string[];
  tab?: string | string[];
}

export default function ProfilePageWrapper({
  userId,
  tab,
}: ProfilePageWrapperProps) {
  const { t } = useTranslation();
  const normalizedUserId = Array.isArray(userId) ? userId[0] : userId;
  const normalizedTab = Array.isArray(tab) ? tab[0] : tab;

  if (!normalizedUserId) {
    return (
      <View style={styles.container}>
        <Text style={styles.messageText}>
          {t('profile.invalidProfileLink')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Profile userId={normalizedUserId} initialTab={normalizedTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  messageText: {
    ...typography.body,
    marginTop: 24,
    textAlign: 'center',
    color: Theme.textInput,
  },
});

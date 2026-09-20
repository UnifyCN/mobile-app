import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Modal,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LegalDocumentType } from '@/utils/legalUrls';
import { supabase } from '@/lib/supabase';
import BackHeader from '@/components/BackHeader';
import { Avatar } from '@/components/Avatar';
import { useState, useEffect } from 'react';
import { Feather } from '@expo/vector-icons';
import { Theme } from '@/constants/Theme';
import { ProfilePictureUpload } from '@/components/profile/ProfilePictureUpload';
import { useCurrentUser } from '@/context/UserContext';
import { useAnalytics } from '@/utils/analytics';
import { useHapticsPreference } from '@/context/HapticsContext';
import { useLanguage } from '@/hooks/useLanguage';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n';
import { useOnboardingProfile } from '@/hooks/onboarding/useOnboardingProfile';
import { saveOnboardingProfile } from '@/services/onboarding/saveOnboardingProfile';
import { unregisterPushToken } from '@/services/push/pushNotifications';
import { useQueryClient } from '@tanstack/react-query';

const ACCOUNT_ROW_DANGER_COLOR = '#FF3B30';

export default function AccountSettingsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { currentUser } = useCurrentUser();
  const [modalVisible, setModalVisible] = useState(false);
  const [deleteAccountModalVisible, setDeleteAccountModalVisible] =
    useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const { trackScreen, trackUserSignedOut, trackAccountDeleted } =
    useAnalytics();
  const { hapticsEnabled, setHapticsEnabled } = useHapticsPreference();
  const { currentLanguage, changeLanguage } = useLanguage();
  const { data: onboardingProfile } = useOnboardingProfile(currentUser?.id);
  const queryClient = useQueryClient();
  const [notificationsEnabled, setNotificationsEnabled] = useState<
    boolean | null
  >(null);

  // Track screen view on mount
  useEffect(() => {
    trackScreen('Account Settings');
  }, [trackScreen]);

  // Sync notification toggle with onboarding profile
  useEffect(() => {
    if (onboardingProfile?.wants_reminders !== undefined) {
      setNotificationsEnabled(onboardingProfile.wants_reminders);
    }
  }, [onboardingProfile?.wants_reminders]);

  const onLogout = async () => {
    try {
      try {
        await unregisterPushToken();
      } catch (e) {
        console.error('Failed to unregister push token on logout:', e);
      }
      await supabase.auth.signOut();
      // Track only after signOut resolves successfully — otherwise a failed
      // signOut would record a phantom user_signed_out.
      // useAnalyticsIdentitySync handles posthog.reset() on session change.
      trackUserSignedOut('manual');
    } catch (err) {
      console.error('Logout failed', err);
    }
  };

  const toggleHaptics = () => {
    setHapticsEnabled(!hapticsEnabled);
  };

  const toggleNotifications = async () => {
    if (!currentUser?.id || notificationsEnabled === null) return;
    const newValue = !notificationsEnabled;
    setNotificationsEnabled(newValue);
    try {
      await saveOnboardingProfile(currentUser.id, {
        ...(onboardingProfile || {}),
        wants_reminders: newValue,
      });
      queryClient.invalidateQueries({ queryKey: ['onboardingProfile'] });
    } catch (err) {
      console.error('Failed to update notification preference', err);
      setNotificationsEnabled(!newValue);
    }
  };

  const deleteAccount = async () => {
    if (isDeletingAccount) return;
    setIsDeletingAccount(true);
    try {
      try {
        await unregisterPushToken();
      } catch (e) {
        console.error('Failed to unregister push token on delete:', e);
      }
      const { error } = await supabase.rpc('delete_user');
      if (error) throw error;
      trackAccountDeleted();
      setDeleteAccountModalVisible(false);
      Alert.alert(
        t('settings.accountDeleted'),
        t('settings.accountDeletedMessage'),
        [
          {
            text: t('common.ok'),
            onPress: async () => {
              try {
                await supabase.auth.signOut();
                trackUserSignedOut('account_deleted');
              } catch (e) {
                console.error('Sign-out after account delete failed:', e);
              }
            },
          },
        ]
      );
    } catch (err) {
      console.error('Delete account failed', err);
      Alert.alert(
        t('settings.couldNotDelete'),
        t('settings.couldNotDeleteMessage')
      );
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // Note: pathname uses 'as any' because expo-router generates types at build time
  // and legal-document.tsx may not be included in the typed routes yet
  const legalRows = [
    {
      title: t('settings.privacyPolicy'),
      icon: 'file-text' as const,
      onPress: () =>
        router.push({
          pathname: '/legal-document' as any,
          params: { doc: 'privacyPolicy' satisfies LegalDocumentType },
        }),
    },
    {
      title: t('settings.communityGuidelines'),
      icon: 'users' as const,
      onPress: () =>
        router.push({
          pathname: '/legal-document' as any,
          params: { doc: 'communityGuidelines' satisfies LegalDocumentType },
        }),
    },
    {
      title: t('settings.termsOfService'),
      icon: 'book-open' as const,
      onPress: () =>
        router.push({
          pathname: '/legal-document' as any,
          params: { doc: 'termsOfService' satisfies LegalDocumentType },
        }),
    },
  ];

  const accountRows = [
    {
      title: t('auth.logOut'),
      icon: 'log-out' as const,
      onPress: onLogout,
    },
    {
      title: t('settings.deleteAccount'),
      icon: 'trash-2' as const,
      onPress: () => setDeleteAccountModalVisible(true),
    },
  ];

  return (
    <View style={styles.container}>
      <BackHeader title={t('settings.title')} onBack={() => router.back()} />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <TouchableOpacity
              onPress={() => setModalVisible(true)}
              activeOpacity={0.8}
            >
              <Avatar
                profilePictureUrl={currentUser?.profilePictureUrl}
                username={currentUser?.username || ''}
                size={93}
              />
            </TouchableOpacity>
            {currentUser && (
              <ProfilePictureUpload
                currentPictureUrl={currentUser.profilePictureUrl}
                userId={currentUser.id}
                modalVisible={modalVisible}
                onClose={() => setModalVisible(false)}
              />
            )}
            <TouchableOpacity
              style={styles.cameraButton}
              onPress={() => setModalVisible(true)}
            >
              <View style={styles.cameraIconContainer}>
                <Feather name='camera' size={18} color={Theme.white} />
              </View>
            </TouchableOpacity>
          </View>
          <View style={styles.userInfoContainer}>
            <TouchableOpacity
              style={styles.nameRow}
              onPress={() => router.push('/edit-name')}
              activeOpacity={0.7}
            >
              <View style={styles.nameStack}>
                <Text style={styles.userName}>
                  {currentUser?.firstName || currentUser?.username || ''}
                </Text>
                {currentUser?.firstName ? (
                  <Text style={styles.userHandle}>@{currentUser.username}</Text>
                ) : null}
              </View>
              <Feather name='edit-3' size={20} color={Theme.black} />
            </TouchableOpacity>
            <Text style={styles.userEmail}>{currentUser?.email || ''}</Text>
          </View>
        </View>
        <View style={styles.rowsContainer}>
          <Text style={styles.sectionTitle}>{t('settings.preferences')}</Text>
          <View style={styles.settingsCard}>
            <View style={[styles.row, styles.toggleRow]}>
              <View style={styles.rowLabelContainer}>
                <View style={styles.bookmarkIconContainer}>
                  <Feather name='bell' size={24} color={Theme.black} />
                </View>
                <Text style={styles.rowText}>
                  {t('settings.learningReminders')}
                </Text>
              </View>
              <Pressable
                onPress={
                  notificationsEnabled !== null
                    ? toggleNotifications
                    : undefined
                }
                accessibilityRole='switch'
                accessibilityState={{ checked: notificationsEnabled ?? false }}
                accessibilityLabel={t('settings.learningReminders')}
                hitSlop={8}
                disabled={notificationsEnabled === null}
                style={[
                  styles.toggleTrack,
                  notificationsEnabled === null
                    ? styles.toggleTrackOff
                    : notificationsEnabled
                      ? styles.toggleTrackOn
                      : styles.toggleTrackOff,
                  notificationsEnabled === null && { opacity: 0.5 },
                ]}
              >
                <View style={styles.toggleThumb} />
              </Pressable>
            </View>
            <View style={[styles.row, styles.toggleRow]}>
              <View style={styles.rowLabelContainer}>
                <View style={styles.bookmarkIconContainer}>
                  <Feather name='zap' size={24} color={Theme.black} />
                </View>
                <Text style={styles.rowText}>{t('settings.haptics')}</Text>
              </View>
              <Pressable
                onPress={toggleHaptics}
                accessibilityRole='switch'
                accessibilityState={{ checked: hapticsEnabled }}
                accessibilityLabel={t('settings.haptics')}
                hitSlop={8}
                style={[
                  styles.toggleTrack,
                  hapticsEnabled ? styles.toggleTrackOn : styles.toggleTrackOff,
                ]}
              >
                <View style={styles.toggleThumb} />
              </Pressable>
            </View>
            <TouchableOpacity
              style={[styles.row, styles.toggleRow]}
              onPress={() => setLanguageModalVisible(true)}
              activeOpacity={0.7}
            >
              <View style={styles.rowLabelContainer}>
                <View style={styles.bookmarkIconContainer}>
                  <Feather name='globe' size={24} color={Theme.black} />
                </View>
                <Text style={styles.rowText}>{t('language.title')}</Text>
              </View>
              <View style={styles.languageValueContainer}>
                <Text style={styles.languageValueText}>
                  {SUPPORTED_LANGUAGES[currentLanguage]}
                </Text>
                <Feather name='chevron-right' size={18} color='#8E8E93' />
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push('/redo-onboarding' as any)}
            >
              <View style={styles.bookmarkIconContainer}>
                <Feather name='refresh-cw' size={24} color={Theme.black} />
              </View>
              <Text style={styles.rowText}>{t('settings.redoOnboarding')}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />

          {/* Community Section — iOS-only (referrals are App Store only for now) */}
          {Platform.OS === 'ios' ? (
            <>
              <Text style={styles.sectionTitle}>{t('settings.community')}</Text>
              <View style={styles.settingsCard}>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => router.push('/refer-a-friend' as any)}
                  accessibilityRole='button'
                  accessibilityLabel={t('settings.referAFriend')}
                >
                  <View style={styles.bookmarkIconContainer}>
                    <Feather name='gift' size={24} color={Theme.black} />
                  </View>
                  <Text style={styles.rowText}>
                    {t('settings.referAFriend')}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.divider} />
            </>
          ) : null}

          {/* Legal Section */}
          <Text style={styles.sectionTitle}>{t('settings.legal')}</Text>
          <View style={styles.settingsCard}>
            {legalRows.map((row, index) => (
              <TouchableOpacity
                key={index}
                style={styles.row}
                onPress={row.onPress}
              >
                <View style={styles.bookmarkIconContainer}>
                  <Feather name={row.icon} size={24} color={Theme.black} />
                </View>
                <Text style={styles.rowText}>{row.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.divider} />

          {/* Account Section */}
          <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
          <View style={styles.settingsCard}>
            {accountRows.map((row, index) => (
              <TouchableOpacity
                key={index}
                style={styles.row}
                onPress={row.onPress}
              >
                <View style={styles.bookmarkIconContainer}>
                  <Feather
                    name={row.icon}
                    size={24}
                    color={ACCOUNT_ROW_DANGER_COLOR}
                  />
                </View>
                <Text style={styles.rowTextDanger}>{row.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Language selection modal */}
      <Modal
        animationType='fade'
        transparent
        visible={languageModalVisible}
        onRequestClose={() => setLanguageModalVisible(false)}
      >
        <Pressable
          style={styles.deleteModalOverlay}
          onPress={() => setLanguageModalVisible(false)}
        >
          <View style={styles.languageModalCard}>
            <Pressable onPress={e => e.stopPropagation()}>
              <Text style={styles.languageModalTitle}>
                {t('language.selectLanguage')}
              </Text>
              {(
                Object.entries(SUPPORTED_LANGUAGES) as [
                  SupportedLanguage,
                  string,
                ][]
              ).map(([code, label]) => (
                <TouchableOpacity
                  key={code}
                  style={[
                    styles.languageOption,
                    currentLanguage === code && styles.languageOptionSelected,
                  ]}
                  onPress={async () => {
                    await changeLanguage(code);
                    setLanguageModalVisible(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.languageOptionText,
                      currentLanguage === code &&
                        styles.languageOptionTextSelected,
                    ]}
                  >
                    {label}
                  </Text>
                  {currentLanguage === code && (
                    <Feather name='check' size={20} color={Theme.black} />
                  )}
                </TouchableOpacity>
              ))}
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Delete account confirmation modal */}
      <Modal
        animationType='fade'
        transparent
        visible={deleteAccountModalVisible}
        onRequestClose={() => {
          if (!isDeletingAccount) setDeleteAccountModalVisible(false);
        }}
      >
        <Pressable
          style={styles.deleteModalOverlay}
          onPress={() => {
            if (!isDeletingAccount) setDeleteAccountModalVisible(false);
          }}
        >
          <View style={styles.deleteModalCard}>
            <Pressable onPress={e => e.stopPropagation()}>
              <Text style={styles.deleteModalTitle}>
                {t('settings.deleteAccountTitle')}
              </Text>
              <Text style={styles.deleteModalMessage}>
                {t('settings.deleteAccountMessage')}
              </Text>
              <View style={styles.deleteModalButtons}>
                <TouchableOpacity
                  style={styles.deleteModalCancel}
                  onPress={() => setDeleteAccountModalVisible(false)}
                  disabled={isDeletingAccount}
                >
                  <Text style={styles.deleteModalCancelText}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.deleteModalConfirm,
                    isDeletingAccount && { opacity: 0.5 },
                  ]}
                  onPress={deleteAccount}
                  disabled={isDeletingAccount}
                >
                  <Text style={styles.deleteModalConfirmText}>
                    {isDeletingAccount
                      ? t('settings.deleting')
                      : t('common.delete')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
    paddingTop: 20,
    paddingBottom: 40,
    gap: 25,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  avatarContainer: {
    position: 'relative',
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  cameraIconContainer: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Theme.primaryGatherRed,
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfoContainer: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    fontSize: 24,
    fontWeight: '600',
    color: Theme.black,
  },
  nameStack: {
    flexDirection: 'column',
  },
  userHandle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  userEmail: {
    fontSize: 14,
    color: '#343434',
  },
  settingsCard: {
    flexDirection: 'column',
    gap: 15,
  },
  rowsContainer: {
    flexDirection: 'column',
    gap: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  toggleRow: {
    justifyContent: 'space-between',
  },
  rowLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  toggleTrack: {
    width: 52,
    height: 30,
    borderRadius: 999,
    padding: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleTrackOn: {
    backgroundColor: Theme.primaryGatherRed,
    justifyContent: 'flex-end',
  },
  toggleTrackOff: {
    backgroundColor: Theme.surfaceGray,
    justifyContent: 'flex-start',
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Theme.white,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
    elevation: 2,
  },
  bookmarkIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowText: {
    fontSize: 18,
    color: Theme.black,
  },
  rowTextDanger: {
    fontSize: 18,
    color: ACCOUNT_ROW_DANGER_COLOR,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e4e4e4',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textInput,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  languageValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  languageValueText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  languageModalCard: {
    backgroundColor: Theme.white,
    borderRadius: 16,
    padding: 8,
    width: '100%',
    maxWidth: 340,
  },
  languageModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Theme.black,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  languageOptionSelected: {
    backgroundColor: '#F5F5F5',
  },
  languageOptionText: {
    fontSize: 17,
    color: '#333',
  },
  languageOptionTextSelected: {
    fontWeight: '600',
    color: Theme.black,
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  deleteModalCard: {
    backgroundColor: Theme.white,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  deleteModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Theme.black,
    marginBottom: 12,
  },
  deleteModalMessage: {
    fontSize: 16,
    color: Theme.textInput,
    lineHeight: 22,
    marginBottom: 24,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  deleteModalCancel: {
    paddingVertical: 12,
    width: '50%',
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.surfaceTextInput,
    alignItems: 'center',
  },
  deleteModalCancelText: {
    fontSize: 16,
    color: Theme.black,
    fontWeight: '500',
  },
  deleteModalConfirm: {
    width: '50%',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteModalConfirmText: {
    fontSize: 16,
    color: Theme.white,
    fontWeight: '600',
  },
});

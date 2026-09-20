import React, { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  AccessibilityInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckBox } from 'react-native-elements';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import isExpoGo from '../../utils/isExpoGo';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { useQueryClient } from '@tanstack/react-query';
import { getUserInfo } from '@/services/users/getUserInfo';
import * as AppleAuthentication from 'expo-apple-authentication';
import Google from '../../assets/images/Google.svg';
import { createUserIfNotExists } from '../../utils/createUserIfNotExists';
import { SimpleTextField } from './Components';
import { useAnalytics } from '@/utils/analytics';
import LegalWebView from '@/components/LegalWebView';
import {
  LEGAL_URLS,
  LEGAL_TITLE_KEYS,
  LegalDocumentType,
} from '@/utils/legalUrls';

// Auth component scaling factor (0.87) — shared convention across all auth screens
const S = 0.87;

export function SignUp({
  onSwitchToSignIn,
  onShowOTP,
  onBack,
}: {
  onSwitchToSignIn?: () => void;
  onShowOTP?: (email: string, password: string, acceptedAt: string) => void;
  onBack?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const {
    trackSignUpStarted,
    trackSignUpCompleted,
    trackSignUpFailed,
    trackSignInCompleted,
    trackGoogleSignInUsed,
    trackAppleSignInUsed,
  } = useAnalytics();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [passwordVisible, setPasswordVisible] = React.useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] =
    React.useState(false);
  const [isEmailValid, setIsEmailValid] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [isChecked, setIsChecked] = React.useState(false);
  // True after the user tried to continue without accepting the legal terms.
  // Drives the red state on the checkbox row so the blocker is visible next
  // to the control that clears it, not only in the generic error slot above.
  const [consentError, setConsentError] = React.useState(false);
  const [webViewDoc, setWebViewDoc] = useState<LegalDocumentType | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  useEffect(() => {
    trackSignUpStarted();
  }, [trackSignUpStarted]);

  const validateEmail = (emailInput: string) => {
    setIsEmailValid(emailRegex.test(emailInput.trim()));
  };

  const toggleConsent = () => {
    setIsChecked(prev => !prev);
    setConsentError(false);
  };

  /**
   * Shared guard for every sign-up path. The email button is disabled until
   * the box is ticked, but the Google and Apple buttons are always enabled, so
   * this is the only place OAuth users learn that consent is required.
   */
  const requireConsent = (method: 'email' | 'google' | 'apple'): boolean => {
    if (isChecked) return true;
    setConsentError(true);
    setErrorMessage(null);
    trackSignUpFailed('terms_not_accepted', method);
    AccessibilityInfo.announceForAccessibility(t('auth.acceptTermsRequired'));
    scrollRef.current?.scrollToEnd({ animated: true });
    return false;
  };

  const handleSignUp = async () => {
    if (password !== confirmPassword) {
      setErrorMessage(t('auth.passwordsDoNotMatch'));
      trackSignUpFailed('passwords_mismatch');
      return;
    }

    if (!isEmailValid) {
      setErrorMessage(t('auth.invalidEmail'));
      trackSignUpFailed('invalid_email');
      return;
    }

    if (!requireConsent('email')) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('email')
        .eq('email', normalizedEmail)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        setErrorMessage(t('auth.failedEmailCheck'));
        trackSignUpFailed('email_check_failed');
        setLoading(false);
        return;
      }

      if (existingUser) {
        setErrorMessage(t('auth.emailAlreadyExists'));
        trackSignUpFailed('email_already_exists');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: password,
      });

      if (error) {
        setErrorMessage(error.message);
        trackSignUpFailed(error.code || 'signup_failed');
        setLoading(false);
        return;
      }

      trackSignUpCompleted('email');
      const acceptedAt = new Date().toISOString();
      onShowOTP?.(normalizedEmail, password, acceptedAt);
      return;
    } catch (error) {
      setErrorMessage(t('auth.signUpError'));
      trackSignUpFailed('unknown_error');
      setLoading(false);
    }
  };

  React.useEffect(() => {
    GoogleSignin.configure({
      iosClientId:
        '718278262223-rfq8s91jg7o9lmif54gcuibf4732ce7l.apps.googleusercontent.com',
      webClientId:
        '718278262223-f9pif0vn68o30v4ppskpllo6ka0hjvj2.apps.googleusercontent.com',
      scopes: ['email', 'profile', 'openid'],
      offlineAccess: true,
      forceCodeForRefreshToken: false,
    });
  }, []);

  const handleGoogleSignIn = async () => {
    if (isExpoGo) return;
    if (!requireConsent('google')) return;

    setLoading(true);
    setErrorMessage(null);
    trackGoogleSignInUsed('sign_up');

    try {
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices();
      }
      const signInResult: any = await GoogleSignin.signIn();
      const googleGivenName: string | null =
        signInResult?.data?.user?.givenName ??
        signInResult?.user?.givenName ??
        null;

      const { idToken } = await GoogleSignin.getTokens();
      if (idToken) {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        });
        if (error) {
          setErrorMessage(error.message);
          setLoading(false);
          return;
        }

        if (data?.user?.id && data?.user?.email) {
          const acceptedAt = new Date().toISOString();
          try {
            // SignUp path: the checkbox gates form submission, so by the time
            // we reach here the user has consented. Persist it now so the
            // AuthWrapper backup gate doesn't re-prompt for the same consent.
            await createUserIfNotExists(data.user.id, data.user.email, {
              privacyPolicyAcceptedAt: acceptedAt,
              communityGuidelinesAcceptedAt: acceptedAt,
              firstName: googleGivenName,
            });
          } catch (userCreationError: any) {
            console.error('Failed to create user record:', userCreationError);
            setErrorMessage(
              userCreationError?.message || t('auth.failedSignUpSetup')
            );
            setLoading(false);
            return;
          }

          // Seed the legal status cache so AuthWrapper doesn't flash the
          // consent modal during the gap between session-set and the
          // userLegalStatus query refetch landing.
          queryClient.setQueryData(['userLegalStatus', data.user.id], {
            privacy_policy_accepted_at: acceptedAt,
            community_guidelines_accepted_at: acceptedAt,
          });

          await queryClient.ensureQueryData({
            queryKey: ['userInfo', data.user.id],
            queryFn: () => getUserInfo(data.user.id),
          });
          trackSignInCompleted('google');
        } else if (data?.user?.id && !data?.user?.email) {
          setErrorMessage(t('auth.googleNoEmail'));
          setLoading(false);
          return;
        } else if (!data?.user?.id) {
          setErrorMessage(t('auth.googleNoUser'));
          setLoading(false);
          return;
        }
      } else {
        setErrorMessage(t('auth.googleNoToken'));
      }
    } catch (error: any) {
      if (error?.code === statusCodes.IN_PROGRESS) {
        setLoading(false);
        return;
      }
      if (error?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setErrorMessage(t('auth.googlePlayNotAvailable'));
        setLoading(false);
        return;
      }
      setErrorMessage(error?.message || t('auth.googleSignInFailed'));
    }
    setLoading(false);
  };

  const handleAppleSignIn = async () => {
    if (isExpoGo) return;
    if (!requireConsent('apple')) return;

    setLoading(true);
    setErrorMessage(null);
    trackAppleSignInUsed('sign_up');

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      // Apple returns fullName ONLY on the very first sign-in for this Apple ID.
      // If it's missing on subsequent attempts, we silently pass null.
      const appleGivenName = credential.fullName?.givenName ?? null;

      if (credential.identityToken) {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });

        if (error) {
          setErrorMessage(error.message);
          setLoading(false);
          return;
        }

        if (data?.user?.id && data?.user?.email) {
          const acceptedAt = new Date().toISOString();
          try {
            // SignUp path: same as Google — the consent checkbox has already
            // gated form submission, so persist the timestamp here so the
            // post-auth AuthWrapper modal doesn't ask the user a second time.
            await createUserIfNotExists(data.user.id, data.user.email, {
              privacyPolicyAcceptedAt: acceptedAt,
              communityGuidelinesAcceptedAt: acceptedAt,
              firstName: appleGivenName,
            });
          } catch (userCreationError: any) {
            console.error('Failed to create user record:', userCreationError);
            setErrorMessage(
              userCreationError?.message || t('auth.failedSignUpSetup')
            );
            setLoading(false);
            return;
          }

          // Seed the legal status cache (see Google handler for rationale).
          queryClient.setQueryData(['userLegalStatus', data.user.id], {
            privacy_policy_accepted_at: acceptedAt,
            community_guidelines_accepted_at: acceptedAt,
          });

          await queryClient.ensureQueryData({
            queryKey: ['userInfo', data.user.id],
            queryFn: () => getUserInfo(data.user.id),
          });
          trackSignInCompleted('apple');
        } else if (data?.user?.id && !data?.user?.email) {
          setErrorMessage(t('auth.appleNoEmail'));
          setLoading(false);
          return;
        } else if (!data?.user?.id) {
          setErrorMessage(t('auth.appleNoUser'));
          setLoading(false);
          return;
        }
      } else {
        setErrorMessage(t('auth.appleNoToken'));
      }
    } catch (error: any) {
      if (error?.code === 'ERR_REQUEST_CANCELED') {
        setLoading(false);
        return;
      }
      setErrorMessage(error?.message || t('auth.appleSignUpFailed'));
    }
    setLoading(false);
  };

  const isFormValid =
    isEmailValid && !!password && !!confirmPassword && isChecked;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps='handled'
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        {onBack && (
          <Pressable onPress={onBack} style={styles.backButton} hitSlop={12}>
            <Ionicons name='chevron-back' size={24 * S} color='#000' />
          </Pressable>
        )}

        {/* Header */}
        <Text style={styles.header}>{t('auth.createAccount')}</Text>
        <View style={styles.subHeaderRow}>
          <Text style={styles.subHeaderText}>{t('auth.alreadyHaveAccount')}</Text>
          <Text style={styles.subHeaderLink} onPress={onSwitchToSignIn}>
            {t('auth.logIn')}
          </Text>
        </View>

        {/* Email field */}
        <View style={styles.fieldContainer}>
          <View style={styles.inputWithIconContainer}>
            <Ionicons
              name='mail-outline'
              size={20 * S}
              color='#999'
              style={styles.fieldLeftIcon}
            />
            <SimpleTextField
              value={email}
              onChangeText={text => {
                setEmail(text);
                validateEmail(text);
              }}
              placeholder={t('auth.emailAddress')}
              placeholderTextColor='#999'
              style={[
                styles.textField,
                styles.textFieldWithLeftIcon,
                errorMessage && styles.textFieldError,
              ]}
              autoCapitalize='none'
              keyboardType='email-address'
            />
            {isEmailValid && (
              <MaterialIcons
                name='check-circle'
                size={20 * S}
                color='#333'
                style={styles.fieldRightIcon}
              />
            )}
          </View>
        </View>

        {/* Password field */}
        <View style={styles.fieldContainer}>
          <View style={styles.inputWithIconContainer}>
            <Ionicons
              name='lock-closed-outline'
              size={20 * S}
              color='#999'
              style={styles.fieldLeftIcon}
            />
            <SimpleTextField
              value={password}
              onChangeText={setPassword}
              placeholder={t('auth.password')}
              placeholderTextColor='#999'
              style={[
                styles.textField,
                styles.textFieldWithLeftIcon,
                styles.textFieldWithRightIcon,
                errorMessage && styles.textFieldError,
              ]}
              secureTextEntry={!passwordVisible}
              autoCapitalize='none'
            />
            <TouchableOpacity
              onPress={() => setPasswordVisible(!passwordVisible)}
              style={styles.fieldRightIcon}
            >
              <MaterialIcons
                name={passwordVisible ? 'visibility' : 'visibility-off'}
                size={20 * S}
                color='#999'
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Confirm Password field */}
        <View style={styles.fieldContainer}>
          <View style={styles.inputWithIconContainer}>
            <Ionicons
              name='lock-closed-outline'
              size={20 * S}
              color='#999'
              style={styles.fieldLeftIcon}
            />
            <SimpleTextField
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={t('auth.confirmPassword')}
              placeholderTextColor='#999'
              style={[
                styles.textField,
                styles.textFieldWithLeftIcon,
                styles.textFieldWithRightIcon,
                errorMessage && styles.textFieldError,
              ]}
              secureTextEntry={!confirmPasswordVisible}
              autoCapitalize='none'
            />
            <TouchableOpacity
              onPress={() => setConfirmPasswordVisible(!confirmPasswordVisible)}
              style={styles.fieldRightIcon}
            >
              <MaterialIcons
                name={confirmPasswordVisible ? 'visibility' : 'visibility-off'}
                size={20 * S}
                color='#999'
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Error message */}
        {errorMessage && (
          <Text style={styles.errorMessage}>{errorMessage}</Text>
        )}

        {/* Legal checkbox */}
        <View
          style={[styles.checkboxRow, consentError && styles.checkboxRowError]}
        >
          <CheckBox
            checked={isChecked}
            onPress={toggleConsent}
            containerStyle={styles.checkboxContainer}
            iconType='material-community'
            checkedIcon='checkbox-marked'
            uncheckedIcon='checkbox-blank-outline'
            checkedColor='black'
            uncheckedColor={consentError ? '#f00' : 'black'}
            wrapperStyle={styles.checkboxWrapper}
            accessibilityRole='checkbox'
            accessibilityLabel={t('auth.acceptTermsRequired')}
            accessibilityState={{ checked: isChecked }}
          />
          <Text style={styles.checkboxText}>
            <Trans
              i18nKey='auth.legalSignUp'
              components={{
                terms: (
                  <Text
                    key='terms'
                    style={styles.checkboxLinkText}
                    onPress={() => setWebViewDoc('termsOfService')}
                    accessibilityRole='link'
                    accessibilityLabel={t('auth.accessibility.termsOfService')}
                  />
                ),
                privacy: (
                  <Text
                    key='privacy'
                    style={styles.checkboxLinkText}
                    onPress={() => setWebViewDoc('privacyPolicy')}
                    accessibilityRole='link'
                    accessibilityLabel={t('auth.accessibility.privacyPolicy')}
                  />
                ),
                guidelines: (
                  <Text
                    key='guidelines'
                    style={styles.checkboxLinkText}
                    onPress={() => setWebViewDoc('communityGuidelines')}
                    accessibilityRole='link'
                    accessibilityLabel={t('auth.accessibility.communityGuidelines')}
                  />
                ),
              }}
            />
          </Text>
        </View>
        {consentError && (
          <Text
            style={styles.consentErrorMessage}
            accessibilityLiveRegion='polite'
          >
            {t('auth.acceptTermsRequired')}
          </Text>
        )}

        {/* Sign Up button */}
        <TouchableOpacity
          onPress={handleSignUp}
          disabled={!isFormValid || loading}
          activeOpacity={0.8}
          style={[
            styles.signUpButton,
            !isFormValid && styles.signUpButtonDisabled,
          ]}
          accessibilityRole='button'
          accessibilityLabel={t('auth.signUp')}
          accessibilityState={{ disabled: !isFormValid || loading }}
        >
          {loading ? (
            <ActivityIndicator color='#fff' />
          ) : (
            <Text style={styles.signUpButtonText}>{t('auth.signUp')}</Text>
          )}
        </TouchableOpacity>

        {/* Or divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t('common.or')}</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Social icon buttons */}
        <View style={styles.socialRow}>
          <TouchableOpacity
            style={styles.socialIconButton}
            onPress={handleGoogleSignIn}
            accessibilityLabel={t('auth.signUpWithGoogle')}
            accessibilityRole='button'
          >
            <Google width={24 * S} height={24 * S} />
          </TouchableOpacity>
          {Platform.OS === 'ios' && !isExpoGo && (
            <TouchableOpacity
              style={styles.socialIconButton}
              onPress={handleAppleSignIn}
              accessibilityLabel={t('auth.signUpWithApple')}
              accessibilityRole='button'
            >
              <Ionicons name='logo-apple' size={26 * S} color='#000' />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Legal Document WebView Modal */}
      <Modal visible={webViewDoc !== null} animationType='slide'>
        {webViewDoc && (
          <LegalWebView
            url={LEGAL_URLS[webViewDoc]}
            title={t(LEGAL_TITLE_KEYS[webViewDoc])}
            onClose={() => setWebViewDoc(null)}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24 * S,
    paddingBottom: 24 * S,
  },
  backButton: {
    marginTop: 12 * S,
    alignSelf: 'flex-start',
  },
  header: {
    fontFamily: 'FunnelSans_600SemiBold',
    fontSize: 32 * S,
    color: '#000',
    marginTop: 48 * S,
  },
  subHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6 * S,
    marginBottom: 32 * S,
  },
  subHeaderText: {
    fontFamily: 'FunnelSans_400Regular',
    fontSize: 15 * S,
    color: '#666',
  },
  subHeaderLink: {
    fontFamily: 'FunnelSans_600SemiBold',
    fontSize: 15 * S,
    color: '#000',
  },
  fieldContainer: {
    marginBottom: 14 * S,
  },
  inputWithIconContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  fieldLeftIcon: {
    position: 'absolute',
    left: 14 * S,
    top: 16 * S,
    zIndex: 1,
  },
  fieldRightIcon: {
    position: 'absolute',
    right: 14 * S,
    top: 16 * S,
    zIndex: 1,
  },
  textField: {
    backgroundColor: '#F5F5F5',
    color: '#000',
    borderColor: '#E8E8E8',
    borderWidth: 1 * S,
    borderRadius: 12 * S,
    padding: 14 * S,
    height: 52 * S,
    fontSize: 15 * S,
    fontFamily: 'FunnelSans_400Regular',
  },
  textFieldWithLeftIcon: {
    paddingLeft: 44 * S,
  },
  textFieldWithRightIcon: {
    paddingRight: 44 * S,
  },
  textFieldError: {
    borderColor: '#f00',
  },
  errorMessage: {
    color: '#f00',
    fontSize: 13 * S,
    fontFamily: 'FunnelSans_400Regular',
    marginBottom: 8 * S,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8 * S,
    borderRadius: 8 * S,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingVertical: 4 * S,
    paddingRight: 8 * S,
  },
  checkboxRowError: {
    borderColor: '#f00',
    backgroundColor: '#fff4f4',
  },
  consentErrorMessage: {
    color: '#f00',
    fontSize: 13 * S,
    fontFamily: 'FunnelSans_400Regular',
    marginBottom: 12 * S,
  },
  checkboxContainer: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
    margin: 0,
    alignSelf: 'flex-start',
  },
  checkboxWrapper: {
    margin: 0,
    padding: 0,
  },
  checkboxText: {
    fontFamily: 'FunnelSans_400Regular',
    fontSize: 14 * S,
    color: '#000',
    flex: 1,
  },
  checkboxLinkText: {
    fontFamily: 'FunnelSans_400Regular',
    fontSize: 14 * S,
    color: '#5182C7',
    textDecorationLine: 'underline',
  },
  signUpButton: {
    backgroundColor: '#000',
    borderRadius: 40 * S,
    height: 52 * S,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8 * S,
  },
  signUpButtonDisabled: {
    backgroundColor: '#E7E7E9',
  },
  signUpButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 18 * S,
    fontFamily: 'FunnelSans_600SemiBold',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24 * S,
  },
  dividerLine: {
    flex: 1,
    height: 1 * S,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    fontFamily: 'FunnelSans_400Regular',
    color: '#999',
    fontSize: 14 * S,
    marginHorizontal: 16 * S,
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16 * S,
  },
  socialIconButton: {
    width: 60 * S,
    height: 52 * S,
    borderRadius: 12 * S,
    borderWidth: 1 * S,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

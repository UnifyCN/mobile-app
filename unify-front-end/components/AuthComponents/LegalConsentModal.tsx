import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Trans, useTranslation } from 'react-i18next';
import { CheckBox } from 'react-native-elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '@/constants/Theme';
import LegalWebView from '@/components/LegalWebView';
import { LEGAL_URLS, LEGAL_TITLE_KEYS } from '@/utils/legalUrls';

interface LegalConsentModalProps {
  visible: boolean;
  onAccept: () => Promise<void>;
  onCancel: () => void;
}

/**
 * Full-screen consent modal for Privacy Policy and Community Guidelines.
 * Used for Google sign-in users who bypass the SignUp form.
 * Features:
 * - Checkbox with tappable links
 * - Continue button (disabled until checked)
 * - Cancel returns user to auth screen
 * - Retry on network failure
 */
export default function LegalConsentModal({
  visible,
  onAccept,
  onCancel,
}: LegalConsentModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [isChecked, setIsChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webViewDoc, setWebViewDoc] = useState<
    'privacyPolicy' | 'communityGuidelines' | 'termsOfService' | null
  >(null);

  const handleAccept = async () => {
    if (!isChecked) return;

    setLoading(true);
    setError(null);

    try {
      await onAccept();
      // Success - parent will dismiss modal
    } catch (err: any) {
      setError(err?.message || t('auth.legal.failedSave'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    // Don't reset checkbox state here - parent will handle sign out
    onCancel();
  };

  const openDocument = (
    doc: 'privacyPolicy' | 'communityGuidelines' | 'termsOfService'
  ) => {
    setWebViewDoc(doc);
  };

  const closeDocument = () => {
    setWebViewDoc(null);
  };

  return (
    <Modal
      visible={visible}
      animationType='slide'
      presentationStyle='fullScreen'
    >
      {/* WebView overlay */}
      {webViewDoc && (
        <LegalWebView
          url={LEGAL_URLS[webViewDoc]}
          title={t(LEGAL_TITLE_KEYS[webViewDoc])}
          onClose={closeDocument}
        />
      )}

      {/* Main consent UI */}
      {!webViewDoc && (
        <View style={[styles.container, { paddingTop: insets.top + 40 }]}>
          <View style={styles.content}>
            <Text style={styles.title}>{t('auth.legal.beforeContinue')}</Text>
            <Text style={styles.subtitle}>
              {t('auth.legal.reviewPolicies')}
            </Text>

            {/* Checkbox row */}
            <View style={styles.checkboxRow}>
              <CheckBox
                checked={isChecked}
                onPress={() => setIsChecked(!isChecked)}
                containerStyle={styles.checkboxContainer}
                iconType='material-community'
                checkedIcon='checkbox-marked'
                uncheckedIcon='checkbox-blank-outline'
                checkedColor={Theme.black}
                uncheckedColor={Theme.black}
              />
              <Text style={styles.checkboxText}>
                <Trans
                  i18nKey='auth.legalConsent'
                  components={{
                    terms: (
                      <Text
                        key='terms'
                        style={styles.linkText}
                        onPress={() => openDocument('termsOfService')}
                        accessibilityRole='link'
                        accessibilityLabel={t('auth.accessibility.termsOfService')}
                      />
                    ),
                    privacy: (
                      <Text
                        key='privacy'
                        style={styles.linkText}
                        onPress={() => openDocument('privacyPolicy')}
                        accessibilityRole='link'
                        accessibilityLabel={t('auth.accessibility.privacyPolicy')}
                      />
                    ),
                    guidelines: (
                      <Text
                        key='guidelines'
                        style={styles.linkText}
                        onPress={() => openDocument('communityGuidelines')}
                        accessibilityRole='link'
                        accessibilityLabel={t('auth.accessibility.communityGuidelines')}
                      />
                    ),
                  }}
                />
              </Text>
            </View>

            {/* Error message */}
            {error && <Text style={styles.errorText}>{error}</Text>}
          </View>

          {/* Buttons */}
          <View
            style={[
              styles.buttonContainer,
              { paddingBottom: insets.bottom + 20 },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.continueButton,
                (!isChecked || loading) && styles.continueButtonDisabled,
              ]}
              onPress={handleAccept}
              disabled={!isChecked || loading}
            >
              {loading ? (
                <ActivityIndicator color={Theme.white} />
              ) : (
                <Text style={styles.continueButtonText}>
                  {error ? t('common.retry') : t('common.continue')}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.white,
    justifyContent: 'space-between',
  },
  content: {
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Theme.black,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: Theme.textInput,
    marginBottom: 32,
    lineHeight: 24,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkboxContainer: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
    margin: 0,
    marginRight: 8,
  },
  checkboxText: {
    flex: 1,
    fontSize: 16,
    color: Theme.black,
    lineHeight: 24,
  },
  linkText: {
    color: '#5182C7',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  errorText: {
    color: '#f00',
    fontSize: 14,
    marginTop: 16,
  },
  buttonContainer: {
    paddingHorizontal: 24,
    gap: 12,
  },
  continueButton: {
    backgroundColor: '#343434',
    borderRadius: 40,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  continueButtonDisabled: {
    backgroundColor: '#E7E7E9',
  },
  continueButtonText: {
    color: Theme.white,
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: Theme.textInput,
    fontSize: 16,
  },
});

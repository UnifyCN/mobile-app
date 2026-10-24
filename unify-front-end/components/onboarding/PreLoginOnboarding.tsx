import { typography } from '@/constants/Typography';
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import OnboardingPagination from './OnboardingPagination';
import BelongingScreen from './screens/BelongingScreen';
import ChecklistScreen from './screens/ChecklistScreen';
import CompanionScreen from './screens/CompanionScreen';
import LearnScreen from './screens/LearnScreen';
import { useLanguage } from '@/hooks/useLanguage';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TOTAL_STEPS = 4;

const SCREENS = [
  BelongingScreen,
  ChecklistScreen,
  CompanionScreen,
  LearnScreen,
];

interface PreLoginOnboardingProps {
  onFinish: () => void;
}

export default function PreLoginOnboarding({
  onFinish,
}: PreLoginOnboardingProps) {
  const { t } = useTranslation();
  const { currentLanguage, changeLanguage } = useLanguage();
  const [currentStep, setCurrentStep] = useState(0);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const handleFinish = useCallback(async () => {
    try {
      await AsyncStorage.setItem('onboardingCompleted', 'true');
    } catch (e) {
      console.error('Failed to save onboarding status:', e);
    }
    onFinish();
  }, [onFinish]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      const prevStep = currentStep - 1;
      scrollViewRef.current?.scrollTo({
        x: prevStep * SCREEN_WIDTH,
        animated: true,
      });
      setCurrentStep(prevStep);
    }
  }, [currentStep]);

  const handleContinue = useCallback(() => {
    if (currentStep === TOTAL_STEPS - 1) {
      handleFinish();
    } else {
      const nextStep = currentStep + 1;
      scrollViewRef.current?.scrollTo({
        x: nextStep * SCREEN_WIDTH,
        animated: true,
      });
      setCurrentStep(nextStep);
    }
  }, [currentStep, handleFinish]);

  const handleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const step = Math.max(
        0,
        Math.min(Math.round(offsetX / SCREEN_WIDTH), TOTAL_STEPS - 1)
      );
      setCurrentStep(step);
    },
    []
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header: Back + (Language · Skip) */}
      <View style={styles.header}>
        {currentStep > 0 ? (
          <Pressable onPress={handleBack} hitSlop={12}>
            <Text style={styles.headerButtonText}>
              {t('onboarding.backButton')}
            </Text>
          </Pressable>
        ) : (
          <View />
        )}
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => setLanguageModalVisible(true)}
            hitSlop={12}
            accessibilityRole='button'
            accessibilityLabel={t('language.selectLanguage')}
            style={styles.languagePill}
          >
            <Feather name='globe' size={14} color='#535353' />
            <Text style={styles.languagePillText}>
              {SUPPORTED_LANGUAGES[currentLanguage]}
            </Text>
          </Pressable>
          <Pressable onPress={handleFinish} hitSlop={12}>
            <Text style={styles.headerButtonText}>
              {t('onboarding.skipButton')}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Swipeable screens */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        scrollEventThrottle={16}
        style={styles.scrollView}
      >
        {SCREENS.map((ScreenComponent, index) => (
          <View key={index} style={styles.screenWrapper}>
            <ScreenComponent />
          </View>
        ))}
      </ScrollView>

      {/* Continue button */}
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.continueButton,
            pressed && styles.continueButtonPressed,
          ]}
          onPress={handleContinue}
        >
          <Text style={styles.continueText}>
            {currentStep === TOTAL_STEPS - 1
              ? t('onboarding.startNow')
              : t('onboarding.continue')}
          </Text>
        </Pressable>

        {/* Pagination dots */}
        <View style={styles.paginationWrapper}>
          <OnboardingPagination
            totalSteps={TOTAL_STEPS}
            currentStep={currentStep}
          />
        </View>
      </View>

      {/* Language selection modal */}
      <Modal
        animationType='fade'
        transparent
        visible={languageModalVisible}
        onRequestClose={() => setLanguageModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setLanguageModalVisible(false)}
        >
          <View style={styles.modalCard}>
            <Pressable onPress={e => e.stopPropagation()}>
              <Text style={styles.modalTitle}>
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
                    <Feather name='check' size={20} color='#000' />
                  )}
                </TouchableOpacity>
              ))}
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingTop: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  languagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#F5F5F5',
  },
  languagePillText: { ...typography.caption, color: '#535353' },
  headerButtonText: {
    ...typography.button,
    color: '#535353',
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  screenWrapper: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  footer: {
    paddingHorizontal: 38,
    paddingBottom: 20,
    gap: 16,
  },
  continueButton: {
    backgroundColor: '#000',
    height: 40,
    borderRadius: 12.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonPressed: {
    opacity: 0.85,
  },
  continueText: { ...typography.button, color: '#fff' },
  paginationWrapper: {
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 8,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    ...typography.cardTitle,
    color: '#000',
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
  languageOptionText: { ...typography.body, color: '#333' },
  languageOptionTextSelected: {
    fontWeight: '600',
    color: '#000',
  },
});

import { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useGlobalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { typography } from '@/constants/Typography';
import { useModuleAccess } from '@/hooks/learn/useModuleAccess';

export default function LearnStackLayout() {
  const router = useRouter();
  const { t } = useTranslation();
  // Every module route (a direct link, a checklist link, a saved lesson) has a
  // `moduleId` param, so one check here covers them all.
  const { moduleId } = useGlobalSearchParams<{ moduleId?: string }>();
  const { access, lookupFailed, retry } = useModuleAccess(moduleId);

  useEffect(() => {
    if (access === 'denied') router.replace('/(tabs)/Learn' as any);
  }, [access, router]);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
        }}
      />
      {/* Covers the module screen until its province tag is known, so a module
          for another province is never shown before the redirect. If the tag
          cannot be loaded the cover stays, with a way to retry or leave. */}
      {access !== 'allowed' && (
        <View style={styles.cover}>
          {lookupFailed ? (
            <>
              <Text style={styles.message}>{t('common.errorGeneric')}</Text>
              <Pressable
                accessibilityRole='button'
                onPress={retry}
                style={styles.action}
              >
                <Text style={styles.primary}>{t('common.retry')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole='button'
                onPress={() => router.replace('/(tabs)/Learn' as any)}
                style={styles.action}
              >
                <Text style={styles.secondary}>
                  {t('common.goBackToLearn')}
                </Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator accessibilityLabel={t('common.loading')} />
          )}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
    backgroundColor: '#fff',
  },
  message: {
    ...typography.body,
    color: '#191919',
    textAlign: 'center',
  },
  action: {
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  primary: { ...typography.button, color: '#191919' },
  secondary: { ...typography.label, color: '#2C4976' },
});

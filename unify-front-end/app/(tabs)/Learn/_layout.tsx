import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack, useGlobalSearchParams, useRouter } from 'expo-router';
import { useModuleAccess } from '@/hooks/learn/useModuleAccess';

export default function LearnStackLayout() {
  const router = useRouter();
  // Every module route (a direct link, a checklist link, a saved lesson) has a
  // `moduleId` param, so one check here covers them all.
  const { moduleId } = useGlobalSearchParams<{ moduleId?: string }>();
  const access = useModuleAccess(moduleId);

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
          for another province is never shown before the redirect. */}
      {access !== 'allowed' && (
        <View style={styles.cover}>
          <ActivityIndicator />
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
    backgroundColor: '#fff',
  },
});

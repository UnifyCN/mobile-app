import { typography } from '@/constants/Typography';
import { CIRCLES_ENABLED } from '@/constants/Features';
import { Redirect, Stack } from 'expo-router';

export default function CommunityMatchingLayout() {
  if (!CIRCLES_ENABLED) {
    return <Redirect href='/(tabs)/Gather/gather' />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitleStyle: { ...typography.cardTitle, color: '#111827' },
        headerShadowVisible: false,
        headerTintColor: '#111827',
      }}
    >
      <Stack.Screen name='index' options={{ headerShown: false }} />
      <Stack.Screen name='onboarding' options={{ headerShown: false }} />
      <Stack.Screen name='waiting-room' options={{ headerShown: false }} />
      <Stack.Screen
        name='complete-onboarding'
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name='circle/[circleId]/index'
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name='circle/[circleId]/chat'
        options={{ headerShown: false }}
      />
    </Stack>
  );
}

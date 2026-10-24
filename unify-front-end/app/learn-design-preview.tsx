import React from 'react';
import { Redirect, Stack } from 'expo-router';
import NativePreview from '@/examples/learn/NativePreview';
export default function LearnDesignPreview() {
  if (!__DEV__) return <Redirect href='/(tabs)/Learn' />;
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <NativePreview />
    </>
  );
}

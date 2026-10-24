import { typography } from '@/constants/Typography';
import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import LoadingDots from '@/assets/images/LoadingDots.svg';
import { Theme } from '@/constants/Theme';

const DOTS_ASPECT_RATIO = 347 / 394;
const DOTS_COLOR = '#D8492C';

type LoadingScreenProps = {
  message?: string;
};

export default function LoadingScreen({ message }: LoadingScreenProps) {
  const { t } = useTranslation();
  const displayMessage = message ?? t('loadingScreen.message');
  const { width, height } = useWindowDimensions();
  const dotsWidth = Math.max(width * 1.3, 430);
  const dotsHeight = dotsWidth * DOTS_ASPECT_RATIO;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View
          style={[
            styles.messageContainer,
            { marginTop: Math.max(88, height * 0.19) },
          ]}
        >
          <Text style={styles.message}>{displayMessage}</Text>
        </View>
        <View
          pointerEvents='none'
          style={[
            styles.dotsContainer,
            {
              width: dotsWidth,
              height: dotsHeight,
              left: (width - dotsWidth) / 2,
              bottom: Math.max(16, height * 0.08),
            },
          ]}
        >
          <LoadingDots
            width={dotsWidth}
            height={dotsHeight}
            color={DOTS_COLOR}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Theme.white,
  },
  container: {
    flex: 1,
    backgroundColor: Theme.white,
    overflow: 'hidden',
    alignItems: 'center',
  },
  messageContainer: {
    width: '100%',
    paddingHorizontal: 28,
    alignItems: 'center',
    zIndex: 1,
  },
  message: {
    ...typography.section,
    maxWidth: 300,
    textAlign: 'center',
    color: Theme.black,
    letterSpacing: -0.2,
  },
  dotsContainer: {
    position: 'absolute',
  },
});

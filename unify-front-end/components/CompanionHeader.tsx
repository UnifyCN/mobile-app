import { typography } from '@/constants/Typography';
import React, { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, X } from 'lucide-react-native';
import { Theme } from '@/constants/Theme';
import { TAB_HEADER_METRICS, getTabHeaderHeight } from '@/constants/TabHeader';

interface CompanionHeaderProps {
  title?: string;
  onBack?: () => void;
  backIcon?: 'chevron-left' | 'x';
  leftButton?: ReactNode;
  rightButton?: ReactNode;
  showBackButton?: boolean;
}

const CompanionHeader = ({
  title = '',
  onBack,
  backIcon = 'chevron-left',
  leftButton,
  rightButton,
  showBackButton = true,
}: CompanionHeaderProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const headerHeight = getTabHeaderHeight(insets.top);
  const BackIcon = backIcon === 'x' ? X : ChevronLeft;

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top,
          height: headerHeight,
        },
      ]}
    >
      {showBackButton ? (
        <Pressable
          accessibilityRole='button'
          accessibilityLabel={t('companion.goBack')}
          onPress={handleBack}
          style={({ pressed }) => [
            styles.actionButton,
            pressed && styles.actionButtonPressed,
          ]}
        >
          <BackIcon
            color='#000'
            size={TAB_HEADER_METRICS.iconSize}
            strokeWidth={TAB_HEADER_METRICS.iconStrokeWidth}
            absoluteStrokeWidth
          />
        </Pressable>
      ) : (
        leftButton || <View style={styles.placeholder} />
      )}
      <Text style={styles.title}>{title}</Text>
      {rightButton || <View style={styles.placeholder} />}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: TAB_HEADER_METRICS.horizontalPadding,
    backgroundColor: Theme.white,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  actionButton: {
    width: TAB_HEADER_METRICS.actionSize,
    height: TAB_HEADER_METRICS.actionSize,
    borderRadius: TAB_HEADER_METRICS.actionSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonPressed: {
    opacity: 0.7,
  },
  title: {
    ...typography.section,

    color: Theme.black,
  },
  placeholder: {
    width: TAB_HEADER_METRICS.actionSize,
    height: TAB_HEADER_METRICS.actionSize,
  },
});

export default CompanionHeader;

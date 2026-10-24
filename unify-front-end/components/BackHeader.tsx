import { typography } from '@/constants/Typography';
import React, { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '@/constants/Theme';
import { Layout, getHeaderHeight } from '@/constants/Layout';
interface BackHeaderProps {
  title?: string;
  onBack?: () => void;
  backIcon?: keyof typeof Feather.glyphMap;
  rightButton?: ReactNode;
  showBackButton?: boolean;
}

const BackHeader = ({
  title = '',
  onBack,
  backIcon = 'chevron-left',
  rightButton,
  showBackButton = true,
}: BackHeaderProps) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const headerHeight = getHeaderHeight(insets.top);

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
          paddingTop: insets.top + Layout.header.topInsetOffset,
          height: headerHeight,
        },
      ]}
    >
      {showBackButton ? (
        <TouchableOpacity onPress={handleBack}>
          <Feather name={backIcon} size={Layout.header.iconSize} color='#000' />
        </TouchableOpacity>
      ) : (
        <View style={styles.placeholder} />
      )}
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      {rightButton || <View style={styles.placeholder} />}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Layout.header.horizontalPadding,
    backgroundColor: Theme.white,
  },
  title: {
    ...typography.section,
    color: Theme.black,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  placeholder: {
    width: Layout.header.iconSize,
  },
});

export default BackHeader;

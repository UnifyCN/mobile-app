import { typography } from '@/constants/Typography';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BAR_LABEL_MAX_SCALE } from '@/utils/textScale';

export const TabIcon = ({ IconComponent, title, focused }: any) => {
  return (
    // The label stops growing with the other bar chrome; on iOS a long press shows it
    // in the Large Content Viewer, as on a system tab bar.
    <View
      testID='tab-icon'
      style={styles.tab}
      accessibilityShowsLargeContentViewer
      accessibilityLargeContentTitle={title}
    >
      <IconComponent
        height={styles.tabIcon.height}
        width={styles.tabIcon.width}
        color={focused ? styles.activeTab.color : styles.inactiveTab.color}
      />
      <Text
        style={[
          styles.tabText,
          focused ? styles.activeTab : styles.inactiveTab,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={BAR_LABEL_MAX_SCALE}
      >
        {title}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  tab: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    gap: 4,
    width: 70,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  tabText: {
    ...typography.tab,
  },
  tabIcon: {
    height: 24,
    width: 24,
    paddingVertical: 2,
    paddingHorizontal: 3,
  },
  activeTab: {
    color: '#000',
  },
  inactiveTab: {
    color: '#62605B',
  },
});

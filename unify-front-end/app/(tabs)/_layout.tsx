import { typography } from '@/constants/Typography';
import React from 'react';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { HIDDEN_TAB_BAR_ROUTES } from '@/constants/Routes';
import { useColorScheme } from '@/hooks/useColorScheme';
import { View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import LearnIcon from '@/components/icons/LearnPageIcon';
import CommunityIcon from '@/components/icons/CommunityIcon';
import CompanionIcon from '@/components/icons/CompanionIcon';
import SocialIcon from '@/components/icons/SocialIcon';
import { useAnalytics } from '@/utils/analytics';
import ChecklistIcon from '@/components/icons/ChecklistIcon';
import { useHapticsPreference } from '@/context/HapticsContext';

const TabIcon = ({ IconComponent, title, focused }: any) => {
  return (
    <View style={styles.tab}>
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
      >
        {title}
      </Text>
    </View>
  );
};

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const pathname = usePathname();
  const { trackTabSwitch } = useAnalytics();
  const { hapticsEnabled } = useHapticsPreference();
  const { t } = useTranslation();

  const getTabDisplayName = (routeName: string) => {
    switch (routeName) {
      case 'Social':
        return t('tabs.social');
      case 'Gather':
        return t('tabs.community');
      case 'companion':
        return t('tabs.companion');
      case 'Checklist':
        return t('tabs.checklist');
      case 'Learn':
        return t('tabs.learn');
      default:
        return routeName;
    }
  };

  // Stable, locale-independent labels for analytics so PostHog event values
  // don't fragment by user language.
  const getTabAnalyticsLabel = (routeName: string) => {
    switch (routeName) {
      case 'Social':
        return 'Social';
      case 'Gather':
        return 'Community';
      case 'companion':
        return 'Companion';
      case 'Checklist':
        return 'Checklist';
      case 'Learn':
        return 'Learn';
      default:
        return routeName;
    }
  };

  const getCurrentTabFromPath = (path: string) => {
    if (path.startsWith('/Gather')) return 'Gather';
    if (path.startsWith('/companion')) return 'companion';
    if (path.startsWith('/Checklist')) return 'Checklist';
    if (path.startsWith('/Learn')) return 'Learn';
    if (path.startsWith('/Social')) return 'Social';
    return 'Learn';
  };

  return (
    <>
      <Tabs
        initialRouteName='Learn'
        screenOptions={{
          tabBarActiveTintColor:
            Colors[colorScheme === 'light' ? 'light' : 'dark'].tint,
          tabBarShowLabel: false,
          headerShown: false,
          tabBarStyle: HIDDEN_TAB_BAR_ROUTES.some(route =>
            pathname.includes(route)
          )
            ? { display: 'none' }
            : {
                flexDirection: 'row',
                paddingTop: 12,
                paddingBottom: 52,
                borderTopWidth: 1,
                borderTopColor: '#F0F0F0',
              },
        }}
        screenListeners={{
          tabPress: e => {
            const routeName = e.target?.split('-')[0] || 'Learn';
            const currentTab = getCurrentTabFromPath(pathname);
            const isTabSwitch = routeName !== currentTab;

            if (isTabSwitch && hapticsEnabled) {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }

            // Track tab switch
            if (isTabSwitch) {
              trackTabSwitch(
                getTabAnalyticsLabel(currentTab),
                getTabAnalyticsLabel(routeName)
              );
            }

            if (routeName === 'Gather' && currentTab === 'Gather') {
              // Prevent redundant tab navigation; only pop to the root Gather screen
              e.preventDefault();
              if (pathname !== '/Gather') {
                router.replace('/(tabs)/Gather');
              }
            }
          },
        }}
      >
        <Tabs.Screen name='index' options={{ href: null }} />
        <Tabs.Screen
          name='Learn'
          options={{
            title: t('tabs.learn'),
            tabBarIcon: ({ focused }) => (
              <TabIcon
                IconComponent={LearnIcon}
                title={t('tabs.learn')}
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name='Checklist'
          options={{
            title: t('tabs.checklist'),
            tabBarIcon: ({ focused }) => (
              <TabIcon
                IconComponent={ChecklistIcon}
                title={t('tabs.checklist')}
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name='companion'
          options={{
            title: t('tabs.companion'),
            tabBarIcon: ({ focused }) => (
              <TabIcon
                IconComponent={CompanionIcon}
                title={t('tabs.companion')}
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name='Gather'
          options={{
            title: t('tabs.community'),
            tabBarIcon: ({ focused }) => (
              <TabIcon
                IconComponent={CommunityIcon}
                title={t('tabs.community')}
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name='Social'
          options={{
            title: t('tabs.social'),
            tabBarIcon: ({ focused }) => (
              <TabIcon
                IconComponent={SocialIcon}
                title={t('tabs.social')}
                focused={focused}
              />
            ),
          }}
        />
      </Tabs>
    </>
  );
}

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

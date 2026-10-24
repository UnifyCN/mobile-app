import { typography } from '@/constants/Typography';
import { StyleSheet, View, FlatList, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BackHeader from '@/components/BackHeader';
import { DailyTipCard } from '@/components/tips/DailyTipCard';
import { DailyTip } from '@/types/dailyTip';
import { Theme } from '@/constants/Theme';
import { usePastTips } from '@/hooks/tips/usePastTips';
import EmptyFeedMessage from '@/components/profile/EmptyFeedMessage';
import { Feather } from '@expo/vector-icons';

const PastTipsScreen = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: tips, isLoading } = usePastTips();

  const renderTipCard = ({ item }: { item: DailyTip }) => (
    <View style={styles.tipCardContainer}>
      <DailyTipCard
        tip={item}
        onPress={() =>
          router.push({
            pathname: '/tip-detail' as any,
            params: { tip: JSON.stringify(item) },
          })
        }
      />
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <BackHeader title={t('tips.pastTips')} />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{t('tips.loading')}</Text>
        </View>
      </View>
    );
  }

  if (!tips || tips.length === 0) {
    return (
      <View style={styles.container}>
        <BackHeader title={t('tips.pastTips')} />
        <View style={styles.emptyContainer}>
          <EmptyFeedMessage
            icon={<Feather name='sun' size={24} color='#B4B1B1' />}
            message={t('tips.noTips')}
            submessage={
              <Text
                style={{
                  ...typography.secondary,
                  color: Theme.textInput,
                  textAlign: 'center',
                }}
              >
                {t('tips.checkBackTomorrow')}
              </Text>
            }
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BackHeader title={t('tips.pastTips')} />
      <FlatList
        data={tips}
        renderItem={renderTipCard}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.white,
  },
  listContent: {
    padding: 20,
    gap: 16,
  },
  tipCardContainer: {
    marginBottom: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: { ...typography.body, color: Theme.textInput },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});

export default PastTipsScreen;

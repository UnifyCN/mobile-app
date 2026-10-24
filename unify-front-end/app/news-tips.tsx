import { typography } from '@/constants/Typography';
import { StyleSheet, View, FlatList, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BackHeader from '@/components/BackHeader';
import { NewsCard } from '@/components/home/NewsCard';
import { NewsDetails } from '@/types/news';
import { Theme } from '@/constants/Theme';
import { useNews } from '@/hooks/news/useNews';
import EmptyFeedMessage from '@/components/profile/EmptyFeedMessage';
import { Feather } from '@expo/vector-icons';

const NewsTipsScreen = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: news, isLoading } = useNews();

  const handleNewsPress = (news: NewsDetails) => {
    router.push({
      pathname: '/news-detail' as any,
      params: { news: JSON.stringify(news) },
    });
  };

  const renderNewsCard = ({ item }: { item: NewsDetails }) => (
    <View style={styles.newsCardContainer}>
      <NewsCard news={item} onPress={() => handleNewsPress(item)} />
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <BackHeader title={t('news.title')} />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{t('news.loading')}</Text>
        </View>
      </View>
    );
  }

  if (!news || news.length === 0) {
    return (
      <View style={styles.container}>
        <BackHeader title={t('news.title')} />
        <View style={styles.emptyContainer}>
          <EmptyFeedMessage
            icon={<Feather name='file-text' size={24} color='#B4B1B1' />}
            message={t('news.noNews')}
            submessage={
              <Text
                style={{
                  ...typography.secondary,
                  color: Theme.textInput,
                  textAlign: 'center',
                }}
              >
                {t('news.checkBackLater')}
              </Text>
            }
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BackHeader title={t('news.title')} />
      <FlatList
        data={news}
        renderItem={renderNewsCard}
        keyExtractor={item => item.id.toString()}
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
  newsCardContainer: {
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

export default NewsTipsScreen;

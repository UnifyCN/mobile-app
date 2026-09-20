import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import BackHeader from '@/components/BackHeader';
import { CATEGORY_CONFIG } from '@/components/tips/DailyTipCard';
import { DailyTip } from '@/types/dailyTip';
import { Theme } from '@/constants/Theme';
import { TranslateButton } from '@/components/home/TranslateButton';
import i18n from '@/i18n';

const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
};

function isDailyTip(value: unknown): value is DailyTip {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.persona === 'string' &&
    typeof v.stage === 'string' &&
    typeof v.date === 'string' &&
    typeof v.category === 'string' &&
    typeof v.title === 'string' &&
    typeof v.description === 'string' &&
    typeof v.tipText === 'string' &&
    (v.sourceRefs === null || Array.isArray(v.sourceRefs))
  );
}

const TipDetailScreen = () => {
  const { t } = useTranslation();
  const { tip } = useLocalSearchParams<{ tip: string }>();
  const router = useRouter();

  let tipData: DailyTip | null = null;
  try {
    const parsed = tip ? JSON.parse(tip) : null;
    if (isDailyTip(parsed)) {
      tipData = parsed;
    } else if (parsed) {
      console.error('Tip data failed validation:', Object.keys(parsed));
    }
  } catch (error) {
    console.error('Error parsing tip data:', error);
  }

  if (!tipData) {
    return (
      <View style={styles.container}>
        <BackHeader title='' />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t('tips.tipNotFound')}</Text>
        </View>
      </View>
    );
  }

  const config = CATEGORY_CONFIG[tipData.category] || CATEGORY_CONFIG.general;

  return (
    <View style={styles.container}>
      <BackHeader />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Category Header */}
        <LinearGradient
          colors={config.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.categoryHeader}
        >
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: config.accent + '18' },
            ]}
          >
            <Feather
              name={config.icon as any}
              size={24}
              color={config.accent}
            />
          </View>
          <View
            style={[
              styles.categoryBadge,
              { backgroundColor: config.accent + '14' },
            ]}
          >
            <Text style={[styles.categoryText, { color: config.accent }]}>
              {t(`tips.category.${tipData.category}`, {
                // Categories are generated server-side and the set can grow;
                // an unknown slug falls back to the old capitalisation rather
                // than rendering a raw key.
                defaultValue:
                  tipData.category.charAt(0).toUpperCase() +
                  tipData.category.slice(1),
              })}
            </Text>
          </View>
        </LinearGradient>

        {/* Date */}
        <Text style={styles.date}>{formatDate(tipData.date)}</Text>

        {/* Title */}
        <Text style={styles.title}>{tipData.title}</Text>

        {/* Description */}
        {tipData.description && (
          <Text style={styles.description}>{tipData.description}</Text>
        )}

        <View style={styles.divider} />

        {/* Full Tip Text */}
        <Text style={styles.tipText}>{tipData.tipText}</Text>

        {/* Machine translation of the title + tip text. Renders nothing when
            the UI language is English. Tips are always generated in English,
            so this is the only way to read one in another language. */}
        <View style={styles.translateRow}>
          <TranslateButton type='tip' id={tipData.id} />
        </View>

        {/* Source References */}
        {tipData.sourceRefs && tipData.sourceRefs.length > 0 && (
          <View style={styles.sourcesSection}>
            <Text style={styles.sourcesTitle}>{t('tips.sources')}</Text>
            {tipData.sourceRefs.map((ref, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => {
                  if (ref.url) {
                    Linking.openURL(ref.url).catch(err =>
                      console.error('Failed to open URL:', err)
                    );
                  }
                }}
                style={styles.sourceItem}
              >
                <Feather
                  name='external-link'
                  size={14}
                  color={Theme.surfaceBlue}
                />
                <Text style={styles.sourceText}>{ref.document_title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* See Past Tips */}
        <TouchableOpacity
          style={styles.pastTipsButton}
          onPress={() => router.push('/past-tips' as any)}
          activeOpacity={0.7}
        >
          <Text style={styles.pastTipsText}>{t('tips.seePastTips')}</Text>
          <Feather name='chevron-right' size={16} color={Theme.surfaceBlue} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.white,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  categoryHeader: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  date: {
    fontSize: 14,
    color: Theme.textInput,
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Theme.black,
    paddingHorizontal: 20,
    marginBottom: 8,
    lineHeight: 34,
  },
  description: {
    fontSize: 16,
    fontWeight: '500',
    color: Theme.textAlternateGray,
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  divider: {
    height: 1,
    backgroundColor: Theme.surfaceGray,
    marginHorizontal: 20,
    marginVertical: 20,
  },
  tipText: {
    fontSize: 18,
    color: Theme.black,
    paddingHorizontal: 20,
    lineHeight: 28,
  },
  translateRow: {
    paddingHorizontal: 20,
  },
  sourcesSection: {
    paddingHorizontal: 20,
    marginTop: 28,
  },
  sourcesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textInput,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  sourceText: {
    fontSize: 15,
    color: Theme.surfaceBlue,
    flex: 1,
  },
  pastTipsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 32,
    paddingVertical: 12,
    marginHorizontal: 20,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
  },
  pastTipsText: {
    fontSize: 15,
    fontWeight: '600',
    color: Theme.surfaceBlue,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
  },
});

export default TipDetailScreen;

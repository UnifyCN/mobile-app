import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Theme } from '@/constants/Theme';

interface OutcomeCardProps {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  description: string;
}

function OutcomeCard({ icon, title, description }: OutcomeCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardIcon}>
        <Feather name={icon} size={18} color={Theme.primaryGatherRed} />
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDescription}>{description}</Text>
      </View>
    </View>
  );
}

export default function OutcomesStep() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('preLogin.outcomes.heading')}</Text>
        <View style={styles.outcomesContainer}>
          <OutcomeCard
            icon='compass'
            title={t('preLogin.outcomes.navigate.title')}
            description={t('preLogin.outcomes.navigate.description')}
          />
          <OutcomeCard
            icon='zap'
            title={t('preLogin.outcomes.answers.title')}
            description={t('preLogin.outcomes.answers.description')}
          />
          <OutcomeCard
            icon='users'
            title={t('preLogin.outcomes.community.title')}
            description={t('preLogin.outcomes.community.description')}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 12,
    paddingBottom: 24,
    justifyContent: 'flex-start',
    backgroundColor: Theme.white,
  },
  content: {
    alignItems: 'flex-start',
    width: '100%',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Theme.black,
    marginBottom: 20,
    textAlign: 'left',
    lineHeight: 34,
  },
  outcomesContainer: {
    width: '100%',
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.surfaceGray,
    backgroundColor: Theme.surfaceEventCard,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.surfaceGray,
    backgroundColor: Theme.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Theme.black,
    lineHeight: 24,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 15,
    color: Theme.textInput,
    lineHeight: 22,
  },
});

// components/companion/StarterPrompts.tsx
import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Theme } from '@/constants/Theme';
import type { PersonalizedStarter } from '@/hooks/companion/usePersonalizedStarters';
import {
  getSeenStarterIds,
  markStarterSeen,
  clearSeenStarterIds,
} from '@/utils/companionStarterHistory';

interface StarterPromptsProps {
  onPromptSelect: (
    prompt: string,
    mode?: string,
    isPersonalized?: boolean
  ) => void;
  personalizedStarters?: PersonalizedStarter[];
}

interface StaticCard {
  id: string;
  label: string;
  prompt: string;
  mode?: string;
  iconName: keyof typeof Feather.glyphMap;
  iconBackground: string;
  description: string;
}

interface StaticCardDef {
  id: string;
  labelKey: string;
  promptKey: string;
  mode?: string;
  iconName: keyof typeof Feather.glyphMap;
  iconBackground: string;
  descriptionKey: string;
}

const MODE_CARD_DEFS: StaticCardDef[] = [
  { id: 'fact_check', labelKey: 'companion.starters.factCheck', promptKey: 'companion.starters.factCheckPrompt', mode: 'fact_check',
    iconName: 'search', iconBackground: '#4F7BCB',
    descriptionKey: 'companion.starters.factCheckDesc' },
  { id: 'form_help', labelKey: 'companion.starters.formHelp', promptKey: '', mode: 'form_help',
    iconName: 'file-text', iconBackground: '#F0A04B',
    descriptionKey: 'companion.starters.formHelpDesc' },
];

const TOPIC_STARTER_DEFS: StaticCardDef[] = [
  { id: 'ee_eligibility', labelKey: 'companion.starters.eeEligibility', promptKey: 'companion.starters.eeEligibilityPrompt',
    iconName: 'award', iconBackground: '#5C6BC0', descriptionKey: 'companion.starters.eeEligibilityDesc' },
  { id: 'ee_crs', labelKey: 'companion.starters.eeCrs', promptKey: 'companion.starters.eeCrsPrompt',
    iconName: 'bar-chart-2', iconBackground: '#5C6BC0', descriptionKey: 'companion.starters.eeCrsDesc' },
  { id: 'ee_rounds', labelKey: 'companion.starters.eeRounds', promptKey: 'companion.starters.eeRoundsPrompt',
    iconName: 'trending-up', iconBackground: '#5C6BC0', descriptionKey: 'companion.starters.eeRoundsDesc' },
  { id: 'sp_apply', labelKey: 'companion.starters.spApply', promptKey: 'companion.starters.spApplyPrompt',
    iconName: 'book-open', iconBackground: '#26A69A', descriptionKey: 'companion.starters.spApplyDesc' },
  { id: 'sp_pgwp', labelKey: 'companion.starters.spPgwp', promptKey: 'companion.starters.spPgwpPrompt',
    iconName: 'briefcase', iconBackground: '#26A69A', descriptionKey: 'companion.starters.spPgwpDesc' },
  { id: 'wp_types', labelKey: 'companion.starters.wpTypes', promptKey: 'companion.starters.wpTypesPrompt',
    iconName: 'tool', iconBackground: '#EF5350', descriptionKey: 'companion.starters.wpTypesDesc' },
  { id: 'wp_lmia', labelKey: 'companion.starters.wpLmia', promptKey: 'companion.starters.wpLmiaPrompt',
    iconName: 'clipboard', iconBackground: '#EF5350', descriptionKey: 'companion.starters.wpLmiaDesc' },
  { id: 'cit_eligibility', labelKey: 'companion.starters.citEligibility', promptKey: 'companion.starters.citEligibilityPrompt',
    iconName: 'flag', iconBackground: '#E3A0C9', descriptionKey: 'companion.starters.citEligibilityDesc' },
  { id: 'cit_test', labelKey: 'companion.starters.citTest', promptKey: 'companion.starters.citTestPrompt',
    iconName: 'edit-3', iconBackground: '#E3A0C9', descriptionKey: 'companion.starters.citTestDesc' },
  { id: 'settle_health', labelKey: 'companion.starters.settleHealth', promptKey: 'companion.starters.settleHealthPrompt',
    iconName: 'heart', iconBackground: '#66BB6A', descriptionKey: 'companion.starters.settleHealthDesc' },
  { id: 'settle_services', labelKey: 'companion.starters.settleServices', promptKey: 'companion.starters.settleServicesPrompt',
    iconName: 'users', iconBackground: '#66BB6A', descriptionKey: 'companion.starters.settleServicesDesc' },
];

const selectRandomTopicStarterDefs = (): StaticCardDef[] => {
  const categories = new Map<string, StaticCardDef[]>();
  TOPIC_STARTER_DEFS.forEach(card => {
    const existing = categories.get(card.iconBackground) || [];
    existing.push(card);
    categories.set(card.iconBackground, existing);
  });

  const selected: StaticCardDef[] = [];
  const categoryKeys = Array.from(categories.keys());
  for (let i = categoryKeys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [categoryKeys[i], categoryKeys[j]] = [categoryKeys[j], categoryKeys[i]];
  }
  for (const key of categoryKeys) {
    if (selected.length >= 3) break;
    const cards = categories.get(key)!;
    selected.push(cards[Math.floor(Math.random() * cards.length)]);
  }
  return selected;
};

const EMPTY_POOL: PersonalizedStarter[] = [];
const VISIBLE_SLOTS = 3;

function pickInitial(
  pool: PersonalizedStarter[],
  seen: Set<string>
): PersonalizedStarter[] {
  if (pool.length === 0) return [];
  // Render up to VISIBLE_SLOTS unseen chips. When fewer unseen remain than
  // slots, the personalized section shrinks gracefully — the user sees a 1-
  // or 2-chip section signalling they've explored most of their personalized
  // prompts. The mount-time effect resets `seen` only when zero unseen remain,
  // so we never need to fall back to seen entries here.
  return pool.filter(s => !seen.has(s.id)).slice(0, VISIBLE_SLOTS);
}

function pickReplacement(
  pool: PersonalizedStarter[],
  displayedIds: Set<string>,
  seen: Set<string>,
  tappedId: string
): PersonalizedStarter | null {
  if (pool.length === 0) return null;
  const isCandidate = (s: PersonalizedStarter) =>
    !displayedIds.has(s.id) && !seen.has(s.id) && s.id !== tappedId;

  let next = pool.find(isCandidate);
  if (next) return next;

  // Exhausted relative to seen — caller should clear seen storage; here pick from pool excluding displayed + tapped.
  next = pool.find(s => !displayedIds.has(s.id) && s.id !== tappedId);
  return next ?? null;
}

export const StarterPrompts: React.FC<StarterPromptsProps> = ({
  onPromptSelect,
  personalizedStarters,
}) => {
  const { t } = useTranslation();
  const topicStarterDefs = useMemo(() => selectRandomTopicStarterDefs(), []);

  const translateDef = useCallback(
    (def: StaticCardDef): StaticCard => ({
      id: def.id,
      label: t(def.labelKey),
      prompt: def.promptKey ? t(def.promptKey) : '',
      mode: def.mode,
      iconName: def.iconName,
      iconBackground: def.iconBackground,
      description: t(def.descriptionKey),
    }),
    [t]
  );

  // Personalized chips come from the `personalize` edge function in English.
  // Each starter carries a stable `id`, so a locale file can override its
  // category and prompt. Starters whose text interpolates profile data (city,
  // province, persona) have no key and keep the server text — those are the
  // only chips that stay English in a translated UI.
  const personalizedText = useCallback(
    (starter: PersonalizedStarter) => ({
      category: t(`companion.starters.personalized.${starter.id}.category`, {
        defaultValue: starter.category,
      }),
      prompt: t(`companion.starters.personalized.${starter.id}.prompt`, {
        defaultValue: starter.prompt,
      }),
    }),
    [t]
  );
  // Stable pool ref: same array reference unless the input genuinely changed.
  // personalizedStarters from React Query is referentially stable across renders
  // when data hasn't changed, so this useMemo only re-fires on real updates.
  const pool = useMemo(
    () => personalizedStarters ?? EMPTY_POOL,
    [personalizedStarters]
  );
  const [displayed, setDisplayed] = useState<PersonalizedStarter[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Hydrate seenIds + initial 3 whenever the pool changes (mount, profile edit, etc.).
  useEffect(() => {
    if (pool.length === 0) {
      setDisplayed([]);
      return;
    }
    let cancelled = false;
    (async () => {
      let seen = await getSeenStarterIds();
      // Reset seen history only when the user has tapped through the entire
      // pool — otherwise a partial reset would resurface chips they tapped
      // recently. When unseen is between 1 and VISIBLE_SLOTS-1 we render
      // fewer chips rather than padding the slots with already-tapped ones.
      const hasUnseen = pool.some(s => !seen.has(s.id));
      if (!hasUnseen) {
        await clearSeenStarterIds();
        seen = new Set();
      }
      if (cancelled) return;
      seenIdsRef.current = seen;
      setDisplayed(pickInitial(pool, seen));
    })();
    return () => {
      cancelled = true;
    };
  }, [pool]);

  const handlePersonalizedPress = useCallback(
    (starter: PersonalizedStarter, slotIndex: number) => {
      // Send the text the user actually read, not the English server copy.
      onPromptSelect(personalizedText(starter).prompt, undefined, true);

      // Persist; fire-and-forget. Concurrent calls are safe — markStarterSeen
      // serializes its own read-modify-write internally.
      void markStarterSeen(starter.id);
      seenIdsRef.current.add(starter.id);

      // Compute the replacement against the COMMITTED current displayed state
      // inside the updater. Reading `displayed` from a stale closure here would
      // race when the user taps two chips in rapid succession — both handlers
      // would see the same pre-tap state and could pick the same replacement,
      // leaving the same chip in two slots after both updates land.
      setDisplayed(current => {
        const displayedIds = new Set(current.map(s => s.id));
        let next = pickReplacement(
          pool,
          displayedIds,
          seenIdsRef.current,
          starter.id
        );

        if (!next) {
          const fallback = pool.find(
            s => !displayedIds.has(s.id) && s.id !== starter.id
          );
          if (fallback) {
            // Pool exhausted relative to seen — reset history. Both side
            // effects are idempotent so they remain safe under React strict-
            // mode double invocation of the updater.
            seenIdsRef.current = new Set();
            void clearSeenStarterIds();
            next = fallback;
          }
        }

        if (!next) return current; // pool too small to swap; leave chip in place.

        const copy = [...current];
        copy[slotIndex] = next;
        return copy;
      });
    },
    [pool, onPromptSelect, personalizedText]
  );

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {displayed.map((starter, index) => {
          const localized = personalizedText(starter);
          return (
            <View key={starter.id}>
              <Animated.View
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(150)}
              >
                <TouchableOpacity
                  style={[styles.card, styles.cardPersonalized]}
                  onPress={() => handlePersonalizedPress(starter, index)}
                  activeOpacity={0.8}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.iconBadge, { backgroundColor: starter.iconBackground }]}>
                      <Feather name={starter.iconName as keyof typeof Feather.glyphMap} size={16} color={Theme.white} />
                    </View>
                    <Text style={styles.cardLabel} numberOfLines={1}>{localized.category}</Text>
                    <Feather name='chevron-right' size={16} color={Theme.textInactiveTab} />
                  </View>
                  <Text style={styles.cardDescription} numberOfLines={3}>{localized.prompt}</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          );
        })}

        {[...MODE_CARD_DEFS, ...topicStarterDefs].map(def => {
          const card = translateDef(def);
          return (
            <TouchableOpacity
              key={card.id}
              style={styles.card}
              onPress={() => onPromptSelect(card.prompt, card.mode, false)}
              activeOpacity={0.8}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.iconBadge, { backgroundColor: card.iconBackground }]}>
                  <Feather name={card.iconName} size={16} color={Theme.white} />
                </View>
                <Text style={styles.cardLabel}>{card.label}</Text>
                <Feather name='chevron-right' size={16} color={Theme.textInactiveTab} />
              </View>
              <Text style={styles.cardDescription} numberOfLines={2}>{card.description}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingTop: 10, paddingBottom: 12, backgroundColor: Theme.white },
  scrollContent: { paddingHorizontal: 20, paddingRight: 32 },
  card: {
    width: 170, minHeight: 108, backgroundColor: Theme.white,
    borderRadius: 16, borderWidth: 1, borderColor: '#e0e0e0',
    padding: 12, marginRight: 12,
  },
  cardPersonalized: { width: 210 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  iconBadge: {
    width: 26, height: 26, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  cardLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: Theme.black },
  cardDescription: { marginTop: 10, fontSize: 12, color: Theme.textInput, lineHeight: 16 },
});

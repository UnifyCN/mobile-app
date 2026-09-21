import React, { memo, useCallback, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import RenderHtml, { MixedStyleDeclaration } from 'react-native-render-html';
import { Theme } from '@/constants/Theme';
import { DEFAULT_LANGUAGE } from '@/i18n';
import { useTranslateContent } from '@/hooks/posts/useTranslateContent';
import {
  TranslationLimitError,
  type TranslatableId,
  type TranslatableType,
} from '@/services/posts/translateContent';

const TRANSLATED_TAG_STYLES: Record<string, MixedStyleDeclaration> = {
  body: { fontSize: 16, lineHeight: 22, color: Theme.black },
  a: { color: '#f68b26', textDecorationLine: 'underline' },
  strong: { fontWeight: '700' },
  b: { fontWeight: '700' },
  em: { fontStyle: 'italic' },
  i: { fontStyle: 'italic' },
  u: { textDecorationLine: 'underline' },
  s: { textDecorationLine: 'line-through' },
  del: { textDecorationLine: 'line-through' },
  strike: { textDecorationLine: 'line-through' },
};

interface TranslateButtonProps {
  type: TranslatableType;
  id: TranslatableId;
  /** Required when `isHtml` — width available to the HTML renderer. */
  contentWidth?: number;
  /** Post bodies are stored as HTML; comments are plain text. */
  isHtml?: boolean;
}

/**
 * On-demand "Translate" affordance for user-generated content. Renders the
 * trigger and, once translated, the machine translation *under* the original
 * with a "Machine translated · Show original" footer. Hidden entirely when
 * the UI language is English. Mirrors the web app's TranslateButton.
 */
export const TranslateButton = memo(
  ({ type, id, contentWidth = 0, isHtml = false }: TranslateButtonProps) => {
    const { t } = useTranslation();
    const [showTranslation, setShowTranslation] = useState(false);
    const { translate, translation, isTranslating, error, targetLanguage } =
      useTranslateContent(type, id);

    const handleTranslate = useCallback(() => {
      // Already cached → instant re-show, no refetch (a refetch would hit the
      // network and spend quota even with cached data).
      if (!translation) void translate();
      setShowTranslation(true);
    }, [translation, translate]);

    if (targetLanguage === DEFAULT_LANGUAGE) return null;

    if (translation && showTranslation) {
      return (
        <View style={styles.translationContainer}>
          {translation.translatedTitle ? (
            <Text style={styles.translatedTitle}>
              {translation.translatedTitle}
            </Text>
          ) : null}
          {isHtml ? (
            <RenderHtml
              contentWidth={contentWidth}
              source={{ html: translation.translatedContent }}
              tagsStyles={TRANSLATED_TAG_STYLES}
            />
          ) : (
            <Text style={styles.translatedPlainText}>
              {translation.translatedContent}
            </Text>
          )}
          <View style={styles.footer}>
            <Text style={styles.attribution}>
              {t('translate.machineTranslated')}
            </Text>
            <Text style={styles.attribution}> · </Text>
            <TouchableOpacity
              onPress={() => setShowTranslation(false)}
              hitSlop={8}
              accessibilityRole='button'
            >
              <Text style={styles.linkText}>{t('translate.showOriginal')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (isTranslating) {
      return (
        <View style={[styles.container, styles.row]}>
          <ActivityIndicator
            size={12}
            color={Theme.textPostTime}
            style={styles.spinner}
          />
          <Text style={styles.buttonText}>{t('translate.translating')}</Text>
        </View>
      );
    }

    if (error instanceof TranslationLimitError) {
      return (
        <View style={styles.container}>
          <Text style={styles.buttonText}>{t('translate.limitReached')}</Text>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <TouchableOpacity
          onPress={handleTranslate}
          style={styles.row}
          hitSlop={8}
          accessibilityRole='button'
        >
          <Text style={[styles.buttonText, error ? styles.errorText : null]}>
            {error ? t('translate.unavailable') : t('translate.button')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }
);

TranslateButton.displayName = 'TranslateButton';

const styles = StyleSheet.create({
  container: {
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  spinner: {
    marginEnd: 6,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
    color: Theme.textPostTime,
  },
  errorText: {
    color: Theme.destructive,
  },
  translationContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5E5',
  },
  translatedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.black,
    marginBottom: 4,
  },
  translatedPlainText: {
    fontSize: 16,
    lineHeight: 22,
    color: Theme.black,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  attribution: {
    fontSize: 12,
    color: Theme.textPostTime,
  },
  linkText: {
    fontSize: 12,
    fontWeight: '500',
    color: Theme.textPostTime,
    textDecorationLine: 'underline',
  },
});

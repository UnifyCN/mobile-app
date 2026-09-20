import React, { memo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Theme } from '@/constants/Theme';
import { Message } from '@/helpers/companion/messageHelpers';
import SourceViewer from './SourceViewer';
import MarkdownText, { hexToRgba } from './MarkdownText';

interface MessageWithSourcesProps {
  item: Message;
  suggestedNextSteps?: string[];
  onSuggestionPress?: (suggestion: string) => void;
}

/**
 * Parse domain from a URL string. Returns null if URL is invalid, empty,
 * or is the generic IRCC fallback URL (not a specific source).
 */
const parseDomain = (url: string | undefined): string | null => {
  if (!url || url.length === 0) return null;
  // Skip the generic IRCC fallback URL — it's not a specific source
  if (url === 'https://www.canada.ca/en/immigration-refugees-citizenship.html')
    return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

/**
 * Icon for source items. Shows a local globe icon next to the domain text.
 * No external network requests — avoids dependency on third-party favicon services.
 */
const SourceIcon: React.FC = () => {
  return (
    <Ionicons
      name='globe-outline'
      size={14}
      color={Theme.textInput}
      style={styles.faviconIcon}
    />
  );
};

/**
 * Copy button for bot messages. Shows a copy icon that flips to a checkmark
 * for 2 seconds after tapping.
 */
const CopyButton: React.FC<{ content: string }> = ({ content }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (copied) return;
    try {
      await Clipboard.setStringAsync(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }, [content, copied]);

  return (
    <TouchableOpacity
      onPress={handleCopy}
      style={styles.copyButton}
      activeOpacity={0.6}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons
        name={copied ? 'checkmark-outline' : 'copy-outline'}
        size={16}
        color={copied ? '#4CAF50' : Theme.textInput}
      />
    </TouchableOpacity>
  );
};

const MessageWithSourcesComponent: React.FC<MessageWithSourcesProps> = ({
  item,
  suggestedNextSteps,
  onSuggestionPress,
}) => {
  const { t, i18n } = useTranslation();
  const [showSources, setShowSources] = useState(false);
  const [selectedSource, setSelectedSource] = useState<{
    url: string;
    title: string;
  } | null>(null);

  return (
    <View
      style={[
        styles.messageContainer,
        item.isUser ? styles.userMessage : styles.botMessage,
      ]}
    >
      <View
        style={[
          styles.messageBubble,
          item.isUser ? styles.userBubble : styles.botBubble,
        ]}
      >
        {/* Copy button for bot messages */}
        {!item.isUser && (
          <View style={styles.copyButtonRow}>
            <CopyButton content={item.text} />
          </View>
        )}

        {/* Render markdown for bot messages, plain text for user */}
        {item.isUser ? (
          <Text style={[styles.messageText, styles.userText]}>{item.text}</Text>
        ) : (
          <MarkdownText text={item.text} isUser={false} />
        )}

        {/* Disclaimer section for bot messages */}
        {!item.isUser && item.disclaimer && (
          <View style={styles.disclaimerContainer}>
            <Ionicons
              name='information-circle-outline'
              size={14}
              color={Theme.textInput}
            />
            <Text style={styles.disclaimerText}>{item.disclaimer}</Text>
          </View>
        )}

        {/* Sources section for bot messages */}
        {!item.isUser && item.sources && item.sources.length > 0 && (
          <View style={styles.sourcesContainer}>
            {(() => {
              if (!item.lastVerified) {
                return null;
              }

              const parsedLastVerified = new Date(item.lastVerified);
              if (Number.isNaN(parsedLastVerified.getTime())) {
                return null;
              }

              return (
                <Text style={styles.lastVerifiedText}>
                  {t('companion.sourcesVerified')}{' '}
                  {parsedLastVerified.toLocaleDateString(i18n.language, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              );
            })()}
            <TouchableOpacity
              style={styles.sourcesHeader}
              onPress={() => setShowSources(!showSources)}
            >
              <Text style={styles.sourcesHeaderText}>
                {t('companion.sourcesCount', { count: item.sources.length })}
              </Text>
              <Ionicons
                name={showSources ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Theme.textInput}
              />
            </TouchableOpacity>
            {showSources && (
              <View style={styles.sourcesList}>
                {item.sources.map((source, index) => {
                  const domain = parseDomain(source.url);
                  return (
                    <TouchableOpacity
                      key={index}
                      style={styles.sourceItem}
                      onPress={() => {
                        if (source.url.toLowerCase().endsWith('.md')) {
                          setSelectedSource({
                            url: source.url,
                            title: source.document_title,
                          });
                        } else {
                          Linking.openURL(source.url).catch(err =>
                            console.error('Failed to open URL:', err)
                          );
                        }
                      }}
                    >
                      <View style={styles.sourceItemContent}>
                        {domain && (
                          <>
                            <SourceIcon />
                            <Text style={styles.sourceDomain}>{domain}</Text>
                            <Text style={styles.sourceSeparator}>·</Text>
                          </>
                        )}
                        <Text
                          style={[
                            styles.sourceLink,
                            domain ? styles.sourceLinkWithDomain : null,
                          ]}
                          numberOfLines={1}
                        >
                          {source.document_title}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Suggested Next Steps - Only for bot messages */}
        {!item.isUser &&
          suggestedNextSteps &&
          suggestedNextSteps.length > 0 &&
          onSuggestionPress && (
            <View style={styles.suggestionsContainer}>
              <Text style={styles.suggestionsTitle}>{t('companion.askFollowUp')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.suggestionsScroll}
              >
                {suggestedNextSteps.map((suggestion, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.suggestionChip}
                    onPress={() => onSuggestionPress(suggestion)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.suggestionText} numberOfLines={2}>
                      {suggestion}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
      </View>

      {/* Source Viewer Modal */}
      {selectedSource && (
        <SourceViewer
          visible={!!selectedSource}
          sourceUrl={selectedSource.url}
          sourceTitle={selectedSource.title}
          onClose={() => setSelectedSource(null)}
        />
      )}
    </View>
  );
};
MessageWithSourcesComponent.displayName = 'MessageWithSources';

const areSourcesEqual = (
  previousSources?: Message['sources'],
  nextSources?: Message['sources']
) => {
  if (previousSources === nextSources) {
    return true;
  }
  if (!previousSources || !nextSources) {
    return previousSources === nextSources;
  }
  if (previousSources.length !== nextSources.length) {
    return false;
  }

  for (let i = 0; i < previousSources.length; i += 1) {
    const previousSource = previousSources[i];
    const nextSource = nextSources[i];
    if (
      previousSource.document_id !== nextSource.document_id ||
      previousSource.document_title !== nextSource.document_title ||
      previousSource.url !== nextSource.url
    ) {
      return false;
    }
  }

  return true;
};

const areStringArraysEqual = (previous?: string[], next?: string[]) => {
  if (previous === next) {
    return true;
  }
  if (!previous || !next) {
    return previous === next;
  }
  if (previous.length !== next.length) {
    return false;
  }

  for (let i = 0; i < previous.length; i += 1) {
    if (previous[i] !== next[i]) {
      return false;
    }
  }

  return true;
};

export const MessageWithSources = memo(
  MessageWithSourcesComponent,
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.item.text === next.item.text &&
    prev.item.disclaimer === next.item.disclaimer &&
    prev.item.isUser === next.item.isUser &&
    prev.item.lastVerified === next.item.lastVerified &&
    areSourcesEqual(prev.item.sources, next.item.sources) &&
    areStringArraysEqual(prev.suggestedNextSteps, next.suggestedNextSteps) &&
    prev.onSuggestionPress === next.onSuggestionPress
);

const styles = StyleSheet.create({
  messageContainer: {
    marginVertical: 6,
    flexDirection: 'row',
  },
  userMessage: {
    justifyContent: 'flex-end',
  },
  botMessage: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '92%',
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 20,
  },
  userBubble: {
    backgroundColor: Theme.surfaceBlue,
    borderTopRightRadius: 5,
  },
  botBubble: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 24,
  },
  userText: {
    color: '#fff',
  },
  botText: {
    color: '#333',
  },
  // Copy button
  copyButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 4,
    marginTop: -4,
  },
  copyButton: {
    padding: 4,
  },
  // Favicon
  faviconIcon: {
    width: 14,
    height: 14,
  },
  // Disclaimer styles
  disclaimerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    gap: 8,
  },
  disclaimerText: {
    fontSize: 12,
    color: Theme.textInput,
    flex: 1,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  // Sources styles
  sourcesContainer: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 12,
  },
  lastVerifiedText: {
    fontSize: 11,
    color: Theme.textInput,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  sourcesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  sourcesHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textInput,
  },
  sourcesList: {
    marginTop: 8,
    gap: 8,
  },
  sourceItem: {
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  sourceItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sourceDomain: {
    fontSize: 11,
    color: Theme.textInput,
    marginLeft: 6,
    fontWeight: '500',
  },
  sourceSeparator: {
    fontSize: 11,
    color: Theme.textInput,
    marginHorizontal: 6,
  },
  sourceLink: {
    fontSize: 12,
    color: Theme.surfaceBlue,
    textDecorationLine: 'underline',
    flex: 1,
  },
  sourceLinkWithDomain: {
    fontSize: 12,
  },
  // Suggested Next Steps styles
  suggestionsContainer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 12,
  },
  suggestionsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textInput,
    marginBottom: 8,
  },
  suggestionsScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: hexToRgba(Theme.surfaceBlue, 0.08),
    borderWidth: 1,
    borderColor: Theme.surfaceBlue,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: 200,
  },
  suggestionText: {
    fontSize: 13,
    color: Theme.surfaceBlue,
    fontWeight: '500',
  },
});

import { typography } from '@/constants/Typography';
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Modal,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Theme } from '@/constants/Theme';
import { Layout, getHeaderHeight } from '@/constants/Layout';

/**
 * Simple markdown renderer for source documents
 */
const MarkdownContent: React.FC<{ content: string }> = ({ content }) => {
  const elements = useMemo(() => {
    // Strip YAML front matter (between --- delimiters)
    let cleanContent = content;
    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (frontMatterMatch) {
      cleanContent = frontMatterMatch[2];
    }

    const lines = cleanContent.split('\n');
    const renderedElements: React.ReactNode[] = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      // Large headers (##)
      if (trimmed.startsWith('## ')) {
        renderedElements.push(
          <Text key={`line-${index}`} style={styles.mdHeader}>
            {trimmed.substring(3)}
          </Text>
        );
      }
      // Smaller headers (###)
      else if (trimmed.startsWith('### ')) {
        renderedElements.push(
          <Text key={`line-${index}`} style={styles.mdSubheader}>
            {trimmed.substring(4)}
          </Text>
        );
      }
      // Bullet points
      else if (trimmed.startsWith('- ')) {
        renderedElements.push(
          <View key={`line-${index}`} style={styles.mdBulletContainer}>
            <Text style={styles.mdBullet}>•</Text>
            <Text style={styles.mdBulletText}>
              {renderInlineMarkdown(trimmed.substring(2))}
            </Text>
          </View>
        );
      }
      // Numbered lists
      else if (/^\d+\.\s/.test(trimmed)) {
        const match = trimmed.match(/^(\d+)\.\s(.*)$/);
        if (match) {
          renderedElements.push(
            <View key={`line-${index}`} style={styles.mdNumberedContainer}>
              <Text style={styles.mdNumber}>{match[1]}.</Text>
              <Text style={styles.mdBulletText}>
                {renderInlineMarkdown(match[2])}
              </Text>
            </View>
          );
        }
      }
      // Empty lines create spacing
      else if (trimmed.length === 0) {
        renderedElements.push(
          <View key={`line-${index}`} style={styles.mdSpacing} />
        );
      }
      // Regular paragraphs
      else if (trimmed.length > 0) {
        renderedElements.push(
          <Text key={`line-${index}`} style={styles.mdParagraph}>
            {renderInlineMarkdown(trimmed)}
          </Text>
        );
      }
    });

    return renderedElements;
  }, [content]);

  return <View style={styles.mdContainer}>{elements}</View>;
};

/**
 * Render inline markdown formatting (bold, italic, links)
 */
const renderInlineMarkdown = (text: string): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    // Bold text (**text**)
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    if (boldMatch && boldMatch.index !== undefined) {
      // Add text before bold
      if (boldMatch.index > 0) {
        parts.push(remaining.substring(0, boldMatch.index));
      }
      // Add bold text
      parts.push(
        <Text key={`bold-${keyIndex++}`} style={styles.mdBold}>
          {boldMatch[1]}
        </Text>
      );
      remaining = remaining.substring(boldMatch.index + boldMatch[0].length);
      continue;
    }

    // Italic text (*text* or _text_)
    const italicMatch = remaining.match(
      /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|_(.+?)_/
    );
    if (italicMatch && italicMatch.index !== undefined) {
      if (italicMatch.index > 0) {
        parts.push(remaining.substring(0, italicMatch.index));
      }
      parts.push(
        <Text key={`italic-${keyIndex++}`} style={styles.mdItalic}>
          {italicMatch[1] || italicMatch[2]}
        </Text>
      );
      remaining = remaining.substring(
        italicMatch.index + italicMatch[0].length
      );
      continue;
    }

    // Links [text](url)
    const linkMatch = remaining.match(/\[(.+?)\]\((.+?)\)/);
    if (linkMatch && linkMatch.index !== undefined) {
      if (linkMatch.index > 0) {
        parts.push(remaining.substring(0, linkMatch.index));
      }
      const linkText = linkMatch[1];
      const linkUrl = linkMatch[2];
      parts.push(
        <Text
          key={`link-${keyIndex++}`}
          style={styles.mdLink}
          onPress={() => {
            Linking.openURL(linkUrl).catch(err =>
              console.error('Failed to open URL:', err)
            );
          }}
        >
          {linkText}
        </Text>
      );
      remaining = remaining.substring(linkMatch.index + linkMatch[0].length);
      continue;
    }

    // No more formatting found
    parts.push(remaining);
    break;
  }

  return parts.length === 1 && typeof parts[0] === 'string' ? (
    parts[0]
  ) : (
    <>{parts}</>
  );
};

interface SourceViewerProps {
  visible: boolean;
  sourceUrl: string;
  sourceTitle: string;
  onClose: () => void;
}

/**
 * Modal viewer for displaying source documents (markdown/text) from S3.
 * Features:
 * - Close button
 * - Loading spinner
 * - Error state with retry
 * - "Open in Browser" option
 */
export default function SourceViewer({
  visible,
  sourceUrl,
  sourceTitle,
  onClose,
}: SourceViewerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const headerHeight = getHeaderHeight(insets.top);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!visible) {
      // Reset state when modal closes
      setContent('');
      setLoading(true);
      setError(false);
      return;
    }

    const fetchContent = async () => {
      try {
        setLoading(true);
        setError(false);

        const response = await fetch(sourceUrl);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const text = await response.text();
        setContent(text);
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch source:', err);
        setError(true);
        setLoading(false);
      }
    };

    fetchContent();
  }, [visible, sourceUrl]);

  const handleRetry = () => {
    setError(false);
    setLoading(true);
    // Re-trigger fetch by updating a key or calling fetch directly
    const fetchContent = async () => {
      try {
        const response = await fetch(sourceUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const text = await response.text();
        setContent(text);
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch source:', err);
        setError(true);
        setLoading(false);
      }
    };
    fetchContent();
  };

  const handleOpenInBrowser = () => {
    Linking.openURL(sourceUrl).catch(err =>
      console.error('Failed to open URL:', err)
    );
  };

  return (
    <Modal
      visible={visible}
      animationType='slide'
      presentationStyle='pageSheet'
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + Layout.header.topInsetOffset,
              height: headerHeight,
            },
          ]}
        >
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Feather
              name='x'
              size={Layout.header.iconSize}
              color={Theme.black}
            />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            {sourceTitle.replace(/\.md$/i, '')}
          </Text>
          <TouchableOpacity
            onPress={handleOpenInBrowser}
            style={styles.browserButton}
          >
            <Feather name='external-link' size={20} color={Theme.surfaceBlue} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.contentContainer}>
          {loading && (
            <View style={styles.centerContainer}>
              <ActivityIndicator size='large' color={Theme.surfaceBlue} />
              <Text style={styles.loadingText}>
                {t('companion.loadingSource')}
              </Text>
            </View>
          )}

          {error && !loading && (
            <View style={styles.centerContainer}>
              <Feather
                name='alert-circle'
                size={48}
                color={Theme.textInput}
                style={styles.errorIcon}
              />
              <Text style={styles.errorText}>
                {t('companion.failedLoadSource')}
              </Text>
              <TouchableOpacity
                onPress={handleRetry}
                style={styles.retryButton}
              >
                <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleOpenInBrowser}
                style={styles.browserLinkButton}
              >
                <Text style={styles.browserLinkText}>
                  {t('companion.openInBrowser')}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {!loading && !error && content && (
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
            >
              <MarkdownContent content={content} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: -16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  closeButton: {
    padding: 4,
    marginLeft: -4,
  },
  browserButton: {
    padding: 4,
    marginRight: -4,
  },
  title: {
    ...typography.cardTitle,
    color: Theme.black,
    flex: 1,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  contentContainer: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: { ...typography.body, marginTop: 16, color: Theme.textInput },
  errorIcon: {
    marginBottom: 16,
  },
  errorText: {
    ...typography.body,
    color: Theme.textInput,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: Theme.surfaceBlue,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  retryButtonText: { ...typography.button, color: '#fff' },
  browserLinkButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  browserLinkText: { ...typography.body, color: Theme.surfaceBlue },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  contentText: { ...typography.secondary, color: '#333' },
  // Markdown styles
  mdContainer: {
    flex: 1,
  },
  mdHeader: {
    ...typography.section,
    color: '#000',
    marginTop: 20,
    marginBottom: 12,
  },
  mdSubheader: {
    ...typography.cardTitle,
    color: '#000',
    marginTop: 16,
    marginBottom: 10,
  },
  mdParagraph: { ...typography.secondary, color: '#333', marginBottom: 12 },
  mdBulletContainer: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 8,
  },
  mdBullet: {
    ...typography.secondary,
    color: Theme.surfaceBlue,
    marginRight: 12,
    fontWeight: '600',
  },
  mdBulletText: { ...typography.secondary, color: '#333', flex: 1 },
  mdNumberedContainer: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 8,
  },
  mdNumber: {
    ...typography.secondary,
    color: '#000',
    marginRight: 8,
    minWidth: 24,
    fontWeight: '600',
  },
  mdSpacing: {
    height: 8,
  },
  mdBold: {
    fontWeight: '700',
    color: '#000',
  },
  mdItalic: {
    fontStyle: 'italic',
  },
  mdLink: {
    color: Theme.surfaceBlue,
    textDecorationLine: 'underline',
  },
});

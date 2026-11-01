import { LiveText as Text } from '@/components/common/LiveText';
import { typography } from '@/constants/Typography';
import React, { memo, useMemo } from 'react';
import { View, StyleSheet, Linking } from 'react-native';
import { Theme } from '@/constants/Theme';

/**
 * Converts a hex color to rgba format with specified opacity
 */
export const hexToRgba = (hexColor: string, opacity: number): string => {
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6 || !/^[0-9A-Fa-f]{6}$/.test(hex)) {
    console.warn(
      `Invalid hex color format: ${hexColor}. Expected format: #RRGGBB`
    );
    return hexColor;
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

type SectionType =
  | 'general'
  | 'at_a_glance'
  | 'need_to_know'
  | 'next_steps'
  | 'learn_more';

/**
 * Renders inline formatting like **bold** and [links](url)
 */
const renderInlineFormatting = (
  text: string,
  baseColor: string
): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const linkMatch = remaining.match(/\[(.+?)\]\((.+?)\)/);

    const boldIndex = boldMatch ? remaining.indexOf(boldMatch[0]) : -1;
    const linkIndex = linkMatch ? remaining.indexOf(linkMatch[0]) : -1;

    if (boldIndex === -1 && linkIndex === -1) {
      parts.push(remaining);
      break;
    }

    const useLink =
      linkIndex !== -1 && (boldIndex === -1 || linkIndex < boldIndex);

    if (useLink && linkMatch) {
      if (linkIndex > 0) {
        parts.push(remaining.substring(0, linkIndex));
      }
      const linkText = linkMatch[1];
      const linkUrl = linkMatch[2];
      parts.push(
        <Text
          key={`link-${keyIndex++}`}
          style={styles.linkText}
          onPress={() => {
            Linking.openURL(linkUrl).catch(err =>
              console.error('Failed to open URL:', err)
            );
          }}
        >
          {linkText}
        </Text>
      );
      remaining = remaining.substring(linkIndex + linkMatch[0].length);
    } else if (boldMatch) {
      if (boldIndex > 0) {
        parts.push(remaining.substring(0, boldIndex));
      }
      parts.push(
        <Text key={`bold-${keyIndex++}`} style={styles.boldText}>
          {boldMatch[1]}
        </Text>
      );
      remaining = remaining.substring(boldIndex + boldMatch[0].length);
    }
  }

  return parts.length === 1 && typeof parts[0] === 'string' ? (
    parts[0]
  ) : (
    <>{parts}</>
  );
};

/**
 * Renders a single line of markdown content
 */
const renderMarkdownLine = (
  trimmedLine: string,
  lineIndex: number,
  baseColor: string,
  isFirstHeader: boolean,
  currentSection: SectionType,
  isInAtAGlance: boolean = false
): React.ReactNode => {
  if (trimmedLine.startsWith('## ')) {
    return (
      <Text
        key={`line-${lineIndex}`}
        style={[
          isInAtAGlance ? styles.atAGlanceHeader : styles.markdownHeader,
          isFirstHeader && { marginTop: 0 },
        ]}
      >
        {trimmedLine.substring(3)}
      </Text>
    );
  }

  if (trimmedLine.startsWith('- ')) {
    if (currentSection === 'need_to_know' || currentSection === 'learn_more') {
      return (
        <Text
          key={`line-${lineIndex}`}
          style={[
            styles.regularText,
            styles.sectionTextItem,
            { color: baseColor },
          ]}
        >
          {renderInlineFormatting(trimmedLine.substring(2), baseColor)}
        </Text>
      );
    }

    return (
      <View key={`line-${lineIndex}`} style={styles.bulletContainer}>
        <Text style={styles.bulletPoint}>•</Text>
        <Text style={styles.bulletText}>
          {renderInlineFormatting(trimmedLine.substring(2), baseColor)}
        </Text>
      </View>
    );
  }

  const numberedMatch = trimmedLine.match(/^(\d+)\.\s+(.*)$/);
  if (numberedMatch) {
    return (
      <View key={`line-${lineIndex}`} style={styles.numberedContainer}>
        <Text style={styles.numberedPoint}>{numberedMatch[1]}.</Text>
        <Text style={styles.bulletText}>
          {renderInlineFormatting(numberedMatch[2], baseColor)}
        </Text>
      </View>
    );
  }

  if (trimmedLine.length > 0) {
    return (
      <Text
        key={`line-${lineIndex}`}
        style={isInAtAGlance ? styles.atAGlanceText : styles.regularText}
      >
        {renderInlineFormatting(trimmedLine, baseColor)}
      </Text>
    );
  }

  return null;
};

/**
 * Simple Markdown renderer for chat messages.
 * Supports: ## Headers, **bold**, - bullet points, numbered lists, and [links](url)
 * Special styling for "At a Glance" section
 */
const MarkdownText: React.FC<{ text: string; isUser: boolean }> = memo(
  ({ text, isUser }) => {
    const baseColor = isUser ? '#fff' : '#333';

    const elements = useMemo(() => {
      const lines = text.split('\n');
      const nextElements: React.ReactNode[] = [];

      // Find "At a Glance" section boundaries
      let atAGlanceStart = -1;
      let atAGlanceEnd = -1;

      lines.forEach((line, index) => {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('## ')) {
          const headerText = trimmedLine.substring(3).toLowerCase();
          if (headerText.includes('at a glance') && atAGlanceStart === -1) {
            atAGlanceStart = index;
          } else if (atAGlanceStart !== -1 && atAGlanceEnd === -1) {
            atAGlanceEnd = index;
          }
        }
      });

      if (atAGlanceStart !== -1 && atAGlanceEnd === -1) {
        let foundContent = false;
        for (let i = atAGlanceStart + 1; i < lines.length; i++) {
          const trimmed = lines[i].trim();
          if (trimmed.length > 0) {
            foundContent = true;
          } else if (foundContent) {
            atAGlanceEnd = i;
            break;
          }
        }
        if (atAGlanceEnd === -1) {
          atAGlanceEnd = lines.length;
        }
      }

      const atAGlanceContent: React.ReactNode[] = [];
      let isFirstHeader = true;
      let currentSection: SectionType = 'general';

      lines.forEach((line, lineIndex) => {
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith('## ')) {
          const headerText = trimmedLine.substring(3).toLowerCase();
          if (headerText.includes('at a glance')) {
            currentSection = 'at_a_glance';
          } else if (headerText.includes('what you need to know')) {
            currentSection = 'need_to_know';
          } else if (headerText.includes('next steps')) {
            currentSection = 'next_steps';
          } else if (headerText.includes('learn more')) {
            currentSection = 'learn_more';
          } else {
            currentSection = 'general';
          }
        }

        const isInAtAGlance =
          atAGlanceStart !== -1 &&
          lineIndex >= atAGlanceStart &&
          lineIndex < atAGlanceEnd;

        if (isInAtAGlance) {
          const element = renderMarkdownLine(
            trimmedLine,
            lineIndex,
            baseColor,
            trimmedLine.startsWith('## ') && isFirstHeader,
            currentSection,
            true
          );
          if (element) {
            if (trimmedLine.startsWith('## ')) {
              isFirstHeader = false;
            }
            atAGlanceContent.push(element);
          }

          if (lineIndex === atAGlanceEnd - 1) {
            nextElements.push(
              <View key='at-a-glance-section' style={styles.atAGlanceCard}>
                {atAGlanceContent}
              </View>
            );
          }
          return;
        }

        if (trimmedLine.startsWith('## ')) {
          isFirstHeader = false;
        }

        const element = renderMarkdownLine(
          trimmedLine,
          lineIndex,
          baseColor,
          false,
          currentSection,
          false
        );
        if (element) {
          nextElements.push(element);
        } else if (
          lineIndex > 0 &&
          lineIndex < lines.length - 1 &&
          trimmedLine.length === 0
        ) {
          nextElements.push(
            <View key={`line-${lineIndex}`} style={styles.paragraphBreak} />
          );
        }
      });

      return nextElements;
    }, [text, baseColor]);

    return <View style={styles.markdownContainer}>{elements}</View>;
  }
);
MarkdownText.displayName = 'MarkdownText';

export default MarkdownText;

const styles = StyleSheet.create({
  markdownContainer: {
    gap: 4,
  },
  markdownHeader: {
    ...typography.cardTitle,
    letterSpacing: 0.2,
    marginTop: 10,
    marginBottom: 0,
    color: '#1a1a1a',
  },
  regularText: { ...typography.body, color: '#444' },
  boldText: {
    fontWeight: '700',
    color: '#222',
  },
  linkText: {
    color: Theme.surfaceBlue,
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
  bulletContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 4,
    marginVertical: 8,
  },
  bulletPoint: {
    ...typography.section,
    marginRight: 10,
    color: '#000',
    textAlign: 'center',
    minWidth: 14,
  },
  bulletText: { ...typography.body, flex: 1, color: '#444' },
  paragraphBreak: {
    height: 4,
  },
  numberedContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 4,
  },
  numberedPoint: {
    ...typography.cardTitle,
    marginRight: 12,
    minWidth: 12,
    color: '#000',
  },
  sectionTextItem: {
    marginBottom: 4,
  },
  atAGlanceCard: {
    backgroundColor: hexToRgba(Theme.surfaceBlue, 0.08),
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 16,
  },
  atAGlanceHeader: {
    ...typography.cardTitle,
    letterSpacing: 0.3,
    marginBottom: 10,
    color: '#000',
  },
  atAGlanceText: { ...typography.body, color: '#333' },
});

// RichTextRenderer.tsx
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  TextInput,
  Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useTranslation } from 'react-i18next';
import ImageViewerModal from '@/components/sanity/ImageViewerModal';
import DropdownBlock from '@/components/sanity/DropdownBlock';
import ChecklistCheckboxBlock from '@/components/sanity/ChecklistCheckboxBlock';
import { AlignJustify, AlignVerticalJustifyCenter } from 'lucide-react-native';
import { Feather } from '@expo/vector-icons';
import SelectableText from '@/components/learn/SelectableText';
import { Highlight } from '@/services/highlights/highlightService';
interface RichTextRendererProps {
  blocks: any[];
  styles?: any;
  markDefs?: any[];
  inputValues?: { [key: string]: string };
  onInputChange?: (fieldKey: string, value: string) => void;
  questionAnswers?: { [key: string]: string | string[] };
  onQuestionAnswer?: (questionKey: string, answer: string | string[]) => void;
  showQuestionFeedback?: boolean;
  /** When true, root container does not use flex: 1 so it sizes to content (e.g. for option text alignment). */
  compactContainer?: boolean;
  /** Persisted highlights for this page — passed to SelectableText for rendering */
  highlights?: Highlight[];
}

export default function RichTextRenderer({
  blocks,
  styles: customStyles,
  markDefs,
  inputValues = {},
  onInputChange,
  questionAnswers = {},
  onQuestionAnswer,
  showQuestionFeedback = false,
  compactContainer = false,
  highlights = [],
}: RichTextRendererProps) {
  const { t } = useTranslation();
  // Image viewer modal state
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Matching question state - track per question using block _key (right by index so duplicate values select only one)
  const [matchingQuestionState, setMatchingQuestionState] = useState<{
    [questionKey: string]: {
      selectedLeftItem: string | null;
      selectedRightIndex: number | null;
      matchedPairs: { [key: string]: string };
      completedLeftItems: string[];
      completedRightIndices: number[];
      incorrectLeftItems: string[];
      incorrectRightIndices: number[];
    };
  }>({});

  // Generate scrambled right items for each matching question using useMemo
  const scrambledRightItemsMap = useMemo(() => {
    const map: { [questionKey: string]: string[] } = {};
    blocks.forEach((block, idx) => {
      if (block._type === 'matching_question') {
        const questionKey = block._key || `matching-${idx}`;
        const rightItems = (block.matching_pairs || []).map(
          (pair: any) => pair.right_item
        );
        // Scramble right items using Fisher-Yates shuffle
        const scrambled = [...rightItems];
        for (let i = scrambled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [scrambled[i], scrambled[j]] = [scrambled[j], scrambled[i]];
        }
        map[questionKey] = scrambled;
      }
    });
    return map;
  }, [blocks]);

  const getBlockHighlights = (block: any, index: number) =>
    highlights.filter(h => h.block_key === (block._key || `block-${index}`));

  if (!blocks || !Array.isArray(blocks)) return null;

  // Create numbering map for ordered lists (keep prev behavior)
  const createNumberingMap = (blocks: any[]) => {
    const numberingMap: { [key: string]: number } = {};
    let currentNumber = 1;
    let inOrderedList = false;

    blocks.forEach((block, index) => {
      if (block._type === 'block' && block.listItem === 'number') {
        if (!inOrderedList) {
          currentNumber = 1;
          inOrderedList = true;
        }
        numberingMap[block._key || index] = currentNumber;
        currentNumber++;
      } else if (block._type === 'block' && !block.listItem) {
        inOrderedList = false;
        currentNumber = 1;
      }
    });

    return numberingMap;
  };

  const numberingMap = createNumberingMap(blocks);

  // Avoid extra gap under Text on Android (especially list lines).
  const textMetricsTight =
    Platform.OS === 'android' ? ({ includeFontPadding: false } as const) : {};

  // Body copy: same font size & line height as news article content (`app/news-detail` contentText)
  const defaultStyles = {
    // Headings (in-content; page title uses screen styles)
    h1: {
      fontSize: 32,
      lineHeight: 40,
      fontWeight: '600',
      color: '#000',
      marginBottom: 20,
      marginTop: 0,
    },
    h2: {
      fontSize: 24,
      lineHeight: 32,
      fontWeight: '600',
      color: '#000',
      marginBottom: 16,
      marginTop: 16,
    },
    h3: {
      fontSize: 20,
      lineHeight: 28,
      fontWeight: '600',
      color: '#000',
      marginBottom: 12,
      marginTop: 12,
    },
    h4: {
      fontSize: 18,
      lineHeight: 27,
      fontWeight: '600',
      color: '#000',
      marginBottom: 10,
      marginTop: 10,
    },

    // Paragraphs
    normal: {
      fontFamily: 'Inter',
      fontWeight: '400',
      fontStyle: 'normal',
      fontSize: 18,
      lineHeight: 27,
      letterSpacing: 0,
      color: '#424242',
      marginBottom: 10,
      ...textMetricsTight,
    },

    // Lists — same metrics as body; vertical gap comes from list row View, not Text
    bullet: {
      fontFamily: 'Inter',
      fontWeight: '400',
      fontStyle: 'normal',
      fontSize: 18,
      lineHeight: 27,
      letterSpacing: 0,
      color: '#424242',
      marginBottom: 0,
      marginTop: 0,
      ...textMetricsTight,
    },
    number: {
      fontFamily: 'Inter',
      fontWeight: '400',
      fontStyle: 'normal',
      fontSize: 18,
      lineHeight: 27,
      letterSpacing: 0,
      color: '#424242',
      marginBottom: 0,
      marginTop: 0,
      ...textMetricsTight,
    },

    strong: {
      fontFamily: 'Inter',
      fontWeight: '700',
      fontStyle: 'normal',
      fontSize: 18,
      lineHeight: 27,
      letterSpacing: 0,
      color: '#424242',
      ...textMetricsTight,
    },
    // Quote / callout strip (border-l 5 #3F3F3F); text matches body
    blockquote: {
      marginBottom: 0,
      marginTop: 0,
      paddingLeft: 15,
      borderLeftWidth: 5,
      borderLeftColor: '#3F3F3F',
    },
    blockquoteText: {
      fontFamily: 'Inter',
      fontSize: 18,
      lineHeight: 27,
      color: '#424242',
      fontStyle: 'normal',
    },

    // Code
    code: {
      fontSize: 16,
      color: '#1F2937',
      backgroundColor: '#F3F4F6',
      padding: 8,
      borderRadius: 4,
      fontFamily: 'monospace',
      marginBottom: 16,
    },

    // Image
    image: { width: '100%', height: 200, borderRadius: 12, marginVertical: 16 },
    imagePlaceholder: {
      width: '100%',
      height: 200,
      borderRadius: 12,
      backgroundColor: '#E5E7EB',
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 16,
    },
    imagePlaceholderText: {
      fontSize: 16,
      color: '#6B7280',
      textAlign: 'center',
    },

    // Special blocks
    dropdown: { marginVertical: 16 },

    exampleBox: {
      flexDirection: 'column',
      backgroundColor: '#EAEAEA',
      borderRadius: 10,
      padding: 25,
      gap: 10,
      marginVertical: 5,
      marginBottom: 25,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
      borderWidth: 2,
      borderColor: '#C9C9C9',
    },
    exampleBoxTitle: {
      fontFamily: 'Inter',
      fontSize: 18,
      fontWeight: '600',
      lineHeight: 27,
      color: '#424242',
      marginBottom: 0,
      textTransform: 'uppercase',
    },
    exampleText: {
      fontFamily: 'Inter',
      fontWeight: '400',
      fontStyle: 'normal',
      fontSize: 18,
      lineHeight: 27,
      letterSpacing: 0,
      color: '#424242',
    },

    // ✅ TIP BOX (merged from your ActivityPageScreen, Figma spec)
    tipBoxContainer: {
      backgroundColor: 'transparent',
      borderLeftWidth: 5,
      borderLeftColor: '#3F3F3F',
      paddingLeft: 15,
      paddingRight: 0,
      paddingTop: 5, // 5px margin on top
      paddingBottom: 5, // 5px margin on bottom
      alignSelf: 'center',
      width: 353,
      maxWidth: '100%',
      minHeight: 37, // 5 + 27 (one line) + 5
      marginTop: 0,
      marginBottom: 30,
    },
    tipTitleText: {
      fontFamily: 'Inter',
      fontSize: 18,
      lineHeight: 27,
      fontWeight: '600',
      color: '#424242',
    },
    tipBodyText: {
      fontFamily: 'Inter',
      fontSize: 18,
      lineHeight: 27,
      fontWeight: '400',
      color: '#424242',
      marginBottom: 0,
    },

    // Note box — Figma frame 3743:67154 (symmetric py-16, pl-22 pr-14, radius 12)
    noteBox: {
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
      paddingLeft: 22,
      paddingRight: 14,
      paddingTop: 16,
      paddingBottom: 16,
      marginVertical: 16,
      borderWidth: 2,
      borderColor: '#878787',
      overflow: 'hidden',
    },
    noteBoxText: {
      fontFamily: 'Inter',
      fontSize: 18,
      lineHeight: 27,
      fontWeight: '400',
      color: '#424242',
      marginTop: 0,
      marginBottom: 0,
      ...textMetricsTight,
    },

    // Links
    link: {
      color: '#5182C7',
      textDecorationLine: 'underline',
      fontWeight: '600',
    },
  };

  // Merge styles, ensuring header styles are always preserved
  // If custom styles are provided, merge them but always ensure headers exist
  // For nested renders (like question text), we need to ensure headers are always available
  const mergedStyles: Record<string, any> = {
    ...defaultStyles,
    // Only spread customStyles if it exists and is an object
    ...(customStyles && typeof customStyles === 'object' ? customStyles : {}),
    // Always ensure header styles exist with their full default properties
    // If custom header styles are provided, merge them with defaults to preserve all properties
    h1:
      customStyles?.h1 && typeof customStyles.h1 === 'object'
        ? { ...defaultStyles.h1, ...customStyles.h1 }
        : defaultStyles.h1,
    h2:
      customStyles?.h2 && typeof customStyles.h2 === 'object'
        ? { ...defaultStyles.h2, ...customStyles.h2 }
        : defaultStyles.h2,
    h3:
      customStyles?.h3 && typeof customStyles.h3 === 'object'
        ? { ...defaultStyles.h3, ...customStyles.h3 }
        : defaultStyles.h3,
    h4:
      customStyles?.h4 && typeof customStyles.h4 === 'object'
        ? { ...defaultStyles.h4, ...customStyles.h4 }
        : defaultStyles.h4,
  };

  // If only `normal` is customized (e.g. lesson body = news article 18/27), keep lists/blockquote in sync.
  const normalOverride = customStyles?.normal;
  if (normalOverride && typeof normalOverride === 'object') {
    const typo: Record<string, string | number> = {};
    for (const k of [
      'fontSize',
      'lineHeight',
      'letterSpacing',
      'fontFamily',
      'color',
    ] as const) {
      const v = (normalOverride as any)[k];
      if (v !== undefined && v !== null) typo[k] = v;
    }
    if (Object.keys(typo).length > 0) {
      if (!customStyles?.bullet) {
        mergedStyles.bullet = {
          ...mergedStyles.bullet,
          ...typo,
          marginBottom: 0,
          marginTop: 0,
        };
      }
      if (!customStyles?.number) {
        mergedStyles.number = {
          ...mergedStyles.number,
          ...typo,
          marginBottom: 0,
          marginTop: 0,
        };
      }
      if (!customStyles?.strong) {
        mergedStyles.strong = {
          ...mergedStyles.strong,
          ...typo,
          fontWeight: '700',
        };
      }
      if (!customStyles?.blockquoteText) {
        mergedStyles.blockquoteText = {
          ...mergedStyles.blockquoteText,
          ...typo,
        };
      }
    }
  }

  // Keep prev nesting-level calc
  const calculateNestingLevels = (blocks: any[]) => {
    const nestingMap: { [key: string]: number } = {};
    let currentNesting = 0;
    let listStack: string[] = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];

      if (block._type === 'block' && block.listItem) {
        const level = block.level || 0;
        nestingMap[block._key || i] = level;
        currentNesting = level;
      } else {
        currentNesting = 0;
        listStack = [];
      }
    }

    return nestingMap;
  };

  const renderInlineText = (
    children: any[],
    markDefs?: any[],
    blockMarkDefs?: any[]
  ) => {
    if (!children || !Array.isArray(children)) return null;

    // Combine markDefs from props and block-level markDefs
    const allMarkDefs = [...(markDefs || []), ...(blockMarkDefs || [])];

    return children.map((child, index) => {
      if (typeof child === 'string') return child;

      if (child._type === 'span') {
        let text: any = child.text || '';
        let linkHref: string | null = null;
        const decoratorStyles: any[] = [];

        if (child.marks) {
          // First pass: handle annotations (link, textAlign) that need markDefs
          child.marks.forEach((mark: string | any) => {
            // Handle link annotation
            if (typeof mark === 'string') {
              // Check if mark key references a link annotation in markDefs
              const markDef = allMarkDefs.find((def: any) => def._key === mark);
              if (markDef && markDef._type === 'link') {
                linkHref = markDef.href || null;
              }
            } else if (typeof mark === 'object' && mark !== null) {
              // Sometimes marks can be objects directly (inline annotations)
              const markType = (mark as any)._type || mark._type;
              if (markType === 'link') {
                linkHref =
                  (mark as any).href || (mark as any).value?.href || null;
              }
              // Or it might be a reference object with _key that we need to look up
              const markKey = (mark as any)._key;
              if (markKey && !linkHref) {
                const markDef = allMarkDefs.find(
                  (def: any) => def._key === markKey
                );
                if (markDef && markDef._type === 'link') {
                  linkHref = markDef.href || null;
                }
              }
            }
          });

          // Second pass: collect decorator styles (strong, em, code, etc.)
          child.marks.forEach((mark: string | any) => {
            // Handle decorators (strong, em, code, etc.)
            if (typeof mark === 'string') {
              switch (mark) {
                case 'strong':
                  decoratorStyles.push(mergedStyles.strong);
                  break;
                case 'em':
                  decoratorStyles.push({ fontStyle: 'italic' });
                  break;
                case 'code':
                  decoratorStyles.push({
                    fontFamily: 'monospace',
                    backgroundColor: '#F3F4F6',
                    paddingHorizontal: 4,
                    borderRadius: 2,
                  });
                  break;
                case 'underline':
                  decoratorStyles.push({ textDecorationLine: 'underline' });
                  break;
                case 'strike-through':
                  decoratorStyles.push({ textDecorationLine: 'line-through' });
                  break;
              }
            }
          });

          // Merge all decorator styles into one object
          // Important: fontStyle: 'italic' should take precedence over fontStyle: 'normal'
          const mergedDecoratorStyle = decoratorStyles.reduce((acc, style) => {
            const merged = { ...acc, ...style };
            // If both styles have fontStyle, prioritize 'italic' over 'normal'
            if (acc.fontStyle === 'italic' || style.fontStyle === 'italic') {
              merged.fontStyle = 'italic';
            }
            return merged;
          }, {});

          // Apply decorators by wrapping text (only if not a link, since link will handle it)
          if (!linkHref && decoratorStyles.length > 0) {
            // Use merged decorator style in a single Text component
            text = (
              <Text key={`${index}-decorators`} style={mergedDecoratorStyle}>
                {text}
              </Text>
            );
          }

          // Apply link if found, merging link styles with all decorator styles
          if (linkHref) {
            const handleLinkPress = () => {
              if (linkHref) {
                Linking.openURL(linkHref);
              }
            };
            // Merge link styles with all decorator styles
            // Ensure fontStyle: 'italic' is preserved when merging with link styles
            const linkStyle =
              decoratorStyles.length > 0
                ? {
                    ...mergedStyles.link,
                    ...mergedDecoratorStyle,
                    // Preserve italic if it exists in decorator styles
                    ...(mergedDecoratorStyle.fontStyle === 'italic'
                      ? { fontStyle: 'italic' }
                      : {}),
                  }
                : mergedStyles.link;
            // Use Text with onPress instead of TouchableOpacity to keep it inline
            text = (
              <Text
                key={`${index}-link`}
                style={linkStyle}
                onPress={handleLinkPress}
              >
                {text}
              </Text>
            );
          }
        }

        // Text alignment is now handled at block level, so we don't need to wrap here
        return text;
      }

      return null;
    });
  };

  // Helper function to check if a block is empty (skip line)
  const isEmptyBlock = (block: any): boolean => {
    if (block._type !== 'block' || block.listItem) return false;
    if (!block.children || !Array.isArray(block.children)) return true;

    // Check if all children have empty or whitespace-only text
    const hasContent = block.children.some((child: any) => {
      if (typeof child === 'string') return child.trim().length > 0;
      if (child._type === 'span' && child.text) {
        return child.text.trim().length > 0;
      }
      return false;
    });

    return !hasContent;
  };

  const renderBlock = (
    block: any,
    index: number,
    nestingLevel: number = 0,
    _isLastInList: boolean = false,
    _afterSkipLine: boolean = false,
    _isFirstInList: boolean = false
  ) => {
    if (
      block._type === 'large_input_box' ||
      block._type === 'mid_input_box' ||
      block._type === 'small_input_box'
    ) {
    }

    if (block._type === 'block') {
      // Handle empty blocks (skip lines) - render as spacing element
      if (isEmptyBlock(block)) {
        return <View key={block._key || index} style={styles.skipLineSpacer} />;
      }

      // Keep prev bullet/number behavior
      if (block.listItem) {
        const baseListStyle =
          block.listItem === 'bullet'
            ? mergedStyles.bullet
            : mergedStyles.number;

        // Spacing between list rows lives on the wrapper only (matches normal marginBottom: 10).
        const listTextStyle = {
          ...baseListStyle,
          marginBottom: 0,
          marginTop: 0,
        };

        const bullet =
          block.listItem === 'bullet'
            ? '•'
            : `${numberingMap[block._key || index] || 1}.`;

        const indentLevel = nestingLevel * 15;

        let displayBullet = bullet;
        if (block.listItem === 'bullet') {
          if (nestingLevel === 1) displayBullet = '•';
          else if (nestingLevel === 2) displayBullet = '◦';
          else if (nestingLevel === 3) displayBullet = '▪';
          else displayBullet = '▫';
        }

        const containerStyle = [
          styles.listItemContainer,
          { marginLeft: indentLevel, marginBottom: 10 },
        ];

        return (
          <View key={block._key || index} style={containerStyle}>
            {/* Row keeps bullet + body on one line; body Text wraps inside remaining width */}
            <View style={styles.listItemRow}>
              <Text style={[listTextStyle, styles.listItemBullet]}>
                {displayBullet}{' '}
              </Text>
              <SelectableText
                blockKey={block._key || `block-${index}`}
                highlights={getBlockHighlights(block, index)}
                style={[listTextStyle, styles.listItemBody]}
                spans={block.children}
                allMarkDefs={[...(markDefs || []), ...(block.markDefs || [])]}
                mergedStyles={mergedStyles}
              />
            </View>
          </View>
        );
      }

      const style = block.style || 'normal';

      // Check for text alignment in block children
      // Combine markDefs from props and block-level markDefs
      const allMarkDefs = [...(markDefs || []), ...(block.markDefs || [])];

      let blockTextAlign: 'left' | 'center' | 'right' | undefined = undefined;
      if (block.children && Array.isArray(block.children)) {
        for (const child of block.children) {
          if (child.marks && Array.isArray(child.marks)) {
            for (const mark of child.marks) {
              // Marks in Sanity are typically string keys that reference markDefs
              if (typeof mark === 'string') {
                // Check if mark key references a textAlign annotation in markDefs
                const markDef = allMarkDefs.find(
                  (def: any) => def._key === mark
                );
                if (markDef) {
                  if (markDef._type === 'textAlign') {
                    blockTextAlign = markDef.align || 'left';
                    break;
                  }
                }
              } else if (typeof mark === 'object' && mark !== null) {
                // Sometimes marks can be objects directly (inline annotations)
                const markType = (mark as any)._type || mark._type;
                if (markType === 'textAlign') {
                  blockTextAlign =
                    (mark as any).align || (mark as any).value?.align || 'left';
                  break;
                }
                // Or it might be a reference object with _key that we need to look up
                const markKey = (mark as any)._key;
                if (markKey) {
                  const markDef = allMarkDefs.find(
                    (def: any) => def._key === markKey
                  );
                  if (markDef && markDef._type === 'textAlign') {
                    blockTextAlign = markDef.align || 'left';
                    break;
                  }
                }
              }
            }
            if (blockTextAlign) break;
          }
        }
      }

      // Apply alignment to block style
      // Default to 'left' if no alignment is specified
      const finalTextAlign = blockTextAlign || 'left';
      const blockStyle = {
        ...mergedStyles[style],
        textAlign: finalTextAlign,
      };

      switch (style) {
        case 'h1':
          return (
            <SelectableText
              key={block._key || index}
              blockKey={block._key || `block-${index}`}
              highlights={getBlockHighlights(block, index)}
              style={blockStyle}
              spans={block.children}
              allMarkDefs={[...(markDefs || []), ...(block.markDefs || [])]}
              mergedStyles={mergedStyles}
            />
          );
        case 'h2':
          return (
            <SelectableText
              key={block._key || index}
              blockKey={block._key || `block-${index}`}
              highlights={getBlockHighlights(block, index)}
              style={blockStyle}
              spans={block.children}
              allMarkDefs={[...(markDefs || []), ...(block.markDefs || [])]}
              mergedStyles={mergedStyles}
            />
          );
        case 'h3':
          return (
            <SelectableText
              key={block._key || index}
              blockKey={block._key || `block-${index}`}
              highlights={getBlockHighlights(block, index)}
              style={blockStyle}
              spans={block.children}
              allMarkDefs={[...(markDefs || []), ...(block.markDefs || [])]}
              mergedStyles={mergedStyles}
            />
          );
        case 'h4':
          return (
            <SelectableText
              key={block._key || index}
              blockKey={block._key || `block-${index}`}
              highlights={getBlockHighlights(block, index)}
              style={blockStyle}
              spans={block.children}
              allMarkDefs={[...(markDefs || []), ...(block.markDefs || [])]}
              mergedStyles={mergedStyles}
            />
          );
        case 'blockquote':
          return (
            <View key={block._key || index} style={mergedStyles.blockquote}>
              <SelectableText
                blockKey={block._key || `block-${index}`}
                highlights={getBlockHighlights(block, index)}
                style={[
                  mergedStyles.blockquoteText,
                  blockTextAlign && blockTextAlign !== 'left'
                    ? { textAlign: blockTextAlign }
                    : undefined,
                ]}
                spans={block.children}
                allMarkDefs={[...(markDefs || []), ...(block.markDefs || [])]}
                mergedStyles={mergedStyles}
              />
            </View>
          );
        case 'code':
          return (
            <View key={block._key || index} style={mergedStyles.code}>
              <Text
                style={
                  blockTextAlign && blockTextAlign !== 'left'
                    ? { textAlign: blockTextAlign }
                    : {}
                }
              >
                {renderInlineText(block.children, markDefs, block.markDefs)}
              </Text>
            </View>
          );
        case 'normal':
        default:
          // Add marginTop to first block to prevent text clipping (only if not explicitly set by caller)
          const isFirstBlock = index === 0;
          const finalBlockStyle =
            isFirstBlock &&
            (blockStyle.marginTop === undefined ||
              blockStyle.marginTop === null)
              ? { ...blockStyle, marginTop: 8 }
              : blockStyle;
          return (
            <SelectableText
              key={block._key || index}
              blockKey={block._key || `block-${index}`}
              highlights={getBlockHighlights(block, index)}
              style={finalBlockStyle}
              spans={block.children}
              allMarkDefs={[...(markDefs || []), ...(block.markDefs || [])]}
              mergedStyles={mergedStyles}
            />
          );
      }
    }

    if (block._type === 'image') {
      const imageUrl = block.asset?._ref
        ? `https://cdn.sanity.io/images/fercgabp/production/${block.asset._ref
            .replace('image-', '')
            .replace('-jpg', '.jpg')
            .replace('-png', '.png')
            .replace('-webp', '.webp')}`
        : null;

      return (
        <View key={block._key || index} style={mergedStyles.imageSection}>
          {imageUrl ? (
            <TouchableOpacity
              onPress={() => {
                setSelectedImage(imageUrl);
              }}
              activeOpacity={0.9}
            >
              <ExpoImage
                source={imageUrl}
                style={mergedStyles.image}
                contentFit='cover'
                cachePolicy='memory-disk'
              />
            </TouchableOpacity>
          ) : (
            <View style={mergedStyles.imagePlaceholder}>
              <Text style={mergedStyles.imagePlaceholderText}>{t('learn.lesson.imagePlaceholder')}</Text>
            </View>
          )}
        </View>
      );
    }

    // Special block types
    if (block._type === 'dropdown') {
      return (
        <DropdownBlock
          block={block}
          index={index}
          renderRichText={dropdownBlocks => (
            <RichTextRenderer
              blocks={dropdownBlocks}
              markDefs={markDefs}
              inputValues={inputValues}
              onInputChange={onInputChange}
              questionAnswers={questionAnswers}
              onQuestionAnswer={onQuestionAnswer}
              showQuestionFeedback={showQuestionFeedback}
              highlights={highlights}
            />
          )}
        />
      );
    }

    if (block._type === 'example_box') {
      // keep your current example override
      return (
        <View key={block._key || index} style={mergedStyles.exampleBox}>
          <Text style={mergedStyles.exampleBoxTitle}>{t('learn.lesson.example')}</Text>
          <RichTextRenderer
            blocks={block.content || []}
            markDefs={markDefs}
            styles={{
              normal: mergedStyles.exampleText,
              bullet: mergedStyles.exampleText,
              number: mergedStyles.exampleText,
              link: mergedStyles.link,
            }}
            highlights={highlights}
          />
        </View>
      );
    }

    if (block._type === 'tip_box') {
      return (
        <View key={block._key || index} style={mergedStyles.tipBoxContainer}>
          <RichTextRenderer
            blocks={block.content || []}
            markDefs={markDefs}
            styles={{
              // regular copy inside tip
              normal: mergedStyles.tipBodyText,
              bullet: mergedStyles.tipBodyText,
              number: mergedStyles.tipBodyText,
              link: mergedStyles.link,
              // bold lead-in (e.g., "**Safety tip:**")
              strong: mergedStyles.tipTitleText,
            }}
            highlights={highlights}
          />
        </View>
      );
    }

    if (block._type === 'note_box') {
      return (
        <View key={block._key || index} style={mergedStyles.noteBox}>
          <RichTextRenderer
            blocks={block.content || []}
            markDefs={markDefs}
            compactContainer
            styles={{
              normal: mergedStyles.noteBoxText,
              bullet: mergedStyles.noteBoxText,
              number: mergedStyles.noteBoxText,
              strong: {
                ...mergedStyles.noteBoxText,
                fontWeight: '700',
              },
              link: mergedStyles.link,
            }}
            highlights={highlights}
          />
        </View>
      );
    }

    if (block._type === 'checklist_checkbox') {
      if (!block.label) return null;
      return (
        <ChecklistCheckboxBlock
          key={block._key || index}
          label={block.label}
          defaultChecked={block.defaultChecked ?? false}
        />
      );
    }

    // Inputs
    if (
      block._type === 'large_input_box' ||
      block._type === 'mid_input_box' ||
      block._type === 'small_input_box'
    ) {
      const isLarge = block._type === 'large_input_box';
      const isMid = block._type === 'mid_input_box';
      const isSmall = block._type === 'small_input_box';

      return (
        <View
          key={block._key || index}
          style={mergedStyles.inputFieldContainer}
        >
          <TextInput
            style={[
              {
                borderWidth: 1,
                borderColor: '#9CA3AF',
                borderRadius: 8,
                paddingHorizontal: 20,
                paddingVertical: 20,
                fontSize: 18,
                backgroundColor: '#fff',
                minHeight: 44,
                marginBottom: 30,
              },
              isLarge && { height: 300, textAlignVertical: 'top' },
              isMid && { height: 160, textAlignVertical: 'top' },
              isSmall && { height: 60, textAlignVertical: 'top' },
            ]}
            placeholder={block.placeholder || t('learn.typeHerePlaceholder')}
            value={inputValues[block._key] || ''}
            onChangeText={value => onInputChange?.(block._key, value)}
            multiline={true}
            numberOfLines={isLarge ? 10 : isMid ? 6 : 3}
          />
        </View>
      );
    }

    // Two options question - special layout with side-by-side cards
    if (block._type === 'two_options_question') {
      const currentAnswer = questionAnswers[block._key];
      const selectedValue = currentAnswer as string | undefined;

      const handleOptionSelect = (optionValue: string) => {
        if (!onQuestionAnswer) return;
        onQuestionAnswer(block._key, optionValue);
      };

      return (
        <View key={block._key || index} style={styles.questionContainer}>
          <View style={styles.questionTextContainer}>
            <RichTextRenderer
              blocks={block.question_text || []}
              markDefs={markDefs}
            />
          </View>
          <View style={styles.twoOptionsContainer}>
            {(block.options || []).map((option: any) => {
              const isSelected = selectedValue === option.value;
              const isCorrect = option.is_correct;
              const showFeedback = showQuestionFeedback;

              let optionStyle = styles.twoOptionCard;

              if (isSelected) {
                optionStyle = styles.twoOptionCardSelected;
              }

              if (showFeedback) {
                if (isCorrect) {
                  optionStyle = styles.twoOptionCardCorrect;
                } else if (isSelected && !isCorrect) {
                  optionStyle = styles.twoOptionCardIncorrect;
                }
              }

              return (
                <TouchableOpacity
                  key={option._key}
                  style={optionStyle}
                  onPress={() =>
                    !showFeedback && handleOptionSelect(option.value)
                  }
                  disabled={showFeedback}
                >
                  <View style={styles.twoOptionContent}>
                    <RichTextRenderer
                      blocks={option.text || []}
                      markDefs={option.textMarkDefs}
                      styles={{
                        normal: styles.twoOptionText,
                        strong: styles.twoOptionTextBold,
                      }}
                    />
                  </View>
                  {showFeedback && isSelected && option.explanation && (
                    <View style={styles.twoOptionExplanation}>
                      <RichTextRenderer
                        blocks={option.explanation}
                        markDefs={option.explanationMarkDefs}
                        styles={{ normal: styles.explanationText }}
                      />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      );
    }

    // Question types for activity pages (MCQ single and multiple)
    if (
      block._type === 'multiple_choice_single' ||
      block._type === 'multiple_choice_multiple'
    ) {
      const isMultiple = block._type === 'multiple_choice_multiple';
      const currentAnswer = questionAnswers[block._key];
      const isArrayAnswer = Array.isArray(currentAnswer);
      const selectedValues = isArrayAnswer
        ? (currentAnswer as string[])
        : currentAnswer
          ? [currentAnswer as string]
          : [];

      const handleOptionSelect = (optionValue: string) => {
        if (!onQuestionAnswer) return;

        if (isMultiple) {
          const current = (questionAnswers[block._key] as string[]) || [];
          const newAnswer = current.includes(optionValue)
            ? current.filter(v => v !== optionValue)
            : [...current, optionValue];
          onQuestionAnswer(block._key, newAnswer);
        } else {
          onQuestionAnswer(block._key, optionValue);
        }
      };

      return (
        <View key={block._key || index} style={styles.questionContainer}>
          <View style={styles.questionTextContainer}>
            <RichTextRenderer
              blocks={block.question_text || []}
              markDefs={markDefs}
            />
          </View>
          <View style={styles.optionsContainer}>
            {(block.options || []).map((option: any) => {
              const isSelected = isMultiple
                ? selectedValues.includes(option.value)
                : selectedValues[0] === option.value;
              const isCorrect = option.is_correct;
              const showFeedback = showQuestionFeedback;

              let optionStyle = styles.questionOption;
              let checkboxStyle = styles.questionCheckbox;

              if (isSelected) {
                optionStyle = styles.questionOptionSelected;
                checkboxStyle = styles.questionCheckboxSelected;
              }

              if (showFeedback) {
                if (isCorrect) {
                  optionStyle = styles.questionOptionCorrect;
                  checkboxStyle = styles.questionCheckboxCorrect;
                } else if (isSelected && !isCorrect) {
                  optionStyle = styles.questionOptionIncorrect;
                  checkboxStyle = styles.questionCheckboxIncorrect;
                }
              }

              return (
                <TouchableOpacity
                  key={option._key}
                  style={optionStyle}
                  onPress={() =>
                    !showFeedback && handleOptionSelect(option.value)
                  }
                  disabled={showFeedback}
                >
                  <View style={styles.questionOptionRow}>
                    <View style={checkboxStyle}>
                      {isSelected && (
                        <Text style={styles.questionCheckmark}>✓</Text>
                      )}
                    </View>
                    <View style={styles.questionOptionContent}>
                      <RichTextRenderer
                        blocks={option.text || []}
                        markDefs={option.textMarkDefs}
                        styles={{ normal: styles.questionOptionText }}
                        compactContainer
                      />
                    </View>
                  </View>
                  {showFeedback && isSelected && option.explanation && (
                    <View style={styles.explanationContainer}>
                      <RichTextRenderer
                        blocks={option.explanation}
                        markDefs={option.explanationMarkDefs}
                        styles={{ normal: styles.explanationText }}
                      />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      );
    }

    if (block._type === 'matching_question') {
      const questionKey = block._key || `matching-${index}`;

      // Get state for this question, initialize if needed
      const questionState = matchingQuestionState[questionKey] || {
        selectedLeftItem: null,
        selectedRightIndex: null,
        matchedPairs: {},
        completedLeftItems: [],
        completedRightIndices: [],
        incorrectLeftItems: [],
        incorrectRightIndices: [],
      };

      // Get scrambled right items for this question
      const scrambledRightItems =
        scrambledRightItemsMap[questionKey] ||
        (block.matching_pairs || []).map((pair: any) => pair.right_item);

      const {
        selectedLeftItem,
        selectedRightIndex,
        completedLeftItems,
        completedRightIndices,
        incorrectLeftItems,
        incorrectRightIndices,
      } = questionState;

      const handleMatchingItemSelect = (
        itemOrIndex: string | number,
        side: 'left' | 'right'
      ) => {
        setMatchingQuestionState(prev => {
          const current = prev[questionKey] || {
            selectedLeftItem: null,
            selectedRightIndex: null,
            matchedPairs: {},
            completedLeftItems: [],
            completedRightIndices: [],
            incorrectLeftItems: [],
            incorrectRightIndices: [],
          };

          if (side === 'left') {
            const item = itemOrIndex as string;
            if (current.completedLeftItems.includes(item)) return prev;
            return {
              ...prev,
              [questionKey]: {
                ...current,
                selectedLeftItem:
                  current.selectedLeftItem === item ? null : item,
                incorrectLeftItems: [],
                incorrectRightIndices: [],
              },
            };
          } else {
            const idx = itemOrIndex as number;
            if (current.completedRightIndices.includes(idx)) return prev;
            return {
              ...prev,
              [questionKey]: {
                ...current,
                selectedRightIndex:
                  current.selectedRightIndex === idx ? null : idx,
                incorrectLeftItems: [],
                incorrectRightIndices: [],
              },
            };
          }
        });
      };

      const handleMatchingCheck = () => {
        if (selectedLeftItem === null || selectedRightIndex === null) return;
        const selectedRightItem = scrambledRightItems[selectedRightIndex];

        const correctMatch = (block.matching_pairs || []).find(
          (pair: any) =>
            pair.left_item === selectedLeftItem &&
            pair.right_item === selectedRightItem
        );

        setMatchingQuestionState(prev => {
          const current = prev[questionKey] || {
            selectedLeftItem: null,
            selectedRightIndex: null,
            matchedPairs: {},
            completedLeftItems: [],
            completedRightIndices: [],
            incorrectLeftItems: [],
            incorrectRightIndices: [],
          };

          if (correctMatch) {
            return {
              ...prev,
              [questionKey]: {
                ...current,
                matchedPairs: {
                  ...current.matchedPairs,
                  [selectedLeftItem]: selectedRightItem,
                },
                completedLeftItems: [
                  ...current.completedLeftItems,
                  selectedLeftItem,
                ],
                completedRightIndices: [
                  ...current.completedRightIndices,
                  selectedRightIndex,
                ],
                selectedLeftItem: null,
                selectedRightIndex: null,
                incorrectLeftItems: current.incorrectLeftItems.filter(
                  i => i !== selectedLeftItem
                ),
                incorrectRightIndices: current.incorrectRightIndices.filter(
                  i => i !== selectedRightIndex
                ),
              },
            };
          } else {
            return {
              ...prev,
              [questionKey]: {
                ...current,
                incorrectLeftItems: [
                  ...current.incorrectLeftItems,
                  selectedLeftItem,
                ],
                incorrectRightIndices: [
                  ...current.incorrectRightIndices,
                  selectedRightIndex,
                ],
                selectedLeftItem: null,
                selectedRightIndex: null,
              },
            };
          }
        });
      };

      return (
        <View key={block._key || index} style={styles.questionContainer}>
          <View style={styles.questionTextContainer}>
            <RichTextRenderer
              blocks={block.question_text || []}
              markDefs={markDefs}
            />
          </View>
          <View style={styles.matchingContainer}>
            <View style={styles.matchingGrid}>
              {/* Left Column */}
              <View style={styles.matchingColumn}>
                {(block.matching_pairs || []).map(
                  (pair: any, pairIndex: number) => (
                    <TouchableOpacity
                      key={`left-${pairIndex}`}
                      style={[
                        styles.matchingItem,
                        selectedLeftItem === pair.left_item &&
                          styles.matchingItemSelected,
                        completedLeftItems.includes(pair.left_item) &&
                          styles.matchingItemCompleted,
                        incorrectLeftItems.includes(pair.left_item) &&
                          styles.matchingItemIncorrect,
                      ]}
                      onPress={() =>
                        handleMatchingItemSelect(pair.left_item, 'left')
                      }
                      disabled={completedLeftItems.includes(pair.left_item)}
                    >
                      <Text style={styles.matchingItemText}>
                        {pair.left_item}
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </View>

              {/* Right Column - Scrambled */}
              <View style={styles.matchingColumn}>
                {scrambledRightItems.map(
                  (rightItem: string, itemIndex: number) => (
                    <TouchableOpacity
                      key={`right-${itemIndex}-${rightItem}`}
                      style={[
                        styles.matchingItem,
                        selectedRightIndex === itemIndex &&
                          styles.matchingItemSelected,
                        completedRightIndices.includes(itemIndex) &&
                          styles.matchingItemCompleted,
                        incorrectRightIndices.includes(itemIndex) &&
                          styles.matchingItemIncorrect,
                      ]}
                      onPress={() =>
                        handleMatchingItemSelect(itemIndex, 'right')
                      }
                      disabled={completedRightIndices.includes(itemIndex)}
                    >
                      <Text style={styles.matchingItemText}>{rightItem}</Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            </View>

            {/* Check Button */}
            <TouchableOpacity
              style={[
                styles.matchingCheckButton,
                (selectedLeftItem === null || selectedRightIndex === null) &&
                  styles.matchingCheckButtonDisabled,
              ]}
              onPress={handleMatchingCheck}
              disabled={
                selectedLeftItem === null || selectedRightIndex === null
              }
            >
              <Text
                style={[
                  styles.matchingCheckButtonText,
                  (selectedLeftItem === null || selectedRightIndex === null) &&
                    styles.matchingCheckButtonTextDisabled,
                ]}
              >
                {t('common.check')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return null;
  };

  const nestingLevels = calculateNestingLevels(blocks);

  // Kept for stable Metro/Fast Refresh (call sites below); list spacing no longer uses these.
  const isLastListItem = (index: number): boolean => {
    const currentBlock = blocks[index];
    if (
      !currentBlock ||
      currentBlock._type !== 'block' ||
      !currentBlock.listItem
    ) {
      return false;
    }
    const nextBlock = blocks[index + 1];
    return !nextBlock || nextBlock._type !== 'block' || !nextBlock.listItem;
  };

  const isAfterSkipLine = (index: number): boolean => {
    if (index === 0) return false;
    const previousBlock = blocks[index - 1];
    return !!(previousBlock && isEmptyBlock(previousBlock));
  };

  const isFirstListItem = (index: number): boolean => {
    const currentBlock = blocks[index];
    if (
      !currentBlock ||
      currentBlock._type !== 'block' ||
      !currentBlock.listItem
    ) {
      return false;
    }
    if (index === 0) return true;
    const previousBlock = blocks[index - 1];
    return (
      !previousBlock ||
      previousBlock._type !== 'block' ||
      !previousBlock.listItem
    );
  };

  const handleCloseImageModal = () => {
    setSelectedImage(null);
  };

  return (
    <View
      style={[styles.container, compactContainer && { flex: 0, paddingTop: 0 }]}
    >
      {blocks
        .map((block, index) => {
          const isLastInList = isLastListItem(index);
          const afterSkipLine = isAfterSkipLine(index);
          const isFirstInList = isFirstListItem(index);
          return (
            <React.Fragment key={block._key || index}>
              {renderBlock(
                block,
                index,
                nestingLevels[block._key || index] || 0,
                isLastInList,
                afterSkipLine,
                isFirstInList
              )}
            </React.Fragment>
          );
        })
        .filter(Boolean)}

      {/* Image Viewer Modal */}
      <ImageViewerModal
        imageUri={selectedImage}
        onClose={handleCloseImageModal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 4 }, // Add top padding to prevent text clipping
  listItemContainer: { marginBottom: 0 }, // Row spacing set on list row View (matches paragraph rhythm)
  /** Without this, bullet Text + SelectableText stack vertically (default column flex). */
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  listItemBullet: {
    flexShrink: 0,
  },
  listItemBody: {
    flex: 1,
    flexShrink: 1,
  },
  skipLineSpacer: { height: 25, marginBottom: 0 }, // Figma content column gap
  inputFieldContainer: {
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#9CA3AF',
    borderRadius: 8,
    padding: 12,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 2,
    borderColor: '#9CA3AF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
    minHeight: 44,
  },
  largeInput: {
    height: 300,
    textAlignVertical: 'top',
    borderWidth: 2,
    borderColor: '#9CA3AF',
  },
  midInput: {
    height: 200,
    textAlignVertical: 'top',
    borderWidth: 2,
    borderColor: '#9CA3AF',
  },
  smallInput: { height: 100, borderWidth: 2, borderColor: '#9CA3AF' },
  // Question styles
  questionContainer: {
    marginVertical: 20,
  },
  questionTextContainer: {
    marginBottom: 16,
  },
  optionsContainer: {
    gap: 12,
  },
  questionOption: {
    borderWidth: 1,
    borderColor: '#DCDCDC',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
  },
  questionOptionSelected: {
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#F3F4F6',
  },
  questionOptionCorrect: {
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#F3F4F6',
  },
  questionOptionIncorrect: {
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#F3F4F6',
  },
  questionOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  questionCheckbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#000',
    borderRadius: 4,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionCheckboxSelected: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#000',
    borderRadius: 4,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionCheckboxCorrect: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 4,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionCheckboxIncorrect: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#EF4444',
    borderRadius: 4,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionCheckmark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  questionOptionContent: {
    flex: 1,
    justifyContent: 'center',
  },
  questionOptionText: {
    fontSize: 18,
    color: '#374151',
    lineHeight: 27,
    fontWeight: '400',
  },
  explanationContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  explanationText: {
    fontSize: 18,
    color: '#6B7280',
    lineHeight: 27,
    fontStyle: 'italic',
  },
  matchingPairsContainer: {
    gap: 8,
    marginTop: 12,
  },
  matchingPairRow: {
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  matchingPairText: {
    fontSize: 18,
    color: '#374151',
    lineHeight: 27,
  },
  // Matching question styles (same as quiz)
  matchingContainer: {
    marginTop: 20,
  },
  matchingGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 20,
  },
  matchingColumn: {
    flex: 1,
    gap: 12,
  },
  matchingItem: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#DCDCDC',
    borderRadius: 8,
    padding: 16,
    minWidth: 170,
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchingItemSelected: {
    borderColor: '#575757',
    backgroundColor: '#F3F4F6',
  },
  matchingItemCompleted: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
    opacity: 0.7,
  },
  matchingItemIncorrect: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  matchingItemText: {
    fontSize: 18,
    color: '#374151',
    lineHeight: 27,
    textAlign: 'center',
    fontWeight: '500',
  },
  matchingCheckButton: {
    backgroundColor: '#575757',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
    alignSelf: 'center',
  },
  matchingCheckButtonDisabled: {
    backgroundColor: '#F3F4F6',
  },
  matchingCheckButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  matchingCheckButtonTextDisabled: {
    color: '#9CA3AF',
  },
  // Two options question styles
  twoOptionsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  twoOptionCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#DCDCDC',
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 406,
  },
  twoOptionCardSelected: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#000',
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 406,
  },
  twoOptionCardCorrect: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 406,
  },
  twoOptionCardIncorrect: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 406,
  },
  twoOptionContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  twoOptionText: {
    fontSize: 16,
    color: '#000',
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'center',
    fontStyle: 'normal',
  },
  twoOptionTextBold: {
    fontSize: 16,
    color: '#000',
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'center',
    fontStyle: 'normal',
  },
  twoOptionExplanation: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    width: '100%',
  },

});

import { typography } from '@/constants/Typography';
import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSelection } from '@/context/SelectionContext';
import { useTranslation } from 'react-i18next';

interface SelectionActionBubbleProps {
  onHighlight: () => void;
  onRemoveHighlight: () => void;
  onAskAI: () => void;
}

const BUBBLE_HEIGHT = 44;
const ARROW_SIZE = 8;
const SCREEN_PADDING = 16;

export default function SelectionActionBubble({
  onHighlight,
  onRemoveHighlight,
  onAskAI,
}: SelectionActionBubbleProps) {
  const { t } = useTranslation();
  const { selection } = useSelection();
  const { width: screenWidth } = useWindowDimensions();

  if (selection.mode !== 'selected' || !selection.startWord) return null;

  const isHighlighted = !!selection.existingHighlight;

  const anchorX = selection.startWord.pageX;
  const anchorY = selection.startWord.pageY;

  const maxBubbleWidth = 200;
  let bubbleLeft = Math.max(SCREEN_PADDING, anchorX - maxBubbleWidth / 2);
  bubbleLeft = Math.min(
    screenWidth - maxBubbleWidth - SCREEN_PADDING,
    bubbleLeft
  );

  const computedTop = anchorY - BUBBLE_HEIGHT - ARROW_SIZE - 12;
  const showBelow = computedTop < 0;
  const bubbleTop = showBelow ? anchorY + ARROW_SIZE + 12 : computedTop;

  return (
    <View style={styles.fullScreen} pointerEvents='box-none'>
      <View style={[styles.container, { top: bubbleTop, left: bubbleLeft }]}>
        {showBelow && <View style={styles.arrowUp} />}

        <View style={styles.bubble}>
          <Pressable
            style={styles.button}
            onPress={isHighlighted ? onRemoveHighlight : onHighlight}
          >
            <Feather
              name={isHighlighted ? 'x' : 'edit-3'}
              size={16}
              color='#fff'
            />
            <Text style={styles.buttonText}>
              {isHighlighted
                ? t('learn.selectionBubble.remove')
                : t('learn.selectionBubble.highlight')}
            </Text>
          </Pressable>

          <View style={styles.divider} />

          <Pressable style={styles.button} onPress={onAskAI}>
            <Feather name='help-circle' size={16} color='#fff' />
            <Text style={styles.buttonText}>
              {t('learn.selectionBubble.askAI')}
            </Text>
          </Pressable>
        </View>

        {!showBelow && <View style={styles.arrow} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  container: {
    position: 'absolute',
    zIndex: 1000,
    alignItems: 'center',
  },
  bubble: {
    flexDirection: 'row',
    backgroundColor: '#1F2937',
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 6,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 6,
  },
  buttonText: { ...typography.button, color: '#fff' },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  arrow: {
    width: 0,
    height: 0,
    alignSelf: 'center',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#1F2937',
  },
  arrowUp: {
    width: 0,
    height: 0,
    alignSelf: 'center',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#1F2937',
  },
});

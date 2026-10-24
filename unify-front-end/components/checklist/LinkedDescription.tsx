import React, { useMemo } from 'react';
import {
  Linking,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { splitDescriptionLinks } from '@/utils/descriptionLinks';

interface LinkedDescriptionProps {
  text: string;
  style?: StyleProp<TextStyle>;
}

async function openWebLink(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch (error) {
    console.warn('Failed to open link:', url, error);
  }
}

/**
 * Renders a task description. Plain text stays one string. Each http or https
 * URL becomes a pressable link that opens in the system browser.
 */
export const LinkedDescription: React.FC<LinkedDescriptionProps> = ({
  text,
  style,
}) => {
  const segments = useMemo(() => splitDescriptionLinks(text), [text]);

  return (
    <Text style={style}>
      {segments.map((segment, index) =>
        segment.kind === 'link' ? (
          <Text
            key={`link-${index}`}
            style={styles.link}
            accessibilityRole='link'
            onPress={() => openWebLink(segment.url)}
          >
            {segment.text}
          </Text>
        ) : (
          segment.text
        )
      )}
    </Text>
  );
};

const styles = StyleSheet.create({
  link: {
    color: '#2563EB',
    textDecorationLine: 'underline',
  },
});

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
  TextStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type AccordionItem = {
  id: string;
  title: string;
  body: string | any[];
};

export default function DropdownAccordion({
  items,
  titleTextStyle,
  renderRichText,
}: {
  items: AccordionItem[];
  titleTextStyle?: TextStyle;
  renderRichText?: (blocks: any[]) => React.ReactNode;
}) {
  const [openId, setOpenId] = React.useState<string | null>(null);

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenId(prev => (prev === id ? null : id));
  };

  return (
    <View style={styles.container}>
      {items.map(item => {
        const open = item.id === openId;
        return (
          <View key={item.id}>
            <TouchableOpacity
              style={styles.header}
              accessibilityRole='button'
              accessibilityState={{ expanded: open }}
              onPress={() => toggle(item.id)}
            >
              <Text style={[styles.headerText, titleTextStyle]}>
                {item.title}
              </Text>
              <Feather
                name={open ? 'chevron-up' : 'chevron-down'}
                size={18}
                color='#111827'
                style={{ alignSelf: 'center' }}
              />
            </TouchableOpacity>
            {open && (
              <View style={styles.body}>
                {typeof item.body === 'string' ? (
                  <Text style={styles.bodyText}>{item.body}</Text>
                ) : (
                  renderRichText?.(item.body)
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  header: {
    backgroundColor: '#E6E6E6',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: 8,
  },
  headerText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginRight: 12,
  },
  body: {
    backgroundColor: '#E6E6E6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 15,
    color: '#111827',
    lineHeight: 22,
  },
});

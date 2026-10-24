import { typography } from '@/constants/Typography';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import DropdownAccordion from '@/components/learn/DropdownAccordion';

interface DropdownBlockProps {
  block: any;
  index: number;
  renderRichText: (blocks: any[]) => React.ReactNode;
}

export default function DropdownBlock({
  block,
  index,
  renderRichText,
}: DropdownBlockProps) {
  // Check if we have the required fields for this dropdown structure
  if (!block.label || !block.content) {
    return null;
  }

  // Create a single dropdown item with the label as title and content as body
  const dropdownItems = [
    {
      id: block._key || `dropdown-${index}`,
      title: block.label,
      body: block.content,
    },
  ];

  return (
    <View key={block._key || index}>
      <DropdownAccordion
        items={dropdownItems}
        titleTextStyle={styles.closedTitle}
        renderRichText={renderRichText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  closedTitle: {
    ...typography.reading,
    fontStyle: 'normal',
    fontWeight: '700',
  },
});

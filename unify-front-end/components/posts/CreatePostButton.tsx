import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import CreatePostIcon from '@/assets/images/create-post.svg';
import { Group } from '@/types/groups';

interface CreatePostButtonProps {
  preselectedGroup?: Group | null;
}

export default function CreatePostButton({
  preselectedGroup,
}: CreatePostButtonProps) {
  const router = useRouter();

  const handlePress = () => {
    const params = preselectedGroup
      ? { preselectedGroup: JSON.stringify(preselectedGroup) }
      : undefined;

    router.push(
      params
        ? ({
            pathname: '/create-post' as any,
            params,
          } as any)
        : ('/create-post' as any)
    );
  };

  return (
    <TouchableOpacity style={styles.floatingButton} onPress={handlePress}>
      <CreatePostIcon width={27} height={27} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  floatingButton: {
    position: 'absolute',
    bottom: 20, // Above the bottom navigation
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    // Same near-black as the Learn primary action (learnStyles.action).
    backgroundColor: '#191919',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});

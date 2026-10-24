import { typography } from '@/constants/Typography';
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  Modal,
  Pressable,
  FlatList,
  ViewToken,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import { Theme } from '@/constants/Theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SWIPE_DISMISS_THRESHOLD = 120;
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 50 };

interface ImageViewerModalProps {
  visible: boolean;
  imageUrls: string[];
  initialIndex: number;
  onClose: () => void;
  author?: {
    username: string;
    profilePictureUrl?: string | null;
  };
}

function ZoomableImage({
  uri,
  screenWidth,
  screenHeight,
}: {
  uri: string;
  screenWidth: number;
  screenHeight: number;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate(e => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  const panGesture = Gesture.Pan()
    .minPointers(2)
    .onUpdate(e => {
      if (savedScale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withSpring(2.5);
        savedScale.value = 2.5;
      }
    });

  const composed = Gesture.Simultaneous(pinchGesture, panGesture);
  const withDoubleTap = Gesture.Exclusive(doubleTap, composed);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={withDoubleTap}>
      <Animated.View
        style={[
          {
            width: screenWidth,
            height: screenHeight,
            justifyContent: 'center' as const,
            alignItems: 'center' as const,
          },
          animatedStyle,
        ]}
      >
        <Image
          source={{ uri }}
          style={{ width: screenWidth, height: screenHeight * 0.7 }}
          contentFit='contain'
          cachePolicy='memory-disk'
        />
      </Animated.View>
    </GestureDetector>
  );
}

export default function ImageViewerModal({
  visible,
  imageUrls,
  initialIndex,
  onClose,
  author,
}: ImageViewerModalProps) {
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Swipe-to-dismiss
  const dismissY = useSharedValue(0);
  const dismissOpacity = useSharedValue(1);

  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  const dismissGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-20, 20])
    .onUpdate(e => {
      dismissY.value = e.translationY;
      dismissOpacity.value = Math.max(
        0.5,
        1 - Math.abs(e.translationY) / (SCREEN_HEIGHT * 0.4)
      );
    })
    .onEnd(e => {
      if (Math.abs(e.translationY) > SWIPE_DISMISS_THRESHOLD) {
        dismissOpacity.value = withTiming(0, { duration: 200 });
        dismissY.value = withTiming(
          e.translationY > 0 ? SCREEN_HEIGHT : -SCREEN_HEIGHT,
          { duration: 200 },
          () => {
            runOnJS(handleDismiss)();
          }
        );
      } else {
        dismissY.value = withSpring(0);
        dismissOpacity.value = withTiming(1);
      }
    });

  const dismissAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dismissY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: dismissOpacity.value,
  }));

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
    []
  );

  // Reset state when modal opens
  const handleShow = useCallback(() => {
    setCurrentIndex(initialIndex);
    dismissY.value = 0;
    dismissOpacity.value = 1;
  }, [initialIndex, dismissY, dismissOpacity]);

  const slideStyle = {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  };

  const renderImage = useCallback(
    ({ item }: { item: string }) => (
      <View style={slideStyle}>
        <ZoomableImage
          uri={item}
          screenWidth={SCREEN_WIDTH}
          screenHeight={SCREEN_HEIGHT}
        />
      </View>
    ),
    [SCREEN_WIDTH, SCREEN_HEIGHT]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType='fade'
      statusBarTranslucent
      onRequestClose={onClose}
      onShow={handleShow}
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
    >
      <GestureHandlerRootView style={styles.container}>
        {visible && (
          <StatusBar
            barStyle='light-content'
            backgroundColor='transparent'
            translucent
            hidden={Platform.OS === 'ios'}
          />
        )}

        {/* Dark backdrop */}
        <Animated.View style={[styles.backdrop, backdropAnimatedStyle]} />

        {/* Dismissible image area */}
        <GestureDetector gesture={dismissGesture}>
          <Animated.View style={[styles.content, dismissAnimatedStyle]}>
            {imageUrls.length === 1 ? (
              <View style={slideStyle}>
                <ZoomableImage
                  uri={imageUrls[0]}
                  screenWidth={SCREEN_WIDTH}
                  screenHeight={SCREEN_HEIGHT}
                />
              </View>
            ) : (
              <FlatList
                data={imageUrls}
                renderItem={renderImage}
                keyExtractor={(_, i) => String(i)}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={initialIndex}
                getItemLayout={(_, index) => ({
                  length: SCREEN_WIDTH,
                  offset: SCREEN_WIDTH * index,
                  index,
                })}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={VIEWABILITY_CONFIG}
              />
            )}
          </Animated.View>
        </GestureDetector>

        {/* Header overlay */}
        <View
          style={[styles.header, { paddingTop: insets.top + 8 }]}
          pointerEvents='box-none'
        >
          <View style={styles.headerLeft}>
            {author && (
              <>
                <Avatar
                  profilePictureUrl={author.profilePictureUrl ?? undefined}
                  username={author.username}
                  size={32}
                />
                <Text style={styles.headerName} numberOfLines={1}>
                  {author.username}
                </Text>
              </>
            )}
          </View>

          <View style={styles.headerRight}>
            {imageUrls.length > 1 && (
              <Text style={styles.headerCount}>
                {currentIndex + 1} / {imageUrls.length}
              </Text>
            )}
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={styles.closeButton}
            >
              <Feather name='x' size={22} color={Theme.white} />
            </Pressable>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  content: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerName: {
    ...typography.secondary,
    color: Theme.white,
    flexShrink: 1,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerCount: {
    ...typography.secondary,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

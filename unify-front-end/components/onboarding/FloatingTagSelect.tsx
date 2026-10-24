import { typography } from '@/constants/Typography';
import React, { useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
  useReducedMotion,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Theme } from '@/constants/Theme';

interface Option {
  value: string;
  label: string;
  hasOther?: boolean;
  icon?: React.ComponentProps<typeof Feather>['name'];
}

interface FloatingTagSelectProps {
  question: string;
  options: Option[];
  selectedValues: string[];
  otherValue: string | null;
  onToggle: (value: string) => void;
  onOtherChange: (value: string) => void;
  required?: boolean;
  error?: string;
}

// Richer, more saturated pastels that pop
const TAG_COLORS = [
  '#FFDAB9', // peach
  '#B8D4FF', // cornflower
  '#B8E6C8', // seafoam
  '#D8B4FE', // violet
  '#FDE68A', // golden
  '#FCA5A5', // coral
  '#7DD3FC', // sky
  '#BEF264', // lime
  '#C4B5FD', // iris
  '#FDBA74', // tangerine
  '#86EFAC', // mint
  '#93C5FD', // periwinkle
];

// Seeded random for deterministic layouts
function seededRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

interface FloatingTagProps {
  option: Option;
  index: number;
  isSelected: boolean;
  onPress: () => void;
  color: string;
  rotation: number;
}

const FloatingTag = React.memo(function FloatingTag({
  option,
  index,
  isSelected,
  onPress,
  color,
  rotation,
}: FloatingTagProps) {
  const prefersReducedMotion = useReducedMotion();

  // Entrance animation
  const entrance = useSharedValue(0);
  const scale = useSharedValue(1);
  const bounce = useSharedValue(0);

  // Unique floating parameters per tag — more pronounced movement
  const floatAmpX = useMemo(
    () => 3 + seededRandom(index * 17 + 11) * 4,
    [index]
  );
  const floatAmpY = useMemo(
    () => 4 + seededRandom(index * 23 + 5) * 5,
    [index]
  );
  const floatSpeedX = useMemo(
    () => 2000 + seededRandom(index * 31 + 19) * 2000,
    [index]
  );
  const floatSpeedY = useMemo(
    () => 2500 + seededRandom(index * 37 + 29) * 2500,
    [index]
  );

  // Continuous floating
  const floatX = useSharedValue(0);
  const floatY = useSharedValue(0);

  useEffect(() => {
    // Staggered entrance — pop in from random scale
    const delay = index * 70;
    entrance.value = prefersReducedMotion
      ? withTiming(1, { duration: 0 })
      : withDelay(
          delay,
          withSpring(1, { damping: 10, stiffness: 80, mass: 0.8 })
        );

    if (prefersReducedMotion) {
      floatX.value = withTiming(0, { duration: 0 });
      floatY.value = withTiming(0, { duration: 0 });
      return;
    }

    // Start floating with unique timing — more dramatic movement
    floatX.value = withDelay(
      delay + 300,
      withRepeat(
        withSequence(
          withTiming(floatAmpX, {
            duration: floatSpeedX,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(-floatAmpX, {
            duration: floatSpeedX,
            easing: Easing.inOut(Easing.sin),
          })
        ),
        -1,
        true
      )
    );

    floatY.value = withDelay(
      delay + 300,
      withRepeat(
        withSequence(
          withTiming(floatAmpY, {
            duration: floatSpeedY,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(-floatAmpY, {
            duration: floatSpeedY,
            easing: Easing.inOut(Easing.sin),
          })
        ),
        -1,
        true
      )
    );
  }, []);

  const handlePress = useCallback(() => {
    if (!prefersReducedMotion) {
      // Satisfying squish → overshoot → settle
      scale.value = withSequence(
        withSpring(0.85, { damping: 20, stiffness: 500 }),
        withSpring(1.12, { damping: 6, stiffness: 250 }),
        withSpring(1, { damping: 10, stiffness: 200 })
      );
      // Upward bounce on tap
      bounce.value = withSequence(
        withSpring(-12, { damping: 6, stiffness: 400 }),
        withSpring(0, { damping: 8, stiffness: 150 })
      );
    }
    onPress();
  }, [onPress, prefersReducedMotion]);

  const animatedStyle = useAnimatedStyle(() => {
    const entranceScale = interpolate(entrance.value, [0, 1], [0.1, 1]);
    return {
      opacity: entrance.value,
      transform: [
        { scale: entranceScale * scale.value },
        { translateX: floatX.value },
        { translateY: floatY.value + bounce.value },
        { rotate: `${rotation}deg` },
      ],
    };
  });

  const selectedBg = isSelected ? Theme.primaryGatherRed : color;
  const textColor = isSelected ? Theme.white : '#1a1a1a';
  const iconColor = isSelected ? Theme.white : '#555';

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={handlePress}
        accessibilityRole='checkbox'
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={option.label}
        style={[
          styles.tag,
          {
            backgroundColor: selectedBg,
            borderColor: isSelected
              ? Theme.primaryGatherRed
              : 'rgba(0,0,0,0.04)',
            shadowColor: isSelected ? Theme.primaryGatherRed : '#000',
            shadowOpacity: isSelected ? 0.3 : 0.08,
            shadowOffset: { width: 0, height: isSelected ? 4 : 2 },
            shadowRadius: isSelected ? 8 : 4,
            elevation: isSelected ? 6 : 2,
          },
        ]}
      >
        {option.icon && (
          <Feather name={option.icon} size={15} color={iconColor} />
        )}
        <Text
          style={[
            styles.tagText,
            { color: textColor },
            isSelected && styles.tagTextSelected,
          ]}
          numberOfLines={1}
        >
          {option.label}
        </Text>
        {isSelected && (
          <View style={styles.tagCheck}>
            <Feather name='check' size={11} color={Theme.primaryGatherRed} />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
});

export default function FloatingTagSelect({
  question,
  options,
  selectedValues,
  otherValue,
  onToggle,
  onOtherChange,
  required = false,
  error,
}: FloatingTagSelectProps) {
  const { t } = useTranslation();
  const { width: screenWidth } = useWindowDimensions();

  const otherOption = options.find(opt => opt.hasOther);
  const showOtherInput =
    otherOption && selectedValues.includes(otherOption.value);

  // Generate slight random rotations for each tag (deterministic)
  const rotations = useMemo(
    () => options.map((_, i) => (seededRandom(i * 41 + 13) - 0.5) * 5),
    [options.length]
  );

  // Other input entrance animation
  const otherInputAnim = useSharedValue(showOtherInput ? 1 : 0);

  useEffect(() => {
    otherInputAnim.value = withSpring(showOtherInput ? 1 : 0, {
      damping: 15,
      stiffness: 150,
    });
  }, [showOtherInput]);

  const otherInputStyle = useAnimatedStyle(() => ({
    opacity: otherInputAnim.value,
    maxHeight: interpolate(otherInputAnim.value, [0, 1], [0, 80]),
    marginTop: interpolate(otherInputAnim.value, [0, 1], [0, 16]),
  }));

  return (
    <View style={styles.container}>
      <Text style={styles.question}>{question}</Text>
      {required &&
        error &&
        (selectedValues.length === 0 ||
          (showOtherInput && !otherValue?.trim())) && (
          <Text style={styles.errorText}>{error}</Text>
        )}

      <View style={styles.tagsContainer}>
        {options.map((option, index) => (
          <FloatingTag
            key={option.value}
            option={option}
            index={index}
            isSelected={selectedValues.includes(option.value)}
            onPress={() => onToggle(option.value)}
            color={TAG_COLORS[index % TAG_COLORS.length]}
            rotation={rotations[index]}
          />
        ))}
      </View>

      {otherOption && (
        <Animated.View style={[styles.otherInputContainer, otherInputStyle]}>
          <TextInput
            style={styles.otherInput}
            placeholder={t('onboarding.pleaseSpecify')}
            value={otherValue || ''}
            onChangeText={onOtherChange}
            placeholderTextColor={Theme.textInput}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  question: {
    ...typography.title,
    color: Theme.black,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  errorText: {
    ...typography.secondary,
    color: '#f00',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1,
    gap: 7,
  },
  tagText: { ...typography.secondary, fontWeight: '500' },
  tagTextSelected: {
    fontWeight: '700',
  },
  tagCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Theme.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 1,
  },
  otherInputContainer: {
    overflow: 'hidden',
    paddingHorizontal: 8,
  },
  otherInput: {
    ...typography.body,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInfoText,
    backgroundColor: Theme.white,
    color: Theme.black,
  },
});

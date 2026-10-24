import { typography } from '@/constants/Typography';
import React, {
  createContext,
  use,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Theme } from '@/constants/Theme';

interface ToastContextType {
  showToast: (message: string, onPress?: () => void) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const TOAST_DURATION = 2500;
const ANIMATION_DURATION = 250;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [onPressCallback, setOnPressCallback] = useState<(() => void) | null>(
    null
  );
  const [isVisible, setIsVisible] = useState(false);
  const translateY = useRef(new Animated.Value(100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const hideToast = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 100,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsVisible(false);
      setMessage(null);
      setOnPressCallback(null);
    });
  }, [translateY, opacity]);

  const showToast = useCallback(
    (msg: string, onPress?: () => void) => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setMessage(msg);
      setOnPressCallback(() => onPress || null);
      setIsVisible(true);

      // Reset animation values
      translateY.setValue(100);
      opacity.setValue(0);

      // Animate in
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: ANIMATION_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-hide after duration
      timeoutRef.current = setTimeout(() => {
        hideToast();
      }, TOAST_DURATION);
    },
    [translateY, opacity, hideToast]
  );

  const handleToastPress = useCallback(() => {
    if (onPressCallback) {
      hideToast();
      onPressCallback();
    }
  }, [onPressCallback, hideToast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <ToastContext value={{ showToast }}>
      {children}
      {isVisible && message && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              transform: [{ translateY }],
              opacity,
              bottom:
                Math.max(insets.bottom, 16) + (Platform.OS === 'ios' ? 80 : 70),
            },
          ]}
        >
          <TouchableOpacity
            style={styles.toast}
            onPress={handleToastPress}
            activeOpacity={onPressCallback ? 0.8 : 1}
            disabled={!onPressCallback}
          >
            <Text style={styles.toastText}>{message}</Text>
            {onPressCallback && (
              <Feather
                name='chevron-right'
                size={18}
                color={Theme.black}
                style={styles.chevron}
              />
            )}
          </TouchableOpacity>
        </Animated.View>
      )}
    </ToastContext>
  );
}

export function useToast() {
  const context = use(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    backgroundColor: Theme.white,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    maxWidth: '85%',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  toastText: {
    flexShrink: 1,
    color: Theme.black,
    ...typography.secondary,
    textAlign: 'center',
  },
  chevron: {
    marginLeft: 4,
  },
});

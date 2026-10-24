import { typography } from '@/constants/Typography';
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';

interface AnnouncementModalProps {
  storageKey: string;
  title: string;
  body: string;
  buttonLabel?: string;
  icon?: React.ReactNode;
}

export default function AnnouncementModal({
  storageKey,
  title,
  body,
  buttonLabel,
  icon,
}: AnnouncementModalProps) {
  const { t } = useTranslation();
  const resolvedButtonLabel = buttonLabel ?? t('common.gotIt');
  // null = loading, true = show, false = hide
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const val = await AsyncStorage.getItem(storageKey);
        if (!cancelled) {
          setVisible(val !== 'true');
        }
      } catch {
        // On read failure, show the modal
        if (!cancelled) {
          setVisible(true);
        }
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const dismiss = async () => {
    setVisible(false);
    try {
      await AsyncStorage.setItem(storageKey, 'true');
    } catch {
      // Silently ignore write failures
    }
  };

  // Render nothing until AsyncStorage read resolves, or if permanently dismissed
  if (visible !== true) return null;

  return (
    <Modal visible transparent animationType='fade' onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.content}>
            {/* Badge + Title row */}
            <View style={styles.headerRow}>
              {icon ? (
                <View style={styles.iconContainer}>{icon}</View>
              ) : (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{t('common.new')}</Text>
                </View>
              )}
            </View>

            <Text style={styles.title}>{title}</Text>

            <View style={styles.divider} />

            <Text style={styles.body}>{body}</Text>

            <TouchableOpacity
              style={styles.button}
              onPress={dismiss}
              activeOpacity={0.85}
            >
              <Text style={styles.buttonText}>{resolvedButtonLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.50)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    maxWidth: 340,
    width: '100%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 16,
  },

  content: {
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 28,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  badge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },

  badgeText: {
    ...typography.caption,
    color: '#B45309',
    letterSpacing: 1.2,
    fontWeight: '800',
  },

  iconContainer: {
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 10,
  },

  title: {
    ...typography.section,
    color: '#111827',
    letterSpacing: -0.4,
    marginBottom: 14,
  },

  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginBottom: 14,
  },

  body: {
    ...typography.secondary,
    color: '#4B5563',
    marginBottom: 24,
    fontWeight: '400',
  },

  button: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },

  buttonText: { ...typography.button, color: '#FFFFFF', letterSpacing: 0.2 },
});

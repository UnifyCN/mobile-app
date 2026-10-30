import React, { useRef, useState } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  AccessibilityInfo,
  type Text as NativeText,
} from 'react-native';
import { LiveText as Text } from '@/components/common/LiveText';
import { useTranslation } from 'react-i18next';
import { useCompanionPushDevice } from '@/hooks/companion/useCompanionPush';
import { stillOwned, ownAccountWork } from '@/services/account/accountSession';
import { typography } from '@/constants/Typography';
import { minTarget } from '@/utils/touchTarget';
export function CompanionPushControl() {
  const { t } = useTranslation();
  const { view, device, locale } = useCompanionPushDevice();
  const [confirm, setConfirm] = useState(false);
  const resultRef = useRef<NativeText>(null);
  const focused = useRef<string | null>(null);
  const owner = ownAccountWork();
  const busy = view.phase === 'busy';
  const button = (label: string, action: () => void, disabled = busy) => (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={() => {
        if (stillOwned(owner)) action();
      }}
      style={[
        styles.button,
        { minHeight: minTarget() },
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{t('companionPush.title')}</Text>
      <Text style={styles.secondary}>{t('companionPush.scope')}</Text>
      <Text style={styles.secondary}>
        {t(`companionPush.permission.${view.permission}`)}
      </Text>
      <Text
        key={`${view.phase}:${view.receiptId ?? 'none'}`}
        ref={resultRef}
        accessible
        accessibilityLiveRegion='polite'
        onLayout={() => {
          if (
            focused.current !== `${view.phase}:${view.receiptId ?? 'none'}` &&
            view.phase !== 'busy' &&
            view.phase !== 'off' &&
            stillOwned(owner) &&
            resultRef.current
          ) {
            focused.current = `${view.phase}:${view.receiptId ?? 'none'}`;
            AccessibilityInfo.sendAccessibilityEvent(
              resultRef.current,
              'focus'
            );
          }
        }}
      >
        {t(`companionPush.state.${view.phase}`)}
      </Text>
      {view.receiptSaved ? (
        <Text style={styles.secondary}>{t('companionPush.receipt')}</Text>
      ) : null}
      {view.phase === 'unknown' || view.phase === 'serviceDisabled'
        ? button(t('companionPush.check'), () => void device.check(locale))
        : view.phase === 'not_applied'
          ? button(t('companionPush.retry'), () => void device.retry(locale))
          : view.phase === 'on'
            ? button(
                t('companionPush.disable'),
                () => void device.disable(locale)
              )
            : !['unsupported', 'revoked', 'sessionEnded', 'busy'].includes(
                  view.phase
                )
              ? button(
                  t('companionPush.enable'),
                  () => void device.enable(locale)
                )
              : null}
      {button(t('companionPush.refresh'), () => void device.refresh(locale))}
      {view.phase === 'on' && !confirm
        ? button(t('companionPush.disconnect'), () => setConfirm(true))
        : null}
      {confirm ? (
        <View style={styles.group}>
          <Text>{t('companionPush.disconnectHelp')}</Text>
          {button(t('companionPush.confirmDisconnect'), () => {
            setConfirm(false);
            void device.revoke();
          })}
          {button(t('companionPush.keep'), () => setConfirm(false))}
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  group: { gap: 10 },
  label: { ...typography.label, color: '#0F172A' },
  secondary: { ...typography.secondary, color: '#475569' },
  button: {
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFF4E8',
  },
  buttonText: { ...typography.button, color: '#9A4A00' },
  disabled: { opacity: 0.45 },
});

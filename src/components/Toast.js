import React, { useState, useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setToastRef } from '../store';
import { colors, radius, typography } from '../theme';

export default function ToastProvider() {
  const [toast, setToast] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setToastRef((msg, icon = '✅') => {
      setToast({ msg, icon });
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.delay(2800),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setToast(null));
    });
  }, []);

  if (!toast) return null;

  return (
    <Animated.View style={[styles.toast, { opacity, bottom: insets.bottom + 24 }]}>
      <Text style={styles.icon}>{toast.icon}</Text>
      <Text style={styles.msg}>{toast.msg}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 12,
  },
  icon: { fontSize: 18 },
  msg: { ...typography.bodyBold, color: '#fff', flex: 1 },
});

import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '../../theme';

/**
 * FormField
 * Label + TextInput pair used throughout every modal.
 *
 * Props:
 *   label          string
 *   value          string
 *   onChangeText   fn
 *   placeholder    string
 *   keyboardType   string   — default 'default'
 *   multiline      bool     — default false
 *   numberOfLines  number   — default 3 (multiline only)
 *   secureTextEntry bool    — default false
 *   autoCapitalize string   — default 'sentences'
 *   inputStyle     object   — extra styles merged onto the input
 *   containerStyle object   — extra styles merged onto the wrapper
 *   autoFocus      bool
 */
export default function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  multiline = false,
  numberOfLines = 3,
  secureTextEntry = false,
  autoCapitalize = 'sentences',
  inputStyle,
  containerStyle,
  autoFocus = false,
}) {
  return (
    <View style={[styles.container, containerStyle]}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[styles.input, multiline && styles.multiline, inputStyle]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? numberOfLines : 1}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoFocus={autoFocus}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: {
    ...typography.smallBold,
    color: colors.text,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontSize: 11,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    ...typography.body,
    color: colors.text,
  },
  multiline: { height: 88, paddingTop: 12 },
});

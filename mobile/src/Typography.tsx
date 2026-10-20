import { forwardRef } from 'react';
import { Text as NativeText, TextInput as NativeTextInput, StyleSheet, type TextProps, type TextInputProps } from 'react-native';

export const interfaceFonts = {
  InterRegular: require('../assets/fonts/Inter_400Regular.ttf'),
  InterMedium: require('../assets/fonts/Inter_500Medium.ttf'),
  InterSemiBold: require('../assets/fonts/Inter_600SemiBold.ttf'),
  InterBold: require('../assets/fonts/Inter_700Bold.ttf'),
};
function face(style: TextProps['style']) {
  const resolved = StyleSheet.flatten(style) || {};
  if (resolved.fontFamily) return {};
  const weight = resolved.fontWeight === 'bold' ? 700 : Number(resolved.fontWeight || 400);
  return { fontFamily: weight >= 700 ? 'InterBold' : weight >= 600 ? 'InterSemiBold' : weight >= 500 ? 'InterMedium' : 'InterRegular', fontWeight: 'normal' as const };
}
export const Text = forwardRef<NativeText, TextProps>(function Text({ style, ...props }, ref) {
  return <NativeText ref={ref} {...props} style={[style, face(style)]} />;
});
export const TextInput = forwardRef<NativeTextInput, TextInputProps>(function TextInput({ style, ...props }, ref) {
  return <NativeTextInput ref={ref} {...props} style={[style, face(style)]} />;
});

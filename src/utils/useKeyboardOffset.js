/**
 * useKeyboardOffset — reliable keyboard height tracking for all platforms.
 *
 * Replaces KeyboardAvoidingView inside pageSheet Modals, which is unreliable
 * when the text input lives outside a ScrollView.
 *
 * Usage:
 *   const kbOffset = useKeyboardOffset();
 *   <View style={[styles.container, { paddingBottom: kbOffset }]}>
 *     ...
 *   </View>
 */

import { useState, useEffect } from 'react';
import { Platform, Keyboard } from 'react-native';

export function useKeyboardOffset() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, e => setOffset(e.endCoordinates.height));
    const onHide = Keyboard.addListener(hideEvt, () => setOffset(0));
    return () => { onShow.remove(); onHide.remove(); };
  }, []);

  return offset;
}

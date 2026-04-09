// FR3: RejectionSheet — bottom sheet modal for rejection reason input
// Dark glass aesthetic: bg-surfaceElevated, border-border, NativeWind className only
//
// Styling exceptions (documented):
//   backdrop: style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} — rgba, not a hex, no NativeWind equivalent
//   placeholderTextColor="#484F58" — React Native prop (not a style), textMuted token hex

import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'

interface Props {
  visible: boolean
  onConfirm: (reason: string) => void
  onCancel: () => void
  initialReason?: string
}

export function RejectionSheet({ visible, onConfirm, onCancel, initialReason = 'Not approved' }: Props) {
  const [reason, setReason] = useState(initialReason)
  const inputRef = useRef<TextInput>(null)

  // Pre-fill and auto-focus when sheet opens
  useEffect(() => {
    if (visible) {
      setReason(initialReason)
      // Focus after a brief delay to ensure overlay is fully presented
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [visible, initialReason])

  const isDisabled = reason.trim().length === 0

  function handleConfirm() {
    if (!isDisabled) {
      onConfirm(reason)
    }
  }

  if (!visible) return null

  return (
    <KeyboardAvoidingView
      className="absolute top-0 left-0 right-0 bottom-0 justify-end"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Backdrop — rgba requires inline style, no NativeWind equivalent */}
      <TouchableOpacity
        className="flex-1"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        onPress={onCancel}
        activeOpacity={1}
      />

      {/* Sheet */}
      <View className="bg-surfaceElevated rounded-t-3xl p-5 pb-9 border-t border-border">
        <Text className="text-textPrimary text-lg font-sans-semibold mb-4">
          Rejection Reason
        </Text>

        <TextInput
          ref={inputRef}
          className="border border-border rounded-xl p-3 text-textPrimary text-base bg-surface min-h-[80px] mb-4"
          value={reason}
          onChangeText={setReason}
          placeholder="Enter rejection reason"
          placeholderTextColor="#484F58"
          multiline
          autoFocus
          returnKeyType="done"
          accessibilityLabel="Rejection reason input"
          textAlignVertical="top"
        />

        <View className="flex-row gap-3">
          <TouchableOpacity
            className="flex-1 py-3 rounded-xl bg-surface items-center border border-border"
            onPress={onCancel}
            accessibilityLabel="Cancel rejection"
          >
            <Text className="text-textSecondary text-base font-sans-medium">Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`flex-[2] py-3 rounded-xl items-center ${isDisabled ? 'bg-destructive/40' : 'bg-destructive'}`}
            onPress={handleConfirm}
            disabled={isDisabled}
            accessibilityLabel="Confirm rejection"
          >
            <Text className="text-white text-base font-sans-semibold">
              Confirm Reject
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

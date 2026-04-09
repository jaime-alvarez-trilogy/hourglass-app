// AppBreakdownCard — 12-app-breakdown-ui FR3
// Card displaying per-app AI vs non-AI slot breakdown with guidance chips.
//
// Layout:
//   Card (borderAccentColor=violet)
//   └─ SectionLabel "APP BREAKDOWN"
//   └─ Sub-label "AI APPS" + rows sorted by aiSlots desc
//   └─ Sub-label "NOT AI" + rows sorted by nonAiSlots desc
//   └─ Guidance section (omitted when guidance=[])
//      └─ [colored dot] [chip text]
//
// Returns null when entries=[].

import React from 'react';
import { View, Text } from 'react-native';
import Card from './Card';
import SectionLabel from './SectionLabel';
import AppUsageBar from './AppUsageBar';
import { colors } from '@/src/lib/colors';
import type { AppBreakdownEntry } from '@/src/lib/aiAppBreakdown';
import type { GuidanceChip } from '@/src/lib/appGuidance';

// ─── Props ────────────────────────────────────────────────────────────────────

interface AppBreakdownCardProps {
  /** Aggregated 12w entries. Max 8 shown per section. */
  entries: AppBreakdownEntry[];
  /** 0–3 guidance chips from generateGuidance(). */
  guidance: GuidanceChip[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function AppRow({ entry, slotCount }: { entry: AppBreakdownEntry; slotCount: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text
        style={{ color: colors.textPrimary, fontSize: 13, flex: 1 }}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {entry.appName}
      </Text>
      <View style={{ flex: 2 }}>
        <AppUsageBar
          aiSlots={entry.aiSlots}
          brainliftSlots={entry.brainliftSlots}
          nonAiSlots={entry.nonAiSlots}
          height={4}
        />
      </View>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 11,
          width: 52,
          textAlign: 'right',
          fontVariant: ['tabular-nums'],
        }}
      >
        {slotCount} slots
      </Text>
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AppBreakdownCard({ entries, guidance }: AppBreakdownCardProps): JSX.Element | null {
  if (entries.length === 0) return null;

  const aiApps = entries
    .filter(e => e.aiSlots > 0)
    .sort((a, b) => b.aiSlots - a.aiSlots)
    .slice(0, 8);

  const nonAiApps = entries
    .filter(e => e.nonAiSlots > 0)
    .sort((a, b) => b.nonAiSlots - a.nonAiSlots)
    .slice(0, 8);

  return (
    <Card borderAccentColor={colors.violet}>
      <SectionLabel className="mb-3">APP BREAKDOWN</SectionLabel>

      {/* AI apps section */}
      {aiApps.length > 0 && (
        <View style={{ marginBottom: nonAiApps.length > 0 ? 12 : 0 }}>
          <Text style={{ color: colors.textMuted, fontSize: 10, letterSpacing: 0.8, marginBottom: 6 }}>
            AI APPS
          </Text>
          <View style={{ gap: 8 }}>
            {aiApps.map(entry => (
              <AppRow key={entry.appName} entry={entry} slotCount={entry.aiSlots + entry.nonAiSlots} />
            ))}
          </View>
        </View>
      )}

      {/* Non-AI apps section */}
      {nonAiApps.length > 0 && (
        <View>
          <Text style={{ color: colors.textMuted, fontSize: 10, letterSpacing: 0.8, marginBottom: 6 }}>
            NON-AI SLOTS
          </Text>
          <View style={{ gap: 8 }}>
            {nonAiApps.map(entry => (
              <AppRow key={entry.appName} entry={entry} slotCount={entry.nonAiSlots} />
            ))}
          </View>
        </View>
      )}

      {/* Guidance chips — omitted when empty */}
      {guidance.length > 0 && (
        <View style={{ marginTop: 12, gap: 6 }}>
          {guidance.map((chip, idx) => (
            <View
              key={idx}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: chip.color,
                  marginTop: 4,
                  flexShrink: 0,
                }}
              />
              <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 }}>
                {chip.text}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

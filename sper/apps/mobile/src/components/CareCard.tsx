import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { CareCardDTO, TouchpointType } from '@sper/shared-types';
import { color, elevation, radius, space, type } from '../design/tokens';
import { strings } from '../design/strings';
import { ResponderGuidanceBox } from './ResponderGuidanceBox';
import { Touchable } from './Touchable';
import { openWhatsApp, openMessage, outreachPrefill, isDesktopWeb } from '../lib/deeplink';

interface Props {
  card: CareCardDTO;
  onLogCare: (type: TouchpointType) => void;
  alreadyReached?: string[]; // responder names
}

/**
 * The responder's view when a friend has flagged distress. Leads with the
 * person, not the data; every action is off-app or a quiet log.
 */
export function CareCard({ card, onLogCare, alreadyReached }: Props) {
  const prefill = outreachPrefill(card.target_name);
  const selfReached = alreadyReached?.includes('You') ?? false;

  const sendVoice = async () => {
    const opened = await openWhatsApp(prefill);
    if (opened) onLogCare('VoiceNoteSent');
  };
  const sendMsg = async () => {
    const opened = await openMessage(prefill);
    if (opened) onLogCare('TextSent');
  };

  if (card.gratitude_shown) {
    return (
      <View style={[styles.card, styles.gratitudeCard]}>
        <Text style={styles.gratitude}>{strings.care.gratitudeReceived(card.target_name)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{strings.care.cardTitle(card.target_name)}</Text>

      <View style={styles.dims}>
        {card.flagged_dimensions.map((d) => (
          <View key={d} style={styles.dimChip}>
            <Text style={styles.dimText}>{labelFor(d)}</Text>
          </View>
        ))}
      </View>

      {card.optional_note ? <Text style={styles.note}>“{card.optional_note}”</Text> : null}

      {!selfReached ? (
        <>
          {card.verse ? <Text style={styles.verse}>{card.verse}</Text> : null}
          <ResponderGuidanceBox />
          {isDesktopWeb() ? <Text style={styles.note}>{strings.care.desktopOutreachNote}</Text> : null}
          <View style={styles.actions}>
            {!isDesktopWeb() ? (
              <>
                <Action label={strings.care.sendVoiceNote} onPress={sendVoice} primary />
                <Action label={strings.care.sendMessage} onPress={sendMsg} />
              </>
            ) : null}
            <Action label={strings.care.pray} onPress={() => onLogCare('PrayedFor')} />
          </View>
        </>
      ) : null}

      {alreadyReached && alreadyReached.length > 0 ? (
        <Text style={[styles.reached, selfReached && styles.reachedSelf]}>
          {selfReached ? '✓ ' : ''}
          {strings.care.alreadyReached(alreadyReached.join(', '))}
        </Text>
      ) : null}
    </View>
  );
}

function Action({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.action, primary && styles.actionPrimary]}
    >
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
    </Touchable>
  );
}

function labelFor(dim: string): string {
  const map: Record<string, string> = {
    spiritual: 'Spiritual',
    physical: 'Physical',
    emotional: 'Emotional',
    vocational: 'Career / Life',
    relational: 'Relational',
  };
  return map[dim] ?? dim;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
    borderWidth: 1,
    borderColor: color.border,
    ...elevation.sm,
  },
  title: { ...type.title, color: color.textPrimary },
  dims: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  dimChip: {
    backgroundColor: color.surfaceRaised,
    borderRadius: radius.pill,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
  },
  dimText: { ...type.caption, color: color.amber },
  note: { ...type.body, color: color.textPrimary, fontStyle: 'italic' },
  verse: { ...type.caption, color: color.sage },
  actions: { gap: space.sm },
  action: {
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: color.border,
  },
  actionPrimary: { backgroundColor: color.sage, borderColor: color.sage },
  actionText: { ...type.label, color: color.textPrimary },
  actionTextPrimary: { color: color.bg, fontWeight: '600' },
  reached: { ...type.caption, color: color.textMuted, textAlign: 'center' },
  reachedSelf: { color: color.sage, fontWeight: '600' },
  gratitudeCard: { backgroundColor: color.bloomSoft, borderColor: color.bloom },
  gratitude: { ...type.body, color: color.textPrimary, fontWeight: '600', textAlign: 'center' },
});

export default CareCard;

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';
import { reschedulePlanning, cancelPlanningNotifs } from '@/src/utils/notifications';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export type TimeSlot =
  | 'petit_dejeuner'
  | 'matin'
  | 'dejeuner'
  | 'apres_midi'
  | 'gouter'
  | 'aperitif'
  | 'diner'
  | 'soir';

export interface Planning {
  family_id: string;
  day_of_week: number;
  time_slot: TimeSlot;
  note?: string | null;
  updated_at?: string;
}

export const DAYS_OF_WEEK = [
  { value: 0, short: 'Lun', long: 'Lundi' },
  { value: 1, short: 'Mar', long: 'Mardi' },
  { value: 2, short: 'Mer', long: 'Mercredi' },
  { value: 3, short: 'Jeu', long: 'Jeudi' },
  { value: 4, short: 'Ven', long: 'Vendredi' },
  { value: 5, short: 'Sam', long: 'Samedi' },
  { value: 6, short: 'Dim', long: 'Dimanche' },
];

export const TIME_SLOTS: { value: TimeSlot; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'petit_dejeuner', label: 'Petit-déjeuner', icon: 'cafe' },
  { value: 'matin', label: 'Matin', icon: 'sunny' },
  { value: 'dejeuner', label: 'Déjeuner', icon: 'restaurant' },
  { value: 'apres_midi', label: 'Après-midi', icon: 'partly-sunny' },
  { value: 'gouter', label: 'Goûter', icon: 'ice-cream' },
  { value: 'aperitif', label: 'Apéro', icon: 'wine' },
  { value: 'diner', label: 'Dîner', icon: 'pizza' },
  { value: 'soir', label: 'Soir', icon: 'moon' },
];

export function describePlanning(p: Pick<Planning, 'day_of_week' | 'time_slot'>): string {
  const day = DAYS_OF_WEEK.find((d) => d.value === p.day_of_week);
  const slot = TIME_SLOTS.find((s) => s.value === p.time_slot);
  return `${day?.long ?? ''} ${slot?.label.toLowerCase() ?? ''}`.trim();
}

interface Props {
  familyId: string;
  initial?: Planning | null;
  onSaved: (planning: Planning) => void;
  onCancel?: () => void;
  compact?: boolean;
}

export default function PlanningPicker({ familyId, initial, onSaved, onCancel, compact }: Props) {
  const [day, setDay] = useState<number | null>(initial?.day_of_week ?? null);
  const [slot, setSlot] = useState<TimeSlot | null>(initial?.time_slot ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const canSave = day !== null && slot !== null && !isSaving;

  const handleSave = async () => {
    if (!canSave) return;
    setError('');
    setIsSaving(true);
    try {
      const r = await fetch(`${BACKEND_URL}/api/planning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ family_id: familyId, day_of_week: day, time_slot: slot }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || 'Enregistrement impossible');
      }
      const resp = await r.json();
      // Fire-and-forget: schedule local notifs for the new planning.
      // (Won't block the save; safe no-op on web.)
      if (day !== null && slot) {
        reschedulePlanning(day, slot).catch((err) =>
          console.warn('Notification schedule failed:', err),
        );
      }
      onSaved(resp.planning);
    } catch (e: any) {
      setError(e?.message || 'Erreur');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>Quel jour ?</Text>
      <View style={styles.daysRow}>
        {DAYS_OF_WEEK.map((d) => (
          <TouchableOpacity
            key={d.value}
            style={[styles.dayPill, day === d.value && styles.dayPillActive]}
            onPress={() => setDay(d.value)}
            testID={`planning-day-${d.value}`}
          >
            <Text style={[styles.dayPillText, day === d.value && styles.dayPillTextActive]}>
              {d.short}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.title}>Quel moment ?</Text>
      <View style={styles.slotsGrid}>
        {TIME_SLOTS.map((s) => (
          <TouchableOpacity
            key={s.value}
            style={[styles.slotChip, slot === s.value && styles.slotChipActive]}
            onPress={() => setSlot(s.value)}
            testID={`planning-slot-${s.value}`}
          >
            <Ionicons
              name={s.icon}
              size={16}
              color={slot === s.value ? colors.textWhite : colors.primary}
            />
            <Text style={[styles.slotChipText, slot === s.value && styles.slotChipTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.actionsRow}>
        {onCancel ? (
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={isSaving}>
            <Text style={styles.cancelBtnText}>Annuler</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave}
          testID="planning-save-button"
        >
          {isSaving ? (
            <ActivityIndicator color={colors.textWhite} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color={colors.textWhite} />
              <Text style={styles.saveBtnText}>Enregistrer</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { paddingVertical: 8 },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
    marginTop: 8,
  },
  daysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  dayPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.primaryLight,
    backgroundColor: colors.background,
    minWidth: 52,
    alignItems: 'center',
  },
  dayPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayPillText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  dayPillTextActive: {
    color: colors.textWhite,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  slotChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.primaryLight,
    backgroundColor: colors.background,
  },
  slotChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  slotChipText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  slotChipTextActive: {
    color: colors.textWhite,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    marginBottom: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 15,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: colors.textWhite,
    fontWeight: '700',
    fontSize: 15,
  },
});

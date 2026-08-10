/**
 * Local scheduled notifications for Mopado family planning.
 * - "Day before" reminder at 20:00
 * - "Day of" reminder at the chosen time slot
 * Web is a no-op. Native (iOS/Android) works after building the app.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Time slot → wall-clock hour+minute for the "day-of" reminder
export const TIME_SLOT_TIMES: Record<string, { hour: number; minute: number; label: string }> = {
  petit_dejeuner: { hour: 8, minute: 0, label: 'du petit-déjeuner' },
  matin: { hour: 10, minute: 0, label: 'du matin' },
  dejeuner: { hour: 12, minute: 30, label: 'du déjeuner' },
  apres_midi: { hour: 15, minute: 0, label: "de l'après-midi" },
  gouter: { hour: 16, minute: 30, label: 'du goûter' },
  aperitif: { hour: 18, minute: 30, label: "de l'apéro" },
  diner: { hour: 19, minute: 30, label: 'du dîner' },
  soir: { hour: 20, minute: 30, label: 'du soir' },
};

const DAY_LABELS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

type StoredIds = { dayBeforeId: string; dayId: string };
const STORAGE_KEY = 'mopado:planning:notifications';

// Lazy-load expo-notifications only on native (avoids bundling errors on web)
async function importNotif() {
  if (Platform.OS === 'web') return null;
  try {
    const mod = await import('expo-notifications');
    return mod;
  } catch (e) {
    console.warn('expo-notifications import failed:', e);
    return null;
  }
}

// Convert Mopado day (0=Monday) to Expo/native weekday (1=Sunday..7=Saturday)
function nativeWeekday(mondayBasedDay: number): number {
  return ((mondayBasedDay + 1) % 7) + 1;
}

function previousDay(day: number): number {
  return (day + 6) % 7;
}

/** Ensure permissions + Android channel. Call once at startup. */
export async function ensureNotificationsPermissions(): Promise<boolean> {
  const N = await importNotif();
  if (!N) return false;

  try {
    // Foreground presentation
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('mopado-reminders', {
        name: 'Rappels Mopado',
        importance: N.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
      });
    }

    const current = await N.getPermissionsAsync();
    let status = current.status;
    if (status !== N.PermissionStatus.GRANTED && current.canAskAgain !== false) {
      const requested = await N.requestPermissionsAsync();
      status = requested.status;
    }
    return status === N.PermissionStatus.GRANTED;
  } catch (e) {
    console.warn('ensureNotificationsPermissions error:', e);
    return false;
  }
}

/** Schedule the 2 recurring reminders for the given planning. Returns their IDs. */
async function schedulePlanningNotifs(
  dayOfWeek: number,
  timeSlot: string,
): Promise<StoredIds | null> {
  const N = await importNotif();
  if (!N) return null;

  const config = TIME_SLOT_TIMES[timeSlot];
  if (!config) return null;

  const dayLabel = DAY_LABELS[dayOfWeek] || '';
  const slotLabel = config.label;

  // Cancel any prior schedule first (defensive)
  await cancelPlanningNotifs();

  try {
    const dayBefore = previousDay(dayOfWeek);

    const iosTrigger = (weekday: number, hour: number, minute: number) => ({
      type: N.SchedulableTriggerInputTypes.CALENDAR as const,
      weekday,
      hour,
      minute,
      repeats: true,
    });
    const androidTrigger = (weekday: number, hour: number, minute: number) => ({
      type: N.SchedulableTriggerInputTypes.WEEKLY as const,
      weekday,
      hour,
      minute,
      repeats: true,
      channelId: 'mopado-reminders',
    });
    const trigger = Platform.OS === 'ios' ? iosTrigger : androidTrigger;

    // Day-before reminder at 20:00
    const dayBeforeId = await N.scheduleNotificationAsync({
      content: {
        title: 'Demain, c\'est Mopado !',
        body: `Rendez-vous ${dayLabel} ${slotLabel} pour votre moment en famille.`,
        data: { kind: 'day-before' },
        sound: 'default',
      },
      trigger: trigger(nativeWeekday(dayBefore), 20, 0),
    });

    // Day-of reminder at chosen slot
    const dayId = await N.scheduleNotificationAsync({
      content: {
        title: 'C\'est l\'heure de votre Mopado !',
        body: `15 minutes ensemble, ça commence maintenant. Ouvrez l'app.`,
        data: { kind: 'day-of' },
        sound: 'default',
      },
      trigger: trigger(nativeWeekday(dayOfWeek), config.hour, config.minute),
    });

    return { dayBeforeId, dayId };
  } catch (e) {
    console.warn('schedulePlanningNotifs error:', e);
    return null;
  }
}

/** Cancel any previously scheduled planning notifs (uses AsyncStorage). */
export async function cancelPlanningNotifs(): Promise<void> {
  const N = await importNotif();
  if (!N) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const ids: StoredIds = JSON.parse(raw);
    await Promise.all([
      N.cancelScheduledNotificationAsync(ids.dayBeforeId).catch(() => {}),
      N.cancelScheduledNotificationAsync(ids.dayId).catch(() => {}),
    ]);
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('cancelPlanningNotifs error:', e);
  }
}

/** Reschedule (cancel + recreate) after user changes their planning. */
export async function reschedulePlanning(dayOfWeek: number, timeSlot: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const granted = await ensureNotificationsPermissions();
  if (!granted) return;
  const ids = await schedulePlanningNotifs(dayOfWeek, timeSlot);
  if (ids) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } else {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
}

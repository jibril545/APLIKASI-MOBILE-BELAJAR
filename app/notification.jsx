import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// ==========================================
// CHANNEL ANDROID
// ==========================================
const CHANNEL_ID = "study-reminders";

async function ensureChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Pengingat Belajar",
    description: "Notifikasi saat jadwal belajar dimulai",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#5B8FA8",
    sound: "default",
  });
}

// ==========================================
// HANDLER FOREGROUND
// ==========================================
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ==========================================
// PERMISSION
// ==========================================
export async function requestNotificationPermission() {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") return true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch (error) {
    console.error("PERMISSION ERROR:", error);
    return false;
  }
}

// ==========================================
// HELPER: gabung tanggal + jam → Date
// ==========================================
function buildScheduleDate(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const [hh, mm] = timeStr.split(":").map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d) || isNaN(hh) || isNaN(mm)) {
      return null;
    }
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  } catch {
    return null;
  }
}

// ==========================================
// SCHEDULE — 1 jadwal = 1 notifikasi
// ==========================================
export async function scheduleScheduleNotification(schedule) {
  if (!schedule?.id) return;

  const { id, subject, study_date, start_time, duration } = schedule;

  // Skip kalau sudah selesai
  if (Number(schedule.is_completed) === 1) return;
  if (schedule.status === "finished") return;

  const target = buildScheduleDate(study_date, start_time);
  if (!target) return;

  // Skip kalau waktunya sudah lewat
  if (target.getTime() <= Date.now()) return;

  const identifier = `study_schedule_${id}`;

  // Batalkan dulu kalau sudah ada → cegah duplicate
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // ignore
  }

  try {
    await ensureChannel();
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: "Study Time",
        body: `Waktu belajar sudah dimulai!\nJadwal: ${subject}\nDurasi: ${duration} menit`,
        sound: "default",
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: { scheduleId: id },
        ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: {
        type: "date",
        date: target,
        ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
      },
    });
  } catch (error) {
    console.error("SCHEDULE NOTIFICATION ERROR:", error);
  }
}

// ==========================================
// CANCEL — 1 jadwal
// ==========================================
export async function cancelScheduleNotification(scheduleId) {
  if (!scheduleId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(
      `study_schedule_${scheduleId}`,
    );
  } catch (error) {
    console.error("CANCEL NOTIFICATION ERROR:", error);
  }
}

// ==========================================
// SINKRONISASI SEMUA JADWAL
// ==========================================
export async function syncAllScheduleNotifications(schedules) {
  if (!Array.isArray(schedules) || schedules.length === 0) return;

  const granted = await requestNotificationPermission();
  if (!granted) return;

  for (const item of schedules) {
    await scheduleScheduleNotification(item);
  }
}

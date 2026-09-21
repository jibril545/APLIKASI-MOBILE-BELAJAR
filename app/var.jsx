import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Alert } from "./AlertProvider";
import {
  cancelScheduleNotification,
  scheduleScheduleNotification,
  syncAllScheduleNotifications,
} from "./notification";
import { COLORS, styles } from "./styles";
import SwipeNavigation from "./swipenavigation";

const SESSION_KEY = "@study_time_session";

// Warna default untuk user Free (selalu hitam)
const FREE_USERNAME_COLOR = "#000000";

// Warna default untuk user Premium (jika belum memilih)
const PREMIUM_DEFAULT_COLOR = "#FFFFFF";

// Pilihan warna username untuk user Premium
const USERNAME_COLORS = [
  "#FFFFFF",
  "#3A6478",
  "#B8932E",
  "#4E8F6B",
  "#A04444",
  "#5B8FA8",
  "#7B68A6",
  "#C26D8A",
];

// ==========================================
// HELPER FUNCTIONS
// ==========================================
const formatTimer = (seconds) => {
  const safe = Math.max(0, Math.floor(seconds));
  const m = String(Math.floor(safe / 60)).padStart(2, "0");
  const s = String(safe % 60).padStart(2, "0");
  return `${m}:${s}`;
};

const formatDurasi = (menit) => {
  const total = Math.max(0, Math.floor(Number(menit) || 0));
  const j = Math.floor(total / 60);
  const m = total % 60;
  if (j === 0) return `${m} menit`;
  if (m === 0) return `${j} jam`;
  return `${j} jam ${m} menit`;
};

const toDateString = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const buildDateTime = (dateStr, timeStr) => {
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
};

const getTodayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const formatTanggalID = (dateObj) => {
  try {
    return dateObj.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "-";
  }
};

const formatTanggalShort = (dateStr) => {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

const diffDaysCalendar = (targetDate, nowDate) => {
  const a = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
  ).getTime();
  const b = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate(),
  ).getTime();
  return Math.round((a - b) / (24 * 60 * 60 * 1000));
};

const formatKapanMulai = (targetDateTime, now) => {
  if (!targetDateTime) return null;
  const diffDays = diffDaysCalendar(targetDateTime, now);
  if (targetDateTime.getTime() <= now.getTime()) return null;

  if (diffDays === 0) return "Dimulai hari ini";
  if (diffDays === 1) return "Dimulai besok";
  if (diffDays < 7) return `Dimulai ${diffDays} hari lagi`;

  const weeks = Math.floor(diffDays / 7);
  const remDays = diffDays % 7;

  if (diffDays < 30) {
    if (remDays === 0) return `Dimulai ${weeks} minggu lagi`;
    return `Dimulai ${weeks} minggu ${remDays} hari lagi`;
  }

  const months = Math.floor(diffDays / 30);
  const afterMonths = diffDays - months * 30;

  if (afterMonths === 0) return `Dimulai ${months} bulan lagi`;

  if (afterMonths >= 7) {
    const w = Math.floor(afterMonths / 7);
    const d = afterMonths % 7;
    if (d === 0) return `Dimulai ${months} bulan ${w} minggu lagi`;
    return `Dimulai ${months} bulan ${w} minggu ${d} hari lagi`;
  }

  return `Dimulai ${months} bulan ${afterMonths} hari lagi`;
};

const formatCountdown = (targetDateTime, now) => {
  if (!targetDateTime) return null;
  const diffMs = targetDateTime.getTime() - now.getTime();
  if (diffMs <= 0) return null;

  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (days > 0) {
    if (hours === 0) return `${days} hari lagi`;
    return `${days} hari ${hours} jam lagi`;
  }
  if (hours > 0) {
    if (minutes === 0) return `${hours} jam lagi`;
    return `${hours} jam ${minutes} menit lagi`;
  }
  if (minutes > 0) {
    if (seconds === 0) return `${minutes} menit lagi`;
    return `${minutes} menit ${seconds} detik lagi`;
  }
  return `${seconds} detik lagi`;
};

const computeRemaining = (startedAtISO, durationMinutes) => {
  if (!startedAtISO) return durationMinutes * 60;
  const start = new Date(startedAtISO).getTime();
  const end = start + durationMinutes * 60 * 1000;
  return Math.max(0, Math.floor((end - Date.now()) / 1000));
};

const pad2 = (n) => String(n).padStart(2, "0");

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
};

// ==========================================
// SORTING JADWAL
// ==========================================
const sortSchedules = (list) => {
  const now = Date.now();
  const arr = [...list];

  arr.sort((a, b) => {
    const aDone = Number(a.is_completed) === 1 || a.status === "finished";
    const bDone = Number(b.is_completed) === 1 || b.status === "finished";

    if (aDone !== bDone) return aDone ? 1 : -1;

    const aTarget = buildDateTime(a.study_date, a.start_time);
    const bTarget = buildDateTime(b.study_date, b.start_time);

    const aTime = aTarget ? aTarget.getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = bTarget ? bTarget.getTime() : Number.MAX_SAFE_INTEGER;

    if (!aDone && !bDone) {
      const aFuture = aTime >= now;
      const bFuture = bTime >= now;

      if (aFuture !== bFuture) return aFuture ? -1 : 1;

      if (aFuture) {
        return aTime - bTime;
      }
      return bTime - aTime;
    }

    const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;

    if (aCreated !== bCreated) return bCreated - aCreated;

    return bTime - aTime;
  });

  return arr;
};

// ==========================================
// DATE PICKER MODAL
// ==========================================
const DatePickerModal = memo(function DatePickerModal({
  visible,
  initialDate,
  minimumDate,
  onConfirm,
  onCancel,
}) {
  const [tempDate, setTempDate] = useState(initialDate);

  useEffect(() => {
    if (visible) {
      setTempDate(initialDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (Platform.OS === "ios") {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={onCancel}>
                <Text style={styles.modalCancel}>Batal</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Pilih Tanggal</Text>
              <TouchableOpacity onPress={() => onConfirm(tempDate)}>
                <Text style={styles.modalDone}>Selesai</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={tempDate}
              mode="date"
              display="spinner"
              minimumDate={minimumDate}
              onChange={(event, date) => {
                if (date) setTempDate(date);
              }}
            />
          </View>
        </View>
      </Modal>
    );
  }

  if (!visible) return null;

  return (
    <DateTimePicker
      value={tempDate}
      mode="date"
      display="calendar"
      minimumDate={minimumDate}
      onChange={(event, date) => {
        if (event.type === "set" && date) {
          onConfirm(date);
        } else {
          onCancel();
        }
      }}
    />
  );
});

// ==========================================
// KOMPONEN UTAMA — BERANDA
// ==========================================
export default function Home() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams();

  const userId = Number(params.userId || 1);
  const username = String(params.username || "admin");

  const [schedules, setSchedules] = useState([]);

  const [subject, setSubject] = useState("");
  const [inputHour, setInputHour] = useState("19");
  const [inputMinute, setInputMinute] = useState("00");
  const [inputDuration, setInputDuration] = useState("60");

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const pickerOpenRef = useRef(false);
  const minimumDate = useMemo(() => getTodayStart(), []);

  const [isPremium, setIsPremium] = useState(false);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);

  // Title aktif
  const [activeTitles, setActiveTitles] = useState([]);

  // Warna username — default hitam untuk Free
  const [usernameColor, setUsernameColor] = useState(FREE_USERNAME_COLOR);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const [loading, setLoading] = useState(false);

  const [, setTick] = useState(0);
  const tickRef = useRef(null);
  const statusCheckRef = useRef(null);
  const pickerOpenFlagRef = useRef(false);

  const notifiedIdsRef = useRef(new Set());

  useEffect(() => {
    pickerOpenFlagRef.current = showDatePicker || showColorPicker;
  }, [showDatePicker, showColorPicker]);

  const loadUser = async () => {
    try {
      const user = await db.getFirstAsync(
        `SELECT id, username, is_premium, username_color FROM users WHERE id = ? LIMIT 1`,
        userId,
      );
      if (user) {
        const premium = Number(user.is_premium) === 1;
        setIsPremium(premium);

        // User Free: SELALU hitam, abaikan warna custom dari database
        if (!premium) {
          setUsernameColor(FREE_USERNAME_COLOR);
        } else {
          // User Premium: pakai warna custom jika ada,否则 default putih
          if (user.username_color) {
            setUsernameColor(String(user.username_color));
          } else {
            setUsernameColor(PREMIUM_DEFAULT_COLOR);
          }
        }
      }
    } catch (error) {
      console.error("LOAD USER ERROR:", error);
    }
  };

  const loadActiveTitles = useCallback(async () => {
    try {
      const rows = await db.getAllAsync(
        `SELECT a.title
         FROM user_titles ut
         JOIN achievements a ON a.id = ut.achievement_id
         WHERE ut.user_id = ? AND ut.is_active = 1`,
        userId,
      );
      setActiveTitles(rows.map((r) => String(r.title)));
    } catch (error) {
      console.error("LOAD ACTIVE TITLES ERROR:", error);
    }
  }, [db, userId]);

  const loadSchedules = async () => {
    try {
      const result = await db.getAllAsync(
        `SELECT
          id, user_id, subject, study_date, start_time, duration,
          reminder, is_completed, completed_at, created_at,
          status, started_at, finished_at, started_manually
        FROM study_schedule
        WHERE user_id = ?`,
        userId,
      );

      const sorted = sortSchedules(result);
      setSchedules(sorted);

      await autoUpdateStatuses(sorted);
    } catch (error) {
      console.error("LOAD SCHEDULE ERROR:", error);
    }
  };

  const autoUpdateStatuses = async (list) => {
    let changed = false;
    const now = new Date();

    for (const item of list) {
      const status = item.status || "waiting";
      const isCompleted = Number(item.is_completed) === 1;

      if (isCompleted && status !== "finished") {
        await db.runAsync(
          `UPDATE study_schedule SET status = 'finished' WHERE id = ? AND user_id = ?`,
          item.id,
          userId,
        );
        changed = true;
        continue;
      }

      if (status === "waiting" && item.study_date && item.start_time) {
        const targetDT = buildDateTime(item.study_date, item.start_time);
        if (targetDT && now.getTime() >= targetDT.getTime()) {
          await db.runAsync(
            `UPDATE study_schedule
             SET status = 'studying',
                 started_at = ?,
                 started_manually = 0
             WHERE id = ? AND user_id = ?`,
            targetDT.toISOString(),
            item.id,
            userId,
          );

          if (!notifiedIdsRef.current.has(item.id)) {
            notifiedIdsRef.current.add(item.id);
            Alert.alert(
              "Waktunya Belajar!",
              `Jadwal "${item.subject}" dimulai sekarang.\nDurasi: ${formatDurasi(item.duration)}.`,
            );
          }
          changed = true;
        }
      } else if (status === "studying") {
        const remaining = computeRemaining(item.started_at, item.duration);
        if (remaining <= 0) {
          const finishedAt = new Date().toISOString();

          await db.runAsync(
            `UPDATE study_schedule
             SET status = 'finished',
                 is_completed = 1,
                 finished_at = ?,
                 completed_at = ?
             WHERE id = ? AND user_id = ?`,
            finishedAt,
            finishedAt,
            item.id,
            userId,
          );

          const today = finishedAt.split("T")[0];
          await db.runAsync(
            `INSERT INTO progress_log (user_id, log_date, total_minutes, sessions_completed)
             VALUES (?, ?, ?, 1)`,
            userId,
            today,
            Number(item.duration),
          );

          changed = true;

          Alert.alert(
            "Sesi Selesai",
            `Kamu menyelesaikan belajar ${item.subject} selama ${formatDurasi(item.duration)}.`,
          );
        }
      }
    }

    if (changed) {
      const refreshed = await db.getAllAsync(
        `SELECT
          id, user_id, subject, study_date, start_time, duration,
          reminder, is_completed, completed_at, created_at,
          status, started_at, finished_at, started_manually
        FROM study_schedule
        WHERE user_id = ?`,
        userId,
      );
      setSchedules(sortSchedules(refreshed));
      await loadProgress();
    }
  };

  const loadProgress = async () => {
    try {
      const result = await db.getFirstAsync(
        `SELECT
          COALESCE(SUM(total_minutes), 0) AS total_minutes,
          COALESCE(SUM(sessions_completed), 0) AS sessions_completed
        FROM progress_log
        WHERE user_id = ?`,
        userId,
      );
      if (result) {
        setTotalMinutes(Number(result.total_minutes || 0));
        setSessionsCompleted(Number(result.sessions_completed || 0));
      }
    } catch (error) {
      console.error("LOAD PROGRESS ERROR:", error);
    }
  };

  useEffect(() => {
    loadUser();
    loadSchedules();
    loadProgress();
    loadActiveTitles();

    (async () => {
      try {
        const all = await db.getAllAsync(
          `SELECT id, subject, study_date, start_time, duration, is_completed, status, reminder
           FROM study_schedule WHERE user_id = ?`,
          userId,
        );
        await syncAllScheduleNotifications(all);
      } catch (err) {
        console.error("SYNC NOTIF ERROR:", err);
      }
    })();

    tickRef.current = setInterval(() => {
      if (!pickerOpenFlagRef.current) {
        setTick((t) => t + 1);
      }
    }, 1000);

    statusCheckRef.current = setInterval(() => {
      if (!pickerOpenFlagRef.current) {
        loadSchedules();
      }
    }, 5000);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (statusCheckRef.current) clearInterval(statusCheckRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      loadActiveTitles();
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDatePicker = () => {
    if (pickerOpenRef.current) return;
    pickerOpenRef.current = true;
    pickerOpenFlagRef.current = true;
    setShowDatePicker(true);
  };

  const handleDateConfirm = (pickedDate) => {
    const today = getTodayStart();
    const picked = new Date(pickedDate);
    picked.setHours(0, 0, 0, 0);

    if (picked.getTime() >= today.getTime()) {
      setSelectedDate(new Date(pickedDate));
    } else {
      Alert.alert(
        "Tanggal Tidak Valid",
        "Tidak bisa memilih tanggal sebelum hari ini.",
      );
    }

    setShowDatePicker(false);
    pickerOpenRef.current = false;
    pickerOpenFlagRef.current = false;
  };

  const handleDateCancel = () => {
    setShowDatePicker(false);
    pickerOpenRef.current = false;
    pickerOpenFlagRef.current = false;
  };

  const handleHourChange = (text) => {
    const clean = text.replace(/[^0-9]/g, "");
    if (clean === "") return setInputHour("");
    let num = Number(clean);
    if (num > 23) num = 23;
    setInputHour(String(num));
  };

  const handleHourBlur = () => {
    if (inputHour === "") setInputHour("00");
    else setInputHour(pad2(Number(inputHour)));
  };

  const handleMinuteChange = (text) => {
    const clean = text.replace(/[^0-9]/g, "");
    if (clean === "") return setInputMinute("");
    let num = Number(clean);
    if (num > 59) num = 59;
    setInputMinute(String(num));
  };

  const handleMinuteBlur = () => {
    if (inputMinute === "") setInputMinute("00");
    else setInputMinute(pad2(Number(inputMinute)));
  };

  const handleDurationChange = (text) => {
    const clean = text.replace(/[^0-9]/g, "");
    setInputDuration(clean);
  };

  const setDurationPreset = (mins) => {
    setInputDuration(String(mins));
  };

  const addSchedule = async () => {
    if (!subject.trim()) {
      Alert.alert("Data Belum Lengkap", "Mata pelajaran harus diisi.");
      return;
    }

    if (!selectedDate) {
      Alert.alert("Tanggal Belum Dipilih", "Silakan pilih tanggal belajar.");
      return;
    }

    const todayStart = getTodayStart();
    const selectedStart = new Date(selectedDate);
    selectedStart.setHours(0, 0, 0, 0);

    if (selectedStart.getTime() < todayStart.getTime()) {
      Alert.alert(
        "Tanggal Tidak Valid",
        "Tidak bisa menyimpan jadwal dengan tanggal sebelum hari ini.",
      );
      return;
    }

    const hourNum = Number(inputHour || 0);
    const minuteNum = Number(inputMinute || 0);

    if (isNaN(hourNum) || hourNum < 0 || hourNum > 23) {
      Alert.alert("Jam Tidak Valid", "Jam harus antara 0 - 23.");
      return;
    }
    if (isNaN(minuteNum) || minuteNum < 0 || minuteNum > 59) {
      Alert.alert("Menit Tidak Valid", "Menit harus antara 0 - 59.");
      return;
    }

    const durationNumber = Number(inputDuration);
    if (Number.isNaN(durationNumber) || durationNumber <= 0) {
      Alert.alert("Durasi Tidak Valid", "Durasi harus > 0.");
      return;
    }

    if (durationNumber > 1440) {
      Alert.alert("Durasi Terlalu Lama", "Maksimal 1440 menit (24 jam).");
      return;
    }

    try {
      setLoading(true);

      const timeStr = `${pad2(hourNum)}:${pad2(minuteNum)}`;
      const dateStr = toDateString(selectedDate);

      await db.runAsync(
        `INSERT INTO study_schedule
         (user_id, subject, study_date, start_time, duration, reminder, is_completed)
         VALUES (?, ?, ?, ?, ?, 1, 0)`,
        userId,
        subject.trim(),
        dateStr,
        timeStr,
        durationNumber,
      );

      const capturedSubject = subject.trim();
      const capturedDate = new Date(selectedDate);
      const capturedTarget = buildDateTime(dateStr, timeStr);

      setSubject("");
      setInputHour("19");
      setInputMinute("00");
      setInputDuration("60");
      setSelectedDate(new Date());

      await loadSchedules();

      try {
        const newSchedule = await db.getFirstAsync(
          `SELECT id, subject, study_date, start_time, duration, is_completed, status
           FROM study_schedule WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
          userId,
        );
        if (newSchedule) {
          await scheduleScheduleNotification(newSchedule);
        }
      } catch (err) {
        console.error("SCHEDULE NOTIF ERROR:", err);
      }

      const kapan = capturedTarget
        ? formatKapanMulai(capturedTarget, new Date())
        : null;

      Alert.alert(
        "Berhasil",
        `Jadwal "${capturedSubject}" berhasil ditambahkan.\n\nTanggal: ${formatTanggalID(
          capturedDate,
        )}\nJam: ${timeStr}\nDurasi: ${formatDurasi(
          durationNumber,
        )}${kapan ? `\n\n${kapan}` : ""}`,
      );
    } catch (error) {
      console.error("ADD SCHEDULE ERROR:", error);
      Alert.alert("Error", "Gagal menambahkan jadwal.");
    } finally {
      setLoading(false);
    }
  };

  const toggleReminder = async (id, currentValue) => {
    try {
      await db.runAsync(
        `UPDATE study_schedule SET reminder = ? WHERE id = ? AND user_id = ?`,
        currentValue ? 0 : 1,
        id,
        userId,
      );
      await loadSchedules();

      try {
        const updated = await db.getFirstAsync(
          `SELECT id, subject, study_date, start_time, duration, is_completed, status, reminder
           FROM study_schedule WHERE id = ? AND user_id = ? LIMIT 1`,
          id,
          userId,
        );
        if (updated) {
          if (Number(updated.reminder) === 1) {
            await scheduleScheduleNotification(updated);
          } else {
            await cancelScheduleNotification(id);
          }
        }
      } catch (err) {
        console.error("TOGGLE REMINDER NOTIF ERROR:", err);
      }
    } catch (error) {
      console.error("TOGGLE REMINDER ERROR:", error);
    }
  };

  const completeSchedule = async (item) => {
    if (item.is_completed) return;

    try {
      const completedAt = new Date().toISOString();

      await db.runAsync(
        `UPDATE study_schedule
         SET is_completed = 1,
             completed_at = ?,
             finished_at = ?,
             status = 'finished'
         WHERE id = ? AND user_id = ?`,
        completedAt,
        completedAt,
        item.id,
        userId,
      );

      const today = new Date().toISOString().split("T")[0];
      await db.runAsync(
        `INSERT INTO progress_log
         (user_id, log_date, total_minutes, sessions_completed)
         VALUES (?, ?, ?, 1)`,
        userId,
        today,
        Number(item.duration),
      );

      await loadSchedules();
      await loadProgress();

      try {
        await cancelScheduleNotification(item.id);
      } catch (err) {
        console.error("CANCEL NOTIF ERROR:", err);
      }

      Alert.alert(
        "Mantap!",
        `Kamu menyelesaikan belajar ${item.subject} selama ${formatDurasi(
          item.duration,
        )}.`,
      );
    } catch (error) {
      console.error("COMPLETE SCHEDULE ERROR:", error);
      Alert.alert("Error", "Gagal menyelesaikan jadwal.");
    }
  };

  const deleteSchedule = (id) => {
    Alert.alert("Hapus Jadwal", "Yakin ingin menghapus jadwal ini?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: async () => {
          try {
            await db.runAsync(
              `DELETE FROM study_schedule WHERE id = ? AND user_id = ?`,
              id,
              userId,
            );
            notifiedIdsRef.current.delete(id);

            try {
              await cancelScheduleNotification(id);
            } catch (err) {
              console.error("CANCEL NOTIF ERROR:", err);
            }

            await loadSchedules();
          } catch (error) {
            console.error("DELETE SCHEDULE ERROR:", error);
          }
        },
      },
    ]);
  };

  const logout = () => {
    Alert.alert("Keluar Akun", "Yakin ingin keluar dari akun ini?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Keluar",
        style: "destructive",
        onPress: async () => {
          try {
            await AsyncStorage.removeItem(SESSION_KEY);
          } catch (error) {
            console.error("LOGOUT ERROR:", error);
          }
          router.replace("/");
        },
      },
    ]);
  };

  // ==========================================
  // HANDLER WARNA USERNAME
  // ==========================================
  const openColorPicker = () => {
    if (!isPremium) {
      Alert.alert(
        "Fitur Premium",
        "Custom Warna Username adalah fitur Premium. Upgrade untuk mengubah warna username.",
      );
      return;
    }
    setShowColorPicker(true);
  };

  const handlePickColor = async (color) => {
    try {
      await db.runAsync(
        `UPDATE users SET username_color = ? WHERE id = ?`,
        color,
        userId,
      );
      setUsernameColor(color);
      setShowColorPicker(false);
    } catch (error) {
      console.error("SAVE USERNAME COLOR ERROR:", error);
      Alert.alert("Error", "Gagal menyimpan warna username.");
    }
  };

  const completedCount = schedules.filter(
    (item) => Number(item.is_completed) === 1,
  ).length;

  const totalSchedule = schedules.length;

  const progressPercent =
    totalSchedule === 0
      ? 0
      : Math.round((completedCount / totalSchedule) * 100);

  const renderStatusBadge = (item) => {
    const status = item.status || "waiting";

    if (status === "studying") {
      return (
        <View style={[styles.statusBadge, styles.statusStudying]}>
          <Ionicons name="play-circle" size={11} color={COLORS.primaryDarker} />
          <Text style={styles.statusStudyingText}>Belajar</Text>
        </View>
      );
    }
    if (status === "finished") {
      return (
        <View style={[styles.statusBadge, styles.statusFinished]}>
          <Ionicons
            name="checkmark-circle"
            size={11}
            color={COLORS.successDark}
          />
          <Text style={styles.statusFinishedText}>Selesai</Text>
        </View>
      );
    }
    return (
      <View style={[styles.statusBadge, styles.statusWaiting]}>
        <Ionicons name="time-outline" size={11} color={COLORS.textMid} />
        <Text style={styles.statusWaitingText}>Menunggu</Text>
      </View>
    );
  };

  const renderTimer = (item) => {
    const remaining = computeRemaining(item.started_at, item.duration);
    return (
      <View style={styles.timerBox}>
        <View style={styles.timerOrnament} />
        <Text style={styles.timerLabel}>SISA WAKTU</Text>
        <Text style={styles.timerValue}>{formatTimer(remaining)}</Text>
      </View>
    );
  };

  const renderCountdown = (item) => {
    const now = new Date();
    const targetDT = buildDateTime(item.study_date, item.start_time);

    if (!targetDT) {
      return (
        <View style={styles.countdownInner}>
          <Ionicons name="hourglass-outline" size={12} color="#B8932E" />
          <Text style={styles.countdownText}>Menunggu jadwal...</Text>
        </View>
      );
    }

    const diffMs = targetDT.getTime() - now.getTime();

    if (diffMs <= 0) {
      return (
        <View style={styles.countdownInner}>
          <Ionicons name="hourglass-outline" size={12} color="#B8932E" />
          <Text style={styles.countdownText}>Memulai sebentar lagi...</Text>
        </View>
      );
    }

    const kapan = formatKapanMulai(targetDT, now);
    const countdown = formatCountdown(targetDT, now);

    return (
      <View style={styles.countdownBlock}>
        {kapan && (
          <View style={styles.countdownInner}>
            <Ionicons name="calendar-outline" size={12} color="#B8932E" />
            <Text style={styles.countdownText}>{kapan}</Text>
          </View>
        )}
        {countdown && (
          <View style={[styles.countdownInner, { marginTop: 4 }]}>
            <Ionicons name="hourglass-outline" size={12} color="#B8932E" />
            <Text style={[styles.countdownText, styles.countdownTextStrong]}>
              Dimulai dalam {countdown}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderSchedule = ({ item }) => {
    const status = item.status || "waiting";
    const isCompleted = Number(item.is_completed) === 1;
    const dateLabel = item.study_date
      ? formatTanggalShort(item.study_date)
      : null;

    return (
      <View
        style={[
          styles.scheduleCard,
          status === "finished" && styles.scheduleCompleted,
          status === "studying" && styles.scheduleStudying,
        ]}
      >
        <View
          style={[
            styles.scheduleCornerAccent,
            status === "studying" && styles.scheduleCornerAccentActive,
          ]}
        />

        <View style={styles.scheduleHeader}>
          <Text style={styles.subject} numberOfLines={2}>
            {item.subject}
          </Text>
          {renderStatusBadge(item)}
        </View>

        <View style={styles.infoGrid}>
          {dateLabel && (
            <View style={styles.infoItem}>
              <Ionicons
                name="calendar-outline"
                size={12}
                color={COLORS.primaryDarker}
              />
              <Text style={styles.infoText}>{dateLabel}</Text>
            </View>
          )}
          <View style={styles.infoItem}>
            <Ionicons
              name="time-outline"
              size={12}
              color={COLORS.primaryDarker}
            />
            <Text style={styles.infoText}>{item.start_time}</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons
              name="hourglass-outline"
              size={12}
              color={COLORS.primaryDarker}
            />
            <Text style={styles.infoText}>{formatDurasi(item.duration)}</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons
              name={item.reminder ? "notifications" : "notifications-off"}
              size={12}
              color={item.reminder ? COLORS.primaryDarker : COLORS.textMid}
            />
            <Text style={styles.infoText}>
              {item.reminder ? "Pengingat" : "Tanpa pengingat"}
            </Text>
          </View>
        </View>

        {status === "waiting" && (
          <View style={styles.countdownBox}>{renderCountdown(item)}</View>
        )}

        {status === "studying" && renderTimer(item)}

        <View style={styles.divider} />

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              styles.actionBtnReminder,
              isCompleted && styles.actionBtnDisabled,
            ]}
            onPress={() => toggleReminder(item.id, item.reminder)}
            disabled={isCompleted}
          >
            <Ionicons
              name={item.reminder ? "notifications-off" : "notifications"}
              size={13}
              color={COLORS.primaryDarker}
            />
            <Text style={[styles.actionBtnText, styles.actionBtnTextReminder]}>
              {item.reminder ? "Matikan" : "Ingatkan"}
            </Text>
          </TouchableOpacity>

          {!isCompleted ? (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnComplete]}
              onPress={() => completeSchedule(item)}
            >
              <Ionicons name="checkmark" size={13} color={COLORS.textInverse} />
              <Text
                style={[styles.actionBtnText, styles.actionBtnTextComplete]}
              >
                Selesai
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.actionBtn, styles.actionBtnDone]}>
              <Ionicons
                name="checkmark-done"
                size={13}
                color={COLORS.successDark}
              />
              <Text style={[styles.actionBtnText, styles.actionBtnTextDone]}>
                Tuntas
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDelete]}
            onPress={() => deleteSchedule(item.id)}
          >
            <Ionicons
              name="trash-outline"
              size={13}
              color={COLORS.dangerDark}
            />
            <Text style={[styles.actionBtnText, styles.actionBtnTextDelete]}>
              Hapus
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerWithLogo}>
        <View style={styles.headerLogoBox}>
          <MaterialCommunityIcons
            name="book-open-page-variant"
            size={22}
            color={COLORS.textInverse}
          />
        </View>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitleWithLogo}>Study Time</Text>
          <Text style={styles.headerSubtitleWithLogo}>Hai, {username}</Text>
        </View>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={logout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={14} color={COLORS.textDark} />
          <Text style={styles.logoutText}>Keluar</Text>
        </TouchableOpacity>
      </View>

      <SwipeNavigation
        currentPage="var"
        params={{ userId: String(userId), username }}
      >
        <View style={styles.tabContent}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.welcomeCard}>
              <View style={styles.welcomeCircle1} />
              <View style={styles.welcomeCircle2} />
              <View style={styles.welcomeAccentLine} />

              <View style={styles.welcomeContent}>
                <View style={styles.welcomeLeft}>
                  <Text style={styles.welcomeGreeting}>{getGreeting()},</Text>

                  <View style={styles.welcomeNameRow}>
                    <Text
                      style={[
                        styles.welcomeName,
                        { color: usernameColor },
                        styles.welcomeNameFlex,
                      ]}
                      numberOfLines={1}
                    >
                      {username}
                    </Text>

                    <TouchableOpacity
                      style={styles.welcomeColorBtn}
                      onPress={openColorPicker}
                      activeOpacity={0.85}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="color-palette-outline"
                        size={14}
                        color={COLORS.primaryDarker}
                      />
                    </TouchableOpacity>
                  </View>

                  {activeTitles.length > 0 && (
                    <View style={styles.welcomeTitlesRow}>
                      {activeTitles.map((t, i) => (
                        <View key={i} style={styles.welcomeTitleChip}>
                          <Text style={styles.welcomeTitleChipText}>{t}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.welcomeDivider} />
                  <View style={styles.welcomeSubtitleRow}>
                    <View style={styles.welcomeSubtitleIcon}>
                      <Ionicons
                        name="sparkles-outline"
                        size={12}
                        color={COLORS.primaryDarker}
                      />
                    </View>
                    <Text style={styles.welcomeSubtitle}>
                      Selamat datang kembali!
                    </Text>
                  </View>
                </View>

                <View style={styles.welcomeRight}>
                  {isPremium ? (
                    <View
                      style={[styles.premiumBadge, styles.premiumBadgeActive]}
                    >
                      <MaterialCommunityIcons
                        name="crown"
                        size={13}
                        color={COLORS.accentText}
                      />
                      <Text
                        style={[
                          styles.premiumBadgeText,
                          styles.premiumBadgeTextActive,
                        ]}
                      >
                        PREMIUM
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.freeBadge}>
                      <View style={styles.freeBadgeIconWrap}>
                        <MaterialCommunityIcons
                          name="book-education-outline"
                          size={13}
                          color="#000000"
                        />
                      </View>
                      <Text style={styles.freeBadgeText}>FREE</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <View style={styles.statCardOrnament} />
                <View style={styles.statIconWrap}>
                  <MaterialCommunityIcons
                    name="book-open-variant"
                    size={18}
                    color={COLORS.primaryDarker}
                  />
                </View>
                <Text style={styles.statNumber}>{totalSchedule}</Text>
                <Text style={styles.statLabel}>Jadwal</Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statCardOrnament} />
                <View style={styles.statIconWrap}>
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color={COLORS.primaryDarker}
                  />
                </View>
                <Text style={styles.statNumber}>{totalMinutes}</Text>
                <Text style={styles.statLabel}>Menit</Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statCardOrnament} />
                <View style={styles.statIconWrap}>
                  <Ionicons
                    name="checkmark-done-circle-outline"
                    size={18}
                    color={COLORS.primaryDarker}
                  />
                </View>
                <Text style={styles.statNumber}>{sessionsCompleted}</Text>
                <Text style={styles.statLabel}>Sesi</Text>
              </View>
            </View>

            <View style={styles.progressCard}>
              <View style={styles.progressOrnamentTopRight} />
              <View style={styles.progressOrnamentBottomLeft} />

              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={styles.sectionIconWrap}>
                    <Ionicons
                      name="trending-up"
                      size={13}
                      color={COLORS.textInverse}
                    />
                  </View>
                  <Text style={styles.sectionTitle}>Progress Belajar</Text>
                </View>
                <Text style={styles.progressPercent}>{progressPercent}%</Text>
              </View>

              <View style={styles.progressBackground}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${progressPercent}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressDescription}>
                {completedCount} dari {totalSchedule} jadwal telah selesai
              </Text>
            </View>

            <View style={styles.formCard}>
              <View style={styles.formHeader}>
                <View style={styles.formIconWrap}>
                  <Ionicons name="add" size={16} color={COLORS.textInverse} />
                </View>
                <View style={styles.formHeaderText}>
                  <Text style={styles.formTitle}>Tambah Jadwal Belajar</Text>
                  <Text style={styles.formSubtitle}>
                    Atur jadwal belajarmu sesuai keinginan
                  </Text>
                </View>
              </View>

              <Text style={styles.label}>Mata Pelajaran</Text>
              <TextInput
                style={styles.input}
                placeholder="Contoh: Belajar Matematika"
                placeholderTextColor={COLORS.textLight}
                value={subject}
                onChangeText={setSubject}
              />

              <Text style={styles.label}>Tanggal Belajar</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={openDatePicker}
                activeOpacity={0.7}
              >
                <View style={styles.dateIconWrap}>
                  <Ionicons
                    name="calendar-outline"
                    size={16}
                    color={COLORS.textInverse}
                  />
                </View>
                <Text style={styles.dateButtonText}>
                  {formatTanggalID(selectedDate)}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={16}
                  color={COLORS.textMid}
                />
              </TouchableOpacity>
              <Text style={styles.hint}>
                Hanya bisa memilih hari ini atau setelahnya
              </Text>

              <Text style={styles.label}>Jam Mulai</Text>
              <View style={styles.timeRow}>
                <View style={styles.timeInputWrap}>
                  <TextInput
                    style={styles.timeInput}
                    value={inputHour}
                    onChangeText={handleHourChange}
                    onBlur={handleHourBlur}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="19"
                    placeholderTextColor={COLORS.textLight}
                    selectTextOnFocus
                  />
                  <Text style={styles.timeUnit}>Jam</Text>
                </View>

                <Text style={styles.timeSeparator}>:</Text>

                <View style={styles.timeInputWrap}>
                  <TextInput
                    style={styles.timeInput}
                    value={inputMinute}
                    onChangeText={handleMinuteChange}
                    onBlur={handleMinuteBlur}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="00"
                    placeholderTextColor={COLORS.textLight}
                    selectTextOnFocus
                  />
                  <Text style={styles.timeUnit}>Menit</Text>
                </View>
              </View>
              <Text style={styles.hint}>
                Jam: 0-23 · Menit: 0-59 · Contoh: 19 : 30
              </Text>

              <Text style={styles.label}>Durasi Belajar</Text>
              <View style={styles.durationWrap}>
                <TextInput
                  style={styles.durationInput}
                  value={inputDuration}
                  onChangeText={handleDurationChange}
                  keyboardType="number-pad"
                  maxLength={4}
                  placeholder="60"
                  placeholderTextColor={COLORS.textLight}
                  selectTextOnFocus
                />
                <Text style={styles.durationUnit}>menit</Text>
              </View>

              {Number(inputDuration) > 0 && (
                <View style={styles.durationPreview}>
                  <Ionicons
                    name="time-outline"
                    size={12}
                    color={COLORS.primaryDarker}
                  />
                  <Text style={styles.durationPreviewText}>
                    = {formatDurasi(inputDuration)}
                  </Text>
                </View>
              )}

              <View style={styles.presetRow}>
                {[15, 30, 45, 60, 90, 120].map((mins) => (
                  <TouchableOpacity
                    key={mins}
                    style={[
                      styles.presetChip,
                      Number(inputDuration) === mins && styles.presetChipActive,
                    ]}
                    onPress={() => setDurationPreset(mins)}
                  >
                    <Text
                      style={[
                        styles.presetChipText,
                        Number(inputDuration) === mins &&
                          styles.presetChipTextActive,
                      ]}
                    >
                      {mins < 60 ? `${mins}m` : `${mins / 60}j`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                onPress={addSchedule}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={16}
                  color={COLORS.textInverse}
                />
                <Text style={styles.primaryButtonText}>
                  {loading ? "Menyimpan..." : "Tambah Jadwal"}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.listHeader}>
              <View style={styles.listHeaderLeft}>
                <View style={styles.listHeaderIconWrap}>
                  <Ionicons name="list" size={13} color={COLORS.textInverse} />
                </View>
                <Text style={styles.listTitle}>Jadwal Belajar</Text>
              </View>
              <View style={styles.listHeaderLine} />
              <View style={styles.listCountBadge}>
                <Text style={styles.listCountText}>{totalSchedule}</Text>
              </View>
            </View>

            {schedules.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyOrnament1} />
                <View style={styles.emptyOrnament2} />

                <View style={styles.emptyIconWrap}>
                  <MaterialCommunityIcons
                    name="calendar-blank-outline"
                    size={32}
                    color={COLORS.primaryDarker}
                  />
                </View>
                <Text style={styles.emptyTitle}>Belum ada jadwal</Text>
                <Text style={styles.emptyText}>
                  Tambahkan jadwal belajar pertamamu untuk memulai perjalanan
                  belajarmu.
                </Text>
              </View>
            ) : (
              schedules.map((item) => (
                <View key={item.id}>{renderSchedule({ item })}</View>
              ))
            )}
          </ScrollView>
        </View>
      </SwipeNavigation>

      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() =>
            router.replace({
              pathname: "/var",
              params: { userId: String(userId), username },
            })
          }
          activeOpacity={0.7}
        >
          <Ionicons name="home" size={21} color={COLORS.primaryDarker} />
          <Text style={[styles.navText, styles.navActive]}>Beranda</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() =>
            router.replace({
              pathname: "/progress",
              params: { userId: String(userId), username },
            })
          }
          activeOpacity={0.7}
        >
          <Ionicons
            name="stats-chart-outline"
            size={21}
            color={COLORS.textLight}
          />
          <Text style={styles.navText}>Progress</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() =>
            router.replace({
              pathname: "/premium",
              params: { userId: String(userId), username },
            })
          }
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="crown-outline"
            size={21}
            color={COLORS.textLight}
          />
          <Text style={styles.navText}>Premium</Text>
        </TouchableOpacity>
      </View>

      <DatePickerModal
        visible={showDatePicker}
        initialDate={selectedDate}
        minimumDate={minimumDate}
        onConfirm={handleDateConfirm}
        onCancel={handleDateCancel}
      />

      {/* COLOR PICKER MODAL */}
      <Modal
        visible={showColorPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowColorPicker(false)}
      >
        <TouchableOpacity
          style={styles.colorPickerBackdrop}
          activeOpacity={1}
          onPress={() => setShowColorPicker(false)}
        >
          <View style={styles.colorPickerCard}>
            <Text style={styles.colorPickerTitle}>Warna Username</Text>
            <Text style={styles.colorPickerSubtitle}>
              Pilih warna untuk username kamu
            </Text>
            <View style={styles.colorPickerGrid}>
              {USERNAME_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorPickerSwatch,
                    { backgroundColor: c },
                    usernameColor === c && styles.colorPickerSwatchActive,
                  ]}
                  onPress={() => handlePickColor(c)}
                  activeOpacity={0.85}
                >
                  {usernameColor === c && (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={
                        c === "#FFFFFF" || c === "#F0DCA0"
                          ? COLORS.textDark
                          : COLORS.textInverse
                      }
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

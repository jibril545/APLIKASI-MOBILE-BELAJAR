import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

import { Alert } from "./AlertProvider";
import { COLORS, styles } from "./styles";
import SwipeNavigation from "./swipenavigation";

const formatDurasi = (menit) => {
  const total = Math.max(0, Math.floor(Number(menit) || 0));
  const j = Math.floor(total / 60);
  const m = total % 60;
  if (j === 0) return `${m} menit`;
  if (m === 0) return `${j} jam`;
  return `${j} jam ${m} menit`;
};

const formatJamShort = (menit) => {
  const total = Math.max(0, Number(menit) || 0);
  const j = total / 60;
  if (Number.isInteger(j)) return `${j} jam`;
  return `${j.toFixed(1)} jam`;
};

export default function Progress() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams();

  const userId = Number(params.userId || 1);
  const username = String(params.username || "admin");

  const [schedules, setSchedules] = useState([]);
  const [isPremium, setIsPremium] = useState(false);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);

  const [achievements, setAchievements] = useState([]);
  const [claimedMap, setClaimedMap] = useState({});
  const [ownedMap, setOwnedMap] = useState({});
  const [activeTitleMap, setActiveTitleMap] = useState({});

  const loadUser = async () => {
    try {
      const user = await db.getFirstAsync(
        `SELECT id, username, is_premium FROM users WHERE id = ? LIMIT 1`,
        userId,
      );
      if (user) setIsPremium(Number(user.is_premium) === 1);
    } catch (error) {
      console.error("LOAD USER ERROR:", error);
    }
  };

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
      setSchedules(result);
    } catch (error) {
      console.error("LOAD SCHEDULE ERROR:", error);
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

  const loadAchievements = useCallback(async () => {
    try {
      const list = await db.getAllAsync(
        `SELECT id, category, title, description, requirement_value
         FROM achievements
         ORDER BY category ASC, requirement_value ASC`,
      );
      setAchievements(list);

      const claimedRows = await db.getAllAsync(
        `SELECT achievement_id, is_claimed, claimed_at
         FROM user_achievements WHERE user_id = ?`,
        userId,
      );
      const cMap = {};
      claimedRows.forEach((r) => {
        if (Number(r.is_claimed) === 1) {
          cMap[r.achievement_id] = {
            claimed: true,
            claimed_at: r.claimed_at,
          };
        }
      });
      setClaimedMap(cMap);

      const titleRows = await db.getAllAsync(
        `SELECT achievement_id, is_active
         FROM user_titles WHERE user_id = ?`,
        userId,
      );
      const oMap = {};
      const aMap = {};
      titleRows.forEach((r) => {
        oMap[r.achievement_id] = true;
        if (Number(r.is_active) === 1) aMap[r.achievement_id] = true;
      });
      setOwnedMap(oMap);
      setActiveTitleMap(aMap);
    } catch (error) {
      console.error("LOAD ACHIEVEMENTS ERROR:", error);
    }
  }, [db, userId]);

  useEffect(() => {
    loadUser();
    loadSchedules();
    loadProgress();
    loadAchievements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completedCount = schedules.filter(
    (item) => Number(item.is_completed) === 1,
  ).length;

  const totalSchedule = schedules.length;

  const progressPercent =
    totalSchedule === 0
      ? 0
      : Math.round((completedCount / totalSchedule) * 100);

  // ==========================================
  // ACHIEVEMENT — helpers
  // ==========================================
  const getCurrentValueFor = (cat) => {
    if (cat === "study_time") return totalMinutes;
    if (cat === "completed_schedule") return completedCount;
    return 0;
  };

  const getStatusFor = (item) => {
    const current = getCurrentValueFor(item.category);
    const req = Number(item.requirement_value) || 0;
    const isClaimed = !!claimedMap[item.id]?.claimed;
    if (isClaimed) return "claimed";
    if (current >= req) return "ready";
    return "locked";
  };

  const handleClaim = async (item) => {
    if (!isPremium) {
      Alert.alert(
        "Fitur Premium",
        "Achievement adalah fitur Premium. Upgrade untuk membuka sistem Achievement.",
      );
      return;
    }

    const status = getStatusFor(item);
    if (status !== "ready") return;

    try {
      const claimedAt = new Date().toISOString();

      await db.runAsync(
        `INSERT INTO user_achievements (user_id, achievement_id, is_claimed, claimed_at)
         VALUES (?, ?, 1, ?)
         ON CONFLICT(user_id, achievement_id)
         DO UPDATE SET is_claimed = 1, claimed_at = excluded.claimed_at`,
        userId,
        item.id,
        claimedAt,
      );

      await db.runAsync(
        `INSERT OR IGNORE INTO user_titles (user_id, achievement_id, is_active, obtained_at)
         VALUES (?, ?, 0, ?)`,
        userId,
        item.id,
        claimedAt,
      );

      await loadAchievements();

      Alert.alert(
        "Title Diklaim",
        `Selamat! Kamu mendapatkan title "${item.title}".`,
      );
    } catch (error) {
      console.error("CLAIM ERROR:", error);
      Alert.alert("Error", "Gagal mengklaim Achievement.");
    }
  };

  const handleToggleInstall = async (item) => {
    if (!isPremium) {
      Alert.alert(
        "Fitur Premium",
        "Achievement adalah fitur Premium. Upgrade untuk membuka sistem Achievement.",
      );
      return;
    }

    const alreadyOwned = !!ownedMap[item.id];
    if (!alreadyOwned) {
      Alert.alert("Belum Diklaim", "Klaim Achievement terlebih dahulu.");
      return;
    }

    const isActive = !!activeTitleMap[item.id];

    try {
      if (isActive) {
        await db.runAsync(
          `UPDATE user_titles SET is_active = 0
           WHERE user_id = ? AND achievement_id = ?`,
          userId,
          item.id,
        );
        Alert.alert("Title Dilepas", `Title "${item.title}" telah dilepas.`);
      } else {
        await db.runAsync(
          `UPDATE user_titles SET is_active = 0
           WHERE user_id = ?
             AND is_active = 1
             AND achievement_id IN (
               SELECT id FROM achievements WHERE category = ?
             )`,
          userId,
          item.category,
        );

        await db.runAsync(
          `UPDATE user_titles SET is_active = 1
           WHERE user_id = ? AND achievement_id = ?`,
          userId,
          item.id,
        );

        Alert.alert("Title Dipasang", `Title "${item.title}" sekarang aktif.`);
      }

      await loadAchievements();
    } catch (error) {
      console.error("INSTALL TITLE ERROR:", error);
      Alert.alert("Error", "Gagal mengubah title.");
    }
  };

  const renderAchievementItem = (item) => {
    const current = getCurrentValueFor(item.category);
    const req = Number(item.requirement_value) || 1;
    const status = getStatusFor(item);
    const pct = Math.min(100, Math.round((current / req) * 100));
    const isActive = !!activeTitleMap[item.id];

    const isReady = status === "ready";
    const isClaimed = status === "claimed";

    return (
      <View
        key={item.id}
        style={[
          styles.achItem,
          isReady && styles.achItemReady,
          isClaimed && styles.achItemClaimed,
        ]}
      >
        <View style={styles.achItemHeader}>
          <View style={styles.achItemTitleWrap}>
            <Text style={styles.achItemTitle}>{item.title}</Text>
            {item.description ? (
              <Text style={styles.achItemDesc}>{item.description}</Text>
            ) : null}
          </View>

          <View
            style={[
              styles.achItemBadge,
              isClaimed
                ? styles.achItemBadgeClaimed
                : isReady
                  ? styles.achItemBadgeReady
                  : styles.achItemBadgeLocked,
            ]}
          >
            <Text
              style={[
                styles.achItemBadgeText,
                isClaimed
                  ? styles.achItemBadgeTextClaimed
                  : isReady
                    ? styles.achItemBadgeTextReady
                    : styles.achItemBadgeTextLocked,
              ]}
            >
              {isClaimed
                ? "SUDAH DIKLAIM"
                : isReady
                  ? "SIAP DIKLAIM"
                  : "TERKUNCI"}
            </Text>
          </View>
        </View>

        <View style={styles.achProgressRow}>
          <Text
            style={[
              styles.achProgressText,
              isClaimed
                ? styles.achProgressTextClaimed
                : isReady
                  ? styles.achProgressTextReady
                  : null,
            ]}
          >
            {item.category === "study_time"
              ? `${formatJamShort(current)} / ${formatJamShort(req)}`
              : `${current} / ${req} jadwal`}
          </Text>
          <Text
            style={[
              styles.achProgressText,
              isClaimed
                ? styles.achProgressTextClaimed
                : isReady
                  ? styles.achProgressTextReady
                  : null,
            ]}
          >
            {isClaimed ? "100%" : `${pct}%`}
          </Text>
        </View>

        <View style={styles.achProgressTrack}>
          <View
            style={[
              styles.achProgressFill,
              isClaimed
                ? styles.achProgressFillClaimed
                : isReady
                  ? styles.achProgressFillReady
                  : null,
              { width: `${pct}%` },
            ]}
          />
        </View>

        {isReady && (
          <View style={styles.achItemActions}>
            <TouchableOpacity
              style={styles.achClaimBtn}
              onPress={() => handleClaim(item)}
              activeOpacity={0.85}
            >
              <Ionicons
                name="gift-outline"
                size={15}
                color={COLORS.textInverse}
              />
              <Text style={styles.achClaimBtnText}>Klaim</Text>
            </TouchableOpacity>
          </View>
        )}

        {isClaimed && (
          <View style={styles.achItemActions}>
            <TouchableOpacity
              style={[
                styles.achInstallBtn,
                isActive && styles.achInstallBtnActive,
              ]}
              onPress={() => handleToggleInstall(item)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={isActive ? "checkmark-circle" : "ribbon-outline"}
                size={15}
                color={isActive ? COLORS.primaryDarker : COLORS.textDark}
              />
              <Text
                style={[
                  styles.achInstallBtnText,
                  isActive && styles.achInstallBtnTextActive,
                ]}
              >
                {isActive ? "Terpasang" : "Pasang"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const timeAchievements = achievements.filter(
    (a) => a.category === "study_time",
  );
  const scheduleAchievements = achievements.filter(
    (a) => a.category === "completed_schedule",
  );

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
          <Text style={styles.headerSubtitleWithLogo}>
            Progress · Hai, {username}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() =>
            router.replace({
              pathname: "/var",
              params: { userId: String(userId), username },
            })
          }
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={14} color={COLORS.textDark} />
          <Text style={styles.logoutText}>Kembali</Text>
        </TouchableOpacity>
      </View>

      <SwipeNavigation
        currentPage="progress"
        params={{ userId: String(userId), username }}
      >
        <View style={styles.tabContent}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <Text style={styles.pageTitle}>Progress</Text>
            <View style={styles.pageTitleAccent} />
            <Text style={styles.pageSubtitle}>
              Pantau perkembangan belajarmu.
            </Text>

            <View style={styles.bigProgressCard}>
              <View style={styles.bigProgressOrnament1} />
              <View style={styles.bigProgressOrnament2} />

              <Text style={styles.bigProgressNumber}>{progressPercent}%</Text>
              <Text style={styles.bigProgressLabel}>Penyelesaian Jadwal</Text>
              <View style={styles.progressBackgroundLarge}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${progressPercent}%` },
                  ]}
                />
              </View>
            </View>

            {/* ANALISIS BELAJAR */}
            {!isPremium ? (
              <View style={styles.analysisLockCard}>
                <View style={styles.analysisLockIconWrap}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={26}
                    color={COLORS.accentText}
                  />
                </View>
                <Text style={styles.analysisLockTitle}>Analisis Belajar</Text>
                <Text style={styles.analysisLockText}>
                  Upgrade ke Premium untuk melihat total menit belajar dan total
                  sesi belajar yang telah diselesaikan.
                </Text>
                <TouchableOpacity
                  style={styles.premiumButton}
                  onPress={() =>
                    router.replace({
                      pathname: "/premium",
                      params: { userId: String(userId), username },
                    })
                  }
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons
                    name="crown"
                    size={15}
                    color={COLORS.accentText}
                  />
                  <Text style={styles.premiumButtonText}>Buka Premium</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.statsLargeRow}>
                  <View style={styles.statsLargeCard}>
                    <View style={styles.statsLargeOrnament} />
                    <View style={styles.statIconWrapLarge}>
                      <Ionicons
                        name="time-outline"
                        size={22}
                        color={COLORS.primaryDarker}
                      />
                    </View>
                    <Text style={styles.largeNumber}>{totalMinutes}</Text>
                    <Text style={styles.largeLabel}>Total Menit</Text>
                  </View>

                  <View style={styles.statsLargeCard}>
                    <View style={styles.statsLargeOrnament} />
                    <View style={styles.statIconWrapLarge}>
                      <Ionicons
                        name="checkmark-done-circle-outline"
                        size={22}
                        color={COLORS.primaryDarker}
                      />
                    </View>
                    <Text style={styles.largeNumber}>{sessionsCompleted}</Text>
                    <Text style={styles.largeLabel}>Sesi Selesai</Text>
                  </View>
                </View>
              </>
            )}

            {/* ACHIEVEMENT */}
            <View style={styles.achSectionHeader}>
              <View style={styles.achSectionIconWrap}>
                <MaterialCommunityIcons
                  name="trophy-outline"
                  size={14}
                  color={COLORS.textInverse}
                />
              </View>
              <Text style={styles.achSectionTitle}>Achievement</Text>
              <View style={styles.achSectionLine} />
            </View>

            {!isPremium ? (
              <View style={styles.achLockCard}>
                <View style={styles.achLockIconWrap}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={28}
                    color={COLORS.accentText}
                  />
                </View>
                <Text style={styles.achLockTitle}>Achievement Premium</Text>
                <Text style={styles.achLockText}>
                  Buka Premium untuk mendapatkan title berdasarkan pencapaian
                  belajar kamu.
                </Text>
                <TouchableOpacity
                  style={styles.premiumButton}
                  onPress={() =>
                    router.replace({
                      pathname: "/premium",
                      params: { userId: String(userId), username },
                    })
                  }
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons
                    name="crown"
                    size={15}
                    color={COLORS.accentText}
                  />
                  <Text style={styles.premiumButtonText}>Buka Premium</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.achMainCard}>
                  <View style={styles.achCatHeader}>
                    <View style={styles.achCatHeaderLeft}>
                      <View style={styles.achCatIconWrap}>
                        <Ionicons
                          name="time-outline"
                          size={18}
                          color={COLORS.primaryDarker}
                        />
                      </View>
                      <View>
                        <Text style={styles.achCatTitle}>Waktu Belajar</Text>
                        <Text style={styles.achCatTotal}>
                          {formatJamShort(totalMinutes)} total
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.achDivider} />

                  {timeAchievements.map(renderAchievementItem)}
                </View>

                <View style={styles.achMainCard}>
                  <View style={styles.achCatHeader}>
                    <View style={styles.achCatHeaderLeft}>
                      <View style={styles.achCatIconWrap}>
                        <Ionicons
                          name="checkmark-done-outline"
                          size={18}
                          color={COLORS.primaryDarker}
                        />
                      </View>
                      <View>
                        <Text style={styles.achCatTitle}>Jadwal Selesai</Text>
                        <Text style={styles.achCatTotal}>
                          {completedCount} jadwal
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.achDivider} />

                  {scheduleAchievements.map(renderAchievementItem)}
                </View>
              </>
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
          <Ionicons name="home-outline" size={21} color={COLORS.textLight} />
          <Text style={styles.navText}>Beranda</Text>
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
          <Ionicons name="stats-chart" size={21} color={COLORS.primaryDarker} />
          <Text style={[styles.navText, styles.navActive]}>Progress</Text>
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
    </View>
  );
}

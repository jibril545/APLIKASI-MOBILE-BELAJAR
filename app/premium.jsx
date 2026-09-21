import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    ScrollView,
    Text,
    TouchableOpacity,
    View
} from "react-native";

import { Alert } from "./AlertProvider";
import { COLORS, styles } from "./styles";
import SwipeNavigation from "./swipenavigation";

// ==========================================
// VIDEO PLAYER (expo-video) — Lazy require
// supaya tidak crash kalau belum terinstall
// ==========================================
let VideoView = null;
let useVideoPlayer = null;
try {
  const mod = require("expo-video");
  VideoView = mod.VideoView;
  useVideoPlayer = mod.useVideoPlayer;
} catch {
  // expo-video belum terinstall
}

// ==========================================
// ASSET FILE LOKAL
// ==========================================
const SOAL_INGGRIS_SOURCE = require("../assets/soal-inggris.pdf");
const MATERI_INGGRIS_SOURCE = require("../assets/materi-inggris.mp4");

// ==========================================
// PRODUK IAP
// ==========================================
const PRODUCT_SOAL = {
  id: "soal",
  name: "Paket Soal Tambahan",
  description:
    "Paket soal bahasa Inggris dalam format PDF untuk latihan tambahan.",
  priceLabel: "Rp10.000",
};

const PRODUCT_VIDEO = {
  id: "video",
  name: "Video Penjelasan",
  description: "Video materi bahasa Inggris untuk membantu memahami pelajaran.",
  priceLabel: "Rp15.000",
};

// ==========================================
// HELPER: KEY ASYNCSTORAGE PER USER
// ==========================================
function storageKey(productId, userId) {
  return `premium_${productId}_purchased_${userId}`;
}

// ==========================================
// HELPER: RESOLVE ASSET → localUri yang valid
// ==========================================
async function resolveAssetToLocalUri(assetModule, fileName) {
  // Lazy require supaya tidak crash kalau belum terinstall
  let Asset = null;
  let FileSystem = null;

  try {
    Asset = require("expo-asset").Asset;
  } catch (e) {
    console.error("expo-asset tidak tersedia:", e);
  }
  try {
    FileSystem = require("expo-file-system");
  } catch (e) {
    console.error("expo-file-system tidak tersedia:", e);
  }

  if (!Asset) {
    throw new Error("expo-asset belum terinstall di project.");
  }

  // 1. Resolve asset dari module
  const asset = Asset.fromModule(assetModule);

  // 2. Download/copy asset agar punya localUri
  if (!asset.downloaded) {
    console.log("[IAP] Downloading asset:", fileName);
    await asset.downloadAsync();
  }

  console.log("[IAP] Asset info:", {
    name: fileName,
    uri: asset.uri,
    localUri: asset.localUri,
    downloaded: asset.downloaded,
  });

  // 3. Ambil URI terbaik
  let sourceUri = asset.localUri || asset.uri;

  if (!sourceUri) {
    throw new Error(`Asset "${fileName}" tidak memiliki URI.`);
  }

  // 4. Copy ke cacheDirectory supaya URI-nya file:// yang valid
  if (FileSystem && FileSystem.cacheDirectory) {
    try {
      const targetUri = `${FileSystem.cacheDirectory}${fileName}`;

      // Cek dulu apakah sudah ada
      const info = await FileSystem.getInfoAsync(targetUri);
      if (!info.exists) {
        console.log("[IAP] Copying asset ke cache:", targetUri);
        await FileSystem.copyAsync({
          from: sourceUri,
          to: targetUri,
        });
      }

      // Verifikasi file benar-benar ada
      const verify = await FileSystem.getInfoAsync(targetUri);
      if (verify.exists) {
        console.log("[IAP] File siap di cache:", targetUri);
        return targetUri;
      }
    } catch (copyErr) {
      console.error("[IAP] Copy ke cache gagal, pakai sourceUri:", copyErr);
    }
  }

  // Fallback: pakai sourceUri apa adanya
  return sourceUri;
}

// ==========================================
// HELPER: BUKA PDF
// ==========================================
async function openPdf(assetModule, fileName) {
  let Sharing = null;
  try {
    Sharing = require("expo-sharing");
  } catch (e) {
    console.error("expo-sharing tidak tersedia:", e);
  }

  try {
    const localUri = await resolveAssetToLocalUri(assetModule, fileName);

    console.log("[IAP] Buka PDF dari:", localUri);

    if (!Sharing) {
      Alert.alert(
        "Fitur Tidak Tersedia",
        "Package expo-sharing belum terinstall. Jalankan:\nnpx expo install expo-sharing",
      );
      return;
    }

    const available = await Sharing.isAvailableAsync();
    if (!available) {
      Alert.alert(
        "Tidak Ada Aplikasi Pendukung",
        "Perangkat tidak memiliki aplikasi PDF viewer. Silakan install PDF viewer terlebih dahulu.",
      );
      return;
    }

    await Sharing.shareAsync(localUri, {
      mimeType: "application/pdf",
      dialogTitle: "Buka Soal",
      UTI: "com.adobe.pdf",
    });
  } catch (error) {
    console.error("[IAP] OPEN PDF ERROR:", error);
    Alert.alert(
      "File Soal Tidak Ditemukan",
      `Gagal membuka "${fileName}".\n\nDetail: ${error?.message || "Unknown error"}`,
    );
  }
}

export default function Premium() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams();

  const userId = Number(params.userId || 1);
  const username = String(params.username || "admin");

  const [isPremium, setIsPremium] = useState(false);

  // ==========================================
  // STATE STATUS PEMBELIAN IAP (per user)
  // ==========================================
  const [soalPurchased, setSoalPurchased] = useState(false);
  const [videoPurchased, setVideoPurchased] = useState(false);
  const [iapLoading, setIapLoading] = useState(true);

  // ==========================================
  // STATE VIDEO PLAYER
  // ==========================================
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [videoUri, setVideoUri] = useState(null);
  const [videoLoading, setVideoLoading] = useState(false);

  // ==========================================
  // VIDEO PLAYER HOOK (expo-video)
  // ==========================================
  const player = useVideoPlayer ? useVideoPlayer(videoUri) : null;

  // Auto-play ketika URI berubah
  useEffect(() => {
    if (player && videoUri) {
      try {
        player.play();
      } catch (e) {
        console.error("[IAP] Auto-play error:", e);
      }
    }
  }, [player, videoUri]);

  // ==========================================
  // LOAD USER
  // ==========================================
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

  // ==========================================
  // LOAD STATUS PEMBELIAN IAP (PER USER)
  // ==========================================
  const loadIapStatus = useCallback(async () => {
    try {
      setIapLoading(true);
      const keySoal = storageKey(PRODUCT_SOAL.id, userId);
      const keyVideo = storageKey(PRODUCT_VIDEO.id, userId);

      const [soalRaw, videoRaw] = await Promise.all([
        AsyncStorage.getItem(keySoal),
        AsyncStorage.getItem(keyVideo),
      ]);

      setSoalPurchased(soalRaw === "1");
      setVideoPurchased(videoRaw === "1");
    } catch (error) {
      console.error("LOAD IAP STATUS ERROR:", error);
      setSoalPurchased(false);
      setVideoPurchased(false);
    } finally {
      setIapLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadUser();
    loadIapStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==========================================
  // BELI PREMIUM (existing — tidak diubah)
  // ==========================================
  const buyPremium = async () => {
    Alert.alert(
      "Study Time Premium",
      "Upgrade Premium untuk membuka sistem Achievement, Custom Warna Username, dan Analisis Belajar.",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Beli Premium",
          onPress: async () => {
            try {
              await db.runAsync(
                `INSERT INTO purchases (user_id, item_type, item_name, price) VALUES (?, ?, ?, ?)`,
                userId,
                "premium",
                "Study Time Premium",
                25000,
              );
              await db.runAsync(
                `UPDATE users SET is_premium = 1 WHERE id = ?`,
                userId,
              );
              setIsPremium(true);
              Alert.alert(
                "Premium Aktif",
                "Semua fitur Premium sekarang sudah terbuka.",
              );
            } catch (error) {
              console.error("BUY PREMIUM ERROR:", error);
              Alert.alert("Error", "Pembelian gagal.");
            }
          },
        },
      ],
    );
  };

  // ==========================================
  // PROSES BELI PRODUK IAP (generic)
  // ==========================================
  const processPurchase = async (product, setPurchased, isPurchased) => {
    if (isPurchased) {
      Alert.alert(
        "Sudah Dibeli",
        `${product.name} sudah kamu miliki. Tidak perlu membeli lagi.`,
      );
      return;
    }

    Alert.alert(
      product.name,
      `${product.description}\n\nHarga: ${product.priceLabel}\n\nPembelian ini hanya simulasi. Setelah dikonfirmasi, produk langsung terbuka.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Beli",
          onPress: async () => {
            try {
              const key = storageKey(product.id, userId);
              await AsyncStorage.setItem(key, "1");

              const verify = await AsyncStorage.getItem(key);
              if (verify !== "1") {
                throw new Error("Verifikasi penyimpanan gagal");
              }

              setPurchased(true);

              Alert.alert(
                "Pembelian Berhasil",
                `${product.name} sekarang sudah terbuka.`,
              );
            } catch (error) {
              console.error("PURCHASE ERROR:", error);
              Alert.alert(
                "Pembelian Gagal",
                "Gagal menyimpan status pembelian. Coba lagi atau restart aplikasi.",
              );
            }
          },
        },
      ],
    );
  };

  const buySoal = () =>
    processPurchase(PRODUCT_SOAL, setSoalPurchased, soalPurchased);

  const buyVideo = () =>
    processPurchase(PRODUCT_VIDEO, setVideoPurchased, videoPurchased);

  // ==========================================
  // BUKA FILE SOAL (PDF)
  // ==========================================
  const openSoal = async () => {
    await openPdf(SOAL_INGGRIS_SOURCE, "soal-inggris.pdf");
  };

  // ==========================================
  // BUKA FILE VIDEO (MP4) — putar di dalam app
  // ==========================================
  const openVideo = async () => {
    // Cek apakah expo-video terinstall
    if (!VideoView || !useVideoPlayer) {
      Alert.alert(
        "Fitur Video Belum Tersedia",
        "Untuk memutar video di dalam aplikasi, install package resmi Expo:\n\nnpx expo install expo-video",
      );
      return;
    }

    try {
      setVideoLoading(true);

      // Resolve asset dulu
      const localUri = await resolveAssetToLocalUri(
        MATERI_INGGRIS_SOURCE,
        "materi-inggris.mp4",
      );

      console.log("[IAP] Buka video dari:", localUri);

      setVideoUri(localUri);
      setVideoModalVisible(true);
    } catch (error) {
      console.error("[IAP] OPEN VIDEO ERROR:", error);
      Alert.alert(
        "File Materi Tidak Ditemukan",
        `Gagal membuka materi video.\n\nDetail: ${error?.message || "Unknown error"}`,
      );
    } finally {
      setVideoLoading(false);
    }
  };

  // ==========================================
  // TUTUP VIDEO MODAL
  // ==========================================
  const closeVideo = () => {
    try {
      if (player && typeof player.pause === "function") {
        player.pause();
      }
    } catch (e) {
      console.error("[IAP] Pause error:", e);
    }
    setVideoModalVisible(false);
    setVideoUri(null);
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
          <Text style={styles.headerSubtitleWithLogo}>
            Premium · Hai, {username}
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
        currentPage="premium"
        params={{ userId: String(userId), username }}
      >
        <View style={styles.tabContent}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            {/* PREMIUM HERO */}
            <View style={styles.premiumHero}>
              <View style={styles.premiumHeroCircle1} />
              <View style={styles.premiumHeroCircle2} />
              <View style={styles.premiumHeroCircle3} />

              <View style={styles.premiumCrownWrap}>
                <MaterialCommunityIcons
                  name="crown"
                  size={40}
                  color={COLORS.accent}
                />
              </View>
              <Text style={styles.premiumTitle}>Study Time Premium</Text>
              <Text style={styles.premiumSubtitle}>
                Buka sistem Achievement, Custom Warna Username, dan Analisis
                Belajar.
              </Text>
              {isPremium ? (
                <View style={styles.activePremium}>
                  <Ionicons
                    name="checkmark-circle"
                    size={15}
                    color={COLORS.textInverse}
                  />
                  <Text style={styles.activePremiumText}>PREMIUM AKTIF</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.premiumBuyButton}
                  onPress={buyPremium}
                  activeOpacity={0.85}
                >
                  <Text style={styles.premiumBuyText}>
                    Beli Premium — Rp25.000
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* SECTION HEADER — FITUR PREMIUM */}
            <View style={styles.premiumSectionHeader}>
              <View style={styles.premiumSectionIconWrap}>
                <MaterialCommunityIcons
                  name="crown"
                  size={16}
                  color={COLORS.accent}
                />
              </View>
              <Text style={styles.premiumSectionTitle}>Fitur Premium</Text>
              <View style={styles.premiumSectionLine} />
              <View style={styles.premiumSectionBadge}>
                <Text style={styles.premiumSectionBadgeText}>3 FITUR</Text>
              </View>
            </View>

            <View style={styles.featureCard}>
              <View style={styles.featureOrnament} />
              <View style={styles.featureIconBox}>
                <MaterialCommunityIcons
                  name="trophy-outline"
                  size={20}
                  color={COLORS.primaryDarker}
                />
              </View>
              <View style={styles.featureInfo}>
                <Text style={styles.featureTitle}>Premium Achievement</Text>
                <Text style={styles.featureDescription}>
                  Dapatkan Achievement berdasarkan lama belajar dan jadwal yang
                  kamu selesaikan.
                </Text>
              </View>
            </View>

            <View style={styles.featureCard}>
              <View style={styles.featureOrnament} />
              <View style={styles.featureIconBox}>
                <Ionicons
                  name="color-palette-outline"
                  size={20}
                  color={COLORS.primaryDarker}
                />
              </View>
              <View style={styles.featureInfo}>
                <Text style={styles.featureTitle}>Custom Warna Username</Text>
                <Text style={styles.featureDescription}>
                  Ubah warna username yang tampil di Beranda sesuai selera.
                </Text>
              </View>
            </View>

            <View style={styles.featureCard}>
              <View style={styles.featureOrnament} />
              <View style={styles.featureIconBox}>
                <Ionicons
                  name="bar-chart-outline"
                  size={20}
                  color={COLORS.primaryDarker}
                />
              </View>
              <View style={styles.featureInfo}>
                <Text style={styles.featureTitle}>Analisis Belajar</Text>
                <Text style={styles.featureDescription}>
                  Lihat total menit belajar dan total sesi belajar yang telah
                  diselesaikan.
                </Text>
              </View>
            </View>

            {/* SECTION HEADER — IN-APP PURCHASE */}
            <View style={styles.premiumSectionHeader}>
              <View style={styles.premiumSectionIconWrap}>
                <Feather name="shopping-bag" size={16} color={COLORS.accent} />
              </View>
              <Text style={styles.premiumSectionTitle}>In-App Purchase</Text>
              <View style={styles.premiumSectionLine} />
            </View>

            {/* PRODUK 1 — PAKET SOAL TAMBAHAN */}
            <View style={styles.productCard}>
              <View style={styles.productOrnament} />
              <View style={styles.productHeader}>
                <View style={styles.productIconBox}>
                  <Feather
                    name="file-text"
                    size={20}
                    color={COLORS.accentDark}
                  />
                </View>
                <View
                  style={[
                    styles.iapStatusBadge,
                    soalPurchased
                      ? styles.iapStatusBadgeUnlocked
                      : styles.iapStatusBadgeLocked,
                  ]}
                >
                  <Ionicons
                    name={soalPurchased ? "lock-open" : "lock-closed"}
                    size={11}
                    color={soalPurchased ? COLORS.successDark : COLORS.textMid}
                  />
                  <Text
                    style={[
                      styles.iapStatusBadgeText,
                      soalPurchased
                        ? styles.iapStatusBadgeTextUnlocked
                        : styles.iapStatusBadgeTextLocked,
                    ]}
                  >
                    {soalPurchased ? "SUDAH DIBELI" : "BELUM DIBELI"}
                  </Text>
                </View>
              </View>

              <Text style={styles.productTitle}>{PRODUCT_SOAL.name}</Text>
              <Text style={styles.productDescription}>
                {PRODUCT_SOAL.description}
              </Text>
              <Text style={styles.productPrice}>{PRODUCT_SOAL.priceLabel}</Text>

              {!soalPurchased ? (
                <TouchableOpacity
                  style={styles.productButton}
                  onPress={buySoal}
                  activeOpacity={0.85}
                  disabled={iapLoading}
                >
                  <Text style={styles.productButtonText}>Beli</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.productButton}
                  onPress={openSoal}
                  activeOpacity={0.85}
                >
                  <Text style={styles.productButtonText}>Buka Soal</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* PRODUK 2 — VIDEO PENJELASAN */}
            <View style={styles.productCard}>
              <View style={styles.productOrnament} />
              <View style={styles.productHeader}>
                <View style={styles.productIconBox}>
                  <Feather name="video" size={20} color={COLORS.accentDark} />
                </View>
                <View
                  style={[
                    styles.iapStatusBadge,
                    videoPurchased
                      ? styles.iapStatusBadgeUnlocked
                      : styles.iapStatusBadgeLocked,
                  ]}
                >
                  <Ionicons
                    name={videoPurchased ? "lock-open" : "lock-closed"}
                    size={11}
                    color={videoPurchased ? COLORS.successDark : COLORS.textMid}
                  />
                  <Text
                    style={[
                      styles.iapStatusBadgeText,
                      videoPurchased
                        ? styles.iapStatusBadgeTextUnlocked
                        : styles.iapStatusBadgeTextLocked,
                    ]}
                  >
                    {videoPurchased ? "SUDAH DIBELI" : "BELUM DIBELI"}
                  </Text>
                </View>
              </View>

              <Text style={styles.productTitle}>{PRODUCT_VIDEO.name}</Text>
              <Text style={styles.productDescription}>
                {PRODUCT_VIDEO.description}
              </Text>
              <Text style={styles.productPrice}>
                {PRODUCT_VIDEO.priceLabel}
              </Text>

              {!videoPurchased ? (
                <TouchableOpacity
                  style={styles.productButton}
                  onPress={buyVideo}
                  activeOpacity={0.85}
                  disabled={iapLoading}
                >
                  <Text style={styles.productButtonText}>Beli</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.productButton}
                  onPress={openVideo}
                  activeOpacity={0.85}
                  disabled={videoLoading}
                >
                  <Text style={styles.productButtonText}>
                    {videoLoading ? "Memuat..." : "Buka Materi"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
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
            name="crown"
            size={21}
            color={COLORS.primaryDarker}
          />
          <Text style={[styles.navText, styles.navActive]}>Premium</Text>
        </TouchableOpacity>
      </View>

      {/* ========================================== */}
      {/* VIDEO PLAYER MODAL */}
      {/* ========================================== */}
      <Modal
        visible={videoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeVideo}
      >
        <View style={styles.videoModalBackdrop}>
          <View style={styles.videoModalCard}>
            <View style={styles.videoModalHeader}>
              <Text style={styles.videoModalTitle}>{PRODUCT_VIDEO.name}</Text>
              <TouchableOpacity
                onPress={closeVideo}
                style={styles.videoModalCloseBtn}
                activeOpacity={0.85}
              >
                <Ionicons name="close" size={20} color={COLORS.textInverse} />
              </TouchableOpacity>
            </View>

            <View style={styles.videoModalPlayerWrap}>
              {VideoView && videoUri ? (
                <VideoView
                  player={player}
                  style={styles.videoModalPlayer}
                  contentFit="contain"
                  allowsFullscreen
                  allowsPictureInPicture
                  nativeControls
                />
              ) : (
                <View style={styles.videoModalLoading}>
                  <ActivityIndicator color={COLORS.textInverse} />
                  <Text style={styles.videoModalLoadingText}>
                    Memuat video...
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

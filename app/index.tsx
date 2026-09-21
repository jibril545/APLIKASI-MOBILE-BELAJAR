import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Alert } from "./AlertProvider";
import { COLORS, styles } from "./styles";

const SESSION_KEY = "@study_time_session";

// ==========================================
// LOADING SCREEN — Logo Study Time DIAM / STATIC
// ==========================================
function LoadingScreen() {
  const fadeIn = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Fade masuk ringan — logo tetap diam di tempat
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    // Dots bertiga bergantian (hanya indikator loading)
    const pulseDot = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 420,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.3,
            duration: 420,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay(600),
        ]),
      );

    const d1 = pulseDot(dot1, 0);
    const d2 = pulseDot(dot2, 200);
    const d3 = pulseDot(dot3, 400);
    d1.start();
    d2.start();
    d3.start();

    return () => {
      d1.stop();
      d2.stop();
      d3.stop();
    };
  }, [fadeIn, dot1, dot2, dot3]);

  return (
    <View style={styles.loadingScreen}>
      <Animated.View style={{ opacity: fadeIn, alignItems: "center" }}>
        {/* Logo Study Time — DIAM, tanpa animasi gerak */}
        <View style={styles.loadingLogoWrap}>
          <View style={styles.loadingLogoOuterRing} />
          <View style={styles.loadingLogoInnerRing} />
          <View style={styles.loadingLogoBoxMain}>
            <MaterialCommunityIcons
              name="book-open-page-variant"
              size={46}
              color={COLORS.primary}
            />
          </View>
        </View>

        <Text style={styles.loadingTitle}>Study Time</Text>
        <Text style={styles.loadingSubtitle}>Menyiapkan ruang belajarmu…</Text>

        <View style={styles.loadingDotsRow}>
          <Animated.View style={[styles.loadingDot, { opacity: dot1 }]} />
          <Animated.View style={[styles.loadingDot, { opacity: dot2 }]} />
          <Animated.View style={[styles.loadingDot, { opacity: dot3 }]} />
        </View>
      </Animated.View>
    </View>
  );
}

// ==========================================
// LOGIN / REGISTER SCREEN
// ==========================================
export default function Login() {
  const db = useSQLiteContext();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [mode, setMode] = useState<"login" | "register">("login");

  const [startupState, setStartupState] = useState<"checking" | "ready">(
    "checking",
  );

  const scrollViewRef = useRef<ScrollView>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const inputPositions = useRef<{ [key: string]: number }>({});
  const cancelledRef = useRef(false);

  // ==========================================
  // STARTUP: cek session + tahan loading minimal
  // ==========================================
  useEffect(() => {
    cancelledRef.current = false;

    const MIN_LOADING_MS = 1400;

    const timerPromise = new Promise<void>((resolve) => {
      setTimeout(() => resolve(), MIN_LOADING_MS);
    });

    const checkSession = async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);

        if (!raw) {
          await timerPromise;
          if (cancelledRef.current) return;
          setStartupState("ready");
          return;
        }

        let session: any = null;
        try {
          session = JSON.parse(raw);
        } catch {
          session = null;
        }

        if (!session?.userId || !session?.username) {
          await AsyncStorage.removeItem(SESSION_KEY);
          await timerPromise;
          if (cancelledRef.current) return;
          setStartupState("ready");
          return;
        }

        const user: any = await db.getFirstAsync(
          `SELECT id, username FROM users WHERE id = ? LIMIT 1`,
          Number(session.userId),
        );

        if (!user) {
          await AsyncStorage.removeItem(SESSION_KEY);
          await timerPromise;
          if (cancelledRef.current) return;
          setStartupState("ready");
          return;
        }

        await timerPromise;
        if (cancelledRef.current) return;

        router.replace({
          pathname: "/var",
          params: {
            userId: String(user.id),
            username: user.username,
          },
        });
      } catch (error) {
        console.error("CHECK SESSION ERROR:", error);
        await timerPromise;
        if (cancelledRef.current) return;
        setStartupState("ready");
      }
    };

    checkSession();

    return () => {
      cancelledRef.current = true;
    };
  }, [db]);

  const handleInputFocus = (key: string) => {
    const y = inputPositions.current[key];
    if (y !== undefined) {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, y - 120),
          animated: true,
        });
      }, 150);
    }
  };

  const handleInputLayout = (key: string, event: any) => {
    inputPositions.current[key] = event.nativeEvent.layout.y;
  };

  const resetForm = () => {
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const saveSession = async (userId: number, uname: string) => {
    try {
      await AsyncStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ userId, username: uname, savedAt: Date.now() }),
      );
    } catch (error) {
      console.error("SAVE SESSION ERROR:", error);
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert("Data Belum Lengkap", "Username dan password harus diisi.");
      return;
    }

    try {
      setLoading(true);

      const user: any = await db.getFirstAsync(
        `
        SELECT id, username, is_premium
        FROM users
        WHERE username = ?
        AND password = ?
        LIMIT 1
        `,
        username.trim(),
        password,
      );

      if (user) {
        await saveSession(Number(user.id), String(user.username));
        resetForm();
        router.replace({
          pathname: "/var",
          params: {
            userId: String(user.id),
            username: user.username,
          },
        });
      } else {
        Alert.alert("Login Gagal", "Username atau password salah.");
      }
    } catch (error) {
      console.error("LOGIN ERROR:", error);
      Alert.alert(
        "Database Error",
        "Database belum siap. Coba restart aplikasi.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    const trimmedUsername = username.trim();

    if (!trimmedUsername || !password.trim() || !confirmPassword.trim()) {
      Alert.alert(
        "Data Belum Lengkap",
        "Username, password, dan konfirmasi password harus diisi.",
      );
      return;
    }

    if (trimmedUsername.length < 3) {
      Alert.alert("Username Terlalu Pendek", "Username minimal 3 karakter.");
      return;
    }

    if (password.length < 5) {
      Alert.alert("Password Terlalu Pendek", "Password minimal 5 karakter.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(
        "Password Tidak Cocok",
        "Password dan konfirmasi password harus sama.",
      );
      return;
    }

    try {
      setLoading(true);

      const existingUser: any = await db.getFirstAsync(
        `SELECT id FROM users WHERE username = ? LIMIT 1`,
        trimmedUsername,
      );

      if (existingUser) {
        Alert.alert("Username Sudah Digunakan", "Silakan pilih username lain.");
        return;
      }

      await db.runAsync(
        `INSERT INTO users (username, password, is_premium) VALUES (?, ?, 0)`,
        trimmedUsername,
        password,
      );

      const newUser: any = await db.getFirstAsync(
        `SELECT id, username, is_premium FROM users WHERE username = ? LIMIT 1`,
        trimmedUsername,
      );

      resetForm();

      Alert.alert(
        "Registrasi Berhasil",
        `Akun "${trimmedUsername}" berhasil dibuat. Selamat datang!`,
        [
          {
            text: "Mulai Belajar",
            onPress: async () => {
              if (newUser) {
                await saveSession(Number(newUser.id), String(newUser.username));
                router.replace({
                  pathname: "/var",
                  params: {
                    userId: String(newUser.id),
                    username: newUser.username,
                  },
                });
              }
            },
          },
        ],
      );
    } catch (error) {
      console.error("REGISTER ERROR:", error);
      Alert.alert("Error", "Gagal mendaftarkan akun. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (mode === "login") handleLogin();
    else handleRegister();
  };

  const toggleMode = () => {
    setMode((prev) => (prev === "login" ? "register" : "login"));
    resetForm();
    setTimeout(
      () => scrollViewRef.current?.scrollTo({ y: 0, animated: true }),
      100,
    );
  };

  if (startupState === "checking") {
    return <LoadingScreen />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.centerContainer}>
          <View style={styles.decorCircle1} />
          <View style={styles.decorCircle2} />

          <View style={styles.card}>
            <View style={styles.logoWrap}>
              <View style={styles.logoBox}>
                <MaterialCommunityIcons
                  name="book-open-page-variant"
                  size={36}
                  color={COLORS.textInverse}
                />
              </View>
            </View>

            <Text style={styles.title}>Study Time</Text>
            <View style={styles.titleAccent} />
            <Text style={styles.subtitle}>
              {mode === "login"
                ? "Kelola waktu belajar kamu dengan mudah"
                : "Buat akun baru untuk mulai belajar"}
            </Text>

            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tabButton, mode === "login" && styles.tabActive]}
                onPress={() => {
                  if (mode !== "login") {
                    setMode("login");
                    resetForm();
                  }
                }}
              >
                <Text
                  style={[
                    styles.tabText,
                    mode === "login" && styles.tabTextActive,
                  ]}
                >
                  Masuk
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.tabButton,
                  mode === "register" && styles.tabActive,
                ]}
                onPress={() => {
                  if (mode !== "register") {
                    setMode("register");
                    resetForm();
                  }
                }}
              >
                <Text
                  style={[
                    styles.tabText,
                    mode === "register" && styles.tabTextActive,
                  ]}
                >
                  Daftar
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Username</Text>
            <View style={styles.inputWrap}>
              <Ionicons
                name="person-outline"
                size={18}
                color={COLORS.primaryDarker}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.inputField}
                placeholder="Masukkan username"
                placeholderTextColor={COLORS.textLight}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onFocus={() => handleInputFocus("username")}
                onLayout={(e) => handleInputLayout("username", e)}
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>

            <Text style={styles.label}>Password</Text>
            <View
              style={styles.inputWrap}
              onLayout={(e) => handleInputLayout("password", e)}
            >
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={COLORS.primaryDarker}
                style={styles.inputIcon}
              />
              <TextInput
                ref={passwordRef}
                style={styles.inputField}
                placeholder="Masukkan password"
                placeholderTextColor={COLORS.textLight}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType={mode === "register" ? "next" : "done"}
                onFocus={() => handleInputFocus("password")}
                onSubmitEditing={() => {
                  if (mode === "register") confirmPasswordRef.current?.focus();
                  else handleLogin();
                }}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword((p) => !p)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color={COLORS.textMid}
                />
              </TouchableOpacity>
            </View>

            {mode === "register" && (
              <>
                <Text style={styles.label}>Konfirmasi Password</Text>
                <View
                  style={styles.inputWrap}
                  onLayout={(e) => handleInputLayout("confirmPassword", e)}
                >
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={18}
                    color={COLORS.primaryDarker}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    ref={confirmPasswordRef}
                    style={styles.inputField}
                    placeholder="Ulangi password"
                    placeholderTextColor={COLORS.textLight}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onFocus={() => handleInputFocus("confirmPassword")}
                    onSubmitEditing={handleRegister}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowConfirmPassword((p) => !p)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons
                      name={
                        showConfirmPassword ? "eye-off-outline" : "eye-outline"
                      }
                      size={18}
                      color={COLORS.textMid}
                    />
                  </TouchableOpacity>
                </View>
              </>
            )}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.textInverse} />
              ) : (
                <>
                  <Text style={styles.buttonText}>
                    {mode === "login" ? "Masuk" : "Daftar Sekarang"}
                  </Text>
                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color={COLORS.textInverse}
                  />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.switchLink} onPress={toggleMode}>
              <Text style={styles.switchText}>
                {mode === "login" ? "Belum punya akun? " : "Sudah punya akun? "}
                <Text style={styles.switchTextBold}>
                  {mode === "login" ? "Daftar di sini" : "Masuk di sini"}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

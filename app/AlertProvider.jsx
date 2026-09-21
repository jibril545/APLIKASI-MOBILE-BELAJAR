import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    Animated,
    Easing,
    Modal,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";

import { COLORS, styles } from "./styles";

// ==========================================
// TIPE ALERT → menentukan accent & icon
// ==========================================
const ALERT_TYPES = {
  info: {
    accent: styles.alertAccentBlue,
    iconBg: styles.alertIconBlue,
    iconColor: COLORS.primaryDarker,
    iconLib: "ion",
    icon: "information-circle-outline",
  },
  warning: {
    accent: styles.alertAccentYellow,
    iconBg: styles.alertIconYellow,
    iconColor: "#7A6428",
    iconLib: "ion",
    icon: "alert-circle-outline",
  },
  success: {
    accent: styles.alertAccentMint,
    iconBg: styles.alertIconMint,
    iconColor: COLORS.successDark,
    iconLib: "ion",
    icon: "checkmark-circle-outline",
  },
  error: {
    accent: styles.alertAccentBlue,
    iconBg: styles.alertIconBlue,
    iconColor: COLORS.primaryDarker,
    iconLib: "ion",
    icon: "close-circle-outline",
  },
  confirm: {
    accent: styles.alertAccentBlue,
    iconBg: styles.alertIconBlue,
    iconColor: COLORS.primaryDarker,
    iconLib: "ion",
    icon: "help-circle-outline",
  },
  premium: {
    accent: styles.alertAccentYellow,
    iconBg: styles.alertIconYellow,
    iconColor: "#7A6428",
    iconLib: "mci",
    icon: "crown-outline",
  },
  logout: {
    accent: styles.alertAccentNeutral,
    iconBg: styles.alertIconNeutral,
    iconColor: COLORS.textMid,
    iconLib: "ion",
    icon: "log-out-outline",
  },
  delete: {
    accent: styles.alertAccentYellow,
    iconBg: styles.alertIconYellow,
    iconColor: "#7A6428",
    iconLib: "ion",
    icon: "trash-outline",
  },
};

// ==========================================
// HEURISTIK TIPE OTOMATIS
// Menentukan tipe visual dari judul/pesan tanpa mengubah logic aplikasi.
// ==========================================
const detectType = (title = "", message = "") => {
  const t = String(title).toLowerCase();
  const m = String(message).toLowerCase();
  const all = `${t} ${m}`;

  if (
    t.includes("berhasil") ||
    t.includes("premium aktif") ||
    t.includes("mantap") ||
    t.includes("selesai")
  ) {
    if (t.includes("premium")) return "premium";
    return "success";
  }
  if (
    t.includes("gagal") ||
    t.includes("error") ||
    t.includes("tidak valid") ||
    t.includes("tidak cocok") ||
    t.includes("salah") ||
    t.includes("belum lengkap") ||
    t.includes("terlalu") ||
    t.includes("sudah digunakan")
  ) {
    return "error";
  }
  if (
    t.includes("hapus") ||
    all.includes("yakin") ||
    t.includes("keluar akun")
  ) {
    if (t.includes("keluar")) return "logout";
    return "delete";
  }
  if (t.includes("premium") || t.includes("beli")) return "premium";
  if (t.includes("waktunya") || t.includes("pengingat")) return "warning";
  if (t.includes("tanggal tidak valid")) return "warning";
  return "info";
};

// ==========================================
// CONTEXT
// ==========================================
const AlertContext = createContext(null);

let externalShow = null;

// API publik yang meniru signature Alert.alert(title, message, buttons)
export const Alert = {
  alert: (title, message, buttons, options) => {
    if (externalShow) {
      externalShow(title, message, buttons, options);
    } else {
      // fallback jika provider belum siap
      console.log("ALERT (fallback):", title, message);
    }
  },
};

export function AlertProvider({ children }) {
  const [visible, setVisible] = useState(false);
  const [payload, setPayload] = useState({
    title: "",
    message: "",
    buttons: [{ text: "OK" }],
    type: "info",
  });

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;

  const show = useCallback((title, message, buttons, options) => {
    const finalButtons =
      Array.isArray(buttons) && buttons.length > 0 ? buttons : [{ text: "OK" }];

    const detected = options?.type || detectType(title || "", message || "");

    setPayload({
      title: title || "",
      message: message || "",
      buttons: finalButtons,
      type: detected,
    });
    setVisible(true);
  }, []);

  useEffect(() => {
    externalShow = show;
    return () => {
      externalShow = null;
    };
  }, [show]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      opacity.setValue(0);
      scale.setValue(0.94);
    }
  }, [visible, opacity, scale]);

  const close = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.96,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(() => setVisible(false));
  }, [opacity, scale]);

  const handlePress = useCallback(
    (btn) => {
      close();
      // delay sedikit supaya animasi selesai dulu
      setTimeout(() => {
        if (typeof btn?.onPress === "function") {
          btn.onPress();
        }
      }, 120);
    },
    [close],
  );

  const cfg = ALERT_TYPES[payload.type] || ALERT_TYPES.info;

  const isCancellable = payload.buttons.some((b) => b?.style === "cancel");

  const twoButtons = payload.buttons.length === 2;
  const layoutColumn = payload.buttons.length > 2;

  return (
    <AlertContext.Provider value={{ show }}>
      {children}

      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={() => {
          if (isCancellable) {
            const cancelBtn = payload.buttons.find(
              (b) => b?.style === "cancel",
            );
            handlePress(cancelBtn);
          }
        }}
        statusBarTranslucent
      >
        <TouchableWithoutFeedback
          onPress={() => {
            if (isCancellable) {
              const cancelBtn = payload.buttons.find(
                (b) => b?.style === "cancel",
              );
              handlePress(cancelBtn);
            }
          }}
        >
          <Animated.View style={[styles.alertBackdrop, { opacity }]}>
            <TouchableWithoutFeedback>
              <Animated.View
                style={[styles.alertCard, { transform: [{ scale }] }]}
              >
                <View style={[styles.alertAccentLine, cfg.accent]} />

                <View style={[styles.alertIconWrap, cfg.iconBg]}>
                  {cfg.iconLib === "mci" ? (
                    <MaterialCommunityIcons
                      name={cfg.icon}
                      size={24}
                      color={cfg.iconColor}
                    />
                  ) : (
                    <Ionicons name={cfg.icon} size={24} color={cfg.iconColor} />
                  )}
                </View>

                {payload.title ? (
                  <Text style={styles.alertTitle}>{payload.title}</Text>
                ) : null}

                {payload.message ? (
                  <Text style={styles.alertMessage}>{payload.message}</Text>
                ) : null}

                <View
                  style={
                    layoutColumn
                      ? styles.alertActionsColumn
                      : styles.alertActions
                  }
                >
                  {payload.buttons.map((btn, index) => {
                    const isDestructive = btn?.style === "destructive";
                    const isCancel = btn?.style === "cancel";
                    const isPrimary = !isDestructive && !isCancel;

                    // Jika hanya 1 tombol → full width, primary
                    if (payload.buttons.length === 1) {
                      return (
                        <TouchableOpacity
                          key={index}
                          activeOpacity={0.85}
                          style={[
                            styles.alertBtnBase,
                            styles.alertBtnPrimary,
                            styles.alertBtnFull,
                          ]}
                          onPress={() => handlePress(btn)}
                        >
                          <Text style={styles.alertBtnPrimaryText}>
                            {btn?.text || "OK"}
                          </Text>
                        </TouchableOpacity>
                      );
                    }

                    // 2 tombol → cancel (kiri, secondary), primary/destructive (kanan)
                    if (twoButtons) {
                      if (isCancel) {
                        return (
                          <TouchableOpacity
                            key={index}
                            activeOpacity={0.85}
                            style={[
                              styles.alertBtnBase,
                              styles.alertBtnSecondary,
                              { flex: 1 },
                            ]}
                            onPress={() => handlePress(btn)}
                          >
                            <Text style={styles.alertBtnSecondaryText}>
                              {btn?.text || "Batal"}
                            </Text>
                          </TouchableOpacity>
                        );
                      }
                      return (
                        <TouchableOpacity
                          key={index}
                          activeOpacity={0.85}
                          style={[
                            styles.alertBtnBase,
                            isDestructive
                              ? styles.alertBtnDestructive
                              : styles.alertBtnPrimary,
                            { flex: 1 },
                          ]}
                          onPress={() => handlePress(btn)}
                        >
                          <Text
                            style={
                              isDestructive
                                ? styles.alertBtnDestructiveText
                                : styles.alertBtnPrimaryText
                            }
                          >
                            {btn?.text || "OK"}
                          </Text>
                        </TouchableOpacity>
                      );
                    }

                    // >2 tombol → column
                    return (
                      <TouchableOpacity
                        key={index}
                        activeOpacity={0.85}
                        style={[
                          styles.alertBtnBase,
                          styles.alertBtnFull,
                          isCancel
                            ? styles.alertBtnSecondary
                            : isDestructive
                              ? styles.alertBtnDestructive
                              : styles.alertBtnPrimary,
                        ]}
                        onPress={() => handlePress(btn)}
                      >
                        <Text
                          style={
                            isCancel
                              ? styles.alertBtnSecondaryText
                              : isDestructive
                                ? styles.alertBtnDestructiveText
                                : styles.alertBtnPrimaryText
                          }
                        >
                          {btn?.text || (isPrimary ? "OK" : "Batal")}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Animated.View>
            </TouchableWithoutFeedback>
          </Animated.View>
        </TouchableWithoutFeedback>
      </Modal>
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const ctx = useContext(AlertContext);
  return ctx;
}

export default AlertProvider;

import { router } from "expo-router";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

import { COLORS } from "./styles";

// Urutan halaman
const PAGE_ORDER = ["var", "progress", "premium"];

export default function SwipeNavigation({ currentPage, params, children }) {
  const currentIndex = PAGE_ORDER.indexOf(currentPage);

  const goNext = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= PAGE_ORDER.length) return;
    const next = PAGE_ORDER[nextIndex];
    router.replace({
      pathname: `/${next}`,
      params,
    });
  };

  const goPrev = () => {
    const prevIndex = currentIndex - 1;
    if (prevIndex < 0) return;
    const prev = PAGE_ORDER[prevIndex];
    router.replace({
      pathname: `/${prev}`,
      params,
    });
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onEnd((event) => {
      const { translationX, velocityX } = event;

      const SWIPE_DISTANCE = 80;
      const SWIPE_VELOCITY = 500;

      const isFastEnough = Math.abs(velocityX) > SWIPE_VELOCITY;
      const isFarEnough = Math.abs(translationX) > SWIPE_DISTANCE;

      if (!isFastEnough && !isFarEnough) return;

      if (translationX < 0) {
        runOnJS(goNext)();
      } else {
        runOnJS(goPrev)();
      }
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1, backgroundColor: COLORS.primary }}>
        {children}
      </View>
    </GestureDetector>
  );
}

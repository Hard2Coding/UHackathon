import React, { useEffect, useId, useRef, useSyncExternalStore } from "react";
import {
  AccessibilityInfo,
  AppState,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
  type PointerEvent,
} from "react-native";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from "react-native-svg";

type MotionPreferences = Readonly<{
  reduceMotion: boolean;
  finePointer: boolean;
  visible: boolean;
}>;
const safeMotion: MotionPreferences = { reduceMotion: true, finePointer: false, visible: true };
let motionPreferences = safeMotion;
let preferencesInitialized = false;
let stopPreferences: (() => void) | null = null;
let preferenceGeneration = 0;
const preferenceListeners = new Set<() => void>();

function publishPreferences(next: MotionPreferences) {
  if (next.reduceMotion === motionPreferences.reduceMotion && next.finePointer === motionPreferences.finePointer && next.visible === motionPreferences.visible) return;
  motionPreferences = next;
  preferenceListeners.forEach(listener => listener());
}

function readWebPreferences(): MotionPreferences {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return safeMotion;
  return {
    reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    finePointer: window.matchMedia("(hover: hover) and (pointer: fine)").matches,
    visible: typeof document === "undefined" || document.visibilityState !== "hidden",
  };
}

function getMotionPreferences() {
  if (!preferencesInitialized && Platform.OS === "web") {
    motionPreferences = readWebPreferences();
    preferencesInitialized = true;
  }
  return motionPreferences;
}

function subscribeMotionPreferences(listener: () => void) {
  preferenceListeners.add(listener);
  if (!stopPreferences) {
    const generation = ++preferenceGeneration;
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.matchMedia === "function") {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
      const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
      const update = () => publishPreferences({ reduceMotion: reduced.matches, finePointer: pointer.matches, visible: document.visibilityState !== "hidden" });
      const listen = (query: MediaQueryList) => {
        if (typeof query.addEventListener === "function") {
          query.addEventListener("change", update);
          return () => query.removeEventListener("change", update);
        }
        query.addListener(update);
        return () => query.removeListener(update);
      };
      const stopReduced = listen(reduced), stopPointer = listen(pointer);
      document.addEventListener("visibilitychange", update);
      stopPreferences = () => {
        stopReduced(); stopPointer();
        document.removeEventListener("visibilitychange", update);
      };
      update();
    } else if (Platform.OS !== "web") {
      let settingChanged = false;
      const reduceSubscription = AccessibilityInfo.addEventListener("reduceMotionChanged", value => {
        settingChanged = true;
        publishPreferences({ ...motionPreferences, reduceMotion: value });
      });
      const stateSubscription = AppState.addEventListener("change", state => publishPreferences({ ...motionPreferences, visible: state === "active" }));
      stopPreferences = () => { reduceSubscription.remove(); stateSubscription.remove(); };
      AccessibilityInfo.isReduceMotionEnabled().then(value => {
        if (generation === preferenceGeneration && preferenceListeners.size && !settingChanged) publishPreferences({ ...motionPreferences, reduceMotion: value });
      }).catch(() => {});
    } else stopPreferences = () => {};
  }
  return () => {
    preferenceListeners.delete(listener);
    if (!preferenceListeners.size) {
      stopPreferences?.();
      stopPreferences = null;
      preferenceGeneration += 1;
      preferencesInitialized = false;
      motionPreferences = safeMotion;
    }
  };
}

// All surfaces share one OS/media subscription. Unknown native preferences are
// static until resolved; no per-card global listeners or continuous animation.
export function useMotionPreferences() {
  return useSyncExternalStore(subscribeMotionPreferences, getMotionPreferences, () => safeMotion);
}

function webElement(ref: React.RefObject<View | null>) {
  if (Platform.OS !== "web") return null;
  const node = ref.current as unknown as HTMLElement | null;
  return node?.style && typeof node.getBoundingClientRect === "function" ? node : null;
}

// Short, once-only entrances reveal on scroll on the web. Reduced motion,
// background tabs and unsupported observers always leave the content visible.
export function MotionView({ children, delay = 0, style }: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { reduceMotion, visible } = useMotionPreferences();
  const animateAtMount = useRef(Platform.OS === "web" && !reduceMotion && visible).current;
  const progress = useRef(new Animated.Value(animateAtMount ? 0 : 1)).current;
  const element = useRef<View>(null);
  const played = useRef(false);
  useEffect(() => {
    if (reduceMotion || !visible || !animateAtMount) {
      played.current = true;
      progress.stopAnimation(); progress.setValue(1);
      return;
    }
    if (played.current) { progress.setValue(1); return; }
    let mounted = true;
    let animation: Animated.CompositeAnimation | null = null;
    let observer: IntersectionObserver | null = null;
    const reveal = () => {
      if (!mounted || played.current) return;
      played.current = true;
      observer?.disconnect();
      animation = Animated.timing(progress, {
        toValue: 1, duration: 380, delay: Math.max(0, Math.min(delay, 240)),
        easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web",
      });
      animation.start();
    };
    const node = webElement(element);
    if (node && typeof IntersectionObserver !== "undefined") {
      try {
        observer = new IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) reveal();
        }, { threshold: 0.08 });
        observer.observe(node);
      } catch { reveal(); }
    } else reveal();
    return () => { mounted = false; observer?.disconnect(); animation?.stop(); };
  }, [reduceMotion, visible, animateAtMount, progress, delay]);
  // Native screens replace form content with results inside the same page.
  // Keep that container static so a completed native animation cannot hide
  // the new children. Scroll entrance effects remain available on the web.
  if (Platform.OS !== "web") return <View style={style}>{children}</View>;
  return <Animated.View ref={element} style={[style, {
    opacity: progress,
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  }]}>{children}</Animated.View>;
}

// Pointer-only polish is decorative: no event interception, form movement or
// React state updates on mousemove. Touch/native/reduced-motion stays static.
export function InteractiveSurface({ children, style, surfaceStyle, contentStyle, radius = 22, glow = "rgba(111, 99, 239, 0.22)", tilt = 3, enabled = true }: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  surfaceStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  radius?: number;
  glow?: string;
  tilt?: number;
  enabled?: boolean;
}) {
  const preferences = useMotionPreferences();
  const target = useRef<View>(null);
  const surface = useRef<View>(null);
  const glowLayer = useRef<View>(null);
  const frame = useRef<number | null>(null);
  const point = useRef({ x: 0, y: 0 });
  const active = Platform.OS === "web" && enabled && !preferences.reduceMotion && preferences.finePointer && preferences.visible;
  const reset = () => {
    if (frame.current !== null && typeof window !== "undefined") window.cancelAnimationFrame(frame.current);
    frame.current = null;
    const node = webElement(surface), light = webElement(glowLayer);
    if (node) node.style.transform = "";
    if (light) light.style.opacity = "0";
  };
  useEffect(() => {
    reset();
    const node = webElement(surface), light = webElement(glowLayer);
    if (node) node.style.transition = active ? "transform 180ms ease-out" : "none";
    if (light) {
      light.style.transition = active ? "opacity 180ms ease-out" : "none";
      light.style.background = `radial-gradient(240px circle at var(--sg-pointer-x, 50%) var(--sg-pointer-y, 50%), ${glow}, transparent 72%)`;
    }
    return reset;
  }, [active, glow]);
  const movePointer = (event: PointerEvent) => {
    const pointer = event.nativeEvent;
    if (!active || (pointer.pointerType !== "mouse" && pointer.pointerType !== "pen")) return;
    if (!Number.isFinite(pointer.clientX) || !Number.isFinite(pointer.clientY)) return;
    point.current = { x: pointer.clientX, y: pointer.clientY };
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      // A media/visibility change may arrive before React commits its rerender.
      if (motionPreferences.reduceMotion || !motionPreferences.finePointer || !motionPreferences.visible) { reset(); return; }
      const node = webElement(surface), light = webElement(glowLayer);
      if (!node || !light) return;
      // Measure the stationary target, never the layer that we are tilting.
      const bounds = webElement(target)?.getBoundingClientRect();
      if (!bounds) return;
      if (!bounds.width || !bounds.height) return;
      const x = Math.max(0, Math.min(bounds.width, point.current.x - bounds.left));
      const y = Math.max(0, Math.min(bounds.height, point.current.y - bounds.top));
      const depth = Math.max(0, Math.min(tilt, 4));
      node.style.transform = `perspective(1000px) rotateX(${(0.5 - y / bounds.height) * depth}deg) rotateY(${(x / bounds.width - 0.5) * depth}deg) translateY(-2px)`;
      light.style.setProperty("--sg-pointer-x", `${x}px`);
      light.style.setProperty("--sg-pointer-y", `${y}px`);
      light.style.opacity = "1";
    });
  };
  return <View ref={target} style={[{ borderRadius: radius }, style]}
    onPointerEnter={active ? movePointer : undefined}
    onPointerMove={active ? movePointer : undefined}
    onPointerLeave={reset}
    onPointerCancel={reset}>
    <View ref={surface} style={[{ borderRadius: radius, flex: 1, alignSelf: "stretch" }, surfaceStyle]}>
      {Platform.OS === "web" && <View ref={glowLayer} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFillObject, { borderRadius: radius, opacity: 0, zIndex: 0 }]} />}
      <View style={[{ zIndex: 1, flex: 1, alignSelf: "stretch" }, contentStyle]}>{children}</View>
    </View>
  </View>;
}

export function GradientSurface({ children, colors = ["#2764dc", "#7741d4", "#9250df"], style, radius = 16 }: {
  children?: React.ReactNode;
  colors?: readonly string[];
  style?: StyleProp<ViewStyle>;
  radius?: number;
}) {
  const id = `gradient${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return <View pointerEvents={children ? "auto" : "none"} style={[{ borderRadius: radius, overflow: "hidden" }, style]}>
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFillObject}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs><LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="70%">
          {colors.map((color, index) => <Stop key={`${color}${index}`} offset={`${index * 100 / Math.max(colors.length - 1, 1)}%`} stopColor={color} />)}
        </LinearGradient></Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
    {children}
  </View>;
}

export function AmbientBackground({ dark = false, variant = "soft" }: {
  dark?: boolean;
  variant?: "soft" | "network";
}) {
  const id = `ambient${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFillObject}>
    <Svg width="100%" height="100%" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={dark ? "#052947" : "#d8f4ff"} stopOpacity={dark ? 0.65 : 0.7} />
          <Stop offset="100%" stopColor={dark ? "#392469" : "#ded7ff"} stopOpacity={dark ? 0.5 : 0.65} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="110" cy="80" rx="215" ry="250" fill={`url(#${id})`} opacity={0.65} />
      <Ellipse cx="540" cy="760" rx="300" ry="270" fill={`url(#${id})`} opacity={0.8} />
      <Path d="M0 700 C150 560 220 750 400 625 C485 570 535 590 600 630 L600 800 L0 800Z" fill={`url(#${id})`} opacity={0.4} />
      <Path d="M0 754 C160 650 240 820 415 690 C510 640 555 665 600 700" fill="none" stroke={dark ? "#7a6ced" : "#b8c7f2"} strokeWidth="1" opacity={0.32} />
      <Ellipse cx="125" cy="235" rx="12" ry="36" transform="rotate(42 125 235)" fill={dark ? "#315c99" : "#bdeaff"} opacity={0.3} />
      <Ellipse cx="508" cy="330" rx="9" ry="25" transform="rotate(42 508 330)" fill={dark ? "#7d55c1" : "#d8cdff"} opacity={0.4} />
      {variant === "network" && <>
        <Path d="M85 500 L194 448 L313 510 L419 455 L532 546 M194 448 L228 588 L313 510 L418 638 L532 546 M85 500 L228 588 L418 638" stroke={dark ? "#5e78ec" : "#aac5fa"} strokeWidth="1.4" fill="none" opacity={0.38} />
        {[[85,500],[194,448],[313,510],[419,455],[532,546],[228,588],[418,638]].map(([cx,cy], index) => <Circle key={index} cx={cx} cy={cy} r={index === 2 ? 6 : 3.5} fill={index % 2 ? "#a277f0" : "#68cbef"} opacity={0.65} />)}
      </>}
    </Svg>
  </View>;
}

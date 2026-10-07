import React, { useEffect, useId, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from "react-native-svg";

// Finite entrance animations respect the OS setting and stop when unmounted.
export function MotionView({ children, delay = 0, style }: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted) setReduceMotion(value);
    }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (reduceMotion) { progress.stopAnimation(); progress.setValue(1); return; }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1, duration: 520, delay: Math.min(delay, 500),
      easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, progress, delay]);
  return <Animated.View style={[style, {
    opacity: progress,
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  }]}>{children}</Animated.View>;
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
      <Ellipse cx="125" cy="235" rx="12" ry="36" rotation="42" origin="125,235" fill={dark ? "#315c99" : "#bdeaff"} opacity={0.3} />
      <Ellipse cx="508" cy="330" rx="9" ry="25" rotation="42" origin="508,330" fill={dark ? "#7d55c1" : "#d8cdff"} opacity={0.4} />
      {variant === "network" && <>
        <Path d="M85 500 L194 448 L313 510 L419 455 L532 546 M194 448 L228 588 L313 510 L418 638 L532 546 M85 500 L228 588 L418 638" stroke={dark ? "#5e78ec" : "#aac5fa"} strokeWidth="1.4" fill="none" opacity={0.38} />
        {[[85,500],[194,448],[313,510],[419,455],[532,546],[228,588],[418,638]].map(([cx,cy], index) => <Circle key={index} cx={cx} cy={cy} r={index === 2 ? 6 : 3.5} fill={index % 2 ? "#a277f0" : "#68cbef"} opacity={0.65} />)}
      </>}
    </Svg>
  </View>;
}

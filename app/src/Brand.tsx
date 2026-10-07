import React from "react";
import { Image } from "react-native";
import Svg, { Path } from "react-native-svg";

// Reference-derived symbol shared by welcome and navigation. Local asset works offline.
export function BrandMark({ size = 80 }: { size?: number }) {
  return (
    <Image
      accessibilityLabel="ScamGraph AI logo"
      source={require("../assets/scamgraph-symbol-ui.png")}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

export function GoogleMark() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" accessibilityLabel="Google">
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.73-.06-1.42-.19-2.09H12v3.96h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.75 3.28-7.95Z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.67l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.87 0-5.3-1.94-6.17-4.55H2.15v2.84A11 11 0 0 0 12 23Z"
      />
      <Path
        fill="#FBBC05"
        d="M5.83 14.08a6.6 6.6 0 0 1 0-4.16V7.08H2.15a11 11 0 0 0 0 9.84Z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.37c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.57 10.57 0 0 0 12 1a11 11 0 0 0-9.85 6.08l3.68 2.84C6.7 7.31 9.13 5.37 12 5.37Z"
      />
    </Svg>
  );
}

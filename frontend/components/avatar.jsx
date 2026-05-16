import { useMemo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

// Palette is the same brown / orange / cream family the wireframe uses,
// plus a couple of accent shades so different users are visually distinct.
const COLORS = [
  "#C4956A",
  "#A0785A",
  "#7AA088",
  "#8AA0C4",
  "#B6CFD2",
  "#D9A4A4",
  "#E0BAA5",
  "#BFA28F",
  "#6B8F71",
  "#DD8153",
  "#FF9E6D",
  "#C7B6A6",
];

// Hash a string to a stable integer so the same user always lands on the
// same palette entry. Tiny non-cryptographic FNV-style hash.
function hashString(input) {
  const s = String(input || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}

export function pickAvatarColor(seed) {
  if (!seed) return COLORS[0];
  return COLORS[hashString(seed) % COLORS.length];
}

export function initialsOf(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Reusable circular avatar.
 *
 *   <Avatar name="Jane Doe" uri={profile.avatar} size={64} />
 *
 * If `uri` is provided it renders the photo; otherwise it falls back to the
 * initials of `name` on a coloured background that is unique-per-user
 * (hash of `seed ?? name`).
 */
export function Avatar({
  name,
  uri,
  size = 48,
  seed,
  textStyle,
  style,
}) {
  const color = useMemo(() => pickAvatarColor(seed || name), [seed, name]);
  const initials = useMemo(() => initialsOf(name), [name]);

  const dim = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.image, dim, style]}
      />
    );
  }

  return (
    <View
      style={[styles.fallback, dim, { backgroundColor: color }, style]}
    >
      <Text
        style={[
          styles.fallbackText,
          { fontSize: Math.max(12, size * 0.4) },
          textStyle,
        ]}
      >
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: "#F3EDEA",
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackText: {
    fontFamily: "Outfit",
    fontWeight: "700",
    color: "#FFFBFA",
  },
});

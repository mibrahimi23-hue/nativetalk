import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useUser } from "@/contexts/user-context";
import { useTheme, useThemeColors } from "@/contexts/theme-context";
import { useSafeBack } from "@/hooks/use-safe-back";


export default function Settings() {
  const safeBack = useSafeBack();
  const { logout } = useUser();
  const { darkMode, setDarkMode } = useTheme();
  const colors = useThemeColors();
  const [autoplay, setAutoplay] = useState(true);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: colors.textSubtle }]}>
          Preferences
        </Text>
        <Toggle
          label="Dark mode"
          value={darkMode}
          onValueChange={setDarkMode}
          colors={colors}
        />
        <Toggle
          label="Autoplay lesson videos"
          value={autoplay}
          onValueChange={setAutoplay}
          colors={colors}
        />

        <Text style={[styles.sectionTitle, { color: colors.textSubtle }]}>
          Account
        </Text>
        <LinkRow
          label="Edit profile"
          onPress={() => router.push("/edit-profile")}
          colors={colors}
        />
        <LinkRow
          label="Notifications"
          onPress={() => router.push("/notifications")}
          colors={colors}
        />
        <LinkRow
          label="Privacy"
          onPress={() => router.push("/privacy")}
          colors={colors}
        />

      </ScrollView>
    </View>
  );
}

function Toggle({ label, value, onValueChange, colors }) {
  return (
    <View style={[styles.row, { borderBottomColor: colors.divider }]}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.divider, true: "#FF9E6D" }}
        thumbColor="#FFFBFA"
      />
    </View>
  );
}

function LinkRow({ label, onPress, colors }) {
  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.divider }]}
      onPress={onPress}
    >
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.text} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // backgroundColor is overridden inline based on theme
  wrapper: { flex: 1, backgroundColor: "#FFFBFA" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 55,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontFamily: "Domine",
    fontSize: 16,
    color: "#28221B",
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontFamily: "Domine",
    fontSize: 14,
    color: "#7E6D66",
    marginTop: 18,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EDEA",
  },
  rowLabel: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#28221B",
    fontWeight: "500",
  },
  logoutBtn: {
    marginTop: 32,
    backgroundColor: "#DD8153",
    borderRadius: 22,
    paddingVertical: 14,
    alignItems: "center",
  },
  logoutText: {
    fontFamily: "Outfit",
    fontSize: 15,
    color: "#FFFBFA",
    fontWeight: "600",
  },
});

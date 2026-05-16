import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeBack } from "@/hooks/use-safe-back";
import { useUser } from "@/contexts/user-context";

export default function Privacy() {
  const safeBack = useSafeBack();
  const { role } = useUser();
  const isAdmin = role === "Admin";
  const isTutor = role === "Tutor";
  const hideProgress = isAdmin || isTutor;

  const [showProfile, setShowProfile] = useState(!isAdmin);
  const [showOnline, setShowOnline] = useState(true);
  const [allowMessages, setAllowMessages] = useState(!isAdmin);
  const [shareProgress, setShareProgress] = useState(false);

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Toggle
          label="Public profile"
          description={
            isAdmin
              ? "Admin profiles are private by default"
              : "Others can find and view your profile"
          }
          value={showProfile}
          onValueChange={setShowProfile}
        />
        <Toggle
          label="Show online status"
          description="Display when you're available"
          value={showOnline}
          onValueChange={setShowOnline}
        />
        <Toggle
          label="Allow direct messages"
          description={
            isAdmin
              ? "Restrict who can message the admin account"
              : "Anyone can start a chat with you"
          }
          value={allowMessages}
          onValueChange={setAllowMessages}
        />
        {hideProgress ? null : (
          <Toggle
            label="Share learning progress"
            description="Show your level on the public profile"
            value={shareProgress}
            onValueChange={setShareProgress}
          />
        )}
      </ScrollView>
    </View>
  );
}

function Toggle({ label, description, value, onValueChange }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, paddingRight: 16 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#EFE6E1", true: "#FF9E6D" }}
        thumbColor="#FFFBFA"
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EDEA",
  },
  rowLabel: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#28221B",
    fontWeight: "600",
  },
  rowDescription: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    marginTop: 2,
  },
});

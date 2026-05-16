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

export default function NotificationsScreen() {
  const safeBack = useSafeBack();
  const { role } = useUser();
  const isAdmin = role === "Admin";
  const [push, setPush] = useState(true);
  const [email, setEmail] = useState(true);
  const [reminders, setReminders] = useState(true);
  const [marketing, setMarketing] = useState(false);

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Toggle
          label="Push notifications"
          description="Lesson reminders and chat alerts"
          value={push}
          onValueChange={setPush}
        />
        <Toggle
          label="Email updates"
          description="Important account & lesson updates"
          value={email}
          onValueChange={setEmail}
        />
        {isAdmin ? null : (
          <Toggle
            label="Lesson reminders"
            description="Get a heads-up 30 minutes before"
            value={reminders}
            onValueChange={setReminders}
          />
        )}
        <Toggle
          label="Promotions"
          description="Occasional offers and tips"
          value={marketing}
          onValueChange={setMarketing}
        />
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

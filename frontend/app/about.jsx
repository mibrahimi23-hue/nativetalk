import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useUser } from "@/contexts/user-context";
import { useSafeBack } from "@/hooks/use-safe-back";

export default function About() {
  const safeBack = useSafeBack();
  const { profile, role } = useUser();

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>NativeTalk</Text>
        <Text style={styles.body}>
          NativeTalk connects language learners with native tutors around the
          world. Practice with real conversations, track your progress, and
          unlock new languages at your own pace.
        </Text>

        <View style={styles.divider} />

        <Text style={styles.subTitle}>Your account</Text>
        <Row label="Name" value={`${profile.firstName} ${profile.lastName}`.trim() || "—"} />
        <Row label="Email" value={profile.email || "—"} />
        <Row label="Role" value={role || "—"} />
        <Row label="Language" value={profile.language || "—"} />

        <View style={styles.divider} />

        <Text style={styles.subTitle}>App version</Text>
        <Text style={styles.body}>NativeTalk 1.0.0</Text>
      </ScrollView>
    </View>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
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
    paddingTop: 18,
    paddingBottom: 50,
  },
  title: {
    fontFamily: "Domine",
    fontSize: 22,
    color: "#28221B",
    marginBottom: 10,
  },
  subTitle: {
    fontFamily: "Domine",
    fontSize: 16,
    color: "#28221B",
    marginBottom: 12,
    marginTop: 8,
  },
  body: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    lineHeight: 19,
  },
  divider: {
    height: 1,
    backgroundColor: "#F0EDEA",
    marginVertical: 22,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  rowLabel: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#7E6D66",
  },
  rowValue: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    fontWeight: "600",
  },
});

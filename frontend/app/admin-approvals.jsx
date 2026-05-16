import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { safeBack } from "@/hooks/use-safe-back";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Avatar } from "@/components/avatar";
import { approveTutor, listPendingTutors, rejectTutor } from "@/services/admin";
import { buildMediaUrl } from "@/services/api";

export default function AdminApprovals() {
  const [tutors, setTutors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPendingTutors();
      setTutors(Array.isArray(data) ? data : []);
    } catch {
      setTutors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAction = async (teacherId, action) => {
    setBusyId(teacherId);
    try {
      if (action === "approve") {
        await approveTutor(teacherId);
      } else {
        await rejectTutor(teacherId);
      }
      setTutors((prev) => prev.filter((t) => t.teacher_id !== teacherId));
    } catch (e) {
      Alert.alert("Action failed", e.message || "Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Tutor Account Approval</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 90 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color="#FF9E6D" style={{ marginTop: 40 }} />
        ) : tutors.length === 0 ? (
          <Text style={styles.emptyText}>No pending tutor accounts</Text>
        ) : (
          tutors.map((tutor) => {
            const photo = buildMediaUrl(tutor.profile_photo);
            const busy = busyId === tutor.teacher_id;
            return (
              <View key={tutor.teacher_id} style={styles.card}>
                <View style={styles.avatarWrap}>
                  <Avatar
                    name={tutor.full_name}
                    uri={photo}
                    seed={tutor.email || tutor.teacher_id || tutor.full_name}
                    size={92}
                  />
                </View>

                <Text style={styles.name}>{tutor.full_name}</Text>
                <Text style={styles.bio}>
                  {tutor.bio || `Max level ${tutor.max_level} · ${
                    tutor.is_certified ? "Certified" : "Not certified"
                  }${tutor.has_experience ? " · Experienced" : ""}`}
                </Text>

                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={[styles.approveBtn, busy && { opacity: 0.6 }]}
                    disabled={busy}
                    onPress={() => handleAction(tutor.teacher_id, "approve")}
                  >
                    {busy ? (
                      <ActivityIndicator color="#FFFBFA" />
                    ) : (
                      <Text style={styles.whiteText}>Approve</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.rejectBtn}
                    disabled={busy}
                    onPress={() => handleAction(tutor.teacher_id, "reject")}
                  >
                    <Text style={styles.darkText}>Reject</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.viewBtn}
                    onPress={() =>
                      router.push({
                        pathname: "/admin-tutor-profile",
                        params: { teacherId: tutor.teacher_id },
                      })
                    }
                  >
                    <Text style={styles.darkText}>View</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.bottomNav}>
        <TouchableOpacity onPress={() => router.push("/admin-dashboard")}>
          <Ionicons name="home" size={22} color="#28221B" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/admin-approvals")}>
          <Ionicons name="shield-checkmark" size={22} color="#28221B" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/admin-transactions")}>
          <Ionicons name="swap-horizontal" size={22} color="#28221B" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/admin-profile")}>
          <Ionicons name="person-circle" size={22} color="#28221B" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFBFA",
    paddingTop: 48,
    paddingHorizontal: 20,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },

  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Domine",
    fontSize: 15,
    color: "#28221B",
  },

  card: {
    alignItems: "center",
    marginBottom: 34,
  },

  avatarWrap: {
    marginBottom: 12,
  },

  name: {
    fontFamily: "Domine",
    fontSize: 20,
    color: "#28221B",
    marginBottom: 6,
  },

  bio: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    textAlign: "center",
    marginBottom: 14,
  },

  btnRow: {
    flexDirection: "row",
    gap: 12,
  },

  approveBtn: {
    width: 75,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  rejectBtn: {
    width: 75,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1E5E1",
    justifyContent: "center",
    alignItems: "center",
  },

  viewBtn: {
    width: 75,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#F1E5E1",
    justifyContent: "center",
    alignItems: "center",
  },

  whiteText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#FFFBFA",
  },

  darkText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#28221B",
  },

  emptyText: {
    fontFamily: "Outfit",
    textAlign: "center",
    color: "#28221B",
    marginTop: 60,
  },

  bottomNav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 46,
    backgroundColor: "#FDF0EC",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
});

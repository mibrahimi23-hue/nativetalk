import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Avatar } from "@/components/avatar";
import { safeBack } from "@/hooks/use-safe-back";
import { getTutor } from "@/services/tutors";
import { getTeacherReviews } from "@/services/reviews";
import { listTeacherCertificates } from "@/services/certificates";
import { getTeacherExamAttempts } from "@/services/exams";
import { approveTutor, rejectTutor } from "@/services/admin";
import { buildMediaUrl } from "@/services/api";
import { findLanguageById } from "@/constants/languages";

export default function AdminTutorProfile() {
  const { teacherId } = useLocalSearchParams();
  const [tutor, setTutor] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [certs, setCerts] = useState([]);
  const [examAttempts, setExamAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!teacherId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [t, r, c, exams] = await Promise.all([
        getTutor(teacherId).catch(() => null),
        getTeacherReviews(teacherId).catch(() => []),
        listTeacherCertificates(teacherId).catch(() => []),
        getTeacherExamAttempts(teacherId).catch(() => null),
      ]);
      setTutor(t);
      setReviews(Array.isArray(r) ? r : []);
      setCerts(Array.isArray(c) ? c : c?.certificates || []);
      setExamAttempts(
        Array.isArray(exams) ? exams : exams?.attempts || [],
      );
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    load();
  }, [load]);

  const avgRating = useMemo(() => {
    if (!reviews.length) return 0;
    const total = reviews.reduce((sum, r) => sum + (r.rating || 0), 0);
    return Number((total / reviews.length).toFixed(1));
  }, [reviews]);

  const finish = async (action) => {
    if (!teacherId) return;
    setBusy(true);
    try {
      if (action === "Approved") {
        await approveTutor(teacherId);
      } else {
        await rejectTutor(teacherId);
      }
      Alert.alert(action, `Tutor has been ${action.toLowerCase()}.`);
      router.push("/admin-approvals");
    } catch (e) {
      Alert.alert("Failed", e.message || "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#FF9E6D" />
      </View>
    );
  }
  if (!tutor) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.emptyText}>Tutor not found.</Text>
      </View>
    );
  }

  const language = findLanguageById(tutor.language_id);
  const photo = buildMediaUrl(tutor.profile_photo);
  const price =
    tutor.hourly_rate !== null && tutor.hourly_rate !== undefined
      ? `€${Number(tutor.hourly_rate).toFixed(0)}/hr`
      : "—";

  const certificateUrl = (cert) => {
    // The backend stores paths like "uploads/certificates/<uuid>_file.pdf".
    // Convert Windows-style backslashes to forward slashes, then URI-encode
    // each segment so filenames with spaces or accents still resolve.
    const normalized = String(cert.file_path || "")
      .replace(/\\/g, "/")
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    return buildMediaUrl(normalized);
  };

  const openCertificate = async (cert) => {
    const url = certificateUrl(cert);
    if (!url) {
      Alert.alert("Unavailable", "No file is attached to this certificate.");
      return;
    }
    if (Platform.OS === "web") {
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        Alert.alert(
          "Pop-up blocked",
          "Allow pop-ups for this site to open the certificate, or copy this URL: " + url,
        );
      }
      return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("Cannot open", "No app is available to open this file.");
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert("Cannot open", e?.message || "Could not open the file.");
    }
  };

  const downloadCertificate = async (cert) => {
    const url = certificateUrl(cert);
    if (!url) {
      Alert.alert("Unavailable", "No file is attached to this certificate.");
      return;
    }
    if (Platform.OS === "web") {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.download = cert.name || "certificate";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }
    try {
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert("Cannot open", e?.message || "Could not open the file.");
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
            <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Tutor Profile</Text>
          <View style={{ width: 30 }} />
        </View>

        <View style={styles.avatarWrap}>
          <Avatar
            name={tutor.full_name}
            uri={photo}
            seed={tutor.email || tutor.id || tutor.full_name}
            size={82}
          />
        </View>

        <Text style={styles.name}>{tutor.full_name}</Text>
        <Text style={styles.level}>
          {(language?.name || tutor.language_name || "")} {tutor.max_level || ""}
        </Text>

        <View style={styles.infoRow}>
          <Text style={styles.info}>{avgRating ? `${avgRating} ★` : "No rating"}</Text>
          <Text style={styles.info}>Price {price}</Text>
        </View>

        {!tutor.is_verified && (
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.approveBtn, busy && { opacity: 0.6 }]}
              disabled={busy}
              onPress={() => finish("Approved")}
            >
              <Text style={styles.approveText}>Approve</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.rejectBtn, busy && { opacity: 0.6 }]}
              disabled={busy}
              onPress={() => finish("Rejected")}
            >
              <Text style={styles.rejectText}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.sectionTitle}>Bio</Text>
        <Text style={styles.bio}>{tutor.bio || "No bio provided."}</Text>

        <Text style={styles.sectionTitle}>Experience</Text>
        <View style={styles.experienceRow}>
          <Ionicons
            name={tutor.has_experience ? "checkmark-circle" : "close-circle"}
            size={18}
            color={tutor.has_experience ? "#FF9E6D" : "#DD8153"}
          />
          <Text style={styles.experienceText}>
            {tutor.has_experience
              ? "Has prior teaching experience"
              : "No prior teaching experience"}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Exam Results</Text>
        {examAttempts.length === 0 ? (
          <Text style={styles.emptyText}>
            This tutor has not taken the placement exam yet.
          </Text>
        ) : (
          examAttempts.map((a) => {
            const passed = Boolean(a.passed);
            const pct =
              a.percentage ??
              (a.total > 0
                ? `${Math.round((a.score / a.total) * 100)}%`
                : "0%");
            return (
              <View key={a.attempt_id || a.id} style={styles.examRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.downloadText}>
                    Score {a.score}/{a.total} ({pct})
                  </Text>
                  {a.completed_at && (
                    <Text style={styles.downloadHint}>
                      Taken {new Date(a.completed_at).toLocaleDateString()}
                    </Text>
                  )}
                </View>
                <View
                  style={[
                    styles.examBadge,
                    passed ? styles.examBadgePass : styles.examBadgeFail,
                  ]}
                >
                  <Text
                    style={[
                      styles.examBadgeText,
                      passed
                        ? styles.examBadgeTextPass
                        : styles.examBadgeTextFail,
                    ]}
                  >
                    {passed ? "Passed" : "Failed"}
                  </Text>
                </View>
              </View>
            );
          })
        )}

        <Text style={styles.sectionTitle}>Certificates</Text>
        {certs.length === 0 ? (
          <Text style={styles.emptyText}>No certificates uploaded.</Text>
        ) : (
          certs.map((c) => (
            <View key={c.id} style={styles.downloadRow}>
              <TouchableOpacity
                style={styles.downloadMain}
                onPress={() => openCertificate(c)}
              >
                <Text style={styles.downloadText}>
                  {c.name} {c.is_notarized ? "(notarized)" : ""}
                </Text>
                <Text style={styles.downloadHint}>
                  Tap to open the uploaded file
                </Text>
              </TouchableOpacity>
              <View style={styles.downloadIcons}>
                <Ionicons
                  name={c.is_verified ? "checkmark-circle" : "time-outline"}
                  size={16}
                  color={c.is_verified ? "#FF9E6D" : "#DD8153"}
                />
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => openCertificate(c)}
                >
                  <Ionicons name="open-outline" size={17} color="#FF9E6D" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => downloadCertificate(c)}
                >
                  <Ionicons name="download-outline" size={17} color="#FF9E6D" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 70 }} />
      </ScrollView>

      <View style={styles.bottomNav}>
        <TouchableOpacity onPress={() => router.push("/admin-dashboard")}>
          <Ionicons name="home" size={20} color="#28221B" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/admin-approvals")}>
          <Ionicons name="shield-checkmark" size={20} color="#28221B" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/admin-transactions")}>
          <Ionicons name="swap-horizontal" size={20} color="#28221B" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/admin-profile")}>
          <Ionicons name="person-circle" size={20} color="#28221B" />
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
    paddingHorizontal: 22,
  },
  center: { justifyContent: "center", alignItems: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },

  backBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Domine",
    fontSize: 13,
    color: "#28221B",
  },

  avatarWrap: {
    alignSelf: "center",
    marginBottom: 10,
  },

  name: {
    fontFamily: "Domine",
    fontSize: 18,
    textAlign: "center",
    color: "#28221B",
  },

  level: {
    fontFamily: "Outfit",
    fontSize: 12,
    textAlign: "center",
    color: "#28221B",
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    marginVertical: 10,
  },

  info: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
  },

  btnRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },

  approveBtn: {
    flex: 1,
    height: 38,
    borderRadius: 20,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  rejectBtn: {
    flex: 1,
    height: 38,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D8C7C0",
    justifyContent: "center",
    alignItems: "center",
  },

  approveText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#FFFBFA",
    fontWeight: "700",
  },

  rejectText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#28221B",
    fontWeight: "700",
  },

  sectionTitle: {
    fontFamily: "Domine",
    fontSize: 18,
    color: "#28221B",
    marginBottom: 14,
    marginTop: 8,
  },

  bio: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    marginBottom: 18,
  },

  downloadRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EDEA",
  },

  downloadMain: {
    flex: 1,
  },

  downloadText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
  },

  downloadHint: {
    fontFamily: "Outfit",
    fontSize: 10,
    color: "#7E6D66",
    marginTop: 2,
  },

  downloadIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginLeft: 8,
  },

  iconBtn: {
    minWidth: 22,
    minHeight: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  experienceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 18,
  },

  experienceText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
  },

  examRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EDEA",
  },

  examBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },

  examBadgePass: {
    backgroundColor: "#FFF1E8",
  },

  examBadgeFail: {
    backgroundColor: "#F3EDEA",
  },

  examBadgeText: {
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "700",
  },

  examBadgeTextPass: {
    color: "#FF9E6D",
  },

  examBadgeTextFail: {
    color: "#7E6D66",
  },

  emptyText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#A89080",
    textAlign: "center",
    marginVertical: 12,
  },

  bottomNav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 44,
    backgroundColor: "#FDF0EC",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
});

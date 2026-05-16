import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { safeBack } from "@/hooks/use-safe-back";
import {
  adminDeleteExam,
  adminListExams,
  adminPublishExam,
  adminUnpublishExam,
} from "@/services/exams";
import { useInAppAlert } from "@/components/in-app-alert";

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

export default function AdminExams() {
  // In-app styled alerts (no native window.alert / window.confirm).
  const { notify: notifyHook, confirmAction: confirmHook, AlertHost } =
    useInAppAlert();
  const notify = (title, message, options) => notifyHook(title, message, options);
  // Existing call sites pass a single-string message; bridge to the hook's
  // (title, message) signature with a sensible default title.
  const confirmAction = (message) =>
    confirmHook("Confirm", String(message || ""), {
      confirmLabel: "Yes",
      destructive: true,
    });

  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminListExams();
      setExams(Array.isArray(data) ? data : []);
    } catch (e) {
      setExams([]);
      notify("Could not load exams", e?.message || "Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const togglePublish = async (exam) => {
    if (busyId) return;
    setBusyId(exam.exam_id);
    try {
      if (exam.is_active) {
        await adminUnpublishExam(exam.exam_id);
      } else {
        await adminPublishExam(exam.exam_id);
      }
      await load();
    } catch (e) {
      notify("Could not update status", e?.message || "Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const removeExam = async (exam) => {
    if (busyId) return;
    const ok = await confirmAction(
      `Delete "${exam.title}"? This removes its questions and any attempts.`,
    );
    if (!ok) return;
    setBusyId(exam.exam_id);
    try {
      await adminDeleteExam(exam.exam_id);
      await load();
    } catch (e) {
      notify("Could not delete exam", e?.message || "Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const filtered = exams.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (e.title || "").toLowerCase().includes(q) ||
      (e.language || "").toLowerCase().includes(q) ||
      (e.level || "").toLowerCase().includes(q)
    );
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack("/admin-dashboard")}>
          <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Exams</Text>
        <View style={{ width: 30 }} />
      </View>

      <Text style={styles.title}>Published exams</Text>
      <Text style={styles.subtitle}>
        Tutors of a language see every active exam published for that language.
      </Text>

      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={16} color="#7E6D66" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by language, level or title"
          placeholderTextColor="#7E6D66"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close" size={16} color="#28221B" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 90 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color="#FF9E6D" style={{ marginTop: 30 }} />
        ) : filtered.length === 0 ? (
          <Text style={styles.empty}>
            {exams.length === 0
              ? "No exams have been published yet. Use the Exam Builder to create one."
              : "No exams match your search."}
          </Text>
        ) : (
          filtered.map((exam) => (
            <TouchableOpacity
              key={exam.exam_id}
              activeOpacity={0.85}
              style={styles.examCard}
              onPress={() =>
                router.push({
                  pathname: "/admin-exam-builder",
                  params: { examId: exam.exam_id },
                })
              }
            >
              <View style={{ flex: 1 }}>
                <View style={styles.titleRow}>
                  <Text style={styles.examTitle}>{exam.title}</Text>
                  <View
                    style={[
                      styles.badge,
                      exam.is_active ? styles.badgePublished : styles.badgeDraft,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        exam.is_active
                          ? styles.badgeTextPublished
                          : styles.badgeTextDraft,
                      ]}
                    >
                      {exam.is_active ? "Published" : "Unpublished"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  {(exam.language || "Language")} · Level {exam.level} ·{" "}
                  {exam.total_questions ?? 0} question
                  {(exam.total_questions ?? 0) === 1 ? "" : "s"}
                </Text>
                {exam.created_at ? (
                  <Text style={styles.created}>
                    Created {formatDate(exam.created_at)}
                  </Text>
                ) : null}

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, exam.is_active ? styles.ghost : styles.primary]}
                    onPress={() => togglePublish(exam)}
                    disabled={busyId === exam.exam_id}
                  >
                    {busyId === exam.exam_id ? (
                      <ActivityIndicator
                        color={exam.is_active ? "#28221B" : "#FFFBFA"}
                      />
                    ) : (
                      <Text
                        style={[
                          styles.actionText,
                          exam.is_active ? styles.actionTextGhost : styles.actionTextPrimary,
                        ]}
                      >
                        {exam.is_active ? "Unpublish" : "Publish"}
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => removeExam(exam)}
                    disabled={busyId === exam.exam_id}
                  >
                    <Ionicons name="trash-outline" size={16} color="#DD8153" />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}

        <TouchableOpacity
          style={styles.newExamBtn}
          onPress={() => router.push("/admin-exam-builder")}
        >
          <Ionicons name="add" size={18} color="#FFFBFA" />
          <Text style={styles.newExamText}>Create new exam</Text>
        </TouchableOpacity>
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

      <AlertHost />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFBFA",
    paddingHorizontal: 22,
    paddingTop: 48,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 22,
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
    fontSize: 14,
    color: "#28221B",
  },
  title: {
    fontFamily: "Domine",
    fontSize: 18,
    color: "#28221B",
  },
  subtitle: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
    marginBottom: 14,
  },
  searchBox: {
    height: 36,
    backgroundColor: "#F1E5E1",
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#28221B",
    marginLeft: 6,
  },
  examCard: {
    backgroundColor: "#FFFBFA",
    borderWidth: 1,
    borderColor: "#F0EDEA",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    flexDirection: "row",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  examTitle: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "700",
    color: "#28221B",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgePublished: {
    backgroundColor: "#FFF1E8",
  },
  badgeDraft: {
    backgroundColor: "#F3EDEA",
  },
  badgeText: {
    fontFamily: "Outfit",
    fontSize: 10,
    fontWeight: "700",
  },
  badgeTextPublished: {
    color: "#FF9E6D",
  },
  badgeTextDraft: {
    color: "#7E6D66",
  },
  meta: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#28221B",
    marginBottom: 2,
  },
  created: {
    fontFamily: "Outfit",
    fontSize: 10,
    color: "#A89080",
    marginBottom: 10,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    backgroundColor: "#FF9E6D",
  },
  ghost: {
    backgroundColor: "#F3EDEA",
  },
  actionText: {
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "700",
  },
  actionTextPrimary: {
    color: "#FFFBFA",
  },
  actionTextGhost: {
    color: "#28221B",
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFF1E8",
    alignItems: "center",
    justifyContent: "center",
  },
  newExamBtn: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    backgroundColor: "#FF9E6D",
    borderRadius: 22,
  },
  newExamText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
    fontWeight: "600",
  },
  empty: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    textAlign: "center",
    marginTop: 30,
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

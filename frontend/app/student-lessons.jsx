import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
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
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { useUser } from "@/contexts/user-context";
import { safeBack } from "@/hooks/use-safe-back";
import { buildMediaUrl } from "@/services/api";
import { listMyLessons } from "@/services/lessons";
import { listMySessions } from "@/services/sessions";
import { listMaterials } from "@/services/materials";

const TABS = ["A1", "A2", "B1", "B2", "C1", "C2"];

const nextState = (s) =>
  s === "preview" ? "expanded" : s === "expanded" ? "collapsed" : "preview";
const chevronFor = (s) =>
  s === "preview" ? "chevron-down" : s === "expanded" ? "chevron-up" : "chevron-forward";
const labelFor = (s, n) =>
  s === "preview" ? `Show all (${n})` : s === "expanded" ? "Hide all" : "Show preview";
const visibleSlice = (s, list) =>
  s === "collapsed" ? [] : s === "expanded" ? list : list.slice(0, 3);

function formatDateTime(dateString) {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  return {
    date: `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`,
    time: d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  };
}

function isJoinable(session) {
  if (session.status !== "confirmed") return false;
  const d = new Date(session.scheduled_at);
  if (Number.isNaN(d.getTime())) return false;
  const now = Date.now();
  const opens = d.getTime() - 15 * 60 * 1000;
  const closes = d.getTime() + (session.duration_minutes || 60 + 15) * 60 * 1000;
  return now >= opens && now <= closes;
}

export default function StudentLessons() {
  const { profile } = useUser();
  const [activeTab, setActiveTab] = useState("A1");
  const [completedState, setCompletedState] = useState("preview");
  const [upcomingState, setUpcomingState] = useState("preview");
  const [materialsState, setMaterialsState] = useState("preview");
  const [sessions, setSessions] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, l, m] = await Promise.all([
        listMySessions().catch(() => []),
        listMyLessons({ level: activeTab }).catch(() => []),
        listMaterials({ level: activeTab }).catch(() => []),
      ]);
      setSessions(Array.isArray(s) ? s : []);
      setLessons(Array.isArray(l) ? l : []);
      setMaterials(Array.isArray(m) ? m : []);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    load();
  }, [load]);

  const lessonNotesForLevel = useMemo(
    () =>
      lessons
        .filter((l) => l.kind === "lesson_note" && l.level === activeTab)
        .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)),
    [lessons, activeTab]
  );
  const completedForLevel = useMemo(
    () => [
      ...lessonNotesForLevel,
      ...sessions.filter((s) => s.level === activeTab && s.status === "completed"),
    ],
    [sessions, activeTab, lessonNotesForLevel]
  );
  const upcomingForLevel = useMemo(
    () =>
      sessions
        .filter(
          (s) =>
            s.level === activeTab && (s.status === "pending" || s.status === "confirmed")
        )
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)),
    [sessions, activeTab]
  );

  const visibleCompleted = visibleSlice(completedState, completedForLevel);
  const visibleUpcoming = visibleSlice(upcomingState, upcomingForLevel);
  const visibleMaterials = visibleSlice(materialsState, materials);

  const noLessonsAtAll =
    completedForLevel.length === 0 && upcomingForLevel.length === 0;

  const openMaterial = async (mat) => {
    const url = buildMediaUrl(mat.download_url || mat.file_path);
    if (!url) {
      Alert.alert("No document", "This material doesn't have a file attached.");
      return;
    }
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) await Linking.openURL(url);
      else if (Platform.OS === "web") window.open(url, "_blank");
    } catch {
      if (Platform.OS === "web") window.open(url, "_blank");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lessons</Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={styles.tabs}>
        {TABS.map((tab) => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)}>
            <Text
              style={[styles.tabText, activeTab === tab && styles.activeTab]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {loading ? (
          <ActivityIndicator color="#FF9E6D" style={{ marginTop: 24 }} />
        ) : noLessonsAtAll ? (
          <View style={styles.emptyState}>
            <Ionicons name="book-outline" size={28} color="#A89080" />
            <Text style={styles.emptyStateTitle}>
              No lessons for {activeTab} yet
            </Text>
            <Text style={styles.emptyStateText}>
              Pick another level or check back once your tutor adds lessons.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.title}>Completed Lessons</Text>

            {completedForLevel.length === 0 ? (
              <Text style={styles.emptyText}>
                No completed lessons for this level yet.
              </Text>
            ) : (
              <>
                {visibleCompleted.map((session) => {
                  const { date, time } = formatDateTime(session.scheduled_at);
                  const isLessonNote = session.kind === "lesson_note";
                  const pendingReview =
                    !isLessonNote && session.student_review_done === false;
                  return (
                    <View key={session.id} style={styles.completedRow}>
                      <TouchableOpacity
                        style={styles.completedMain}
                        onPress={() =>
                          router.push({
                            pathname: "/student-lesson-detail",
                            params: isLessonNote
                              ? { lessonId: String(session.id) }
                              : { sessionId: String(session.id) },
                          })
                        }
                      >
                        <View style={styles.square} />
                        <View style={{ flex: 1 }}>
                          {isLessonNote ? (
                            <>
                              <Text style={styles.completedTitle}>
                                Lesson {session.lesson_number || 1}: {session.title}
                              </Text>
                              <Text style={styles.completedText}>Lesson content</Text>
                            </>
                          ) : (
                            <>
                              <Text style={styles.completedTitle}>
                                {profile.language || "Language"} · {session.level}
                              </Text>
                              <Text style={styles.completedText}>
                                {date} {time}
                              </Text>
                            </>
                          )}
                        </View>
                      </TouchableOpacity>

                      {pendingReview ? (
                        <TouchableOpacity
                          style={styles.reviewChip}
                          onPress={() =>
                            router.push({
                              pathname: "/student-write-review",
                              params: { sessionId: String(session.id) },
                            })
                          }
                        >
                          <Ionicons name="star-outline" size={12} color="#FFFBFA" />
                          <Text style={styles.reviewChipText}>Pending review</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                })}

                {completedForLevel.length > 3 && (
                  <TouchableOpacity
                    style={styles.toggleBtn}
                    onPress={() => setCompletedState(nextState(completedState))}
                  >
                    <Ionicons
                      name={chevronFor(completedState)}
                      size={16}
                      color="#FFFBFA"
                    />
                    <Text style={styles.toggleText}>
                      {labelFor(completedState, completedForLevel.length)}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            <Text style={[styles.title, { marginTop: 22 }]}>
              Upcoming Lessons
            </Text>

            {upcomingForLevel.length === 0 ? (
              <Text style={styles.emptyText}>
                No upcoming lessons for this level yet.
              </Text>
            ) : (
              <>
                {visibleUpcoming.map((session) => {
                  const { date, time } = formatDateTime(session.scheduled_at);
                  const joinable = isJoinable(session);
                  return joinable ? (
                    <View key={session.id} style={styles.upcomingRow}>
                      <TouchableOpacity
                        onPress={() =>
                          router.push({
                            pathname: "/student-lesson-detail",
                            params: { sessionId: String(session.id) },
                          })
                        }
                      >
                        <Text style={styles.lessonTitle}>
                          {profile.language || "Language"} · {session.level}
                        </Text>
                        <Text style={styles.lessonTime}>
                          {date} {time}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.joinBtn}
                        onPress={() =>
                          router.push({
                            pathname: "/videocall",
                            params: { sessionId: String(session.id) },
                          })
                        }
                      >
                        <Text style={styles.joinText}>Join</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      key={session.id}
                      style={styles.lineLesson}
                      onPress={() =>
                        router.push({
                          pathname: "/student-lesson-detail",
                          params: { sessionId: String(session.id) },
                        })
                      }
                    >
                      <Text style={styles.lessonTitle}>
                        {profile.language || "Language"} · {session.level}
                      </Text>
                      <Text style={styles.lessonTime}>
                        {date} {time}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {upcomingForLevel.length > 3 && (
                  <TouchableOpacity
                    style={styles.toggleBtn}
                    onPress={() => setUpcomingState(nextState(upcomingState))}
                  >
                    <Ionicons
                      name={chevronFor(upcomingState)}
                      size={16}
                      color="#FFFBFA"
                    />
                    <Text style={styles.toggleText}>
                      {labelFor(upcomingState, upcomingForLevel.length)}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() =>
                    router.push({
                      pathname: "/cancel-session",
                      params: upcomingForLevel[0]
                        ? { sessionId: String(upcomingForLevel[0].id) }
                        : {},
                    })
                  }
                >
                  <Text style={styles.cancelText}>Cancel Upcoming lesson</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        <Text style={[styles.title, { marginTop: 26 }]}>Materials</Text>

        {visibleMaterials.length === 0 && materialsState !== "collapsed" && (
          <Text style={styles.emptyText}>No materials yet.</Text>
        )}

        {visibleMaterials.map((mat) => (
          <View key={mat.id} style={styles.materialRow}>
            <Text style={styles.materialTitle}>{mat.title}</Text>
            <TouchableOpacity onPress={() => openMaterial(mat)}>
              <Ionicons name="download-outline" size={20} color="#28221B" />
            </TouchableOpacity>
          </View>
        ))}

        {materials.length > 3 && (
          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={() => setMaterialsState(nextState(materialsState))}
          >
            <Ionicons name={chevronFor(materialsState)} size={16} color="#FFFBFA" />
            <Text style={styles.toggleText}>
              {labelFor(materialsState, materials.length)}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <StudentBottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFBFA",
    paddingTop: 48,
    paddingHorizontal: 18,
  },

  header: { flexDirection: "row", alignItems: "center", marginBottom: 16 },

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

  tabs: {
    flexDirection: "row",
    gap: 28,
    borderBottomWidth: 1,
    borderBottomColor: "#EFE6E1",
    marginBottom: 18,
  },

  tabText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#7E6D66",
    paddingBottom: 7,
  },

  activeTab: {
    color: "#28221B",
    borderBottomWidth: 2,
    borderBottomColor: "#28221B",
  },

  title: {
    fontFamily: "Domine",
    fontSize: 18,
    color: "#28221B",
    marginBottom: 10,
  },

  completedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EDEA",
  },
  completedMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  reviewChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FF9E6D",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    marginLeft: 8,
  },
  reviewChipText: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  square: {
    width: 14,
    height: 14,
    backgroundColor: "#DD8153",
    marginRight: 12,
  },

  completedTitle: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    fontWeight: "600",
  },

  completedText: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
    marginTop: 3,
  },

  toggleBtn: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FF9E6D",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 14,
    marginBottom: 8,
  },

  toggleText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  upcomingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EDEA",
  },

  lessonTitle: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    fontWeight: "700",
  },

  lessonTime: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    marginTop: 4,
  },

  joinBtn: {
    width: 60,
    height: 38,
    borderRadius: 20,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  joinText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  lineLesson: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EDEA",
  },

  cancelBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#DD8153",
    borderRadius: 20,
    paddingVertical: 11,
    paddingHorizontal: 18,
    marginTop: 14,
  },

  cancelText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  emptyText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#A89080",
    marginVertical: 6,
  },

  emptyState: {
    alignItems: "center",
    paddingVertical: 50,
    paddingHorizontal: 24,
    backgroundColor: "#FFF1E8",
    borderRadius: 14,
    marginTop: 12,
  },

  emptyStateTitle: {
    fontFamily: "Domine",
    fontSize: 16,
    color: "#28221B",
    marginTop: 10,
  },

  emptyStateText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },

  materialRow: {
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#F0EDEA",
  },

  materialTitle: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#28221B",
  },
});

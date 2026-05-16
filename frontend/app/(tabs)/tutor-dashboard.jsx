import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TutorBottomNav } from "@/components/tutor-bottom-nav";
import { useUser } from "@/contexts/user-context";
import {
  listMySessions,
  listMyStudents,
  completeSession,
  getDailyRoom,
} from "@/services/sessions";
import { getTeacherEarnings } from "@/services/payments";
import { getTutorPaypalTransactions } from "@/services/paypal";
import { getTeacherReviews } from "@/services/reviews";

const ROOM_WINDOW_MINUTES = 30;

function minutesUntil(dateString) {
  if (!dateString) return Number.POSITIVE_INFINITY;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
  return (d.getTime() - Date.now()) / 60000;
}

function formatDate(dateString) {
  if (!dateString) return { date: "", time: "" };
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  return {
    date: `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`,
    time: d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  };
}

function relativeTime(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

function initialsOf(name) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const REVIEW_COLORS = ["#E8C9B6", "#C7B6A6", "#D9C2B3", "#B6CFD2"];

export default function TutorDashboard() {
  const { profile, user } = useUser();
  const teacherId = user?.teacher_id;

  const [sessions, setSessions] = useState([]);
  const [students, setStudents] = useState([]);
  const [earnings, setEarnings] = useState({ today: 0, this_week: 0, this_month: 0, total: 0 });
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [doneIds, setDoneIds] = useState([]);
  const [creatingRoomId, setCreatingRoomId] = useState(null);
  const autoFetchedRef = useRef({});
  const [, setNowTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const tasks = [
        listMySessions().catch(() => []),
        listMyStudents().catch(() => []),
      ];
      if (teacherId) {
        tasks.push(getTutorPaypalTransactions(teacherId).catch(() => null));
        tasks.push(getTeacherReviews(teacherId).catch(() => []));
        tasks.push(getTeacherEarnings(teacherId).catch(() => null));
      }
      const [sessionsResult, studentsResult, paypalResult, reviewsResult, payoutsResult] =
        await Promise.all(tasks);
      setSessions(Array.isArray(sessionsResult) ? sessionsResult : []);
      setStudents(Array.isArray(studentsResult) ? studentsResult : []);
      if (paypalResult) {
        const totalEarned = payoutsResult
          ? Number(payoutsResult.total_earned || 0)
          : 0;
        setEarnings({
          today: Number(paypalResult.today || 0),
          this_week: Number(paypalResult.this_week || 0),
          this_month: Number(paypalResult.this_month || 0),
          total: Number(paypalResult.total || 0) + totalEarned,
        });
      } else if (payoutsResult) {
        setEarnings({
          today: 0,
          this_week: 0,
          this_month: 0,
          total: Number(payoutsResult.total_earned || 0),
        });
      }
      if (Array.isArray(reviewsResult)) setReviews(reviewsResult);
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateRoom = useCallback(async (session) => {
    if (minutesUntil(session.scheduled_at) > ROOM_WINDOW_MINUTES) {
      Alert.alert("Video call", "You cannot open that room now.");
      return;
    }
    setCreatingRoomId(session.id);
    try {
      await getDailyRoom(session.id);
      await loadData();
      Alert.alert(
        "Room invitation sent",
        "The video call link has been sent to your student."
      );
    } catch (err) {
      Alert.alert(
        "Video call",
        err?.message || "You cannot open that room now."
      );
    } finally {
      setCreatingRoomId(null);
    }
  }, [loadData]);

  const upcomingSessions = sessions
    .filter((s) => s.status === "pending" || s.status === "confirmed")
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  // Auto-generate the Daily room as soon as we're inside the 30-minute
  // pre-call window so the tutor doesn't have to remember to press the
  // button. The room creation also sends the URL to the student via chat —
  // both sides see the link without any manual step on the day of. We use
  // a ref (not state) to track which sessions we've tried so a successful
  // fetch doesn't itself trigger another effect run.
  useEffect(() => {
    const candidates = upcomingSessions.filter((s) => {
      if (s.daily_room_url) return false;
      if (autoFetchedRef.current[s.id]) return false;
      const mins = minutesUntil(s.scheduled_at);
      return mins <= ROOM_WINDOW_MINUTES && mins >= -((s.duration_minutes || 60) + 15);
    });
    if (candidates.length === 0) return;
    let cancelled = false;
    (async () => {
      let anySucceeded = false;
      for (const session of candidates) {
        autoFetchedRef.current[session.id] = true;
        try {
          await getDailyRoom(session.id);
          anySucceeded = true;
        } catch {
          // Marked as attempted in the ref; the 60s tick can clear it
          // later if we want to retry.
        }
      }
      if (!cancelled && anySucceeded) await loadData();
    })();
    return () => {
      cancelled = true;
    };
  }, [upcomingSessions, loadData]);

  const toggleDone = async (session) => {
    const wasChecked = doneIds.includes(session.id);
    // Don't even let the tutor "tick" a lesson that hasn't started yet —
    // completing a future booking would silently lock the student's payment.
    if (!wasChecked && minutesUntil(session.scheduled_at) > 0) {
      Alert.alert(
        "Not yet",
        "You can mark this lesson as done once it has started.",
      );
      return;
    }
    setDoneIds((prev) =>
      wasChecked ? prev.filter((x) => x !== session.id) : [...prev, session.id]
    );
    if (session.status === "confirmed" && !wasChecked) {
      try {
        await completeSession(session.id);
        await loadData();
      } catch (e) {
        // Backend refuses to complete a session where no Daily room was
        // ever opened — uncheck the box and tell the tutor why so they can
        // open the room (or cancel the lesson) instead.
        setDoneIds((prev) => prev.filter((x) => x !== session.id));
        Alert.alert(
          "Cannot mark as done",
          e?.message || "Open the video room first, then mark the lesson as done.",
        );
      }
    }
  };

  const greetingName =
    profile.firstName || profile.lastName
      ? `${profile.firstName} ${profile.lastName}`.trim()
      : null;

  return (
    <SafeAreaView style={styles.wrapper} edges={["top"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.header}>
          {greetingName
            ? `Welcome, ${greetingName}`
            : "Language Tutor Dashboard"}
        </Text>
        {profile.language ? (
          <Text style={styles.subHeader}>Teaching {profile.language}</Text>
        ) : null}

        {/* Earnings */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Earnings Overview</Text>
          <TouchableOpacity
            style={styles.arrowBtn}
            onPress={() => router.push("/transactions")}
          >
            <Ionicons name="chevron-forward" size={18} color="#FFFBFA" />
          </TouchableOpacity>
        </View>

        <View style={styles.earningsCard}>
          <Text style={styles.todayLabel}>Today&apos;s Earnings</Text>
          <Text style={styles.earningsAmount}>€{Number(earnings.today || 0).toFixed(0)}</Text>

          <View style={styles.pillRow}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>
                This Week: €{Number(earnings.this_week || 0).toFixed(0)}
              </Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>
                This Month: €{Number(earnings.this_month || 0).toFixed(0)}
              </Text>
            </View>
          </View>
        </View>

        {/* Lessons */}
        <View style={[styles.sectionRow, { marginTop: 26 }]}>
          <Text style={styles.sectionTitle}>Upcoming Lessons</Text>
          <TouchableOpacity
            style={styles.arrowBtn}
            onPress={() => router.push("/language-lessons")}
          >
            <Ionicons name="chevron-forward" size={18} color="#FFFBFA" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color="#FF9E6D" />
        ) : upcomingSessions.length === 0 ? (
          <Text style={styles.emptyHint}>No upcoming lessons.</Text>
        ) : (
          <>
            {upcomingSessions.slice(0, 4).map((session) => {
              const formatted = formatDate(session.scheduled_at);
              const minsLeft = minutesUntil(session.scheduled_at);
              const reschedulePending = !!session.rescheduled;
              const roomOpen =
                !reschedulePending &&
                minsLeft <= ROOM_WINDOW_MINUTES &&
                minsLeft >= -session.duration_minutes - 15;
              const roomReady = !!session.daily_room_url && !reschedulePending;
              const isCreating = creatingRoomId === session.id;
              return (
                <View key={session.id} style={styles.lessonItem}>
                  <TouchableOpacity
                    style={styles.lessonRow}
                    activeOpacity={0.7}
                    onPress={() => toggleDone(session)}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        doneIds.includes(session.id) && styles.checkboxChecked,
                      ]}
                    >
                      {doneIds.includes(session.id) && (
                        <Ionicons name="checkmark" size={14} color="#FFFBFA" />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lessonName}>
                        {session.level} session
                      </Text>
                      <Text style={styles.lessonDate}>
                        {formatted.date} {formatted.time}
                      </Text>
                      {reschedulePending ? (
                        <Text style={styles.reschedulePill}>
                          Reschedule pending
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() =>
                        router.push({
                          pathname: "/cancel-session",
                          params: { sessionId: String(session.id) },
                        })
                      }
                    >
                      <Text style={styles.cancelText}>Reschedule or cancel</Text>
                    </TouchableOpacity>

                    {roomOpen ? (
                      roomReady ? (
                        <TouchableOpacity
                          style={styles.cancelBtn}
                          onPress={() =>
                            router.push({
                              pathname: "/videocall",
                              params: { sessionId: String(session.id) },
                            })
                          }
                        >
                          <Text style={styles.cancelText}>Join call</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[styles.cancelBtn, isCreating && { opacity: 0.7 }]}
                          disabled={isCreating}
                          onPress={() => handleCreateRoom(session)}
                        >
                          {isCreating ? (
                            <ActivityIndicator color="#FFFBFA" size="small" />
                          ) : (
                            <Text style={styles.cancelText}>
                              Create room invitation
                            </Text>
                          )}
                        </TouchableOpacity>
                      )
                    ) : (
                      <Text style={styles.roomBlockedText}>
                        You cannot open that room now.
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}

            {upcomingSessions.length > 4 ? (
              <TouchableOpacity
                style={styles.seeMoreBtn}
                onPress={() => router.push("/language-lessons")}
              >
                <Text style={styles.seeMoreText}>
                  See all {upcomingSessions.length} upcoming lessons
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#FF9E6D" />
              </TouchableOpacity>
            ) : null}
          </>
        )}

        <View style={styles.lessonStatRow}>
          <Text style={styles.lessonStatLabel}>Upcoming sessions</Text>
          <Text style={styles.lessonStatValue}>{upcomingSessions.length}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.lessonStatRow}>
          <Text style={styles.lessonStatLabel}>Completed sessions</Text>
          <Text style={styles.lessonStatValue}>
            {sessions.filter((s) => s.status === "completed").length}
          </Text>
        </View>
        <View style={styles.divider} />

        {/* My Students */}
        <View style={[styles.sectionRow, { marginTop: 26 }]}>
          <Text style={styles.sectionTitle}>My Students</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{students.length}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color="#FF9E6D" />
        ) : students.length === 0 ? (
          <Text style={styles.emptyHint}>No students yet.</Text>
        ) : (
          students.slice(0, 5).map((student, idx) => (
            <View key={student.student_id} style={styles.studentCard}>
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: REVIEW_COLORS[idx % REVIEW_COLORS.length] },
                ]}
              >
                <Text style={styles.avatarText}>
                  {initialsOf(student.full_name || "Student")}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.studentName}>
                  {student.full_name || "Student"}
                </Text>
                <Text style={styles.studentMeta}>
                  Level {student.current_level || "—"} · {student.upcoming_sessions} upcoming · {student.completed_sessions} done
                </Text>
              </View>
              <TouchableOpacity
                style={styles.messageBtn}
                onPress={() =>
                  router.push({
                    pathname: "/chat",
                    params: {
                      userId: String(student.user_id),
                      name: student.full_name || "Student",
                      color: REVIEW_COLORS[idx % REVIEW_COLORS.length],
                    },
                  })
                }
              >
                <Ionicons name="chatbubble-ellipses-outline" size={14} color="#FFFBFA" />
                <Text style={styles.messageBtnText}>Message</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Reviews */}
        <View style={[styles.sectionRow, { marginTop: 26 }]}>
          <Text style={styles.sectionTitle}>Reviews</Text>
          <TouchableOpacity
            style={styles.arrowBtn}
            onPress={() => router.push("/reviews")}
          >
            <Ionicons name="chevron-forward" size={18} color="#FFFBFA" />
          </TouchableOpacity>
        </View>

        {reviews.length === 0 ? (
          <Text style={styles.emptyHint}>No reviews yet.</Text>
        ) : (
          reviews.slice(0, 3).map((r, idx) => (
            <View key={r.id} style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: REVIEW_COLORS[idx % REVIEW_COLORS.length] },
                  ]}
                >
                  <Text style={styles.avatarText}>
                    {initialsOf(r.reviewer_name || `Student ${idx + 1}`)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reviewName}>
                    {r.reviewer_name || `Student ${idx + 1}`}
                  </Text>
                  <Text style={styles.reviewWhen}>
                    {relativeTime(r.created_at)} · {"★".repeat(r.rating || 0)}
                  </Text>
                </View>
                {r.reviewer_id ? (
                  <TouchableOpacity
                    style={styles.messageBtn}
                    onPress={() =>
                      router.push({
                        pathname: "/chat",
                        params: {
                          userId: String(r.reviewer_id),
                          name: r.reviewer_name || `Student ${idx + 1}`,
                          color: REVIEW_COLORS[idx % REVIEW_COLORS.length],
                        },
                      })
                    }
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={14} color="#FFFBFA" />
                    <Text style={styles.messageBtnText}>Message</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <Text style={styles.reviewText}>{r.comment || ""}</Text>
            </View>
          ))
        )}

        <View style={{ height: 110 }} />
      </ScrollView>

      <TutorBottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: "#FFFBFA" },
  container: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 12 },

  header: {
    fontFamily: "Domine",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 4,
    color: "#28221B",
  },

  subHeader: {
    fontFamily: "Outfit",
    fontSize: 12,
    textAlign: "center",
    color: "#7E6D66",
    marginBottom: 20,
  },

  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  sectionTitle: {
    fontFamily: "Domine",
    fontSize: 18,
    color: "#28221B",
  },

  arrowBtn: {
    backgroundColor: "#FF9E6D",
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },

  earningsCard: {
    backgroundColor: "#FFFBFA",
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 14,
    shadowColor: "#28221B",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  todayLabel: {
    fontFamily: "Outfit",
    fontSize: 13,
    fontWeight: "600",
    color: "#28221B",
  },
  earningsAmount: {
    fontFamily: "Domine",
    fontSize: 38,
    fontWeight: "700",
    color: "#28221B",
    marginTop: 2,
  },
  pillRow: {
    flexDirection: "row",
    marginTop: 14,
    gap: 10,
  },
  pill: {
    backgroundColor: "#F3EDEA",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  pillText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#28221B",
  },

  lessonItem: {
    paddingVertical: 4,
  },
  lessonActions: {
    marginTop: 4,
  },
  lessonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  seeMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 2,
  },
  seeMoreText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#FF9E6D",
    fontWeight: "600",
  },
  countBadge: {
    backgroundColor: "#FF9E6D",
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: {
    fontFamily: "Outfit",
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFBFA",
  },
  studentCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFBFA",
    padding: 12,
    borderRadius: 14,
    marginBottom: 10,
    shadowColor: "#28221B",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  studentName: {
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "700",
    color: "#28221B",
  },
  studentMeta: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
    marginTop: 2,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#28221B",
    marginRight: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#FF9E6D",
    borderColor: "#FF9E6D",
  },
  lessonName: {
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "600",
    color: "#28221B",
  },
  lessonDate: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    marginTop: 2,
  },
  startCallBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FF9E6D",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    marginTop: 12,
  },
  startCallText: {
    color: "#FFFBFA",
    fontFamily: "Outfit",
    fontSize: 13,
    fontWeight: "700",
  },
  cancelBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#DD8153",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    marginTop: 8,
    marginBottom: 6,
  },
  cancelText: {
    color: "#FFFBFA",
    fontFamily: "Outfit",
    fontSize: 13,
    fontWeight: "600",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  roomBlockedText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#A8624E",
    marginTop: 8,
    marginBottom: 6,
  },
  reschedulePill: {
    alignSelf: "flex-start",
    marginTop: 4,
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#FFFBFA",
    fontWeight: "600",
    backgroundColor: "#DD8153",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: "hidden",
  },
  emptyHint: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#A89080",
    marginVertical: 6,
  },
  lessonStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  lessonStatLabel: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#7E6D66",
  },
  lessonStatValue: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
  },
  divider: {
    height: 1,
    backgroundColor: "#EFE6E1",
  },

  reviewCard: {
    backgroundColor: "#FFFBFA",
    padding: 14,
    borderRadius: 14,
    marginTop: 12,
    shadowColor: "#28221B",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  avatarText: {
    fontFamily: "Outfit",
    fontSize: 13,
    fontWeight: "700",
    color: "#28221B",
  },
  reviewName: {
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "700",
    color: "#28221B",
  },
  reviewWhen: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
  },
  reviewText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    marginBottom: 8,
  },
  messageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FF9E6D",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    marginLeft: 8,
  },
  messageBtnText: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#FFFBFA",
    fontWeight: "600",
  },
});

import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { useUser } from "@/contexts/user-context";
import { listTutors } from "@/services/tutors";
import {
  listMySessions,
  listMyCredits,
  getDailyRoom,
} from "@/services/sessions";
import { getStudentPayments } from "@/services/payments";
import { getStudentReviews } from "@/services/reviews";
import { buildMediaUrl } from "@/services/api";
import { LANGUAGES, findLanguageById } from "@/constants/languages";

const ROOM_WINDOW_MINUTES = 30;

function minutesUntil(dateString) {
  if (!dateString) return Number.POSITIVE_INFINITY;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
  return (d.getTime() - Date.now()) / 60000;
}

// Avatar palette — picked deterministically from the user's name so each
// tutor always lands on the same background color across screens.
const AVATAR_COLORS = ["#E8C9B6", "#C7B6A6", "#D9C2B3", "#B6CFD2", "#FFC09F", "#E0BAA5"];

function initialsOf(name) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function colorForName(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default function StudentDashboard() {
  const { focus } = useLocalSearchParams();
  const { savedTutorIds, toggleSavedTutor, profile, user } = useUser();
  const searchInputRef = useRef(null);
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  // Default the language filter to whatever the student picked at signup
  // (e.g. an English learner only sees English tutors until they clear it).
  const [selectedLang, setSelectedLang] = useState(profile.language || null);
  const [tutors, setTutors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [upcomingSessions, setUpcomingSessions] = useState([]);
  const [pendingReviews, setPendingReviews] = useState([]);
  const [credits, setCredits] = useState([]);
  const [duePayments, setDuePayments] = useState([]);
  const [studentReviews, setStudentReviews] = useState([]);
  const [creditsModalVisible, setCreditsModalVisible] = useState(false);

  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const upcomingHidden = searchFocused || search.length > 0;
  const upcomingAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(upcomingAnim, {
      toValue: upcomingHidden ? 0 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [upcomingHidden, upcomingAnim]);

  useEffect(() => {
    if (focus === "search") {
      const t = setTimeout(() => searchInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [focus]);

  // Sync the chip selection when the student's profile language loads after
  // the initial render (e.g. on first sign-in or a fresh page reload).
  useEffect(() => {
    if (profile.language && selectedLang === null) {
      setSelectedLang(profile.language);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.language]);

  const loadTutors = useCallback(async () => {
    setLoading(true);
    try {
      const lang = selectedLang ? LANGUAGES.find((l) => l.name === selectedLang) : null;
      const result = await listTutors({
        language_id: lang?.id,
        limit: 50,
        offset: 0,
      });
      setTutors(result?.items || []);
    } catch {
      setTutors([]);
    } finally {
      setLoading(false);
    }
  }, [selectedLang]);

  useEffect(() => {
    loadTutors();
  }, [loadTutors]);

  // Re-fetch the user's sessions every time the dashboard regains focus —
  // critical so the newly-booked lesson appears immediately after the user
  // returns from /confirm-payment. The previous useEffect only fired once on
  // mount, which is why bookings looked silent on the dashboard.
  const loadSessions = useCallback(async () => {
    try {
      const studentId = user?.student_id;
      const [sessions, creditList, reviews, payments] = await Promise.all([
        listMySessions().catch(() => []),
        listMyCredits().catch(() => []),
        studentId
          ? getStudentReviews(studentId).catch(() => [])
          : Promise.resolve([]),
        studentId
          ? getStudentPayments(studentId).catch(() => null)
          : Promise.resolve(null),
      ]);
      const all = Array.isArray(sessions) ? sessions : [];
      const upcoming = all
        .filter((s) => s.status === "pending" || s.status === "confirmed")
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
      // Completed sessions where the student still owes a review — these
      // power the "Write a review" prompts directly on the dashboard so
      // students don't have to dig into the level tabs to find them.
      const pending = all
        .filter((s) => s.status === "completed" && !s.student_review_done)
        .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));
      setUpcomingSessions(upcoming);
      setPendingReviews(pending);
      setCredits(Array.isArray(creditList) ? creditList : []);
      setStudentReviews(Array.isArray(reviews) ? reviews : []);
      setDuePayments(
        Array.isArray(payments?.course_payments)
          ? payments.course_payments.filter(
              (p) => p.payment_due_now && Number(p.amount_due_now || 0) > 0,
            )
          : [],
      );
    } catch {
      setUpcomingSessions([]);
      setPendingReviews([]);
      setCredits([]);
      setDuePayments([]);
      setStudentReviews([]);
    }
  }, [user?.student_id]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        await loadSessions();
        if (cancelled) return;
      })();
      return () => {
        cancelled = true;
      };
    }, [loadSessions]),
  );

  // Auto-generate the Daily room as soon as we're inside the 30-minute
  // pre-call window. The first side to land here creates it; the other side
  // picks up the URL on its next refresh. This is what makes "Join call"
  // appear automatically for both parties without anyone tapping a button.
  // A ref (not state) tracks attempts so a successful fetch doesn't itself
  // retrigger the effect.
  const autoFetchedRef = useRef({});
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
          // Already marked attempted; backend will retry later if needed.
        }
      }
      if (!cancelled && anySucceeded) await loadSessions();
    })();
    return () => {
      cancelled = true;
    };
  }, [upcomingSessions, loadSessions]);

  const filteredTutors = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tutors;
    return tutors.filter((tutor) => {
      const lang = findLanguageById(tutor.language_id);
      const haystack = `${tutor.full_name || ""} ${lang?.name || tutor.language_name || ""} ${
        tutor.max_level || ""
      }`.toLowerCase();
      return haystack.includes(term);
    });
  }, [tutors, search]);

  const FILTERS = ["Spanish", "French", "German", "Korean", "Italian", "English"];

  const formatUpcomingSession = (session) => {
    const d = new Date(session.scheduled_at);
    if (Number.isNaN(d.getTime())) return null;
    return {
      label: `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
      level: session.level,
      language:
        findLanguageById(session.language_id)?.name || profile.language || "Language",
    };
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Student Dashboard</Text>
        <TouchableOpacity
          style={styles.savedBtn}
          onPress={() => router.push("/saved-tutors")}
        >
          <Ionicons name="bookmark" size={16} color="#FF9E6D" />
          <Text style={styles.savedBtnText}>Saved</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={18} color="#7E6D66" />
        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          placeholder="Search for tutors or languages"
          placeholderTextColor="#7E6D66"
          value={search}
          onChangeText={setSearch}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />
        {search.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              setSearch("");
              searchInputRef.current?.blur();
            }}
          >
            <Ionicons name="close" size={18} color="#28221B" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.chipsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContent}
        >
          {FILTERS.map((lang) => {
            const active = selectedLang === lang;
            return (
              <TouchableOpacity
                key={lang}
                style={[styles.chip, active && styles.activeChip]}
                onPress={() => setSelectedLang(active ? null : lang)}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {lang}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 90 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.tutorsHeader}>
          {selectedLang ? `${selectedLang} tutors` : "Tutors"}
        </Text>

        {loading ? (
          <ActivityIndicator color="#FF9E6D" style={{ marginVertical: 28 }} />
        ) : filteredTutors.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="search" size={28} color="#A89080" />
            <Text style={styles.emptyTitle}>No tutors found</Text>
            <Text style={styles.emptyText}>
              Try a different name, language, or clear your filter.
            </Text>
            {(search.length > 0 || selectedLang) && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => {
                  setSearch("");
                  setSelectedLang(null);
                }}
              >
                <Text style={styles.clearBtnText}>Clear filters</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 12 }}
          >
            {filteredTutors.map((tutor) => {
              const saved = savedTutorIds.includes(tutor.id);
              const lang = findLanguageById(tutor.language_id);
              const photoUrl = buildMediaUrl(tutor.profile_photo);
              const price =
                tutor.hourly_rate !== null && tutor.hourly_rate !== undefined
                  ? `€${Number(tutor.hourly_rate).toFixed(0)}/hr`
                  : "";
              return (
                <TouchableOpacity
                  key={tutor.id}
                  style={styles.card}
                  onPress={() =>
                    router.push({
                      pathname: "/tutor-profile-student",
                      params: { tutorId: String(tutor.id) },
                    })
                  }
                >
                  {photoUrl ? (
                    <Image source={{ uri: photoUrl }} style={styles.image} />
                  ) : (
                    <View
                      style={[
                        styles.image,
                        { backgroundColor: colorForName(tutor.full_name) },
                      ]}
                    >
                      <Text style={styles.imageInitials}>
                        {initialsOf(tutor.full_name)}
                      </Text>
                    </View>
                  )}

                  <Text style={styles.tutorName}>
                    {tutor.full_name}
                    {price ? ` · ${price}` : ""}
                  </Text>

                  <Text style={styles.language}>
                    {lang?.name || tutor.language_name || ""} {tutor.max_level || ""}
                  </Text>

                  <View style={styles.cardBottom}>
                    <TouchableOpacity
                      style={styles.likeWrap}
                      onPress={(e) => {
                        if (e && e.stopPropagation) e.stopPropagation();
                        router.push({
                          pathname: "/chat",
                          params: {
                            userId: String(tutor.user_id),
                            name: tutor.full_name || "Tutor",
                            color: colorForName(tutor.full_name),
                          },
                        });
                      }}
                      hitSlop={6}
                    >
                      <Ionicons
                        name="chatbubble-outline"
                        size={18}
                        color="#DD8153"
                      />
                      <Text style={styles.likeCount}>
                        {tutor.is_verified ? "✓" : ""}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={(e) => {
                        // Don't bubble up to the card's onPress (which would
                        // navigate to the tutor profile).
                        if (e && e.stopPropagation) e.stopPropagation();
                        toggleSavedTutor(tutor.id);
                      }}
                      hitSlop={6}
                    >
                      <Ionicons
                        name={saved ? "bookmark" : "bookmark-outline"}
                        size={20}
                        color={saved ? "#FF9E6D" : "#DD8153"}
                      />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <Animated.View
          pointerEvents={upcomingHidden ? "none" : "auto"}
          style={[
            {
              opacity: upcomingAnim,
              transform: [
                {
                  translateY: upcomingAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-12, 0],
                  }),
                },
              ],
              overflow: "hidden",
            },
            upcomingHidden && styles.upcomingCollapsed,
          ]}
        >
          {credits.length > 0 ? (
            <TouchableOpacity
              style={styles.balanceCard}
              onPress={() => setCreditsModalVisible(true)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.balanceLabel}>Your balance</Text>
                <Text style={styles.balanceAmount}>
                  €{credits
                    .reduce((sum, c) => sum + Number(c.amount_paid || 0), 0)
                    .toFixed(2)}
                </Text>
                <Text style={styles.balanceHint}>
                  {credits.length} paid lesson{credits.length === 1 ? "" : "s"} from a tutor-cancelled session — tap to pick which one to use.
                </Text>
              </View>
              <View style={styles.balanceIcon}>
                <Ionicons name="gift-outline" size={18} color="#FFFBFA" />
              </View>
            </TouchableOpacity>
          ) : null}

          {duePayments.length > 0 ? (
            duePayments.slice(0, 2).map((payment) => (
              <TouchableOpacity
                key={payment.id}
                style={styles.duePaymentCard}
                onPress={() =>
                  router.push({
                    pathname: "/confirm-payment",
                    params: {
                      payCoursePaymentId: String(payment.id),
                      studentId: String(user?.student_id || ""),
                      plan: String(payment.payment_plan || "80_20"),
                      total: String(payment.amount_due_now || payment.amount_left || 0),
                    },
                  })
                }
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.balanceLabel}>Payment due</Text>
                  <Text style={styles.balanceAmount}>
                    €{Number(payment.amount_due_now || payment.amount_left || 0).toFixed(2)}
                  </Text>
                  <Text style={styles.balanceHint}>
                    Final {payment.payment_plan === "80_20" ? "20%" : "installment"} for {payment.level}
                  </Text>
                </View>
                <View style={styles.balanceIcon}>
                  <Ionicons name="card-outline" size={18} color="#FFFBFA" />
                </View>
              </TouchableOpacity>
            ))
          ) : null}

          {pendingReviews.length > 0 ? (
            <>
              <View style={[styles.lessonHeader, { marginTop: 18 }]}>
                <Text style={styles.sectionTitle}>Pending reviews</Text>
              </View>
              {pendingReviews.slice(0, 3).map((session) => {
                const d = new Date(session.scheduled_at);
                const when = Number.isNaN(d.getTime())
                  ? ""
                  : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
                return (
                  <TouchableOpacity
                    key={session.id}
                    style={styles.pendingReviewCard}
                    onPress={() =>
                      router.push({
                        pathname: "/student-write-review",
                        params: { sessionId: String(session.id) },
                      })
                    }
                  >
                    <View style={styles.pendingReviewIcon}>
                      <Ionicons name="star-outline" size={18} color="#FFFBFA" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pendingReviewTitle}>
                        {findLanguageById(session.language_id)?.name ||
                          profile.language ||
                          "Language"}{" "}
                        Lesson · {session.level}
                      </Text>
                      <Text style={styles.pendingReviewSub}>
                        {when} · tap to rate your tutor
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#DD8153" />
                  </TouchableOpacity>
                );
              })}
            </>
          ) : null}

          <View style={styles.lessonHeader}>
            <Text style={styles.sectionTitle}>Upcoming Lessons</Text>

            <TouchableOpacity onPress={() => router.push("/student-lessons")}>
              <View style={styles.arrowBtn}>
                <Ionicons name="chevron-forward" size={22} color="#FFFBFA" />
              </View>
            </TouchableOpacity>
          </View>

          {upcomingSessions.length > 0 ? (
            upcomingSessions.map((session) => {
              const next = formatUpcomingSession(session);
              if (!next) return null;
              const reschedulePending = !!session.rescheduled;
              const roomReady = !!session.daily_room_url && !reschedulePending;
              return (
                <View key={session.id} style={styles.lessonItem}>
                  <TouchableOpacity
                    style={styles.lessonRow}
                    onPress={() =>
                      router.push({
                        pathname: "/student-lesson-detail",
                        params: { sessionId: String(session.id) },
                      })
                    }
                  >
                    <Ionicons name="ellipse-outline" size={20} color="#d48d3b" />
                    <View style={{ marginLeft: 12 }}>
                      <Text style={styles.lessonTitle}>
                        {next.language} Lesson · {next.level}
                      </Text>
                      <Text style={styles.lessonSub}>{next.label}</Text>
                      {reschedulePending ? (
                        <Text style={styles.reschedulePill}>
                          Reschedule pending
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>

                  <View style={styles.lessonActionRow}>
                    {reschedulePending ? (
                      <Text style={styles.roomPendingText}>
                        Video room closed while reschedule is pending
                      </Text>
                    ) : roomReady ? (
                      <TouchableOpacity
                        style={styles.lessonJoinBtn}
                        onPress={() =>
                          router.push({
                            pathname: "/videocall",
                            params: { sessionId: String(session.id) },
                          })
                        }
                      >
                        <Ionicons name="videocam" size={14} color="#FFFBFA" />
                        <Text style={styles.lessonJoinText}>Join call</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.roomPendingText}>
                        This room will be created soon
                      </Text>
                    )}

                    <TouchableOpacity
                      style={styles.lessonActionBtn}
                      onPress={() =>
                        router.push({
                          pathname: "/cancel-session",
                          params: { sessionId: String(session.id) },
                        })
                      }
                    >
                      <Text style={styles.lessonActionText}>
                        Reschedule or cancel
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.emptyHint}>No upcoming lessons.</Text>
          )}

          <View style={[styles.lessonHeader, { marginTop: 26 }]}>
            <Text style={styles.sectionTitle}>Reviews from tutors</Text>
          </View>

          {studentReviews.length === 0 ? (
            <Text style={styles.emptyHint}>
              No reviews yet — tutors can leave feedback as soon as a lesson ends.
            </Text>
          ) : (
            studentReviews.slice(0, 5).map((review) => {
              const when = (() => {
                if (!review.created_at) return "";
                const d = new Date(review.created_at);
                if (Number.isNaN(d.getTime())) return "";
                const diff = Date.now() - d.getTime();
                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                if (days <= 0) return "today";
                if (days === 1) return "1 day ago";
                if (days < 7) return `${days} days ago`;
                const weeks = Math.floor(days / 7);
                return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
              })();
              return (
                <View key={review.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reviewerName}>
                        {review.reviewer_name || "Tutor"}
                      </Text>
                      <Text style={styles.reviewMeta}>
                        {when}
                        {when ? " · " : ""}
                        {"★".repeat(review.rating || 0)}
                      </Text>
                    </View>
                  </View>
                  {review.comment ? (
                    <Text style={styles.reviewBody}>{review.comment}</Text>
                  ) : null}
                </View>
              );
            })
          )}
        </Animated.View>
      </ScrollView>

      <Modal
        visible={creditsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCreditsModalVisible(false)}
      >
        <Pressable
          style={styles.creditsOverlay}
          onPress={() => setCreditsModalVisible(false)}
        >
          <Pressable style={styles.creditsSheet} onPress={() => {}}>
            <Text style={styles.creditsTitle}>Your balance</Text>
            <Text style={styles.creditsSubtitle}>
              Pick a paid lesson to rebook for free.
            </Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {credits.map((credit) => {
                const lang = findLanguageById(credit.language_id);
                return (
                  <TouchableOpacity
                    key={credit.course_payment_id}
                    style={styles.creditRow}
                    onPress={() => {
                      setCreditsModalVisible(false);
                      router.push({
                        pathname: "/tutor-profile-student",
                        params: {
                          tutorId: String(credit.teacher_id),
                          teacherId: String(credit.teacher_id),
                          coursePaymentId: String(credit.course_payment_id),
                          creditLevel: credit.level,
                        },
                      });
                    }}
                  >
                    <View style={styles.creditIcon}>
                      <Ionicons name="gift-outline" size={18} color="#FFFBFA" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.creditTutor}>
                        {credit.teacher_name || "Tutor"}
                      </Text>
                      <Text style={styles.creditMeta}>
                        {lang?.name || profile.language || "Language"} ·{" "}
                        {credit.level} · {credit.total_hours}h ·{" "}
                        €{Number(credit.price_per_hour || 0).toFixed(0)}/hr
                      </Text>
                      <Text style={styles.creditAmount}>
                        Credit: €{Number(credit.amount_paid || 0).toFixed(2)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#DD8153" />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.creditsClose}
              onPress={() => setCreditsModalVisible(false)}
            >
              <Text style={styles.creditsCloseText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <StudentBottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFBFA",
    paddingTop: 50,
    paddingHorizontal: 18,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  header: {
    fontFamily: "Domine",
    fontSize: 16,
    color: "#28221B",
  },

  savedBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF1E8",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  savedBtnText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#FF9E6D",
    fontWeight: "600",
  },

  searchBox: {
    height: 38,
    backgroundColor: "#F1E5E1",
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 14,
  },

  searchInput: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 12,
    marginLeft: 8,
    color: "#28221B",
  },

  chipsRow: {
    height: 40,
    marginBottom: 14,
  },

  chipsContent: {
    alignItems: "center",
    paddingRight: 12,
  },

  chip: {
    height: 28,
    backgroundColor: "#F1E5E1",
    paddingHorizontal: 14,
    borderRadius: 14,
    marginRight: 8,
    justifyContent: "center",
    alignItems: "center",
  },

  activeChip: {
    backgroundColor: "#FF9E6D",
  },

  chipText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#28221B",
  },

  chipTextActive: {
    color: "#FFFBFA",
    fontWeight: "600",
  },

  tutorsHeader: {
    fontFamily: "Domine",
    fontSize: 16,
    color: "#28221B",
    marginBottom: 10,
  },

  card: {
    width: 200,
    backgroundColor: "#FFFBFA",
    borderWidth: 1,
    borderColor: "#F0EDEA",
    borderRadius: 14,
    marginRight: 12,
    paddingBottom: 12,
    overflow: "hidden",
  },

  image: {
    width: "100%",
    height: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  imageInitials: {
    fontFamily: "Domine",
    fontSize: 36,
    fontWeight: "700",
    color: "#28221B",
  },

  tutorName: {
    fontFamily: "Outfit",
    fontSize: 13,
    fontWeight: "600",
    margin: 10,
    marginBottom: 2,
    color: "#28221B",
  },

  language: {
    fontFamily: "Outfit",
    fontSize: 12,
    marginHorizontal: 10,
    color: "#7E6D66",
  },

  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingHorizontal: 10,
  },

  likeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  likeCount: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#28221B",
  },

  emptyBox: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 24,
    backgroundColor: "#FFF1E8",
    borderRadius: 14,
    marginBottom: 18,
  },

  emptyTitle: {
    fontFamily: "Domine",
    fontSize: 14,
    color: "#28221B",
    marginTop: 8,
  },

  emptyText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    textAlign: "center",
    marginTop: 4,
  },

  clearBtn: {
    marginTop: 12,
    backgroundColor: "#FF9E6D",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },

  clearBtnText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  lessonHeader: {
    marginTop: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  upcomingCollapsed: {
    height: 0,
  },

  sectionTitle: {
    fontFamily: "Domine",
    fontSize: 20,
    color: "#28221B",
  },

  arrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  balanceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "#FFF1E8",
    marginTop: 12,
    marginBottom: 6,
  },

  duePaymentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "#F3EDEA",
    borderWidth: 1,
    borderColor: "#FF9E6D",
    marginTop: 12,
    marginBottom: 6,
  },

  balanceLabel: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
  },

  balanceAmount: {
    fontFamily: "Domine",
    fontSize: 22,
    fontWeight: "700",
    color: "#28221B",
    marginTop: 2,
  },

  balanceHint: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
    marginTop: 4,
    lineHeight: 14,
  },

  balanceIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FF9E6D",
    alignItems: "center",
    justifyContent: "center",
  },

  pendingReviewCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#FFF1E8",
    marginTop: 10,
  },
  pendingReviewIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FF9E6D",
    alignItems: "center",
    justifyContent: "center",
  },
  pendingReviewTitle: {
    fontFamily: "Outfit",
    fontSize: 13,
    fontWeight: "700",
    color: "#28221B",
  },
  pendingReviewSub: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
    marginTop: 2,
  },

  creditsOverlay: {
    flex: 1,
    backgroundColor: "rgba(40, 34, 27, 0.45)",
    justifyContent: "flex-end",
  },
  creditsSheet: {
    backgroundColor: "#FFFBFA",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingVertical: 22,
    paddingHorizontal: 22,
    paddingBottom: 28,
  },
  creditsTitle: {
    fontFamily: "Domine",
    fontSize: 18,
    color: "#28221B",
    textAlign: "center",
  },
  creditsSubtitle: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  creditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#FFF1E8",
    marginBottom: 10,
  },
  creditIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FF9E6D",
    alignItems: "center",
    justifyContent: "center",
  },
  creditTutor: {
    fontFamily: "Outfit",
    fontSize: 13,
    fontWeight: "700",
    color: "#28221B",
  },
  creditMeta: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
    marginTop: 2,
  },
  creditAmount: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#DD8153",
    fontWeight: "700",
    marginTop: 2,
  },
  creditsClose: {
    marginTop: 8,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F3EDEA",
    alignItems: "center",
    justifyContent: "center",
  },
  creditsCloseText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    fontWeight: "600",
  },

  reviewCard: {
    backgroundColor: "#FFFBFA",
    padding: 12,
    borderRadius: 14,
    marginTop: 10,
    shadowColor: "#28221B",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },

  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },

  reviewerName: {
    fontFamily: "Outfit",
    fontSize: 13,
    fontWeight: "700",
    color: "#28221B",
  },

  reviewMeta: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
    marginTop: 2,
  },

  reviewBody: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#28221B",
    lineHeight: 16,
  },

  lessonItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#DDD",
    paddingBottom: 14,
    marginTop: 4,
  },

  lessonActionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    marginLeft: 32,
  },

  lessonActionBtn: {
    backgroundColor: "#DD8153",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },

  lessonJoinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FF9E6D",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },

  lessonJoinText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  roomPendingText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    fontStyle: "italic",
  },
  reschedulePill: {
    alignSelf: "flex-start",
    marginTop: 6,
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

  lessonActionText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  lessonRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
  },

  lessonTitle: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
  },

  lessonSub: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#28221B",
    marginTop: 4,
  },

  emptyHint: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#A89080",
    marginTop: 12,
  },
});

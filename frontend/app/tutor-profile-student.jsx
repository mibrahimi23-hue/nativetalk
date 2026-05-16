import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { useUser } from "@/contexts/user-context";
import { safeBack } from "@/hooks/use-safe-back";
import { getTutor, getTutorAvailability } from "@/services/tutors";
import { getTeacherReviews } from "@/services/reviews";
import { getStudentPayments } from "@/services/payments";
import { buildMediaUrl } from "@/services/api";
import { findLanguageById } from "@/constants/languages";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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
  if (weeks < 5) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

function timeRangeShort(start, end) {
  const fmt = (t) => {
    const [hh, mm] = String(t).split(":");
    const h = Number(hh);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = ((h + 11) % 12) + 1;
    return mm === "00" ? `${h12} ${period}` : `${h12}:${mm} ${period}`;
  };
  return `${fmt(start)} - ${fmt(end)}`;
}

function fmtTimeShort(date) {
  if (!date || Number.isNaN(date.getTime?.())) return "";
  try {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

// Compute the IANA timezone offset (in minutes) at a given UTC date. Used to
// translate a wall-clock time in the tutor's timezone into a true UTC moment.
function tzOffsetMin(date, timeZone) {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = dtf.formatToParts(date).reduce((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
    const asUTC = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour === "24" ? "00" : parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return (asUTC - date.getTime()) / 60000;
  } catch {
    return 0;
  }
}

function tutorWallToUtc(year, month, day, hour, minute, tutorTz) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = tzOffsetMin(guess, tutorTz);
  return new Date(guess.getTime() - offset * 60000);
}

function fmtInTimezone(date, tz) {
  try {
    return date.toLocaleString([], {
      timeZone: tz,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return `${date.toLocaleDateString([], { weekday: "short" })} ${fmtTimeShort(date)}`;
  }
}

// Convert a weekly recurring slot (day-of-week + start_time + end_time in the
// source timezone) into a "Mon 9:00 AM - 5:00 PM" label rendered in any
// display timezone. Used by the Availability summary table so each row shows
// the same actual interval, once in the tutor's timezone and once in the
// student's.
function formatSlotRange(slot, displayTz, sourceTz) {
  const dow = Number(slot.day_of_week);
  if (!Number.isFinite(dow)) return "";
  const [sh, sm] = String(slot.start_time || "00:00").split(":").map(Number);
  const [eh, em] = String(slot.end_time || "00:00").split(":").map(Number);

  const now = new Date();
  let base = null;
  for (let offset = 0; offset < 14; offset++) {
    const day = new Date(now);
    day.setDate(now.getDate() + offset);
    const jsDayMon0 = (day.getDay() + 6) % 7;
    if (jsDayMon0 === dow) {
      base = day;
      break;
    }
  }
  if (!base) return "";

  const startUtc = tutorWallToUtc(
    base.getFullYear(),
    base.getMonth() + 1,
    base.getDate(),
    sh || 0,
    sm || 0,
    sourceTz,
  );
  const endUtc = tutorWallToUtc(
    base.getFullYear(),
    base.getMonth() + 1,
    base.getDate(),
    eh || 0,
    em || 0,
    sourceTz,
  );
  if (Number.isNaN(startUtc.getTime()) || Number.isNaN(endUtc.getTime())) return "";

  try {
    const dayName = startUtc.toLocaleDateString([], {
      timeZone: displayTz,
      weekday: "short",
    });
    const startLabel = startUtc.toLocaleTimeString([], {
      timeZone: displayTz,
      hour: "numeric",
      minute: "2-digit",
    });
    const endLabel = endUtc.toLocaleTimeString([], {
      timeZone: displayTz,
      hour: "numeric",
      minute: "2-digit",
    });
    return `${dayName} ${startLabel} - ${endLabel}`;
  } catch {
    return "";
  }
}

// Expand the tutor's weekly availability into concrete bookable slots for the
// next 14 days. We compute the precise UTC moment for each slot using the
// tutor's stored timezone, then format two labels: one in the tutor's local
// time and one in the student's local time so the student sees both.
function expandSlots(availability, studentTz) {
  if (!Array.isArray(availability) || availability.length === 0) return [];
  const now = new Date();
  const out = [];

  for (const slot of availability) {
    const dow = Number(slot.day_of_week);
    if (!Number.isFinite(dow)) continue;
    const tutorTz = slot.timezone || studentTz || "UTC";
    const [sh, sm] = String(slot.start_time || "00:00").split(":").map(Number);

    for (let offset = 0; offset < 14; offset++) {
      const day = new Date(now);
      day.setDate(now.getDate() + offset);
      const jsDayMon0 = (day.getDay() + 6) % 7;
      if (jsDayMon0 !== dow) continue;

      const utcMoment = tutorWallToUtc(
        day.getFullYear(),
        day.getMonth() + 1,
        day.getDate(),
        sh || 0,
        sm || 0,
        tutorTz,
      );
      if (Number.isNaN(utcMoment.getTime())) continue;
      if (utcMoment.getTime() < now.getTime()) continue;

      out.push({
        id: `${slot.id}-${day.toISOString().slice(0, 10)}`,
        tutorTz,
        studentTz,
        startUtc: utcMoment.toISOString(),
        endUtc: new Date(utcMoment.getTime() + 60 * 60 * 1000).toISOString(),
        tutorLabel: fmtInTimezone(utcMoment, tutorTz),
        studentLabel: fmtInTimezone(utcMoment, studentTz),
      });
    }
  }
  out.sort((a, b) => new Date(a.startUtc) - new Date(b.startUtc));
  return out.slice(0, 12);
}

export default function TutorProfileStudent() {
  const params = useLocalSearchParams();
  const { tutorId } = params;
  const { savedTutorIds, toggleSavedTutor, profile, user } = useUser();

  const [tutor, setTutor] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [coveredCoursePayment, setCoveredCoursePayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSlotId, setSelectedSlotId] = useState(null);

  const studentTz =
    profile.timezone ||
    (typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC") ||
    "UTC";

  const bookableSlots = useMemo(
    () => expandSlots(availability, studentTz),
    [availability, studentTz],
  );

  const selectedSlot = useMemo(
    () => bookableSlots.find((s) => s.id === selectedSlotId) || null,
    [bookableSlots, selectedSlotId],
  );

  const load = useCallback(async () => {
    if (!tutorId) return;
    setLoading(true);
    try {
      const [t, r, a] = await Promise.all([
        getTutor(tutorId).catch(() => null),
        getTeacherReviews(tutorId).catch(() => []),
        getTutorAvailability(tutorId).catch(() => []),
      ]);
      setTutor(t);
      setReviews(Array.isArray(r) ? r : []);
      setAvailability(Array.isArray(a) ? a : []);
      if (t && user?.student_id) {
        const payments = await getStudentPayments(user.student_id).catch(() => null);
        const course = Array.isArray(payments?.course_payments)
          ? payments.course_payments.find((cp) => {
              const sameTutor = String(cp.teacher_id) === String(t.id);
              const sameLanguage = Number(cp.language_id) === Number(t.language_id);
              const sameLevel = String(cp.level) === String(t.max_level || "A1");
              const planCovered = cp.payment_plan === "80_20" || cp.payment_plan === "50_50";
              const hasRemainingHours =
                Number(cp.booked_sessions || 0) < Number(cp.total_hours || 0);
              return (
                sameTutor &&
                sameLanguage &&
                sameLevel &&
                planCovered &&
                hasRemainingHours &&
                cp.payment_due_now === false
              );
            })
          : null;
        setCoveredCoursePayment(course || null);
      } else {
        setCoveredCoursePayment(null);
      }
    } finally {
      setLoading(false);
    }
  }, [tutorId, user?.student_id]);

  useEffect(() => {
    load();
  }, [load]);

  const saved = tutor ? savedTutorIds.includes(tutor.id) : false;
  const avgRating = useMemo(() => {
    if (!reviews.length) return 0;
    const total = reviews.reduce((sum, r) => sum + (r.rating || 0), 0);
    return Number((total / reviews.length).toFixed(1));
  }, [reviews]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#FF9E6D" />
      </View>
    );
  }
  if (!tutor) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Tutor not found.</Text>
      </View>
    );
  }

  const language = findLanguageById(tutor.language_id);
  const price =
    tutor.hourly_rate !== null && tutor.hourly_rate !== undefined
      ? `€${Number(tutor.hourly_rate).toFixed(0)}/hr`
      : "";

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 90 }}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
            <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Tutor Profile</Text>

          <TouchableOpacity
            style={styles.saveIconBtn}
            onPress={() => toggleSavedTutor(tutor.id)}
          >
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={20}
              color="#FF9E6D"
            />
          </TouchableOpacity>
        </View>

        {buildMediaUrl(tutor.profile_photo) ? (
          <Image
            source={{ uri: buildMediaUrl(tutor.profile_photo) }}
            style={styles.avatar}
          />
        ) : (
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: colorForName(tutor.full_name),
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Text style={styles.avatarInitials}>
              {initialsOf(tutor.full_name)}
            </Text>
          </View>
        )}

        <Text style={styles.name}>{tutor.full_name}</Text>
        <Text style={styles.level}>
          {language?.name || tutor.language_name || ""} {tutor.max_level || ""}
        </Text>
        {tutor.bio ? <Text style={styles.bio}>{tutor.bio}</Text> : null}

        <View style={styles.infoRow}>
          <Text style={styles.info}>{avgRating ? `${avgRating} ★` : "No rating"}</Text>
          <Text style={styles.info}>
            {reviews.length} review{reviews.length === 1 ? "" : "s"}
          </Text>
          {price ? <Text style={styles.info}>{price}</Text> : null}
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.bookBtn}
            onPress={() => {
              if (!selectedSlot) {
                Alert.alert(
                  "Pick a time first",
                  "Tap one of the tutor's available time slots below before booking.",
                );
                return;
              }
              // When the student is rebooking with a credit (CoursePayment id
              // forwarded from the dashboard credit banner), skip the PayPal
              // screen and go straight to confirm — no new payment needed.
              const reusableCoursePaymentId =
                params.coursePaymentId || coveredCoursePayment?.id;
              if (reusableCoursePaymentId) {
                router.push({
                  pathname: "/confirm-payment",
                  params: {
                    tutorId: String(tutor.id),
                    scheduledAt: selectedSlot.startUtc,
                    studentTz,
                    level: String(
                      params.creditLevel ||
                        coveredCoursePayment?.level ||
                        tutor.max_level ||
                        "A1",
                    ),
                    price:
                      coveredCoursePayment?.price_per_hour != null
                        ? String(coveredCoursePayment.price_per_hour)
                        : tutor.hourly_rate != null
                          ? String(tutor.hourly_rate)
                          : "",
                    hours: String(coveredCoursePayment?.total_hours || 30),
                    plan: coveredCoursePayment?.payment_plan || tutor.payment_plan || "hour_by_hour",
                    total: "0",
                    coursePaymentId: String(reusableCoursePaymentId),
                  },
                });
                return;
              }
              router.push({
                pathname: "/payment",
                params: {
                  tutorId: String(tutor.id),
                  scheduledAt: selectedSlot.startUtc,
                  studentTz,
                  level: tutor.max_level || "A1",
                  price: tutor.hourly_rate != null ? String(tutor.hourly_rate) : "",
                  hours: "30",
                  plan: tutor.payment_plan || "hour_by_hour",
                },
              });
            }}
          >
            <Text style={styles.bookText}>
              {params.coursePaymentId
                ? "Book with credit"
                : coveredCoursePayment
                  ? "Book included"
                  : "Book Now"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, saved && styles.saveBtnActive]}
            onPress={() => toggleSavedTutor(tutor.id)}
          >
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={16}
              color={saved ? "#FFFBFA" : "#FF9E6D"}
            />
            <Text
              style={[styles.saveBtnText, saved && styles.saveBtnTextActive]}
            >
              {saved ? "Saved" : "Save"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.reviewsHeader}>
          <Text style={styles.sectionTitle}>Reviews</Text>
          {avgRating ? <Text style={styles.reviewsAvg}>{avgRating} ★</Text> : null}
        </View>

        {reviews.length === 0 ? (
          <Text style={styles.emptyText}>No reviews yet.</Text>
        ) : (
          reviews.slice(0, 5).map((r) => (
            <View key={r.id} style={styles.reviewCard}>
              <View style={styles.reviewTop}>
                <View style={styles.reviewAvatar}>
                  <Text style={styles.reviewAvatarText}>
                    {(r.reviewer_name || "S").slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reviewName}>
                    {r.reviewer_name || "Student"}
                  </Text>
                  <Text style={styles.reviewWhen}>{relativeTime(r.created_at)}</Text>
                </View>
                <Text style={styles.reviewRating}>★ {Number(r.rating || 0).toFixed(1)}</Text>
              </View>
              {r.comment ? <Text style={styles.reviewText}>{r.comment}</Text> : null}
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Availability</Text>

        {availability.length === 0 ? (
          <Text style={styles.emptyText}>No availability set yet.</Text>
        ) : (
          <>
            {(() => {
              const tutorTz = availability[0]?.timezone || studentTz || "UTC";
              return (
                <View style={styles.tzHeader}>
                  <Text style={styles.tzHeaderText}>Tutor time ({tutorTz})</Text>
                  <Text style={styles.tzHeaderText}>Your time ({studentTz})</Text>
                </View>
              );
            })()}

            {/* Weekly summary — same interval converted into both timezones so
                the student sees what time the lesson lands locally. */}
            {availability.map((slot) => {
              const tutorTz = slot.timezone || studentTz || "UTC";
              return (
                <View key={slot.id} style={styles.tzRowSummary}>
                  <Text style={styles.tzRowText}>
                    {formatSlotRange(slot, tutorTz, tutorTz) ||
                      `${DAY_NAMES[slot.day_of_week] || ""}  ${timeRangeShort(slot.start_time, slot.end_time)}`}
                  </Text>
                  <Text style={styles.tzRowText}>
                    {formatSlotRange(slot, studentTz, tutorTz) || "—"}
                  </Text>
                </View>
              );
            })}

            <Text style={[styles.sectionTitle, { marginTop: 14 }]}>
              Pick a slot
            </Text>

            {bookableSlots.length === 0 ? (
              <Text style={styles.emptyText}>
                No slots in the next 14 days.
              </Text>
            ) : (
              bookableSlots.map((slot) => {
                const active = selectedSlotId === slot.id;
                return (
                  <TouchableOpacity
                    key={slot.id}
                    activeOpacity={0.8}
                    style={[styles.slotRow, active && styles.slotRowActive]}
                    onPress={() => setSelectedSlotId(slot.id)}
                  >
                    <Text
                      style={[
                        styles.slotText,
                        active && styles.slotTextActive,
                      ]}
                    >
                      {slot.tutorLabel}
                    </Text>
                    <Text
                      style={[
                        styles.slotText,
                        active && styles.slotTextActive,
                      ]}
                    >
                      {slot.studentLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </>
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
    paddingHorizontal: 20,
    paddingTop: 45,
  },
  center: {
    flex: 1,
    backgroundColor: "#FFFBFA",
    alignItems: "center",
    justifyContent: "center",
  },

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
    fontSize: 14,
    color: "#28221B",
  },

  saveIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFF1E8",
    justifyContent: "center",
    alignItems: "center",
  },

  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignSelf: "center",
    marginBottom: 10,
  },
  avatarInitials: {
    fontFamily: "Domine",
    fontSize: 32,
    fontWeight: "700",
    color: "#28221B",
  },

  name: {
    fontFamily: "Domine",
    fontSize: 18,
    textAlign: "center",
    color: "#28221B",
  },

  level: {
    fontFamily: "Outfit",
    fontSize: 13,
    textAlign: "center",
    color: "#28221B",
    marginTop: 2,
  },

  bio: {
    fontFamily: "Outfit",
    fontSize: 12,
    textAlign: "center",
    color: "#7E6D66",
    marginTop: 6,
    paddingHorizontal: 16,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 22,
    marginVertical: 10,
  },

  info: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#8D7C74",
  },

  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 22,
  },

  bookBtn: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  bookText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#FF9E6D",
    backgroundColor: "#FFFBFA",
  },

  saveBtnActive: {
    backgroundColor: "#FF9E6D",
  },

  saveBtnText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#FF9E6D",
    fontWeight: "600",
  },

  saveBtnTextActive: {
    color: "#FFFBFA",
  },

  sectionTitle: {
    fontFamily: "Domine",
    fontSize: 17,
    color: "#28221B",
    marginBottom: 12,
    marginTop: 8,
  },

  reviewsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 18,
  },

  reviewsAvg: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#FF9E6D",
    fontWeight: "700",
  },

  reviewCard: {
    backgroundColor: "#F8EFEC",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },

  reviewTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },

  reviewAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E0BAA5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  reviewAvatarText: {
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "700",
    color: "#28221B",
  },

  reviewName: {
    fontFamily: "Outfit",
    fontSize: 13,
    fontWeight: "700",
    color: "#28221B",
  },

  reviewWhen: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
  },

  reviewRating: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#FF9E6D",
    fontWeight: "700",
  },

  reviewText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    lineHeight: 18,
  },

  timeCards: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },

  timeCard: {
    flex: 1,
    backgroundColor: "#F8EFEC",
    borderRadius: 12,
    padding: 12,
  },

  timeTitle: {
    fontFamily: "Domine",
    fontSize: 12,
    textAlign: "center",
    color: "#28221B",
    marginBottom: 12,
  },

  timeLine: {
    height: 1,
    backgroundColor: "#EFE6E1",
    marginBottom: 10,
  },

  orangeLine: {
    height: 1,
    backgroundColor: "#FF9E6D",
    marginVertical: 6,
  },

  day: {
    fontFamily: "Domine",
    fontSize: 12,
    color: "#28221B",
  },

  time: {
    fontFamily: "Outfit",
    fontSize: 10,
    color: "#7E6D66",
  },

  emptyText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#A89080",
    textAlign: "center",
    marginVertical: 12,
  },

  tzHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#FFF1E8",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  tzHeaderText: {
    fontFamily: "Domine",
    fontSize: 12,
    color: "#28221B",
    flex: 1,
  },
  tzRowSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#F8EFEC",
    borderRadius: 8,
    marginBottom: 6,
  },
  tzRowText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#28221B",
    flex: 1,
  },
  tzRowSub: {
    fontFamily: "Outfit",
    fontSize: 10,
    color: "#7E6D66",
  },
  slotRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EFE6E1",
    marginBottom: 6,
    backgroundColor: "#FFFBFA",
  },
  slotRowActive: {
    backgroundColor: "#FF9E6D",
    borderColor: "#FF9E6D",
  },
  slotText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#28221B",
    flex: 1,
  },
  slotTextActive: {
    color: "#FFFBFA",
    fontWeight: "700",
  },
});

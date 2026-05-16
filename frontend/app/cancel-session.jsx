import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeBack } from "@/hooks/use-safe-back";
import { useUser } from "@/contexts/user-context";
import { cancelSession, getSession, listMySessions } from "@/services/sessions";
import { requestReschedule } from "@/services/reschedule";
import { getTutorAvailability } from "@/services/tutors";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_OFFSET = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };

const TIME_SLOTS = [
  { label: "9:00 AM to 11:00 AM", hour: 9 },
  { label: "11:00 AM to 1:00 PM", hour: 11 },
  { label: "1:00 PM to 3:00 PM", hour: 13 },
  { label: "3:00 PM to 5:00 PM", hour: 15 },
  { label: "5:00 PM to 7:00 PM", hour: 17 },
  { label: "7:00 PM to 9:00 PM", hour: 19 },
];

function nextDateForDay(targetDay, hour = 0) {
  // Picker is relative to *today's* date: picking the current weekday gives
  // today's date when the chosen hour is still in the future, otherwise the
  // same weekday next week. Other weekdays land on the next occurrence.
  const now = new Date();
  const target = DAY_OFFSET[targetDay];
  let dayDiff = ((target - now.getDay()) + 7) % 7;
  if (dayDiff === 0) {
    const todayAtHour = new Date(now);
    todayAtHour.setHours(hour, 0, 0, 0);
    if (todayAtHour <= now) dayDiff = 7;
  }
  const d = new Date(now);
  d.setDate(now.getDate() + dayDiff);
  d.setHours(hour, 0, 0, 0);
  return d;
}

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

function formatInTimezone(date, tz, opts = {}) {
  try {
    return date.toLocaleString([], { timeZone: tz, ...opts });
  } catch {
    return date.toLocaleString([], opts);
  }
}

function expandAvailabilitySlots(availability, studentTz, sessionId) {
  if (!Array.isArray(availability)) return [];
  const now = new Date();
  const out = [];
  for (const slot of availability) {
    const dow = Number(slot.day_of_week);
    if (!Number.isFinite(dow)) continue;
    const tutorTz = slot.timezone || studentTz || "UTC";
    const [sh, sm] = String(slot.start_time || "00:00").split(":").map(Number);
    for (let offset = 0; offset < 30; offset++) {
      const day = new Date(now);
      day.setDate(now.getDate() + offset);
      if (((day.getDay() + 6) % 7) !== dow) continue;
      const start = tutorWallToUtc(
        day.getFullYear(),
        day.getMonth() + 1,
        day.getDate(),
        sh || 0,
        sm || 0,
        tutorTz,
      );
      if (Number.isNaN(start.getTime()) || start <= now) continue;
      const dayKey = formatInTimezone(start, studentTz, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const dayLabel = formatInTimezone(start, studentTz, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const studentTime = formatInTimezone(start, studentTz, {
        hour: "numeric",
        minute: "2-digit",
      });
      const tutorTime = formatInTimezone(start, tutorTz, {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      });
      out.push({
        id: `${sessionId || "session"}-${slot.id}-${start.toISOString()}`,
        dayKey,
        dayLabel,
        label: `${studentTime} (${tutorTime} tutor time)`,
        startUtc: start.toISOString(),
      });
    }
  }
  return out.sort((a, b) => new Date(a.startUtc) - new Date(b.startUtc)).slice(0, 40);
}

export default function CancelSession() {
  const { sessionId, lessonId } = useLocalSearchParams();
  const safeBack = useSafeBack();
  const { user, profile, role } = useUser();
  const dashboardRoute =
    role === "Learner" ? "/student-dashboard" : "/tutor-dashboard";

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [day, setDay] = useState(null);
  const [timeSlot, setTimeSlot] = useState(null);
  const [availability, setAvailability] = useState([]);
  const [picker, setPicker] = useState(null);
  const [resultMessage, setResultMessage] = useState(null);
  const [resultTone, setResultTone] = useState("success");
  const [showDoneButton, setShowDoneButton] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const id = sessionId || lessonId;
      if (id) {
        const s = await getSession(id).catch(() => null);
        setSession(s);
        setAvailability(
          s?.teacher_id ? await getTutorAvailability(s.teacher_id).catch(() => []) : [],
        );
      } else {
        const sessions = await listMySessions().catch(() => []);
        const upcoming = (Array.isArray(sessions) ? sessions : [])
          .filter((s) => s.status === "pending" || s.status === "confirmed")
          .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0];
        setSession(upcoming || null);
        setAvailability(
          upcoming?.teacher_id
            ? await getTutorAvailability(upcoming.teacher_id).catch(() => [])
            : [],
        );
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId, lessonId]);

  useEffect(() => {
    load();
  }, [load]);

  const studentTz =
    profile.timezone ||
    user?.timezone ||
    (typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC") ||
    "UTC";
  const availableSlots = expandAvailabilitySlots(availability, studentTz, session?.id);
  const dayOptions = Array.from(
    new Map(availableSlots.map((slot) => [slot.dayKey, slot.dayLabel])).entries(),
  ).map(([key, label]) => ({ key, label }));
  const timeOptions = day
    ? availableSlots.filter((slot) => slot.dayKey === day)
    : [];
  const options =
    picker === "day"
      ? dayOptions.map((d) => d.label)
      : picker === "time"
        ? timeOptions.map((t) => t.label)
        : [];

  const choose = (val) => {
    if (picker === "day") {
      const found = dayOptions.find((d) => d.label === val);
      setDay(found?.key || null);
      setTimeSlot(null);
    }
    if (picker === "time") {
      const found = timeOptions.find((t) => t.label === val);
      if (found) setTimeSlot(found);
    }
    setPicker(null);
  };

  // Deadline policy mirrors the backend (24h before scheduled_at). When inside
  // that window the reschedule/cancel buttons are disabled with a hint.
  const lockedForChanges = (() => {
    if (!session?.scheduled_at) return false;
    const sch = new Date(session.scheduled_at);
    if (Number.isNaN(sch.getTime())) return false;
    return sch.getTime() - Date.now() < 24 * 60 * 60 * 1000;
  })();
  const alreadyRescheduled = !!session?.rescheduled;

  const showError = (msg) => {
    setResultTone("error");
    setResultMessage(msg);
  };

  const handleReschedule = async () => {
    if (lockedForChanges) {
      showError(
        "Too late to reschedule — must be at least 24 hours before the lesson.",
      );
      return;
    }
    if (alreadyRescheduled) {
      showError(
        "This lesson has been rescheduled once already. Contact the student to coordinate further changes.",
      );
      return;
    }
    if (!day || !timeSlot) {
      showError("Please select one of the tutor's available times.");
      return;
    }
    if (!session) {
      showError("No session selected.");
      return;
    }
    setBusy(true);
    setResultMessage(null);
    try {
      await requestReschedule({
        session_id: session.id,
        new_time: timeSlot.startUtc,
        reason: role === "Learner" ? "Student reschedule" : "Tutor reschedule",
        requested_by: user?.id,
        user_timezone: studentTz,
      });
      setResultTone("success");
      setResultMessage("This lesson is rescheduled successfully.");
      setShowDoneButton(true);
    } catch (e) {
      showError(e?.message || "Could not reschedule. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleCancelOnly = async () => {
    if (lockedForChanges) {
      showError(
        "Too late to cancel — must be at least 24 hours before the lesson.",
      );
      return;
    }
    if (!session) {
      safeBack(dashboardRoute);
      return;
    }
    setBusy(true);
    setResultMessage(null);
    try {
      await cancelSession(session.id);
      setResultTone("success");
      setResultMessage("This lesson is cancelled successfully.");
      setShowDoneButton(true);
    } catch (e) {
      showError(e?.message || "Could not cancel. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>
        <Text style={styles.header}>Cancel session</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color="#FF9E6D" />
        ) : session ? (
          <View style={styles.lessonCard}>
            <Text style={styles.lessonCardTitle}>
              {session.level} session
            </Text>
            <Text style={styles.lessonCardMeta}>
              {new Date(session.scheduled_at).toLocaleString()}
            </Text>
          </View>
        ) : null}

        <Text style={styles.info}>
          For cancelling session you have the possibility to:
        </Text>

        {lockedForChanges ? (
          <Text style={styles.warningHint}>
            This lesson starts in less than 24 hours and can no longer be
            rescheduled or cancelled.
          </Text>
        ) : alreadyRescheduled ? (
          <Text style={styles.warningHint}>
            This lesson has been rescheduled once already. Contact the student
            directly to coordinate further changes.
          </Text>
        ) : null}

        {showDoneButton ? null : (
          <>
            <Text style={styles.label}>Reschedule</Text>

            <TouchableOpacity
              style={styles.input}
              onPress={() => setPicker("day")}
              activeOpacity={0.7}
            >
              <Text style={[styles.placeholder, day && styles.value]}>
                {dayOptions.find((d) => d.key === day)?.label || "Select Day"}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#7E6D66" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.input}
              onPress={() => setPicker("time")}
              activeOpacity={0.7}
            >
              <Text style={[styles.placeholder, timeSlot && styles.value]}>
                {timeSlot?.label || "Select Time"}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#7E6D66" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.saveBtn,
                (!day || !timeSlot || busy || lockedForChanges || alreadyRescheduled) &&
                  styles.saveBtnDisabled,
              ]}
              disabled={
                !day ||
                !timeSlot ||
                busy ||
                lockedForChanges ||
                alreadyRescheduled
              }
              onPress={handleReschedule}
            >
              {busy ? (
                <ActivityIndicator color="#FFFBFA" />
              ) : (
                <Text style={styles.saveText}>Reschedule lesson</Text>
              )}
            </TouchableOpacity>

            <Text style={[styles.label, { marginTop: 24 }]}>
              Or Cancel without rescheduling
            </Text>
            <TouchableOpacity
              style={[
                styles.cancelOnlyBtn,
                (busy || lockedForChanges) && { opacity: 0.6 },
              ]}
              disabled={busy || lockedForChanges}
              onPress={handleCancelOnly}
            >
              <Text style={styles.cancelOnlyText}>Cancel lesson</Text>
            </TouchableOpacity>
          </>
        )}

        {resultMessage ? (
          <View style={styles.resultBanner}>
            <Ionicons
              name={
                resultTone === "error"
                  ? "alert-circle-outline"
                  : "checkmark-circle-outline"
              }
              size={14}
              color="#FF9E6D"
            />
            <Text style={styles.resultText}>{resultMessage}</Text>
          </View>
        ) : null}

        {showDoneButton ? (
          <TouchableOpacity
            style={[styles.saveBtn, { marginTop: 18, flexDirection: "row", gap: 8 }]}
            onPress={() => router.replace(dashboardRoute)}
          >
            <Ionicons name="home-outline" size={17} color="#FFFBFA" />
            <Text style={styles.saveText}>Back to Dashboard</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <Modal
        visible={picker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPicker(null)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {picker === "day" ? "Select a day" : "Select a time slot"}
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {options.map((opt) => {
                const selectedDay = dayOptions.find((d) => d.key === day)?.label;
                const selected =
                  (picker === "day" && opt === selectedDay) ||
                  (picker === "time" && opt === timeSlot?.label);
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.modalRow,
                      selected && styles.modalRowSelected,
                    ]}
                    onPress={() => choose(opt)}
                  >
                    <Text
                      style={[
                        styles.modalRowText,
                        selected && styles.modalRowTextSelected,
                      ]}
                    >
                      {opt}
                    </Text>
                    {selected && (
                      <Ionicons name="checkmark" size={18} color="#FF9E6D" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFBFA",
    paddingHorizontal: 20,
    paddingTop: 52,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },

  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  header: {
    fontFamily: "Domine",
    fontSize: 16,
    color: "#28221B",
  },

  lessonCard: {
    backgroundColor: "#F3EDEA",
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
  },

  lessonCardTitle: {
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "600",
    color: "#28221B",
  },

  lessonCardMeta: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    marginTop: 4,
  },

  info: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    marginBottom: 18,
  },

  warningHint: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#DD8153",
    backgroundColor: "#FFE8DC",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 18,
    lineHeight: 18,
  },

  label: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    marginBottom: 12,
  },

  input: {
    height: 44,
    backgroundColor: "#F1E5E1",
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },

  placeholder: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#7E6D66",
  },

  value: {
    color: "#28221B",
    fontWeight: "600",
  },

  saveBtn: {
    height: 44,
    backgroundColor: "#FF9E6D",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
  },

  saveBtnDisabled: {
    opacity: 0.5,
  },

  saveText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  cancelOnlyBtn: {
    height: 44,
    backgroundColor: "#DD8153",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  cancelOnlyText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  resultBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#FFF1E8",
    marginTop: 12,
  },

  resultText: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
    lineHeight: 14,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(40, 34, 27, 0.45)",
    justifyContent: "flex-end",
  },

  modalSheet: {
    backgroundColor: "#FFFBFA",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 22,
    paddingBottom: 32,
  },

  modalTitle: {
    fontFamily: "Domine",
    fontSize: 16,
    color: "#28221B",
    marginBottom: 12,
    textAlign: "center",
  },

  modalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 6,
  },

  modalRowSelected: {
    backgroundColor: "#FFF1E8",
  },

  modalRowText: {
    fontFamily: "Outfit",
    fontSize: 15,
    color: "#28221B",
  },

  modalRowTextSelected: {
    color: "#FF9E6D",
    fontWeight: "700",
  },
});

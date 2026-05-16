import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { safeBack } from "@/hooks/use-safe-back";
import { useUser } from "@/contexts/user-context";
import { cancelSession, listMySessions } from "@/services/sessions";
import { markTeacherNoShow } from "@/services/suspension";
import { requestReschedule } from "@/services/reschedule";

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

function nextDateForDay(targetDay, hour) {
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

export default function TutorDidntJoin() {
  const { sessionId } = useLocalSearchParams();
  const { user, profile } = useUser();
  const [day, setDay] = useState(null);
  const [timeSlot, setTimeSlot] = useState(null);
  const [picker, setPicker] = useState(null);
  const [savedSlot, setSavedSlot] = useState(null);
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const sessions = await listMySessions();
        const found = sessionId
          ? sessions.find((s) => String(s.id) === String(sessionId))
          : sessions.filter((s) => s.status === "confirmed")[0];
        setSession(found || null);
      } catch {
        setSession(null);
      }
    })();
  }, [sessionId]);

  const options = picker === "day" ? DAYS : picker === "time" ? TIME_SLOTS.map((t) => t.label) : [];

  const choose = (val) => {
    if (picker === "day") setDay(val);
    if (picker === "time") {
      const found = TIME_SLOTS.find((t) => t.label === val);
      if (found) setTimeSlot(found);
    }
    setPicker(null);
  };

  const handleSaveAvailability = () => {
    if (!day || !timeSlot) {
      Alert.alert(
        "Pick a day and time",
        "Please select both a day and a time slot.",
      );
      return;
    }
    setSavedSlot({ day, time: timeSlot.label, when: nextDateForDay(day, timeSlot.hour) });
    setDay(null);
    setTimeSlot(null);
  };

  const handleConfirmReschedule = async () => {
    if (!savedSlot) {
      Alert.alert("No slot saved", "Save an availability slot first or request a refund.");
      return;
    }
    if (!session) {
      Alert.alert("No session selected.");
      return;
    }
    setBusy(true);
    try {
      await markTeacherNoShow({
        teacher_id: session.teacher_id,
        session_id: session.id,
        notified: false,
      }).catch(() => null);
      await requestReschedule({
        session_id: session.id,
        new_time: savedSlot.when.toISOString(),
        reason: "Tutor didn't join — student rescheduling",
        requested_by: user?.id,
        user_timezone: profile.timezone || user?.timezone,
      });
      Alert.alert(
        "Rescheduled",
        `New slot requested: ${savedSlot.day} - ${savedSlot.time}.`,
        [{ text: "OK", onPress: () => router.replace("/student-dashboard") }],
      );
    } catch (e) {
      Alert.alert("Could not reschedule", e.message || "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleRefund = async () => {
    if (!session) {
      router.replace("/student-dashboard");
      return;
    }
    setBusy(true);
    try {
      await markTeacherNoShow({
        teacher_id: session.teacher_id,
        session_id: session.id,
        notified: false,
      }).catch(() => null);
      await cancelSession(session.id);
      Alert.alert(
        "Refund requested",
        "The session was cancelled and a refund request has been logged.",
        [{ text: "OK", onPress: () => router.replace("/student-dashboard") }],
      );
    } catch (e) {
      Alert.alert("Could not request refund", e.message || "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack("/student-dashboard")}>
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>
        <Text style={styles.header}>End of session</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Tutor didn&apos;t join!</Text>

        <Text style={styles.label}>Reschedule session</Text>

        <TouchableOpacity
          style={styles.input}
          onPress={() => setPicker("day")}
          activeOpacity={0.7}
        >
          <Text style={[styles.placeholder, day && styles.value]}>
            {day || "Select Day"}
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
            (!day || !timeSlot) && styles.saveBtnDisabled,
          ]}
          disabled={!day || !timeSlot}
          onPress={handleSaveAvailability}
        >
          <Text style={styles.saveText}>Save Availability +</Text>
        </TouchableOpacity>

        {savedSlot && (
          <View style={styles.slot}>
            <Text style={styles.slotText}>
              {savedSlot.day} - {savedSlot.time}
            </Text>
            <TouchableOpacity onPress={() => setSavedSlot(null)}>
              <Text style={styles.x}>X</Text>
            </TouchableOpacity>
          </View>
        )}

        {savedSlot && (
          <TouchableOpacity
            style={[styles.confirmBtn, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={handleConfirmReschedule}
          >
            <Text style={styles.confirmText}>Confirm reschedule</Text>
          </TouchableOpacity>
        )}

        <Text style={[styles.label, { marginTop: 24 }]}>Or Refund Session</Text>

        <TouchableOpacity
          style={[styles.refundBtn, busy && { opacity: 0.6 }]}
          disabled={busy}
          onPress={handleRefund}
        >
          <Text style={styles.refundText}>Refund</Text>
        </TouchableOpacity>
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
                const selected =
                  (picker === "day" && opt === day) ||
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
    paddingHorizontal: 22,
    paddingTop: 48,
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
    fontSize: 14,
    color: "#28221B",
  },

  title: {
    textAlign: "center",
    fontFamily: "Domine",
    fontSize: 18,
    fontWeight: "700",
    color: "#28221B",
    marginBottom: 22,
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
    paddingHorizontal: 14,
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
    backgroundColor: "#DD8153",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
    marginBottom: 18,
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

  slot: {
    height: 40,
    backgroundColor: "#F1E5E1",
    borderRadius: 18,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },

  slotText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
  },

  x: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#28221B",
    paddingHorizontal: 6,
  },

  confirmBtn: {
    marginTop: 12,
    height: 44,
    backgroundColor: "#FF9E6D",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  confirmText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  refundBtn: {
    height: 44,
    backgroundColor: "#DD8153",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  refundText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
    fontWeight: "600",
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
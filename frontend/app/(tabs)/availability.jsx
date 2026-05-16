import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { safeBack } from "@/hooks/use-safe-back";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { useUser } from "@/contexts/user-context";
import { addAvailability, deleteAvailability, getTutorAvailability } from "@/services/tutors";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const DAY_NAME = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// One-hour slots across the full 24-hour day, labelled in 24h notation
// (00:00–01:00 … 23:00–00:00). Tutors anywhere in the world can pick the
// hour that suits them — there's no business reason to cap the day at 9–9.
// The last slot stores 23:59:59 as the end (since the SQL TIME column
// can't represent 24:00:00) while still presenting "00:00" in the label.
const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => {
  const startHH = String(i).padStart(2, "0");
  const endHH = String((i + 1) % 24).padStart(2, "0");
  const isLastHour = i === 23;
  return {
    label: `${startHH}:00 to ${endHH}:00`,
    start: `${startHH}:00:00`,
    end: isLastHour ? "23:59:59" : `${endHH}:00:00`,
  };
});

function timeRangeLabel(start, end) {
  const fmt = (t) => {
    const [hh, mm] = String(t).split(":");
    return `${String(Number(hh)).padStart(2, "0")}:${mm}`;
  };
  // The 23:00→00:00 slot is stored as 23:00:00–23:59:59 (no 24:00:00 in
  // SQL TIME) — render it back as 23:00 → 00:00 so the tutor sees the
  // hour they actually selected.
  const endStr = String(end);
  const endLabel = endStr.startsWith("23:59") ? "00:00" : fmt(end);
  return `${fmt(start)} to ${endLabel}`;
}

export default function Availability() {
  const params = useLocalSearchParams();
  const { profile, user } = useUser();
  const teacherId = user?.teacher_id;

  const [day, setDay] = useState(null);
  const [timeSlot, setTimeSlot] = useState(null);
  const [picker, setPicker] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const timezone =
    profile.timezone ||
    user?.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC";

  const loadSlots = useCallback(async () => {
    if (!teacherId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getTutorAvailability(teacherId);
      setSlots(Array.isArray(data) ? data : []);
    } catch {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const addSlot = async () => {
    if (!day || !timeSlot) return;
    if (!teacherId) {
      Alert.alert("Sign in needed", "Please sign in again as a tutor.");
      return;
    }
    setSaving(true);
    try {
      await addAvailability({
        day_of_week: DAY_INDEX[day],
        start_time: timeSlot.start,
        end_time: timeSlot.end,
        timezone,
      });
      setDay(null);
      setTimeSlot(null);
      await loadSlots();
    } catch (e) {
      Alert.alert("Could not add slot", e.message || "Please try another time.");
    } finally {
      setSaving(false);
    }
  };

  const removeSlot = async (slotId) => {
    setSlots((prev) => prev.filter((s) => s.id !== slotId));
    try {
      await deleteAvailability(slotId);
    } catch {
      await loadSlots();
    }
  };

  const canContinue = slots.length > 0;
  const options =
    picker === "day" ? DAYS : picker === "time" ? TIME_SLOTS.map((t) => t.label) : [];

  const choose = (val) => {
    if (picker === "day") setDay(val);
    if (picker === "time") {
      const found = TIME_SLOTS.find((t) => t.label === val);
      if (found) setTimeSlot(found);
    }
    setPicker(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() =>
            // When the tutor is editing (no onboarding params), prefer
            // routing straight back to the profile rather than retracing the
            // navigation history. During onboarding `safeBack()` keeps the
            // existing behaviour.
            (params?.level || params?.fromOnboarding)
              ? safeBack()
              : router.replace("/profile")
          }
        >
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>
        <Text style={styles.title}>Set Availability</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.selectField}
          onPress={() => setPicker("day")}
          activeOpacity={0.7}
        >
          <Text style={[styles.selectText, !day && styles.placeholder]}>
            {day || "Select Day"}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#7E6D66" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.selectField}
          onPress={() => setPicker("time")}
          activeOpacity={0.7}
        >
          <Text style={[styles.selectText, !timeSlot && styles.placeholder]}>
            {timeSlot?.label || "Select Time"}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#7E6D66" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            (!day || !timeSlot || saving) && styles.buttonDisabled,
          ]}
          disabled={!day || !timeSlot || saving}
          onPress={addSlot}
        >
          {saving ? (
            <ActivityIndicator color="#FFFBFA" />
          ) : (
            <Text style={styles.buttonText}>Save Availability +</Text>
          )}
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator color="#FF9E6D" style={{ marginTop: 20 }} />
        ) : (
          slots.map((slot) => (
            <View key={slot.id} style={styles.item}>
              <Text style={styles.itemText}>
                {DAY_NAME[slot.day_of_week]} -{" "}
                {timeRangeLabel(slot.start_time, slot.end_time)}
              </Text>
              <TouchableOpacity onPress={() => removeSlot(slot.id)}>
                <Text style={styles.close}>X</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        {!loading && slots.length === 0 && (
          <Text style={styles.emptyText}>
            No availability added yet. Add a day and time above.
          </Text>
        )}
      </ScrollView>

      {/*
        Two entry points for this screen:
          - During onboarding, the previous step pushes here with params
            (e.g. `level`) and the tutor continues forward to /pricing-plans.
          - From the profile "Edit availability" link, no params are set —
            the tutor only wants to add/remove slots, so we show a "Done"
            button that takes them back to the tutor dashboard.
      */}
      {(params?.level || params?.fromOnboarding) ? (
        <TouchableOpacity
          style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
          disabled={!canContinue}
          onPress={() =>
            router.push({ pathname: "/pricing-plans", params: { ...params } })
          }
        >
          <Text style={styles.continueText}>Continue</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.continueBtn}
          onPress={() => router.replace("/tutor-dashboard")}
        >
          <Text style={styles.continueText}>Done</Text>
        </TouchableOpacity>
      )}

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFBFA",
    padding: 20,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 30,
  },
  backBtn: {
    backgroundColor: "#FF9E6D",
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: "#28221B",
  },

  selectField: {
    backgroundColor: "#F3EDEA",
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 22,
    marginBottom: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectText: {
    color: "#28221B",
    fontSize: 14,
  },
  placeholder: {
    color: "#7E6D66",
  },

  button: {
    backgroundColor: "#FF9E6D",
    padding: 16,
    borderRadius: 25,
    alignItems: "center",
    marginVertical: 15,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#FFFBFA",
    fontWeight: "600",
    fontSize: 15,
  },

  item: {
    backgroundColor: "#F3EDEA",
    padding: 16,
    borderRadius: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  itemText: {
    color: "#28221B",
    fontSize: 14,
  },
  close: {
    color: "#28221B",
    fontWeight: "500",
    fontSize: 16,
    paddingHorizontal: 6,
  },

  emptyText: {
    textAlign: "center",
    color: "#A89080",
    fontFamily: "Outfit",
    fontSize: 13,
    marginTop: 20,
  },

  continueBtn: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 24,
    backgroundColor: "#FF9E6D",
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: "center",
    shadowColor: "#FF9E6D",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  continueBtnDisabled: {
    opacity: 0.5,
  },
  continueText: {
    color: "#FFFBFA",
    fontWeight: "600",
    fontSize: 16,
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

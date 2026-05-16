import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { safeBack } from "@/hooks/use-safe-back";
import { getStudentProfile } from "@/services/profile";
import { createReview } from "@/services/reviews";
import { listMySessions } from "@/services/sessions";

const GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-"];
// Rough mapping from letter grade to 1-5 star rating used by backend.
const GRADE_TO_RATING = {
  "A+": 5, A: 5, "A-": 4,
  "B+": 4, B: 3, "B-": 3,
  "C+": 2, C: 2, "C-": 1,
};

export default function WriteReview() {
  const { sessionId } = useLocalSearchParams();
  const [gradeIndex, setGradeIndex] = useState(1);
  const [text, setText] = useState("");
  const [session, setSession] = useState(null);
  const [studentName, setStudentName] = useState("Student");
  const [submitting, setSubmitting] = useState(false);
  const [sentVisible, setSentVisible] = useState(false);
  const dismissTimer = useRef(null);

  useEffect(() => () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const sessions = await listMySessions("completed");
        const target = sessionId
          ? sessions.find((s) => String(s.id) === String(sessionId))
          : sessions.find((s) => !s.teacher_review_done);
        setSession(target || null);
        if (target?.student_id) {
          try {
            const student = await getStudentProfile(target.student_id);
            setStudentName(student?.full_name || "Student");
          } catch {
            setStudentName("Student");
          }
        } else {
          setStudentName("Student");
        }
      } catch {
        setSession(null);
        setStudentName("Student");
      }
    })();
  }, [sessionId]);

  const grade = GRADES[gradeIndex];

  const stepGrade = (delta) => {
    setGradeIndex((prev) => {
      const next = prev + delta;
      if (next < 0) return 0;
      if (next > GRADES.length - 1) return GRADES.length - 1;
      return next;
    });
  };

  const handleSend = async () => {
    if (!text.trim()) {
      Alert.alert(
        "Write something",
        "Please add a short review before sending.",
      );
      return;
    }
    if (!session) {
      Alert.alert("No completed session", "You don't have any session ready to review.");
      return;
    }
    setSubmitting(true);
    try {
      await createReview({
        session_id: session.id,
        role: "teacher",
        rating: GRADE_TO_RATING[grade] || 3,
        comment: text.trim(),
      });
      // Show the in-app success modal briefly, then auto-route back to the
      // tutor dashboard. Keeps the confirmation inside the design system
      // rather than relying on the native Alert popup.
      setSentVisible(true);
      dismissTimer.current = setTimeout(() => {
        setSentVisible(false);
        router.replace("/tutor-dashboard");
      }, 1500);
    } catch (e) {
      Alert.alert("Could not submit", e.message || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack("/tutor-dashboard")}>
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>
        <Text style={styles.header}>Write a Review</Text>
        <View style={{ width: 36 }} />
      </View>

      <Text style={styles.title}>How was the lesson?</Text>

      <Text style={styles.label}>Grade:</Text>

      <View style={styles.gradeRow}>
        <TouchableOpacity
          style={styles.gradeStep}
          onPress={() => stepGrade(1)}
          disabled={gradeIndex === 0}
        >
          <Text style={[styles.gradeStepText, gradeIndex === 0 && styles.gradeStepDisabled]}>
            -
          </Text>
        </TouchableOpacity>

        <Text style={styles.grade}>{grade}</Text>

        <TouchableOpacity
          style={styles.gradeStep}
          onPress={() => stepGrade(-1)}
          disabled={gradeIndex === GRADES.length - 1}
        >
          <Text
            style={[
              styles.gradeStepText,
              gradeIndex === GRADES.length - 1 && styles.gradeStepDisabled,
            ]}
          >
            +
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Write a review for:</Text>

      <Text style={styles.user}>{studentName} - Just now</Text>

      <TextInput
        style={styles.textArea}
        placeholder="Write review here..."
        placeholderTextColor="#7E6D66"
        value={text}
        onChangeText={setText}
        multiline
      />

      <TouchableOpacity
        style={[styles.btn, submitting && { opacity: 0.7 }]}
        disabled={submitting}
        onPress={handleSend}
      >
        {submitting ? (
          <ActivityIndicator color="#FFFBFA" />
        ) : (
          <Text style={styles.btnText}>Send</Text>
        )}
      </TouchableOpacity>

      <Modal visible={sentVisible} transparent animationType="fade">
        <View style={styles.sentOverlay}>
          <View style={styles.sentCard}>
            <View style={styles.sentIcon}>
              <Ionicons name="checkmark" size={36} color="#FF9E6D" />
            </View>
            <Text style={styles.sentTitle}>Review sent</Text>
            <Text style={styles.sentText}>
              The student will see your review on their dashboard.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFBFA",
    paddingHorizontal: 22,
    paddingTop: 50,
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
    fontFamily: "Domine",
    fontSize: 20,
    color: "#28221B",
    marginBottom: 18,
  },

  label: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    marginBottom: 10,
  },

  gradeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 22,
    marginBottom: 22,
  },

  gradeStep: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFF1E8",
    alignItems: "center",
    justifyContent: "center",
  },

  gradeStepText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FF9E6D",
  },

  gradeStepDisabled: {
    color: "#E5C7B6",
  },

  grade: {
    fontSize: 36,
    fontFamily: "Domine",
    fontWeight: "700",
    color: "#28221B",
    minWidth: 64,
    textAlign: "center",
  },

  user: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    marginBottom: 14,
  },

  textArea: {
    height: 200,
    backgroundColor: "#F1E5E1",
    borderRadius: 14,
    padding: 14,
    textAlignVertical: "top",
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
  },

  btn: {
    position: "absolute",
    bottom: 24,
    left: 22,
    right: 22,
    height: 44,
    backgroundColor: "#FF9E6D",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  btnText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  sentOverlay: {
    flex: 1,
    backgroundColor: "rgba(40, 34, 27, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  sentCard: {
    width: "100%",
    backgroundColor: "#FFFBFA",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 26,
    alignItems: "center",
  },
  sentIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FFF1E8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  sentTitle: {
    fontFamily: "Domine",
    fontSize: 18,
    color: "#28221B",
    marginBottom: 6,
    textAlign: "center",
  },
  sentText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    textAlign: "center",
    lineHeight: 17,
  },
});

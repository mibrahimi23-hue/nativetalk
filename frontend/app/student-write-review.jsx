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
import { createReview } from "@/services/reviews";
import { listMySessions } from "@/services/sessions";
import { getTutor } from "@/services/tutors";

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

export default function StudentWriteReview() {
  const { sessionId } = useLocalSearchParams();
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [session, setSession] = useState(null);
  const [tutorName, setTutorName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentVisible, setSentVisible] = useState(false);
  const dismissTimer = useRef(null);

  useEffect(() => () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sessions = await listMySessions("completed");
        const target = sessionId
          ? sessions.find((s) => String(s.id) === String(sessionId))
          : sessions.find((s) => !s.student_review_done);
        if (cancelled) return;
        setSession(target || null);
        // Resolve the tutor's display name for the "Write a review for: ..."
        // line so it reflects the actual tutor of this session.
        if (target?.teacher_id) {
          try {
            const t = await getTutor(String(target.teacher_id));
            if (!cancelled) setTutorName(t?.full_name || "Your tutor");
          } catch {
            if (!cancelled) setTutorName("Your tutor");
          }
        } else if (!cancelled) {
          setTutorName("Your tutor");
        }
      } catch {
        if (!cancelled) {
          setSession(null);
          setTutorName("Your tutor");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const handleSend = async () => {
    if (rating === 0) {
      Alert.alert("Pick a rating", "Please tap the stars to rate the lesson.");
      return;
    }
    if (!review.trim()) {
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
        role: "student",
        rating,
        comment: review.trim(),
      });
      // In-app success modal → auto-route back to the student dashboard.
      setSentVisible(true);
      dismissTimer.current = setTimeout(() => {
        setSentVisible(false);
        router.replace("/student-dashboard");
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
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack("/student-dashboard")}>
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>
        <Text style={styles.header}>Write a Review</Text>
        <View style={{ width: 36 }} />
      </View>

      <Text style={styles.title}>How was the lesson?</Text>

      <Text style={styles.label}>Write a review for:</Text>

      <View style={styles.tutorRow}>
        <View
          style={[
            styles.avatar,
            {
              backgroundColor: colorForName(tutorName),
              alignItems: "center",
              justifyContent: "center",
            },
          ]}
        >
          <Text style={styles.avatarInitials}>{initialsOf(tutorName)}</Text>
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {tutorName || "Your tutor"} ·
        </Text>

        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity key={star} onPress={() => setRating(star)} hitSlop={4}>
              <Ionicons
                name={star <= rating ? "star" : "star-outline"}
                size={22}
                color="#FF9E6D"
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Write review here..."
        placeholderTextColor="#8D7C74"
        multiline
        value={review}
        onChangeText={setReview}
      />

      <TouchableOpacity
        style={[styles.sendBtn, submitting && { opacity: 0.7 }]}
        disabled={submitting}
        onPress={handleSend}
      >
        {submitting ? (
          <ActivityIndicator color="#FFFBFA" />
        ) : (
          <Text style={styles.sendText}>Send</Text>
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
              Your tutor will see your review on their dashboard.
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
    fontFamily: "Domine",
    fontSize: 20,
    color: "#28221B",
    marginBottom: 18,
  },

  label: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    marginBottom: 12,
  },

  tutorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
    gap: 8,
  },

  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#BFA28F",
  },

  avatarInitials: {
    fontFamily: "Domine",
    fontSize: 11,
    fontWeight: "700",
    color: "#28221B",
  },

  name: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    flexShrink: 1,
  },

  stars: {
    flexDirection: "row",
    gap: 4,
    marginLeft: 4,
  },

  input: {
    height: 280,
    backgroundColor: "#F1E5E1",
    borderRadius: 14,
    padding: 14,
    textAlignVertical: "top",
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
  },

  sendBtn: {
    position: "absolute",
    bottom: 22,
    left: 22,
    right: 22,
    height: 44,
    backgroundColor: "#FF9E6D",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  sendText: {
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

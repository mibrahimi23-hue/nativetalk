import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { TutorBottomNav } from "@/components/tutor-bottom-nav";
import { safeBack } from "@/hooks/use-safe-back";
import { useUser } from "@/contexts/user-context";
import { getStudentReviews, getTeacherReviews } from "@/services/reviews";

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

export default function Reviews() {
  const { user, role } = useUser();
  const teacherId = user?.teacher_id;
  const studentId = user?.student_id;
  const isStudent = role === "Learner";

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  // Tutor: reviews students wrote about them (role="student").
  // Student: reviews tutors wrote about them (role="teacher") — this surfaces
  //          the "grade" the tutor left at end-of-lesson, which the wireframe
  //          shows on the student-side end-of-lesson screen.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      let data;
      if (isStudent && studentId) {
        data = await getStudentReviews(studentId);
      } else if (teacherId) {
        data = await getTeacherReviews(teacherId);
      } else {
        data = [];
      }
      setReviews(Array.isArray(data) ? data : []);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [teacherId, studentId, isStudent]);

  useEffect(() => {
    load();
  }, [load]);

  const avgRating = useMemo(() => {
    if (!reviews.length) return 0;
    const total = reviews.reduce((sum, r) => sum + (r.rating || 0), 0);
    return Number((total / reviews.length).toFixed(1));
  }, [reviews]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() =>
            safeBack(isStudent ? "/student-dashboard" : "/tutor-dashboard")
          }
        >
          <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          {isStudent ? "Tutor feedback" : "User reviews"}
        </Text>

        <Text style={styles.seeAll}>See All</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.mainTitle}>
          {isStudent ? "Your rating from tutors:" : "Your rating:"}
        </Text>
        <Text style={styles.rating}>{avgRating || 0} stars</Text>

        <View style={styles.starsRow}>
          <Text style={styles.star}>
            {"★".repeat(Math.round(avgRating))}
            {"☆".repeat(5 - Math.round(avgRating))}
          </Text>
          <Text style={styles.count}>{reviews.length}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color="#FF9E6D" style={{ marginTop: 24 }} />
        ) : reviews.length === 0 ? (
          <Text style={styles.empty}>No reviews yet.</Text>
        ) : (
          reviews.map((r, idx) => (
            <View key={r.id || idx}>
              <View style={styles.review}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewTitle}>
                    {r.rating >= 4 ? "Great session" : r.rating >= 3 ? "Good" : "Could improve"}
                  </Text>
                  <Text style={styles.smallRating}>★ {Number(r.rating || 0).toFixed(1)}</Text>
                </View>
                <Text style={styles.desc}>{r.comment || "No comment."}</Text>
                <Text style={styles.user}>
                  {r.reviewer_name || (isStudent ? "Tutor" : "Student")} · {relativeTime(r.created_at)}
                </Text>
              </View>
              {idx < reviews.length - 1 && <View style={styles.divider} />}
            </View>
          ))
        )}
      </ScrollView>
      {isStudent ? <StudentBottomNav /> : <TutorBottomNav />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFBFA",
    paddingHorizontal: 20,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 45,
    marginBottom: 20,
  },

  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Domine",
    fontSize: 15,
    color: "#28221B",
  },

  seeAll: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#DD8153",
  },

  mainTitle: {
    fontFamily: "Domine",
    fontSize: 22,
    color: "#28221B",
  },

  rating: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#7E6D66",
    marginTop: 4,
  },

  starsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 14,
    gap: 12,
  },

  star: {
    fontSize: 22,
    color: "#FF9E6D",
  },

  count: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#28221B",
  },

  review: {
    paddingVertical: 12,
  },

  reviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },

  reviewTitle: {
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "700",
    color: "#28221B",
  },

  smallRating: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#FF9E6D",
    fontWeight: "700",
  },

  desc: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    marginBottom: 4,
  },

  user: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
  },

  divider: {
    height: 1,
    backgroundColor: "#F0EDEA",
  },

  empty: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#A89080",
    textAlign: "center",
    marginTop: 30,
  },
});

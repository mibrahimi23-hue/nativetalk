import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { safeBack } from "@/hooks/use-safe-back";
import { getLesson, listMyLessons } from "@/services/lessons";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function StudentLessonDetail() {
  const { lessonId, sessionId } = useLocalSearchParams();
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const id = lessonId || sessionId;
    setLoading(true);
    const request = id
      ? getLesson(String(id))
      : listMyLessons().then((rows) =>
          Array.isArray(rows) ? rows.find((l) => l.kind === "lesson_note") || rows[0] : null,
        );

    request
      .then((data) => {
        if (!cancelled) setLesson(data || null);
      })
      .catch(() => {
        if (!cancelled) setLesson(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lessonId, sessionId]);

  const createdAt = lesson?.created_at || lesson?.scheduled_at;
  const date = createdAt
    ? new Date(createdAt).toLocaleDateString([], {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => safeBack()}
          >
            <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>
            Lesson {lesson?.lesson_number || 1}
          </Text>
          <View style={{ width: 30 }} />
        </View>

        {loading ? (
          <ActivityIndicator color="#FF9E6D" style={{ marginTop: 24 }} />
        ) : (
          <>
            <Text style={styles.title}>{lesson?.title || "Lesson"}</Text>

            <Text style={styles.tutor}>
              Tutor: {lesson?.tutor_name || lesson?.partner_name || "Tutor"}
            </Text>
            <Text style={styles.date}>{date}</Text>

            <Text style={styles.description}>
              {lesson?.description || "No lesson notes have been added yet."}
            </Text>
          </>
        )}
      </ScrollView>

      <View style={styles.bottomNav}>
        <TouchableOpacity onPress={() => router.push("/student-dashboard")}>
          <Ionicons name="home" size={20} color="#28221B" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/student-dashboard")}>
          <Ionicons name="search-outline" size={20} color="#28221B" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/student-lessons")}>
          <Ionicons name="book-outline" size={20} color="#FF9E6D" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/student-profile")}>
          <Ionicons name="person" size={20} color="#28221B" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFBFA",
    paddingTop: 48,
    paddingHorizontal: 22,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
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
    fontSize: 13,
    color: "#28221B",
  },

  title: {
    fontFamily: "Domine",
    fontSize: 26,
    color: "#28221B",
    marginBottom: 18,
  },

  tutor: {
    fontFamily: "Outfit",
    fontSize: 13,
    fontWeight: "700",
    color: "#28221B",
  },

  date: {
    fontFamily: "Outfit",
    fontSize: 10,
    color: "#7E6D66",
    marginBottom: 12,
  },

  description: {
    fontFamily: "Outfit",
    fontSize: 13,
    lineHeight: 18,
    color: "#28221B",
    paddingBottom: 80,
  },

  bottomNav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 44,
    backgroundColor: "#FDF0EC",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
});

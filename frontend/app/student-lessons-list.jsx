import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { useUser } from "@/contexts/user-context";
import { safeBack } from "@/hooks/use-safe-back";

const TABS = ["A1", "A2", "B1", "B2"];

const COMPLETED_LESSONS = [
  { title: "Lesson 1: Basic Greetings", level: "A1" },
  { title: "Lesson 2: Phrases", level: "A1" },
  { title: "Lesson 3: Cafe Conversation", level: "A2" },
  { title: "Lesson 4: Travel Vocabulary", level: "A2" },
  { title: "Lesson 5: Restaurant Conversation", level: "A2" },
];

const UPCOMING_LESSONS = [
  { title: "Lesson 6: Common Phrases", date: "10/02", time: "5:00 PM", joinable: true, level: "A2" },
  { title: "Lesson 7: Numbers", date: "10/07", time: "7:00 PM", level: "A2" },
  { title: "Lesson 8: Directions", date: "10/07", time: "8:00 PM", level: "A2" },
  { title: "Lesson 9: Past Tense", date: "10/12", time: "6:00 PM", level: "B1" },
  { title: "Lesson 10: Past Tense Practice", date: "10/14", time: "6:00 PM", level: "B1" },
];

function nextState(state) {
  return state === "preview" ? "expanded" : state === "expanded" ? "collapsed" : "preview";
}

function chevronFor(state) {
  return state === "preview" ? "chevron-down" : state === "expanded" ? "chevron-up" : "chevron-forward";
}

function labelFor(state, count) {
  return state === "preview"
    ? `Show all (${count})`
    : state === "expanded"
    ? "Hide all"
    : "Show preview";
}

function visibleSlice(state, list) {
  if (state === "collapsed") return [];
  if (state === "expanded") return list;
  return list.slice(0, 3);
}

export default function StudentLessonsList() {
  const { materials } = useUser();
  const [activeTab, setActiveTab] = useState("A2");
  const [completedState, setCompletedState] = useState("preview");
  const [upcomingState, setUpcomingState] = useState("preview");
  const [materialsState, setMaterialsState] = useState("preview");

  const completedForLevel = COMPLETED_LESSONS.filter((l) => l.level === activeTab);
  const upcomingForLevel = UPCOMING_LESSONS.filter((l) => l.level === activeTab);

  const visibleCompleted = visibleSlice(completedState, completedForLevel);
  const visibleUpcoming = visibleSlice(upcomingState, upcomingForLevel);
  const visibleMaterials = visibleSlice(materialsState, materials);

  const noLessonsAtAll =
    completedForLevel.length === 0 && upcomingForLevel.length === 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Lessons</Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={styles.tabs}>
        {TABS.map((tab) => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)}>
            <Text
              style={[styles.tabText, activeTab === tab && styles.activeTab]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {noLessonsAtAll ? (
          <View style={styles.emptyState}>
            <Ionicons name="book-outline" size={28} color="#A89080" />
            <Text style={styles.emptyStateTitle}>
              No lessons for {activeTab} yet
            </Text>
            <Text style={styles.emptyStateText}>
              Pick another level or check back once your tutor adds lessons.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.title}>Completed Lessons</Text>

            {completedForLevel.length === 0 ? (
              <Text style={styles.emptyText}>
                No completed lessons for this level yet.
              </Text>
            ) : (
              <>
                {visibleCompleted.map((lesson) => (
                  <TouchableOpacity
                    key={lesson.title}
                    style={styles.completedRow}
                    onPress={() => router.push("/student-lesson-detail")}
                  >
                    <View style={styles.square} />
                    <View>
                      <Text style={styles.completedTitle}>{lesson.title}</Text>
                      <Text style={styles.completedText}>Completed</Text>
                    </View>
                  </TouchableOpacity>
                ))}

                {completedForLevel.length > 3 && (
                  <TouchableOpacity
                    style={styles.toggleBtn}
                    onPress={() => setCompletedState(nextState(completedState))}
                  >
                    <Ionicons
                      name={chevronFor(completedState)}
                      size={16}
                      color="#FFFBFA"
                    />
                    <Text style={styles.toggleText}>
                      {labelFor(completedState, completedForLevel.length)}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            <Text style={[styles.title, { marginTop: 22 }]}>
              Upcoming Lessons
            </Text>

            {upcomingForLevel.length === 0 ? (
              <Text style={styles.emptyText}>
                No upcoming lessons for this level yet.
              </Text>
            ) : (
              <>
                {visibleUpcoming.map((lesson, index) =>
                  index === 0 && lesson.joinable ? (
                    <View key={lesson.title} style={styles.upcomingRow}>
                      <TouchableOpacity
                        onPress={() => router.push("/student-lesson-detail")}
                      >
                        <Text style={styles.lessonTitle}>{lesson.title}</Text>
                        <Text style={styles.lessonTime}>
                          {lesson.date} {lesson.time}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.joinBtn}
                        onPress={() =>
                          router.push({
                            pathname: "/videocall",
                            params: lesson.id
                              ? { sessionId: String(lesson.id) }
                              : {},
                          })
                        }
                      >
                        <Text style={styles.joinText}>Join</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      key={lesson.title}
                      style={styles.lineLesson}
                      onPress={() => router.push("/student-lesson-detail")}
                    >
                      <Text style={styles.lessonTitle}>{lesson.title}</Text>
                      <Text style={styles.lessonTime}>
                        {lesson.date} {lesson.time}
                      </Text>
                    </TouchableOpacity>
                  ),
                )}

                {upcomingForLevel.length > 3 && (
                  <TouchableOpacity
                    style={styles.toggleBtn}
                    onPress={() => setUpcomingState(nextState(upcomingState))}
                  >
                    <Ionicons
                      name={chevronFor(upcomingState)}
                      size={16}
                      color="#FFFBFA"
                    />
                    <Text style={styles.toggleText}>
                      {labelFor(upcomingState, upcomingForLevel.length)}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => router.push("/cancel-session")}
                >
                  <Text style={styles.cancelText}>Cancel Upcoming lesson</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        <Text style={[styles.title, { marginTop: 26 }]}>Materials</Text>

        {visibleMaterials.length === 0 && materialsState !== "collapsed" && (
          <Text style={styles.emptyText}>No materials yet.</Text>
        )}

        {visibleMaterials.map((mat) => (
          <View key={mat.id} style={styles.materialRow}>
            <Text style={styles.materialTitle}>{mat.title}</Text>
            <TouchableOpacity>
              <Ionicons name="download-outline" size={20} color="#28221B" />
            </TouchableOpacity>
          </View>
        ))}

        {materials.length > 3 && (
          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={() => setMaterialsState(nextState(materialsState))}
          >
            <Ionicons name={chevronFor(materialsState)} size={16} color="#FFFBFA" />
            <Text style={styles.toggleText}>
              {labelFor(materialsState, materials.length)}
            </Text>
          </TouchableOpacity>
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
    paddingTop: 48,
    paddingHorizontal: 18,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
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

  tabs: {
    flexDirection: "row",
    gap: 28,
    borderBottomWidth: 1,
    borderBottomColor: "#EFE6E1",
    marginBottom: 18,
  },

  tabText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#7E6D66",
    paddingBottom: 7,
  },

  activeTab: {
    color: "#28221B",
    borderBottomWidth: 2,
    borderBottomColor: "#28221B",
  },

  title: {
    fontFamily: "Domine",
    fontSize: 18,
    color: "#28221B",
    marginBottom: 10,
  },

  completedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EDEA",
  },

  square: {
    width: 14,
    height: 14,
    backgroundColor: "#DD8153",
    marginRight: 12,
  },

  completedTitle: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    fontWeight: "600",
  },

  completedText: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
    marginTop: 3,
  },

  toggleBtn: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FF9E6D",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 14,
    marginBottom: 8,
  },

  toggleText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  upcomingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EDEA",
  },

  lessonTitle: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    fontWeight: "700",
  },

  lessonTime: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    marginTop: 4,
  },

  joinBtn: {
    width: 60,
    height: 38,
    borderRadius: 20,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  joinText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  lineLesson: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EDEA",
  },

  cancelBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#DD8153",
    borderRadius: 20,
    paddingVertical: 11,
    paddingHorizontal: 18,
    marginTop: 14,
  },

  cancelText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  emptyText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#A89080",
    marginVertical: 6,
  },

  emptyState: {
    alignItems: "center",
    paddingVertical: 50,
    paddingHorizontal: 24,
    backgroundColor: "#FFF1E8",
    borderRadius: 14,
    marginTop: 12,
  },

  emptyStateTitle: {
    fontFamily: "Domine",
    fontSize: 16,
    color: "#28221B",
    marginTop: 10,
  },

  emptyStateText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },

  materialRow: {
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#F0EDEA",
  },

  materialTitle: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#28221B",
  },
});

import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { safeBack } from "@/hooks/use-safe-back";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { getExam, submitExam } from "@/services/exams";

const tabs = [
  { id: "reading", label: "Reading", icon: "book-outline" },
  { id: "speaking", label: "Speaking", icon: "mic-outline" },
  { id: "listening", label: "Listening Comprehension", icon: "ear-outline" },
  { id: "writing", label: "Writing Skills", icon: "create-outline" },
];

// Admin-builder prefixes each question_text with "[Reading] " / "[Writing] "
// etc. so we can split a flat exam back into the four section tabs.
function detectSection(text) {
  const t = String(text || "").trim().toLowerCase();
  for (const tab of tabs) {
    if (t.startsWith(`[${tab.label.toLowerCase()}]`)) return tab.id;
    if (tab.id === "listening" && t.startsWith("[listening")) return "listening";
    if (tab.id === "writing" && t.startsWith("[writing")) return "writing";
  }
  return "reading";
}

function stripSectionPrefix(text) {
  return String(text || "").replace(/^\[[^\]]+\]\s*/, "");
}

export default function LanguageExam() {
  const params = useLocalSearchParams();
  const examId = params.examId ? String(params.examId) : null;

  const [activeTab, setActiveTab] = useState("reading");
  const [answers, setAnswers] = useState({});
  const [textAnswers, setTextAnswers] = useState({});

  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!examId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getExam(examId)
      .then((data) => {
        if (cancelled) return;
        const list = (data?.questions || []).map((q, idx) => {
          const optionsObj = q.options || {};
          return {
            id: q.question_id || String(idx),
            section: detectSection(q.question_text),
            question: `Question ${idx + 1}: ${stripSectionPrefix(q.question_text)}`,
            type: "mcq",
            options: [
              optionsObj.A,
              optionsObj.B,
              optionsObj.C,
              optionsObj.D,
            ].filter((o) => o !== undefined && o !== null),
          };
        });
        setQuestions(list);
      })
      .catch((e) => {
        Alert.alert("Could not load exam", e?.message || "Please try again later.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [examId]);

  const handleSelect = (questionId, option) => {
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
  };

  // Show questions belonging to the active tab. If no question matched that
  // section (e.g. older exams without section prefixes), show all of them on
  // the Reading tab so nothing gets hidden.
  const visibleQuestions = questions.filter((q) => {
    const anyHasSection = questions.some((qq) => qq.section !== "reading");
    if (!anyHasSection) return activeTab === "reading";
    return q.section === activeTab;
  });

  const handleFinish = async () => {
    if (submitting) return;
    if (!examId) {
      router.push("/exam-results");
      return;
    }
    if (questions.length === 0) {
      Alert.alert("Empty exam", "This exam has no questions.");
      return;
    }

    const letters = ["A", "B", "C", "D"];
    const payload = {
      answers: questions
        .map((q) => {
          const selectedText = answers[q.id];
          if (!selectedText) return null;
          const idx = q.options.indexOf(selectedText);
          if (idx < 0) return null;
          return { question_id: String(q.id), answer: letters[idx] };
        })
        .filter(Boolean),
    };

    if (payload.answers.length === 0) {
      Alert.alert("Pick at least one answer", "Select an answer before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitExam(examId, payload);
      router.push({
        pathname: "/exam-results",
        params: {
          score: String(result?.score ?? 0),
          total: String(result?.total ?? questions.length),
          percentage: String(result?.percentage ?? "0%"),
          passed: result?.passed ? "1" : "0",
          newLevel: result?.new_max_level || "",
          message: result?.message_result || "",
        },
      });
    } catch (e) {
      Alert.alert("Could not submit exam", e?.message || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Language Examination</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabList}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={styles.tabItem}
            onPress={() => setActiveTab(tab.id)}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={activeTab === tab.id ? "#FF9E6D" : "#7E6D66"}
            />
            <Text
              style={[
                styles.tabLabel,
                activeTab === tab.id && styles.tabLabelActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Section Title */}
        <Text style={styles.sectionTitle}>
          {tabs.find((t) => t.id === activeTab)?.label}
        </Text>

        {/* Questions */}
        {loading ? (
          <ActivityIndicator color="#FF9E6D" style={{ marginTop: 30 }} />
        ) : visibleQuestions.length === 0 ? (
          <Text style={styles.questionText}>
            No questions in this section.
          </Text>
        ) : (
          visibleQuestions.map((q) => (
            <View key={q.id} style={styles.questionBlock}>
              <Text style={styles.questionText}>{q.question}</Text>

              {q.type === "mcq" ? (
                q.options.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={styles.optionRow}
                    onPress={() => handleSelect(q.id, option)}
                  >
                    <View
                      style={[
                        styles.radioCircle,
                        answers[q.id] === option && styles.radioCircleSelected,
                      ]}
                    />
                    <Text
                      style={[
                        styles.optionText,
                        answers[q.id] === option && styles.optionTextSelected,
                      ]}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))
              ) : (
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter answer here"
                  placeholderTextColor="#bbb"
                  value={textAnswers[q.id] || ""}
                  onChangeText={(text) =>
                    setTextAnswers((prev) => ({ ...prev, [q.id]: text }))
                  }
                />
              )}
            </View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Finish Exam Button */}
      <View style={styles.bottomBtn}>
        <TouchableOpacity
          style={[styles.finishBtn, submitting && { opacity: 0.7 }]}
          onPress={handleFinish}
          disabled={submitting || loading}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFBFA" />
          ) : (
            <Text style={styles.finishBtnText}>Finish exam</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#FFFBFA",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 55,
    paddingBottom: 14,
    paddingHorizontal: 20,
    backgroundColor: "#FFFBFA",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#28221B",
  },

  // Tabs
  tabList: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EFE6E1",
    gap: 10,
  },
  tabItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 14,
    color: "#7E6D66",
  },
  tabLabelActive: {
    color: "#FF9E6D",
    fontWeight: "600",
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  // Section title
  sectionTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#28221B",
    marginBottom: 20,
  },

  // Questions
  questionBlock: {
    marginBottom: 24,
  },
  questionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#28221B",
    marginBottom: 12,
  },

  // MCQ options
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#ddd",
  },
  radioCircleSelected: {
    backgroundColor: "#FF9E6D",
  },
  optionText: {
    fontSize: 15,
    color: "#28221B",
  },
  optionTextSelected: {
    color: "#FF9E6D",
    fontWeight: "600",
  },

  // Text input
  textInput: {
    backgroundColor: "#FFF0E8",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 14,
    color: "#28221B",
  },

  // Bottom button
  bottomBtn: {
    position: "absolute",
    bottom: 34,
    left: 24,
    right: 24,
  },
  finishBtn: {
    backgroundColor: "#FF9E6D",
    borderRadius: 25,
    paddingVertical: 16,
    alignItems: "center",
  },
  finishBtnText: {
    color: "#FFFBFA",
    fontSize: 16,
    fontWeight: "600",
  },
});

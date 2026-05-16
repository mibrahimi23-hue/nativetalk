import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { safeBack } from "@/hooks/use-safe-back";
import {
  adminCreateExam,
  adminGetExam,
  adminUpdateExam,
  listLanguages,
} from "@/services/exams";
import { LANGUAGES as STATIC_LANGUAGES } from "@/constants/languages";
import { useInAppAlert } from "@/components/in-app-alert";

const SECTIONS = [
  { id: "reading", label: "Reading", icon: "book-outline" },
  { id: "speaking", label: "Speaking", icon: "mic-outline" },
  { id: "listening", label: "Listening", icon: "ear-outline" },
  { id: "writing", label: "Writing", icon: "create-outline" },
];

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export default function AdminExamBuilder() {
  // In-app styled alerts (no more native "localhost:8081 says…" popups).
  const { notify: notifyHook, confirmAction, AlertHost } = useInAppAlert();
  // The original `notify(title, msg, onAfter)` callers pass an optional
  // callback that should fire once the user dismisses the dialog. The
  // hook's notify resolves a Promise — bridge the two API shapes here.
  const notify = (title, message, onAfter) => {
    const p = notifyHook(title, message);
    if (onAfter) p.then(() => onAfter());
    return p;
  };

  // `examId` is set when the screen is reached by tapping a card on the
  // admin-exams list — that flips us into edit mode (prefill + PUT).
  const { examId: examIdParam } = useLocalSearchParams();
  const examId = Array.isArray(examIdParam) ? examIdParam[0] : examIdParam;
  const isEditing = Boolean(examId);

  // Languages come from the backend so admin can publish for any supported
  // language. Falls back to the static list if the API is unreachable.
  const [languagesList, setLanguagesList] = useState(STATIC_LANGUAGES);
  const [language, setLanguage] = useState(STATIC_LANGUAGES[0]?.name || "English");
  const [level, setLevel] = useState("A1");
  const [publishing, setPublishing] = useState(false);
  const [loadingExam, setLoadingExam] = useState(isEditing);

  useEffect(() => {
    let cancelled = false;
    listLanguages()
      .then((data) => {
        if (cancelled || !Array.isArray(data) || data.length === 0) return;
        setLanguagesList(data);
        if (!data.some((l) => l.name === language)) {
          setLanguage(data[0].name);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const [picker, setPicker] = useState(null); // 'language' | 'level'
  const [activeSection, setActiveSection] = useState("reading");

  const [questions, setQuestions] = useState({
    reading: [],
    speaking: [],
    listening: [],
    writing: [],
  });

  // When we land on the screen with an examId, fetch the full exam and
  // populate the same form fields the create flow uses. Question prompts
  // are stored as `[SectionLabel] real prompt` on the backend (the four
  // section tabs are UX-only), so we strip the prefix back into the right
  // section bucket here.
  useEffect(() => {
    if (!isEditing) return;
    let cancelled = false;
    setLoadingExam(true);
    adminGetExam(examId)
      .then((exam) => {
        if (cancelled || !exam) return;
        if (exam.language) setLanguage(exam.language);
        if (exam.level) setLevel(exam.level);

        const sectionLabelToId = SECTIONS.reduce((acc, s) => {
          acc[s.label.toLowerCase()] = s.id;
          return acc;
        }, {});
        const grouped = { reading: [], speaking: [], listening: [], writing: [] };
        for (const q of exam.questions || []) {
          const raw = q.question_text || "";
          const match = raw.match(/^\[(.+?)\]\s*(.*)$/s);
          let sectionId = "reading";
          let prompt = raw;
          if (match) {
            const labelKey = match[1].trim().toLowerCase();
            if (sectionLabelToId[labelKey]) {
              sectionId = sectionLabelToId[labelKey];
              prompt = match[2];
            }
          }
          const letters = ["A", "B", "C", "D"];
          const correctIndex = Math.max(
            0,
            letters.indexOf((q.correct_answer || "A").toUpperCase()),
          );
          grouped[sectionId].push({
            id: q.question_id,
            type: "mcq",
            prompt,
            options: [q.option_a, q.option_b, q.option_c, q.option_d],
            correctIndex,
          });
        }
        setQuestions(grouped);
        // Open the first section that actually has questions so the admin
        // sees something straight away.
        const firstNonEmpty = SECTIONS.find((s) => grouped[s.id].length > 0);
        if (firstNonEmpty) setActiveSection(firstNonEmpty.id);
      })
      .catch((e) => {
        if (cancelled) return;
        notifyHook(
          "Could not load exam",
          e?.message || "The exam could not be opened. Please try again.",
          { tone: "error" },
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingExam(false);
      });
    return () => {
      cancelled = true;
    };
  }, [examId, isEditing]);

  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [draftType, setDraftType] = useState("mcq"); // 'mcq' | 'text'
  const [draftPrompt, setDraftPrompt] = useState("");
  const [draftOptions, setDraftOptions] = useState(["", "", "", ""]);
  const [draftCorrect, setDraftCorrect] = useState(0);

  const sectionQuestions = questions[activeSection] || [];

  const totalQuestions = useMemo(
    () =>
      Object.values(questions).reduce((sum, list) => sum + list.length, 0),
    [questions],
  );

  const openNewQuestion = () => {
    setEditingQuestion(null);
    setDraftType("mcq");
    setDraftPrompt("");
    setDraftOptions(["", "", "", ""]);
    setDraftCorrect(0);
    setShowQuestionModal(true);
  };

  const openEditQuestion = (q) => {
    setEditingQuestion(q.id);
    setDraftType(q.type);
    setDraftPrompt(q.prompt);
    setDraftOptions(q.type === "mcq" ? [...q.options, "", "", "", ""].slice(0, 4) : ["", "", "", ""]);
    setDraftCorrect(q.type === "mcq" ? q.correctIndex ?? 0 : 0);
    setShowQuestionModal(true);
  };

  const handleSaveQuestion = () => {
    if (!draftPrompt.trim()) {
      notify("Prompt required", "Please enter the question prompt.");
      return;
    }
    if (draftType === "mcq") {
      const filled = draftOptions.filter((o) => o.trim());
      if (filled.length < 2) {
        notify(
          "Add options",
          "Multiple choice questions need at least 2 options.",
        );
        return;
      }
    }

    const newQuestion = {
      id: editingQuestion ?? Date.now(),
      prompt: draftPrompt.trim(),
      type: draftType,
      ...(draftType === "mcq"
        ? {
            options: draftOptions
              .map((o) => o.trim())
              .filter((o, i) => o || i < 2),
            correctIndex: draftCorrect,
          }
        : {}),
    };

    setQuestions((prev) => {
      const list = prev[activeSection] || [];
      const next = editingQuestion
        ? list.map((q) => (q.id === editingQuestion ? newQuestion : q))
        : [...list, newQuestion];
      return { ...prev, [activeSection]: next };
    });

    setShowQuestionModal(false);
  };

  const removeQuestion = async (id) => {
    const ok = await confirmAction(
      "Remove question?",
      "This will delete the question.",
    );
    if (!ok) return;
    setQuestions((prev) => ({
      ...prev,
      [activeSection]: prev[activeSection].filter((q) => q.id !== id),
    }));
  };

  const handlePublish = async () => {
    if (publishing) return;
    if (totalQuestions === 0) {
      notify("Empty exam", "Add at least one question before publishing.");
      return;
    }

    // The DB stores flat MCQ questions; the four section tabs are just a UX
    // grouping in the builder. Flatten everything into a single payload and
    // skip any open-answer drafts (backend only supports A/B/C/D today).
    const flat = [];
    for (const section of SECTIONS) {
      const list = questions[section.id] || [];
      for (const q of list) {
        if (q.type !== "mcq") continue;
        const options = q.options || [];
        const letters = ["A", "B", "C", "D"];
        const filled = options.map((o) => (o || "").trim());
        // Backend requires four options. Pad missing entries with placeholder
        // copies of the question prompt so the row still satisfies NOT NULL.
        while (filled.length < 4) filled.push(filled[0] || q.prompt || "—");
        const correctIdx = Math.max(0, Math.min(3, q.correctIndex ?? 0));
        flat.push({
          question_text: `[${section.label}] ${q.prompt}`,
          option_a: filled[0] || "—",
          option_b: filled[1] || "—",
          option_c: filled[2] || "—",
          option_d: filled[3] || "—",
          correct_answer: letters[correctIdx],
        });
      }
    }

    if (flat.length === 0) {
      notify(
        "No MCQ questions",
        "Add at least one multiple choice question — the backend only stores MCQ exams today.",
      );
      return;
    }

    const lang = languagesList.find((l) => l.name === language);
    if (!lang?.id) {
      notify("Language not recognised", "Pick a language from the list.");
      return;
    }

    setPublishing(true);
    try {
      const payload = {
        language_id: Number(lang.id),
        level,
        title: `${language} ${level} exam`,
        questions: flat,
      };
      const result = isEditing
        ? await adminUpdateExam(examId, payload)
        : await adminCreateExam({ ...payload, is_active: true });
      // eslint-disable-next-line no-console
      console.log("[admin-exam-builder] save OK", result);

      // Reset the form so a second publish doesn't carry stale questions or
      // section tabs forward — even though navigating away unmounts the screen,
      // we reset defensively in case the user bounces back via history.
      setQuestions({ reading: [], speaking: [], listening: [], writing: [] });
      setActiveSection("reading");

      const count = result.total_questions ?? flat.length;
      const langName = result.language || language;
      const levelName = result.level || level;
      const successTitle = isEditing ? "Changes saved" : "Exam published";
      const publishedLabel =
        result.is_active === false ? "saved (currently unpublished)" : "published";
      const successMessage = isEditing
        ? `${langName} ${levelName} exam updated with ${count} question${count === 1 ? "" : "s"}.`
        : `${langName} ${levelName} exam ${publishedLabel} with ${count} question${count === 1 ? "" : "s"}. Tutors of that language will see it.`;

      // Success tone → green check icon, dismiss auto-navigates back.
      notifyHook(successTitle, successMessage, { tone: "success" }).then(() =>
        router.replace(isEditing ? "/admin-exams" : "/admin-dashboard"),
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log("[admin-exam-builder] save failed", e);
      notifyHook(
        isEditing ? "Could not save changes" : "Could not publish",
        e?.message ||
          "The server rejected the request. Make sure the exams migration has been applied and you are logged in as admin.",
        { tone: "error" },
      );
    } finally {
      setPublishing(false);
    }
  };

  const pickerOptions =
    picker === "language"
      ? languagesList.map((l) => l.name)
      : picker === "level"
      ? LEVELS
      : [];

  const choosePickerOption = (val) => {
    if (picker === "language") setLanguage(val);
    if (picker === "level") setLevel(val);
    setPicker(null);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => safeBack(isEditing ? "/admin-exams" : "/admin-dashboard")}
        >
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEditing ? "Edit Exam" : "Exam Builder"}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {loadingExam && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#FF9E6D" />
        </View>
      )}
      {!loadingExam && (
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.metaRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.metaLabel}>Language</Text>
            <TouchableOpacity
              style={styles.metaSelect}
              onPress={() => setPicker("language")}
            >
              <Text style={styles.metaSelectText}>{language}</Text>
              <Ionicons name="chevron-down" size={16} color="#7E6D66" />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.metaLabel}>Level</Text>
            <TouchableOpacity
              style={styles.metaSelect}
              onPress={() => setPicker("level")}
            >
              <Text style={styles.metaSelectText}>{level}</Text>
              <Ionicons name="chevron-down" size={16} color="#7E6D66" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.tabList}>
          {SECTIONS.map((section) => {
            const active = activeSection === section.id;
            const count = questions[section.id]?.length ?? 0;
            return (
              <TouchableOpacity
                key={section.id}
                style={[styles.tabItem, active && styles.tabItemActive]}
                onPress={() => setActiveSection(section.id)}
              >
                <Ionicons
                  name={section.icon}
                  size={16}
                  color={active ? "#FF9E6D" : "#7E6D66"}
                />
                <Text
                  style={[styles.tabLabel, active && styles.tabLabelActive]}
                >
                  {section.label}
                </Text>
                {count > 0 && (
                  <View style={styles.tabCount}>
                    <Text style={styles.tabCountText}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>
          {SECTIONS.find((s) => s.id === activeSection).label} questions
        </Text>

        {sectionQuestions.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="help-circle-outline" size={26} color="#A89080" />
            <Text style={styles.emptyTitle}>No questions yet</Text>
            <Text style={styles.emptyText}>
              Add a question to start building this section of the exam.
            </Text>
          </View>
        ) : (
          sectionQuestions.map((q, index) => (
            <View key={q.id} style={styles.questionCard}>
              <View style={styles.questionHead}>
                <Text style={styles.questionIndex}>Q{index + 1}</Text>
                <Text style={styles.questionType}>
                  {q.type === "mcq" ? "Multiple choice" : "Open answer"}
                </Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                  onPress={() => openEditQuestion(q)}
                  style={styles.iconBtn}
                >
                  <Ionicons name="pencil" size={16} color="#28221B" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removeQuestion(q.id)}
                  style={styles.iconBtn}
                >
                  <Ionicons name="trash-outline" size={16} color="#DD8153" />
                </TouchableOpacity>
              </View>

              <Text style={styles.questionPrompt}>{q.prompt}</Text>

              {q.type === "mcq" &&
                q.options.map((opt, i) => (
                  <View key={i} style={styles.optionRow}>
                    <Ionicons
                      name={
                        i === q.correctIndex
                          ? "checkmark-circle"
                          : "ellipse-outline"
                      }
                      size={16}
                      color={i === q.correctIndex ? "#FF9E6D" : "#A89080"}
                    />
                    <Text
                      style={[
                        styles.optionText,
                        i === q.correctIndex && styles.optionTextCorrect,
                      ]}
                    >
                      {opt || `Option ${i + 1}`}
                    </Text>
                  </View>
                ))}
            </View>
          ))
        )}

        <TouchableOpacity style={styles.addBtn} onPress={openNewQuestion}>
          <Ionicons name="add" size={18} color="#FFFBFA" />
          <Text style={styles.addBtnText}>Add question</Text>
        </TouchableOpacity>
      </ScrollView>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {totalQuestions} total question{totalQuestions === 1 ? "" : "s"}
        </Text>
        <TouchableOpacity
          style={[styles.publishBtn, publishing && { opacity: 0.6 }]}
          onPress={handlePublish}
          disabled={publishing}
        >
          {publishing ? (
            <ActivityIndicator color="#FFFBFA" />
          ) : (
            <Text style={styles.publishText}>
              {isEditing ? "Save changes" : "Publish exam"}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={picker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPicker(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>
              {picker === "language" ? "Select language" : "Select level"}
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {pickerOptions.map((opt) => {
                const selected =
                  (picker === "language" && opt === language) ||
                  (picker === "level" && opt === level);
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.sheetRow,
                      selected && styles.sheetRowSelected,
                    ]}
                    onPress={() => choosePickerOption(opt)}
                  >
                    <Text
                      style={[
                        styles.sheetRowText,
                        selected && styles.sheetRowTextSelected,
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

      <Modal
        visible={showQuestionModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowQuestionModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowQuestionModal(false)}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>
              {editingQuestion ? "Edit question" : "New question"}
            </Text>

            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[
                  styles.typeBtn,
                  draftType === "mcq" && styles.typeBtnActive,
                ]}
                onPress={() => setDraftType("mcq")}
              >
                <Text
                  style={[
                    styles.typeText,
                    draftType === "mcq" && styles.typeTextActive,
                  ]}
                >
                  Multiple choice
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeBtn,
                  draftType === "text" && styles.typeBtnActive,
                ]}
                onPress={() => setDraftType("text")}
              >
                <Text
                  style={[
                    styles.typeText,
                    draftType === "text" && styles.typeTextActive,
                  ]}
                >
                  Open answer
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Prompt</Text>
            <TextInput
              style={styles.textArea}
              value={draftPrompt}
              onChangeText={setDraftPrompt}
              placeholder="What do you want to ask?"
              placeholderTextColor="#8D7C74"
              multiline
            />

            {draftType === "mcq" && (
              <>
                <Text style={styles.fieldLabel}>
                  Options (tap circle to mark the correct answer)
                </Text>
                {draftOptions.map((opt, i) => (
                  <View key={i} style={styles.optionEditRow}>
                    <TouchableOpacity
                      onPress={() => setDraftCorrect(i)}
                      hitSlop={6}
                    >
                      <Ionicons
                        name={
                          i === draftCorrect
                            ? "checkmark-circle"
                            : "ellipse-outline"
                        }
                        size={20}
                        color={i === draftCorrect ? "#FF9E6D" : "#A89080"}
                      />
                    </TouchableOpacity>
                    <TextInput
                      style={styles.optionInput}
                      value={opt}
                      onChangeText={(t) =>
                        setDraftOptions((prev) =>
                          prev.map((p, idx) => (idx === i ? t : p)),
                        )
                      }
                      placeholder={`Option ${i + 1}`}
                      placeholderTextColor="#8D7C74"
                    />
                  </View>
                ))}
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setShowQuestionModal(false)}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={handleSaveQuestion}
              >
                <Text style={styles.modalBtnPrimaryText}>
                  {editingQuestion ? "Save" : "Add"}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <AlertHost />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: "#FFFBFA" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 55,
    paddingBottom: 14,
    paddingHorizontal: 20,
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
    fontFamily: "Domine",
    fontSize: 16,
    color: "#28221B",
  },

  metaRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 8,
  },

  metaLabel: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    marginBottom: 6,
  },

  metaSelect: {
    height: 42,
    backgroundColor: "#F1E5E1",
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  metaSelectText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    fontWeight: "600",
  },

  tabList: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  tabItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "#F3EDEA",
  },

  tabItemActive: {
    backgroundColor: "#FFF1E8",
    borderWidth: 1,
    borderColor: "#FF9E6D",
  },

  tabLabel: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
  },

  tabLabelActive: {
    color: "#FF9E6D",
    fontWeight: "700",
  },

  tabCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FF9E6D",
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },

  tabCountText: {
    fontFamily: "Outfit",
    fontSize: 10,
    color: "#FFFBFA",
    fontWeight: "700",
  },

  sectionTitle: {
    fontFamily: "Domine",
    fontSize: 18,
    color: "#28221B",
    paddingHorizontal: 20,
    marginBottom: 12,
  },

  emptyBox: {
    alignItems: "center",
    paddingVertical: 38,
    paddingHorizontal: 24,
    backgroundColor: "#FFF1E8",
    borderRadius: 14,
    marginHorizontal: 20,
    marginBottom: 16,
  },

  emptyTitle: {
    fontFamily: "Domine",
    fontSize: 14,
    color: "#28221B",
    marginTop: 6,
  },

  emptyText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    textAlign: "center",
    marginTop: 4,
  },

  questionCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 14,
    backgroundColor: "#FFFBFA",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F0EDEA",
  },

  questionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },

  questionIndex: {
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "700",
    color: "#FF9E6D",
  },

  questionType: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
    backgroundColor: "#F3EDEA",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },

  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3EDEA",
    alignItems: "center",
    justifyContent: "center",
  },

  questionPrompt: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#28221B",
    fontWeight: "600",
    marginBottom: 8,
  },

  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },

  optionText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
  },

  optionTextCorrect: {
    color: "#FF9E6D",
    fontWeight: "600",
  },

  addBtn: {
    marginTop: 8,
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    backgroundColor: "#FF9E6D",
    borderRadius: 22,
  },

  addBtnText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: "#FFFBFA",
    borderTopWidth: 1,
    borderTopColor: "#EFE6E1",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  footerText: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
  },

  publishBtn: {
    paddingHorizontal: 22,
    height: 42,
    borderRadius: 22,
    // Matches the rest of the project's primary action pill (the orange
    // "Sign Up", "Confirm Payment", "Continue with account" buttons).
    backgroundColor: "#FF9E6D",
    alignItems: "center",
    justifyContent: "center",
  },

  publishText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#FFFBFA",
    fontWeight: "700",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(40, 34, 27, 0.45)",
    justifyContent: "flex-end",
  },

  sheet: {
    backgroundColor: "#FFFBFA",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 22,
    paddingBottom: 32,
    maxHeight: "85%",
  },

  sheetTitle: {
    fontFamily: "Domine",
    fontSize: 16,
    color: "#28221B",
    textAlign: "center",
    marginBottom: 14,
  },

  sheetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 6,
  },

  sheetRowSelected: {
    backgroundColor: "#FFF1E8",
  },

  sheetRowText: {
    fontFamily: "Outfit",
    fontSize: 15,
    color: "#28221B",
  },

  sheetRowTextSelected: {
    color: "#FF9E6D",
    fontWeight: "700",
  },

  typeRow: {
    flexDirection: "row",
    backgroundColor: "#F1E5E1",
    borderRadius: 22,
    padding: 4,
    marginBottom: 16,
  },

  typeBtn: {
    flex: 1,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },

  typeBtnActive: {
    backgroundColor: "#FF9E6D",
  },

  typeText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
  },

  typeTextActive: {
    color: "#FFFBFA",
    fontWeight: "700",
  },

  fieldLabel: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    fontWeight: "600",
    marginBottom: 8,
  },

  textArea: {
    backgroundColor: "#F3EDEA",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#28221B",
    minHeight: 70,
    textAlignVertical: "top",
    marginBottom: 16,
  },

  optionEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },

  optionInput: {
    flex: 1,
    height: 40,
    backgroundColor: "#F3EDEA",
    borderRadius: 12,
    paddingHorizontal: 12,
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
  },

  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },

  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  modalBtnGhost: {
    backgroundColor: "#F3EDEA",
  },

  modalBtnGhostText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    fontWeight: "600",
  },

  modalBtnPrimary: {
    backgroundColor: "#FF9E6D",
  },

  modalBtnPrimaryText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
    fontWeight: "700",
  },
});

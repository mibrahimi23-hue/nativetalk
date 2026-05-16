import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { TutorBottomNav } from "@/components/tutor-bottom-nav";
import { useUser } from "@/contexts/user-context";
import { useSafeBack } from "@/hooks/use-safe-back";
import { buildMediaUrl } from "@/services/api";
import { deleteMaterial, listMaterials, uploadMaterial } from "@/services/materials";
import { updateLesson as updateLessonOnBackend } from "@/services/lessons";
import { findLanguageById, findLanguageByName } from "@/constants/languages";

const TABS = ["A1", "A2", "B1", "B2"];
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export default function LanguageLessons() {
  const { lessons, role, profile, user, updateLesson } = useUser();
  const safeBack = useSafeBack();
  const [activeTab, setActiveTab] = useState("A1");
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialFile, setMaterialFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lessonsState, setLessonsState] = useState("preview");
  const [materialsState, setMaterialsState] = useState("preview");

  // Edit-lesson modal state. Stores the lesson currently being edited plus
  // the draft fields. Only tutors get to open this; the row's edit pencil
  // is hidden for students and for booked sessions.
  const [editingLesson, setEditingLesson] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLevel, setEditLevel] = useState("A1");
  const [editLevelPickerOpen, setEditLevelPickerOpen] = useState(false);
  const [savingLessonEdit, setSavingLessonEdit] = useState(false);

  // Materials are now loaded from the backend. Tutor sees their own uploads;
  // student sees materials matching their enrolled language(s) and the level
  // tab they're viewing. The previous in-memory `materials` from useUser()
  // never reached the backend so the student couldn't see what the tutor
  // added.
  const [materials, setMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  const isTutor = role === "Tutor";

  const loadMaterials = useCallback(async () => {
    setLoadingMaterials(true);
    try {
      const lang =
        findLanguageById(profile.languageId) ||
        findLanguageByName(profile.language);
      const data = await listMaterials({
        level: activeTab,
        language_id: lang?.id,
      });
      setMaterials(Array.isArray(data) ? data : []);
    } catch {
      setMaterials([]);
    } finally {
      setLoadingMaterials(false);
    }
  }, [activeTab, profile.languageId, profile.language]);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  const allVisibleLessons = lessons.filter(
    (l) => !l.level || l.level === activeTab,
  );

  const visibleLessons =
    lessonsState === "collapsed"
      ? []
      : lessonsState === "expanded"
      ? allVisibleLessons
      : allVisibleLessons.slice(0, 3);

  const visibleMaterials =
    materialsState === "collapsed"
      ? []
      : materialsState === "expanded"
      ? materials
      : materials.slice(0, 3);

  const cycleLessonsState = () => {
    setLessonsState((prev) =>
      prev === "preview" ? "expanded" : prev === "expanded" ? "collapsed" : "preview",
    );
  };

  const cycleMaterialsState = () => {
    setMaterialsState((prev) =>
      prev === "preview" ? "expanded" : prev === "expanded" ? "collapsed" : "preview",
    );
  };

  const lessonsBtnLabel =
    lessonsState === "preview"
      ? `Show all (${allVisibleLessons.length})`
      : lessonsState === "expanded"
      ? "Hide all"
      : "Show preview";

  const materialsBtnLabel =
    materialsState === "preview"
      ? `Show all (${materials.length})`
      : materialsState === "expanded"
      ? "Hide all"
      : "Show preview";

  const lessonsChevron =
    lessonsState === "preview"
      ? "chevron-down"
      : lessonsState === "expanded"
      ? "chevron-up"
      : "chevron-forward";

  const materialsChevron =
    materialsState === "preview"
      ? "chevron-down"
      : materialsState === "expanded"
      ? "chevron-up"
      : "chevron-forward";

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*", "audio/mpeg"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      setMaterialFile(asset);
    } catch (e) {
      Alert.alert("Could not pick file", e?.message || "Please try again.");
    }
  };

  const handleSaveMaterial = async () => {
    if (saving) return;
    if (!materialTitle.trim()) {
      Alert.alert("Title required", "Please enter a title for the material.");
      return;
    }
    if (!materialFile) {
      Alert.alert(
        "Document required",
        "Please attach a document for the material.",
      );
      return;
    }
    const lang =
      findLanguageById(profile.languageId) ||
      findLanguageByName(profile.language) ||
      (user?.language_id ? findLanguageById(user.language_id) : null);
    if (!lang?.id) {
      Alert.alert(
        "Language unknown",
        "Could not determine your teaching language. Update your profile first.",
      );
      return;
    }

    setSaving(true);
    try {
      // Pick a sensible default `type` since the wireframe modal doesn't ask
      // for it. Backend requires one of: vocabulary_list, grammar_guide,
      // practice_exercises, audio_lesson. We default to grammar_guide and
      // switch to audio_lesson when the file is audio.
      const isAudio =
        (materialFile.mimeType || "").startsWith("audio/") ||
        /\.(mp3|m4a|wav)$/i.test(materialFile.name || "");
      await uploadMaterial({
        title: materialTitle.trim(),
        type: isAudio ? "audio_lesson" : "grammar_guide",
        description: "",
        language_id: lang.id,
        level: activeTab,
        fileUri: materialFile.uri,
        // Pass the raw asset through too so the multipart upload uses the
        // real File object on web.
        asset: materialFile,
      });
      setMaterialTitle("");
      setMaterialFile(null);
      setShowMaterialModal(false);
      await loadMaterials();
    } catch (e) {
      Alert.alert("Upload failed", e?.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // A lesson is editable when it was created by the tutor (i.e. a lesson_note
  // — surfaced with status "upcoming" or "completed" and no live join button).
  // Booked sessions (status "join") are driven by the booking, not the tutor,
  // so we don't show an edit affordance for those.
  const isEditableLesson = (lesson) =>
    isTutor && lesson && lesson.status !== "join";

  const openEditLesson = (lesson) => {
    setEditingLesson(lesson);
    setEditTitle(lesson.title || "");
    setEditDescription(lesson.description || "");
    setEditLevel(lesson.level || activeTab || "A1");
    setEditLevelPickerOpen(false);
  };

  const closeEditLesson = () => {
    if (savingLessonEdit) return;
    setEditingLesson(null);
    setEditLevelPickerOpen(false);
  };

  const handleSaveLessonEdit = async () => {
    if (savingLessonEdit || !editingLesson) return;
    const title = editTitle.trim();
    if (!title) {
      Alert.alert("Title required", "Please enter a title for the lesson.");
      return;
    }
    if (!LEVELS.includes(editLevel)) {
      Alert.alert("Pick a level", "Choose one of A1, A2, B1, B2, C1, C2.");
      return;
    }

    setSavingLessonEdit(true);
    try {
      const payload = {
        title,
        description: editDescription.trim(),
        level: editLevel,
      };
      // Lessons created in-memory in this session use a numeric `Date.now()`
      // id (no backend row yet), so we only persist the change to the API
      // when the id looks like a UUID. Either way the in-memory copy is
      // refreshed so the UI reflects the edit immediately.
      const looksLikeUuid =
        typeof editingLesson.id === "string" &&
        /^[0-9a-f-]{30,}$/i.test(editingLesson.id);
      if (looksLikeUuid) {
        await updateLessonOnBackend(editingLesson.id, payload);
      }
      updateLesson(editingLesson.id, payload);
      setEditingLesson(null);
    } catch (e) {
      Alert.alert(
        "Could not save",
        e?.message || "The lesson could not be updated. Please try again.",
      );
    } finally {
      setSavingLessonEdit(false);
    }
  };

  const handleDeleteMaterial = (mat) => {
    if (deletingId) return;
    const performDelete = async () => {
      setDeletingId(mat.id);
      try {
        await deleteMaterial(mat.id);
        await loadMaterials();
      } catch (e) {
        Alert.alert(
          "Could not delete",
          e?.message || "The material could not be deleted. Please try again.",
        );
      } finally {
        setDeletingId(null);
      }
    };

    if (Platform.OS === "web") {
      const ok = typeof window !== "undefined" && window.confirm
        ? window.confirm(`Delete "${mat.title}"? This cannot be undone.`)
        : true;
      if (ok) performDelete();
      return;
    }
    Alert.alert(
      "Delete material",
      `Delete "${mat.title}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: performDelete },
      ],
    );
  };

  const handleOpenMaterial = async (mat) => {
    const url = buildMediaUrl(mat.download_url || mat.file_path);
    if (!url) {
      Alert.alert("No document", "This material doesn't have a file attached.");
      return;
    }
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) await Linking.openURL(url);
      else if (Platform.OS === "web") window.open(url, "_blank");
    } catch {
      if (Platform.OS === "web") window.open(url, "_blank");
    }
  };

  const closeModal = () => {
    setShowMaterialModal(false);
    setMaterialTitle("");
    setMaterialFile(null);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Language Lessons</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.tabRow}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={styles.tabItem}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.tabTextActive,
              ]}
            >
              {tab}
            </Text>
            {activeTab === tab && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Lessons</Text>
        </View>

        {allVisibleLessons.length === 0 && (
          <Text style={styles.emptyText}>No lessons for this level yet.</Text>
        )}

        {visibleLessons.map((lesson, index) => (
          <View key={lesson.id}>
            <View style={styles.lessonRow}>
              {lesson.status === "completed" ? (
                <View style={styles.completedSquare} />
              ) : (
                <View style={styles.emptySquare} />
              )}

              <View style={styles.lessonInfo}>
                <Text style={styles.lessonTitle}>{lesson.title}</Text>

                {lesson.status === "completed" ? (
                  <Text style={styles.completedText}>Completed</Text>
                ) : (
                  <Text style={styles.lessonMeta}>
                    {lesson.date} {lesson.time}
                  </Text>
                )}
              </View>

              {isEditableLesson(lesson) && (
                <TouchableOpacity
                  style={styles.editLessonBtn}
                  onPress={() => openEditLesson(lesson)}
                >
                  <Ionicons name="pencil" size={16} color="#28221B" />
                </TouchableOpacity>
              )}

              {lesson.status === "join" && (
                <TouchableOpacity
                  style={styles.joinBtn}
                  onPress={() =>
                    router.push({
                      pathname: "/videocall",
                      params: lesson.id ? { sessionId: String(lesson.id) } : {},
                    })
                  }
                >
                  <Text style={styles.joinText}>Join</Text>
                </TouchableOpacity>
              )}
            </View>

            {index < visibleLessons.length - 1 && (
              <View style={styles.divider} />
            )}
          </View>
        ))}

        {allVisibleLessons.length > 3 && (
          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={cycleLessonsState}
          >
            <Ionicons name={lessonsChevron} size={16} color="#FFFBFA" />
            <Text style={styles.toggleText}>{lessonsBtnLabel}</Text>
          </TouchableOpacity>
        )}

        {isTutor && (
          <View style={styles.actionRow}>
            
            {visibleLessons.length !== 0 && (
              <TouchableOpacity
              style={styles.cancelBtn}
                onPress={() => router.push("/cancel-session")}
              >
                <Text style={styles.cancelText}>Cancel Upcoming lesson</Text>
              </TouchableOpacity>
            )}
            

            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => router.push("/add-lesson")}
            >
              <Text style={styles.addText}>+ Add Lesson</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.materialsHeader}>
          <Text style={styles.sectionTitle}>Materials</Text>
        </View>

        {loadingMaterials ? (
          <ActivityIndicator color="#FF9E6D" style={{ marginTop: 10 }} />
        ) : materials.length === 0 ? (
          <Text style={styles.emptyText}>No materials yet.</Text>
        ) : null}

        {visibleMaterials.map((mat, index) => (
          <View key={mat.id}>
            <View style={styles.materialRow}>
              <Text style={styles.materialTitle}>{mat.title}</Text>
              <View style={styles.materialActions}>
                <TouchableOpacity
                  style={styles.downloadIcon}
                  onPress={() => handleOpenMaterial(mat)}
                >
                  <Ionicons name="download-outline" size={20} color="#28221B" />
                </TouchableOpacity>
                {isTutor && (
                  <TouchableOpacity
                    style={styles.deleteIcon}
                    onPress={() => handleDeleteMaterial(mat)}
                    disabled={deletingId === mat.id}
                  >
                    {deletingId === mat.id ? (
                      <ActivityIndicator size="small" color="#DD8153" />
                    ) : (
                      <Ionicons name="trash-outline" size={18} color="#DD8153" />
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {index < visibleMaterials.length - 1 && <View style={styles.divider} />}
          </View>
        ))}

        {materials.length > 3 && (
          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={cycleMaterialsState}
          >
            <Ionicons name={materialsChevron} size={16} color="#FFFBFA" />
            <Text style={styles.toggleText}>{materialsBtnLabel}</Text>
          </TouchableOpacity>
        )}

        {isTutor && (
          <TouchableOpacity
            style={[styles.addBtn, { marginTop: 24 }]}
            onPress={() => setShowMaterialModal(true)}
          >
            <Text style={styles.addText}>+ Add Material</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 90 }} />
      </ScrollView>

      <TutorBottomNav />

      <Modal
        visible={showMaterialModal}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Add Material</Text>

            <Text style={styles.modalLabel}>Title</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Chapter 1 Vocabulary"
              placeholderTextColor="#8D7C74"
              value={materialTitle}
              onChangeText={setMaterialTitle}
            />

            <Text style={styles.modalLabel}>Document</Text>
            <TouchableOpacity
              style={styles.modalUpload}
              onPress={handlePickFile}
            >
              <Ionicons
                name={materialFile ? "document-attach" : "cloud-upload-outline"}
                size={20}
                color="#FF9E6D"
              />
              <Text style={styles.modalUploadText}>
                {materialFile
                  ? materialFile.name
                  : "Tap to attach a document"}
              </Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={closeModal}
                disabled={saving}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnPrimary,
                  saving && { opacity: 0.7 },
                ]}
                onPress={handleSaveMaterial}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFBFA" />
                ) : (
                  <Text style={styles.modalBtnPrimaryText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={editingLesson !== null}
        transparent
        animationType="fade"
        onRequestClose={closeEditLesson}
      >
        <Pressable style={styles.modalOverlay} onPress={closeEditLesson}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Edit Lesson</Text>

            <Text style={styles.modalLabel}>Title</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Lesson title"
              placeholderTextColor="#8D7C74"
              value={editTitle}
              onChangeText={setEditTitle}
            />

            <Text style={styles.modalLabel}>Description</Text>
            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Description"
              placeholderTextColor="#8D7C74"
              value={editDescription}
              onChangeText={setEditDescription}
              multiline
            />

            <Text style={styles.modalLabel}>Level</Text>
            <TouchableOpacity
              style={styles.levelSelect}
              onPress={() => setEditLevelPickerOpen((open) => !open)}
            >
              <Text style={styles.levelSelectText}>{editLevel}</Text>
              <Ionicons
                name={editLevelPickerOpen ? "chevron-up" : "chevron-down"}
                size={16}
                color="#FFFBFA"
              />
            </TouchableOpacity>
            {editLevelPickerOpen && (
              <View style={styles.levelOptions}>
                {LEVELS.map((lvl) => {
                  const selected = lvl === editLevel;
                  return (
                    <TouchableOpacity
                      key={lvl}
                      style={[
                        styles.levelOptionRow,
                        selected && styles.levelOptionRowSelected,
                      ]}
                      onPress={() => {
                        setEditLevel(lvl);
                        setEditLevelPickerOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.levelOptionText,
                          selected && styles.levelOptionTextSelected,
                        ]}
                      >
                        {lvl}
                      </Text>
                      {selected && (
                        <Ionicons name="checkmark" size={16} color="#FF9E6D" />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={closeEditLesson}
                disabled={savingLessonEdit}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnPrimary,
                  savingLessonEdit && { opacity: 0.7 },
                ]}
                onPress={handleSaveLessonEdit}
                disabled={savingLessonEdit}
              >
                {savingLessonEdit ? (
                  <ActivityIndicator color="#FFFBFA" />
                ) : (
                  <Text style={styles.modalBtnPrimaryText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#FFFBFA",
  },

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
    fontFamily: "Domine",
    fontSize: 17,
    color: "#28221B",
  },

  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#EFE6E1",
  },

  tabItem: {
    marginRight: 24,
    paddingBottom: 8,
    alignItems: "center",
  },

  tabText: {
    fontFamily: "Outfit",
    fontSize: 15,
    color: "#aaa",
  },

  tabTextActive: {
    color: "#28221B",
    fontWeight: "700",
  },

  tabUnderline: {
    position: "absolute",
    bottom: 0,
    height: 2,
    width: "100%",
    backgroundColor: "#28221B",
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },

  sectionTitle: {
    fontFamily: "Domine",
    fontSize: 20,
    color: "#28221B",
    marginBottom: 16,
  },

  emptyText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#A89080",
    marginBottom: 14,
  },

  lessonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },

  completedSquare: {
    width: 14,
    height: 14,
    borderRadius: 2,
    backgroundColor: "#DD8153",
    marginRight: 12,
  },

  emptySquare: {
    width: 14,
    height: 14,
    marginRight: 12,
  },

  lessonInfo: {
    flex: 1,
  },

  lessonTitle: {
    fontFamily: "Outfit",
    fontSize: 15,
    color: "#28221B",
    fontWeight: "600",
  },

  completedText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#aaa",
    marginTop: 3,
  },

  lessonMeta: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#7E6D66",
    marginTop: 3,
  },

  editLessonBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3EDEA",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },

  joinBtn: {
    backgroundColor: "#FF9E6D",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 25,
  },

  joinText: {
    fontFamily: "Outfit",
    color: "#FFFBFA",
    fontSize: 15,
  },

  divider: {
    height: 1,
    backgroundColor: "#EFE6E1",
  },

  actionRow: {
    marginTop: 24,
    marginBottom: 32,
    gap: 12,
  },

  cancelBtn: {
    backgroundColor: "#DD8153",
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignSelf: "flex-start",
  },

  cancelText: {
    fontFamily: "Outfit",
    color: "#FFFBFA",
    fontSize: 14,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
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

  addBtn: {
    backgroundColor: "#FF9E6D",
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignSelf: "center",
  },

  addText: {
    fontFamily: "Outfit",
    color: "#FFFBFA",
    fontSize: 15,
  },

  materialsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 16,
  },

  materialRow: {
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  materialTitle: {
    fontFamily: "Outfit",
    fontSize: 15,
    color: "#28221B",
  },

  downloadIcon: {
    padding: 2,
  },

  materialActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  deleteIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFF1E8",
    alignItems: "center",
    justifyContent: "center",
  },

  bottomNav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 70,
    backgroundColor: "#FFFBFA",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#EFE6E1",
    paddingBottom: 10,
  },

  navItem: {
    padding: 10,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(40, 34, 27, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },

  modalCard: {
    width: "100%",
    backgroundColor: "#FFFBFA",
    borderRadius: 18,
    padding: 22,
  },

  modalTitle: {
    fontFamily: "Domine",
    fontSize: 18,
    color: "#28221B",
    marginBottom: 16,
    textAlign: "center",
  },

  modalLabel: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    marginBottom: 6,
  },

  modalInput: {
    backgroundColor: "#F3EDEA",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#28221B",
    marginBottom: 16,
  },

  modalTextArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },

  levelSelect: {
    backgroundColor: "#DD8153",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },

  levelSelectText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  levelOptions: {
    backgroundColor: "#F3EDEA",
    borderRadius: 14,
    padding: 6,
    marginTop: -8,
    marginBottom: 16,
  },

  levelOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
  },

  levelOptionRowSelected: {
    backgroundColor: "#FFF1E8",
  },

  levelOptionText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#28221B",
  },

  levelOptionTextSelected: {
    color: "#FF9E6D",
    fontWeight: "700",
  },

  modalUpload: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3EDEA",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
    marginBottom: 22,
  },

  modalUploadText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    flex: 1,
  },

  modalActions: {
    flexDirection: "row",
    gap: 10,
  },

  modalBtn: {
    flex: 1,
    borderRadius: 22,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  modalBtnGhost: {
    backgroundColor: "#F3EDEA",
  },

  modalBtnGhostText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#28221B",
  },

  modalBtnPrimary: {
    backgroundColor: "#FF9E6D",
  },

  modalBtnPrimaryText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
    fontWeight: "600",
  },
});

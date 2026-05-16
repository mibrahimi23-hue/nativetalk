import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useUser } from "@/contexts/user-context";
import { useSafeBack } from "@/hooks/use-safe-back";
import { deleteMaterial, listMaterials, uploadMaterial } from "@/services/materials";
import { createLesson } from "@/services/lessons";
import { findLanguageById, findLanguageByName } from "@/constants/languages";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export default function AddLesson() {
  const { addLesson, profile } = useUser();
  const safeBack = useSafeBack();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState(null);
  const [pickedMaterials, setPickedMaterials] = useState([]);
  const [picker, setPicker] = useState(null); // 'level' | 'materials' | null

  // Materials picker is now backed by the real `/materials/` endpoint so the
  // tutor sees everything they've uploaded across sessions. The in-memory
  // `useUser().materials` was only the local React state for one screen.
  const [materials, setMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [newMaterialTitle, setNewMaterialTitle] = useState("");
  const [newMaterialFile, setNewMaterialFile] = useState(null);
  const [showNewMaterial, setShowNewMaterial] = useState(false);
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const [deletingMaterialId, setDeletingMaterialId] = useState(null);

  const reloadMaterials = useCallback(async () => {
    setLoadingMaterials(true);
    try {
      const lang =
        findLanguageById(profile.languageId) ||
        findLanguageByName(profile.language);
      const data = await listMaterials({
        language_id: lang?.id,
        level: level || undefined,
      });
      setMaterials(Array.isArray(data) ? data : []);
    } catch {
      setMaterials([]);
    } finally {
      setLoadingMaterials(false);
    }
  }, [profile.languageId, profile.language, level]);

  useEffect(() => {
    reloadMaterials();
  }, [reloadMaterials]);

  const toggleMaterial = (id) => {
    setPickedMaterials((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleDeleteMaterial = (mat) => {
    if (deletingMaterialId) return;
    const performDelete = async () => {
      setDeletingMaterialId(mat.id);
      try {
        await deleteMaterial(mat.id);
        // Drop the picked-id too if it was selected, otherwise the lesson
        // would carry a reference to a row that no longer exists.
        setPickedMaterials((prev) => prev.filter((id) => id !== mat.id));
        await reloadMaterials();
      } catch (e) {
        Alert.alert(
          "Could not delete",
          e?.message || "The material could not be deleted. Please try again.",
        );
      } finally {
        setDeletingMaterialId(null);
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

  const pickNewMaterialFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*", "audio/mpeg"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (asset) setNewMaterialFile(asset);
    } catch (e) {
      Alert.alert("Could not pick file", e?.message || "Please try again.");
    }
  };

  const saveNewMaterial = async () => {
    if (uploadingMaterial) return;
    if (!newMaterialTitle.trim()) {
      Alert.alert("Title required", "Enter a title for the new material.");
      return;
    }
    if (!newMaterialFile) {
      Alert.alert("Document required", "Attach a document first.");
      return;
    }
    const lang =
      findLanguageById(profile.languageId) ||
      findLanguageByName(profile.language);
    if (!lang?.id) {
      Alert.alert(
        "Language unknown",
        "Set your teaching language on your profile before adding materials.",
      );
      return;
    }
    setUploadingMaterial(true);
    try {
      const isAudio =
        (newMaterialFile.mimeType || "").startsWith("audio/") ||
        /\.(mp3|m4a|wav)$/i.test(newMaterialFile.name || "");
      const created = await uploadMaterial({
        title: newMaterialTitle.trim(),
        type: isAudio ? "audio_lesson" : "grammar_guide",
        description: "",
        language_id: lang.id,
        level: level || "A1",
        asset: newMaterialFile,
      });
      // Refresh and pre-select the newly uploaded material so the user can
      // continue building the lesson without having to find it again.
      await reloadMaterials();
      if (created?.id) {
        setPickedMaterials((prev) =>
          prev.includes(created.id) ? prev : [...prev, created.id],
        );
      }
      setNewMaterialTitle("");
      setNewMaterialFile(null);
      setShowNewMaterial(false);
    } catch (e) {
      Alert.alert("Upload failed", e?.message || "Please try again.");
    } finally {
      setUploadingMaterial(false);
    }
  };

  const handleContinue = async () => {
    if (!title.trim()) {
      Alert.alert("Title required", "Please enter a title for the lesson.");
      return;
    }
    if (!level) {
      Alert.alert("Level required", "Please pick a level.");
      return;
    }
    const lang =
      findLanguageById(profile.languageId) ||
      findLanguageByName(profile.language);
    if (!lang?.id) {
      Alert.alert(
        "Language unknown",
        "Set your teaching language on your profile before adding lessons.",
      );
      return;
    }
    try {
      const created = await createLesson({
        title: title.trim(),
        description: description.trim(),
        level,
        language_id: lang.id,
        material_ids: pickedMaterials,
      });
      addLesson({
        id: created?.id,
        title: created?.title || title.trim(),
        description: created?.description || description.trim(),
        level,
        materialIds: pickedMaterials,
        status: "upcoming",
        date: "TBD",
        time: "",
      });
      safeBack("/language-lessons");
    } catch (e) {
      Alert.alert("Could not add lesson", e?.message || "Please try again.");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Add language lesson</Text>

        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <Text style={styles.label}>Add title*</Text>
        <TextInput
          style={styles.input}
          placeholder="Title"
          placeholderTextColor="#8D7C74"
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Add description</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Description"
          placeholderTextColor="#8D7C74"
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <Text style={styles.label}>Select level*</Text>
        <TouchableOpacity
          style={styles.selectBox}
          onPress={() => setPicker("level")}
        >
          <Text style={[styles.selectText, level && styles.selectTextActive]}>
            {level || "Select level"}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#FFFBFA" />
        </TouchableOpacity>

        <Text style={styles.label}>Insert materials</Text>
        <TouchableOpacity
          style={styles.selectBox}
          onPress={() => setPicker("materials")}
        >
          <Text
            style={[
              styles.selectText,
              pickedMaterials.length > 0 && styles.selectTextActive,
            ]}
          >
            {pickedMaterials.length > 0
              ? `${pickedMaterials.length} selected`
              : "Pick materials"}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#FFFBFA" />
        </TouchableOpacity>
      </ScrollView>

      <TouchableOpacity style={styles.btn} onPress={handleContinue}>
        <Text style={styles.btnText}>Continue</Text>
      </TouchableOpacity>

      <Modal
        visible={picker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPicker(null)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {picker === "level" ? "Select level" : "Select materials"}
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {picker === "level"
                ? LEVELS.map((lvl) => {
                    const selected = lvl === level;
                    return (
                      <TouchableOpacity
                        key={lvl}
                        style={[
                          styles.modalRow,
                          selected && styles.modalRowSelected,
                        ]}
                        onPress={() => {
                          setLevel(lvl);
                          setPicker(null);
                        }}
                      >
                        <Text
                          style={[
                            styles.modalRowText,
                            selected && styles.modalRowTextSelected,
                          ]}
                        >
                          {lvl}
                        </Text>
                        {selected && (
                          <Ionicons name="checkmark" size={18} color="#FF9E6D" />
                        )}
                      </TouchableOpacity>
                    );
                  })
                : (
                    <>
                      {loadingMaterials && (
                        <ActivityIndicator
                          color="#FF9E6D"
                          style={{ marginVertical: 10 }}
                        />
                      )}

                      {!loadingMaterials && materials.length === 0 && (
                        <Text
                          style={{
                            fontFamily: "Outfit",
                            fontSize: 13,
                            color: "#A89080",
                            textAlign: "center",
                            paddingVertical: 14,
                          }}
                        >
                          You have not uploaded any materials yet.
                        </Text>
                      )}

                      {materials.map((m) => {
                        const selected = pickedMaterials.includes(m.id);
                        const isDeleting = deletingMaterialId === m.id;
                        return (
                          <View
                            key={m.id}
                            style={[
                              styles.modalRow,
                              selected && styles.modalRowSelected,
                            ]}
                          >
                            <TouchableOpacity
                              style={{ flex: 1, paddingRight: 8 }}
                              onPress={() => toggleMaterial(m.id)}
                              disabled={isDeleting}
                            >
                              <Text
                                style={[
                                  styles.modalRowText,
                                  selected && styles.modalRowTextSelected,
                                ]}
                              >
                                {m.title}
                              </Text>
                            </TouchableOpacity>
                            <View style={styles.rowIcons}>
                              {selected && (
                                <Ionicons
                                  name="checkmark"
                                  size={18}
                                  color="#FF9E6D"
                                />
                              )}
                              <TouchableOpacity
                                style={styles.rowDeleteBtn}
                                onPress={() => handleDeleteMaterial(m)}
                                disabled={isDeleting}
                              >
                                {isDeleting ? (
                                  <ActivityIndicator size="small" color="#DD8153" />
                                ) : (
                                  <Ionicons
                                    name="trash-outline"
                                    size={16}
                                    color="#DD8153"
                                  />
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}

                      <TouchableOpacity
                        style={styles.addNewBtn}
                        onPress={() => {
                          setPicker(null);
                          setShowNewMaterial(true);
                        }}
                      >
                        <Ionicons name="add" size={18} color="#FFFBFA" />
                        <Text style={styles.addNewBtnText}>
                          Add new material
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
            </ScrollView>
            {picker === "materials" && (
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setPicker(null)}
              >
                <Text style={styles.modalCloseText}>Done</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showNewMaterial}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNewMaterial(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowNewMaterial(false)}
        >
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>Add Material</Text>

            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Chapter 1 Vocabulary"
              placeholderTextColor="#8D7C74"
              value={newMaterialTitle}
              onChangeText={setNewMaterialTitle}
            />

            <Text style={styles.label}>Document</Text>
            <TouchableOpacity
              style={styles.uploadBox}
              onPress={pickNewMaterialFile}
            >
              <Ionicons
                name={newMaterialFile ? "document-attach" : "cloud-upload-outline"}
                size={20}
                color="#FF9E6D"
              />
              <Text style={styles.uploadText}>
                {newMaterialFile
                  ? newMaterialFile.name
                  : "Tap to attach a document"}
              </Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setShowNewMaterial(false)}
                disabled={uploadingMaterial}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnPrimary,
                  uploadingMaterial && { opacity: 0.7 },
                ]}
                onPress={saveNewMaterial}
                disabled={uploadingMaterial}
              >
                {uploadingMaterial ? (
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
  container: {
    flex: 1,
    backgroundColor: "#FFFBFA",
    paddingHorizontal: 22,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 42,
    marginBottom: 28,
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

  label: {
    fontFamily: "Domine",
    fontSize: 14,
    color: "#28221B",
    marginBottom: 8,
  },

  input: {
    height: 42,
    backgroundColor: "#E7D4CF",
    borderRadius: 15,
    paddingHorizontal: 14,
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    marginBottom: 22,
  },

  textArea: {
    height: 120,
    backgroundColor: "#E7D4CF",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 14,
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    marginBottom: 22,
    textAlignVertical: "top",
  },

  selectBox: {
    height: 42,
    backgroundColor: "#DD8153",
    borderRadius: 15,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },

  selectText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#FFE6D7",
  },

  selectTextActive: {
    color: "#FFFBFA",
    fontWeight: "600",
  },

  btn: {
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

  btnText: {
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

  rowIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  rowDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFF1E8",
    alignItems: "center",
    justifyContent: "center",
  },

  modalCloseBtn: {
    marginTop: 12,
    backgroundColor: "#FF9E6D",
    borderRadius: 22,
    paddingVertical: 14,
    alignItems: "center",
  },

  modalCloseText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  addNewBtn: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FF9E6D",
    borderRadius: 22,
    paddingVertical: 12,
  },

  addNewBtnText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#FFFBFA",
    fontWeight: "700",
  },

  uploadBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F3EDEA",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 18,
  },
  uploadText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    flex: 1,
  },

  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
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

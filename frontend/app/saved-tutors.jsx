import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { useUser } from "@/contexts/user-context";
import { useSafeBack } from "@/hooks/use-safe-back";
import { getTutor } from "@/services/tutors";
import { buildMediaUrl } from "@/services/api";
import { findLanguageById } from "@/constants/languages";

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

export default function SavedTutors() {
  const { savedTutorIds, toggleSavedTutor } = useUser();
  const safeBack = useSafeBack();
  const [tutors, setTutors] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!savedTutorIds.length) {
      setTutors([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await Promise.all(
      savedTutorIds.map((id) => getTutor(id).catch(() => null))
    );
    setTutors(result.filter(Boolean));
    setLoading(false);
  }, [savedTutorIds]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack("/student-dashboard")}>
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved tutors</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color="#FF9E6D" style={{ marginTop: 24 }} />
        ) : tutors.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="bookmark-outline" size={32} color="#FF9E6D" />
            <Text style={styles.emptyTitle}>No saved tutors yet</Text>
            <Text style={styles.emptyText}>
              Tap the bookmark on any tutor profile to save them here for later.
            </Text>
            <TouchableOpacity
              style={styles.browseBtn}
              onPress={() => router.push("/student-dashboard")}
            >
              <Text style={styles.browseBtnText}>Browse tutors</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.count}>
              {tutors.length} tutor{tutors.length === 1 ? "" : "s"} saved
            </Text>
            {tutors.map((tutor) => {
              const language = findLanguageById(tutor.language_id);
              const photoUrl = buildMediaUrl(tutor.profile_photo);
              const price =
                tutor.hourly_rate !== null && tutor.hourly_rate !== undefined
                  ? ` · €${Number(tutor.hourly_rate).toFixed(0)}/hr`
                  : "";
              return (
                <TouchableOpacity
                  key={tutor.id}
                  style={styles.row}
                  onPress={() =>
                    router.push({
                      pathname: "/tutor-profile-student",
                      params: { tutorId: String(tutor.id) },
                    })
                  }
                >
                  {photoUrl ? (
                    <Image source={{ uri: photoUrl }} style={styles.avatar} />
                  ) : (
                    <View
                      style={[
                        styles.avatar,
                        {
                          backgroundColor: colorForName(tutor.full_name),
                          alignItems: "center",
                          justifyContent: "center",
                        },
                      ]}
                    >
                      <Text style={styles.avatarInitials}>
                        {initialsOf(tutor.full_name)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.rowBody}>
                    <Text style={styles.name}>{tutor.full_name}</Text>
                    <Text style={styles.meta}>
                      {(language?.name || tutor.language_name || "")} {tutor.max_level || ""}{price}
                    </Text>
                  </View>
                  <TouchableOpacity
                    hitSlop={8}
                    onPress={() => toggleSavedTutor(tutor.id)}
                    style={styles.removeBtn}
                  >
                    <Ionicons name="bookmark" size={20} color="#FF9E6D" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>

      <StudentBottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFBFA" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 50,
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

  count: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    marginVertical: 12,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFBFA",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    gap: 12,
    shadowColor: "#28221B",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarInitials: {
    fontFamily: "Domine",
    fontSize: 18,
    fontWeight: "700",
    color: "#28221B",
  },

  rowBody: {
    flex: 1,
  },

  name: {
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "600",
    color: "#28221B",
  },

  meta: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    marginTop: 4,
  },

  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFF1E8",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyBox: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 24,
  },

  emptyTitle: {
    fontFamily: "Domine",
    fontSize: 18,
    color: "#28221B",
    marginTop: 14,
  },

  emptyText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#7E6D66",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },

  browseBtn: {
    marginTop: 18,
    backgroundColor: "#FF9E6D",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 22,
  },

  browseBtnText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#FFFBFA",
    fontWeight: "600",
  },
});

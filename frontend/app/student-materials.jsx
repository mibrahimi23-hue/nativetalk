import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { safeBack } from "@/hooks/use-safe-back";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { buildMediaUrl } from "@/services/api";
import { listMaterials } from "@/services/materials";

export default function StudentMaterials() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);

  // Backend filters: tutor → their uploads, student → materials matching the
  // student's enrolled languages. No need to pass language_id from here.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMaterials();
      setMaterials(Array.isArray(data) ? data : []);
    } catch {
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openMaterial = async (mat) => {
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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Materials</Text>
        <View style={{ width: 30 }} />
      </View>

      <Text style={styles.title}>Materials</Text>

      {/* Materials List */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color="#FF9E6D" style={{ marginTop: 24 }} />
        ) : materials.length === 0 ? (
          <Text style={{ fontFamily: "Outfit", color: "#A89080", marginTop: 20 }}>
            No materials yet for your language and level.
          </Text>
        ) : (
          materials.map((mat) => (
            <TouchableOpacity
              key={mat.id}
              style={styles.materialRow}
              onPress={() => openMaterial(mat)}
            >
              <Text style={styles.materialText}>
                {mat.title}
                {mat.level ? ` · ${mat.level}` : ""}
              </Text>
              <Ionicons name="download-outline" size={16} color="#28221B" />
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity onPress={() => router.push("/student-dashboard")}>
          <Ionicons name="home" size={22} color="#28221B" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/student-dashboard")}>
          <Ionicons name="search-outline" size={22} color="#28221B" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/student-lessons")}>
          <Ionicons name="book-outline" size={22} color="#28221B" />
        </TouchableOpacity>

        {/* ✅ FIXED PROFILE FLOW */}
        <TouchableOpacity onPress={() => router.push("/student-profile")}>
          <Ionicons name="person" size={22} color="#28221B" />
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
    fontSize: 18,
    color: "#28221B",
    marginBottom: 10,
  },

  materialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EFE6E1",
  },

  materialText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
  },

  bottomNav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 50,
    backgroundColor: "#FDF0EC",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
});

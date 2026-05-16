import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useUser } from "@/contexts/user-context";
import { safeBack } from "@/hooks/use-safe-back";
import { LANGUAGES } from "@/constants/languages";

export default function LanguageSelectTutor() {
  const { setLanguageSelection } = useUser();
  const params = useLocalSearchParams();
  const [selected, setSelected] = useState(null);

  const handleContinue = () => {
    const lang = LANGUAGES.find((l) => l.id === selected);
    if (!lang) return;
    setLanguageSelection({ id: lang.id, name: lang.name });
    router.push({
      pathname: "/tutor-certification",
      params: {
        ...params,
        languageId: String(lang.id),
        languageName: lang.name,
      },
    });
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack("/role-section")}>
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Language to Teach</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.title}>Languages</Text>
        <Text style={styles.subtitle}>Choose your preferred language</Text>

        {LANGUAGES.map((lang, index) => (
          <View key={lang.id}>
            <TouchableOpacity
              style={[
                styles.langRow,
                selected === lang.id && styles.langRowSelected,
              ]}
              onPress={() => setSelected(lang.id)}
            >
              <Text style={styles.flag}>{lang.flag}</Text>
              <Text
                style={[
                  styles.langName,
                  selected === lang.id && styles.langNameSelected,
                ]}
              >
                {lang.name}
              </Text>
            </TouchableOpacity>

            {index < LANGUAGES.length - 1 && <View style={styles.divider} />}
          </View>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.bottomBtn}>
        <TouchableOpacity
          disabled={!selected}
          style={[styles.continueBtn, !selected && styles.continueBtnDisabled]}
          onPress={handleContinue}
        >
          <Text style={styles.continueBtnText}>Continue</Text>
        </TouchableOpacity>
      </View>
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

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 32 },

  title: {
    fontFamily: "Domine",
    fontSize: 32,
    color: "#28221B",
    textAlign: "center",
    marginBottom: 8,
  },

  subtitle: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#777",
    textAlign: "center",
    marginBottom: 32,
  },

  langRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 16,
    backgroundColor: "#FFFBFA",
  },

  langRowSelected: { borderColor: "#FF9E6D" },

  flag: { fontSize: 26, marginRight: 16 },

  langName: {
    fontFamily: "Outfit",
    fontSize: 16,
    color: "#28221B",
    flex: 1,
  },

  langNameSelected: {
    color: "#FF9E6D",
    fontWeight: "700",
  },

  divider: {
    height: 1,
    backgroundColor: "#F0EDEA",
  },

  bottomBtn: {
    position: "absolute",
    bottom: 34,
    left: 24,
    right: 24,
  },

  continueBtn: {
    backgroundColor: "#FF9E6D",
    borderRadius: 25,
    paddingVertical: 16,
    alignItems: "center",
  },

  continueBtnDisabled: {
    backgroundColor: "#FFCBA8",
  },

  continueBtnText: {
    fontFamily: "Outfit",
    color: "#FFFBFA",
    fontSize: 16,
  },
});

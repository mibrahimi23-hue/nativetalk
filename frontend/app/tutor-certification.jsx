import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useUser } from "@/contexts/user-context";
import { safeBack } from "@/hooks/use-safe-back";
import { completeTutorOnboarding, updateTutorProfile } from "@/services/tutors";

const certifications = [
  {
    id: 1,
    label: "No certificate",
    icon: "checkmark-circle-outline",
    is_certified: false,
    has_experience: false,
  },
  {
    id: 2,
    label: "Language Certificate",
    icon: "ribbon-outline",
    is_certified: true,
    has_experience: false,
  },
  {
    id: 3,
    label: "LanguageCertificate +\nLanguage Teaching experience",
    icon: "people-outline",
    is_certified: true,
    has_experience: true,
  },
];

export default function TutorCertification() {
  const { register, user, refreshMe } = useUser();
  const params = useLocalSearchParams();
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Three states map to three different backend calls on Continue:
  //   1. No account yet — params hold email/password from the /register form,
  //      so call /auth/register with the cert flags.
  //   2. Authenticated user with no Teacher row — call /tutors/onboarding.
  //   3. Teacher row already exists (user came back to change the cert type) —
  //      PATCH /tutors/me so is_certified/has_experience/max_level stay in sync.
  const hasTeacherProfile = !!user?.teacher_id;
  const hasPendingRegistration =
    !hasTeacherProfile && !!(params.email && params.password && params.languageId);

  const handleContinue = async () => {
    const cert = certifications.find((c) => c.id === selected);
    if (!cert) return;
    if (!params.languageId && !hasTeacherProfile) {
      Alert.alert("Pick a language", "Please choose the language you teach first.");
      return;
    }

    setSubmitting(true);
    try {
      if (hasTeacherProfile) {
        // Returning user — just update the cert flags. The backend re-derives
        // max_level from is_certified/has_experience.
        await updateTutorProfile({
          is_certified: cert.is_certified,
          has_experience: cert.has_experience,
        });
        await refreshMe();
      } else if (hasPendingRegistration) {
        const fullName = `${params.firstName || ""} ${params.lastName || ""}`.trim();
        await register({
          email: String(params.email),
          password: String(params.password),
          full_name: fullName,
          role: "teacher",
          language_id: Number(params.languageId),
          is_certified: cert.is_certified,
          has_experience: cert.has_experience,
          phone: params.phone ? String(params.phone) : undefined,
          location: params.location ? String(params.location) : undefined,
        });
      } else if (user) {
        // Authenticated (e.g. Google) but no Teacher row yet.
        await completeTutorOnboarding({
          language_id: Number(params.languageId),
          is_certified: cert.is_certified,
          has_experience: cert.has_experience,
        });
        await refreshMe();
      }
    } catch (e) {
      // "Email already registered" — bounce back to /register so the
      // signup form can show the inline hint with the Login link.
      const msg = e?.message || "";
      if (/already registered/i.test(msg)) {
        router.replace({
          pathname: "/register",
          params: { emailExists: "1", email: String(params.email || "") },
        });
        setSubmitting(false);
        return;
      }
      Alert.alert("Could not save your profile", msg || "Please try again.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);

    if (cert.id === 2) {
      router.push({
        pathname: "/upload-certificate",
        params: { ...params, level: "B2" },
      });
    } else if (cert.id === 3) {
      router.push({
        pathname: "/upload-certificate-experience",
        params: { ...params, level: "C2" },
      });
    } else {
      router.push({
        pathname: "/language-examination",
        params: { ...params, certId: String(cert.id) },
      });
    }
  };

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack("/language-select-tutor")}>
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Tutor Certification</Text>
          <Text style={styles.headerSubtitle}>
            Choose the type of certification you have
          </Text>
        </View>
      </View>

      {/* Options */}
      <View style={styles.optionsList}>
        {certifications.map((cert, index) => (
          <View key={cert.id}>
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => setSelected(cert.id)}
            >
              <Ionicons
                name={cert.icon}
                size={28}
                color={selected === cert.id ? "#FF9E6D" : "#DD8153"}
                style={styles.optionIcon}
              />
              <Text
                style={[
                  styles.optionLabel,
                  selected === cert.id && styles.optionLabelSelected,
                ]}
              >
                {cert.label}
              </Text>
            </TouchableOpacity>
            {index < certifications.length - 1 && (
              <View style={styles.divider} />
            )}
          </View>
        ))}
      </View>

      {/* Continue Button */}
      {selected && (
        <View style={styles.bottomBtn}>
          <TouchableOpacity
            style={[styles.continueBtn, submitting && { opacity: 0.7 }]}
            disabled={submitting}
            onPress={handleContinue}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFBFA" />
            ) : (
              <Text style={styles.continueBtnText}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
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
    alignItems: "flex-start",
    paddingTop: 55,
    paddingBottom: 20,
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
    marginRight: 14,
    marginTop: 2,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#28221B",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#7E6D66",
  },
  optionsList: {
    paddingHorizontal: 24,
    marginTop: 30,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 22,
  },
  optionIcon: {
    marginRight: 16,
    width: 32,
  },
  optionLabel: {
    fontSize: 16,
    color: "#28221B",
    flex: 1,
    lineHeight: 22,
  },
  optionLabelSelected: {
    fontWeight: "700",
    color: "#FF9E6D",
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
  continueBtnText: {
    color: "#FFFBFA",
    fontSize: 16,
    fontWeight: "600",
  },
});

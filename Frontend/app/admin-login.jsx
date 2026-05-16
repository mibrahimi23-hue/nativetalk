import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useUser } from "@/contexts/user-context";
import { resetPasswordRequest } from "@/services/auth";

export default function AdminLogin() {
  const { login } = useUser();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState(null);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetNew, setResetNew] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState(null);
  const [resetSuccess, setResetSuccess] = useState(null);

  const signIn = async () => {
    setLoginError(null);
    if (!username || !password) {
      setLoginError("Invalid password or username, try it again.");
      return;
    }
    const email = username.includes("@")
      ? username.trim()
      : `${username.trim()}@nativetalk.com`;

    setSubmitting(true);
    try {
      await login(email, password, "Admin");
      router.replace("/admin-dashboard");
    } catch {
      setLoginError("Invalid password or username, try it again.");
    } finally {
      setSubmitting(false);
    }
  };

  const openReset = () => {
    setResetEmail(username.includes("@") ? username.trim() : "");
    setResetNew("");
    setResetConfirm("");
    setResetError(null);
    setResetSuccess(null);
    setResetOpen(true);
  };

  const submitReset = async () => {
    setResetError(null);
    setResetSuccess(null);
    if (!resetEmail || !resetNew || !resetConfirm) {
      setResetError("Please fill in every field.");
      return;
    }
    if (resetNew !== resetConfirm) {
      setResetError("The two passwords do not match.");
      return;
    }
    if (resetNew.length < 6) {
      setResetError("Password must be at least 6 characters.");
      return;
    }
    setResetSubmitting(true);
    try {
      await resetPasswordRequest({
        email: resetEmail.trim(),
        new_password: resetNew,
        confirm_password: resetConfirm,
      });
      setResetSuccess("Password reset successfully. You can sign in now.");
      setResetNew("");
      setResetConfirm("");
    } catch (e) {
      setResetError(e?.message || "Could not reset password.");
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => router.replace("/login")}
      >
        <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
      </TouchableOpacity>

      <Text style={styles.title}>Admin Portal</Text>

      <TextInput
        style={styles.input}
        placeholder="Username"
        placeholderTextColor="#7E6D66"
        value={username}
        onChangeText={(v) => {
          setUsername(v);
          if (loginError) setLoginError(null);
        }}
        autoCapitalize="none"
        editable={!submitting}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#7E6D66"
        secureTextEntry
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          if (loginError) setLoginError(null);
        }}
        editable={!submitting}
      />

      {loginError ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={14} color="#FF9E6D" />
          <Text style={styles.errorText}>{loginError}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.signBtn, submitting && { opacity: 0.7 }]}
        onPress={signIn}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#FFFBFA" />
        ) : (
          <Text style={styles.signText}>Sign In</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.forgotBtn} onPress={openReset}>
        <Text style={styles.forgotText}>Forgot Password</Text>
      </TouchableOpacity>

      <Modal
        visible={resetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setResetOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setResetOpen(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation?.()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reset Password</Text>
              <TouchableOpacity onPress={() => setResetOpen(false)}>
                <Ionicons name="close" size={20} color="#28221B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Email</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="admin@example.com"
              placeholderTextColor="#7E6D66"
              autoCapitalize="none"
              keyboardType="email-address"
              value={resetEmail}
              onChangeText={setResetEmail}
              editable={!resetSubmitting}
            />

            <Text style={styles.modalLabel}>New password</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="At least 6 characters"
              placeholderTextColor="#7E6D66"
              secureTextEntry
              value={resetNew}
              onChangeText={setResetNew}
              editable={!resetSubmitting}
            />

            <Text style={styles.modalLabel}>Repeat new password</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Type it again"
              placeholderTextColor="#7E6D66"
              secureTextEntry
              value={resetConfirm}
              onChangeText={setResetConfirm}
              editable={!resetSubmitting}
            />

            {resetError ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={14} color="#FF9E6D" />
                <Text style={styles.errorText}>{resetError}</Text>
              </View>
            ) : null}

            {resetSuccess ? (
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle-outline" size={14} color="#FF9E6D" />
                <Text style={styles.errorText}>{resetSuccess}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.signBtn, resetSubmitting && { opacity: 0.7 }, { marginTop: 16 }]}
              onPress={submitReset}
              disabled={resetSubmitting}
            >
              {resetSubmitting ? (
                <ActivityIndicator color="#FFFBFA" />
              ) : (
                <Text style={styles.signText}>Save new password</Text>
              )}
            </TouchableOpacity>
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
    paddingHorizontal: 28,
    paddingTop: 125,
  },

  backBtn: {
    position: "absolute",
    top: 55,
    left: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },

  title: {
    fontFamily: "Domine",
    fontSize: 28,
    textAlign: "center",
    color: "#28221B",
    marginBottom: 24,
  },

  input: {
    height: 40,
    backgroundColor: "#F1E5E1",
    borderRadius: 13,
    paddingHorizontal: 14,
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    marginBottom: 12,
  },

  signBtn: {
    height: 38,
    backgroundColor: "#FF9E6D",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 18,
  },

  signText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#FFFBFA",
  },

  forgotBtn: {
    height: 38,
    backgroundColor: "#F1E5E1",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
  },

  forgotText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
  },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#FFF1E8",
    marginTop: 4,
  },

  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#FFF1E8",
    marginTop: 8,
  },

  errorText: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
    lineHeight: 14,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(40, 34, 27, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },

  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFBFA",
    borderRadius: 18,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },

  modalTitle: {
    fontFamily: "Domine",
    fontSize: 18,
    color: "#28221B",
  },

  modalLabel: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
    marginBottom: 4,
    marginTop: 6,
  },

  modalInput: {
    height: 38,
    backgroundColor: "#F1E5E1",
    borderRadius: 12,
    paddingHorizontal: 12,
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#28221B",
    marginBottom: 4,
  },
});

import { Ionicons } from "@expo/vector-icons";
import { Link, router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useGoogleAuth } from "@/services/google";

const RESET_AFTER_FAILED_ATTEMPTS = 3;

export default function LoginScreen() {
  const { role, login, applyAuthPayload } = useUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginAs, setLoginAs] = useState(role === "Tutor" ? "Tutor" : "Learner");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [failedLoginAttempts, setFailedLoginAttempts] = useState(0);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetNew, setResetNew] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState(null);
  const [resetSuccess, setResetSuccess] = useState(null);
  const { request: googleRequest, signIn: googleSignIn } = useGoogleAuth();

  const routeForRole = (backendRole, payload) => {
    // Brand-new Google tutors do not have a Teacher row yet — push them
    // through the language + certification onboarding before the dashboard.
    if (backendRole === "teacher") {
      if (payload?.user && !payload.user.teacher_id) {
        router.replace("/language-select-tutor");
        return;
      }
      router.replace("/tutor-dashboard");
    } else if (backendRole === "student") {
      router.replace("/student-dashboard");
    } else if (backendRole === "admin") {
      router.replace("/admin-dashboard");
    } else {
      router.replace("/student-dashboard");
    }
  };

  const handleLogin = async () => {
    setLoginError(null);
    if (!email.trim() || !password) {
      setLoginError("Invalid password or username, try it again.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await login(email.trim(), password, loginAs);
      setFailedLoginAttempts(0);
      routeForRole(result?.user?.role, result);
    } catch {
      const nextAttempts = failedLoginAttempts + 1;
      setFailedLoginAttempts(nextAttempts);
      setLoginError("Invalid password or username, try it again.");
      if (nextAttempts >= RESET_AFTER_FAILED_ATTEMPTS) {
        openReset();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openReset = () => {
    setResetEmail(email.trim());
    setResetNew("");
    setResetConfirm("");
    setResetError(null);
    setResetSuccess(null);
    setResetOpen(true);
  };

  const closeReset = () => {
    setResetOpen(false);
    setResetError(null);
    setResetSuccess(null);
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
      setPassword("");
      setResetNew("");
      setResetConfirm("");
      setFailedLoginAttempts(0);
    } catch (e) {
      setResetError(e?.message || "Could not reset password.");
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    if (googleSubmitting) return;
    setGoogleSubmitting(true);
    try {
      const backendRole = loginAs === "Tutor" ? "teacher" : "student";
      const payload = await googleSignIn({ role: backendRole });
      applyAuthPayload(payload);
      routeForRole(payload?.user?.role, payload);
    } catch (e) {
      if (!/cancel/i.test(e?.message || "")) {
        Alert.alert("Google sign-in failed", e.message || "Please try again.");
      }
    } finally {
      setGoogleSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.appName}>NativeTalk</Text>

      <Text style={styles.title}>Welcome Back</Text>

      <View style={styles.roleRow}>
        <TouchableOpacity
          style={[styles.roleBtn, loginAs === "Learner" && styles.roleBtnActive]}
          onPress={() => {
            setLoginAs("Learner");
            if (loginError) setLoginError(null);
            setFailedLoginAttempts(0);
          }}
        >
          <Text
            style={[
              styles.roleText,
              loginAs === "Learner" && styles.roleTextActive,
            ]}
          >
            I&apos;m a Student
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.roleBtn, loginAs === "Tutor" && styles.roleBtnActive]}
          onPress={() => {
            setLoginAs("Tutor");
            if (loginError) setLoginError(null);
            setFailedLoginAttempts(0);
          }}
        >
          <Text
            style={[
              styles.roleText,
              loginAs === "Tutor" && styles.roleTextActive,
            ]}
          >
            I&apos;m a Tutor
          </Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Enter your email"
        placeholderTextColor="#DD8153"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          if (loginError) setLoginError(null);
          setFailedLoginAttempts(0);
        }}
        editable={!submitting}
      />

      <TextInput
        style={styles.input}
        placeholder="Enter your password"
        placeholderTextColor="#DD8153"
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

      {failedLoginAttempts >= RESET_AFTER_FAILED_ATTEMPTS ? (
        <TouchableOpacity style={styles.resetInlineBtn} onPress={openReset}>
          <Text style={styles.resetInlineText}>Reset Password</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={[styles.loginButton, submitting && { opacity: 0.7 }]}
        onPress={handleLogin}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#FFFBFA" />
        ) : (
          <Text style={styles.loginText}>Login</Text>
        )}
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity
        style={[styles.google, (googleSubmitting || !googleRequest) && { opacity: 0.7 }]}
        disabled={submitting || googleSubmitting || !googleRequest}
        onPress={handleGoogle}
      >
        {googleSubmitting ? (
          <ActivityIndicator color="#28221B" />
        ) : (
          <Text style={styles.googleText}>Continue with Google</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.footerText}>Don’t have an account?</Text>

      <Link href="/register" asChild>
        <TouchableOpacity style={styles.signupButton}>
          <Text style={styles.signupText}>Sign Up</Text>
        </TouchableOpacity>
      </Link>

      <Link href="/admin-login" style={styles.adminLink}>
        Log in as Admin
      </Link>

      <Modal
        visible={resetOpen}
        transparent
        animationType="fade"
        onRequestClose={closeReset}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeReset}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation?.()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reset Password</Text>
              <TouchableOpacity onPress={closeReset}>
                <Ionicons name="close" size={20} color="#28221B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Email</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="you@example.com"
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
              style={[
                styles.loginButton,
                resetSubmitting && { opacity: 0.7 },
                { marginTop: 16, marginBottom: 0 },
              ]}
              onPress={submitReset}
              disabled={resetSubmitting}
            >
              {resetSubmitting ? (
                <ActivityIndicator color="#FFFBFA" />
              ) : (
                <Text style={styles.loginText}>Save new password</Text>
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
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  appName: {
    fontFamily: "Domine",
    fontSize: 18,
    marginBottom: 14,
    color: "#28221B",
  },

  title: {
    fontFamily: "Domine",
    fontSize: 28,
    marginBottom: 18,
    color: "#28221B",
  },

  roleRow: {
    flexDirection: "row",
    width: "100%",
    backgroundColor: "#F1E5E1",
    borderRadius: 22,
    padding: 4,
    marginBottom: 18,
  },

  roleBtn: {
    flex: 1,
    height: 40,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  roleBtnActive: {
    backgroundColor: "#FF9E6D",
  },

  roleText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
  },

  roleTextActive: {
    color: "#FFFBFA",
    fontWeight: "700",
  },

  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#DD8153",
    borderRadius: 25,
    padding: 15,
    marginBottom: 15,
    color: "#28221B",
    backgroundColor: "#FFFBFA",
    fontFamily: "Outfit",
  },

  loginButton: {
    width: "100%",
    backgroundColor: "#FF9E6D",
    padding: 15,
    borderRadius: 25,
    alignItems: "center",
    marginTop: 3,
    marginBottom: 20,
  },

  loginText: {
    color: "#FFFBFA",
    fontFamily: "Outfit",
  },

  errorBanner: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#FFF1E8",
    marginTop: -3,
    marginBottom: 12,
  },

  errorText: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
    lineHeight: 14,
  },

  resetInlineBtn: {
    alignSelf: "flex-end",
    marginTop: -4,
    marginBottom: 12,
  },

  resetInlineText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#DD8153",
  },

  divider: {
    height: 2,
    width: "100%",
    backgroundColor: "#DD8153",
    marginBottom: 20,
  },

  google: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#DD8153",
    padding: 15,
    borderRadius: 25,
    alignItems: "center",
    marginBottom: 20,
    backgroundColor: "#FFFBFA",
  },

  googleText: {
    color: "#28221B",
    fontFamily: "Outfit",
  },

  footerText: {
    marginBottom: 10,
    color: "#28221B",
    fontFamily: "Outfit",
  },

  signupButton: {
    width: "100%",
    backgroundColor: "#FF9E6D",
    padding: 15,
    borderRadius: 25,
    alignItems: "center",
  },

  signupText: {
    color: "#FFFBFA",
    fontFamily: "Outfit",
  },

  adminLink: {
    marginTop: 20,
    textAlign: "center",
    color: "#DD8153",
    fontSize: 14,
    fontFamily: "Outfit",
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

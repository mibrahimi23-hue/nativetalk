import { Ionicons } from "@expo/vector-icons";
import { Link, router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useUser } from "@/contexts/user-context";
import { useGoogleAuth } from "@/services/google";
import { useInAppAlert } from "@/components/in-app-alert";

const MIN_PASSWORD_LENGTH = 8;

export default function RegisterScreen() {
  const { setProfile, applyAuthPayload } = useUser();
  const { notify, AlertHost } = useInAppAlert();

  // Downstream onboarding screens may bounce back here with
  // ?emailExists=1&email=... when the backend rejects the registration
  // with "Email already registered". We pre-fill the email and pop the
  // in-app modal so the user knows what happened — without any layout /
  // design change on the form itself.
  const params = useLocalSearchParams();
  const initialEmail =
    typeof params?.email === "string" ? params.email : "";
  const initialEmailExists = String(params?.emailExists || "") === "1";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const { request: googleRequest, signIn: googleSignIn } = useGoogleAuth();

  // Surface the "already registered" message via the in-app modal once on
  // mount when we land here from a bounce-back.
  const announcedRef = useRef(false);
  useEffect(() => {
    if (initialEmailExists && !announcedRef.current) {
      announcedRef.current = true;
      notify(
        "This email is registered",
        "Try to login with the same email instead of creating a new account.",
        { tone: "error" },
      );
    }
  }, [initialEmailExists, notify]);

  // Inline hint shown directly under the password field. Only appears while
  // the user has typed at least one character and it's still too short — so
  // we don't yell at someone before they've started typing.
  const passwordTooShort =
    password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  const handleSignUp = () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password || !location.trim()) {
      notify(
        "Missing information",
        "Please fill in your name, location, email and password.",
        { tone: "error" },
      );
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      notify(
        "Short password",
        `It must have at least ${MIN_PASSWORD_LENGTH} characters.`,
        { tone: "error" },
      );
      return;
    }
    setProfile({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      location: location.trim(),
    });
    router.push({
      pathname: "/role-section",
      params: {
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        location: location.trim(),
      },
    });
  };

  const handleGoogle = async () => {
    if (googleSubmitting) return;
    setGoogleSubmitting(true);
    try {
      // For brand-new Google users we don't know their role yet — let the
      // user choose it on the role-selection screen, then convert later.
      const payload = await googleSignIn();
      applyAuthPayload(payload);
      const backendRole = payload?.user?.role;
      if (backendRole === "teacher") {
        if (payload?.user && !payload.user.teacher_id) {
          router.replace("/language-select-tutor");
        } else {
          router.replace("/tutor-dashboard");
        }
      } else if (backendRole === "admin") {
        router.replace("/admin-dashboard");
      } else {
        router.replace("/student-dashboard");
      }
    } catch (e) {
      if (!/cancel/i.test(e?.message || "")) {
        notify("Google sign-in failed", e.message || "Please try again.", {
          tone: "error",
        });
      }
    } finally {
      setGoogleSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Small back button — returns to the Log in screen. */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => router.replace("/login")}
        accessibilityRole="button"
      >
        <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
      </TouchableOpacity>

      <Text style={styles.header}>Sign Up</Text>

      <Text style={styles.title}>Create Your Account</Text>

      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.halfInput]}
          placeholder="First Name"
          placeholderTextColor="#DD8153"
          value={firstName}
          onChangeText={setFirstName}
        />
        <TextInput
          style={[styles.input, styles.halfInput]}
          placeholder="Surname"
          placeholderTextColor="#DD8153"
          value={lastName}
          onChangeText={setLastName}
        />
      </View>

      <TextInput
        style={styles.input}
        placeholder="Mobile Phone (optional)"
        placeholderTextColor="#DD8153"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />

      <TextInput
        style={styles.input}
        placeholder="Location (city or country)"
        placeholderTextColor="#DD8153"
        value={location}
        onChangeText={setLocation}
      />

      <TextInput
        style={styles.input}
        placeholder="Email Address"
        placeholderTextColor="#DD8153"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        style={[styles.input, passwordTooShort && styles.inputError]}
        placeholder={`Password (min ${MIN_PASSWORD_LENGTH} chars)`}
        placeholderTextColor="#DD8153"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {passwordTooShort ? (
        <Text style={styles.passwordHint}>
          Short password. It must have at least {MIN_PASSWORD_LENGTH} characters
          ({password.length}/{MIN_PASSWORD_LENGTH}).
        </Text>
      ) : null}

      <TouchableOpacity style={styles.signupBtn} onPress={handleSignUp}>
        <Text style={styles.signupText}>Sign Up</Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity
        style={[styles.google, (googleSubmitting || !googleRequest) && { opacity: 0.7 }]}
        disabled={googleSubmitting || !googleRequest}
        onPress={handleGoogle}
      >
        {googleSubmitting ? (
          <ActivityIndicator color="#28221B" />
        ) : (
          <Text style={styles.googleText}>Sign Up with Google</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.footerText}>Already have an account?</Text>

      <Link href="/login" asChild>
        <TouchableOpacity style={styles.loginButton}>
          <Text style={styles.loginButtonText}>Log in</Text>
        </TouchableOpacity>
      </Link>

      <AlertHost />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: "#FFFBFA",
  },
  container: {
    flexGrow: 1,
    backgroundColor: "#FFFBFA",
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  backBtn: {
    position: "absolute",
    top: 16,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FF9E6D",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },

  header: {
    fontFamily: "Domine",
    fontSize: 20,
    marginBottom: 10,
    color: "#28221B",
  },

  title: {
    fontFamily: "Domine",
    fontSize: 28,
    marginBottom: 25,
    color: "#28221B",
  },

  row: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-between",
  },

  halfInput: {
    width: "48%",
  },

  input: {
    width: "100%",
    backgroundColor: "#FFFBFA",
    borderWidth: 1,
    borderColor: "#DD8153",
    borderRadius: 25,
    padding: 15,
    marginBottom: 15,
    color: "#28221B",
    fontFamily: "Outfit",
  },

  inputError: {
    borderColor: "#DD8153",
    borderWidth: 1.5,
  },

  passwordHint: {
    width: "100%",
    marginTop: -8,
    marginBottom: 12,
    paddingLeft: 18,
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#DD8153",
  },

  signupBtn: {
    width: "100%",
    backgroundColor: "#FF9E6D",
    padding: 15,
    borderRadius: 25,
    alignItems: "center",
    marginBottom: 20,
  },

  signupText: {
    color: "#FFFBFA",
    fontFamily: "Outfit",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  divider: {
    height: 2,
    width: "100%",
    backgroundColor: "#DD8153",
    marginVertical: 25,
  },

  google: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#DD8153",
    backgroundColor: "#FFFBFA",
    padding: 15,
    borderRadius: 25,
    alignItems: "center",
    marginBottom: 20,
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

  loginButton: {
    width: "100%",
    backgroundColor: "#FF9E6D",
    padding: 15,
    borderRadius: 25,
    alignItems: "center",
  },

  loginButtonText: {
    color: "#FFFBFA",
    fontFamily: "Outfit",
  },
});

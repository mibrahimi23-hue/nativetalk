import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useUser } from "@/contexts/user-context";

export default function RoleSelectionScreen() {
  const { setRole: setUserRole } = useUser();
  const params = useLocalSearchParams();
  const [role, setRole] = useState(null);

  const handleContinue = () => {
    if (!role) return;
    setUserRole(role);
    const forward = {
      ...params,
      role,
    };
    if (role === "Tutor") {
      router.push({ pathname: "/language-select-tutor", params: forward });
    } else if (role === "Learner") {
      router.push({ pathname: "/language-select-student", params: forward });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Choose Your Role</Text>

      <Text style={styles.subTitle}>Select Your Role</Text>

      <TouchableOpacity style={styles.roleBox} onPress={() => setRole("Tutor")}>
        <View style={styles.leftContent}>
          <View style={styles.iconPlaceholder} />
          <Text style={styles.roleText}>Tutor</Text>
        </View>
        <Text style={styles.radio}>{role === "Tutor" ? "●" : "○"}</Text>
      </TouchableOpacity>

      <View style={styles.line} />

      <TouchableOpacity
        style={styles.roleBox}
        onPress={() => setRole("Learner")}
      >
        <View style={styles.leftContent}>
          <View style={styles.iconPlaceholder} />
          <Text style={styles.roleText}>Learner</Text>
        </View>
        <Text style={styles.radio}>{role === "Learner" ? "●" : "○"}</Text>
      </TouchableOpacity>

      <View style={styles.line} />

      <TouchableOpacity
        style={[styles.button, !role && styles.disabledButton]}
        onPress={handleContinue}
        disabled={!role}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#FFFBFA",
  },

  header: {
    fontFamily: "Domine",
    fontSize: 22,
    textAlign: "center",
    marginTop: 40,
    marginBottom: 40,
    color: "#28221B",
  },

  subTitle: {
    fontFamily: "Domine",
    fontSize: 20,
    marginBottom: 20,
    color: "#28221B",
  },

  roleBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 5,
  },

  leftContent: {
    flexDirection: "row",
    alignItems: "center",
  },

  iconPlaceholder: {
    width: 55,
    height: 55,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "#DD8153",
    backgroundColor: "#FFFBFA",
    marginRight: 15,
  },

  roleText: {
    fontFamily: "Outfit",
    fontSize: 20,
    color: "#28221B",
  },

  radio: {
    fontSize: 24,
    color: "#FF9E6D",
  },

  line: {
    width: "100%",
    height: 1,
    backgroundColor: "#DD8153",
    marginVertical: 10,
  },

  button: {
    marginTop: 40,
    backgroundColor: "#FF9E6D",
    padding: 18,
    borderRadius: 25,
    alignItems: "center",
  },

  disabledButton: {
    opacity: 0.5,
  },

  buttonText: {
    fontFamily: "Outfit",
    fontSize: 16,
    color: "#FFFBFA",
  },
});

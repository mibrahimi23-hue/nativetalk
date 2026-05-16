import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { safeBack } from "@/hooks/use-safe-back";
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
import { updateTutorProfile } from "@/services/tutors";

const PLANS = [
  {
    id: "hourly",
    title: "Hourly",
    sub: "Payment",
    desc: "Student pays hour by hour",
  },
  {
    id: "fifty",
    title: "50%",
    sub: "payment",
    desc: "Student pays 50% now\nand 50% later",
  },
  {
    id: "eighty",
    title: "80%",
    sub: "payment",
    desc: "Student pays 80% now\nand 20% later",
  },
];

// Maps the radio's id to the backend-accepted enum value.
const PLAN_BY_KEY = {
  hourly: "hour_by_hour",
  fifty: "50_50",
  eighty: "80_20",
};

export default function PricingPlans() {
  const { level } = useLocalSearchParams();
  const { user, refreshMe } = useUser();
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  // Tutors land here during onboarding (they have a teacher_id). Students
  // never reach this screen — they see the tutor's pre-chosen plan in
  // confirm-payment, so /pricing-plans is tutor-only.
  const isTutor = !!user?.teacher_id;

  const handleSubscribe = async () => {
    if (!selected) return;
    if (isTutor) {
      setSaving(true);
      try {
        await updateTutorProfile({ payment_plan: PLAN_BY_KEY[selected] });
        await refreshMe();
      } catch (e) {
        Alert.alert("Could not save plan", e.message || "Please try again.");
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    router.push({
      pathname: "/session-price",
      params: { level, plan: selected },
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
        </TouchableOpacity>

        <Text style={styles.title}>Pricing Plans</Text>

        <View style={{ width: 32 }} />
      </View>

      <Text style={styles.subtitle}>Choose Payment Acceptance method</Text>

      {PLANS.map((p) => {
        const active = selected === p.id;
        return (
          <TouchableOpacity
            key={p.id}
            activeOpacity={0.85}
            style={[styles.card, active && styles.cardActive]}
            onPress={() => setSelected(p.id)}
          >
            <View style={styles.cardLeft}>
              <Text style={[styles.cardTitle, active && styles.textActive]}>
                {p.title}
              </Text>
              <Text style={[styles.cardSub, active && styles.textActive]}>
                {p.sub}
              </Text>
              <Text style={styles.cardDesc}>{p.desc}</Text>
            </View>
            <View style={[styles.radio, active && styles.radioActive]}>
              {active && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        style={[styles.btn, (!selected || saving) && styles.btnDisabled]}
        disabled={!selected || saving}
        onPress={handleSubscribe}
      >
        {saving ? (
          <ActivityIndicator color="#FFFBFA" />
        ) : (
          <Text style={styles.btnText}>Subscribe Now</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFBFA",
    paddingHorizontal: 24,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 50,
    marginBottom: 24,
  },

  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 14,
    fontFamily: "Domine",
    color: "#28221B",
  },

  subtitle: {
    fontSize: 17,
    fontFamily: "Domine",
    color: "#28221B",
    marginBottom: 28,
  },

  card: {
    minHeight: 90,
    backgroundColor: "#FFFBFA",
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
    shadowColor: "#28221B",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },

  cardActive: {
    borderColor: "#FF9E6D",
    backgroundColor: "#FFF6EF",
  },

  cardLeft: {
    flex: 1,
    alignItems: "center",
  },

  cardTitle: {
    fontSize: 26,
    fontFamily: "Outfit",
    fontWeight: "700",
    color: "#28221B",
  },

  cardSub: {
    fontSize: 14,
    fontFamily: "Outfit",
    color: "#28221B",
    marginTop: -4,
  },

  cardDesc: {
    fontSize: 11,
    fontFamily: "Outfit",
    color: "#7E6D66",
    textAlign: "center",
    marginTop: 6,
  },

  textActive: {
    color: "#FF9E6D",
  },

  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#DD8153",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },

  radioActive: {
    borderColor: "#FF9E6D",
  },

  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF9E6D",
  },

  btn: {
    position: "absolute",
    bottom: 28,
    left: 24,
    right: 24,
    height: 44,
    backgroundColor: "#FF9E6D",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  btnDisabled: {
    opacity: 0.5,
  },

  btnText: {
    fontSize: 14,
    fontFamily: "Outfit",
    fontWeight: "600",
    color: "#FFFBFA",
  },
});

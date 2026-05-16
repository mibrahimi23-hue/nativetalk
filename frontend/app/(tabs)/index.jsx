import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.heroWrap}>
          <View style={styles.glowOuter}>
            <View style={styles.glowInner}>
              <Ionicons name="chatbubbles" size={64} color="#FFFBFA" />
            </View>
          </View>
          <View style={styles.dotA} />
          <View style={styles.dotB} />
          <View style={styles.dotC} />
        </View>

        <Text style={styles.brand}>NativeTalk</Text>
        <View style={styles.underline} />

        <Text style={styles.headline}>
          Speak the world,{"\n"}one conversation at a time
        </Text>

        <Text style={styles.sub}>
          Connect with native tutors, learn at your pace, and unlock new
          languages with people who actually live them.
        </Text>

        <View style={styles.featureRow}>
          <Feature icon="globe-outline" label="50+ Languages" />
          <Feature icon="people-outline" label="Native Tutors" />
          <Feature icon="time-outline" label="Flexible Hours" />
        </View>

        <TouchableOpacity
          style={styles.cta}
          activeOpacity={0.85}
          onPress={() => router.push("/login")}
        >
          <Text style={styles.ctaText}>Get Started</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFBFA" />
        </TouchableOpacity>

        <Text style={styles.footer}>
          Tutors. Learners. One welcoming community.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function Feature({ icon, label }) {
  return (
    <View style={styles.feature}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={18} color="#DD8153" />
      </View>
      <Text style={styles.featureLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFBFA" },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },

  heroWrap: {
    width: 200,
    height: 200,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  glowOuter: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "#FFE8DC",
    alignItems: "center",
    justifyContent: "center",
  },
  glowInner: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "#FF9E6D",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF9E6D",
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  dotA: {
    position: "absolute",
    top: 6,
    right: 14,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#DD8153",
    opacity: 0.6,
  },
  dotB: {
    position: "absolute",
    bottom: 18,
    left: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF9E6D",
    opacity: 0.5,
  },
  dotC: {
    position: "absolute",
    top: 60,
    left: -2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#DD8153",
    opacity: 0.7,
  },

  brand: {
    fontFamily: "Domine",
    fontSize: 34,
    color: "#28221B",
    letterSpacing: 0.3,
  },
  underline: {
    width: 56,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#FF9E6D",
    marginTop: 8,
    marginBottom: 22,
  },

  headline: {
    fontFamily: "Domine",
    fontSize: 18,
    lineHeight: 26,
    color: "#28221B",
    textAlign: "center",
    marginBottom: 12,
  },
  sub: {
    fontFamily: "Outfit",
    fontSize: 13,
    lineHeight: 19,
    color: "#7E6D66",
    textAlign: "center",
    marginBottom: 28,
  },

  featureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 36,
  },
  feature: {
    alignItems: "center",
    flex: 1,
  },
  featureIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFF1E8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  featureLabel: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#28221B",
  },

  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF9E6D",
    width: "100%",
    paddingVertical: 16,
    borderRadius: 28,
    gap: 8,
    shadowColor: "#FF9E6D",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  ctaText: {
    color: "#FFFBFA",
    fontFamily: "Outfit",
    fontSize: 16,
    fontWeight: "600",
    marginRight: 4,
  },

  footer: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#A89080",
    marginTop: 20,
  },
});

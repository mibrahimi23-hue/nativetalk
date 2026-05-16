import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ApplicationSubmitted() {
  const { hours, price, total } = useLocalSearchParams();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.iconRing}>
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark" size={56} color="#FFFBFA" />
          </View>
        </View>

        <Text style={styles.title}>Application Submitted</Text>

        <Text style={styles.subtitle}>
          Thanks for applying to teach on NativeTalk! Our team will review your
          documents, certifications, and pricing details.
        </Text>

        {(hours || price || total) && (
          <View style={styles.summary}>
            <Text style={styles.summaryHeader}>Your submission</Text>

            {hours ? (
              <Row label="Total hours" value={`${hours} h`} />
            ) : null}
            {price ? <Row label="Hourly rate" value={`$${price}`} /> : null}
            {total ? (
              <Row label="Total per level" value={`$${total}`} bold />
            ) : null}
          </View>
        )}

        <Text style={styles.note}>
          You'll receive an email once your application is approved. In the
          meantime, you can preview your tutor dashboard.
        </Text>

        <TouchableOpacity
          style={styles.cta}
          activeOpacity={0.85}
          onPress={() => router.replace("/tutor-dashboard")}
        >
          <Text style={styles.ctaText}>Go to Tutor Dashboard</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFBFA" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value, bold }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && styles.rowBold]}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.rowBold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFBFA" },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
  },

  iconRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "#FFE8DC",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#FF9E6D",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF9E6D",
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },

  title: {
    fontFamily: "Domine",
    fontSize: 24,
    color: "#28221B",
    marginBottom: 12,
    textAlign: "center",
  },

  subtitle: {
    fontFamily: "Outfit",
    fontSize: 13,
    lineHeight: 19,
    color: "#7E6D66",
    textAlign: "center",
    marginBottom: 24,
  },

  summary: {
    width: "100%",
    backgroundColor: "#F3EDEA",
    borderRadius: 16,
    padding: 18,
    marginBottom: 24,
  },
  summaryHeader: {
    fontFamily: "Domine",
    fontSize: 14,
    color: "#28221B",
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  rowLabel: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#7E6D66",
  },
  rowValue: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
  },
  rowBold: {
    fontWeight: "700",
    color: "#28221B",
  },

  note: {
    fontFamily: "Outfit",
    fontSize: 12,
    lineHeight: 18,
    color: "#A89080",
    textAlign: "center",
    marginBottom: 28,
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
});

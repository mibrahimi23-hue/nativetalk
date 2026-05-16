import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { safeBack } from "@/hooks/use-safe-back";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  PanResponder,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { updateTutorProfile } from "@/services/tutors";
import { useUser } from "@/contexts/user-context";

const KNOB = 24;

const PRICE_BY_LEVEL = {
  A1: { min: 2, max: 4 },
  A2: { min: 3, max: 5 },
  B1: { min: 4, max: 6 },
  B2: { min: 5, max: 7 },
  C1: { min: 6, max: 8 },
  C2: { min: 7, max: 9 },
};

export default function SessionPrice() {
  const { level, plan } = useLocalSearchParams();
  const { user } = useUser();
  const effectiveLevel = PRICE_BY_LEVEL[level] ? level : "A2";
  const { min: MIN_PRICE, max: MAX_PRICE } = PRICE_BY_LEVEL[effectiveLevel];

  const [hours, setHours] = useState("");
  const [trackWidth, setTrackWidth] = useState(0);
  const [price, setPrice] = useState((MIN_PRICE + MAX_PRICE) / 2);
  const [submitting, setSubmitting] = useState(false);
  const startXRef = useRef(0);

  const usableWidth = Math.max(trackWidth - KNOB, 1);
  const ratio = (price - MIN_PRICE) / (MAX_PRICE - MIN_PRICE);
  const knobX = ratio * usableWidth;

  const setPriceFromX = (x) => {
    const clamped = Math.max(0, Math.min(usableWidth, x));
    const r = clamped / usableWidth;
    const raw = MIN_PRICE + r * (MAX_PRICE - MIN_PRICE);
    setPrice(Math.round(raw * 10) / 10);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startXRef.current = knobX;
      },
      onPanResponderMove: (_, gesture) => {
        setPriceFromX(startXRef.current + gesture.dx);
      },
      onPanResponderRelease: (_, gesture) => {
        setPriceFromX(startXRef.current + gesture.dx);
      },
    })
  ).current;

  const parsedHours = parseFloat(hours);
  const total =
    Number.isFinite(parsedHours) && parsedHours > 0
      ? Math.round(parsedHours * price * 100) / 100
      : 0;

  const canContinue = total > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Select Language Session Details</Text>
      </View>

      <Text style={styles.title}>Hours for this level</Text>

      <TextInput
        style={styles.input}
        placeholder="Enter total hours (e.g. 60)"
        placeholderTextColor="#7E6D66"
        keyboardType="numeric"
        value={hours}
        onChangeText={setHours}
      />

      <Text style={styles.title}>Select your hourly rate</Text>

      <Text style={styles.label}>
        Teaching level {effectiveLevel} — select a price between ${MIN_PRICE}-$
        {MAX_PRICE}
      </Text>

      <View
        style={styles.sliderTrack}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <View
          style={[
            styles.sliderFill,
            { width: knobX + KNOB / 2 },
          ]}
        />
        <View
          style={[
            styles.sliderKnob,
            { transform: [{ translateX: knobX }] },
          ]}
        />
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.bold}>${MIN_PRICE}</Text>
        <Text style={styles.bold}>${MAX_PRICE}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.text}>Price/Hour</Text>
        <Text style={styles.text}>${price.toFixed(2)}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.bold}>Total of level</Text>
        <Text style={styles.bold}>${total.toFixed(2)}</Text>
      </View>

      <TouchableOpacity
        style={[styles.btn, (!canContinue || submitting) && styles.btnDisabled]}
        disabled={!canContinue || submitting}
        onPress={async () => {
          setSubmitting(true);
          try {
            if (user?.teacher_id) {
              await updateTutorProfile({ hourly_rate: Math.round(price) });
            }
            router.push({
              pathname: "/application-submitted",
              params: {
                hours: parsedHours,
                price: price.toFixed(2),
                total: total.toFixed(2),
                level: effectiveLevel,
                plan,
              },
            });
          } catch (e) {
            Alert.alert("Could not save price", e.message || "Please try again.");
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {submitting ? (
          <ActivityIndicator color="#FFFBFA" />
        ) : (
          <Text style={styles.btnText}>Continue</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFBFA",
    paddingHorizontal: 22,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 50,
    marginBottom: 20,
  },

  backBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  headerTitle: {
    fontFamily: "Domine",
    fontSize: 14,
    color: "#28221B",
  },

  title: {
    fontFamily: "Domine",
    fontSize: 18,
    color: "#28221B",
    marginBottom: 12,
  },

  input: {
    height: 42,
    backgroundColor: "#E8D4CF",
    borderRadius: 18,
    paddingHorizontal: 14,
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    marginBottom: 24,
  },

  label: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#28221B",
    marginBottom: 14,
  },

  sliderTrack: {
    height: 8,
    backgroundColor: "#E8D4CF",
    borderRadius: 5,
    justifyContent: "center",
    marginVertical: 12,
  },

  sliderFill: {
    position: "absolute",
    left: 0,
    height: 8,
    borderRadius: 5,
    backgroundColor: "#FF9E6D",
  },

  sliderKnob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: "#FFFBFA",
    borderWidth: 3,
    borderColor: "#FF9E6D",
    shadowColor: "#28221B",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },

  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 24,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },

  text: {
    fontFamily: "Outfit",
    fontSize: 15,
    color: "#28221B",
  },

  bold: {
    fontFamily: "Outfit",
    fontSize: 15,
    fontWeight: "700",
    color: "#28221B",
  },

  btn: {
    position: "absolute",
    bottom: 26,
    left: 22,
    right: 22,
    height: 48,
    backgroundColor: "#FF9E6D",
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },

  btnDisabled: {
    opacity: 0.5,
  },

  btnText: {
    fontFamily: "Outfit",
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFBFA",
  },
});

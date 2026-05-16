import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useUser } from "@/contexts/user-context";
import { safeBack } from "@/hooks/use-safe-back";

// PayPal's hosted account login. The sandbox host is used when the backend
// is configured in sandbox mode (the default). Switch to www.paypal.com for
// real money. We only open the login page — the actual order approval happens
// later, when the user reaches /confirm-payment and the backend hands back a
// per-order approval URL via /paypal/create-order.
const PAYPAL_LOGIN_URL = "https://www.sandbox.paypal.com/signin";

export default function Payment() {
  const { profile } = useUser();
  // Forward every booking-context param we received (tutorId, scheduledAt,
  // level, hours, price, plan, etc.) to /confirm-payment so the booking
  // actually has the info it needs.
  const incomingParams = useLocalSearchParams();
  const accountEmail = (profile.email && profile.email.trim()) || "janeausten@gmail.com";
  const accountName =
    `${profile.firstName || "Jane"} ${profile.lastName || "Austen"}`
      .trim()
      .toUpperCase();

  const [activeAccount, setActiveAccount] = useState(true);

  const handleSignOut = () => {
    setActiveAccount(false);
    Alert.alert("Signed out", "PayPal account signed out from this device.");
  };

  const handleAddAccount = async () => {
    // Open PayPal's hosted sign-in so the user can authenticate against
    // their (sandbox) PayPal account. There's no OAuth-style callback in this
    // build — once the user has signed in we just flip the local state so the
    // "No account connected" hint disappears and the Continue button works.
    try {
      if (Platform.OS === "web") {
        const opened = window.open(
          PAYPAL_LOGIN_URL,
          "_blank",
          "noopener,noreferrer",
        );
        if (!opened) {
          Alert.alert(
            "Pop-up blocked",
            "Allow pop-ups for this site, then click PayPal again.",
          );
          return;
        }
      } else {
        await Linking.openURL(PAYPAL_LOGIN_URL);
      }
    } catch (e) {
      Alert.alert("Could not open PayPal", e?.message || "Please try again.");
      return;
    }
    setActiveAccount(true);
    Alert.alert(
      "PayPal connected",
      "Sign in to your PayPal sandbox account in the new tab, then tap Continue to keep going with your booking.",
    );
  };

  const handleContinue = () => {
    if (!activeAccount) {
      Alert.alert(
        "No account",
        "Please sign in to a PayPal account before continuing.",
      );
      return;
    }
    router.push({
      pathname: "/confirm-payment",
      params: incomingParams,
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Payment</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Saved Credentials</Text>

        <View style={styles.card}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardLabel}>PayPal Payment</Text>
            <View style={styles.payPalLogo}>
              <Ionicons name="logo-paypal" size={18} color="#003087" />
            </View>
          </View>

          <Text style={styles.cardEmail}>{accountEmail}</Text>
          <Text style={styles.cardName}>{accountName}</Text>
        </View>

        <Text style={styles.sectionTitle}>Update payment method</Text>

        <View style={styles.accountRow}>
          <View style={styles.payPalSmall}>
            <Ionicons name="logo-paypal" size={16} color="#003087" />
          </View>

          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.accountName}>
              {activeAccount
                ? `${profile.firstName || "Jane"} ${profile.lastName || "Austen"}`
                : "No account connected"}
            </Text>
            {activeAccount && (
              <Text style={styles.accountEmail}>{accountEmail}</Text>
            )}
          </View>

          {activeAccount ? (
            <TouchableOpacity onPress={handleSignOut}>
              <Text style={styles.signOut}>Sign Out</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>add account</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={handleAddAccount}>
          <Ionicons name="logo-paypal" size={20} color="#FFFBFA" />
          <Text style={styles.addBtnText}>PayPal</Text>
        </TouchableOpacity>
      </ScrollView>

      <TouchableOpacity style={styles.continueBtn} onPress={handleContinue}>
        <Text style={styles.continueText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFBFA",
    paddingHorizontal: 22,
    paddingTop: 48,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 28,
  },

  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Domine",
    fontSize: 16,
    color: "#28221B",
  },

  sectionTitle: {
    fontFamily: "Domine",
    fontSize: 18,
    color: "#28221B",
    marginBottom: 14,
    marginTop: 6,
  },

  card: {
    backgroundColor: "#DD8153",
    borderRadius: 14,
    paddingVertical: 26,
    paddingHorizontal: 22,
    marginBottom: 28,
    minHeight: 150,
    justifyContent: "space-between",
  },

  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 38,
  },

  cardLabel: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
  },

  payPalLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFFBFA",
    alignItems: "center",
    justifyContent: "center",
  },

  payPalLogoText: {
    fontFamily: "Domine",
    fontSize: 16,
    color: "#FF9E6D",
    fontWeight: "700",
    fontStyle: "italic",
  },

  cardEmail: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
    letterSpacing: 1.5,
    marginBottom: 6,
  },

  cardName: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#FFFBFA",
    letterSpacing: 2,
  },

  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFBFA",
    borderWidth: 1,
    borderColor: "#EFE6E1",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },

  payPalSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFF1E8",
    alignItems: "center",
    justifyContent: "center",
  },

  payPalSmallText: {
    fontFamily: "Domine",
    fontSize: 14,
    color: "#FF9E6D",
    fontWeight: "700",
    fontStyle: "italic",
  },

  accountName: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#28221B",
    fontWeight: "600",
  },

  accountEmail: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    marginTop: 2,
  },

  signOut: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#28221B",
    fontWeight: "600",
  },

  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 18,
    paddingHorizontal: 8,
  },

  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#EFE6E1",
  },

  dividerText: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
    paddingHorizontal: 12,
  },

  addBtn: {
    backgroundColor: "#FF9E6D",
    borderRadius: 26,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  payPalLogoLarge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FF9E6D",
    alignItems: "center",
    justifyContent: "center",
  },

  payPalLogoLargeText: {
    fontFamily: "Domine",
    fontSize: 14,
    color: "#FFFBFA",
    fontWeight: "700",
    fontStyle: "italic",
  },

  addBtnText: {
    fontFamily: "Domine",
    fontSize: 16,
    color: "#FFFBFA",
    fontStyle: "italic",
    fontWeight: "700",
  },

  continueBtn: {
    position: "absolute",
    bottom: 24,
    left: 22,
    right: 22,
    height: 44,
    backgroundColor: "#FF9E6D",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  continueText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
    fontWeight: "600",
  },
});

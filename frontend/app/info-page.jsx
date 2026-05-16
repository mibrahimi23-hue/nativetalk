import { router } from "expo-router";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { safeBack } from "@/hooks/use-safe-back";

export default function ApplicationSubmitted() {
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerText}>Account creation</Text>
      </View>

      {/* Title */}
      <Text style={styles.title}>Application submitted</Text>

      {/* Image */}
      <Image
        source={{
          uri: "https://images.unsplash.com/photo-1587614382346-4ecf5d3b1d5b",
        }}
        style={styles.image}
      />

      {/* Text */}
      <Text style={styles.subtitle}>What happens next?</Text>

      <Text style={styles.description}>
        Your account is being reviewed and as soon as we review it, our team
        will create and approve your account if eligible!
      </Text>

      {/* Button */}
      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>Learn More</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFBFA",
    padding: 20,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },

  backBtn: {
    backgroundColor: "#FF9E6D",
    width: 30,
    height: 30,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  backText: {
    color: "#FFFBFA",
    fontSize: 40,
  },

  headerText: {
    fontSize: 16,
    color: "#28221B",
  },

  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 15,
    color: "#28221B",
  },

  image: {
    width: "100%",
    height: 180,
    borderRadius: 10,
    marginBottom: 20,
  },

  subtitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
    color: "#28221B",
  },

  description: {
    fontSize: 14,
    color: "#28221B",
    lineHeight: 20,
  },

  button: {
    position: "absolute",
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: "#FF9E6D",
    padding: 16,
    borderRadius: 30,
    alignItems: "center",
  },

  buttonText: {
    color: "#FFFBFA",
    fontWeight: "600",
  },
});

import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { safeBack } from "@/hooks/use-safe-back";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { uploadCertificate } from "@/services/certificates";

export default function UploadCertificate() {
  const { level } = useLocalSearchParams();
  const [certificateName, setCertificateName] = useState("");
  const [certFile, setCertFile] = useState(null);
  const [notarizedFile, setNotarizedFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const pickFile = async (setter) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png"],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (asset) setter(asset);
  };

  const handleUpload = async () => {
    if (!certificateName.trim()) {
      Alert.alert("Missing info", "Please enter the certificate name.");
      return;
    }
    if (!certFile) {
      Alert.alert("Missing document", "Please attach your certificate file.");
      return;
    }
    setSubmitting(true);
    try {
      await uploadCertificate({
        name: certificateName.trim(),
        asset: certFile,
        isNotarized: !!notarizedFile,
      });
      if (notarizedFile) {
        await uploadCertificate({
          name: `${certificateName.trim()} (Notarized)`,
          asset: notarizedFile,
          isNotarized: true,
        });
      }
      router.push({ pathname: "/availability", params: { level } });
    } catch (e) {
      Alert.alert("Upload failed", e.message || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Upload Certificates</Text>

        <View style={{ width: 30 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Language Certificate</Text>
        <Text style={styles.sectionSubtitle}>
          Upload your certificate details
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Certificate Name"
          placeholderTextColor="#8D7C74"
          value={certificateName}
          onChangeText={setCertificateName}
        />

        <Text style={styles.documentsTitle}>Upload documents</Text>

        <TouchableOpacity
          style={styles.uploadRow}
          onPress={() => pickFile(setCertFile)}
        >
          <Text style={styles.uploadRowText} numberOfLines={1}>
            {certFile?.name || "Certificate"}
          </Text>
          <Ionicons name="document-attach" size={18} color="#28221B" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.uploadRow}
          onPress={() => pickFile(setNotarizedFile)}
        >
          <Text style={styles.uploadRowText} numberOfLines={1}>
            {notarizedFile?.name || "Notarized Certificate"}
          </Text>
          <Ionicons name="document-attach" size={18} color="#28221B" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.uploadBtn, submitting && { opacity: 0.7 }]}
        disabled={submitting}
        onPress={handleUpload}
      >
        {submitting ? (
          <ActivityIndicator color="#FFFBFA" />
        ) : (
          <Text style={styles.uploadBtnText}>Upload</Text>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#FFFBFA",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingTop: 18,
    marginBottom: 18,
  },

  backBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 13,
    fontFamily: "Domine",
    color: "#28221B",
  },

  content: {
    paddingHorizontal: 28,
  },

  sectionTitle: {
    fontSize: 18,
    fontFamily: "Domine",
    fontWeight: "700",
    color: "#28221B",
  },

  sectionSubtitle: {
    fontSize: 10,
    fontFamily: "Outfit",
    color: "#8D7C74",
    marginTop: 4,
    marginBottom: 10,
  },

  input: {
    height: 42,
    backgroundColor: "#F1E5E1",
    borderRadius: 11,
    paddingHorizontal: 14,
    fontSize: 12,
    fontFamily: "Outfit",
    color: "#28221B",
    marginBottom: 24,
  },

  documentsTitle: {
    fontSize: 18,
    fontFamily: "Domine",
    fontWeight: "700",
    color: "#28221B",
    marginBottom: 14,
  },

  uploadRow: {
    height: 38,
    backgroundColor: "#F1E5E1",
    borderRadius: 11,
    paddingHorizontal: 14,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  uploadRowText: {
    fontSize: 12,
    fontFamily: "Outfit",
    color: "#8D7C74",
    flex: 1,
    marginRight: 8,
  },

  uploadBtn: {
    position: "absolute",
    bottom: 26,
    left: 28,
    right: 28,
    height: 40,
    backgroundColor: "#FF9E6D",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  uploadBtnText: {
    fontSize: 12,
    fontFamily: "Outfit",
    fontWeight: "600",
    color: "#FFFBFA",
  },
});

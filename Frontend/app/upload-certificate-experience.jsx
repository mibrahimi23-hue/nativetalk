import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { safeBack } from "@/hooks/use-safe-back";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { uploadCertificate } from "@/services/certificates";

export default function UploadCertificateExperienceScreen() {
  const { level } = useLocalSearchParams();
  const [certificateName, setCertificateName] = useState("");
  const [certFile, setCertFile] = useState(null);
  const [notarizedFile, setNotarizedFile] = useState(null);
  const [eduFile, setEduFile] = useState(null);
  const [notarizedEduFile, setNotarizedEduFile] = useState(null);
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

  const uploadOne = (name, asset, isNotarized) =>
    uploadCertificate({ name, asset, isNotarized });

  const handleUpload = async () => {
    if (!certificateName.trim()) {
      Alert.alert("Missing fields", "Please enter the certificate name.");
      return;
    }
    if (!certFile || !eduFile) {
      Alert.alert(
        "Missing documents",
        "Please attach both the certificate and the education proof.",
      );
      return;
    }
    setSubmitting(true);
    try {
      await uploadOne(certificateName.trim(), certFile, false);
      if (notarizedFile) {
        await uploadOne(`${certificateName.trim()} (Notarized)`, notarizedFile, true);
      }
      await uploadOne(`${certificateName.trim()} — Education proof`, eduFile, false);
      if (notarizedEduFile) {
        await uploadOne(
          `${certificateName.trim()} — Education proof (Notarized)`,
          notarizedEduFile,
          true,
        );
      }
      router.push({ pathname: "/availability", params: { level } });
    } catch (e) {
      Alert.alert("Upload failed", e.message || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const Row = ({ label, asset, onPick }) => (
    <TouchableOpacity style={styles.fileRow} onPress={onPick}>
      <Text style={styles.fileRowText} numberOfLines={1}>
        {asset?.name || label}
      </Text>
      <Ionicons name="document-attach-outline" size={20} color="#A89080" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => safeBack()}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Upload Certificates</Text>
          </View>

          <Text style={styles.sectionTitle}>Language Certificate</Text>
          <Text style={styles.sectionSubtitle}>
            Upload your certificate details
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Certificate Name"
            placeholderTextColor="#A89080"
            value={certificateName}
            onChangeText={setCertificateName}
          />

          <Text style={styles.sectionTitle}>Upload documents</Text>

          <Row label="Certificate" asset={certFile} onPick={() => pickFile(setCertFile)} />
          <Row
            label="Notarized Certificate"
            asset={notarizedFile}
            onPick={() => pickFile(setNotarizedFile)}
          />
          <Row label="Education Proof" asset={eduFile} onPick={() => pickFile(setEduFile)} />
          <Row
            label="Notarized Education Proof"
            asset={notarizedEduFile}
            onPick={() => pickFile(setNotarizedEduFile)}
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.uploadButton, submitting && { opacity: 0.7 }]}
          onPress={handleUpload}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFBFA" />
          ) : (
            <Text style={styles.uploadButtonText}>Upload</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFBFA",
  },
  scrollContent: {
    paddingBottom: 24,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 28,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#28221B",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#28221B",
    marginBottom: 4,
    marginTop: 16,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#A89080",
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#F2EAE3",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: "#28221B",
    marginBottom: 8,
  },
  fileRow: {
    backgroundColor: "#F2EAE3",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  fileRowText: {
    fontSize: 14,
    color: "#A89080",
    flex: 1,
    marginRight: 8,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "android" ? 20 : 10,
    paddingTop: 10,
  },
  uploadButton: {
    backgroundColor: "#FF9E6D",
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: "center",
  },
  uploadButtonText: {
    color: "#FFFBFA",
    fontSize: 16,
    fontWeight: "600",
  },
});

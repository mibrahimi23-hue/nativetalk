import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Avatar } from "@/components/avatar";
import { useUser } from "@/contexts/user-context";
import { useSafeBack } from "@/hooks/use-safe-back";
import { getPricingRanges, uploadAvatar } from "@/services/auth";
import { buildMediaUrl } from "@/services/api";

export default function EditProfile() {
  const { profile, role, saveProfile, refreshMe } = useUser();
  const safeBack = useSafeBack();

  const [firstName, setFirstName] = useState(profile.firstName || "");
  const [lastName, setLastName] = useState(profile.lastName || "");
  const [email, setEmail] = useState(profile.email || "");
  const [phone, setPhone] = useState(profile.phone || "");
  const [location, setLocation] = useState(profile.location || "");
  const [bio, setBio] = useState(profile.bio || "");
  const [language, setLanguage] = useState(profile.language || "");
  const [level, setLevel] = useState(profile.level || "");
  const [hourlyRate, setHourlyRate] = useState(
    profile.hourlyRate != null ? String(profile.hourlyRate) : "",
  );
  const [pricingRanges, setPricingRanges] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [avatarOverride, setAvatarOverride] = useState(null);

  // Pull the platform's per-level price/hours table so we can show the
  // tutor the allowed range for the level they teach (A1 €3-€5, …, C2 €7-€9).
  useEffect(() => {
    if (role !== "Tutor") return;
    let cancelled = false;
    getPricingRanges()
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setPricingRanges(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [role]);

  const rangeForLevel = useMemo(
    () => pricingRanges.find((r) => r.level === (level || profile.level)),
    [pricingRanges, level, profile.level],
  );

  // Show the uploaded image when one exists. Otherwise fall back to the
  // user's initials inside `<Avatar />` (deterministic colour per name).
  const photoUri = avatarOverride || buildMediaUrl(profile.avatar) || profile.avatar || null;
  const fullName = `${firstName} ${lastName}`.trim();

  const handleChangePhoto = async () => {
    if (photoUploading) return;
    try {
      // Permission is auto-granted on web — on native the user is prompted.
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert(
          "Photo access denied",
          "Allow photo library access in settings to change your avatar.",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions
          ? ImagePicker.MediaTypeOptions.Images
          : "Images",
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      setPhotoUploading(true);
      try {
        const updated = await uploadAvatar(asset);
        const newPath =
          updated?.profile_photo || updated?.profile_photo_url || asset.uri;
        const resolvedUrl = buildMediaUrl(newPath) || newPath;
        setAvatarOverride(resolvedUrl);
        // Re-fetch the user so the avatar shown elsewhere (dashboards, etc.)
        // updates without needing a full reload.
        await refreshMe();
      } catch (e) {
        Alert.alert("Upload failed", e?.message || "Please try again.");
      } finally {
        setPhotoUploading(false);
      }
    } catch (e) {
      Alert.alert("Could not open picker", e?.message || "Please try again.");
    }
  };

  const handleSave = async () => {
    if (role === "Tutor" && hourlyRate !== "") {
      const parsed = Number(hourlyRate);
      if (!Number.isFinite(parsed)) {
        Alert.alert("You cannot apply that price", "Hourly rate must be a number.");
        return;
      }
      if (
        rangeForLevel &&
        (parsed < rangeForLevel.price_min || parsed > rangeForLevel.price_max)
      ) {
        Alert.alert(
          "You cannot apply that price",
          `For level ${rangeForLevel.level} the price is between €${rangeForLevel.price_min.toFixed(2)} and €${rangeForLevel.price_max.toFixed(2)}.`,
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      await saveProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        location: location.trim(),
        bio: bio.trim(),
        language: language.trim(),
        level: level.trim(),
        ...(role === "Tutor" && hourlyRate !== ""
          ? { hourlyRate: Number(hourlyRate) }
          : {}),
      });
      const fallback =
        role === "Tutor"
          ? "/profile"
          : role === "Admin"
          ? "/admin-profile"
          : "/student-profile";
      safeBack(fallback);
    } catch (e) {
      // Backend returns a contextual 400 for level/price violations — pick
      // a friendlier title based on the wording so the alert isn't just
      // "Could not save".
      const msg = e?.message || "";
      let title = "Could not save";
      if (/cannot change your level/i.test(msg)) {
        title = "You cannot change your level";
      } else if (/cannot apply that price|hourly rate/i.test(msg)) {
        title = "You cannot apply that price";
      }
      Alert.alert(title, msg || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatarBlock}>
          <Avatar
            uri={photoUri}
            name={fullName || profile.email}
            seed={profile.email || fullName}
            size={96}
          />
          <TouchableOpacity
            style={[
              styles.changePhotoBtn,
              photoUploading && { opacity: 0.7 },
            ]}
            onPress={handleChangePhoto}
            disabled={photoUploading}
          >
            {photoUploading ? (
              <ActivityIndicator color="#FFFBFA" />
            ) : (
              <>
                <Ionicons name="camera" size={14} color="#FFFBFA" />
                <Text style={styles.changePhotoText}>Change photo</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>First name</Text>
        <TextInput
          style={styles.input}
          value={firstName}
          onChangeText={setFirstName}
          placeholder="First name"
          placeholderTextColor="#8D7C74"
        />

        <Text style={styles.label}>Last name</Text>
        <TextInput
          style={styles.input}
          value={lastName}
          onChangeText={setLastName}
          placeholder="Last name"
          placeholderTextColor="#8D7C74"
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email address"
          placeholderTextColor="#8D7C74"
          keyboardType="email-address"
          autoCapitalize="none"
          editable={false}
        />

        <Text style={styles.label}>Phone</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone (optional)"
          placeholderTextColor="#8D7C74"
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Location</Text>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder="City or country"
          placeholderTextColor="#8D7C74"
        />

        <Text style={styles.label}>
          {role === "Tutor" ? "Language taught" : "Language to learn"}
        </Text>
        <TextInput
          style={styles.input}
          value={language}
          onChangeText={setLanguage}
          placeholder="e.g. Spanish"
          placeholderTextColor="#8D7C74"
        />

        <Text style={styles.label}>
          {role === "Tutor" ? "Level (e.g. C2)" : "Target level (e.g. B2)"}
        </Text>
        <TextInput
          style={styles.input}
          value={level}
          onChangeText={setLevel}
          placeholder="A1 / A2 / B1 / B2 / C1 / C2"
          placeholderTextColor="#8D7C74"
        />

        {role === "Tutor" ? (
          <>
            <Text style={styles.label}>Hourly rate (€/hr)</Text>
            <TextInput
              style={styles.input}
              value={hourlyRate}
              onChangeText={setHourlyRate}
              placeholder="e.g. 5"
              placeholderTextColor="#8D7C74"
              keyboardType="decimal-pad"
            />
            {rangeForLevel ? (
              <Text style={styles.hint}>
                Allowed range for {rangeForLevel.level}: €
                {rangeForLevel.price_min.toFixed(2)} – €
                {rangeForLevel.price_max.toFixed(2)} / hr
                {rangeForLevel.hours_min != null
                  ? ` · Course hours: ${rangeForLevel.hours_min}-${rangeForLevel.hours_max}`
                  : ""}
              </Text>
            ) : null}
            {pricingRanges.length > 0 ? (
              <View style={styles.rangeTable}>
                {pricingRanges.map((r) => (
                  <View key={r.level} style={styles.rangeRow}>
                    <Text style={styles.rangeCell}>{r.level}</Text>
                    <Text style={styles.rangeCellWide}>
                      €{r.price_min?.toFixed(2)} – €{r.price_max?.toFixed(2)}/hr
                    </Text>
                    <Text style={styles.rangeCell}>
                      {r.hours_min}-{r.hours_max} h
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        <Text style={styles.label}>Bio</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={bio}
          onChangeText={setBio}
          placeholder="Tell us a bit about yourself"
          placeholderTextColor="#8D7C74"
          multiline
        />

        <TouchableOpacity
          style={[styles.saveBtn, submitting && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFBFA" />
          ) : (
            <Text style={styles.saveText}>Save changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: "#FFFBFA" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 55,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },

  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  headerTitle: {
    fontFamily: "Domine",
    fontSize: 16,
    color: "#28221B",
  },

  content: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 80,
  },

  avatarBlock: {
    alignItems: "center",
    marginBottom: 18,
    gap: 10,
  },

  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#F3EDEA",
  },

  changePhotoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FF9E6D",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },

  changePhotoText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  label: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    marginBottom: 6,
    marginTop: 12,
  },

  input: {
    backgroundColor: "#F3EDEA",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#28221B",
  },

  textArea: {
    minHeight: 90,
    textAlignVertical: "top",
  },

  hint: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
    marginTop: 6,
  },

  rangeTable: {
    marginTop: 10,
    backgroundColor: "#FFF1E8",
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },

  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },

  rangeCell: {
    width: 38,
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#28221B",
  },

  rangeCellWide: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#28221B",
  },

  saveBtn: {
    marginTop: 28,
    backgroundColor: "#FF9E6D",
    paddingVertical: 14,
    borderRadius: 22,
    alignItems: "center",
  },

  saveText: {
    fontFamily: "Outfit",
    fontSize: 15,
    color: "#FFFBFA",
    fontWeight: "600",
  },
});

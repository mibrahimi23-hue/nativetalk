import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Avatar } from "@/components/avatar";
import { TutorBottomNav } from "@/components/tutor-bottom-nav";
import { useUser } from "@/contexts/user-context";
import { useSafeBack } from "@/hooks/use-safe-back";
import { buildMediaUrl } from "@/services/api";
import { getPricingRanges } from "@/services/auth";


export default function Profile() {
  const { profile, role, logout } = useUser();
  const safeBack = useSafeBack();
  const [pricingRanges, setPricingRanges] = useState([]);

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
    () => pricingRanges.find((r) => r.level === profile.level),
    [pricingRanges, profile.level],
  );

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const fullName =
    `${profile.firstName || ""} ${profile.lastName || ""}`.trim() ||
    "Your Name";
  const bio =
    profile.bio ||
    (role === "Tutor"
      ? "Add a short bio so students learn what makes you a great tutor."
      : "Add a short bio so tutors get to know you.");
  const levelLine = profile.level
    ? `${profile.level}${profile.language ? ` ${profile.language}` : ""}`
    : profile.language || (role === "Tutor" ? "Tutor" : "Learner");

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile Settings</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatarWrap}>
          <Avatar
            uri={buildMediaUrl(profile.avatar) || profile.avatar || null}
            name={fullName || profile.email}
            seed={profile.email || fullName}
            size={96}
          />
        </View>

        <Text style={styles.name}>{fullName}</Text>
        <Text style={styles.bio}>{bio}</Text>
        <Text style={styles.level}>{levelLine}</Text>

        {role === "Tutor" ? (
          <View style={styles.priceCard}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Your hourly rate</Text>
              <Text style={styles.priceValue}>
                {profile.hourlyRate != null
                  ? `€${Number(profile.hourlyRate).toFixed(2)}/hr`
                  : "Not set"}
              </Text>
            </View>
            {rangeForLevel ? (
              <>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>
                    Allowed for {rangeForLevel.level}
                  </Text>
                  <Text style={styles.priceValueDim}>
                    €{rangeForLevel.price_min.toFixed(2)} – €
                    {rangeForLevel.price_max.toFixed(2)}/hr
                  </Text>
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Course hours</Text>
                  <Text style={styles.priceValueDim}>
                    {rangeForLevel.hours_min}-{rangeForLevel.hours_max} hours
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => router.push("/edit-profile")}
        >
          <Text style={styles.editText}>✎ Edit profile</Text>
        </TouchableOpacity>

        <Text style={styles.settingsTitle}>Settings</Text>

        {role === "Tutor" ? (
          <MenuItem
            icon="calendar-outline"
            title="Edit availability"
            route="/availability"
          />
        ) : null}
        <MenuItem icon="information-circle-outline" title="About" route="/about" />
        <MenuItem icon="lock-closed-outline" title="Privacy" route="/privacy" />
        <MenuItem
          icon="notifications-outline"
          title="Notifications"
          route="/notifications"
        />
        <MenuItem icon="settings-outline" title="Settings" route="/settings" />
        <MenuItem
          icon="help-circle-outline"
          title="More Information"
          route="/info-page"
        />

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color="#FFFBFA" />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>

      <TutorBottomNav />
    </View>
  );
}

function MenuItem({ icon, title, route }) {
  return (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={() => router.push(route)}
    >
      <Ionicons name={icon} size={18} color="#28221B" />
      <Text style={styles.menuText}>{title}</Text>
      <Ionicons name="chevron-forward" size={18} color="#28221B" />
    </TouchableOpacity>
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
    fontFamily: "Domine",
    fontSize: 13,
    color: "#28221B",
    fontWeight: "700",
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignSelf: "center",
    marginBottom: 10,
  },
  avatarWrap: {
    alignSelf: "center",
    marginBottom: 10,
  },
  name: {
    fontFamily: "Domine",
    fontSize: 18,
    textAlign: "center",
    color: "#28221B",
  },
  bio: {
    fontFamily: "Outfit",
    fontSize: 12,
    textAlign: "center",
    color: "#28221B",
    marginTop: 6,
    paddingHorizontal: 20,
  },
  level: {
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    color: "#28221B",
    marginTop: 4,
  },
  priceCard: {
    backgroundColor: "#FFF1E8",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 18,
  },

  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },

  priceLabel: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
  },

  priceValue: {
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "700",
    color: "#28221B",
  },

  priceValueDim: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#28221B",
  },

  editBtn: {
    height: 38,
    backgroundColor: "#FF9E6D",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 28,
  },
  editText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#FFFBFA",
  },
  settingsTitle: {
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "700",
    color: "#28221B",
    marginBottom: 14,
  },
  logoutBtn: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    backgroundColor: "#DD8153",
    borderRadius: 22,
  },
  logoutText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
    fontWeight: "600",
  },
  menuItem: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
  },
  menuText: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    marginLeft: 16,
  },
  bottomNav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 48,
    backgroundColor: "#FDF0EC",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
});

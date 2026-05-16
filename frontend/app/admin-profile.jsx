import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
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
import { useUser } from "@/contexts/user-context";
import { safeBack } from "@/hooks/use-safe-back";
import { buildMediaUrl } from "@/services/api";


export default function AdminProfile() {
  const { profile, logout } = useUser();

  const fullName =
    `${profile.firstName || ""} ${profile.lastName || ""}`.trim() ||
    "Admin User";

  const handleLogout = async () => {
    // Log out immediately without a confirmation dialog. The user-context's
    // logout() clears tokens and navigates to /login; we also call replace
    // here as a belt-and-suspenders against any race with state updates.
    await logout();
    router.replace("/login");
  };

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
        contentContainerStyle={{ paddingBottom: 90 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatarWrap}>
          <Avatar
            uri={buildMediaUrl(profile.avatar) || profile.avatar || null}
            name={fullName || profile.email || "Admin"}
            seed={profile.email || fullName}
            size={92}
          />
        </View>

        <Text style={styles.name}>{fullName}</Text>
        <Text style={styles.role}>Administrator</Text>
        {profile.email ? (
          <Text style={styles.email}>{profile.email}</Text>
        ) : null}

        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => router.push("/edit-profile")}
        >
          <Text style={styles.editText}>✎ Edit profile</Text>
        </TouchableOpacity>

        <Text style={styles.settingsTitle}>Settings</Text>

        <MenuItem icon="information-circle-outline" title="About" route="/about" />
        <MenuItem icon="lock-closed-outline" title="Privacy" route="/privacy" />
        <MenuItem
          icon="notifications-outline"
          title="Notifications"
          route="/notifications"
        />
        <MenuItem icon="settings-outline" title="Settings" route="/settings" />
        <MenuItem
          icon="construct-outline"
          title="Exam Builder"
          route="/admin-exam-builder"
        />
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

      <View style={styles.bottomNav}>
        <TouchableOpacity onPress={() => router.push("/admin-dashboard")}>
          <Ionicons name="home" size={20} color="#28221B" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/admin-approvals")}>
          <Ionicons name="shield-checkmark" size={20} color="#28221B" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/admin-transactions")}>
          <Ionicons name="swap-horizontal" size={20} color="#28221B" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/admin-profile")}>
          <Ionicons name="person-circle" size={20} color="#FF9E6D" />
        </TouchableOpacity>
      </View>
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
    marginBottom: 20,
  },

  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Domine",
    fontSize: 14,
    color: "#28221B",
  },

  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignSelf: "center",
    marginBottom: 12,
  },
  avatarWrap: {
    alignSelf: "center",
    marginBottom: 12,
  },

  name: {
    fontFamily: "Domine",
    fontSize: 20,
    textAlign: "center",
    color: "#28221B",
  },

  role: {
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    color: "#FF9E6D",
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  email: {
    fontFamily: "Outfit",
    fontSize: 12,
    textAlign: "center",
    color: "#7E6D66",
    marginTop: 2,
  },

  editBtn: {
    height: 40,
    backgroundColor: "#FF9E6D",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 26,
  },

  editText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  settingsTitle: {
    fontFamily: "Outfit",
    fontSize: 13,
    fontWeight: "700",
    color: "#28221B",
    marginBottom: 12,
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

  logoutBtn: {
    marginTop: 20,
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

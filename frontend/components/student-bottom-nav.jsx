import { Ionicons } from "@expo/vector-icons";
import { router, usePathname, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { listConversations } from "@/services/chat";

const ITEMS = [
  { icon: "home-outline", route: "/student-dashboard" },
  { icon: "book-outline", route: "/student-lessons" },
  { icon: "chatbubble-ellipses-outline", route: "/messages" },
  { icon: "bookmark-outline", route: "/saved-tutors" },
  { icon: "person-outline", route: "/student-profile" },
];

export function StudentBottomNav() {
  const pathname = usePathname();
  const [unreadTotal, setUnreadTotal] = useState(0);

  const activeColor = "#FF9E6D";
  const inactiveColor = "#28221B";

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listConversations()
        .then((data) => {
          if (cancelled) return;
          const total = Array.isArray(data)
            ? data.reduce((acc, c) => acc + Number(c.unread_count || 0), 0)
            : 0;
          setUnreadTotal(total);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <View style={styles.bottomNav}>
      {ITEMS.map((it) => {
        const path = it.route.split("?")[0];
        const active = pathname === path;
        const showBadge = it.route === "/messages" && unreadTotal > 0;
        return (
          <TouchableOpacity
            key={it.route}
            onPress={() => router.push(it.route)}
            style={styles.navItem}
            activeOpacity={0.7}
          >
            <View>
              <Ionicons
                name={it.icon}
                size={22}
                color={active ? activeColor : inactiveColor}
              />
              {showBadge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadTotal > 9 ? "9+" : unreadTotal}
                  </Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "#FDF0EC",
    borderTopWidth: 1,
    borderTopColor: "#EFE6E1",
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: "#FF9E6D",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontFamily: "Outfit",
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFBFA",
  },
});

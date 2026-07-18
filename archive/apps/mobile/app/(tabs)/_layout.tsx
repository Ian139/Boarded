import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useTheme } from '../../lib/theme';

function TabIcon({ icon, color }: { icon: string; color: string }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {icon === 'routes' && (
        <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginBottom: 2 }} />
          <View style={{ flexDirection: 'row', gap: 2 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
          </View>
        </View>
      )}
      {icon === 'editor' && (
        <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 16, height: 16, borderWidth: 2, borderColor: color, borderRadius: 4 }}>
            <View style={{ position: 'absolute', top: 3, left: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: color }} />
          </View>
        </View>
      )}
      {icon === 'profile' && (
        <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: color, marginBottom: 1 }} />
          <View style={{ width: 14, height: 6, borderTopLeftRadius: 7, borderTopRightRadius: 7, borderWidth: 2, borderColor: color, borderBottomWidth: 0 }} />
        </View>
      )}
    </View>
  );
}

export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          minHeight: 64,
          paddingTop: 6,
          paddingBottom: 8,
          shadowOpacity: 0,
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarBackground: () => (
          <View style={{ flex: 1, backgroundColor: colors.background }} />
        ),
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 17,
          color: colors.text,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Routes',
          tabBarAccessibilityLabel: 'Routes',
          tabBarButtonTestID: 'routes-tab',
          tabBarIcon: ({ color }) => <TabIcon icon="routes" color={color} />,
        }}
      />
      <Tabs.Screen
        name="editor"
        options={{
          title: 'Editor',
          headerShown: false,
          tabBarAccessibilityLabel: 'Editor',
          tabBarButtonTestID: 'editor-tab',
          tabBarIcon: ({ color }) => <TabIcon icon="editor" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile',
          tabBarButtonTestID: 'profile-tab',
          tabBarIcon: ({ color }) => <TabIcon icon="profile" color={color} />,
        }}
      />
    </Tabs>
  );
}

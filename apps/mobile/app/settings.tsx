import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Image,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { nanoid } from 'nanoid/non-secure';
import { supabase } from '../lib/supabase';
import { useWallsStore } from '../lib/stores/walls-store';
import { useRoutesStore } from '../lib/stores/routes-store';
import { useUserStore } from '../lib/stores/user-store';
import { colors, useTheme } from '../lib/theme';

function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
      {children}
    </Text>
  );
}

function SunIcon({ size = 22 }: { size?: number }) {
  const s = size;
  const half = s / 2;
  const rayLen = s * 0.24;
  const rayW = 2;
  const color = '#f5a623';
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: s * 0.44, height: s * 0.44, borderRadius: s * 0.22, backgroundColor: color }} />
      <View style={{ position: 'absolute', width: rayLen, height: rayW, borderRadius: 1, backgroundColor: color, top: 1, left: half - rayLen / 2 }} />
      <View style={{ position: 'absolute', width: rayLen, height: rayW, borderRadius: 1, backgroundColor: color, bottom: 1, left: half - rayLen / 2 }} />
      <View style={{ position: 'absolute', width: rayW, height: rayLen, borderRadius: 1, backgroundColor: color, left: 1, top: half - rayLen / 2 }} />
      <View style={{ position: 'absolute', width: rayW, height: rayLen, borderRadius: 1, backgroundColor: color, right: 1, top: half - rayLen / 2 }} />
    </View>
  );
}

function MoonIcon({ size = 22 }: { size?: number }) {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: s * 0.42, height: s * 0.42, borderRadius: s * 0.21, backgroundColor: '#5b6e8a' }} />
      <View style={{ width: s * 0.28, height: s * 0.28, borderRadius: s * 0.14, backgroundColor: '#8ba3c4', position: 'absolute', top: 1, right: 0 }} />
    </View>
  );
}

function SystemIcon({ size = 22 }: { size?: number }) {
  const s = size;
  return (
    <View style={{ width: s, height: s, borderRadius: s / 2, overflow: 'hidden', flexDirection: 'row', borderWidth: 1, borderColor: `${colors.muted}55` }}>
      <View style={{ flex: 1, backgroundColor: '#f5a623' }} />
      <View style={{ flex: 1, backgroundColor: '#5b6e8a' }} />
    </View>
  );
}

export default function SettingsScreen() {
  const { mode, resolvedMode, setMode } = useTheme();
  const { addWall, walls, fetchWalls } = useWallsStore();
  const { routes, isOfflineMode, fetchRoutes } = useRoutesStore();
  const { user, profile, isAuthenticated, logout, uploadAvatar } = useUserStore();
  const [wallName, setWallName] = useState('');
  const [wallImageUri, setWallImageUri] = useState<string | null>(null);
  const [isUploadingWall, setIsUploadingWall] = useState(false);
  const [wallError, setWallError] = useState('');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const pickWallImage = async () => {
    setWallError('');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setWallImageUri(result.assets[0].uri);
    }
  };

  const uploadWall = async () => {
    if (!wallName.trim() || !wallImageUri) {
      setWallError('Add a wall name and image.');
      return;
    }

    setIsUploadingWall(true);
    setWallError('');

    try {
      const wallId = nanoid();
      const response = await fetch(wallImageUri);
      const blob = await response.blob();
      const path = `${wallId}/${Date.now()}.jpg`;

      const { error } = await supabase.storage
        .from('walls')
        .upload(path, blob, { contentType: 'image/jpeg' });

      if (error) throw new Error(error.message);

      const { data } = supabase.storage.from('walls').getPublicUrl(path);
      const imageUrl = data.publicUrl;

      await addWall({
        id: wallId,
        user_id: 'local-user',
        name: wallName.trim(),
        image_url: imageUrl,
        image_width: 1920,
        image_height: 1080,
        is_public: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      setWallName('');
      setWallImageUri(null);
    } catch (error) {
      setWallError(error instanceof Error ? error.message : 'Failed to upload wall');
    } finally {
      setIsUploadingWall(false);
    }
  };

  const pickAvatar = async () => {
    setIsUploadingAvatar(true);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      await uploadAvatar({
        uri: result.assets[0].uri,
        name: result.assets[0].fileName || 'avatar.jpg',
        type: result.assets[0].mimeType || 'image/jpeg',
      });
    }
    setIsUploadingAvatar(false);
  };

  const handleLogout = async () => {
    await logout();
    router.push('/(tabs)');
  };

  const handleExportData = async () => {
    const data = {
      routes,
      walls,
      exportedAt: new Date().toISOString(),
    };
    await Share.share({
      message: JSON.stringify(data, null, 2),
    });
  };

  const handleClearData = () => {
    Alert.alert('Clear All Data', 'This will remove your local routes and walls. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.multiRemove([
            'climbset-routes',
            'climbset-walls',
            'climbset-user',
            'climbset-wall',
            'climbset-draft',
          ]);
          router.replace('/(tabs)');
        },
      },
    ]);
  };

  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const themeOptions: Array<{ value: 'light' | 'dark' | 'system'; label: string }> = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'Auto' },
  ];

  const handleRefreshData = async () => {
    await Promise.all([fetchRoutes(), fetchWalls()]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          <Pressable
            style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => router.back()}
          >
            <Text style={{ color: colors.muted, fontSize: 18 }}>‹</Text>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>Settings</Text>
          <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>Manage your account, walls, and preferences</Text>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <SectionTitle>Account</SectionTitle>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 14 }}>
            {isAuthenticated ? (
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: `${colors.secondary}1f`, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {profile?.avatar_url ? (
                      <Image source={{ uri: profile.avatar_url }} style={{ width: 52, height: 52 }} />
                    ) : (
                      <Text style={{ fontSize: 22 }}>🧗</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
                      {profile?.full_name || user?.displayName || 'Climber'}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{user?.email}</Text>
                  </View>
                  <Pressable
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.primary }}
                    onPress={pickAvatar}
                    disabled={isUploadingAvatar}
                  >
                    <Text style={{ color: colors.card, fontSize: 12, fontWeight: '600' }}>
                      {isUploadingAvatar ? 'Uploading...' : 'Change'}
                    </Text>
                  </Pressable>
                </View>
                <Pressable
                  style={{ marginTop: 12 }}
                  onPress={handleLogout}
                >
                  <Text style={{ fontSize: 13, color: colors.muted }}>Log out</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.border, alignItems: 'center' }}
                  onPress={() => router.push('/(auth)/login')}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>Log In</Text>
                </Pressable>
                <Pressable
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center' }}
                  onPress={() => router.push('/(auth)/signup')}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.card }}>Sign Up</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
          <SectionTitle>Walls</SectionTitle>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 14 }}>
            <Text style={{ fontSize: 13, color: colors.text, marginBottom: 8 }}>Add a new wall</Text>
            <TextInput
              style={{ backgroundColor: colors.background, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, marginBottom: 10, borderWidth: 1, borderColor: colors.border }}
              placeholder="Wall name"
              placeholderTextColor={colors.muted}
              value={wallName}
              onChangeText={setWallName}
            />
            {wallImageUri ? (
              <Image source={{ uri: wallImageUri }} style={{ width: '100%', height: 160, borderRadius: 12, marginBottom: 12 }} />
            ) : null}
            <Pressable
              style={{ borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.border, marginBottom: 10 }}
              onPress={pickWallImage}
            >
              <Text style={{ fontSize: 13, color: colors.text }}>Pick Wall Image</Text>
            </Pressable>
            {wallError ? <Text style={{ fontSize: 11, color: '#dc2626', marginBottom: 8 }}>{wallError}</Text> : null}
            <Pressable
              style={{ borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.primary, opacity: isUploadingWall ? 0.7 : 1 }}
              onPress={uploadWall}
              disabled={isUploadingWall}
            >
              <Text style={{ color: colors.card, fontWeight: '600' }}>
                {isUploadingWall ? 'Uploading...' : 'Upload Wall'}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
          <SectionTitle>Data</SectionTitle>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 14 }}>
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>
              <Text style={{ fontWeight: '600', color: colors.text }}>{routes.length}</Text> routes saved
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 10 }}>
              <Text style={{ fontWeight: '600', color: colors.text }}>{walls.length}</Text> walls saved
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ fontSize: 12, color: colors.muted }}>
                Database: {isOfflineMode ? 'Offline' : 'Connected'}
              </Text>
              <View style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: isOfflineMode ? colors.destructive : colors.accent,
              }} />
            </View>
            <Pressable
              style={{ borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.border, marginBottom: 10 }}
              onPress={handleRefreshData}
            >
              <Text style={{ fontSize: 13, color: colors.text }}>Refresh Sync</Text>
            </Pressable>
            <Pressable
              style={{ borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.border }}
              onPress={handleExportData}
            >
              <Text style={{ fontSize: 13, color: colors.text }}>Export Data</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
          <SectionTitle>Appearance</SectionTitle>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 14 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {themeOptions.map((option) => {
                const isActive = mode === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setMode(option.value)}
                    style={{
                      flex: 1,
                      borderRadius: 14,
                      paddingVertical: 12,
                      paddingHorizontal: 6,
                      alignItems: 'center',
                      gap: 8,
                      backgroundColor: isActive ? `${colors.primary}22` : colors.background,
                      borderWidth: 1,
                      borderColor: isActive ? `${colors.primary}55` : colors.border,
                    }}
                  >
                    {option.value === 'light' && <SunIcon />}
                    {option.value === 'dark' && <MoonIcon />}
                    {option.value === 'system' && <SystemIcon />}
                    <Text style={{ fontSize: 12, fontWeight: '600', color: isActive ? colors.primary : colors.text }}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 8 }}>
              Current theme: {resolvedMode === 'dark' ? 'Dark' : 'Light'}
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
          <SectionTitle>Danger Zone</SectionTitle>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 14 }}>
            <Pressable onPress={handleClearData}>
              <Text style={{ fontSize: 13, color: '#dc2626' }}>Clear all local data</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 20, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, color: colors.muted }}>ClimbSet v{appVersion}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

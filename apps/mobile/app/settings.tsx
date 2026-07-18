import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Share, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { createUuid } from '@climbset/shared';
import { AppScreen, Button, Card, ConfirmAction, Field, FilterChip, IconButton, InlineNotice, TopBar } from '../components/ui';
import { useWallsStore, DEFAULT_WALL } from '../lib/stores/walls-store';
import { useRoutesStore } from '../lib/stores/routes-store';
import { useUserStore } from '../lib/stores/user-store';
import { supabase } from '../lib/supabase';
import { useTheme, type ThemeMode } from '../lib/theme';

export default function SettingsScreen() {
  const { colors, mode, resolvedMode, setMode } = useTheme();
  const { walls, selectedWall, addWall, updateWall, deleteWall, fetchWalls, clearLocalData: clearWalls } = useWallsStore();
  const { routes, isOfflineMode, fetchRoutes, clearLocalData: clearRoutes, exportSnapshot: exportRoutes } = useRoutesStore();
  const { user, profile, userId, isAuthenticated, isModerator, logout, uploadAvatar } = useUserStore();
  const [wallName, setWallName] = useState('');
  const [wallImage, setWallImage] = useState<{ uri: string; width?: number; height?: number }>();
  const [editingWallId, setEditingWallId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [storageMessage, setStorageMessage] = useState('');
  const [error, setError] = useState('');
  const [storageHistory, setStorageHistory] = useState<Array<{ at: string; routes: number; walls: number }>>([]);

  const ownedWalls = useMemo(() => walls.filter((wall) => wall.id !== 'all-walls'), [walls]);
  const canManageWall = (wall: { id: string; user_id: string }) => wall.id !== DEFAULT_WALL.id && (isModerator || wall.user_id === userId || wall.user_id === 'local-user');
  useEffect(() => {
    AsyncStorage.getItem('climbset-storage-history').then((raw) => {
      if (raw) try { setStorageHistory(JSON.parse(raw)); } catch { /* ignore malformed history */ }
    }).catch(() => undefined);
  }, []);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.82 });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setWallImage({ uri: asset.uri, width: asset.width, height: asset.height });
    }
  };

  const uploadImage = async (wallId: string, uri: string) => {
    if (!isAuthenticated || !userId) return uri;
    const response = await fetch(uri);
    const blob = await response.blob();
    const path = `${userId}/${wallId}/${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from('walls').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) throw new Error(uploadError.message);
    return supabase.storage.from('walls').getPublicUrl(path).data.publicUrl;
  };

  const saveWall = async () => {
    if (!wallName.trim() && !editingWallId) { setError('Wall name is required'); return; }
    if (!wallImage?.uri && !editingWallId) { setError('Choose a wall photo'); return; }
    setBusy(true); setError('');
    try {
      if (editingWallId) {
        if (!wallImage?.uri) { setError('Choose a replacement photo'); return; }
        const wall = walls.find((item) => item.id === editingWallId);
        if (!wall || !canManageWall(wall)) throw new Error('You do not have permission to update this wall');
        const imageUrl = await uploadImage(editingWallId, wallImage.uri);
        await updateWall(editingWallId, { image_url: imageUrl, image_width: wallImage.width || wall.image_width, image_height: wallImage.height || wall.image_height });
        setStorageMessage('Wall photo updated. Existing routes keep their image snapshots.');
      } else {
        const id = createUuid();
        const imageUrl = await uploadImage(id, wallImage!.uri);
        await addWall({ id, user_id: userId || 'local-user', name: wallName.trim(), image_url: imageUrl, image_width: wallImage!.width || 1920, image_height: wallImage!.height || 1080, is_public: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        setStorageMessage('Wall added.');
      }
      setWallName(''); setWallImage(undefined); setEditingWallId(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save wall');
    } finally { setBusy(false); }
  };

  const pickAvatar = async () => {
    if (!isAuthenticated) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.82 });
    const asset = result.canceled ? undefined : result.assets?.[0];
    if (asset) await uploadAvatar({ uri: asset.uri, name: asset.fileName || 'avatar.jpg', type: asset.mimeType || 'image/jpeg' });
  };

  const exportData = async () => {
    const payload = { ...exportRoutes(), walls, exportedAt: new Date().toISOString() };
    await Share.share({ title: 'ClimbSet backup', message: JSON.stringify(payload, null, 2) });
  };

  const clearData = async () => {
    const keys = await AsyncStorage.getAllKeys();
    const draftKeys = keys.filter((key) => key === 'climbset-draft' || key.startsWith('climbset-draft:'));
    await Promise.all([clearRoutes(), clearWalls(), AsyncStorage.multiRemove([...draftKeys, 'climbset-storage-history'])]);
    setStorageHistory([]);
    setStorageMessage('Local routes, walls, history, and editor drafts cleared.');
  };

  const refresh = async () => {
    setBusy(true); setError('');
    try {
      const wallsOk = await fetchWalls();
      await fetchRoutes();
      const latestRoutes = useRoutesStore.getState();
      const latestWalls = useWallsStore.getState();
      if (!wallsOk || latestRoutes.isOfflineMode || latestWalls.isOfflineMode) throw new Error('Unable to refresh from cloud; local data was retained.');
      const sample = { at: new Date().toISOString(), routes: latestRoutes.routes.length, walls: latestWalls.walls.length };
      const nextHistory = [...storageHistory, sample].slice(-30);
      setStorageHistory(nextHistory);
      await AsyncStorage.setItem('climbset-storage-history', JSON.stringify(nextHistory));
      setStorageMessage('Data refreshed.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to refresh data');
    } finally {
      setBusy(false);
    }
  };

  const listAllWallFiles = async (folder: string) => {
    const files: Array<{ name: string; updated_at?: string; created_at?: string }> = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await supabase.storage.from('walls').list(folder, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw error;
      files.push(...(data || []));
      if (!data || data.length < 100) return files;
    }
  };
  const previewCleanup = async () => {
    const cleanupUserId = useUserStore.getState().userId;
    if (!useUserStore.getState().isModerator || !cleanupUserId) return;
    setBusy(true); setError('');
    try {
      const referenced = new Set([...walls.map((wall) => wall.image_url), ...routes.map((route) => route.wall_image_url)].filter(Boolean));
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const candidates: string[] = [];
      for (const wall of walls.filter((item) => item.id !== DEFAULT_WALL.id && item.user_id !== 'local-user')) {
        if (useUserStore.getState().userId !== cleanupUserId || !useUserStore.getState().isModerator) throw new Error('Moderator session changed; cleanup cancelled');
        const folder = `${wall.user_id}/${wall.id}`;
        const data = await listAllWallFiles(folder);
        for (const file of data) {
          const path = `${folder}/${file.name}`;
          const updatedAt = file.updated_at || file.created_at;
          if (updatedAt && Date.parse(updatedAt) < cutoff && !referenced.has(supabase.storage.from('walls').getPublicUrl(path).data.publicUrl)) candidates.push(path);
        }
      }
      Alert.alert('Cleanup preview', candidates.length ? `${candidates.length} unreferenced images older than 7 days.\n\n${candidates.slice(0, 8).join('\n')}` : 'No eligible images found.', candidates.length ? [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: cleanupStorage }] : [{ text: 'OK' }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Storage preview failed');
    } finally { setBusy(false); }
  };

  const cleanupStorage = async () => {
    const cleanupUserId = useUserStore.getState().userId;
    if (!useUserStore.getState().isModerator || !cleanupUserId) return;
    setBusy(true); setError('');
    try {
      const referenced = new Set([...walls.map((wall) => wall.image_url), ...routes.map((route) => route.wall_image_url)].filter(Boolean));
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      let removed = 0;
      for (const wall of walls.filter((item) => item.id !== DEFAULT_WALL.id && item.user_id !== 'local-user')) {
        if (useUserStore.getState().userId !== cleanupUserId || !useUserStore.getState().isModerator) throw new Error('Moderator session changed; cleanup cancelled');
        const folder = `${wall.user_id}/${wall.id}`;
        const data = await listAllWallFiles(folder);
        const stale = data.filter((file) => {
          const updatedAt = file.updated_at || file.created_at;
          return Boolean(updatedAt && Date.parse(updatedAt) < cutoff && !referenced.has(supabase.storage.from('walls').getPublicUrl(`${folder}/${file.name}`).data.publicUrl));
        });
        if (stale.length) {
          if (useUserStore.getState().userId !== cleanupUserId || !useUserStore.getState().isModerator) throw new Error('Moderator session changed; cleanup cancelled');
          const { error: removeError } = await supabase.storage.from('walls').remove(stale.map((file) => `${folder}/${file.name}`));
          if (removeError) throw removeError;
          removed += stale.length;
        }
      }
      setStorageMessage(`Deleted ${removed} unused wall image${removed === 1 ? '' : 's'}.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Storage cleanup failed'); } finally { setBusy(false); }
  };

  const themeOptions: ThemeMode[] = ['light', 'dark', 'system'];
  return (
    <AppScreen testID="settings-screen" accessibilityLabel="Settings" scroll contentStyle={{ paddingBottom: 36 }}>
      <TopBar title="Settings" onBack={() => router.back()} />
      <Text style={{ color: colors.textMuted, marginBottom: 14 }}>Manage your account, walls, data, and preferences.</Text>

      <Text style={{ color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>Account</Text>
      <Card style={{ marginTop: 8, padding: 16 }}>
        {isAuthenticated ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ width: 52, height: 52, borderRadius: 26, overflow: 'hidden', backgroundColor: colors.inputFill, alignItems: 'center', justifyContent: 'center' }}>{profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={{ width: 52, height: 52 }} accessibilityLabel="Profile avatar" alt="Profile avatar" /> : <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 20 }}>{(user?.displayName || 'C').slice(0, 1).toUpperCase()}</Text>}</View><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: '700' }}>{user?.displayName || 'Climber'}</Text><Text style={{ color: colors.textMuted, fontSize: 12 }}>{user?.email}</Text></View><Button label="Change avatar" variant="outline" onPress={pickAvatar} /></View> : <View style={{ flexDirection: 'row', gap: 8 }}><Button label="Log in" variant="outline" onPress={() => router.push('/(auth)/login')} style={{ flex: 1 }} /><Button label="Sign up" onPress={() => router.push('/(auth)/signup')} style={{ flex: 1 }} /></View>}
        {isAuthenticated ? <Button label="Log out" variant="ghost" onPress={async () => { await logout(); router.replace('/(tabs)'); }} style={{ alignSelf: 'flex-start', marginTop: 12 }} /> : null}
        {isModerator ? <InlineNotice tone="warning" message="Moderator tools enabled" /> : null}
      </Card>

      <Text style={{ color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontSize: 11, marginTop: 20 }}>Walls</Text>
      <Card style={{ marginTop: 8, padding: 16 }}>
        <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 10 }}>Select wall</Text>
        <View style={{ gap: 8 }}>{ownedWalls.map((wall) => <View key={wall.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><FilterChip label={`${wall.name}${selectedWall?.id === wall.id ? ' ✓' : ''}`} selected={selectedWall?.id === wall.id} onPress={() => useWallsStore.getState().setSelectedWall(wall)} /><View style={{ flex: 1 }} />{canManageWall(wall) ? <><IconButton label={`Update ${wall.name} photo`} icon="✎" onPress={() => { setEditingWallId(wall.id); setWallName(wall.name); setWallImage(undefined); }} /><ConfirmAction title="Delete wall?" message="Routes keep their saved image, but this wall cannot be restored." label="Delete" onConfirm={() => deleteWall(wall.id)}>{(confirm) => <IconButton label={`Delete ${wall.name}`} icon="×" onPress={confirm} />}</ConfirmAction></> : null}</View>)}</View>
        <Field label={editingWallId ? 'Replacement photo' : 'New wall name'} value={wallName} onChangeText={setWallName} placeholder={editingWallId ? 'Wall name is unchanged' : 'Wall name'} editable={!editingWallId} style={{ marginTop: 12 }} />
        <Button label={wallImage?.uri ? 'Change selected photo' : 'Choose wall photo'} variant="outline" onPress={pickImage} style={{ marginTop: 10 }} />
        {wallImage?.uri ? <Image source={{ uri: wallImage.uri }} style={{ width: '100%', height: 140, borderRadius: 12, marginTop: 10 }} accessibilityLabel="Selected wall photo" alt="Selected wall photo" /> : null}
        {error ? <InlineNotice tone="error" message={error} /> : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}><Button label={editingWallId ? 'Update photo' : 'Add wall'} loading={busy} onPress={saveWall} style={{ flex: 1 }} />{editingWallId ? <Button label="Cancel" variant="ghost" onPress={() => { setEditingWallId(undefined); setWallImage(undefined); setWallName(''); }} /> : null}</View>
      </Card>

      <Text style={{ color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontSize: 11, marginTop: 20 }}>Appearance</Text>
      <Card style={{ marginTop: 8, padding: 12 }}><View style={{ flexDirection: 'row', gap: 8 }}>{themeOptions.map((option) => <FilterChip key={option} label={option === 'system' ? 'Auto' : option[0].toUpperCase() + option.slice(1)} selected={mode === option} onPress={() => setMode(option)} style={{ flex: 1 }} />)}</View><Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 10 }}>Current: {resolvedMode === 'dark' ? 'Dark' : 'Light'}</Text></Card>

      <Text style={{ color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontSize: 11, marginTop: 20 }}>Data</Text>
      <Card style={{ marginTop: 8, padding: 16 }}><Text style={{ color: colors.text }}>{routes.length} routes saved</Text><Text style={{ color: colors.textMuted, marginTop: 4 }}>{walls.length} walls saved</Text><Text style={{ color: colors.textMuted, marginTop: 4 }}>Storage history: {storageHistory.length} samples</Text><Text style={{ color: colors.textMuted, marginTop: 4 }}>Sync: {isOfflineMode ? 'Offline (local changes retained)' : 'Connected'}</Text><View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}><Button label="Refresh" variant="outline" loading={busy} onPress={refresh} style={{ flex: 1 }} /><Button label="Export JSON" onPress={exportData} style={{ flex: 1 }} /></View></Card>

      {isModerator ? <><Text style={{ color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontSize: 11, marginTop: 20 }}>Admin</Text><Card style={{ marginTop: 8, padding: 16 }}><Text style={{ color: colors.textMuted, marginBottom: 10 }}>Remove unreferenced wall images from storage.</Text><Button label="Clean up storage" variant="outline" loading={busy} onPress={previewCleanup} /></Card></> : null}

      <Text style={{ color: colors.destructive, textTransform: 'uppercase', letterSpacing: 1, fontSize: 11, marginTop: 20 }}>Danger zone</Text>
      <Card style={{ marginTop: 8, padding: 16 }}><ConfirmAction title="Clear local data?" message="Routes, walls, and editor drafts will be removed from this device. This cannot be undone." label="Clear data" onConfirm={clearData}>{(confirm) => <Button label="Clear all local data" variant="destructive" onPress={confirm} />}</ConfirmAction></Card>
      {storageMessage ? <InlineNotice tone="success" message={storageMessage} /> : null}
      <Text style={{ textAlign: 'center', color: colors.textMuted, fontSize: 11, marginTop: 24 }}>ClimbSet v{Constants.expoConfig?.version || '1.0.0'}</Text>
    </AppScreen>
  );
}

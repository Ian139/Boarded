'use client';

import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useRoutesStore } from '@/lib/stores/routes-store';
import { useWallsStore } from '@/lib/stores/walls-store';
import { useUserStore } from '@/lib/stores/user-store';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const routes = useRoutesStore((state) => state.routes);
  const walls = useWallsStore((state) => state.walls);
  const { user, isAuthenticated, logout, displayName, isModerator, login } = useUserStore();
  const [storageBytes, setStorageBytes] = useState<number | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storageByWall, setStorageByWall] = useState<Array<{ wallId: string; bytes: number; latestTs: string | null }>>([]);
  const [storageHistory, setStorageHistory] = useState<Array<{ ts: string; bytes: number }>>([]);
  const [showCleanup, setShowCleanup] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupPreview, setCleanupPreview] = useState<string[]>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [showClearData, setShowClearData] = useState(false);
  const [showModLogin, setShowModLogin] = useState(false);
  const [modEmail, setModEmail] = useState('');
  const [modPassword, setModPassword] = useState('');
  const [modLoading, setModLoading] = useState(false);
  const [modError, setModError] = useState('');

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    router.push('/');
  };

  const handleModLogin = async () => {
    setModLoading(true);
    setModError('');

    const result = await login(modEmail, modPassword);

    if (result.success) {
      toast.success('Logged in as moderator');
      setShowModLogin(false);
      setModEmail('');
      setModPassword('');
    } else {
      setModError(result.error || 'Login failed');
    }

    setModLoading(false);
  };

  const handleClearData = () => {
    localStorage.removeItem('climbset-routes');
    localStorage.removeItem('climbset-walls');
    localStorage.removeItem('climbset-wall');
    localStorage.removeItem('climbset-draft');
    window.location.reload();
  };

  useEffect(() => {
    const listFolderSize = async (supabase: ReturnType<typeof createClient>, folder: string) => {
      let totalBytes = 0;
      let latestTs: string | null = null;
      let offset = 0;
      const limit = 100;
      let keepGoing = true;

      while (keepGoing) {
        const { data, error } = await supabase.storage
          .from('walls')
          .list(folder, { limit, offset, sortBy: { column: 'name', order: 'asc' } });

        if (error) {
          throw error;
        }

        (data || []).forEach((item) => {
          const size = item.metadata?.size;
          if (typeof size === 'number') totalBytes += size;
          const updatedAt = item.updated_at || item.created_at;
          if (updatedAt) {
            if (!latestTs || new Date(updatedAt).getTime() > new Date(latestTs).getTime()) {
              latestTs = updatedAt;
            }
          }
        });

        if (!data || data.length < limit) {
          keepGoing = false;
        } else {
          offset += limit;
        }
      }

      return { totalBytes, latestTs };
    };

    const loadStorageUsage = async () => {
      setStorageLoading(true);
      setStorageError(null);

      try {
        const supabase = createClient();
        if (storageHistory.length === 0) {
          const historyKey = 'climbset-storage-history';
          const rawHistory = localStorage.getItem(historyKey);
          if (rawHistory) {
            try {
              setStorageHistory(JSON.parse(rawHistory));
            } catch {
              // ignore parse errors
            }
          }
        }
        const { data, error } = await supabase.storage
          .from('walls')
          .list('', { limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } });

        if (error) throw error;

        const folders = (data || [])
          .filter((item) => !item.metadata)
          .map((item) => item.name);

        const breakdown: Array<{ wallId: string; bytes: number; latestTs: string | null }> = [];
        let totalBytes = 0;

        for (const folder of folders) {
          const { totalBytes: bytes, latestTs } = await listFolderSize(supabase, folder);
          breakdown.push({ wallId: folder, bytes, latestTs });
          totalBytes += bytes;
        }

        breakdown.sort((a, b) => b.bytes - a.bytes);
        setStorageByWall(breakdown);
        setStorageBytes(totalBytes);

        const historyKey = 'climbset-storage-history';
        const now = new Date();
        const nowIso = now.toISOString();
        const rawHistory = localStorage.getItem(historyKey);
        const history = rawHistory ? (JSON.parse(rawHistory) as Array<{ ts: string; bytes: number }>) : [];
        const last = history[history.length - 1];
        const lastTs = last ? new Date(last.ts).getTime() : 0;
        const twelveHours = 12 * 60 * 60 * 1000;
        const nextHistory = (now.getTime() - lastTs > twelveHours)
          ? [...history, { ts: nowIso, bytes: totalBytes }].slice(-30)
          : history;
        localStorage.setItem(historyKey, JSON.stringify(nextHistory));
        setStorageHistory(nextHistory);
      } catch (error) {
        setStorageError(error instanceof Error ? error.message : 'Unable to load storage usage');
      } finally {
        setStorageLoading(false);
      }
    };

    loadStorageUsage();
  }, [storageHistory.length]);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  };

  const getStoragePathFromUrl = (url: string) => {
    const marker = '/storage/v1/object/public/walls/';
    const index = url.indexOf(marker);
    if (index === -1) return null;
    return url.substring(index + marker.length);
  };

  const getCleanupCandidates = async () => {
    const supabase = createClient();
    const referenced = new Set<string>();
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    walls.forEach((wall) => {
      const path = getStoragePathFromUrl(wall.image_url);
      if (path) referenced.add(path);
    });
    routes.forEach((route) => {
      const path = route.wall_image_url ? getStoragePathFromUrl(route.wall_image_url) : null;
      if (path) referenced.add(path);
    });

    const { data: roots, error: rootError } = await supabase.storage
      .from('walls')
      .list('', { limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } });

    if (rootError) throw rootError;

    const ownerFolders = (roots || []).filter((item) => !item.metadata).map((item) => item.name);
    const deletions: string[] = [];
    for (const ownerFolder of ownerFolders) {
      const { data: wallFolders, error: wallFolderError } = await supabase.storage.from('walls').list(ownerFolder, { limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } });
      if (wallFolderError) throw wallFolderError;
      for (const wallFolder of (wallFolders || []).filter((item) => !item.metadata)) {
        const folder = `${ownerFolder}/${wallFolder.name}`;
        const { data, error } = await supabase.storage.from('walls').list(folder, { limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } });
        if (error) throw error;
        (data || []).forEach((item) => {
          const updatedAt = item.updated_at || item.created_at;
          const ageOk = updatedAt ? (now - new Date(updatedAt).getTime() > sevenDays) : false;
          const path = `${folder}/${item.name}`;
          if (!referenced.has(path) && ageOk) deletions.push(path);
        });
      }
    }

    return deletions;
  };

  const loadCleanupPreview = async () => {
    setIsPreviewLoading(true);
    try {
      const deletions = await getCleanupCandidates();
      setCleanupPreview(deletions);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load cleanup preview');
      setCleanupPreview([]);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const runStorageCleanup = async () => {
    setIsCleaning(true);
    try {
      const supabase = createClient();
      const deletions = cleanupPreview.length > 0 ? cleanupPreview : await getCleanupCandidates();

      if (deletions.length > 0) {
        const { error } = await supabase.storage.from('walls').remove(deletions);
        if (error) throw error;
      }

      toast.success(deletions.length > 0 ? `Deleted ${deletions.length} unused images` : 'No unused images found');
      setCleanupPreview([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to clean up storage');
    } finally {
      setIsCleaning(false);
      setShowCleanup(false);
    }
  };

  const handleExportData = () => {
    const data = {
      routes,
      walls,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `climbset-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Data exported!');
  };

  return (
    <div className="app-shell min-h-dvh pb-28">
      {/* Header */}
      <header className="page-header px-6 pt-5 pb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="Back to home"
            className="size-10 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
      </header>

      <main className="page-frame max-w-3xl px-6 py-8 space-y-10">
        {/* Account */}
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Account</h2>

          {isAuthenticated && user ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-lg font-semibold text-primary">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-medium">{displayName}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
                Log out
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <Link
                href="/login"
                className="flex-1 py-2.5 px-4 rounded-xl bg-muted/50 text-center text-sm font-medium hover:bg-muted transition-colors"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="flex-1 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground text-center text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Sign Up
              </Link>
            </div>
          )}
        </section>

        {/* Appearance */}
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Appearance</h2>
          <div className="flex gap-2">
            {[
              { value: 'light', label: 'Light', icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              )},
              { value: 'dark', label: 'Dark', icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
              )},
              { value: 'system', label: 'Auto', icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
                </svg>
              )},
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={cn(
                  "flex-1 flex flex-col items-center gap-2 py-3 px-4 rounded-xl transition-all",
                  theme === option.value
                    ? "bg-primary/10 text-primary"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                {option.icon}
                <span className="text-xs font-medium">{option.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Data */}
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Data</h2>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{routes.length}</span> routes saved
            </p>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{walls.length}</span> walls saved
            </p>
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Storage usage:</span>{' '}
              {storageLoading
                ? 'Loading...'
                : storageError
                  ? 'Unavailable'
                  : storageBytes !== null
                    ? formatBytes(storageBytes)
                    : '—'}
            </div>
            {!storageLoading && !storageError && storageByWall.length > 0 && (
              <div className="rounded-xl border border-border/50 p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Storage By Wall (size • last upload)</p>
                {storageByWall.map((entry) => {
                  const wallName = walls.find((w) => w.id === entry.wallId)?.name || entry.wallId;
                  return (
                    <div key={entry.wallId} className="flex items-center justify-between text-sm">
                      <span className="text-foreground truncate">{wallName}</span>
                      <span className="text-muted-foreground">
                        {formatBytes(entry.bytes)}
                        {entry.latestTs && (
                          <span className="text-xs text-muted-foreground/70 ml-2">
                            {new Date(entry.latestTs).toLocaleDateString()}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {storageHistory.length > 1 && (
              <div className="rounded-xl border border-border/50 p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Storage Trend</p>
                {storageHistory.slice(-7).map((entry) => (
                  <div key={entry.ts} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {new Date(entry.ts).toLocaleDateString()}
                    </span>
                    <span className="text-foreground">{formatBytes(entry.bytes)}</span>
                  </div>
                ))}
              </div>
            )}
            {isModerator && (
              <button
                onClick={() => {
                  setShowCleanup(true);
                  loadCleanupPreview();
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-destructive/10 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors"
              >
                Clean Up Storage
              </button>
            )}
            <button
              onClick={handleExportData}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-muted/30 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export Data
            </button>
          </div>
        </section>

        {/* Moderator */}
        {(isModerator || !isAuthenticated) && (
          <section>
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Admin</h2>
            {isModerator ? (
              <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <span className="font-medium">Moderator mode active</span>
              </div>
            ) : (
              <button
                onClick={() => setShowModLogin(true)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Moderator login
              </button>
            )}
          </section>
        )}

        {/* Danger Zone */}
        <section>
          <h2 className="text-xs font-medium text-destructive/70 uppercase tracking-wider mb-4">Danger Zone</h2>
          <button
            onClick={() => setShowClearData(true)}
            className="text-sm text-destructive hover:text-destructive/80 transition-colors"
          >
            Clear all local data
          </button>
        </section>

        {/* App Info */}
        <section className="pt-8 pb-4 text-center">
          <p className="text-xs text-muted-foreground">ClimbSet v2.1.9</p>
        </section>
      </main>

      {/* Clear Data Dialog */}
      <Dialog open={showClearData} onOpenChange={setShowClearData}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear All Data</DialogTitle>
            <DialogDescription>
              This will permanently delete all your routes and walls. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearData(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleClearData}>
              Clear All Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Moderator Login Dialog */}
      <Dialog open={showModLogin} onOpenChange={setShowModLogin}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Moderator Login</DialogTitle>
            <DialogDescription>
              Sign in with a moderator account to access admin controls.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="mod-email">Email</Label>
              <Input
                id="mod-email"
                type="email"
                value={modEmail}
                onChange={(e) => setModEmail(e.target.value)}
                placeholder="moderator@example.com"
                disabled={modLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mod-password">Password</Label>
              <Input
                id="mod-password"
                type="password"
                value={modPassword}
                onChange={(e) => setModPassword(e.target.value)}
                placeholder="Enter password"
                disabled={modLoading}
              />
            </div>
            {modError && (
              <p className="text-sm text-destructive">{modError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowModLogin(false);
                setModEmail('');
                setModPassword('');
                setModError('');
              }}
              disabled={modLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleModLogin}
              disabled={modLoading || !modEmail || !modPassword}
            >
              {modLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Storage Cleanup Dialog */}
      <Dialog open={showCleanup} onOpenChange={setShowCleanup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clean Up Storage</DialogTitle>
            <DialogDescription>
              This will delete wall images that are no longer referenced by any wall. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Preview</p>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border/50 p-2 text-sm text-muted-foreground">
              {isPreviewLoading ? (
                <p>Loading preview...</p>
              ) : cleanupPreview.length > 0 ? (
                cleanupPreview.map((path) => (
                  <div key={path} className="truncate">{path}</div>
                ))
              ) : (
                <p>No unused images older than 7 days.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCleanup(false)}
              disabled={isCleaning || isPreviewLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={runStorageCleanup}
              disabled={isCleaning || isPreviewLoading || cleanupPreview.length === 0}
            >
              {isCleaning ? 'Cleaning...' : 'Delete Unused Images'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

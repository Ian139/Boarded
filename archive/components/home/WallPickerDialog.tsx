'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWallsStore, DEFAULT_WALL } from '@/lib/stores/walls-store';
import { useRoutesStore } from '@/lib/stores/routes-store';
import { useUserStore } from '@/lib/stores/user-store';
import { createClient } from '@/lib/supabase/client';
import { compressImageWithDimensions } from '@/lib/utils/image';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Wall } from '@/lib/types';

interface WallPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WallPickerDialog({ open, onOpenChange }: WallPickerDialogProps) {
  const { walls, selectedWall, setSelectedWall, addWall, updateWall, deleteWall } = useWallsStore();
  const { routes } = useRoutesStore();
  const { userId, isModerator } = useUserStore();

  // Add wall state
  const [showAddWall, setShowAddWall] = useState(false);
  const [wallName, setWallName] = useState('');
  const [wallImage, setWallImage] = useState<string | null>(null);
  const [wallImageFile, setWallImageFile] = useState<File | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update wall photo state
  const [wallToUpdatePhoto, setWallToUpdatePhoto] = useState<Wall | null>(null);
  const [newWallImage, setNewWallImage] = useState<string | null>(null);
  const [newWallImageFile, setNewWallImageFile] = useState<File | null>(null);
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState(false);
  const updatePhotoInputRef = useRef<HTMLInputElement>(null);

  // Delete wall state
  const [wallToDelete, setWallToDelete] = useState<Wall | null>(null);

  const allWallsSelected = selectedWall?.id === 'all-walls';

  const createPreviewUrl = (file: File) => URL.createObjectURL(file);
  const revokePreviewUrl = (url: string | null) => {
    if (url) URL.revokeObjectURL(url);
  };
  const fileToDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unable to read image'));
    reader.onerror = () => reject(reader.error || new Error('Unable to read image'));
    reader.readAsDataURL(file);
  });

  const uploadWallImage = async (file: File, wallId: string) => {
    const supabase = createClient();
    const compressed = await compressImageWithDimensions(file, {
      maxWidth: 1920,
      maxHeight: 1920,
      quality: 0.82,
      mimeType: 'image/jpeg',
    });

    if (!userId) {
      return {
        imageUrl: await fileToDataUrl(compressed.blob),
        width: compressed.width,
        height: compressed.height,
      };
    }

    const filePath = `${userId}/${wallId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('walls')
      .upload(filePath, compressed.blob, { contentType: 'image/jpeg' });

    if (error) {
      throw new Error(error.message);
    }

    const { data } = supabase.storage.from('walls').getPublicUrl(filePath);
    return {
      imageUrl: data.publicUrl,
      width: compressed.width,
      height: compressed.height,
    };
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      revokePreviewUrl(wallImage);
      setWallImageFile(file);
      setWallImage(createPreviewUrl(file));
    }
  };

  const handleAddWall = async () => {
    if (!wallName.trim() || !wallImageFile) return;

    setIsAdding(true);

    try {
      const wallId = crypto.randomUUID();
      const uploadedWallImage = await uploadWallImage(wallImageFile, wallId);

      const newWall: Wall = {
        id: wallId,
        user_id: userId || 'local-user',
        name: wallName.trim(),
        image_url: uploadedWallImage.imageUrl,
        image_width: uploadedWallImage.width,
        image_height: uploadedWallImage.height,
        is_public: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const addSucceeded = await addWall(newWall);
      if (!addSucceeded) {
        throw new Error('Unable to save wall');
      }

      setSelectedWall(newWall);
      setShowAddWall(false);
      onOpenChange(false);
      setWallName('');
      revokePreviewUrl(wallImage);
      setWallImage(null);
      setWallImageFile(null);
      setIsAdding(false);
      toast.success('Wall added!');
    } catch (error) {
      setIsAdding(false);
      toast.error(error instanceof Error ? error.message : 'Failed to upload wall image');
    }
  };

  const handleUpdateWallPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      revokePreviewUrl(newWallImage);
      setNewWallImageFile(file);
      setNewWallImage(createPreviewUrl(file));
    }
  };

  const handleUpdateWallPhoto = async () => {
    if (!wallToUpdatePhoto || !newWallImageFile) return;

    setIsUpdatingPhoto(true);

    try {
      const uploadedWallImage = await uploadWallImage(newWallImageFile, wallToUpdatePhoto.id);
      const updateSucceeded = await updateWall(wallToUpdatePhoto.id, {
        image_url: uploadedWallImage.imageUrl,
        image_width: uploadedWallImage.width,
        image_height: uploadedWallImage.height,
      });
      if (!updateSucceeded) {
        throw new Error('Unable to save wall photo');
      }

      if (selectedWall?.id === wallToUpdatePhoto.id) {
        setSelectedWall({
          ...wallToUpdatePhoto,
          image_url: uploadedWallImage.imageUrl,
          image_width: uploadedWallImage.width,
          image_height: uploadedWallImage.height,
        });
      }

      setWallToUpdatePhoto(null);
      revokePreviewUrl(newWallImage);
      setNewWallImage(null);
      setNewWallImageFile(null);
      setIsUpdatingPhoto(false);
      toast.success('Wall photo updated! Existing routes will keep their original photo.');
    } catch (error) {
      setIsUpdatingPhoto(false);
      toast.error(error instanceof Error ? error.message : 'Failed to update wall photo');
    }
  };

  const canUpdateWallPhoto = (wall: Wall) => {
    if (wall.id === 'default-wall') return true;
    return isModerator || wall.user_id === userId || wall.user_id === 'local-user';
  };

  const canDeleteWall = (wall: Wall) => {
    if (wall.id === 'default-wall') return false;
    return isModerator || wall.user_id === userId || wall.user_id === 'local-user';
  };

  return (
    <>
      {/* Wall Picker Dialog */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Wall</DialogTitle>
          </DialogHeader>

          <div className="space-y-2 mt-2">
            {/* All Walls option */}
            <div
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-xl border transition-colors',
                allWallsSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/30'
              )}
            >
              <button
                onClick={() => {
                  setSelectedWall({
                    id: 'all-walls',
                    user_id: 'system',
                    name: 'All Walls',
                    image_url: DEFAULT_WALL.image_url,
                    image_width: DEFAULT_WALL.image_width,
                    image_height: DEFAULT_WALL.image_height,
                    is_public: true,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  });
                  onOpenChange(false);
                }}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <div className="size-14 rounded-lg bg-muted/70 flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5m-16.5 5.25h16.5m-16.5 5.25h16.5" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">All Walls</p>
                  <p className="text-sm text-muted-foreground">{routes.length} routes</p>
                </div>
              </button>
              <div className="flex items-center gap-2 shrink-0">
                {allWallsSelected && (
                  <div className="size-6 rounded-full bg-primary flex items-center justify-center">
                    <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                )}
              </div>
            </div>

            {walls.map((wall) => {
              const routeCount = routes.filter((r) => r.wall_id === wall.id).length;
              const isSelected = selectedWall?.id === wall.id;
              const canDelete = canDeleteWall(wall);

              return (
                <div
                  key={wall.id}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-xl border transition-colors',
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/30'
                  )}
                >
                  <button
                    onClick={() => {
                      setSelectedWall(wall);
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <div className="relative size-14 rounded-lg bg-muted overflow-hidden shrink-0">
                      <Image
                        src={wall.image_url}
                        alt={wall.name}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{wall.name}</p>
                      <p className="text-sm text-muted-foreground">{routeCount} routes</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {isSelected && (
                      <div className="size-6 rounded-full bg-primary flex items-center justify-center">
                        <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </div>
                    )}
                    {canUpdateWallPhoto(wall) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setWallToUpdatePhoto(wall);
                          onOpenChange(false);
                        }}
                        aria-label="Update wall photo"
                        className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                        </svg>
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setWallToDelete(wall);
                        }}
                        aria-label="Delete wall"
                        className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add new wall button */}
            <button
              onClick={() => {
                onOpenChange(false);
                setShowAddWall(true);
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors"
            >
              <div className="size-14 rounded-lg bg-muted flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <span className="font-medium">Add new wall</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Wall Dialog */}
      <Dialog open={showAddWall} onOpenChange={setShowAddWall}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Wall</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wall-name">Wall Name</Label>
              <Input
                id="wall-name"
                type="text"
                value={wallName}
                onChange={(e) => setWallName(e.target.value)}
                placeholder="e.g., Garage Wall"
                disabled={isAdding}
              />
            </div>

            <div className="space-y-2">
              <Label>Wall Photo</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              {wallImage ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="relative aspect-video rounded-xl overflow-hidden cursor-pointer"
                >
                  <Image
                    src={wallImage}
                    alt="Wall preview"
                    fill
                    sizes="100vw"
                    className="object-cover"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <span className="text-white text-sm font-medium">Change photo</span>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-video rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  <span className="text-sm">Tap to add photo</span>
                </button>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddWall(false);
                setWallName('');
                revokePreviewUrl(wallImage);
                setWallImage(null);
                setWallImageFile(null);
              }}
              disabled={isAdding}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddWall}
              disabled={isAdding || !wallName.trim() || !wallImageFile}
            >
              {isAdding ? 'Adding...' : 'Add Wall'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Wall Dialog */}
      <Dialog open={!!wallToDelete} onOpenChange={() => setWallToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Wall</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{wallToDelete?.name}&quot;? All routes on this wall will remain but will need to be reassigned. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWallToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!wallToDelete) return;
                const deleteSucceeded = await deleteWall(wallToDelete.id);
                if (!deleteSucceeded) {
                  toast.error('Unable to delete wall');
                  return;
                }
                toast.success('Wall deleted');
                setWallToDelete(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Wall Photo Dialog */}
      <Dialog open={!!wallToUpdatePhoto} onOpenChange={() => {
        setWallToUpdatePhoto(null);
        revokePreviewUrl(newWallImage);
        setNewWallImage(null);
        setNewWallImageFile(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Wall Photo</DialogTitle>
            <DialogDescription>
              Update the photo for &quot;{wallToUpdatePhoto?.name}&quot;. Existing routes will keep their original photo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <input
              ref={updatePhotoInputRef}
              type="file"
              accept="image/*"
              onChange={handleUpdateWallPhotoSelect}
              className="hidden"
            />

            {/* Current photo */}
            <div className="space-y-2">
              <Label>Current Photo</Label>
              <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                {wallToUpdatePhoto && (
                  <Image
                    src={wallToUpdatePhoto.image_url}
                    alt="Current wall"
                    fill
                    sizes="100vw"
                    className="object-cover opacity-50"
                  />
                )}
              </div>
            </div>

            {/* New photo */}
            <div className="space-y-2">
              <Label>New Photo</Label>
              {newWallImage ? (
                <div
                  onClick={() => updatePhotoInputRef.current?.click()}
                  className="relative aspect-video rounded-lg overflow-hidden cursor-pointer"
                >
                  <Image
                    src={newWallImage}
                    alt="New wall preview"
                    fill
                    sizes="100vw"
                    className="object-cover"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <span className="text-white text-sm font-medium">Change photo</span>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => updatePhotoInputRef.current?.click()}
                  className="w-full aspect-video rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  <span className="text-sm">Select new photo</span>
                </button>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Note: All existing routes will continue to display the wall photo from when they were created.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setWallToUpdatePhoto(null);
                revokePreviewUrl(newWallImage);
                setNewWallImage(null);
                setNewWallImageFile(null);
              }}
              disabled={isUpdatingPhoto}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateWallPhoto}
              disabled={isUpdatingPhoto || !newWallImageFile}
            >
              {isUpdatingPhoto ? 'Updating...' : 'Update Photo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    if (!line || line.trimStart().startsWith('#')) return;
    const index = line.indexOf('=');
    if (index === -1) return;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!key || process.env[key]) return;
    process.env[key] = value.replace(/^"|"$/g, '');
  });
};

loadEnvFile('.env.local');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const legacySupabaseOrigins = new Set(
  String(process.env.LEGACY_SUPABASE_URL || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
);

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

const localWallPath = path.join('public', 'walls', 'default-wall.jpg');
const storageBucket = 'walls';
const storagePath = 'default-wall/wall.jpg';

const storageObjectMarker = '/storage/v1/object/public/';

const isMissingRemoteUrl = (value) => {
  if (value == null) return true;
  return !/^https?:\/\/[^/]+/i.test(String(value).trim());
};

const referencesSameStorageObject = (value, canonicalUrl) => {
  try {
    const source = new URL(String(value));
    const canonical = new URL(String(canonicalUrl));
    const sourcePath = source.pathname.split(storageObjectMarker)[1];
    const canonicalPath = canonical.pathname.split(storageObjectMarker)[1];
    const isTrustedOrigin = source.origin === canonical.origin ||
      source.origin === new URL(supabaseUrl).origin ||
      legacySupabaseOrigins.has(source.origin);
    return Boolean(
      isTrustedOrigin &&
      sourcePath &&
      canonicalPath &&
      decodeURIComponent(sourcePath) === decodeURIComponent(canonicalPath)
    );
  } catch {
    return false;
  }
};

const needsRewrite = (value, canonicalUrl) =>
  isMissingRemoteUrl(value) || referencesSameStorageObject(value, canonicalUrl);

async function ensureBucket() {
  const { error } = await supabase.storage.getBucket(storageBucket);
  if (!error) return;

  const { error: createError } = await supabase.storage.createBucket(storageBucket, {
    public: true,
  });

  if (createError && !createError.message.toLowerCase().includes('already exists')) {
    throw createError;
  }
}

async function run() {
  if (!fs.existsSync(localWallPath)) {
    throw new Error(`Missing local wall image at ${localWallPath}`);
  }

  await ensureBucket();

  const file = fs.readFileSync(localWallPath);
  const { error: uploadError } = await supabase.storage
    .from(storageBucket)
    .upload(storagePath, file, {
      cacheControl: '3600',
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage
    .from(storageBucket)
    .getPublicUrl(storagePath);
  const publicUrl = publicUrlData.publicUrl;

  const { data: routes, error: fetchError } = await supabase
    .from('routes')
    .select('id, wall_image_url')
    .eq('wall_id', 'default-wall');

  if (fetchError) throw fetchError;

  const routesToUpdate = (routes ?? []).filter((route) => needsRewrite(route.wall_image_url, publicUrl));
  let updated = 0;
  for (const route of routesToUpdate) {
    const { error: updateError } = await supabase
      .from('routes')
      .update({ wall_image_url: publicUrl })
      .eq('id', route.id);

    if (updateError) {
      console.error(`Failed to update route ${route.id}: ${updateError.message}`);
      continue;
    }
    updated += 1;
  }

  console.log(`Uploaded default wall to: ${publicUrl}`);
  console.log(`Found ${routes?.length ?? 0} default-wall routes.`);
  console.log(`Updated ${updated} routes with a Supabase Storage wall_image_url.`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

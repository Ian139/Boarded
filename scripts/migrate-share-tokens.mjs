import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';

const loadEnvFile = (path) => {
  if (!fs.existsSync(path)) return;
  const content = fs.readFileSync(path, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    if (!line || line.startsWith('#')) return;
    const index = line.indexOf('=');
    if (index === -1) return;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!key || process.env[key]) return;
    process.env[key] = value.replace(/^"|"$/g, '');
  });
};

loadEnvFile('.env.local');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

async function run() {
  console.log('Fetching routes without share_token...');

  const { data, error } = await supabase
    .from('routes')
    .select('id, share_token')
    .is('share_token', null);

  if (error) {
    console.error('Fetch error:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No routes missing share_token.');
    return;
  }

  console.log(`Found ${data.length} routes missing share_token.`);

  let updated = 0;
  for (const route of data) {
    const token = nanoid(10);
    const { error: updateError } = await supabase
      .from('routes')
      .update({ share_token: token })
      .eq('id', route.id);

    if (updateError) {
      console.error(`Failed to update ${route.id}:`, updateError.message);
      continue;
    }
    updated += 1;
  }

  console.log(`Updated ${updated} routes with share tokens.`);
}

run().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

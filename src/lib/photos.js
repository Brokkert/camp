// Foto's. De bucket is openbaar, maar de bestandsnamen zijn willekeurige
// uuid's: onraadbaar, net als een deel-link. Zo kan iemand zonder account een
// gedeelde foto zien zonder dat we de hele opslag open hoeven te zetten.
//
// De server geeft foto's alleen mee bij een share op "precies" of "~250 m" —
// een foto verraadt vaak precies waar je stond.
//
// Alles wordt eerst in de browser verkleind. Een telefoonfoto van 4 MB wordt
// zo'n 200 kB, en de gratis Supabase-opslag is 1 GB.

import { getClient } from './supabase.js';

const MAX_EDGE = 1600;
const QUALITY = 0.82;

export async function shrinkImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY)
  );
  return blob;
}

export async function uploadPhoto(file, userId) {
  const supabase = getClient();
  if (!supabase) throw new Error('Foto’s bewaren kan alleen met een Supabase-project erachter.');

  const blob = await shrinkImage(file);
  // De map moet je eigen user-id zijn; dat controleert het opslagbeleid.
  const path = `${userId}/${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage
    .from('camp-photos')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from('camp-photos').getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export async function deletePhoto(path) {
  const supabase = getClient();
  if (!supabase) return;
  await supabase.storage.from('camp-photos').remove([path]);
}

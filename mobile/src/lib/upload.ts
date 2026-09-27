import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { endpoints } from '../api/endpoints';

export type UploadPurpose = 'ORDER_PHOTO' | 'FINISH_PHOTO' | 'CHAT_PHOTO' | 'TAX_CERTIFICATE';

export interface UploadedPhoto {
  key: string;
  /** Local URI for the preview. */
  uri: string;
}

const MAX_SIDE = 1600;

/**
 * Picks a photo, re-encodes it as JPEG (which drops EXIF, including GPS — docs/02 §9),
 * uploads it to the presigned URL and returns the storage key. Null when cancelled.
 */
export async function pickAndUploadPhoto(purpose: UploadPurpose): Promise<UploadedPhoto | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    exif: false,
  });
  const asset = picked.canceled ? undefined : picked.assets[0];
  if (!asset) return null;

  const scale = Math.min(1, MAX_SIDE / Math.max(asset.width || MAX_SIDE, asset.height || MAX_SIDE));
  const image = await manipulateAsync(
    asset.uri,
    scale < 1 ? [{ resize: { width: Math.round(asset.width * scale) } }] : [],
    { compress: 0.8, format: SaveFormat.JPEG },
  );

  const target = await endpoints.presignUpload(purpose, 'image/jpeg');
  const blob = await (await fetch(image.uri)).blob();
  if (blob.size > target.max_bytes) throw new Error('Photo too large');
  const response = await fetch(target.url, { method: 'PUT', headers: target.headers, body: blob });
  if (!response.ok) throw new Error(`Upload failed: HTTP ${response.status}`);
  return { key: target.key, uri: image.uri };
}

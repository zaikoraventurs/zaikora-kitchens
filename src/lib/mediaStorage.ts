import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { buildUnexpectedApiResponseError, parseApiResponse } from './api';
import { db, handleFirestoreError, OperationType, storage } from './firebase';
import { stripUndefinedFields } from './inventory';
import type {
  CakeMenuItem,
  FoodMenuItem,
  MediaAssetRecord,
  MediaCategory,
  SiteMediaSectionRecord,
  WebsiteSectionId,
} from '../types';

export const WEBSITE_MEDIA_SECTIONS: ReadonlyArray<{
  id: WebsiteSectionId;
  label: string;
  description: string;
  supportsVideo: boolean;
}> = [
  {
    id: 'homepage_hero',
    label: 'Homepage Hero Banner',
    description: 'Main hero showcase at top of Home page (Desktop & Mobile)',
    supportsVideo: true,
  },
  {
    id: 'homepage_cakes_banner',
    label: 'Homepage Cakes Section Card',
    description: 'Cakes showcase banner near the bottom of Home page',
    supportsVideo: true,
  },
  {
    id: 'cakes_hero',
    label: 'Cakes Page Header Banner',
    description: 'Top celebration banner on the dedicated Cakes page',
    supportsVideo: true,
  },
  {
    id: 'promo_banner',
    label: 'Promotional Showcase Banner / Video',
    description: 'Optional featured promotional photo or video on Home page',
    supportsVideo: true,
  },
  {
    id: 'cat_starters',
    label: 'Category Image: Starters',
    description: 'Category shortcut card & fallback dish image for Starters',
    supportsVideo: false,
  },
  {
    id: 'cat_main_course',
    label: 'Category Image: Main Course',
    description: 'Category shortcut card & fallback dish image for Main Course',
    supportsVideo: false,
  },
  {
    id: 'cat_seafood',
    label: 'Category Image: Seafood Specials',
    description: 'Category shortcut card & fallback dish image for Seafood Specials',
    supportsVideo: false,
  },
  {
    id: 'cat_pizza',
    label: 'Category Image: Pizza Corner',
    description: 'Category shortcut card & fallback dish image for Pizza Corner',
    supportsVideo: false,
  },
  {
    id: 'cat_burger',
    label: 'Category Image: Burger Corner',
    description: 'Category shortcut card & fallback dish image for Burger Corner',
    supportsVideo: false,
  },
  {
    id: 'cat_fries',
    label: 'Category Image: Fries Corner',
    description: 'Category shortcut card & fallback dish image for Fries Corner',
    supportsVideo: false,
  },
  {
    id: 'cat_pasta',
    label: 'Category Image: Pasta Corner',
    description: 'Category shortcut card & fallback dish image for Pasta Corner',
    supportsVideo: false,
  },
  {
    id: 'cat_snacks',
    label: 'Category Image: Additional Snacks',
    description: 'Category shortcut card & fallback dish image for Additional Snacks',
    supportsVideo: false,
  },
  {
    id: 'cat_desserts',
    label: 'Category Image: Desserts',
    description: 'Category shortcut card & fallback dish image for Desserts',
    supportsVideo: false,
  },
];

export const CATEGORY_TO_SECTION_ID: Record<string, WebsiteSectionId> = {
  Starters: 'cat_starters',
  'Main Course – Lunch & Dinner': 'cat_main_course',
  'Seafood Specials': 'cat_seafood',
  'Evening Snacks – Pizza Corner': 'cat_pizza',
  'Burger Corner': 'cat_burger',
  'Fries Corner': 'cat_fries',
  'Pasta Corner': 'cat_pasta',
  'Additional Snacks': 'cat_snacks',
  Desserts: 'cat_desserts',
};

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function normalizeClientMediaMime(file: File): {
  ext: string;
  mimeType: string;
  mediaType: 'image' | 'video';
} | null {
  const nameLower = file.name.trim().toLowerCase();
  const dotIdx = nameLower.lastIndexOf('.');
  let ext = dotIdx >= 0 ? nameLower.slice(dotIdx) : '';
  let mimeType = (file.type || '').toLowerCase().trim();

  if (!ext && mimeType) {
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') ext = '.jpg';
    else if (mimeType === 'image/png') ext = '.png';
    else if (mimeType === 'image/webp') ext = '.webp';
    else if (mimeType === 'video/mp4') ext = '.mp4';
    else if (mimeType === 'video/webm') ext = '.webm';
    else if (mimeType === 'video/quicktime') ext = '.mov';
  }

  if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
  if (!mimeType && ext && EXT_TO_MIME[ext]) {
    mimeType = EXT_TO_MIME[ext];
  }

  if (!ext || !EXT_TO_MIME[ext] || !mimeType) {
    return null;
  }

  const isVideo = mimeType.startsWith('video/');
  if (!isVideo && !mimeType.startsWith('image/')) {
    return null;
  }

  return {
    ext,
    mimeType,
    mediaType: isVideo ? 'video' : 'image',
  };
}

export function validateMediaFileClient(file: File):
  | { ok: true; ext: string; mimeType: string; mediaType: 'image' | 'video' }
  | { ok: false; error: string } {
  const normalized = normalizeClientMediaMime(file);
  if (!normalized) {
    return {
      ok: false,
      error: `Unsupported file "${file.name}". Please select JPG, PNG, WEBP photos or MP4, WEBM, MOV videos.`,
    };
  }
  const limit = normalized.mediaType === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size <= 0 || file.size > limit) {
    return {
      ok: false,
      error:
        normalized.mediaType === 'video'
          ? `Video "${file.name}" exceeds the 50 MB limit (${formatFileSize(file.size)}).`
          : `Image "${file.name}" exceeds the 10 MB limit (${formatFileSize(file.size)}).`,
    };
  }
  return { ok: true, ...normalized };
}

async function readMagicBytesBase64(file: File): Promise<string> {
  const buffer = await file.slice(0, 32).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function createOptimizedImageDerivative(
  file: File
): Promise<{ blob: Blob | null; ext: string; mimeType: string; width: number; height: number }> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { blob: null, ext: '.jpg', mimeType: file.type, width: 0, height: 0 };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = objectUrl;
    });

    const origW = img.naturalWidth || 0;
    const origH = img.naturalHeight || 0;
    if (origW <= 0 || origH <= 0) {
      return { blob: null, ext: '.jpg', mimeType: file.type, width: 0, height: 0 };
    }

    const maxWidth = 1200;
    const scale = origW > maxWidth ? maxWidth / origW : 1;
    const targetW = Math.max(1, Math.round(origW * scale));
    const targetH = Math.max(1, Math.round(origH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { blob: null, ext: '.jpg', mimeType: file.type, width: origW, height: origH };
    }
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const webpBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/webp', 0.84)
    );
    if (webpBlob && webpBlob.size > 0 && webpBlob.size < file.size * 0.96) {
      return {
        blob: webpBlob,
        ext: '.webp',
        mimeType: 'image/webp',
        width: origW,
        height: origH,
      };
    }

    return { blob: null, ext: '.webp', mimeType: file.type, width: origW, height: origH };
  } catch {
    return { blob: null, ext: '.webp', mimeType: file.type, width: 0, height: 0 };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function uploadResumableWithProgress(
  storagePath: string,
  data: Blob | File,
  contentType: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const fileRef = ref(storage, storagePath);
    const task = uploadBytesResumable(fileRef, data, {
      contentType,
      cacheControl: 'public,max-age=31536000',
    });

    task.on(
      'state_changed',
      (snap) => {
        if (snap.totalBytes > 0 && onProgress) {
          onProgress(Math.min(99, Math.round((snap.bytesTransferred / snap.totalBytes) * 100)));
        }
      },
      (err) => reject(err),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          if (onProgress) onProgress(100);
          resolve(url);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

async function verifyUploadedMediaUrl(url: string, mediaType: 'image' | 'video'): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', mode: 'cors' });
    if (res.ok) return true;
  } catch {
    // Fall back to element check for strict CORS configurations
  }

  if (mediaType === 'image' && typeof Image !== 'undefined') {
    return new Promise<boolean>((resolve) => {
      const img = new Image();
      const timer = window.setTimeout(() => resolve(true), 5000);
      img.onload = () => {
        window.clearTimeout(timer);
        resolve(true);
      };
      img.onerror = () => {
        window.clearTimeout(timer);
        resolve(false);
      };
      img.src = url;
    });
  }

  return true;
}

function buildSafeBaseName(filename: string): string {
  return (
    filename
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'media'
  );
}

function makeMediaId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `med_${Date.now()}_${rand}`;
}

export async function authorizeMediaUploadOnServer(
  file: File,
  getAdminApiAuthHeaders: () => Promise<Record<string, string>>
): Promise<{ safeExtension: string; mediaType: 'image' | 'video'; mimeType: string }> {
  const clientCheck = validateMediaFileClient(file);
  if (clientCheck.ok === false) {
    throw new Error(clientCheck.error);
  }

  const magicBytesBase64 = await readMagicBytesBase64(file);
  const adminHeaders = await getAdminApiAuthHeaders();
  const safeFilename = `${buildSafeBaseName(file.name)}${clientCheck.ext}`;

  const authRes = await fetch('/api/admin/upload-authorize', {
    method: 'POST',
    credentials: 'include',
    headers: adminHeaders,
    body: JSON.stringify({
      filename: safeFilename,
      mimeType: clientCheck.mimeType,
      sizeBytes: file.size,
      magicBytesBase64,
    }),
  });

  const authParsed = await parseApiResponse<{
    authorized?: boolean;
    safeExtension?: string;
    mediaType?: 'image' | 'video';
    error?: string;
  }>(authRes);

  const authData = authParsed.data;
  if (!authParsed.isJson || !authData) {
    throw new Error(
      buildUnexpectedApiResponseError(authRes, 'Upload security verification endpoint unavailable')
    );
  }
  if (!authRes.ok || !authData.authorized) {
    throw new Error(authData.error || 'Upload blocked by security verification.');
  }

  return {
    safeExtension: authData.safeExtension || clientCheck.ext,
    mediaType: authData.mediaType || clientCheck.mediaType,
    mimeType: clientCheck.mimeType,
  };
}

export async function uploadMediaToFirebaseStorage(params: {
  file: File;
  displayLabel: string;
  mediaCategory: MediaCategory;
  uploadedByUid: string;
  getAdminApiAuthHeaders: () => Promise<Record<string, string>>;
  onProgress?: (percent: number) => void;
}): Promise<MediaAssetRecord> {
  const {
    file,
    displayLabel,
    mediaCategory,
    uploadedByUid,
    getAdminApiAuthHeaders,
    onProgress,
  } = params;

  onProgress?.(2);
  const authInfo = await authorizeMediaUploadOnServer(file, getAdminApiAuthHeaders);
  onProgress?.(8);

  const mediaId = makeMediaId();
  const baseName = buildSafeBaseName(file.name);
  const cleanLabel = displayLabel.trim().slice(0, 120) || baseName.replace(/_/g, ' ');
  const fileFormat = authInfo.safeExtension.replace(/^\./, '').toUpperCase();

  let storagePath = '';
  let derivativeStoragePath: string | undefined;
  let downloadUrl = '';
  let derivativeUrl: string | undefined;
  let width = 0;
  let height = 0;

  if (authInfo.mediaType === 'video') {
    storagePath = `media_library/videos/${mediaId}_${baseName}${authInfo.safeExtension}`;
    downloadUrl = await uploadResumableWithProgress(
      storagePath,
      file,
      authInfo.mimeType,
      (p) => onProgress?.(10 + Math.round(p * 0.85))
    );
  } else {
    storagePath = `media_library/originals/${mediaId}_${baseName}${authInfo.safeExtension}`;
    const derivative = await createOptimizedImageDerivative(file);
    width = derivative.width;
    height = derivative.height;

    if (derivative.blob) {
      derivativeStoragePath = `media_library/derivatives/${mediaId}_${baseName}${derivative.ext}`;
      const [origUrl, derivUrl] = await Promise.all([
        uploadResumableWithProgress(storagePath, file, authInfo.mimeType, (p) =>
          onProgress?.(10 + Math.round(p * 0.5))
        ),
        uploadResumableWithProgress(
          derivativeStoragePath,
          derivative.blob,
          derivative.mimeType,
          (p) => onProgress?.(60 + Math.round(p * 0.35))
        ),
      ]);
      downloadUrl = origUrl;
      derivativeUrl = derivUrl;
    } else {
      downloadUrl = await uploadResumableWithProgress(
        storagePath,
        file,
        authInfo.mimeType,
        (p) => onProgress?.(10 + Math.round(p * 0.85))
      );
    }
  }

  const verified = await verifyUploadedMediaUrl(derivativeUrl || downloadUrl, authInfo.mediaType);
  if (!verified) {
    throw new Error('Uploaded file could not be verified from Firebase Storage.');
  }

  const docPayload: Record<string, unknown> = {
    mediaId,
    displayLabel: cleanLabel,
    originalFilename: file.name.slice(0, 200),
    mediaType: authInfo.mediaType,
    mediaCategory,
    storagePath,
    downloadUrl,
    mimeType: authInfo.mimeType,
    fileFormat,
    fileSize: Math.max(1, Math.round(file.size)),
    active: true,
    uploadedBy: uploadedByUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (derivativeStoragePath && derivativeUrl) {
    docPayload.derivativeStoragePath = derivativeStoragePath;
    docPayload.derivativeUrl = derivativeUrl;
  }
  if (width > 0 && height > 0) {
    docPayload.width = width;
    docPayload.height = height;
  }

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'media_library', mediaId), docPayload);
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `media_library/${mediaId}`);
  }

  onProgress?.(100);

  return {
    mediaId,
    displayLabel: cleanLabel,
    originalFilename: file.name.slice(0, 200),
    mediaType: authInfo.mediaType,
    mediaCategory,
    storagePath,
    derivativeStoragePath,
    downloadUrl,
    derivativeUrl,
    mimeType: authInfo.mimeType,
    fileFormat,
    fileSize: Math.max(1, Math.round(file.size)),
    width: width || undefined,
    height: height || undefined,
    active: true,
    uploadedBy: uploadedByUid,
  };
}

export async function assignMediaToTarget(params: {
  asset: MediaAssetRecord;
  target:
    | { kind: 'food'; item: FoodMenuItem }
    | { kind: 'cake'; item: CakeMenuItem }
    | { kind: 'section'; sectionId: WebsiteSectionId; sectionLabel: string };
  existingMediaLibrary?: MediaAssetRecord[];
}): Promise<void> {
  const { asset, target, existingMediaLibrary = [] } = params;
  const batch = writeBatch(db);
  const preferredUrl = asset.derivativeUrl || asset.downloadUrl;

  if (target.kind === 'food') {
    if (asset.mediaType !== 'image') {
      throw new Error('Food menu items require an image file.');
    }
    const { item } = target;
    batch.set(
      doc(db, 'food_menu', item.id),
      stripUndefinedFields({
        id: item.id,
        name: item.name,
        category: item.category,
        quantityLabel: item.quantityLabel,
        originalPrice: item.originalPrice,
        description: item.description,
        imageUrl: asset.downloadUrl.slice(0, 1000),
        imageDerivativeUrl: asset.derivativeUrl ? asset.derivativeUrl.slice(0, 1000) : undefined,
        mediaId: asset.mediaId,
        available: item.available,
        sortOrder: item.sortOrder,
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );
    batch.update(doc(db, 'media_library', asset.mediaId), {
      assignedProductId: item.id,
      assignedProductName: item.name.slice(0, 120),
      assignedProductType: 'food',
      mediaCategory: 'food',
      updatedAt: serverTimestamp(),
    });
  } else if (target.kind === 'cake') {
    if (asset.mediaType !== 'image') {
      throw new Error('Cake menu items require an image file.');
    }
    const { item } = target;
    batch.set(
      doc(db, 'cake_menu', item.id),
      stripUndefinedFields({
        id: item.id,
        name: item.name,
        cakeType: item.cakeType,
        quantityLabel: item.quantityLabel,
        originalPrice: item.originalPrice,
        priceUnit: item.priceUnit,
        flavours: item.flavours,
        notice: item.notice,
        orderableOnline: item.orderableOnline,
        eligibleForAutoDiscount: item.eligibleForAutoDiscount,
        description: item.description,
        imageUrl: asset.downloadUrl.slice(0, 1000),
        imageDerivativeUrl: asset.derivativeUrl ? asset.derivativeUrl.slice(0, 1000) : undefined,
        mediaId: asset.mediaId,
        available: item.available,
        sortOrder: item.sortOrder,
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );
    batch.update(doc(db, 'media_library', asset.mediaId), {
      assignedProductId: item.id,
      assignedProductName: item.name.slice(0, 120),
      assignedProductType: 'cake',
      mediaCategory: 'cake',
      updatedAt: serverTimestamp(),
    });
  } else {
    const sectionMeta = WEBSITE_MEDIA_SECTIONS.find((s) => s.id === target.sectionId);
    if (sectionMeta && !sectionMeta.supportsVideo && asset.mediaType === 'video') {
      throw new Error(`"${target.sectionLabel}" requires an image file rather than a video.`);
    }

    batch.set(
      doc(db, 'site_media', target.sectionId),
      stripUndefinedFields({
        sectionId: target.sectionId,
        label: target.sectionLabel.slice(0, 120),
        mediaId: asset.mediaId,
        mediaUrl: preferredUrl.slice(0, 1000),
        derivativeUrl: asset.derivativeUrl ? asset.derivativeUrl.slice(0, 1000) : undefined,
        mediaType: asset.mediaType,
        storagePath: asset.storagePath.slice(0, 260),
        updatedAt: serverTimestamp(),
      })
    );

    // Clear previous section ownership badge on other assets if any
    for (const other of existingMediaLibrary) {
      if (other.mediaId !== asset.mediaId && other.websiteSection === target.sectionId) {
        batch.update(doc(db, 'media_library', other.mediaId), {
          websiteSection: '',
          updatedAt: serverTimestamp(),
        });
      }
    }

    batch.update(doc(db, 'media_library', asset.mediaId), {
      websiteSection: target.sectionId,
      mediaCategory: target.sectionId === 'promo_banner' ? 'promotional' : 'homepage',
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `media_library/${asset.mediaId}`);
  }
}

export async function clearWebsiteSectionMedia(params: {
  sectionId: WebsiteSectionId | string;
  existingMediaLibrary: MediaAssetRecord[];
}): Promise<void> {
  const { sectionId, existingMediaLibrary } = params;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'site_media', sectionId));
  for (const item of existingMediaLibrary) {
    if (item.websiteSection === sectionId) {
      batch.update(doc(db, 'media_library', item.mediaId), {
        websiteSection: '',
        updatedAt: serverTimestamp(),
      });
    }
  }
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `site_media/${sectionId}`);
  }
}

export async function renameMediaAssetLabel(mediaId: string, newLabel: string): Promise<void> {
  const clean = newLabel.trim().slice(0, 120);
  if (!clean) {
    throw new Error('Display label cannot be empty.');
  }
  try {
    await updateDoc(doc(db, 'media_library', mediaId), {
      displayLabel: clean,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `media_library/${mediaId}`);
  }
}

export async function setMediaAssetActiveStatus(mediaId: string, active: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, 'media_library', mediaId), {
      active,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `media_library/${mediaId}`);
  }
}

export async function safeReplaceMediaAsset(params: {
  existingAsset: MediaAssetRecord;
  newFile: File;
  foodMenu: FoodMenuItem[];
  cakeMenu: CakeMenuItem[];
  siteMedia: Record<string, SiteMediaSectionRecord>;
  getAdminApiAuthHeaders: () => Promise<Record<string, string>>;
  onProgress?: (percent: number) => void;
}): Promise<MediaAssetRecord> {
  const {
    existingAsset,
    newFile,
    foodMenu,
    cakeMenu,
    siteMedia,
    getAdminApiAuthHeaders,
    onProgress,
  } = params;

  onProgress?.(2);
  const authInfo = await authorizeMediaUploadOnServer(newFile, getAdminApiAuthHeaders);

  const isUsedAsProductImage =
    Boolean(existingAsset.assignedProductId) ||
    foodMenu.some((f) => f.mediaId === existingAsset.mediaId || f.imageUrl === existingAsset.downloadUrl) ||
    cakeMenu.some((c) => c.mediaId === existingAsset.mediaId || c.imageUrl === existingAsset.downloadUrl);

  if (isUsedAsProductImage && authInfo.mediaType !== 'image') {
    throw new Error('This media is assigned to a menu item and must be replaced with an image file.');
  }

  const versionTag = Date.now();
  const baseName = buildSafeBaseName(newFile.name);
  const fileFormat = authInfo.safeExtension.replace(/^\./, '').toUpperCase();

  let newStoragePath = '';
  let newDerivativeStoragePath: string | undefined;
  let newDownloadUrl = '';
  let newDerivativeUrl: string | undefined;
  let width = 0;
  let height = 0;

  if (authInfo.mediaType === 'video') {
    newStoragePath = `media_library/videos/${existingAsset.mediaId}_v${versionTag}_${baseName}${authInfo.safeExtension}`;
    newDownloadUrl = await uploadResumableWithProgress(
      newStoragePath,
      newFile,
      authInfo.mimeType,
      (p) => onProgress?.(10 + Math.round(p * 0.8))
    );
  } else {
    newStoragePath = `media_library/originals/${existingAsset.mediaId}_v${versionTag}_${baseName}${authInfo.safeExtension}`;
    const derivative = await createOptimizedImageDerivative(newFile);
    width = derivative.width;
    height = derivative.height;

    if (derivative.blob) {
      newDerivativeStoragePath = `media_library/derivatives/${existingAsset.mediaId}_v${versionTag}_${baseName}${derivative.ext}`;
      const [origUrl, derivUrl] = await Promise.all([
        uploadResumableWithProgress(newStoragePath, newFile, authInfo.mimeType, (p) =>
          onProgress?.(10 + Math.round(p * 0.45))
        ),
        uploadResumableWithProgress(
          newDerivativeStoragePath,
          derivative.blob,
          derivative.mimeType,
          (p) => onProgress?.(55 + Math.round(p * 0.35))
        ),
      ]);
      newDownloadUrl = origUrl;
      newDerivativeUrl = derivUrl;
    } else {
      newDownloadUrl = await uploadResumableWithProgress(
        newStoragePath,
        newFile,
        authInfo.mimeType,
        (p) => onProgress?.(10 + Math.round(p * 0.8))
      );
    }
  }

  // Step 2: Confirm new file is retrievable BEFORE updating Firestore or removing old file
  const verified = await verifyUploadedMediaUrl(
    newDerivativeUrl || newDownloadUrl,
    authInfo.mediaType
  );
  if (!verified) {
    throw new Error('New replacement upload could not be verified. Existing media was preserved.');
  }

  // Step 3: Atomically update media_library doc + all referencing menu items & website sections
  const batch = writeBatch(db);
  const preferredUrl = newDerivativeUrl || newDownloadUrl;

  const mediaUpdate: Record<string, unknown> = {
    originalFilename: newFile.name.slice(0, 200),
    mediaType: authInfo.mediaType,
    storagePath: newStoragePath,
    downloadUrl: newDownloadUrl,
    mimeType: authInfo.mimeType,
    fileFormat,
    fileSize: Math.max(1, Math.round(newFile.size)),
    updatedAt: serverTimestamp(),
  };
  if (newDerivativeStoragePath && newDerivativeUrl) {
    mediaUpdate.derivativeStoragePath = newDerivativeStoragePath;
    mediaUpdate.derivativeUrl = newDerivativeUrl;
  }
  if (width > 0 && height > 0) {
    mediaUpdate.width = width;
    mediaUpdate.height = height;
  }
  batch.update(doc(db, 'media_library', existingAsset.mediaId), mediaUpdate);

  for (const item of foodMenu) {
    if (
      item.mediaId === existingAsset.mediaId ||
      item.imageUrl === existingAsset.downloadUrl ||
      (existingAsset.derivativeUrl && item.imageUrl === existingAsset.derivativeUrl)
    ) {
      batch.update(doc(db, 'food_menu', item.id), {
        imageUrl: newDownloadUrl.slice(0, 1000),
        ...(newDerivativeUrl ? { imageDerivativeUrl: newDerivativeUrl.slice(0, 1000) } : {}),
        mediaId: existingAsset.mediaId,
        updatedAt: serverTimestamp(),
      });
    }
  }

  for (const cake of cakeMenu) {
    if (
      cake.mediaId === existingAsset.mediaId ||
      cake.imageUrl === existingAsset.downloadUrl ||
      (existingAsset.derivativeUrl && cake.imageUrl === existingAsset.derivativeUrl)
    ) {
      batch.update(doc(db, 'cake_menu', cake.id), {
        imageUrl: newDownloadUrl.slice(0, 1000),
        ...(newDerivativeUrl ? { imageDerivativeUrl: newDerivativeUrl.slice(0, 1000) } : {}),
        mediaId: existingAsset.mediaId,
        updatedAt: serverTimestamp(),
      });
    }
  }

  for (const sec of Object.values(siteMedia)) {
    if (
      sec.mediaId === existingAsset.mediaId ||
      sec.storagePath === existingAsset.storagePath
    ) {
      batch.update(doc(db, 'site_media', sec.sectionId), {
        mediaUrl: preferredUrl.slice(0, 1000),
        ...(newDerivativeUrl ? { derivativeUrl: newDerivativeUrl.slice(0, 1000) } : {}),
        mediaType: authInfo.mediaType,
        storagePath: newStoragePath.slice(0, 260),
        updatedAt: serverTimestamp(),
      });
    }
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `media_library/${existingAsset.mediaId}`);
  }

  // Step 4: Only delete old Storage objects if no other media_library doc still references them
  try {
    const snap = await getDocs(collection(db, 'media_library'));
    const otherAssets = snap.docs
      .map((d) => d.data() as MediaAssetRecord)
      .filter((a) => a.mediaId !== existingAsset.mediaId);

    const oldOrigReferenced = otherAssets.some((a) => a.storagePath === existingAsset.storagePath);
    if (!oldOrigReferenced && existingAsset.storagePath && existingAsset.storagePath !== newStoragePath) {
      await deleteObject(ref(storage, existingAsset.storagePath)).catch(() => undefined);
    }

    if (
      existingAsset.derivativeStoragePath &&
      existingAsset.derivativeStoragePath !== newDerivativeStoragePath
    ) {
      const oldDerivReferenced = otherAssets.some(
        (a) => a.derivativeStoragePath === existingAsset.derivativeStoragePath
      );
      if (!oldDerivReferenced) {
        await deleteObject(ref(storage, existingAsset.derivativeStoragePath)).catch(() => undefined);
      }
    }
  } catch {
    // Non-fatal cleanup
  }

  onProgress?.(100);

  return {
    ...existingAsset,
    originalFilename: newFile.name.slice(0, 200),
    mediaType: authInfo.mediaType,
    storagePath: newStoragePath,
    derivativeStoragePath: newDerivativeStoragePath,
    downloadUrl: newDownloadUrl,
    derivativeUrl: newDerivativeUrl,
    mimeType: authInfo.mimeType,
    fileFormat,
    fileSize: Math.max(1, Math.round(newFile.size)),
    width: width || existingAsset.width,
    height: height || existingAsset.height,
  };
}

export function findAssetUsages(params: {
  asset: MediaAssetRecord;
  foodMenu: FoodMenuItem[];
  cakeMenu: CakeMenuItem[];
  siteMedia: Record<string, SiteMediaSectionRecord>;
}): string[] {
  const { asset, foodMenu, cakeMenu, siteMedia } = params;
  const usages: string[] = [];

  for (const item of foodMenu) {
    if (
      item.mediaId === asset.mediaId ||
      item.imageUrl === asset.downloadUrl ||
      (asset.derivativeUrl && item.imageUrl === asset.derivativeUrl)
    ) {
      usages.push(`Food Item: ${item.name}`);
    }
  }

  for (const cake of cakeMenu) {
    if (
      cake.mediaId === asset.mediaId ||
      cake.imageUrl === asset.downloadUrl ||
      (asset.derivativeUrl && cake.imageUrl === asset.derivativeUrl)
    ) {
      usages.push(`Cake Item: ${cake.name}`);
    }
  }

  for (const sec of Object.values(siteMedia)) {
    if (sec.mediaId === asset.mediaId || sec.storagePath === asset.storagePath) {
      usages.push(`Website Section: ${sec.label}`);
    }
  }

  if (usages.length === 0 && asset.websiteSection) {
    usages.push(`Website Section: ${asset.websiteSection}`);
  }

  return usages;
}

export async function safeDeleteMediaAsset(params: {
  asset: MediaAssetRecord;
  foodMenu: FoodMenuItem[];
  cakeMenu: CakeMenuItem[];
  siteMedia: Record<string, SiteMediaSectionRecord>;
}): Promise<void> {
  const { asset, foodMenu, cakeMenu, siteMedia } = params;
  const usages = findAssetUsages({ asset, foodMenu, cakeMenu, siteMedia });

  if (usages.length > 0) {
    throw new Error(
      `Cannot delete "${asset.displayLabel}" because it is currently in use (${usages.join(', ')}). Reassign or replace the media first.`
    );
  }

  try {
    await deleteDoc(doc(db, 'media_library', asset.mediaId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `media_library/${asset.mediaId}`);
  }

  await deleteObject(ref(storage, asset.storagePath)).catch(() => undefined);
  if (asset.derivativeStoragePath) {
    await deleteObject(ref(storage, asset.derivativeStoragePath)).catch(() => undefined);
  }
}

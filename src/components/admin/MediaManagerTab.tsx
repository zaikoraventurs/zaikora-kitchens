import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Eye,
  Film,
  Image as ImageIcon,
  Layers,
  Link2,
  Pencil,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatDateTime } from '../../lib/pricing';
import {
  WEBSITE_MEDIA_SECTIONS,
  assignMediaToTarget,
  clearWebsiteSectionMedia,
  findAssetUsages,
  formatFileSize,
  renameMediaAssetLabel,
  safeDeleteMediaAsset,
  safeReplaceMediaAsset,
  setMediaAssetActiveStatus,
  uploadMediaToFirebaseStorage,
  validateMediaFileClient,
} from '../../lib/mediaStorage';
import type {
  CakeMenuItem,
  FoodMenuItem,
  MediaAssetRecord,
  MediaCategory,
  WebsiteSectionId,
} from '../../types';
import { FoodImage, MediaVideo } from '../ReliableMedia';

interface QueuedUploadItem {
  queueId: string;
  file: File;
  previewUrl: string;
  mediaType: 'image' | 'video';
  displayLabel: string;
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface MediaManagerTabProps {
  onAudit: (action: string, target: string, details: string) => Promise<void>;
  onNotify: (msg: string) => void;
}

function defaultLabelFromFilename(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'Kitchen Media'
  );
}

export function MediaManagerTab({ onAudit, onNotify }: MediaManagerTabProps) {
  const {
    user,
    foodMenu,
    cakeMenu,
    siteMedia,
    mediaLibrary,
    getAdminApiAuthHeaders,
  } = useApp();

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const [uploadCategory, setUploadCategory] = useState<MediaCategory>('food');
  const [autoAssignKey, setAutoAssignKey] = useState<string>('');
  const [queue, setQueue] = useState<QueuedUploadItem[]>([]);
  const [uploadingQueue, setUploadingQueue] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [usageFilter, setUsageFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');

  const [errorBanner, setErrorBanner] = useState('');
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState('');
  const [assignSelection, setAssignSelection] = useState<Record<string, string>>({});
  const [busyAssetIds, setBusyAssetIds] = useState<Record<string, string>>({});
  const [replaceProgress, setReplaceProgress] = useState<Record<string, number>>({});
  const [previewAsset, setPreviewAsset] = useState<MediaAssetRecord | null>(null);

  const queueRef = useRef<QueuedUploadItem[]>([]);
  queueRef.current = queue;

  useEffect(() => {
    return () => {
      for (const q of queueRef.current) {
        URL.revokeObjectURL(q.previewUrl);
      }
    };
  }, []);

  const handleQueueFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorBanner('');

    const added: QueuedUploadItem[] = [];
    const errors: string[] = [];

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const check = validateMediaFileClient(file);
      if (check.ok === false) {
        errors.push(check.error);
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      added.push({
        queueId: `q_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        file,
        previewUrl,
        mediaType: check.mediaType,
        displayLabel: defaultLabelFromFilename(file.name),
        progress: 0,
        status: 'queued',
      });
    }

    if (errors.length > 0) {
      setErrorBanner(errors.join(' '));
    }
    if (added.length > 0) {
      setQueue((prev) => [...prev, ...added]);
    }
  };

  const removeFromQueue = (queueId: string) => {
    setQueue((prev) => {
      const item = prev.find((x) => x.queueId === queueId);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((x) => x.queueId !== queueId);
    });
  };

  const resolveAssignmentTarget = (
    key: string
  ):
    | { kind: 'food'; item: FoodMenuItem }
    | { kind: 'cake'; item: CakeMenuItem }
    | { kind: 'section'; sectionId: WebsiteSectionId; sectionLabel: string }
    | null => {
    if (!key) return null;
    if (key.startsWith('food:')) {
      const id = key.slice(5);
      const found = foodMenu.find((f) => f.id === id);
      return found ? { kind: 'food', item: found } : null;
    }
    if (key.startsWith('cake:')) {
      const id = key.slice(5);
      const found = cakeMenu.find((c) => c.id === id);
      return found ? { kind: 'cake', item: found } : null;
    }
    if (key.startsWith('section:')) {
      const sectionId = key.slice(8) as WebsiteSectionId;
      const meta = WEBSITE_MEDIA_SECTIONS.find((s) => s.id === sectionId);
      return meta
        ? { kind: 'section', sectionId: meta.id, sectionLabel: meta.label }
        : null;
    }
    return null;
  };

  const handleUploadAllQueued = async () => {
    if (!user || uploadingQueue) return;
    const pendingItems = queue.filter((q) => q.status === 'queued' || q.status === 'error');
    if (pendingItems.length === 0) return;

    setUploadingQueue(true);
    setErrorBanner('');

    let successCount = 0;
    const assignTarget = resolveAssignmentTarget(autoAssignKey);

    for (let idx = 0; idx < pendingItems.length; idx += 1) {
      const current = pendingItems[idx];
      setQueue((prev) =>
        prev.map((q) =>
          q.queueId === current.queueId ? { ...q, status: 'uploading', progress: 2, error: undefined } : q
        )
      );

      try {
        const uploadedAsset = await uploadMediaToFirebaseStorage({
          file: current.file,
          displayLabel: current.displayLabel,
          mediaCategory: uploadCategory,
          uploadedByUid: user.uid,
          getAdminApiAuthHeaders,
          onProgress: (pct) => {
            setQueue((prev) =>
              prev.map((q) => (q.queueId === current.queueId ? { ...q, progress: pct } : q))
            );
          },
        });

        await onAudit(
          'UPLOAD_MEDIA',
          `media_library/${uploadedAsset.mediaId}`,
          `Uploaded ${uploadedAsset.mediaType} "${uploadedAsset.displayLabel}" (${uploadedAsset.fileFormat}, ${formatFileSize(uploadedAsset.fileSize)})`
        );

        // Auto-assign the first item (or section item) if admin picked a destination
        if (assignTarget && idx === 0) {
          await assignMediaToTarget({
            asset: uploadedAsset,
            target: assignTarget,
            existingMediaLibrary: mediaLibrary,
          });
          await onAudit(
            'ASSIGN_MEDIA',
            `media_library/${uploadedAsset.mediaId}`,
            `Assigned to ${autoAssignKey}`
          );
        }

        successCount += 1;
        setQueue((prev) => {
          const item = prev.find((q) => q.queueId === current.queueId);
          if (item) URL.revokeObjectURL(item.previewUrl);
          return prev.filter((q) => q.queueId !== current.queueId);
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed.';
        setQueue((prev) =>
          prev.map((q) =>
            q.queueId === current.queueId ? { ...q, status: 'error', error: msg } : q
          )
        );
        setErrorBanner(msg);
      }
    }

    setUploadingQueue(false);
    if (successCount > 0) {
      onNotify(
        `${successCount} media ${successCount === 1 ? 'file' : 'files'} permanently saved to Firebase Storage.`
      );
      if (assignTarget) setAutoAssignKey('');
    }
  };

  const handleSaveRename = async (mediaId: string) => {
    setErrorBanner('');
    try {
      await renameMediaAssetLabel(mediaId, editingLabelValue);
      await onAudit('RENAME_MEDIA', `media_library/${mediaId}`, `Renamed to "${editingLabelValue.trim()}"`);
      setEditingLabelId(null);
      onNotify('Media label updated.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to rename media item.');
    }
  };

  const handleAssignAsset = async (asset: MediaAssetRecord) => {
    const key = assignSelection[asset.mediaId];
    const target = resolveAssignmentTarget(key || '');
    if (!target) {
      setErrorBanner('Please select a menu item or website section before clicking Assign.');
      return;
    }
    setErrorBanner('');
    setBusyAssetIds((p) => ({ ...p, [asset.mediaId]: 'Assigning...' }));
    try {
      await assignMediaToTarget({
        asset,
        target,
        existingMediaLibrary: mediaLibrary,
      });
      await onAudit('ASSIGN_MEDIA', `media_library/${asset.mediaId}`, `Assigned "${asset.displayLabel}" to ${key}`);
      setAssignSelection((p) => ({ ...p, [asset.mediaId]: '' }));
      onNotify(`"${asset.displayLabel}" assigned permanently.`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to assign media.');
    } finally {
      setBusyAssetIds((p) => {
        const next = { ...p };
        delete next[asset.mediaId];
        return next;
      });
    }
  };

  const handleReplaceAssetFile = async (asset: MediaAssetRecord, file: File) => {
    setErrorBanner('');
    const check = validateMediaFileClient(file);
    if (check.ok === false) {
      setErrorBanner(check.error);
      return;
    }

    setBusyAssetIds((p) => ({ ...p, [asset.mediaId]: 'Replacing...' }));
    setReplaceProgress((p) => ({ ...p, [asset.mediaId]: 2 }));
    try {
      const updated = await safeReplaceMediaAsset({
        existingAsset: asset,
        newFile: file,
        foodMenu,
        cakeMenu,
        siteMedia,
        getAdminApiAuthHeaders,
        onProgress: (pct) => setReplaceProgress((p) => ({ ...p, [asset.mediaId]: pct })),
      });
      await onAudit(
        'REPLACE_MEDIA',
        `media_library/${asset.mediaId}`,
        `Safely replaced "${asset.displayLabel}" with ${updated.originalFilename}`
      );
      onNotify(`"${asset.displayLabel}" replaced safely and propagated to assigned sections.`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Safe file replacement failed.');
    } finally {
      setBusyAssetIds((p) => {
        const next = { ...p };
        delete next[asset.mediaId];
        return next;
      });
      setReplaceProgress((p) => {
        const next = { ...p };
        delete next[asset.mediaId];
        return next;
      });
    }
  };

  const handleDeleteAsset = async (asset: MediaAssetRecord) => {
    setErrorBanner('');
    setBusyAssetIds((p) => ({ ...p, [asset.mediaId]: 'Deleting...' }));
    try {
      await safeDeleteMediaAsset({
        asset,
        foodMenu,
        cakeMenu,
        siteMedia,
      });
      await onAudit('DELETE_MEDIA', `media_library/${asset.mediaId}`, `Deleted unused media "${asset.displayLabel}"`);
      onNotify(`Deleted "${asset.displayLabel}".`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to delete media.');
    } finally {
      setBusyAssetIds((p) => {
        const next = { ...p };
        delete next[asset.mediaId];
        return next;
      });
    }
  };

  const handleToggleActiveStatus = async (asset: MediaAssetRecord) => {
    const nextActive = !asset.active;
    setErrorBanner('');
    setBusyAssetIds((p) => ({ ...p, [asset.mediaId]: nextActive ? 'Activating...' : 'Updating...' }));
    try {
      await setMediaAssetActiveStatus(asset.mediaId, nextActive);
      await onAudit(
        'TOGGLE_MEDIA_STATUS',
        `media_library/${asset.mediaId}`,
        `Set "${asset.displayLabel}" status to ${nextActive ? 'Active' : 'Inactive'}`
      );
      onNotify(`"${asset.displayLabel}" marked ${nextActive ? 'Active' : 'Inactive'}.`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to update media status.');
    } finally {
      setBusyAssetIds((p) => {
        const next = { ...p };
        delete next[asset.mediaId];
        return next;
      });
    }
  };

  const handleRevertSection = async (sectionId: string, label: string) => {
    setErrorBanner('');
    try {
      await clearWebsiteSectionMedia({ sectionId, existingMediaLibrary: mediaLibrary });
      await onAudit('CLEAR_SITE_MEDIA', `site_media/${sectionId}`, `Reverted ${label} to built-in default`);
      onNotify(`Reverted "${label}" to built-in default.`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to revert section media.');
    }
  };

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return mediaLibrary.filter((asset) => {
      if (typeFilter !== 'all' && asset.mediaType !== typeFilter) return false;
      if (categoryFilter !== 'all' && asset.mediaCategory !== categoryFilter) return false;

      const usages = findAssetUsages({ asset, foodMenu, cakeMenu, siteMedia });
      if (usageFilter === 'assigned' && usages.length === 0) return false;
      if (usageFilter === 'unassigned' && usages.length > 0) return false;

      if (!q) return true;
      return (
        asset.displayLabel.toLowerCase().includes(q) ||
        asset.originalFilename.toLowerCase().includes(q) ||
        (asset.assignedProductName || '').toLowerCase().includes(q) ||
        (asset.websiteSection || '').toLowerCase().includes(q) ||
        usages.some((u) => u.toLowerCase().includes(q))
      );
    });
  }, [mediaLibrary, typeFilter, categoryFilter, usageFilter, searchQuery, foodMenu, cakeMenu, siteMedia]);

  return (
    <div className="space-y-8">
      {errorBanner && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs sm:text-sm text-red-900 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner('')}
            className="text-xs font-semibold text-red-800 underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Permanent Phone Gallery Upload Panel */}
      <section className="bg-white border border-zinc-200 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4">
          <div>
            <p className="text-[11px] font-semibold tracking-widest text-[#D97706]">
              PERMANENT FIREBASE STORAGE
            </p>
            <h2 className="text-lg sm:text-xl font-bold text-zinc-900">
              Upload Photos &amp; Videos from Phone Gallery
            </h2>
            <p className="text-xs text-zinc-600 mt-0.5">
              Select multiple photos (JPG, PNG, WEBP up to 10 MB) or videos (MP4, WEBM, MOV up to 50 MB). Preview, name, and save permanently to Firebase Storage.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handleQueueFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/*"
              className="hidden"
              onChange={(e) => {
                handleQueueFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#E88D14] text-black text-xs font-bold rounded-xl hover:bg-[#f39c25] transition-colors"
            >
              <ImageIcon className="w-4 h-4" />
              <span>Select Photos from Gallery</span>
            </button>
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0A0A0B] text-white text-xs font-bold rounded-xl hover:bg-zinc-800 transition-colors"
            >
              <Film className="w-4 h-4 text-[#E88D14]" />
              <span>Select Video from Gallery</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Media Category
            </label>
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value as MediaCategory)}
              className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-xs font-medium"
            >
              <option value="food">Food Menu Photo</option>
              <option value="cake">Cake Photo</option>
              <option value="homepage">Homepage / Page Banner</option>
              <option value="promotional">Promotional Video / Spotlight</option>
              <option value="other">General Kitchen Media</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Auto-Assign First Upload To (Optional)
            </label>
            <select
              value={autoAssignKey}
              onChange={(e) => setAutoAssignKey(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-xs font-medium"
            >
              <option value="">Save to Media Library only (assign later)</option>
              <optgroup label="Website Sections">
                {WEBSITE_MEDIA_SECTIONS.map((s) => (
                  <option key={s.id} value={`section:${s.id}`}>
                    Section: {s.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Food Menu Items">
                {foodMenu.map((item) => (
                  <option key={item.id} value={`food:${item.id}`}>
                    Food: {item.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Cake Items">
                {cakeMenu.map((cake) => (
                  <option key={cake.id} value={`cake:${cake.id}`}>
                    Cake: {cake.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        {/* Preview Before Publish Queue */}
        {queue.length > 0 && (
          <div className="space-y-4 pt-2 border-t border-zinc-100">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-bold text-zinc-900">
                Preview Before Publish ({queue.length} {queue.length === 1 ? 'file' : 'files'} ready)
              </p>
              <button
                type="button"
                disabled={uploadingQueue}
                onClick={handleUploadAllQueued}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-60"
              >
                <Upload className="w-4 h-4" />
                <span>
                  {uploadingQueue ? 'Uploading Permanently...' : 'Upload & Save Permanently'}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {queue.map((q) => (
                <div
                  key={q.queueId}
                  className="border border-zinc-200 rounded-xl overflow-hidden bg-zinc-50 flex flex-col"
                >
                  <div className="relative aspect-[4/3] bg-zinc-900">
                    {q.mediaType === 'video' ? (
                      <video
                        src={q.previewUrl}
                        controls
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={q.previewUrl}
                        alt={q.displayLabel}
                        className="w-full h-full object-contain"
                      />
                    )}
                    {q.status !== 'uploading' && (
                      <button
                        type="button"
                        onClick={() => removeFromQueue(q.queueId)}
                        aria-label={`Remove ${q.displayLabel} from queue`}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/75 text-white hover:bg-red-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 text-white text-[10px] font-mono">
                      {q.mediaType.toUpperCase()} · {formatFileSize(q.file.size)}
                    </span>
                  </div>

                  <div className="p-3 space-y-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                        Display Label
                      </label>
                      <input
                        type="text"
                        maxLength={120}
                        disabled={q.status === 'uploading'}
                        value={q.displayLabel}
                        onChange={(e) => {
                          const val = e.target.value;
                          setQueue((prev) =>
                            prev.map((item) =>
                              item.queueId === q.queueId ? { ...item, displayLabel: val } : item
                            )
                          );
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-zinc-300 rounded-lg text-xs"
                      />
                    </div>

                    {q.status === 'uploading' && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-mono text-zinc-700">
                          <span>Uploading to Firebase Storage...</span>
                          <span>{q.progress}%</span>
                        </div>
                        <div className="w-full h-2 bg-zinc-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#E88D14] transition-all duration-200"
                            style={{ width: `${q.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {q.status === 'error' && q.error && (
                      <p className="text-[11px] text-red-700 font-medium">{q.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Active Website Media Slots */}
      <section className="bg-white border border-zinc-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#D97706]" />
          <h2 className="text-base sm:text-lg font-bold text-zinc-900">
            Website Banner &amp; Category Assignments
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {WEBSITE_MEDIA_SECTIONS.map((sec) => {
            const active = siteMedia[sec.id];
            return (
              <div
                key={sec.id}
                className="p-3 rounded-xl border border-zinc-200 bg-zinc-50 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-zinc-900 truncate">{sec.label}</p>
                  <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                    {active ? (
                      <span className="text-emerald-700 font-semibold">
                        Custom {active.mediaType} active
                      </span>
                    ) : (
                      'Using built-in default'
                    )}
                  </p>
                </div>
                {active && (
                  <button
                    type="button"
                    onClick={() => handleRevertSection(sec.id, sec.label)}
                    title="Revert to built-in default"
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-300 bg-white text-[11px] font-semibold text-zinc-700 hover:border-red-400 hover:text-red-700"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Default</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Searchable Permanent Media Library Grid */}
      <section className="bg-white border border-zinc-200 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">
              Media Library ({filteredAssets.length} of {mediaLibrary.length})
            </h2>
            <p className="text-xs text-zinc-500">
              Permanent Firebase Storage assets synced across desktop and mobile storefronts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search label, file, item..."
                className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-lg text-xs"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | 'image' | 'video')}
              className="px-3 py-2 border border-zinc-300 rounded-lg text-xs bg-white"
            >
              <option value="all">All Types</option>
              <option value="image">Photos Only</option>
              <option value="video">Videos Only</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-zinc-300 rounded-lg text-xs bg-white"
            >
              <option value="all">All Categories</option>
              <option value="food">Food</option>
              <option value="cake">Cake</option>
              <option value="homepage">Homepage</option>
              <option value="promotional">Promotional</option>
              <option value="other">Other</option>
            </select>

            <select
              value={usageFilter}
              onChange={(e) =>
                setUsageFilter(e.target.value as 'all' | 'assigned' | 'unassigned')
              }
              className="px-3 py-2 border border-zinc-300 rounded-lg text-xs bg-white"
            >
              <option value="all">All Usage</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>
        </div>

        {filteredAssets.length === 0 ? (
          <div className="p-10 text-center border border-dashed border-zinc-300 rounded-xl space-y-2">
            <ImageIcon className="w-8 h-8 text-zinc-400 mx-auto" />
            <p className="text-sm font-semibold text-zinc-800">
              {mediaLibrary.length === 0
                ? 'No permanent media uploaded yet.'
                : 'No media items match your current filter.'}
            </p>
            <p className="text-xs text-zinc-500">
              Use the Phone Gallery upload buttons above to permanently upload food photos, cake photos, or videos.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredAssets.map((asset) => {
              const usages = findAssetUsages({ asset, foodMenu, cakeMenu, siteMedia });
              const busyText = busyAssetIds[asset.mediaId];
              const replacePct = replaceProgress[asset.mediaId];
              const isEditing = editingLabelId === asset.mediaId;

              return (
                <div
                  key={asset.mediaId}
                  className="border border-zinc-200 rounded-xl overflow-hidden bg-white flex flex-col justify-between"
                >
                  <div>
                    <div className="relative aspect-[4/3] bg-zinc-900 overflow-hidden">
                      {asset.mediaType === 'video' ? (
                        <MediaVideo
                          src={asset.downloadUrl}
                          title={asset.displayLabel}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FoodImage
                          src={asset.downloadUrl}
                          derivativeSrc={asset.derivativeUrl}
                          alt={asset.displayLabel}
                          className="w-full h-full object-contain"
                        />
                      )}
                      <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                        <span className="px-2 py-0.5 rounded bg-black/80 text-white text-[10px] font-mono uppercase">
                          {asset.fileFormat}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-black/80 text-white text-[10px] font-mono">
                          {formatFileSize(asset.fileSize)}
                        </span>
                        {asset.derivativeUrl && (
                          <span className="px-2 py-0.5 rounded bg-emerald-900/90 text-emerald-200 text-[10px] font-semibold">
                            WebP Optimized
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPreviewAsset(asset)}
                        aria-label={`Preview ${asset.displayLabel}`}
                        title="Preview media"
                        className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded bg-black/80 text-white text-[10px] font-semibold hover:bg-[#E88D14] hover:text-black transition-colors"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Preview</span>
                      </button>
                    </div>

                    <div className="p-4 space-y-3">
                      {/* Label + Rename */}
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            maxLength={120}
                            value={editingLabelValue}
                            onChange={(e) => setEditingLabelValue(e.target.value)}
                            className="flex-1 px-2.5 py-1.5 border border-zinc-300 rounded-lg text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveRename(asset.mediaId)}
                            className="p-1.5 bg-emerald-600 text-white rounded-lg"
                            aria-label="Save label"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingLabelId(null)}
                            className="p-1.5 bg-zinc-100 text-zinc-700 rounded-lg"
                            aria-label="Cancel rename"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-zinc-900 truncate">
                              {asset.displayLabel}
                            </h3>
                            <p className="text-[11px] text-zinc-500 truncate">
                              {asset.originalFilename} · {formatDateTime(asset.createdAt)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingLabelId(asset.mediaId);
                              setEditingLabelValue(asset.displayLabel);
                            }}
                            aria-label={`Rename ${asset.displayLabel}`}
                            className="p-1.5 text-zinc-400 hover:text-zinc-900 shrink-0"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Assignment Status, Active State & Storage Path */}
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 text-[10px] font-semibold uppercase">
                            {asset.mediaCategory}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              asset.active !== false
                                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                                : 'bg-zinc-100 border border-zinc-200 text-zinc-500'
                            }`}
                          >
                            {asset.active !== false ? 'Active' : 'Inactive'}
                          </span>
                          {usages.length > 0 ? (
                            usages.map((u) => (
                              <span
                                key={u}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-semibold"
                              >
                                <CheckCircle2 className="w-3 h-3 text-[#D97706]" />
                                {u}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-zinc-50 border border-zinc-200 text-zinc-500 text-[10px]">
                              Unassigned
                            </span>
                          )}
                        </div>
                        <p
                          className="text-[10px] font-mono text-zinc-500 truncate"
                          title={asset.storagePath}
                        >
                          Path: {asset.storagePath}
                        </p>
                      </div>

                      {/* Assign Control */}
                      <div className="space-y-1.5 pt-1 border-t border-zinc-100">
                        <label className="block text-[11px] font-semibold text-zinc-700">
                          Assign to Dish, Cake, or Section
                        </label>
                        <div className="flex gap-1.5">
                          <select
                            value={assignSelection[asset.mediaId] || ''}
                            onChange={(e) =>
                              setAssignSelection((p) => ({
                                ...p,
                                [asset.mediaId]: e.target.value,
                              }))
                            }
                            className="flex-1 min-w-0 px-2 py-1.5 border border-zinc-300 rounded-lg text-[11px] bg-white"
                          >
                            <option value="">Choose target...</option>
                            <optgroup label="Website Sections">
                              {WEBSITE_MEDIA_SECTIONS.filter(
                                (s) => asset.mediaType === 'image' || s.supportsVideo
                              ).map((s) => (
                                <option key={s.id} value={`section:${s.id}`}>
                                  {s.label}
                                </option>
                              ))}
                            </optgroup>
                            {asset.mediaType === 'image' && (
                              <optgroup label="Food Menu Items">
                                {foodMenu.map((item) => (
                                  <option key={item.id} value={`food:${item.id}`}>
                                    Food: {item.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {asset.mediaType === 'image' && (
                              <optgroup label="Cake Items">
                                {cakeMenu.map((cake) => (
                                  <option key={cake.id} value={`cake:${cake.id}`}>
                                    Cake: {cake.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                          <button
                            type="button"
                            disabled={Boolean(busyText) || !assignSelection[asset.mediaId]}
                            onClick={() => handleAssignAsset(asset)}
                            className="px-2.5 py-1.5 bg-[#0A0A0B] text-white text-[11px] font-semibold rounded-lg hover:bg-[#E88D14] hover:text-black disabled:opacity-40 inline-flex items-center gap-1 shrink-0"
                          >
                            <Link2 className="w-3 h-3" />
                            <span>Assign</span>
                          </button>
                        </div>
                      </div>

                      {typeof replacePct === 'number' && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-zinc-600">
                            <span>Safely replacing media...</span>
                            <span>{replacePct}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#E88D14] transition-all"
                              style={{ width: `${replacePct}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Safe Replace, Active Toggle & Protected Delete Footer */}
                  <div className="px-4 py-2.5 bg-zinc-50 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-zinc-300 rounded-lg text-[11px] font-semibold text-zinc-800 hover:border-[#E88D14] cursor-pointer">
                        <RefreshCw className="w-3 h-3" />
                        <span>{busyText === 'Replacing...' ? 'Replacing...' : 'Replace File'}</span>
                        <input
                          type="file"
                          accept={
                            asset.mediaType === 'video'
                              ? 'video/mp4,video/webm,video/quicktime,video/*'
                              : 'image/jpeg,image/png,image/webp,image/*'
                          }
                          disabled={Boolean(busyText)}
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleReplaceAssetFile(asset, file);
                            }
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={Boolean(busyText)}
                        onClick={() => handleToggleActiveStatus(asset)}
                        title={asset.active !== false ? 'Mark Inactive' : 'Mark Active'}
                        className="inline-flex items-center gap-1 px-2 py-1.5 bg-white border border-zinc-300 rounded-lg text-[11px] font-semibold text-zinc-700 hover:border-zinc-500 disabled:opacity-50"
                      >
                        <Power className="w-3 h-3" />
                        <span>{asset.active !== false ? 'Disable' : 'Enable'}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={Boolean(busyText)}
                      onClick={() => handleDeleteAsset(asset)}
                      title={
                        usages.length > 0
                          ? `In use (${usages.join(', ')})`
                          : 'Delete unused media permanently'
                      }
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                        usages.length > 0
                          ? 'bg-zinc-100 border-zinc-200 text-zinc-400 hover:text-red-700'
                          : 'bg-white border-red-200 text-red-700 hover:bg-red-50'
                      }`}
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{busyText === 'Deleting...' ? 'Deleting...' : 'Delete'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Full Media Preview Lightbox Modal */}
      {previewAsset && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${previewAsset.displayLabel}`}
          onClick={() => setPreviewAsset(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl border border-zinc-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#0A0A0B] text-white px-5 py-3.5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold truncate">
                  {previewAsset.displayLabel}
                </h3>
                <p className="text-[11px] text-zinc-400 truncate">
                  {previewAsset.originalFilename} · {previewAsset.fileFormat} ·{' '}
                  {formatFileSize(previewAsset.fileSize)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewAsset(null)}
                aria-label="Close media preview"
                className="p-1.5 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-[#E88D14] hover:text-black"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-zinc-950 max-h-[60vh] flex items-center justify-center overflow-hidden">
              {previewAsset.mediaType === 'video' ? (
                <MediaVideo
                  src={previewAsset.downloadUrl}
                  title={previewAsset.displayLabel}
                  className="w-full max-h-[60vh] object-contain"
                />
              ) : (
                <img
                  src={previewAsset.downloadUrl}
                  alt={previewAsset.displayLabel}
                  className="max-w-full max-h-[60vh] object-contain"
                />
              )}
            </div>

            <div className="p-4 sm:p-5 bg-zinc-50 border-t border-zinc-200 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <span className="text-zinc-500">Status:</span>{' '}
                <strong className="text-zinc-900">
                  {previewAsset.active !== false ? 'Active' : 'Inactive'}
                </strong>
              </div>
              <div>
                <span className="text-zinc-500">Uploaded:</span>{' '}
                <strong className="text-zinc-900">{formatDateTime(previewAsset.createdAt)}</strong>
              </div>
              <div className="sm:col-span-2">
                <span className="text-zinc-500">Storage Path:</span>{' '}
                <span className="font-mono text-zinc-800 break-all">{previewAsset.storagePath}</span>
              </div>
              {previewAsset.width && previewAsset.height && (
                <div>
                  <span className="text-zinc-500">Dimensions:</span>{' '}
                  <strong className="font-mono text-zinc-900">
                    {previewAsset.width} × {previewAsset.height}px
                  </strong>
                </div>
              )}
              <div>
                <span className="text-zinc-500">Assigned To:</span>{' '}
                <strong className="text-zinc-900">
                  {(() => {
                    const uses = findAssetUsages({
                      asset: previewAsset,
                      foodMenu,
                      cakeMenu,
                      siteMedia,
                    });
                    return uses.length > 0 ? uses.join(', ') : 'Unassigned';
                  })()}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

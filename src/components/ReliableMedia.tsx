import { useEffect, useRef, useState } from 'react';
import { Film, RefreshCw, Utensils } from 'lucide-react';
import { getLocalThumbUrl } from '../data/catalog';

const reportedFailureUrls = new Set<string>();

function reportMediaError(url: string, mediaType: 'image' | 'video', label: string, stage: string) {
  if (!url || reportedFailureUrls.has(`${stage}:${url}`)) return;
  reportedFailureUrls.add(`${stage}:${url}`);
  try {
    fetch('/api/media/report-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ url, mediaType, label, stage }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Non-blocking error telemetry
  }
}

function appendRetryParam(rawUrl: string, attempt: number): string {
  if (attempt <= 0) return rawUrl;
  if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) return rawUrl;
  const sep = rawUrl.includes('?') ? '&' : '?';
  return `${rawUrl}${sep}zkRetry=${attempt}`;
}

export function preloadHeroImage(url: string | undefined) {
  if (!url || typeof document === 'undefined') return;
  try {
    const existing = document.head.querySelector(`link[rel="preload"][href="${CSS.escape(url)}"]`);
    if (!existing) {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = url;
      document.head.appendChild(link);
    }
  } catch {
    // Fallback preload via Image
  }
  const img = new Image();
  img.src = url;
}

export function isUsableMediaUrl(raw?: string): raw is string {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/assets/') ||
    trimmed.startsWith('/src/') ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('data:video/') ||
    trimmed.startsWith('blob:')
  ) {
    return true;
  }
  return /^\/[^/].*\.[a-z0-9]{2,6}(\?.*)?$/i.test(trimmed);
}

export function FoodImage({
  src,
  derivativeSrc,
  fallbackSrc,
  alt,
  className = 'w-full h-full object-contain',
  loading = 'lazy',
  priority = 'normal',
  sizes,
  aspectRatio,
  useThumbnail = true,
}: {
  src?: string;
  derivativeSrc?: string;
  fallbackSrc?: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  priority?: 'high' | 'normal';
  sizes?: string;
  aspectRatio?: string;
  useThumbnail?: boolean;
}) {
  const autoLocalThumb = useThumbnail ? getLocalThumbUrl(src) : undefined;
  const autoFallbackThumb = useThumbnail ? getLocalThumbUrl(fallbackSrc) : undefined;
  const candidates = [derivativeSrc, autoLocalThumb, src, autoFallbackThumb, fallbackSrc].filter(
    (u, idx, arr): u is string => isUsableMediaUrl(u) && arr.indexOf(u) === idx
  );
  const candidateKey = candidates.join('|');

  const [candidateIndex, setCandidateIndex] = useState(0);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const retryTimerRef = useRef<number | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setCandidateIndex(0);
    setRetryAttempt(0);
    setLoaded(false);
    setFailed(false);
    return () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
      }
    };
  }, [candidateKey]);

  const activeBaseUrl = candidates[candidateIndex] || '';
  const activeUrl = activeBaseUrl ? appendRetryParam(activeBaseUrl, retryAttempt) : '';

  const handleImageError = () => {
    setLoaded(false);

    if (retryAttempt < 2) {
      const nextRetry = retryAttempt + 1;
      const delayMs = nextRetry === 1 ? 550 : 1400;
      retryTimerRef.current = window.setTimeout(() => {
        setRetryAttempt(nextRetry);
      }, delayMs);
      return;
    }

    if (candidateIndex + 1 < candidates.length) {
      setCandidateIndex((prev) => prev + 1);
      setRetryAttempt(0);
      return;
    }

    console.error(`[ZAIKORA Media] Image failed to load for "${alt}": ${activeBaseUrl || src || 'missing URL'}`);
    reportMediaError(activeBaseUrl || src || '', 'image', alt, 'load');
    setFailed(true);
  };

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete) {
      if (img.naturalWidth > 0) {
        setLoaded(true);
      } else {
        handleImageError();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUrl]);

  if (!activeUrl || failed) {
    return (
      <div
        className="w-full h-full bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex flex-col items-center justify-center p-4 text-center"
        style={aspectRatio ? { aspectRatio } : undefined}
      >
        <Utensils className="w-7 h-7 text-[#E88D14] mb-2" />
        <span className="text-xs font-medium text-zinc-300 line-clamp-2">{alt}</span>
      </div>
    );
  }

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-zinc-100"
      style={aspectRatio ? { aspectRatio } : undefined}
    >
      {!loaded && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-zinc-200/80 animate-pulse"
        />
      )}
      <img
        ref={imgRef}
        src={activeUrl}
        alt={alt}
        loading={priority === 'high' ? 'eager' : loading}
        decoding="async"
        fetchPriority={priority === 'high' ? 'high' : 'auto'}
        sizes={sizes}
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={handleImageError}
        className={`${className} transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}

export function MediaVideo({
  src,
  title,
  poster,
  className = 'w-full h-full object-cover',
  autoPlayMuted = false,
  controls = true,
}: {
  src?: string;
  title: string;
  poster?: string;
  className?: string;
  autoPlayMuted?: boolean;
  controls?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setReady(false);
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className="w-full h-full min-h-[160px] bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex flex-col items-center justify-center p-4 text-center gap-2">
        <Film className="w-7 h-7 text-[#E88D14]" />
        <p className="text-xs font-medium text-zinc-200 line-clamp-2">{title}</p>
        {src && (
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              setReady(false);
              setReloadKey((k) => k + 1);
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-[11px] font-semibold text-zinc-200 hover:border-[#E88D14]"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry Video</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-zinc-950 overflow-hidden">
      {!ready && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-zinc-900 animate-pulse flex items-center justify-center"
        >
          <Film className="w-6 h-6 text-zinc-600" />
        </div>
      )}
      <video
        key={`${src}-${reloadKey}`}
        src={appendRetryParam(src, reloadKey)}
        poster={poster}
        controls={controls}
        playsInline
        preload="metadata"
        autoPlay={autoPlayMuted}
        muted={autoPlayMuted}
        loop={autoPlayMuted}
        aria-label={title}
        onLoadedData={() => setReady(true)}
        onError={() => {
          reportMediaError(src, 'video', title, 'playback');
          setFailed(true);
        }}
        className={className}
      />
    </div>
  );
}

export function SiteMediaDisplay({
  mediaUrl,
  derivativeUrl,
  mediaType = 'image',
  alt,
  className = 'w-full h-full object-contain',
  priority = 'normal',
}: {
  mediaUrl?: string;
  derivativeUrl?: string;
  mediaType?: 'image' | 'video';
  alt: string;
  className?: string;
  priority?: 'high' | 'normal';
}) {
  if (mediaType === 'video' && mediaUrl) {
    return (
      <MediaVideo
        src={mediaUrl}
        title={alt}
        className={className}
        autoPlayMuted={false}
        controls={true}
      />
    );
  }

  return (
    <FoodImage
      src={mediaUrl}
      derivativeSrc={derivativeUrl}
      alt={alt}
      className={className}
      priority={priority}
      loading={priority === 'high' ? 'eager' : 'lazy'}
    />
  );
}

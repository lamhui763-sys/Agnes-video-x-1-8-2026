/**
 * frameExtractor.ts
 * Extract the last frame of a video for sequential continuous generation.
 * Prefers server /api/extract-last-frame (ffmpeg); falls back to canvas if needed.
 */

import { apiJson } from './apiClient';

/**
 * Extract last frame via server ffmpeg endpoint (most reliable).
 * Returns a public image URL (Catbox or /assets/...).
 */
export async function extractLastFrameFromVideo(videoUrl: string): Promise<string> {
  if (!videoUrl) throw new Error('videoUrl is required');

  try {
    const data = await apiJson<{ imageUrl?: string; error?: string }>(
      '/api/extract-last-frame',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl }),
      },
      { timeoutMs: 90000, retries: 1, label: 'ExtractLastFrame' }
    );
    if (data?.imageUrl) return data.imageUrl;
    throw new Error(data?.error || 'No imageUrl returned');
  } catch (serverErr: any) {
    console.warn('[frameExtractor] Server extract failed, trying canvas fallback:', serverErr?.message);
    return extractLastFrameViaCanvas(videoUrl);
  }
}

/**
 * Browser canvas fallback — seek near end and capture one frame.
 * May hit CORS on some CDNs; server path is preferred.
 */
export function extractLastFrameViaCanvas(videoUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    // Prefer proxy to avoid CORS
    const src =
      videoUrl.startsWith('http') || videoUrl.startsWith('/assets/')
        ? `/api/video-proxy?url=${encodeURIComponent(videoUrl)}`
        : videoUrl;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Video failed to load for frame extraction'));
    };

    video.onloadedmetadata = () => {
      // Seek slightly before end
      const t = Math.max(0, (video.duration || 1) - 0.08);
      video.currentTime = t;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          reject(new Error('Canvas 2d context unavailable'));
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        cleanup();

        // Upload base64 to server to get durable URL
        uploadDataUrlAsImage(dataUrl)
          .then(resolve)
          .catch(() => resolve(dataUrl)); // keep data URL if upload fails
      } catch (e: any) {
        cleanup();
        reject(e);
      }
    };

    video.src = src;
  });
}

async function uploadDataUrlAsImage(dataUrl: string): Promise<string> {
  const data = await apiJson<{ imageUrl?: string }>(
    '/api/upload-image',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Data: dataUrl }),
    },
    { timeoutMs: 30000, retries: 1, label: 'UploadFrame' }
  );
  if (!data?.imageUrl) throw new Error('Upload returned no URL');
  return data.imageUrl;
}

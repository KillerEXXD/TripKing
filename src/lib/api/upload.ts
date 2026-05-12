/**
 * Direct-to-Storage upload helpers. The edge functions mint a short-lived signed PUT URL
 * (`POST /drivers|agents/:id/kyc-doc-upload-url`, `POST /vehicles/:id/photo-upload-url`); the
 * browser compresses the chosen image, PUTs it straight to Supabase Storage, then tells the API
 * the resulting object path (which gets stored on the row). Nothing here touches the Supabase
 * client — just `fetch` + canvas. No business logic.
 */

/** Upload a blob to a Supabase Storage signed-upload URL. Throws on non-2xx. */
export async function uploadToSignedUrl(signedUrl: string, blob: Blob): Promise<void> {
  const res = await fetch(signedUrl, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': blob.type || 'application/octet-stream', 'x-upsert': 'true' },
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(`Storage upload failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
}

/**
 * Resize a chosen image so its longest edge ≤ `maxDim`px and re-encode it as JPEG at `quality`
 * (keeps phone-camera photos well under ~1.5 MB). Non-image files (e.g. application/pdf) and any
 * case where the re-encode didn't shrink it are returned unchanged.
 */
export async function compressImageFile(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  let url: string | null = null;
  try {
    url = URL.createObjectURL(file);
    const img = await loadImage(url);
    const longest = Math.max(img.naturalWidth, img.naturalHeight) || 1;
    const scale = Math.min(1, maxDim / longest);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = src;
  });
}

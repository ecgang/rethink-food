// Client-side photo downscaling for the field app. Browser-only (uses
// createImageBitmap + canvas) — import only from client components.

/**
 * Downscale a captured photo to a small JPEG before upload — field connections
 * are slow and a raw camera frame can be several MB. Keeps the longest edge at
 * 1280px and re-encodes at q0.7 (typically 150–300 KB). Falls back to the
 * original file if the canvas isn't available.
 */
export async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const maxEdge = 1280;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.7),
  );
  return blob ?? file;
}

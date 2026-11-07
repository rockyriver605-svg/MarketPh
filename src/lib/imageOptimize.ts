const MAX_WIDTH = 1600;
const MAX_HEIGHT = 1600;
const QUALITY = 0.82;

export interface OptimizedImage {
  blob: Blob;
  width: number;
  height: number;
}

export async function optimizeImage(file: File): Promise<OptimizedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File is not an image.');
  }

  const bitmap = await loadImage(file);
  let { width, height } = bitmap;

  const scale = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height, 1);
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported.');
  ctx.drawImage(bitmap, 0, 0, width, height);

  const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Compression failed.'))),
      outType,
      outType === 'image/jpeg' ? QUALITY : undefined,
    );
  });

  return { blob, width, height };
}

export async function generateThumbnail(file: File, size = 300): Promise<Blob> {
  const bitmap = await loadImage(file);
  const scale = Math.min(size / bitmap.width, size / bitmap.height, 1);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Thumbnail failed.'))),
      'image/jpeg',
      0.7,
    );
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image.')); };
    img.src = url;
  });
}

export function extractStoragePath(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/product-images/');
    if (parts.length < 2) return null;
    return decodeURIComponent(parts[1]);
  } catch {
    return null;
  }
}

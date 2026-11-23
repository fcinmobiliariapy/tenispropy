import imageCompression from 'browser-image-compression';

const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|webp|gif|avif|bmp|svg|heic|heif)$/i;
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};

const CLOUDINARY_CLOUD_NAME = (env.VITE_CLOUDINARY_CLOUD_NAME || '').trim();
const CLOUDINARY_UPLOAD_PRESET = (env.VITE_CLOUDINARY_UPLOAD_PRESET || '').trim();
const CLOUDINARY_BASE_FOLDER = (env.VITE_CLOUDINARY_FOLDER || 'playpy').trim() || 'playpy';

let cachedR2Configured: boolean | null = null;

export function isCloudImageStorageConfigured(): boolean {
  return Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET) || cachedR2Configured === true;
}

/**
 * Aplica transformaciones automáticas de Cloudinary (WebP/AVIF, calidad automática y recorte máximo)
 * sin tocar URLs locales, DataURLs ni rutas externas ajenas a Cloudinary.
 */
export function getOptimizedImageUrl(url: string, width?: number): string {
  const cleaned = String(url || '').trim();
  if (!cleaned) return '';
  if (
    cleaned.startsWith('https://res.cloudinary.com/') &&
    cleaned.includes('/image/upload/') &&
    !cleaned.includes('/image/upload/f_auto')
  ) {
    const transform = width
      ? `f_auto,q_auto,c_limit,w_${Math.round(width)}`
      : 'f_auto,q_auto';
    return cleaned.replace('/image/upload/', `/image/upload/${transform}/`);
  }
  return cleaned;
}

function isAcceptableImageFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  if (!mime && ACCEPTED_EXTENSIONS.test(file.name)) return true;
  return ACCEPTED_EXTENSIONS.test(file.name);
}

function loadImageFromSrc(src: string, fileName: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if ((img.naturalWidth || img.width) <= 0 || (img.naturalHeight || img.height) <= 0) {
        reject(new Error(`La imagen "${fileName}" está vacía o dañada.`));
        return;
      }
      resolve(img);
    };
    img.onerror = () => {
      reject(new Error(`No se pudo decodificar la imagen "${fileName}". Probá con JPG, PNG o WebP.`));
    };
    img.src = src;
  });
}

function readFileAsDataUrl(file: Blob, name = 'imagen'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error(`No se pudo leer el archivo "${name}".`));
      }
    };
    reader.onerror = () => reject(new Error(`No se pudo leer el archivo "${name}".`));
    reader.readAsDataURL(file);
  });
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await loadImageFromSrc(objectUrl, file.name);
  } catch {
    const dataUrl = await readFileAsDataUrl(file, file.name);
    return await loadImageFromSrc(dataUrl, file.name);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function renderToDataUrl(
  img: HTMLImageElement,
  maxWidth: number,
  quality: number,
  fillWhiteOnJpeg = true
): string {
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  const scale = naturalW > maxWidth ? maxWidth / naturalW : 1;
  const width = Math.max(1, Math.round(naturalW * scale));
  const height = Math.max(1, Math.round(naturalH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible para optimizar la imagen.');

  ctx.drawImage(img, 0, 0, width, height);
  const webp = canvas.toDataURL('image/webp', quality);
  if (webp.startsWith('data:image/webp') && webp.length > 32) {
    return webp;
  }

  if (fillWhiteOnJpeg) {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  }
  const jpeg = canvas.toDataURL('image/jpeg', quality);
  if (!jpeg.startsWith('data:image/jpeg') || jpeg.length <= 32) {
    throw new Error('No se pudo generar la imagen optimizada en el navegador.');
  }
  return jpeg;
}

function fitDataUrlWithinLimit(img: HTMLImageElement, maxChars: number): string {
  const attempts: Array<{ width: number; quality: number }> = [
    { width: 1280, quality: 0.82 },
    { width: 1080, quality: 0.76 },
    { width: 920, quality: 0.72 },
    { width: 760, quality: 0.65 },
    { width: 600, quality: 0.58 },
    { width: 480, quality: 0.52 },
    { width: 380, quality: 0.45 },
    { width: 300, quality: 0.38 },
    { width: 240, quality: 0.34 },
  ];
  let last = '';
  for (const step of attempts) {
    last = renderToDataUrl(img, step.width, step.quality);
    if (last.length <= maxChars) return last;
  }
  return last;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/**
 * Comprime cualquier imagen en el cliente usando `browser-image-compression`
 * y la convierte a formato WebP con resolución máxima acotada antes de subirla.
 */
async function compressToWebpBlob(
  file: File,
  options: { maxSizeMB: number; maxWidthOrHeight: number; initialQuality: number }
): Promise<Blob> {
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: options.maxSizeMB,
      maxWidthOrHeight: options.maxWidthOrHeight,
      useWebWorker: true,
      fileType: 'image/webp',
      initialQuality: options.initialQuality,
    });
    if (compressed && compressed.size > 0) {
      return compressed;
    }
  } catch {
    // Fallback a Canvas cuando el navegador o tipo de archivo no admite worker
  }

  const img = await loadImageFromFile(file);
  const fallbackDataUrl = renderToDataUrl(img, options.maxWidthOrHeight, options.initialQuality);
  return dataUrlToBlob(fallbackDataUrl);
}

async function uploadToCloudinary(
  blob: Blob,
  folder: 'photos' | 'avatars' | 'banners',
  baseName: string,
  thumbWidth: number
): Promise<{ thumbUrl: string; fullUrl: string }> {
  const formData = new FormData();
  const safeName = `${baseName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'playpy'}.webp`;
  formData.append('file', blob, safeName);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', `${CLOUDINARY_BASE_FOLDER}/${folder}`);

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(
    CLOUDINARY_CLOUD_NAME
  )}/image/upload`;
  const res = await fetch(endpoint, { method: 'POST', body: formData });
  const data = (await res.json().catch(() => ({}))) as {
    secure_url?: string;
    error?: { message?: string };
  };

  if (!res.ok || !data.secure_url) {
    throw new Error(
      data.error?.message || `Cloudinary rechazó la subida (${res.status}). Verificá tu Upload Preset.`
    );
  }

  return {
    fullUrl: getOptimizedImageUrl(data.secure_url),
    thumbUrl: getOptimizedImageUrl(data.secure_url, thumbWidth),
  };
}

async function checkServerR2Configured(): Promise<boolean> {
  if (cachedR2Configured !== null) return cachedR2Configured;
  try {
    const res = await fetch('/api/uploads/storage-info');
    if (!res.ok) {
      cachedR2Configured = false;
      return false;
    }
    const data = (await res.json()) as { r2Configured?: boolean };
    cachedR2Configured = Boolean(data.r2Configured);
    return cachedR2Configured;
  } catch {
    cachedR2Configured = false;
    return false;
  }
}

async function uploadBlobToR2(
  blob: Blob,
  folder: 'photos' | 'avatars' | 'banners',
  baseName: string
): Promise<string> {
  const contentType = blob.type || 'image/webp';
  const presignRes = await fetch('/api/uploads/presign-r2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      folder,
      filename: `${baseName}.webp`,
      contentType,
    }),
  });
  const presignData = (await presignRes.json().catch(() => ({}))) as {
    uploadUrl?: string;
    publicUrl?: string;
    error?: string;
  };
  if (!presignRes.ok || !presignData.uploadUrl || !presignData.publicUrl) {
    throw new Error(presignData.error || 'No se pudo obtener la URL firmada de Cloudflare R2.');
  }

  const putRes = await fetch(presignData.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!putRes.ok) {
    throw new Error(`Error al subir la imagen a Cloudflare R2 (${putRes.status}).`);
  }
  return presignData.publicUrl;
}

async function postUploadLocalFallback(payload: {
  baseName: string;
  thumbDataUrl: string;
  fullDataUrl: string;
}): Promise<{ thumbUrl: string; fullUrl: string }> {
  const response = await fetch('/api/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    if (contentType.includes('application/json')) {
      const err = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Error ${response.status} al subir la imagen.`);
    }
    throw new Error(`El servidor respondió ${response.status} al subir la imagen.`);
  }

  if (!contentType.includes('application/json')) {
    throw new Error('El servidor no devolvió una respuesta válida al subir la imagen.');
  }

  const data = (await response.json()) as { thumbUrl?: string; fullUrl?: string };
  if (!data.thumbUrl || !data.fullUrl) {
    throw new Error('La respuesta de carga no incluyó la ruta de la imagen.');
  }
  return { thumbUrl: data.thumbUrl, fullUrl: data.fullUrl };
}

async function uploadOptimizedPair(params: {
  file: File;
  folder: 'photos' | 'avatars' | 'banners';
  baseName: string;
  thumbBlob: Blob;
  fullBlob: Blob;
  thumbWidth: number;
}): Promise<{ thumbUrl: string; fullUrl: string }> {
  const { folder, baseName, thumbBlob, fullBlob, thumbWidth } = params;

  // 1. Cloudinary Free Tier directo desde cliente ($0 egress en Vercel / Firebase)
  if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET) {
    return uploadToCloudinary(fullBlob, folder, baseName, thumbWidth);
  }

  // 2. Cloudflare R2 vía URL firmada S3v4 ($0 egress)
  if (await checkServerR2Configured()) {
    const [thumbUrl, fullUrl] = await Promise.all([
      uploadBlobToR2(thumbBlob, folder, `${baseName}_thumb`),
      uploadBlobToR2(fullBlob, folder, `${baseName}_full`),
    ]);
    return { thumbUrl, fullUrl };
  }

  // 3. Fallback local de desarrollo en Express (/api/uploads) con WebP comprimido
  const [thumbDataUrl, fullDataUrl] = await Promise.all([
    readFileAsDataUrl(thumbBlob, `${baseName}_thumb.webp`),
    readFileAsDataUrl(fullBlob, `${baseName}_full.webp`),
  ]);

  return postUploadLocalFallback({
    baseName,
    thumbDataUrl,
    fullDataUrl,
  });
}

export async function compressImageDataUrl(dataUrl: string, maxChars = 220000): Promise<string> {
  if (dataUrl.length <= maxChars) return dataUrl;
  const img = await loadImageFromSrc(dataUrl, 'imagen');
  const compressed = fitDataUrlWithinLimit(img, maxChars);
  if (compressed.length > maxChars) {
    throw new Error(
      'La imagen es demasiado pesada para guardarse directamente. Probá subir una más liviana o usar un enlace externo.'
    );
  }
  return compressed;
}

export async function optimizeAndUploadPhoto(
  file: File
): Promise<{ thumbUrl: string; fullUrl: string }> {
  if (!isAcceptableImageFile(file)) {
    throw new Error(`Formato no admitido (${file.name}). Usá JPG, PNG, WebP o GIF.`);
  }

  const baseName = file.name.replace(/\.[^.]+$/, '');
  const [thumbBlob, fullBlob] = await Promise.all([
    compressToWebpBlob(file, { maxSizeMB: 0.12, maxWidthOrHeight: 420, initialQuality: 0.78 }),
    compressToWebpBlob(file, { maxSizeMB: 0.55, maxWidthOrHeight: 1440, initialQuality: 0.84 }),
  ]);

  return uploadOptimizedPair({
    file,
    folder: 'photos',
    baseName,
    thumbBlob,
    fullBlob,
    thumbWidth: 420,
  });
}

function resizeSquareAvatarDataUrl(img: HTMLImageElement, size: number, quality: number): string {
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  const minSide = Math.min(naturalW, naturalH);
  const sx = Math.max(0, Math.round((naturalW - minSide) / 2));
  const sy = Math.max(0, Math.round((naturalH - minSide) / 2));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible para procesar la foto del jugador.');
  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
  const webp = canvas.toDataURL('image/webp', quality);
  if (webp.startsWith('data:image/webp') && webp.length > 32) {
    return webp;
  }
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  return canvas.toDataURL('image/jpeg', quality);
}

export async function optimizeAndUploadAvatar(file: File): Promise<string> {
  if (!isAcceptableImageFile(file)) {
    throw new Error(`Formato no admitido (${file.name}). Usá JPG, PNG, WebP o GIF.`);
  }

  const img = await loadImageFromFile(file);
  const [thumbBlob, fullBlob] = await Promise.all([
    dataUrlToBlob(resizeSquareAvatarDataUrl(img, 192, 0.82)),
    dataUrlToBlob(resizeSquareAvatarDataUrl(img, 420, 0.86)),
  ]);

  const data = await uploadOptimizedPair({
    file,
    folder: 'avatars',
    baseName: `avatar_${file.name.replace(/\.[^.]+$/, '')}`,
    thumbBlob,
    fullBlob,
    thumbWidth: 192,
  });
  return data.fullUrl;
}

export async function optimizeAndUploadAdBanner(file: File): Promise<string> {
  if (!isAcceptableImageFile(file)) {
    throw new Error(`Formato no admitido (${file.name}). Usá JPG, PNG, WebP o GIF.`);
  }

  const baseName = `sponsor_${file.name.replace(/\.[^.]+$/, '')}`;
  const [thumbBlob, fullBlob] = await Promise.all([
    compressToWebpBlob(file, { maxSizeMB: 0.14, maxWidthOrHeight: 480, initialQuality: 0.8 }),
    compressToWebpBlob(file, { maxSizeMB: 0.5, maxWidthOrHeight: 1280, initialQuality: 0.84 }),
  ]);

  try {
    const data = await uploadOptimizedPair({
      file,
      folder: 'banners',
      baseName,
      thumbBlob,
      fullBlob,
      thumbWidth: 480,
    });
    return data.fullUrl;
  } catch {
    // Fallback resiliente si ningún endpoint de archivos está disponible (p.ej. preview estático)
    const img = await loadImageFromFile(file);
    const compact = fitDataUrlWithinLimit(img, 180000);
    if (compact.length > 260000) {
      throw new Error(
        'No se pudo subir la imagen al almacenamiento y el archivo comprimido supera el límite. Configurá Cloudinary o pegá una URL.'
      );
    }
    return compact;
  }
}

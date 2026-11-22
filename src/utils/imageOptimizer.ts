const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|webp|gif|avif|bmp|svg|heic|heif)$/i;

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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error(`No se pudo leer el archivo "${file.name}".`));
      }
    };
    reader.onerror = () => reject(new Error(`No se pudo leer el archivo "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await loadImageFromSrc(objectUrl, file.name);
  } catch {
    const dataUrl = await readFileAsDataUrl(file);
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

async function postUpload(payload: {
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

export async function compressImageDataUrl(dataUrl: string, maxChars = 220000): Promise<string> {
  if (dataUrl.length <= maxChars) return dataUrl;
  const img = await loadImageFromSrc(dataUrl, 'imagen');
  const compressed = fitDataUrlWithinLimit(img, maxChars);
  if (compressed.length > maxChars) {
    throw new Error('La imagen es demasiado pesada para guardarse directamente. Probá subir una más liviana o usar un enlace externo.');
  }
  return compressed;
}

export async function optimizeAndUploadPhoto(
  file: File
): Promise<{ thumbUrl: string; fullUrl: string }> {
  if (!isAcceptableImageFile(file)) {
    throw new Error(`Formato no admitido (${file.name}). Usá JPG, PNG, WebP o GIF.`);
  }

  const img = await loadImageFromFile(file);
  const thumbDataUrl = renderToDataUrl(img, 420, 0.78);
  const fullDataUrl = renderToDataUrl(img, 1440, 0.85);

  return postUpload({
    baseName: file.name.replace(/\.[^.]+$/, ''),
    thumbDataUrl,
    fullDataUrl,
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
  const thumbDataUrl = resizeSquareAvatarDataUrl(img, 192, 0.82);
  const fullDataUrl = resizeSquareAvatarDataUrl(img, 420, 0.86);

  const data = await postUpload({
    baseName: `avatar_${file.name.replace(/\.[^.]+$/, '')}`,
    thumbDataUrl,
    fullDataUrl,
  });
  return data.fullUrl;
}

export async function optimizeAndUploadAdBanner(file: File): Promise<string> {
  if (!isAcceptableImageFile(file)) {
    throw new Error(`Formato no admitido (${file.name}). Usá JPG, PNG, WebP o GIF.`);
  }

  const img = await loadImageFromFile(file);
  const thumbDataUrl = renderToDataUrl(img, 480, 0.8);
  const fullDataUrl = renderToDataUrl(img, 1280, 0.84);

  try {
    const data = await postUpload({
      baseName: `sponsor_${file.name.replace(/\.[^.]+$/, '')}`,
      thumbDataUrl,
      fullDataUrl,
    });
    return data.fullUrl;
  } catch {
    // Fallback resiliente si el endpoint de archivos no está disponible (p.ej. preview estático)
    const compact = fitDataUrlWithinLimit(img, 180000);
    if (compact.length > 260000) {
      throw new Error(
        'No se pudo subir la imagen al servidor y el archivo comprimido supera el límite. Probá con una imagen más liviana o pegá una URL.'
      );
    }
    return compact;
  }
}

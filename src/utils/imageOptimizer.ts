const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`No se pudo leer la imagen "${file.name}".`));
    };
    img.src = url;
  });
}

function resizeToWebPDataUrl(img: HTMLImageElement, maxWidth: number, quality: number): string {
  const scale = img.width > maxWidth ? maxWidth / img.width : 1;
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible para optimizar la imagen.');
  ctx.drawImage(img, 0, 0, width, height);
  const webp = canvas.toDataURL('image/webp', quality);
  if (webp.startsWith('data:image/webp')) {
    return webp;
  }
  return canvas.toDataURL('image/jpeg', quality);
}

export async function optimizeAndUploadPhoto(
  file: File
): Promise<{ thumbUrl: string; fullUrl: string }> {
  if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    throw new Error(`Formato no admitido (${file.name}). Usá JPG, PNG o WebP.`);
  }

  const img = await loadImageFromFile(file);
  const thumbDataUrl = resizeToWebPDataUrl(img, 420, 0.78);
  const fullDataUrl = resizeToWebPDataUrl(img, 1440, 0.85);

  const response = await fetch('/api/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseName: file.name.replace(/\.[^.]+$/, ''),
      thumbDataUrl,
      fullDataUrl,
    }),
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Error al subir la fotografía.');
  }

  return response.json() as Promise<{ thumbUrl: string; fullUrl: string }>;
}

function resizeSquareAvatarDataUrl(img: HTMLImageElement, size: number, quality: number): string {
  const minSide = Math.min(img.width, img.height);
  const sx = Math.max(0, Math.round((img.width - minSide) / 2));
  const sy = Math.max(0, Math.round((img.height - minSide) / 2));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible para procesar la foto del jugador.');
  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
  const webp = canvas.toDataURL('image/webp', quality);
  if (webp.startsWith('data:image/webp')) {
    return webp;
  }
  return canvas.toDataURL('image/jpeg', quality);
}

export async function optimizeAndUploadAvatar(file: File): Promise<string> {
  if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    throw new Error(`Formato no admitido (${file.name}). Usá JPG, PNG o WebP.`);
  }

  const img = await loadImageFromFile(file);
  const thumbDataUrl = resizeSquareAvatarDataUrl(img, 192, 0.82);
  const fullDataUrl = resizeSquareAvatarDataUrl(img, 420, 0.86);

  const response = await fetch('/api/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseName: `avatar_${file.name.replace(/\.[^.]+$/, '')}`,
      thumbDataUrl,
      fullDataUrl,
    }),
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Error al subir la foto del jugador.');
  }

  const data = (await response.json()) as { thumbUrl: string; fullUrl: string };
  return data.fullUrl;
}

export async function optimizeAndUploadAdBanner(file: File): Promise<string> {
  if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    throw new Error(`Formato no admitido (${file.name}). Usá JPG, PNG o WebP.`);
  }

  const img = await loadImageFromFile(file);
  const thumbDataUrl = resizeToWebPDataUrl(img, 480, 0.8);
  const fullDataUrl = resizeToWebPDataUrl(img, 1280, 0.86);

  const response = await fetch('/api/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseName: `sponsor_${file.name.replace(/\.[^.]+$/, '')}`,
      thumbDataUrl,
      fullDataUrl,
    }),
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Error al subir la imagen publicitaria.');
  }

  const data = (await response.json()) as { thumbUrl: string; fullUrl: string };
  return data.fullUrl;
}



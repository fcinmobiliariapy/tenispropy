import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { getOptimizedImageUrl } from '../utils/imageOptimizer';

interface OptimizedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null;
  alt: string;
  width: number;
  height: number;
  /** Ancho máximo solicitado a Cloudinary/CDN para ahorrar ancho de banda */
  transformWidth?: number;
  /** Si true, carga de forma inmediata (LCP / above the fold). Por defecto lazy. */
  priority?: boolean;
  fallback?: React.ReactNode;
}

/**
 * Imagen optimizada anti-CLS:
 * - Incluye width/height explícitos para evitar saltos visuales (CLS).
 * - Aplica loading="lazy" y decoding="async" por defecto.
 * - Transforma URLs de Cloudinary a WebP/AVIF y ancho exacto automáticamente.
 * - Renderiza fallback elegante si la carga falla o el src es inválido.
 */
export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  width,
  height,
  transformWidth,
  priority = false,
  fallback,
  className = '',
  onError,
  ...rest
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const trimmed = (src || '').trim();
  if (!trimmed || failed) {
    if (fallback) return <>{fallback}</>;
    return (
      <div
        role="img"
        aria-label={alt || 'Imagen no disponible'}
        className={`flex items-center justify-center bg-slate-100 text-slate-400 ${className}`}
      >
        <ImageOff className="w-5 h-5" />
      </div>
    );
  }

  const resolvedSrc = getOptimizedImageUrl(trimmed, transformWidth);

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      fetchPriority={priority ? 'high' : undefined}
      referrerPolicy="no-referrer"
      onError={(e) => {
        setFailed(true);
        onError?.(e);
      }}
      className={className}
      {...rest}
    />
  );
};

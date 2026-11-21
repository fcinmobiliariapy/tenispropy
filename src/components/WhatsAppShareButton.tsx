import React, { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { getWhatsAppShareUrl } from '../utils/whatsappShare';

interface WhatsAppShareButtonProps {
  message: string;
  label?: string;
  compact?: boolean;
  showCopy?: boolean;
  className?: string;
  title?: string;
}

export const WhatsAppShareButton: React.FC<WhatsAppShareButtonProps> = ({
  message,
  label = 'WhatsApp',
  compact = false,
  showCopy = false,
  className = '',
  title = 'Compartir por WhatsApp',
}) => {
  const [copied, setCopied] = useState(false);
  const waUrl = getWhatsAppShareUrl(message);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked in restricted context
    }
  };

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#16A34A]/30 bg-[#ECFDF5] text-[#15803D] hover:bg-[#D1FAE5] font-semibold transition-colors whitespace-nowrap shrink-0 ${
          compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs min-h-[34px]'
        }`}
      >
        <Share2 className={compact ? 'w-3 h-3 shrink-0' : 'w-3.5 h-3.5 shrink-0'} />
        <span>{label}</span>
      </a>

      {showCopy && (
        <button
          type="button"
          onClick={handleCopy}
          title="Copiar resumen del partido"
          className={`inline-flex items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#475569] hover:text-[#0A1633] hover:bg-[#F8FAFC] transition-colors shrink-0 ${
            compact ? 'p-1' : 'px-2 py-1.5 text-xs min-h-[34px]'
          }`}
        >
          {copied ? (
            <Check className={compact ? 'w-3 h-3 text-[#15803D]' : 'w-3.5 h-3.5 text-[#15803D]'} />
          ) : (
            <Copy className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          )}
        </button>
      )}
    </span>
  );
};

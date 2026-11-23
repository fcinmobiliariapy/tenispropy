import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, ExternalLink, QrCode, X } from 'lucide-react';
import { Division, Tournament } from '../types/tennis';
import { PublicTab } from './TopBarAndPWA';
import { buildTournamentDirectUrl } from '../utils/tournamentLinks';
import { buildTournamentWhatsAppMessage } from '../utils/whatsappShare';
import { WhatsAppShareButton } from './WhatsAppShareButton';

interface TournamentQrModalProps {
  open: boolean;
  onClose: () => void;
  tournament: Tournament | null;
  divisions?: Division[];
  defaultDivisionId?: string;
  logoUrl?: string;
}

const TAB_LABELS: Array<{ id: PublicTab; label: string }> = [
  { id: 'resumen', label: 'Portada del torneo' },
  { id: 'fixture', label: 'Fixture y cruces' },
  { id: 'jornadas', label: 'Jornadas y fotos' },
  { id: 'jugadores', label: 'Jugadores y ranking' },
];

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export const TournamentQrModal: React.FC<TournamentQrModalProps> = ({
  open,
  onClose,
  tournament,
  divisions = [],
  defaultDivisionId = '',
  logoUrl,
}) => {
  const [targetTab, setTargetTab] = useState<PublicTab>('resumen');
  const [targetDivisionId, setTargetDivisionId] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [downloadingCard, setDownloadingCard] = useState(false);

  const tournamentDivisions = useMemo(
    () =>
      tournament
        ? divisions.filter((d) => d.tournamentId === tournament.id)
        : [],
    [divisions, tournament]
  );

  useEffect(() => {
    if (open) {
      setTargetTab('resumen');
      setTargetDivisionId(defaultDivisionId || '');
      setCopied(false);
    }
  }, [open, tournament?.id, defaultDivisionId]);

  const directUrl = useMemo(() => {
    if (!tournament) return '';
    return buildTournamentDirectUrl(tournament.id, {
      divisionId: targetDivisionId || undefined,
      tab: targetTab,
    });
  }, [tournament, targetDivisionId, targetTab]);

  const selectedDivision = useMemo(
    () => tournamentDivisions.find((d) => d.id === targetDivisionId) || null,
    [tournamentDivisions, targetDivisionId]
  );

  useEffect(() => {
    let cancelled = false;
    if (!open || !directUrl) return;
    QRCode.toDataURL(directUrl, {
      width: 560,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0A1633',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });

    return () => {
      cancelled = true;
    };
  }, [open, directUrl]);

  if (!open || !tournament) return null;

  const handleCopyUrl = async () => {
    if (!directUrl) return;
    try {
      await navigator.clipboard.writeText(directUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  const triggerDownload = (dataUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadQrOnly = () => {
    if (!qrDataUrl) return;
    triggerDownload(qrDataUrl, `playpy-qr-${tournament.id}.png`);
  };

  const handleDownloadBrandedCard = async () => {
    if (!qrDataUrl) return;
    setDownloadingCard(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 960;
      canvas.height = 1220;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const grad = ctx.createLinearGradient(0, 0, 960, 1220);
      grad.addColorStop(0, '#0A1633');
      grad.addColorStop(1, '#2B104A');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 960, 1220);

      // Barra superior PlayPy
      const topBar = ctx.createLinearGradient(0, 0, 960, 0);
      topBar.addColorStop(0, '#7C1FA2');
      topBar.addColorStop(0.55, '#0284C7');
      topBar.addColorStop(1, '#38BDF8');
      ctx.fillStyle = topBar;
      ctx.fillRect(0, 0, 960, 14);

      // Tarjeta blanca central
      ctx.fillStyle = '#FFFFFF';
      drawRoundedRect(ctx, 72, 64, 816, 1092, 36);
      ctx.fill();

      // Header oscuro interno
      ctx.fillStyle = '#0A1633';
      drawRoundedRect(ctx, 72, 64, 816, 232, 36);
      ctx.fill();
      ctx.fillRect(72, 236, 816, 60);

      const logo = logoUrl ? await loadImg(logoUrl) : null;
      let textX = 124;
      if (logo) {
        ctx.fillStyle = '#FFFFFF';
        drawRoundedRect(ctx, 114, 116, 112, 112, 22);
        ctx.fill();
        ctx.drawImage(logo, 122, 124, 96, 96);
        textX = 250;
      }

      ctx.fillStyle = '#38BDF8';
      ctx.font = '700 22px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.fillText('PLAYPY · ACCESO DIRECTO A COMPETENCIA', textX, 146);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 36px system-ui, -apple-system, Segoe UI, sans-serif';
      const maxTitleW = 840 - textX;
      let titleText = tournament.name;
      while (titleText.length > 3 && ctx.measureText(titleText).width > maxTitleW) {
        titleText = `${titleText.slice(0, -2)}…`;
      }
      ctx.fillText(titleText, textX, 200);

      ctx.fillStyle = '#CBD5E1';
      ctx.font = '500 21px system-ui, -apple-system, Segoe UI, sans-serif';
      const subText = `${tournament.venue} · ${tournament.city} · ${tournament.startDate} al ${tournament.endDate}`;
      let fitSub = subText;
      while (fitSub.length > 3 && ctx.measureText(fitSub).width > maxTitleW) {
        fitSub = `${fitSub.slice(0, -2)}…`;
      }
      ctx.fillText(fitSub, textX, 244);

      // Badge destino
      const tabLabel = TAB_LABELS.find((t) => t.id === targetTab)?.label || 'Portada del torneo';
      const destinationLine = selectedDivision
        ? `${selectedDivision.name} · ${tabLabel}`
        : tabLabel;

      ctx.fillStyle = '#F3E8FF';
      drawRoundedRect(ctx, 160, 336, 640, 52, 16);
      ctx.fill();
      ctx.fillStyle = '#6B21A8';
      ctx.font = '700 22px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(destinationLine, 480, 370);

      // Marco QR
      const qrImg = await loadImg(qrDataUrl);
      ctx.fillStyle = '#F8FAFC';
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 3;
      drawRoundedRect(ctx, 210, 424, 540, 540, 28);
      ctx.fill();
      ctx.stroke();

      if (qrImg) {
        ctx.drawImage(qrImg, 234, 448, 492, 492);
      }

      ctx.fillStyle = '#0A1633';
      ctx.font = '700 24px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.fillText('Escaneá el código QR con la cámara de tu celular', 480, 1020);

      ctx.fillStyle = '#475569';
      ctx.font = '500 18px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.fillText('Consultá fixture, horarios, posiciones, premios y marcadores en vivo', 480, 1054);

      ctx.fillStyle = '#0284C7';
      ctx.font = '600 16px ui-monospace, SFMono-Regular, Menlo, monospace';
      let fitUrl = directUrl;
      while (fitUrl.length > 8 && ctx.measureText(fitUrl).width > 740) {
        fitUrl = `${fitUrl.slice(0, -4)}…`;
      }
      ctx.fillText(fitUrl, 480, 1106);
      ctx.textAlign = 'left';

      triggerDownload(canvas.toDataURL('image/png'), `playpy-tarjeta-qr-${tournament.id}.png`);
    } finally {
      setDownloadingCard(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0A1633]/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#7C1FA2] text-white flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#7C1FA2]">
                Acceso directo a competencia
              </p>
              <h2 className="text-base font-bold text-[#0A1633] truncate">{tournament.name}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="w-9 h-9 rounded-lg border border-[#E2E8F0] bg-white text-[#475569] hover:text-[#0A1633] flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Sección de apertura
              </label>
              <select
                value={targetTab}
                onChange={(e) => setTargetTab(e.target.value as PublicTab)}
                className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633]"
              >
                {TAB_LABELS.map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    {tab.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                División inicial (opcional)
              </label>
              <select
                value={targetDivisionId}
                onChange={(e) => setTargetDivisionId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633]"
              >
                <option value="">Portada general del torneo</option>
                {tournamentDivisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
            <div className="sm:col-span-5 flex flex-col items-center">
              <div className="p-3 rounded-2xl border border-[#E2E8F0] bg-white">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`Código QR de ${tournament.name}`}
                    width={192}
                    height={192}
                    decoding="async"
                    className="w-48 h-48 object-contain"
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-xs text-[#475569]">
                    Generando QR...
                  </div>
                )}
              </div>
              <p className="text-[11px] text-[#475569] mt-2 text-center">
                Listo para cartelería en club, mesas de control y redes.
              </p>
            </div>

            <div className="sm:col-span-7 space-y-3.5 min-w-0">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#475569] mb-1">
                  Enlace directo al torneo
                </label>
                <div className="flex items-stretch gap-2">
                  <input
                    readOnly
                    value={directUrl}
                    onFocus={(e) => e.target.select()}
                    className="flex-1 min-w-0 h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] font-mono text-[11px] text-[#0A1633]"
                  />
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="inline-flex items-center gap-1.5 px-3.5 h-10 rounded-xl bg-[#0A1633] text-white text-xs font-semibold hover:bg-[#7C1FA2] transition-colors shrink-0"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!qrDataUrl || downloadingCard}
                  onClick={handleDownloadBrandedCard}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[42px] rounded-xl bg-[#7C1FA2] text-white text-xs font-semibold hover:bg-[#6B1A8B] disabled:opacity-60 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  {downloadingCard ? 'Preparando...' : 'Tarjeta QR (PNG)'}
                </button>

                <button
                  type="button"
                  disabled={!qrDataUrl}
                  onClick={handleDownloadQrOnly}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[42px] rounded-xl border border-[#E2E8F0] bg-white text-[#0A1633] text-xs font-semibold hover:bg-slate-50 disabled:opacity-60 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-[#0284C7]" />
                  Solo QR (PNG)
                </button>
              </div>

              <div className="pt-2 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
                <WhatsAppShareButton
                  label="Enviar por WhatsApp"
                  message={buildTournamentWhatsAppMessage({
                    tournament,
                    division: selectedDivision,
                    appUrl: directUrl,
                  })}
                />
                <a
                  href={directUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#0284C7] hover:underline"
                >
                  Probar link directo
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

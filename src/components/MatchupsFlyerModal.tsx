import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileImage,
  Printer,
  X,
} from 'lucide-react';
import { Division, Match, Matchday, Tournament } from '../types/tennis';
import {
  buildFlyerSections,
  FlyerFormat,
  FlyerGroupBy,
  FlyerStatusFilter,
  FlyerTheme,
  renderTournamentFlyerPages,
} from '../utils/flyerGenerator';
import { buildTournamentDirectUrl } from '../utils/tournamentLinks';
import { buildFixtureAgendaWhatsAppMessage } from '../utils/whatsappShare';
import { WhatsAppShareButton } from './WhatsAppShareButton';

interface MatchupsFlyerModalProps {
  open: boolean;
  onClose: () => void;
  tournament: Tournament | null;
  divisions: Division[];
  matchdays: Matchday[];
  matches: Match[];
  defaultDivisionId?: string;
  logoUrl?: string;
}

export const MatchupsFlyerModal: React.FC<MatchupsFlyerModalProps> = ({
  open,
  onClose,
  tournament,
  divisions,
  matchdays,
  matches,
  defaultDivisionId = 'ALL',
  logoUrl,
}) => {
  const [groupBy, setGroupBy] = useState<FlyerGroupBy>('categoria');
  const [divisionFilterId, setDivisionFilterId] = useState<string>(defaultDivisionId || 'ALL');
  const [statusFilter, setStatusFilter] = useState<FlyerStatusFilter>('all');
  const [format, setFormat] = useState<FlyerFormat>('story');
  const [theme, setTheme] = useState<FlyerTheme>('playpy');
  const [includeQr, setIncludeQr] = useState(true);
  const [customSubtitle, setCustomSubtitle] = useState('');

  const [pages, setPages] = useState<string[]>([]);
  const [pageIdx, setPageIdx] = useState(0);
  const [rendering, setRendering] = useState(false);

  const tournamentDivisions = useMemo(
    () =>
      tournament
        ? divisions.filter((d) => d.tournamentId === tournament.id)
        : [],
    [divisions, tournament]
  );

  useEffect(() => {
    if (open) {
      setDivisionFilterId(defaultDivisionId || 'ALL');
      setPageIdx(0);
    }
  }, [open, tournament?.id, defaultDivisionId]);

  const sections = useMemo(() => {
    if (!tournament) return [];
    return buildFlyerSections({
      tournament,
      divisions,
      matchdays,
      matches,
      groupBy,
      divisionFilterId,
      statusFilter,
    });
  }, [tournament, divisions, matchdays, matches, groupBy, divisionFilterId, statusFilter]);

  const flatMatches = useMemo(
    () => sections.flatMap((s) => s.items.map((i) => i.match)),
    [sections]
  );

  useEffect(() => {
    if (!open || !tournament) return;
    let cancelled = false;
    setRendering(true);
    const timer = window.setTimeout(() => {
      renderTournamentFlyerPages({
        tournament,
        sections,
        groupBy,
        format,
        theme,
        includeQr,
        customSubtitle: customSubtitle.trim() || undefined,
        logoUrl,
      })
        .then((rendered) => {
          if (!cancelled) {
            setPages(rendered);
            setPageIdx((prev) => Math.min(prev, Math.max(0, rendered.length - 1)));
          }
        })
        .finally(() => {
          if (!cancelled) setRendering(false);
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    open,
    tournament,
    sections,
    groupBy,
    format,
    theme,
    includeQr,
    customSubtitle,
    logoUrl,
  ]);

  if (!open || !tournament) return null;

  const currentDataUrl = pages[pageIdx] || '';

  const downloadDataUrl = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadCurrent = () => {
    if (!currentDataUrl) return;
    downloadDataUrl(
      currentDataUrl,
      `playpy-flyer-${tournament.id}-${groupBy}-p${pageIdx + 1}.png`
    );
  };

  const handleDownloadAll = () => {
    pages.forEach((url, idx) => {
      window.setTimeout(() => {
        downloadDataUrl(url, `playpy-flyer-${tournament.id}-${groupBy}-p${idx + 1}.png`);
      }, idx * 200);
    });
  };

  const handlePrintFlyer = () => {
    if (pages.length === 0) return;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const imgsHtml = pages
      .map(
        (src, i) =>
          `<div class="page"><img src="${src}" alt="Flyer página ${i + 1}" /></div>`
      )
      .join('');

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }
    doc.open();
    doc.write(`<!DOCTYPE html>
      <html>
        <head>
          <title>Flyer ${tournament.name}</title>
          <style>
            @page { margin: 8mm; }
            body { margin: 0; background: #fff; }
            .page { page-break-after: always; display: flex; justify-content: center; align-items: center; min-height: 95vh; }
            .page:last-child { page-break-after: auto; }
            img { max-width: 100%; max-height: 95vh; object-fit: contain; }
          </style>
        </head>
        <body>${imgsHtml}</body>
      </html>`);
    doc.close();

    window.setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      window.setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1500);
    }, 350);
  };

  const directUrl = buildTournamentDirectUrl(tournament.id, {
    divisionId: divisionFilterId !== 'ALL' ? divisionFilterId : undefined,
    tab: 'fixture',
  });

  const activeDivObj =
    divisionFilterId !== 'ALL'
      ? tournamentDivisions.find((d) => d.id === divisionFilterId)
      : undefined;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0A1633]/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-5 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden my-auto flex flex-col max-h-[94vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#0A1633] text-white flex items-center justify-center shrink-0">
              <FileImage className="w-5 h-5 text-[#38BDF8]" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#7C1FA2]">
                Generador de Flyer de Cruces · Orden ascendente por fecha
              </p>
              <h2 className="text-base font-bold text-[#0A1633] truncate">{tournament.name}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar generador de flyer"
            className="w-9 h-9 rounded-lg border border-[#E2E8F0] bg-white text-[#475569] hover:text-[#0A1633] flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 overflow-y-auto">
          {/* Panel de configuración */}
          <div className="lg:col-span-5 p-5 border-b lg:border-b-0 lg:border-r border-[#E2E8F0] space-y-4 bg-white">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#475569] mb-1.5">
                Dividir cruces por
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'categoria', label: 'Categoría' },
                    { id: 'jornada', label: 'Jornada' },
                    { id: 'fecha', label: 'Fecha' },
                    { id: 'ronda', label: 'Ronda' },
                  ] as Array<{ id: FlyerGroupBy; label: string }>
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setGroupBy(opt.id)}
                    className={`min-h-[40px] px-3 rounded-xl border text-xs font-semibold transition-colors ${
                      groupBy === opt.id
                        ? 'bg-[#7C1FA2] text-white border-[#7C1FA2]'
                        : 'bg-[#F8FAFC] text-[#0A1633] border-[#E2E8F0] hover:bg-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  Filtrar categoría
                </label>
                <select
                  value={divisionFilterId}
                  onChange={(e) => setDivisionFilterId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633]"
                >
                  <option value="ALL">Todas las categorías</option>
                  {tournamentDivisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  Estado de cruces
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as FlyerStatusFilter)}
                  className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633]"
                >
                  <option value="all">Todos los partidos</option>
                  <option value="scheduled">Programados / En curso</option>
                  <option value="finished">Resultados confirmados</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  Formato gráfico
                </label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as FlyerFormat)}
                  className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633]"
                >
                  <option value="story">Vertical Story (9:16)</option>
                  <option value="post">Afiche / Feed (4:5)</option>
                  <option value="landscape">Cartelera Horizontal (16:9)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  Estilo visual
                </label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as FlyerTheme)}
                  className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633]"
                >
                  <option value="playpy">PlayPy Oficial</option>
                  <option value="night">Noche &amp; LED</option>
                  <option value="clean">Editorial Claro</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Subtítulo opcional del encabezado
              </label>
              <input
                value={customSubtitle}
                maxLength={60}
                onChange={(e) => setCustomSubtitle(e.target.value)}
                placeholder="Ej. Orden de juego oficial · Sábado"
                className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs text-[#0A1633]"
              />
            </div>

            <label className="flex items-center gap-2.5 p-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633] cursor-pointer">
              <input
                type="checkbox"
                checked={includeQr}
                onChange={(e) => setIncludeQr(e.target.checked)}
              />
              Incluir código QR de acceso directo al torneo
            </label>

            {/* Resumen del ordenamiento */}
            <div className="grid grid-cols-3 border border-[#E2E8F0] rounded-xl divide-x divide-[#E2E8F0] bg-[#F8FAFC] text-center">
              <div className="p-2.5">
                <p className="text-[11px] text-[#475569]">Bloques</p>
                <p className="font-mono tabular-nums text-sm font-bold text-[#0A1633]">
                  {sections.length}
                </p>
              </div>
              <div className="p-2.5">
                <p className="text-[11px] text-[#475569]">Cruces</p>
                <p className="font-mono tabular-nums text-sm font-bold text-[#7C1FA2]">
                  {flatMatches.length}
                </p>
              </div>
              <div className="p-2.5">
                <p className="text-[11px] text-[#475569]">Hojas PNG</p>
                <p className="font-mono tabular-nums text-sm font-bold text-[#0284C7]">
                  {pages.length}
                </p>
              </div>
            </div>

            {/* Acciones de exportación */}
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!currentDataUrl || rendering}
                  onClick={handleDownloadCurrent}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[42px] rounded-xl bg-[#7C1FA2] text-white text-xs font-semibold hover:bg-[#6B1A8B] disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  Descargar PNG
                </button>

                <button
                  type="button"
                  disabled={pages.length === 0 || rendering}
                  onClick={handlePrintFlyer}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[42px] rounded-xl border border-[#E2E8F0] bg-white text-[#0A1633] text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
                >
                  <Printer className="w-4 h-4 text-[#0284C7]" />
                  Imprimir / PDF
                </button>
              </div>

              {pages.length > 1 && (
                <button
                  type="button"
                  disabled={rendering}
                  onClick={handleDownloadAll}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[40px] rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-[#0A1633] text-xs font-semibold hover:bg-slate-100"
                >
                  <Download className="w-3.5 h-3.5 text-[#7C1FA2]" />
                  Descargar todas las hojas ({pages.length} imágenes PNG)
                </button>
              )}

              {flatMatches.length > 0 && (
                <WhatsAppShareButton
                  label="Compartir cruces por WhatsApp"
                  showCopy
                  message={buildFixtureAgendaWhatsAppMessage({
                    matches: flatMatches,
                    tournamentName: tournament.name,
                    divisionName: activeDivObj?.name,
                    appUrl: directUrl,
                  })}
                />
              )}
            </div>
          </div>

          {/* Vista previa del flyer renderizado */}
          <div className="lg:col-span-7 p-5 bg-[#F1F5F9] flex flex-col items-center justify-between gap-4">
            <div className="w-full flex items-center justify-between gap-3 text-xs text-[#475569]">
              <span>
                {rendering
                  ? 'Renderizando flyer en alta definición...'
                  : 'Ordenado en forma ascendente por fecha cuando existe programación'}
              </span>
              {pages.length > 1 && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={pageIdx === 0}
                    onClick={() => setPageIdx((i) => Math.max(0, i - 1))}
                    className="w-8 h-8 rounded-lg border border-[#E2E8F0] bg-white flex items-center justify-center disabled:opacity-40"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-mono tabular-nums font-semibold text-[#0A1633] px-1">
                    {pageIdx + 1} / {pages.length}
                  </span>
                  <button
                    type="button"
                    disabled={pageIdx >= pages.length - 1}
                    onClick={() => setPageIdx((i) => Math.min(pages.length - 1, i + 1))}
                    className="w-8 h-8 rounded-lg border border-[#E2E8F0] bg-white flex items-center justify-center disabled:opacity-40"
                    aria-label="Página siguiente"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 w-full flex items-center justify-center min-h-[340px]">
              {currentDataUrl ? (
                <img
                  src={currentDataUrl}
                  alt={`Vista previa flyer hoja ${pageIdx + 1}`}
                  className="max-h-[66vh] max-w-full rounded-2xl border border-[#CBD5E1] shadow-lg object-contain bg-[#0A1633]"
                />
              ) : (
                <div className="p-8 rounded-2xl border border-dashed border-[#CBD5E1] bg-white text-xs text-[#475569]">
                  Preparando vista previa del flyer...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

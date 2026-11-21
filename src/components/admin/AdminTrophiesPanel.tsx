import React, { useEffect, useState } from 'react';
import { Award, Edit3, Plus, Save, Sparkles, Trash2, Trophy, Upload } from 'lucide-react';
import {
  Division,
  Tournament,
  TournamentTrophy,
  TrophyCupStyle,
  TrophyFinish,
  TrophyPlace,
} from '../../types/tennis';
import { optimizeAndUploadAdBanner } from '../../utils/imageOptimizer';
import { makeId } from '../../utils/tournamentEngine';
import { removeEntity, saveEntity } from '../../services/firestoreService';
import {
  generateCustomTrophyImage,
  TROPHY_FINISH_LABELS,
  TROPHY_PLACE_LABELS,
  TROPHY_STYLE_LABELS,
} from '../TournamentTrophiesViewer';

interface AdminTrophiesPanelProps {
  tournament: Tournament;
  divisions: Division[];
  trophies: TournamentTrophy[];
  selectedDivisionId: string;
  isSuperAdmin: boolean;
}

export const AdminTrophiesPanel: React.FC<AdminTrophiesPanelProps> = ({
  tournament,
  divisions,
  trophies,
  selectedDivisionId,
  isSuperAdmin,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState<string>(selectedDivisionId || divisions[0]?.id || '');
  const [place, setPlace] = useState<TrophyPlace>('campeon');
  const [cupStyle, setCupStyle] = useState<TrophyCupStyle>('classic_chalice');
  const [finish, setFinish] = useState<TrophyFinish>('gold');
  const [title, setTitle] = useState('');
  const [engravingText, setEngravingText] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [aiMotifNote, setAiMotifNote] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [active, setActive] = useState(true);
  const [previewErr, setPreviewErr] = useState(false);

  const [generatingAi, setGeneratingAi] = useState(false);
  const [generatingPodium, setGeneratingPodium] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [brokenThumbIds, setBrokenThumbIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!showForm) {
      setDivisionId(selectedDivisionId || divisions[0]?.id || '');
    }
  }, [selectedDivisionId, divisions, showForm]);

  const tournamentTrophies = trophies
    .filter((t) => t.tournamentId === tournament.id)
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));

  const openNewForm = () => {
    const targetDiv = divisions.find((d) => d.id === selectedDivisionId) || divisions[0];
    setEditingId(null);
    setDivisionId(targetDiv?.id || '');
    setPlace('campeon');
    setCupStyle('classic_chalice');
    setFinish('gold');
    setTitle(targetDiv ? `Copa Campeón · ${targetDiv.name}` : 'Trofeo Campeón');
    setEngravingText(targetDiv ? `${targetDiv.name} · ${tournament.name}` : tournament.name);
    setRecipientName(targetDiv?.championName || '');
    setCustomPrompt('');
    setAiMotifNote('');
    setImageUrl('');
    setActive(true);
    setPreviewErr(false);
    setErrorMsg(null);
    setShowForm(true);
  };

  const openEditForm = (t: TournamentTrophy) => {
    setEditingId(t.id);
    setDivisionId(t.divisionId);
    setPlace(t.place);
    setCupStyle(t.cupStyle);
    setFinish(t.finish);
    setTitle(t.title);
    setEngravingText(t.engravingText);
    setRecipientName(t.recipientName || '');
    setCustomPrompt(t.customPrompt || '');
    setAiMotifNote(t.aiMotifNote || '');
    setImageUrl(t.imageUrl);
    setActive(t.active);
    setPreviewErr(false);
    setErrorMsg(null);
    setShowForm(true);
  };

  const handlePlaceChange = (nextPlace: TrophyPlace) => {
    setPlace(nextPlace);
    if (!editingId) {
      if (nextPlace === 'campeon') setFinish('gold');
      else if (nextPlace === 'vicecampeon') setFinish('silver');
      else if (nextPlace === 'tercer_puesto') setFinish('bronze');
      else setFinish('playpy_crystal');
    }
  };

  const handleGenerateAiTrophy = async () => {
    const div = divisions.find((d) => d.id === divisionId) || divisions[0];
    if (!div) {
      setErrorMsg('Creá primero una división para asociar el trofeo.');
      return;
    }
    setGeneratingAi(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const inferredWinner =
        recipientName.trim() ||
        (place === 'campeon'
          ? div.championName
          : place === 'vicecampeon'
          ? div.runnerUpName
          : place === 'tercer_puesto'
          ? div.thirdPlaceName
          : '') ||
        '';

      const result = await generateCustomTrophyImage({
        tournamentName: tournament.name,
        venue: tournament.venue,
        city: tournament.city,
        divisionName: div.name,
        category: div.category,
        place,
        title: title.trim() || undefined,
        recipientName: inferredWinner || undefined,
        cupStyle,
        finish,
        engravingText: engravingText.trim() || undefined,
        customPrompt: customPrompt.trim() || undefined,
      });
      setImageUrl(result.imageUrl);
      if (!title.trim()) setTitle(result.title);
      if (!engravingText.trim()) setEngravingText(result.engravingText);
      setAiMotifNote(result.motifNote);
      setPreviewErr(false);
      setFeedback('Imagen de trofeo generada con IA. Guardá el trofeo para publicarlo en Premios del Torneo.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo generar el trofeo con IA.');
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleGeneratePodiumPack = async () => {
    const div = divisions.find((d) => d.id === (selectedDivisionId || divisions[0]?.id)) || divisions[0];
    if (!div) {
      setErrorMsg('Seleccioná o creá al menos una división para generar su podio.');
      return;
    }
    setGeneratingPodium(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const specs: Array<{
        place: TrophyPlace;
        cupStyle: TrophyCupStyle;
        finish: TrophyFinish;
        recipient?: string | null;
      }> = [
        {
          place: 'campeon',
          cupStyle: 'classic_chalice',
          finish: 'gold',
          recipient: div.championName,
        },
        {
          place: 'vicecampeon',
          cupStyle: 'modern_crystal',
          finish: 'silver',
          recipient: div.runnerUpName,
        },
      ];
      if (div.hasThirdPlaceMatch) {
        specs.push({
          place: 'tercer_puesto',
          cupStyle: 'laurel_shield',
          finish: 'bronze',
          recipient: div.thirdPlaceName,
        });
      }

      const now = new Date().toISOString();
      let createdCount = 0;
      for (const spec of specs) {
        const res = await generateCustomTrophyImage({
          tournamentName: tournament.name,
          venue: tournament.venue,
          city: tournament.city,
          divisionName: div.name,
          category: div.category,
          place: spec.place,
          cupStyle: spec.cupStyle,
          finish: spec.finish,
          recipientName: spec.recipient || undefined,
        });
        const newTrophy: TournamentTrophy = {
          id: makeId('trp'),
          tournamentId: tournament.id,
          divisionId: div.id,
          divisionName: div.name,
          category: div.category,
          place: spec.place,
          title: res.title.slice(0, 140),
          recipientName: spec.recipient || null,
          cupStyle: spec.cupStyle,
          finish: spec.finish,
          engravingText: res.engravingText.slice(0, 200),
          customPrompt: null,
          aiMotifNote: res.motifNote ? res.motifNote.slice(0, 300) : null,
          imageUrl: res.imageUrl,
          active: true,
          order: tournamentTrophies.length + createdCount + 1,
          createdAt: now,
          updatedAt: now,
        };
        await saveEntity('tournament_trophies', newTrophy);
        createdCount++;
      }
      setFeedback(
        `Podio de ${createdCount} trofeos IA generado y publicado para ${div.name}.`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo generar el podio de trofeos con IA.'
      );
    } finally {
      setGeneratingPodium(false);
    }
  };

  const handleUploadCustomImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    setErrorMsg(null);
    try {
      const uploadedUrl = await optimizeAndUploadAdBanner(file);
      setImageUrl(uploadedUrl);
      setPreviewErr(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo subir la imagen del trofeo.');
    } finally {
      setUploadingImg(false);
      e.target.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const div = divisions.find((d) => d.id === divisionId) || divisions[0];
    if (!div) {
      setErrorMsg('Creá primero una división.');
      return;
    }
    if (!imageUrl.trim()) {
      setErrorMsg('Generá la imagen del trofeo con IA o subí una imagen antes de guardar.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const now = new Date().toISOString();
      const existing = editingId ? trophies.find((t) => t.id === editingId) : null;
      const entity: TournamentTrophy = {
        id: existing?.id || makeId('trp'),
        tournamentId: tournament.id,
        divisionId: div.id,
        divisionName: div.name,
        category: div.category,
        place,
        title: (title.trim() || `${TROPHY_PLACE_LABELS[place]} · ${div.name}`).slice(0, 140),
        recipientName: recipientName.trim() ? recipientName.trim().slice(0, 180) : null,
        cupStyle,
        finish,
        engravingText: (engravingText.trim() || `${div.name} · ${tournament.name}`).slice(0, 200),
        customPrompt: customPrompt.trim() ? customPrompt.trim().slice(0, 500) : null,
        aiMotifNote: aiMotifNote.trim() ? aiMotifNote.trim().slice(0, 300) : null,
        imageUrl: imageUrl.trim(),
        active,
        order: existing?.order ?? tournamentTrophies.length + 1,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      await saveEntity('tournament_trophies', entity);
      setShowForm(false);
      setEditingId(null);
      setFeedback(`Trofeo "${entity.title}" guardado en Premios del Torneo.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo guardar el trofeo.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (trophy: TournamentTrophy) => {
    await saveEntity('tournament_trophies', {
      ...trophy,
      active: !trophy.active,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    try {
      await removeEntity('tournament_trophies', id);
      setConfirmDeleteId(null);
      setFeedback('Trofeo eliminado correctamente.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo eliminar el trofeo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#7C1FA2]">
            <Award className="w-3.5 h-3.5" />
            Premiación Oficial IA
          </div>
          <h3 className="text-base font-bold text-[#0A1633] mt-0.5">
            Premios del Torneo y Trofeos Personalizados ({tournamentTrophies.length})
          </h3>
          <p className="text-xs text-[#475569]">
            Diseñá trofeos únicos por categoría con IA y publícalos en el visualizador del portal público.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {divisions.length > 0 && (
            <button
              type="button"
              onClick={handleGeneratePodiumPack}
              disabled={generatingPodium || generatingAi}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#7C1FA2]/30 bg-purple-50 text-[#7C1FA2] text-xs font-semibold hover:bg-purple-100 disabled:opacity-60 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {generatingPodium ? 'Generando podio IA...' : 'Generar podio IA (división activa)'}
            </button>
          )}
          <button
            type="button"
            onClick={openNewForm}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0A1633] text-white text-xs font-semibold hover:bg-[#7C1FA2] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo trofeo
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-800">
          {errorMsg}
        </div>
      )}
      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-[#7C1FA2]">
          {feedback}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSave}
          className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-[#0A1633] flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#7C1FA2]" />
              {editingId ? 'Editar trofeo personalizado' : 'Diseñar trofeo con IA'}
            </h4>
            <button
              type="button"
              onClick={handleGenerateAiTrophy}
              disabled={generatingAi || generatingPodium}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#7C1FA2] to-[#0095FF] text-white text-xs font-semibold hover:opacity-95 disabled:opacity-60"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {generatingAi ? 'Generando imagen IA...' : 'Generar imagen de trofeo con IA'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Categoría / División *
              </label>
              <select
                value={divisionId}
                onChange={(e) => setDivisionId(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
              >
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">Puesto *</label>
              <select
                value={place}
                onChange={(e) => handlePlaceChange(e.target.value as TrophyPlace)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
              >
                {(Object.keys(TROPHY_PLACE_LABELS) as TrophyPlace[]).map((p) => (
                  <option key={p} value={p}>
                    {TROPHY_PLACE_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Diseño de trofeo
              </label>
              <select
                value={cupStyle}
                onChange={(e) => setCupStyle(e.target.value as TrophyCupStyle)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
              >
                {(Object.keys(TROPHY_STYLE_LABELS) as TrophyCupStyle[]).map((s) => (
                  <option key={s} value={s}>
                    {TROPHY_STYLE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Acabado metálico
              </label>
              <select
                value={finish}
                onChange={(e) => setFinish(e.target.value as TrophyFinish)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
              >
                {(Object.keys(TROPHY_FINISH_LABELS) as TrophyFinish[]).map((f) => (
                  <option key={f} value={f}>
                    {TROPHY_FINISH_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Título del galardón
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej. Copa Oro 5ta Singles"
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Grabado de la placa
              </label>
              <input
                value={engravingText}
                onChange={(e) => setEngravingText(e.target.value)}
                placeholder="Ej. Campeón 2026 · CIT Asunción"
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#475569] mb-1">
                Ganador (opcional; si vacío usa podio)
              </label>
              <input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Automático al coronar campeón"
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#475569] mb-1">
              Indicaciones creativas para la IA (opcional)
            </label>
            <input
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Ej. Estilo nocturno elegante, detalles en polvo de ladrillo y laureles dorados"
              className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center p-3 rounded-xl bg-white border border-[#E2E8F0]">
            <div className="sm:col-span-4 flex justify-center">
              {imageUrl && !previewErr ? (
                <img
                  src={imageUrl}
                  alt="Vista previa del trofeo"
                  referrerPolicy="no-referrer"
                  onError={() => setPreviewErr(true)}
                  className="w-44 aspect-[10/11] rounded-xl object-cover border border-[#E2E8F0] bg-[#0A1633]"
                />
              ) : (
                <div className="w-44 aspect-[10/11] rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] flex flex-col items-center justify-center p-3 text-center text-[11px] text-[#475569]">
                  <Trophy className="w-7 h-7 text-[#7C1FA2] mb-1.5" />
                  <span>Generá con IA o subí una imagen del trofeo</span>
                </div>
              )}
            </div>

            <div className="sm:col-span-8 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={imageUrl}
                  onChange={(e) => {
                    setImageUrl(e.target.value);
                    setPreviewErr(false);
                  }}
                  placeholder="URL de imagen del trofeo (/uploads/... o https://...)"
                  className="flex-1 h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs min-w-[200px]"
                />
                <label className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0A1633] hover:bg-slate-100 cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-[#0284C7]" />
                  {uploadingImg ? 'Subiendo...' : 'Subir foto'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUploadCustomImage}
                    disabled={uploadingImg}
                    className="hidden"
                  />
                </label>
              </div>
              {aiMotifNote && (
                <p className="text-[11px] text-[#475569] bg-purple-50/60 border border-purple-200 rounded-lg px-2.5 py-1.5">
                  Concepto IA: {aiMotifNote}
                </p>
              )}
              <label className="inline-flex items-center gap-2 text-xs text-[#0A1633] cursor-pointer">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Visible en la galería pública “Premios del Torneo”
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
              className="px-3.5 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || generatingAi || generatingPodium || uploadingImg}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0A1633] text-white text-xs font-semibold hover:bg-[#7C1FA2] disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Publicar trofeo'}
            </button>
          </div>
        </form>
      )}

      {tournamentTrophies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E2E8F0] p-6 text-center text-xs text-[#475569]">
          Aún no hay trofeos configurados para este torneo. Usá “Generar podio IA” o “Nuevo trofeo” para diseñarlos.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {tournamentTrophies.map((t) => (
            <div
              key={t.id}
              className={`rounded-xl border p-3.5 flex flex-col justify-between gap-3 ${
                t.active ? 'border-[#E2E8F0] bg-white' : 'border-[#E2E8F0] bg-[#F8FAFC] opacity-75'
              }`}
            >
              <div className="flex items-start gap-3">
                {!brokenThumbIds[t.id] && t.imageUrl ? (
                  <img
                    src={t.imageUrl}
                    alt={t.title}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setBrokenThumbIds((prev) => ({ ...prev, [t.id]: true }))
                    }
                    className="w-16 aspect-[10/11] rounded-lg object-cover border border-[#E2E8F0] bg-[#0A1633] shrink-0"
                  />
                ) : (
                  <div className="w-16 aspect-[10/11] rounded-lg bg-gradient-to-br from-[#0A1633] to-[#7C1FA2] text-amber-300 flex items-center justify-center shrink-0">
                    <Trophy className="w-6 h-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold text-[#7C1FA2] truncate">
                      {t.divisionName}
                    </p>
                    <span className="text-[11px] font-medium text-[#475569] shrink-0">
                      {t.active ? 'Visible' : 'Oculto'}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-[#0A1633] mt-0.5 line-clamp-1">{t.title}</p>
                  <p className="text-[11px] text-[#475569] mt-0.5 truncate">
                    {TROPHY_PLACE_LABELS[t.place]} · {TROPHY_FINISH_LABELS[t.finish]}
                  </p>
                  <p className="text-[11px] text-[#0284C7] mt-0.5 truncate">
                    {t.recipientName ? `Ganador: ${t.recipientName}` : 'Sincronizado con podio'}
                  </p>
                </div>
              </div>

              {confirmDeleteId === t.id ? (
                <div className="pt-2 border-t border-red-200 flex items-center justify-between gap-2 text-xs">
                  <span className="text-red-800 font-medium">¿Eliminar trofeo?</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2.5 py-1 rounded border border-[#E2E8F0] bg-white text-[11px]"
                    >
                      No
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      className="px-2.5 py-1 rounded bg-red-700 text-white text-[11px] font-medium"
                    >
                      Sí, eliminar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(t)}
                    className="px-2.5 py-1 rounded-lg border border-[#E2E8F0] text-[11px] font-medium text-[#0A1633] hover:bg-slate-50"
                  >
                    {t.active ? 'Ocultar' : 'Mostrar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditForm(t)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E2E8F0] text-[11px] font-medium text-[#0A1633] hover:bg-slate-50"
                  >
                    <Edit3 className="w-3 h-3 text-[#7C1FA2]" />
                    Editar
                  </button>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(t.id)}
                      title="Eliminar trofeo"
                      className="p-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

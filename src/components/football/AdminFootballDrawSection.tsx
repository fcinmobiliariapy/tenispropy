import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  GitBranch,
  Globe,
  Plus,
  RefreshCw,
  Shield,
  Shuffle,
  Trash2,
} from 'lucide-react';
import {
  Division,
  Group,
  Match,
  Registration,
  StaffPermissions,
} from '../../types/tennis';
import {
  computeFootballGroupStandings,
  computeFootballQualifiedSeededEntries,
  formatFootballScoreString,
  generateFootballGroupsDrawPreview,
  generateFootballKnockoutBracket,
  generateFootballQualifyingMatches,
  suggestFootballQualifyingPairs,
} from '../../utils/footballEngine';
import { compareMatchesByRound, isRealFinalMatch } from '../../utils/tournamentEngine';
import {
  deleteGroupsBatch,
  deleteMatchesBatch,
  formatFirestoreError,
  removeEntity,
  saveEntity,
} from '../../services/firestoreService';

interface AdminFootballDrawSectionProps {
  division: Division;
  divisions: Division[];
  onSelectDivision: (id: string) => void;
  registrations: Registration[];
  groups: Group[];
  matches: Match[];
  isSuperAdmin: boolean;
  permissions?: StaffPermissions;
}

export const AdminFootballDrawSection: React.FC<AdminFootballDrawSectionProps> = ({
  division,
  divisions,
  onSelectDivision,
  registrations,
  groups,
  matches,
  isSuperAdmin,
  permissions,
}) => {
  const canCreate = Boolean(isSuperAdmin || !permissions || permissions.canCreate);
  const canEdit = Boolean(isSuperAdmin || !permissions || permissions.canEdit);
  const canDelete = Boolean(isSuperAdmin || !permissions || permissions.canDelete);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualPairA, setManualPairA] = useState<string>('');
  const [manualPairB, setManualPairB] = useState<string>('');

  const confirmedTeams = useMemo(
    () =>
      registrations
        .filter((r) => r.status === 'confirmada')
        .sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999) || a.displayName.localeCompare(b.displayName, 'es')),
    [registrations]
  );

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [groups]
  );

  const groupMatches = useMemo(
    () => matches.filter((m) => m.phase === 'grupos').sort(compareMatchesByRound),
    [matches]
  );

  const qualifyingMatches = useMemo(
    () => matches.filter((m) => m.phase === 'clasificatoria').sort(compareMatchesByRound),
    [matches]
  );

  const knockoutMatches = useMemo(
    () => matches.filter((m) => m.phase === 'eliminacion').sort(compareMatchesByRound),
    [matches]
  );

  const liveGroupsWithStandings = useMemo(
    () =>
      sortedGroups.map((g) => ({
        group: g,
        rows: computeFootballGroupStandings(g, matches, registrations, division),
      })),
    [sortedGroups, matches, registrations, division]
  );

  const handleGenerateGroups = async (publishNow: boolean) => {
    if (confirmedTeams.length < 2) {
      setErrorMsg('Necesitás al menos 2 equipos confirmados en la categoría para sortear grupos.');
      return;
    }
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const existingGroupIds = groups.map((g) => g.id);
      const existingGroupMatchIds = groupMatches.map((m) => m.id);
      if (existingGroupMatchIds.length > 0 && canDelete) {
        await deleteMatchesBatch(existingGroupMatchIds);
      }
      if (existingGroupIds.length > 0 && canDelete) {
        await deleteGroupsBatch(existingGroupIds);
      }

      const preview = generateFootballGroupsDrawPreview(confirmedTeams, division);
      const now = new Date().toISOString();

      for (const grp of preview.groups) {
        await saveEntity('groups', { ...grp, published: publishNow, updatedAt: now });
      }
      for (const m of preview.matches) {
        await saveEntity('matches', { ...m, published: publishNow, updatedAt: now });
      }
      for (const reg of confirmedTeams) {
        const assignedGroup = preview.groups.find((g) => g.entryIds.includes(reg.id));
        if (assignedGroup) {
          await saveEntity('registrations', {
            ...reg,
            groupId: assignedGroup.id,
            updatedAt: now,
          });
        }
      }
      await saveEntity('divisions', {
        ...division,
        drawStatus: publishNow ? 'publicado' : 'borrador',
        updatedAt: now,
      });

      setFeedback(
        publishNow
          ? `Fase de Grupos generada y publicada (${preview.groups.length} grupo(s), ${preview.matches.length} partidos).`
          : `Borrador de Fase de Grupos generado (${preview.groups.length} grupo(s)).`
      );
    } catch (err) {
      setErrorMsg(formatFirestoreError(err, 'No se pudo generar la fase de grupos.'));
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateSuggestedQualifying = async (publishNow: boolean) => {
    const pairs = suggestFootballQualifyingPairs(sortedGroups, matches, registrations, division);
    if (pairs.length === 0) {
      setErrorMsg(
        'No se pudieron sugerir cruces automáticos de Fase Clasificatoria (verificá que existan al menos 3 equipos en grupo único o 2+ por grupo en 2 grupos). Podés agregar un cruce manual abajo.'
      );
      return;
    }
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const now = new Date().toISOString();
      if (qualifyingMatches.length > 0 && canDelete) {
        await deleteMatchesBatch(qualifyingMatches.map((m) => m.id));
      }
      const created = generateFootballQualifyingMatches(pairs, division, 10);
      for (const m of created) {
        await saveEntity('matches', { ...m, published: publishNow, updatedAt: now });
      }
      setFeedback(`Se crearon ${created.length} llave(s) de Fase Clasificatoria.`);
    } catch (err) {
      setErrorMsg(formatFirestoreError(err, 'No se pudo generar la fase clasificatoria.'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddManualQualifyingMatch = async () => {
    if (!manualPairA || !manualPairB || manualPairA === manualPairB) {
      setErrorMsg('Seleccioná dos equipos distintos para la llave clasificatoria.');
      return;
    }
    const teamA = confirmedTeams.find((r) => r.id === manualPairA);
    const teamB = confirmedTeams.find((r) => r.id === manualPairB);
    if (!teamA || !teamB) return;

    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const created = generateFootballQualifyingMatches([[teamA, teamB]], division, 10)[0];
      const nextPos = qualifyingMatches.length + 1;
      const stageLabel = division.fifaConfig?.qualifyingStageLabel || 'Fase Clasificatoria';
      await saveEntity('matches', {
        ...created,
        bracketPosition: nextPos,
        roundName: `${stageLabel} · Llave ${nextPos}`.slice(0, 140),
        published: true,
      });
      setManualPairA('');
      setManualPairB('');
      setFeedback(`Llave clasificatoria "${teamA.displayName} vs ${teamB.displayName}" agregada.`);
    } catch (err) {
      setErrorMsg(formatFirestoreError(err, 'No se pudo crear la llave clasificatoria.'));
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateKnockoutPhase = async (publishNow: boolean) => {
    const entries =
      division.format === 'eliminacion_directa' || sortedGroups.length === 0
        ? confirmedTeams
        : computeFootballQualifiedSeededEntries(sortedGroups, matches, registrations, division);

    if (entries.length < 2) {
      setErrorMsg('Se necesitan al menos 2 equipos clasificados para armar la Fase Final.');
      return;
    }

    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const now = new Date().toISOString();
      if (knockoutMatches.length > 0 && canDelete) {
        await deleteMatchesBatch(knockoutMatches.map((m) => m.id));
      }
      const ko = generateFootballKnockoutBracket(entries, division, 20);
      for (const m of ko) {
        await saveEntity('matches', { ...m, published: publishNow, updatedAt: now });
      }
      if (publishNow && division.drawStatus !== 'publicado') {
        await saveEntity('divisions', { ...division, drawStatus: 'publicado', updatedAt: now });
      }
      setFeedback(
        `Fase Final generada con ${entries.length} clasificados (${ko.length} cruce(s)).`
      );
    } catch (err) {
      setErrorMsg(formatFirestoreError(err, 'No se pudo generar la fase final.'));
    } finally {
      setSaving(false);
    }
  };

  const handlePublishAllDivision = async (publish: boolean) => {
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const now = new Date().toISOString();
      for (const g of sortedGroups) {
        if (g.published !== publish) {
          await saveEntity('groups', { ...g, published: publish, updatedAt: now });
        }
      }
      for (const m of matches) {
        if (m.published !== publish) {
          await saveEntity('matches', { ...m, published: publish, updatedAt: now });
        }
      }
      await saveEntity('divisions', {
        ...division,
        drawStatus: publish ? 'publicado' : 'borrador',
        updatedAt: now,
      });
      setFeedback(
        publish
          ? 'Toda la competencia de esta categoría está publicada en el portal.'
          : 'La categoría pasó a estado borrador.'
      );
    } catch (err) {
      setErrorMsg(formatFirestoreError(err, 'No se pudo actualizar la publicación.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSyncAdvancesAndStandings = async () => {
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const now = new Date().toISOString();
      // 1. Recalcular tablas FIFA de grupos
      for (const grp of sortedGroups) {
        const standings = computeFootballGroupStandings(grp, matches, registrations, division);
        await saveEntity('groups', { ...grp, standings, updatedAt: now });
      }

      // 2. Propagar ganadores en Fase Final
      const regMap = new Map(registrations.map((r) => [r.id, r]));
      const koMap = new Map(knockoutMatches.map((m) => [m.id, { ...m }]));
      const updates = new Set<string>();

      knockoutMatches.forEach((m) => {
        if (!m.winnerEntryId || !m.nextMatchId || !m.nextMatchSlot) return;
        const target = koMap.get(m.nextMatchId);
        if (!target) return;
        const winnerReg = regMap.get(m.winnerEntryId);
        const winnerName = m.winnerName || winnerReg?.displayName || 'Por definir';
        const winnerPids = winnerReg?.playerIds.slice(0, 35) || [];
        if (m.nextMatchSlot === 'A') {
          if (target.entryAId !== m.winnerEntryId || target.entryAName !== winnerName) {
            target.entryAId = m.winnerEntryId;
            target.entryAName = winnerName;
            target.playerIdsA = winnerPids;
            target.updatedAt = now;
            updates.add(target.id);
          }
        } else if (target.entryBId !== m.winnerEntryId || target.entryBName !== winnerName) {
          target.entryBId = m.winnerEntryId;
          target.entryBName = winnerName;
          target.playerIdsB = winnerPids;
          target.updatedAt = now;
          updates.add(target.id);
        }
      });

      // 3er puesto desde perdedores de Semifinales
      const thirdMatch = knockoutMatches.find(
        (m) => m.isThirdPlace || m.roundName === 'Tercer Puesto'
      );
      if (thirdMatch) {
        const semis = knockoutMatches
          .filter((m) => !m.isThirdPlace && m.roundName.toLowerCase().includes('semi'))
          .sort((a, b) => (a.bracketPosition || 0) - (b.bracketPosition || 0));
        if (semis.length === 2) {
          const targetThird = koMap.get(thirdMatch.id)!;
          const loserOf = (sm: Match) => {
            if (!sm.winnerEntryId || !sm.entryAId || !sm.entryBId) return null;
            const lid = sm.winnerEntryId === sm.entryAId ? sm.entryBId : sm.entryAId;
            const lname = sm.winnerEntryId === sm.entryAId ? sm.entryBName : sm.entryAName;
            return {
              id: lid,
              name: lname,
              pids: regMap.get(lid)?.playerIds.slice(0, 35) || [],
            };
          };
          const l1 = loserOf(semis[0]);
          const l2 = loserOf(semis[1]);
          if (l1 && targetThird.entryAId !== l1.id) {
            targetThird.entryAId = l1.id;
            targetThird.entryAName = l1.name;
            targetThird.playerIdsA = l1.pids;
            targetThird.updatedAt = now;
            updates.add(targetThird.id);
          }
          if (l2 && targetThird.entryBId !== l2.id) {
            targetThird.entryBId = l2.id;
            targetThird.entryBName = l2.name;
            targetThird.playerIdsB = l2.pids;
            targetThird.updatedAt = now;
            updates.add(targetThird.id);
          }
        }
      }

      for (const mid of updates) {
        const updatedMatch = koMap.get(mid);
        if (updatedMatch) await saveEntity('matches', updatedMatch);
      }

      // Actualizar podio si final o 3er puesto ya terminaron
      const realFinal = knockoutMatches.find((m) => isRealFinalMatch(m, knockoutMatches));
      if (realFinal?.winnerEntryId) {
        const runnerName =
          realFinal.winnerEntryId === realFinal.entryAId
            ? realFinal.entryBName
            : realFinal.entryAName;
        await saveEntity('divisions', {
          ...division,
          championEntryId: realFinal.winnerEntryId,
          championName: realFinal.winnerName || null,
          runnerUpName: runnerName || null,
          thirdPlaceEntryId: thirdMatch?.winnerEntryId || division.thirdPlaceEntryId || null,
          thirdPlaceName: thirdMatch?.winnerName || division.thirdPlaceName || null,
          updatedAt: now,
        });
      }

      setFeedback('Tablas de posiciones FIFA y avances de llaves sincronizados.');
    } catch (err) {
      setErrorMsg(formatFirestoreError(err, 'No se pudo sincronizar la competencia.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#0A1633]">
            Fases de Competencia FIFA · {division.name}
          </h2>
          <p className="text-xs text-[#475569]">
            Configurá Fase de Grupos, Fase Clasificatoria (Play-In) y Fase Final para cada categoría.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={division.id}
            onChange={(e) => onSelectDivision(e.target.value)}
            className="h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-semibold text-[#0A1633]"
          >
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {canEdit && (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={handleSyncAdvancesAndStandings}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-[#E2E8F0] bg-white text-xs font-semibold text-[#0A1633] hover:bg-slate-50"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#0284C7]" />
                Sincronizar tablas y llaves
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handlePublishAllDivision(division.drawStatus !== 'publicado')}
                className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-[#0A1633] text-white text-xs font-semibold hover:bg-slate-800"
              >
                <Globe className="w-3.5 h-3.5" />
                {division.drawStatus === 'publicado' ? 'Pasar a borrador' : 'Publicar todo'}
              </button>
            </>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-800">
          {errorMsg}
        </div>
      )}
      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-900">
          {feedback}
        </div>
      )}

      {/* Resumen de equipos confirmados */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[#0A1633] flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-700" />
            Equipos Confirmados en {division.category} ({confirmedTeams.length} / {division.maxEntries})
          </h3>
          <span className="text-[11px] text-[#475569]">
            Estado del sorteo:{' '}
            <strong className="text-[#0A1633]">
              {division.drawStatus === 'publicado' ? 'Publicado' : division.drawStatus === 'borrador' ? 'Borrador' : 'Sin sorteo'}
            </strong>
          </span>
        </div>
        {confirmedTeams.length === 0 ? (
          <p className="text-xs text-[#475569]">
            Agregá equipos en la pestaña "Planteles y jugadores" para poder sortear los grupos y llaves.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {confirmedTeams.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-medium text-[#0A1633]"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: t.primaryColor || '#0A1633' }}
                />
                {t.displayName}
                {t.seed ? <span className="font-mono text-[#7C1FA2]">[{t.seed}]</span> : null}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 1. FASE DE GRUPOS */}
      {division.format !== 'eliminacion_directa' && (
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#0A1633]">
                1. Fase de Grupos ({sortedGroups.length} grupo(s) · {groupMatches.length} partidos)
              </h3>
              <p className="text-xs text-[#475569]">
                Desempate FIFA: Puntos (3/1/0), DG, GF, Enfrentamiento directo y Fair Play.
              </p>
            </div>
            {canCreate && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleGenerateGroups(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-semibold text-[#0A1633] hover:bg-slate-50"
                >
                  <Shuffle className="w-3.5 h-3.5 text-[#7C1FA2]" />
                  Sortear borrador
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleGenerateGroups(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Sortear y publicar grupos
                </button>
              </div>
            )}
          </div>

          {liveGroupsWithStandings.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {liveGroupsWithStandings.map(({ group, rows }) => (
                <div key={group.id} className="border border-[#E2E8F0] rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between text-xs">
                    <span className="font-bold text-[#0A1633]">{group.name}</span>
                    <span className="text-[#475569]">
                      {group.published ? 'Publicado' : 'Borrador'}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#E2E8F0] text-[11px] text-[#475569]">
                          <th className="py-1.5 px-3 text-left">Equipo</th>
                          <th className="py-1.5 px-2 text-right">PJ</th>
                          <th className="py-1.5 px-2 text-right">DG</th>
                          <th className="py-1.5 px-3 text-right">PTS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {rows.map((r, i) => (
                          <tr key={r.entryId}>
                            <td className="py-2 px-3 font-medium text-[#0A1633]">
                              <span className="font-mono text-[#475569] mr-1.5">{i + 1}.</span>
                              {r.displayName}
                              {r.qualified && (
                                <span className="ml-1.5 text-[10px] font-bold text-emerald-700">
                                  Q
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums">{r.played}</td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums">
                              {(r.goalDiff ?? 0) >= 0 ? `+${r.goalDiff ?? 0}` : r.goalDiff}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-[#0A1633]">
                              {r.points}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 2. FASE CLASIFICATORIA (Play-In / Repechaje) */}
      {(division.format === 'grupos_clasificatoria_final' ||
        division.fifaConfig?.qualifyingPhaseEnabled ||
        qualifyingMatches.length > 0) && (
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#0A1633]">
                2. {division.fifaConfig?.qualifyingStageLabel || 'Fase Clasificatoria'} ({qualifyingMatches.length})
              </h3>
              <p className="text-xs text-[#475569]">
                Cruces previos de repechaje o clasificación directa antes de la Fase Final (definición por penales si empatan).
              </p>
            </div>
            {canCreate && (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleGenerateSuggestedQualifying(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0284C7] text-white text-xs font-semibold hover:opacity-95"
              >
                <Shuffle className="w-3.5 h-3.5" />
                Sugerir llaves desde grupos
              </button>
            )}
          </div>

          {canCreate && confirmedTeams.length >= 2 && (
            <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[160px]">
                <label className="block text-[11px] font-medium text-[#475569] mb-1">Local (A)</label>
                <select
                  value={manualPairA}
                  onChange={(e) => setManualPairA(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                >
                  <option value="">Seleccionar equipo A</option>
                  {confirmedTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="block text-[11px] font-medium text-[#475569] mb-1">Visitante (B)</label>
                <select
                  value={manualPairB}
                  onChange={(e) => setManualPairB(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                >
                  <option value="">Seleccionar equipo B</option>
                  {confirmedTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={handleAddManualQualifyingMatch}
                className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-[#0A1633] text-white text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar llave manual
              </button>
            </div>
          )}

          {qualifyingMatches.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {qualifyingMatches.map((m) => (
                <div
                  key={m.id}
                  className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-[#0284C7]">{m.roundName}</p>
                    <p className="font-bold text-[#0A1633] truncate mt-0.5">
                      {m.entryAName} vs {m.entryBName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono tabular-nums font-bold text-[#0A1633]">
                      {formatFootballScoreString(m)}
                    </span>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => removeEntity('matches', m.id)}
                        className="p-1.5 rounded-lg text-red-700 hover:bg-red-50"
                        title="Eliminar llave"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 3. FASE FINAL (Eliminación Directa + 3er Puesto) */}
      {division.format !== 'todos_contra_todos' && (
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#0A1633] flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-[#7C1FA2]" />
                3. Fase Final Eliminatoria ({knockoutMatches.length} partidos)
              </h3>
              <p className="text-xs text-[#475569]">
                Cuadro eliminatorio directo con llaves de Octavos/Cuartos/Semis/Final y definición de 3er puesto.
              </p>
            </div>
            {canCreate && (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleGenerateKnockoutPhase(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#7C1FA2] text-white text-xs font-semibold hover:bg-[#6B1A8B]"
              >
                <GitBranch className="w-3.5 h-3.5" />
                Generar / Publicar Fase Final
              </button>
            )}
          </div>

          {knockoutMatches.length === 0 ? (
            <p className="text-xs text-[#475569]">
              Aún no se generó la Fase Final. Al completar los grupos o la Fase Clasificatoria, hacé clic en "Generar / Publicar Fase Final".
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {knockoutMatches.map((m) => (
                <div
                  key={m.id}
                  className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-[#7C1FA2]">{m.roundName}</span>
                    <span className="font-mono tabular-nums font-bold text-[#0A1633]">
                      {formatFootballScoreString(m)}
                    </span>
                  </div>
                  <p className="font-semibold text-[#0A1633] truncate">{m.entryAName}</p>
                  <p className="font-semibold text-[#0A1633] truncate">{m.entryBName}</p>
                  {m.winnerName && (
                    <p className="text-[11px] font-semibold text-emerald-700">
                      Avanza: {m.winnerName}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

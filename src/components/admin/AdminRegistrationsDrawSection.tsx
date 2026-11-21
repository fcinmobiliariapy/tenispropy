import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  Plus,
  Shuffle,
  SlidersHorizontal,
  Trash2,
  Trophy,
  UserPlus,
} from 'lucide-react';
import {
  Division,
  Group,
  Match,
  PlayerPublic,
  Registration,
  RegistrationStatus,
} from '../../types/tennis';
import {
  analyzeDuplicateMatches,
  generateGroupsDrawPreview,
  generateKnockoutBracket,
  generateKnockoutBracketFromSlotPairs,
  generateMatchesForGroupBuckets,
  makeId,
} from '../../utils/tournamentEngine';
import {
  deleteGroupsBatch,
  deleteMatchesBatch,
  publishNotificationAndBroadcast,
  removeEntity,
  saveEntity,
} from '../../services/firestoreService';

interface Props {
  division: Division;
  allDivisions: Division[];
  players: PlayerPublic[];
  registrations: Registration[];
  allRegistrations: Registration[];
  groups: Group[];
  matches: Match[];
  isSuperAdmin: boolean;
}

type DrawMode = 'automatico' | 'manual';

export const AdminRegistrationsDrawSection: React.FC<Props> = ({
  division,
  allDivisions,
  players,
  registrations,
  allRegistrations,
  groups,
  matches,
  isSuperAdmin,
}) => {
  // Inscripción
  const [player1Id, setPlayer1Id] = useState('');
  const [player2Id, setPlayer2Id] = useState('');
  const [seedInput, setSeedInput] = useState('');
  const [regStatus, setRegStatus] = useState<RegistrationStatus>('confirmada');
  const [regError, setRegError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [publishingDraw, setPublishingDraw] = useState(false);
  const [cleaningDivDuplicates, setCleaningDivDuplicates] = useState(false);

  const divisionDuplicateAnalysis = useMemo(
    () => analyzeDuplicateMatches(matches),
    [matches]
  );

  // Modo de sorteo y cruces (Automático o Manual)
  const [drawMode, setDrawMode] = useState<DrawMode>('automatico');
  const [koPhaseMode, setKoPhaseMode] = useState<DrawMode>('automatico');

  // Vista previa del sorteo antes de publicar
  const [previewGroups, setPreviewGroups] = useState<Group[] | null>(null);
  const [previewMatches, setPreviewMatches] = useState<Match[] | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('Borrador de sorteo');

  // Estado para armado manual de grupos
  const [manualGroupAssignments, setManualGroupAssignments] = useState<Record<string, number>>({});
  // Estado para agregar un cruce manual en grupos
  const [customGroupIdx, setCustomGroupIdx] = useState<number>(0);
  const [customMatchAId, setCustomMatchAId] = useState<string>('');
  const [customMatchBId, setCustomMatchBId] = useState<string>('');
  const [customRoundOrder, setCustomRoundOrder] = useState<number>(1);

  // Estado para armado manual de cruces de eliminación directa
  // Cada par representa [entryAId | '', entryBId | ''] (vacío = BYE)
  const [manualKoPairs, setManualKoPairs] = useState<Array<[string, string]>>([]);
  const [manualKoTarget, setManualKoTarget] = useState<'direct' | 'from_groups'>('direct');

  // Edición y eliminación de inscripciones (Superadmin)
  const [editingRegId, setEditingRegId] = useState<string | null>(null);
  const [editRegName, setEditRegName] = useState('');
  const [editRegClub, setEditRegClub] = useState('');
  const [editRegSeed, setEditRegSeed] = useState('');
  const [editRegStatus, setEditRegStatus] = useState<RegistrationStatus>('confirmada');
  const [confirmDeleteRegId, setConfirmDeleteRegId] = useState<string | null>(null);

  const eligiblePlayers = useMemo(
    () =>
      players
        .filter((p) => p.tournamentId === division.tournamentId && p.gender === division.gender)
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [players, division.tournamentId, division.gender]
  );

  const confirmedEntries = useMemo(
    () => registrations.filter((r) => r.status === 'confirmada'),
    [registrations]
  );

  const groupNames = useMemo(() => {
    const count =
      division.format === 'todos_contra_todos' ? 1 : Math.max(1, division.drawConfig.groupCount);
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return Array.from({ length: count }, (_, idx) =>
      division.format === 'todos_contra_todos'
        ? 'Tabla Única'
        : `Grupo ${letters[idx] || idx + 1}`
    );
  }, [division.format, division.drawConfig.groupCount]);

  const groupQualifiers = useMemo(() => {
    if (division.format !== 'grupos_y_final' || groups.length === 0) return [];
    const qPerGroup = division.drawConfig.qualifiersPerGroup || 2;
    const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name));
    const list: Registration[] = [];
    sortedGroups.forEach((g) => {
      g.standings.slice(0, qPerGroup).forEach((row, rank) => {
        const reg = registrations.find((r) => r.id === row.entryId);
        if (reg) {
          list.push({
            ...reg,
            seed: rank === 0 ? 1 : null,
          });
        }
      });
    });
    return list;
  }, [division.format, division.drawConfig.qualifiersPerGroup, groups, registrations]);

  // Limpiar borradores al cambiar de división
  useEffect(() => {
    setPreviewGroups(null);
    setPreviewMatches(null);
    setManualKoPairs([]);
    setRegError(null);
    setFeedback(null);
  }, [division.id]);

  // Inicializar asignaciones manuales de grupo cuando cambian los confirmados
  useEffect(() => {
    setManualGroupAssignments((prev) => {
      const next: Record<string, number> = {};
      const count = groupNames.length;
      confirmedEntries.forEach((entry, idx) => {
        const existing = prev[entry.id];
        next[entry.id] =
          typeof existing === 'number' && existing < count ? existing : idx % count;
      });
      return next;
    });
  }, [confirmedEntries, groupNames.length]);

  const initManualBracketSlots = (entriesPool: Registration[], target: 'direct' | 'from_groups') => {
    let bracketSize = 2;
    while (bracketSize < Math.max(2, entriesPool.length)) bracketSize *= 2;
    const pairCount = bracketSize / 2;
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < pairCount; i++) {
      const a = entriesPool[i * 2]?.id || '';
      const b = entriesPool[i * 2 + 1]?.id || '';
      pairs.push([a, b]);
    }
    setManualKoPairs(pairs);
    setManualKoTarget(target);
  };

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setFeedback(null);

    if (!player1Id) {
      setRegError('Seleccioná un jugador.');
      return;
    }
    if (division.modality === 'Dobles' && (!player2Id || player1Id === player2Id)) {
      setRegError('En Dobles debés elegir dos jugadores distintos.');
      return;
    }

    const selectedIds = division.modality === 'Dobles' ? [player1Id, player2Id] : [player1Id];

    // Validar 1 sola inscripción activa por división
    const alreadyInDivision = registrations.some(
      (r) => r.status !== 'retirada' && r.playerIds.some((pid) => selectedIds.includes(pid))
    );
    if (alreadyInDivision) {
      setRegError('Al menos uno de los jugadores ya tiene una inscripción activa en esta división.');
      return;
    }

    // Validar regla multi-división si está deshabilitada
    if (!division.allowMultiDivision) {
      const sameTournamentDivIds = new Set(
        allDivisions.filter((d) => d.tournamentId === division.tournamentId).map((d) => d.id)
      );
      const inOtherDiv = allRegistrations.some(
        (r) =>
          r.divisionId !== division.id &&
          sameTournamentDivIds.has(r.divisionId) &&
          r.status !== 'retirada' &&
          r.playerIds.some((pid) => selectedIds.includes(pid))
      );
      if (inOtherDiv) {
        setRegError('El reglamento de esta división no permite competir en múltiples divisiones del torneo.');
        return;
      }
    }

    const p1 = players.find((p) => p.id === player1Id)!;
    const p2 = division.modality === 'Dobles' ? players.find((p) => p.id === player2Id)! : null;
    const now = new Date().toISOString();

    const activeCount = registrations.filter((r) => r.status === 'confirmada').length;
    const finalStatus: RegistrationStatus =
      regStatus === 'confirmada' && activeCount >= division.maxEntries
        ? 'en_lista_de_espera'
        : regStatus;

    const reg: Registration = {
      id: makeId('reg'),
      tournamentId: division.tournamentId,
      divisionId: division.id,
      modality: division.modality,
      playerIds: selectedIds,
      displayName: p2 ? `${p1.fullName} / ${p2.fullName}` : p1.fullName,
      club: p2 ? (p1.club === p2.club ? p1.club : `${p1.club} / ${p2.club}`) : p1.club,
      seed: seedInput ? Number(seedInput) : null,
      status: finalStatus,
      groupId: null,
      registeredAt: now,
      updatedAt: now,
    };

    await saveEntity('registrations', reg);
    setPlayer1Id('');
    setPlayer2Id('');
    setSeedInput('');
    setFeedback(
      finalStatus === 'en_lista_de_espera'
        ? `Cupo completo (${division.maxEntries}). "${reg.displayName}" pasó a lista de espera.`
        : `"${reg.displayName}" inscripto en ${division.name}.`
    );
  };

  const handleUpdateRegStatus = async (reg: Registration, status: RegistrationStatus) => {
    await saveEntity('registrations', {
      ...reg,
      status,
      updatedAt: new Date().toISOString(),
    });
  };

  const startEditRegistration = (reg: Registration) => {
    setEditingRegId(reg.id);
    setEditRegName(reg.displayName);
    setEditRegClub(reg.club || '');
    setEditRegSeed(reg.seed ? String(reg.seed) : '');
    setEditRegStatus(reg.status);
    setConfirmDeleteRegId(null);
  };

  const handleSaveRegistrationEdit = async (reg: Registration) => {
    await saveEntity('registrations', {
      ...reg,
      displayName: editRegName.trim() || reg.displayName,
      club: editRegClub.trim() || reg.club || '',
      seed: editRegSeed ? Number(editRegSeed) : null,
      status: editRegStatus,
      updatedAt: new Date().toISOString(),
    });
    setEditingRegId(null);
    setFeedback(`Inscripción "${editRegName.trim() || reg.displayName}" actualizada.`);
  };

  const handleDeleteRegistration = async (reg: Registration) => {
    await removeEntity('registrations', reg.id);
    setConfirmDeleteRegId(null);
    setFeedback(`Inscripción "${reg.displayName}" eliminada.`);
  };

  const handleGenerateAutoPreview = () => {
    setRegError(null);
    if (confirmedEntries.length < 2) {
      setRegError('Se necesitan al menos 2 participantes confirmados para realizar el sorteo.');
      return;
    }
    if (division.format === 'eliminacion_directa') {
      const bracket = generateKnockoutBracket(confirmedEntries, division, 1);
      setPreviewGroups(null);
      setPreviewMatches(bracket);
      setPreviewTitle('Borrador automático de cuadro eliminatorio');
    } else {
      const { groups: prevG, matches: prevM } = generateGroupsDrawPreview(confirmedEntries, division);
      setPreviewGroups(prevG);
      setPreviewMatches(prevM);
      setPreviewTitle('Borrador automático de grupos y cruces');
    }
  };

  const handleBuildManualGroupsPreview = (withRoundRobinMatches: boolean) => {
    setRegError(null);
    if (confirmedEntries.length < 2) {
      setRegError('Se necesitan al menos 2 participantes confirmados.');
      return;
    }

    const buckets = groupNames.map((name, idx) => ({
      name,
      entries: confirmedEntries.filter((e) => (manualGroupAssignments[e.id] ?? 0) === idx),
    }));

    if (buckets.every((b) => b.entries.length === 0)) {
      setRegError('Asigná al menos un participante a los grupos.');
      return;
    }

    const { groups: builtGroups, matches: builtMatches } = generateMatchesForGroupBuckets(
      buckets,
      division
    );
    setPreviewGroups(builtGroups);
    setPreviewMatches(withRoundRobinMatches ? builtMatches : []);
    setPreviewTitle(
      withRoundRobinMatches
        ? 'Borrador manual de grupos (cruces todos contra todos)'
        : 'Borrador manual de grupos (armado libre de cruces)'
    );
  };

  const handleAddCustomGroupMatch = () => {
    setRegError(null);
    if (!previewGroups || !previewMatches) return;
    const targetGroup = previewGroups[customGroupIdx] || previewGroups[0];
    if (!targetGroup) return;

    if (!customMatchAId || !customMatchBId || customMatchAId === customMatchBId) {
      setRegError('Seleccioná dos participantes distintos para agregar el cruce manual.');
      return;
    }

    const regA = confirmedEntries.find((r) => r.id === customMatchAId);
    const regB = confirmedEntries.find((r) => r.id === customMatchBId);
    if (!regA || !regB) return;

    const now = new Date().toISOString();
    const order = Math.max(1, Number(customRoundOrder) || 1);
    const newMatch: Match = {
      id: makeId('mat'),
      tournamentId: division.tournamentId,
      divisionId: division.id,
      matchdayId: null,
      phase: 'grupos',
      roundName: `${targetGroup.name} · Fecha ${order}`,
      roundOrder: order,
      bracketPosition: null,
      nextMatchId: null,
      nextMatchSlot: null,
      groupId: targetGroup.id,
      entryAId: regA.id,
      entryAName: regA.displayName,
      playerIdsA: regA.playerIds,
      entryBId: regB.id,
      entryBName: regB.displayName,
      playerIdsB: regB.playerIds,
      isBye: false,
      scheduledDate: null,
      scheduledTime: null,
      courtId: null,
      courtName: null,
      status: 'programado',
      sets: [],
      winnerEntryId: null,
      winnerName: null,
      outcomeNote: null,
      correctionHistory: [],
      rescheduleHistory: [],
      published: false,
      createdAt: now,
      updatedAt: now,
    };

    setPreviewMatches([...previewMatches, newMatch]);
    setCustomMatchAId('');
    setCustomMatchBId('');
  };

  const handleRemovePreviewMatch = (matchId: string) => {
    if (!previewMatches) return;
    setPreviewMatches(previewMatches.filter((m) => m.id !== matchId));
  };

  const handleMoveEntryInPreview = (entryId: string, toGroupId: string) => {
    if (!previewGroups) return;
    const updatedBuckets = previewGroups.map((g) => {
      const nextIds = g.id === toGroupId
        ? Array.from(new Set([...g.entryIds, entryId]))
        : g.entryIds.filter((id) => id !== entryId);
      const entries = nextIds
        .map((id) => confirmedEntries.find((r) => r.id === id))
        .filter((x): x is Registration => Boolean(x));
      return { id: g.id, name: g.name, entries };
    });

    const { groups: regeneratedGroups, matches: regeneratedMatches } =
      generateMatchesForGroupBuckets(updatedBuckets, division);
    setPreviewGroups(regeneratedGroups);
    setPreviewMatches(regeneratedMatches);
  };

  const handleBuildManualBracketPreview = (
    entriesPool: Registration[],
    startingRoundOrder: number,
    title: string
  ) => {
    setRegError(null);
    const assignedIds = manualKoPairs.flat().filter(Boolean);
    const uniqueIds = new Set(assignedIds);
    if (assignedIds.length !== uniqueIds.size) {
      setRegError('Un mismo participante no puede ocupar más de un lugar en la Ronda 1.');
      return;
    }
    if (uniqueIds.size < 2) {
      setRegError('Asigná al menos 2 participantes distintos en los cruces iniciales.');
      return;
    }

    const entryMap = new Map(entriesPool.map((e) => [e.id, e]));
    const slotPairs: Array<[Registration | null, Registration | null]> = manualKoPairs.map(
      ([aId, bId]) => [aId ? entryMap.get(aId) || null : null, bId ? entryMap.get(bId) || null : null]
    );

    const built = generateKnockoutBracketFromSlotPairs(slotPairs, division, startingRoundOrder);
    setPreviewGroups(null);
    setPreviewMatches(built);
    setPreviewTitle(title);
  };

  const handleAutoFillManualBracket = (entriesPool: Registration[]) => {
    const used = new Set(manualKoPairs.flat().filter(Boolean));
    const remaining = entriesPool.filter((e) => !used.has(e.id));
    let cursor = 0;
    const nextPairs = manualKoPairs.map(([a, b]): [string, string] => {
      const nextA = a || remaining[cursor++]?.id || '';
      const nextB = b || remaining[cursor++]?.id || '';
      return [nextA, nextB];
    });
    setManualKoPairs(nextPairs);
  };

  const handleGenerateKnockoutFromGroupsAuto = () => {
    setRegError(null);
    if (groupQualifiers.length < 2) {
      setRegError('No hay suficientes clasificados de grupo para generar el cuadro final.');
      return;
    }
    const koMatches = generateKnockoutBracket(groupQualifiers, division, 10);
    setPreviewGroups(null);
    setPreviewMatches(koMatches);
    setPreviewTitle(`Borrador automático de fase final (${groupQualifiers.length} clasificados)`);
  };

  const handleCleanupDivisionDuplicates = async () => {
    if (!isSuperAdmin || divisionDuplicateAnalysis.duplicateMatches.length === 0) return;
    setCleaningDivDuplicates(true);
    setRegError(null);
    setFeedback(null);
    try {
      const ids = divisionDuplicateAnalysis.duplicateMatches.map((m) => m.id);
      await deleteMatchesBatch(ids);
      setFeedback(
        `Se eliminaron ${ids.length} ${
          ids.length === 1 ? 'partido duplicado' : 'partidos duplicados'
        } de ${division.name}.`
      );
    } catch (err) {
      setRegError(
        err instanceof Error ? err.message : 'No se pudieron eliminar los partidos duplicados.'
      );
    } finally {
      setCleaningDivDuplicates(false);
    }
  };

  const handlePublishDraw = async () => {
    if (!previewMatches || publishingDraw) return;
    if (previewMatches.length === 0) {
      setRegError('Agregá al menos un cruce antes de publicar.');
      return;
    }

    setPublishingDraw(true);
    setRegError(null);
    try {
      const now = new Date().toISOString();
      const existingPhaseMatches = previewGroups
        ? matches
        : matches.filter((m) => m.phase === 'eliminacion');
      let matchesToSave = previewMatches;

      if (isSuperAdmin) {
        if (existingPhaseMatches.length > 0) {
          await deleteMatchesBatch(existingPhaseMatches.map((m) => m.id));
        }
        if (previewGroups && groups.length > 0) {
          await deleteGroupsBatch(groups.map((g) => g.id));
        }
      } else if (existingPhaseMatches.length > 0) {
        const usedIds = new Set<string>();
        const idRemap = new Map<string, string>();
        const unplayedPool = existingPhaseMatches.filter(
          (m) => !m.winnerEntryId && m.sets.length === 0
        );
        for (const pm of previewMatches) {
          const candidate = unplayedPool.find(
            (em) =>
              !usedIds.has(em.id) &&
              em.phase === pm.phase &&
              (pm.phase === 'eliminacion'
                ? em.roundOrder === pm.roundOrder &&
                  em.bracketPosition === pm.bracketPosition &&
                  Boolean(em.isThirdPlace) === Boolean(pm.isThirdPlace)
                : em.roundName === pm.roundName)
          );
          if (candidate) {
            usedIds.add(candidate.id);
            idRemap.set(pm.id, candidate.id);
          }
        }
        if (idRemap.size > 0) {
          matchesToSave = previewMatches.map((pm) => {
            const targetId = idRemap.get(pm.id) || pm.id;
            const prevDoc = existingPhaseMatches.find((em) => em.id === targetId);
            return {
              ...pm,
              id: targetId,
              nextMatchId: pm.nextMatchId ? idRemap.get(pm.nextMatchId) || pm.nextMatchId : null,
              createdAt: prevDoc?.createdAt || pm.createdAt,
            };
          });
        }
      }

      if (previewGroups) {
        for (const g of previewGroups) {
          await saveEntity('groups', { ...g, published: true, updatedAt: now });
          for (const entryId of g.entryIds) {
            const reg = registrations.find((r) => r.id === entryId);
            if (reg) {
              await saveEntity('registrations', { ...reg, groupId: g.id, updatedAt: now });
            }
          }
        }
      }

      for (const m of matchesToSave) {
        await saveEntity('matches', { ...m, published: true, updatedAt: now });
      }

      await saveEntity('divisions', {
        ...division,
        drawStatus: 'publicado',
        updatedAt: now,
      });

      await publishNotificationAndBroadcast(
        {
          id: makeId('notif'),
          tournamentId: division.tournamentId,
          divisionId: division.id,
          title: `Sorteo y cruces publicados · ${division.name}`,
          body: `Ya podés consultar los cruces oficiales de ${division.name}.`,
          targetPlayerIds: confirmedEntries.flatMap((e) => e.playerIds),
          createdAt: now,
        },
        'draw:published'
      );

      setPreviewGroups(null);
      setPreviewMatches(null);
      setFeedback(`Sorteo y cruces de ${division.name} publicados en el portal público.`);
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Error al publicar el sorteo.');
    } finally {
      setPublishingDraw(false);
    }
  };

  const handleCrownChampionRoundRobin = async () => {
    if (groups.length === 0 || groups[0].standings.length === 0) return;
    const top = groups[0].standings[0];
    const second = groups[0].standings[1];
    const third = groups[0].standings[2];
    await saveEntity('divisions', {
      ...division,
      championEntryId: top.entryId,
      championName: top.displayName,
      runnerUpName: second?.displayName || null,
      thirdPlaceEntryId: third?.entryId || null,
      thirdPlaceName: third?.displayName || null,
      updatedAt: new Date().toISOString(),
    });
    setFeedback(
      `Podio publicado: 1° ${top.displayName}${second ? `, 2° ${second.displayName}` : ''}${third ? `, 3° ${third.displayName}` : ''}.`
    );
  };

  const hasSemisWithoutThirdPlace = useMemo(() => {
    if (!division.hasThirdPlaceMatch) return false;
    const hasThird = matches.some((m) => m.isThirdPlace || m.roundName === 'Tercer Puesto');
    const hasFinal = matches.some(
      (m) => m.phase === 'eliminacion' && !m.nextMatchId && !m.isThirdPlace
    );
    const hasSemis = matches.some((m) => m.phase === 'eliminacion' && m.roundName === 'Semifinales');
    return hasFinal && hasSemis && !hasThird;
  }, [division.hasThirdPlaceMatch, matches]);

  const handleAddThirdPlaceMatch = async () => {
    const finalMatch = matches.find(
      (m) => m.phase === 'eliminacion' && !m.nextMatchId && !m.isThirdPlace
    );
    const semis = matches
      .filter((m) => m.phase === 'eliminacion' && m.nextMatchId === finalMatch?.id)
      .sort((a, b) => (a.bracketPosition || 0) - (b.bracketPosition || 0));
    const sf1 = semis[0];
    const sf2 = semis[1];
    const getLoser = (sf?: Match) => {
      if (!sf || !sf.winnerEntryId) return { id: null, name: 'Por definir', pids: [] as string[] };
      const wonA = sf.winnerEntryId === sf.entryAId;
      return {
        id: wonA ? sf.entryBId || null : sf.entryAId || null,
        name: wonA ? sf.entryBName : sf.entryAName,
        pids: wonA ? sf.playerIdsB : sf.playerIdsA,
      };
    };
    const loserA = getLoser(sf1);
    const loserB = getLoser(sf2);
    const now = new Date().toISOString();
    const thirdMatch: Match = {
      id: makeId('ko3'),
      tournamentId: division.tournamentId,
      divisionId: division.id,
      matchdayId: null,
      phase: 'eliminacion',
      roundName: 'Tercer Puesto',
      roundOrder: finalMatch?.roundOrder || 10,
      bracketPosition: 2,
      nextMatchId: null,
      nextMatchSlot: null,
      isThirdPlace: true,
      groupId: null,
      entryAId: loserA.id,
      entryAName: loserA.name,
      playerIdsA: loserA.pids,
      entryBId: loserB.id,
      entryBName: loserB.name,
      playerIdsB: loserB.pids,
      isBye: false,
      scheduledDate: null,
      scheduledTime: null,
      courtId: null,
      courtName: null,
      status: 'programado',
      sets: [],
      winnerEntryId: null,
      winnerName: null,
      outcomeNote: null,
      correctionHistory: [],
      rescheduleHistory: [],
      published: true,
      createdAt: now,
      updatedAt: now,
    };
    await saveEntity('matches', thirdMatch);
    setFeedback('Partido por el 3er Puesto agregado al cuadro final.');
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-[#7C1FA2] font-medium">
          División seleccionada · {division.modality} · {division.gender}
        </p>
        <h2 className="text-xl font-bold text-[#0A1633]">
          Inscripciones y Sorteo — {division.name}
        </h2>
      </div>

      {divisionDuplicateAnalysis.duplicateMatches.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2 text-amber-950">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>
              Esta división tiene{' '}
              <strong>{divisionDuplicateAnalysis.duplicateMatches.length} partidos duplicados</strong>.
              Se conservarán los partidos con resultado o programación.
            </span>
          </div>
          {isSuperAdmin && (
            <button
              type="button"
              onClick={handleCleanupDivisionDuplicates}
              disabled={cleaningDivDuplicates}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-700 text-white font-semibold hover:bg-red-800 disabled:opacity-60"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {cleaningDivDuplicates ? 'Limpiando...' : 'Eliminar duplicados'}
            </button>
          )}
        </div>
      )}

      {regError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-800">
          {regError}
        </div>
      )}
      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-[#7C1FA2]">
          {feedback}
        </div>
      )}

      {/* Formulario de inscripción */}
      <form
        onSubmit={handleEnroll}
        className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-[#7C1FA2]" />
          <h3 className="text-sm font-semibold text-[#0A1633]">
            Inscribir {division.modality === 'Dobles' ? 'pareja de Dobles' : 'jugador en Singles'}
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select
            value={player1Id}
            onChange={(e) => setPlayer1Id(e.target.value)}
            className="h-11 sm:h-10 px-3 rounded-lg border border-[#E2E8F0] text-sm"
          >
            <option value="">
              {division.modality === 'Dobles' ? 'Jugador/a 1...' : 'Seleccionar jugador/a...'}
            </option>
            {eligiblePlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName} ({p.club})
              </option>
            ))}
          </select>

          {division.modality === 'Dobles' && (
            <select
              value={player2Id}
              onChange={(e) => setPlayer2Id(e.target.value)}
              className="h-11 sm:h-10 px-3 rounded-lg border border-[#E2E8F0] text-sm"
            >
              <option value="">Jugador/a 2 (pareja)...</option>
              {eligiblePlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} ({p.club})
                </option>
              ))}
            </select>
          )}

          <input
            type="number"
            min={1}
            max={32}
            placeholder="Cabeza de serie (opcional)"
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            className="h-11 sm:h-10 px-3 rounded-lg border border-[#E2E8F0] text-sm font-mono"
          />

          <select
            value={regStatus}
            onChange={(e) => setRegStatus(e.target.value as RegistrationStatus)}
            className="h-11 sm:h-10 px-3 rounded-lg border border-[#E2E8F0] text-sm"
          >
            <option value="confirmada">Estado: Confirmada</option>
            <option value="pendiente">Estado: Pendiente</option>
            <option value="en_lista_de_espera">Lista de espera</option>
          </select>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="w-full sm:w-auto px-4 min-h-[44px] sm:min-h-[38px] rounded-xl sm:rounded-lg bg-[#7C1FA2] text-white text-xs font-medium hover:bg-[#6B1A8B]"
          >
            Confirmar inscripción
          </button>
        </div>
      </form>

      {/* Lista de inscriptos */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#0A1633]">
            Inscripciones registradas ({registrations.length})
          </h3>
          <span className="text-xs text-[#475569] font-mono tabular-nums shrink-0">
            Confirmadas: {confirmedEntries.length} / {division.maxEntries}
          </span>
        </div>

        <div className="divide-y divide-[#E2E8F0]">
          {registrations.map((reg) => {
            const isEditing = editingRegId === reg.id;
            const isDeleting = confirmDeleteRegId === reg.id;
            return (
              <div key={reg.id} className="px-4 sm:px-5 py-3 space-y-2.5 text-sm">
                {isEditing ? (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <input
                      value={editRegName}
                      onChange={(e) => setEditRegName(e.target.value)}
                      placeholder="Nombre inscripto"
                      className="sm:col-span-4 h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs"
                    />
                    <input
                      value={editRegClub}
                      onChange={(e) => setEditRegClub(e.target.value)}
                      placeholder="Club"
                      className="sm:col-span-3 h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs"
                    />
                    <input
                      type="number"
                      min={1}
                      max={32}
                      value={editRegSeed}
                      onChange={(e) => setEditRegSeed(e.target.value)}
                      placeholder="Seed"
                      className="sm:col-span-1 h-9 px-2 rounded-lg border border-[#E2E8F0] text-xs font-mono"
                    />
                    <select
                      value={editRegStatus}
                      onChange={(e) => setEditRegStatus(e.target.value as RegistrationStatus)}
                      className="sm:col-span-2 h-9 px-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs"
                    >
                      <option value="confirmada">Confirmada</option>
                      <option value="pendiente">Pendiente</option>
                      <option value="en_lista_de_espera">Lista de espera</option>
                      <option value="retirada">Retirada</option>
                    </select>
                    <div className="sm:col-span-2 flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingRegId(null)}
                        className="px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] text-xs"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveRegistrationEdit(reg)}
                        className="px-3 py-1.5 rounded-lg bg-[#7C1FA2] text-white text-xs font-medium"
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-medium text-[#0A1633]">{reg.displayName}</span>
                      {reg.seed && <span className="ml-2 text-xs text-[#7C1FA2] font-mono">[Seed {reg.seed}]</span>}
                      <p className="text-xs text-[#475569] truncate">{reg.club}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={reg.status}
                        onChange={(e) => handleUpdateRegStatus(reg, e.target.value as RegistrationStatus)}
                        className="h-10 sm:h-8 px-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium"
                      >
                        <option value="confirmada">Confirmada</option>
                        <option value="pendiente">Pendiente</option>
                        <option value="en_lista_de_espera">Lista de espera</option>
                        <option value="retirada">Retirada</option>
                      </select>

                      {isSuperAdmin && !isDeleting && (
                        <>
                          <button
                            type="button"
                            onClick={() => startEditRegistration(reg)}
                            title="Editar inscripción"
                            className="p-2 rounded-lg border border-[#E2E8F0] text-[#0A1633] hover:bg-slate-50"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-[#7C1FA2]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteRegId(reg.id)}
                            title="Eliminar inscripción"
                            className="p-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {isDeleting && (
                  <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-red-900 font-medium">
                      ¿Eliminar inscripción de {reg.displayName}?
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteRegId(null)}
                        className="px-2.5 py-1 rounded border border-red-200 bg-white text-[#0A1633]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRegistration(reg)}
                        className="px-3 py-1 rounded bg-red-700 text-white font-medium"
                      >
                        Sí, eliminar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Módulo de Sorteo y Generación de Cruces (Automático o Manual) */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
          <div>
            <h3 className="text-sm font-semibold text-[#0A1633]">Sorteo y armado de cruces</h3>
            <p className="text-xs text-[#475569]">
              Elegí entre sorteo automático o asignación manual de grupos y enfrentamientos antes de publicar.
            </p>
          </div>

          {/* Switch Automático / Manual */}
          <div className="inline-flex items-center p-1 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setDrawMode('automatico')}
              className={`inline-flex items-center gap-1.5 px-3 min-h-[40px] sm:min-h-[34px] rounded-lg text-xs font-medium transition-colors ${
                drawMode === 'automatico'
                  ? 'bg-[#7C1FA2] text-white'
                  : 'text-[#475569] hover:text-[#0A1633]'
              }`}
            >
              <Shuffle className="w-3.5 h-3.5" />
              Automático
            </button>
            <button
              type="button"
              onClick={() => {
                setDrawMode('manual');
                if (division.format === 'eliminacion_directa' && manualKoPairs.length === 0) {
                  initManualBracketSlots(confirmedEntries, 'direct');
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3 min-h-[40px] sm:min-h-[34px] rounded-lg text-xs font-medium transition-colors ${
                drawMode === 'manual'
                  ? 'bg-[#7C1FA2] text-white'
                  : 'text-[#475569] hover:text-[#0A1633]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Manual
            </button>
          </div>
        </div>

        {/* MODO AUTOMÁTICO */}
        {drawMode === 'automatico' && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleGenerateAutoPreview}
              className="inline-flex items-center gap-1.5 px-4 min-h-[44px] sm:min-h-[38px] rounded-xl sm:rounded-lg bg-[#7C1FA2] text-white text-xs font-medium hover:bg-[#6B1A8B]"
            >
              <Shuffle className="w-3.5 h-3.5" />
              Sortear automáticamente (vista previa)
            </button>

            {division.format === 'todos_contra_todos' && groups.length > 0 && (
              <button
                onClick={handleCrownChampionRoundRobin}
                className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] sm:min-h-[38px] rounded-xl sm:rounded-lg border border-amber-700 text-amber-800 text-xs font-medium hover:bg-amber-50"
              >
                <Trophy className="w-3.5 h-3.5" />
                Publicar campeón por tabla
              </button>
            )}

            {hasSemisWithoutThirdPlace && (
              <button
                onClick={handleAddThirdPlaceMatch}
                className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] sm:min-h-[38px] rounded-xl sm:rounded-lg border border-[#C2410C] text-[#C2410C] text-xs font-medium hover:bg-orange-50"
              >
                <Trophy className="w-3.5 h-3.5" />
                Agregar partido 3er puesto
              </button>
            )}
          </div>
        )}

        {/* MODO MANUAL PARA GRUPOS / TODOS CONTRA TODOS */}
        {drawMode === 'manual' && division.format !== 'eliminacion_directa' && (
          <div className="space-y-4 p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-[#0A1633]">
                  Asignación manual de {division.format === 'todos_contra_todos' ? 'tabla' : 'grupos'}
                </p>
                <p className="text-[11px] text-[#475569]">
                  Elegí en qué grupo participa cada inscripto confirmado y luego generá los cruces o armalos uno a uno.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next: Record<string, number> = {};
                  confirmedEntries.forEach((e, idx) => {
                    next[e.id] = idx % groupNames.length;
                  });
                  setManualGroupAssignments(next);
                }}
                className="px-3 min-h-[36px] rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0A1633] hover:bg-slate-50"
              >
                Distribuir equitativamente
              </button>
            </div>

            {confirmedEntries.length < 2 ? (
              <p className="text-xs text-[#475569]">
                Se necesitan al menos 2 participantes confirmados.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {confirmedEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-2 bg-white border border-[#E2E8F0] rounded-xl px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-[#0A1633] truncate">{entry.displayName}</p>
                        <p className="text-[11px] text-[#475569] truncate">
                          {entry.club} {entry.seed ? `· Seed ${entry.seed}` : ''}
                        </p>
                      </div>
                      <select
                        value={manualGroupAssignments[entry.id] ?? 0}
                        onChange={(e) =>
                          setManualGroupAssignments((prev) => ({
                            ...prev,
                            [entry.id]: Number(e.target.value),
                          }))
                        }
                        className="h-9 px-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium shrink-0"
                      >
                        {groupNames.map((gName, idx) => (
                          <option key={gName} value={idx}>
                            {gName}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleBuildManualGroupsPreview(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] sm:min-h-[38px] rounded-xl sm:rounded-lg bg-[#7C1FA2] text-white text-xs font-medium hover:bg-[#6B1A8B]"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Previsualizar con cruces todos contra todos
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBuildManualGroupsPreview(false)}
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] sm:min-h-[38px] rounded-xl sm:rounded-lg border border-[#7C1FA2] bg-white text-[#7C1FA2] text-xs font-medium hover:bg-emerald-50"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Previsualizar y armar cruces manualmente
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* MODO MANUAL PARA ELIMINACIÓN DIRECTA DESDE EL INICIO */}
        {drawMode === 'manual' && division.format === 'eliminacion_directa' && (
          <div className="space-y-4 p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-[#0A1633]">
                  Armado manual de cruces de Ronda 1
                </p>
                <p className="text-[11px] text-[#475569]">
                  Definí manualmente cada enfrentamiento o asigná BYE (pase libre).
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => initManualBracketSlots(confirmedEntries, 'direct')}
                  className="px-3 min-h-[36px] rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0A1633]"
                >
                  Reiniciar casillas
                </button>
                <button
                  type="button"
                  onClick={() => handleAutoFillManualBracket(confirmedEntries)}
                  className="px-3 min-h-[36px] rounded-lg border border-[#7C1FA2] bg-white text-xs font-medium text-[#7C1FA2]"
                >
                  Completar vacíos automáticamente
                </button>
              </div>
            </div>

            {confirmedEntries.length < 2 ? (
              <p className="text-xs text-[#475569]">
                Se necesitan al menos 2 participantes confirmados.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {manualKoPairs.map(([aId, bId], idx) => (
                    <div
                      key={idx}
                      className="bg-white border border-[#E2E8F0] rounded-xl p-3 space-y-2"
                    >
                      <p className="text-[11px] font-semibold text-[#475569]">
                        Llave #{idx + 1}
                      </p>
                      <select
                        value={aId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setManualKoPairs((prev) =>
                            prev.map((p, i) => (i === idx ? [val, p[1]] : p))
                          );
                        }}
                        className="w-full h-10 px-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs"
                      >
                        <option value="">BYE / Pase libre</option>
                        {confirmedEntries.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.displayName} {entry.seed ? `[Seed ${entry.seed}]` : ''}
                          </option>
                        ))}
                      </select>
                      <select
                        value={bId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setManualKoPairs((prev) =>
                            prev.map((p, i) => (i === idx ? [p[0], val] : p))
                          );
                        }}
                        className="w-full h-10 px-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs"
                      >
                        <option value="">BYE / Pase libre</option>
                        {confirmedEntries.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.displayName} {entry.seed ? `[Seed ${entry.seed}]` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleBuildManualBracketPreview(
                      confirmedEntries,
                      1,
                      'Borrador manual de cuadro eliminatorio'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-4 min-h-[44px] sm:min-h-[38px] rounded-xl sm:rounded-lg bg-[#7C1FA2] text-white text-xs font-medium hover:bg-[#6B1A8B]"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Previsualizar cuadro manual
                </button>
              </>
            )}
          </div>
        )}

        {/* SECCIÓN ESPECÍFICA: FASE FINAL DESDE CLASIFICADOS (grupos_y_final) */}
        {division.format === 'grupos_y_final' && groups.length > 0 && (
          <div className="pt-4 border-t border-[#E2E8F0] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#7C1FA2]">
                  Fase final desde clasificados ({groupQualifiers.length} clasificados)
                </h4>
                <p className="text-xs text-[#475569]">
                  Generá el cuadro eliminatorio de forma automática por posición o armando los cruces manualmente.
                </p>
              </div>
              <div className="inline-flex items-center p-1 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] self-start">
                <button
                  type="button"
                  onClick={() => setKoPhaseMode('automatico')}
                  className={`px-3 min-h-[36px] rounded-lg text-xs font-medium ${
                    koPhaseMode === 'automatico'
                      ? 'bg-[#7C1FA2] text-white'
                      : 'text-[#475569]'
                  }`}
                >
                  Cruces automáticos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKoPhaseMode('manual');
                    if (manualKoTarget !== 'from_groups' || manualKoPairs.length === 0) {
                      initManualBracketSlots(groupQualifiers, 'from_groups');
                    }
                  }}
                  className={`px-3 min-h-[36px] rounded-lg text-xs font-medium ${
                    koPhaseMode === 'manual'
                      ? 'bg-[#7C1FA2] text-white'
                      : 'text-[#475569]'
                  }`}
                >
                  Cruces manuales
                </button>
              </div>
            </div>

            {koPhaseMode === 'automatico' ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleGenerateKnockoutFromGroupsAuto}
                  className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] sm:min-h-[38px] rounded-xl sm:rounded-lg border border-[#7C1FA2] text-[#7C1FA2] text-xs font-medium hover:bg-emerald-50"
                >
                  <Trophy className="w-3.5 h-3.5" />
                  Generar fase final automática (vista previa)
                </button>
                {hasSemisWithoutThirdPlace && (
                  <button
                    onClick={handleAddThirdPlaceMatch}
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] sm:min-h-[38px] rounded-xl sm:rounded-lg border border-[#C2410C] text-[#C2410C] text-xs font-medium hover:bg-orange-50"
                  >
                    <Trophy className="w-3.5 h-3.5" />
                    Agregar partido 3er puesto
                  </button>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-[#0A1633]">
                    Emparejá manualmente a los clasificados para la Ronda 1 de Fase Final:
                  </p>
                  <button
                    type="button"
                    onClick={() => handleAutoFillManualBracket(groupQualifiers)}
                    className="px-3 min-h-[36px] rounded-lg border border-[#7C1FA2] bg-white text-xs font-medium text-[#7C1FA2]"
                  >
                    Completar automáticamente
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {manualKoPairs.map(([aId, bId], idx) => (
                    <div
                      key={idx}
                      className="bg-white border border-[#E2E8F0] rounded-xl p-3 space-y-2"
                    >
                      <p className="text-[11px] font-semibold text-[#475569]">
                        Cruce Fase Final #{idx + 1}
                      </p>
                      <select
                        value={aId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setManualKoPairs((prev) =>
                            prev.map((p, i) => (i === idx ? [val, p[1]] : p))
                          );
                        }}
                        className="w-full h-10 px-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs"
                      >
                        <option value="">BYE / Pase libre</option>
                        {groupQualifiers.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.displayName} {entry.seed ? `[1° Grupo]` : ''}
                          </option>
                        ))}
                      </select>
                      <select
                        value={bId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setManualKoPairs((prev) =>
                            prev.map((p, i) => (i === idx ? [p[0], val] : p))
                          );
                        }}
                        className="w-full h-10 px-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs"
                      >
                        <option value="">BYE / Pase libre</option>
                        {groupQualifiers.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.displayName} {entry.seed ? `[1° Grupo]` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleBuildManualBracketPreview(
                      groupQualifiers,
                      10,
                      'Borrador manual de fase final'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-4 min-h-[44px] sm:min-h-[38px] rounded-xl sm:rounded-lg bg-[#7C1FA2] text-white text-xs font-medium hover:bg-[#6B1A8B]"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Previsualizar fase final manual
                </button>
              </div>
            )}
          </div>
        )}

        {/* VISTA PREVIA EDITABLE ANTES DE PUBLICAR */}
        {previewMatches && (
          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold text-[#C2410C]">
                {previewTitle} (aún no publicado en el portal público)
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setPreviewGroups(null);
                    setPreviewMatches(null);
                  }}
                  className="px-3 min-h-[40px] sm:min-h-[34px] rounded-lg border border-[#E2E8F0] bg-white text-xs"
                >
                  Descartar
                </button>
                <button
                  onClick={handlePublishDraw}
                  disabled={publishingDraw}
                  className="inline-flex items-center gap-1.5 px-4 min-h-[40px] sm:min-h-[34px] rounded-lg bg-[#7C1FA2] text-white text-xs font-medium disabled:opacity-60"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {publishingDraw ? 'Publicando...' : 'Publicar sorteo'}
                </button>
              </div>
            </div>

            {previewGroups && previewGroups.length > 0 && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {previewGroups.map((g) => (
                    <div key={g.id} className="bg-white border border-[#E2E8F0] rounded-xl p-3">
                      <p className="text-xs font-semibold text-[#0A1633] mb-2">{g.name}</p>
                      <div className="space-y-1.5">
                        {g.standings.map((s) => (
                          <div key={s.entryId} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate">
                              {s.displayName} {s.seed ? `[${s.seed}]` : ''}
                            </span>
                            {previewGroups.length > 1 && (
                              <select
                                value={g.id}
                                onChange={(e) => handleMoveEntryInPreview(s.entryId, e.target.value)}
                                className="h-8 px-2 rounded border border-[#E2E8F0] text-[11px] shrink-0"
                              >
                                {previewGroups.map((opt) => (
                                  <option key={opt.id} value={opt.id}>
                                    Mover a {opt.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Agregar cruce manual dentro de los grupos previsualizados */}
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 space-y-2.5">
                  <p className="text-xs font-semibold text-[#0A1633]">
                    Agregar cruce manual en borrador de grupo
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                    <select
                      value={customGroupIdx}
                      onChange={(e) => setCustomGroupIdx(Number(e.target.value))}
                      className="h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs"
                    >
                      {previewGroups.map((g, idx) => (
                        <option key={g.id} value={idx}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={customMatchAId}
                      onChange={(e) => setCustomMatchAId(e.target.value)}
                      className="h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs"
                    >
                      <option value="">Participante A...</option>
                      {(previewGroups[customGroupIdx]?.entryIds || []).map((id) => {
                        const reg = confirmedEntries.find((r) => r.id === id);
                        return reg ? (
                          <option key={id} value={id}>
                            {reg.displayName}
                          </option>
                        ) : null;
                      })}
                    </select>
                    <select
                      value={customMatchBId}
                      onChange={(e) => setCustomMatchBId(e.target.value)}
                      className="h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs"
                    >
                      <option value="">Participante B...</option>
                      {(previewGroups[customGroupIdx]?.entryIds || []).map((id) => {
                        const reg = confirmedEntries.find((r) => r.id === id);
                        return reg ? (
                          <option key={id} value={id}>
                            {reg.displayName}
                          </option>
                        ) : null;
                      })}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={customRoundOrder}
                      onChange={(e) => setCustomRoundOrder(Number(e.target.value))}
                      placeholder="Fecha"
                      className="h-9 px-2.5 rounded-lg border border-[#E2E8F0] text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomGroupMatch}
                      className="inline-flex items-center justify-center gap-1 h-9 px-3 rounded-lg bg-[#7C1FA2] text-white text-xs font-medium hover:bg-[#6B1A8B]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Agregar cruce
                    </button>
                  </div>
                </div>
              </>
            )}

            <div>
              <p className="text-xs font-medium text-[#475569] mb-1.5">
                Cruces generados ({previewMatches.length} partidos):
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                {previewMatches.map((m) => (
                  <div
                    key={m.id}
                    className="bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <span className="text-[#475569]">{m.roundName}: </span>
                      <span className="font-medium text-[#0A1633]">
                        {m.entryAName} vs {m.entryBName}
                      </span>
                    </div>
                    {previewGroups && (
                      <button
                        type="button"
                        onClick={() => handleRemovePreviewMatch(m.id)}
                        title="Quitar cruce del borrador"
                        className="p-1.5 text-red-700 hover:bg-red-50 rounded shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

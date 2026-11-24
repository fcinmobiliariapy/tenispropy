import {
  Division,
  FootballPosition,
  Group,
  Match,
  Matchday,
  PlayerPrivate,
  PlayerPublic,
  Registration,
  Tournament,
} from '../types/tennis';
import {
  computeFootballGroupStandings,
  createDefaultFifaConfig,
  FIFA_EDITION_LABEL,
  generateFootballGroupsDrawPreview,
  generateFootballQualifyingMatches,
  suggestFootballQualifyingPairs,
} from '../utils/footballEngine';
import { ITF_EDITION_LABEL } from '../utils/itfRules';
import { makeId } from '../utils/tournamentEngine';

export interface FootballSeedBundle {
  tournament: Tournament;
  divisions: Division[];
  playersPublic: PlayerPublic[];
  playersPrivate: PlayerPrivate[];
  registrations: Registration[];
  groups: Group[];
  matchdays: Matchday[];
  matches: Match[];
}

const TEAM_TEMPLATES = [
  { name: 'Atlético Asunción FC', short: 'ASU', coach: 'Carlos Arce', color: '#0A1633' },
  { name: 'Deportivo Sajonia', short: 'SAJ', coach: 'Marcos Benítez', color: '#0284C7' },
  { name: 'Club Villa Morra', short: 'VMO', coach: 'Hugo Galeano', color: '#7C1FA2' },
  { name: 'Sportivo Trinidad', short: 'TRI', coach: 'Diego Vera', color: '#15803D' },
  { name: 'Real San Lorenzo', short: 'SLO', coach: 'Pedro Ayala', color: '#B45309' },
  { name: 'Estrella del Sur', short: 'EDS', coach: 'Julio Báez', color: '#DC2626' },
  { name: 'Juventud Lambaré', short: 'LAM', coach: 'Sergio Giménez', color: '#0F766E' },
  { name: 'Guaraní Norte FC', short: 'GUA', coach: 'Óscar Paredes', color: '#4338CA' },
];

const FIRST_NAMES = [
  'Mateo',
  'Lucas',
  'Thiago',
  'Santiago',
  'Valentín',
  'Rodrigo',
  'Alejandro',
  'Nicolás',
  'Matías',
  'Gabriel',
  'Enzo',
  'Sebastián',
];

const LAST_NAMES = [
  'González',
  'Benítez',
  'Cardozo',
  'Cáceres',
  'Rojas',
  'Villalba',
  'Acosta',
  'Duarte',
  'Mendoza',
  'Ferreira',
  'Caballero',
  'Ortiz',
];

export function buildFootballTemplateBundle(
  adminUid: string,
  meta?: {
    name?: string;
    venue?: string;
    city?: string;
    organizerName?: string;
  }
): FootballSeedBundle {
  const now = new Date().toISOString();
  const tournamentId = makeId('tor_fut');

  const tournament: Tournament = {
    id: tournamentId,
    name: (meta?.name || 'Copa PlayPy Fútbol FIFA 2026').slice(0, 140),
    sport: 'football',
    organizerName: (meta?.organizerName || 'Liga PlayPy Oficial').slice(0, 120),
    organizerUid: adminUid,
    venue: (meta?.venue || 'Complejo Deportivo PlayPy').slice(0, 140),
    city: (meta?.city || 'Asunción').slice(0, 80),
    timezone: 'America/Asuncion',
    courts: [
      { id: makeId('crt'), name: 'Estadio Principal', surface: 'Césped natural', lights: true },
      { id: makeId('crt'), name: 'Campo 2 Sintético', surface: 'Fútbol sintético', lights: true },
      { id: makeId('crt'), name: 'Campo 3 Norte', surface: 'Césped natural', lights: false },
    ],
    startDate: '2026-11-25',
    endDate: '2026-12-20',
    regStartDate: '2026-11-01',
    regEndDate: '2026-11-24',
    minRestMinutes: 1440,
    itfEdition: FIFA_EDITION_LABEL,
    status: 'en_curso',
    coverImageUrl: null,
    isDemo: false,
    createdAt: now,
    updatedAt: now,
  };

  const divPrimeraId = makeId('div_f_prim');
  const divSub17Id = makeId('div_f_sub17');

  const baseItfCompat = {
    edition: ITF_EDITION_LABEL,
    setsToWin: 1 as const,
    gamesPerSet: 6 as const,
    tiebreakAt: 6 as const,
    useTiebreak: false,
    decisivePointNoAd: false,
    matchTiebreakThirdSet: false,
    matchTiebreakPoints: 10 as const,
  };

  const divPrimera: Division = {
    id: divPrimeraId,
    tournamentId,
    sport: 'football',
    footballFormat: 'futbol_11',
    fifaConfig: createDefaultFifaConfig('futbol_11'),
    name: 'Primera División · Fútbol 11 Masculino',
    category: 'Primera',
    modality: 'Equipo',
    gender: 'Masculino',
    format: 'grupos_clasificatoria_final',
    allowMultiDivision: false,
    maxEntries: 16,
    itfConfig: baseItfCompat,
    drawConfig: {
      groupCount: 2,
      qualifiersPerGroup: 2,
      seedingEnabled: true,
      pointsWin: 3,
      pointsLoss: 0,
      pointsWoWin: 3,
      pointsWoLoss: 0,
      tiebreakers: ['points', 'games_diff', 'head_to_head', 'draw'],
      woHandlingNote: 'Victoria FIFA: 3 pts, Empate: 1 pt, Derrota: 0 pts. W.O. otorga 3-0.',
    },
    drawStatus: 'publicado',
    hasThirdPlaceMatch: true,
    createdAt: now,
    updatedAt: now,
  };

  const divSub17: Division = {
    id: divSub17Id,
    tournamentId,
    sport: 'football',
    footballFormat: 'futbol_7',
    fifaConfig: createDefaultFifaConfig('futbol_7'),
    name: 'Sub-17 · Fútbol 7 Juvenil',
    category: 'Sub-17',
    modality: 'Equipo',
    gender: 'Masculino',
    format: 'grupos_y_final',
    allowMultiDivision: false,
    maxEntries: 12,
    itfConfig: baseItfCompat,
    drawConfig: {
      groupCount: 1,
      qualifiersPerGroup: 4,
      seedingEnabled: true,
      pointsWin: 3,
      pointsLoss: 0,
      pointsWoWin: 3,
      pointsWoLoss: 0,
      tiebreakers: ['points', 'games_diff', 'head_to_head', 'draw'],
      woHandlingNote: 'Liga Sub-17 con clasificación a semifinales FIFA.',
    },
    drawStatus: 'sin_sorteo',
    hasThirdPlaceMatch: true,
    createdAt: now,
    updatedAt: now,
  };

  const playersPublic: PlayerPublic[] = [];
  const playersPrivate: PlayerPrivate[] = [];
  const registrations: Registration[] = [];

  const rosterBlueprint: Array<{ dorsal: number; pos: FootballPosition }> = [
    { dorsal: 1, pos: 'Arquero' },
    { dorsal: 2, pos: 'Defensor' },
    { dorsal: 4, pos: 'Defensor' },
    { dorsal: 5, pos: 'Mediocampista' },
    { dorsal: 8, pos: 'Mediocampista' },
    { dorsal: 10, pos: 'Mediocampista' },
    { dorsal: 9, pos: 'Delantero' },
    { dorsal: 11, pos: 'Delantero' },
    { dorsal: 12, pos: 'Arquero' },
    { dorsal: 7, pos: 'Delantero' },
  ];

  const playersByTeamId = new Map<string, PlayerPublic[]>();

  TEAM_TEMPLATES.forEach((tpl, tIdx) => {
    const regId = makeId(`team_${tIdx}`);
    const teamPids: string[] = [];
    const teamPlayers: PlayerPublic[] = [];

    rosterBlueprint.forEach((slot, pIdx) => {
      const pid = makeId(`fpl_${tIdx}_${pIdx}`);
      const firstName = FIRST_NAMES[(tIdx * 3 + pIdx) % FIRST_NAMES.length];
      const lastName = LAST_NAMES[(tIdx * 5 + pIdx * 2) % LAST_NAMES.length];
      const fullName = `${firstName} ${lastName}`;

      const playerObj: PlayerPublic = {
        id: pid,
        tournamentId,
        sport: 'football',
        teamId: regId,
        jerseyNumber: slot.dorsal,
        position: slot.pos,
        preferredFoot: pIdx % 4 === 0 ? 'Zurdo' : 'Derecho',
        firstName,
        lastName,
        fullName,
        club: tpl.name,
        habitualCategory: 'Primera',
        gender: 'Masculino',
        dominantHand: 'Diestro',
        backhand: 'Dos manos',
        stats: {
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          setsWon: 0,
          setsLost: 0,
          gamesWon: 0,
          gamesLost: 0,
          titles: 0,
          currentStreak: 0,
        },
        createdAt: now,
        updatedAt: now,
      };
      playersPublic.push(playerObj);
      playersPrivate.push({
        id: pid,
        playerId: pid,
        tournamentId,
        documentNumber: `4${tIdx}${pIdx}28${pIdx}`,
        birthDate: '2001-05-14',
        phone: `+595 981 50${tIdx}${pIdx}00`,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${tIdx}@playpy.demo`,
        updatedAt: now,
      });
      teamPids.push(pid);
      teamPlayers.push(playerObj);
    });

    playersByTeamId.set(regId, teamPlayers);

    registrations.push({
      id: regId,
      tournamentId,
      divisionId: divPrimeraId,
      modality: 'Equipo',
      playerIds: teamPids,
      displayName: tpl.name,
      teamShortName: tpl.short,
      coachName: tpl.coach,
      primaryColor: tpl.color,
      club: tpl.name,
      seed: tIdx < 4 ? tIdx + 1 : null,
      status: 'confirmada',
      registeredAt: now,
      updatedAt: now,
    });
  });

  // Generar grupos + fixture de Primera División
  const { groups, matches: groupMatches } = generateFootballGroupsDrawPreview(
    registrations,
    divPrimera
  );
  groups.forEach((g) => {
    g.published = true;
    g.entryIds.forEach((eid) => {
      const reg = registrations.find((r) => r.id === eid);
      if (reg) reg.groupId = g.id;
    });
  });

  // Cargar resultados y Planillas de Juego reales en las Fechas 1 y 2 para demostrar Goleadores, Valla Menos Vendida y Posiciones
  const matchday1: Matchday = {
    id: makeId('fmd1'),
    tournamentId,
    divisionId: divPrimeraId,
    name: 'Jornada 1 · Fase de Grupos',
    date: '2026-11-28',
    order: 1,
    description: 'Fecha inaugural con planillas oficiales FIFA.',
    galleryPublished: true,
    createdAt: now,
    updatedAt: now,
  };
  const matchday2: Matchday = {
    id: makeId('fmd2'),
    tournamentId,
    divisionId: divPrimeraId,
    name: 'Jornada 2 · Fase de Grupos',
    date: '2026-12-05',
    order: 2,
    description: 'Segunda fecha de grupos.',
    galleryPublished: true,
    createdAt: now,
    updatedAt: now,
  };

  groupMatches.forEach((m, idx) => {
    m.published = true;
    m.matchdayId = m.roundOrder === 1 ? matchday1.id : m.roundOrder === 2 ? matchday2.id : null;
    m.courtId = tournament.courts[idx % tournament.courts.length].id;
    m.courtName = tournament.courts[idx % tournament.courts.length].name;
    m.scheduledDate = m.roundOrder === 1 ? '2026-11-28' : m.roundOrder === 2 ? '2026-12-05' : '2026-12-12';
    m.scheduledTime = idx % 2 === 0 ? '16:00' : '18:30';

    const teamAPlayers = (m.entryAId && playersByTeamId.get(m.entryAId)) || [];
    const teamBPlayers = (m.entryBId && playersByTeamId.get(m.entryBId)) || [];
    const gkA = teamAPlayers.find((p) => p.position === 'Arquero') || teamAPlayers[0];
    const gkB = teamBPlayers.find((p) => p.position === 'Arquero') || teamBPlayers[0];

    const lineupA = teamAPlayers.map((p, i) => ({
      playerId: p.id,
      fullName: p.fullName,
      jerseyNumber: p.jerseyNumber ?? i + 1,
      position: p.position || 'Mediocampista',
      isStarter: i < 7,
      isCaptain: i === 5,
    }));
    const lineupB = teamBPlayers.map((p, i) => ({
      playerId: p.id,
      fullName: p.fullName,
      jerseyNumber: p.jerseyNumber ?? i + 1,
      position: p.position || 'Mediocampista',
      isStarter: i < 7,
      isCaptain: i === 5,
    }));

    if (m.roundOrder <= 2) {
      const presets: Array<[number, number]> = [
        [2, 0],
        [1, 1],
        [3, 1],
        [0, 1],
      ];
      const [gA, gB] = presets[idx % presets.length];
      m.status = 'finalizado';
      m.footballScore = {
        goalsA: gA,
        goalsB: gB,
        halfTimeA: gA > 0 ? 1 : 0,
        halfTimeB: gB > 0 ? 1 : 0,
        decidedBy: 'regular',
      };
      m.winnerEntryId = gA > gB ? m.entryAId || null : gB > gA ? m.entryBId || null : null;
      m.winnerName = gA > gB ? m.entryAName : gB > gA ? m.entryBName : 'Empate';

      const events: NonNullable<Match['footballSheet']>['events'] = [];
      const fwA = teamAPlayers.filter((p) => p.position === 'Delantero' || p.position === 'Mediocampista');
      const fwB = teamBPlayers.filter((p) => p.position === 'Delantero' || p.position === 'Mediocampista');

      for (let g = 0; g < gA; g++) {
        const scorer = fwA[g % fwA.length] || teamAPlayers[0];
        const assister = fwA[(g + 1) % fwA.length];
        if (scorer) {
          events.push({
            id: makeId('ev'),
            teamSide: 'A',
            minute: 18 + g * 24,
            type: g === 1 ? 'penal' : 'gol',
            playerId: scorer.id,
            playerName: scorer.fullName,
            assistPlayerId: g !== 1 && assister && assister.id !== scorer.id ? assister.id : null,
            assistPlayerName: g !== 1 && assister && assister.id !== scorer.id ? assister.fullName : null,
          });
        }
      }
      for (let g = 0; g < gB; g++) {
        const scorer = fwB[g % fwB.length] || teamBPlayers[0];
        if (scorer) {
          events.push({
            id: makeId('ev'),
            teamSide: 'B',
            minute: 34 + g * 28,
            type: 'gol',
            playerId: scorer.id,
            playerName: scorer.fullName,
            assistPlayerId: null,
            assistPlayerName: null,
          });
        }
      }

      if (teamAPlayers[2]) {
        events.push({
          id: makeId('ev'),
          teamSide: 'A',
          minute: 57,
          type: 'amarilla',
          playerId: teamAPlayers[2].id,
          playerName: teamAPlayers[2].fullName,
        });
      }
      if (teamBPlayers[3]) {
        events.push({
          id: makeId('ev'),
          teamSide: 'B',
          minute: 72,
          type: 'amarilla',
          playerId: teamBPlayers[3].id,
          playerName: teamBPlayers[3].fullName,
        });
      }

      m.footballSheet = {
        referee: idx % 2 === 0 ? 'Derlis López (FIFA)' : 'Juan Gabriel Benítez',
        assistantRef1: 'Eduardo Cardozo',
        assistantRef2: 'Milciades Saldívar',
        fourthOfficial: 'Carlos Paul Benítez',
        attendance: 480 + idx * 65,
        notes: 'Planilla oficial verificada sin incidentes.',
        lineupA,
        lineupB,
        goalkeeperAId: gkA?.id || null,
        goalkeeperAName: gkA?.fullName || null,
        goalkeeperBId: gkB?.id || null,
        goalkeeperBName: gkB?.fullName || null,
        events,
        substitutions:
          teamAPlayers[6] && teamAPlayers[9]
            ? [
                {
                  id: makeId('sub'),
                  teamSide: 'A',
                  minute: 68,
                  playerOutId: teamAPlayers[6].id,
                  playerOutName: teamAPlayers[6].fullName,
                  playerInId: teamAPlayers[9].id,
                  playerInName: teamAPlayers[9].fullName,
                },
              ]
            : [],
        signedByReferee: true,
        signedAt: now,
      };
    } else {
      m.footballSheet = {
        referee: null,
        lineupA,
        lineupB,
        goalkeeperAId: gkA?.id || null,
        goalkeeperAName: gkA?.fullName || null,
        goalkeeperBId: gkB?.id || null,
        goalkeeperBName: gkB?.fullName || null,
        events: [],
        substitutions: [],
        signedByReferee: false,
        signedAt: null,
      };
    }
  });

  // Recalcular standings iniciales de grupos
  groups.forEach((g) => {
    g.standings = computeFootballGroupStandings(g, groupMatches, registrations, divPrimera);
  });

  // Sugerir llaves de Fase Clasificatoria (Play-In) ya listas para disputar
  const qualifyingPairs = suggestFootballQualifyingPairs(
    groups,
    groupMatches,
    registrations,
    divPrimera
  );
  const qualifyingMatches = generateFootballQualifyingMatches(qualifyingPairs, divPrimera, 10).map(
    (qm, idx) => ({
      ...qm,
      published: true,
      scheduledDate: '2026-12-15',
      scheduledTime: idx === 0 ? '18:00' : '20:15',
      courtId: tournament.courts[0].id,
      courtName: tournament.courts[0].name,
    })
  );

  return {
    tournament,
    divisions: [divPrimera, divSub17],
    playersPublic,
    playersPrivate,
    registrations,
    groups,
    matchdays: [matchday1, matchday2],
    matches: [...groupMatches, ...qualifyingMatches],
  };
}

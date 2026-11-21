export type UserRole = 'superadmin' | 'organizador' | 'operador';

export interface StaffRole {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  assignedTournamentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Court {
  id: string;
  name: string;
  surface: 'Polvo de ladrillo' | 'Cemento' | 'Césped sintético';
  lights: boolean;
}

export type TournamentStatus = 'borrador' | 'inscripciones' | 'en_curso' | 'finalizado';

export interface Tournament {
  id: string;
  name: string;
  organizerName: string;
  organizerUid: string;
  venue: string;
  city: string;
  timezone: string; // 'America/Asuncion'
  courts: Court[];
  startDate: string; // YYYY-MM-DD
  endDate: string;
  regStartDate: string;
  regEndDate: string;
  minRestMinutes: number;
  itfEdition: string; // 'ITF 2026'
  status: TournamentStatus;
  coverImageUrl?: string | null;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type Modality = 'Singles' | 'Dobles';
export type Gender = 'Femenino' | 'Masculino';
export type DivisionFormat = 'todos_contra_todos' | 'grupos_y_final' | 'eliminacion_directa';
export type DrawStatus = 'sin_sorteo' | 'borrador' | 'publicado';

export interface ItfScoringConfig {
  edition: string; // e.g. 'ITF 2026'
  setsToWin: 1 | 2 | 3; // 1 = set único, 2 = mejor de 3, 3 = mejor de 5
  gamesPerSet: 4 | 6 | 8; // 6 estándar, 4 Fast4, 8 pro-set
  tiebreakAt: 3 | 6 | 7; // tie-break en 6-6 (o 3-3 en Fast4, 7-7 en pro-set)
  useTiebreak: boolean;
  decisivePointNoAd: boolean; // Punto decisivo sin ventaja
  matchTiebreakThirdSet: boolean; // Match tie-break en set decisivo
  matchTiebreakPoints: 7 | 10; // A 10 puntos (estándar) o 7
  setTiebreakPoints?: 7 | 10; // Puntos del tie-break dentro del set (7 ITF o 10)
  tiebreakExactTarget?: boolean; // Gana el primero en llegar a 7 o 10 sin diferencia de 2 (ej. 10-9)
  directTiebreakMatch?: boolean; // Partido definido directamente por tie-break a 10 puntos
  optionalSetScores?: boolean; // Permitir confirmar ganador sin cargar detalle de games por set
}

export type TiebreakerCriterion =
  | 'points'
  | 'head_to_head'
  | 'sets_pct'
  | 'sets_diff'
  | 'games_pct'
  | 'games_diff'
  | 'draw';

export interface DrawConfig {
  groupCount: number;
  qualifiersPerGroup: number;
  seedingEnabled: boolean;
  pointsWin: number;
  pointsLoss: number;
  pointsWoWin: number;
  pointsWoLoss: number;
  tiebreakers: TiebreakerCriterion[];
  woHandlingNote: string;
}

export interface Division {
  id: string;
  tournamentId: string;
  name: string; // e.g. '5ta Singles Masculino'
  category: string; // '6ta' | '5ta' | '4ta' | '3ra' | '2da' | '1ra' | 'Libre' | 'Senior' | custom
  modality: Modality;
  gender: Gender;
  format: DivisionFormat;
  allowMultiDivision: boolean;
  maxEntries: number;
  itfConfig: ItfScoringConfig;
  drawConfig: DrawConfig;
  drawStatus: DrawStatus;
  hasThirdPlaceMatch?: boolean;
  championEntryId?: string | null;
  championName?: string | null;
  runnerUpName?: string | null;
  thirdPlaceEntryId?: string | null;
  thirdPlaceName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerStats {
  matchesPlayed: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  titles: number;
  currentStreak: number;
}

export interface PlayerPublic {
  id: string;
  tournamentId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  club: string;
  habitualCategory: string;
  gender: Gender;
  dominantHand: 'Diestro' | 'Zurdo';
  backhand: 'Una mano' | 'Dos manos';
  bio?: string;
  photoUrl?: string | null;
  stats: PlayerStats;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerPrivate {
  id: string;
  playerId: string;
  tournamentId: string;
  documentNumber: string;
  birthDate: string;
  phone: string;
  email: string;
  updatedAt: string;
}

export type RegistrationStatus = 'pendiente' | 'confirmada' | 'en_lista_de_espera' | 'retirada';

export interface Registration {
  id: string;
  tournamentId: string;
  divisionId: string;
  modality: Modality;
  playerIds: string[];
  displayName: string;
  club?: string;
  seed?: number | null;
  status: RegistrationStatus;
  groupId?: string | null;
  registeredAt: string;
  updatedAt: string;
}

export interface StandingRow {
  entryId: string;
  displayName: string;
  club?: string;
  seed?: number | null;
  played: number;
  won: number;
  lost: number;
  setsWon: number;
  setsLost: number;
  setsDiff: number;
  gamesWon: number;
  gamesLost: number;
  gamesDiff: number;
  points: number;
  woLosses: number;
  qualified?: boolean;
}

export interface Group {
  id: string;
  tournamentId: string;
  divisionId: string;
  name: string;
  entryIds: string[];
  standings: StandingRow[];
  published: boolean;
  updatedAt: string;
}

export interface Matchday {
  id: string;
  tournamentId: string;
  divisionId: string;
  name: string;
  date: string; // YYYY-MM-DD
  order: number;
  description?: string;
  galleryPublished: boolean;
  coverPhotoId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SetScore {
  a: number;
  b: number;
  tbA?: number | null;
  tbB?: number | null;
  isMatchTiebreak?: boolean;
}

export type MatchStatus =
  | 'programado'
  | 'en_curso'
  | 'finalizado'
  | 'wo'
  | 'retiro'
  | 'descalificado'
  | 'reprogramado';

export interface CorrectionRecord {
  id: string;
  at: string;
  byEmail: string;
  reason: string;
  previousScore: string;
  newScore: string;
  previousWinnerId?: string | null;
  newWinnerId?: string | null;
}

export interface RescheduleRecord {
  id: string;
  at: string;
  byEmail: string;
  reason: string;
  fromDate: string | null;
  fromTime: string | null;
  fromCourt: string | null;
  toDate: string;
  toTime: string;
  toCourt: string;
}

export interface Match {
  id: string;
  tournamentId: string;
  divisionId: string;
  matchdayId?: string | null;
  phase: 'grupos' | 'eliminacion';
  roundName: string;
  roundOrder: number;
  bracketPosition?: number | null;
  nextMatchId?: string | null;
  nextMatchSlot?: 'A' | 'B' | null;
  isThirdPlace?: boolean;
  groupId?: string | null;
  entryAId?: string | null;
  entryAName: string;
  playerIdsA: string[];
  entryBId?: string | null;
  entryBName: string;
  playerIdsB: string[];
  isBye: boolean;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  courtId?: string | null;
  courtName?: string | null;
  status: MatchStatus;
  sets: SetScore[];
  winnerEntryId?: string | null;
  winnerName?: string | null;
  outcomeNote?: string | null;
  correctionHistory: CorrectionRecord[];
  rescheduleHistory: RescheduleRecord[];
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MatchdayPhoto {
  id: string;
  tournamentId: string;
  divisionId: string;
  matchdayId: string;
  matchId?: string | null;
  thumbUrl: string;
  fullUrl: string;
  caption?: string;
  order: number;
  isCover: boolean;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationAlert {
  id: string;
  tournamentId: string;
  divisionId?: string;
  matchId?: string;
  title: string;
  body: string;
  targetPlayerIds: string[];
  createdAt: string;
}

export type AdPlacement = 'banner_principal' | 'lateral' | 'pie';

export interface TournamentAd {
  id: string;
  tournamentId: string;
  sponsorName: string;
  title: string;
  subtitle?: string | null;
  imageUrl: string;
  horizontalImageUrl?: string | null;
  verticalImageUrl?: string | null;
  aiPrompt?: string | null;
  targetUrl?: string | null;
  placement: AdPlacement;
  order: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}


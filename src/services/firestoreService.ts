import {
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  Query,
  QueryConstraint,
  QueryDocumentSnapshot,
  setDoc,
  startAfter,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { buildDemoBundle } from '../data/demoSeed';
import {
  Division,
  Group,
  Match,
  Matchday,
  MatchdayPhoto,
  NotificationAlert,
  PlayerPrivate,
  PlayerPublic,
  Registration,
  SiteLandingConfig,
  StaffInvite,
  StaffRole,
  Tournament,
  TournamentAd,
  TournamentTrophy,
} from '../types/tennis';
import { buildStaffInviteId, normalizePermissions } from '../utils/rbac';

const DEFAULT_QUERY_LIMIT = 500;

function subscribeWithResilience<T>(
  q: Query<DocumentData>,
  collectionName: string,
  onData: (items: T[]) => void
): () => void {
  let disposed = false;
  let retryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let currentUnsub: (() => void) | null = null;

  const clearRetry = () => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const attach = () => {
    if (disposed) return;
    currentUnsub?.();
    currentUnsub = onSnapshot(
      q,
      (snapshot) => {
        retryCount = 0;
        const data = snapshot.docs.map((d) => d.data() as T);
        onData(data);
      },
      (error) => {
        // Silenciar fallos iniciales si todavía no hay sesión para colecciones privadas
        if (
          collectionName === 'photos_drafts' ||
          collectionName === 'players_private' ||
          collectionName === 'staff_roles'
        ) {
          console.warn(`Lectura restringida en ${collectionName}:`, error.message);
          onData([]);
          return;
        }
        const errCode = (error as { code?: string }).code;
        const isTransient =
          errCode === 'unavailable' ||
          errCode === 'aborted' ||
          errCode === 'deadline-exceeded' ||
          /offline|unavailable|network/i.test(error.message);

        if (isTransient) {
          if (!disposed) {
            const delayMs = Math.min(30000, 2000 * Math.pow(2, retryCount));
            retryCount += 1;
            clearRetry();
            retryTimer = setTimeout(() => {
              if (!disposed) attach();
            }, delayMs);
          }
          return;
        }

        handleFirestoreError(error, OperationType.LIST, collectionName);
      }
    );
  };

  const handleOnline = () => {
    if (disposed) return;
    clearRetry();
    retryCount = 0;
    attach();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
  }

  attach();

  return () => {
    disposed = true;
    clearRetry();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
    }
    currentUnsub?.();
    currentUnsub = null;
  };
}

export function subscribeCollection<T>(
  collectionName: string,
  onData: (items: T[]) => void,
  onlyPublishedFilter = false,
  maxLimit = DEFAULT_QUERY_LIMIT
): () => void {
  const colRef = collection(db, collectionName);
  const constraints: QueryConstraint[] = [];
  if (onlyPublishedFilter) {
    constraints.push(where('published', '==', true));
  }
  constraints.push(limit(Math.min(maxLimit, DEFAULT_QUERY_LIMIT)));
  const q = query(colRef, ...constraints);
  return subscribeWithResilience<T>(q, collectionName, onData);
}

export function subscribeTournamentCollection<T>(
  collectionName: string,
  tournamentId: string,
  onData: (items: T[]) => void,
  maxLimit = DEFAULT_QUERY_LIMIT
): () => void {
  if (!tournamentId) {
    onData([]);
    return () => {};
  }
  const q = query(
    collection(db, collectionName),
    where('tournamentId', '==', tournamentId),
    limit(Math.min(maxLimit, DEFAULT_QUERY_LIMIT))
  );
  return subscribeWithResilience<T>(q, collectionName, onData);
}

export async function fetchCollectionLimited<T>(
  collectionName: string,
  maxLimit = 200,
  extraConstraints: QueryConstraint[] = []
): Promise<T[]> {
  try {
    const q = query(
      collection(db, collectionName),
      ...extraConstraints,
      limit(Math.min(maxLimit, DEFAULT_QUERY_LIMIT))
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as T);
  } catch (err) {
    console.warn(`Error al consultar ${collectionName}:`, err);
    return [];
  }
}

export async function fetchSiteSettingsOnce(): Promise<SiteLandingConfig[]> {
  return fetchCollectionLimited<SiteLandingConfig>('site_settings', 5);
}

export async function fetchTournamentsOnce(): Promise<Tournament[]> {
  return fetchCollectionLimited<Tournament>('tournaments', 50);
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export async function fetchPaginatedPlayersByTournament(params: {
  tournamentId: string;
  pageSize?: number;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
}): Promise<PaginatedResult<PlayerPublic>> {
  const { tournamentId, pageSize = 18, cursor = null } = params;
  if (!tournamentId) {
    return { items: [], nextCursor: null, hasMore: false };
  }
  const safeSize = Math.min(Math.max(1, pageSize), 100);
  const constraints: QueryConstraint[] = [where('tournamentId', '==', tournamentId)];
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(safeSize + 1));

  const snap = await getDocs(query(collection(db, 'players_public'), ...constraints));
  const hasMore = snap.docs.length > safeSize;
  const pageDocs = hasMore ? snap.docs.slice(0, safeSize) : snap.docs;
  return {
    items: pageDocs.map((d) => d.data() as PlayerPublic),
    nextCursor: hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null,
    hasMore,
  };
}

export async function fetchPaginatedPublishedPhotos(params: {
  pageSize?: number;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
}): Promise<PaginatedResult<MatchdayPhoto>> {
  const { pageSize = 24, cursor = null } = params;
  const safeSize = Math.min(Math.max(1, pageSize), 100);
  const constraints: QueryConstraint[] = [where('published', '==', true)];
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(safeSize + 1));

  const snap = await getDocs(query(collection(db, 'photos'), ...constraints));
  const hasMore = snap.docs.length > safeSize;
  const pageDocs = hasMore ? snap.docs.slice(0, safeSize) : snap.docs;
  return {
    items: pageDocs.map((d) => d.data() as MatchdayPhoto),
    nextCursor: hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null,
    hasMore,
  };
}

export function formatFirestoreError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err || '');
  let detail = raw;
  try {
    const parsed = JSON.parse(raw) as { error?: string; path?: string | null };
    if (parsed?.error) detail = parsed.error;
  } catch {
    // No era JSON estructurado
  }
  const lower = detail.toLowerCase();
  if (lower.includes('permission_denied') || lower.includes('insufficient permissions')) {
    return 'No se pudo guardar en Firestore por permisos o validación de campos. Verificá tu sesión y los permisos asignados a tu rol.';
  }
  if (lower.includes('unavailable') || lower.includes('offline')) {
    return 'No hay conexión con Firestore en este momento. Verificá tu conexión e intentá nuevamente.';
  }
  return detail || fallback;
}

export async function saveEntity<T extends { id: string }>(
  collectionName: string,
  entity: T
): Promise<void> {
  const path = `${collectionName}/${entity.id}`;
  try {
    await setDoc(doc(db, collectionName, entity.id), entity);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function removeEntity(collectionName: string, id: string): Promise<void> {
  const path = `${collectionName}/${id}`;
  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

async function deleteDocsInBatches(targets: Array<{ col: string; id: string }>): Promise<void> {
  if (targets.length === 0) return;
  for (let i = 0; i < targets.length; i += 400) {
    const batch = writeBatch(db);
    targets.slice(i, i + 400).forEach((t) => {
      batch.delete(doc(db, t.col, t.id));
    });
    await batch.commit();
  }
}

export async function deleteMatchesBatch(matchIds: string[]): Promise<void> {
  if (matchIds.length === 0) return;
  try {
    await deleteDocsInBatches(matchIds.map((id) => ({ col: 'matches', id })));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'matches/batch');
  }
}

export async function deleteGroupsBatch(groupIds: string[]): Promise<void> {
  if (groupIds.length === 0) return;
  try {
    await deleteDocsInBatches(groupIds.map((id) => ({ col: 'groups', id })));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'groups/batch');
  }
}

export async function deletePlayerCascade(playerId: string): Promise<void> {
  try {
    await deleteDocsInBatches([
      { col: 'players_private', id: playerId },
      { col: 'players_public', id: playerId },
    ]);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `players_public/${playerId}`);
  }
}

export async function deleteMatchdayCascade(
  matchdayId: string,
  divisionMatches: Match[],
  publishedPhotos: MatchdayPhoto[],
  draftPhotos: MatchdayPhoto[]
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const affectedMatches = divisionMatches.filter((m) => m.matchdayId === matchdayId);
    for (const m of affectedMatches) {
      await saveEntity('matches', { ...m, matchdayId: null, updatedAt: now });
    }
    const photoTargets = [
      ...publishedPhotos.filter((p) => p.matchdayId === matchdayId).map((p) => ({ col: 'photos', id: p.id })),
      ...draftPhotos.filter((p) => p.matchdayId === matchdayId).map((p) => ({ col: 'photos_drafts', id: p.id })),
    ];
    await deleteDocsInBatches([...photoTargets, { col: 'matchdays', id: matchdayId }]);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `matchdays/${matchdayId}`);
  }
}

export async function deleteDivisionCascade(
  divisionId: string,
  ctx: {
    registrations: Registration[];
    groups: Group[];
    matchdays: Matchday[];
    matches: Match[];
    publishedPhotos: MatchdayPhoto[];
    draftPhotos: MatchdayPhoto[];
    tournamentTrophies?: TournamentTrophy[];
  }
): Promise<void> {
  try {
    const targets: Array<{ col: string; id: string }> = [
      ...ctx.publishedPhotos.filter((p) => p.divisionId === divisionId).map((p) => ({ col: 'photos', id: p.id })),
      ...ctx.draftPhotos.filter((p) => p.divisionId === divisionId).map((p) => ({ col: 'photos_drafts', id: p.id })),
      ...ctx.matches.filter((m) => m.divisionId === divisionId).map((m) => ({ col: 'matches', id: m.id })),
      ...ctx.matchdays.filter((md) => md.divisionId === divisionId).map((md) => ({ col: 'matchdays', id: md.id })),
      ...ctx.groups.filter((g) => g.divisionId === divisionId).map((g) => ({ col: 'groups', id: g.id })),
      ...ctx.registrations.filter((r) => r.divisionId === divisionId).map((r) => ({ col: 'registrations', id: r.id })),
      ...(ctx.tournamentTrophies || [])
        .filter((tr) => tr.divisionId === divisionId)
        .map((tr) => ({ col: 'tournament_trophies', id: tr.id })),
      { col: 'divisions', id: divisionId },
    ];
    await deleteDocsInBatches(targets);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `divisions/${divisionId}`);
  }
}

export async function deleteTournamentCascade(
  tournamentId: string,
  ctx: {
    divisions: Division[];
    players: PlayerPublic[];
    registrations: Registration[];
    groups: Group[];
    matchdays: Matchday[];
    matches: Match[];
    publishedPhotos: MatchdayPhoto[];
    draftPhotos: MatchdayPhoto[];
    notifications: NotificationAlert[];
    tournamentAds: TournamentAd[];
    tournamentTrophies?: TournamentTrophy[];
  }
): Promise<void> {
  try {
    const tPlayers = ctx.players.filter((p) => p.tournamentId === tournamentId);
    const targets: Array<{ col: string; id: string }> = [
      ...ctx.publishedPhotos.filter((p) => p.tournamentId === tournamentId).map((p) => ({ col: 'photos', id: p.id })),
      ...ctx.draftPhotos.filter((p) => p.tournamentId === tournamentId).map((p) => ({ col: 'photos_drafts', id: p.id })),
      ...ctx.notifications.filter((n) => n.tournamentId === tournamentId).map((n) => ({ col: 'notifications', id: n.id })),
      ...ctx.matches.filter((m) => m.tournamentId === tournamentId).map((m) => ({ col: 'matches', id: m.id })),
      ...ctx.matchdays.filter((md) => md.tournamentId === tournamentId).map((md) => ({ col: 'matchdays', id: md.id })),
      ...ctx.groups.filter((g) => g.tournamentId === tournamentId).map((g) => ({ col: 'groups', id: g.id })),
      ...ctx.registrations.filter((r) => r.tournamentId === tournamentId).map((r) => ({ col: 'registrations', id: r.id })),
      ...tPlayers.map((p) => ({ col: 'players_private', id: p.id })),
      ...tPlayers.map((p) => ({ col: 'players_public', id: p.id })),
      ...ctx.tournamentAds.filter((a) => a.tournamentId === tournamentId).map((a) => ({ col: 'tournament_ads', id: a.id })),
      ...(ctx.tournamentTrophies || [])
        .filter((tr) => tr.tournamentId === tournamentId)
        .map((tr) => ({ col: 'tournament_trophies', id: tr.id })),
      ...ctx.divisions.filter((d) => d.tournamentId === tournamentId).map((d) => ({ col: 'divisions', id: d.id })),
      { col: 'tournaments', id: tournamentId },
    ];
    await deleteDocsInBatches(targets);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `tournaments/${tournamentId}`);
  }
}

export async function fetchStaffRole(uid: string): Promise<StaffRole | null> {
  try {
    const snap = await getDoc(doc(db, 'staff_roles', uid));
    return snap.exists() ? (snap.data() as StaffRole) : null;
  } catch (error) {
    console.warn('Error al leer staff_role:', error);
    return null;
  }
}

export async function fetchPlayersPrivateByTournament(
  tournamentId: string
): Promise<Record<string, PlayerPrivate>> {
  if (!tournamentId) return {};
  try {
    const q = query(
      collection(db, 'players_private'),
      where('tournamentId', '==', tournamentId),
      limit(DEFAULT_QUERY_LIMIT)
    );
    const snap = await getDocs(q);
    const result: Record<string, PlayerPrivate> = {};
    snap.docs.forEach((d) => {
      const priv = d.data() as PlayerPrivate;
      if (priv?.playerId) {
        result[priv.playerId] = priv;
      }
    });
    return result;
  } catch (err) {
    console.warn(`No se pudo obtener PII del torneo ${tournamentId}:`, err);
    return {};
  }
}

export async function fetchAllPlayersPrivate(playerIds: string[]): Promise<Record<string, PlayerPrivate>> {
  const result: Record<string, PlayerPrivate> = {};
  await Promise.all(
    playerIds.map(async (pid) => {
      try {
        const snap = await getDoc(doc(db, 'players_private', pid));
        if (snap.exists()) {
          result[pid] = snap.data() as PlayerPrivate;
        }
      } catch (err) {
        console.warn(`No se pudo obtener PII de ${pid}:`, err);
      }
    })
  );
  return result;
}

export async function saveStaffRole(staff: StaffRole): Promise<void> {
  const path = `staff_roles/${staff.uid}`;
  try {
    await setDoc(doc(db, 'staff_roles', staff.uid), staff);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchAllStaffRoles(): Promise<StaffRole[]> {
  try {
    const snap = await getDocs(query(collection(db, 'staff_roles'), limit(250)));
    return snap.docs.map((d) => d.data() as StaffRole);
  } catch (error) {
    console.warn('Error al listar staff_roles:', error);
    return [];
  }
}

export async function deleteStaffRole(uid: string): Promise<void> {
  const path = `staff_roles/${uid}`;
  try {
    await deleteDoc(doc(db, 'staff_roles', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchStaffInvites(): Promise<StaffInvite[]> {
  try {
    const snap = await getDocs(query(collection(db, 'staff_invites'), limit(250)));
    return snap.docs.map((d) => d.data() as StaffInvite);
  } catch (error) {
    console.warn('Error al listar staff_invites:', error);
    return [];
  }
}

export async function findStaffInviteByEmail(email: string): Promise<StaffInvite | null> {
  const lower = email.trim().toLowerCase();
  if (!lower) return null;
  const inviteId = buildStaffInviteId(lower);
  try {
    const snap = await getDoc(doc(db, 'staff_invites', inviteId));
    if (snap.exists()) {
      return snap.data() as StaffInvite;
    }
    return null;
  } catch (error) {
    console.warn('Error al buscar invitación de staff:', error);
    return null;
  }
}

export async function saveStaffInvite(invite: StaffInvite): Promise<void> {
  const path = `staff_invites/${invite.id}`;
  try {
    await setDoc(doc(db, 'staff_invites', invite.id), invite);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteStaffInvite(inviteId: string): Promise<void> {
  const path = `staff_invites/${inviteId}`;
  try {
    await deleteDoc(doc(db, 'staff_invites', inviteId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function claimStaffInvite(
  user: { uid: string; email?: string | null; displayName?: string | null },
  invite: StaffInvite
): Promise<StaffRole> {
  const now = new Date().toISOString();
  const normalizedPerms = normalizePermissions(invite.role, invite.permissions);
  const roleDoc: StaffRole = {
    uid: user.uid,
    email: user.email || invite.email,
    displayName: user.displayName || invite.displayName,
    role: invite.role,
    assignedTournamentIds: invite.assignedTournamentIds,
    allTournaments: invite.allTournaments,
    active: invite.active,
    permissions: normalizedPerms,
    inviteId: invite.id,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'staff_roles', user.uid), roleDoc);
  try {
    await setDoc(doc(db, 'staff_invites', invite.id), {
      ...invite,
      claimedUid: user.uid,
      updatedAt: now,
    });
  } catch (err) {
    console.warn('Invitación reclamada, aviso al actualizar claimedUid:', err);
  }
  return roleDoc;
}

export async function fetchDraftPhotosForAdmin(): Promise<MatchdayPhoto[]> {
  try {
    const q = query(collection(db, 'photos_drafts'), where('published', '==', false), limit(250));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as MatchdayPhoto);
  } catch {
    return [];
  }
}

export async function fetchPublishedMatchesFromFirestore(maxLimit = 250): Promise<Match[]> {
  try {
    const q = query(
      collection(db, 'matches'),
      where('published', '==', true),
      limit(Math.min(maxLimit, DEFAULT_QUERY_LIMIT))
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Match);
  } catch (err) {
    console.warn('No se pudieron consultar partidos desde Firestore:', err);
    return [];
  }
}

export async function seedDemoTournamentsToFirestore(adminUid: string, force = false): Promise<boolean> {
  try {
    const existing = await getDocs(query(collection(db, 'tournaments'), limit(5)));
    if (!force && !existing.empty) {
      return false;
    }

    const bundle = buildDemoBundle(adminUid);

    const commitLayer = async (ops: Array<{ col: string; id: string; data: unknown }>) => {
      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db);
        ops.slice(i, i + 400).forEach((item) => {
          batch.set(doc(db, item.col, item.id), item.data);
        });
        await batch.commit();
      }
    };

    // Capa 1: Entidades raíz (torneos)
    await commitLayer(
      bundle.tournaments.map((t) => ({ col: 'tournaments', id: t.id, data: t }))
    );

    // Capa 2: Divisiones, perfiles públicos por torneo, publicidades y trofeos (dependen de Capa 1)
    await commitLayer([
      ...bundle.divisions.map((d) => ({ col: 'divisions', id: d.id, data: d })),
      ...bundle.playersPublic.map((p) => ({ col: 'players_public', id: p.id, data: p })),
      ...bundle.tournamentAds.map((a) => ({ col: 'tournament_ads', id: a.id, data: a })),
      ...bundle.tournamentTrophies.map((tr) => ({ col: 'tournament_trophies', id: tr.id, data: tr })),
    ]);

    // Capa 3: PII privado, inscripciones, grupos y jornadas
    await commitLayer([
      ...bundle.playersPrivate.map((p) => ({ col: 'players_private', id: p.id, data: p })),
      ...bundle.registrations.map((r) => ({ col: 'registrations', id: r.id, data: r })),
      ...bundle.groups.map((g) => ({ col: 'groups', id: g.id, data: g })),
      ...bundle.matchdays.map((md) => ({ col: 'matchdays', id: md.id, data: md })),
    ]);

    // Capa 4: Partidos y notificaciones
    await commitLayer([
      ...bundle.matches.map((m) => ({ col: 'matches', id: m.id, data: m })),
      ...bundle.notifications.map((n) => ({ col: 'notifications', id: n.id, data: n })),
    ]);

    // Capa 5: Fotos publicadas
    await commitLayer(
      bundle.photos.map((ph) => ({ col: 'photos', id: ph.id, data: ph }))
    );

    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seed_demo_bundle');
  }
}

export async function publishNotificationAndBroadcast(alert: NotificationAlert, type: 'match:upcoming' | 'match:score_updated' | 'match:rescheduled' | 'draw:published' | 'gallery:published'): Promise<void> {
  await saveEntity('notifications', alert);
  try {
    await fetch('/api/realtime/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        title: alert.title,
        body: alert.body,
        tournamentId: alert.tournamentId,
        divisionId: alert.divisionId,
        matchId: alert.matchId,
        targetPlayerIds: alert.targetPlayerIds,
      }),
    });
  } catch (err) {
    console.warn('Error al emitir notificación en tiempo real:', err);
  }
}

export type CollectionEntityMap = {
  tournaments: Tournament;
  divisions: Division;
  players_public: PlayerPublic;
  registrations: Registration;
  groups: Group;
  matchdays: Matchday;
  matches: Match;
  photos: MatchdayPhoto;
  notifications: NotificationAlert;
  tournament_ads: TournamentAd;
  tournament_trophies: TournamentTrophy;
  site_settings: SiteLandingConfig;
};

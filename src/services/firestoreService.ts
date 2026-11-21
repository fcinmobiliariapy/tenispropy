import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
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
  StaffRole,
  Tournament,
  TournamentAd,
  TournamentTrophy,
} from '../types/tennis';

export function subscribeCollection<T>(
  collectionName: string,
  onData: (items: T[]) => void,
  onlyPublishedFilter = false
): () => void {
  const colRef = collection(db, collectionName);
  const q = onlyPublishedFilter ? query(colRef, where('published', '==', true)) : colRef;
  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((d) => d.data() as T);
      onData(data);
    },
    (error) => {
      // Silenciar fallos iniciales si todavía no hay sesión para colecciones privadas
      if (collectionName === 'photos_drafts' || collectionName === 'players_private' || collectionName === 'staff_roles') {
        console.warn(`Lectura restringida en ${collectionName}:`, error.message);
        onData([]);
        return;
      }
      if ((error as { code?: string }).code === 'unavailable') {
        console.warn(`Conexión temporalmente no disponible en ${collectionName}:`, error.message);
        return;
      }
      handleFirestoreError(error, OperationType.LIST, collectionName);
    }
  );
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

export async function fetchDraftPhotosForAdmin(): Promise<MatchdayPhoto[]> {
  try {
    const q = query(collection(db, 'photos_drafts'), where('published', '==', false));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as MatchdayPhoto);
  } catch {
    return [];
  }
}

export async function fetchPublishedMatchesFromFirestore(): Promise<Match[]> {
  try {
    const q = query(collection(db, 'matches'), where('published', '==', true));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Match);
  } catch (err) {
    console.warn('No se pudieron consultar partidos desde Firestore:', err);
    return [];
  }
}

export async function seedDemoTournamentsToFirestore(adminUid: string, force = false): Promise<boolean> {
  try {
    const existing = await getDocs(collection(db, 'tournaments'));
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

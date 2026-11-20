import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Edit3,
  ExternalLink,
  Image as ImageIcon,
  Megaphone,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AdPlacement,
  Court,
  Division,
  DivisionFormat,
  Gender,
  Group,
  Match,
  Matchday,
  MatchdayPhoto,
  Modality,
  NotificationAlert,
  PlayerPublic,
  Registration,
  TiebreakerCriterion,
  Tournament,
  TournamentAd,
  TournamentStatus,
} from '../../types/tennis';
import { ITF_EDITION_LABEL } from '../../utils/itfRules';
import { optimizeAndUploadAdBanner } from '../../utils/imageOptimizer';
import { makeId } from '../../utils/tournamentEngine';
import {
  deleteDivisionCascade,
  deleteTournamentCascade,
  removeEntity,
  saveEntity,
} from '../../services/firestoreService';

interface Props {
  tournaments: Tournament[];
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
  selectedTournamentId: string;
  onSelectTournament: (id: string) => void;
  selectedDivisionId: string;
  onSelectDivision: (id: string) => void;
  currentUid: string;
  isSuperAdmin: boolean;
  onOpenItfModal: () => void;
}

const CATEGORIES = ['6ta', '5ta', '4ta', '3ra', '2da', '1ra', 'Libre', 'Senior', 'Personalizada'];

const ALL_TIEBREAKERS: Array<{ id: TiebreakerCriterion; label: string }> = [
  { id: 'points', label: 'Puntos de clasificación' },
  { id: 'head_to_head', label: 'Enfrentamiento directo' },
  { id: 'sets_pct', label: '% Sets ganados' },
  { id: 'sets_diff', label: 'Diferencia de sets' },
  { id: 'games_pct', label: '% Games ganados' },
  { id: 'games_diff', label: 'Diferencia de games' },
  { id: 'draw', label: 'Sorteo' },
];

const PLACEMENT_LABELS: Record<AdPlacement, string> = {
  banner_principal: 'Banner principal (Portada del torneo)',
  lateral: 'Espacio destacado / Lateral',
  pie: 'Pie de sección pública',
};

export const AdminTournamentsSection: React.FC<Props> = ({
  tournaments,
  divisions,
  players,
  registrations,
  groups,
  matchdays,
  matches,
  publishedPhotos,
  draftPhotos,
  notifications,
  tournamentAds,
  selectedTournamentId,
  onSelectTournament,
  selectedDivisionId,
  onSelectDivision,
  currentUid,
  isSuperAdmin,
  onOpenItfModal,
}) => {
  const activeTournament = tournaments.find((t) => t.id === selectedTournamentId) || tournaments[0];
  const tournamentDivisions = divisions.filter((d) => d.tournamentId === activeTournament?.id);
  const activeAds = useMemo(
    () =>
      tournamentAds
        .filter((a) => a.tournamentId === activeTournament?.id)
        .sort((a, b) => a.order - b.order),
    [tournamentAds, activeTournament?.id]
  );

  // Form Torneo (Crear o Editar)
  const [showTournamentForm, setShowTournamentForm] = useState(false);
  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(null);
  const [tName, setTName] = useState('');
  const [tOrg, setTOrg] = useState('');
  const [tVenue, setTVenue] = useState('');
  const [tCity, setTCity] = useState('Asunción');
  const [tStart, setTStart] = useState('2026-12-01');
  const [tEnd, setTEnd] = useState('2026-12-10');
  const [tRegStart, setTRegStart] = useState('2026-11-19');
  const [tRegEnd, setTRegEnd] = useState('2026-11-30');
  const [tRest, setTRest] = useState(60);
  const [tStatus, setTStatus] = useState<TournamentStatus>('inscripciones');
  const [tCourtsText, setTCourtsText] = useState('Cancha Central, Cancha 2, Cancha 3');
  const [tEditableCourts, setTEditableCourts] = useState<Court[]>([]);
  const [tCoverImageUrl, setTCoverImageUrl] = useState('');
  const [uploadingCoverImg, setUploadingCoverImg] = useState(false);
  const [showQuickCover, setShowQuickCover] = useState(false);
  const [quickCoverUrl, setQuickCoverUrl] = useState('');
  const [uploadingQuickCover, setUploadingQuickCover] = useState(false);
  const [confirmDeleteTournamentId, setConfirmDeleteTournamentId] = useState<string | null>(null);

  // Form División (Crear o Editar)
  const [showDivForm, setShowDivForm] = useState(false);
  const [editingDivisionId, setEditingDivisionId] = useState<string | null>(null);
  const [dCategory, setDCategory] = useState('5ta');
  const [dCustomCat, setDCustomCat] = useState('');
  const [dModality, setDModality] = useState<Modality>('Singles');
  const [dGender, setDGender] = useState<Gender>('Masculino');
  const [dFormat, setDFormat] = useState<DivisionFormat>('grupos_y_final');
  const [dMultiDiv, setDMultiDiv] = useState(true);
  const [dMaxEntries, setDMaxEntries] = useState(16);
  const [dSetsToWin, setDSetsToWin] = useState<1 | 2 | 3>(2);
  const [dGamesPerSet, setDGamesPerSet] = useState<4 | 6 | 8>(6);
  const [dUseTiebreak, setDUseTiebreak] = useState(true);
  const [dSetTiebreakPoints, setDSetTiebreakPoints] = useState<7 | 10>(7);
  const [dTiebreakExactTarget, setDTiebreakExactTarget] = useState(false);
  const [dDirectTiebreakMatch, setDDirectTiebreakMatch] = useState(false);
  const [dNoAd, setDNoAd] = useState(false);
  const [dMatchTb, setDMatchTb] = useState(true);
  const [dOptionalSets, setDOptionalSets] = useState(false);
  const [dHasThirdPlace, setDHasThirdPlace] = useState(true);
  const [dGroupCount, setDGroupCount] = useState(2);
  const [dQualifiers, setDQualifiers] = useState(2);
  const [dTiebreakers, setDTiebreakers] = useState<TiebreakerCriterion[]>([
    'points',
    'head_to_head',
    'sets_diff',
    'games_diff',
    'draw',
  ]);
  const [confirmDeleteDivisionId, setConfirmDeleteDivisionId] = useState<string | null>(null);

  // Form Publicidad del Torneo
  const [showAdForm, setShowAdForm] = useState(false);
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [adSponsor, setAdSponsor] = useState('');
  const [adTitle, setAdTitle] = useState('');
  const [adSubtitle, setAdSubtitle] = useState('');
  const [adImageUrl, setAdImageUrl] = useState('');
  const [adTargetUrl, setAdTargetUrl] = useState('');
  const [adPlacement, setAdPlacement] = useState<AdPlacement>('banner_principal');
  const [adActive, setAdActive] = useState(true);
  const [uploadingAdImg, setUploadingAdImg] = useState(false);
  const [confirmDeleteAdId, setConfirmDeleteAdId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const openNewTournamentForm = () => {
    setEditingTournamentId(null);
    setTName('');
    setTOrg('');
    setTVenue('');
    setTCity('Asunción');
    setTStart('2026-12-01');
    setTEnd('2026-12-10');
    setTRegStart('2026-11-19');
    setTRegEnd('2026-11-30');
    setTRest(60);
    setTStatus('inscripciones');
    setTCourtsText('Cancha Central, Cancha 2, Cancha 3');
    setTEditableCourts([]);
    setTCoverImageUrl('');
    setShowTournamentForm(true);
  };

  const openEditTournamentForm = (t: Tournament) => {
    setEditingTournamentId(t.id);
    setTName(t.name);
    setTOrg(t.organizerName);
    setTVenue(t.venue);
    setTCity(t.city);
    setTStart(t.startDate);
    setTEnd(t.endDate);
    setTRegStart(t.regStartDate);
    setTRegEnd(t.regEndDate);
    setTRest(t.minRestMinutes);
    setTStatus(t.status);
    setTEditableCourts(t.courts.map((c) => ({ ...c })));
    setTCoverImageUrl(t.coverImageUrl || '');
    setShowTournamentForm(true);
  };

  const handleUploadCoverImage = async (
    e: React.ChangeEvent<HTMLInputElement>,
    mode: 'form' | 'quick'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (mode === 'form') setUploadingCoverImg(true);
    else setUploadingQuickCover(true);
    setErrorMsg(null);
    try {
      const url = await optimizeAndUploadAdBanner(file);
      if (mode === 'form') setTCoverImageUrl(url);
      else setQuickCoverUrl(url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo procesar la foto de portada.');
    } finally {
      if (mode === 'form') setUploadingCoverImg(false);
      else setUploadingQuickCover(false);
      e.target.value = '';
    }
  };

  const handleSaveQuickCover = async (newUrl: string | null) => {
    if (!activeTournament) return;
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const updated: Tournament = {
        ...activeTournament,
        coverImageUrl: newUrl,
        updatedAt: new Date().toISOString(),
      };
      await saveEntity('tournaments', updated);
      setShowQuickCover(false);
      setFeedback(
        newUrl
          ? `Foto de portada de "${activeTournament.name}" actualizada.`
          : `Portada predeterminada restaurada en "${activeTournament.name}".`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo actualizar la foto de portada.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tName.trim() || !tVenue.trim()) return;
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const now = new Date().toISOString();
      if (editingTournamentId) {
        const existing = tournaments.find((t) => t.id === editingTournamentId);
        if (!existing) return;
        const cleanedCourts = tEditableCourts
          .filter((c) => c.name.trim())
          .map((c) => ({ ...c, name: c.name.trim() }));
        const updated: Tournament = {
          ...existing,
          name: tName.trim(),
          organizerName: tOrg.trim() || existing.organizerName,
          venue: tVenue.trim(),
          city: tCity.trim() || 'Asunción',
          startDate: tStart,
          endDate: tEnd,
          regStartDate: tRegStart,
          regEndDate: tRegEnd,
          minRestMinutes: Number(tRest) || 60,
          status: tStatus,
          coverImageUrl: tCoverImageUrl.trim() || null,
          courts:
            cleanedCourts.length > 0
              ? cleanedCourts
              : [{ id: makeId('crt'), name: 'Cancha 1', surface: 'Polvo de ladrillo', lights: true }],
          updatedAt: now,
        };
        await saveEntity('tournaments', updated);
        setShowTournamentForm(false);
        setEditingTournamentId(null);
        setFeedback(`Torneo "${updated.name}" actualizado.`);
      } else {
        const courts: Court[] = tCourtsText
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean)
          .map((name, idx) => ({
            id: makeId(`crt_${idx}`),
            name,
            surface: 'Polvo de ladrillo',
            lights: true,
          }));

        const newT: Tournament = {
          id: makeId('tor'),
          name: tName.trim(),
          organizerName: tOrg.trim() || 'Organización TenisCupy',
          organizerUid: currentUid,
          venue: tVenue.trim(),
          city: tCity.trim() || 'Asunción',
          timezone: 'America/Asuncion',
          coverImageUrl: tCoverImageUrl.trim() || null,
          courts:
            courts.length > 0
              ? courts
              : [{ id: makeId('crt'), name: 'Cancha 1', surface: 'Polvo de ladrillo', lights: true }],
          startDate: tStart,
          endDate: tEnd,
          regStartDate: tRegStart,
          regEndDate: tRegEnd,
          minRestMinutes: Number(tRest) || 60,
          itfEdition: ITF_EDITION_LABEL,
          status: tStatus,
          isDemo: false,
          createdAt: now,
          updatedAt: now,
        };
        await saveEntity('tournaments', newT);
        onSelectTournament(newT.id);
        setShowTournamentForm(false);
        setTName('');
        setTCoverImageUrl('');
        setFeedback(`Torneo "${newT.name}" creado correctamente.`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTournament = async (tid: string) => {
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await deleteTournamentCascade(tid, {
        divisions,
        players,
        registrations,
        groups,
        matchdays,
        matches,
        publishedPhotos,
        draftPhotos,
        notifications,
        tournamentAds,
      });
      setConfirmDeleteTournamentId(null);
      const nextT = tournaments.find((t) => t.id !== tid);
      if (nextT) onSelectTournament(nextT.id);
      setFeedback('Torneo y todos sus datos asociados eliminados.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo eliminar el torneo.');
    } finally {
      setSaving(false);
    }
  };

  const openNewDivisionForm = () => {
    setEditingDivisionId(null);
    setDCategory('5ta');
    setDCustomCat('');
    setDModality('Singles');
    setDGender('Masculino');
    setDFormat('grupos_y_final');
    setDMultiDiv(true);
    setDMaxEntries(16);
    setDSetsToWin(2);
    setDGamesPerSet(6);
    setDUseTiebreak(true);
    setDSetTiebreakPoints(7);
    setDTiebreakExactTarget(false);
    setDDirectTiebreakMatch(false);
    setDNoAd(false);
    setDMatchTb(true);
    setDOptionalSets(false);
    setDHasThirdPlace(true);
    setDGroupCount(2);
    setDQualifiers(2);
    setDTiebreakers(['points', 'head_to_head', 'sets_diff', 'games_diff', 'draw']);
    setShowDivForm(true);
  };

  const openEditDivisionForm = (div: Division) => {
    setEditingDivisionId(div.id);
    const knownCat = CATEGORIES.includes(div.category) && div.category !== 'Personalizada';
    setDCategory(knownCat ? div.category : 'Personalizada');
    setDCustomCat(knownCat ? '' : div.category);
    setDModality(div.modality);
    setDGender(div.gender);
    setDFormat(div.format);
    setDMultiDiv(div.allowMultiDivision);
    setDMaxEntries(div.maxEntries);
    setDSetsToWin(div.itfConfig.setsToWin);
    setDGamesPerSet(div.itfConfig.gamesPerSet);
    setDUseTiebreak(div.itfConfig.useTiebreak);
    setDSetTiebreakPoints(div.itfConfig.setTiebreakPoints === 10 ? 10 : 7);
    setDTiebreakExactTarget(Boolean(div.itfConfig.tiebreakExactTarget));
    setDDirectTiebreakMatch(Boolean(div.itfConfig.directTiebreakMatch));
    setDNoAd(div.itfConfig.decisivePointNoAd);
    setDMatchTb(div.itfConfig.matchTiebreakThirdSet);
    setDOptionalSets(Boolean(div.itfConfig.optionalSetScores));
    setDHasThirdPlace(Boolean(div.hasThirdPlaceMatch));
    setDGroupCount(div.drawConfig.groupCount);
    setDQualifiers(div.drawConfig.qualifiersPerGroup);
    setDTiebreakers(div.drawConfig.tiebreakers);
    setShowDivForm(true);
  };

  const handleSaveDivision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTournament) return;
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const now = new Date().toISOString();
      const cat = dCategory === 'Personalizada' ? dCustomCat.trim() || 'Especial' : dCategory;
      const divName = `${cat} ${dModality} ${dGender}`;

      if (editingDivisionId) {
        const existing = divisions.find((d) => d.id === editingDivisionId);
        if (!existing) return;
        const updated: Division = {
          ...existing,
          name: divName,
          category: cat,
          modality: dModality,
          gender: dGender,
          format: dFormat,
          allowMultiDivision: dMultiDiv,
          maxEntries: Number(dMaxEntries) || 16,
          itfConfig: {
            ...existing.itfConfig,
            setsToWin: dSetsToWin,
            gamesPerSet: dGamesPerSet,
            tiebreakAt: dGamesPerSet === 4 ? 3 : dGamesPerSet === 8 ? 7 : 6,
            useTiebreak: dUseTiebreak,
            setTiebreakPoints: dSetTiebreakPoints,
            tiebreakExactTarget: dTiebreakExactTarget,
            directTiebreakMatch: dDirectTiebreakMatch,
            decisivePointNoAd: dNoAd,
            matchTiebreakThirdSet: dMatchTb,
            optionalSetScores: dOptionalSets,
          },
          drawConfig: {
            ...existing.drawConfig,
            groupCount: dFormat === 'grupos_y_final' ? Math.max(1, dGroupCount) : 1,
            qualifiersPerGroup: dFormat === 'grupos_y_final' ? Math.max(1, dQualifiers) : 1,
            tiebreakers: dTiebreakers,
          },
          hasThirdPlaceMatch: dHasThirdPlace,
          updatedAt: now,
        };
        await saveEntity('divisions', updated);
        setShowDivForm(false);
        setEditingDivisionId(null);
        setFeedback(`División "${updated.name}" actualizada.`);
      } else {
        const newDiv: Division = {
          id: makeId('div'),
          tournamentId: activeTournament.id,
          name: divName,
          category: cat,
          modality: dModality,
          gender: dGender,
          format: dFormat,
          allowMultiDivision: dMultiDiv,
          maxEntries: Number(dMaxEntries) || 16,
          itfConfig: {
            edition: ITF_EDITION_LABEL,
            setsToWin: dSetsToWin,
            gamesPerSet: dGamesPerSet,
            tiebreakAt: dGamesPerSet === 4 ? 3 : dGamesPerSet === 8 ? 7 : 6,
            useTiebreak: dUseTiebreak,
            setTiebreakPoints: dSetTiebreakPoints,
            tiebreakExactTarget: dTiebreakExactTarget,
            directTiebreakMatch: dDirectTiebreakMatch,
            decisivePointNoAd: dNoAd,
            matchTiebreakThirdSet: dMatchTb,
            matchTiebreakPoints: 10,
            optionalSetScores: dOptionalSets,
          },
          drawConfig: {
            groupCount: dFormat === 'grupos_y_final' ? Math.max(1, dGroupCount) : 1,
            qualifiersPerGroup: dFormat === 'grupos_y_final' ? Math.max(1, dQualifiers) : 1,
            seedingEnabled: true,
            pointsWin: 2,
            pointsLoss: 1,
            pointsWoWin: 2,
            pointsWoLoss: 0,
            tiebreakers: dTiebreakers,
            woHandlingNote: dNoAd
              ? 'Punto decisivo sin ventaja en 40-40. WO otorga 2 puntos al vencedor.'
              : 'Formato tradicional con ventaja. WO otorga 2 puntos al vencedor.',
          },
          drawStatus: 'sin_sorteo',
          hasThirdPlaceMatch: dHasThirdPlace,
          championEntryId: null,
          championName: null,
          runnerUpName: null,
          thirdPlaceEntryId: null,
          thirdPlaceName: null,
          createdAt: now,
          updatedAt: now,
        };
        await saveEntity('divisions', newDiv);
        onSelectDivision(newDiv.id);
        setShowDivForm(false);
        setFeedback(`División "${newDiv.name}" creada con módulo independiente.`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDivision = async (divId: string) => {
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await deleteDivisionCascade(divId, {
        registrations,
        groups,
        matchdays,
        matches,
        publishedPhotos,
        draftPhotos,
      });
      setConfirmDeleteDivisionId(null);
      const nextDiv = tournamentDivisions.find((d) => d.id !== divId);
      if (nextDiv) onSelectDivision(nextDiv.id);
      setFeedback('División y todos sus partidos, grupos y jornadas eliminados.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo eliminar la división.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCourt = async () => {
    if (!activeTournament) return;
    const name = `Cancha ${activeTournament.courts.length + 1}`;
    const updated: Tournament = {
      ...activeTournament,
      courts: [
        ...activeTournament.courts,
        { id: makeId('crt'), name, surface: 'Polvo de ladrillo', lights: true },
      ],
      updatedAt: new Date().toISOString(),
    };
    await saveEntity('tournaments', updated);
  };

  const moveTiebreaker = (idx: number, dir: -1 | 1) => {
    const next = [...dTiebreakers];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setDTiebreakers(next);
  };

  const selectedDivision = tournamentDivisions.find((d) => d.id === selectedDivisionId) || tournamentDivisions[0];

  const handleToggleDivisionOption = async (
    div: Division,
    field:
      | 'hasThirdPlaceMatch'
      | 'optionalSetScores'
      | 'setTiebreak10'
      | 'tiebreakExactTarget'
      | 'directTiebreakMatch'
  ) => {
    const now = new Date().toISOString();
    let updated: Division = div;
    if (field === 'hasThirdPlaceMatch') {
      updated = { ...div, hasThirdPlaceMatch: !div.hasThirdPlaceMatch, updatedAt: now };
    } else if (field === 'optionalSetScores') {
      updated = {
        ...div,
        itfConfig: {
          ...div.itfConfig,
          optionalSetScores: !div.itfConfig.optionalSetScores,
        },
        updatedAt: now,
      };
    } else if (field === 'setTiebreak10') {
      const nextTarget: 7 | 10 = div.itfConfig.setTiebreakPoints === 10 ? 7 : 10;
      updated = {
        ...div,
        itfConfig: {
          ...div.itfConfig,
          setTiebreakPoints: nextTarget,
        },
        updatedAt: now,
      };
    } else if (field === 'tiebreakExactTarget') {
      updated = {
        ...div,
        itfConfig: {
          ...div.itfConfig,
          tiebreakExactTarget: !div.itfConfig.tiebreakExactTarget,
        },
        updatedAt: now,
      };
    } else if (field === 'directTiebreakMatch') {
      updated = {
        ...div,
        itfConfig: {
          ...div.itfConfig,
          directTiebreakMatch: !div.itfConfig.directTiebreakMatch,
        },
        updatedAt: now,
      };
    }
    await saveEntity('divisions', updated);
    setFeedback(`Configuración de "${div.name}" actualizada.`);
  };

  // Publicidad personalizada del torneo
  const openNewAdForm = () => {
    setEditingAdId(null);
    setAdSponsor('');
    setAdTitle('');
    setAdSubtitle('');
    setAdImageUrl('');
    setAdTargetUrl('');
    setAdPlacement('banner_principal');
    setAdActive(true);
    setShowAdForm(true);
  };

  const openEditAdForm = (ad: TournamentAd) => {
    setEditingAdId(ad.id);
    setAdSponsor(ad.sponsorName);
    setAdTitle(ad.title);
    setAdSubtitle(ad.subtitle || '');
    setAdImageUrl(ad.imageUrl);
    setAdTargetUrl(ad.targetUrl || '');
    setAdPlacement(ad.placement);
    setAdActive(ad.active);
    setShowAdForm(true);
  };

  const handleUploadAdImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAdImg(true);
    setErrorMsg(null);
    try {
      const url = await optimizeAndUploadAdBanner(file);
      setAdImageUrl(url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo procesar la imagen publicitaria.');
    } finally {
      setUploadingAdImg(false);
      e.target.value = '';
    }
  };

  const handleSaveAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTournament) return;
    if (!adSponsor.trim() || !adTitle.trim() || !adImageUrl.trim()) {
      setErrorMsg('Completá el nombre del sponsor, título y cargá una imagen para la publicidad.');
      return;
    }
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const now = new Date().toISOString();
      const existing = editingAdId ? activeAds.find((a) => a.id === editingAdId) : null;
      const maxOrder = activeAds.reduce((acc, a) => Math.max(acc, a.order), 0);
      const adDoc: TournamentAd = {
        id: existing ? existing.id : makeId('ad'),
        tournamentId: activeTournament.id,
        sponsorName: adSponsor.trim(),
        title: adTitle.trim(),
        subtitle: adSubtitle.trim() || null,
        imageUrl: adImageUrl.trim(),
        targetUrl: adTargetUrl.trim() || null,
        placement: adPlacement,
        order: existing ? existing.order : maxOrder + 1,
        active: adActive,
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
      };
      await saveEntity('tournament_ads', adDoc);
      setShowAdForm(false);
      setEditingAdId(null);
      setFeedback(
        existing
          ? `Publicidad de "${adDoc.sponsorName}" actualizada.`
          : `Publicidad de "${adDoc.sponsorName}" agregada a ${activeTournament.name}.`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAdActive = async (ad: TournamentAd) => {
    await saveEntity('tournament_ads', {
      ...ad,
      active: !ad.active,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleReorderAd = async (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= activeAds.length) return;
    const now = new Date().toISOString();
    const a = activeAds[idx];
    const b = activeAds[targetIdx];
    await saveEntity('tournament_ads', { ...a, order: b.order, updatedAt: now });
    await saveEntity('tournament_ads', { ...b, order: a.order, updatedAt: now });
  };

  const handleDeleteAd = async (adId: string) => {
    await removeEntity('tournament_ads', adId);
    setConfirmDeleteAdId(null);
    setFeedback('Publicidad eliminada del torneo.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0F1A15]">Torneos, Divisiones y Publicidad</h2>
          <p className="text-xs text-[#4A5550]">
            Cada torneo gestiona sus divisiones, padrón privado de jugadores y espacios de sponsors.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenItfModal}
            className="inline-flex items-center gap-2 px-3.5 min-h-[44px] sm:min-h-[38px] rounded-lg border border-[#E2E7E4] bg-white text-xs font-medium text-[#0F1A15] hover:bg-slate-50"
          >
            <BookOpen className="w-4 h-4 text-[#14532D]" />
            Consultar ITF
          </button>
          <button
            onClick={openNewTournamentForm}
            className="inline-flex items-center gap-2 px-4 min-h-[44px] sm:min-h-[38px] rounded-lg bg-[#14532D] text-white text-xs font-medium hover:bg-[#166534]"
          >
            <Plus className="w-4 h-4" />
            Nuevo torneo
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-800">
          {errorMsg}
        </div>
      )}

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-[#14532D]">
          {feedback}
        </div>
      )}

      {showTournamentForm && (
        <form
          onSubmit={handleSaveTournament}
          className="bg-white border border-[#E2E7E4] rounded-2xl p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-[#0F1A15]">
            {editingTournamentId ? 'Editar torneo' : 'Crear nuevo torneo'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#4A5550] mb-1">Nombre del torneo *</label>
              <input
                required
                value={tName}
                onChange={(e) => setTName(e.target.value)}
                placeholder="Ej. Torneo Nacional Primavera 2026"
                className="w-full h-10 px-3 rounded-lg border border-[#E2E7E4] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4A5550] mb-1">Organizador *</label>
              <input
                required
                value={tOrg}
                onChange={(e) => setTOrg(e.target.value)}
                placeholder="Club o Federación"
                className="w-full h-10 px-3 rounded-lg border border-[#E2E7E4] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4A5550] mb-1">Sede *</label>
              <input
                required
                value={tVenue}
                onChange={(e) => setTVenue(e.target.value)}
                placeholder="Sede principal"
                className="w-full h-10 px-3 rounded-lg border border-[#E2E7E4] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4A5550] mb-1">Ciudad</label>
              <input
                value={tCity}
                onChange={(e) => setTCity(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E7E4] text-sm"
              />
            </div>
            {!editingTournamentId && (
              <div>
                <label className="block text-xs font-medium text-[#4A5550] mb-1">Canchas (separadas por coma)</label>
                <input
                  value={tCourtsText}
                  onChange={(e) => setTCourtsText(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-[#E2E7E4] text-sm"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-[#4A5550] mb-1">Descanso mínimo (min)</label>
              <input
                type="number"
                min={0}
                max={480}
                value={tRest}
                onChange={(e) => setTRest(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E7E4] text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4A5550] mb-1">Inicio torneo</label>
              <input
                type="date"
                value={tStart}
                onChange={(e) => setTStart(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E7E4] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4A5550] mb-1">Fin torneo</label>
              <input
                type="date"
                value={tEnd}
                onChange={(e) => setTEnd(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E7E4] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4A5550] mb-1">Inicio inscripciones</label>
              <input
                type="date"
                value={tRegStart}
                onChange={(e) => setTRegStart(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E7E4] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4A5550] mb-1">Cierre inscripciones</label>
              <input
                type="date"
                value={tRegEnd}
                onChange={(e) => setTRegEnd(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E7E4] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4A5550] mb-1">Estado</label>
              <select
                value={tStatus}
                onChange={(e) => setTStatus(e.target.value as TournamentStatus)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E7E4] text-sm"
              >
                <option value="borrador">Borrador</option>
                <option value="inscripciones">Inscripciones abiertas</option>
                <option value="en_curso">En curso</option>
                <option value="finalizado">Finalizado</option>
              </select>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#F8F9F8] border border-[#E2E7E4] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-[#0F1A15]">Foto de portada del torneo</p>
                <p className="text-[11px] text-[#4A5550]">
                  Se muestra en la portada principal del portal público (opcional; si queda vacía usa la portada predeterminada).
                </p>
              </div>
              {tCoverImageUrl && (
                <button
                  type="button"
                  onClick={() => setTCoverImageUrl('')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E2E7E4] bg-white text-[11px] font-medium text-[#4A5550] hover:text-[#0F1A15]"
                >
                  <RotateCcw className="w-3 h-3" />
                  Usar predeterminada
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                value={tCoverImageUrl}
                onChange={(e) => setTCoverImageUrl(e.target.value)}
                placeholder="Pegá URL de imagen o subí una foto desde tu dispositivo..."
                className="flex-1 h-9 px-3 rounded-lg border border-[#E2E7E4] bg-white text-xs min-w-0"
              />
              <label className="inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-lg border border-[#E2E7E4] bg-white text-xs font-medium text-[#0F1A15] hover:bg-slate-50 cursor-pointer shrink-0">
                <Upload className="w-3.5 h-3.5 text-[#14532D]" />
                {uploadingCoverImg ? 'Optimizando...' : 'Subir portada'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handleUploadCoverImage(e, 'form')}
                  disabled={uploadingCoverImg}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex items-center gap-3">
              <img
                src={tCoverImageUrl || '/src/assets/images/hero_clay_court_1795134987256.jpg'}
                alt="Vista previa de portada del torneo"
                referrerPolicy="no-referrer"
                className="w-36 aspect-[16/9] rounded-lg object-cover border border-[#E2E7E4] bg-slate-100 shrink-0"
              />
              <p className="text-[11px] text-[#4A5550]">
                {tCoverImageUrl
                  ? 'Portada personalizada activa.'
                  : 'Usando portada predeterminada de polvo de ladrillo.'}
              </p>
            </div>
          </div>

          {editingTournamentId && (
            <div className="p-4 rounded-xl bg-[#F8F9F8] border border-[#E2E7E4] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[#0F1A15]">Canchas del torneo</p>
                <button
                  type="button"
                  onClick={() =>
                    setTEditableCourts((prev) => [
                      ...prev,
                      {
                        id: makeId('crt'),
                        name: `Cancha ${prev.length + 1}`,
                        surface: 'Polvo de ladrillo',
                        lights: true,
                      },
                    ])
                  }
                  className="px-2.5 py-1 rounded-lg border border-[#E2E7E4] bg-white text-xs font-medium text-[#14532D]"
                >
                  + Agregar cancha
                </button>
              </div>
              <div className="space-y-2">
                {tEditableCourts.map((crt, idx) => (
                  <div key={crt.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <input
                      value={crt.name}
                      onChange={(e) =>
                        setTEditableCourts((prev) =>
                          prev.map((c, i) => (i === idx ? { ...c, name: e.target.value } : c))
                        )
                      }
                      placeholder="Nombre cancha"
                      className="sm:col-span-5 h-9 px-2.5 rounded-lg border border-[#E2E7E4] bg-white text-xs"
                    />
                    <select
                      value={crt.surface}
                      onChange={(e) =>
                        setTEditableCourts((prev) =>
                          prev.map((c, i) =>
                            i === idx
                              ? { ...c, surface: e.target.value as Court['surface'] }
                              : c
                          )
                        )
                      }
                      className="sm:col-span-4 h-9 px-2.5 rounded-lg border border-[#E2E7E4] bg-white text-xs"
                    >
                      <option value="Polvo de ladrillo">Polvo de ladrillo</option>
                      <option value="Cemento">Cemento</option>
                      <option value="Césped">Césped</option>
                      <option value="Indoor">Indoor</option>
                    </select>
                    <label className="sm:col-span-2 inline-flex items-center gap-1.5 text-xs text-[#0F1A15]">
                      <input
                        type="checkbox"
                        checked={crt.lights}
                        onChange={(e) =>
                          setTEditableCourts((prev) =>
                            prev.map((c, i) => (i === idx ? { ...c, lights: e.target.checked } : c))
                          )
                        }
                      />
                      Luz
                    </label>
                    <button
                      type="button"
                      disabled={tEditableCourts.length <= 1}
                      onClick={() =>
                        setTEditableCourts((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="sm:col-span-1 p-2 rounded-lg text-red-700 hover:bg-red-50 disabled:opacity-30 justify-self-end"
                      title="Quitar cancha"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowTournamentForm(false);
                setEditingTournamentId(null);
              }}
              className="px-4 py-2 rounded-lg border border-[#E2E7E4] text-xs font-medium text-[#4A5550]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#14532D] text-white text-xs font-medium hover:bg-[#166534]"
            >
              <Save className="w-4 h-4" />
              {editingTournamentId ? 'Guardar cambios' : 'Guardar torneo'}
            </button>
          </div>
        </form>
      )}

      {/* Torneo seleccionado y sus canchas */}
      {activeTournament && (
        <div className="bg-white border border-[#E2E7E4] rounded-2xl p-5 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs text-[#14532D] font-medium">
                {activeTournament.venue} · {activeTournament.city} · {activeTournament.timezone}
              </p>
              <h3 className="text-lg font-bold text-[#0F1A15] mt-0.5">{activeTournament.name}</h3>
              <p className="text-xs text-[#4A5550] mt-1">
                Torneo: {activeTournament.startDate} al {activeTournament.endDate} · Inscripciones:{' '}
                {activeTournament.regStartDate} al {activeTournament.regEndDate} · Descanso mínimo:{' '}
                <span className="font-mono tabular-nums font-medium">{activeTournament.minRestMinutes} min</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setQuickCoverUrl(activeTournament.coverImageUrl || '');
                  setShowQuickCover((v) => !v);
                }}
                className="inline-flex items-center gap-1.5 px-3 min-h-[40px] sm:min-h-[34px] rounded-lg border border-[#E2E7E4] text-xs font-medium text-[#0F1A15] hover:bg-slate-50"
              >
                <ImageIcon className="w-3.5 h-3.5 text-[#14532D]" />
                Foto de portada
              </button>
              <button
                onClick={handleAddCourt}
                className="px-3 min-h-[40px] sm:min-h-[34px] rounded-lg border border-[#E2E7E4] text-xs font-medium text-[#0F1A15] hover:bg-slate-50"
              >
                + Añadir cancha
              </button>
              {isSuperAdmin && (
                <>
                  <button
                    onClick={() => openEditTournamentForm(activeTournament)}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[40px] sm:min-h-[34px] rounded-lg border border-[#E2E7E4] text-xs font-medium text-[#0F1A15] hover:bg-slate-50"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[#14532D]" />
                    Editar torneo
                  </button>
                  <button
                    onClick={() => setConfirmDeleteTournamentId(activeTournament.id)}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[40px] sm:min-h-[34px] rounded-lg border border-red-200 text-xs font-medium text-red-700 hover:bg-red-50"
                    title="Eliminar torneo completo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Eliminar torneo
                  </button>
                </>
              )}
            </div>
          </div>

          {showQuickCover && (
            <div className="p-4 rounded-xl bg-[#F8F9F8] border border-[#E2E7E4] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-[#0F1A15]">
                    Modificar foto de portada · {activeTournament.name}
                  </p>
                  <p className="text-[11px] text-[#4A5550]">
                    Subí una imagen propia del club o certamen (formato panorámico recomendado).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQuickCover(false)}
                  className="text-xs text-[#4A5550] hover:text-[#0F1A15]"
                >
                  Cerrar
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <img
                  src={
                    quickCoverUrl ||
                    activeTournament.coverImageUrl ||
                    '/src/assets/images/hero_clay_court_1795134987256.jpg'
                  }
                  alt="Portada del torneo"
                  referrerPolicy="no-referrer"
                  className="w-full sm:w-44 aspect-[16/9] rounded-xl object-cover border border-[#E2E7E4] bg-slate-100 shrink-0"
                />
                <div className="flex-1 space-y-2.5 min-w-0">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={quickCoverUrl}
                      onChange={(e) => setQuickCoverUrl(e.target.value)}
                      placeholder="https://... o subí archivo desde tu dispositivo"
                      className="flex-1 h-9 px-3 rounded-lg border border-[#E2E7E4] bg-white text-xs min-w-0"
                    />
                    <label className="inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-lg border border-[#E2E7E4] bg-white text-xs font-medium text-[#0F1A15] hover:bg-slate-50 cursor-pointer shrink-0">
                      <Upload className="w-3.5 h-3.5 text-[#14532D]" />
                      {uploadingQuickCover ? 'Optimizando...' : 'Elegir imagen'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => handleUploadCoverImage(e, 'quick')}
                        disabled={uploadingQuickCover}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleSaveQuickCover(quickCoverUrl.trim() || null)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#14532D] text-white text-xs font-medium hover:bg-[#166534]"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Guardar portada
                    </button>
                    {activeTournament.coverImageUrl && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setQuickCoverUrl('');
                          handleSaveQuickCover(null);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E2E7E4] bg-white text-xs font-medium text-[#4A5550] hover:text-[#0F1A15]"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Restaurar predeterminada
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {confirmDeleteTournamentId === activeTournament.id && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-red-900">
                <p className="font-semibold">
                  ¿Eliminar "{activeTournament.name}" de forma definitiva?
                </p>
                <p className="text-red-800 mt-0.5">
                  Se eliminarán también todas sus divisiones, jugadores privados, inscripciones, partidos, jornadas, fotos y publicidades.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteTournamentId(null)}
                  className="px-3 py-1.5 rounded-lg border border-red-200 bg-white text-xs font-medium text-[#0F1A15]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleDeleteTournament(activeTournament.id)}
                  className="px-3.5 py-1.5 rounded-lg bg-red-700 text-white text-xs font-medium hover:bg-red-800"
                >
                  {saving ? 'Eliminando...' : 'Sí, eliminar torneo'}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-xs text-[#4A5550]">
            <span className="font-medium text-[#0F1A15]">Canchas habilitadas:</span>
            {activeTournament.courts.map((c, idx) => (
              <span key={c.id}>
                {c.name} ({c.surface}){idx < activeTournament.courts.length - 1 ? ' ·' : ''}
              </span>
            ))}
          </div>

          {/* Lista de divisiones independientes */}
          <div className="pt-4 border-t border-[#E2E7E4]">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h4 className="text-sm font-semibold text-[#0F1A15]">
                Divisiones del torneo ({tournamentDivisions.length})
              </h4>
              <button
                onClick={openNewDivisionForm}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#14532D] text-white text-xs font-medium hover:bg-[#166534]"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar división
              </button>
            </div>

            {showDivForm && (
              <form
                onSubmit={handleSaveDivision}
                className="mb-5 p-4 rounded-xl bg-[#F8F9F8] border border-[#E2E7E4] space-y-4"
              >
                <h5 className="text-xs font-semibold text-[#0F1A15]">
                  {editingDivisionId ? 'Editar división' : 'Nueva división independiente'}
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#4A5550] mb-1">Categoría</label>
                    <select
                      value={dCategory}
                      onChange={(e) => setDCategory(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg border border-[#E2E7E4] bg-white text-xs"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  {dCategory === 'Personalizada' && (
                    <div>
                      <label className="block text-xs font-medium text-[#4A5550] mb-1">Nombre categoría</label>
                      <input
                        required
                        value={dCustomCat}
                        onChange={(e) => setDCustomCat(e.target.value)}
                        placeholder="Ej. Sub-16"
                        className="w-full h-9 px-2.5 rounded-lg border border-[#E2E7E4] bg-white text-xs"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-[#4A5550] mb-1">Modalidad</label>
                    <select
                      value={dModality}
                      onChange={(e) => setDModality(e.target.value as Modality)}
                      className="w-full h-9 px-2.5 rounded-lg border border-[#E2E7E4] bg-white text-xs"
                    >
                      <option value="Singles">Singles</option>
                      <option value="Dobles">Dobles</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A5550] mb-1">Rama</label>
                    <select
                      value={dGender}
                      onChange={(e) => setDGender(e.target.value as Gender)}
                      className="w-full h-9 px-2.5 rounded-lg border border-[#E2E7E4] bg-white text-xs"
                    >
                      <option value="Masculino">Masculino</option>
                      <option value="Femenino">Femenino</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A5550] mb-1">Formato</label>
                    <select
                      value={dFormat}
                      onChange={(e) => setDFormat(e.target.value as DivisionFormat)}
                      className="w-full h-9 px-2.5 rounded-lg border border-[#E2E7E4] bg-white text-xs"
                    >
                      <option value="grupos_y_final">Grupos con fase final</option>
                      <option value="todos_contra_todos">Todos contra todos</option>
                      <option value="eliminacion_directa">Eliminación directa</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A5550] mb-1">Sets para ganar</label>
                    <select
                      value={dSetsToWin}
                      onChange={(e) => setDSetsToWin(Number(e.target.value) as 1 | 2 | 3)}
                      className="w-full h-9 px-2.5 rounded-lg border border-[#E2E7E4] bg-white text-xs"
                    >
                      <option value={2}>Al mejor de 3 sets</option>
                      <option value={1}>Set único</option>
                      <option value={3}>Al mejor de 5 sets</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A5550] mb-1">Games por set</label>
                    <select
                      value={dGamesPerSet}
                      onChange={(e) => setDGamesPerSet(Number(e.target.value) as 4 | 6 | 8)}
                      className="w-full h-9 px-2.5 rounded-lg border border-[#E2E7E4] bg-white text-xs"
                    >
                      <option value={6}>6 games (Estándar ITF)</option>
                      <option value={4}>4 games (Set corto)</option>
                      <option value={8}>8 games (Pro-Set)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A5550] mb-1">Sistema de Tie-Break</label>
                    <select
                      value={dSetTiebreakPoints}
                      onChange={(e) => setDSetTiebreakPoints(Number(e.target.value) as 7 | 10)}
                      className="w-full h-9 px-2.5 rounded-lg border border-[#E2E7E4] bg-white text-xs"
                    >
                      <option value={7}>A 7 puntos (Estándar ITF)</option>
                      <option value={10}>A 10 puntos (ej. 10-3, 10-1)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A5550] mb-1">Cupo máximo</label>
                    <input
                      type="number"
                      min={2}
                      max={128}
                      value={dMaxEntries}
                      onChange={(e) => setDMaxEntries(Number(e.target.value))}
                      className="w-full h-9 px-2.5 rounded-lg border border-[#E2E7E4] bg-white text-xs font-mono tabular-nums"
                    />
                  </div>
                  {dFormat === 'grupos_y_final' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-[#4A5550] mb-1">Cant. grupos</label>
                        <input
                          type="number"
                          min={1}
                          max={16}
                          value={dGroupCount}
                          onChange={(e) => setDGroupCount(Number(e.target.value))}
                          className="w-full h-9 px-2.5 rounded-lg border border-[#E2E7E4] bg-white text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#4A5550] mb-1">Clasifican por grupo</label>
                        <input
                          type="number"
                          min={1}
                          max={4}
                          value={dQualifiers}
                          onChange={(e) => setDQualifiers(Number(e.target.value))}
                          className="w-full h-9 px-2.5 rounded-lg border border-[#E2E7E4] bg-white text-xs font-mono"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap gap-4 text-xs text-[#0F1A15]">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={dUseTiebreak} onChange={(e) => setDUseTiebreak(e.target.checked)} />
                    Tie-break en set
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dTiebreakExactTarget}
                      onChange={(e) => setDTiebreakExactTarget(e.target.checked)}
                    />
                    Tie-break al que llegue primero (sin dif. de 2, ej. 10-9)
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dDirectTiebreakMatch}
                      onChange={(e) => setDDirectTiebreakMatch(e.target.checked)}
                    />
                    Partido directo a Tie-Break de 10 pts
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={dNoAd} onChange={(e) => setDNoAd(e.target.checked)} />
                    Punto decisivo sin ventaja (No-Ad)
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={dMatchTb} onChange={(e) => setDMatchTb(e.target.checked)} />
                    Match Tie-Break (10 pts) en 3er set
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={dMultiDiv} onChange={(e) => setDMultiDiv(e.target.checked)} />
                    Permitir competir en otras divisiones
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={dOptionalSets} onChange={(e) => setDOptionalSets(e.target.checked)} />
                    Puntaje por sets opcional
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={dHasThirdPlace} onChange={(e) => setDHasThirdPlace(e.target.checked)} />
                    Disputar partido por 3er puesto
                  </label>
                </div>

                <div>
                  <p className="text-xs font-medium text-[#4A5550] mb-1.5">
                    Orden de desempates en clasificación:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {dTiebreakers.map((tb, idx) => {
                      const label = ALL_TIEBREAKERS.find((x) => x.id === tb)?.label || tb;
                      return (
                        <div key={tb} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#E2E7E4] text-xs">
                          <span className="font-mono text-[#14532D]">{idx + 1}.</span>
                          <span>{label}</span>
                          <button type="button" onClick={() => moveTiebreaker(idx, -1)} className="text-[#4A5550] hover:text-[#0F1A15] px-1">
                            ←
                          </button>
                          <button type="button" onClick={() => moveTiebreaker(idx, 1)} className="text-[#4A5550] hover:text-[#0F1A15] px-1">
                            →
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDivForm(false);
                      setEditingDivisionId(null);
                    }}
                    className="px-3.5 py-2 rounded-lg border border-[#E2E7E4] bg-white text-xs font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-[#14532D] text-white text-xs font-medium hover:bg-[#166534]"
                  >
                    {editingDivisionId ? 'Guardar cambios' : 'Crear división'}
                  </button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {tournamentDivisions.map((d) => {
                const isSelected = d.id === selectedDivisionId;
                return (
                  <div
                    key={d.id}
                    className={`rounded-xl border transition-colors flex flex-col justify-between ${
                      isSelected
                        ? 'border-[#14532D] bg-emerald-50/40'
                        : 'border-[#E2E7E4] bg-[#F8F9F8] hover:border-slate-300'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectDivision(d.id)}
                      className="text-left p-4 flex-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[#0F1A15]">{d.name}</span>
                        <span className="text-[11px] text-[#14532D] font-medium">
                          {d.drawStatus === 'publicado' ? 'Publicado' : d.drawStatus === 'borrador' ? 'Borrador' : 'Sin sorteo'}
                        </span>
                      </div>
                      <p className="text-xs text-[#4A5550] mt-1">
                        {d.format === 'grupos_y_final'
                          ? 'Grupos y fase final'
                          : d.format === 'todos_contra_todos'
                          ? 'Todos contra todos'
                          : 'Eliminación directa'}{' '}
                        · {d.itfConfig.setsToWin === 2 ? 'Mejor de 3' : d.itfConfig.setsToWin === 1 ? 'Set único' : 'Mejor de 5'}
                        {d.itfConfig.setTiebreakPoints === 10 ? ' · TB a 10 pts' : ''}
                        {d.itfConfig.directTiebreakMatch ? ' · Partido TB 10' : ''}
                        {d.itfConfig.decisivePointNoAd ? ' · Sin ventaja' : ''}
                      </p>
                      {d.championName && (
                        <p className="text-xs font-medium text-amber-800 mt-1.5">
                          1° {d.championName}
                          {d.runnerUpName ? ` · 2° ${d.runnerUpName}` : ''}
                          {d.thirdPlaceName ? ` · 3° ${d.thirdPlaceName}` : ''}
                        </p>
                      )}
                    </button>
                    {isSuperAdmin && (
                      <div className="px-4 py-2 border-t border-[#E2E7E4]/80 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditDivisionForm(d)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#E2E7E4] text-[11px] font-medium text-[#0F1A15] hover:bg-slate-50"
                        >
                          <Edit3 className="w-3 h-3 text-[#14532D]" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteDivisionId(d.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-red-200 text-[11px] font-medium text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-3 h-3" />
                          Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {confirmDeleteDivisionId && (
              <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-red-900 font-medium">
                  ¿Eliminar la división seleccionada junto con todas sus inscripciones, grupos, partidos, jornadas y fotos?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteDivisionId(null)}
                    className="px-3 py-1.5 rounded-lg border border-red-200 bg-white text-xs font-medium text-[#0F1A15]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleDeleteDivision(confirmDeleteDivisionId)}
                    className="px-3.5 py-1.5 rounded-lg bg-red-700 text-white text-xs font-medium hover:bg-red-800"
                  >
                    {saving ? 'Eliminando...' : 'Confirmar eliminación'}
                  </button>
                </div>
              </div>
            )}

            {selectedDivision && (
              <div className="mt-4 p-4 rounded-xl bg-[#F8F9F8] border border-[#E2E7E4] flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-[#0F1A15]">
                    Opciones de reglamento · {selectedDivision.name}
                  </p>
                  <p className="text-[11px] text-[#4A5550]">
                    Ajustá puntajes opcionales, sistema de tie-break a 10 puntos y partido por 3er puesto.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-[#0F1A15]">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedDivision.itfConfig.setTiebreakPoints === 10}
                      onChange={() => handleToggleDivisionOption(selectedDivision, 'setTiebreak10')}
                    />
                    Tie-break a 10 pts (ej. 10-3, 10-1)
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedDivision.itfConfig.tiebreakExactTarget)}
                      onChange={() => handleToggleDivisionOption(selectedDivision, 'tiebreakExactTarget')}
                    />
                    El que llegue primero (sin dif. de 2)
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedDivision.itfConfig.directTiebreakMatch)}
                      onChange={() => handleToggleDivisionOption(selectedDivision, 'directTiebreakMatch')}
                    />
                    Partido directo a TB 10
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedDivision.itfConfig.optionalSetScores)}
                      onChange={() => handleToggleDivisionOption(selectedDivision, 'optionalSetScores')}
                    />
                    Puntaje por sets opcional
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedDivision.hasThirdPlaceMatch)}
                      onChange={() => handleToggleDivisionOption(selectedDivision, 'hasThirdPlaceMatch')}
                    />
                    Disputar 3er puesto
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Publicidad personalizada del torneo */}
          <div className="pt-5 border-t border-[#E2E7E4] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-[#14532D]" />
                <div>
                  <h4 className="text-sm font-semibold text-[#0F1A15]">
                    Publicidades personalizadas del torneo ({activeAds.length})
                  </h4>
                  <p className="text-[11px] text-[#4A5550]">
                    Cargá múltiples banners y sponsors exclusivos para {activeTournament.name}. Se publican en el portal público según su ubicación.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={openNewAdForm}
                className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] sm:min-h-[34px] rounded-lg bg-[#14532D] text-white text-xs font-medium hover:bg-[#166534]"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar publicidad
              </button>
            </div>

            {showAdForm && (
              <form
                onSubmit={handleSaveAd}
                className="p-4 rounded-xl bg-[#F8F9F8] border border-[#E2E7E4] space-y-4"
              >
                <h5 className="text-xs font-semibold text-[#0F1A15]">
                  {editingAdId ? 'Editar publicidad' : `Nueva publicidad para ${activeTournament.name}`}
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#4A5550] mb-1">Sponsor / Marca *</label>
                    <input
                      required
                      value={adSponsor}
                      onChange={(e) => setAdSponsor(e.target.value)}
                      placeholder="Ej. Asunción Pro Shop"
                      className="w-full h-9 px-2.5 rounded-lg border border-[#E2E7E4] bg-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A5550] mb-1">Título del anuncio *</label>
                    <input
                      required
                      value={adTitle}
                      onChange={(e) => setAdTitle(e.target.value)}
                      placeholder="Ej. 20% off en encordado oficial"
                      className="w-full h-9 px-2.5 rounded-lg border border-[#E2E7E4] bg-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A5550] mb-1">Subtítulo (opcional)</label>
                    <input
                      value={adSubtitle}
                      onChange={(e) => setAdSubtitle(e.target.value)}
                      placeholder="Detalle o promoción vigente"
                      className="w-full h-9 px-2.5 rounded-lg border border-[#E2E7E4] bg-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A5550] mb-1">Ubicación en portal</label>
                    <select
                      value={adPlacement}
                      onChange={(e) => setAdPlacement(e.target.value as AdPlacement)}
                      className="w-full h-9 px-2.5 rounded-lg border border-[#E2E7E4] bg-white text-xs"
                    >
                      <option value="banner_principal">{PLACEMENT_LABELS.banner_principal}</option>
                      <option value="lateral">{PLACEMENT_LABELS.lateral}</option>
                      <option value="pie">{PLACEMENT_LABELS.pie}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A5550] mb-1">Enlace destino (opcional)</label>
                    <input
                      type="url"
                      value={adTargetUrl}
                      onChange={(e) => setAdTargetUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full h-9 px-2.5 rounded-lg border border-[#E2E7E4] bg-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A5550] mb-1">URL imagen o subir archivo *</label>
                    <div className="flex items-center gap-2">
                      <input
                        value={adImageUrl}
                        onChange={(e) => setAdImageUrl(e.target.value)}
                        placeholder="https://... o subir"
                        className="flex-1 h-9 px-2.5 rounded-lg border border-[#E2E7E4] bg-white text-xs min-w-0"
                      />
                      <label className="inline-flex items-center gap-1 px-2.5 h-9 rounded-lg border border-[#E2E7E4] bg-white text-xs font-medium text-[#0F1A15] hover:bg-slate-50 cursor-pointer shrink-0">
                        <Upload className="w-3.5 h-3.5 text-[#14532D]" />
                        {uploadingAdImg ? 'Subiendo...' : 'Subir'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleUploadAdImage}
                          disabled={uploadingAdImg}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {adImageUrl && (
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-[#E2E7E4]">
                    <img
                      src={adImageUrl}
                      alt="Vista previa banner publicitario"
                      referrerPolicy="no-referrer"
                      className="w-28 aspect-[16/9] rounded-lg object-cover border border-[#E2E7E4] shrink-0"
                    />
                    <p className="text-xs text-[#4A5550] truncate">Vista previa del banner ({adSponsor || 'Sponsor'})</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-xs text-[#0F1A15] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={adActive}
                      onChange={(e) => setAdActive(e.target.checked)}
                    />
                    Publicidad visible en el portal público
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAdForm(false);
                        setEditingAdId(null);
                      }}
                      className="px-3.5 py-2 rounded-lg border border-[#E2E7E4] bg-white text-xs font-medium"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#14532D] text-white text-xs font-medium hover:bg-[#166534]"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {editingAdId ? 'Guardar publicidad' : 'Publicar anuncio'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {activeAds.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#E2E7E4] p-6 text-center text-xs text-[#4A5550]">
                Este torneo aún no tiene publicidades cargadas. Agregá banners de auspiciantes propios del torneo.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeAds.map((ad, idx) => (
                  <div
                    key={ad.id}
                    className={`rounded-xl border p-3.5 flex flex-col justify-between gap-3 ${
                      ad.active ? 'border-[#E2E7E4] bg-white' : 'border-[#E2E7E4] bg-[#F8F9F8] opacity-75'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <img
                        src={ad.imageUrl}
                        alt={ad.sponsorName}
                        referrerPolicy="no-referrer"
                        className="w-24 aspect-[16/9] rounded-lg object-cover border border-[#E2E7E4] shrink-0 bg-slate-100"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#14532D] truncate">
                            {ad.sponsorName}
                          </p>
                          <span className="text-[11px] font-medium text-[#4A5550] shrink-0">
                            {ad.active ? 'Activa' : 'Pausada'}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-[#0F1A15] mt-0.5 line-clamp-1">
                          {ad.title}
                        </p>
                        <p className="text-[11px] text-[#4A5550] mt-0.5 truncate">
                          {PLACEMENT_LABELS[ad.placement]}
                        </p>
                        {ad.targetUrl && (
                          <a
                            href={ad.targetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-[#14532D] hover:underline mt-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Enlace externo
                          </a>
                        )}
                      </div>
                    </div>

                    {confirmDeleteAdId === ad.id ? (
                      <div className="pt-2 border-t border-red-200 flex items-center justify-between gap-2 text-xs">
                        <span className="text-red-800 font-medium">¿Eliminar anuncio?</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteAdId(null)}
                            className="px-2.5 py-1 rounded border border-[#E2E7E4] bg-white text-[11px]"
                          >
                            No
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAd(ad.id)}
                            className="px-2.5 py-1 rounded bg-red-700 text-white text-[11px] font-medium"
                          >
                            Sí, eliminar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-2 border-t border-[#E2E7E4] flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleReorderAd(idx, -1)}
                            title="Subir orden"
                            className="p-1.5 rounded border border-[#E2E7E4] text-[#4A5550] disabled:opacity-40"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === activeAds.length - 1}
                            onClick={() => handleReorderAd(idx, 1)}
                            title="Bajar orden"
                            className="p-1.5 rounded border border-[#E2E7E4] text-[#4A5550] disabled:opacity-40"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleAdActive(ad)}
                            className="px-2.5 py-1 rounded-lg border border-[#E2E7E4] text-[11px] font-medium text-[#0F1A15] hover:bg-slate-50"
                          >
                            {ad.active ? 'Pausar' : 'Activar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditAdForm(ad)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E2E7E4] text-[11px] font-medium text-[#0F1A15] hover:bg-slate-50"
                          >
                            <Edit3 className="w-3 h-3 text-[#14532D]" />
                            Editar
                          </button>
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteAdId(ad.id)}
                              title="Eliminar publicidad"
                              className="p-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

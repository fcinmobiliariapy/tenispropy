import { Division, Match, Tournament } from '../types/tennis';
import { formatScoreString } from './itfRules';
import { formatAsuncionDate } from './tournamentEngine';

export interface BuildMatchWhatsAppParams {
  match: Match;
  tournament?: Tournament | null;
  division?: Division | null;
  tournamentName?: string;
  divisionName?: string;
  appUrl?: string;
}

export function getAppBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}`;
}

export function getWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function buildMatchWhatsAppMessage({
  match,
  tournament,
  division,
  tournamentName,
  divisionName,
  appUrl,
}: BuildMatchWhatsAppParams): string {
  const tName = tournament?.name || tournamentName || 'PlayPy';
  const dName = division?.name || divisionName;
  const url = appUrl || getAppBaseUrl();
  const hasResult = Boolean(
    match.winnerEntryId &&
      ['finalizado', 'wo', 'retiro', 'descalificado'].includes(match.status)
  );
  const scoreStr = formatScoreString(match.sets, match.status);

  const lines: string[] = [];
  lines.push(`🎾 *${tName}*${dName ? ` · ${dName}` : ''}`);
  lines.push(`📌 *${match.roundName}*`);
  lines.push(`🆚 *${match.entryAName}* vs *${match.entryBName}*`);

  if (hasResult) {
    if (match.status === 'wo') {
      lines.push(`📋 Marcador: *W.O. (Walk Over)*`);
    } else {
      lines.push(`📊 Marcador: *${scoreStr}*`);
    }
    if (match.winnerName) {
      lines.push(`🏆 Ganador: *${match.winnerName}*${match.status === 'wo' ? ' (por W.O.)' : ''}`);
    }
  } else if (match.status === 'en_curso') {
    lines.push(`🔴 *En cancha ahora*`);
  } else {
    lines.push(`⏳ *Partido programado*`);
  }

  const whenParts: string[] = [];
  if (match.scheduledDate) {
    whenParts.push(
      `${formatAsuncionDate(match.scheduledDate)}${match.scheduledTime ? ` ${match.scheduledTime} hs` : ''}`
    );
  }
  if (match.courtName) {
    whenParts.push(match.courtName);
  }
  if (whenParts.length > 0) {
    lines.push(`📍 ${whenParts.join(' · ')}`);
  } else if (tournament?.venue) {
    lines.push(`📍 ${tournament.venue}${tournament.city ? `, ${tournament.city}` : ''}`);
  }

  if (match.outcomeNote) {
    lines.push(`📝 ${match.outcomeNote}`);
  }

  if (url) {
    lines.push(`🔗 Seguilo en vivo en PlayPy: ${url}`);
  }

  return lines.join('\n');
}

export function buildFixtureAgendaWhatsAppMessage(params: {
  matches: Match[];
  tournamentName: string;
  divisionName?: string;
  appUrl?: string;
}): string {
  const { matches, tournamentName, divisionName, appUrl } = params;
  const url = appUrl || getAppBaseUrl();
  const visible = matches.filter((m) => !m.isBye).slice(0, 12);
  const lines: string[] = [];
  lines.push(`🎾 *${tournamentName}*${divisionName ? ` — ${divisionName}` : ''}`);
  lines.push(`📅 *Fixture y resultados (${visible.length}${matches.length > 12 ? ` de ${matches.length}` : ''} partidos):*`);
  lines.push('');

  visible.forEach((m, idx) => {
    const when = m.scheduledDate
      ? `${formatAsuncionDate(m.scheduledDate)}${m.scheduledTime ? ` ${m.scheduledTime}h` : ''}`
      : 'Por programar';
    const hasResult =
      m.winnerEntryId && ['finalizado', 'wo', 'retiro', 'descalificado'].includes(m.status);
    const resultTxt = hasResult
      ? `✅ ${formatScoreString(m.sets, m.status)} (${m.winnerName})`
      : m.status === 'en_curso'
      ? '🔴 En cancha'
      : `🕒 ${when}${m.courtName ? ` · ${m.courtName}` : ''}`;

    lines.push(`${idx + 1}. *${m.entryAName}* vs *${m.entryBName}* (${m.roundName})`);
    lines.push(`   ${resultTxt}`);
  });

  if (url) {
    lines.push('');
    lines.push(`🔗 Ver cuadro y tabla completa en PlayPy: ${url}`);
  }
  return lines.join('\n');
}

export function buildTournamentWhatsAppMessage(params: {
  tournament: Tournament;
  division?: Division | null;
  appUrl?: string;
}): string {
  const { tournament, division, appUrl } = params;
  const url = appUrl || getAppBaseUrl();
  const lines: string[] = [
    `🏆 *${tournament.name}*`,
    `📍 ${tournament.venue}, ${tournament.city}`,
    `📅 ${tournament.startDate} al ${tournament.endDate}`,
  ];
  if (division) {
    lines.push(`🎾 División: *${division.name}*`);
  }
  if (url) {
    lines.push(`🔗 Seguí el fixture, posiciones, cuadros y fotos en PlayPy: ${url}`);
  }
  return lines.join('\n');
}

export function buildTrophyWhatsAppMessage(params: {
  trophyTitle: string;
  tournamentName: string;
  divisionName?: string;
  placeLabel: string;
  recipientName?: string | null;
  engravingText?: string | null;
  appUrl?: string;
}): string {
  const { trophyTitle, tournamentName, divisionName, placeLabel, recipientName, engravingText, appUrl } =
    params;
  const url = appUrl || getAppBaseUrl();
  const lines: string[] = [
    `🏆 *${trophyTitle}*`,
    `🎾 *${tournamentName}*${divisionName ? ` · ${divisionName}` : ''}`,
    `🥇 Premio: *${placeLabel}*`,
  ];
  if (recipientName) {
    lines.push(`👤 Ganador/a: *${recipientName}*`);
  }
  if (engravingText) {
    lines.push(`✨ Grabado oficial: _${engravingText}_`);
  }
  if (url) {
    lines.push(`🔗 Mirá los Premios del Torneo en PlayPy: ${url}`);
  }
  return lines.join('\n');
}

export function buildHeadToHeadWhatsAppMessage(params: {
  match: Match;
  winsA: number;
  winsB: number;
  totalMeetings: number;
  tournamentName?: string;
  divisionName?: string;
  appUrl?: string;
}): string {
  const { match, winsA, winsB, totalMeetings, tournamentName, divisionName, appUrl } = params;
  const url = appUrl || getAppBaseUrl();
  const lines: string[] = [
    `⚔️ *Cara a Cara · ${tournamentName || 'PlayPy'}*${divisionName ? ` · ${divisionName}` : ''}`,
    `📌 *${match.roundName}*`,
    `🆚 *${match.entryAName}* vs *${match.entryBName}*`,
    totalMeetings > 0
      ? `📊 Historial previo en PlayPy: *${winsA} - ${winsB}* (${totalMeetings} ${totalMeetings === 1 ? 'cruce' : 'cruces'})`
      : `✨ *Primer enfrentamiento oficial registrado*`,
  ];

  const hasResult = Boolean(
    match.winnerEntryId &&
      ['finalizado', 'wo', 'retiro', 'descalificado'].includes(match.status)
  );
  if (hasResult) {
    lines.push(`🏆 Resultado actual: *${formatScoreString(match.sets, match.status)}*${match.winnerName ? ` (${match.winnerName})` : ''}`);
  } else if (match.scheduledDate) {
    lines.push(
      `📅 ${formatAsuncionDate(match.scheduledDate)}${match.scheduledTime ? ` · ${match.scheduledTime} hs` : ''}${match.courtName ? ` · ${match.courtName}` : ''}`
    );
  }

  if (url) {
    lines.push(`🔗 Seguilo en PlayPy: ${url}`);
  }
  return lines.join('\n');
}

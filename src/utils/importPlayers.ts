import * as XLSX from 'xlsx';
import { Gender } from '../types/tennis';

export interface ParsedImportPlayerRow {
  rowIndex: number;
  firstName: string;
  lastName: string;
  documentNumber: string;
  birthDate: string;
  phone: string;
  email: string;
  club: string;
  habitualCategory: string;
  gender: Gender;
  status: 'valid' | 'duplicate' | 'error';
  messages: string[];
  existingPlayerId?: string;
}

function normalizeHeader(h: string): string {
  return String(h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_');
}

function pickField(row: Record<string, unknown>, keys: string[]): string {
  for (const k of Object.keys(row)) {
    const norm = normalizeHeader(k);
    if (keys.some((target) => norm.includes(target))) {
      return String(row[k] ?? '').trim();
    }
  }
  return '';
}

export async function parsePlayersImportFile(
  file: File,
  existingDocsMap: Map<string, string>, // normalizedDoc -> playerId
  enabledCategories: string[] = []
): Promise<ParsedImportPlayerRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], {
    defval: '',
  });

  const seenDocsInFile = new Set<string>();
  const defaultCategory = enabledCategories[0] || '5ta';

  return rawRows.map((raw, idx) => {
    const firstName = pickField(raw, ['nombre', 'first']);
    const lastName = pickField(raw, ['apellido', 'last']);
    const documentNumber = pickField(raw, ['documento', 'ci', 'dni', 'doc']);
    const birthDate = pickField(raw, ['nacimiento', 'fecha', 'birth']);
    const phone = pickField(raw, ['telefono', 'celular', 'tel', 'phone']);
    const email = pickField(raw, ['correo', 'email', 'mail']);
    const club = pickField(raw, ['club', 'academia']) || 'Independiente';
    const rawCategory = pickField(raw, ['categoria', 'cat']);
    let habitualCategory = rawCategory || defaultCategory;

    if (enabledCategories.length > 0 && rawCategory) {
      const matched = enabledCategories.find(
        (c) => c.toLowerCase() === rawCategory.toLowerCase()
      );
      if (matched) {
        habitualCategory = matched;
      }
    }

    const genderRaw = pickField(raw, ['rama', 'genero', 'sexo']).toLowerCase();
    const gender: Gender =
      genderRaw.startsWith('f') || genderRaw.includes('dam') || genderRaw.includes('muj')
        ? 'Femenino'
        : 'Masculino';

    const messages: string[] = [];
    if (!firstName) messages.push('Falta nombre');
    if (!lastName) messages.push('Falta apellido');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      messages.push('Correo inválido');
    }
    if (
      enabledCategories.length > 0 &&
      rawCategory &&
      !enabledCategories.some((c) => c.toLowerCase() === rawCategory.toLowerCase())
    ) {
      messages.push(`Cat. "${rawCategory}" no figura en divisiones (${enabledCategories.join(', ')})`);
    }

    const normDoc = documentNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    let status: 'valid' | 'duplicate' | 'error' = messages.some(
      (m) => m === 'Falta nombre' || m === 'Falta apellido' || m === 'Correo inválido'
    )
      ? 'error'
      : 'valid';
    let existingPlayerId: string | undefined;

    if (normDoc && normDoc !== 'SD') {
      if (seenDocsInFile.has(normDoc)) {
        status = 'duplicate';
        messages.push('Documento duplicado dentro del archivo');
      } else if (existingDocsMap.has(normDoc)) {
        status = 'duplicate';
        existingPlayerId = existingDocsMap.get(normDoc);
        messages.push('Documento ya registrado en este torneo');
      }
      seenDocsInFile.add(normDoc);
    }

    return {
      rowIndex: idx + 2,
      firstName,
      lastName,
      documentNumber,
      birthDate,
      phone,
      email,
      club,
      habitualCategory,
      gender,
      status,
      messages,
      existingPlayerId,
    };
  });
}

export function downloadCsvTemplate(enabledCategories: string[] = []): void {
  const cat1 = enabledCategories[0] || '5ta';
  const cat2 = enabledCategories[1] || enabledCategories[0] || '4ta';
  const csv = [
    'nombres,apellidos,documento,fecha_nacimiento,telefono,correo,club,categoria_habitual,rama',
    `Rodrigo,Galeano,4589120,1994-05-12,+595981223344,rodrigo.galeano@ejemplo.py,Club Internacional de Tenis,${cat1},Masculino`,
    `Valeria,Acosta,,,+595971889900,valeria.acosta@ejemplo.py,Yacht y Golf Club,${cat2},Femenino`,
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla_jugadores_teniscupy.csv';
  a.click();
  URL.revokeObjectURL(url);
}

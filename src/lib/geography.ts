import type { Barangay, Municipality } from '@/types';

const NAME_PATTERN = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{1,79}$/;

export function cleanGeoName(name: string): string {
  return name.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function geoNameKey(name: string): string {
  return cleanGeoName(name).toLowerCase();
}

export function validateGeoName(name: string): string | null {
  const cleaned = cleanGeoName(name);
  if (!cleaned) return 'Enter a name.';
  if (!NAME_PATTERN.test(cleaned)) {
    return 'Use 2 to 80 letters, spaces, periods, hyphens, or apostrophes.';
  }
  return null;
}

export interface BarangayImportRow {
  municipality_id: string;
  name: string;
}

export interface BarangayImportResult {
  rows: BarangayImportRow[];
  duplicates: number;
  errors: string[];
}

export function parseBarangayCsv(
  text: string,
  municipalities: Municipality[],
  existing: Barangay[],
): BarangayImportResult {
  const result: BarangayImportResult = { rows: [], duplicates: 0, errors: [] };
  const municipalityByName = new Map(municipalities.map((m) => [geoNameKey(m.name), m]));
  const seen = new Set(existing.map((b) => `${b.municipality_id}|${geoNameKey(b.name)}`));

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const [rawMunicipality, ...rest] = line.split(',');
    const rawName = rest.join(',');

    if (index === 0 && geoNameKey(rawMunicipality ?? '') === 'municipality') return;

    const municipality = municipalityByName.get(geoNameKey(rawMunicipality ?? ''));
    if (!municipality) {
      result.errors.push(`Line ${lineNo}: "${cleanGeoName(rawMunicipality ?? '')}" is not one of the six municipalities.`);
      return;
    }

    const nameError = validateGeoName(rawName);
    if (nameError) {
      result.errors.push(`Line ${lineNo}: ${nameError}`);
      return;
    }

    const key = `${municipality.id}|${geoNameKey(rawName)}`;
    if (seen.has(key)) {
      result.duplicates += 1;
      return;
    }
    seen.add(key);
    result.rows.push({ municipality_id: municipality.id, name: cleanGeoName(rawName) });
  });

  return result;
}

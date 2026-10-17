import type { ActivePastoralYear, UserContext } from "../../auth/auth-service";
import type { Tables } from "../../types/database.types";
import { getSupabaseClient } from "../../lib/supabase";
import { navigateToFaithful } from "../../router";

type SacramentKey = "bapteme" | "eucharistie" | "confirmation" | "mariage";
type ChartStyle = "line" | "area" | "columns" | "stacked";
type SacramentRow = Pick<Tables<"sacrements">,
  "id" | "fidele_id" | "paroisse_id" | "type" | "annee_pastorale_id" |
  "communaute_historique_id" | "jour" | "mois" | "annee" | "precision" |
  "lieu" | "numero_acte" | "page_registre" | "ministre" | "visa" | "parrain" | "marraine"
>;
type MarriageRow = Pick<Tables<"evenements_matrimoniaux">,
  "id" | "fidele_id" | "paroisse_id" | "annee_pastorale_id" |
  "communaute_historique_id" | "type" | "jour" | "mois" | "annee" |
  "precision" | "lieu" | "numero_acte" | "page_registre" | "ministre" | "visa" | "conjoint_nom"
>;
type YearRow = Pick<Tables<"annees_pastorales">, "id" | "libelle" | "date_debut" | "date_fin" | "active">;
type CommunityRow = Pick<Tables<"communautes">, "id" | "nom" | "quartier_id">;
type QuarterRow = Pick<Tables<"quartiers">, "id" | "nom">;
type SacramentEntry = {
  id: string;
  fidele_id: string;
  pastoralYearId: string;
  communityId: string;
  type: SacramentKey;
  sourceType: string;
  day: number | null;
  month: number | null;
  year: number | null;
  precision: string;
  place: string;
  act: string;
  page: string;
  minister: string;
  visa: string;
  godfather: string;
  godmother: string;
  spouse: string;
};
type MonthPoint = { year: number; month: number; key: string; label: string };
type Series = { key: SacramentKey; label: string; color: string; values: number[] };
type Sheet = { name: string; rows: (string | number | boolean | null)[][] };

const SACRAMENTS: { key: SacramentKey; label: string; plural: string; color: string }[] = [
  { key: "bapteme", label: "Baptême", plural: "Baptêmes", color: "#26A69A" },
  { key: "eucharistie", label: "Eucharistie", plural: "Eucharisties", color: "#4387DE" },
  { key: "confirmation", label: "Confirmation", plural: "Confirmations", color: "#9B70D6" },
  { key: "mariage", label: "Mariage", plural: "Mariages", color: "#E5A44B" }
];
const SACRAMENT_MAP = new Map(SACRAMENTS.map((item) => [item.key, item]));
const PAGE_SIZE = 500;

function esc(value: unknown): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, (character) => map[character] ?? character);
}
function numberFr(value: number): string {
  return value.toLocaleString("fr-CD");
}
function monthLabel(year: number, month: number, format: "long" | "short" = "long"): string {
  return new Intl.DateTimeFormat("fr-CD", { month: format, year: "numeric" }).format(new Date(year, month - 1, 1));
}
function fourRecentMonths(reference = new Date()): MonthPoint[] {
  return Array.from({ length: 4 }, (_, index) => {
    const date = new Date(reference.getFullYear(), reference.getMonth() - 3 + index, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return { year, month, key: year + "-" + String(month).padStart(2, "0"), label: monthLabel(year, month, "short") };
  });
}
function monthMatches(entry: SacramentEntry, point: MonthPoint): boolean {
  return entry.year === point.year && entry.month === point.month;
}
function formatDate(entry: Pick<SacramentEntry, "day" | "month" | "year" | "precision">): string {
  if (entry.precision === "inconnue" || (!entry.year && !entry.month && !entry.day)) return "Date inconnue";
  if (!entry.year) return "Date incomplète";
  if (entry.precision === "annee" || !entry.month) return String(entry.year);
  if (entry.precision === "mois" || !entry.day) return monthLabel(entry.year, entry.month);
  return new Intl.DateTimeFormat("fr-CD", { dateStyle: "medium" }).format(new Date(entry.year, entry.month - 1, entry.day));
}
function csvSafe(value: unknown): string {
  return '"' + String(value ?? "").replace(/"/g, '""') + '"';
}
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function entriesFromRows(sacraments: SacramentRow[], marriages: MarriageRow[]): SacramentEntry[] {
  const normal: SacramentEntry[] = sacraments.map((row) => ({
    id: row.id, fidele_id: row.fidele_id, pastoralYearId: row.annee_pastorale_id,
    communityId: row.communaute_historique_id, type: row.type, sourceType: row.type,
    day: row.jour, month: row.mois, year: row.annee, precision: row.precision,
    place: row.lieu ?? "", act: row.numero_acte ?? "", page: row.page_registre ?? "",
    minister: row.ministre ?? "", visa: row.visa ?? "", godfather: row.parrain ?? "",
    godmother: row.marraine ?? "", spouse: ""
  }));
  const weddingEntries: SacramentEntry[] = marriages.map((row) => ({
    id: row.id, fidele_id: row.fidele_id, pastoralYearId: row.annee_pastorale_id,
    communityId: row.communaute_historique_id, type: "mariage", sourceType: row.type,
    day: row.jour, month: row.mois, year: row.annee, precision: row.precision,
    place: row.lieu ?? "", act: row.numero_acte ?? "", page: row.page_registre ?? "",
    minister: row.ministre ?? "", visa: row.visa ?? "", godfather: "",
    godmother: "", spouse: row.conjoint_nom ?? ""
  }));
  return [...normal, ...weddingEntries];
}
function seriesFor(entries: SacramentEntry[], months: MonthPoint[]): Series[] {
  return SACRAMENTS.map((sacrament) => ({
    key: sacrament.key,
    label: sacrament.plural,
    color: sacrament.color,
    values: months.map((month) => entries.filter((entry) => entry.type === sacrament.key && monthMatches(entry, month)).length)
  }));
}
function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
function regression(values: number[]): [number, number] {
  const n = values.length;
  if (n < 2) return [values[0] ?? 0, 0];
  const xs = values.map((_, index) => index);
  const xMean = sum(xs) / n;
  const yMean = sum(values) / n;
  const numerator = sum(values.map((value, index) => (xs[index] - xMean) * (value - yMean)));
  const denominator = sum(xs.map((value) => (value - xMean) ** 2)) || 1;
  const slope = numerator / denominator;
  return [yMean - slope * xMean, slope];
}
function renderDonut(node: HTMLElement, values: { label: string; value: number; color: string }[]): void {
  const total = sum(values.map((item) => item.value));
  let cursor = 0;
  const segments = values.filter((item) => item.value > 0).map((item) => {
    const start = cursor;
    cursor += total ? item.value / total * 100 : 0;
    return item.color + " " + start.toFixed(2) + "% " + cursor.toFixed(2) + "%";
  });
  const background = segments.length ? "conic-gradient(" + segments.join(",") + ")" : "conic-gradient(#94a3b8 0 100%)";
  node.innerHTML = '<div class="flex flex-col items-center gap-5 sm:flex-row sm:items-center">' +
    '<div class="sacrament-donut-ring shrink-0" style="background:' + background + '"><div class="sacrament-donut-hole"><strong>' + numberFr(total) + '</strong><span>actes</span></div></div>' +
    '<div class="grid w-full gap-3">' + values.map((item) => {
      const pct = total ? item.value / total * 100 : 0;
      return '<div class="flex items-center justify-between gap-3"><span class="flex min-w-0 items-center gap-2 text-sm text-slate-600"><i class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:' + item.color + '"></i><span class="truncate">' + esc(item.label) + '</span></span><span class="shrink-0 text-right text-sm font-semibold text-slate-800">' + numberFr(item.value) + '<small class="ml-2 font-normal text-slate-400">' + pct.toFixed(1).replace(".", ",") + '%</small></span></div>';
    }).join("") + '</div></div>';
}
function renderTrendChart(node: HTMLElement, months: MonthPoint[], series: Series[], style: ChartStyle): void {
  const width = 760, height = 320, left = 46, right = 18, top = 20, bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const totals = months.map((_, index) => sum(series.map((item) => item.values[index] ?? 0)));
  const maxValue = Math.max(4, ...totals, ...series.flatMap((item) => item.values));
  const maxAxis = Math.ceil(maxValue / 5) * 5 || 5;
  const x = (index: number): number => left + (months.length <= 1 ? plotWidth / 2 : index * plotWidth / (months.length - 1));
  const y = (value: number): number => top + plotHeight - (value / maxAxis) * plotHeight;
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = maxAxis * index / 4;
    const yy = y(value);
    return '<line x1="' + left + '" y1="' + yy + '" x2="' + (width - right) + '" y2="' + yy + '" stroke="var(--border-control)" stroke-dasharray="3 5"/>' +
      '<text x="' + (left - 10) + '" y="' + (yy + 4) + '" text-anchor="end" fill="currentColor" font-size="10">' + Math.round(value) + '</text>';
  }).join("");
  let marks = "";
  if (style === "columns" || style === "stacked") {
    const groupWidth = plotWidth / months.length;
    if (style === "stacked") {
      marks = months.map((month, index) => {
        let running = 0;
        return series.map((item) => {
          const value = item.values[index] ?? 0;
          const rectHeight = value / maxAxis * plotHeight;
          const rectY = y(running + value);
          running += value;
          return '<rect x="' + (x(index) - groupWidth * .25) + '" y="' + rectY + '" width="' + (groupWidth * .5) + '" height="' + Math.max(0, rectHeight) + '" rx="4" fill="' + item.color + '"><title>' + esc(item.label) + ' · ' + esc(month.label) + ' : ' + numberFr(value) + '</title></rect>';
        }).join("");
      }).join("");
    } else {
      const barWidth = Math.min(25, groupWidth / (series.length + 1));
      marks = months.map((month, index) => series.map((item, seriesIndex) => {
        const value = item.values[index] ?? 0;
        const xx = x(index) + (seriesIndex - (series.length - 1) / 2) * (barWidth + 2) - barWidth / 2;
        const yy = y(value);
        return '<rect x="' + xx + '" y="' + yy + '" width="' + barWidth + '" height="' + Math.max(0, top + plotHeight - yy) + '" rx="3" fill="' + item.color + '"><title>' + esc(item.label) + ' · ' + esc(month.label) + ' : ' + numberFr(value) + '</title></rect>';
      }).join("")).join("");
    }
  } else {
    marks = series.map((item) => {
      const points = item.values.map((value, index) => ({ x: x(index), y: y(value) }));
      const linePath = points.map((point, index) => (index === 0 ? "M " : "L ") + point.x + " " + point.y).join(" ");
      const [intercept, slope] = regression(item.values);
      const trendY0 = y(Math.max(0, Math.min(maxAxis, intercept)));
      const trendY1 = y(Math.max(0, Math.min(maxAxis, intercept + slope * (months.length - 1))));
      const areaPath = linePath + " L " + points[points.length - 1].x + " " + (top + plotHeight) + " L " + points[0].x + " " + (top + plotHeight) + " Z";
      const area = style === "area" ? '<path d="' + areaPath + '" fill="' + item.color + '" opacity=".10"/>' : "";
      const trend = '<line x1="' + x(0) + '" y1="' + trendY0 + '" x2="' + x(months.length - 1) + '" y2="' + trendY1 + '" stroke="' + item.color + '" stroke-width="1.5" stroke-dasharray="4 5" opacity=".65"/>';
      const line = '<path d="' + linePath + '" fill="none" stroke="' + item.color + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
      const circles = points.map((point, index) => '<circle cx="' + point.x + '" cy="' + point.y + '" r="4.5" fill="' + item.color + '" stroke="var(--bg-card)" stroke-width="2"><title>' + esc(item.label) + ' · ' + esc(months[index].label) + ' : ' + numberFr(item.values[index]) + '</title></circle>').join("");
      return area + trend + line + circles;
    }).join("");
  }
  const xLabels = months.map((month, index) => '<text x="' + x(index) + '" y="' + (height - 18) + '" text-anchor="middle" fill="currentColor" font-size="11">' + esc(month.label) + '</text>').join("");
  const svg = '<svg class="sacrament-chart-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Évolution des sacrements au cours des quatre derniers mois">' + grid + marks + xLabels + '</svg>';
  const legend = '<div class="flex flex-wrap gap-x-5 gap-y-2">' + series.map((item) => '<span class="flex items-center gap-2 text-xs text-slate-600"><i class="h-2.5 w-2.5 rounded-full" style="background:' + item.color + '"></i>' + esc(item.plural ?? item.label) + '</span>').join("") + '</div>';
  node.innerHTML = '<div class="min-w-[520px]">' + svg + '</div>' + legend +
    '<p class="mt-3 text-[11px] text-slate-400">Les traits pointillés montrent la tendance linéaire de chaque série ; les valeurs sont calculées à partir du mois et de l’année du sacrement.</p>';
}
function renderAnnualComparison(node: HTMLElement, years: YearRow[], entries: SacramentEntry[]): void {
  const totalsByYear = years.map((year) => {
    const values = SACRAMENTS.map((item) => ({
      ...item,
      value: entries.filter((entry) => entry.type === item.key && entry.pastoralYearId === year.id).length
    }));
    return { year, values, total: sum(values.map((item) => item.value)) };
  });
  const max = Math.max(1, ...totalsByYear.map((item) => item.total));
  node.innerHTML = totalsByYear.length ? totalsByYear.map((item) => {
    const segments = item.values.filter((x) => x.value > 0).map((x) =>
      '<span title="' + esc(x.label) + ' : ' + numberFr(x.value) + '" style="width:' + (x.value / max * 100).toFixed(2) + '%;background:' + x.color + '"></span>'
    ).join("");
    return '<div class="space-y-2"><div class="flex items-center justify-between gap-3"><span class="text-sm font-semibold text-slate-700">' + esc(item.year.libelle) + '</span><span class="text-sm font-bold tabular-nums text-slate-900">' + numberFr(item.total) + '</span></div><div class="sacrament-annual-track">' + segments + '</div><div class="flex flex-wrap gap-x-3 gap-y-1">' + item.values.map((x) => '<span class="text-[10px] text-slate-500">' + esc(x.label) + ' : ' + numberFr(x.value) + '</span>').join("") + '</div></div>';
  }).join('<div class="my-4 border-t border-slate-100"></div>') : '<p class="text-sm text-slate-400">Aucune année pastorale visible.</p>';
}
function reportEntryMatches(entry: SacramentEntry, type: string, year: number, month: number | null): boolean {
  if (entry.year !== year) return false;
  if (type !== "tous" && entry.type !== type) return false;
  return month === null || entry.month === month;
}
function monthOverMonth(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "Stable" : "Nouveau volume";
  const pct = (current - previous) / previous * 100;
  return (pct > 0 ? "+" : "") + pct.toFixed(1).replace(".", ",") + "%";
}
function columnName(index: number): string {
  let n = index + 1, result = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - remainder) / 26);
  }
  return result;
}
function xmlEscape(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function worksheetXml(rows: Sheet["rows"]): string {
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      if (value === null || value === undefined || value === "") return "";
      const ref = columnName(columnIndex) + (rowIndex + 1);
      const style = rowIndex === 0 ? ' s="1"' : "";
      if (typeof value === "number" && Number.isFinite(value)) return '<c r="' + ref + '"' + style + '><v>' + value + '</v></c>';
      if (typeof value === "boolean") return '<c r="' + ref + '" t="b"' + style + '><v>' + (value ? "1" : "0") + '</v></c>';
      return '<c r="' + ref + '" t="inlineStr"' + style + '><is><t xml:space="preserve">' + xmlEscape(value) + '</t></is></c>';
    }).join("");
    return '<row r="' + (rowIndex + 1) + '">' + cells + '</row>';
  }).join("");
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><sheetData>' + body + '</sheetData></worksheet>';
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function little16(value: number): Uint8Array {
  return new Uint8Array([value & 255, (value >>> 8) & 255]);
}
function little32(value: number): Uint8Array {
  return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
}
function joinBytes(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}
function zipStore(files: { name: string; content: string }[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  const dosDate = 33;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = joinBytes([
      little32(0x04034b50), little16(20), little16(0x0800), little16(0), little16(0), little16(dosDate),
      little32(crc), little32(data.length), little32(data.length), little16(name.length), little16(0), name, data
    ]);
    localParts.push(local);
    const central = joinBytes([
      little32(0x02014b50), little16(20), little16(20), little16(0x0800), little16(0), little16(0), little16(dosDate),
      little32(crc), little32(data.length), little32(data.length), little16(name.length), little16(0), little16(0),
      little16(0), little16(0), little32(0), little32(localOffset), name
    ]);
    centralParts.push(central);
    localOffset += local.length;
  }
  const centralDirectory = joinBytes(centralParts);
  const end = joinBytes([
    little32(0x06054b50), little16(0), little16(0), little16(files.length), little16(files.length),
    little32(centralDirectory.length), little32(localOffset), little16(0)
  ]);
  return joinBytes([...localParts, centralDirectory, end]);
}
function createXlsx(sheets: Sheet[]): Blob {
  const safeSheets = sheets.slice(0, 12).map((sheet, index) => ({
    name: sheet.name.replace(/[\\/*?:[\]]/g, " ").slice(0, 31) || "Feuille " + (index + 1),
    rows: sheet.rows.length ? sheet.rows : [["Aucune donnée"]]
  }));
  const sheetFiles = safeSheets.map((sheet, index) => ({
    name: "xl/worksheets/sheet" + (index + 1) + ".xml",
    content: worksheetXml(sheet.rows)
  }));
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    safeSheets.map((_, index) => '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("") + '</Types>';
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    safeSheets.map((sheet, index) => '<sheet name="' + xmlEscape(sheet.name) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>').join("") +
    '</sheets></workbook>';
  const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    safeSheets.map((_, index) => '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>').join("") +
    '<Relationship Id="rId' + (safeSheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF123E5D"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const archive = zipStore([
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rootRels },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
    { name: "xl/styles.xml", content: styles },
    ...sheetFiles
  ]);
  return new Blob([archive], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
async function fetchFaithfulNames(db: ReturnType<typeof getSupabaseClient>, ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(ids)];
  for (let offset = 0; offset < unique.length; offset += 500) {
    const part = unique.slice(offset, offset + 500);
    const { data, error } = await db.from("fideles").select("id,prenom,nom").in("id", part);
    if (error) throw error;
    for (const item of data ?? []) names.set(item.id, item.prenom + " " + item.nom);
  }
  return names;
}
async function fetchPagedSacraments(db: ReturnType<typeof getSupabaseClient>, parishId: string): Promise<SacramentRow[]> {
  const rows: SacramentRow[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await db.from("sacrements")
      .select("id,fidele_id,paroisse_id,type,annee_pastorale_id,communaute_historique_id,jour,mois,annee,precision,lieu,numero_acte,page_registre,ministre,visa,parrain,marraine")
      .eq("paroisse_id", parishId).order("id").range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}
async function fetchPagedMarriages(db: ReturnType<typeof getSupabaseClient>, parishId: string): Promise<MarriageRow[]> {
  const rows: MarriageRow[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await db.from("evenements_matrimoniaux")
      .select("id,fidele_id,paroisse_id,annee_pastorale_id,communaute_historique_id,type,jour,mois,annee,precision,lieu,numero_acte,page_registre,ministre,visa,conjoint_nom")
      .eq("paroisse_id", parishId).in("type", ["post_baptismum", "novas_nuptias"])
      .order("id").range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

export async function mountSacramentsPage(
  container: HTMLElement,
  context: UserContext,
  activeYear: ActivePastoralYear | null
): Promise<void> {
  const db = getSupabaseClient();
  const parishId = context.assignments[0]?.paroisse_id;
  if (!parishId) {
    container.innerHTML = '<section class="page-card p-6 text-sm text-rose-700">Aucune paroisse n’est associée à ce compte.</section>';
    return;
  }
  const yearSelect = container.querySelector<HTMLSelectElement>("#sacrament-year")!;
  const quarterSelect = container.querySelector<HTMLSelectElement>("#sacrament-quarter")!;
  const communitySelect = container.querySelector<HTMLSelectElement>("#sacrament-community")!;
  const reportType = container.querySelector<HTMLSelectElement>("#sacrament-report-type")!;
  const reportPeriod = container.querySelector<HTMLSelectElement>("#sacrament-report-period")!;
  const reportYear = container.querySelector<HTMLSelectElement>("#sacrament-report-year")!;
  const reportMonth = container.querySelector<HTMLSelectElement>("#sacrament-report-month")!;
  const feedback = container.querySelector<HTMLElement>("#sacrament-feedback")!;
  const reportFeedback = container.querySelector<HTMLElement>("#sacrament-report-feedback")!;
  const reportOutput = container.querySelector<HTMLElement>("#sacrament-report-output")!;
  const trendNode = container.querySelector<HTMLElement>("#sacrament-trend-chart")!;
  const donutNode = container.querySelector<HTMLElement>("#sacrament-donut")!;
  const annualNode = container.querySelector<HTMLElement>("#sacrament-annual-chart")!;
  const summaryNode = container.querySelector<HTMLElement>("#sacrament-summary-table")!;
  const kpiNode = container.querySelector<HTMLElement>("#sacrament-kpis")!;
  const insightNode = container.querySelector<HTMLElement>("#sacrament-insights")!;
  const trendTableNode = container.querySelector<HTMLElement>("#sacrament-month-table")!;
  const chartButtons = [...container.querySelectorAll<HTMLButtonElement>("[data-sacrament-chart-style]")];
  const now = new Date();
  const months = fourRecentMonths(now);
  let years: YearRow[] = [];
  let communities: CommunityRow[] = [];
  let quarters: QuarterRow[] = [];
  let entries: SacramentEntry[] = [];
  let names = new Map<string, string>();
  let selectedReport: { title: string; rows: SacramentEntry[]; year: number; month: number | null; type: string; scope: string } | null = null;
  let chartStyle: ChartStyle = "line";
  let renderSequence = 0;

  feedback.className = "hidden";
  reportFeedback.className = "hidden";
  try {
    const [yearResult, communityResult, quarterResult, sacramentRows, marriageRows] = await Promise.all([
      db.from("annees_pastorales").select("id,libelle,date_debut,date_fin,active").eq("paroisse_id", parishId).order("date_debut", { ascending: true }),
      db.from("communautes").select("id,nom,quartier_id").eq("paroisse_id", parishId).order("nom"),
      db.from("quartiers").select("id,nom").eq("paroisse_id", parishId).order("nom"),
      fetchPagedSacraments(db, parishId),
      fetchPagedMarriages(db, parishId)
    ]);
    if (yearResult.error) throw yearResult.error;
    if (communityResult.error) throw communityResult.error;
    if (quarterResult.error) throw quarterResult.error;
    years = yearResult.data ?? [];
    communities = communityResult.data ?? [];
    quarters = quarterResult.data ?? [];
    entries = entriesFromRows(sacramentRows, marriageRows);
    const monthYears = entries.map((entry) => entry.year).filter((value): value is number => Boolean(value));
    const calendarYears = [...new Set([...monthYears, now.getFullYear()])].sort((a, b) => b - a);
    yearSelect.innerHTML = '<option value="all">Toutes les années pastorales</option>' +
      years.map((item) => '<option value="' + esc(item.id) + '">' + esc(item.libelle) + (item.active ? " · active" : "") + '</option>').join("");
    yearSelect.value = "all";
    quarterSelect.innerHTML = '<option value="">Tous les quartiers visibles</option>' +
      quarters.map((item) => '<option value="' + esc(item.id) + '">' + esc(item.nom) + '</option>').join("");
    communitySelect.innerHTML = '<option value="">Toutes les communautés visibles</option>' +
      communities.map((item) => '<option value="' + esc(item.id) + '">' + esc(item.nom) + '</option>').join("");
    reportYear.innerHTML = calendarYears.map((year) => '<option value="' + year + '">' + year + '</option>').join("");
    reportYear.value = String(now.getFullYear());
    reportMonth.innerHTML = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      return '<option value="' + month + '">' + new Intl.DateTimeFormat("fr-CD", { month: "long" }).format(new Date(2020, index, 1)) + '</option>';
    }).join("");
    reportMonth.value = String(now.getMonth() + 1);
    if (activeYear?.id && years.some((item) => item.id === activeYear.id)) {
      yearSelect.value = "all";
    }
  } catch (error) {
    feedback.textContent = error instanceof Error ? error.message : "Impossible de charger les registres sacramentels.";
    feedback.className = "rounded-xl bg-rose-50 p-4 text-sm text-rose-700";
    return;
  }

  const communityById = new Map(communities.map((item) => [item.id, item]));
  const quarterNames = new Map(quarters.map((item) => [item.id, item.nom]));
  const yearById = new Map(years.map((item) => [item.id, item]));
  const territoryEntries = (): SacramentEntry[] => {
    let allowed = entries;
    if (quarterSelect.value) {
      const allowedIds = communities.filter((item) => item.quartier_id === quarterSelect.value).map((item) => item.id);
      allowed = allowed.filter((item) => allowedIds.includes(item.communityId));
    }
    if (communitySelect.value) allowed = allowed.filter((item) => item.communityId === communitySelect.value);
    return allowed;
  };
  const dashboardEntries = (): SacramentEntry[] => {
    let visible = territoryEntries();
    if (yearSelect.value !== "all") visible = visible.filter((item) => item.pastoralYearId === yearSelect.value);
    return visible;
  };
  const countFor = (list: SacramentEntry[], key: SacramentKey): number => list.filter((item) => item.type === key).length;
  const scopeLabel = (): string => {
    if (communitySelect.value) return communityById.get(communitySelect.value)?.nom ?? "Communauté sélectionnée";
    if (quarterSelect.value) return quarterNames.get(quarterSelect.value) ?? "Quartier sélectionné";
    return "Toutes les communautés visibles";
  };
  function syncCommunities(): void {
    const previous = communitySelect.value;
    const allowed = communities.filter((item) => !quarterSelect.value || item.quartier_id === quarterSelect.value);
    communitySelect.innerHTML = '<option value="">Toutes les communautés visibles</option>' +
      allowed.map((item) => '<option value="' + esc(item.id) + '">' + esc(item.nom) + '</option>').join("");
    communitySelect.value = allowed.some((item) => item.id === previous) ? previous : "";
  }

  function renderKpis(list: SacramentEntry[]): void {
    const counts = SACRAMENTS.map((item) => ({ ...item, value: countFor(list, item.key) }));
    const total = sum(counts.map((item) => item.value));
    const current = months[months.length - 1];
    const previous = months[months.length - 2];
    const currentTotal = list.filter((item) => monthMatches(item, current)).length;
    const previousTotal = list.filter((item) => monthMatches(item, previous)).length;
    kpiNode.innerHTML = '<article class="sacrament-kpi sacrament-kpi-total"><span class="sacrament-kpi-label">Actes enregistrés</span><strong>' + numberFr(total) + '</strong><small>Dans la période sélectionnée</small></article>' +
      counts.map((item) => '<article class="sacrament-kpi"><span class="sacrament-kpi-dot" style="background:' + item.color + '"></span><span class="sacrament-kpi-label">' + esc(item.plural) + '</span><strong>' + numberFr(item.value) + '</strong><small>' + (total ? (item.value / total * 100).toFixed(1).replace(".", ",") + '% du total' : "Aucun acte") + '</small></article>').join("");
    const top = [...counts].sort((a, b) => b.value - a.value)[0];
    const busiest = months.map((month, index) => ({ month, total: sum(seriesFor(list, months).map((item) => item.values[index])) }))
      .sort((a, b) => b.total - a.total)[0];
    const trend = monthOverMonth(currentTotal, previousTotal);
    insightNode.innerHTML = '<div class="flex flex-wrap items-center gap-3"><span class="sacrament-insight-pill">Lecture rapide</span><p class="text-sm text-slate-700">Le <strong>' + esc(top?.label ?? "sacrement") + '</strong> représente le volume le plus élevé (' + numberFr(top?.value ?? 0) + '). Le mois le plus actif parmi les quatre observés est <strong>' + esc(busiest?.month.label ?? "—") + '</strong> (' + numberFr(busiest?.total ?? 0) + ' actes).</p></div>' +
      '<p class="mt-2 text-xs text-slate-500">Mois courant : ' + numberFr(currentTotal) + ' acte(s) · évolution par rapport au mois précédent : <strong>' + esc(trend) + '</strong>. Les mariages comptés sont les mariages célébrés et les nouvelles noces, pas les simples mentions ni les décès de conjoint.</p>';
  }
  function renderTables(list: SacramentEntry[]): void {
    const counts = SACRAMENTS.map((item) => {
      const total = countFor(list, item.key);
      const last = list.filter((entry) => entry.type === item.key && monthMatches(entry, months[3])).length;
      const previous = list.filter((entry) => entry.type === item.key && monthMatches(entry, months[2])).length;
      return { ...item, total, last, previous };
    });
    const overall = sum(counts.map((item) => item.total));
    summaryNode.innerHTML = '<div class="overflow-x-auto"><table class="w-full min-w-[580px] text-left text-sm"><thead class="border-b border-slate-100 bg-slate-50 text-xs text-slate-500"><tr><th class="px-3 py-3">Sacrement</th><th class="px-3 py-3 text-right">Total</th><th class="px-3 py-3 text-right">Mois courant</th><th class="px-3 py-3 text-right">Mois précédent</th><th class="px-3 py-3 text-right">Évolution</th><th class="px-3 py-3 text-right">Part</th></tr></thead><tbody>' +
      counts.map((item) => '<tr class="border-b border-slate-100 last:border-0"><td class="px-3 py-3"><span class="mr-2 inline-block h-2.5 w-2.5 rounded-full" style="background:' + item.color + '"></span><strong class="text-slate-800">' + esc(item.label) + '</strong></td><td class="px-3 py-3 text-right font-semibold tabular-nums">' + numberFr(item.total) + '</td><td class="px-3 py-3 text-right tabular-nums">' + numberFr(item.last) + '</td><td class="px-3 py-3 text-right tabular-nums">' + numberFr(item.previous) + '</td><td class="px-3 py-3 text-right text-xs font-semibold">' + esc(monthOverMonth(item.last, item.previous)) + '</td><td class="px-3 py-3 text-right text-xs text-slate-500">' + (overall ? (item.total / overall * 100).toFixed(1).replace(".", ",") + "%" : "—") + '</td></tr>').join("") +
      '<tr class="bg-slate-50 font-bold"><td class="px-3 py-3">Ensemble</td><td class="px-3 py-3 text-right">' + numberFr(overall) + '</td><td class="px-3 py-3 text-right">' + numberFr(counts.reduce((v, x) => v + x.last, 0)) + '</td><td class="px-3 py-3 text-right">' + numberFr(counts.reduce((v, x) => v + x.previous, 0)) + '</td><td class="px-3 py-3 text-right">—</td><td class="px-3 py-3 text-right">100%</td></tr></tbody></table></div>';
  }
  function renderMonthTable(list: SacramentEntry[]): void {
    const byMonth = seriesFor(list, months);
    trendTableNode.innerHTML = '<div class="overflow-x-auto"><table class="w-full min-w-[520px] text-sm"><thead><tr class="border-b border-slate-100 text-xs text-slate-500"><th class="px-3 py-2 text-left">Mois</th>' +
      SACRAMENTS.map((item) => '<th class="px-3 py-2 text-right">' + esc(item.label) + '</th>').join("") + '<th class="px-3 py-2 text-right">Total</th></tr></thead><tbody>' +
      months.map((month, index) => '<tr class="border-b border-slate-100 last:border-0"><td class="px-3 py-2 font-semibold text-slate-700">' + esc(month.label) + '</td>' +
        byMonth.map((item) => '<td class="px-3 py-2 text-right tabular-nums">' + numberFr(item.values[index]) + '</td>').join("") +
        '<td class="px-3 py-2 text-right font-bold tabular-nums">' + numberFr(sum(byMonth.map((item) => item.values[index]))) + '</td></tr>').join("") +
      '</tbody></table></div>';
  }
  function refresh(): void {
    const list = dashboardEntries();
    renderKpis(list);
    renderDonut(donutNode, SACRAMENTS.map((item) => ({ label: item.plural, value: countFor(list, item.key), color: item.color })));
    renderTrendChart(trendNode, months, seriesFor(list, months), chartStyle);
    renderAnnualComparison(annualNode, years, territoryEntries());
    renderTables(list);
    renderMonthTable(list);
    feedback.className = "hidden";
  }
  quarterSelect.addEventListener("change", () => { communitySelect.value = ""; syncCommunities(); refresh(); });
  communitySelect.addEventListener("change", refresh);
  yearSelect.addEventListener("change", refresh);
  chartButtons.forEach((button) => button.addEventListener("click", () => {
    const style = button.dataset.sacramentChartStyle as ChartStyle;
    if (!["line", "area", "columns", "stacked"].includes(style)) return;
    chartStyle = style;
    chartButtons.forEach((item) => {
      const active = item === button;
      item.setAttribute("aria-pressed", String(active));
      item.classList.toggle("is-active", active);
    });
    renderTrendChart(trendNode, months, seriesFor(dashboardEntries(), months), chartStyle);
  }));
  refresh();

  reportPeriod.addEventListener("change", () => {
    reportMonth.disabled = reportPeriod.value !== "monthly";
    if (selectedReport) reportOutput.innerHTML = '<p class="py-8 text-center text-sm text-slate-400">Modifie les paramètres puis génère un nouveau rapport.</p>';
  });
  reportType.addEventListener("change", () => {
    if (selectedReport) reportOutput.innerHTML = '<p class="py-8 text-center text-sm text-slate-400">Modifie les paramètres puis génère un nouveau rapport.</p>';
  });
  reportYear.addEventListener("change", () => {
    if (selectedReport) reportOutput.innerHTML = '<p class="py-8 text-center text-sm text-slate-400">Modifie les paramètres puis génère un nouveau rapport.</p>';
  });
  reportMonth.addEventListener("change", () => {
    if (selectedReport) reportOutput.innerHTML = '<p class="py-8 text-center text-sm text-slate-400">Modifie les paramètres puis génère un nouveau rapport.</p>';
  });

  container.querySelector<HTMLFormElement>("#sacrament-report-form")!.addEventListener("submit", async (event) => {
    event.preventDefault();
    reportFeedback.className = "hidden";
    const type = reportType.value;
    const year = Number(reportYear.value);
    const month = reportPeriod.value === "monthly" ? Number(reportMonth.value) : null;
    const eligible = territoryEntries().filter((entry) => reportEntryMatches(entry, type, year, month));
    const sortDate = (a: SacramentEntry, b: SacramentEntry): number =>
      (a.year ?? 0) - (b.year ?? 0) || (a.month ?? 0) - (b.month ?? 0) || (a.day ?? 0) - (b.day ?? 0);
    eligible.sort(sortDate);
    const allYearSameType = territoryEntries().filter((entry) => entry.year === year && (type === "tous" || entry.type === type));
    const missingMonth = month === null ? 0 : allYearSameType.filter((entry) => entry.month === null).length;
    const previousYearOrMonth = month === null ? year - 1 : (month === 1 ? year - 1 : year);
    const previousMonth = month === null ? null : (month === 1 ? 12 : month - 1);
    const previousCount = territoryEntries().filter((entry) => entry.year === previousYearOrMonth &&
      (month === null ? true : entry.month === previousMonth) && (type === "tous" || entry.type === type)).length;
    const title = (type === "tous" ? "Tous les sacrements" : SACRAMENT_MAP.get(type as SacramentKey)?.label ?? type) +
      " · " + (month === null ? "Année " + year : monthLabel(year, month));
    const scope = scopeLabel();
    selectedReport = { title, rows: eligible, year, month, type, scope };
    const button = container.querySelector<HTMLButtonElement>("#sacrament-report-generate")!;
    button.disabled = true;
    button.textContent = "Préparation du rapport…";
    try {
      names = await fetchFaithfulNames(db, eligible.map((item) => item.fidele_id));
      const uniqueFaithful = new Set(eligible.map((item) => item.fidele_id)).size;
      const communityCount = new Set(eligible.map((item) => item.communityId)).size;
      const summary = '<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">' +
        '<article class="sacrament-report-stat"><span>Actes célébrés</span><strong>' + numberFr(eligible.length) + '</strong></article>' +
        '<article class="sacrament-report-stat"><span>Fidèles concernés</span><strong>' + numberFr(uniqueFaithful) + '</strong></article>' +
        '<article class="sacrament-report-stat"><span>Communautés concernées</span><strong>' + numberFr(communityCount) + '</strong></article>' +
        '<article class="sacrament-report-stat"><span>Écart à la période précédente</span><strong>' + esc(monthOverMonth(eligible.length, previousCount)) + '</strong></article></div>';
      const note = missingMonth > 0 ? '<p class="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">' + numberFr(missingMonth) + ' acte(s) de cette année n’ont pas de mois renseigné et ne peuvent donc pas être affectés à ce rapport mensuel.</p>' : "";
      const detailRows = eligible.map((item) => {
        const community = communityById.get(item.communityId);
        const quarter = community ? quarterNames.get(community.quartier_id) ?? "—" : "—";
        const label = SACRAMENT_MAP.get(item.type)?.label ?? item.type;
        return '<tr class="border-b border-slate-100 last:border-0"><td class="px-3 py-3"><strong>' + esc(names.get(item.fidele_id) ?? "Fidèle non visible") + '</strong></td><td class="px-3 py-3 text-slate-600">' + esc(label) + '</td><td class="px-3 py-3">' + esc(formatDate(item)) + '</td><td class="px-3 py-3">' + esc(quarter) + '</td><td class="px-3 py-3">' + esc(community?.nom ?? "—") + '</td><td class="px-3 py-3">' + esc(item.act || "—") + '</td><td class="px-3 py-3">' + esc(item.page || "—") + '</td><td class="px-3 py-3">' + esc(item.minister || "—") + '</td><td class="px-3 py-3 report-no-print"><button type="button" data-report-open-faithful="' + esc(item.fidele_id) + '" class="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Ouvrir le livret</button></td></tr>';
      }).join("");
      reportOutput.innerHTML = '<div class="sacrament-report-heading"><div><p class="text-xs font-semibold uppercase tracking-widest text-emerald-700">Rapport sacramentel</p><h3 class="mt-1 text-xl font-bold text-slate-900">' + esc(title) + '</h3><p class="mt-1 text-xs text-slate-500">Périmètre : ' + esc(scope) + ' · Généré le ' + esc(new Intl.DateTimeFormat("fr-CD", { dateStyle: "long" }).format(new Date())) + '</p></div><div class="report-no-print flex flex-wrap gap-2"><button id="sacrament-report-excel" type="button" class="rounded-lg bg-[var(--enoria-green)] px-3 py-2 text-xs font-semibold text-white">Exporter ce rapport en Excel</button><button id="sacrament-report-print" type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Imprimer / PDF</button></div></div>' +
        summary + note + '<div class="mt-5 overflow-x-auto"><table class="w-full min-w-[900px] text-left text-xs"><thead class="border-y border-slate-100 bg-slate-50 text-slate-500"><tr><th class="px-3 py-3">Fidèle</th><th class="px-3 py-3">Sacrement</th><th class="px-3 py-3">Date</th><th class="px-3 py-3">Quartier</th><th class="px-3 py-3">Communauté</th><th class="px-3 py-3">N° acte</th><th class="px-3 py-3">Page</th><th class="px-3 py-3">Ministre</th><th class="px-3 py-3 report-no-print">Dossier</th></tr></thead><tbody>' +
        (detailRows || '<tr><td colspan="9" class="px-3 py-10 text-center text-slate-400">Aucun acte trouvé pour cette période et ce périmètre.</td></tr>') + '</tbody></table></div>';
      reportOutput.classList.remove("hidden");
      reportFeedback.textContent = "Rapport généré : " + numberFr(eligible.length) + " acte(s).";
      reportFeedback.className = "rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800";
      container.querySelector<HTMLButtonElement>("#sacrament-report-excel")?.addEventListener("click", () => exportWorkbook(true));
      container.querySelector<HTMLButtonElement>("#sacrament-report-print")?.addEventListener("click", () => {
        document.documentElement.dataset.printReport = "true";
        window.print();
        window.setTimeout(() => delete document.documentElement.dataset.printReport, 600);
      });
    } catch (error) {
      reportFeedback.textContent = error instanceof Error ? error.message : "Impossible de préparer les données du rapport.";
      reportFeedback.className = "rounded-lg bg-rose-50 p-3 text-sm text-rose-700";
    } finally {
      button.disabled = false;
      button.textContent = "Générer le rapport";
    }
  });

  function exportWorkbook(includeReport: boolean): void {
    if (includeReport && !selectedReport) return;
    const list = dashboardEntries();
    const counts = SACRAMENTS.map((item) => ({ ...item, value: countFor(list, item.key) }));
    const series = seriesFor(list, months);
    const summaryRows: Sheet["rows"] = [
      ["ENORIA · TABLEAU DE BORD SACRAMENTEL"],
      ["Périmètre", scopeLabel()],
      ["Filtre pastoral", yearSelect.value === "all" ? "Toutes les années pastorales" : yearById.get(yearSelect.value)?.libelle ?? ""],
      ["Date d'export", new Date().toLocaleString("fr-CD")],
      [],
      ["Sacrement", "Total", "Part du total", months[3].label, months[2].label, "Évolution mensuelle"],
      ...counts.map((item) => {
        const total = sum(counts.map((x) => x.value));
        const current = list.filter((entry) => entry.type === item.key && monthMatches(entry, months[3])).length;
        const previous = list.filter((entry) => entry.type === item.key && monthMatches(entry, months[2])).length;
        return [item.label, item.value, total ? item.value / total : 0, current, previous, monthOverMonth(current, previous)];
      }),
      ["TOTAL", sum(counts.map((x) => x.value)), 1, list.filter((entry) => monthMatches(entry, months[3])).length, list.filter((entry) => monthMatches(entry, months[2])).length, ""]
    ];
    const trendRows: Sheet["rows"] = [
      ["Mois", ...SACRAMENTS.map((item) => item.plural), "Total"],
      ...months.map((month, index) => {
        const values = series.map((item) => item.values[index]);
        return [month.label, ...values, sum(values)];
      })
    ];
    const annualRows: Sheet["rows"] = [
      ["Année pastorale", ...SACRAMENTS.map((item) => item.plural), "Total"],
      ...years.map((year) => {
        const values = SACRAMENTS.map((item) => territoryEntries().filter((entry) => entry.type === item.key && entry.pastoralYearId === year.id).length);
        return [year.libelle, ...values, sum(values)];
      })
    ];
    const sheets: Sheet[] = [
      { name: "Synthese", rows: summaryRows },
      { name: "Evolution 4 mois", rows: trendRows },
      { name: "Annees pastorales", rows: annualRows }
    ];
    if (includeReport && selectedReport) {
      const report = selectedReport;
      sheets.push({
        name: "Rapport",
        rows: [
          ["RAPPORT SACRAMENTEL", report.title],
          ["Périmètre", report.scope],
          ["Généré le", new Date().toLocaleString("fr-CD")],
          ["Actes", report.rows.length],
          ["Fidèles distincts", new Set(report.rows.map((item) => item.fidele_id)).size],
          [],
          ["Fidèle", "Sacrement", "Type source", "Date", "Quartier", "Communauté", "Lieu", "Numéro d'acte", "Page registre", "Ministre", "Visa", "Parrain", "Marraine", "Conjoint"],
          ...report.rows.map((item) => {
            const community = communityById.get(item.communityId);
            return [
              names.get(item.fidele_id) ?? "Fidèle non visible", SACRAMENT_MAP.get(item.type)?.label ?? item.type,
              item.sourceType, formatDate(item), community ? quarterNames.get(community.quartier_id) ?? "" : "",
              community?.nom ?? "", item.place, item.act, item.page, item.minister, item.visa,
              item.godfather, item.godmother, item.spouse
            ];
          })
        ]
      });
    }
    if (!window.confirm("Le classeur Excel contient des statistiques sacramentelles ; le rapport détaillé peut contenir des noms et des informations religieuses. Confirmer l’export sur cet appareil protégé ?")) return;
    const workbook = createXlsx(sheets);
    const filename = "enoria-statistiques-sacrements-" + new Date().toISOString().slice(0, 10) + ".xlsx";
    downloadBlob(workbook, filename);
    reportFeedback.textContent = "Classeur Excel téléchargé.";
    reportFeedback.className = "rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800";
  }
  container.querySelector<HTMLButtonElement>("#sacrament-export-excel")!.addEventListener("click", () => exportWorkbook(false));
  reportOutput.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-report-open-faithful]");
    if (button?.dataset.reportOpenFaithful) navigateToFaithful(button.dataset.reportOpenFaithful, "sacrements");
  });
  reportMonth.disabled = reportPeriod.value !== "monthly";
  container.querySelector<HTMLButtonElement>("#sacrament-report-generate")!.disabled = false;
}

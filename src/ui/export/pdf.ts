/**
 * PDF-Export mit jsPDF (Screen 11): Architektenplan mit Rahmen, Titelblock, Legende,
 * Maßstabsleiste und Nordpfeil; optional Pflanzenliste als Blatt 2. Außerdem die
 * Kostenaufstellung als A4-Liste.
 *
 * Rahmen, Schrift, Legende, Maßstab und Nordpfeil sind Vektoren. Der Plan selbst wird
 * vom WebGL-Renderer im exakten Maßstab gerastert (Texturen, Schatten, Licht) und eingebettet.
 */
import type { jsPDF as JsPDF } from 'jspdf';
import { legendEntries, PDF_MARGIN_M, plantList, scaleBarMeters, sheetLayout, type PaperId, type Rect } from '../../core/export/sheet';
import { euros, num, unitLabel } from '../../core/format';
import { expandBBox, bbox } from '../../core/geometry/polygon';
import type { Project } from '../../core/model/types';
import { costReport } from '../../core/quantities/costReport';
import type { PlanRenderer } from '../../render/PlanRenderer';

export type Look = 'day' | 'night' | 'line';

export interface PlanPdfOptions {
  paper: PaperId;
  scale: number;
  dpi: number;
  look: Look;
  legend: boolean;
  scaleBar: boolean;
  north: boolean;
  titleBlock: boolean;
  dimensions: boolean;
  plantSheet: boolean;
}


const INK = '#2D3033';
const NIGHT_BG = '#0E1724';

/** Standardschriften kennen nur WinAnsi: Latin-1 plus €, Gedankenstriche, Anführungszeichen u. a. */
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const t = (s: string) =>
  [...s.replace(/≈/g, 'ca.').replace(/→/g, '->')]
    .filter((ch) => ch.charCodeAt(0) <= 0xff || WIN_ANSI_EXTRA.includes(ch))
    .join('');

async function newDoc(format: string, orientation: 'landscape' | 'portrait'): Promise<JsPDF> {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({ orientation, unit: 'mm', format, compress: true });
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      res(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error('Planbild konnte nicht gelesen werden'));
    };
    img.src = url;
  });
}

/** Rasterbild → JPEG; Darstellung „Strich“: Graustufen mit etwas mehr Kontrast */
async function toJpeg(blob: Blob, look: Look, background: string): Promise<string> {
  const img = await blobToImage(blob);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  if (look === 'line') {
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      const v = Math.max(0, Math.min(255, ((g / 255 - 0.5) * 1.15 + 0.5) * 255 * 1.08));
      p[i] = p[i + 1] = p[i + 2] = v;
    }
    ctx.putImageData(d, 0, 0);
  }
  return c.toDataURL('image/jpeg', 0.9);
}

function northArrow(pdf: JsPDF, cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  const rot = (x: number, y: number): [number, number] => [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)];
  pdf.setDrawColor(INK);
  pdf.setLineWidth(0.25);
  pdf.circle(cx, cy, r, 'S');
  pdf.setFillColor(INK);
  const [x1, y1] = rot(0, -r * 0.92);
  const [x2, y2] = rot(r * 0.3, 0);
  const [x3, y3] = rot(-r * 0.3, 0);
  pdf.triangle(x1, y1, x2, y2, x3, y3, 'F');
  const [x4, y4] = rot(0, r * 0.92);
  pdf.triangle(x4, y4, x2, y2, x3, y3, 'S');
}

function scaleBar(pdf: JsPDF, x: number, y: number, scale: number, planW: number) {
  const L = scaleBarMeters(scale, planW);
  const w = (L * 1000) / scale;
  const h = 1.4;
  pdf.setDrawColor(INK);
  pdf.setFillColor(INK);
  pdf.setLineWidth(0.25);
  pdf.rect(x, y, w, h, 'S');
  // Teilung 0 – L/5 – 2L/5 – L wie im Design: schwarz, weiß, schwarz (3 Teile)
  pdf.rect(x, y, w / 5, h, 'F');
  pdf.rect(x + (2 * w) / 5, y, (3 * w) / 5, h, 'F');
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  pdf.setTextColor(INK);
  const lab = (v: number) => (v < 1 ? num(v, 1) : num(v, v % 1 ? 1 : 0));
  pdf.text('0', x, y + h + 3);
  pdf.text(lab(L / 5), x + w / 5, y + h + 3, { align: 'center' });
  pdf.text(lab((2 * L) / 5), x + (2 * w) / 5, y + h + 3, { align: 'center' });
  pdf.text(`${lab(L)} m`, x + w, y + h + 3, { align: 'right' });
  pdf.text(`M 1:${scale}`, x + w + 5, y + h);
}

function legend(pdf: JsPDF, doc: Project, side: Rect, y0: number, night: boolean, k: number): number {
  let y = y0;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6 * k);
  pdf.setTextColor(INK);
  pdf.text('LEGENDE', side.x + 5 * k, y, { charSpace: 0.6 });
  y += 5 * k;
  pdf.setFontSize(7 * k);
  const sx = side.x + 5 * k;
  for (const e of legendEntries(doc, night)) {
    const w = 7 * k;
    const h = 4.2 * k;
    pdf.setLineWidth(0.2);
    pdf.setDrawColor(INK);
    pdf.setFillColor(e.color);
    if (e.kind === 'fill') pdf.rect(sx, y - h + 1, w, h, 'FD');
    else if (e.kind === 'circle' || e.kind === 'glow') pdf.circle(sx + w / 2, y - h / 2 + 1, h / 2, e.kind === 'glow' ? 'F' : 'FD');
    else if (e.kind === 'line') {
      pdf.setDrawColor(e.color);
      pdf.setLineWidth(1);
      pdf.line(sx, y - h / 2 + 1, sx + w, y - h / 2 + 1);
    } else {
      pdf.setLineDashPattern([1.6, 0.8], 0);
      pdf.setLineWidth(0.35);
      pdf.line(sx, y - h / 2 + 1, sx + w, y - h / 2 + 1);
      pdf.setLineDashPattern([], 0);
    }
    pdf.text(t(e.label), sx + w + 3 * k, y);
    y += 5.6 * k;
  }
  return y;
}

function titleBlock(pdf: JsPDF, doc: Project, side: Rect, o: PlanPdfOptions, sheets: number, k: number) {
  const x = side.x + 5 * k;
  const w = side.w - 10 * k;
  const h = 46 * k;
  const y = side.y + side.h - h;
  pdf.setDrawColor(INK);
  pdf.setLineWidth(0.35);
  pdf.line(side.x, y, side.x + side.w, y);
  pdf.setTextColor('#1F2224');
  pdf.setFont('times', 'normal');
  pdf.setFontSize(13 * k);
  const name = pdf.splitTextToSize(t(doc.name), w) as string[];
  pdf.text(name.slice(0, 2), x, y + 7 * k);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.8 * k);
  pdf.setTextColor('#4A4D4F');
  const ty = y + 7 * k + Math.min(2, name.length) * 5 * k;
  pdf.text(o.look === 'night' ? 'Lichtplanung · Entwurf' : 'Freianlagenplanung · Entwurf', x, ty);
  if (doc.site.location) pdf.text(t(doc.site.location.label), x, ty + 3.6 * k, { maxWidth: w });
  const gy = y + h - 13 * k;
  pdf.setLineWidth(0.2);
  pdf.line(x, gy, x + w, gy);
  pdf.setFont('courier', 'normal');
  pdf.setFontSize(6.3 * k);
  pdf.setTextColor(INK);
  const date = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());
  const cells = [`M 1:${o.scale}`, `${o.paper} quer`, date, `Blatt 1/${sheets}`, 'Gartenwerk', 'Index A'];
  cells.forEach((c, i) => pdf.text(c, x + (i % 2) * (w / 2), gy + 4 * k + Math.floor(i / 2) * 3.6 * k));
}

/** Plan im Maßstab als Bild: Bounding-Box der Grenze plus Rand, mittig im Planfeld */
async function planImage(renderer: PlanRenderer, doc: Project, o: PlanPdfOptions) {
  const ppm = o.dpi / 0.0254 / o.scale;
  const bg = o.look === 'night' ? NIGHT_BG : '#FBFAF6';
  const r = await renderer.exportPng({
    pxPerMeter: ppm,
    marginM: PDF_MARGIN_M,
    background: bg,
    uiScale: o.dpi / 96,
    view: { night: o.look === 'night' },
    overlays: o.dimensions,
  });
  const b = expandBBox(bbox(doc.site.boundary), PDF_MARGIN_M);
  return {
    data: await toJpeg(r.blob, o.look, bg),
    wMm: ((b.maxX - b.minX) * 1000) / o.scale,
    hMm: ((b.maxY - b.minY) * 1000) / o.scale,
    bg,
  };
}

export async function planPdfBlob(renderer: PlanRenderer, doc: Project, o: PlanPdfOptions): Promise<Blob> {
  const L = sheetLayout(o.paper);
  const k = Math.max(0.85, L.page.w / 420);
  const pdf = await newDoc(o.paper.toLowerCase(), 'landscape');
  const plants = o.plantSheet ? plantList(doc) : [];
  const sheets = 1 + (plants.length ? 1 : 0);
  pdf.setProperties({
    title: t(doc.name),
    subject: 'Gestaltungsplan',
    creator: 'Gartenwerk',
  });

  // Planfeld
  const img = await planImage(renderer, doc, o);
  const px = L.plan.x + (L.plan.w - img.wMm) / 2;
  const py = L.plan.y + (L.plan.h - img.hMm) / 2;
  if (o.look === 'night') {
    pdf.setFillColor(NIGHT_BG);
    pdf.rect(L.frame.x + 1.5, L.frame.y + 1.5, L.frame.w - L.side.w - 3, L.frame.h - 3, 'F');
  }
  pdf.addImage(img.data, 'JPEG', px, py, img.wMm, img.hMm, undefined, 'FAST');

  // Rahmen und Spalte
  pdf.setDrawColor(INK);
  pdf.setLineWidth(0.5);
  pdf.rect(L.frame.x, L.frame.y, L.frame.w, L.frame.h, 'S');
  pdf.setLineWidth(0.35);
  pdf.line(L.side.x, L.side.y, L.side.x, L.side.y + L.side.h);

  // Titel oben links
  pdf.setFont('times', 'normal');
  pdf.setFontSize(15 * k);
  pdf.setTextColor(o.look === 'night' ? '#ECE9E2' : '#1F2224');
  const head = o.look === 'night' ? 'Lichtplan' : 'Gestaltungsplan';
  pdf.text(head, L.frame.x + 6 * k, L.frame.y + 9 * k);
  pdf.setFont('times', 'italic');
  pdf.setTextColor(o.look === 'night' ? '#A6AEB7' : '#5D615D');
  pdf.text(' Freianlagen', L.frame.x + 6 * k + pdf.getTextWidth(head), L.frame.y + 9 * k);

  if (o.scaleBar) {
    const bx = L.frame.x + 6 * k;
    const by = L.frame.y + L.frame.h - 9 * k;
    if (o.look === 'night') {
      // auf dunklem Plangrund: Papierfeld hinter der Leiste
      const bw = (scaleBarMeters(o.scale, L.plan.w) * 1000) / o.scale;
      pdf.setFillColor('#FBFAF6');
      pdf.roundedRect(bx - 2.5, by - 2.5, bw + 24, 8.5, 1, 1, 'F');
    }
    scaleBar(pdf, bx, by, o.scale, L.plan.w);
  }

  let y = L.side.y + 8 * k;
  if (o.north) {
    const r = 6 * k;
    northArrow(pdf, L.side.x + 5 * k + r, y + r, r, doc.site.northDeg);
    pdf.setFont('times', 'italic');
    pdf.setFontSize(10 * k);
    pdf.setTextColor(INK);
    pdf.text('Nord', L.side.x + 5 * k + 2 * r + 4 * k, y + r + 1.5);
    y += 2 * r + 9 * k;
  }
  if (o.legend) legend(pdf, doc, L.side, y, o.look === 'night', k);
  if (o.titleBlock) titleBlock(pdf, doc, L.side, o, sheets, k);

  if (plants.length) {
    pdf.addPage(o.paper.toLowerCase(), 'landscape');
    pdf.setDrawColor(INK);
    pdf.setLineWidth(0.5);
    pdf.rect(L.frame.x, L.frame.y, L.frame.w, L.frame.h, 'S');
    pdf.setFont('times', 'normal');
    pdf.setFontSize(15 * k);
    pdf.setTextColor('#1F2224');
    pdf.text('Pflanzenliste', L.frame.x + 6 * k, L.frame.y + 9 * k);
    const cols = [0, 70, 150, 190].map((c) => L.frame.x + 6 * k + c * k);
    let ty = L.frame.y + 20 * k;
    const row = (cells: string[], bold = false) => {
      pdf.setFont(bold ? 'courier' : 'helvetica', bold ? 'normal' : 'normal');
      pdf.setFontSize((bold ? 6.5 : 8) * k);
      cells.forEach((c, i) =>
        pdf.text(t(c), i === 2 ? cols[i] + 25 * k : cols[i], ty, {
          align: i === 2 ? 'right' : 'left',
        }),
      );
      ty += 5.2 * k;
    };
    row(['ART', 'BOTANISCH', 'STÜCK', 'GRUPPE'], true);
    pdf.setLineWidth(0.2);
    pdf.line(cols[0], ty - 3.5 * k, L.frame.x + L.frame.w - 6 * k, ty - 3.5 * k);
    for (const p of plants) {
      if (ty > L.frame.y + L.frame.h - 10 * k) break;
      row([p.name, p.latin, String(p.count), p.note]);
    }
    if (o.titleBlock) {
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(6.3 * k);
      pdf.text(`Blatt 2/${sheets}`, L.frame.x + L.frame.w - 6 * k, L.frame.y + L.frame.h - 5 * k, { align: 'right' });
    }
  }
  return pdf.output('blob');
}

/** Kostenaufstellung als A4-Liste (Screen 10, „Als PDF exportieren“) */
export async function costPdfBlob(doc: Project): Promise<Blob> {
  const pdf = await newDoc('a4', 'portrait');
  const r = costReport(doc);
  const X = 20;
  const W = 170;
  let y = 24;
  const date = new Intl.DateTimeFormat('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
  pdf.setProperties({
    title: t(`${doc.name} – Material & Kosten`),
    creator: 'Gartenwerk',
  });
  pdf.setFont('times', 'normal');
  pdf.setFontSize(22);
  pdf.setTextColor('#1F2224');
  pdf.text('Material & Kosten', X, y);
  y += 7;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.setTextColor('#5D615D');
  pdf.text(t(`${doc.name} · Mengen aus dem Plan, Stand ${date}`), X, y);
  y += 10;
  const cols = { pos: X, qty: X + 112, price: X + 140, sum: X + W };
  const head = () => {
    pdf.setFont('courier', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor('#8C8E88');
    pdf.text('POSITION', cols.pos, y);
    pdf.text('MENGE', cols.qty, y, { align: 'right' });
    pdf.text('EINZELPREIS', cols.price, y, { align: 'right' });
    pdf.text('SUMME', cols.sum, y, { align: 'right' });
    y += 2;
    pdf.setDrawColor('#D9D6CF');
    pdf.setLineWidth(0.2);
    pdf.line(X, y, X + W, y);
    y += 5;
  };
  const room = (need: number) => {
    if (y + need < 280) return;
    pdf.addPage('a4', 'portrait');
    y = 20;
    head();
  };
  head();
  for (const g of r.groups) {
    room(14);
    pdf.setFont('times', 'italic');
    pdf.setFontSize(12);
    pdf.setTextColor('#1F2224');
    pdf.text(t(g.name), X, y + 2);
    pdf.setFont('courier', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor('#5D615D');
    pdf.text(t(euros(g.total)), cols.sum, y + 2, { align: 'right' });
    y += 8;
    for (const l of g.lines) {
      room(6);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor('#1F2224');
      pdf.text(t(l.label), cols.pos, y, { maxWidth: 88 });
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(8.5);
      pdf.text(t(`${num(l.quantity, l.unit === 'pcs' ? 0 : 1)} ${unitLabel(l.unit)}`), cols.qty, y, { align: 'right' });
      pdf.setTextColor('#5D615D');
      pdf.text(t(euros(l.unitPrice, 2)), cols.price, y, { align: 'right' });
      pdf.setTextColor('#1F2224');
      pdf.text(t(euros(l.total)), cols.sum, y, { align: 'right' });
      y += 5.6;
    }
    y += 2;
  }
  room(30);
  pdf.setDrawColor('#1F2224');
  pdf.setLineWidth(0.35);
  pdf.line(cols.qty - 30, y, X + W, y);
  y += 6;
  const total = (label: string, v: number, big = false) => {
    pdf.setFont(big ? 'times' : 'helvetica', 'normal');
    pdf.setFontSize(big ? 14 : 9.5);
    pdf.setTextColor('#1F2224');
    pdf.text(label, cols.qty - 30, y);
    pdf.text(t(euros(v)), cols.sum, y, { align: 'right' });
    y += big ? 8 : 5.6;
  };
  total('Summe netto', r.net);
  total(`MwSt. ${Math.round(r.vatRate * 100)} %`, r.gross - r.net);
  total('Summe brutto', r.gross, true);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor('#8C8E88');
  pdf.text('Materialpreise ohne Einbau. Mengen und Preise ohne Gewähr.', X, y + 4);
  return pdf.output('blob');
}

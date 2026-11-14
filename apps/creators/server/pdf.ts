import PDFDocument from 'pdfkit';
import { categoryLabel } from '../shared/categories.js';
import { PLATFORM_LABELS, type CreatorCard, type FullReport, type PostSummary } from '../shared/types.js';

const INK = '#1f1d2b';
const MUTED = '#6b6880';
const ACCENT = '#6d28d9';
const LINE = '#e6e3ef';

/** The built-in PDF fonts only cover Latin-1; drop anything else (emoji, Sinhala, Tamil) rather than print garbage. */
const latin1 = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, '').replace(/\s+/g, ' ').trim();

const fmt = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
};

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export interface PdfOptions {
  card: CreatorCard;
  reports: FullReport[];
  /** Media kit (creator's own) or report (downloaded by a brand). */
  kind: 'report' | 'media_kit';
  /** Brand stamp on every page, e.g. "Prepared for Acme (Jane Doe) · 14 Nov 2026". */
  stamp: string | null;
  baseUrl: string;
}

export function renderPdf(opts: PdfOptions): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: `${latin1(opts.card.displayName)} - CreatorTrack` } });
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width - 96;
  const { card } = opts;

  // Header
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(13).text('CreatorTrack', 48, 40);
  doc.fillColor(MUTED).font('Helvetica').fontSize(9)
    .text(opts.kind === 'media_kit' ? 'Media kit · verified stats' : 'Verified creator report', 48, 43, { width: W, align: 'right' });
  doc.moveTo(48, 62).lineTo(48 + W, 62).strokeColor(LINE).stroke();

  doc.y = 78;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(22).text(latin1(card.displayName));
  const loc = [card.city, card.country].filter(Boolean).join(', ');
  doc.fillColor(MUTED).font('Helvetica').fontSize(10)
    .text([card.categories.map(categoryLabel).join(' · '), loc].filter(Boolean).join('   |   '));
  if (card.bio) doc.moveDown(0.4).fillColor(INK).fontSize(10).text(latin1(card.bio), { width: W });
  doc.moveDown(0.4).fillColor(MUTED).fontSize(9).text(`${opts.baseUrl.replace(/^https?:\/\//, '')}/c/${card.slug}`);

  // Summary row
  doc.moveDown(0.8);
  const top = doc.y;
  const cells = [
    ['Total followers', fmt(card.totalFollowers)],
    ['Platforms', String(card.accounts.length)],
    ['Last verified', date(card.accounts.map((a) => a.lastVerifiedAt ?? '').sort().pop() || null)],
  ];
  cells.forEach(([label, value], i) => {
    const x = 48 + i * (W / 3);
    doc.roundedRect(x, top, W / 3 - 8, 46, 6).fillColor('#f6f4fb').fill();
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(label.toUpperCase(), x + 10, top + 9);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(value, x + 10, top + 22);
  });
  doc.y = top + 62;

  for (const report of opts.reports) {
    const account = card.accounts.find((a) => a.platform === report.platform);
    if (!account) continue;
    if (doc.y > doc.page.height - 260) doc.addPage();
    section(doc, W, report, account);
  }

  // Footer and stamp on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - 36;
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5);
    const left = opts.stamp ? latin1(opts.stamp) : 'Stats pulled directly from each platform via its official API.';
    doc.text(left, 48, y, { width: W * 0.75, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, 48, y, { width: W, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}

function heading(doc: PDFKit.PDFDocument, text: string) {
  doc.moveDown(0.6).fillColor(INK).font('Helvetica-Bold').fontSize(10.5).text(text);
  doc.moveDown(0.25);
}

function section(doc: PDFKit.PDFDocument, W: number, r: FullReport, account: CreatorCard['accounts'][number]) {
  const s = account.stats;
  doc.moveDown(0.6);
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(15).text(`${PLATFORM_LABELS[r.platform]}  `, { continued: true })
    .fillColor(MUTED).font('Helvetica').fontSize(10).text(`@${latin1(account.username)}${account.demo ? '  (demo data)' : ''}`);
  doc.fillColor(MUTED).fontSize(8.5).text(`Verified ${date(account.lastVerifiedAt)}${account.status === 'needs_reconnect' ? ' (connection needs renewing)' : ''}`);

  const rows: [string, string][] = [
    [r.platform === 'youtube' ? 'Subscribers' : 'Followers', fmt(s?.followers)],
    ['Engagement rate', s ? `${s.engagementRate.toFixed(2)}%` : '—'],
    ['Avg views / post', fmt(s?.avgViews)],
    ['Avg likes / post', fmt(s?.avgLikes)],
    ['Avg comments / post', fmt(s?.avgComments)],
    [r.platform === 'youtube' ? 'Videos' : 'Posts', fmt(s?.posts)],
  ];
  if (r.youtube) {
    rows.push(['Channel views (all time)', fmt(r.youtube.totalViews)], ['Views, last 28 days', fmt(r.youtube.views28d)],
      ['Watch hours, last 28 days', fmt(r.youtube.watchMinutes28d / 60)], ['Avg view duration', `${Math.floor(r.youtube.avgViewDurationSec / 60)}m ${Math.round(r.youtube.avgViewDurationSec % 60)}s`]);
  }
  grid(doc, W, rows);

  // Follower trend
  const h = r.history.slice(-90);
  if (h.length >= 2) {
    heading(doc, 'Follower trend (last 90 days)');
    const x0 = 48, y0 = doc.y, cw = W, ch = 60;
    const vals = h.map((p) => p.followers);
    const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
    doc.save().strokeColor(ACCENT).lineWidth(1.4);
    h.forEach((p, i) => {
      const x = x0 + (i / (h.length - 1)) * cw;
      const y = y0 + ch - ((p.followers - min) / span) * ch;
      i ? doc.lineTo(x, y) : doc.moveTo(x, y);
    });
    doc.stroke().restore();
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5)
      .text(`${h[0].date}: ${fmt(vals[0])}`, x0, y0 + ch + 4)
      .text(`${h[h.length - 1].date}: ${fmt(vals[vals.length - 1])}`, x0, y0 + ch + 4, { width: cw, align: 'right' });
    doc.y = y0 + ch + 18;
  }

  // Demographics
  const d = r.demographics;
  if (d) {
    const groups = (['age', 'gender', 'country', 'city'] as const).filter((k) => d[k] && Object.keys(d[k]!).length);
    if (groups.length) {
      if (doc.y > doc.page.height - 200) doc.addPage();
      heading(doc, 'Audience');
      const colW = W / groups.length;
      const startY = doc.y;
      let maxY = startY;
      groups.forEach((g, gi) => {
        const x = 48 + gi * colW;
        let y = startY;
        doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text(g.toUpperCase(), x, y);
        y += 13;
        for (const [label, pct] of Object.entries(d[g]!).slice(0, 6)) {
          doc.fillColor(INK).font('Helvetica').fontSize(8).text(latin1(label), x, y, { width: colW * 0.45, lineBreak: false });
          const bw = (colW * 0.35) * (pct / 100);
          doc.rect(x + colW * 0.45, y + 1.5, Math.max(bw, 1), 6).fillColor('#c4b5fd').fill();
          doc.fillColor(MUTED).text(`${pct}%`, x + colW * 0.45 + colW * 0.36, y, { lineBreak: false });
          y += 12;
        }
        maxY = Math.max(maxY, y);
      });
      doc.x = 48;
      doc.y = maxY + 4;
    }
  } else if (r.platform === 'tiktok') {
    doc.moveDown(0.3).fillColor(MUTED).font('Helvetica-Oblique').fontSize(8).text('Audience demographics are not provided by TikTok.', 48);
  }

  // Top posts
  const posts = topPosts(r.recentPosts, 5);
  if (posts.length) {
    if (doc.y > doc.page.height - 170) doc.addPage();
    heading(doc, 'Top recent posts');
    const cols = [0, 0.5, 0.64, 0.76, 0.88].map((f) => 48 + f * W);
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7.5);
    ['POST', 'DATE', 'LIKES', 'COMMENTS', 'VIEWS'].forEach((t, i) => doc.text(t, cols[i], doc.y, { lineBreak: false }));
    doc.moveDown(0.9);
    for (const p of posts) {
      const y = doc.y;
      doc.fillColor(INK).font('Helvetica').fontSize(8)
        .text(latin1(p.caption) || '(no caption)', cols[0], y, { width: W * 0.47, height: 10, ellipsis: true, link: p.url, lineBreak: false });
      doc.fillColor(MUTED).text(date(p.postedAt), cols[1], y, { lineBreak: false })
        .text(fmt(p.likes), cols[2], y, { lineBreak: false })
        .text(fmt(p.comments), cols[3], y, { lineBreak: false })
        .text(fmt(p.views), cols[4], y, { lineBreak: false });
      doc.x = 48;
      doc.y = y + 13;
    }
  }
  doc.moveDown(0.5).moveTo(48, doc.y).lineTo(48 + W, doc.y).strokeColor(LINE).stroke();
}

function grid(doc: PDFKit.PDFDocument, W: number, rows: [string, string][]) {
  doc.moveDown(0.4);
  const perRow = 4;
  const cw = W / perRow;
  let y = doc.y;
  rows.forEach(([label, value], i) => {
    const x = 48 + (i % perRow) * cw;
    if (i && i % perRow === 0) y += 34;
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(label.toUpperCase(), x, y, { width: cw - 6, lineBreak: false });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(value, x, y + 11, { lineBreak: false });
  });
  doc.x = 48;
  doc.y = y + 34;
}

export function topPosts(posts: PostSummary[], n: number) {
  return [...posts].sort((a, b) => b.likes + b.comments - (a.likes + a.comments)).slice(0, n);
}

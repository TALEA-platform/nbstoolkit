import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { NBS_CATEGORIES } from '../data/filterConfig';
import imageMap from '../data/imageMap';
import getTaleaTypes from './getTaleaTypes';

// ─── Color palette ───────────────────────────────────────────────
const C = {
  primary:    [33, 168, 74],    // TALEA Green #21A84A
  primaryDk:  [0, 77, 25],      // TALEA Dark Green #004d19
  accent:     [18, 114, 183],   // TALEA Blue #1272B7
  dark:       [0, 77, 25],      // TALEA Dark Green
  text:       [45, 90, 61],     // #2d5a3d
  textLight:  [122, 154, 135],  // #7a9a87
  textMuted:  [164, 186, 172],
  bg:         [247, 249, 247],  // #f7f9f7
  white:      [255, 255, 255],
  divider:    [212, 228, 216],  // #d4e4d8
};

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : C.primary;
}

// ─── Image loader ────────────────────────────────────────────────
async function loadImageAsBase64(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

function imgFormat(dataUrl) {
  if (dataUrl.includes('image/png')) return 'PNG';
  return 'JPEG';
}

// ─── Reusable drawing helpers ────────────────────────────────────
const W = 210;   // A4 portrait width
const MARGIN = 14;
const CONTENT_W = W - MARGIN * 2;
const MAX_Y = 278;

function drawTopBar(doc) {
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, W, 3, 'F');
  doc.setFillColor(...C.accent);
  doc.rect(0, 3, W, 0.8, 'F');
}

function needsNewPage(doc, y, needed) {
  if (y + needed > MAX_Y) {
    doc.addPage();
    drawTopBar(doc);
    return 14;
  }
  return y;
}

function drawSectionTitle(doc, y, title) {
  y = needsNewPage(doc, y, 18);
  // Accent bar
  doc.setFillColor(...C.primary);
  doc.rect(MARGIN, y, 3, 7, 'F');
  // Title text
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.dark);
  doc.text(title, MARGIN + 6, y + 5.5);
  // Underline
  doc.setDrawColor(...C.divider);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y + 9, W - MARGIN, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.text);
  return y + 13;
}

function drawParagraph(doc, y, text, fontSize = 9) {
  if (!text) return y;
  doc.setFontSize(fontSize);
  doc.setTextColor(...C.text);
  const lineH = fontSize * 0.45 + 1.2;
  const lines = doc.splitTextToSize(text, CONTENT_W);
  for (const line of lines) {
    y = needsNewPage(doc, y, lineH + 2);
    doc.text(line, MARGIN, y);
    y += lineH;
  }
  return y + 2;
}

function drawTagPills(doc, y, label, items, color) {
  if (!items || items.length === 0) return y;
  y = needsNewPage(doc, y, 14);

  // Label
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.textLight);
  doc.text(label, MARGIN + 2, y);
  doc.setFont('helvetica', 'normal');
  y += 5;

  const rgb = color || C.primary;
  const pillH = 5;
  const padX = 3;
  let x = MARGIN + 2;

  for (const item of items) {
    doc.setFontSize(7);
    const tw = doc.getStringUnitWidth(item) * 7 / doc.internal.scaleFactor;
    const pw = tw + padX * 2;

    if (x + pw > W - MARGIN) {
      x = MARGIN + 2;
      y += pillH + 2;
      y = needsNewPage(doc, y, pillH + 4);
    }

    // Soft background pill
    doc.setFillColor(
      Math.min(255, rgb[0] + Math.floor((255 - rgb[0]) * 0.82)),
      Math.min(255, rgb[1] + Math.floor((255 - rgb[1]) * 0.82)),
      Math.min(255, rgb[2] + Math.floor((255 - rgb[2]) * 0.82))
    );
    doc.roundedRect(x, y - 3.5, pw, pillH, 1.5, 1.5, 'F');

    // Text
    doc.setTextColor(...rgb);
    doc.text(item, x + padX, y);
    x += pw + 2.5;
  }

  doc.setTextColor(...C.text);
  return y + pillH + 2;
}

function drawInfoBox(doc, y, items) {
  y = needsNewPage(doc, y, 20);
  const boxH = 16;
  doc.setFillColor(...C.bg);
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 2, 2, 'F');
  doc.setDrawColor(...C.divider);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 2, 2, 'S');

  const colW = CONTENT_W / items.length;
  items.forEach((item, i) => {
    const cx = MARGIN + colW * i + colW / 2;
    doc.setFontSize(6.5);
    doc.setTextColor(...C.textLight);
    doc.text(item.label, cx, y + 5, { align: 'center' });
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.dark);
    const val = (item.value || '').length > 28 ? item.value.slice(0, 26) + '..' : (item.value || 'N/A');
    doc.text(val, cx, y + 11, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    // Vertical divider
    if (i < items.length - 1) {
      doc.setDrawColor(...C.divider);
      doc.line(MARGIN + colW * (i + 1), y + 3, MARGIN + colW * (i + 1), y + boxH - 3);
    }
  });
  return y + boxH + 4;
}

function drawFooters(doc) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.divider);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, 286, W - MARGIN, 286);
    doc.setFontSize(6.5);
    doc.setTextColor(...C.textMuted);
    doc.text('Nature-Based Solutions Toolkit  |  TALEA Abacus of Hardware Solutions', MARGIN, 290);
    doc.text(`Page ${i} / ${pages}`, W - MARGIN, 290, { align: 'right' });
    doc.text(new Date().toLocaleDateString('en-GB'), W / 2, 290, { align: 'center' });
  }
}

// ═══════════════════════════════════════════════════════════════════
//  SINGLE STUDY PDF
// ═══════════════════════════════════════════════════════════════════
export async function exportSingleStudyPDF(study) {
  const doc = new jsPDF();
  let y = 0;

  // Load image
  const imgUrl = imageMap[study.id];
  const imgData = imgUrl ? await loadImageAsBase64(imgUrl) : null;

  // ── Hero area ──
  const HERO_H = imgData ? 78 : 52;

  if (imgData) {
    try {
      doc.addImage(imgData, imgFormat(imgData), 0, 0, W, HERO_H, undefined, 'FAST');
      // Dark overlay for text readability
      const gs = new doc.GState({ opacity: 0.55 });
      doc.setGState(gs);
      doc.setFillColor(0, 0, 0);
      doc.rect(0, HERO_H * 0.4, W, HERO_H * 0.6, 'F');
      doc.setGState(new doc.GState({ opacity: 1 }));
    } catch {
      doc.setFillColor(...C.dark);
      doc.rect(0, 0, W, HERO_H, 'F');
    }
  } else {
    doc.setFillColor(...C.dark);
    doc.rect(0, 0, W, HERO_H, 'F');
  }

  // Green accent bar
  doc.setFillColor(...C.primary);
  doc.rect(0, HERO_H - 2, W, 3, 'F');

  // Title text on hero
  const textY0 = imgData ? HERO_H * 0.45 : 14;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(255, 255, 255);
  doc.text(`CASE STUDY #${study.id}`, MARGIN, textY0);

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(study.title, CONTENT_W);
  let ty = textY0 + 8;
  for (const line of titleLines.slice(0, 2)) {
    doc.text(line, MARGIN, ty);
    ty += 9;
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${study.city}, ${study.country}  |  ${study.year}`, MARGIN, ty + 2);

  y = HERO_H + 5;

  // ── Badges row ──
  const taleaTypes = getTaleaTypes(study);

  const badges = [
    { label: taleaTypes.join(' + ') || 'N/A', color: C.primary },
    { label: study.size, color: [99, 102, 241] },
    { label: study.climate_zone, color: C.accent },
  ];
  if (study.has_physical_innovation) badges.push({ label: 'Physical Innovation', color: [224, 124, 58] });
  if (study.has_social_innovation) badges.push({ label: 'Social Innovation', color: [236, 72, 153] });
  if (study.has_digital_innovation) badges.push({ label: 'Digital Innovation', color: [59, 130, 246] });

  let bx = MARGIN;
  for (const b of badges) {
    doc.setFontSize(7);
    const tw = doc.getStringUnitWidth(b.label) * 7 / doc.internal.scaleFactor;
    const pw = tw + 6;
    doc.setFillColor(
      Math.min(255, b.color[0] + Math.floor((255 - b.color[0]) * 0.8)),
      Math.min(255, b.color[1] + Math.floor((255 - b.color[1]) * 0.8)),
      Math.min(255, b.color[2] + Math.floor((255 - b.color[2]) * 0.8))
    );
    doc.roundedRect(bx, y, pw, 5.5, 1.5, 1.5, 'F');
    doc.setTextColor(...b.color);
    doc.text(b.label, bx + 3, y + 3.8);
    bx += pw + 2;
  }
  doc.setTextColor(...C.text);
  y += 10;

  // ── Info grid ──
  y = drawInfoBox(doc, y, [
    { label: 'DESIGNER', value: study.designer },
    { label: 'PROMOTER', value: study.promoter },
    { label: 'YEAR', value: String(study.year) },
    { label: 'SIZE', value: study.size },
  ]);

  // ── Description ──
  y = drawSectionTitle(doc, y, 'Description');
  y = drawParagraph(doc, y, study.description);

  // ── Innovation sections ──
  if (study.physical_innovation) {
    y = drawSectionTitle(doc, y, 'Physical Innovation');
    y = drawParagraph(doc, y, study.physical_innovation);
  }
  if (study.social_innovation) {
    y = drawSectionTitle(doc, y, 'Social Innovation');
    y = drawParagraph(doc, y, study.social_innovation);
  }
  if (study.digital_innovation) {
    y = drawSectionTitle(doc, y, 'Digital Innovation');
    y = drawParagraph(doc, y, study.digital_innovation);
  }

  // ── A. Physical Characteristics ──
  y = drawSectionTitle(doc, y, 'A. Physical Characteristics');
  y = drawTagPills(doc, y, 'A1 Urban Scale', study.a1_urban_scale, hexToRgb('#21A84A'));
  y = drawTagPills(doc, y, 'A2 Urban Area', study.a2_urban_area, hexToRgb('#d69e2e'));
  y = drawTagPills(doc, y, 'A3.1 Buildings', study.a3_1_buildings, hexToRgb('#1272B7'));
  y = drawTagPills(doc, y, 'A3.2 Open Spaces', study.a3_2_open_spaces, hexToRgb('#21A84A'));
  y = drawTagPills(doc, y, 'A3.3 Infrastructures', study.a3_3_infrastructures, hexToRgb('#1272B7'));
  y = drawTagPills(doc, y, 'A4 Ownership', study.a4_ownership, hexToRgb('#004d19'));
  y = drawTagPills(doc, y, 'A5 Management', study.a5_management, hexToRgb('#1272B7'));
  y = drawTagPills(doc, y, 'A6 Uses', study.a6_uses, hexToRgb('#21A84A'));
  y = drawTagPills(doc, y, 'A7 Other', study.a7_other, hexToRgb('#004d19'));

  // ── B. Constraints & Opportunities ──
  y = drawSectionTitle(doc, y, 'B. Constraints & Opportunities');
  y = drawTagPills(doc, y, 'B1 Physical', study.b1_physical, hexToRgb('#c53030'));
  y = drawTagPills(doc, y, 'B2 Regulations', study.b2_regulations, hexToRgb('#d69e2e'));
  y = drawTagPills(doc, y, 'B3 Uses & Management', study.b3_uses_management, hexToRgb('#21A84A'));
  y = drawTagPills(doc, y, 'B4 Public Opinion', study.b4_public_opinion, hexToRgb('#1272B7'));
  y = drawTagPills(doc, y, 'B5 Synergy', study.b5_synergy, hexToRgb('#004d19'));
  y = drawTagPills(doc, y, 'B6 Social Opportunities', study.b6_social_opportunities, hexToRgb('#21A84A'));

  // ── C. Design Process & Results ──
  y = drawSectionTitle(doc, y, 'C. Design Process & Results');
  y = drawTagPills(doc, y, 'C1.1 Design', study.c1_1_design, hexToRgb('#1272B7'));
  y = drawTagPills(doc, y, 'C1.2 Funding', study.c1_2_funding, hexToRgb('#21A84A'));
  y = drawTagPills(doc, y, 'C1.3 Management', study.c1_3_management, hexToRgb('#d69e2e'));
  y = drawTagPills(doc, y, 'C2 Actors', study.c2_actors, hexToRgb('#1272B7'));
  y = drawTagPills(doc, y, 'C3 Goals & Results', study.c3_goals, hexToRgb('#004d19'));
  y = drawTagPills(doc, y, 'C4 Services', study.c4_services, hexToRgb('#21A84A'));

  // ── C5 Impacts (structured) ──
  if (study.c5_impacts) {
    y = drawSectionTitle(doc, y, 'C5. Impacts');
    const impactLines = study.c5_impacts.split('\n').filter(Boolean);
    for (const line of impactLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const isHeading = /^[A-Z\s&/,()-]+:?$/.test(trimmed) || trimmed.endsWith(':');
      const isBullet = trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*');
      if (isHeading) {
        y = needsNewPage(doc, y, 10);
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...C.dark);
        doc.text(trimmed.replace(/:$/, ''), MARGIN + 2, y);
        doc.setFont('helvetica', 'normal');
        y += 5;
      } else if (isBullet) {
        const bulletText = trimmed.replace(/^[-•*]\s*/, '');
        const bulletLines = doc.splitTextToSize(bulletText, CONTENT_W - 8);
        for (let i = 0; i < bulletLines.length; i++) {
          y = needsNewPage(doc, y, 5);
          doc.setFontSize(8);
          doc.setTextColor(...C.text);
          if (i === 0) {
            doc.setFillColor(...C.primary);
            doc.circle(MARGIN + 4, y - 1, 0.8, 'F');
          }
          doc.text(bulletLines[i], MARGIN + 8, y);
          y += 4;
        }
        y += 1;
      } else {
        doc.setFontSize(8);
        doc.setTextColor(...C.text);
        const paraLines = doc.splitTextToSize(trimmed, CONTENT_W - 2);
        for (const pl of paraLines) {
          y = needsNewPage(doc, y, 5);
          doc.text(pl, MARGIN + 2, y);
          y += 4;
        }
        y += 1;
      }
    }
    y += 2;
  }

  // ── D. Nature-Based Solutions ──
  y = drawSectionTitle(doc, y, 'D. Nature-Based Solutions Applied');
  for (const [key, meta] of Object.entries(NBS_CATEGORIES)) {
    const items = study[key] || [];
    if (items.length > 0) {
      // Strip emoji from label for PDF (jsPDF can't render emoji)
      const cleanLabel = meta.label.replace(/[\u{1F000}-\u{1FFFF}]/gu, '').trim();
      y = drawTagPills(doc, y, cleanLabel, items, hexToRgb(meta.color));
    }
  }

  // ── Sources ──
  if (study.sources) {
    y = drawSectionTitle(doc, y, 'Sources');
    const srcLines = study.sources.split('\n').filter(Boolean);
    for (const src of srcLines) {
      y = needsNewPage(doc, y, 6);
      doc.setFontSize(7);
      doc.setTextColor(...C.accent);
      doc.text(src.trim(), MARGIN, y);
      y += 4;
    }
    doc.setTextColor(...C.text);
  }

  // ── Footers ──
  drawFooters(doc);

  doc.save(`TALEA_CS${study.id}_${(study.title || 'untitled').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}.pdf`);
}

// ═══════════════════════════════════════════════════════════════════
//  FILTERED RESULTS PDF
// ═══════════════════════════════════════════════════════════════════
export async function exportFilteredResultsPDF(studies, activeFilters) {
  const doc = new jsPDF('l'); // landscape
  const LW = 297;
  const LH = 210;

  // ── Header ──
  doc.setFillColor(...C.dark);
  doc.rect(0, 0, LW, 26, 'F');
  doc.setFillColor(...C.primary);
  doc.rect(0, 26, LW, 2.5, 'F');

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.white);
  doc.text('Nature-Based Solutions Toolkit', 14, 11);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('TALEA Abacus of Hardware Solutions', 14, 17);
  doc.setFontSize(10);
  doc.text(`${studies.length} Solutions`, 14, 23);

  // Result count badge
  doc.setFillColor(...C.primary);
  const countText = `${studies.length}`;
  doc.roundedRect(LW - 35, 7, 22, 10, 3, 3, 'F');
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.white);
  doc.text(countText, LW - 24, 14.5, { align: 'center' });

  let y = 32;

  // ── Active filters summary ──
  const filterEntries = Object.entries(activeFilters);
  if (filterEntries.length > 0) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.textLight);
    doc.text('ACTIVE FILTERS:', 14, y);
    doc.setFont('helvetica', 'normal');

    let fx = 46;
    for (const [, values] of filterEntries) {
      for (const v of values) {
        const tw = doc.getStringUnitWidth(v) * 7 / doc.internal.scaleFactor;
        const pw = tw + 5;
        if (fx + pw > LW - 14) { fx = 14; y += 7; }
        doc.setFillColor(
          Math.min(255, C.primary[0] + Math.floor((255 - C.primary[0]) * 0.82)),
          Math.min(255, C.primary[1] + Math.floor((255 - C.primary[1]) * 0.82)),
          Math.min(255, C.primary[2] + Math.floor((255 - C.primary[2]) * 0.82))
        );
        doc.setFontSize(7);
        doc.roundedRect(fx, y - 3.5, pw, 5, 1.2, 1.2, 'F');
        doc.setTextColor(...C.primary);
        doc.text(v, fx + 2.5, y);
        fx += pw + 2;
      }
    }
    doc.setTextColor(...C.text);
    y += 6;
  }

  y += 2;

  // ── Results table ──
  const tableData = studies.map(s => {
    const type = getTaleaTypes(s).map(t => t[0]).join('+');

    const nbs = [
      ...(s.d1_plants || []), ...(s.d2_paving || []),
      ...(s.d3_water || []), ...(s.d4_roof_facade || []),
      ...(s.d5_furnishings || []), ...(s.d6_urban_spaces || []),
    ];

    return [
      s.id,
      s.title,
      `${s.city}, ${s.country}`,
      s.year,
      type,
      s.size,
      s.climate_zone,
      nbs.slice(0, 4).join(', ') + (nbs.length > 4 ? ` +${nbs.length - 4}` : ''),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['#', 'Title', 'Location', 'Year', 'Type', 'Size', 'Climate', 'Key NBS']],
    body: tableData,
    styles: {
      fontSize: 7.5,
      cellPadding: 2.5,
      textColor: C.text,
      lineColor: C.divider,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: C.dark,
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center', fontStyle: 'bold', textColor: C.primary },
      1: { cellWidth: 55 },
      2: { cellWidth: 35 },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 14, halign: 'center' },
      5: { cellWidth: 18 },
      6: { cellWidth: 25 },
      7: { cellWidth: 'auto' },
    },
    didDrawPage: () => {
      // Draw accent bar on each new page
      doc.setFillColor(...C.primary);
      doc.rect(0, 0, LW, 1.5, 'F');
    },
    margin: { top: 8, left: 14, right: 14 },
  });

  // ── Footers ──
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.divider);
    doc.setLineWidth(0.3);
    doc.line(14, LH - 8, LW - 14, LH - 8);
    doc.setFontSize(6.5);
    doc.setTextColor(...C.textMuted);
    doc.text('Nature-Based Solutions Toolkit  |  TALEA Abacus of Hardware Solutions', 14, LH - 4);
    doc.text(`Page ${i} / ${pages}`, LW - 14, LH - 4, { align: 'right' });
    doc.text(new Date().toLocaleDateString('en-GB'), LW / 2, LH - 4, { align: 'center' });
  }

  doc.save(`TALEA_Results_${studies.length}_solutions.pdf`);
}

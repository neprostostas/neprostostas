/**
 * Courses shelf SVG export — About Me–style rules.
 *
 * Heading "📚 My Courses · ITVDN" stays README markdown text — not in these SVGs.
 *
 * Outputs (shared SMIL clock — load together to stay in sync):
 * - compare/courses-shelf.svg — combined (local diff only, not shipped to README)
 * - courses-card-<slug>.svg × N — one card each (README wraps <a href=course>)
 * - courses-progress.svg — bottom cycle/pause bar
 *
 * Usage: node build-courses-svg.mjs
 * Needs: http://127.0.0.1:8765/index.html (.courses-shelf-export fixture in the page)
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_COMPARE = path.join(__dirname, 'compare');
const OUT_ASSETS = path.join(__dirname, '../assets/courses');
const DSF = 3;
const ROOT_SEL = '.courses-shelf-export .courses-badge-shelf';

/** Figma cover artboard (710×428) — text overlays for empty PNGs */
const FIGMA_W = 710;
const FIGMA_H = 428;
const COVER_OVERLAYS = {
  'vuejs-start-empty.png': {
    title: { lines: ['Vue.js'], x: 49, y: 104, size: 105, weight: 700, fill: '#ffffff', tracking: -2.1, lineH: 105 },
    subtitle: { lines: ['Starter'], x: 53, y: 223, size: 43, weight: 500, fill: '#b281f5', tracking: -0.215, lineH: 43 },
    line: { x: 54, y: 284, w: 57, h: 3, fill: '#ab77f2', rx: 3 },
  },
  'layout-grid-empty.png': {
    title: { lines: ['CSS Grid'], x: 49, y: 104, size: 105, weight: 700, fill: '#ffffff', tracking: -2.1, lineH: 105 },
    subtitle: { lines: ['Layout'], x: 53, y: 223, size: 43, weight: 500, fill: '#b281f5', tracking: -0.215, lineH: 43 },
    line: { x: 54, y: 284, w: 57, h: 3, fill: '#ab77f2', rx: 3 },
  },
  'pug-empty.png': {
    title: { lines: ['Pug'], x: 49, y: 90, size: 105, weight: 700, fill: '#ffffff', tracking: -2.1, lineH: 105 },
    subtitle: { lines: ['Template Engine'], x: 53, y: 226, size: 35, weight: 500, fill: '#b281f5', tracking: -0.175, lineH: 35 },
    line: { x: 54, y: 278, w: 57, h: 3, fill: '#ab77f2', rx: 3 },
  },
  'react-native-empty.png': {
    // Figma 136:85 — Mobile 57,264; line 58,320 (match ink).
    // Title node y=72, but Chromium text-before-edge sits ~18px lower than Figma
    // raster for Montserrat Bold 105 — use 54 so React/Native ink matches (82…).
    // That restores the Native→Mobile gap; moving only Mobile left it looking wrong.
    title: { lines: ['React', 'Native'], x: 53, y: 54, size: 105, weight: 700, fill: '#ffffff', tracking: -2.1, lineH: 91 },
    subtitle: { lines: ['Mobile'], x: 57, y: 264, size: 43, weight: 500, fill: '#b281f5', tracking: -0.215, lineH: 52 },
    line: { x: 58, y: 320, w: 57, h: 3, fill: '#ab77f2', rx: 3 },
  },
};

function montserratFacesCss() {
  const bold = fs.readFileSync(path.join(__dirname, 'fonts/Montserrat-Bold.woff2')).toString('base64');
  const medium = fs.readFileSync(path.join(__dirname, 'fonts/Montserrat-Medium.woff2')).toString('base64');
  return (
    `@font-face{font-family:'Montserrat';font-weight:700;font-style:normal;` +
    `src:url(data:font/woff2;base64,${bold}) format('woff2')}` +
    `@font-face{font-family:'Montserrat';font-weight:500;font-style:normal;` +
    `src:url(data:font/woff2;base64,${medium}) format('woff2')}`
  );
}

function coverOverlaySvg(coverBox, coverFile) {
  const overlay = COVER_OVERLAYS[coverFile];
  if (!overlay) return '';
  const sx = coverBox.w / FIGMA_W;
  const sy = coverBox.h / FIGMA_H;
  const mx = (fx) => coverBox.x + fx * sx;
  const my = (fy) => coverBox.y + fy * sy;
  const parts = [];
  const drawText = (block) => {
    if (!block) return;
    const size = block.size * sy;
    const tracking = (block.tracking || 0) * sx;
    const letterSpacing = tracking; // Figma tracking is px at design size
    const weight = block.weight;
    const lh = (block.lineH || block.size) * sy;
    block.lines.forEach((line, i) => {
      const x = mx(block.x);
      const y = my(block.y) + i * lh;
      parts.push(
        `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" fill="${esc(block.fill)}" ` +
          `font-family="Montserrat, system-ui, sans-serif" font-weight="${weight}" ` +
          `font-size="${size.toFixed(2)}" letter-spacing="${letterSpacing.toFixed(3)}" ` +
          `dominant-baseline="text-before-edge" xml:space="preserve">${esc(line)}</text>`
      );
    });
  };
  drawText(overlay.title);
  drawText(overlay.subtitle);
  if (overlay.line) {
    const L = overlay.line;
    parts.push(
      `<rect x="${mx(L.x).toFixed(2)}" y="${my(L.y).toFixed(2)}" ` +
        `width="${(L.w * sx).toFixed(2)}" height="${(L.h * sy).toFixed(2)}" ` +
        `rx="${(L.rx * sy).toFixed(2)}" fill="${esc(L.fill)}"/>`
    );
  }
  return parts.join('\n');
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function roundedRectPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  return [
    `M${x + rr} ${y}`,
    `H${x + w - rr}`,
    `A${rr} ${rr} 0 0 1 ${x + w} ${y + rr}`,
    `V${y + h - rr}`,
    `A${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}`,
    `H${x + rr}`,
    `A${rr} ${rr} 0 0 1 ${x} ${y + h - rr}`,
    `V${y + rr}`,
    `A${rr} ${rr} 0 0 1 ${x + rr} ${y}`,
    'Z',
  ].join(' ');
}

function fileToDataUrl(filePath) {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function main() {
  fs.mkdirSync(OUT_COMPARE, { recursive: true });
  fs.mkdirSync(OUT_ASSETS, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1200, height: 1600 },
    deviceScaleFactor: DSF,
  });

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.addStyleTag({
    content: `
      .chrome { display: none !important; }
      html, body { background: transparent !important; }
      .readme { max-width: 1012px !important; margin: 0 !important; padding: 24px 0 !important; }
      /* Fixture is hidden in playground UI — force it on for capture */
      .courses-shelf-export { display: block !important; width: 1012px !important; max-width: 1012px !important; }
      .courses-shelf-export[hidden] { display: block !important; }
      .courses-shelf-export .courses-badge-shelf { width: 1012px !important; }
      .courses-shelf-svg-preview { display: none !important; }
      .variant-label { display: none !important; }
    `,
  });
  await page.waitForSelector(`${ROOT_SEL} .courses-badge-card__badge`, { state: 'visible' });
  await page.waitForTimeout(800);

  // Kill hover lift; light vertical pad so tops/bottoms aren't cut by screenshot
  await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    const r = root.getBoundingClientRect();
    root.style.boxSizing = 'border-box';
    root.style.width = `${Math.round(r.width)}px`;
    root.style.paddingTop = '4px';
    root.style.paddingBottom = '4px';
    root.style.overflow = 'visible';
    for (const card of root.querySelectorAll('.courses-badge-card')) {
      card.style.setProperty('transform', 'none', 'important');
    }
  }, ROOT_SEL);
  await page.waitForTimeout(80);

  const pngPath = path.join(OUT_COMPARE, 'courses-shelf.png');
  await page.locator(ROOT_SEL).screenshot({
    path: pngPath,
    type: 'png',
    omitBackground: true,
  });

  const data = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    const fr = root.getBoundingClientRect();
    const ox = fr.left;
    const oy = fr.top;
    const rel = (r) => ({
      x: r.left - ox,
      y: r.top - oy,
      w: r.width,
      h: r.height,
    });

    const cards = [...root.querySelectorAll('.courses-badge-card')].map((card) => {
      const cs = getComputedStyle(card);
      const badge = card.querySelector('.courses-badge-card__badge');
      const cover = card.querySelector('.courses-badge-card__cover');
      const coverSrc = cover?.getAttribute('src') || '';
      return {
        href: card.href,
        box: rel(card.getBoundingClientRect()),
        radius: parseFloat(cs.borderRadius) || 14,
        bg: cs.backgroundColor,
        border: cs.borderColor,
        borderW: parseFloat(cs.borderTopWidth) || 1,
        badge: badge ? rel(badge.getBoundingClientRect()) : null,
        cover: cover ? rel(cover.getBoundingClientRect()) : null,
        coverFile: coverSrc.split('/').pop() || '',
        coverRadius: cover ? parseFloat(getComputedStyle(cover).borderRadius) || 10 : 10,
      };
    });

    return { w: fr.width, h: fr.height, cards };
  }, ROOT_SEL);

  for (let i = 0; i < data.cards.length; i++) {
    const loc = page.locator(`${ROOT_SEL} .courses-badge-card__badge`).nth(i);
    const buf = await loc.screenshot({ type: 'png', omitBackground: true });
    data.cards[i].badgeHref = `data:image/png;base64,${buf.toString('base64')}`;
  }

  await browser.close();

  // Normalize so nothing sits above y=0 / left of x=0 (viewBox clips negatives)
  let minX = 0;
  let minY = 0;
  for (const card of data.cards) {
    minX = Math.min(minX, card.box.x);
    minY = Math.min(minY, card.box.y);
    if (card.badge) {
      minX = Math.min(minX, card.badge.x);
      minY = Math.min(minY, card.badge.y);
    }
    if (card.cover) {
      minX = Math.min(minX, card.cover.x);
      minY = Math.min(minY, card.cover.y);
    }
  }
  const dx = minX < 0 ? -minX : 0;
  const dy = minY < 0 ? -minY : 0;
  const shift = (b) => {
    if (!b) return b;
    return { ...b, x: b.x + dx, y: b.y + dy };
  };
  for (const card of data.cards) {
    card.box = shift(card.box);
    card.badge = shift(card.badge);
    card.cover = shift(card.cover);
  }

  // Minimal gutter so edge glow/comet aren't clipped (keep cards edge-to-edge)
  const GAP_X = 4;
  const GAP_Y = 8;
  // Solo card SVGs: side pad so 2×pad ≈ playground shelf gap (14px) when imgs sit at 25%
  const CARD_PAD_X = 7;
  // Solo card SVGs: less empty space under the card (progress sits right below)
  const CARD_PAD_BOTTOM = 2;
  // Reload progress under the whole shelf (cometPause window)
  const PROGRESS_GAP = 10;
  const PROGRESS_H = 2.5;
  const PROGRESS_BOTTOM = 4;
  /** Top inset inside courses-progress.svg only */
  const PROGRESS_TOP = 1;
  const PROGRESS_SVG_BOTTOM = 2;
  for (const card of data.cards) {
    card.box.x += GAP_X;
    card.box.y += GAP_Y;
    if (card.badge) {
      card.badge.x += GAP_X;
      card.badge.y += GAP_Y;
    }
    if (card.cover) {
      card.cover.x += GAP_X;
      card.cover.y += GAP_Y;
    }
  }

  const W = data.w + dx + GAP_X * 2;
  const cardsBottom = data.h + dy + GAP_Y * 2;
  const H = cardsBottom + PROGRESS_GAP + PROGRESS_H + PROGRESS_BOTTOM;
  const coverDir = path.join(__dirname, '../assets/courses/styled');

  // Staggered card reveal — scale up from each card's center only
  const T = {
    start: 0.12,
    gap: 0.14,
    dur: 0.5,
    fromScale: 0.72,
  };
  const appearEnd = T.start + (data.cards.length - 1) * T.gap + T.dur;

  /** pathLength=100: top-center phase on rounded-rect rim (clockwise from top-left). */
  function rimPhase(w, h, r) {
    const rr = Math.min(Math.max(r, 0), w / 2, h / 2);
    const top = Math.max(0, w - 2 * rr);
    const side = Math.max(0, h - 2 * rr);
    const arc = (Math.PI * rr) / 2;
    const P = 2 * top + 2 * side + 4 * arc;
    const posTop = (100 * (top / 2)) / P;
    // Approach from the left on the top edge (before top-center along the path)
    const leadDist = Math.min(11, posTop * 0.9);
    return {
      posTop,
      leadDist,
      preOff: -(posTop - leadDist),
      syncOff: -posTop,
      endOff: -posTop - 100,
    };
  }

  // Full lap top-center→top-center at constant speed, plus a short pre-roll from the left
  const rimLap = 2.4;
  const leadDistRef = rimPhase(
    data.cards[0].box.w - 1,
    data.cards[0].box.h - 1,
    Math.max(0, (data.cards[0].radius || 14) - 0.5)
  ).leadDist;
  const leadTime = (leadDistRef / 100) * rimLap;
  const nCards = data.cards.length;
  const S = {
    sheenDur: 25 * 1.35, // slow specular sweep — do not shorten
    rimLap,
    cardStep: rimLap,
    leadTime,
    cometPause: 3,
  };
  const lastCometEnd = S.leadTime + nCards * S.rimLap;
  const cometCycle = lastCometEnd + S.cometPause;

  function formatTimes(times, { pinEnd = true } = {}) {
    const t = times.slice();
    for (let k = 1; k < t.length; k++) {
      if (t[k] <= t[k - 1]) t[k] = t[k - 1] + 0.0002;
      if (pinEnd && t[k] > 0.9998 && k < t.length - 1) {
        t[k] = 0.9998 - (t.length - 1 - k) * 0.00005;
      }
    }
    if (pinEnd) t[t.length - 1] = 1;
    return t.map((v) => v.toFixed(5)).join(';');
  }

  /**
   * preStart: begin moving+fading in from left of top-center
   * syncT:   arrive at top-center fully opaque (handoff with previous endT)
   * endT:    finish full lap back at top-center
   */
  function rimWindow(i) {
    const preStart = i * S.rimLap;
    const syncT = S.leadTime + i * S.rimLap;
    const endT = syncT + S.rimLap;
    return { preStart, syncT, endT };
  }

  function cardSlug(card, i) {
    const raw = card.coverFile || `card-${i}`;
    return raw.replace(/-empty\.png$/i, '').replace(/\.png$/i, '') || `card-${i}`;
  }

  function offsetBox(b, ox, oy) {
    if (!b) return b;
    return { ...b, x: b.x + ox, y: b.y + oy };
  }

  function offsetCard(card, ox, oy) {
    return {
      ...card,
      box: offsetBox(card.box, ox, oy),
      badge: offsetBox(card.badge, ox, oy),
      cover: offsetBox(card.cover, ox, oy),
    };
  }

  function defsBlock(animated, idSuffix = '') {
    const sheenId = `cardSheenGrad${idSuffix}`;
    const glowId = `cometGlow${idSuffix}`;
    if (!animated) {
      return {
        xml: `<defs><style type="text/css"><![CDATA[${montserratFacesCss()}]]></style></defs>`,
        sheenId,
        glowId,
      };
    }
    const xml =
      `<defs>` +
      `<style type="text/css"><![CDATA[${montserratFacesCss()}]]></style>` +
      `<linearGradient id="${sheenId}" x1="0%" y1="0%" x2="100%" y2="0%">` +
      `<stop offset="0%" stop-color="#fff" stop-opacity="0"/>` +
      `<stop offset="28%" stop-color="#e9e0ff" stop-opacity="0"/>` +
      `<stop offset="42%" stop-color="#fff" stop-opacity="0.22"/>` +
      `<stop offset="50%" stop-color="#fff" stop-opacity="0.72"/>` +
      `<stop offset="58%" stop-color="#e9e0ff" stop-opacity="0.22"/>` +
      `<stop offset="72%" stop-color="#fff" stop-opacity="0"/>` +
      `<stop offset="100%" stop-color="#fff" stop-opacity="0"/>` +
      `</linearGradient>` +
      `<filter id="${glowId}" x="-60%" y="-60%" width="220%" height="220%" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur in="SourceGraphic" stdDeviation="1.25" result="b"/>` +
      `<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>` +
      `</filter>` +
      `</defs>`;
    return { xml, sheenId, glowId };
  }

  /**
   * Append one card. Timing always uses global index `i` + shared appearEnd/cometCycle
   * so split SVGs stay in lockstep when loaded together.
   */
  function appendCard(parts, card, i, { animated, wrapLink, sheenId, glowId, idSuffix = '' }) {
    const { x, y, w, h } = card.box;
    const r = card.radius;
    const stroke = card.border || 'rgba(167, 139, 250, 0.55)';
    const fill = card.bg || '#1a2030';
    const cx = x + w / 2;
    const cy = y + h / 2;
    const begin = (T.start + i * T.gap).toFixed(3);
    const dur = T.dur.toFixed(3);
    const ease = `calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1"`;
    const clipId = `card-clip-${i}${idSuffix}`;
    const borderW = card.borderW || 1;
    const rimPath = roundedRectPath(x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, r - 0.5));
    const phase = rimPhase(w - 1, h - 1, Math.max(0, r - 0.5));
    const { preStart, syncT, endT } = rimWindow(i);

    const tPre = preStart / cometCycle;
    const tSync = syncT / cometCycle;
    const tEnd = endT / cometCycle;
    const rimKtDash = formatTimes([0, tPre, tSync, tEnd, 1]);
    const offPre = phase.preOff.toFixed(3);
    const offSync = phase.syncOff.toFixed(3);
    const offEnd = phase.endOff.toFixed(3);

    const fadeOutDur = Math.max(S.leadTime, 0.4);
    const opKt = formatTimes([0, tPre, tSync, (endT - fadeOutDur) / cometCycle, tEnd, 1]);
    const loopBegin = appearEnd.toFixed(3);
    const loopDur = cometCycle.toFixed(3);

    if (wrapLink) {
      parts.push(`<a href="${esc(card.href)}" target="_blank" rel="noopener noreferrer">`);
    }
    if (animated) {
      parts.push(
        `<defs><clipPath id="${clipId}"><path d="${roundedRectPath(x, y, w, h, r)}"/></clipPath></defs>`
      );
      parts.push(`<g transform="translate(${cx} ${cy})">`);
      parts.push(`<g transform="scale(${T.fromScale})" opacity="0">`);
      parts.push(
        `<animate attributeName="opacity" from="0" to="1" begin="${begin}s" dur="${dur}s" fill="freeze" ${ease}/>`
      );
      parts.push(
        `<animateTransform attributeName="transform" type="scale" from="${T.fromScale}" to="1" ` +
          `begin="${begin}s" dur="${dur}s" fill="freeze" ${ease}/>`
      );
      parts.push(`<g transform="translate(${-cx} ${-cy})">`);
    }

    parts.push(`<path d="${roundedRectPath(x, y, w, h, r)}" fill="${esc(fill)}"/>`);
    parts.push(
      `<path d="${rimPath}" fill="none" stroke="${esc(stroke)}" stroke-width="${borderW}"/>`
    );

    if (card.badge && card.badgeHref) {
      const b = card.badge;
      parts.push(
        `<image x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" preserveAspectRatio="xMidYMid meet" href="${card.badgeHref}"/>`
      );
    }

    if (card.cover && card.coverFile) {
      const c = card.cover;
      const emptyName = /[-_]empty\.png$/i.test(card.coverFile)
        ? card.coverFile
        : card.coverFile.replace(/\.png$/i, '-empty.png');
      const emptyPath = path.join(coverDir, emptyName);
      const useEmpty = fs.existsSync(emptyPath);
      const fileName = useEmpty ? emptyName : card.coverFile;
      const coverPath = path.join(coverDir, fileName);
      if (fs.existsSync(coverPath)) {
        const href = fileToDataUrl(coverPath);
        const cr = card.coverRadius || 10;
        const coverClipId = `cover-${i}${idSuffix}-${fileName.replace(/\W/g, '')}`;
        const coverCx = c.x + c.w / 2;
        const coverCy = c.y + c.h / 2;
        parts.push(
          `<defs><clipPath id="${coverClipId}"><path d="${roundedRectPath(c.x, c.y, c.w, c.h, cr)}"/></clipPath></defs>`
        );
        if (animated) {
          const coverScale = 1.07;
          const tMid = (tSync + tEnd) / 2;
          const ckt = formatTimes([0, tSync, tMid, tEnd, 1]);
          const coverEase =
            `calcMode="spline" keySplines="0 0 1 1;0.37 0 0.63 1;0.37 0 0.63 1;0 0 1 1"`;
          parts.push(`<g clip-path="url(#${coverClipId})">`);
          parts.push(`<g transform="translate(${coverCx} ${coverCy})">`);
          parts.push(`<g transform="scale(1)">`);
          parts.push(
            `<animateTransform attributeName="transform" type="scale" ` +
              `values="1;1;${coverScale};1;1" keyTimes="${ckt}" ` +
              `dur="${loopDur}s" begin="${loopBegin}s" ` +
              `repeatCount="indefinite" ${coverEase}/>`
          );
          parts.push(`<g transform="translate(${-coverCx} ${-coverCy})">`);
          parts.push(
            `<image x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" preserveAspectRatio="xMidYMid slice" href="${href}"/>`
          );
          parts.push(`</g></g></g></g>`);
        } else {
          parts.push(
            `<image x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${coverClipId})" href="${href}"/>`
          );
        }
        if (useEmpty) {
          parts.push(
            `<g clip-path="url(#${coverClipId})" pointer-events="none">${coverOverlaySvg(c, fileName)}</g>`
          );
        }
        parts.push(
          `<path d="${roundedRectPath(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1, Math.max(0, cr - 0.5))}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`
        );
      }
    }

    if (animated) {
      const sheenStart = S.leadTime + i * S.cardStep;
      const sheenSweep = S.sheenDur * 0.04;
      const tSheen0 = sheenStart / cometCycle;
      const tSheen1 = (sheenStart + sheenSweep) / cometCycle;
      const tSheenOut = Math.min(1, tSheen1 + 0.02 / cometCycle);
      const sheenKt = formatTimes([0, tSheen0, tSheen1, tSheenOut, 1]);
      const sheenSplines =
        `calcMode="spline" keySplines="0 0 1 1;0.4 0 0.2 1;0.4 0 0.2 1;0 0 1 1"`;
      const fromX = -w * 1.25;
      const toX = w * 1.25;
      const bandW = Math.max(88, w * 0.72);

      parts.push(`<g clip-path="url(#${clipId})" pointer-events="none">`);
      parts.push(
        `<g transform="translate(${fromX} 0)" opacity="0">` +
          `<animate attributeName="opacity" values="0;0;1;0;0" keyTimes="${sheenKt}" ` +
          `dur="${loopDur}s" begin="${loopBegin}s" repeatCount="indefinite" ${sheenSplines}/>` +
          `<animateTransform attributeName="transform" type="translate" ` +
          `values="${fromX} 0;${fromX} 0;${toX} 0;${toX} 0;${toX} 0" keyTimes="${sheenKt}" ` +
          `dur="${loopDur}s" begin="${loopBegin}s" repeatCount="indefinite" ${sheenSplines}/>` +
          `<g transform="translate(${cx} ${cy}) skewX(-24) translate(${-cx} ${-cy})">` +
          `<rect x="${x - bandW * 0.05}" y="${y - 12}" width="${bandW}" height="${h + 24}" fill="url(#${sheenId})"/>` +
          `</g></g>`
      );
      parts.push(`</g>`);

      const cometAnim =
        `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="${opKt}" ` +
        `dur="${loopDur}s" begin="${loopBegin}s" repeatCount="indefinite" calcMode="linear"/>` +
        `<animate attributeName="stroke-dashoffset" ` +
        `values="${offPre};${offPre};${offSync};${offEnd};${offPre}" keyTimes="${rimKtDash}" ` +
        `dur="${loopDur}s" begin="${loopBegin}s" repeatCount="indefinite" calcMode="linear"/>`;
      parts.push(
        `<path d="${rimPath}" fill="none" stroke="#8b5cf6" stroke-width="2.35" ` +
          `stroke-linecap="round" pathLength="100" stroke-dasharray="12 88" opacity="0" ` +
          `filter="url(#${glowId})" pointer-events="none">` +
          cometAnim +
          `</path>`
      );
      parts.push(
        `<path d="${rimPath}" fill="none" stroke="#e9e0ff" stroke-width="1.15" ` +
          `stroke-linecap="round" pathLength="100" stroke-dasharray="12 88" opacity="0" pointer-events="none">` +
          cometAnim +
          `</path>`
      );

      parts.push(`</g></g></g>`);
    }

    if (wrapLink) parts.push(`</a>`);
  }

  function appendProgressAt(parts, barY) {
    const barX = GAP_X;
    const barW = W - GAP_X * 2;
    const tPause = lastCometEnd / cometCycle;
    const tFade = Math.min(0.996, (lastCometEnd + S.cometPause - 0.2) / cometCycle);
    const widthKt = formatTimes([0, tPause, 1]);
    const fadeKt = formatTimes([0, tPause, tFade, 1]);
    const loopBegin = appearEnd.toFixed(3);
    const loopDur = cometCycle.toFixed(3);
    const rx = (PROGRESS_H / 2).toFixed(2);
    parts.push(`<g pointer-events="none" aria-hidden="true">`);
    parts.push(
      `<rect x="${barX.toFixed(2)}" y="${barY.toFixed(2)}" width="${barW.toFixed(2)}" height="${PROGRESS_H}" ` +
        `rx="${rx}" fill="#8b5cf6" opacity="0.18"/>`
    );
    parts.push(
      `<rect x="${barX.toFixed(2)}" y="${barY.toFixed(2)}" width="0" height="${PROGRESS_H}" ` +
        `rx="${rx}" fill="#7c3aed" opacity="0">` +
        `<animate attributeName="width" values="0;${barW.toFixed(2)};${barW.toFixed(2)}" keyTimes="${widthKt}" ` +
        `dur="${loopDur}s" begin="${loopBegin}s" repeatCount="indefinite" calcMode="linear"/>` +
        `<animate attributeName="opacity" values="1;1;1;0" keyTimes="${fadeKt}" ` +
        `dur="${loopDur}s" begin="${loopBegin}s" repeatCount="indefinite" calcMode="linear"/>` +
        `</rect>`
    );
    parts.push(
      `<rect x="${barX.toFixed(2)}" y="${barY.toFixed(2)}" width="0" height="${PROGRESS_H}" ` +
        `rx="${rx}" fill="#c4b5fd" opacity="0">` +
        `<animate attributeName="width" values="0;0;${barW.toFixed(2)}" keyTimes="${widthKt}" ` +
        `dur="${loopDur}s" begin="${loopBegin}s" repeatCount="indefinite" calcMode="linear"/>` +
        `<animate attributeName="opacity" values="1;1;1;0" keyTimes="${fadeKt}" ` +
        `dur="${loopDur}s" begin="${loopBegin}s" repeatCount="indefinite" calcMode="linear"/>` +
        `</rect>`
    );
    parts.push(`</g>`);
  }

  function buildCombinedSvg(animated) {
    const parts = [];
    const { xml: defs, sheenId, glowId } = defsBlock(animated, '');
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" overflow="visible" role="img" aria-label="My Courses">`
    );
    parts.push(defs);
    data.cards.forEach((card, i) => {
      appendCard(parts, card, i, { animated, wrapLink: true, sheenId, glowId, idSuffix: '' });
    });
    if (animated) appendProgressAt(parts, cardsBottom + PROGRESS_GAP);
    parts.push(`</svg>`);
    return parts.join('\n');
  }

  function buildCardSvg(card, i, animated) {
    const ox = CARD_PAD_X - card.box.x;
    const oy = GAP_Y - card.box.y;
    const local = offsetCard(card, ox, oy);
    const cardW = card.box.w + CARD_PAD_X * 2;
    const cardH = card.box.h + GAP_Y + CARD_PAD_BOTTOM;
    const suffix = `-c${i}`;
    const { xml: defs, sheenId, glowId } = defsBlock(animated, suffix);
    const parts = [];
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${cardW}" height="${cardH}" viewBox="0 0 ${cardW} ${cardH}" fill="none" overflow="visible" role="img" aria-label="${esc(cardSlug(card, i))}">`
    );
    parts.push(defs);
    // No inner <a> — README wraps each img so the course URL stays clickable
    appendCard(parts, local, i, {
      animated,
      wrapLink: false,
      sheenId,
      glowId,
      idSuffix: suffix,
    });
    parts.push(`</svg>`);
    return { svg: parts.join('\n'), width: cardW, height: cardH, slug: cardSlug(card, i), href: card.href };
  }

  function buildProgressSvg(animated) {
    const progH = PROGRESS_TOP + PROGRESS_H + PROGRESS_SVG_BOTTOM;
    const parts = [];
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${progH}" viewBox="0 0 ${W} ${progH}" fill="none" overflow="visible" role="img" aria-label="Courses cycle progress">`
    );
    if (animated) appendProgressAt(parts, PROGRESS_TOP);
    parts.push(`</svg>`);
    return { svg: parts.join('\n'), width: W, height: progH };
  }

  const staticSvg = buildCombinedSvg(false);
  const animatedSvg = buildCombinedSvg(true);
  const svgPath = path.join(OUT_COMPARE, 'courses-shelf.svg');
  const staticPath = path.join(OUT_COMPARE, 'courses-shelf-static.svg');
  fs.writeFileSync(staticPath, staticSvg);
  fs.writeFileSync(svgPath, animatedSvg);
  // Combined shelf stays in compare/ only — README uses split card SVGs.

  const cardMeta = [];
  for (let i = 0; i < data.cards.length; i++) {
    const built = buildCardSvg(data.cards[i], i, true);
    const name = `courses-card-${built.slug}.svg`;
    fs.writeFileSync(path.join(OUT_COMPARE, name), built.svg);
    fs.writeFileSync(path.join(OUT_ASSETS, name), built.svg);
    cardMeta.push({
      file: name,
      slug: built.slug,
      href: built.href,
      width: built.width,
      height: built.height,
      appearBegin: T.start + i * T.gap,
      rimIndex: i,
    });
  }

  const progressBuilt = buildProgressSvg(true);
  fs.writeFileSync(path.join(OUT_COMPARE, 'courses-progress.svg'), progressBuilt.svg);
  fs.writeFileSync(path.join(OUT_ASSETS, 'courses-progress.svg'), progressBuilt.svg);

  const manifest = {
    appearEnd,
    cometCycle,
    sheenDur: S.sheenDur,
    leadTime: S.leadTime,
    rimLap: S.rimLap,
    cometPause: S.cometPause,
    lastCometEnd,
    shelf: { width: W, height: H },
    progress: {
      file: 'courses-progress.svg',
      width: progressBuilt.width,
      height: progressBuilt.height,
    },
    cards: cardMeta,
    syncNote:
      'All split SVGs share the same absolute SMIL clock (appearBegin / appearEnd / cometCycle). Load them together so timelines stay locked.',
  };
  fs.writeFileSync(path.join(OUT_COMPARE, 'courses-split-manifest.json'), JSON.stringify(manifest, null, 2));
  // Manifest is local tooling only — not shipped under assets/

  console.log(
    `Courses SVG ${W.toFixed(1)}×${H.toFixed(1)} · static ${(staticSvg.length / 1024).toFixed(0)}KB · animated ${(animatedSvg.length / 1024).toFixed(0)}KB · cards ${data.cards.length} · appear ~${appearEnd.toFixed(2)}s · loop ${cometCycle.toFixed(2)}s · sheenDur ${S.sheenDur.toFixed(2)}s`
  );
  console.log(
    `Split: ${cardMeta.map((c) => c.file).join(', ')} + courses-progress.svg (shared clock appearEnd=${appearEnd.toFixed(3)}s cycle=${cometCycle.toFixed(3)}s)`
  );

  await diff(pngPath, staticPath, W, H);
}

async function diff(pngPath, svgPath, w, h) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: Math.ceil(w) + 40, height: Math.ceil(h) + 40 },
    deviceScaleFactor: DSF,
  });
  const inline = fs.readFileSync(svgPath, 'utf8').replace(/^<\?xml[^>]*>\s*/, '');
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">${inline}</body></html>`
  );
  await page.waitForTimeout(120);
  const out = path.join(OUT_COMPARE, 'courses-shelf-svg-raster.png');
  await page.locator('svg').first().screenshot({
    path: out,
    type: 'png',
    omitBackground: true,
  });
  await browser.close();

  const r = spawnSync('python3', ['-'], {
    encoding: 'utf-8',
    input: `
from PIL import Image
import numpy as np
ref = Image.open(${JSON.stringify(pngPath)}).convert('RGBA')
svg = Image.open(${JSON.stringify(out)}).convert('RGBA')
print('ref', ref.size, 'svg', svg.size)
tw, th = max(ref.size[0], svg.size[0]), max(ref.size[1], svg.size[1])
def pad(im):
    if im.size==(tw,th): return im
    c=Image.new('RGBA',(tw,th),(0,0,0,0)); c.paste(im,(0,0)); return c
ref, svg = pad(ref), pad(svg)
a=np.asarray(ref).astype('int16'); b=np.asarray(svg).astype('int16')
mask=a[:,:,3]>10
diff=np.abs(a[:,:,:3]-b[:,:,:3]).mean(axis=2)
mad=float(diff[mask].mean()) if mask.any() else 0
p95=float(np.percentile(diff[mask],95)) if mask.any() else 0
close=((diff<12)&mask).sum()/max(mask.sum(),1)
close2=((diff<20)&mask).sum()/max(mask.sum(),1)
print(f'mean_abs_diff={mad:.3f} p95={p95:.2f} match@12={100*close:.2f}% match@20={100*close2:.2f}%')
Image.blend(ref.convert('RGB'), svg.convert('RGB'), 0.5).save(${JSON.stringify(path.join(OUT_COMPARE, 'courses-shelf-overlay.png'))})
`,
  });
  console.log(r.stdout || '');
  if (r.stderr) console.error(r.stderr);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

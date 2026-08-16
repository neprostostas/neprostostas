/**
 * Fully native Finder SVG (no PNG detail/seal wrappers).
 *
 * - Chrome: SVG shapes
 * - Text: SF Pro glyph outlines at DOM positions
 * - Path-bar icons: inlined SVG
 * - Toolbar/sidebar icons: baked PNGs with contain (no stretch)
 * - Emoji: high-DPI bake placed in the measured glyph box (no squash)
 *
 * Target: ~99% visual match to playground PNG.
 * Usage: node build-finder-svg.mjs
 */
import { chromium } from 'playwright';
import opentype from 'opentype.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_COMPARE = path.join(__dirname, 'compare');
const OUT_ASSETS = path.join(__dirname, '../assets/finder');
const ICONS_DIR = path.join(OUT_ASSETS, 'icons');
const FONT_DIR = '/Library/Fonts';
const DSF = 3;

const WEIGHT_FILES = {
  text: {
    400: ['SF-Pro-Text-Regular.otf', 'SF-Pro-Text-RegularItalic.otf'],
    500: ['SF-Pro-Text-Medium.otf', 'SF-Pro-Text-MediumItalic.otf'],
    600: ['SF-Pro-Text-Semibold.otf', 'SF-Pro-Text-SemiboldItalic.otf'],
    700: ['SF-Pro-Text-Bold.otf', 'SF-Pro-Text-BoldItalic.otf'],
    800: ['SF-Pro-Text-Heavy.otf', 'SF-Pro-Text-HeavyItalic.otf'],
    900: ['SF-Pro-Text-Black.otf', 'SF-Pro-Text-BlackItalic.otf'],
  },
  display: {
    400: ['SF-Pro-Display-Regular.otf', 'SF-Pro-Display-RegularItalic.otf'],
    500: ['SF-Pro-Display-Medium.otf', 'SF-Pro-Display-MediumItalic.otf'],
    600: ['SF-Pro-Display-Semibold.otf', 'SF-Pro-Display-SemiboldItalic.otf'],
    700: ['SF-Pro-Display-Bold.otf', 'SF-Pro-Display-BoldItalic.otf'],
    800: ['SF-Pro-Display-Heavy.otf', 'SF-Pro-Display-HeavyItalic.otf'],
    900: ['SF-Pro-Display-Black.otf', 'SF-Pro-Display-BlackItalic.otf'],
  },
};

const fontCache = new Map();

function nearestWeight(w) {
  const keys = [400, 500, 600, 700, 800, 900];
  return keys.reduce((b, k) => (Math.abs(k - w) < Math.abs(b - w) ? k : b), 400);
}

function loadFont(weight, italic, fontSize = 14) {
  const family = fontSize >= 20 ? 'display' : 'text';
  const w = nearestWeight(weight || 400);
  const [reg, ital] = WEIGHT_FILES[family][w];
  const full = path.join(FONT_DIR, italic ? ital : reg);
  if (!fontCache.has(full)) {
    fontCache.set(full, opentype.parse(fs.readFileSync(full).buffer));
  }
  return fontCache.get(full);
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

function isEmoji(ch) {
  const cp = ch.codePointAt(0);
  if (cp == null) return false;
  return (
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x2600 && cp <= 0x27bf) ||
    cp === 0x200d ||
    cp === 0xfe0f ||
    (cp >= 0x1f1e6 && cp <= 0x1f1ff)
  );
}

function inlinePathIcon(file, x, y, w, h) {
  const raw = fs.readFileSync(path.join(ICONS_DIR, file), 'utf8');
  const vb = raw.match(/viewBox="([^"]+)"/)?.[1] || '0 0 16 14';
  const inner = raw
    .replace(/<\?xml[^>]*>/, '')
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>/, '')
    .trim();
  const [, , vw, vh] = vb.split(/\s+/).map(Number);
  const s = Math.min(w / vw, h / vh);
  const dw = vw * s;
  const dh = vh * s;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  // Use <g> not nested <svg> (avoids multi-root screenshot issues)
  return `<g transform="translate(${dx} ${dy}) scale(${s})">${inner}</g>`;
}

async function main() {
  fs.mkdirSync(OUT_COMPARE, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1200, height: 1100 },
    deviceScaleFactor: DSF,
  });

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.addStyleTag({
    content: `
      .chrome { display: none !important; }
      html, body { background: transparent !important; }
      .readme { max-width: 1012px !important; margin: 0 !important; padding: 24px !important; }
      .finder { box-shadow: none !important; }
    `,
  });
  await page.waitForTimeout(250);

  // Lock integer layout size so PNG/SVG rasters share the same pixel grid
  await page.evaluate(() => {
    const f = document.querySelector('.finder');
    const r = f.getBoundingClientRect();
    f.style.boxSizing = 'border-box';
    f.style.width = `${Math.round(r.width)}px`;
    f.style.height = `${Math.round(r.height)}px`;
  });
  await page.waitForTimeout(50);

  const pngPath = path.join(OUT_COMPARE, 'about-me-window.png');
  await page.locator('.finder').screenshot({
    path: pngPath,
    type: 'png',
    omitBackground: true,
  });

  const data = await page.evaluate(async () => {
    const root = document.querySelector('.finder');
    const fr = root.getBoundingClientRect();
    const ox = fr.left;
    const oy = fr.top;
    const rel = (r) => ({
      x: r.left - ox,
      y: r.top - oy,
      w: r.width,
      h: r.height,
      right: r.right - ox,
      bottom: r.bottom - oy,
    });
    const cs = getComputedStyle(root);
    const inset = parseFloat(cs.getPropertyValue('--finder-inset')) || 9;
    const innerR = parseFloat(cs.getPropertyValue('--finder-inner-radius')) || 20;
    const outerR = parseFloat(cs.getPropertyValue('--finder-radius')) || 28;
    const sideW = document.querySelector('.finder__sidebar').getBoundingClientRect().width;

    function styleOf(el) {
      const s = getComputedStyle(el);
      let fill = s.color;
      let gradient = false;
      if (s.webkitTextFillColor === 'transparent' || s.webkitTextFillColor === 'rgba(0, 0, 0, 0)') {
        gradient = true;
        fill = '#ffffff';
      }
      return {
        fontSize: parseFloat(s.fontSize),
        fontWeight: parseInt(s.fontWeight, 10) || 400,
        italic: s.fontStyle === 'italic' || s.fontStyle === 'oblique',
        letterSpacing: s.letterSpacing,
        color: fill,
        gradient,
        font: s.font,
      };
    }

    function collectGlyphs(textNode, styleEl, anim, indexBase) {
      const text = textNode.textContent;
      if (!text) return [];
      const st = styleOf(styleEl);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = st.font;
      const out = [];
      const chars = [...text];
      let offset = 0;
      let logical = 0;
      for (const ch of chars) {
        const len = ch.length;
        if (ch === '\n') {
          offset += len;
          logical += len;
          continue;
        }
        const range = document.createRange();
        range.setStart(textNode, offset);
        range.setEnd(textNode, offset + len);
        const box = range.getBoundingClientRect();
        const charIndex = indexBase + logical;
        offset += len;
        logical += len;
        if ((box.width === 0 && box.height === 0) || ch === ' ') continue;

        const m = ctx.measureText(ch);
        const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent ?? st.fontSize * 0.8;
        const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent ?? st.fontSize * 0.2;
        const leading = Math.max(0, box.height - (ascent + descent));
        const baseline = box.top + leading / 2 + ascent - 0.3;

        out.push({
          ch,
          x: box.left - ox,
          y: baseline - oy,
          box: rel(box),
          style: { ...st },
          anim: anim || null,
          charIndex,
          underlined: !!(styleEl.closest && styleEl.closest('u')),
        });
      }
      return out;
    }

    function walk(sel, anim = null) {
      const el = root.querySelector(sel);
      if (!el) return [];
      const out = [];
      // Global logical index across the walked subtree (for typewriter timing, incl. spaces)
      let indexBase = 0;
      if (anim === 'bio') {
        // Index against full paragraph textContent so tags/underlines can sync
        indexBase = 0;
      }
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n;
      let running = 0;
      while ((n = w.nextNode())) {
        if (!n.parentElement) continue;
        const chunk = collectGlyphs(n, n.parentElement, anim, running);
        out.push(...chunk);
        running += n.textContent.length;
      }
      return out;
    }

    const images = [];
    for (const img of root.querySelectorAll('img')) {
      const r = img.getBoundingClientRect();
      if (r.width < 0.5 || r.height < 0.5) continue;
      const src = img.getAttribute('src') || '';
      const file = src.split('/').pop().split('?')[0];
      const isPathSvg = file.startsWith('path_') && file.endsWith('.svg');
      images.push({
        ...rel(r),
        file,
        isPathSvg,
        opacity: parseFloat(getComputedStyle(img).opacity) || 1,
        href: null,
      });
    }

    // Emoji bake — square canvas from fontSize, placed later into glyph box with meet
    async function bakeEmoji(emoji, fontSize) {
      const scale = 4;
      const size = Math.ceil(fontSize * scale);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      ctx.font = `${size * 0.82}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, size / 2, size / 2 + size * 0.02);
      return canvas.toDataURL('image/png');
    }

    const active = root.querySelector('.finder__item.is-active');
    return {
      width: fr.width,
      height: fr.height,
      inset,
      innerR,
      outerR,
      sideW,
      colors: {
        main: cs.getPropertyValue('--finder-main').trim() || '#272725',
        side: cs.getPropertyValue('--finder-side').trim() || '#1e1e1c',
        border: 'rgba(255,255,255,0.2)',
      },
      active: active ? rel(active.getBoundingClientRect()) : null,
      pills: [...root.querySelectorAll('.finder__pill')].map((el) => {
        const r = rel(el.getBoundingClientRect());
        return { ...r, radius: parseFloat(getComputedStyle(el).borderRadius) || 999 };
      }),
      toolOn: [...root.querySelectorAll('.finder__tool.is-on')].map((el) =>
        rel(el.getBoundingClientRect())
      ),
      dividers: [...root.querySelectorAll('.finder__divider')].map((el) =>
        rel(el.getBoundingClientRect())
      ),
      lights: [...root.querySelectorAll('.tl')].map((el) => {
        const r = rel(el.getBoundingClientRect());
        return { ...r, color: getComputedStyle(el).backgroundColor };
      }),
      tags: [...root.querySelectorAll('.finder__tag')].map((el) => {
        const p = root.querySelector('.finder__body > p');
        const full = p ? p.textContent : '';
        const label = el.textContent || '';
        const charIndex = full.indexOf(label);
        return {
          ...rel(el.getBoundingClientRect()),
          radius: 5,
          charIndex: charIndex >= 0 ? charIndex : 0,
        };
      }),
      underlines: [...root.querySelectorAll('.finder__body u')].flatMap((el) => {
        const p = root.querySelector('.finder__body > p');
        const full = p ? p.textContent : '';
        const label = el.textContent || '';
        const charIndex = full.indexOf(label);
        const range = document.createRange();
        range.selectNodeContents(el);
        return [...range.getClientRects()].map((box) => ({
          x: box.left - ox,
          y: box.bottom - oy - 1.5,
          w: box.width,
          h: 1.5,
          color: 'rgba(167, 139, 250, 0.75)',
          charIndex: charIndex >= 0 ? charIndex : 0,
        }));
      }),
      introR: rel(root.querySelector('.finder__intro').getBoundingClientRect()),
      pathR: rel(root.querySelector('.finder__path').getBoundingClientRect()),
      bioLen: (root.querySelector('.finder__body > p')?.textContent || '').length,
      glyphs: [
        ...walk('.finder__nav', null),
        ...walk('.finder__title', null),
        ...walk('.finder__years', 'years'),
        ...walk('.finder__years-label', 'yearsLabel'),
        ...walk('.finder__role', 'role'),
        ...walk('.finder__body > p', 'bio'),
        ...walk('.finder__path', null),
      ],
      images,
      emojiHref: await bakeEmoji('👋', 14.5),
    };
  });

  // Raster icons: element screenshots (exact compositor + filters, correct proportions)
  const imgLocators = page.locator('.finder img');
  const imgCount = await imgLocators.count();
  for (let i = 0; i < imgCount; i++) {
    const meta = data.images[i];
    if (!meta || meta.isPathSvg) continue;
    const shot = await imgLocators.nth(i).screenshot({
      type: 'png',
      omitBackground: true,
    });
    meta.href = `data:image/png;base64,${shot.toString('base64')}`;
  }

  await browser.close();

  const W = data.width;
  const H = data.height;

  /** Timings (seconds). Window reveal mirrors cs2.Club `.button-area` / `@keyframes reveal-cta`. */
  const T = {
    revealDur: 0.85,
    introAt: 1.0,
    introDur: 0.55,
    bioStart: 1.7,
    charDt: 0.026,
    caretBlink: 1.05,
  };
  const bioLen = Math.max(data.bioLen || 1, 1);
  const typeDur = bioLen * T.charDt;
  const typeEnd = T.bioStart + typeDur;
  const revealEase = '0.22 0.61 0.36 1';
  // two segments for keyTimes 0 → 0.68 → 1
  const revealSplines = `${revealEase};${revealEase}`;

  function freezeIn(appearAt, dur = 0.04) {
    return (
      `<animate attributeName="opacity" from="0" to="1" begin="${appearAt.toFixed(3)}s" ` +
      `dur="${dur.toFixed(3)}s" fill="freeze" calcMode="linear"/>`
    );
  }

  function appearIntroAnim() {
    return (
      `<animate attributeName="opacity" from="0" to="1" begin="${T.introAt}s" dur="${T.introDur}s" fill="freeze"/>` +
      `<animateTransform attributeName="transform" type="translate" from="0 10" to="0 0" ` +
      `begin="${T.introAt}s" dur="${T.introDur}s" fill="freeze" calcMode="spline" keySplines="${revealEase}"/>`
    );
  }

  function typeAnim(charIndex) {
    return freezeIn(T.bioStart + charIndex * T.charDt, 0.03);
  }

  function buildSvg(animated) {
    const parts = [];
    parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"${animated ? ' overflow="hidden"' : ''} role="img" aria-label="About Me">`
    );
    parts.push(`<defs>`);
    parts.push(
      `<linearGradient id="yearsGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="10%" stop-color="#ffffff"/><stop offset="45%" stop-color="#d4c4ff"/><stop offset="100%" stop-color="#a78bfa"/></linearGradient>`
    );
    parts.push(
      `<linearGradient id="tagGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(167,139,250,0.22)"/><stop offset="100%" stop-color="rgba(124,92,220,0.14)"/></linearGradient>`
    );
    parts.push(
      `<clipPath id="win"><path d="${roundedRectPath(0, 0, W, H, data.outerR)}"/></clipPath>`
    );
    if (animated) {
      parts.push(`<clipPath id="frame"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath>`);
      parts.push(
        `<filter id="winRevealBlur" x="-20%" y="-30%" width="140%" height="160%" color-interpolation-filters="sRGB">` +
          `<feGaussianBlur in="SourceGraphic" stdDeviation="5">` +
          `<animate attributeName="stdDeviation" values="5;0;0" keyTimes="0;0.68;1" begin="0s" dur="${T.revealDur}s" fill="freeze" ` +
          `calcMode="spline" keySplines="${revealSplines}"/>` +
          `</feGaussianBlur></filter>`
      );
    }
    parts.push(`</defs>`);

    // reveal-cta motion + dialog blur; stay inside artboard (frame clip, no upward overshoot, scale ≤ 1)
    if (animated) {
      const cx = (W / 2).toFixed(3);
      const cy = (H / 2).toFixed(3);
      const ncx = (-W / 2).toFixed(3);
      const ncy = (-H / 2).toFixed(3);
      // Keep translate within the inset created by scale 0.86 (~7% margin)
      const y0 = Math.min(14, H * 0.05).toFixed(2);
      parts.push(`<g clip-path="url(#frame)">`);
      parts.push(`<g opacity="0" filter="url(#winRevealBlur)">`);
      parts.push(
        `<animate attributeName="opacity" values="0;1;1" keyTimes="0;0.68;1" begin="0s" dur="${T.revealDur}s" fill="freeze" ` +
          `calcMode="spline" keySplines="${revealSplines}"/>`
      );
      parts.push(`<g>`);
      parts.push(
        `<animateTransform attributeName="transform" type="translate" ` +
          `values="0 ${y0};0 0;0 0" keyTimes="0;0.68;1" begin="0s" dur="${T.revealDur}s" fill="freeze" ` +
          `calcMode="spline" keySplines="${revealSplines}"/>`
      );
      parts.push(`<g transform="translate(${cx} ${cy})">`);
      parts.push(`<g>`);
      parts.push(
        `<animateTransform attributeName="transform" type="scale" ` +
          `values="0.86;1;1" keyTimes="0;0.68;1" begin="0s" dur="${T.revealDur}s" fill="freeze" ` +
          `calcMode="spline" keySplines="${revealSplines}"/>`
      );
      parts.push(`<g transform="translate(${ncx} ${ncy})">`);
    }

    parts.push(`<g clip-path="url(#win)">`);

    // --- Vector chrome ---
    parts.push(
      `<path d="${roundedRectPath(0, 0, W, H, data.outerR)}" fill="${data.colors.main}"/>`
    );
    parts.push(
      `<path d="${roundedRectPath(0.5, 0.5, W - 1, H - 1, data.outerR - 0.5)}" fill="none" stroke="${data.colors.border}" stroke-width="1"/>`
    );
    const sx = data.inset;
    const sy = data.inset;
    const sw = data.sideW - data.inset;
    const sh = H - data.inset * 2;
    parts.push(
      `<path d="${roundedRectPath(sx, sy, sw, sh, data.innerR)}" fill="${data.colors.side}"/>`
    );
    parts.push(
      `<path d="${roundedRectPath(sx + 0.25, sy + 0.25, sw - 0.5, sh - 0.5, data.innerR - 0.25)}" fill="none" stroke="${data.colors.border}" stroke-width="0.5"/>`
    );

    if (data.active) {
      const a = data.active;
      parts.push(
        `<rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" rx="6" ry="6" fill="rgba(255,255,255,0.12)"/>`
      );
    }
    for (const p of data.pills) {
      const rr = Math.min(p.h / 2, p.radius);
      parts.push(
        `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${rr}" ry="${rr}" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.14)" stroke-width="0.5"/>`
      );
    }
    for (const t of data.toolOn) {
      parts.push(
        `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="${t.h / 2}" ry="${t.h / 2}" fill="rgba(255,255,255,0.14)"/>`
      );
    }
    for (const d of data.dividers) {
      parts.push(
        `<rect x="${d.x}" y="${d.y}" width="${Math.max(d.w, 1)}" height="${d.h}" fill="rgba(255,255,255,0.14)"/>`
      );
    }
    for (const L of data.lights) {
      parts.push(
        `<circle cx="${L.x + L.w / 2}" cy="${L.y + L.h / 2}" r="${L.w / 2}" fill="${L.color}"/>`
      );
    }

    const intro = data.introR;
    parts.push(
      `<line x1="${intro.x}" y1="${intro.bottom - 0.25}" x2="${intro.x + intro.w}" y2="${intro.bottom - 0.25}" stroke="rgba(255,255,255,0.1)" stroke-width="0.5"/>`
    );
    const pr = data.pathR;
    parts.push(
      `<line x1="${pr.x}" y1="${pr.y + 0.5}" x2="${pr.x + pr.w}" y2="${pr.y + 0.5}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`
    );

    for (const t of data.tags) {
      let open = `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="5" ry="5" fill="url(#tagGrad)" stroke="rgba(196,181,253,0.28)" stroke-width="0.5"`;
      if (animated) {
        open += ` opacity="0"`;
        parts.push(`${open}>${typeAnim(t.charIndex || 0)}</rect>`);
      } else {
        parts.push(`${open}/>`);
      }
    }
    // Static export keeps full underline rects. Animated: per-glyph strokes with letters (below).
    if (!animated) {
      for (const u of data.underlines) {
        parts.push(
          `<rect x="${u.x}" y="${u.y}" width="${u.w}" height="${u.h}" fill="${u.color}"/>`
        );
      }
    }

    // --- Icons (path SVG inlined; others contained bakes) ---
    for (const img of data.images) {
      if (img.isPathSvg) {
        parts.push(inlinePathIcon(img.file, img.x, img.y, img.w, img.h));
        continue;
      }
      if (!img.href) continue;
      const op = img.opacity < 1 ? ` opacity="${img.opacity}"` : '';
      parts.push(
        `<image x="${img.x}" y="${img.y}" width="${img.w}" height="${img.h}" preserveAspectRatio="none" href="${img.href}"${op}/>`
      );
    }

    // --- Text outlines + emoji ---
    const introGlyphs = [];

    function emitUnderlineForGlyph(g, next) {
      if (!g.underlined || !g.box) return '';
      const x = g.box.x;
      const y = g.box.y + g.box.h - 1.5;
      let w = Math.max(g.box.w, 0.8);
      // Keep one continuous stroke across spaces between underlined words
      if (
        next &&
        next.underlined &&
        next.box &&
        Math.abs((next.box.y || 0) - (g.box.y || 0)) < 4
      ) {
        w = Math.max(w, next.box.x - g.box.x);
      }
      return (
        `<rect x="${x}" y="${y}" width="${w}" height="1.5" fill="rgba(167, 139, 250, 0.75)" opacity="0">` +
        `${typeAnim(g.charIndex || 0)}</rect>`
      );
    }

    function emitGlyphNode(g, forceAnim) {
      const st = g.style;
      const ch = g.ch;
      const bits = [];

      if (isEmoji(ch) || ch === '👋') {
        const bx = g.box.x;
        const by = g.box.y;
        const bw = Math.max(g.box.w, 1);
        const bh = Math.max(g.box.h, 1);
        const side = Math.min(bw, bh) * 1.05;
        const ex = bx + (bw - side) / 2;
        const ey = by + (bh - side) / 2;
        if (!data.emojiHref) return '';
        if (forceAnim === 'bio' || (animated && g.anim === 'bio')) {
          bits.push(
            `<image x="${ex}" y="${ey}" width="${side}" height="${side}" preserveAspectRatio="xMidYMid meet" href="${data.emojiHref}" opacity="0">` +
              `${typeAnim(g.charIndex || 0)}</image>`
          );
        } else {
          bits.push(
            `<image x="${ex}" y="${ey}" width="${side}" height="${side}" preserveAspectRatio="xMidYMid meet" href="${data.emojiHref}"/>`
          );
        }
        return bits.join('');
      }

      const font = loadFont(st.fontWeight, st.italic, st.fontSize);
      const glyph = font.charToGlyph(ch);
      if (!glyph || glyph.name === '.notdef') return '';
      const p = glyph.getPath(g.x, g.y, st.fontSize);
      const d = p.toPathData(3);
      if (!d) return '';
      const fill = st.gradient ? 'url(#yearsGrad)' : esc(st.color);

      if (forceAnim === 'bio' || (animated && g.anim === 'bio')) {
        bits.push(`<path d="${d}" fill="${fill}" opacity="0">${typeAnim(g.charIndex || 0)}</path>`);
      } else {
        bits.push(`<path d="${d}" fill="${fill}"/>`);
      }
      return bits.join('');
    }

    for (const g of data.glyphs) {
      if (animated && (g.anim === 'years' || g.anim === 'yearsLabel' || g.anim === 'role')) {
        introGlyphs.push(emitGlyphNode(g, null));
        continue;
      }
      const node = emitGlyphNode(g, animated && g.anim === 'bio' ? 'bio' : null);
      if (node) parts.push(node);
    }

    // Per-letter underlines, bridging gaps between consecutive underlined glyphs on one line
    if (animated) {
      const bioGlyphsForUl = data.glyphs.filter((g) => g.anim === 'bio');
      for (let i = 0; i < bioGlyphsForUl.length; i++) {
        const ul = emitUnderlineForGlyph(bioGlyphsForUl[i], bioGlyphsForUl[i + 1]);
        if (ul) parts.push(ul);
      }
    }

    if (animated) {
      const nodes = introGlyphs.filter(Boolean);
      if (nodes.length) {
        parts.push(`<g opacity="0" transform="translate(0,10)">`);
        parts.push(appearIntroAnim());
        parts.push(...nodes);
        parts.push(`</g>`);
      }

      // Caret follows typing, then blinks forever at the end
      const bioGlyphs = data.glyphs.filter((g) => g.anim === 'bio');
      if (bioGlyphs.length) {
        const xs = [];
        const ys = [];
        const hs = [];
        const kts = [];
        for (const g of bioGlyphs) {
          const local = ((g.charIndex || 0) * T.charDt) / typeDur;
          kts.push(Math.min(0.9999, Math.max(0, local)));
          xs.push(g.box.x + g.box.w + 1);
          ys.push(g.box.y);
          hs.push(Math.max(g.box.h, 10));
        }
        // Ensure strictly increasing keyTimes for SMIL
        for (let i = 1; i < kts.length; i++) {
          if (kts[i] <= kts[i - 1]) kts[i] = Math.min(0.9999, kts[i - 1] + 1e-5);
        }
        const last = bioGlyphs[bioGlyphs.length - 1];
        const xEnd = last.box.x + last.box.w + 1;
        const yEnd = last.box.y;
        const hEnd = Math.max(last.box.h, 10);
        parts.push(
          `<rect x="${xs[0]}" y="${ys[0]}" width="2" height="${hs[0]}" rx="1" fill="rgba(228,217,255,0.95)" opacity="0">` +
            `<animate attributeName="opacity" from="0" to="1" begin="${T.bioStart}s" dur="0.02s" fill="freeze"/>` +
            `<animate attributeName="x" values="${xs.join(';')}" keyTimes="${kts.join(';')}" ` +
            `dur="${typeDur.toFixed(3)}s" begin="${T.bioStart}s" fill="freeze" calcMode="discrete"/>` +
            `<animate attributeName="y" values="${ys.join(';')}" keyTimes="${kts.join(';')}" ` +
            `dur="${typeDur.toFixed(3)}s" begin="${T.bioStart}s" fill="freeze" calcMode="discrete"/>` +
            `<animate attributeName="height" values="${hs.join(';')}" keyTimes="${kts.join(';')}" ` +
            `dur="${typeDur.toFixed(3)}s" begin="${T.bioStart}s" fill="freeze" calcMode="discrete"/>` +
            // Snap to final glyph box, then infinite blink
            `<animate attributeName="x" to="${xEnd}" begin="${typeEnd.toFixed(3)}s" dur="0.01s" fill="freeze"/>` +
            `<animate attributeName="y" to="${yEnd}" begin="${typeEnd.toFixed(3)}s" dur="0.01s" fill="freeze"/>` +
            `<animate attributeName="height" to="${hEnd}" begin="${typeEnd.toFixed(3)}s" dur="0.01s" fill="freeze"/>` +
            `<animate attributeName="opacity" values="1;0;1" begin="${typeEnd.toFixed(3)}s" ` +
            `dur="${T.caretBlink}s" repeatCount="indefinite" calcMode="discrete"/>` +
            `</rect>`
        );
      }
    }

    parts.push(`</g>`); // clip-path win
    if (animated) {
      // close: origin-reset, scale, center, slideY, blur/opacity, frame clip
      parts.push(`</g></g></g></g></g></g>`);
    }
    parts.push(`</svg>`);
    return parts.join('\n');
  }

  const writeStatic = process.env.WRITE_STATIC !== '0';
  const staticSvg = buildSvg(false);
  const typedSvg = buildSvg(true);

  if (writeStatic) {
    fs.writeFileSync(path.join(OUT_COMPARE, 'about-me-window.svg'), staticSvg);
    fs.writeFileSync(path.join(OUT_ASSETS, 'about-me-window.svg'), staticSvg);
    fs.copyFileSync(pngPath, path.join(OUT_ASSETS, 'about-me-window.png'));
  }

  fs.writeFileSync(path.join(OUT_COMPARE, 'about-me-window-typed.svg'), typedSvg);
  fs.writeFileSync(path.join(OUT_ASSETS, 'about-me-window-typed.svg'), typedSvg);

  console.log(
    `Native SVG ${W.toFixed(1)}×${H.toFixed(1)} · static ${(staticSvg.length / 1024).toFixed(0)}KB · typed ${(typedSvg.length / 1024).toFixed(0)}KB · glyphs ${data.glyphs.length} · typeEnd ${typeEnd.toFixed(1)}s · wroteStatic=${writeStatic}`
  );

  if (writeStatic) {
    await diff(pngPath, path.join(OUT_COMPARE, 'about-me-window.svg'), W, H);
  }
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
  const out = path.join(OUT_COMPARE, 'svg-raster.png');
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
# rough "match %" : pixels with channel-mean diff < 12
close=((diff<12)&mask).sum()/max(mask.sum(),1)
close2=((diff<20)&mask).sum()/max(mask.sum(),1)
print(f'mean_abs_diff={mad:.3f} p95={p95:.2f} match@12={100*close:.2f}% match@20={100*close2:.2f}%')
Image.blend(ref.convert('RGB'), svg.convert('RGB'), 0.5).save(${JSON.stringify(path.join(OUT_COMPARE, 'overlay-blend.png'))})
for name, box in [('sidebar',(0,120,600,520)),('bio',(600,400,2800,760)),('toolbar',(600,0,2800,180)),('years',(600,150,1800,400))]:
    r=ref.crop(box); s=svg.crop(box)
    r=r.resize((r.width//2,r.height//2)); s=s.resize(r.size)
    both=Image.new('RGB',(r.width*2+8,r.height),(20,20,20))
    both.paste(r.convert('RGB'),(0,0)); both.paste(s.convert('RGB'),(r.width+8,0))
    both.save(${JSON.stringify(path.join(OUT_COMPARE, 'crop-'))} + name + '.png')
`,
  });
  console.log(r.stdout || '');
  if (r.stderr) console.error(r.stderr);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

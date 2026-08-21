/**
 * Build native macOS Notes SVGs for work experience notes.
 * Chrome as shapes; text as SVG <text>.
 *
 * Usage: node build-notes-svg.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  SNAKE,
  buildSnakeTimeline,
  cardSnakePath,
  cometFilter,
  cometLayersXml,
  renderConnectorSvg,
  renderStaticConnectorSvg,
  CARD_APPEAR_STEP,
  CARD_APPEAR_DUR,
} from './notes-snake.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_ASSETS = path.join(__dirname, '../assets/notes');
const OUT_COMPARE = path.join(__dirname, 'compare');
const PREVIEW = 'http://127.0.0.1:8765/';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hexToRgba(hex, a) {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function wrapText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

const APPEAR_EASE = `calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1"`;

const BLOCK_STEP = CARD_APPEAR_STEP;
const BLOCK_DUR = CARD_APPEAR_DUR;

function appearBlockStart(begin, W, H, dur = BLOCK_DUR) {
  const b = Number(begin).toFixed(3);
  const cx = (W / 2).toFixed(2);
  const cy = (H / 2).toFixed(2);
  return (
    `<g transform="translate(${cx} ${cy})"><g opacity="0">` +
    `<animate attributeName="opacity" from="0" to="1" begin="${b}s" dur="${dur}s" fill="freeze" ${APPEAR_EASE}/>` +
    `<animateTransform attributeName="transform" type="scale" from="0.86" to="1" begin="${b}s" dur="${dur}s" fill="freeze" ${APPEAR_EASE}/>` +
    `<g transform="translate(-${cx} -${cy})">`
  );
}

function appearFade(xml, begin, dur = 0.42) {
  const b = Number(begin).toFixed(3);
  return (
    `<g opacity="0">` +
    `<animate attributeName="opacity" from="0" to="1" begin="${b}s" dur="${dur}s" fill="freeze" ${APPEAR_EASE}/>` +
    xml +
    `</g>`
  );
}

function appearSlide(xml, begin, dx, dy, dur = 0.44) {
  const b = Number(begin).toFixed(3);
  return (
    `<g opacity="0">` +
    `<animate attributeName="opacity" from="0" to="1" begin="${b}s" dur="${dur}s" fill="freeze" ${APPEAR_EASE}/>` +
    `<animateTransform attributeName="transform" type="translate" from="${dx} ${dy}" to="0 0" begin="${b}s" dur="${dur}s" fill="freeze" ${APPEAR_EASE}/>` +
    xml +
    `</g>`
  );
}

function appearScale(xml, begin, cx, cy, from = '0.88', dur = 0.46) {
  const b = Number(begin).toFixed(3);
  const cxf = Number(cx).toFixed(2);
  const cyf = Number(cy).toFixed(2);
  const to = String(from).includes(' ') ? '1 1' : '1';
  return (
    `<g transform="translate(${cxf} ${cyf})">` +
    `<g opacity="0">` +
    `<animate attributeName="opacity" from="0" to="1" begin="${b}s" dur="${dur}s" fill="freeze" ${APPEAR_EASE}/>` +
    `<animateTransform attributeName="transform" type="scale" from="${from}" to="${to}" begin="${b}s" dur="${dur}s" fill="freeze" ${APPEAR_EASE}/>` +
    `<g transform="translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)})">${xml}</g>` +
    `</g></g>`
  );
}

function appearWipe(xml, begin, { id, x, y, w, h, dur = 0.52 }) {
  const b = Number(begin).toFixed(3);
  const pad = 8;
  const rx = (x - pad).toFixed(2);
  const ry = (y - 12).toFixed(2);
  const rh = (h + 18).toFixed(2);
  const tw = (w + pad * 2).toFixed(2);
  return (
    `<clipPath id="${esc(id)}"><rect x="${rx}" y="${ry}" width="0" height="${rh}">` +
    `<animate attributeName="width" from="0" to="${tw}" begin="${b}s" dur="${dur}s" fill="freeze" ${APPEAR_EASE}/>` +
    `</rect></clipPath>` +
    `<g clip-path="url(#${esc(id)})" opacity="0">` +
    `<animate attributeName="opacity" from="0" to="1" begin="${b}s" dur="0.16s" fill="freeze"/>` +
    xml +
    `</g>`
  );
}

function chipIdleAnims(accent, k, ni, cycle = 48) {
  const begin = (ni + 0.35 + k * 0.42).toFixed(3);
  const fill0 = hexToRgba(accent, 0.06);
  const fill1 = hexToRgba(accent, 0.22);
  const stroke0 = hexToRgba(accent, 0.28);
  const stroke1 = hexToRgba(accent, 0.72);
  const kt = `keyTimes="0;0.01;0.017;0.026;1" dur="${cycle}s" begin="${begin}s" repeatCount="indefinite"`;
  return (
    `<animate attributeName="fill" values="${fill0};${fill0};${fill1};${fill0};${fill0}" ${kt}/>` +
    `<animate attributeName="stroke" values="${stroke0};${stroke0};${stroke1};${stroke0};${stroke0}" ${kt}/>`
  );
}

function headSheenXml(b, ni, slug, accent, cycle = 48) {
  const gid = `headSheen-${esc(slug)}`;
  const cid = `headClip-${esc(slug)}`;
  const band = Math.max(96, b.w * 0.28);
  const travel = (b.w + band).toFixed(2);
  const begin = ni.toFixed(3);
  return (
    `<defs>` +
    `<linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="${accent}" stop-opacity="0"/>` +
    `<stop offset="0.5" stop-color="#c4b5fd" stop-opacity="0.38"/>` +
    `<stop offset="1" stop-color="${accent}" stop-opacity="0"/>` +
    `</linearGradient>` +
    `<clipPath id="${cid}"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10" ry="10"/></clipPath>` +
    `</defs>` +
    `<g clip-path="url(#${cid})" pointer-events="none">` +
    `<rect x="${(b.x - band).toFixed(2)}" y="${b.y}" width="${band.toFixed(2)}" height="${b.h}" fill="url(#${gid})" opacity="0">` +
    `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;0.004;0.012;0.048;0.056;1" dur="${cycle}s" begin="${begin}s" repeatCount="indefinite"/>` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;${travel} 0;${travel} 0;${travel} 0" keyTimes="0;0.004;0.056;0.057;1" dur="${cycle}s" begin="${begin}s" repeatCount="indefinite"/>` +
    `</rect></g>`
  );
}

function renderNote(L, snake, seg) {
  const { W, H, inset, innerR, outerR, sideW, colors: C, items, body, main } = L;
  const font = `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Helvetica, Arial, sans-serif`;
  const fontMono = `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  const parts = [];
  const glowId = `cometGlow-${esc(L.slug)}`;
  const blockBegin = (seg?.i ?? 0) * BLOCK_STEP;
  const t0 = blockBegin + BLOCK_DUR + 0.08;
  const ni = t0 + 2.5;

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" overflow="visible" role="img" aria-label="Notes - ${esc(L.label)}">`);
  parts.push(`<defs>
    <clipPath id="win"><rect width="${W}" height="${H}" rx="${outerR}" ry="${outerR}"/></clipPath>
    <clipPath id="main"><rect x="${main.x}" y="${main.y}" width="${main.w}" height="${main.h}" rx="${innerR}" ry="${innerR}"/></clipPath>
    ${cometFilter(glowId)}
  </defs>`);
  parts.push(appearBlockStart(blockBegin, W, H));
  parts.push(`<g clip-path="url(#win)">`);
  parts.push(`<rect width="${W}" height="${H}" fill="${C.window}"/>`);

  const sx = inset;
  const sy = inset;
  const gap = parseFloat(L.gap) || 8;
  const sw = sideW - inset - gap;
  const sh = H - inset * 2;
  parts.push(`<path d="M${sx + innerR},${sy} H${sx + sw - innerR} A${innerR},${innerR} 0 0 1 ${sx + sw},${sy + innerR} V${sy + sh - innerR} A${innerR},${innerR} 0 0 1 ${sx + sw - innerR},${sy + sh} H${sx + innerR} A${innerR},${innerR} 0 0 1 ${sx},${sy + sh - innerR} V${sy + innerR} A${innerR},${innerR} 0 0 1 ${sx + innerR},${sy} Z" fill="${C.side}"/>`);
  parts.push(`<path d="M${sx + innerR},${sy} H${sx + sw - innerR} A${innerR},${innerR} 0 0 1 ${sx + sw},${sy + innerR} V${sy + sh - innerR} A${innerR},${innerR} 0 0 1 ${sx + sw - innerR},${sy + sh} H${sx + innerR} A${innerR},${innerR} 0 0 1 ${sx},${sy + sh - innerR} V${sy + innerR} A${innerR},${innerR} 0 0 1 ${sx + innerR},${sy} Z" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="0.5"/>`);
  parts.push(`<rect x="${main.x}" y="${main.y}" width="${main.w}" height="${main.h}" rx="${innerR}" ry="${innerR}" fill="${C.main}"/>`);
  parts.push(`<rect x="${main.x}" y="${main.y}" width="${main.w}" height="${main.h}" rx="${innerR}" ry="${innerR}" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="0.5"/>`);

  for (const [i, c] of [['#ff5f57', 0], ['#febc2e', 20], ['#28c840', 40]]) {
    parts.push(`<circle cx="${inset + 20 + c}" cy="${inset + 17}" r="6" fill="${i}"/>`);
  }

  if (L.sideSkills?.list?.length) {
    L.sideSkills.list.forEach((skill, k) => {
      const b = skill.box;
      const label = skill.text || skill;
      if (b) {
        parts.push(
          appearScale(
            `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.h / 2}" fill="${hexToRgba(C.accent, 0.06)}" stroke="${hexToRgba(C.accent, 0.28)}" stroke-width="1">${chipIdleAnims(C.accent, k, ni)}</rect>` +
              `<text x="${b.x + b.w / 2}" y="${b.y + b.h * 0.72}" text-anchor="middle" font-family="${font}" font-size="10" font-weight="600" fill="${C.accent}">${esc(label)}</text>`,
            t0 + 0.1 + k * 0.045,
            b.x + b.w / 2,
            b.y + b.h / 2,
            '0.72',
            0.34
          )
        );
      }
    });
  }

  for (const it of items) {
    if (it.logo) {
      const logoPath = path.resolve(__dirname, it.logoSrc.replace(/^\.\//, ''));
      const logoHref = `data:image/svg+xml;base64,${fs.readFileSync(logoPath).toString('base64')}`;
      const lr = 12;
      const clipId = `logo-clip-${Math.round(it.logo.x)}-${Math.round(it.logo.y)}`;
      parts.push(`<defs><clipPath id="${clipId}"><rect x="${it.logo.x}" y="${it.logo.y}" width="${it.logo.w}" height="${it.logo.h}" rx="${lr}" ry="${lr}"/></clipPath></defs>`);
      parts.push(
        appearScale(
          `<rect x="${it.logo.x}" y="${it.logo.y}" width="${it.logo.w}" height="${it.logo.h}" rx="${lr}" ry="${lr}" fill="#fff"/>` +
            `<image x="${it.logo.x}" y="${it.logo.y}" width="${it.logo.w}" height="${it.logo.h}" preserveAspectRatio="xMidYMid meet" href="${logoHref}" clip-path="url(#${clipId})"/>`,
          t0,
          it.logo.x + it.logo.w / 2,
          it.logo.y + it.logo.h / 2,
          '0.92',
          0.5
        )
      );
    }
  }

  parts.push(`<g clip-path="url(#main)">`);

  if (L.head) {
    const b = L.head;
    parts.push(
      appearFade(
        `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10" ry="10" fill="${C.select}"/>`,
        t0 + 0.04,
        0.4
      )
    );
  }
  if (L.itemInfo?.title) {
    const t = L.itemInfo.title;
    parts.push(
      appearSlide(
        `<text x="${t.box.x}" y="${t.box.y + 13}" font-family="${font}" font-size="14" font-weight="650" fill="${C.text}">${esc(t.text)}</text>`,
        t0 + 0.08,
        -14,
        0,
        0.42
      )
    );
  }
  if (L.itemInfo?.date?.length && L.itemInfo.dateBox) {
    let dy = L.itemInfo.dateBox.y + 11;
    const dateXml = L.itemInfo.date
      .map((line) => {
        const xml = `<text x="${L.itemInfo.dateBox.x}" y="${dy}" font-family="${font}" font-size="11" fill="${hexToRgba(C.accent, 0.72)}">${esc(line)}</text>`;
        dy += 15;
        return xml;
      })
      .join('');
    parts.push(appearSlide(dateXml, t0 + 0.16, 12, 0, 0.38));
  }

  if (L.role?.name) {
    const n = L.role.name;
    const ox = n.box.x + n.box.w;
    const oy = n.box.y + n.box.h / 2;
    parts.push(
      appearScale(
        `<text x="${n.box.x}" y="${n.box.y + 12}" font-family="${font}" font-size="13" font-weight="600" fill="${C.text}">${esc(n.text)}</text>`,
        t0 + 0.2,
        ox,
        oy,
        '1.08 1',
        0.4
      )
    );
  }
  if (L.role?.meta) {
    const m = L.role.meta;
    parts.push(
      appearFade(
        `<text x="${m.box.x}" y="${m.box.y + 10}" font-family="${font}" font-size="11" fill="${C.muted}">${esc(m.text)}</text>`,
        t0 + 0.28,
        0.45
      )
    );
  }

  if (L.head) {
    parts.push(headSheenXml(L.head, ni, L.slug, C.accent));
  }

  const bx = body.x + 12;
  let by = L.role?.meta ? L.role.meta.box.y + L.role.meta.box.h + 22 : body.y + 18;

  L.bullets.forEach((bullet, bi) => {
    const lines = wrapText(bullet, 72);
    const xml =
      `<circle cx="${bx + 4}" cy="${by - 4}" r="2" fill="#c9d1d9"/>` +
      lines
        .map(
          (line, i) =>
            `<text x="${bx + 14}" y="${by + i * 19}" font-family="${fontMono}" font-size="12.5" fill="#c9d1d9">${esc(line)}</text>`
        )
        .join('');
    const bh = lines.length * 19;
    parts.push(
      appearWipe(xml, t0 + 0.34 + bi * 0.08, {
        id: `wipe-${bi}`,
        x: bx,
        y: by - 8,
        w: Math.max(120, (L.body?.w || main.w) - 28),
        h: bh,
        dur: 0.5,
      })
    );
    by += bh + 6;
  });

  parts.push(`</g></g>`);
  const or = Math.max(0, outerR - 0.5);
  parts.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="${or}" ry="${or}" fill="none" stroke="rgba(167, 139, 250, 0.55)" stroke-width="1"/>`);
  if (seg) {
    const pathD = cardSnakePath({ W, H, r: or, joinX: seg.joinX, move: true });
    parts.push(cometLayersXml(pathD, seg, snake, glowId));
  }
  parts.push(`</g></g></g></svg>`);
  return parts.join('\n');
}

async function main() {
  fs.mkdirSync(OUT_ASSETS, { recursive: true });
  fs.mkdirSync(OUT_COMPARE, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(PREVIEW, { waitUntil: 'networkidle' });
  await page.addStyleTag({
    content: `
      .notes-stack .notes,
      .notes-stack .notes-card,
      .notes-stack .notes * {
        animation: none !important;
        transition: none !important;
        opacity: 1 !important;
        filter: none !important;
        transform: none !important;
        clip-path: none !important;
      }
    `,
  });
  await page.waitForSelector('.notes');
  await page.waitForFunction(() => {
    const el = document.querySelector('.notes__item-date[data-start]');
    return !!(el && el.textContent.includes('·'));
  });

  const count = await page.locator('.notes').count();
  const layouts = [];
  for (let i = 0; i < count; i++) {
    const loc = page.locator('.notes').nth(i);
    const L = await loc.evaluate((root) => {
      const r = root.getBoundingClientRect();
      const q = (sel) => root.querySelector(sel);
      const rel = (el) => {
        const b = el.getBoundingClientRect();
        return { x: +(b.left - r.left).toFixed(2), y: +(b.top - r.top).toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) };
      };
      const cs = getComputedStyle(root);
      const title = q('.notes__item-title');
      return {
        slug: root.getAttribute('data-note') || 'note',
        label: title?.textContent.trim() || 'Notes',
        W: Math.round(r.width),
        H: Math.round(r.height),
        inset: parseFloat(cs.getPropertyValue('--notes-inset')) || 9,
        gap: parseFloat(cs.getPropertyValue('--notes-gap')) || 8,
        innerR: parseFloat(cs.getPropertyValue('--notes-inner-radius')) || 20,
        outerR: parseFloat(cs.getPropertyValue('--notes-radius')) || 28,
        sideW: q('.notes__sidebar').getBoundingClientRect().width,
        colors: {
          window: cs.getPropertyValue('--notes-window').trim() || '#2c2c2e',
          side: cs.getPropertyValue('--notes-side').trim() || '#1c1c1e',
          main: cs.getPropertyValue('--notes-main').trim() || '#1c1c1e',
          accent: cs.getPropertyValue('--notes-accent').trim() || '#a78bfa',
          select: cs.getPropertyValue('--notes-select').trim() || '#3a2860',
          text: cs.getPropertyValue('--notes-text').trim() || '#f5f5f7',
          muted: cs.getPropertyValue('--notes-muted').trim() || '#8e8e93',
        },
        items: [...root.querySelectorAll('.notes__item')].map((el) => {
          const logo = el.querySelector('.notes__item-logo');
          return {
            active: el.classList.contains('is-active'),
            logo: logo ? rel(logo) : null,
            logoSrc: logo?.getAttribute('src') || '',
            box: rel(el),
          };
        }),
        bullets: [...root.querySelectorAll('.notes__bullets li')].map((li) => li.textContent.trim()),
        sideSkills: (() => {
          const wrap = q('.notes__body-skills .notes__skills');
          if (!wrap) return null;
          return {
            list: [...wrap.querySelectorAll('span')].map((s) => ({
              text: s.textContent.trim(),
              box: rel(s),
            })),
            box: rel(wrap),
          };
        })(),
        body: rel(q('.notes__body')),
        main: rel(q('.notes__main')),
        head: (() => {
          const el = q('.notes__head');
          return el ? rel(el) : null;
        })(),
        role: (() => {
          const name = q('.notes__role-name');
          const meta = q('.notes__role-meta');
          if (!name) return null;
          return {
            name: { text: name.textContent.trim(), box: rel(name) },
            meta: meta ? { text: meta.textContent.trim(), box: rel(meta) } : null,
          };
        })(),
        itemInfo: (() => {
          const dateEl = q('.notes__item-date');
          if (!title) return null;
          const date = (() => {
            if (!dateEl) return [];
            const html = dateEl.innerHTML;
            if (/<br\s*\/?>/i.test(html)) {
              return html.split(/<br\s*\/?>/i).map((s) => s.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
            }
            const t = dateEl.textContent.trim();
            return t ? [t] : [];
          })();
          return {
            title: { text: title.textContent.trim(), box: rel(title) },
            date,
            dateBox: dateEl ? rel(dateEl) : null,
            box: rel(q('.notes__item-info')),
          };
        })(),
      };
    });

    await loc.screenshot({ path: path.join(OUT_COMPARE, `notes-${L.slug}.png`) });
    layouts.push(L);
  }

  const snake = buildSnakeTimeline(
    layouts.map((L) => ({ W: L.W, H: L.H, r: L.outerR, slug: L.slug })),
    SNAKE
  );
  const cardByI = new Map(snake.segs.filter((s) => s.type === 'card').map((s) => [s.i, s]));
  const connSegs = snake.segs.filter((s) => s.type === 'conn');

  for (let i = 0; i < layouts.length; i++) {
    const L = layouts[i];
    const svg = renderNote(L, snake, cardByI.get(i));
    const file = `note-${L.slug}.svg`;
    fs.writeFileSync(path.join(OUT_ASSETS, file), svg);
    fs.writeFileSync(path.join(OUT_COMPARE, file), svg);
    console.log('wrote', path.join(OUT_ASSETS, file), `(${L.W}×${L.H})`);
  }

  const staticConn = renderStaticConnectorSvg();
  fs.writeFileSync(path.join(OUT_ASSETS, 'notes-connector.svg'), staticConn);
  fs.writeFileSync(path.join(OUT_COMPARE, 'notes-connector.svg'), staticConn);

  for (const seg of connSegs) {
    const n = String(seg.i + 1).padStart(2, '0');
    const file = `notes-connector-${n}.svg`;
    const xml = renderConnectorSvg(seg, snake);
    fs.writeFileSync(path.join(OUT_ASSETS, file), xml);
    fs.writeFileSync(path.join(OUT_COMPARE, file), xml);
    console.log('wrote', path.join(OUT_ASSETS, file), `S=${seg.S.toFixed(0)} D=${seg.D}`);
  }

  console.log(
    `snake cycle ${snake.cycle}s · G=${snake.G} · ${snake.nMeteors} meteors · phases ${snake.phases.map((p) => p.toFixed(0)).join(',')}`
  );

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Work-notes meteors: one comet per card on a shared snake, oldest job → newest
 * (bottom card → up the existing connector stem → next card). Split SVGs share
 * one SMIL cycle. Playground uses the same split overlays as README <img>s.
 */
export const SNAKE = {
  artboardW: 980,
  joinAt: 105,
  connH: 24,
  connTipY: 2.5,
  cometLen: 460,
  speed: 360,
  /**
   * Courses hide the comet over ~11/100 of the rim (≈ one comet length) at the
   * handoff. Notes cards are larger, so the join feather is that same fraction
   * of this path (`leadFrac`) — not a 0.1s opacity blink.
   */
  leadFrac: 11 / 100,
  fade: 0.1,
  /** Start each meteor this far into its slot so they aren't all on the join. */
  slotPhase: 0.34,
  glowW: 2.7,
  coreW: 1.25,
  glowColor: '#8b5cf6',
  coreColor: '#e9e0ff',
};

export const CARD_APPEAR_STEP = 0.82;
export const CARD_APPEAR_DUR = 0.68;
const APPEAR_EASE = `calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1"`;

export function joinX(W, cfg = SNAKE) {
  return (cfg.joinAt / cfg.artboardW) * W;
}

export function cardSnakeLength(W, H, r, jx) {
  const w = W - 1;
  const h = H - 1;
  const rr = Math.min(Math.max(r, 0), w / 2, h / 2);
  const topLen = 0.5 + w - rr - jx;
  const side = Math.max(0, h - 2 * rr);
  return 2 * topLen + side + Math.PI * rr;
}

/** Bottom join → around the right → top join (up the timeline). */
export function cardSnakePath({ x = 0, y = 0, W, H, r, joinX: jx, move = true }) {
  const inset = 0.5;
  const w = W - 1;
  const h = H - 1;
  const rr = Math.min(Math.max(r, 0), w / 2, h / 2);
  const top = y + inset;
  const right = x + inset + w;
  const bottom = top + h;
  const px = x + jx;
  const a = rr.toFixed(2);
  const parts = [];
  if (move) parts.push(`M${px.toFixed(2)} ${bottom.toFixed(2)}`);
  parts.push(`H${(right - rr).toFixed(2)}`);
  parts.push(`A${a} ${a} 0 0 0 ${right.toFixed(2)} ${(bottom - rr).toFixed(2)}`);
  parts.push(`V${(top + rr).toFixed(2)}`);
  parts.push(`A${a} ${a} 0 0 0 ${(right - rr).toFixed(2)} ${top.toFixed(2)}`);
  parts.push(`H${px.toFixed(2)}`);
  return parts.join(' ');
}

export function connectorStemPath(jx = SNAKE.joinAt, H = SNAKE.connH, tipY = SNAKE.connTipY) {
  return `M${jx} ${H} V${tipY}`;
}

export function connectorStemLength(H = SNAKE.connH, tipY = SNAKE.connTipY) {
  return H - tipY;
}

export function formatTimes(times, { pinEnd = true } = {}) {
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

export function buildSnakeTimeline(cards, cfg = SNAKE) {
  const { cometLen: L, speed, connH, slotPhase } = cfg;
  const n = cards.length;
  const stem = connectorStemLength(connH, cfg.connTipY);
  const segs = [];
  let S = 0;
  for (let i = n - 1; i >= 0; i--) {
    const card = cards[i];
    const jx = joinX(card.W, cfg);
    const r = Math.max(0, (card.r ?? 28) - 0.5);
    const D = Number(cardSnakeLength(card.W, card.H, r, jx).toFixed(2));
    segs.push({
      type: 'card',
      i,
      S,
      D,
      joinX: jx,
      r,
      slug: card.slug,
      W: card.W,
      H: card.H,
    });
    S += D;
    if (i > 0) {
      segs.push({ type: 'conn', i: i - 1, S, D: stem });
      S += stem;
    }
  }
  const cardDs = segs.filter((s) => s.type === 'card').map((s) => s.D);
  const maxD = Math.max(...cardDs);
  const occupy = maxD + L + stem;
  const minG = n * occupy;
  S += Math.max(L + 48, minG - S);
  const G = Number(S.toFixed(2));
  const cycle = Number((G / speed).toFixed(3));
  const spacing = G / n;
  const phases = Array.from({ length: n }, (_, k) =>
    Number(((k + slotPhase) * spacing) % G)
  );
  return { segs, G, cycle, phases, nMeteors: n, cometLen: L, speed, cfg };
}

export function cometFilter(id) {
  return (
    `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%" color-interpolation-filters="sRGB">` +
    `<feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="b"/>` +
    `<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>` +
    `</filter>`
  );
}

/** Feather only a top or bottom join band; the rest of the card stays fully visible. */
export function joinFeatherMask(id, { W, H, joinX: jx, leadPx, edge }) {
  const x2 = jx + leadPx;
  const band = 32;
  const top = edge === 'top';
  return (
    `<linearGradient id="${id}-g" gradientUnits="userSpaceOnUse" x1="${jx.toFixed(2)}" y1="0" x2="${x2.toFixed(2)}" y2="0">` +
    `<stop offset="0" stop-color="#fff" stop-opacity="0"/>` +
    `<stop offset="0.22" stop-color="#fff" stop-opacity="0.2"/>` +
    `<stop offset="0.55" stop-color="#fff" stop-opacity="0.72"/>` +
    `<stop offset="1" stop-color="#fff" stop-opacity="1"/>` +
    `</linearGradient>` +
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">` +
    (top
      ? `<rect y="${band}" width="${W}" height="${Math.max(0, H - band)}" fill="#fff"/>` +
        `<rect width="${W}" height="${band}" fill="url(#${id}-g)"/>`
      : `<rect width="${W}" height="${Math.max(0, H - band)}" fill="#fff"/>` +
        `<rect y="${H - band}" width="${W}" height="${band}" fill="url(#${id}-g)"/>`) +
    `</mask>`
  );
}

function meteorKeyframes({ phase0, S, D, G, L, speed, cycle, leadFrac, fadeIn, fadeOut }) {
  const overlap = (D + L) / speed;
  const tEnter = ((S - phase0 + G) % G) / speed;
  const tEnd = tEnter + overlap;
  const win = overlap;
  const fIn = fadeIn
    ? Math.min(Math.max((leadFrac * D) / speed, (L / speed) * 0.85), win * 0.42)
    : 0.001;
  const fOut = fadeOut
    ? Math.min(Math.max(0.167 * (D / speed), (L / speed) * 0.85), win * 0.42)
    : 0.001;

  if (tEnd <= cycle + 1e-6) {
    const t0 = tEnter;
    const t1 = Math.min(tEnd, cycle);
    return {
      dashValues: `${L};${L};${-D};${-D}`,
      dashTimes: formatTimes([0, t0 / cycle, t1 / cycle, 1]),
      opValues: '0;0;1;1;0;0',
      opTimes: formatTimes([0, t0 / cycle, (t0 + fIn) / cycle, (t1 - fOut) / cycle, t1 / cycle, 1]),
    };
  }

  const tA = tEnd - cycle;
  const t0 = tEnter;
  const mid = Number((L - (cycle - t0) * speed).toFixed(2));
  return {
    dashValues: `${mid};${-D};${L};${mid}`,
    dashTimes: formatTimes([0, tA / cycle, t0 / cycle, 1]),
    opValues: '1;1;0;0;1;1',
    opTimes: formatTimes([0, tA / cycle, (tA + fOut) / cycle, t0 / cycle, (t0 + fIn) / cycle, 1]),
  };
}

function cometLayer(pathD, D, L, kf, cycle, cfg, glowId) {
  const gap = Number(Math.max(4000, D * 2 + L).toFixed(2));
  const dur = `${cycle.toFixed(3)}s`;
  const dashAnim =
    `<animate attributeName="stroke-dashoffset" values="${kf.dashValues}" keyTimes="${kf.dashTimes}" ` +
    `dur="${dur}" begin="0s" repeatCount="indefinite" calcMode="linear"/>`;
  const opAnim =
    `<animate attributeName="opacity" values="${kf.opValues}" keyTimes="${kf.opTimes}" ` +
    `dur="${dur}" begin="0s" repeatCount="indefinite" calcMode="linear"/>`;
  const common =
    `d="${pathD}" fill="none" stroke-linecap="round" pathLength="${D}" ` +
    `stroke-dasharray="${L} ${gap}" stroke-dashoffset="${L}" opacity="0" pointer-events="none"`;
  return (
    `<path ${common} stroke="${cfg.glowColor}" stroke-width="${cfg.glowW}" filter="url(#${glowId})">${dashAnim}${opAnim}</path>` +
    `<path ${common} stroke="${cfg.coreColor}" stroke-width="${cfg.coreW}">${dashAnim}${opAnim}</path>`
  );
}

export function cometLayersXml(pathD, seg, snake, glowId) {
  const { G, cycle, cometLen: L, speed, cfg, phases, nMeteors: n } = snake;
  const fadeIn = seg.type === 'card' && seg.i === n - 1;
  const fadeOut = seg.type === 'card' && seg.i === 0;
  const body = phases
    .map((phase0) => {
      const kf = meteorKeyframes({
        phase0,
        S: seg.S,
        D: seg.D,
        G,
        L,
        speed,
        cycle,
        leadFrac: cfg.leadFrac,
        fadeIn,
        fadeOut,
      });
      return cometLayer(pathD, seg.D, L, kf, cycle, cfg, glowId);
    })
    .join('');
  if (!fadeIn && !fadeOut) return body;
  const maskId = `${glowId}-feather`;
  const leadPx = Number(Math.min(L * (11 / 12), seg.W * 0.37).toFixed(2));
  const mask = joinFeatherMask(maskId, {
    W: seg.W,
    H: seg.H,
    joinX: seg.joinX,
    leadPx,
    edge: fadeIn ? 'bottom' : 'top',
  });
  return `<defs>${mask}</defs><g mask="url(#${maskId})">${body}</g>`;
}

export function connectorChrome(W = 980, H = 24, jx = 105) {
  const tipY = SNAKE.connTipY;
  return (
    `<path fill="#a78bfa" fill-opacity=".18" d="M${jx - 2.5} ${H} V10.20 A2.5 2.5 0 0 1 ${jx - 6.05} 6.76 L${jx - 2.05} 1.06 A2.5 2.5 0 0 1 ${jx + 2.05} 1.06 L${jx + 6.05} 6.76 A2.5 2.5 0 0 1 ${jx + 2.5} 10.20 V${H} Z"/>` +
    `<g stroke="#a78bfa" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" fill="none">` +
    `<line x1="${jx}" y1="${tipY}" x2="${jx}" y2="${H}"/>` +
    `<polyline points="${jx - 4},8.2 ${jx},${tipY} ${jx + 4},8.2"/>` +
    `</g>`
  );
}

export function renderStaticConnectorSvg() {
  const W = SNAKE.artboardW;
  const H = SNAKE.connH;
  const jx = SNAKE.joinAt;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" role="img" aria-label="Work timeline connector">` +
    connectorChrome(W, H, jx) +
    `</svg>\n`
  );
}

export function renderConnectorSvg(seg, snake) {
  const { cfg } = snake;
  const W = cfg.artboardW;
  const H = cfg.connH;
  const jx = cfg.joinAt;
  const glowId = `cometGlow-conn-${seg.i}`;
  const pathD = connectorStemPath(jx, H, cfg.connTipY);
  const connectorBegin = seg.i * CARD_APPEAR_STEP + CARD_APPEAR_DUR;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" overflow="visible" fill="none" role="img" aria-label="Work timeline connector">` +
    `<defs>${cometFilter(glowId)}</defs>` +
    `<g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${connectorBegin.toFixed(3)}s" dur="0.28s" fill="freeze" ${APPEAR_EASE}/>` +
    connectorChrome(W, H, jx) +
    cometLayersXml(pathD, seg, snake, glowId) +
    `</g></svg>\n`
  );
}

function ensureOverlay(parent, className) {
  let svg = parent.querySelector(`svg.${className}`);
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');
    parent.appendChild(svg);
  }
  return svg;
}

function notesCardHost(el) {
  if (el.parentElement?.classList.contains('notes-card')) return el.parentElement;
  const wrap = document.createElement('div');
  wrap.className = 'notes-card';
  wrap.dataset.note = el.getAttribute('data-note') || '';
  wrap.style.setProperty('--nb', getComputedStyle(el).getPropertyValue('--nb').trim() || '0s');
  el.parentElement.insertBefore(wrap, el);
  wrap.appendChild(el);
  return wrap;
}

function injectPlaygroundSnake() {
  const stack = document.querySelector('.notes-stack');
  if (!stack) return;
  const notes = [...stack.querySelectorAll('.notes')];
  if (!notes.length) return;

  const old = stack.querySelector('.notes-stack__snake');
  if (old) old.remove();

  const cfg = SNAKE;
  const cards = notes.map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      el,
      W: r.width,
      H: r.height,
      r: parseFloat(cs.getPropertyValue('--notes-radius')) || 28,
      slug: el.getAttribute('data-note') || '',
    };
  });

  const snake = buildSnakeTimeline(cards, cfg);
  const cardByI = new Map(snake.segs.filter((s) => s.type === 'card').map((s) => [s.i, s]));
  const connByI = new Map(snake.segs.filter((s) => s.type === 'conn').map((s) => [s.i, s]));

  notes.forEach((el, i) => {
    const seg = cardByI.get(i);
    if (!seg) return;
    const svg = ensureOverlay(notesCardHost(el), 'notes__comet');
    const pathD = cardSnakePath({
      W: seg.W,
      H: seg.H,
      r: seg.r,
      joinX: seg.joinX,
      move: true,
    });
    svg.setAttribute('viewBox', `0 0 ${seg.W} ${seg.H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.innerHTML = `<defs>${cometFilter(`pg-card-${i}`)}</defs>${cometLayersXml(pathD, seg, snake, `pg-card-${i}`)}`;
  });

  const wraps = [...stack.querySelectorAll('.notes-connector-wrap')];
  wraps.forEach((wrap, i) => {
    const seg = connByI.get(i);
    if (!seg) return;
    const svg = ensureOverlay(wrap, 'notes-connector__comet');
    const pathD = connectorStemPath(cfg.joinAt, cfg.connH, cfg.connTipY);
    svg.setAttribute('viewBox', `0 0 ${cfg.artboardW} ${cfg.connH}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.innerHTML =
      `<defs>${cometFilter(`pg-conn-${i}`)}</defs>` + cometLayersXml(pathD, seg, snake, `pg-conn-${i}`);
  });
}

function bootPlayground() {
  injectPlaygroundSnake();
  let t = 0;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(injectPlaygroundSnake, 120);
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootPlayground);
  } else {
    bootPlayground();
  }
}

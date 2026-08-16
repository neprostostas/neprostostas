/**
 * Build styled GitHub trophies SVG (My Stats palette).
 *
 * Text fields come from data (JSON or parsed stock trophy.svg) so
 * GitHub Actions can refresh titles / ranks / points without redesigning art.
 *
 * Cup count / laurel follow stock rank rules (SSS/AAA → 3, SS/AA → 2;
 * laurel for S and A ranks). Progress bar = next-rank % from stock.
 *
 * Usage:
 *   node build-trophies-svg.mjs
 *   node build-trophies-svg.mjs --from-stock /path/to/trophy.svg --out ../assets/trophies/trophies-shelf.svg
 *   node build-trophies-svg.mjs --data ./trophies-data.json --out ../assets/trophies/trophies-shelf.svg
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ui = {
  bgTop: '#15171c',
  bgBottom: '#090a0d',
  surface: '#1c1e24',
  border: '#343741',
  text: '#f5f5f7',
  muted: '#98989f',
  blue: '#0a84ff',
  purple: '#bf5af2',
  pink: '#ff375f',
  cyan: '#64d2ff',
  green: '#30d158',
  yellow: '#ffd60a',
  orange: '#ff9f0a',
  grey: '#5c5c62',
  ink: '#090a0d',
};

const CARD_W = 110;
const CARD_H = 138; // taller than stock 110 for top/bottom padding
const GAP = 8;
const RX = 4.5;
const BAR_MAX = 80;

/** Fallback seed (overwritten by Actions / --from-stock / --data) */
const DEFAULT_TROPHIES = [
  { id: 'multilanguage', title: 'MultiLanguage', subtitle: 'Rainbow Lang User', detail: '11 points', rank: 'SECRET', progress: 1, accent: ui.cyan, cups: 1, tone: 'rainbow', laurel: false },
  { id: 'joined2020', title: 'Joined 2020', subtitle: 'Everything started…', detail: 'Joined 2020', rank: 'SECRET', progress: 1, accent: ui.purple, cups: 1, tone: 'purple', laurel: false },
  { id: 'repositories', title: 'Repositories', subtitle: 'God Repo Creator', detail: '72 points', rank: 'SSS', progress: 1, accent: ui.blue, cups: 3, tone: 'warm', laurel: true },
  { id: 'stars', title: 'Stars', subtitle: 'Super Star', detail: '128 points', rank: 'AAA', progress: 0.28, accent: ui.yellow, cups: 3, tone: 'gold', laurel: true },
  { id: 'commits', title: 'Commits', subtitle: 'Hyper Committer', detail: '454 points', rank: 'AA', progress: 0.847, accent: ui.green, cups: 2, tone: 'green', laurel: true },
  { id: 'experience', title: 'Experience', subtitle: 'Experienced Dev', detail: '22 points', rank: 'AA', progress: 0.4, accent: ui.cyan, cups: 2, tone: 'cyan', laurel: true },
  { id: 'followers', title: 'Followers', subtitle: 'Dynamic User', detail: '27 points', rank: 'A', progress: 0.233, accent: ui.blue, cups: 1, tone: 'blue', laurel: true },
  { id: 'pullrequest', title: 'Pull Request', subtitle: 'Middle Puller', detail: '16 points', rank: 'B', progress: 0.6, accent: ui.pink, cups: 1, tone: 'pink', laurel: false },
  { id: 'issues', title: 'Issues', subtitle: 'Unknown', detail: '0 points', rank: '?', progress: 0, accent: ui.grey, cups: 1, tone: 'muted', laurel: false },
  { id: 'reviews', title: 'Reviews', subtitle: 'Unknown', detail: '0 points', rank: '?', progress: 0, accent: ui.grey, cups: 1, tone: 'muted', laurel: false },
];

/** Display labels (stock titles stay camelCase for progress lookup). */
function formatTitle(title) {
  if (/^Joined\d{4}$/.test(title)) return title.replace(/^Joined/, 'Joined ');
  if (title === 'PullRequest') return 'Pull Request';
  return title;
}

/** `128pt` → `128 points`; leave non-pt details (e.g. Joined 2020) alone. */
function formatDetail(detail) {
  return String(detail).replace(/^(\d+)\s*pt$/i, '$1 points');
}

const TONES = {
  rainbow: [ui.blue, ui.purple, ui.pink],
  purple: [ui.purple, '#d48cff', ui.pink],
  warm: [ui.blue, ui.purple, ui.pink],
  gold: [ui.yellow, ui.orange, ui.pink],
  green: [ui.green, ui.cyan, ui.blue],
  cyan: [ui.cyan, ui.blue, ui.purple],
  blue: [ui.blue, ui.cyan, '#5ac8ff'],
  pink: [ui.pink, ui.purple, ui.blue],
  muted: ['#6e6e73', '#5c5c62', '#48484a'],
};

/** Cup count from full rank (SSS/AAA → 3, SS/AA → 2, else 1). */
function cupsFromRank(rank) {
  const r = String(rank || '');
  if (/^S{1,3}$/.test(r) || /^A{1,3}$/.test(r)) return Math.min(3, r.length);
  return 1;
}

function hasLaurel(rank) {
  const r = String(rank || '');
  if (!r || r === 'SECRET' || r === '?' || r === 'B' || r === 'C') return false;
  return r[0] === 'S' || r[0] === 'A';
}

/** Letter drawn on the cup face. */
function rankLetter(rank) {
  const r = String(rank || '?');
  if (r === 'SECRET') return 'S';
  return r[0] || '?';
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function parseArgs(argv) {
  const out = { fromStock: null, data: null, out: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--from-stock') out.fromStock = argv[++i];
    else if (argv[i] === '--data') out.data = argv[++i];
    else if (argv[i] === '--out') out.out = argv[++i];
  }
  return out;
}

/** Next-rank bar % from stock CSS keyframes (width / 80). */
function parseStockProgress(svg) {
  const map = new Map();
  for (const m of svg.matchAll(/@keyframes (\w+)RankAnimation[\s\S]*?to\s*\{\s*width:\s*([0-9.]+)px/g)) {
    map.set(m[1], Math.min(1, Math.max(0, Number(m[2]) / BAR_MAX)));
  }
  return map;
}

/** Pull text/rank/progress from github-profile-trophy SVG. */
export function parseStockTrophySvg(svg) {
  const titles = [...svg.matchAll(/font-size="13"[^>]*>\s*([^<]+)/g)].map((m) => m[1].trim());
  const subtitles = [...svg.matchAll(/font-size="10\.5"[^>]*>\s*([^<]+)/g)].map((m) => m[1].trim());
  const details = [...svg.matchAll(/font-size="10"[^>]*>\s*([^<]+)/g)].map((m) => m[1].trim());
  const progressByTitle = parseStockProgress(svg);

  const cardChunks = svg.split(/<svg\s+x="\d+"\s+y="0"\s+width="110"/).slice(1);
  const ranks = cardChunks.map((chunk) => {
    const m = chunk.match(/<svg x="28" y="20" width="100"[^>]*fill="url\(#([^"]+)\)"/);
    return m ? m[1] : '?';
  });

  const accents = [
    ui.cyan, ui.purple, ui.blue, ui.yellow, ui.green,
    ui.cyan, ui.blue, ui.pink, ui.grey, ui.grey,
  ];

  const n = Math.max(titles.length, DEFAULT_TROPHIES.length);
  const trophies = [];
  for (let i = 0; i < n; i++) {
    const fallback = DEFAULT_TROPHIES[i] || DEFAULT_TROPHIES[DEFAULT_TROPHIES.length - 1];
    const rawTitle = titles[i] ?? fallback.title;
    const rank = ranks[i] ?? fallback.rank;
    const prog = progressByTitle.has(rawTitle) ? progressByTitle.get(rawTitle) : (fallback.progress ?? 0);
    trophies.push({
      id: fallback.id,
      title: formatTitle(rawTitle),
      subtitle: subtitles[i] ?? fallback.subtitle,
      detail: formatDetail(details[i] ?? fallback.detail),
      rank,
      progress: prog,
      accent: accents[i] ?? fallback.accent,
      cups: cupsFromRank(rank),
      tone: fallback.tone ?? 'rainbow',
      laurel: hasLaurel(rank),
    });
  }
  return trophies;
}

/**
 * Stock trophy path (viewBox 0 0 16 17 — tight crop of the icon art).
 * Placement follows github-profile-trophy, sized up so cups read large.
 */
function oneCup(gradId, rank, accent, variant = 'hero') {
  const idle = rank === '?' || rank === 'UNKNOWN';
  const showBadge = true; // stock shows rank on every cup in the cluster
  const opacity =
    variant === 'ghost' ? '0.55' : variant === 'side' ? '0.92' : '1';
  const badgeFill = idle ? '#c7c7cc' : ui.text;
  const rankFill = idle ? ui.grey : ui.ink;
  const badge = showBadge
    ? `
      <circle cx="8" cy="6" r="4" fill="${badgeFill}"/>
      <text x="8" y="8.55" text-anchor="middle" font-size="7" class="t-rank" fill="${rankFill}">${escapeXml(rankLetter(rank))}</text>`
    : '';

  return `
    <g opacity="${opacity}" fill="url(#${gradId})">
      <path d="M7 10h2v4H7v-4z"/>
      <path d="M10 11c0 .552-.895 1-2 1s-2-.448-2-1 .895-1 2-1 2 .448 2 1z"/>
      <path fill-rule="evenodd" d="M12.5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-3 2a3 3 0 1 1 6 0 3 3 0 0 1-6 0zm-6-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-3 2a3 3 0 1 1 6 0 3 3 0 0 1-6 0z"/>
      <path d="M3 1h10c-.495 3.467-.5 10-5 10S3.495 4.467 3 1zm0 15a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1H3zm2-1a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1H5z"/>
      ${badge}
    </g>`;
}

function placeCupBox(x, y, size, gradId, rank, accent, variant) {
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="-1 0 18 18" overflow="visible">${oneCup(gradId, rank, accent, variant)}</svg>`;
}

/** Exact stock leafIcon from ryo-ma/github-profile-trophy (icons.ts). */
function laurelWreath(accent = ui.green) {
  // Stock nests this at (0,0). Nudge down for our taller card / cup band.
  return `
    <g transform="translate(0 14)">
<svg xmlns="http://www.w3.org/2000/svg" width="90pt" height="90pt" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
<metadata>
Created by potrace 1.15, written by Peter Selinger 2001-2017
</metadata>
<g transform="translate(20.000000,60.000000) scale(0.00400000,-0.00400000)" fill="${accent}" stroke="none">
<path d="M200 5103 c0 -2 18 -40 41 -84 47 -95 62 -132 50 -125 -15 10 -18 -39 -6 -87 31 -121 265 -468 412 -608 124 -119 281 -222 383 -251 36 -10 49 -16 30 -13 -19 3 -78 12 -130 20 -117 17 -353 35 -477 35 l-93 0 53 -82 c72 -112 72 -112 59 -104 -18 11 -26 -41 -13 -84 25 -84 261 -376 404 -502 95 -83 222 -168 304 -205 98 -43 194 -73 242 -74 l46 -1 -45 -8 c-25 -5 -124 -21 -220 -36 -96 -15 -177 -29 -180 -31 -2 -2 0 -7 5 -11 27 -19 138 -144 123 -139 -18 6 -28 -10 -28 -47 0 -38 53 -108 141 -187 349 -313 631 -450 939 -453 63 0 131 2 150 7 19 4 -35 -17 -120 -46 -236 -82 -310 -110 -310 -117 0 -3 29 -28 65 -54 55 -40 102 -84 67 -62 -13 8 -32 -24 -32 -54 0 -99 486 -361 790 -426 125 -27 327 -25 444 4 113 28 261 98 309 145 39 40 56 92 38 124 -8 17 -4 24 29 49 22 16 40 32 40 36 0 4 -26 40 -58 80 -162 203 -368 328 -608 369 -89 15 -368 6 -474 -15 -131 -26 -147 -26 -59 -3 51 13 102 34 122 50 38 29 61 84 51 123 -5 18 1 26 25 39 17 8 31 19 31 23 0 4 -16 38 -35 75 -163 317 -424 501 -781 548 -113 15 -127 19 -91 30 51 14 84 58 89 118 1 20 9 33 20 37 23 7 23 6 -12 114 -108 329 -305 534 -640 662 -41 15 -59 25 -40 21 19 -5 82 -8 140 -8 81 0 113 4 142 18 39 20 73 76 65 107 -3 12 2 20 14 23 23 6 23 21 4 124 -61 320 -249 568 -544 718 -157 79 -394 147 -666 190 -88 13 -170 26 -182 29 -13 2 -23 2 -23 -1z"/>
<path d="M12550 5099 c-232 -36 -334 -55 -445 -84 -484 -122 -761 -346 -880 -712 -26 -79 -57 -242 -48 -255 2 -5 14 -8 26 -9 12 0 16 -3 10 -6 -17 -6 -16 -38 2 -72 25 -49 75 -66 200 -66 61 0 124 4 140 8 17 5 -13 -9 -66 -31 -136 -55 -250 -126 -341 -211 -128 -120 -217 -263 -272 -439 -32 -101 -32 -110 -3 -122 12 -5 17 -9 11 -9 -8 -1 -9 -12 -5 -34 15 -66 41 -95 94 -107 31 -7 31 -7 7 -12 -14 -3 -72 -13 -130 -22 -322 -51 -553 -206 -714 -479 -25 -42 -52 -92 -60 -111 -14 -33 -14 -33 23 -54 20 -12 31 -22 26 -22 -15 0 -17 -39 -4 -78 14 -42 76 -88 130 -97 22 -4 39 -9 36 -11 -2 -2 -55 3 -118 12 -154 22 -395 15 -494 -13 -216 -62 -391 -184 -545 -380 l-41 -52 40 -32 c34 -27 39 -35 30 -51 -17 -33 -1 -85 38 -125 48 -47 196 -117 309 -145 117 -29 319 -31 444 -4 300 64 790 328 790 425 0 29 -18 63 -31 56 -5 -4 -9 -4 -9 -2 0 3 34 29 75 59 41 29 75 56 75 59 0 3 -21 13 -47 22 -349 120 -422 146 -388 140 59 -12 241 -8 310 6 208 43 437 158 636 322 241 199 314 293 265 342 -13 12 -6 24 51 86 36 40 64 73 62 75 -4 2 -107 20 -359 60 -70 12 -77 14 -39 15 48 1 144 31 241 74 139 62 318 202 451 352 104 117 225 279 249 333 21 47 21 99 0 94 -16 -3 -10 9 58 116 l50 77 -72 3 c-91 4 -362 -14 -488 -33 -179 -26 -179 -26 -116 -9 93 26 244 120 365 230 193 174 467 605 443 696 -2 10 -8 15 -13 12 -12 -7 3 30 51 126 23 45 40 85 38 89 -2 4 -23 4 -48 0z m-933 -1185 c-3 -3 -12 -4 -19 -1 -8 3 -5 6 6 6 11 1 17 -2 13 -5z m-1290 -1860 c-3 -3 -12 -4 -19 -1 -8 3 -5 6 6 6 11 1 17 -2 13 -5z m40 -10 c-3 -3 -12 -4 -19 -1 -8 3 -5 6 6 6 11 1 17 -2 13 -5z"/>
<path d="M10242 4632 c-46 -140 -92 -319 -118 -457 -18 -94 -28 -519 -12 -509 4 3 5 -8 2 -25 -8 -40 21 -179 58 -274 75 -195 297 -437 400 -437 57 0 124 70 177 185 53 112 67 224 65 510 -1 120 -5 166 -23 233 -66 252 -206 515 -423 795 -39 51 -74 95 -77 99 -4 4 -26 -50 -49 -120z"/>
<path d="M2407 4612 c-305 -408 -443 -757 -422 -1067 3 -55 8 -140 10 -190 5 -113 30 -204 83 -293 44 -74 88 -118 128 -128 102 -26 339 218 422 433 34 87 67 235 58 258 -3 9 -1 39 5 68 5 28 10 117 10 197 1 155 -15 284 -57 455 -33 137 -117 405 -126 405 -5 0 -55 -62 -111 -138z"/>
<path d="M2970 3839 c-189 -385 -254 -632 -248 -941 2 -86 6 -151 10 -145 5 7 5 -2 2 -19 -19 -98 77 -354 181 -487 76 -96 141 -120 210 -77 70 43 195 240 239 375 20 63 46 197 40 207 -3 4 0 54 6 111 26 257 -51 553 -240 922 -42 83 -87 165 -98 184 l-21 35 -81 -165z"/>
<path d="M9711 3929 c-124 -219 -230 -466 -276 -642 -39 -151 -47 -234 -41 -426 7 -237 39 -357 136 -517 136 -225 233 -251 355 -97 94 121 171 313 181 453 2 36 8 111 13 167 26 288 -56 600 -266 1017 l-60 120 -42 -75z"/>
<path d="M3645 3278 c-2 -7 -14 -78 -27 -158 -19 -123 -22 -188 -23 -430 -2 -309 7 -401 50 -555 66 -232 204 -430 388 -552 120 -80 189 -70 245 34 36 69 74 205 78 283 1 30 5 109 9 175 9 135 -1 213 -41 339 -66 208 -198 406 -429 645 -147 152 -244 237 -250 219z"/>
<path d="M8994 3143 c-289 -284 -435 -492 -514 -732 -32 -100 -55 -261 -45 -330 3 -25 8 -91 10 -146 7 -168 66 -347 129 -387 77 -48 196 11 347 170 94 98 156 199 205 331 37 99 67 234 59 262 -4 11 -2 19 5 19 8 0 10 8 7 21 -3 11 1 77 10 147 10 89 13 172 9 277 -7 191 -48 515 -65 515 -3 0 -74 -66 -157 -147z"/>
<path d="M4501 2358 c52 -129 69 -179 59 -173 -6 4 -10 -12 -10 -42 0 -78 115 -313 252 -514 215 -317 529 -509 832 -509 124 0 166 27 180 112 1 11 8 23 15 27 10 7 11 27 2 98 -66 545 -401 836 -1164 1012 -97 23 -179 41 -182 41 -3 0 5 -24 16 -52z"/>
<path d="M8159 2375 c-609 -138 -940 -344 -1096 -683 -59 -127 -110 -377 -88 -429 5 -10 10 -29 12 -42 13 -75 59 -101 179 -101 316 0 625 196 854 543 110 165 222 395 228 465 3 40 2 53 -7 48 -11 -7 -3 15 53 153 28 68 31 81 19 80 -5 0 -74 -16 -154 -34z"/>
<path d="M4032 1479 c-193 -25 -435 -124 -667 -274 -108 -69 -314 -218 -315 -226 0 -4 28 -16 63 -29 66 -24 92 -40 65 -40 -10 0 -19 -12 -23 -30 -14 -65 45 -105 226 -154 572 -155 982 -93 1270 194 75 74 101 131 81 174 -9 21 -6 31 29 77 21 29 39 55 39 58 0 3 -25 24 -55 46 -229 167 -469 236 -713 204z"/>
<path d="M8513 1476 c-155 -30 -317 -101 -446 -196 l-67 -50 40 -54 c37 -49 40 -56 29 -80 -21 -46 4 -101 80 -176 288 -287 698 -349 1270 -194 180 49 240 89 226 153 -3 16 -14 31 -23 33 -9 2 18 18 61 35 l79 30 -126 92 c-304 223 -550 347 -780 395 -113 23 -257 28 -343 12z"/>
<path d="M6324 1249 c-48 -14 -120 -83 -139 -134 -13 -34 -16 -60 -11 -112 4 -37 6 -84 6 -103 -2 -95 62 -193 145 -220 138 -46 285 52 292 195 1 28 8 71 14 97 10 37 10 60 0 101 -31 139 -167 217 -307 176z"/>
<path d="M5255 1054 c-276 -46 -587 -227 -935 -541 l-54 -50 74 -23 c41 -13 67 -25 58 -27 -23 -6 -34 -48 -20 -78 16 -35 75 -61 188 -84 568 -115 968 -37 1250 243 69 69 110 130 114 171 5 42 0 66 -12 59 -12 -8 -12 -7 39 73 18 29 33 56 33 62 0 15 -49 46 -147 95 -207 104 -386 135 -588 100z"/>
<path d="M7249 1054 c-42 -7 -109 -25 -150 -40 -76 -27 -226 -101 -267 -133 l-24 -18 41 -66 c22 -37 36 -67 31 -67 -18 0 -11 -80 11 -121 11 -22 53 -73 92 -113 279 -282 682 -361 1251 -245 113 23 172 49 188 84 14 30 3 72 -20 77 -9 3 18 15 61 29 l78 24 -93 81 c-362 313 -622 460 -902 509 -106 18 -194 18 -297 -1z"/>
</g>
</svg>
    </g>`;
}

/** Layout mirrors stock: cup count from full rank; laurel for S/A ranks. */
function iconCluster(t, i) {
  const cups = Number(t.cups) || 1;
  const gid = `cup-${i}`;
  const idle = t.rank === '?' || t.tone === 'muted';
  const wreathAccent = idle ? ui.grey : ui.green;
  const heroV = idle ? 'ghost' : 'hero';
  const showLaurel = t.laurel ?? hasLaurel(t.rank);

  // Extra top padding vs stock; cups sit in the middle band.
  const hero = () => placeCupBox(20, 28, 68, gid, t.rank, t.accent, heroV);
  const sideL = () => placeCupBox(2, 48, 44, gid, t.rank, t.accent, 'side');
  const sideR = () => placeCupBox(62, 48, 44, gid, t.rank, t.accent, 'side');
  const wreath = showLaurel ? laurelWreath(wreathAccent) : '';

  if (cups >= 3) {
    return `
      <g>
        ${wreath}
        ${sideL()}
        ${sideR()}
        ${hero()}
      </g>`;
  }

  if (cups === 2) {
    return `
      <g>
        ${wreath}
        ${sideR()}
        ${hero()}
      </g>`;
  }

  return `
    <g opacity="${idle ? '0.88' : '1'}">
      ${wreath}
      ${hero()}
    </g>`;
}

export function buildTrophiesSvg(trophies) {
  const list = (trophies?.length ? trophies : DEFAULT_TROPHIES).map((t) => ({
    ...t,
    title: formatTitle(t.title),
    detail: formatDetail(t.detail),
  }));
  const width = list.length * CARD_W + (list.length - 1) * GAP;
  const height = CARD_H;

  const gradients = list
    .map((t, i) => {
      const stops = TONES[t.tone] || TONES.rainbow;
      return `
      <linearGradient id="cup-${i}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${stops[0]}"/>
        <stop offset="48%" stop-color="${stops[1]}"/>
        <stop offset="100%" stop-color="${stops[2]}"/>
      </linearGradient>
      <linearGradient id="shine-${i}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.85"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="title-${i}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${stops[0]}"/>
        <stop offset="100%" stop-color="${stops[2]}"/>
      </linearGradient>
      <linearGradient id="bar-${i}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${stops[0]}"/>
        <stop offset="100%" stop-color="${stops[2]}"/>
      </linearGradient>
      <radialGradient id="glow-${i}" cx="50%" cy="38%" r="55%">
        <stop offset="0%" stop-color="${t.accent}" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="${t.accent}" stop-opacity="0"/>
      </radialGradient>`;
    })
    .join('');

  const cards = list
    .map((t, i) => {
      const x = i * (CARD_W + GAP);
      const p = Math.min(1, Math.max(0, Number(t.progress) || 0));
      const barW = p <= 0 ? 0 : Math.max(3, Math.round(BAR_MAX * p));
      const idle = t.rank === '?' || p <= 0;
      const opacity = idle ? '0.78' : '1';
      const titleFill = idle ? ui.muted : `url(#title-${i})`;
      const detailFill = idle ? ui.muted : t.accent;
      return `
      <g transform="translate(${x} 0)" opacity="${opacity}" data-trophy-id="${escapeXml(t.id)}" data-cups="${Number(t.cups) || 1}">
        <defs>
          <linearGradient id="card-bg-${i}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${ui.bgTop}"/>
            <stop offset="100%" stop-color="${ui.bgBottom}"/>
          </linearGradient>
        </defs>
        <rect x="0.5" y="0.5" width="${CARD_W - 1}" height="${CARD_H - 1}" rx="${RX}" fill="url(#card-bg-${i})" stroke="${ui.border}" stroke-width="1.15"/>
        <rect x="0.5" y="0.5" width="${CARD_W - 1}" height="${CARD_H - 1}" rx="${RX}" fill="url(#glow-${i})"/>
        <path d="M14 1.5 H${CARD_W - 14}" stroke="url(#shelf-accent)" stroke-width="1.4" stroke-linecap="round" opacity="0.9"/>
        <text x="55" y="22" text-anchor="middle" class="t-title" fill="${titleFill}" data-field="title">${escapeXml(t.title)}</text>
        ${iconCluster(t, i)}
        <text x="55" y="105" text-anchor="middle" class="t-sub" data-field="subtitle">${escapeXml(t.subtitle)}</text>
        <text x="55" y="116" text-anchor="middle" class="t-detail" fill="${detailFill}" data-field="detail">${escapeXml(t.detail)}</text>
        <rect x="15" y="122" width="${BAR_MAX}" height="3.2" rx="1.5" fill="${ui.surface}"/>
        <rect x="15" y="122" width="${barW}" height="3.2" rx="1.5" fill="url(#bar-${i})">
          <animate attributeName="width" from="0" to="${barW}" dur="0.9s" fill="freeze" calcMode="spline" keySplines="0.22 1 0.36 1"/>
        </rect>
      </g>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="GitHub Trophies" fill="none" overflow="visible">
  <defs>
    <linearGradient id="shelf-accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${ui.blue}"/>
      <stop offset="52%" stop-color="${ui.purple}"/>
      <stop offset="100%" stop-color="${ui.pink}"/>
    </linearGradient>
    ${gradients}
    <style type="text/css"><![CDATA[
      text {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Segoe UI', Helvetica, Arial, sans-serif;
        text-rendering: geometricPrecision;
      }
      .t-title {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: -0.28px;
      }
      .t-sub {
        font-size: 9.5px;
        font-weight: 500;
        fill: ${ui.muted};
        letter-spacing: -0.1px;
      }
      .t-detail {
        font-size: 10px;
        font-weight: 650;
        letter-spacing: -0.15px;
      }
      .t-rank {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-weight: 700;
      }
    ]]></style>
  </defs>
  <!-- Actions: title/subtitle/detail + rank injected by build-trophies-svg.mjs from stock trophy data -->
  ${cards}
</svg>
`;
}

function main() {
  const args = parseArgs(process.argv);
  let trophies = DEFAULT_TROPHIES;

  if (args.data) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(args.data), 'utf8'));
    trophies = Array.isArray(raw) ? raw : raw.trophies;
  } else if (args.fromStock) {
    const stock = fs.readFileSync(path.resolve(args.fromStock), 'utf8');
    trophies = parseStockTrophySvg(stock);
  }

  const svg = buildTrophiesSvg(trophies);
  const outPath = path.resolve(
    args.out || path.join(__dirname, '../assets/trophies/trophies-shelf.svg')
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, svg);

  const dataPath = path.join(path.dirname(outPath), 'trophies-data.json');
  fs.writeFileSync(dataPath, JSON.stringify({ generatedAt: new Date().toISOString(), trophies }, null, 2));

  console.log(`Wrote ${outPath} (${trophies.length} trophies)`);
  console.log(`Wrote ${dataPath}`);
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build-trophies-svg.mjs');
if (isMain) main();

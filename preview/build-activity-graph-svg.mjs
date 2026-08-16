/**
 * Restyle github-readme-activity-graph SVG into My Stats chrome.
 * Geometry (line / area / grid / labels) comes from the stock file.
 *
 * Usage:
 *   node build-activity-graph-svg.mjs --from-stock /path/to/activity-graph.svg \
 *     --out ../assets/activity/activity-graph.svg
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
};

const W = 1200;
const H = 420;
const RX = 8;

function parseArgs(argv) {
  const out = { fromStock: null, out: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--from-stock') out.fromStock = argv[++i];
    else if (argv[i] === '--out') out.out = argv[++i];
  }
  return out;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Split "Name's Contribution Graph" so the name can get a gradient fill. */
function splitHeaderTitle(title) {
  const m = String(title).match(/^(.*?)\s+(Contribution Graph)$/i);
  if (m) return { name: m[1], rest: ` ${m[2]}` };
  return { name: title, rest: '' };
}

/** Pull chart geometry + title from stock activity-graph.svg. */
export function parseStockActivitySvg(svg) {
  const titleMatch =
    svg.match(/class="header"[^>]*>\s*([^<]+)/) ||
    svg.match(/Contribution Graph/);
  let title = 'Contribution Graph';
  if (titleMatch) {
    title = (titleMatch[1] || titleMatch[0]).replace(/\s+/g, ' ').trim();
    if (!/Contribution Graph/i.test(title) && titleMatch[0] === 'Contribution Graph') {
      title = 'Contribution Graph';
    }
  }
  // Prefer full header text from foreignObject
  const fo = svg.match(/<h1[^>]*>\s*([\s\S]*?)\s*<\/h1>/);
  if (fo) title = fo[1].replace(/\s+/g, ' ').trim();

  const area = svg.match(/<path d="([^"]+)" class="ct-area"/);
  const line = svg.match(/<path d="([^"]+)" class="ct-line"/);
  if (!area || !line) {
    throw new Error('Stock SVG missing ct-area / ct-line paths');
  }

  const grids = svg.match(/<g class="ct-grids">([\s\S]*?)<\/g>/);
  const labels = svg.match(/<g class="ct-labels">([\s\S]*?)<\/g>/);
  const series = svg.match(/<g class="ct-series ct-series-a">([\s\S]*?)<\/g>/);

  // Axis titles sit after </g> of ct-labels (not inside the labels group).
  let axisTitles = [...svg.matchAll(/<text class="ct-axis-title[^"]*"[^>]*>[^<]*<\/text>/g)].map(
    (m) => m[0]
  );
  // Nudge "Contributions" a bit right vs stock (x=20 → 26).
  axisTitles = axisTitles.map((t) => {
    if (!/>Contributions</.test(t)) return t;
    return t
      .replace(/\bx="20"/, 'x="26"')
      .replace(/rotate\(-90,\s*20,\s*215\)/, 'rotate(-90, 26, 215)');
  });

  let points = '';
  if (series) {
    const pts = [...series[1].matchAll(/<line([^>]*)class="ct-point"([^>]*)>/g)];
    points = pts
      .map((m) => {
        // Strip Chartist `ct:value` — unbound prefix breaks <img> SVG XML parse.
        const attrs = `${m[1]}class="ct-point"${m[2]}`
          .replace(/\s*ct:value="[^"]*"/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        return `<line ${attrs}></line>`;
      })
      .join('');
  }

  // Tick labels: Chartist relies on flex; for SVG <img> use proper text-anchors.
  let labelsHtml = labels ? labels[1] : '';
  labelsHtml = labelsHtml
    .replace(
      /(<text[^>]*class="ct-label ct-vertical[^"]*"[^>]*)(>)/g,
      (full, open, close) =>
        /text-anchor=/.test(open) ? full : `${open} text-anchor="end"${close}`
    )
    .replace(
      /(<text[^>]*class="ct-label ct-horizontal[^"]*"[^>]*)(>)/g,
      (full, open, close) =>
        /text-anchor=/.test(open) ? full : `${open} text-anchor="middle"${close}`
    );

  const width = Number((svg.match(/\bwidth="(\d+)"/) || [])[1]) || W;
  const height = Number((svg.match(/\bheight="(\d+)"/) || [])[1]) || H;
  const viewBox = (svg.match(/viewBox="([^"]+)"/) || [])[1] || `0 0 ${width} ${height}`;

  return {
    title,
    width,
    height,
    viewBox,
    areaD: area[1],
    lineD: line[1],
    gridsHtml: grids ? grids[1] : '',
    labelsHtml,
    pointsHtml: points,
    axisTitlesHtml:
      axisTitles.join('') ||
      `<text class="ct-axis-title" x="620" y="400" dominant-baseline="text-after-edge" text-anchor="middle">Days</text><text class="ct-axis-title" x="26" y="215" transform="rotate(-90, 26, 215)" dominant-baseline="hanging" text-anchor="middle">Contributions</text>`,
  };
}

export function buildActivityGraphSvg(data) {
  const {
    title,
    width = W,
    height = H,
    viewBox = `0 0 ${W} ${H}`,
    areaD,
    lineD,
    gridsHtml,
    labelsHtml,
    pointsHtml,
    axisTitlesHtml = '',
  } = data;

  const { name: titleName, rest: titleRest } = splitHeaderTitle(title);
  const headerMarkup = titleRest
    ? `<tspan fill="url(#title-name)">${escapeXml(titleName)}</tspan><tspan fill="${ui.text}">${escapeXml(titleRest)}</tspan>`
    : `<tspan fill="url(#title-name)">${escapeXml(titleName)}</tspan>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" role="img" aria-label="${escapeXml(title)}" fill="none">
  <defs>
    <linearGradient id="card-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${ui.bgTop}"/>
      <stop offset="100%" stop-color="${ui.bgBottom}"/>
    </linearGradient>
    <linearGradient id="shelf-accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${ui.blue}"/>
      <stop offset="52%" stop-color="${ui.purple}"/>
      <stop offset="100%" stop-color="${ui.pink}"/>
    </linearGradient>
    <linearGradient id="title-name" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="0" spreadMethod="repeat">
      <!-- 0% == 100% so translate(-1) loops with no seam -->
      <stop offset="0%" stop-color="${ui.blue}"/>
      <stop offset="25%" stop-color="${ui.purple}"/>
      <stop offset="50%" stop-color="${ui.pink}"/>
      <stop offset="75%" stop-color="${ui.purple}"/>
      <stop offset="100%" stop-color="${ui.blue}"/>
      <animateTransform
        attributeName="gradientTransform"
        type="translate"
        from="0 0"
        to="-1 0"
        dur="3.5s"
        repeatCount="indefinite"
        calcMode="linear"/>
    </linearGradient>
    <linearGradient id="line-stroke" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${ui.cyan}"/>
      <stop offset="45%" stop-color="${ui.blue}"/>
      <stop offset="100%" stop-color="${ui.purple}"/>
    </linearGradient>
    <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${ui.blue}" stop-opacity="0.35"/>
      <stop offset="55%" stop-color="${ui.purple}" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="${ui.pink}" stop-opacity="0.02"/>
    </linearGradient>
    <style type="text/css"><![CDATA[
      text {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Segoe UI', Helvetica, Arial, sans-serif;
        text-rendering: geometricPrecision;
      }
      .header {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif;
        font-size: 24px;
        font-weight: 700;
        letter-spacing: -0.45px;
      }
      .ct-label {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
        fill: ${ui.muted};
        font-size: 13px;
        font-weight: 500;
        letter-spacing: -0.1px;
      }
      .ct-axis-title {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
        fill: ${ui.muted};
        font-size: 16px;
        font-weight: 600;
        letter-spacing: -0.15px;
      }
      .ct-grid {
        stroke: ${ui.border};
        stroke-width: 1px;
        stroke-opacity: 0.85;
        stroke-dasharray: 2px;
      }
      .ct-line {
        fill: none;
        stroke: url(#line-stroke);
        stroke-width: 3.2px;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-dasharray: 5000;
        stroke-dashoffset: 5000;
        animation: dash 5s ease-in-out forwards;
      }
      .ct-area {
        stroke: none;
        fill: url(#area-fill);
        fill-opacity: 1;
      }
      .ct-point {
        stroke: ${ui.cyan};
        stroke-width: 8px;
        stroke-linecap: round;
        animation: blink 1s ease-in-out forwards;
      }
      @keyframes blink {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes dash {
        to { stroke-dashoffset: 0; }
      }
    ]]></style>
  </defs>

  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${RX}" fill="url(#card-bg)" stroke="${ui.border}" stroke-width="1.15"/>
  <path d="M28 1.5 H${width - 28}" stroke="url(#shelf-accent)" stroke-width="1.5" stroke-linecap="round" opacity="0.95"/>

  <text x="${width / 2}" y="48.5" text-anchor="middle" class="header">${headerMarkup}</text>

  <g class="ct-chart-line">
    <g class="ct-grids">${gridsHtml}</g>
    <g class="ct-series ct-series-a">
      <path d="${areaD}" class="ct-area"/>
      <path d="${lineD}" class="ct-line"/>
      ${pointsHtml}
    </g>
    <g class="ct-labels">${labelsHtml}</g>
    ${axisTitlesHtml}
  </g>
</svg>
`;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.fromStock) {
    console.error('Usage: node build-activity-graph-svg.mjs --from-stock <stock.svg> [--out <out.svg>]');
    process.exit(1);
  }

  const stock = fs.readFileSync(path.resolve(args.fromStock), 'utf8');
  const data = parseStockActivitySvg(stock);
  const svg = buildActivityGraphSvg(data);

  const outPath = path.resolve(
    args.out || path.join(__dirname, '../assets/activity/activity-graph.svg')
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, svg);

  const metaPath = path.join(path.dirname(outPath), 'activity-graph-meta.json');
  fs.writeFileSync(
    metaPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), title: data.title }, null, 2)
  );

  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${metaPath}`);
  console.log(`Title: ${data.title}`);
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('build-activity-graph-svg.mjs');
if (isMain) main();

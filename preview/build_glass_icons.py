#!/usr/bin/env python3
"""Regenerate preview/icons/* as macOS liquid-glass tiles."""
from __future__ import annotations

import hashlib
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "icons"
REPO_ASSETS = ROOT.parent / "assets"
CACHE = ROOT / "_src"

SIZE = 256
# ~22% continuous corner — matches macOS app icon mask feel
CORNER = 57.0
# Dock logos sit with ~15–18% padding (Telegram / VS Code style)
PAD = 40
INNER = SIZE - 2 * PAD
SCALE = INNER / SIZE

# Sampled from user's macOS dark dock screenshot (Telegram / Music tiles)
FILL_TOP = "#2c2f35"
FILL_MID = "#1f2126"
FILL_BOT = "#16181c"


def squircle_path(size: float = SIZE, radius: float = CORNER) -> str:
    """Apple continuous-corner squircle (PaintCode / iOS continuous curve)."""
    limit = min(size, size) / 2 / 1.52866483
    r = min(radius, limit)

    def tl(x: float, y: float) -> tuple[float, float]:
        return (x * r, y * r)

    def tr(x: float, y: float) -> tuple[float, float]:
        return (size - x * r, y * r)

    def br(x: float, y: float) -> tuple[float, float]:
        return (size - x * r, size - y * r)

    def bl(x: float, y: float) -> tuple[float, float]:
        return (x * r, size - y * r)

    def f(p: tuple[float, float]) -> str:
        return f"{p[0]:.4f} {p[1]:.4f}"

    return " ".join(
        [
            f"M{f(tl(1.52866483, 0.0))}",
            f"L{f(tr(1.52866471, 0.0))}",
            f"C{f(tr(1.08849323, 0.0))} {f(tr(0.86840689, 0.0))} {f(tr(0.66993427, 0.065496))}",
            f"L{f(tr(0.63149399, 0.074911))}",
            f"C{f(tr(0.37282379, 0.169059))} {f(tr(0.16906013, 0.372824))} {f(tr(0.07491176, 0.631494))}",
            f"C{f(tr(0.00000061, 1.087901))} {f(tr(0.0, 1.29528))} {f(tr(0.0, 1.52866483))}",
            f"L{f(br(0.0, 1.52866483))}",
            f"C{f(br(0.0, 1.29528))} {f(br(0.00000061, 1.087901))} {f(br(0.07491176, 0.631494))}",
            f"C{f(br(0.16906013, 0.372824))} {f(br(0.37282379, 0.169059))} {f(br(0.63149399, 0.074911))}",
            f"L{f(br(0.66993427, 0.065496))}",
            f"C{f(br(0.86840689, 0.0))} {f(br(1.08849323, 0.0))} {f(br(1.52866471, 0.0))}",
            f"L{f(bl(1.52866483, 0.0))}",
            f"C{f(bl(1.08849323, 0.0))} {f(bl(0.86840689, 0.0))} {f(bl(0.66993427, 0.065496))}",
            f"L{f(bl(0.63149399, 0.074911))}",
            f"C{f(bl(0.37282379, 0.169059))} {f(bl(0.16906013, 0.372824))} {f(bl(0.07491176, 0.631494))}",
            f"C{f(bl(0.00000061, 1.087901))} {f(bl(0.0, 1.29528))} {f(bl(0.0, 1.52866483))}",
            f"L{f(tl(0.0, 1.52866483))}",
            f"C{f(tl(0.0, 1.29528))} {f(tl(0.00000061, 1.087901))} {f(tl(0.07491176, 0.631494))}",
            f"C{f(tl(0.16906013, 0.372824))} {f(tl(0.37282379, 0.169059))} {f(tl(0.63149399, 0.074911))}",
            f"L{f(tl(0.66993427, 0.065496))}",
            f"C{f(tl(0.86840689, 0.0))} {f(tl(1.08849323, 0.0))} {f(tl(1.52866483, 0.0))}",
            "Z",
        ]
    )


SQUIRCLE = squircle_path()


ICONS = [
    ("linkedin", "api:linkedin"),
    ("telegram", "api:telegram"),
    ("gmail", "file:gmail-2026-dark-rounded.svg"),
    ("javascript", "api:javascript"),
    ("typescript", "api:typescript"),
    ("html", "api:html"),
    ("css", "api:css"),
    ("sass", "api:sass"),
    ("tailwindcss", "api:tailwindcss"),
    ("vuejs", "api:vuejs"),
    ("nuxtjs", "api:nuxtjs"),
    ("react", "api:react"),
    ("nextjs", "api:nextjs"),
    ("nodejs", "api:nodejs"),
    ("vite", "api:vite"),
    ("threejs", "api:threejs"),
    ("gsap", "api:gsap"),
    ("git", "api:git"),
    ("github", "api:github"),
    ("gitlab", "api:gitlab"),
    ("codepen", "api:codepen"),
    ("chatgpt", "file:chatgpt-dark-rounded.svg"),
    ("claude", "api:claude"),
    ("gemini", "api:gemini"),
    ("deepseek", "api:deepseek"),
    ("cursor", "api:cursor"),
    ("perplexity", "file:perplexity-dark-rounded.svg"),
    ("figma", "api:figma"),
    ("photoshop", "api:photoshop"),
    ("canva", "api:canva"),
    ("spine", "file:spine-dark-rounded.svg"),
]


def fetch(src: str) -> str:
    OUT.mkdir(exist_ok=True)
    CACHE.mkdir(exist_ok=True)
    if src.startswith("api:"):
        name = src[4:]
        path = CACHE / f"api-{name}.svg"
        if not path.exists():
            url = f"https://go-skill-icons.vercel.app/api/icons?i={name}&theme=dark"
            path.write_bytes(urllib.request.urlopen(url, timeout=30).read())
        return path.read_text(errors="replace")
    if src.startswith("file:"):
        return (REPO_ASSETS / src[5:]).read_text(errors="replace")
    if src.startswith("url:"):
        url = src[4:]
        h = hashlib.md5(url.encode()).hexdigest()[:10]
        path = CACHE / f"url-{h}.svg"
        if not path.exists():
            path.write_bytes(urllib.request.urlopen(url, timeout=30).read())
        return path.read_text(errors="replace")
    raise ValueError(src)


def extract_inner(raw: str) -> str:
    m = re.search(
        r'<g transform="translate\(0, 0\)">\s*(<svg[\s\S]*?</svg>)\s*</g>', raw
    )
    if m:
        return m.group(1)
    m = re.search(r"<svg[\s\S]*</svg>", raw)
    return m.group(0) if m else raw


DARK_FILLS = (
    "#242938",
    "#1c1c1e",
    "#121214",
    "#0d1117",
    "#18181b",
    "#000000",
    "#111111",
    "#1a1a1c",
    "#2a2a2c",
)


def _fill_of(tag: str) -> str:
    m = re.search(r'fill="([^"]+)"', tag)
    return (m.group(1) if m else "").lower()


# Icons whose brand IS a colored full-canvas plate (keep inset on glass).
KEEP_PLATE = {
    "javascript",
    "typescript",
    "html",
    "css",
    "sass",
}


def _is_full_canvas_path(d: str) -> bool:
    """Skill-icons outer squircle / rounded plate paths."""
    if not d:
        return False
    return (
        d.startswith("M196 0")
        or d.startswith("M60 0")
        or d.startswith("M0 60")
        or "H196C229.137" in d
        or "H60C26.8629" in d
    )


def strip_tile_background(svg: str, name: str = "") -> str:
    """
    Remove full-canvas tiles so artwork sits on our Liquid Glass plate.

    Brand plates (JS/TS/HTML/CSS/Sass) are kept — they *are* the logo.
    Everything else (Telegram blue, LinkedIn blue, dark tiles, …) is stripped
    so only the mark remains, matching macOS dark dock icons.
    """
    keep_plate = name in KEEP_PLATE
    body = re.sub(r"^[\s\S]*?<svg[^>]*>", "", svg, count=1)
    body = re.sub(r"</svg>\s*$", "", body)

    # 1) BEFORE deleting rects: unwrap groups clipped by full-canvas clipPaths
    full_clip_ids = re.findall(
        r'<clipPath id="([^"]+)"[^>]*>\s*<rect[^>]*width="256"[^>]*height="256"[^/]*/>\s*</clipPath>',
        body,
    )
    for cid in full_clip_ids:
        body = re.sub(
            rf'<g([^>]*)\sclip-path="url\(\#{re.escape(cid)}\)"([^>]*)>',
            r"<g\1\2>",
            body,
        )
        body = re.sub(
            rf'<clipPath id="{re.escape(cid)}"[^>]*>\s*<rect[^>]*width="256"[^>]*height="256"[^/]*/>\s*</clipPath>',
            "",
            body,
        )

    def drop_rect(m: re.Match[str]) -> str:
        tag = m.group(0)
        is_full = re.search(r'width="256"', tag) and re.search(r'height="256"', tag)
        if not is_full:
            return tag
        if keep_plate:
            fill = _fill_of(tag)
            # still drop dark/white underlays under brand plates
            if fill in DARK_FILLS or fill in {"#fff", "#ffffff", "white", ""}:
                return ""
            return tag
        return ""  # any full-canvas rect → glass plate replaces it

    body = re.sub(r"<rect[^>]*/>", drop_rect, body)

    def drop_tile_path(m: re.Match[str]) -> str:
        tag = m.group(0)
        d = re.search(r'd="([^"]*)"', tag)
        if not d or not _is_full_canvas_path(d.group(1)):
            return tag
        if keep_plate:
            fill = _fill_of(tag)
            if fill in DARK_FILLS:
                return ""
            return tag
        return ""  # drop blue Telegram / LinkedIn / gradient Facebook tiles etc.

    body = re.sub(r"<path[^>]*(?:/>|>\s*</path>)", drop_tile_path, body)

    # 2) Safety: empty clipPaths (would hide everything) → unwrap + delete
    empty_ids = re.findall(r'<clipPath id="([^"]+)"[^>]*>\s*</clipPath>', body)
    for cid in empty_ids:
        body = re.sub(
            rf'\sclip-path="url\(\#{re.escape(cid)}\)"',
            "",
            body,
        )
        body = re.sub(rf'<clipPath id="{re.escape(cid)}"[^>]*>\s*</clipPath>', "", body)

    return body


def uniquify_ids(body: str, prefix: str) -> str:
    ids = set(re.findall(r'\bid="([^"]+)"', body))
    for i in sorted(ids, key=len, reverse=True):
        safe = re.sub(r"[^a-zA-Z0-9_-]", "_", i)
        nid = f"{prefix}_{safe}"
        body = body.replace(f'id="{i}"', f'id="{nid}"')
        body = body.replace(f"url(#{i})", f"url(#{nid})")
        body = body.replace(f"url('#{i}')", f"url(#{nid})")
    return body


def glass_svg(name: str, artwork: str) -> str:
    """
    Static bake of macOS Tahoe dark Liquid Glass app icons.

    Real Liquid Glass is runtime-composited (Icon Composer layers + specular
    that tracks light). README SVGs can't refract, so we match the dark-dock
    look: continuous squircle, charcoal material, dual-tone rim, soft sheen,
    inset lip, drop shadow — calibrated to a macOS dark dock screenshot.
    """
    prefix = re.sub(r"[^a-z0-9]", "", name.lower())[:20] or "icon"
    artwork = uniquify_ids(artwork, prefix)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <defs>
    <linearGradient id="{prefix}_fill" x1="128" y1="0" x2="128" y2="256" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="{FILL_TOP}"/>
      <stop offset="0.5" stop-color="{FILL_MID}"/>
      <stop offset="1" stop-color="{FILL_BOT}"/>
    </linearGradient>
    <!-- Soft polished sheen across upper half -->
    <linearGradient id="{prefix}_sheen" x1="128" y1="8" x2="128" y2="150" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#d8dde8" stop-opacity="0.14"/>
      <stop offset="0.4" stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <!-- Domed material: faint TL light, soft BR shade (under artwork) -->
    <radialGradient id="{prefix}_dome" cx="96" cy="72" r="200" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/>
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.22"/>
    </radialGradient>
    <!-- Outer glass lip: bright top → faint sides → dark bottom -->
    <linearGradient id="{prefix}_rim" x1="128" y1="0" x2="128" y2="256" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#f2f4f8" stop-opacity="0.62"/>
      <stop offset="0.22" stop-color="#c8ced8" stop-opacity="0.28"/>
      <stop offset="0.55" stop-color="#8b929e" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.35"/>
    </linearGradient>
    <!-- Inner recessed lip (top highlight / bottom shade) -->
    <linearGradient id="{prefix}_inset" x1="40" y1="0" x2="216" y2="256" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.34"/>
      <stop offset="0.35" stop-color="#ffffff" stop-opacity="0.08"/>
      <stop offset="0.7" stop-color="#000000" stop-opacity="0.10"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.38"/>
    </linearGradient>
    <clipPath id="{prefix}_clip">
      <path d="{SQUIRCLE}"/>
    </clipPath>
    <filter id="{prefix}_shadow" x="-25%" y="-15%" width="150%" height="150%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="#000000" flood-opacity="0.50"/>
    </filter>
    <filter id="{prefix}_mark" x="-15%" y="-10%" width="130%" height="140%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>

  <path d="{SQUIRCLE}" fill="{FILL_BOT}" filter="url(#{prefix}_shadow)"/>

  <g clip-path="url(#{prefix}_clip)">
    <rect width="256" height="256" fill="url(#{prefix}_fill)"/>
    <rect width="256" height="256" fill="url(#{prefix}_dome)"/>
    <rect width="256" height="256" fill="url(#{prefix}_sheen)"/>
    <!-- Artwork sits on the glass plate (keeps brand colors crisp) -->
    <g transform="translate({PAD} {PAD}) scale({SCALE:.6f})" filter="url(#{prefix}_mark)">
{artwork}
    </g>
    <!-- Inner glass lip just inside the mask -->
    <path d="{SQUIRCLE}" fill="none" stroke="url(#{prefix}_inset)" stroke-width="2.5" stroke-opacity="0.9"/>
  </g>

  <!-- Outer specular edge -->
  <path d="{SQUIRCLE}" fill="none" stroke="url(#{prefix}_rim)" stroke-width="1.15"/>
</svg>
"""


def prepare_artwork(name: str, raw: str) -> str:
    inner = extract_inner(raw)
    return strip_tile_background(inner, name)


def main() -> None:
    built = 0
    for name, src in ICONS:
        raw = fetch(src)
        art = prepare_artwork(name, raw)
        (OUT / f"{name}.svg").write_text(glass_svg(name, art))
        built += 1
        print("OK", name)
    print(f"Built {built}/{len(ICONS)} → {OUT}")


if __name__ == "__main__":
    main()

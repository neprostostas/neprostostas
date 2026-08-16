#!/usr/bin/env python3
"""Apple Liquid Glass plate + flat brand logos (previous skill-icons artwork)."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

from PIL import Image

from build_glass_icons import ICONS, extract_inner, fetch, strip_tile_background

ROOT = Path(__file__).resolve().parent
CLEAN = ROOT / "_liquid" / "flat"
OUT = ROOT / "icons-liquid"
PLATE = ROOT / "_liquid" / "png" / "plate.png"
SVG2PNG = Path("/tmp/svg2png")

SIZE = 512
PAD = int(SIZE * 0.15)
INNER = SIZE - 2 * PAD

# GitHub markdown injects `background-color: var(--bgColor-muted); border-radius: 6px`
# on images. Transparent squircle corners then show that muted fill as a second,
# softer outer radius (worse at the bottom). Bake onto the README canvas color
# so corners stay invisible against the page.
GITHUB_DARK_BG = (13, 17, 23, 255)  # #0d1117

# Equal outer pad so row-wrap gap == column gap when icons sit flush.
# Pad is OUTSIDE the plate (canvas grows) — squircle stays full 512, not shrunk.
# At DISPLAY_SIZE px, squircle renders ≈ ICON_PX and gap ≈ DISPLAY_SIZE - ICON_PX.
ICON_PAD = 30
ICON_PX = 52
DISPLAY_SIZE = round(ICON_PX * (SIZE + 2 * ICON_PAD) / SIZE)  # 58

# Per-icon logo scale after fitting into INNER (1.0 = default)
LOGO_SCALE = {
    "telegram": 0.82,
    "linkedin": 0.90,
}

# White mark → brand color (keep dark glass plate, no blue tile)
BRAND_RECOLOR = {
    "linkedin": "#0A66C2",
}


def clean_artwork(name: str, raw: str) -> str:
    # Gemini skill-icons use blur+mask that NSImage can't render — use official sparkle.
    if name == "gemini":
        return GEMINI_FLAT_SVG
    # Perplexity: stroke mark (svgl), not the simpleicons asterisk.
    if name == "perplexity":
        return PERPLEXITY_FLAT_SVG

    art = strip_tile_background(extract_inner(raw), name)
    art = re.sub(r"<clipPath[\s\S]*?</clipPath>", "", art)
    art = re.sub(r'\sclip-path="[^"]*"', "", art)
    art = re.sub(r"<mask[\s\S]*?</mask>", "", art)
    art = re.sub(
        r'<rect[^>]*width="133[^"]*"[^>]*fill="#fff"[^/]*/>',
        "",
        art,
        flags=re.I,
    )

    # Claude skill-icons include a "Claude" wordmark path — keep only the star.
    if name == "claude":
        paths = re.findall(r"<path[\s\S]*?(?:/>|</path>)", art)
        star = [
            p
            for p in paths
            if (m := re.search(r'fill="([^"]+)"', p))
            and m.group(1).upper() in {"#D97757", "#DA7756", "#CC785C"}
        ]
        if star:
            art = "\n".join(star)

    # Recolor white marks to brand colors (LinkedIn / Facebook / Telegram)
    if name in BRAND_RECOLOR:
        color = BRAND_RECOLOR[name]
        art = re.sub(r'fill="white"', f'fill="{color}"', art, flags=re.I)
        art = re.sub(r'fill="#fff"', f'fill="{color}"', art, flags=re.I)
        art = re.sub(r'fill="#ffffff"', f'fill="{color}"', art, flags=re.I)

    return art.strip()


# Official Google gstatic sparkle (slender 4-point star)
GEMINI_FLAT_SVG = """
  <defs>
    <linearGradient id="gem" x1="2" y1="2" x2="26" y2="26" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#4B8BF5"/>
      <stop offset="0.45" stop-color="#8B6CF6"/>
      <stop offset="1" stop-color="#F06292"/>
    </linearGradient>
  </defs>
  <g transform="translate(14 14) scale(8.14)">
    <path fill="url(#gem)" d="M14 28C14 26.0633 13.6267 24.2433 12.88 22.54C12.1567 20.8367 11.165 19.355 9.905 18.095C8.645 16.835 7.16333 15.8433 5.46 15.12C3.75667 14.3733 1.93667 14 0 14C1.93667 14 3.75667 13.6383 5.46 12.915C7.16333 12.1683 8.645 11.165 9.905 9.905C11.165 8.645 12.1567 7.16333 12.88 5.46C13.6267 3.75667 14 1.93667 14 0C14 1.93667 14.3617 3.75667 15.085 5.46C15.8317 7.16333 16.835 8.645 18.095 9.905C19.355 11.165 20.8367 12.1567 22.54 12.88C24.2433 13.6267 26.0633 14 28 14C26.0633 14 24.2433 14.3617 22.54 15.085C20.8367 15.8317 19.355 16.835 18.095 18.095C16.835 19.355 15.8317 20.8367 15.085 22.54C14.3617 24.2433 14 26.0633 14 28Z"/>
  </g>
"""

# Stroke-based Perplexity mark (svgl)
PERPLEXITY_FLAT_SVG = """
  <g fill="none" stroke="#20B8CD" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" transform="translate(16 16) scale(4.67)">
    <path d="M24 4.5v39M13.73 16.573v-9.99L24 16.573m0 14.5L13.73 41.417V27.01L24 16.573m0 0l10.27-9.99v9.99"/>
    <path d="M13.73 31.396H9.44V16.573h29.12v14.823h-4.29"/>
    <path d="M24 16.573L34.27 27.01v14.407L24 31.073"/>
  </g>
"""


def ensure_svg2png() -> None:
    if SVG2PNG.exists():
        return
    src = Path("/tmp/svg2png.swift")
    src.write_text(
        """
import AppKit
import Foundation
guard CommandLine.arguments.count >= 3 else { exit(1) }
let src = CommandLine.arguments[1]
let dst = CommandLine.arguments[2]
let size = CGFloat(Double(CommandLine.arguments[3]) ?? 512)
guard let data = try? Data(contentsOf: URL(fileURLWithPath: src)),
      let image = NSImage(data: data) else { exit(2) }
let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size),
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
rep.size = NSSize(width: size, height: size)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSColor.clear.setFill()
NSRect(x: 0, y: 0, width: size, height: size).fill()
image.draw(in: NSRect(x: 0, y: 0, width: size, height: size), from: .zero, operation: .sourceOver, fraction: 1.0)
NSGraphicsContext.restoreGraphicsState()
guard let png = rep.representation(using: .png, properties: [:]) else { exit(3) }
try! png.write(to: URL(fileURLWithPath: dst))
"""
    )
    subprocess.check_call(["swiftc", str(src), "-o", str(SVG2PNG)])


def rasterize(svg: Path, png: Path) -> Image.Image:
    subprocess.run(
        [str(SVG2PNG), str(svg), str(png), str(SIZE)],
        check=True,
        capture_output=True,
    )
    return Image.open(png).convert("RGBA")


def main() -> None:
    ensure_svg2png()
    CLEAN.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    if not PLATE.exists():
        raise SystemExit(f"Missing plate {PLATE}")
    plate = Image.open(PLATE).convert("RGBA").resize((SIZE, SIZE), Image.Resampling.LANCZOS)

    built = 0
    for name, src in ICONS:
        art = clean_artwork(name, fetch(src))
        if len(art) < 30:
            print("SKIP", name)
            continue
        svg_path = CLEAN / f"{name}.svg"
        svg_path.write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" '
            f'viewBox="0 0 256 256" fill="none">\n{art}\n</svg>\n'
        )
        logo = rasterize(svg_path, CLEAN / f"{name}.png")
        bbox = logo.getbbox()
        if not bbox:
            print("EMPTY", name)
            continue
        logo = logo.crop(bbox)
        lw, lh = logo.size
        scale = min(INNER / lw, INNER / lh) * LOGO_SCALE.get(name, 1.0)
        nw, nh = max(1, int(lw * scale)), max(1, int(lh * scale))
        logo = logo.resize((nw, nh), Image.Resampling.LANCZOS)
        canvas = plate.copy()
        canvas.alpha_composite(logo, ((SIZE - nw) // 2, (SIZE - nh) // 2))
        # Opaque page-bg under transparent corners (kills GitHub muted double-radius)
        flat = Image.new("RGBA", (SIZE, SIZE), GITHUB_DARK_BG)
        flat.alpha_composite(canvas)
        # Grow canvas with equal pad — keeps plate at full size (don't scale down)
        out_size = SIZE + 2 * ICON_PAD
        out = Image.new("RGBA", (out_size, out_size), GITHUB_DARK_BG)
        out.alpha_composite(flat, (ICON_PAD, ICON_PAD))
        out.save(OUT / f"{name}.png", optimize=True)
        built += 1
        print("OK", name)

    print(f"Built {built} → {OUT}")


if __name__ == "__main__":
    main()

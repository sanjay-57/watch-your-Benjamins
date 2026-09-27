# Benjamins app icon

**Concept:** the unfinished pyramid and the all-seeing eye from the reverse of the US one-dollar bill, redrawn from scratch.

- The pyramid has 13 stone courses and a floating glass capstone that holds the eye.
- A glory of rays sits over a guilloché-engraved greenback background.
- It uses no mottoes, numerals or seal text.

## Palette

Only dollar colours are used:

| Name | Hex |
|---|---|
| greenback | `#1F5A3A` |
| forest | `#123524` |
| Treasury-seal green | `#2E7D4F` |
| dollar-bill green | `#85BB65` |
| sage | `#A7C88A` |
| mint | `#CFE3C4` |
| currency paper | `#F2F0E6` |
| black ink | `#07120C` |

## Files

| File | What it is |
|---|---|
| `icon.svg` | Master icon: 1024², full-bleed square. |
| `splash-glyph.svg` | Round "seal" medallion version, used as the in-app logo and the iOS launch glyph. |
| `preview.png` | Contact sheet at 360 / 120 / 60 / 48 px, the seal, and the favicon. |
| `generate.mjs` | The generator that writes every size. |

The generator writes:
- `web/public/icons/*`
- `design/ios/AppIcon-1024*.png`
- `design/android-res/**` (adaptive background and foreground layers, the themed monochrome, and legacy icons)

It needs the puppeteer-core and sharp packages, plus `render.mjs`, a helper that renders SVGs in headless Chrome.

The small optical variant (≤128 px) has fewer courses, thicker lines and a larger eye.

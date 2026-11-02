# Assets

Fonts and original interface assets are served locally. Optional station covers now load from the URLs supplied by the user; the original SVG badges remain the fallback for missing artwork.

| Asset | Creator and source | License and notices | Restrictions |
| --- | --- | --- | --- |
| Besley Regular | Owen Earl / indestructible type; https://github.com/indestructible-type/Besley | SIL OFL 1.1; verified https://github.com/indestructible-type/Besley/blob/master/LICENSE.md ; full notice assets/fonts/Besley-LICENSE.md | Font cannot be sold by itself. Retain copyright and license. Derivatives must respect reserved names and OFL. Unmodified file used. |
| Public Sans Regular and Semibold | Public Sans Project Authors / USWDS; https://github.com/uswds/public-sans | Combined Libre Franklin foundation and GSA modifications; maintainer instructs use under SIL OFL 1.1. Verified https://github.com/uswds/public-sans/blob/main/LICENSE.md ; full notices assets/fonts/PublicSans-LICENSE.md | Preserve full notices and license; do not sell fonts alone; observe reserved names for derivatives. Unmodified files used. |
| Transport icons, station nameplates, instrument geometry | Original interface SVG/CSS authored for this project | Original project assets, no external asset license or attribution | Nameplates are app identifiers, not official station logos. |

Font files were downloaded from the respective maintainers’ repositories. No third-party icon package, textures, or generated raster artwork is included. Notices accompany redistributed font files; visible attribution banners are not required by their licenses.

Round 2 adds seven original engraved groove emblems and original inline SVG paper linework confined to the housing bottom lip (3.5% stroke opacity). These are original interface geometry, not station logos or externally sourced textures. Font files, pairing, and licenses remain unchanged.


## Round 2.5 theme assets

| Asset | Creator / source | License and retained notice | Use / restrictions |
| --- | --- | --- | --- |
| DejaVu Sans Regular and Bold | DejaVu project; official 2.37 release https://github.com/dejavu-fonts/dejavu-fonts/releases/tag/version_2_37 | Bitstream Vera / Arev notices; DejaVu changes are public domain. Verified full notice https://github.com/dejavu-fonts/dejavu-fonts/blob/master/LICENSE ; bundled assets/fonts/DejaVu-LICENSE.txt | Vintage only. Unmodified files from the official TTF release. Keep copyright/trademark/permission notices; fonts may accompany software but may not be sold alone; observe renaming restrictions for modifications. |
| Source Sans 3 Regular and Semibold | Adobe / Source Sans project; https://github.com/adobe-fonts/source-sans/tree/release/TTF | SIL OFL 1.1. Verified https://github.com/adobe-fonts/source-sans/blob/release/LICENSE.md ; bundled assets/fonts/SourceSans3-LICENSE.md | Aero only. Unmodified font files. Preserve license/copyright; no font-only sale; reserved-name restrictions apply to derivatives. |
| Public Sans Regular and Semibold | Existing USWDS assets and full notice above | Existing verified combined-font license retained | Minimalist uses this legible family for display and interface. Classic's existing pairing is unchanged. |
| Aero sky/horizon, gel and glass materials; Vintage bevel/title bar recipes; swatches and four visualizer skins | Original CSS and Canvas interface geometry for this project | Original project work, no externally sourced illustration | No Microsoft, Apple, Frutiger, Windows, photographic or AI-generated assets. Swatches draw actual theme tokens. |

All fonts are self-hosted. Stylesheets register faces, but browsers request font files only for the active theme; the cross-theme QA recorded those requests. No third-party runtime font service is used. The developer-only harness deliberately renders all four skins and may load their fonts together.

## Station covers requested October 31, 2026

| Cover | Source | Provenance and display |
| --- | --- | --- |
| PowerHitz 1Power | https://files.catbox.moe/zty178.png | User-supplied station cover; displayed remotely at their request, with a station website link. No author or open redistribution license is inferred. |
| SomaFM Bossa Beyond | https://api.somafm.com/logos/256/bossa256.jpg | User-supplied official SomaFM cover URL, also verified against its channels JSON. Provider-owned artwork; channel page credits illustrator Jason Dryg. Linked to SomaFM. |
| SomaFM Groove Salad | https://api.somafm.com/logos/256/groovesalad256.png | User-supplied official SomaFM cover URL, verified against its channels JSON. Provider-owned station artwork; linked to SomaFM. |

These images identify the stations. They are not original project artwork, album covers, or evidence of affiliation. Runtime images use no-referrer requests and fall back to original emblems on failure. Research copies under outputs/tracks/research are verification artifacts, not bundled production artwork. No lyrics are collected.

## PowerHitz catalogue and optional song artwork

Additional station covers are remotely displayed from the official PowerHitz homepage, cross-checked with its player pages. See scripts/powerhitz.js for exact source URLs and outputs/powerhitz/research for provenance. Missing official covers retain the original interface emblems. These provider-owned logos are used as station identifiers at the user's request; no open redistribution license or affiliation is claimed.

When a strict artist/title match is found in MusicBrainz, a front-cover thumbnail from Cover Art Archive may replace the main station cover. **Artwork details** links to that release's MusicBrainz page. Covers remain owned by their respective rights holders; catalogue metadata availability does not grant an open license to the images. Images load remotely and are not bundled into the production app. No Apple or Deezer artwork is used. [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API), [Cover Art Archive API](https://musicbrainz.org/doc/Cover_Art_Archive/API).

Radio static is original noise generated at runtime with Web Audio. No recording or third-party sound file is used.

## User-provided station icons

Ten images supplied by the user are stored in `assets/stations/` and used as station covers: PowerHitz Plug 105, Glory 107, Smoov and Double 0's; Smooth Jazz 24/7, Love FM, 90s Online Radio, VTJM Radio, Precious Radio Funk and Ambient Sleeping Pill. The files are retained as supplied. As with other station images, matched track artwork may temporarily replace the station cover in the main player; the station picker uses the station cover.

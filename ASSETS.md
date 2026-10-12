# Artwork and attribution

iGEM Ping is an independent community project for iGEMers. It is not an official iGEM product and is not endorsed by iGEM.

## Gemy companion

`assets/pet.png` and `assets/icon.png` are the same AI-generated fan adaptation of **Gemy**, iGEM's green mascot. They were made with OpenAI ImageGen on 13 October 2026 using an official reference photograph. The adaptation preserves Gemy's green body, fimbriae, large eyes, smile, and cap, while adding a full-body waving pose and a transparent background.

- Reference: [iGEM Headquarters — Happy 2026 from Gemy and iGEM](https://x.com/iGEM/status/2007014004384821647).
- [Official reference photograph](https://pbs.twimg.com/media/G9kdFEKaMAAT6st.jpg). The photograph itself is not bundled in this repository.
- The generated artwork is not an official asset supplied or approved by iGEM.

Gemy, iGEM's visual identity, and associated trademark rights remain with their respective rights holders. These assets are **excluded from the code's MIT license**. No general open license for Gemy adaptations was found in the cited sources; this repository does not grant independent rights to the character or imply that redistribution or commercial reuse is authorized by iGEM. Downstream users should obtain any permission needed for their intended use or replace these assets with their own.

## Official logo

`assets/igem-logo.png` is the original, unmodified official full-color logo with dark lettering, used to identify official iGEM resource links.

- [Official PNG file](https://static.igem.org/mediawiki/igem.org/c/c9/Igem-logo-fullcolorblack%402x.png).
- [iGEM's Connect page](https://competition.igem.org/about/connect) provides brand resources.
- iGEM and its logo are trademarks of iGEM. The logo is excluded from the MIT license.
- The [2021 brand manual](https://static.igem.org/mediawiki/2021/9/9f/2021_brand_manual.pdf) provides historical guidance on unchanged logos and clear space; it is not represented here as a current blanket license.

## ImageGen interface artwork

The following original PNG files were generated with the built-in OpenAI ImageGen tool on 13 October 2026 in one consistent iOS-inspired visual style. They contain no Apple logos or copied Apple assets:

- `assets/ios-icons.png`: sixteen transparent glossy icon tiles in a four-by-four atlas (help, idea, caution, success, focus, break, home, resources, settings, language, link, calendar, registry, engineering, safety, community).
- `assets/ios-background.png`: pearl, ice-blue and mint desktop background.
- `assets/ios-panel.png`: transparent cool-white panel with a fine baked-in rim.
- `assets/ios-button.png`: restrained blue button skin with a subtle baked-in highlight.

CSS selects icon atlas cells and displays panels/buttons through nine raster viewports. Their source rectangles exclude stray pixels in the PNGs’ transparent outer margin; the PNG files themselves are unchanged. This keeps the generated corners intact when a button becomes wider. Small controls also use the same PNG skins. Code lays out real text and interactive controls; it does not draw icons, gradients, borders, shadows or button artwork. Selected states use the blue skin; keyboard focus is also indicated by text underlining. Gemy is animated through position and rotation, without redrawing the character.

These original interface PNG assets, application code, documentation, and Web Audio sound synthesis code are covered by the MIT license in `LICENSE`, subject to any third-party rights. This does not extend the license to Gemy or the official iGEM logo.

No League of Legends or Riot Games assets, sounds, or source code are included. The wheel interaction is inspired by [lolPing](https://github.com/darrenprx/lolPing).

`docs/preview.png` and `docs/wheel.png` are screenshots of this application. Their embedded Gemy and iGEM artwork remains subject to the exclusions above.

For brand or artwork concerns, please open an issue in this repository. The companion and skin files can be replaced without changing application logic.

The final button and panel generation prompts are recorded in [docs/design-prompts.md](docs/design-prompts.md).

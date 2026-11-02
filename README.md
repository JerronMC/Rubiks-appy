# Rubiks Appy — by Ron

A responsive, static Rubik's Cube playground with touch controls, relaxed turn sounds, practice timer, five-round mini tournament, and a known-scramble reverser.

## Features

- Cube sizes: 2×2, 3×3, 4×4, 5×5, 10×10 and 100×100.
- Interactive canvas cube: drag to inspect, animated face turns, undo, reset and scramble.
- Mobile-first turn buttons directly below the 3D cube.
- Modes: Free Play, Easy Turns and Zen Mode.
- Generated soft turn sound using the Web Audio API (no audio files or external libraries).
- Timer with local solve records, personal best and average.
- Five-round mini tournament with average-of-5 calculation (best and worst are excluded).
- Scramble reverser for known move sequences, including `main` as a middle-slice alias.
- Color presets, per-face custom colors, corner rounding, sticker spacing and accent color.
- Optional vibration, reduced motion, fullscreen and screen wake lock (where supported).
- Local settings and records saved with `localStorage`.
- Optional service worker and web app manifest for install/offline caching.
- No bundler, npm packages, external fonts, CDNs or API keys.

## Run local tests

With Node.js installed, run `npm test` to check move inversion, sequence parsing and supported cube sizes. The published site itself does not need Node or a build step.

## Run locally

Open `index.html` in a modern browser. For ES modules and service-worker testing, use a local static server, for example:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Publish with GitHub Pages

1. Create a new GitHub repository.
2. Upload the **contents** of this folder (not only the ZIP) to the repository root. Keep the `js/` and `assets/` folders in place.
3. Open the repository's **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/ (root)` folder, then save.
6. Wait for GitHub Pages to publish the site, then open the Pages URL shown in Settings → Pages.

This project is plain static HTML/CSS/JavaScript, so no build command is required. If you publish under a project subpath, all app asset paths are relative and should continue to work.

## Notes

- Audio starts only after a user gesture because browsers restrict autoplay.
- Timer records and settings are stored on the current browser/device; they do not sync between devices.
- The solver is a **known-sequence reverser**. It applies a supplied scramble and animates its inverse; it is not a sticker-scanning or general-purpose two-phase solver.
- Very large cube sizes use a reduced visual detail mode to keep drawing responsive. The move state still tracks the full sticker set.
- Screen wake lock, vibration, fullscreen and PWA installation depend on browser/device support.

## Project structure

```text
rubiks-appy-github-pages/
├── index.html
├── styles.css
├── manifest.webmanifest
├── service-worker.js
├── README.md
├── package.json
├── tests/
│   └── cube.test.js
├── assets/
│   └── favicon.svg
└── js/
    ├── app.js
    ├── cube.js
    ├── renderer.js
    ├── sound.js
    ├── solver.js
    ├── storage.js
    └── tournament.js
```

Made for cube lovers — **Rubiks Appy by Ron**.

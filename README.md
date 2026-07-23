# SpriteForge Studio

SpriteForge Studio is a browser-based video-to-sprite-sheet editor for 2D game workflows. It imports animation clips, extracts and edits frames, removes solid-color backgrounds, packs textures, previews animation, and exports game-ready assets without sending source files to a server.

## Highlights

- Batch import for MP4, MOV, AVI, WebM, and MKV sources
- Automatic frame-gallery creation on import, with every source frame available for cherry-picking
- Live animation preview that updates immediately when frames are included, excluded, or playback speed changes
- Frame-accurate video trimming before extraction, with live in/out preview controls
- Multi-frame selection with copy, cut, paste, delete, and range-select shortcuts
- Browser-native extraction with a locally bundled FFmpeg WebAssembly fallback
- Non-destructive, worker-powered chroma key with tolerance, softness, feathering, noise cleanup, and spill suppression
- Multi-select, copy, cut, paste, delete, rename, replace, and drag-to-reorder frame editing
- Automatic or manual grids with exact top/right/bottom/left margins inside every frame, independent space between frames, sheet-edge margins, alignment, transparent trimming, and power-of-two textures
- Sprite-sheet and frame-sequence PNG export, plus ZIP packages with JSON, XML, or CSV metadata and Phaser sample code
- Source and alpha monitors, packed-sheet boundary preview, animation playback decoded directly from the generated sheet, undo/redo, keyboard controls, progress, cancellation, and persisted preferences
- Entirely client-side processing; no backend or cloud upload

## Requirements

- Node.js 20.19+ or 22.12+
- A current Chromium, Firefox, or Safari browser with WebAssembly and Web Worker support
- Enough free memory for the decoded frames and target sheet. Large 4K sequences can require several gigabytes.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:4173`. The install step copies the FFmpeg core and WASM module into `public/ffmpeg`, which keeps the decoder available offline.

Use the included “chroma-key sample” link on the welcome screen for a quick end-to-end test. Its recommended key color is `#ff00ff`.

## Production build

```bash
npm run lint
npm run build
npm run preview
```

The production application is written to `dist/`. Serve that directory as a static site. No API server is required. Because browsers restrict Web Workers and WebAssembly on `file://` pages, use any local static HTTP server for offline use.

## GitHub Pages deployment

The workflow in `.github/workflows/deploy-pages.yml` lints and builds every pull request targeting `main`. Pushes to `main` additionally publish the production artifact through GitHub Pages. The Pages build uses `/sprite-forge-studio/` as Vite's base path, including for the bundled FFmpeg runtime and sample video.

One-time repository setup:

1. Open **Settings → Pages** in `dante0747/sprite-forge-studio`.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Push the workflow to `main`, or run **Build and deploy GitHub Pages** manually from the Actions tab.

The default project-site URL is `https://dante0747.github.io/sprite-forge-studio/`.

To publish at `https://coderator.dev/sprite-forge-studio/`, use one of these configurations:

- Configure `coderator.dev` as the custom domain of the `dante0747.github.io` user site and point its DNS to GitHub Pages. GitHub then applies that domain to project sites, including this repository path.
- Keep the existing `coderator.dev` host and configure it as a reverse proxy for `/sprite-forge-studio/` to the default GitHub Pages project URL.

Do not set `coderator.dev` as a custom domain on this project repository: that would claim the domain root rather than only `/sprite-forge-studio/`. The current DNS for `coderator.dev` does not point to GitHub Pages, so one of the routing changes above is required before the requested URL can serve this deployment.

## Workflow

1. Import one or more clips, or open the included sample. SpriteForge builds a complete frame gallery automatically.
2. Move frames between the Available and Chosen Sequence rows in the curation tray while watching the independent live preview. Adjust its playback speed as needed.
3. Optionally trim the source or change the gallery density, then rebuild the gallery.
4. Sample the background in the Transparency monitor and tune the key.
5. Copy, cut, paste, remove, rename, replace, or drag chosen frames into order in the same curation tray.
6. Configure exact per-side frame margins, inter-frame spacing, sheet-edge margin, and layout, then generate the sprite sheet from the chosen sequence.
7. Preview animation decoded from the generated sheet and export a PNG, chosen-frame ZIP, or complete package.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Space` | Play or pause the active source or animation preview |
| `←` / `→` | Previous or next frame |
| `Delete` | Delete the selected/current frame |
| `Ctrl/Cmd+A` | Select all frames |
| `Shift+click` | Select a continuous frame range |
| `Ctrl/Cmd+C` | Copy selected/current frames |
| `Ctrl/Cmd+X` | Cut selected/current frames |
| `Ctrl/Cmd+V` | Paste copied frames after the selection |
| `F2` | Rename the current frame |
| `Escape` | Clear frame selection |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Y` | Redo |
| `Ctrl/Cmd+S` | Export complete ZIP package |

## Architecture

`src/context` owns editor state and per-project frame history. `src/lib` contains media decoding, FFmpeg integration, chroma processing, sheet composition, and exporters. The chroma implementation lives in `src/workers` so pixel processing does not block the editor. Components are grouped around the desktop workspace: project rail, monitor, frame strip, and property inspector.

User preferences are stored in `localStorage`. Imported media and extracted frame data remain in memory and are released when a project is removed or the tab is closed.

## Browser and codec notes

The source monitor uses the browser's native video decoder. Formats or codecs it cannot open are still eligible for extraction through the bundled FFmpeg fallback, but may not be previewable in the Source tab. Sprite generation and export remain local in either path.

The browser controls maximum canvas dimensions. SpriteForge validates oversized textures and asks you to reduce frame size or split an animation instead of failing silently.

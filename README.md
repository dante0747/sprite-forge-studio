# SpriteForge Studio

SpriteForge Studio is a browser-based video-to-sprite-sheet editor for 2D game workflows. It imports animation clips, extracts and edits frames, removes solid-color backgrounds, packs textures, previews animation, and exports game-ready assets without sending source files to a server.

## Highlights

- Batch import for MP4, MOV, AVI, WebM, and MKV sources
- Browser-native extraction with a locally bundled FFmpeg WebAssembly fallback
- Non-destructive, worker-powered chroma key with tolerance, softness, feathering, noise cleanup, and spill suppression
- Multi-select, delete, duplicate, rename, replace, and drag-to-reorder frame editing
- Automatic or manual grids, transparent trimming, alignment, padding, margins, manual cells, and power-of-two textures
- Sprite-sheet and frame-sequence PNG export, plus ZIP packages with JSON, XML, or CSV metadata and Phaser sample code
- Source and alpha monitors, packed-sheet preview, animation playback, undo/redo, keyboard controls, progress, cancellation, and persisted preferences
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

## Workflow

1. Import one or more clips, or open the included sample.
2. Choose a frame range, interval or exact count, then extract.
3. Sample the background in the Transparency monitor and tune the key.
4. Select, remove, rename, replace, duplicate, or drag frames into order.
5. Configure the layout and generate the sprite sheet.
6. Preview the packed animation and export a PNG, frame ZIP, or complete package.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Space` | Play or pause source preview |
| `←` / `→` | Previous or next frame |
| `Delete` | Delete the selected/current frame |
| `Ctrl/Cmd+A` | Select all frames |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Y` | Redo |
| `Ctrl/Cmd+S` | Export complete ZIP package |

## Architecture

`src/context` owns editor state and per-project frame history. `src/lib` contains media decoding, FFmpeg integration, chroma processing, sheet composition, and exporters. The chroma implementation lives in `src/workers` so pixel processing does not block the editor. Components are grouped around the desktop workspace: project rail, monitor, frame strip, and property inspector.

User preferences are stored in `localStorage`. Imported media and extracted frame data remain in memory and are released when a project is removed or the tab is closed.

## Browser and codec notes

The source monitor uses the browser's native video decoder. Formats or codecs it cannot open are still eligible for extraction through the bundled FFmpeg fallback, but may not be previewable in the Source tab. Sprite generation and export remain local in either path.

The browser controls maximum canvas dimensions. SpriteForge validates oversized textures and asks you to reduce frame size or split an animation instead of failing silently.

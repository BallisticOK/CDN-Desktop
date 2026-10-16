# CDN Desktop

[![Build](https://github.com/BallisticOK/CDN-Desktop/actions/workflows/build.yml/badge.svg)](https://github.com/BallisticOK/CDN-Desktop/actions/workflows/build.yml)

A Windows desktop client for CDN Platform servers (e.g. `https://cdn.0x00sec.xyz`). It lets you manage files on any number of servers without opening the web dashboard.

## Run it

```powershell
npm install
npm start          # build + launch
npm run dev        # hot-reload development mode
npm run dist       # build installer + portable exe into ./installer
```

## Download

Grab the latest installer (`CDN Desktop-Setup-x.y.z.exe`) or portable exe from the [Releases](https://github.com/BallisticOK/CDN-Desktop/releases) page. Builds from every push are also available as artifacts on the [Actions](https://github.com/BallisticOK/CDN-Desktop/actions) tab.

## Releasing a new version

```powershell
npm version patch        # bumps package.json and creates a vX.Y.Z tag
git push --follow-tags   # CI builds and publishes the GitHub release
```

## Features

- **Multiple servers**: add each CDN (URL + API key) in Settings → Servers or from the sidebar picker, and switch with `Ctrl+1…9`. Keys are encrypted with Windows DPAPI. You can import and export your server list.
- **Files**:
  - Grid or list view, folders, breadcrumbs, search (by name, ID or SHA-256), filters and sorting.
  - Multi-select (`Ctrl`/`Shift`-click), drag-and-drop to move.
  - Right-click menu: preview, download, copy link (CDN URL / path URL / signed URL / Markdown / HTML), rename, move, duplicate, visibility, cache purge, share, delete with undo.
- **Uploads**: drag files *or whole folders* from Explorer, paste with `Ctrl+V`, or use the Upload button. Files over 48 MB use the resumable chunked API with 3 parallel chunks and automatic retries.
- **Downloads**: streamed to disk with progress; download several files at once into a folder.
- **Editing**: built-in code editor for text files (syntax highlighting, `Ctrl+S`, conflict detection). Each save creates a new revision.
- **Details drawer**:
  - Links and delivery settings (visibility, cache-control, cache tags).
  - Revision history with rollback, plus uploading a new revision.
  - Share links, per-file stats and custom metadata.
  - Signed image-transform builder and video/audio rendition processing.
- **Preview**: images (zoom), video, audio, PDF and text, with arrow-key navigation.
- **Quick upload hotkey** (`Ctrl+Alt+U` by default, global): uploads the clipboard image or the copied file, then puts the link on your clipboard, ready to paste into Discord.
- **Share links**, **Recycle bin**, **Analytics**, **Cache** (purge / pre-warm / history), **Zones & domains**, **API keys**, **Webhooks**.
- **API console**: every endpoint from the server's live `openapi.json`, with a request builder, response viewer and "Copy as cURL".
- Dark/light/system theme with a custom accent colour, tray icon, and desktop notifications.

## How it talks to servers

All HTTP requests run in Electron's main process (`electron/main.cjs`) with `Authorization: Bearer <key>`. The UI never sees the raw key and is not subject to CORS. Previews of private files go through an internal `cdnx://` protocol that adds the key.

Settings live in `%APPDATA%\cdn-desktop\config.json`.

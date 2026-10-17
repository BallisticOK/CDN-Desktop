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
- **Staff sign-in**: optionally sign in with your CDN dashboard account (email, password, 2FA) for each server. This unlocks what API keys can't do: storage stats, API keys, webhooks, **Users**, **Audit log**, **Security** and **My account** (sessions, password). Only the session is kept, encrypted; the password is never stored.
- **Multi-select**: turn on **Select** mode in Files (or press Ctrl+A / Ctrl-click). Normally a click just opens folders and files. In select mode you get checkboxes, drag-a-box selection, `Ctrl`/`Shift`-click, `Ctrl+A`. Bulk download, copy links, move, visibility, purge and delete across files *and* folders. Bulk actions also on share links, users and the recycle bin.
- **Auto-update**: checks GitHub Releases on startup and every 6 hours (Settings → Updates). It detects how it was installed: the installed version updates through the installer silently, and the portable exe downloads the new portable build and replaces itself. Downloads are checked against their SHA-256 checksum.
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

## Code signing

The build workflow signs the installer automatically once a certificate is configured in **GitHub → Settings → Secrets and variables → Actions**; until then it builds unsigned (and Windows SmartScreen shows a warning).

**Option A: a code-signing certificate (.pfx)** from a CA such as Sectigo, SSL.com or DigiCert:

| Secret | Value |
| --- | --- |
| `WIN_CSC_LINK` | the .pfx file, base64-encoded: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx")) \| Set-Clipboard` |
| `WIN_CSC_KEY_PASSWORD` | the .pfx password |

**Option B: Azure Trusted Signing** (cheapest; identity-verified, about US$10/month):

| Type | Name | Value |
| --- | --- | --- |
| Secret | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | an app registration with the *Trusted Signing Certificate Profile Signer* role |
| Variable | `AZURE_SIGNING_ENDPOINT` | e.g. `https://eus.codesigning.azure.net` |
| Variable | `AZURE_SIGNING_ACCOUNT` | your Trusted Signing account name |
| Variable | `AZURE_SIGNING_PROFILE` | your certificate profile name |
| Variable | `AZURE_PUBLISHER_NAME` | the publisher name on the certificate |

The workflow verifies the signature after building and fails if it is invalid.

## License

**Source-available, not open source.** You can read the code and run the official release builds for personal use. Using the code in any way (copying, forking to build on, modifying, redistributing, commercial use) needs written permission from the owner first: just [open an issue](https://github.com/BallisticOK/CDN-Desktop/issues) and ask. See [LICENSE](LICENSE).

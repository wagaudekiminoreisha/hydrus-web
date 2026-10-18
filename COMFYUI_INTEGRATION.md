# Direct ComfyUI Gallery connection

Hydrus Web now talks directly to Gallery inside the running ComfyUI server.
There is no bridge address/token field, separate Node bridge process, or localhost-only
bootstrap. The Gallery browser tab need not be open; ComfyUI itself must be running.

## Setup

1. Update both Hydrus Web and ComfyUI-Gallery; restart ComfyUI after updating Python files.
2. Save your Hydrus API key in Hydrus Web's **Settings → API Configuration**.
3. In **ComfyUI-Gallery → Hydrus connection settings**, enable **Allow Hydrus Web to connect**, save the same key, then choose **Save connection**. The toggle is enabled by default for compatibility; disabling it blocks this connection inside ComfyUI.
4. In Hydrus Web's **Settings → ComfyUI**, enter ComfyUI's normal HTTP(S) address,
   for example `http://127.0.0.1:8188` on the same computer, or its LAN/Tailscale address.
   Choose **Save & connect**. No `/Gallery` suffix or bridge token is needed.
5. Open **ComfyUI output** to browse folders and media.

The connection is hosted inside ComfyUI; the toggle does not start another process or open another port.

The address is interpreted by the browser. On a phone, `127.0.0.1` means the phone,
so use the ComfyUI computer's reachable address. An HTTPS page may need HTTPS for
ComfyUI too because browsers can block mixed content. Authentication at a reverse
proxy remains that proxy's responsibility; this change does not bypass it.

Saved addresses reconnect automatically. While this view is open, pending Gallery
setup retries every 15 seconds; it also handles Gallery being configured later.
Unsaved address edits are not saved by background retries. The settings form stays
available when the connection fails, and network requests have bounded timeouts.

## Handshake and browser access

Gallery exposes only `/Gallery/hydrus-web/*` to this protocol. A one-use 30-second
challenge is bound to the Hydrus Web origin and Gallery installation ID. Both sides
prove possession of their saved Hydrus API key with HMAC-SHA256. The key is never
sent to ComfyUI by Hydrus Web and does not appear in media URLs. The browser uses a
bundled HMAC implementation, including on LAN HTTP pages without Web Crypto support.

Successful pairing pins the installation ID in this browser. Changing an address
retains that pin. A different installation requires explicit replacement
confirmation followed by successful proof; a mismatched key never silently pairs.
An in-memory, origin-bound one-hour bearer session authorizes output requests.
Expired sessions re-handshake automatically, and rotating Gallery's Hydrus key
invalidates sessions and media tickets. Media links authorize only one file and
representation, expire after five minutes or at session expiry, and support range
requests for playback. Reopening a file obtains a new link.

Gallery's scoped middleware handles this authenticated protocol before ComfyUI's
normal cross-site guard. That guard still protects all unrelated ComfyUI routes;
no global `--enable-cors-header '*'` flag is necessary. Output browsing uses the
actual ComfyUI output root, with shallow listings, pagination, lazy thumbnails,
media-only file access and path confinement. It does not scan generation metadata.

## Launching and existing features

- `npm start` builds/watches local source and runs the development server.
- `npm run mobile` builds and serves the production frontend.
- `npm run mobile:serve` serves the existing production build.
- Electron serves its bundled frontend. It no longer starts a private Node bridge.

None of these commands pulls Git updates. After applying a snapshot to a production
build, restart its server and hard-refresh the browser/PWA to load the new files.
This direct connection also works from other static deployments when their browser
can reach ComfyUI.

The current ComfyUI entry remains an output-folder browser. Hydrus search/export/tag
controls remain deferred. The old Node import-folder scheduler and its saved rules
are retained in source/data for compatibility, but normal app launch no longer
starts that scheduler and its bridge-only configuration is removed from the UI.
Gallery's own Hydrus features remain available in Gallery.

Validation: production Angular build; real Python Gallery endpoint in a cross-origin
Chrome check covering delayed Gallery setup, mismatched keys, session renewal,
installation replacement, folder navigation, 120-file paging, preview/original
loading and mobile layout; Python tests for scoped origin handling, challenge replay,
key rotation, media ranges and traversal protection. Older browser fixtures targeting
the Node bootstrap are historical; `scripts/browser-direct-gallery.cjs` covers the
current architecture. This fixture uses temporary media and test credentials.

If the page only says it is not connected, check the saved-address message and
visible error in Settings. A Gallery installation before commit `d82aa5a` has no
direct endpoint: its ordinary Gallery can work while Hydrus Web cannot connect.
Update the actual `ComfyUI/custom_nodes/ComfyUI-Gallery` checkout and restart ComfyUI;
updating the development checkout alone does not update that installation.

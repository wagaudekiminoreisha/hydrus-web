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
5. Open **ComfyUI media** to browse folders, local files, Hydrus or the Hybrid view.

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

## Regular search and native gallery controls

In the normal **Browse** search menu, open **Search Options → Include ComfyUI results**.
This is opt-in and saved in this browser. With it off, the ordinary Hydrus search path
is unchanged. With it on, the existing tag field accepts local positive prompt tags,
exclusions, OR groups and `@prefix name` alongside Hydrus results. Copies already in the
Hydrus result are shown once; matching Hydrus tags also participate in local matching.
Hydrus keeps its selected sort and service/domain filters; additional local results
are appended in output-date order. Unsupported Hydrus system predicates conservatively
exclude local-only files and show a notice. Limits apply to the combined result.

The regular result context menu's **Related images** action opens the lineage,
snapshot and other-prefix scopes in Browse itself. Prefix/provenance searches inspect
remote generation notes and may take longer than ordinary tag searches. Cancelling or
replacing the search stops further page requests. Gallery being offline does not remove
ordinary Hydrus results; the status explains why local results could not be added.

The ComfyUI browser now uses the same virtualized grid, selection groups, context menus,
file-information sheet, PhotoSwipe zoom/keyboard/touch controls, download tray and
slideshow as Browse. The prototype viewer is removed. More pages are requested near
the end of the viewer, so browsing and slideshows continue beyond the first output page.
Duplicate files in different output paths keep separate browsing identities; hybrid
search deduplicates content hashes. Local-only files have read-only prompt metadata;
Hydrus writes and view-statistic submissions are not sent for those files. Native
selection download controls work for both sources. ComfyUI media tickets are renewed
when expired or when the authenticated connection changes.

## Hybrid viewing and prefix/provenance controls

**Output folders** keeps the shallow remote output-directory browser. **Local** searches
all nonarchived media below ComfyUI output. **Hydrus** browses the saved Hydrus API
connection independently. **Hybrid** merges local and Hydrus copies by SHA-256,
adds matching Hydrus tags and portable generation notes, and uses the existing Hydrus
copy for native Hydrus controls when it is available.
Switching source tabs clears selection; opening the viewer retains it.

Search accepts comma-separated exact tags, `-excluded tag` and `@prefix name`.
Multiple prefix tokens are AND requirements. Local prompt tags come from positive
conditioning and the encoder's saved resolved choices, never the unchosen alternatives.
Choose a named prefix or snapshot to narrow loaded results. More media and metadata
load as the scroll sentinel becomes visible, in pages of at most 100; filtered views
continue scanning even if an early page has no matches. Counts show the loaded subset,
not an assertion that the whole collection has been indexed.

Drop an image onto the browser, use **Find by image**, or choose **Related images**
on a card to match its content hash. **Related images** starts with lineage: the image, its ancestors, and generations from
it or its source images. The result controls can additionally show snapshot membership
or **Other prefix associations**. Other prefix associations subtract that entire source
family from prefix results. These checks use content hashes, Gallery source manifests,
the shared prefix library, and `gallery_associations` in Hydrus generation notes.
Older exports without portable associations still resolve if their hashes are in the
connected Gallery library. Full remote relationships can emerge as further pages load.

Select images to save or remove their direct prefix pairings. This updates Gallery's
user-scoped library with a revision check, without editing prompt recipes, snapshots or
historical generation metadata. A stale library produces a conflict; search again to
reload it. Existing snapshot and inherited provenance references remain visible after
removing a direct pairing. Pairing changes are not automatically written back to old
Hydrus generation notes; Gallery's existing export/metadata sync performs that transfer.

The scoped authenticated `/library`, `/catalogue`, and `/association` routes run inside
ComfyUI. Catalogue paging snapshots its path list for ten minutes and binds it to the
session, so new generations do not shift the remaining pages. Paths are confined to
output; hidden directories, symlinks/junctions, physical `_archive` and user-scoped
virtual archive membership are excluded. Metadata and hashes are read one page at a time.
No separate bridge process is required. Update Gallery Python files and restart ComfyUI.

Hydrus export/tag tools and the old Node import-folder scheduler are not exposed in
this browser. Their compatibility code and existing data remain in source.

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

Hybrid validation: `node --test scripts/media-relations.test.cjs`, the Gallery direct-connection Python tests, and `scripts/browser-hybrid-gallery.cjs` against the isolated Gallery/Hydrus fixture.

Native integration validation: `scripts/browser-native-hybrid.cjs` uses the Gallery fixture with `GALLERY_NATIVE_QA=1` and `GALLERY_DIRECT_QA=1`. It verifies the regular search menu, prefix/provenance scopes, local-only media, native viewer and selection safety, plus page-boundary navigation.

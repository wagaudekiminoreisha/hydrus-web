# ComfyUI integration and automatic import folders

Update ComfyUI-Gallery as well as Hydrus Web. Restart ComfyUI so the new metadata/provenance routes are available. The integration workspace appears in navigation after a successful setup; ordinary Hydrus browsing remains available independently.

**ComfyUI** is a separate, always-visible navigation entry for Gallery images and videos. It reconnects to the saved bridge and loads ComfyUI media when opened; Hydrus credentials are not required for browsing. For a new connection, use **Integration settings & import folders** to save the ComfyUI address, then return to **ComfyUI**. It starts with ComfyUI media; Source and Prefix / lineage can switch to Gallery targets or mixed Hydrus views. The integration workspace remains available for transfers and import-folder configuration.

## Desktop setup

The Windows/Electron application starts its private integration bridge automatically while the app runs. Open **Settings → Set up ComfyUI integration & automatic import folders**. The bridge address and token are supplied by the desktop application. Click **Connect**, fill in the ComfyUI and Hydrus addresses, provide the Hydrus API key, and save. Choose a local tag service and save again after the services load.

The desktop bridge saves configuration and import history in the application's user-data directory under `integration`. Import-folder scans run while the desktop app is open. Pausing/removing a rule never deletes original media. Hiding integration controls only changes this client’s navigation; use Pause on a folder rule to stop its imports.

## Browser, iOS and iPadOS setup

Run the bridge on the computer that has access to the directories you want to import. It requires Node.js 20 or newer and uses built-in Node modules; no separate package installation is needed for the bridge scripts.

From the Hydrus Web repository in PowerShell:

```powershell
$env:HYDRUS_WEB_BRIDGE_TOKEN = (node -p "require('node:crypto').randomBytes(32).toString('hex')")
$env:HYDRUS_WEB_BRIDGE_ORIGINS = 'http://localhost:8080,http://localhost:4200,capacitor://localhost,http://localhost'
npm start
# Or serve the production build: npm run mobile:serve
```

Dev mode (`npm start`, including `start:ssl`) and production server mode (`mobile` / `mobile:serve`) manage the bridge when `HYDRUS_WEB_BRIDGE_TOKEN` is configured. Without it, they serve Hydrus Web normally. Reuse the same private token in subsequent sessions. A port conflict fails startup instead of adopting another bridge. The standalone `npm run integration` command remains available. No public bootstrap endpoint exposes credentials.

The default address is `http://127.0.0.1:47838`. Enter this address and the value of `HYDRUS_WEB_BRIDGE_TOKEN` in Hydrus Web's integration setup. If your web app has another origin, include its exact scheme, hostname and port in `HYDRUS_WEB_BRIDGE_ORIGINS`. `capacitor://localhost` is the iOS wrapper's origin.

For a phone/tablet, publish the bridge over Tailscale HTTPS from another terminal:

```powershell
tailscale serve --bg --https=8443 http://127.0.0.1:47838
```

Use the HTTPS address printed by Tailscale, including `:8443`, as the bridge address. A web/PWA deployment's own HTTPS origin must also be allowed by the bridge; the native iOS origin above is already listed. Keep the bridge process running. `tailscale serve` runs the HTTPS proxy in the background, not the Node process. See the [Tailscale Serve reference](https://tailscale.com/docs/reference/tailscale-cli/serve).

Configuration and completed-import signatures are saved in `~/.hydrus-web-integration`; set `HYDRUS_WEB_BRIDGE_DATA` to use another directory. The Hydrus key is stored on the bridge and excluded from configuration responses. Media uses temporary per-file streaming links; the permanent bridge token is not embedded in media URLs. Hydrus and ComfyUI addresses are interpreted on the bridge computer, so `127.0.0.1` can be used when they run alongside it.

## Connection diagnostics and pairing

After saving the ComfyUI address, inspect **ComfyUI connection diagnostics**. It checks Gallery's identity endpoint, catalogue and one real media stream. A healthy bridge alone does not prove ComfyUI is reachable. If the catalogue and static media roots differ, start Gallery's monitor for the selected folder from ComfyUI; Hydrus Web does not change the monitor configuration.

Select **Pair this Gallery instance for transfers** after checking the displayed installation ID. Gallery persists this non-secret ID in its ComfyUI user directory as `gallery-instance-id`. Keep that file across upgrades; separate installations need separate IDs. Transfers verify the paired identity and include an expected-instance header that Gallery checks before processing requests, including uploads. A reverse proxy that changes installations causes a failure. Redirects are rejected. Pairing a replacement clears cached search assets; refresh the search afterward. Older Gallery versions must be updated and ComfyUI restarted before pairing works.

## Import folders

Open **Automatic import folders**, enter an absolute directory on the bridge computer, then select recursive scanning, fixed tags, the inherited tag prefix, optional prefix association, and archive behavior. Save the rule. A file must have the same size and modification time in two scans before it imports. Completed imports survive restarts; tagging/note failures are retried before a file is marked complete. Originals are retained, symlinks are skipped, and imports are limited to 512 MB per file.

**Inherit PNG prompts** reads ComfyUI's PNG metadata. Prompt inheritance adds the standalone `comfyui outputs` tag alongside `positive_prompt:` and `negative_prompt:` tags. An optional custom inherited-tag prefix applies only when explicitly configured. Choosing a prefix associates the imported Hydrus hash with that prefix in ComfyUI-Gallery.

Uncheck **Automatically import this directory** to configure a local download folder for viewing/export without automatic imports. Paused folders remain available in **Configured local folders**. Scanning is handled by this bridge; it does not create or change the main Hydrus client's native import-folder objects, which its public API does not expose.

## Media and metadata

Choose Hydrus, ComfyUI, both, or configured local folders. Sort by date, name, or random order. Prefix/lineage search uses saved prefix IDs, paired hashes and generated source links, including Hydrus originals whose tags do not match prefix prompt words. The UI loads 48 files per cursor page and continues beyond 200 files. Hydrus metadata requests are bounded at 200; prefix results fetch bounded metadata batches once to establish global date order. Gallery supplies a complete catalogue once per search. Thumbnails and media load on demand.

Select media to export it to Hydrus, sync its prompts/tags to an existing Hydrus file, or copy Hydrus media to ComfyUI input. Exports preserve available metadata as a Hydrus note. Image copies retain their Hydrus origin; video copies use the Gallery provenance endpoint. Media copied to input is not automatically inserted into a running workflow.

ComfyUI must be online for its gallery, prefixes and transfers. Hydrus browsing and configured local folders remain usable when ComfyUI is offline. PNG prompts can be inherited from local download folders independently of ComfyUI. API permissions must cover the actions selected: importing, reading files, writing tags, and writing notes as applicable.

## Tags and relationships

Add, remove or replace tags on selected Hydrus files. Look up parents and aliases remotely. Parent/alias definitions are read-only because the [published Hydrus API](https://hydrusnetwork.github.io/hydrus/developer_api.html) exposes relationship lookup but no relationship-write endpoint. Define those relationships in the main Hydrus client.

## Touch and playback

Hold a thumbnail to select it; tap further thumbnails to extend selection. Moving your finger cancels the hold so ordinary scrolling is preserved. Controls have larger touch targets, media plays inline on iOS, and the viewer honors safe-area insets.

Enable **Play next / slideshow** in **Settings → File Viewing**, and choose the image interval. Videos/audio advance when playback ends; images advance after loading and waiting for the selected interval. The viewer's Play next/Pause control toggles this during a session. Play next overrides media looping and stops at the final item. Backgrounding or closing the viewer clears image timers. Mobile browsers may require a tap on the native Play control before allowing unmuted playback.

## Validation

`npm run build`, `npm run test:integration`, and the browser fixtures in `scripts/browser-integration.cjs` / `scripts/browser-playback.cjs` cover imports, retries, saved deduplication, hash-based lineage, metadata transfer, streaming permissions, mobile interactions and playback cleanup. Browser fixtures require Playwright, Chrome, and a built app served on port 8192. They use simulated Hydrus data and a touch-enabled Chromium browser; physical iOS/iPadOS device validation remains separate. The isolated Windows desktop fixture in `scripts/desktop-integration.cjs` also verifies the automatic private bridge and its origin restrictions.

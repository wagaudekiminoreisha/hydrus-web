# Windows handoff — 2026-10-17

The user requested moving this work from Mac.fritz.box to the connected Windows PC (Betül). Continue development there; avoid heavy builds on the Mac, which has been constrained by swap/disk space and iCloud hydration timeouts.

## Repositories

- Hydrus Web: https://github.com/wagaudekiminoreisha/hydrus-web — this handoff branch is based on codex/comfyui-browser / f765e0b. Existing PC checkout reported by the user: `C:\Users\Betül Baskak\Desktop\Ancillary\hydrus-web`.
- Gallery: https://github.com/wagaudekiminoreisha/ComfyUI-Gallery — use the repository's current default branch. No Gallery implementation changes have been made in this chat yet. Earlier instructions to leave Gallery alone were superseded by the user's explicit requests below.

## Work already committed before this handoff

f765e0b fixes the integration bridge error handler (ERR_HTTP_HEADERS_SENT) and adds an always-visible ComfyUI navigation route, /comfyui, which uses the saved bridge connection and searches ComfyUI only. This was pushed to codex/comfyui-browser, not merged into dev.

## Pagination work carried in this branch: implementation needs review and UI validation

Recovered from the verified Mac backup. Adds 48-item cursor pages for Gallery/Hydrus/mixed/local-folder browsing, bounded Hydrus metadata requests, stable cached search sessions and retries, local PNG metadata on demand, viewport-triggered loading and thumbnails, protection against stale results, viewer Next across page boundaries, and batches of 200 for tag edits.

17 integration tests passed, including collections beyond 200 files, mixed ordering, cursor retries, local-folder pagination, and session expiration. Full Angular build and browser checks remain unfinished due to Mac resource/file-access failures. scripts/browser-pagination.cjs is included but has not run. The original browser fixture should also be rerun. Do not describe this WIP as fully verified. Gallery's catalogue endpoint still returns a complete metadata index; paging avoids repeatedly fetching it and avoids eager media/thumbnail downloads. Audit prefix-specific ordering and behavior along with normal searches.

## Latest user requests — implement all five

1. Hydrus Web must keep desktop video playing on Alt+Tab. Inspect src/app/photoswipe.service.ts: visibilitychange currently pauses .pswp-media unconditionally. Keep sensible mobile behavior and slideshow timer cleanup; desktop switching applications should not pause video.
2. Verify ComfyUI accessibility, not just the integration bridge's health. The conspicuous ComfyUI tab must act as a file browser after configuration, show useful connection/media diagnostics and actual files, and then support searching Gallery targets and mixed views. Existing /comfyui route and pagination are a starting point, not proof the user's live connection works. Gallery static media root may depend on its monitor configuration; inspect both sides.
3. Gallery PromptBoxEditor has redundant Box format and Convert selection controls. Use one coherent conversion control, infer the current format from parsed content on append/edit, and express tag/group kinds with box/chip colours. Do not require manually flagging boxes as tags. Preserve loaded workflows' compiled prompt semantics, including legacy box.format values, weights, disabled chips and mixed content.
4. Gallery floating windows need reliable hierarchy: actions from the viewer/right wing (prefix, metadata, Hydrus export) must bring the called window above the viewer even if already open. FloatingPanel.tsx currently ignores its zIndex prop, directly reassigns z-index 3010/3070, and only raises on open changing; repeated requests for an already-open window are an important case. Include child menus/dialogs and maximized viewer behavior.
5. Hydrus dev/server mode should manage the bridge automatically when integration is configured, rather than requiring a separate terminal. npm start currently runs ng serve; scripts/serve-mobile.mjs serves builds but does not start the bridge. Desktop Electron has its own private bootstrap already. Make connection/setup conditional and safe; implement a two-sided handshake or stable instance verification so switching a URL/reverse proxy to another ComfyUI instance cannot silently route transfers to it. Do not add unauthenticated public control endpoints or expose permanent tokens in media URLs.

## Useful Gallery files identified

web/src/PromptBoxEditor.tsx, web/src/PromptBoxes.ts, web/src/FloatingPanel.tsx, web/src/UnifiedGallery.tsx, web/src/ImageInfo.tsx, web/src/HydrusContext.tsx, web/src/HydrusExportModal.tsx, web/src/ComfyAppApi.ts; Python server.py, image_source_api.py and prefix_library.py. Gallery has existing tests/prompt_boxes.test.cjs and browser fixtures. Its web dependencies were not installed on Mac.

## Working practices

Preserve any PC-only changes and existing ComfyUI installations. Never reset/overwrite a dirty Windows checkout to apply this branch: use a fresh clone or reconcile edits. Do not publish releases or update the default branch as part of the handoff. The user wants code carried and execution moved to Windows. They must select the Windows run location in the app; the chat cannot hand itself off using its own handoff tool.

# Unified Gallery — product specification and engineering handoff

Prepared 18 October 2026, Europe/Berlin. This is a build brief for a new application, a record of the two existing projects, and a migration contract. The companion [capability ledger](UNIFIED_GALLERY_CAPABILITIES.csv) provides an initial implementation tracker; all destination entries start as not built. It is not a claim that the replacement has already been implemented.

## 1. Mandate for the next Codex session

Build an independent, modular, cross-platform media library and creative gallery. The destination is a full Hydrus-class client with the browsing, customization, prompt editing, provenance and workflow ergonomics developed in Hydrus Web and ComfyUI-Gallery.

The application must eventually own its library, tags, relationships, search, imports, jobs and maintenance. Hydrus is a migration source and optional external provider, not the permanent database or hidden engine. ComfyUI is initially a connected output browser and metadata provider. Moving model inference and other local AI facilities into the application is a later capability; keep a clean place for it without making the first usable library depend on a GPU or model installation.

The user explicitly permits creative freedom in GUI design and replacing awkward historical implementations with better designs. Preserve the meaning of features and saved data, not accidental layouts, framework constraints or workarounds. A Figma design may arrive later: visual structure must be replaceable without rewriting the library, search or prompt engines.

Do not interpret this as permission to replace the user's production libraries, delete source media, edit a live Hydrus database, force-push repositories, or migrate credentials automatically. Develop against isolated fixtures and a new application data directory. Keep the current applications usable during the transition.

**First objective:** a real standalone local library, safe Hydrus import, and the existing ComfyUI output browsing experience in one coherent application. **Final objective:** the broader Hydrus client capability set in section 6, with deliberate module boundaries. A viewer connected to Hydrus is an intermediate milestone, not completion.

### Execution instructions

1. Read this document and the source map before choosing implementation details. Inspect current checkouts and preserve local changes.
2. Create a separate repository/workspace for the replacement when implementation is authorized. Do not turn either reference project into an unreviewable experimental rewrite.
3. Write architecture decisions and a capability ledger. Prove the desktop media, drag/drop, database and packaging paths with small working spikes.
4. Build complete vertical slices, beginning with import → durable catalog → search → gallery → viewer → metadata edit → restart recovery.
5. Keep behavior, migration and performance tests executable. Report which capabilities are implemented, adapted, partially migrated, unsupported or deferred.
6. Keep moving through reversible implementation choices. Seek clarification for genuinely missing product decisions, not every layout or internal abstraction.
7. Do not spend the initial effort on a decorative shell, extensive plugin infrastructure or an AI settings page while basic media management remains nonfunctional.

## 2. Reference repositories and authority

| Project | Reference at preparation | Purpose |
|---|---|---|
| Hydrus Web | [wagaudekiminoreisha/hydrus-web](https://github.com/wagaudekiminoreisha/hydrus-web), branch `codex/windows-handoff`, `cfddc7f` | Angular client, native gallery interactions, selection groups, regular-search hybrid integration, ComfyUI connection and context actions. |
| ComfyUI-Gallery | [wagaudekiminoreisha/ComfyUI-Gallery](https://github.com/wagaudekiminoreisha/ComfyUI-Gallery), branch `codex/windows-integration`, `e14d14b` | React/TypeScript gallery, Python integration, prompt library/editor, source images, rules, archives, transfer and provenance behavior. |
| Hydrus Network | Upstream client and official documentation, version to be pinned during implementation | Functional reference and migration source. Its complete behavior is not implemented by either reference frontend. |

Local Windows locations at preparation:

- Hydrus Web: `C:\Users\Betül Baskak\Desktop\Ancillary\hydrus-web`.
- Gallery development checkout: `<hydrus-web>\.work\ComfyUI-Gallery` — a separate Git repository, not part of the parent repository's source tree.
- Installed Gallery: `C:\ComfyUI_windows_portable\ComfyUI\custom_nodes\ComfyUI-Gallery`.
- Snapshot ZIPs: `<hydrus-web>\.work\snapshots`.
- Known app addresses: Hydrus Web `http://localhost:8080`; ComfyUI `http://127.0.0.1:8188`. These are machine-specific connection settings, not constants for the new app.

The source checkouts, production custom node and running process are different things. Installing files does not reload Python; building a frontend does not force an already-open browser to refresh. The latest ruleset change is frontend-only. Earlier source-exclusion changes also require the new Python node input. A running ComfyUI process may lag installed files if it was busy generating. Recheck runtime state rather than claiming a feature is live from a commit alone.

### Evidence and historical contradictions

The inventory below is grounded in present source, project documentation and recent targeted tests. It is not an exhaustive live-platform certification. Some old Markdown files describe superseded behavior. Resolve conflicts using current code, the latest user decisions recorded here, and reproducible tests.

In particular: the separate Node bridge is historical; configuration belongs in Settings; the ComfyUI entry is a browser; hybrid search belongs in ordinary Browse; the old implicit mutually-exclusive-tag system is retired in favor of rulesets; source additions do not silently rewrite parent prefixes; source omissions are now per image; and tag groups must remain structured everywhere.

The user reported actual production failures after fixture tests passed. Two recent examples were a string-versus-`Path` mismatch in the direct library endpoint and an empty negative prompt becoming `[""]` in snapshot requests. Preserve those regressions as tests and test realistic boundary types, not only ideal fixtures.

## 3. What Hydrus Web currently contributes

These are existing frontend capabilities, subject to API permissions and provider support. They should inform the new client without forcing it to keep Angular, Electron, Capacitor or Hydrus file identifiers.

### Library browsing, search and navigation

- Ordinary tag search with autocomplete, negative conditions, grouped OR conditions and Hydrus system predicates; service/domain selection and sorting.
- Default search configuration, favorite tags, recent search history and reusable search context.
- A virtualized thumbnail grid with lazy metadata/media access, file information, thumbnail placeholders and selection controls.
- Hydrus pages: list/open existing pages and the supported page-management actions; URL submission and file upload workflows.
- Named, colored selection groups, multiple memberships, an active group, group-aware searching and per-group download destinations. Persistent groups are different from transient current-view selection.
- File/context operations such as download, sharing where supported, original opening, archive/inbox, trash/undelete and tag management. Available actions depend on the selected media and permissions.
- Metadata interfaces for tags by service, ratings, notes, URLs, file facts and generation metadata. Rating models include like/dislike, numerical and increment/decrement services.

### Viewer and media experience

- One normal gallery/viewer interaction system for thumbnails and fullscreen media, using PhotoSwipe in the current implementation.
- Previous/next, slideshow, playback options, looping, muting, autoplay and play-next settings; slideshow cleanup when the viewer closes.
- Navigation can request more results beyond the initial loaded page. The end of a page is not the end of the library.
- Selection membership and selection actions remain available in the viewer. Context menus and file info use the same media identity as the grid.
- Desktop Alt+Tab must not arbitrarily stop video. Mobile lifecycle and actual viewer-close behavior may differ deliberately.
- Theme color/variant settings and responsive browser/mobile layouts.

### ComfyUI and hybrid browsing

- ComfyUI output root/subfolder browsing with root/up navigation, sorting, refresh, paginated files and authenticated thumbnail/original access.
- Normal Browse has an explicit **Include ComfyUI results** option. A separate search menu must not be required for the hybrid use case.
- Hydrus and ComfyUI results share normal grid, selection, viewer, slideshow, metadata and download controls. The prototype plain remote viewer was replaced.
- Content-hash matching merges equivalent local/Hydrus copies in mixed results while preserving their locations and capabilities. Files sharing bytes in distinct folders can still be distinguished in folder navigation.
- Local-only items do not get fictitious Hydrus mutation rights or Hydrus inbox state. The current negative internal IDs are an adapter workaround; do not carry them into the new domain model.
- Exact normalized used-tag matching, prefix predicates and provenance scopes for supported local/hybrid queries. Unsupported Hydrus-only predicates are not secretly treated as local matches.
- A file's relevant ComfyUI metadata enables source/lineage, other-prefix and snapshot searches; copying resolved positive tags or workflow JSON; and inspecting generation details. Plain Hydrus media does not receive irrelevant ComfyUI menu items.
- Related searches open in regular Browse with the requested scope. Metadata imported from Hydrus generation notes can enable the same actions as a direct local generation.

### Existing integration settings worth preserving as optional modules

Current settings/source include external reverse-image search, sharing links, IPFS URL handling, an optional Photopea integration, view-statistics reporting, URL submission options and upload filename tagging. Audit and retain useful behavior behind explicit provider modules; do not make those external services prerequisites for the local app.

Hydrus Web currently has PWA, Capacitor mobile and Electron Windows packaging paths. Their existence is not proof that a new Flutter/native implementation already works on those targets.

## 4. What ComfyUI-Gallery currently contributes

### 4.1 Workspace and media operations

- A full-width Gallery workspace alongside workflow tabs; a compact sidebar launcher rather than the entire application compressed into a sidebar.
- Local, Hydrus and Both modes, folder navigation, media/session views, sorting, randomization, adjustable thumbnails, virtualized grids and lazy thumbnail/original loading.
- Per-mode query, filtering, ordering, results and scroll memory during a workspace session. Changing source/result tabs clears temporary selection; opening a tool dialog preserves it.
- Card checkboxes, range/multiple selection, selection-only bulk actions, viewer navigation, context menus and transfer progress.
- Image/video/GIF viewing and inherited support for audio and several 3D formats. Audit actual decoders, format coverage and platform support before promising parity; image/video are the first required playback path.
- Temporary execution previews hidden by default, with an explicit way to reveal them; persistent outputs and transient previews are different categories.
- Folder moves, original downloads, batch downloads/deletion and configurable monitoring. The replacement should use native streaming jobs instead of building huge ZIPs in browser memory.
- Metadata inspection with parsed values, searchable fields, raw JSON and prompt/seed/model/workflow access when present. Unsupported custom node layouts remain a real case.

### 4.2 Prompt library, prefixes and association editing

- A shared library of reusable tag recipes called **prefixes**. A prefix can contain positive and negative terms and nested references to other prefixes.
- A vocabulary/palette with offline Danbooru tag data, categories/wiki group filters, counts, aliases, favorites, search and insertion modes. Counts are dictionary statistics, not the user's own file counts.
- Prefixes can be created/edited from image prompts, source recipes and selected tags. Their names and associations remain editable/removable.
- **Prefix associations** and **Append images and prompts** are separate tasks. Appending should be compact; the full tag palette/editor opens on demand.
- Existing prefix/snapshot associations are discoverable on an image. Both prompt polarities can be loaded. Manually added downstream tags must not silently become the source recipe.
- Source-only display defaults on when editing image associations. Additional downstream prompt contributions are available for deliberate copying, not automatic propagation.
- A compact snapshot rail exposes variants without flooding the entire library with near-duplicate prefix cards. Creating a snapshot is an explicit available action, in addition to automatic queue-time capture.
- Library search belongs with the prefix/prompt library, not as another unexplained main-gallery search button.

### 4.3 Structured prompt editing is a shared language

The encoder, prefix editor, image append controls and metadata views must agree on the same underlying structure. This has repeatedly regressed when a whole recipe was treated as one tag string.

| Structure | Example | Meaning |
|---|---|---|
| Sequence / AND | `blonde hair, blue eyes` | Both contributions. |
| Alternative / OR | `{short hair|long hair}` | One branch. |
| Optional alternative | `{short hair|long hair|}` | One branch or no branch. |
| Optional group | `{short hair, blue eyes|}` | The whole branch or nothing. |
| Optional each | `{short hair|}, {blue eyes|}` | Independent optional decisions. |
| Weight | `(blue eyes:1.2)` | Preserve weight and its target. |
| Emphasis | `(blue eyes)` / `[blue eyes]` | Preserve bracket semantics. |

- Chips preserve nesting, group membership, behavior, weight, enable state and prefix identity during copy/paste, append and drag/drop.
- Every relevant editable surface accepts serialized prompt syntax and appends parsed content. Metadata is selectable/copyable/draggable but read-only.
- Unused sampled alternatives are struck through and excluded from copying **used tags**. Copying a **template** remains a separate explicit action.
- Whole groups and individual members can be dragged with sufficiently large targets. Moving within an editable surface differs from copying across editors or from read-only metadata.
- Boxes and groups collapse independently. Clicking a group header toggles disclosure; the category/behavior control changes behavior. The two hit targets must not fight each other.
- The behavior dropdown shows the current behavior or mixed state. Whole-box behavior applies without first selecting every chip. Selection-level actions are distinct.
- Default box numbers follow current order after insertion, movement and deletion; internal identity and user-assigned names remain stable.
- Prompt preview shows logical relationships, not just an unstructured pile of chips. Counts include leaf tags inside groups; retained/total and strike-through explain filtering.
- Typed uppercase AND/OR/OPT helpers and direct syntax entry coexist with autocomplete. Do not alter normal tag names containing those words in lowercase.
- Node/editor height settles to content and shrinks after deletion, with a bounded internal scroller rather than an indefinitely growing canvas node.
- Pointer feedback, border colors, trash target and drag affordances update immediately where the host allows it. The new standalone UI should not inherit LiteGraph sizing/dirty-canvas workarounds.

### 4.4 Recipes, snapshots and provenance

Keep these separate:

1. A **media asset** is the original file identity.
2. A **source image contribution** is a particular image and its chosen prompt contribution in a workflow.
3. A **prefix** is a shared named recipe.
4. A **snapshot** is an immutable variant of a prefix's recipe/policies.
5. A **generation run** records what was actually sampled and encoded.

Multiple original pictures can share a prefix. Identical recipe variants consolidate and accumulate members; changing one image's source recipe must not rewrite every prefixed image. Snapshot identity includes meaningful positive/negative recipe structure, rules and hair configuration. Actual sampled choices belong to the run, not the unresolved recipe.

Queueing a prefix-linked encoder/source can capture a variant. Canonically identical variants reuse a snapshot. A recipe identical to the parent can remain a parent association. Editing snapshot tags creates/reuses another immutable variant. Historical references must not point at a mutable object that later changes meaning.

Image-related search starts with the source family. Broader prefix results are opt-in and mean **associated images minus the queried source family**, including its ancestors and descendants/same-source relatives. Snapshot association is another independent scope. Do not confuse byte duplicates, similar images, shared recipes and generated-from relationships.

The current portable generation note includes local prefix identity/recipe/snapshot references. This is metadata, not automatic creation of a literal Hydrus tag named after the prefix.

### 4.5 Source images and per-image omissions

- Gallery Image Source accepts local/Hydrus pictures, manages source history, and provides image/mask/dimension/prompt/metadata outputs plus a separate batch image output.
- Pick sources visually; crop using rectangle or pixel controls; compose horizontally, vertically or as a grid; retain source references and transformation settings.
- Appending can replace/prepend/append prompt contributions while preserving positive/negative sides and group behavior. Workflow input copies are an internal transport requirement, not a separate legacy user download mode.
- **Left out** tags now belong to a source image and prompt side. Switching A → B → A restores each image's own omissions. In a multi-image layout, choose the image whose omissions are being edited.
- Omitting `blue eyes` from A must not remove B's `blue eyes`. This applies to preview, encoded prompt and prefix snapshot capture.
- Preserve per-image omissions through workflow save/reload. Generic text sources without image identity may retain an explicitly shared omission list.
- Old shared omissions cannot be attributed retrospectively. The current compatibility behavior binds them once to the currently visible image, or the first image in a combined layout. Expose this migration decision instead of implying the historical provenance was recovered.
- Empty positive/negative sides are empty lists, not blank tags. Keep empty branches *inside* optional syntax.

### 4.6 Rules, protections and compatibility review

- Reusable, editable ruleset definitions, private prefix/snapshot rules, global encoder defaults, inherited prefix policies and encoder overrides.
- Ruleset cards can be added, removed, enabled, reordered and collapsed. Hair prompting is an optional addable/removable policy too.
- The current ruleset picker prevents another active copy of the same definition in the same policy channel; adding a disabled definition reuses its card/preferences. Independent channels are intentional, not accidental duplicates.
- A **family** is an override key. A **channel** controls whether policies override or combine. Neither creates a subject, body region, object owner or spatial conditioning region.
- Precedence within a family/channel: global → prefix → snapshot → encoder. Independent channels combine; contradictory instructions require explicit resolution.
- Linked tag/source boxes can opt out of inherited prefix rules. That does not disable an explicit encoder-level policy applied to the composed prompt.
- Visual tree editing for conditions and actions, with advanced declarative JSON as an escape hatch. Conditions include TAG, ALL/AND, ANY/OR and NOT. They inspect the sampled input before rule actions, avoiding accidental action-order triggers.
- Actions include EXCLUDE, ADD/require, deterministic PICK ONE, AT MOST ONE, and PROTECT for batch editing. Protections are not claims that a tag can never be edited individually.
- Show affected tag pools as chips inside disclosures. Use readable colored logical badges and show intersections/current matches, kept terms and omitted terms near each preference.
- Preserve pinning/versioning: editing a reusable definition does not silently rewrite every saved run. Reloading global defaults is explicit for existing encoders.
- Legacy blacklist → Protect migration and old exclusive-tag sets → AT MOST ONE migration remain available. Do not resurrect a second competing implicit exclusive-tag engine.

The bundled definitions currently cover Hair, Pose, Eyes, Expression, Framing and viewpoint, Subject counts, Hair arrangement and texture, Skin appearance, Lighting, Background, Clothing layers, Clothing pattern, Accessories, Footwear, Chest attributes, Nudity tags, Adult act tags, Common batch protections and Compatibility advisory. Audit each definition and preference rather than replacing this pack with two demonstration rules.

**Hair policy:** Specific keeps supplied tags; Natural omits recognized scalp-hair appearance tags; Minimal keeps selected attribute categories. Categories include length, color, distribution, presence, arrangement, texture, details, alteration, bangs length and material. AND keeps the selected categories; EITHER samples one selected category per queued prompt. Single-color review warns rather than bans multicolored hair. Accessories, body/facial hair and unknown prose are not blindly removed.

Do not promise that lexical rules prevent model attention leakage. ControlNet/IPAdapter strength, checkpoint priors and LoRA training can dominate output. Hair material/effect, placement and ambiguous color tags may correlate with surprising generations; this is a reason for review and experiments, not invented universal facts. Ownership requires appropriate regional/masked conditioning or another model-supported method.

**Clothing and semantic review:** clothing layers, body coverage, garment state, region, subject count and alternative branches matter. A skirt and trousers can be an intentional layered outfit. Different people can sit and stand in one image. Hair colors can coexist. An unknown pair is not automatically incompatible. The stock coincidence/incongruency dictionary is advisory, versioned and incomplete; reviewed rules must not be inferred from wiki co-membership or tag popularity.

### 4.7 Transfers, synchronization, folders and archives

- Hydrus export preserves original bytes, SHA-256 identity and generation metadata; optional tag extraction/formatting is independently configurable. Tag service and spacing/underscore policy are connection/export settings.
- Positive and negative prompts remain separate; actual used tags are distinct from templates. Existing Hydrus service metadata is not flattened into one anonymous tag list.
- Export history and cached Hydrus metadata are persistent. Refresh discovers copies imported elsewhere and updates stale status. Local search can use tags from matching cached Hydrus copies; it is not necessarily a live Hydrus query.
- Durable delivery of metadata notes and selected tag additions supports retries, restart recovery and conflict resolution. Avoid overwriting notes edited by another client. Record synchronization direction and authority explicitly.
- Download/Send to supports output folders and a folder dialog. Reuse verified matching content; never silently overwrite a different file. Context menus stay usable during transfers and progress ends when the job actually completes.
- Folder associations route media by prefix/lineage, support several associations per folder and use visual source picking instead of UUID entry. Existing routing uses first match; a replacement should make precedence and conflicts visible and previewable.
- Archive supports hiding media in place and an optional physical `_archive` subtree. Preserve original relative paths and sidecars; restore is reversible; collisions abort rather than overwrite. Do not silently relocate previously archived items when a setting changes.
- Gallery archive visibility, Hydrus inbox/archive state, trash and permanent deletion are different concepts. The new app must model and label them separately even if the GUI later presents a simpler combined workflow.

## 5. GUI behavior that is a product requirement

The exact visual design is open. These interaction contracts are not:

- One coherent normal search experience, with explicit source/provider scope. ComfyUI browsing uses the same gallery/viewer controls rather than a perpetual diagnostic page.
- Settings, service addresses, tokens, folder automation and connection diagnostics live in Settings. A disconnected browser gives an actionable status and setup link without replacing its purpose with configuration clutter.
- Right-click menus exist on thumbnails, viewer items, image-history tiles, crop/stitch sources and folders. Hide irrelevant actions by capabilities; explain temporarily unavailable actions. Menus work while jobs run.
- In-app dialogs for unsaved changes and destructive operations; no browser-native alert/confirm prompts. Provide undo for reversible operations.
- Called windows/panels reliably come to the front, including an already-open child requested from a fullscreen viewer. Escape closes the uppermost transient layer first.
- Strong tactile controls, visible focus/hover/pressed states, readable dropdown contrast, arrows for disclosure, descriptive tooltips and accessible names. Color supplements text/shape rather than being the only meaning.
- Compact controls with advanced tools disclosed on demand. Remove repeated editors/search menus and implementation explanations from routine image workflows.
- Selection reset behavior is predictable. Switching a result/source tab resets transient selection; opening an inspector/tool does not. Named saved groups are not erased by a tab switch.
- User work survives transient network errors. A disconnected provider must not freeze unrelated settings or local browsing.
- Full keyboard operation, drag alternatives, screen-reader labels, touch targets, zoom/text scaling and a usable smaller-screen layout.

### Proposed visual direction — permission to improve it

A desktop **library workspace** with a compact navigation rail: Library, Inbox, Collections, Folders, ComfyUI, Archive and Jobs. Saved searches and custom workspaces can be pinned. A consistent query bar holds typed predicates and a clear source selector. The main canvas is a fast media grid or list. The right inspector switches among tags, metadata, provenance and associations. The viewer replaces the canvas or opens as a detachable view; selection and context actions stay consistent.

A bottom jobs tray exposes import/download/sync/maintenance progress without modal blocking. A prompt workbench opens on demand as a docked pane or separate window. Rule/recipe editing is available from that context, with a snapshot rail beside the relevant recipe. Advanced services, synchronization and routing use focused settings pages.

Allow density presets, thumbnail size/aspect/crop choices, layout presets, dock placement, visible columns/overlays, shortcut maps, theme tokens, accent/category colors, panel dimensions, toolbar customization and saved workspace layouts. Persist preferences per workspace/profile where appropriate; provide reset/export/import and version migrations. Customization must not turn a simple default workspace into a blank DIY construction kit.

Figma later becomes a visual specification: replace tokens, spacing, components and layouts while preserving view-model contracts and domain commands. Use semantic component names and design tokens rather than hardcoded geometry. Do not require a Figma account or remote service for normal app operation.

## 6. What “full Hydrus client” adds beyond these projects

This is a target parity ledger, not a list of features already supplied by the web frontends.

| Area | Required destination behavior | Sequencing |
|---|---|---|
| Storage and import | Managed and linked files, content hashes, multiple roots/domains, watched folders, import rules, duplicates on import, missing-media detection and relocation. | Core. |
| Tag services | Namespaces, service-scoped mappings and statuses, local tags, favorites, aliases/siblings, parent implications, storage versus displayed/inferred tags. | Core; advanced service combinations later. |
| Search | Exact tags, OR/NOT trees, namespace/system predicates, ratings/notes/URLs/file facts, saved queries, sort/group, collections, live updates and bounded pagination. | Core; publish predicate support matrix. |
| Media lifecycle | Inbox/archive, visibility archive, trash/restore, retention policies, deletion records and explicit permanent deletion. | Core. |
| Metadata | Multiple notes, ratings/services, source URLs, timestamps, viewing statistics, raw metadata and provenance. | Core. |
| Similarity and duplicate management | Exact hashes, perceptual candidate discovery, compare UI, better/same-quality decisions, alternates/false positives, metadata merge and reversible relation edits. | After core identity/import. |
| Acquisition | URL queues, site/gallery downloaders, parser definitions, authentication/cookies, bandwidth budgets, scheduling, retries and subscriptions. | Separate acquisition module; phased. |
| Workspaces and automation | Pages/collections, saved sessions/searches, import/export automation, shortcut/custom action system and observable jobs. | Incremental. |
| Remote services | Remote file/tag repositories, permissions/accounts, pending/petitioned state, synchronization and conflict handling where supported. | Explicit later compatibility module. |
| Maintenance | Backup/restore, integrity checks, rehash/rethumbnail, schema/index migrations, storage relocation, compaction and repair reporting. | Recovery starts in core; full suite expands. |
| Export and interoperability | Files and sidecars, portable collections/recipes/rules/provenance, Hydrus adapters and transparent unsupported-data reports. | Core export before risky migration. |

Inventory the pinned upstream client's additional capabilities before declaring parity. Do not promise complete importer coverage for downloader configurations, repository accounts, sibling application rules, subscriptions, duplicate state or saved sessions without an implemented mapping and a round-trip/verification test. “Hydrus-class standalone library” and “complete compatibility with every Hydrus feature” are distinct claims.

## 7. Technology direction and decision gate

**Recommended starting candidate: Flutter UI with a Dart domain/application layer and SQLite.** It aligns with a desktop-first cross-platform GUI and leaves room for mobile. [Flutter officially supports Windows, macOS and Linux desktop](https://docs.flutter.dev/platform-integration/desktop); [React Native desktop targets use out-of-tree implementations](https://reactnative.dev/docs/out-of-tree-platforms). This is a project recommendation, not a claim that every required media/desktop facility is turnkey. See the official sources in section 15.

Before committing the whole product, demonstrate:

1. A virtualized grid with 100,000 indexed metadata records and bounded thumbnail memory.
2. Image, animated image, video and audio viewing, keyboard navigation and cross-page slideshow behavior.
3. External OS file drag/drop and internal grouped-chip/member drag/drop, including Unicode Windows paths and multiple displays/scales.
4. A searchable database migration, crash-safe import job, backup/restore and a packaged Windows build.
5. At least a build/smoke run on macOS and Linux using available environments. Report unavailable platform verification honestly.

Choose the media engine, SQLite bindings and native integrations only after those spikes. Dart isolates are the initial background-work mechanism. Add Rust/native workers for a measured need such as perceptual hashing, intensive indexing or an already-proven codec bridge, not to make the diagram look sophisticated. External media tools can run as isolated child processes where licensing/distribution/platform constraints are understood.

A React-based alternative remains legitimate if the desktop spikes demonstrate a material advantage. React Native should be evaluated per desktop target rather than assumed equivalent to React web. A desktop web shell is also an option if documented evidence favors it; it must not become a way to retain the current app's architectural coupling. Record the decision, costs and failed requirements. Existing TypeScript logic can serve as a behavioral oracle even if it is reimplemented in Dart.

## 8. Architecture: a modular application, not another god object

Start with a **modular monolith**: one installed application, one managed local data store, explicit module APIs and background workers. Module boundaries are not a demand for local HTTP microservices, many terminals or separate daemons.

| Module | Owns | Must not own |
|---|---|---|
| Catalog | Assets, locations, file facts, library domains and lifecycle. | UI widgets or provider HTTP details. |
| Storage | Managed blobs, linked roots, safe file transactions, path resolution and integrity. | Tag meaning or search UI. |
| Metadata/tagging | Namespaces, tags, service mappings, assertions, implications, ratings, notes and URLs. | ComfyUI graph interpretation. |
| Search | Query AST, planning, indexes, cursor sessions, stable sorting and capability reporting. | Widget state or synchronous full-library decoding. |
| Media | Thumbnail/render caches, decode/playback and format capability probes. | Import authority or arbitrary network access. |
| Provenance | Source/derived edges, transformations, generation runs and association queries. | Treating a prefix as an image identity. |
| Prompt recipes | Structured syntax, library prefixes, immutable snapshots and run resolution. | Filesystem movement or model inference. |
| Rules | Definitions, policy attachments, precedence, conditions, execution and explanations. | Pretending lexical tags create spatial ownership. |
| Jobs | Durable work, progress, cancellation, retry, resource budgets and recovery. | UI-thread loops or ad hoc private queues in every feature. |
| Hydrus adapter/importer | Version/permission discovery, API mapping, offline import profiles and reconciliation. | The core schema or UI components. |
| ComfyUI adapter | Pairing, output catalogue/media access, generation metadata and optional workflow handoff. | Requiring a GPU for the local library. |
| Acquisition | Downloaders, subscriptions, parsing and network budgets. | Direct uncontrolled writes into the catalog. |
| Similarity | Candidate hashes, duplicate/alternate decisions and comparison workflows. | Conflating similarity with content equality. |
| Workspace/presentation | Navigation, layout, selection, dialogs, shortcuts and preferences. | SQL or provider-specific write rules. |
| Extension host | Later bounded custom actions, parsers and optional AI providers. | Arbitrary trusted execution of imported rules. |

Domain entities do not import Flutter/React, HTTP clients, SQLite row types or ComfyUI/LiteGraph types. Repositories/ports expose domain values; application commands orchestrate transactions; UI controllers expose state and cancellation. Provider errors become typed outcomes with retry/status detail. Use a small set of explicit events such as `AssetImported`, `TagAssertionsChanged`, `JobProgressed` and `ProviderStateChanged`; avoid an undocumented global event bus.

Package by feature/module, with module-level tests and clear import rules. A service file growing into thousands of lines is a design-review trigger, not a milestone. Prefer boring schema migrations and explicit jobs over dynamic magic.

### Provider contract

Each provider reports capabilities, version, permissions, connection identity and offline state. Use stable provider IDs and external-reference mappings. A remote path is interpreted by its provider, not passed to the local filesystem. Opening an asset resolves an appropriate available location/ticket. Do not store expiring signed URLs as asset identity.

The app starts its own services/workers. A configured ComfyUI installation supplies its adapter endpoint inside the existing ComfyUI process; the user should not run a companion bridge terminal. A native client can avoid browser CORS constraints, but authentication, peer verification and replacement confirmation remain necessary.

## 9. Core data model

Use SQLite as an initial authoritative metadata store with transactional migrations, foreign keys, indexed relational queries and a controlled writer. Store media blobs outside database rows. Keep replaceable thumbnail/text/similarity indexes separate from irreplaceable metadata. Do not default to one unrelated SQLite file per module; cross-module referential integrity and coherent backup matter.

Suggested conceptual tables (names are illustrative):

```text
library / profile / provider / provider_capability
asset(id, sha256, byte_size, mime, width, height, duration, imported_at, ...)
asset_location(id, asset_id, provider_id, root_id, relative_path, availability, ...)
external_reference(provider_id, external_kind, external_id, asset_id, ...)
library_domain / asset_domain / lifecycle_event
tag_namespace / tag / metadata_service
tag_assertion(asset_id, tag_id, service_id, status, origin, observed_at, ...)
tag_relationship(service_id, kind, from_tag_id, to_tag_id, status, ...)
tag_application_policy / derived_tag_index
rating_service / rating / note_revision / source_url / asset_timestamp
collection / collection_member / saved_query / workspace / selection_group
provenance_edge(parent_asset_id, child_asset_id, relation, transform_id, evidence, ...)
generation_run / generation_input / generation_output / metadata_document
prefix / prefix_revision / recipe_snapshot / recipe_member
ruleset / ruleset_revision / policy_attachment / rule_execution_trace
source_contribution / source_omission(contribution_id, polarity, term_identity, ...)
folder_route / route_condition / job / job_step / operation_journal
import_session / import_item / migration_issue / sync_baseline / sync_conflict
```

Important invariants:

- SHA-256 identifies exact bytes, not similar images or a file path. One asset may have several locations. Cropped/resized/re-encoded outputs normally become different assets linked by a transformation.
- The same provider's integer file ID is not globally unique. Imported mappings include provider identity; paths, IDs and selection memberships survive reconnects without collision.
- Preserve tag-service and status information: current, deleted, pending and petitioned are not interchangeable. Displayed aliases/parents are derived views, not replacements for raw assertions.
- A normalized comparison key may fold case and spaces/underscores where the relevant tag vocabulary permits it; retain original spelling and service semantics. Never destructively “clean” arbitrary prose, URLs or namespace contents using prompt tag rules.
- Notes have revisions and provenance. External generation JSON retains the raw document, parser version and parsed projections. Unknown fields survive export/reimport.
- Prefix revisions and snapshot memberships are separate from lineage edges. Prefix association is many-to-many in the destination even if a legacy UI exposed one primary association.
- Snapshot hashing uses a versioned canonical representation. Preserve meaningful branch/group order, weighting, polarity and policy semantics; do not sort away a difference that affects evaluation or deterministic replay.
- Source omissions attach to a stable source contribution/image and prompt polarity, not the order of a global removal list or a rendered chip position.
- Rule families/channels, subject/region scope and prefix layout are different concepts. Future subject scope should be an explicit entity model, not an overloaded string called `scope`.
- Archive visibility, inbox status, trash and file availability are independent fields/events with explicit UI mappings.
- Derived indexes may be rebuilt. Original media, source assertions, recipe history and imported raw records require backup.

## 10. Search and semantic engines

### Query design

Represent queries as an AST, with a visual chip editor and a readable text serialization. Support exact tag, namespace, OR/AND/NOT, source/provider, rating, note, filename, media facts, collection, prefix, snapshot and lineage predicates. Prefix names can be entered with `@name`; retain stable IDs underneath and handle ambiguous/renamed names explicitly. Searching substrings remains appropriate for filename/text modes, not an accidental replacement for exact tag search.

The normal search surface includes local, remote and hybrid sources. A query planner splits compatible predicates across providers and performs explicit local joins/post-filtering when justified. An unsupported provider predicate yields an explanation/coverage result; it must not silently match everything or masquerade as an empty library. Incomplete remote provenance results are labeled incomplete.

Search pages are stable cursor/snapshot sessions. Metadata pages and visible thumbnails load on demand; filtering a page to zero matches does not imply no further results. The virtual grid and viewer share the same result cursor. Cancellation/version tokens prevent stale results entering a new query. Archive searches, folder direct contents and recursive library searches are separate scopes.

For hybrid results, deduplicate exact assets by hash, retain all provider locations and combine metadata with service/source attribution. Do not let an older local metadata document overwrite newer selected Hydrus provenance merely because the local copy was enumerated first. Result counts distinguish known total, loaded count and incomplete estimation.

### Prompt engine

Use a real AST for sequence, choice, optional choice/group, weight, emphasis and typed controls. Serialization is a boundary format, not the database model. A single shared renderer/editor supports editable and read-only modes, full-group/member transfer, used-versus-template views and accessible logical displays.

Preserve existing fixture behavior before replacing parsers. Sampling happens once per queued prompt unless a workflow explicitly requests per-item sampling. Record RNG seed, chosen branches, effective policy and resolved positive/negative prompts. A batch of ten images sharing one conditioning prompt does not imply ten independent prompt samples.

### Rules and semantic dictionary

Execute bounded declarative programs, not arbitrary imported JavaScript/Python. Validate schema/depth/size, version operators and keep explainable traces. Deterministic preference choices and sampled alternatives must be visibly different.

Store semantic knowledge as concepts/facets plus n-ary rules with prerequisites, scopes, exceptions, confidence, evidence and vocabulary/model version. Pairwise exclusion tables alone cannot represent garment layering, multiple people, co-occurring colors or branch-sensitive alternatives. Unknown means unknown. Default semantic reviews are advisory; explicit user rules can be strict.

Stock packs should prioritize generic anatomy, pose, garments/layers, materials, colors, framing, environment and hair attributes rather than spending the first implementation on franchises/character names. Preserve explicit/adult vocabulary where present in the user's dataset; do not invent model-performance claims for it. Show dictionary coverage and let the user edit/disable packs.

## 11. Hydrus migration: safe, resumable and candid

The importer is a product feature, not a one-off developer script. It needs a visual plan, dry run, progress, pause/resume, cancellation, reconciliation and a durable report.

### Import modes

1. **API-assisted import:** capability/version/permission discovery; enumerate identifiers using appropriate service/domain scopes; retrieve metadata in bounded batches; retrieve or reference verified media where authorized. No direct SQL access to the live database.
2. **Portable export import:** originals plus metadata sidecars, supported Hydrus tag archives and Gallery generation records. Design explicit format/version readers; do not assume a tag archive contains all other library state.
3. **Offline snapshot import:** only from a verified, consistent Hydrus backup or an intentionally stopped client's copied data. Use a version-specific read-only translator and manifest. Unknown schema versions stop that reader with an actionable report. This is not permission to attach to changing live SQLite files or to modify Hydrus's schema.

The [official Client API](https://hydrusnetwork.github.io/hydrus/developer_api.html) and [database merging documentation](https://hydrusnetwork.github.io/hydrus/database_merging.html) describe supported access and exchange mechanisms; they do not guarantee an all-state export for an independent replacement. API relationship lookup can describe computed applied sibling/parent results, which is not automatically the complete editable source rule configuration. Record both when available and label the distinction.

### Required import sequence

1. Discover source identity/version, permissions, service keys, library domains and storage access. Present which data is importable and which requires another mode.
2. Create an import session and manifest with source version, filters, mappings, counts/checkpoints and chosen blob strategy: managed copy, verified existing local location or metadata-only remote reference.
3. Stage catalog identity and file facts. Hash copied bytes; detect exact duplicates without losing paths, service memberships or associations. Missing/offline originals become explicit unavailable assets, not successful copied files.
4. Import raw tag assertions by service/status, notes, ratings with scale definitions, URLs, timestamps and supported relationships. Import hierarchy/alias policies without substituting computed display tags for original assertions.
5. Parse Gallery metadata notes and hash-bound sidecars into recipes, snapshot membership, runs and lineage. Preserve raw JSON even when a parser cannot recognize a custom node.
6. Import supported saved searches/collections, duplicate/alternate relations and other state using verified mappings. Unsupported session/plugin/downloader/account state goes into the report and, where possible, a portable raw export.
7. Verify counts by service/status and file availability; reconcile file hashes and relation memberships. Produce a human-readable report and machine-readable manifest. Never print credentials in those reports.
8. Commit staged chunks transactionally and checkpoint. Repeating/resuming the import is idempotent and does not duplicate notes, relations or files. Preserve a rollback/undo path for app-owned changes.
9. Let the user inspect the new library while Hydrus remains intact. Export a recoverable backup of the new app before treating migration as accepted.

On remote sources that change during import, record the consistency boundary. Re-fetch/compare checkpoints or perform a reconciliation pass; do not describe a moving API enumeration as an atomic snapshot.

### Mapping requirements

| Hydrus/source datum | Destination rule |
|---|---|
| File hash and IDs | Hash → asset; external IDs remain source-qualified mappings. |
| Current/deleted/pending/petitioned tags | Separate assertions/statuses; no flattening to current. |
| Siblings/parents and applied display tags | Source rules and derived projections stored separately, with import coverage. |
| Ratings | Preserve service identity, type, scale and null/unrated state. |
| Notes and Gallery metadata | Preserve names/raw bytes or faithful text, revisions, parser version and associations. |
| Known URLs | Preserve source association; do not refetch by default. |
| Import/modified/archive/deletion/view times | Preserve semantics/time basis; missing is not zero. |
| Inbox/archive, trash and service domains | Explicit state/domain mappings; no automatic physical moves. |
| Duplicate/alternate/false-positive relationships | Preserve distinct relation kinds and source evidence; don't reinterpret as lineage. |
| Credentials, cookies and accounts | Not normal media metadata; migrate only via a separate explicit secure process if supported. |

## 12. ComfyUI adapter and later local AI

Preserve the proven direct setup concept: one configured ComfyUI address; adapter endpoint inside that ComfyUI installation; no separately launched bridge. The existing protocol uses one-use HMAC challenge/session authentication, installation pinning and scoped expiring media tickets. On a desktop rewrite, retain those security properties even if the transport/authentication implementation evolves. Do not authenticate using a file path, CORS alone or a permanent key embedded in thumbnail URLs.

First adapter scope:

- Discover/pair the instance and show reliable status/errors without blocking local browsing.
- Browse the real ComfyUI output directory and subdirectories, including outputs not visible under a customized Gallery monitor root.
- Retrieve compact metadata and lazy thumbnails/originals with bounded paging and refreshed media access.
- Parse workflow graphs, source manifests, encoder run records, prefix/snapshot references and sidecars.
- Import/copy/link media into the new local library by explicit policy; read-only browsing does not silently ingest every file.
- Make ordinary app searches optionally include connected output, with precise location/capability badges and hash reconciliation.
- Offer generation-aware context actions only when data supports them. Keep viewing/copying a workflow separate from executing it.

Later, a generation integration can prepare/send sources/prompts to a selected ComfyUI workflow. That requires an explicit execution command, queue state and recorded inputs/outputs; browsing metadata does not authorize automatic generation. Local AI inside the app should be an optional worker/provider module for tagging, embeddings, OCR, similarity, masks or generation. Store model/version/configuration and human acceptance of suggestions. Derived AI tags remain attributed suggestions until accepted; do not overwrite curated Hydrus tags.

## 13. Reliability, privacy and performance

- Every import, move, download, sync and reindex is a durable job with observable steps, cancellation boundaries and bounded retries. Recover after process death without creating duplicate outputs.
- Database/file operations need a journaled staging/finalization protocol. A database transaction does not magically make cross-volume filesystem moves atomic. Verify destinations/hashes, avoid overwrites, and recover or compensate partial work.
- Original files are immutable by default. Editing creates derived assets; destructive source replacement is a separate explicit operation.
- Keep credentials in platform secure storage where available, out of metadata documents, copied workflow JSON, logs, backups by default and media URLs. Imported metadata is untrusted data and never an instruction to execute code.
- Provider access, plugin filesystem/network permissions and sidecar resolution are bounded. Handle Windows reserved names, Unicode/long paths, symlinks, path traversal and remote/local path confusion deliberately.
- Back up metadata plus manifests and the chosen managed-media set coherently. Test restore into a fresh profile. Use schema-version checks and recoverable pre-migration backups.
- Never decode the whole library or fetch all originals just to open a grid. Use bounded workers, indexed metadata, viewport thumbnails, disk/LRU caches and explicit resource limits.
- Benchmark 100,000 realistic assets and a larger metadata-only dataset. Initial targets to validate on documented hardware: warm grid usable within 2 seconds; common indexed local tag query first page within 300 ms; smooth scrolling with bounded memory; no UI-thread stalls caused by bulk jobs. These are proposed targets, not measurements of the current projects or promises for every computer.
- Test image/video metadata bombs, corrupt sidecars, missing drives, intermittent remote connections and interrupted writes. One malformed file must not hide an entire folder.
- Ship structured, redacted diagnostics with app/core/provider/schema versions and actionable failures. Distinguish “files installed,” “process reloaded,” “UI refreshed” and “live feature verified.”

## 14. Delivery plan and acceptance gates

### Stage A — decisions and working foundation

Deliver a new repository, architecture decisions, module boundaries, schema/migration runner, app packaging and the technology spikes. Show local folders in the proposed workspace and open real image/video media. No Hydrus process is required for basic startup or browsing.

### Stage B — independent usable library

Deliver durable managed/linked imports, hash identity/locations, tags/notes/ratings, lifecycle states, basic exact query AST, virtual grid/viewer, selection groups, jobs, export and backup/restore. Restart recovery is part of this stage. Demonstrate a real library being imported, edited, searched, exported and restored.

### Stage C — migration and connected browsing

Deliver API-assisted Hydrus migration with a coverage report, service-aware metadata preservation, ComfyUI direct output browsing and normal-search hybrid mode. Demonstrate a migrated subset remains browsable and editable with Hydrus and ComfyUI both stopped. Then demonstrate their reconnection without duplicate assets or lost local edits.

### Stage D — creative-library parity

Deliver the shared prompt AST/chip UI across all relevant surfaces, prefix associations, immutable snapshots, lineage search/subtraction, per-image omissions, rule trees/private policies/protections, folder routing, archive choices, metadata copy/drag and workspace customization. Execute golden fixtures from the reference projects; don't merely imitate screenshots.

### Stage E — full-client depth

Deliver duplicate/alternate comparison, advanced tag relationship editing, downloader/subscription modules, service synchronization, maintenance and the audited remaining Hydrus capability ledger. Expand cross-platform validation. Until these are complete, label the product's actual parity level accurately.

### Stage F — optional AI

Add local AI providers and/or deeper ComfyUI workflow handoff only after the independent library is useful and recoverable. Preserve the ability to install and use the app without those modules.

### Mandatory behavioral acceptance examples

1. Import the same image from disk and Hydrus: one exact asset, two attributed locations; both providers' metadata remain inspectable.
2. Import two different images paired with one prefix: broad prefix membership is shared, source family and source omissions are not.
3. Edit A's source recipe and queue a variant: parent and B remain unchanged; an identical later variant reuses the same snapshot.
4. Search A: lineage is the default. Other prefix associations excludes A, its ancestors and that source family's generations. Snapshot results are independently selectable.
5. Copy an optional group from metadata into a prefix and encoder: structure/weight survive; Copy used tags excludes unused alternatives.
6. Set Optional each on an entire box: every tag becomes independently optional without duplicated wrappers or requiring Select all.
7. Remove `blue eyes` from source A, switch to B, then back: only A is left out; combined prompting retains B's contribution. Empty negative prompt creates no blank snapshot tag.
8. Attach a ruleset already active in its channel: no extra active card. Re-enable a disabled card without losing preferences. Named independent channels still work.
9. Override a prefix/snapshot policy at the encoder: precedence is visible. Turning off prefix inheritance doesn't disable an explicitly attached global/encoder rule by accident.
10. Put a skirt over trousers: advisory rules permit layered context; unconditional pairwise exclusion is not imposed.
11. Scroll and advance the viewer past 48/100/200 loaded items: request subsequent pages; no artificial result cap or duplicate slide IDs.
12. Download/move/archive while using context menus: progress is coherent, matching content is reused and collisions do not overwrite another file.
13. Restore an archived item after changing archive preferences: original location/sidecars return correctly. Restore never edits a shared external Hydrus original implicitly.
14. Disconnect ComfyUI during search: local library remains responsive; stale replies do not replace the next query and actions give useful errors.
15. Interrupt a Hydrus import, resume it, then run it again: no duplicate mappings/notes/files and a clear reconciliation report.
16. Edit the external Hydrus note during pending local delivery: retain both versions or ask for conflict resolution; no blind last-writer overwrite.
17. Restore backup into a clean app profile: metadata, relationships, recipes, saved groups and available managed originals are consistent.
18. Replace the GUI layout/theme with a Figma-driven design: the domain/search/import tests remain unchanged.

## 15. Source map and current validation starting points

### Hydrus Web

- `src/app/hydrus-*.ts`: API contracts, file/tag/rating/note/service/page operations and metadata models.
- `src/app/browse/`, `search.service.ts`, `hydrus-system-predicates.ts`: normal query behavior and search state.
- `src/app/selection-groups.service.ts`, `image-list*`, `photoswipe.service.ts`, `gallery-context-menu/`: shared grid/viewer/selection/context behavior.
- `src/app/integration.service.ts`, `integration/native-gallery.service.ts`, `hybrid-search.service.ts`, `media-relations.ts`: direct provider protocol, adaptation, hybrid planning and lineage/prefix semantics.
- `file-context-menu-actions/`, `integration/comfy-generation-dialog.component.ts`: capability-gated generation actions.
- `scripts/browser-native-hybrid.cjs`, `browser-direct-gallery.cjs`, `media-relations.test.cjs`: current targeted integration regressions. Historical Node-bootstrap tests are not proof of the current connection path.
- `COMFYUI_INTEGRATION.md`: setup/current integration scope. `docs/WINDOWS_HANDOFF.md` is historical context with superseded entries.

### ComfyUI-Gallery

- `web/src/UnifiedGallery.tsx`, `ImageInfo.tsx`, `FloatingPanel.tsx`, `HydrusContext.tsx`: workspace, inspection, panels and service integration.
- `PromptBoxes.ts`, `PromptBoxEditor.tsx`, `EncoderNode.tsx`, `EncoderSizing.ts`: prompt language, editing, host adaptation and layout constraints.
- `PrefixLibrary.ts`, `EncoderSnapshots.ts`, `SourcePrefixes.ts`, `SourceExclusions.ts`: library/recipe identity, snapshot capture and per-image omissions.
- `RuleEngine.ts`, `RuleBoxes.tsx`, `RuleBoxActions.ts`, `RuleOperation.tsx`, `RulesLibrary.ts`, `HairPolicy.ts`, `HairControls.tsx`: rules semantics and presentation.
- `ImageSourceGeometry.ts`, image-source editors/history modules, `image_source.py`, `image_source_api.py`: source images, transforms and metadata transport.
- `prefix_library.py`, `prefix_snapshots.py`, `prompt_rules.py`, `rules_library.py`, `hair_policy.py`: backend semantics. Use cross-language fixtures to avoid preview/runtime divergence.
- `hydrus.py`, `hydrus_sync.py`, `direct_connection.py`, `direct_catalogue.py`, `output_browser.py`, `thumbnails.py`: transfers/sync, authenticated provider access and media paging.
- `data/`: vocabulary, aliases, hair/semantic/clothing packs, rules definitions and provenance/readme material. Audit licenses/provenance and distinguish reviewed knowledge from candidate classifications.
- `RULESETS.md`, `PROMPT_BOXES.md`, `SOURCE_EXCLUSIONS.md`, `docs/SHARED_PROMPT_CHIPS.md`, `docs/LAYERED_PREFIX_RULES.md`, `docs/GALLERY_POLISH.md`, `docs/TAG_COINCIDENCE_DESIGN.md`: useful behavioral detail; resolve historical conflicts as described earlier.

Recent targeted validation includes native/hybrid browser coverage, direct connection tests, prompt/rule fixtures, snapshot/source-omission fixtures and a browser ruleset-picker regression. The latest ruleset change passed 12 targeted JS tests, a production frontend build and browser verification. Per-image omissions passed 32 targeted JS tests, 4 new backend tests, 19 existing prefix tests, 7 layered-rule tests and a browser A/B/batch regression. Those checks are examples to migrate, not a substitute for a new product's full test strategy.

### Official external references checked during preparation

- [Flutter desktop support](https://docs.flutter.dev/platform-integration/desktop) — supported desktop targets and platform integration.
- [React Native out-of-tree platforms](https://reactnative.dev/docs/out-of-tree-platforms) — desktop platform implementations and ownership.
- [Hydrus Client API documentation](https://hydrusnetwork.github.io/hydrus/developer_api.html) — endpoints, permissions, metadata and relationship semantics. Negotiate actual source version at runtime.
- [Hydrus database merging](https://hydrusnetwork.github.io/hydrus/database_merging.html) — supported exchange approaches and their limits; not a universal full-state export promise.
- [Hydrus database migration](https://hydrusnetwork.github.io/hydrus/database_migration.html) — storage/movement context; not an independent replacement's schema contract.

The checked-out Hydrus Web and Gallery repositories carry MIT license files. Preserve their attribution when reusing code/assets. Audit every additional upstream dependency, vocabulary dataset, media engine and reused Hydrus component before distribution; do not assume the frontend licenses cover all future dependencies.

## 16. Compact prompt to start the implementation session

> Read `docs/UNIFIED_GALLERY_SENDOFF.md` in the Hydrus Web reference checkout and inspect the referenced Gallery checkout. Build a new independent cross-platform media-library application, with Flutter as the initial technology candidate, a modular local core and safe Hydrus import. Preserve the user's existing libraries and applications. The destination is a full Hydrus-class client with our shared prompt-chip language, prefixes/snapshots, provenance, per-image omissions, editable rules/protections, folder/archive workflows, hybrid search, selection and viewer behavior. Start with a working standalone catalog/import/search/gallery/viewer slice plus ComfyUI output browsing; deeper local AI is optional later. You have creative freedom to redesign the GUI and replace historical hacks, while keeping it adaptable to a later Figma specification. Treat the reference projects as behavioral specifications, not a mandate to transplant their frameworks or architecture. Maintain an honest capability/migration ledger, recovery tests, platform evidence and a runnable packaged application at each milestone. Do not claim full client parity or lossless migration before the corresponding audit and acceptance tests pass.

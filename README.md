<div align="center">

# NumaCore Lens

**Component-life planning for mining and heavy-civil fleets, built as a suite of single-file HTML tools that run locally.**

[![Pages](https://img.shields.io/badge/live-aisandbox--bj.github.io%2Fnumacore--lens--suite-388bfd)](https://aisandbox-bj.github.io/numacore-lens-suite/)
[![Stack](https://img.shields.io/badge/stack-vanilla%20HTML%20%C2%B7%20CSS%20%C2%B7%20JS-7dd3fc)](#architecture-decisions)
[![No build](https://img.shields.io/badge/build-none-34c97a)](#why-no-build-tools)
[![Status](https://img.shields.io/badge/status-early%20adopter-e3b341)](#status)

</div>

---

**NumaCore Lens** is the internal delivery engine for a Planned Component Replacement (PCR) advisory practice — long-term component-replacement planning for fleet operators in mining, resources, and large civil. The tools are never sold or licensed; the advisor uses them to deliver repeatable, defensible component-life plans that scale across multiple clients without scaling hours proportionally.

> Try it: [aisandbox-bj.github.io/numacore-lens-suite](https://aisandbox-bj.github.io/numacore-lens-suite/) · drop your own fleet JSON, or load nothing and look at the empty UI shells.

---

## The five tools

Every tool is a **single HTML file**. No build step. No `node_modules`. Open it in a browser, drop a fleet JSON, it works.

| Tool | File | What it does |
|---|---|---|
| 🩺 **Lens** (Pulse · Vitals · Horizon · Bench) | [`index.html`](https://aisandbox-bj.github.io/numacore-lens-suite/) | Day-to-day glance. Fleet health summary, component KPIs, condition-monitoring heatmap (oil + coolant), unit drill-down with coolant chemistry and OPC wear-particle detail, utilisation profiles, capital plan, and **Bench**: critical spares by model, with on the shelf / on the way / reserved and cover after inbound. An engine with clean oil but no current coolant sample reads **grey — unmonitored**, never green. |
| 📅 **Cadence** | [`cadence.html`](https://aisandbox-bj.github.io/numacore-lens-suite/cadence.html) | The PCR scheduling tool. Gantt timeline of every component's planned replacement date, Auto-Build clusters, optimiser, resource loading, project list, and a **life-of-fleet Budget** (multi-cycle costing + BAF, Excel + an interactive HTML Budget Report). The oldest and most vital tool in the suite. |
| 📦 **Deploy** | [`deploy.html`](https://aisandbox-bj.github.io/numacore-lens-suite/deploy.html) | Project / shutdown / outage execution. Gates, tasks, work orders, bill of materials, project Gantt with anchored TODAY line, Recently-Closed WO bucket. |
| 📥 **Intake** | [`intake.html`](https://aisandbox-bj.github.io/numacore-lens-suite/intake.html) | Data ingestion. Builds a fleet JSON from XLSX exports (SMU readings, IW39 work-order history, material master). Ingests FluidLife lab PDFs — a single report or a full bulk export, auto-detected — extracting oil rank, OPC particle classification and coolant chemistry, and reporting how many reports are new vs already imported. Monthly UPDATE flow preserves the advisor's planning work. |
| ⚙ **FleetConfig** | [`fleetconfig.html`](https://aisandbox-bj.github.io/numacore-lens-suite/fleetconfig.html) | Fleet-level configuration: util rates, component pockets, parts library. |

Plus three supporting artefacts:

| File | Purpose |
|---|---|
| [`manual.html`](https://aisandbox-bj.github.io/numacore-lens-suite/manual.html) | Full user manual — 17 tabs covering every feature, every data flow, every design decision. Updated every release. |
| [`numacore_lib.js`](https://aisandbox-bj.github.io/numacore-lens-suite/numacore_lib.js) | Small shared library (~1k lines). Toast UI, category canonicalisation, sort-field normalisation, a few cross-tool utilities. |
| [`numacore_bench.js`](https://aisandbox-bj.github.io/numacore-lens-suite/numacore_bench.js) | The Lens Bench tab (critical spares): reads the SAP Inventory Master in the browser and draws each model's board and table. No data is stored in it; the spares definition lives in the fleet file. |
| [`numacore_workspace.js`](https://aisandbox-bj.github.io/numacore-lens-suite/numacore_workspace.js) | The client-folder reader: reads SAP exports (IW39, INV_MSTR) from the client's synced OneDrive folder in the browser, dates them from their data, and hands them to Bench and Deploy. It also writes the meeting record. No data is stored in it, and nothing is uploaded. |
| [`migrate.html`](https://aisandbox-bj.github.io/numacore-lens-suite/migrate.html) | One-time V4 → V5 schema migrator. |

---

## Architecture decisions

### Single-file HTML, period

Every tool is one `.html` file with inline CSS, inline JS, and CDN-hosted libraries where parsing is needed (SheetJS for XLSX, pdf.js for PDFs). That's the whole stack.

No webpack. No rollup. No package.json. No bundler. No transpiler. No SSR. No PaaS. No SaaS. No cloud anything.

This is a deliberate constraint. It buys: reproducible behaviour across machines, trivial archival (the file IS the deployment), zero dependency rot, no supply-chain attack surface, and freedom from the framework treadmill. It costs: per-file growth (Cadence is ~9,700 lines), no module imports, no off-the-shelf component libraries. Those costs are acceptable for a tool of this complexity at this scale.

### Two-file approach

The HTML is the **engine** (code only). All client data lives in a separate `<ClientCode>_fleet.json` loaded on startup. The tool is never distributed to clients, never appears in client proposals; clients never see the code. The HTML is the delivery infrastructure, not the product.

### Slice ownership in the JSON

Each tool owns specific slices of the fleet JSON and only writes to its own:

| Tool | Owns |
|---|---|
| Intake | `masterData.*` — equipment list, SMU, util_rate, idle %, ERP-predicted changeout dates. Truth-from-source data. |
| Cadence | `workingData.componentDateOverrides`, `.projects`, `.decisionLog` — the advisor's planning work. The actual service deliverable. |
| Deploy | `workingData.deployData` — project execution: gates, tasks, work orders, BOM, known-WOs map. |
| Lens | `meta.*` and `ui_settings` — visibility toggles, sort orders, view preferences. |

This is non-negotiable. Cross-tool stomping is the most expensive class of bug at this scale. When Intake's "Update Everything" runs, it deliberately preserves Cadence's working slice — blowing away the operator's planning work on every monthly SMU update would be catastrophic.

### Recompute over store, store only what must persist

Things that can be cheaply derived are computed at render time from frozen inputs:
- Theoretical changeout dates (the "shadow" diamond) = `last_read + (benchmark − hours_used) / util_rate`
- Projection cycles (the hollow forecast diamonds) = `changeout_date + N × (benchmark / util_rate)`
- Delta-vs-ERP flags = `|theoretical − ERP_date| > 60 days`

Things that must persist are stored:
- Operator drags of the solid diamond (`componentDateOverrides`)
- Project links / Auto-Build clusters (`projects[].linkedIds`)
- Decision log entries (`decisionLog`)

The grey zone — current ERP-predicted date, util_rate (set/measured, never derived from elapsed calendar days), install_hours — is documented in the [user manual Tab 13](https://aisandbox-bj.github.io/numacore-lens-suite/manual.html) and the [Cadence forecast-dates walkthrough](https://aisandbox-bj.github.io/numacore-lens-suite/) cross-linked from the manual.

### Local-first

No login. No server. No telemetry. No network round-trip. Everything works offline. Per-client data files live wherever the advisor stores them — typically OneDrive for backup, but the tool doesn't know about that.

---

## How a typical session works

1. **Intake.** Drop the month's SMU XLSX, the IW39 work-order export, and any new condition-monitoring PDFs. Build a fresh fleet JSON or UPDATE the existing one. Save to disk.
2. **Cadence.** Open the JSON. Recompute fires on load — every component's theoretical changeout date is calculated. Look at the Gantt. Drag what needs dragging. Auto-Build proposes project clusters. Decision Log captures the rationale. Save.
3. **Deploy.** For projects approaching execution: open the Gates / Tasks tab. Lay out the work-order plan, BOM, alerts, cross-project material demand flags.
4. **Lens.** Day-to-day: fleet health glance, attention items, KPIs. What needs the advisor's eye this week.

End-of-session: save the JSON. The JSON file IS the session record — there's nothing else to back up.

---

## Engineering principles

A few of the operating rules that keep this codebase from rotting:

- **Surgical edits.** Never rewrite working sections. Change only what's being changed. The diff is the audit trail.
- **Pre-fix snapshot, every time.** Before editing any released version, save a labelled `[BASE - pre-<change>].html` snapshot in the version folder. Emergency restore point.
- **Quality gates G1–G5 before every delivery:** JS syntax parse · line-count drift (target window per chunk) · feature spot-check (sentinels for every critical symbol must be present) · duplicate event listeners · corruption artefacts (`\!` count, trailing NUL bytes, mid-file NULs — all must be zero).
- **Record of Change is non-negotiable.** Every chunk gets an entry with timestamp, problem, root cause (for bug fixes), implementation summary, build metrics, snapshot path, commit hash, and rollback steps. Updated before / immediately after delivery, every time.
- **No bundled releases.** Every push is one coherent chunk. If a fix and a feature are both ready, they ship in separate commits. Bug fixes and tweaks go in the current version; major features increment the version.
- **Plain ASCII filenames.** Em-dashes look nice but cause encoding pain in shells, archives, URL round-trips, and Windows tooling. Save them for prose.
- **Sensitive components need consent gates.** Cadence specifically (the oldest tool, longest-lived component-date semantics, downstream of every other tool) requires explicit operator approval for the specific change AND a written rollback plan before any code edit. Diagnostics OK; writes gated.

The full discipline is documented in two custom skills used in every dev session: `product-dev` (versioning + workflow) and `fleet-command` (product context + schema).

---

## Why no build tools

Several reasons, in rough order of weight:

1. **The tool's value compounds with longevity.** This isn't an app shipping a release every two weeks; it's an instrument that an advisor uses for years across multiple clients. Things that compound need predictable foundations. `node_modules` is the opposite of predictable foundations.
2. **Distribution simplicity.** "Open this HTML file in your browser" is the entire installation. There's no version-compatibility matrix, no environment setup, no `npm install` failing on a Windows box at a client site.
3. **The code is the artefact.** A single human-readable file with inline CSS and JS is auditable in five minutes. A bundled, minified, source-mapped framework app is auditable in five days. The advisor needs to understand the tool well enough to defend its output to clients; the tool's own implementation has to be approachable.
4. **No supply-chain risk.** Two CDN-hosted libraries (SheetJS, pdf.js) is the whole external dependency tree. Versioned and pinned.
5. **The constraint forces small thinking.** When the only escape is "another HTML file", you don't reach for a microservice when a function will do.

The cost is that some patterns are awkward — there's no module system, no off-the-shelf component library, and each file is a small monolith. Worth it.

---

## Repository layout

This repo is the GitHub Pages deployment target. The build outputs land here flat:

```
index.html        ← Lens (Pulse · Vitals · Horizon · Bench panels)
cadence.html      ← Cadence (PCR scheduling)
deploy.html       ← Deploy (project execution)
intake.html       ← Intake (data ingestion)
fleetconfig.html  ← FleetConfig
manual.html       ← User manual (17 tabs)
migrate.html      ← V4 → V5 schema migrator
numacore_lib.js   ← Shared library (~1k lines)
numacore_bench.js ← Bench tab (critical spares)
numacore_workspace.js ← the client-folder reader (SAP exports from OneDrive)
images/           ← Equipment illustrations used by the tools
README.md         ← You are here
```

The development workspace (per-version snapshots, scoping docs, mockups, the canonical Record of Change, dev-plan slide deck) lives off-repo. Each push to `main` is a single chunk with a Record-of-Change entry; commits are atomic.

---

## Development cadence

Iteratively built in collaboration with [Claude Code](https://www.anthropic.com/claude-code). Roughly one chunk per session, sometimes more, occasionally several pushes per day in fast-iteration cycles.

The workflow: snapshot BASE → propose scope + rollback plan → operator approval → surgical edits → quality gates G1–G5 → commit + push → operator validates on live Pages → mark validated in Record of Change.

Pushes to `main` are auto-deployed by GitHub Pages within ~30 seconds.

---

## Status

**Early-adopter use.** One operator-owner, one active client engagement. The suite is not a commercial product — it's the advisor's internal delivery infrastructure. This repo is public so collaborators (and the occasional curious dev friend) can read the code.

Current live versions: **Lens v4.23 · numacore_budget v1.1.0 · numacore_workspace v0.3.4 · numacore_bench v1.3.1 · Cadence v18.18 · Deploy v8.22 · Intake v8.15 · FleetConfig v0.2 · numacore_lib v1.5.1 · numacore-ui.css v1.0**. Most recent builds: **Lens v4.23 (2026-10-08) - the start page in one column**: Open a client folder is on top and always open, with your recent client folders inside it; Establish a client folder and Drop to view a JSON are header rows below it that open with a click. Nothing any button does has changed. **Lens v4.22 + numacore_budget v1.1.0 (2026-10-06) - one date order on every screen**: a component's planned date follows the same order on Lens's screens as in Cadence and the budget: the project's date, then a date dragged by hand (used, marked as legacy), then the theoretical date worked out from hours. Some dates on Pulse and Vitals change as a result. Before the budget runs, Horizon shows how many components carry a dragged date with no project, with a link to clear them in Cadence. Cadence is not changed. **Lens v4.21 + numacore_budget v1.0.0 (2026-10-06) - the budget in Horizon**: Horizon has a Timeline / Budget switch. Budget works out the life-of-fleet budget with Cadence's own sums and shows the report inside the page, with Excel and HTML downloads. It follows each machine's timeline: a machine past its retired date is left out, nothing is budgeted after a retired date, and parked periods move later change-outs out; a tick box switches that off to give Cadence's rule. Cadence is not changed and keeps its own budget. **Lens v4.20.1 + numacore_workspace v0.3.4 (2026-10-06) - fix: published SAP data always reaches Bench and Deploy**: after a Publish the header could show the new work-order and stock dates while Deploy and Bench kept the older data (OneDrive holding the file Lens had just written). Published data is now handed over directly, folder reads are retried, each source's header chip shows its date, "loading" or a red "NOT LOADED" with a TRY AGAIN button, and the refresh button re-reads the whole folder. **Lens v4.20 + numacore_workspace v0.3.3 (2026-10-01) - the start page has three options**: Establish a client folder (a new client or a new folder location: Lens creates the four folders, then takes the fleet JSON once); Open a client folder, with Test connection (read-only checks; a folder that is not set up goes straight to Establish); Drop to view a JSON (the file by itself, no client folder connected). A dropped fleet JSON no longer re-connects the folder the browser remembers for that client. **Cadence v18.18 + Deploy v8.22 + Lens v4.19 (2026-10-01) - project stages and finishing a project**: a project is Created -> In planning -> In execution -> Completed / Cancelled; Cadence and Deploy both ask "Project now in execution?" when the start date arrives. Finishing a project can start in either tool and first asks "Is the information captured in Deploy final? Closing this project will make these read-only." - Let me validate takes you to that project in Deploy, Yes carries on. Deploy's Mark as complete records the date, who, the components done or deferred, learnings and a review date; the project moves to a Done list and is read-only until Reopen; Cadence then offers Review & close. The Lens machine view shows the Planned PCR with its dates and components, marked In progress inside its planned dates. Deploy's dates no longer show a day early. **Cadence v18.17 + Lens v4.18 (2026-10-01) - machine states (retired + Revive)**: Horizon's end-of-life is now called **retired** (was 'decommissioned'); a retired machine's editor has a **Revive** action that needs the machine's current SMU (mandatory) and, on Revive, writes that reading to every component, clears the end date so the machine is Active again, and planning restarts. **Cadence** now reads each machine's retired date from the plan's horizon section and shows nothing after it (change-outs and projections stop at the retired date). **Lens v4.17 (2026-10-01) - apply Cadence close / cancel (builds history)**: the Lens half of Cadence v18.15/v18.16. On load, Lens reads the close/cancel events Cadence wrote (completedProjects[]) and, for each completed component, records the old fitting to the component history and resets it to a fresh cycle from the completion date (new install date/hours and forecast); a cancelled project / not-completed component is left on the schedule. Idempotent; a stale drag override on a replaced component is cleared. The machine tile's drill shows the new history, and Horizon shows a green (completed) / red (cancelled) marker per machine. Also allow-lists completedProjects in Mission Control so the events survive a save through Lens (closing the drop risk). **Cadence v18.16 (2026-10-01) - cancel a project (off the cards)**: right-click a project (Schedule bar, Project List row, or Optimiser) and choose **Cancel** - a confirm shows how many components will be unlinked, with an optional reason; on confirm every linked component is unlinked and returned to its theoretical change-out date, and the project is kept as a **cancelled** record on the Project List under History (red tag, no history built). A delay is not a cancel - drag it on the schedule. Writes the same owned completedProjects[] slice; also aligns the Close path to the A-16 project states (completed / cancelled). Operator-consented, rollback plan first. **Cadence v18.15 (2026-09-30) - close / complete a project (builds history)**: right-click a project (Schedule bar, Project List row, or Project Optimiser) and choose **Close / Complete** - tick the components that were actually done (they build history and start a fresh cycle from the completion date), un-tick what was not (it stays on the schedule, auto-unlinked), and add per-component notes; the project becomes a **completed record** shown on the Project List under **History**. Cadence writes only its own `completedProjects[]` slice (self-describing via `kind` / `schema`); the paired Lens change resets the completed components' install to the completion date and appends `componentHistory` (idempotent via `applied`). Additive - a new sibling array, existing saved plans are unchanged. Operator-consented, rollback plan written first. **Cadence v18.14.1 (2026-09-30) - one adaptive date tier**: the top date bar now shows a single tier chosen by the width you are viewing (weeks -> months -> quarters -> years, never stacked), and **All** fits the whole horizon to the screen. Display-only. **Cadence v18.14 (2026-09-29) - timeline zoom / pan slider**: a range slider under the Schedule and Project Optimiser timelines (the same component as Horizon's) - presets 3M / 6M / 1Y / 3Y / All, drag to pan, drag a handle to zoom, click a preset. View-only: the window is kept in this browser (cadence_view), never the plan; the default timeline is unchanged until you use it; the slider is inert while a bar is being dragged. Operator-consented, rollback plan written first. **Intake v8.15 + numacore_workspace v0.3.2 + Lens v4.16.2 (2026-09-29) — read date on flat hours, grouped results, resilient Publish**: Intake advances a component's read date when the hours are unchanged but the reading is newer (an idle machine — the idle period was being lost from the forecast); the update results are grouped and collapsible (Issue type -> Model -> Unit -> Component) with the counter cards as filters; the Update tab comes first, capped to the Trend-graph width, JSON tile first. numacore_workspace v0.3.2: a Publish that meets a file OneDrive is still moving no longer stops - it skips that file, logs it and finishes the rest (Lens gets it via v4.16.2). **Lens v4.16.1 (2026-09-28) — zoom the Horizon timeline**: a zoom / pan range slider under Horizon's axis (presets 3M–All, month labels when zoomed in, drag a handle to zoom or the middle to pan), built as one reusable component (numacore_rangeslider.js) that Cadence v18.14 and Building Blocks ui-kit reuse; the view is kept in your browser only (never the plan file), and the timeline opens at the full view. **Lens v4.16 + Bench v1.3.1 (2026-09-28) — Horizon**: every machine on a timeline (arrival, parked periods, end date = decommissioned after it; drag or click to edit), fleet classes (primary production … ancillary; a machine may differ) that set Pulse's and Bench's order, and planned machines "like" another with the components you keep ticked; kept in the plan's own horizon section. **Lens v4.15 + Intake v8.14 + Cadence v18.13.1 (2026-09-28) — component history, machines not on site yet**: click a component tile to see its history; Pulse opens with replaced components still linked to a project, and lists machines not on site yet; a machine with no hours whose last read date is after today is planned from that arrival date in Lens and Cadence, and Cadence's "Predictions As-Of" ignores those dates. **Intake v8.13 (2026-09-28) — replaced components still linked to a Cadence project**: when an update finds a replaced component that a Cadence project still lists, Intake records the case in the plan file (never changing Cadence's links), with the work orders on that unit around the new install date from an IW39 as back-up; the results list every case still open; the component history has one shape; a date in the update sheet needs at least a month and a year, and changed dates that don't make sense are flagged. **Lens v4.14 + Bench v1.3.0 + numacore_workspace v0.3.1 (2026-09-27) — hide components, overdue from hours, OneDrive saving and reading**: right-click a component to hide it from Pulse, Vitals, Horizon and Bench (never Cadence; buckets and blades on dozers, excavators and loaders hidden by default; a "hidden" chip unhides); overdue means life over 100 % in Bench and Pulse, never a passed plan date alone; Bench folds an opened row's notes, hides rows by right-click, and uses Lens's part numbers (same-name components only) where a model has no Component Snapshot; SAVE FILE asks for folder permission after a restart instead of downloading, and files OneDrive is still syncing are read patiently with a plain message and Try again. Before that, **Bench v1.2.1 (2026-09-27) — steady columns, zeros as dashes**: opening a component no longer moves the table's columns (they are fixed; text wraps in its cell), and a zero in any quantity cell shows as a dimmed "–" so the real quantities stand out. Before that, **Lens v4.13 + Bench v1.2.0 + numacore_workspace v0.3.0 (2026-09-27) — part numbers, Component Snapshots, one review**: Bench's new Part numbers view shows every part number of every component and what it pulls through to in the INV_MSTR (read-only, with the rows behind it); Cat Component Snapshots dropped in the client folder are read, matched to their Bench model by Model + S/N prefix and filed, and what they list that the definition doesn't becomes suggestions; part numbers can be edited by hand and a definition file gets a before / after; everything goes through one review (tick, Apply) and is logged in the definition; a "not saved yet" banner stays until SAVE FILE. Stock is never changed. Before that, **numacore_workspace v0.2.1 (2026-09-27) — a hotfix for real OneDrive folders**: a move no longer reports a failure when it worked (the removal of the original is retried; if OneDrive still holds it, Lens says so, logs it and tidies it at the next check); a file OneDrive still lists after it has gone is skipped; a locked file is read on a retry. Before that, **Lens v4.12 (2026-09-27) — a start page, the plan in the client folder, view only**: Lens opens on a start page (open a client folder · open a fleet file · recent folders); with the folder connected by the person who refreshes it, SAVE FILE keeps the plan in the folder (`lens\plan`, the previous one in `3 Archive\Plans`, nothing deleted) and ⬇ COPY downloads a copy; everyone else connects view only (the browser asks only to view files, and nothing in the folder changes); a fleet JSON dropped in `1 New files` is recognised as a plan; the heat map's ConMon rows no longer stretch. Before that, **Bench v1.1.2 (2026-09-27) — laid out like Critical Spares V3**: the Summary columns line up, an opened component's SAP rows sit under its own columns, the board keeps V3's size on wide screens, and a "part numbers don't match" row now shows both part lists when opened. Before that, **Bench v1.1.1 (2026-09-27) — every headline adds up to the rows under it**: assemblies are counted in complete kits with their SAP rows grouped by sub-part (the highlighted subtotal equals the card), components with several part numbers show as one family, the tiles follow the filter, and "Link file" is gone (the client folder replaced it). No stock number changed. Before that, **Lens v4.11 — the client folder**: SAP exports (IW39, INV_MSTR) are read from the client's synced OneDrive folder, dated from their data (amber after 7 days, red after 14, nothing older than 30 days loaded) and passed to Bench and Deploy; **one Save** (Lens's SAVE FILE collects Cadence's and Deploy's latest changes first, and their own Save buttons are gone inside Lens: Cadence v18.13, Deploy v8.20); and a **Meeting record** button that writes the saved plan and a "What was in use" note to the folder. Bench v1.1.0 adds the older Sandvik models. Before that, **Lens v4.10 — the Bench tab**: critical spares inside Lens, by model, with on the shelf / on the way / reserved and cover after inbound, linked to the plan (the same quantities as the standalone Critical Spares Review; v1.0.1 counts zero stock with no demand as No spare, not Short); **Cadence v18.12** — "today" worked out in local time (from 5 pm Pacific / 6 pm Mountain it had read tomorrow, which could save auto-moved dates as orphan overrides) — and **Deploy v8.19 + Lens v4.9.3 — SAP extracts dated from their own data**. An IW39 now carries the date of its data (newest *Created On*, checked against the date in the file name), an Inventory Master carries its file-name or entered date, and the Lens Risk Report's 30-day gate reads that data date instead of the upload time. Lens also embeds Cadence / Deploy / FleetConfig by their flat file names on every protocol, so a folder copy of the suite loads the current tools.

If you found your way here and you're a fleet-management or mining-tech person interested in talking about PCR methodology, get in touch via the repo owner.

---

## License

Currently unlicensed — defaults to "all rights reserved." Reading the code is welcome. Please don't redistribute, re-host, or use commercially without explicit permission.

---

<div align="center">

*Hand-written HTML/CSS/JS · CDN-loaded SheetJS + pdf.js · iteratively developed with Claude Code following a small, sharp set of engineering disciplines.*

</div>

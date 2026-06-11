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
| 🩺 **Lens** (Pulse · Vitals · Horizon) | [`index.html`](https://aisandbox-bj.github.io/numacore-lens-suite/) | Day-to-day glance. Fleet health summary, component KPIs, condition-monitoring heatmap, unit drill-down, utilisation profiles, capital plan. |
| 📅 **Cadence** | [`cadence.html`](https://aisandbox-bj.github.io/numacore-lens-suite/cadence.html) | The PCR scheduling tool. Gantt timeline of every component's planned replacement date, Auto-Build clusters, optimiser, resource loading, project list. The oldest and most vital tool in the suite. |
| 📦 **Deploy** | [`deploy.html`](https://aisandbox-bj.github.io/numacore-lens-suite/deploy.html) | Project / shutdown / outage execution. Gates, tasks, work orders, bill of materials, project Gantt with anchored TODAY line, Recently-Closed WO bucket. |
| 📥 **Intake** | [`intake.html`](https://aisandbox-bj.github.io/numacore-lens-suite/intake.html) | Data ingestion. Builds a fleet JSON from XLSX exports (SMU readings, IW39 work-order history, material master). Appends condition-monitoring PDFs. Monthly UPDATE flow preserves the advisor's planning work. |
| ⚙ **FleetConfig** | [`fleetconfig.html`](https://aisandbox-bj.github.io/numacore-lens-suite/fleetconfig.html) | Fleet-level configuration: util rates, component pockets, parts library. |

Plus three supporting artefacts:

| File | Purpose |
|---|---|
| [`manual.html`](https://aisandbox-bj.github.io/numacore-lens-suite/manual.html) | Full user manual — 16 tabs covering every feature, every data flow, every design decision. Updated every release. |
| [`numacore_lib.js`](https://aisandbox-bj.github.io/numacore-lens-suite/numacore_lib.js) | Small shared library (~1k lines). Toast UI, category canonicalisation, sort-field normalisation, a few cross-tool utilities. |
| [`migrate.html`](https://aisandbox-bj.github.io/numacore-lens-suite/migrate.html) | One-time V4 → V5 schema migrator. |

---

## Architecture decisions

### Single-file HTML, period

Every tool is one `.html` file with inline CSS, inline JS, and CDN-hosted libraries where parsing is needed (SheetJS for XLSX, pdf.js for PDFs). That's the whole stack.

No webpack. No rollup. No package.json. No bundler. No transpiler. No SSR. No PaaS. No SaaS. No cloud anything.

This is a deliberate constraint. It buys: reproducible behaviour across machines, trivial archival (the file IS the deployment), zero dependency rot, no supply-chain attack surface, and freedom from the framework treadmill. It costs: per-file growth (Cadence is ~7,500 lines), no module imports, no off-the-shelf component libraries. Those costs are acceptable for a tool of this complexity at this scale.

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
index.html        ← Lens (Pulse · Vitals · Horizon panels)
cadence.html      ← Cadence (PCR scheduling)
deploy.html       ← Deploy (project execution)
intake.html       ← Intake (data ingestion)
fleetconfig.html  ← FleetConfig
manual.html       ← User manual (14 tabs)
migrate.html      ← V4 → V5 schema migrator
numacore_lib.js   ← Shared library (~1k lines)
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

If you found your way here and you're a fleet-management or mining-tech person interested in talking about PCR methodology, get in touch via the repo owner.

---

## License

Currently unlicensed — defaults to "all rights reserved." Reading the code is welcome. Please don't redistribute, re-host, or use commercially without explicit permission.

---

<div align="center">

*Hand-written HTML/CSS/JS · CDN-loaded SheetJS + pdf.js · iteratively developed with Claude Code following a small, sharp set of engineering disciplines.*

</div>

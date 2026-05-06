# 4 - Build Output

All new files produced by this consolidation work go here. The agent developer writes here; the operator reads from here when validating.

## Expected end-state files

After all five build steps complete, this folder should contain:

- [ ] `numacore_lib.js` — shared helpers library
- [ ] `Intake v7.7.html` — clientCode-scoped storage, library-integrated
- [ ] `Cadence v18.html` — embed-aware (formerly Component Prediction Timeline v17)
- [ ] `NumaCore Lens v4.0.html` — Mission Control with `esc()` helper, embed-host module
- [ ] `Deploy v9.html` — embed-aware, with autosave

Per-step intermediate outputs (e.g. `NumaCore Lens v3.9.html` from Step 1) may also live here as the work progresses. The agent should keep them — they document the build journey.

## Versioning convention

Each step bumps the version of any tool it touches. See Build Brief Section 5 for the exact filename per step.

## Operator validation

Once the agent reports done, run the end-to-end acceptance scenario from Build Brief Section 9 against this folder. Sample data is in `5 - Test Data/`.

/* ═══════════════════════════════════════════════════════════════════════════
   numacore_budget.js — the life-of-fleet BUDGET for NumaCore Lens (Horizon)
   v1.0.0 · 2026-10-06

   Where it comes from
     The costing engine, the Excel workbook, the interactive report and the dialogs are LIFTED from Cadence v18.18
     (Cadence's budget, v18.8–v18.11) by a build script, not rewritten, so Horizon's numbers come from the same code.
     Cadence is not changed and keeps its own budget until the operator retires it (a later, separate step).

   What is new here (operator, 2026-09-28: "when machines will be parked / decom (stop budgetting)… the budget
   function should move to Horizon")
     • The machine timeline. With "Machine timeline" ticked (the default):
         – a machine past its retired date is left out altogether;
         – nothing is budgeted after a machine's retired date;
         – a parked period moves every later change-out out by its length (no hours while parked), except the next
           change-out of a component linked to a Cadence project (that date is a deliberate plan) — Lens's own rule.
       Unticked, the result is Cadence's rule exactly.
     • The plan rows are built here from the plan file with Cadence's own load rules, in Cadence's order: V5→V4 names,
       unit-median use rate (flagged inferred), cost read as a number (missing / unparseable flagged), the planner's
       date overrides, the theoretical date from hours (never for an overridden or project-linked component), dates in
       the past brought to today, the replacement-strategy default. A machine not on site yet is planned from its
       arrival (its last read date), as in Cadence.
     • Settings live in the plan's `horizon.budget` (Lens owns `horizon`). Cadence's `budgetConfig` is only read, to
       start Horizon's settings from; Cadence still owns and writes its own.

   API
     NumaCoreBudget.attach(host)   host = { plan():json, horizon():section|null, horizonEnd():year|null,
                                           onConfig(cfg), onResult({res, opts, base}), seedNote():html }
     NumaCoreBudget.open()         rebuild the rows from the plan, open the dialog
     NumaCoreBudget.run()          run with the saved settings, no dialog → {res, opts, base}
     NumaCoreBudget.compute(opts)  the engine (opts.windows: true = machine timeline on)
     NumaCoreBudget.setPlan(json, horizon) · rows(windows) · config() · setConfig(cfg) · last()
     NumaCoreBudget.reportHtml() · exportExcel() · downloadReport() · openRisk()
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
var VERSION = '1.0.0', LIFTED_FROM = 'Cadence v18.18';
var DATA = [];      // the plan rows, Cadence's rule
var DATA_W = [];    // the same rows with parked periods applied to the next change-out (machine timeline on)
var WIN = {};       // UNIT → { end:'YYYY-MM-DD'|null, parked:[{from,to}] } from the plan's horizon section
var HOST = null, LAST = null;
function _scheduleSave() { try { if (HOST && HOST.onConfig) HOST.onConfig(budgetConfig); } catch (e) { console.warn('budget onConfig:', e); } }

// ── lifted from Cadence: local-date helpers ──

function _localDateStamp() {
  const p = new Intl.DateTimeFormat('en-CA', { year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
  const g = ty => { const x = p.find(o => o.type === ty); return x ? x.value : '01'; };
  return g('year')+'-'+g('month')+'-'+g('day');
}
function _localDs(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}


// ── the machine timeline ──────────────────────────────────────────────────
function _nbMs(iso) { return new Date(String(iso).slice(0, 10) + 'T00:00:00').getTime(); }
// A date after a parked period's start moves out by the period's length (the period's days, both ends counted). Periods
// that start on or before `refMs` are not counted again. The same rule Lens uses for the dates it shows.
function _nbShiftMs(ms, refMs, parked) {
  var x = ms;
  for (var i = 0; i < parked.length; i++) { var p = parked[i]; if (p.fromMs > refMs && p.fromMs <= x) x += (p.toMs - p.fromMs) + 86400000; }
  return x;
}
function _nbWinFn(todayDs) {
  var cache = {};
  return function (r) {
    var K = String(r.unit || '').toUpperCase();
    if (cache[K] !== undefined) return cache[K];
    var w = WIN[K], out = null;
    if (w && (w.end || (w.parked && w.parked.length))) {
      out = { gone: !!(w.end && w.end < todayDs), endMs: w.end ? _nbMs(w.end) + 86400000 - 1 : null,
              parked: (w.parked || []).map(function (p) { return { fromMs: _nbMs(p.from), toMs: _nbMs(p.to) }; }) };
    }
    return (cache[K] = out);
  };
}
function _nbWindows(horizon) {
  var out = {}, m = horizon && horizon.machines;
  if (m && typeof m === 'object') Object.keys(m).forEach(function (k) {
    var x = m[k] || {}, end = x.active_to ? String(x.active_to).slice(0, 10) : null;
    var parked = (Array.isArray(x.parked) ? x.parked : []).filter(function (p) { return p && p.from && p.to; })
      .map(function (p) { return { from: String(p.from).slice(0, 10), to: String(p.to).slice(0, 10) }; }).sort(function (a, b) { return a.from.localeCompare(b.from); });
    if (end || parked.length) out[String(k).toUpperCase()] = { end: end, parked: parked };
  });
  return out;
}

// ── the plan rows: Cadence's load rules, in Cadence's order (see _initFromJSON in Cadence v18.18) ──
function _nbBuildRows(json) {
  json = json || {};
  var _components = (json.masterData && Array.isArray(json.masterData.components)) ? json.masterData.components
                  : (Array.isArray(json.components) ? json.components : []);
  var rows = _components.map(function (r) { return Object.assign({ replacement_strategy: '' }, r); });
  // V5 → V4 names and dates
  var _fleetNameLookup = {};
  ((json.masterData && Array.isArray(json.masterData.fleets)) ? json.masterData.fleets : []).forEach(function (f) {
    if (f && f.id !== undefined && f.id !== null) _fleetNameLookup[f.id] = f.name || String(f.id);
  });
  var _isMissing = function (v) { return v == null || v === '' || v === 'undefined' || v === 'Undefined'; };
  rows.forEach(function (r) {
    if (_isMissing(r.fleet)) {
      if (r.fleet_id != null && _fleetNameLookup[r.fleet_id]) r.fleet = _fleetNameLookup[r.fleet_id];
      else if (r.fleet_id != null && String(r.fleet_id).trim() !== '') r.fleet = String(r.fleet_id);
      else r.fleet = 'Unassigned';
    }
    if (_isMissing(r.unit) && !_isMissing(r.unit_id)) r.unit = r.unit_id;
    if (_isMissing(r.component) && !_isMissing(r.name)) r.component = r.name;
    if (_isMissing(r.changeout_date) && !_isMissing(r.changeout_date_erp)) r.changeout_date = r.changeout_date_erp;
    if (_isMissing(r.original_date) && !_isMissing(r.changeout_date_erp)) r.original_date = r.changeout_date_erp;
  });
  // use rate: the median of the machine's own components that have one (two or more), flagged inferred
  var _unitRates = {};
  rows.forEach(function (r) {
    var ur = Number(r.util_rate || 0);
    if (ur > 0 && r.unit && !r._util_rate_inferred) { if (!_unitRates[r.unit]) _unitRates[r.unit] = []; _unitRates[r.unit].push(ur); }
  });
  var _unitMedians = {};
  Object.keys(_unitRates).forEach(function (unit) {
    var rates = _unitRates[unit];
    if (rates.length >= 2) {
      var sorted = rates.slice().sort(function (a, b) { return a - b; }), mid = Math.floor(sorted.length / 2);
      _unitMedians[unit] = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    }
  });
  rows.forEach(function (r) {
    var ur = Number(r.util_rate || 0);
    if (ur <= 0 && r.unit && _unitMedians[r.unit] != null) { r.util_rate = _unitMedians[r.unit]; r._util_rate_inferred = true; }
  });
  // cost as a number; missing / unparseable flagged, never invented
  rows.forEach(function (r) {
    var raw = r.cost;
    if (typeof raw === 'number') { if (isFinite(raw)) { r.cost = raw; } else { r.cost = 0; r._cost_unparseable = true; } }
    else if (raw == null || String(raw).trim() === '') { r.cost = 0; r._cost_missing = true; }
    else { var n = Number(String(raw).replace(/[$,\s]/g, '')); if (isFinite(n)) { r.cost = n; } else { r.cost = 0; r._cost_unparseable = true; } }
  });
  // the planner's date overrides (V5 list wins when it has entries) and Cadence's project links
  var wd = (json.workingData && typeof json.workingData === 'object') ? json.workingData : {};
  var wf = (json.working && typeof json.working === 'object') ? json.working : {};
  var _projects = Array.isArray(wd.projects) ? wd.projects : (Array.isArray(wf.projects) ? wf.projects : null);
  var _ovV5 = Array.isArray(wd.componentDateOverrides) ? wd.componentDateOverrides : (Array.isArray(wf.componentDateOverrides) ? wf.componentDateOverrides : null);
  var _ovV4 = Array.isArray(wd.componentDates) ? wd.componentDates : (Array.isArray(wf.componentDates) ? wf.componentDates : null);
  var _dateOverrides = (_ovV5 && _ovV5.length) ? _ovV5 : (_ovV4 || []);
  _dateOverrides.forEach(function (o) {
    var oid = (o.id !== undefined) ? o.id : o.component_id;
    if (oid === undefined) return;
    var rec = rows.find(function (r) { return r.id === oid; });
    if (rec) rec.changeout_date = o.changeout_date;
  });
  var overrideIds = new Set(_dateOverrides.map(function (o) { return (o.id !== undefined) ? o.id : o.component_id; }).filter(function (x) { return x !== undefined; }));
  var linkedIds = new Set();
  (_projects || []).forEach(function (p) { if (p && Array.isArray(p.linkedIds)) p.linkedIds.forEach(function (id) { linkedIds.add(id); }); });
  // the theoretical date from hours: (benchmark − hours used) ÷ use rate, from the last reading
  var _todayMs = Date.now();
  rows.forEach(function (r) {
    var benchmark = Number(r.benchmark || 0), utilRate = Number(r.util_rate || 0);
    if (benchmark <= 0 || utilRate <= 0) return;
    var hoursUsed = Number(r.last_smu || 0) - Number(r.install_hours || 0);
    var daysRemaining = (benchmark - hoursUsed) / utilRate;
    var refMs = _todayMs;
    if (r.last_read) { var t = new Date(r.last_read).getTime(); if (!isNaN(t)) refMs = t; }
    var newMs = refMs + daysRemaining * 86400000;
    if (isNaN(newMs)) return;
    var newTheoretical = new Date(newMs).toISOString().split('T')[0];
    r.original_date = newTheoretical;
    if (overrideIds.has(r.id)) return;
    if (linkedIds.has(r.id)) return;
    r.changeout_date = newTheoretical;
  });
  // a date in the past is brought to today; the replacement-strategy default
  var _todayDs = _localDs(new Date());
  rows.forEach(function (r) {
    if (linkedIds.has(r.id)) r._nb_linked = true;
    if (!r.original_date) return;
    if (!r.changeout_date || r.changeout_date < _todayDs) r.changeout_date = r.original_date < _todayDs ? _todayDs : r.original_date;
    if (!r.replacement_strategy) r.replacement_strategy = (r.component || '').toLowerCase().includes('condition') ? 'condition_based' : 'usage_based';
  });
  return rows;
}
function setPlan(json, horizon) {
  DATA = _nbBuildRows(json);
  WIN = _nbWindows(horizon);
  DATA_W = DATA.map(function (r) {
    var w = WIN[String(r.unit || '').toUpperCase()];
    if (!w || !w.parked.length || r._nb_linked || !r.changeout_date) return r;
    var d = String(r.changeout_date).slice(0, 10), ref = String(r.last_read || '').slice(0, 10);
    var parked = w.parked.map(function (p) { return { fromMs: Date.UTC(+p.from.slice(0, 4), +p.from.slice(5, 7) - 1, +p.from.slice(8, 10)), toMs: Date.UTC(+p.to.slice(0, 4), +p.to.slice(5, 7) - 1, +p.to.slice(8, 10)) }; });
    var dMs = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
    var refMs = /^\d{4}-\d{2}-\d{2}$/.test(ref) ? Date.UTC(+ref.slice(0, 4), +ref.slice(5, 7) - 1, +ref.slice(8, 10)) : -Infinity;
    var x = _nbShiftMs(dMs, refMs, parked);
    if (x === dMs) return r;
    var nd = new Date(x), iso = nd.getUTCFullYear() + '-' + String(nd.getUTCMonth() + 1).padStart(2, '0') + '-' + String(nd.getUTCDate()).padStart(2, '0');
    return Object.assign({}, r, { changeout_date: iso, _nb_moved: true, _nb_from: d });
  });
  return DATA.length;
}

// ── lifted from Cadence: the budget engine (+ the machine timeline, marked "numacore_budget") ──

var budgetConfig = {
  fiscalStartMonth: 1,          // 1=Jan … 12=Dec (operator-set, persisted)
  bucketSize: 'month',          // 'month' | 'quarter' — SHORT-TERM band only
  projectionStart: 'thisMonth', // 'thisMonth' | 'nextFY'
  includeOverdueForward: true,  // budget overdue components' forward cycles?
  horizonYears: 10              // default/max forward horizon
};

var _BUDGET_MAX_CYCLES = 60;    // sanity cap per component; excees get flagged

function _budgetTodayDs() { return _localDs(new Date()); }   // v18.12 A: local date (toISOString is UTC = tomorrow after 6 pm Edmonton)
function _ymd(d) { return d.toISOString().split('T')[0]; }
function _monthKey(dateStr) { return dateStr.slice(0, 7); }            // 'YYYY-MM'
function _addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }

// Start-of-fiscal-year Date for the FY that CONTAINS ref (fsm = 1-based start month).
function _fyStart(ref, fsm) {
  const startThisCal = new Date(ref.getFullYear(), fsm - 1, 1);
  return (ref >= startThisCal) ? startThisCal : new Date(ref.getFullYear() - 1, fsm - 1, 1);
}
function _fyNextStart(ref, fsm) {
  const s = _fyStart(ref, fsm);
  return new Date(s.getFullYear() + 1, s.getMonth(), 1);
}

// Datability tier: 'full' (date+benchmark+util → cycles) | 'single' (date only) | 'unscheduled'.
function _budgetTier(r) {
  if (!r.changeout_date) return 'unscheduled';
  if (Number(r.benchmark) > 0 && Number(r.util_rate) > 0) return 'full';
  return 'single';
}

// Overdue backlog: original predicted date is past AND not rescheduled forward.
function _budgetIsOverdue(r, todayDs) {
  return !!r.original_date && r.original_date < todayDs && (r.changeout_date || '') <= todayDs;
}

// Budget Adjustment Factor keys (stable across reloads — name-based, not id-based).
function _bafCompKey(r){ return String(r.unit||'(no unit)') + '||' + (r.component||''); }
function _bafModelKey(r){ return (r.fleet||'(no fleet)') + '||' + (r.model||'(no model)'); }
// Effective BAF % for a component: component ?? unit ?? model ?? fleet ?? total ?? 0.
function _bafFactor(baf, r){
  if (!baf) return 0;
  const pick = x => { if (x===undefined||x===null||x==='') return undefined; const n=Number(x); return isFinite(n)?n:undefined; };
  let v;
  if (baf.component){ v=pick(baf.component[_bafCompKey(r)]); if(v!==undefined) return v; }
  if (baf.unit){ v=pick(baf.unit[String(r.unit||'(no unit)')]); if(v!==undefined) return v; }
  if (baf.model){ v=pick(baf.model[_bafModelKey(r)]); if(v!==undefined) return v; }
  if (baf.fleet){ v=pick(baf.fleet[r.fleet||'(no fleet)']); if(v!==undefined) return v; }
  v=pick(baf.total); if(v!==undefined) return v;
  return 0;
}

// Per-component costed events + risk flags within [startMs, endMs].
// Returns { events:[{date,cost,kind}], risk:{...}, overdueCost, unscheduledCost }.
function _budgetComponentEvents(r, ctx) {
  const { startMs, endMs, todayDs, includeOverdueForward } = ctx;
  const cost = Number(r.cost) || 0;
  const tier = _budgetTier(r);
  const events = [];
  const risk = {
    unscheduled: false, overdue: false, inferredUtil: false, conditionModelled: false,
    missingBenchmark: false, costMissing: !!r._cost_missing, costUnparseable: !!r._cost_unparseable,
    capped: false
  };

  // numacore_budget — the machine's Horizon window. null = no window for this machine, or the timeline is off
  // (Cadence's rule: unchanged). wfx reports what the window did to this component.
  const win = ctx.win ? ctx.win(r) : null;
  const wfx = { gone: false, dropped: 0, droppedCost: 0, moved: r._nb_moved ? 1 : 0 };
  if (win && win.gone) { wfx.gone = true; return { events, risk, unscheduledCost: 0, overdueCost: 0, wfx }; }
  if (tier === 'unscheduled') {
    risk.unscheduled = true;
    return { events, risk, unscheduledCost: cost, overdueCost: 0, wfx };
  }

  const overdue = _budgetIsOverdue(r, todayDs);
  if (overdue) risk.overdue = true;

  const dueMs = new Date(r.changeout_date + 'T00:00:00').getTime();
  // Forward-cycle anchor: overdue → brought to today; else the (future) changeout date.
  const anchorMs = overdue ? new Date(todayDs + 'T00:00:00').getTime() : dueMs;

  if (tier === 'full') {
    if (r._util_rate_inferred) risk.inferredUtil = true;
    if (r.replacement_strategy === 'condition_based') risk.conditionModelled = true;
    const cycleDays = Number(r.benchmark) / Number(r.util_rate);
    if (cycleDays > 0 && isFinite(cycleDays)) {
      const doForward = !overdue || includeOverdueForward;
      if (doForward) {
        for (let n = 1; ; n++) {
          if (n > _BUDGET_MAX_CYCLES) { risk.capped = true; break; }
          let ms = anchorMs + n * cycleDays * 86400000;
          let _mv = false;
          if (win && win.parked.length) { const m2 = _nbShiftMs(ms, anchorMs, win.parked); if (m2 !== ms) { ms = m2; _mv = true; } }   // no hours while parked
          if (ms > endMs) break;
          if (win && win.endMs != null && ms > win.endMs) { if (ms >= startMs) { wfx.dropped++; wfx.droppedCost += cost; } continue; }   // nothing after the retired date
          if (ms >= startMs) { events.push({ date: _ymd(new Date(ms)), cost, kind: 'cycle' }); if (_mv) wfx.moved++; }
        }
      }
    }
  } else if (!(Number(r.benchmark) > 0)) {
    risk.missingBenchmark = true;
  }

  // The next-due instance itself
  if (overdue) {
    return { events, risk, overdueCost: cost, unscheduledCost: 0, wfx };
  }
  if (dueMs >= startMs && dueMs <= endMs) {
    if (win && win.endMs != null && dueMs > win.endMs) { wfx.dropped++; wfx.droppedCost += cost; }   // nothing after the retired date
    else events.push({ date: r.changeout_date, cost, kind: 'due' });
  }
  return { events, risk, overdueCost: 0, unscheduledCost: 0, wfx };
}

// Roll the monthly map into fiscal-anchored report bands (spec §4).
//  stub (today→FY-end, if start=today) + short-term 24mo (bucketSize) + mid (quarterly) + long (annual).
function _buildBudgetBands(monthly, opts) {
  const fsm = opts.fiscalStartMonth;
  const startD = new Date(opts.fromDate + 'T00:00:00');
  const rangeEnd = new Date(opts.toDate + 'T00:00:00');
  // In 'nextFY' mode fromDate is ALREADY the next-FY boundary — the taper begins there,
  // with no stub. In 'thisMonth' mode the taper stays fiscal-anchored: a stub covers
  // fromDate → the next FY start, then the monthly window begins on that boundary.
  const taperAnchor = (opts.projectionStart === 'nextFY') ? new Date(startD) : _fyNextStart(startD, fsm);
  const sumMonths = (from, toExcl) => {
    let t = 0; let d = new Date(from);
    while (d < toExcl && d <= rangeEnd) { t += monthly[_monthKey(_ymd(d))] || 0; d = _addMonths(d, 1); }
    return t;
  };
  const bands = [];
  const pushBand = (label, from, toExcl, kind) => {
    const capped = new Date(Math.min(toExcl.getTime(), _addMonths(rangeEnd, 1).getTime()));
    if (from >= capped) return;
    bands.push({ label, kind, from: _ymd(from), to: _ymd(_addMonths(capped, -1)), total: sumMonths(from, capped) });
  };
  // Fiscal year named by its START calendar year; plain year when fiscal==calendar (fsm=1).
  const fyName = (d) => { const y = _fyStart(d, fsm).getFullYear(); return (fsm === 1) ? String(y) : ('FY' + y); };
  const quarterLabel = (d) => fyName(d) + ' Q' + (Math.floor((((d.getMonth() - (fsm - 1)) + 12) % 12) / 3) + 1);
  const monthLabel = (d) => d.toLocaleDateString('en-CA', { month: 'short', year: '2-digit' });

  // Stub: fromDate → taperAnchor (thisMonth mode only), grouped by bucketSize
  if (opts.projectionStart !== 'nextFY') {
    let d = new Date(startD.getFullYear(), startD.getMonth(), 1);
    while (d < taperAnchor) {
      if (opts.bucketSize === 'quarter') {
        const qEnd = _addMonths(d, 3);
        pushBand(quarterLabel(d), d, qEnd < taperAnchor ? qEnd : taperAnchor, 'stub'); d = qEnd;
      } else { pushBand(monthLabel(d), d, _addMonths(d, 1), 'stub'); d = _addMonths(d, 1); }
    }
  }
  // Short-term: 24 months from taperAnchor at bucketSize
  const shortEnd = _addMonths(taperAnchor, 24);
  { let d = new Date(taperAnchor);
    while (d < shortEnd) {
      if (opts.bucketSize === 'quarter') { pushBand(quarterLabel(d), d, _addMonths(d, 3), 'short'); d = _addMonths(d, 3); }
      else { pushBand(monthLabel(d), d, _addMonths(d, 1), 'short'); d = _addMonths(d, 1); }
    }
  }
  // Mid: months 25–60 → quarterly
  const midEnd = _addMonths(taperAnchor, 60);
  { let d = new Date(shortEnd); while (d < midEnd) { pushBand(quarterLabel(d), d, _addMonths(d, 3), 'mid'); d = _addMonths(d, 3); } }
  // Long: 61+ → annual (fiscal years)
  { let d = new Date(midEnd); while (d <= rangeEnd) { const e = _addMonths(d, 12); pushBand(fyName(d), d, e, 'long'); d = e; } }

  return bands;
}

// Orchestrator. opts: {fromDate,toDate,bucketSize,projectionStart,fiscalStartMonth,includeOverdueForward,fleets(Set|null)}
function _computeBudget(userOpts) {
  const today = _budgetTodayDs();
  const opts = Object.assign({
    fromDate: today,
    toDate: _ymd(_addMonths(new Date(today + 'T00:00:00'), budgetConfig.horizonYears * 12)),
    bucketSize: budgetConfig.bucketSize,
    projectionStart: budgetConfig.projectionStart,
    fiscalStartMonth: budgetConfig.fiscalStartMonth,
    includeOverdueForward: budgetConfig.includeOverdueForward,
    fleets: null
  }, userOpts || {});

  // Effective window start. fromDate already encodes the projection-start choice
  // ('nextFY' → next fiscal-year boundary; 'thisMonth' → first of the current month —
  // both set in _bmReadOpts) so committed pre-start work is naturally excluded.
  const _effStart = new Date(opts.fromDate + 'T00:00:00');
  const ctx = {
    startMs: _effStart.getTime(),
    endMs: new Date(opts.toDate + 'T00:00:00').getTime(),
    todayDs: today,
    includeOverdueForward: opts.includeOverdueForward,
    win: opts.windows ? _nbWinFn(today) : null
  };
  const winFx = { on: !!opts.windows, goneUnits: {}, goneComponents: 0, dropped: 0, droppedCost: 0, moved: 0 };

  // Equipment selection: opts.units is a Set of selected unit names (null = all).
  const _selUnits = (opts.units instanceof Set) ? opts.units : null;
  const rows = ((opts.windows ? DATA_W : DATA) || []).filter(r =>
    (!opts.fleets || opts.fleets.has(r.fleet)) &&
    (!_selUnits || _selUnits.has(String(r.unit || '(no unit)')))
  );
  const monthly = {};                 // 'YYYY-MM' → cost
  let overdueTotal = 0, unscheduledTotal = 0;
  const overdueRows = [], unscheduledRows = [], riskRows = [];
  const riskCount = { unscheduled: 0, overdue: 0, inferredUtil: 0, conditionModelled: 0, missingBenchmark: 0, cost: 0, capped: 0 };
  const riskCost  = { unscheduled: 0, overdue: 0, inferredUtil: 0, conditionModelled: 0, missingBenchmark: 0, cost: 0, capped: 0 };
  const perFleet = {};   // fleet -> { monthly:{}, overdue, unscheduled }
  const perUnit  = {};   // unit  -> { monthly:{}, overdue, unscheduled, fleet, model }
  const detailRows = []; // one per component (flat "Inputs" sheet — no subtotals)
  const zeroCostRows = []; // components with $0 / missing / unparseable cost (a budget risk)
  let baseGrand = 0;     // sum of pre-BAF contributions (for the total blended %)

  rows.forEach(r => {
    // Budget Adjustment Factor — uplift the component cost before generating events.
    const bafPct = _bafFactor(opts.baf, r);
    const _mult  = 1 + bafPct/100;
    const _rAdj  = (bafPct !== 0) ? Object.assign({}, r, { cost: (Number(r.cost)||0) * _mult }) : r;
    const { events, risk, overdueCost, unscheduledCost, wfx } = _budgetComponentEvents(_rAdj, ctx);
    if (wfx) { if (wfx.gone) { winFx.goneUnits[String(r.unit || '(no unit)')] = 1; winFx.goneComponents++; } winFx.dropped += wfx.dropped; winFx.droppedCost += wfx.droppedCost; winFx.moved += wfx.moved; }
    const fkey = r.fleet || '(no fleet)', ukey = String(r.unit || '(no unit)');
    const pf = (perFleet[fkey] = perFleet[fkey] || { monthly:{}, overdue:0, unscheduled:0, base:0 });
    const pu = (perUnit[ukey]  = perUnit[ukey]  || { monthly:{}, overdue:0, unscheduled:0, base:0, fleet:fkey, model:r.model||'' });
    let compPeriods = 0;
    const compCounts = {}, compMonthly = {};   // per-component monthly COUNT and COST (Intervention Count sheet + pivot page)
    events.forEach(e => { const k = _monthKey(e.date); monthly[k] = (monthly[k] || 0) + e.cost; pf.monthly[k]=(pf.monthly[k]||0)+e.cost; pu.monthly[k]=(pu.monthly[k]||0)+e.cost; compPeriods += e.cost; compCounts[k]=(compCounts[k]||0)+1; compMonthly[k]=(compMonthly[k]||0)+e.cost; });
    if (overdueCost)     { overdueTotal += overdueCost;     overdueRows.push({ r, cost: overdueCost }); pf.overdue += overdueCost; pu.overdue += overdueCost; }
    if (unscheduledCost) { unscheduledTotal += unscheduledCost; unscheduledRows.push({ r, cost: unscheduledCost }); pf.unscheduled += unscheduledCost; pu.unscheduled += unscheduledCost; }
    // Base (pre-BAF) contribution — adjusted scales linearly with cost, so divide back out.
    const _adjContribution  = compPeriods + (overdueCost||0) + (unscheduledCost||0);
    const _baseContribution = _mult ? _adjContribution/_mult : _adjContribution;
    pf.base += _baseContribution; pu.base += _baseContribution; baseGrand += _baseContribution;
    // risk tallies (one component can carry several)
    const tag = (key, on, cst) => { if (on) { riskCount[key]++; riskCost[key] += (cst || 0); } };
    tag('unscheduled', risk.unscheduled, unscheduledCost);
    tag('overdue', risk.overdue, overdueCost);
    tag('inferredUtil', risk.inferredUtil, Number(r.cost) || 0);
    tag('conditionModelled', risk.conditionModelled, Number(r.cost) || 0);
    tag('missingBenchmark', risk.missingBenchmark, 0);
    tag('cost', risk.costMissing || risk.costUnparseable, 0);
    tag('capped', risk.capped, 0);
    const flags = [];
    if (risk.unscheduled) flags.push('unscheduled');
    if (risk.overdue) flags.push('overdue');
    if (risk.inferredUtil) flags.push('inferred-util');
    if (risk.conditionModelled) flags.push('condition-modelled');
    if (risk.missingBenchmark) flags.push('missing-benchmark');
    if (risk.costMissing) flags.push('missing-cost');
    if (risk.costUnparseable) flags.push('unparseable-cost');
    if (risk.capped) flags.push('cycle-capped');
    if (flags.length) riskRows.push({
      unit: r.unit, component: r.component, fleet: r.fleet, model: r.model,
      issues: flags.join(', '),
      field: flags.includes('missing-cost') || flags.includes('unparseable-cost') ? 'cost'
           : flags.includes('missing-benchmark') ? 'benchmark'
           : (flags.includes('inferred-util') || flags.includes('unscheduled')) ? 'util_rate' : '',
      value: (r.cost === undefined ? '' : r.cost)
    });
    const _baseCost = Number(r.cost)||0;
    detailRows.push({ fleet:fkey, model:r.model||'', unit:ukey, component:r.component||'', tier:_budgetTier(r), nextDue:r.changeout_date||'', bafPct:bafPct, baseCost:_baseCost, adjCost:_baseCost*_mult, periodCalls:events.length, monthlyCounts:compCounts, monthlyCost:compMonthly, inPeriods:compPeriods, overdue:overdueCost||0, unscheduled:unscheduledCost||0, total:compPeriods+(overdueCost||0)+(unscheduledCost||0), flags:flags.join(', ') });
    // Zero-cost items — $0/missing/unparseable cost is a budget risk (spend is understated).
    if (_baseCost === 0) {
      zeroCostRows.push({ fleet:fkey, model:r.model||'', unit:ukey, component:r.component||'', tier:_budgetTier(r), nextDue:r.changeout_date||'', periodCalls:events.length,
        reason: risk.costUnparseable ? 'unparseable cost' : (risk.costMissing ? 'missing cost' : 'zero cost') });
    }
  });

  const bands = _buildBudgetBands(monthly, opts);
  const bandsTotal = bands.reduce((s, b) => s + b.total, 0);
  const grandTotal = bandsTotal + overdueTotal + unscheduledTotal;

  return {
    opts, monthly, bands,
    overdue: { total: overdueTotal, rows: overdueRows },
    unscheduled: { total: unscheduledTotal, rows: unscheduledRows },
    risk: { count: riskCount, cost: riskCost, rows: riskRows },
    reconciliation: { bandsTotal, overdueTotal, unscheduledTotal, grandTotal, baseGrand },
    perFleet, perUnit, detailRows, zeroCostRows, windowEffect: winFx
  };
}

var NB_DEFAULTS = JSON.parse(JSON.stringify(budgetConfig));


// ── lifted from Cadence: the dialogs' look and markup (recoloured for Lens) ──

var NB_CSS = "#budgetModal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9200;align-items:center;justify-content:center}\n#budgetModal.show{display:flex}\n#budgetModalBox{background:#07140f;border:1px solid #1d4a3d;border-radius:10px;width:600px;max-width:95vw;max-height:97vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 40px #000a}\n.bm-head{display:flex;align-items:center;justify-content:space-between;padding:14px 22px;border-bottom:1px solid #0f2a22;flex-shrink:0}\n.bm-head h3{margin:0;font-size:15px;color:#e6edf3;font-weight:700;letter-spacing:.3px}\n.bm-head h3 .bm-amber{color:#3dc9a0}\n.bm-x{background:none;border:none;color:#8b949e;font-size:16px;cursor:pointer;padding:2px 6px;border-radius:4px}\n.bm-x:hover{background:#1d4a3d;color:#e6edf3}\n.bm-body{padding:16px 22px}\n.bm-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px 22px}\n.bm-row{margin-bottom:14px}\n.bm-row:last-child{margin-bottom:0}\n.bm-lab{display:block;font-size:10px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;font-weight:600}\n.bm-inline{display:flex;align-items:center;gap:8px}\n.bm-inline span{color:#6e7681;font-size:12px}\n#budgetModal input[type=month],#budgetModal select{background:#050a12;border:1px solid #1d4a3d;color:#c9d1d9;padding:6px 9px;border-radius:5px;font-size:12px;font-family:inherit}\n#budgetModal input[type=month]:focus,#budgetModal select:focus{outline:none;border-color:#3dc9a0}\n#budgetModal select{width:100%}\n.bm-radios{display:flex;gap:8px 18px;flex-wrap:wrap}\n.bm-radios label,.bm-check{display:flex;align-items:center;gap:7px;font-size:12px;color:#c9d1d9;cursor:pointer;line-height:1.35}\n.bm-radios input,.bm-check input{accent-color:#3dc9a0;flex-shrink:0}\n.bm-check{align-items:flex-start}\n.bm-check input{margin-top:1px}\n.bm-hint{font-size:10px;color:#6e7681;margin-top:5px;line-height:1.45}\n.bm-equip-btn{background:#050a12;border:1px solid #1d4a3d;color:#c9d1d9;padding:6px 14px;border-radius:5px;cursor:pointer;font-size:12px;font-family:inherit}\n.bm-equip-btn:hover{border-color:#3dc9a0;color:#e6edf3}\n.bm-equip-summary{font-size:11px;color:#8b949e}\n.bm-foot{display:flex;align-items:center;justify-content:space-between;padding:13px 22px;border-top:1px solid #0f2a22;gap:12px;flex-shrink:0}\n.bm-risk-link{color:#5dcaa5;cursor:pointer;font-size:12px;text-decoration:none;display:inline-flex;align-items:center;gap:5px}\n.bm-risk-link:hover{text-decoration:underline}\n.bm-foot-btns{display:flex;gap:10px}\n.bm-btn-ghost{background:#0f2a22;border:1px solid #1d4a3d;color:#c9d1d9;padding:7px 16px;border-radius:6px;cursor:pointer;font-size:12px}\n.bm-btn-ghost:hover{background:#1d4a3d}\n.bm-btn-go{background:#1d9e75;border:1px solid #3dc9a0;color:#fff;padding:7px 18px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700}\n.bm-btn-go:hover{background:#5dcaa5}\n.bm-result{margin:0 22px 14px;border:1px solid #1d4a3d;border-radius:8px;padding:12px 16px;background:#050a12;font-size:12px;color:#c9d1d9;display:none;flex-shrink:0}\n.bm-result.show{display:block}\n.bm-result .bm-r-total{font-size:20px;color:#e6edf3;font-weight:700}\n.bm-result .bm-r-sub{color:#8b949e;font-size:11px;margin-top:2px}\n.bm-r-recon{display:flex;gap:18px;margin-top:9px;flex-wrap:wrap}\n.bm-r-recon .bm-r-k{color:#6e7681;font-size:10px;text-transform:uppercase;letter-spacing:.5px;display:block}\n.bm-r-recon .bm-r-v{color:#c9d1d9;font-weight:700;font-size:13px;display:block}\n.bm-r-risk{margin-top:9px;padding-top:9px;border-top:1px solid #0f2a22;font-size:11px;color:#8b949e;line-height:1.5}\n.bm-hdr-budget-btn{background:#0f2a22;color:#3dc9a0;border:1px solid #1d4a3d}\n.bm-hdr-budget-btn:hover{background:#1d4a3d;border-color:#3dc9a0}\n/* Equipment selector pop-out (fleet/model/unit tree) */\n#bmEquipModal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9300;align-items:center;justify-content:center}\n#bmEquipModal.show{display:flex}\n#bmEquipBox{background:#07140f;border:1px solid #1d4a3d;border-radius:10px;width:460px;max-width:92vw;height:min(960px,92vh);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 40px #000a}\n.be-head{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid #0f2a22;flex-shrink:0}\n.be-head h3{margin:0;font-size:14px;color:#e6edf3;font-weight:700}\n.be-toolbar{display:flex;align-items:center;gap:6px;padding:8px 18px;border-bottom:1px solid #0f2a22;flex-wrap:wrap;flex-shrink:0}\n.be-toolbar button{background:#0f2a22;border:1px solid #1d4a3d;color:#8b949e;font-size:10px;padding:4px 9px;border-radius:4px;cursor:pointer;text-transform:uppercase;letter-spacing:.4px;font-family:inherit}\n.be-toolbar button:hover{background:#1d4a3d;color:#3dc9a0}\n.be-sep{width:1px;height:16px;background:#1d4a3d;margin:0 3px}\n.be-tree{flex:1;overflow-y:auto;padding:8px 16px;min-height:140px}\n.be-row{display:flex;align-items:center;gap:7px;padding:3px 0;font-size:12px;color:#c9d1d9}\n.be-caret{width:12px;cursor:pointer;color:#8b949e;font-size:9px;user-select:none;text-align:center;flex-shrink:0}\n.be-caret-none{cursor:default}\n.be-cb{accent-color:#3dc9a0;flex-shrink:0;cursor:pointer}\n.be-lbl{cursor:pointer}\n.be-children{margin-left:16px;border-left:1px solid #0f2a22;padding-left:6px}\n.be-lbl-fleet{font-weight:700;color:#e6edf3}\n.be-lbl-model{color:#adbac7}\n.be-foot{display:flex;justify-content:flex-end;gap:10px;padding:12px 18px;border-top:1px solid #0f2a22;flex-shrink:0}\n/* Budget Adjustment Factor pop-out */\n#bmBafModal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9300;align-items:center;justify-content:center}\n#bmBafModal.show{display:flex}\n#bmBafBox{background:#07140f;border:1px solid #1d4a3d;border-radius:10px;width:540px;max-width:95vw;height:min(960px,92vh);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 40px #000a}\n#bmBafBox .be-toolbar .be-legend{margin-left:auto;font-size:9px;color:#6e7681;display:flex;gap:10px;align-items:center;text-transform:none;letter-spacing:0}\n.baf-lg-b{color:#3dc9a0;font-weight:700}.baf-lg-i{color:#6e7681}\n.baf-total-row{display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid #0f2a22;flex-shrink:0}\n.baf-total-row .bm-lab{margin:0}\n.baf-tree{flex:1;overflow-y:auto;padding:8px 16px;min-height:140px}\n.baf-row{display:flex;align-items:center;gap:7px;padding:2px 0;font-size:12px;color:#c9d1d9}\n.baf-caret{width:12px;cursor:pointer;color:#8b949e;font-size:9px;text-align:center;flex-shrink:0;user-select:none}\n.baf-caret-none{cursor:default}\n.baf-lbl{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.baf-lbl-fleet{font-weight:700;color:#e6edf3}\n.baf-lbl-model{color:#adbac7}\n.baf-lbl-comp{color:#8b949e}\n.baf-inp{width:58px;background:#050a12;border:1px solid #1d4a3d;color:#8b949e;padding:3px 6px;border-radius:4px;font-size:11px;text-align:right;font-family:inherit}\n.baf-inp:focus{outline:none;border-color:#3dc9a0}\n.baf-inp.baf-explicit{color:#3dc9a0;border-color:#1a7a60;font-weight:700}\n.baf-inp::placeholder{color:#484f58}\n.baf-pct{color:#6e7681;font-size:10px;width:8px}\n.baf-children{margin-left:16px;border-left:1px solid #0f2a22;padding-left:6px}\n#bafImportPrompt,#bmZeroBafWarn{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9400;align-items:center;justify-content:center}\n#bafImportPrompt.show,#bmZeroBafWarn.show{display:flex}\n#budgetModal input[type=number]{background:#050a12;border:1px solid #1d4a3d;color:#c9d1d9;padding:6px 9px;border-radius:5px;font-size:12px;font-family:inherit;width:60px}\n#budgetModal input[type=number]:focus{outline:none;border-color:#3dc9a0}\n.baf-prompt-box{background:#07140f;border:1px solid #1d4a3d;border-radius:10px;width:420px;max-width:92vw;padding:22px}\n.baf-prompt-box h3{margin:0 0 8px;font-size:14px;color:#e6edf3;font-weight:700}\n.baf-prompt-box p{font-size:12px;color:#8b949e;line-height:1.6;margin:0 0 16px}\n.baf-prompt-btns{display:flex;gap:10px;justify-content:flex-end}\n#bmRiskModal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9400;align-items:center;justify-content:center}\n#bmRiskModal.show{display:flex}\n.bmrisk-box{background:#07140f;border:1px solid #1d4a3d;border-radius:10px;width:660px;max-width:95vw;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 40px #000a}\n.bmrisk-scroll{padding:14px 18px;overflow:auto;flex:1}\n.bmrisk-tbl{width:100%;border-collapse:collapse;font-size:11px}\n.bmrisk-tbl th{position:sticky;top:0;background:#050a12;color:#8b949e;text-align:center;padding:5px 8px;border-bottom:1px solid #1d4a3d;font-weight:600;white-space:nowrap}\n.bmrisk-tbl th:first-child{text-align:left}\n.bmrisk-tbl td{padding:4px 8px;border-bottom:1px solid #0f2a22;color:#c9d1d9;text-align:center}\n.bmrisk-tbl .bmrisk-lbl{color:#e6edf3;text-align:left}\n.bmrisk-tbl .bmrisk-tot{font-weight:700;color:#3dc9a0}";

var NB_MARKUP = "<div id=\"budgetModal\" role=\"dialog\" aria-modal=\"true\">\n  <div id=\"budgetModalBox\">\n    <div class=\"bm-head\">\n      <h3><span class=\"bm-amber\">&#128202;</span>&nbsp; Budget &mdash; Horizon</h3>\n      <button class=\"bm-x\" onclick=\"closeBudgetModal()\" title=\"Close\">&#10005;</button>\n    </div>\n    <div class=\"bm-body\">\n      <div class=\"bm-row\">\n        <span class=\"bm-lab\">Projection start &amp; period</span>\n        <div class=\"bm-inline\">\n          <div class=\"bm-radios\" id=\"bmStart\">\n            <label><input type=\"radio\" name=\"bmStart\" value=\"thisMonth\" checked> This month</label>\n            <label><input type=\"radio\" name=\"bmStart\" value=\"nextFY\"> Next fiscal year</label>\n          </div>\n          <span>for</span>\n          <input type=\"number\" id=\"bmPeriodNum\" min=\"1\" max=\"600\" value=\"10\">\n          <select id=\"bmPeriodUnit\" style=\"width:auto\"><option value=\"years\">years</option><option value=\"months\">months</option></select>\n        </div>\n        <div class=\"bm-hint\" id=\"bmNextFYNote\" style=\"display:none;color:#5dcaa5;margin-top:6px\"></div>\n      </div>\n      <div class=\"bm-grid2\" style=\"margin-bottom:14px\">\n        <div>\n          <span class=\"bm-lab\">Short-term bucket</span>\n          <div class=\"bm-radios\" id=\"bmBucket\">\n            <label><input type=\"radio\" name=\"bmBucket\" value=\"month\" checked> Month</label>\n            <label><input type=\"radio\" name=\"bmBucket\" value=\"quarter\"> Quarter</label>\n          </div>\n          <div class=\"bm-hint\">First 24 months. Beyond that: quarterly (yrs 3&ndash;5) then annual.</div>\n        </div>\n        <div>\n          <span class=\"bm-lab\">Fiscal year starts</span>\n          <select id=\"bmFiscal\"></select>\n          <div class=\"bm-hint\">Saved to the fleet file.</div>\n        </div>\n      </div>\n      <div class=\"bm-grid2\" style=\"margin-bottom:14px\">\n        <div>\n          <span class=\"bm-lab\">Overdue components</span>\n          <label class=\"bm-check\"><input type=\"checkbox\" id=\"bmOverdue\" checked> Continue to budget forward per replacement schedule</label>\n        </div>\n        <div>\n          <span class=\"bm-lab\">Machine timeline (Horizon)</span>\n          <label class=\"bm-check\"><input type=\"checkbox\" id=\"bmWindows\" checked> Nothing after a machine's retired date; parked periods move its change-outs out</label>\n          <div class=\"bm-hint\">Untick for Cadence's rule: every machine is budgeted to the end of the period.</div>\n        </div>\n      </div>\n      <div class=\"bm-row\">\n        <span class=\"bm-lab\">Equipment (fleet / model / unit)</span>\n        <div class=\"bm-inline\">\n          <button type=\"button\" class=\"bm-equip-btn\" onclick=\"_bmOpenEquip()\">Select equipment&hellip;</button>\n          <span class=\"bm-equip-summary\" id=\"bmEquipSummary\">All equipment</span>\n        </div>\n      </div>\n      <div class=\"bm-row\">\n        <span class=\"bm-lab\">Budget adjustment factor <span style=\"text-transform:none;letter-spacing:0;color:#6e7681;font-weight:400\">(parts / labour uplift %)</span></span>\n        <div class=\"bm-inline\">\n          <button type=\"button\" class=\"bm-equip-btn\" onclick=\"_bmOpenBaf()\">Set BAF&hellip;</button>\n          <span class=\"bm-equip-summary\" id=\"bmBafSummary\">Total +0%</span>\n        </div>\n      </div>\n    </div>\n    <div class=\"bm-hint\" id=\"bmSeedNote\" style=\"margin:0 22px 10px\"></div>\n    <div class=\"bm-result\" id=\"bmResult\"></div>\n    <div class=\"bm-foot\">\n      <a class=\"bm-risk-link\" onclick=\"_bmOpenRisk()\">&#9888; Risk Report</a>\n      <div class=\"bm-foot-btns\">\n        <button class=\"bm-btn-ghost\" onclick=\"closeBudgetModal()\">Cancel</button>\n        <button class=\"bm-btn-go\" id=\"bmGenerateBtn\" onclick=\"_bmGenerate()\">Run the budget</button>\n      </div>\n    </div>\n  </div>\n</div>\n\n<!-- Equipment selector pop-out (fleet -> model -> unit tree) -->\n<div id=\"bmEquipModal\" role=\"dialog\" aria-modal=\"true\">\n  <div id=\"bmEquipBox\">\n    <div class=\"be-head\">\n      <h3>Select Equipment</h3>\n      <button class=\"bm-x\" onclick=\"_bmCloseEquip()\" title=\"Close\">&#10005;</button>\n    </div>\n    <div class=\"be-toolbar\">\n      <button onclick=\"_beExpandAll(true)\">&#9660; Expand all</button>\n      <button onclick=\"_beExpandAll(false)\">&#9654; Collapse all</button>\n      <span class=\"be-sep\"></span>\n      <button onclick=\"_beSelectAll(true)\">&#10003; Select all</button>\n      <button onclick=\"_beSelectAll(false)\">&#9744; Deselect all</button>\n    </div>\n    <div class=\"be-tree\" id=\"bmEquipTree\"></div>\n    <div class=\"be-foot\">\n      <button class=\"bm-btn-ghost\" onclick=\"_bmCloseEquip()\">Cancel</button>\n      <button class=\"bm-btn-go\" onclick=\"_beApply()\">Apply</button>\n    </div>\n  </div>\n</div>\n\n<!-- Budget Adjustment Factor pop-out (fleet -> model -> unit -> component; % boxes, inherit/override) -->\n<div id=\"bmBafModal\" role=\"dialog\" aria-modal=\"true\">\n  <div id=\"bmBafBox\">\n    <div class=\"be-head\">\n      <h3>Budget Adjustment Factor</h3>\n      <button class=\"bm-x\" onclick=\"_bmCloseBaf()\" title=\"Close\">&#10005;</button>\n    </div>\n    <div class=\"be-toolbar\">\n      <button onclick=\"_bafExpandAll(true)\">&#9660; Expand all</button>\n      <button onclick=\"_bafExpandAll(false)\">&#9654; Collapse all</button>\n      <button onclick=\"_bafResetAll()\">&#8635; Reset all</button>\n      <span class=\"be-sep\"></span>\n      <button onclick=\"_bafDownload()\">&#11015; Download</button>\n      <button onclick=\"document.getElementById('bafUpload').click()\">&#11014; Upload</button>\n      <input type=\"file\" id=\"bafUpload\" accept=\".xlsx\" style=\"display:none\" onchange=\"_bafUpload(event)\">\n      <span class=\"be-legend\"><span class=\"baf-lg-b\">bright = set here</span><span class=\"baf-lg-i\">dim = inherited</span></span>\n    </div>\n    <div class=\"baf-total-row\">\n      <span class=\"bm-lab\">Total (all selected)</span>\n      <input type=\"text\" class=\"baf-inp\" id=\"bafTotalInp\" data-level=\"total\" placeholder=\"0\"><span class=\"baf-pct\">%</span>\n      <span style=\"font-size:10px;color:#6e7681;margin-left:auto\">Empty a box + Enter resets it to its parent.</span>\n    </div>\n    <div class=\"baf-tree\" id=\"bmBafTree\"></div>\n    <div class=\"be-foot\">\n      <button class=\"bm-btn-go\" onclick=\"_bmCloseBaf()\">Done</button>\n    </div>\n  </div>\n</div>\n\n<!-- BAF import: empty-cell handling prompt -->\n<div id=\"bafImportPrompt\">\n  <div class=\"baf-prompt-box\">\n    <h3>Some cells are blank</h3>\n    <p>The uploaded template has empty BAF&nbsp;% cells. How should blanks be treated?</p>\n    <div class=\"baf-prompt-btns\">\n      <button class=\"bm-btn-ghost\" onclick=\"_bafImportChoose('inherit')\">Inherit (cascade)</button>\n      <button class=\"bm-btn-go\" onclick=\"_bafImportChoose('zero')\">Treat as 0%</button>\n    </div>\n  </div>\n</div>\n\n<!-- Warn if budget generated with no BAF set -->\n<div id=\"bmZeroBafWarn\">\n  <div class=\"baf-prompt-box\">\n    <h3>&#9888; No adjustment factor set</h3>\n    <p>All Budget Adjustment Factors are 0% &mdash; no parts / labour uplift will be applied to this budget. Review the BAF first, or continue with no uplift?</p>\n    <div class=\"baf-prompt-btns\">\n      <button class=\"bm-btn-ghost\" onclick=\"_bmZeroBafReview()\">Review BAF</button>\n      <button class=\"bm-btn-go\" onclick=\"_bmGenerateProceed()\">Continue to generate</button>\n    </div>\n  </div>\n</div>\n\n<!-- Risk Report (two-level): on-screen category x fleet summary + download detail -->\n<div id=\"bmRiskModal\" role=\"dialog\" aria-modal=\"true\">\n  <div class=\"bmrisk-box\">\n    <div class=\"be-head\"><h3>&#9888; Risk Report</h3><button class=\"bm-x\" onclick=\"_bmCloseRisk()\" title=\"Close\">&#10005;</button></div>\n    <div class=\"bmrisk-scroll\"><div id=\"bmRiskBody\"></div></div>\n    <div class=\"be-foot\">\n      <button class=\"bm-btn-ghost\" onclick=\"_bmCloseRisk()\">Close</button>\n      <button class=\"bm-btn-go\" onclick=\"_bmRiskDownload()\">&#11015; Download detail report</button>\n    </div>\n  </div>\n</div>\n";


// ── lifted from Cadence: the dialogs, the Excel workbook, the report, the adjustment factors ──

// ── Generate Budget pop-up wiring (v18.8 FEAT-1) ──────────────────────────
window._bmSelUnits = (typeof window._bmSelUnits === 'undefined') ? null : window._bmSelUnits; // null = all

function _nbWire(){
  function injectBtn(){
    const hdr = document.querySelector('.hdr-right');
    if (!hdr || document.getElementById('genBudgetBtn')) return;
    const b = document.createElement('button');
    b.id = 'genBudgetBtn'; b.className = 'btn bm-hdr-budget-btn';
    b.title = 'Generate a life-of-fleet budget';
    b.innerHTML = '&#128202;&nbsp; Budget';
    b.onclick = openBudgetModal;
    const exp = document.getElementById('doneBtn');
    if (exp && exp.parentNode === hdr) hdr.insertBefore(b, exp.nextSibling); else hdr.appendChild(b);
  }
  const sel = document.getElementById('bmFiscal');
  if (sel && !sel.options.length){
    ['January','February','March','April','May','June','July','August','September','October','November','December']
      .forEach((m,i)=>{ const o=document.createElement('option'); o.value=String(i+1); o.textContent=m; sel.appendChild(o); });
  }
  // Event delegation on the (static) equipment tree — synchronous propagation, no lag.
  const tree = document.getElementById('bmEquipTree');
  if (tree){
    tree.addEventListener('change', e=>{ if (e.target.classList.contains('be-cb')) _beOnCheck(e.target); });
    tree.addEventListener('click', e=>{ const c = e.target.closest('.be-caret'); if (c && !c.classList.contains('be-caret-none')) _beToggle(c); });
  }
  // 'Next fiscal year' assumption note
  document.querySelectorAll('input[name=bmStart]').forEach(r=>r.addEventListener('change', _bmUpdateNextFYNote));
  const fisc = document.getElementById('bmFiscal'); if (fisc) fisc.addEventListener('change', _bmUpdateNextFYNote);
  // BAF tree (delegated change/click) + total box — synchronous cascade, no lag
  const bafTree = document.getElementById('bmBafTree');
  if (bafTree){
    bafTree.addEventListener('change', e=>{ if (e.target.classList.contains('baf-inp')) _bafOnChange(e.target); });
    bafTree.addEventListener('click', e=>{ const c=e.target.closest('.baf-caret'); if (c && !c.classList.contains('baf-caret-none')) _bafToggle(c); });
  }
  const bafTotal = document.getElementById('bafTotalInp'); if (bafTotal) bafTotal.addEventListener('change', ()=>_bafOnChange(bafTotal));
}

function _bmUpdateNextFYNote(){
  const note = document.getElementById('bmNextFYNote'); if (!note) return;
  if (_bmRadio('bmStart') !== 'nextFY'){ note.style.display='none'; return; }
  const fsm = parseInt(document.getElementById('bmFiscal').value,10) || 1;
  let lbl = 'the next fiscal year';
  try { if (typeof _fyNextStart==='function'){ const s=_fyNextStart(new Date(), fsm); lbl=s.toLocaleDateString('en-CA',{month:'short',year:'numeric'}); } } catch(e){}
  note.innerHTML = '&#9888; Assumes all work scheduled before '+lbl+' is completed as planned &mdash; it is excluded from this budget.';
  note.style.display = '';
}

function _bmMonthStr(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function _bmRadio(name){ const el=document.querySelector('input[name='+name+']:checked'); return el?el.value:null; }
function _beEsc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

// ── Equipment tree ────────────────────────────────────────────────────────
function _beTreeData(){
  const t={};
  (typeof DATA!=='undefined'?DATA:[]).forEach(r=>{
    const f=r.fleet||'(no fleet)', m=r.model||'(no model)', u=String(r.unit||'(no unit)');
    (t[f]=t[f]||{}); (t[f][m]=t[f][m]||new Set()); t[f][m].add(u);
  });
  return t;
}
function _beRender(){
  const t=_beTreeData(); let html='';
  if (!Object.keys(t).length) return '<div style="color:#6e7681;font-size:11px;padding:8px">No fleet data loaded.</div>';
  Object.keys(t).sort().forEach(f=>{
    html+='<div class="be-node"><div class="be-row"><span class="be-caret">&#9654;</span><input type="checkbox" class="be-cb" data-level="fleet"><label class="be-lbl be-lbl-fleet">'+_beEsc(f)+'</label></div><div class="be-children" style="display:none">';
    Object.keys(t[f]).sort().forEach(m=>{
      html+='<div class="be-node"><div class="be-row"><span class="be-caret">&#9654;</span><input type="checkbox" class="be-cb" data-level="model"><label class="be-lbl be-lbl-model">'+_beEsc(m)+'</label></div><div class="be-children" style="display:none">';
      [...t[f][m]].sort().forEach(u=>{
        html+='<div class="be-node"><div class="be-row"><span class="be-caret be-caret-none"></span><input type="checkbox" class="be-cb" data-level="unit" data-unit="'+_beEsc(u)+'"><label class="be-lbl">'+_beEsc(u)+'</label></div></div>';
      });
      html+='</div></div>';
    });
    html+='</div></div>';
  });
  return html;
}
// Synchronous: parent click updates ALL descendants now, and rolls state up ancestors.
function _beOnCheck(cb){
  const node = cb.closest('.be-node');
  node.querySelectorAll('.be-cb').forEach(c=>{ c.checked = cb.checked; c.indeterminate = false; });
  let anc = node.parentElement ? node.parentElement.closest('.be-node') : null;
  while (anc){
    const own = anc.querySelector(':scope > .be-row > .be-cb');
    const units = [...anc.querySelectorAll('.be-cb[data-level="unit"]')];
    const on = units.filter(u=>u.checked).length;
    if (own){ own.checked = units.length>0 && on===units.length; own.indeterminate = on>0 && on<units.length; }
    anc = anc.parentElement ? anc.parentElement.closest('.be-node') : null;
  }
}
function _beRecomputeAll(){
  document.querySelectorAll('#bmEquipTree .be-node').forEach(node=>{
    const own = node.querySelector(':scope > .be-row > .be-cb');
    if (!own || own.dataset.level==='unit') return;
    const units = [...node.querySelectorAll('.be-cb[data-level="unit"]')];
    const on = units.filter(u=>u.checked).length;
    own.checked = units.length>0 && on===units.length; own.indeterminate = on>0 && on<units.length;
  });
}
function _beToggle(caret){
  const node = caret.closest('.be-node');
  const kids = node.querySelector(':scope > .be-children'); if (!kids) return;
  const open = kids.style.display !== 'none';
  kids.style.display = open ? 'none' : '';
  caret.innerHTML = open ? '&#9654;' : '&#9660;';
}
function _beExpandAll(open){
  document.querySelectorAll('#bmEquipTree .be-children').forEach(c=>c.style.display = open?'':'none');
  document.querySelectorAll('#bmEquipTree .be-caret:not(.be-caret-none)').forEach(c=>c.innerHTML = open?'&#9660;':'&#9654;');
}
function _beSelectAll(on){
  document.querySelectorAll('#bmEquipTree .be-cb').forEach(c=>{ c.checked = on; c.indeterminate = false; });
}
function _bmOpenEquip(){
  const tree = document.getElementById('bmEquipTree');
  tree.innerHTML = _beRender();
  const sel = window._bmSelUnits;
  tree.querySelectorAll('.be-cb[data-level="unit"]').forEach(u=>{ u.checked = !sel || sel.has(u.dataset.unit); });
  _beRecomputeAll();
  document.getElementById('bmEquipModal').classList.add('show');
}
function _bmCloseEquip(){ document.getElementById('bmEquipModal').classList.remove('show'); }
function _beApply(){
  const units = [...document.querySelectorAll('#bmEquipTree .be-cb[data-level="unit"]')];
  const checked = units.filter(u=>u.checked).map(u=>u.dataset.unit);
  window._bmSelUnits = (units.length && checked.length===units.length) ? null : new Set(checked);
  _bmUpdateEquipSummary();
  _bmCloseEquip();
}
function _bmUpdateEquipSummary(){
  const el = document.getElementById('bmEquipSummary'); if (!el) return;
  const sel = window._bmSelUnits;
  if (!sel){ el.textContent = 'All equipment'; return; }
  if (!sel.size){ el.textContent = 'None selected'; return; }
  const fleets = new Set((typeof DATA!=='undefined'?DATA:[]).filter(r=>sel.has(String(r.unit))).map(r=>r.fleet));
  el.textContent = sel.size+' unit'+(sel.size!==1?'s':'')+' · '+fleets.size+' fleet'+(fleets.size!==1?'s':'');
}

// ── Budget modal ──────────────────────────────────────────────────────────
function openBudgetModal(){
  document.getElementById('bmPeriodNum').value = budgetConfig.periodNum || 10;
  document.getElementById('bmPeriodUnit').value = budgetConfig.periodUnit || 'years';
  document.getElementById('bmFiscal').value = String(budgetConfig.fiscalStartMonth||1);
  document.getElementById('bmOverdue').checked = budgetConfig.includeOverdueForward!==false;
  const bs = budgetConfig.bucketSize||'month';
  let ps = budgetConfig.projectionStart||'thisMonth'; if (ps==='today') ps='thisMonth';   // legacy value migrated
  const br = document.querySelector('input[name=bmBucket][value="'+bs+'"]'); if (br) br.checked = true;
  const pr = document.querySelector('input[name=bmStart][value="'+ps+'"]'); if (pr) pr.checked = true;
  _bmUpdateEquipSummary();
  _bmUpdateNextFYNote();
  _bmUpdateBafSummary();
  _nbOpenExtras();
  document.getElementById('bmResult').classList.remove('show');
  document.getElementById('budgetModal').classList.add('show');
}
function closeBudgetModal(){ document.getElementById('budgetModal').classList.remove('show'); }

function _bmReadOpts(){
  const fsm  = parseInt(document.getElementById('bmFiscal').value,10)||1;
  const proj = _bmRadio('bmStart') || 'thisMonth';
  const now  = new Date();
  // Start is derived from the projection-start choice (no separate date picker):
  //  'thisMonth' → first of the current month; 'nextFY' → the next fiscal-year boundary.
  const startD = (proj==='nextFY') ? _fyNextStart(now, fsm) : new Date(now.getFullYear(), now.getMonth(), 1);
  const fromM  = startD.getFullYear()+'-'+String(startD.getMonth()+1).padStart(2,'0');
  const num  = Math.max(1, parseInt(document.getElementById('bmPeriodNum').value,10)||1);
  const unit = document.getElementById('bmPeriodUnit').value;
  const monthsToAdd = (unit==='years') ? num*12 : num;
  const end = new Date(startD.getFullYear(), startD.getMonth()+monthsToAdd, 0);   // last day of the final month
  const toDate = end.getFullYear()+'-'+String(end.getMonth()+1).padStart(2,'0')+'-'+String(end.getDate()).padStart(2,'0');
  return {
    fromDate: fromM + '-01',
    toDate: toDate,
    periodNum: num, periodUnit: unit,
    bucketSize: _bmRadio('bmBucket'),
    projectionStart: proj,
    fiscalStartMonth: fsm,
    includeOverdueForward: document.getElementById('bmOverdue').checked,
    fleets: null,
    units: window._bmSelUnits || null,
    baf: (budgetConfig.baf || null),
    windows: _nbWindowsOn()
  };
}
function _bmPersist(o){
  budgetConfig.bucketSize=o.bucketSize; budgetConfig.projectionStart=o.projectionStart;
  budgetConfig.fiscalStartMonth=o.fiscalStartMonth; budgetConfig.includeOverdueForward=o.includeOverdueForward;
  budgetConfig.periodNum=o.periodNum; budgetConfig.periodUnit=o.periodUnit; budgetConfig.windows=o.windows;
  try { if (typeof _scheduleSave==='function') _scheduleSave(); } catch(e){}
}
function _bmFmt(v){ return v>=1e6 ? '$'+(v/1e6).toFixed(2)+'M' : '$'+Math.round(v).toLocaleString(); }

function _bafAllZero(){ const b=budgetConfig.baf; if(!b) return true; const vals=[b.total].concat(Object.values(b.fleet||{}),Object.values(b.model||{}),Object.values(b.unit||{}),Object.values(b.component||{})); return vals.every(v=>v===''||v===undefined||v===null||Number(v)===0); }
function _bmZeroBafReview(){ const w=document.getElementById('bmZeroBafWarn'); if(w) w.classList.remove('show'); _bmOpenBaf(); }
function _bmGenerate(){
  if (typeof _computeBudget!=='function'){ alert('Budget engine unavailable.'); return; }
  if (_bafAllZero()){ const w=document.getElementById('bmZeroBafWarn'); if(w){ w.classList.add('show'); return; } }
  _bmGenerateProceed();
}
function _bmGenerateProceed(){
  const w=document.getElementById('bmZeroBafWarn'); if(w) w.classList.remove('show');
  const opts = _bmReadOpts(); _bmPersist(opts);
  const res = _computeBudget(opts); const rc = res.reconciliation, rk = res.risk.count;
  const el = document.getElementById('bmResult');
  el.innerHTML =
    '<div class="bm-r-total">'+_bmFmt(rc.grandTotal)+'</div>'+
    '<div class="bm-r-sub">life-of-fleet total &middot; '+res.bands.length+' report columns &middot; '+opts.fromDate.slice(0,7)+' &rarr; '+opts.toDate.slice(0,7)+'</div>'+
    '<div class="bm-r-recon">'+
      '<div><span class="bm-r-k">In periods</span><span class="bm-r-v">'+_bmFmt(rc.bandsTotal)+'</span></div>'+
      '<div><span class="bm-r-k">Overdue / backlog</span><span class="bm-r-v">'+_bmFmt(rc.overdueTotal)+'</span></div>'+
      '<div><span class="bm-r-k">Unscheduled</span><span class="bm-r-v">'+_bmFmt(rc.unscheduledTotal)+'</span></div>'+
      (rc.baseGrand>0 ? '<div><span class="bm-r-k">Blended BAF</span><span class="bm-r-v" style="color:#3dc9a0">'+(Math.round((rc.grandTotal/rc.baseGrand-1)*1000)/10)+'%</span></div>' : '')+
    '</div>'+
    '<div class="bm-r-risk">Risks: '+rk.unscheduled+' unscheduled &middot; '+rk.overdue+' overdue &middot; '+rk.inferredUtil+' inferred-util &middot; '+rk.conditionModelled+' modelled &middot; '+rk.missingBenchmark+' no-benchmark &middot; '+rk.cost+' cost &middot; '+rk.capped+' capped</div>'+
    '<div class="bm-r-risk" id="bmExportNote"></div>';
  el.classList.add('show');
  window._bmLastResult = res; window._bmLastOpts = opts;
  _nbAfterRun(res, opts);
}
function _bmOpenRisk(){
  const res = window._bmLastResult;
  const body = document.getElementById('bmRiskBody');
  if (!res){ body.innerHTML = '<p style="color:#8b949e;font-size:12px;margin:0">Press <b style="color:#3dc9a0">Run the budget</b> first to compute risks, then reopen this report.</p>'; document.getElementById('bmRiskModal').classList.add('show'); return; }
  // Level 1: risk class x fleet count matrix, from res.risk.rows[].issues (comma-joined flags).
  const CLASSES = [['unscheduled','Unscheduled (undated)'],['inferred-util','Inferred util_rate'],['condition-modelled','Condition-based (modelled)'],['missing-benchmark','Missing benchmark'],['missing-cost','Missing cost'],['unparseable-cost','Unparseable cost'],['cycle-capped','Cycle-capped']];
  const fleets = [...new Set(res.risk.rows.map(r=>r.fleet))].sort();
  const m = {}; CLASSES.forEach(([k])=>m[k]={});
  res.risk.rows.forEach(r=>{ (r.issues||'').split(',').map(s=>s.trim()).forEach(fl=>{ if(m[fl]) m[fl][r.fleet]=(m[fl][r.fleet]||0)+1; }); });
  const present = CLASSES.filter(([k])=>Object.keys(m[k]).length);
  if (!present.length){ body.innerHTML='<p style="color:#3fb950;font-size:12px;margin:0">No risks flagged in the current budget. &#10003;</p>'; }
  else {
    let h='<table class="bmrisk-tbl"><thead><tr><th>Risk</th>'+fleets.map(f=>'<th>'+_beEsc(f)+'</th>').join('')+'<th>Total</th></tr></thead><tbody>';
    present.forEach(([k,label])=>{ let tot=0; h+='<tr><td class="bmrisk-lbl">'+label+'</td>'+fleets.map(f=>{const c=m[k][f]||0;tot+=c;return '<td>'+(c||'')+'</td>';}).join('')+'<td class="bmrisk-tot">'+tot+'</td></tr>'; });
    h+='</tbody></table><p style="color:#6e7681;font-size:10px;margin:10px 0 0">Download the detail report for the machine + component list and the field to fix at source.</p>';
    body.innerHTML=h;
  }
  document.getElementById('bmRiskModal').classList.add('show');
}
function _bmCloseRisk(){ document.getElementById('bmRiskModal').classList.remove('show'); }
function _bmRiskDownload(){
  const res = window._bmLastResult; if(!res) return;
  const XL=window.XLSX; if(!XL){ alert('Excel library not available.'); return; }
  const rl={unscheduled:'Unscheduled (undated)',inferredUtil:'Inferred util_rate',conditionModelled:'Condition-based (modelled)',missingBenchmark:'Missing benchmark',cost:'Cost missing/unparseable',capped:'Cycle-capped (suspect data)'};
  const rsRows=[['Risk class','Count','$ exposure']]; Object.keys(rl).forEach(k=>rsRows.push([rl[k],res.risk.count[k],Math.round(res.risk.cost[k]||0)]));
  const rdRows=[['Unit','Component','Fleet','Model','Issues','Field to fix','Current value']]; res.risk.rows.forEach(x=>{ const iss=(x.issues||'').split(',').map(s=>s.trim()).filter(s=>s&&s!=='overdue'); if(!iss.length) return; rdRows.push([String(x.unit),x.component,x.fleet,x.model,iss.join(', '),x.field,x.value]); });
  const wb=XL.utils.book_new();
  XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(rsRows), 'Risk Summary');
  XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(rdRows), 'Risk Detail');
  try{ XL.writeFile(wb, 'Horizon Risk Report '+_localDs(new Date())+'.xlsx');   /* v18.12 A: local date */ }catch(e){ alert('Download failed: '+e.message); }
}

// ── Excel export — formatted, auto-filtered ranges (SheetJS; no native tables/charts) ──
function _bmBuildWorkbook(res, opts){
  const XL = window.XLSX; if (!XL) return null;
  const d0 = v => Math.round(Number(v)||0);                                  // whole dollars / counts
  const p1 = v => Math.round((Number(v)||0)*10)/10;                          // one-decimal percent
  const blend = (adj,base)=> base ? Math.round((adj/base-1)*1000)/10 : 0;    // cost-weighted blended BAF %
  const bandLabels = res.bands.map(b=>b.label);

  // Whole-number formatting (#,##0) on every numeric cell whose header is NOT a % column,
  // plus an AutoFilter over the used range. Summary (key/value) skips the filter.
  const fmtSheet = (ws, filter)=>{
    const ref=ws['!ref']; if(!ref) return ws;
    const rng=XL.utils.decode_range(ref), hdr=[];
    for(let c=rng.s.c;c<=rng.e.c;c++){ const h=ws[XL.utils.encode_cell({r:rng.s.r,c})]; hdr[c]=h?String(h.v):''; }
    for(let c=rng.s.c;c<=rng.e.c;c++){
      if(/%|BAF/.test(hdr[c]||'')) continue;
      for(let r=rng.s.r+1;r<=rng.e.r;r++){ const cell=ws[XL.utils.encode_cell({r,c})]; if(cell&&cell.t==='n') cell.z='#,##0'; }
    }
    if(filter!==false) ws['!autofilter']={ref:ref};
    return ws;
  };
  const bandCells = (monthlyMap)=> _buildBudgetBands(monthlyMap,opts).map(b=>b.total);

  // Per-model aggregation (rolled up from perUnit) for the Model Summary sheet.
  const perModel={};
  Object.keys(res.perUnit).forEach(u=>{ const pu=res.perUnit[u]; const k=pu.fleet+'||'+pu.model;
    const pm=(perModel[k]=perModel[k]||{fleet:pu.fleet,model:pu.model,monthly:{},overdue:0,unscheduled:0,base:0});
    Object.keys(pu.monthly).forEach(mk=>pm.monthly[mk]=(pm.monthly[mk]||0)+pu.monthly[mk]);
    pm.overdue+=pu.overdue; pm.unscheduled+=pu.unscheduled; pm.base+=pu.base; });

  // ── Fleet / Model / Unit summaries — order: Total, Overdue, Unscheduled, BAF %, then periods
  const fsRows=[['Fleet','Total','Overdue/Backlog','Unscheduled','BAF %', ...bandLabels]];
  const bandTot=bandLabels.map(()=>0); let tOd=0,tUn=0,tAll=0;
  Object.keys(res.perFleet).sort().forEach(fk=>{
    const pf=res.perFleet[fk], cells=bandCells(pf.monthly);
    const rt=cells.reduce((a,b)=>a+b,0)+pf.overdue+pf.unscheduled;
    cells.forEach((v,i)=>bandTot[i]+=v); tOd+=pf.overdue; tUn+=pf.unscheduled; tAll+=rt;
    fsRows.push([fk, d0(rt), d0(pf.overdue), d0(pf.unscheduled), p1(blend(rt,pf.base)), ...cells.map(d0)]);
  });
  fsRows.push(['TOTAL', d0(tAll), d0(tOd), d0(tUn), p1(blend(tAll,res.reconciliation.baseGrand)), ...bandTot.map(d0)]);

  const msRows=[['Fleet','Model','Total','Overdue/Backlog','Unscheduled','BAF %', ...bandLabels]];
  Object.keys(perModel).sort((a,b)=>a.localeCompare(b)).forEach(k=>{
    const pm=perModel[k], cells=bandCells(pm.monthly);
    const rt=cells.reduce((a,b)=>a+b,0)+pm.overdue+pm.unscheduled;
    msRows.push([pm.fleet,pm.model, d0(rt), d0(pm.overdue), d0(pm.unscheduled), p1(blend(rt,pm.base)), ...cells.map(d0)]);
  });

  const usRows=[['Fleet','Model','Unit','Total','Overdue/Backlog','Unscheduled','BAF %', ...bandLabels]];
  Object.keys(res.perUnit).sort((a,b)=>{const pa=res.perUnit[a],pb=res.perUnit[b];return (pa.fleet+'|'+pa.model+'|'+a).localeCompare(pb.fleet+'|'+pb.model+'|'+b);}).forEach(u=>{
    const pu=res.perUnit[u], cells=bandCells(pu.monthly);
    const rt=cells.reduce((a,b)=>a+b,0)+pu.overdue+pu.unscheduled;
    usRows.push([pu.fleet,pu.model,u, d0(rt), d0(pu.overdue), d0(pu.unscheduled), p1(blend(rt,pu.base)), ...cells.map(d0)]);
  });

  // ── Inputs — flat, data-only (no subtotals), one row per component per machine
  const sorted=[...res.detailRows].sort((a,b)=>(a.fleet+'|'+a.model+'|'+a.unit+'|'+a.component).localeCompare(b.fleet+'|'+b.model+'|'+b.unit+'|'+b.component));
  // component-level cost is the BAF-INCLUSIVE figure; no separate base / BAF% / adjusted breakout (never strippable)
  const inRows=[['Fleet','Model','Unit','Component','Tier','Next Due','Period Calls','Cost','Total','Overdue','Unscheduled','In Periods','Flags']];
  sorted.forEach(r=>inRows.push([r.fleet,r.model,r.unit,r.component,r.tier,r.nextDue,r.periodCalls,d0(r.adjCost),d0(r.total),d0(r.overdue),d0(r.unscheduled),d0(r.inPeriods),r.flags]));

  // ── Intervention Count — component x period COUNT (detail only, no summaries)
  const icRows=[['Fleet','Model','Unit','Component','Total interventions', ...bandLabels]];
  sorted.forEach(r=>{ const cb=_buildBudgetBands(r.monthlyCounts||{},opts).map(b=>b.total); icRows.push([r.fleet,r.model,r.unit,r.component,r.periodCalls, ...cb]); });

  // ── Component Cost — component x period COST (max-detail cost version of Intervention Count; with BAF, in-period)
  const ccRows=[['Fleet','Model','Unit','Component','Total cost', ...bandLabels]];
  sorted.forEach(r=>{ const cb=_buildBudgetBands(r.monthlyCost||{},opts).map(b=>Math.round(b.total)); const tot=cb.reduce((s,v)=>s+v,0); ccRows.push([r.fleet,r.model,r.unit,r.component,tot, ...cb]); });

  // ── Overdue backlog (its own tab; NOT duplicated under Risk)
  const odRows=[['Fleet','Model','Unit','Component','Cost','Original Date','Effective Date']];
  res.overdue.rows.forEach(o=>{const r=o.r; odRows.push([r.fleet,r.model,String(r.unit),r.component,d0(o.cost),r.original_date||'',r.changeout_date||'']);});

  // ── Zero-Cost Items — $0 / missing / unparseable cost (a budget risk)
  const zcRows=[['Fleet','Model','Unit','Component','Tier','Next Due','Period Calls','Reason']];
  (res.zeroCostRows||[]).forEach(z=>zcRows.push([z.fleet,z.model,z.unit,z.component,z.tier,z.nextDue,z.periodCalls,z.reason]));

  // ── Risk — data-quality issues ONLY (overdue lives on its own tab, not here)
  const rl={unscheduled:'Unscheduled (undated)',inferredUtil:'Inferred util_rate',conditionModelled:'Condition-based (modelled)',missingBenchmark:'Missing benchmark',cost:'Cost missing/unparseable',capped:'Cycle-capped (suspect data)'};
  const rsRows=[['Risk class','Count','$ exposure']];
  Object.keys(rl).forEach(k=>rsRows.push([rl[k],res.risk.count[k],d0(res.risk.cost[k])]));
  const rdRows=[['Unit','Component','Fleet','Model','Issues','Field to fix','Current value']];
  res.risk.rows.forEach(x=>{ const iss=(x.issues||'').split(',').map(s=>s.trim()).filter(s=>s&&s!=='overdue'); if(!iss.length) return; rdRows.push([String(x.unit),x.component,x.fleet,x.model,iss.join(', '),x.field,x.value]); });

  // ── Summary / reconciliation (ASCII; pivot-source note)
  const rc=res.reconciliation;
  const eqNote = (opts.units instanceof Set) ? (opts.units.size+' unit(s) selected') : 'All equipment';
  const cov=[['Horizon - Life-of-Fleet Budget'],[],
    ['Range', opts.fromDate+' to '+opts.toDate],
    ['Projection start', opts.projectionStart==='nextFY'?'Next fiscal year':'This month'],
    ['Short-term bucket', opts.bucketSize],['Fiscal year start (month)', opts.fiscalStartMonth],
    ['Overdue budgeted forward', opts.includeOverdueForward?'Yes':'No'],['Equipment', eqNote],
    ['Machine timeline (Horizon)', _nbWinText(res, opts)],
    ['Basis',"Today's money (no inflation)"],[],
    ['GRAND TOTAL', d0(rc.grandTotal)],
    ['In periods', d0(rc.bandsTotal)],['Overdue / backlog', d0(rc.overdueTotal)],['Unscheduled', d0(rc.unscheduledTotal)],[],
    ['Blended BAF %', p1(blend(rc.grandTotal, rc.baseGrand))],[],
    ['Note','The Inputs sheet is the flat, pivot-ready component source. Insert > PivotTable off it to build custom summaries.']];

  const wb=XL.utils.book_new();
  const add=(rows,name,filter)=>XL.utils.book_append_sheet(wb, fmtSheet(XL.utils.aoa_to_sheet(rows),filter), name);
  add(cov,'Summary',false);
  add(inRows,'Inputs');
  add(icRows,'Intervention Count');
  add(fsRows,'Fleet Summary');
  add(msRows,'Model Summary');
  add(usRows,'Unit Summary');
  add(ccRows,'Component Cost');
  add(odRows,'Overdue');
  add(zcRows,'Zero-Cost Items');
  add(rsRows,'Risk Summary');
  add(rdRows,'Risk Detail');
  return wb;
}

// ── Interactive HTML Budget Report — tabs (Parameters / Risk / Budget), drill-down, heat-map, charts ──
function _bmBuildPivotHtml(res, opts){
  const bandMeta = res.bands.map(b=>({label:b.label, from:b.from, to:b.to, kind:b.kind}));
  const rows = [...res.detailRows]
    .sort((a,b)=>(a.fleet+'|'+a.model+'|'+a.unit+'|'+a.component).localeCompare(b.fleet+'|'+b.model+'|'+b.unit+'|'+b.component))
    .map(r=>({ f:r.fleet||'', m:r.model||'', u:String(r.unit||''), c:r.component||'',
      cost:_buildBudgetBands(r.monthlyCost||{},opts).map(b=>Math.round(b.total)),
      cnt:_buildBudgetBands(r.monthlyCounts||{},opts).map(b=>b.total),
      od:Math.round(r.overdue||0), un:Math.round(r.unscheduled||0), tot:Math.round(r.total||0),
      calls:r.periodCalls||0, baf:r.bafPct||0, tier:r.tier||'', nextDue:r.nextDue||'' }));
  const rc=res.reconciliation;
  const params=[
    ['Range', opts.fromDate+' to '+opts.toDate],
    ['Projection start', opts.projectionStart==='nextFY'?'Next fiscal year':'This month'],
    ['Short-term bucket', String(opts.bucketSize)],
    ['Fiscal year start (month)', String(opts.fiscalStartMonth)],
    ['Overdue budgeted forward', opts.includeOverdueForward?'Yes':'No'],
    ['Equipment', (opts.units instanceof Set)?(opts.units.size+' unit(s) selected'):'All equipment'],
    ['Machine timeline (Horizon)', _nbWinText(res, opts)],
    ['Basis',"Today's money (inflation not applied)"] ];
  const rlab={unscheduled:'Unscheduled (undated)',inferredUtil:'Inferred util_rate',conditionModelled:'Condition-based (modelled)',missingBenchmark:'Missing benchmark',cost:'Cost missing/unparseable',capped:'Cycle-capped (suspect data)'};
  const risk={
    summary:Object.keys(rlab).map(k=>[rlab[k], res.risk.count[k]||0, Math.round(res.risk.cost[k]||0)]),
    detail:res.risk.rows.map(x=>{const iss=(x.issues||'').split(',').map(s=>s.trim()).filter(s=>s&&s!=='overdue');return iss.length?[String(x.unit),x.component,x.fleet,x.model,iss.join(', '),x.field,String(x.value)]:null;}).filter(Boolean),
    zero:(res.zeroCostRows||[]).map(z=>[z.fleet,z.model,String(z.unit),z.component,z.tier,z.nextDue,z.periodCalls,z.reason]),
    overdue:res.overdue.rows.map(o=>{const r=o.r;return [r.fleet,r.model,String(r.unit),r.component,Math.round(o.cost),r.original_date||'',r.changeout_date||''];}) };
  const recon={grand:Math.round(rc.grandTotal),inperiod:Math.round(rc.bandsTotal),overdue:Math.round(rc.overdueTotal),unscheduled:Math.round(rc.unscheduledTotal),base:Math.round(rc.baseGrand),blended:rc.baseGrand>0?Math.round((rc.grandTotal/rc.baseGrand-1)*1000)/10:0};
  const payload={gen:_localDs(new Date()),   /* v18.12 A: local date */
    range:opts.fromDate+' to '+opts.toDate, fsm:opts.fiscalStartMonth, bands:bandMeta, rows:rows, params:params, risk:risk, recon:recon};
  const json=JSON.stringify(payload).replace(/</g,'\\u003c');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Horizon Budget Report</title>
<script src="https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js"><\/script>
<style>
:root{--bg:#0d1117;--panel:#161b22;--panel2:#1c2129;--line:#21262d;--line2:#30363d;--txt:#c9d1d9;--txt2:#8b949e;--head:#e6edf3;--amber:#e3a72c;--amber2:#bb8009;--red:#f85149;--green:#2ea043}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px}
*{scrollbar-width:thin;scrollbar-color:#30363d transparent}
::-webkit-scrollbar{width:9px;height:9px}
::-webkit-scrollbar-thumb{background:#30363d;border-radius:5px}
::-webkit-scrollbar-thumb:hover{background:#484f58}
::-webkit-scrollbar-track{background:transparent}
header{padding:14px 22px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:linear-gradient(90deg,#12161d,#0d1117)}
header h1{margin:0;font-size:16px;color:var(--head);font-weight:700;letter-spacing:.3px}
header .meta{color:var(--txt2);font-size:11px}
.tabs{display:flex;gap:2px;padding:0 22px;border-bottom:1px solid var(--line);background:var(--panel)}
.tab{padding:11px 18px;cursor:pointer;color:var(--txt2);font-weight:600;font-size:13px;border-bottom:2px solid transparent;user-select:none}
.tab:hover{color:var(--txt)}.tab.on{color:var(--amber);border-bottom-color:var(--amber)}
.wrap{padding:18px 22px 60px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin-bottom:16px}
.card h2{margin:0 0 12px;font-size:13px;color:var(--head);text-transform:uppercase;letter-spacing:.6px}
.recon{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 16px;min-width:130px}
.kpi .k{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--txt2)}
.kpi .v{font-size:19px;font-weight:700;color:var(--head);font-variant-numeric:tabular-nums;margin-top:3px}
.kpi.amber .v{color:var(--amber)}
.ctl{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.seg{display:flex;border:1px solid var(--line2);border-radius:6px;overflow:hidden}
.seg button{background:var(--bg);border:0;color:var(--txt2);padding:6px 13px;cursor:pointer;font-size:12px;font-family:inherit;font-weight:600}
.seg button.on{background:var(--amber2);color:#fff}
.lbl{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--txt2);margin-right:2px}
.btn{background:var(--bg);border:1px solid var(--line2);color:var(--txt);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit;font-weight:600}
.btn:hover{border-color:var(--amber)}
select{background:var(--bg);border:1px solid var(--line2);color:var(--txt);padding:6px 9px;border-radius:6px;font-size:12px;font-family:inherit;cursor:pointer}
.btn.g{background:var(--green);border-color:#3fb950;color:#fff;margin-left:auto}
.charts{display:flex;gap:0;align-items:stretch;height:410px;margin-bottom:0}
.charts .card{overflow:hidden;display:flex;flex-direction:column;min-width:170px}
#pieCard{flex:0 0 340px}#barCard{flex:1 1 auto}
.splitter{flex:0 0 12px;cursor:col-resize;position:relative}
.splitter::before{content:"";position:absolute;left:5px;top:50%;transform:translateY(-50%);width:2px;height:46px;background:var(--line2);border-radius:2px}
.splitter:hover::before{background:var(--amber)}
.vhandle{height:14px;cursor:row-resize;position:relative;margin:2px 0 14px}
.vhandle::before{content:"";position:absolute;top:5px;left:50%;transform:translateX(-50%);width:46px;height:2px;background:var(--line2);border-radius:2px}
.vhandle:hover::before{background:var(--amber)}
.charts .card>h2{flex:0 0 auto}
.charts .card>*:last-child{flex:1 1 auto;min-height:0;overflow:hidden}
.scroll{overflow:auto;max-height:calc(100vh - 190px);border:1px solid var(--line);border-radius:8px}
table{border-collapse:separate;border-spacing:0;width:100%;font-size:12px}
th,td{padding:6px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
thead th{position:sticky;top:0;background:var(--panel2);color:var(--head);text-align:center;font-weight:600;z-index:2}
thead th.yr{cursor:pointer;text-align:center;background:#232a33;border-left:1px solid var(--line2)}
thead th.yr:hover{color:var(--amber)}
th.name,td.name{text-align:left;position:sticky;left:0;background:var(--panel);z-index:1}
thead th.name{z-index:3;background:var(--panel2)}
td{text-align:center;font-variant-numeric:tabular-nums}
tbody tr:hover td{background:#12161d}tbody tr:hover td.name{background:#12161d}
.tw{cursor:pointer;user-select:none;color:var(--amber)}
.lvl0{font-weight:700;color:var(--head)}.lvl1{font-weight:600}.lvl2{color:var(--txt)}.lvl3{color:var(--txt2)}
tr.tot td{border-top:2px solid var(--line2);font-weight:700;color:var(--head);background:#12161d}
td.zc{color:var(--red);font-weight:700}
table.cntmode td:not(.name),table.cntmode thead th:not(.name){text-align:center}
.badge{display:inline-block;font-size:9px;padding:1px 5px;border-radius:4px;background:#30250c;color:var(--amber);margin-left:6px;vertical-align:middle}
.pill{display:inline-block;font-size:10px;padding:1px 7px;border-radius:10px;font-variant-numeric:tabular-nums}
.crumb{font-size:11px;color:var(--txt2);margin-bottom:8px;min-height:16px}
.crumb a{color:var(--amber);cursor:pointer;text-decoration:none}.crumb a:hover{text-decoration:underline}
.legend{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:10px;font-size:11px}
.legend span{display:inline-flex;align-items:center;gap:5px;color:var(--txt2)}
.legend i{width:10px;height:10px;border-radius:2px;display:inline-block}
.pieslice{cursor:pointer;transition:opacity .1s}.pieslice:hover{opacity:.82}
.barseg,.bkthit{cursor:pointer}
.pieback{cursor:pointer}.pieback:hover path{opacity:.55}.pieback:hover text{fill:var(--amber)}
#pieWrap svg{transform-origin:center center}
#pieWrap svg.in{animation:pieIn .32s cubic-bezier(.2,.7,.3,1)}
#pieWrap svg.out{animation:pieOut .34s cubic-bezier(.2,.7,.3,1)}
@keyframes pieIn{from{opacity:.12;transform:scale(.76) rotate(-6deg)}to{opacity:1;transform:scale(1) rotate(0)}}
@keyframes pieOut{from{opacity:.12;transform:scale(1.16) rotate(4deg)}to{opacity:1;transform:scale(1) rotate(0)}}
.empty{padding:30px;color:var(--txt2);text-align:center}
.note{font-size:11px;color:var(--txt2);margin-top:8px}
tr.drill{cursor:pointer}tr.drill:hover td{background:#1c2129;color:var(--amber)}
.hint{cursor:help;border-bottom:1px dotted var(--txt2)}
.modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:100;align-items:flex-start;justify-content:center;padding:44px 16px;overflow:auto}
.modal.show{display:flex}
.mbox{background:var(--panel);border:1px solid var(--line2);border-radius:12px;max-width:920px;width:100%;box-shadow:0 24px 70px rgba(0,0,0,.55);animation:mIn .18s ease-out}
@keyframes mIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}
.mhead{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line);color:var(--head);font-weight:700}
#mclose{cursor:pointer;color:var(--txt2);font-size:22px;line-height:1;padding:0 4px}#mclose:hover{color:var(--red)}
#mbody{padding:4px 6px 14px;max-height:72vh;overflow:auto}
</style></head><body>
<header><h1>&#128202; Horizon &mdash; Life-of-Fleet Budget Report</h1><span class="meta" id="meta"></span></header>
<div class="tabs"><div class="tab" id="tab-parameters" data-tab="parameters">Parameters</div><div class="tab" id="tab-risk" data-tab="risk">Risk items</div><div class="tab" id="tab-budget" data-tab="budget">Budget graphs</div><div class="tab" id="tab-data" data-tab="data">Data table</div><div class="tab" id="tab-drill" data-tab="drill">&#128269; Drill-down</div></div>
<div class="wrap">
<div id="panel-parameters" style="display:none"></div>
<div id="panel-risk" style="display:none"></div>
<div id="panel-budget" style="display:none">
  <div class="recon" id="reconStrip"></div>
  <div class="ctl">
    <span class="lbl">Measure</span><div class="seg" id="segMeasure"><button data-v="cost" class="on">Cost ($)</button><button data-v="count">Intervention count</button></div>
    <span class="lbl">Stack by</span><div class="seg" id="segStack"><button data-v="fleet" class="on">Fleet</button><button data-v="model">Model</button></div>
    <span class="lbl">Time</span><div class="seg" id="segGran"><button data-v="month" class="on">Month</button><button data-v="quarter">Quarter</button><button data-v="year">Year</button></div>
  </div>
  <div class="charts" id="chartsRow">
    <div class="card" id="pieCard"><h2>Cost share (click to drill)</h2><div class="crumb" id="pieCrumb"></div><div id="pieWrap"></div></div>
    <div class="splitter" id="chartSplit" title="Drag to resize left/right"></div>
    <div class="card" id="barCard"><h2 id="barTitle">Cost over time</h2><div><div id="barWrap"></div></div></div>
  </div>
  <div class="vhandle" id="chartVHandle" title="Drag to resize height"></div>
  <div id="barDetail"></div>
</div>
<div id="panel-data" style="display:none">
  <div class="ctl">
    <span class="lbl">Measure</span><div class="seg" id="segMeasure2"><button data-v="cost" class="on">Cost ($)</button><button data-v="count">Intervention count</button></div>
    <span class="lbl">Heat-map</span><div class="seg" id="segHeat"><button data-v="off" class="on">Off</button><button data-v="on">On</button></div>
    <span class="lbl">Roll up to</span><select id="lvlSel"><option value="0">Fleet</option><option value="1">Model</option><option value="2">Unit</option><option value="3">Component</option></select>
    <span class="lbl">Columns</span><select id="colGran"><option value="month">Month</option><option value="quarter">Quarter</option><option value="year">Year</option></select>
    <button class="btn g" id="btnXlsx">&#11015; Export view to Excel</button>
  </div>
  <div class="scroll" id="tableWrap" style="max-height:calc(100vh - 168px)"></div>
  <div class="note">Blank = no intervention in that period. <span style="color:var(--red);font-weight:700">Red</span> = a scheduled intervention with $0 cost (fix the cost at source). Click a row name to drill Fleet &rarr; Model &rarr; Unit &rarr; Component; click a year header to fold that year. Totals are in-period; overdue &amp; unscheduled are on the Risk tab.</div>
</div>
<div id="panel-drill" style="display:none">
  <div class="ctl">
    <input id="ddSearch" type="text" placeholder="Search fleet, model or unit..." style="background:#0d1117;border:1px solid #30363d;color:#c9d1d9;border-radius:5px;padding:5px 9px;font-size:12px;min-width:250px"/>
    <button class="btn" id="ddClear">Clear</button>
    <button class="btn" id="ddExpand">Expand all</button>
    <button class="btn" id="ddCollapse">Collapse all</button>
    <span class="lbl">Columns</span><select id="ddGran"><option value="month">Month</option><option value="quarter">Quarter</option><option value="year">Year</option></select>
  </div>
  <div class="scroll" id="ddWrap" style="max-height:calc(100vh - 168px)"></div>
  <div class="note">Type to find a fleet, model or unit &mdash; the tree filters to matches and highlights them. Click a row to drill Fleet &rarr; Model &rarr; Unit &rarr; Component. Costs are BAF-inclusive and in-period; overdue &amp; unscheduled are on the Risk tab.</div>
</div>
</div>
<div id="rmodal" class="modal"><div class="mbox"><div class="mhead"><span id="mtitle"></span><span id="mclose">&times;</span></div><div id="mbody"></div></div></div>
<script>
var P=${json};
var PAL=['#e3a72c','#5FA8E0','#1D9E75','#E24B4A','#9B97E8','#5DCAA5','#378ADD','#d98c34','#8b949e','#BA7517','#c96fd0','#6ee7b7','#f0883e','#79c0ff','#ffab70','#a5d6ff'];
var S={tab:'budget',measure:'cost',heat:false,stackBy:'fleet',barGran:'month',tableGran:'month',level:'0',barSel:null,colYears:{},openRows:{},pie:[],ddSearch:'',ddOpen:{},ddGran:'year'};
var SEP='\\u0001';
function el(id){return document.getElementById(id);}
var BAFTIP='Budget Adjustment Factor: a % uplift on component cost for associated parts/labour not in the base cost. The blended % shown is cost-weighted (dollar-weighted), not a simple average \\u2014 so 5% on a large item outweighs 50% on a small one.';
var RTIP={'Unscheduled (undated)':'Components with no changeout date \\u2014 the cost is on the books but cannot be placed in a period. Add a date at source to schedule it.','Inferred util_rate':'Utilisation rate was not supplied and was inferred from the unit\\u2019s peers (median). Set or measure the real rate for accuracy.','Condition-based (modelled)':'Component is condition-based, not fixed-interval; its replacement cycle is modelled from benchmark \\u00f7 util_rate.','Missing benchmark':'No benchmark life supplied \\u2014 only the next-due replacement is costed, not future cycles. Add the benchmark to project the full horizon.','Cost missing/unparseable':'Cost was blank or could not be read as a number. Treated as $0 \\u2014 fix at source or the budget understates spend.','Cycle-capped (suspect data)':'The projected cycle count hit the safety cap (very short life vs the horizon) \\u2014 usually suspect benchmark/util data. Check the inputs.'};
function card(t,inner){return '<div class="card"><h2>'+t+'</h2>'+inner+'</div>';}
function attr(s){return String(s==null?'':s).replace(/"/g,'&quot;');}
function fmt(n){return (Math.round(n)||0).toLocaleString();}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function measVals(n){return S.measure==='cost'?n.cost:n.cnt;}
function nodeTotal(n){var a=measVals(n),t=0;for(var i=0;i<a.length;i++)t+=a[i];return t;}
function zeros(){return P.bands.map(function(){return 0;});}
function fyOf(f){var y=+f.slice(0,4),m=+f.slice(5,7);return (m>=P.fsm)?y:y-1;}
function fyLabel(fy){return P.fsm===1?String(fy):('FY'+fy);}
function yearGroups(){var gs=[],by={};P.bands.forEach(function(b,i){var fy=fyOf(b.from);if(by[fy]===undefined){by[fy]=gs.length;gs.push({fy:fy,label:fyLabel(fy),idx:[]});}gs[by[fy]].idx.push(i);});return gs;}
function monthsBetween(a,b){return (+b.slice(0,4)-+a.slice(0,4))*12+(+b.slice(5,7)-+a.slice(5,7))+1;}
function bandDur(i){var b=P.bands[i];return monthsBetween(b.from,b.to||b.from);}
function tableCols(){var cols=[];yearGroups().forEach(function(g){
  if(S.colYears[g.fy]){cols.push({label:g.label,short:'\\u03a3',idx:g.idx,fy:g.fy,folded:true,type:'year'});return;}
  var map={},loc=[];g.idx.forEach(function(i){var info=bucketOf(i,S.tableGran);if(map[info.key]===undefined){map[info.key]=loc.length;loc.push({label:info.label,short:info.short,idx:[i],fy:g.fy,type:info.type});}else loc[map[info.key]].idx.push(i);});
  loc.forEach(function(c){cols.push(c);});});return cols;}
function colSum(node,col,which){var a=which==='cnt'?node.cnt:(which==='cost'?node.cost:measVals(node));var t=0;col.idx.forEach(function(i){t+=a[i];});return t;}
// ----- tree -----
var TREE=null;
function agg(n,r){for(var i=0;i<r.cost.length;i++){n.cost[i]+=r.cost[i];n.cnt[i]+=r.cnt[i];}n.od+=r.od;n.un+=r.un;n.calls+=r.calls;n.tot+=r.tot;}
function buildTree(){var root={key:'ALL',label:'TOTAL',level:-1,children:{},order:[],cost:zeros(),cnt:zeros(),od:0,un:0,calls:0,tot:0};
  P.rows.forEach(function(r){agg(root,r);var path=[r.f,r.m,r.u,r.c],node=root,acc='';
    for(var i=0;i<4;i++){acc+=SEP+path[i];if(!node.children[acc]){node.children[acc]={key:acc,label:path[i],level:i,children:{},order:[],cost:zeros(),cnt:zeros(),od:0,un:0,calls:0,tot:0,leaf:(i===3),row:(i===3?r:null)};node.order.push(acc);}node=node.children[acc];agg(node,r);}});
  return root;}
function sortedKids(n){return n.order.map(function(k){return n.children[k];}).sort(function(a,b){return a.label.localeCompare(b.label);});}
function childByLabel(n,l){for(var i=0;i<n.order.length;i++){var c=n.children[n.order[i]];if(c.label===l)return c;}return null;}
var COLOR={},_cidx=0;
function assignColors(){(function w(n){sortedKids(n).forEach(function(k){if(COLOR[k.label]===undefined)COLOR[k.label]=PAL[_cidx++%PAL.length];w(k);});})(TREE);}
function colorOf(l){return COLOR[l]||'#8b949e';}
// ----- heat -----
function heatRange(rowsN,cols){var mn=Infinity,mx=-Infinity;rowsN.forEach(function(n){cols.forEach(function(c){var v=colSum(n,c);if(v>0){if(v<mn)mn=v;if(v>mx)mx=v;}});});return {mn:mn,mx:mx};}
function heatColor(v,rg){if(!(v>0)||rg.mx<=0)return '';var t=rg.mx>rg.mn?(v-rg.mn)/(rg.mx-rg.mn):1;t=Math.max(0,Math.min(1,t));var stops=[[33,80,120],[227,167,44],[248,81,73]];var seg=t<=0.5?0:1,tt=t<=0.5?t/0.5:(t-0.5)/0.5;var a=stops[seg],b=stops[seg+1];var r=Math.round(a[0]+(b[0]-a[0])*tt),g=Math.round(a[1]+(b[1]-a[1])*tt),bl=Math.round(a[2]+(b[2]-a[2])*tt);return 'background:rgba('+r+','+g+','+bl+',.82);color:#0b0e14;font-weight:700';}
// ----- render dispatch -----
function render(){el('meta').textContent=P.range+'  \\u00b7  generated '+P.gen+'  \\u00b7  '+P.rows.length+' components';
  ['parameters','risk','budget','data','drill'].forEach(function(t){el('tab-'+t).className='tab'+(S.tab===t?' on':'');el('panel-'+t).style.display=(S.tab===t?'block':'none');});
  if(S.tab==='parameters')renderParams();else if(S.tab==='risk')renderRisk();else if(S.tab==='data')renderData();else if(S.tab==='drill')renderDrill();else renderBudget();}
function renderData(){setSeg('segMeasure2',S.measure);setSeg('segHeat',S.heat?'on':'off');el('lvlSel').value=S.level;el('colGran').value=S.tableGran;renderTable();}
function expandToLevel(L){S.openRows={};(function w(n){sortedKids(n).forEach(function(k){if(!k.leaf&&k.level<L){S.openRows[k.key]=1;w(k);}});})(TREE);}
// ----- parameters tab -----
function renderParams(){var R=P.recon;var h='<div class="recon">'+kpi('Grand total',fmt(R.grand),'amber')+kpi('In-period',fmt(R.inperiod))+kpi('Overdue / backlog',fmt(R.overdue))+kpi('Unscheduled',fmt(R.unscheduled))+kpi('Base (pre-BAF)',fmt(R.base))+kpi('Blended BAF',R.blended+'%','amber')+'</div>';
  h+='<div class="card"><h2>Run parameters</h2><table><tbody>';
  P.params.forEach(function(p){h+='<tr><td class="name" style="color:var(--txt2)">'+esc(p[0])+'</td><td style="text-align:left">'+esc(p[1])+'</td></tr>';});
  h+='</tbody></table></div>';el('panel-parameters').innerHTML=h;}
function kpi(k,v,c){var b=/BAF/i.test(k);return '<div class="kpi'+(c?' '+c:'')+'"'+(b?' style="cursor:help" title="'+attr(BAFTIP)+'"':'')+'><div class="k">'+esc(k)+(b?' \\u24d8':'')+'</div><div class="v">'+v+'</div></div>';}
// ----- risk tab -----
function renderRisk(){var h='';
  var sum='<table><thead><tr><th class="name">Risk class</th><th>Count</th><th>$ exposure</th></tr></thead><tbody>';
  P.risk.summary.forEach(function(r){var tip=RTIP[r[0]]||'';sum+='<tr><td class="name">'+(tip?'<span class="hint" title="'+attr(tip)+'">'+esc(r[0])+'</span>':esc(r[0]))+'</td><td>'+r[1]+'</td><td>'+fmt(r[2])+'</td></tr>';});
  sum+='</tbody></table>';
  h+=card('Risk summary',sum);
  h+=riskPanel('zero','Zero-cost interventions',P.risk.zero,0,null);
  h+=riskPanel('overdue','Overdue / backlog',P.risk.overdue,0,4);
  h+=riskPanel('dq','Data-quality detail',P.risk.detail,2,null);
  el('panel-risk').innerHTML=h;}
function riskPanel(key,title,rows,fi,ci){
  if(!rows.length)return card(title+' <span class="badge">0</span>','<div class="empty">None.</div>');
  var by={},order=[];rows.forEach(function(r){var f=r[fi]||'(none)';if(!by[f]){by[f]={n:0,c:0};order.push(f);}by[f].n++;if(ci!=null)by[f].c+=(+r[ci]||0);});
  order.sort();
  var b='<table><thead><tr><th class="name">Fleet</th><th>Items</th>'+(ci!=null?'<th>$ exposure</th>':'')+'<th></th></tr></thead><tbody>';
  order.forEach(function(f){b+='<tr class="drill" data-panel="'+attr(key)+'" data-fleet="'+attr(f)+'"><td class="name">'+esc(f)+'</td><td>'+by[f].n+'</td>'+(ci!=null?'<td>'+fmt(by[f].c)+'</td>':'')+'<td style="color:var(--amber)">drill \\u203a</td></tr>';});
  var tn=rows.length,tc=0;if(ci!=null)rows.forEach(function(r){tc+=(+r[ci]||0);});
  b+='<tr class="tot"><td class="name">All fleets</td><td>'+tn+'</td>'+(ci!=null?'<td>'+fmt(tc)+'</td>':'')+'<td></td></tr>';
  b+='</tbody></table>';
  return card(title+' <span class="badge">'+rows.length+'</span>',b+'<div class="note">Click a fleet to drill into the detail.</div>');}
function openRiskModal(panel,fleet){var rows,hdr,align;
  if(panel==='zero'){rows=P.risk.zero.filter(function(r){return (r[0]||'(none)')===fleet;}).map(function(r){return [r[2],r[3],r[4],r[5],r[6],r[7]];});hdr=['Unit','Component','Tier','Next due','Calls','Reason'];align=[0,0,0,0,1,0];}
  else if(panel==='overdue'){rows=P.risk.overdue.filter(function(r){return (r[0]||'(none)')===fleet;}).map(function(r){return [r[2],r[3],fmt(r[4]),r[5],r[6]];});hdr=['Unit','Component','Cost','Original date','Effective date'];align=[0,0,1,0,0];}
  else{rows=P.risk.detail.filter(function(r){return (r[2]||'(none)')===fleet;}).map(function(r){return [r[0],r[1],r[4],r[5],r[6]];});hdr=['Unit','Component','Issues','Field to fix','Current value'];align=[0,0,0,0,0];}
  el('mtitle').textContent=fleet+' \\u2014 '+rows.length+' item(s)';
  el('mbody').innerHTML=tbl(hdr,rows,align);
  el('rmodal').classList.add('show');}
function tbl(hdr,rows,align,redZero){var h='<table><thead><tr>';hdr.forEach(function(c,i){h+='<th class="'+(align&&align[i]?'':'name')+'">'+c+'</th>';});h+='</tr></thead><tbody>';
  rows.forEach(function(r){h+='<tr>';r.forEach(function(c,i){var right=align&&align[i];h+='<td class="'+(right?'':'name')+'">'+esc(c)+'</td>';});h+='</tr>';});
  h+='</tbody></table>';return h;}
// ----- budget tab -----
function renderBudget(){
  var R=P.recon;el('reconStrip').innerHTML=kpi('Grand total',fmt(R.grand),'amber')+kpi('In-period',fmt(R.inperiod))+kpi('Overdue',fmt(R.overdue))+kpi('Unscheduled',fmt(R.unscheduled))+kpi('Blended BAF',R.blended+'%','amber');
  setSeg('segMeasure',S.measure);setSeg('segStack',S.stackBy);setSeg('segGran',S.barGran);
  el('barTitle').textContent=(S.measure==='cost'?'Cost':'Interventions')+' over time \\u2014 stacked by '+S.stackBy;
  drawPie(null);drawBar();renderBarDetail();}
function setSeg(id,v){var segs=el(id).querySelectorAll('button');segs.forEach(function(b){b.className=(b.getAttribute('data-v')===v?'on':'');});}
function flatRows(){var out=[];(function walk(n){sortedKids(n).forEach(function(k){out.push(k);if(!k.leaf&&S.openRows[k.key])walk(k);});})(TREE);return out;}
function renderTable(){var cols=tableCols(),rowsN=flatRows(),groups=yearGroups();
  var rg=null,heatLevel=-1,heatType=null,totRg=null;
  if(S.heat){var ord={month:0,quarter:1,year:2};
    heatLevel=rowsN.reduce(function(m,n){return Math.max(m,n.level);},-1);
    heatType=cols.reduce(function(best,c){var t=c.type||'year';return (best===null||ord[t]<ord[best])?t:best;},null);
    var lowRows=rowsN.filter(function(n){return n.level===heatLevel;});
    rg=heatRange(lowRows,cols.filter(function(c){return (c.type||'year')===heatType;}));
    var totals=lowRows.map(function(n){var t=0;cols.forEach(function(c){t+=colSum(n,c);});return t;}).filter(function(v){return v>0;});
    if(totals.length){var tmn=Math.min.apply(null,totals),tmx=Math.max.apply(null,totals);totRg={mn:tmn+0.25*(tmx-tmn),mx:tmx};}}
  var cntByFy={};cols.forEach(function(c){cntByFy[c.fy]=(cntByFy[c.fy]||0)+1;});
  var h='<table class="'+(S.measure==='count'?'cntmode':'')+'"><thead><tr><th class="name" rowspan="2">Equipment</th>';
  groups.forEach(function(g){var open=!S.colYears[g.fy];h+='<th class="yr" colspan="'+(cntByFy[g.fy]||1)+'" data-fy="'+g.fy+'">'+(open?'\\u25be ':'\\u25b8 ')+g.label+'</th>';});
  h+='<th rowspan="2">Total</th></tr><tr>';
  cols.forEach(function(c){h+='<th>'+esc(c.short||c.label)+'</th>';});
  h+='</tr></thead><tbody>';
  rowsN.forEach(function(n){h+=rowHtml(n,cols,rg,heatLevel,heatType,totRg);});
  // grand total
  h+='<tr class="tot"><td class="name">TOTAL</td>';var gtot=0;
  cols.forEach(function(c){var v=colSum(TREE,c);gtot+=v;h+='<td>'+(v?fmt(v):'')+'</td>';});
  h+='<td>'+fmt(gtot)+'</td></tr>';
  h+='</tbody></table>';
  var w=el('tableWrap');w.innerHTML=rowsN.length?h:'<div class="empty">No components.</div>';}
function rowHtml(n,cols,rg,heatLevel,heatType,totRg){var pad=8+n.level*16;var tw=(!n.leaf)?('<span class="tw">'+(S.openRows[n.key]?'\\u25be':'\\u25b8')+'</span> '):'';
  var nm='<td class="name lvl'+n.level+'" style="padding-left:'+pad+'px" data-row="'+esc(n.key)+'">'+tw+esc(n.label)+'</td>';
  var cells='',rowTot=0,canHeat=(rg&&n.level===heatLevel);
  cols.forEach(function(c){var cost=colSum(n,c,'cost'),cnt=colSum(n,c,'cnt'),v=S.measure==='cost'?cost:cnt;rowTot+=v;
    var zc=(cnt>0&&cost===0);var txt='',st='';
    if(v===0&&!zc){txt='';}
    else if(zc){txt='0';st=' class="zc"';}
    else{txt=fmt(v);if(canHeat&&(c.type||'year')===heatType){var hc=heatColor(v,rg);if(hc)st=' style="'+hc+'"';}}
    cells+='<td'+st+'>'+txt+'</td>';});
  var totSt='';if(canHeat&&totRg&&rowTot>totRg.mn){var thc=heatColor(rowTot,totRg);if(thc)totSt=' style="'+thc+'"';}
  return '<tr>'+nm+cells+'<td'+totSt+'>'+(rowTot?fmt(rowTot):'')+'</td></tr>';}
// ----- drill-down (search + tree) — v18.11 FEAT-1, additive; reuses TREE/bucketOf/colSum/yearGroups -----
function ddCols(){var cols=[];yearGroups().forEach(function(g){var map={},loc=[];g.idx.forEach(function(i){var info=bucketOf(i,S.ddGran);if(map[info.key]===undefined){map[info.key]=loc.length;loc.push({label:info.label,short:info.short,idx:[i]});}else loc[map[info.key]].idx.push(i);});loc.forEach(function(c){cols.push(c);});});return cols;}
function ddMatchNode(n){return n.level>=0&&n.level<=2&&!!S.ddSearch&&n.label.toLowerCase().indexOf(S.ddSearch)>=0;}
function ddVisible(){var show={},open={},match={};
  (function walk(n,anc){if(ddMatchNode(n)){match[n.key]=1;anc.forEach(function(a){show[a.key]=1;open[a.key]=1;});(function desc(x){show[x.key]=1;sortedKids(x).forEach(desc);})(n);}sortedKids(n).forEach(function(k){walk(k,anc.concat(n));});})(TREE,[]);
  return {show:show,open:open,match:match};}
function ddFlatRows(vis){var out=[];(function walk(n){sortedKids(n).forEach(function(k){if(vis){if(!vis.show[k.key])return;out.push(k);if(!k.leaf&&(vis.open[k.key]||S.ddOpen[k.key]))walk(k);}else{out.push(k);if(!k.leaf&&S.ddOpen[k.key])walk(k);}});})(TREE);return out;}
function ddRowHtml(n,cols,vis){var pad=8+n.level*16;var isOpen=(vis&&vis.open[n.key])||S.ddOpen[n.key];var tw=(!n.leaf)?('<span class="tw">'+(isOpen?'\\u25be':'\\u25b8')+'</span> '):'';
  var hit=vis&&vis.match[n.key];var lbl=hit?('<mark style="background:#e3a72c;color:#0b0e14;border-radius:2px;padding:0 2px">'+esc(n.label)+'</mark>'):esc(n.label);
  var nm='<td class="name lvl'+n.level+'" style="padding-left:'+pad+'px" data-ddrow="'+esc(n.key)+'">'+tw+lbl+'</td>';
  var cells='',rowTot=0;cols.forEach(function(c){var v=colSum(n,c,'cost');rowTot+=v;cells+='<td>'+(v?fmt(v):'')+'</td>';});
  return '<tr>'+nm+cells+'<td>'+(rowTot?fmt(rowTot):'')+'</td></tr>';}
function renderDrill(){el('ddSearch').value=S.ddSearch;el('ddGran').value=S.ddGran;
  var vis=S.ddSearch?ddVisible():null;var cols=ddCols(),rowsN=ddFlatRows(vis);
  var h='<table><thead><tr><th class="name">Equipment</th>';cols.forEach(function(c){h+='<th>'+esc(c.short||c.label)+'</th>';});h+='<th>Total</th></tr></thead><tbody>';
  rowsN.forEach(function(n){h+=ddRowHtml(n,cols,vis);});
  h+='<tr class="tot"><td class="name">TOTAL</td>';var gt=0;cols.forEach(function(c){var v=colSum(TREE,c,'cost');gt+=v;h+='<td>'+(v?fmt(v):'')+'</td>';});h+='<td>'+fmt(gt)+'</td></tr>';
  h+='</tbody></table>';
  var empty=S.ddSearch?'<div class="empty">No fleet, model or unit matches \\u201c'+esc(S.ddSearch)+'\\u201d.</div>':'<div class="empty">No components.</div>';
  el('ddWrap').innerHTML=rowsN.length?h:empty;}
// ----- pie -----
function pieNode(){var node=TREE;for(var i=0;i<S.pie.length;i++){var c=childByLabel(node,S.pie[i]);if(!c)break;node=c;}return node;}
function drawPie(dir){var parent=pieNode();var kids=sortedKids(parent).map(function(k){return {label:k.label,val:nodeTotal(k),leaf:k.leaf};}).filter(function(d){return d.val>0;});
  kids.sort(function(a,b){return b.val-a.val;});
  var crumb='<a data-i="-1">All</a>';S.pie.forEach(function(l,i){crumb+=' \\u203a <a data-i="'+i+'">'+esc(l)+'</a>';});el('pieCrumb').innerHTML=crumb;
  var tot=kids.reduce(function(s,d){return s+d.val;},0);
  if(!tot){el('pieWrap').innerHTML='<div class="empty">Nothing to show.</div>';return;}
  var _ph=el('pieWrap'),_pw=(_ph&&_ph.clientWidth)||300,_phh=(_ph&&_ph.clientHeight)||300,_ps=Math.max(140,Math.min(_pw-6,_phh-88));
  var cx=110,cy=110,r=100,a=-Math.PI/2,svg='<svg width="'+_ps+'" height="'+_ps+'" viewBox="0 0 230 230" id="pieSvg" class="'+(dir||'')+'" style="display:block;margin:2px auto">';
  var leg='<div class="legend">';
  kids.forEach(function(d,i){var frac=d.val/tot,a2=a+frac*2*Math.PI,col=colorOf(d.label);var sh;
    if(frac>=0.9999){sh='<circle class="pieslice" cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+col+'" stroke="#0d1117" stroke-width="1.5" data-label="'+esc(d.label)+'" data-leaf="'+(d.leaf?1:0)+'"><title>'+esc(d.label)+': '+fmt(d.val)+' (100%)</title></circle>';}
    else{var x0=cx+r*Math.cos(a),y0=cy+r*Math.sin(a),x1=cx+r*Math.cos(a2),y1=cy+r*Math.sin(a2),lg=(a2-a)>Math.PI?1:0;var pth='M'+cx+' '+cy+' L'+x0.toFixed(1)+' '+y0.toFixed(1)+' A'+r+' '+r+' 0 '+lg+' 1 '+x1.toFixed(1)+' '+y1.toFixed(1)+' Z';sh='<path class="pieslice" d="'+pth+'" fill="'+col+'" stroke="#0d1117" stroke-width="1.5" data-label="'+esc(d.label)+'" data-leaf="'+(d.leaf?1:0)+'"><title>'+esc(d.label)+': '+fmt(d.val)+' ('+Math.round(frac*100)+'%)</title></path>';}
    svg+=sh;if(frac>=0.05){var _mid=(a+a2)/2;svg+='<text x="'+(cx+72*Math.cos(_mid)).toFixed(1)+'" y="'+(cy+72*Math.sin(_mid)+3).toFixed(1)+'" fill="#0b0e14" font-size="9" font-weight="700" text-anchor="middle" style="pointer-events:none">'+Math.round(frac*100)+'%</text>';}
    leg+='<span><i style="background:'+col+'"></i>'+esc(d.label)+' \\u00b7 '+fmt(d.val)+' ('+Math.round(frac*100)+'%)</span>';a=a2;});
  if(S.pie.length){var pnode=TREE;for(var pi=0;pi<S.pie.length-1;pi++){pnode=childByLabel(pnode,S.pie[pi]);}
    var pk=sortedKids(pnode).map(function(k){return {label:k.label,val:nodeTotal(k)};}).filter(function(d){return d.val>0;}).sort(function(x,y){return y.val-x.val;});
    var pt=pk.reduce(function(s,d){return s+d.val;},0)||1,ga=-Math.PI/2,gr=40;
    svg+='<g class="pieback" data-back="1"><circle cx="'+cx+'" cy="'+cy+'" r="52" fill="#0d1117"/>';
    pk.forEach(function(d,i){var fr=d.val/pt,a2=ga+fr*2*Math.PI,col=colorOf(d.label);if(fr>=0.9999){svg+='<circle cx="'+cx+'" cy="'+cy+'" r="'+gr+'" fill="'+col+'" opacity="0.26"/>';}else{var x0=cx+gr*Math.cos(ga),y0=cy+gr*Math.sin(ga),x1=cx+gr*Math.cos(a2),y1=cy+gr*Math.sin(a2),lg=(a2-ga)>Math.PI?1:0;svg+='<path d="M'+cx+' '+cy+' L'+x0.toFixed(1)+' '+y0.toFixed(1)+' A'+gr+' '+gr+' 0 '+lg+' 1 '+x1.toFixed(1)+' '+y1.toFixed(1)+' Z" fill="'+col+'" opacity="0.26"/>';}ga=a2;});
    svg+='<circle cx="'+cx+'" cy="'+cy+'" r="21" fill="#0d1117"/>';
    svg+='<text x="'+cx+'" y="'+(cy-2)+'" text-anchor="middle" fill="#6b7280" font-size="8">\\u2039 back</text>';
    svg+='<text x="'+cx+'" y="'+(cy+10)+'" text-anchor="middle" fill="#e6edf3" font-size="11" font-weight="700">'+fmt(tot)+'</text>';
    svg+='<title>Back to '+(S.pie.length>1?esc(S.pie[S.pie.length-2]):'All')+'</title></g>';
  }else{
    svg+='<circle cx="'+cx+'" cy="'+cy+'" r="52" fill="#0d1117"/><text x="'+cx+'" y="'+(cy-3)+'" text-anchor="middle" fill="#8b949e" font-size="10">ALL</text><text x="'+cx+'" y="'+(cy+12)+'" text-anchor="middle" fill="#e6edf3" font-size="13" font-weight="700">'+fmt(tot)+'</text>';
  }
  svg+='</svg>';
  el('pieWrap').innerHTML=svg+leg+'</div>';}
// ----- stacked bar -----
function barSeries(){if(S.stackBy==='fleet')return sortedKids(TREE).map(function(f){return {label:f.label,node:f};});
  // stack by MODEL: label by model name only (models roll up across fleets by name)
  var mm={},order=[];sortedKids(TREE).forEach(function(f){sortedKids(f).forEach(function(m){if(!mm[m.label]){mm[m.label]={label:m.label,cost:zeros(),cnt:zeros()};order.push(m.label);}for(var i=0;i<m.cost.length;i++){mm[m.label].cost[i]+=m.cost[i];mm[m.label].cnt[i]+=m.cnt[i];}});});
  return order.sort().map(function(l){return {label:l,node:mm[l]};});}
function mLabel(m){var MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return MN[+m.slice(5,7)-1]+' '+m.slice(2,4);}
var LORD={month:0,quarter:1,year:2};
function bandType(i){var d=bandDur(i);return d<=1?'month':(d<=3?'quarter':'year');}
function effType(i,gran){var t=bandType(i);return LORD[t]>=LORD[gran]?t:gran;}
function bucketOf(i,gran){var et=effType(i,gran),from=P.bands[i].from,mo=+from.slice(5,7),MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if(et==='month')return {key:'m'+from.slice(0,7),label:mLabel(from.slice(0,7)),short:MN[mo-1],type:'month'};
  if(et==='quarter'){var off=((mo-P.fsm)%12+12)%12,fq=Math.floor(off/3)+1,fy=fyOf(from);return {key:'q'+fy+'.'+fq,label:fyLabel(fy)+' Q'+fq,short:'Q'+fq,type:'quarter'};}
  var y=fyOf(from);return {key:'y'+y,label:fyLabel(y),short:fyLabel(y),type:'year'};}
function barBuckets(){var s0=barSeries(),buckets=[],bk={};
  P.bands.forEach(function(b,i){var info=bucketOf(i,S.barGran);if(bk[info.key]===undefined){bk[info.key]=buckets.length;buckets.push({label:info.label,type:info.type,idx:[]});}buckets[bk[info.key]].idx.push(i);});
  var series=s0.map(function(se){return {label:se.label,vals:buckets.map(function(bu){var s=0;bu.idx.forEach(function(i){s+=(S.measure==='cost'?se.node.cost[i]:se.node.cnt[i]);});return s;})};});
  return {buckets:buckets,series:series};}
function groupBy(buckets,xs,keyfn){var groups=[],map={};buckets.forEach(function(bu,i){var k=keyfn(bu);if(k==null)return;if(map[k]===undefined){map[k]=groups.length;groups.push({key:k,minX:xs[i].x,maxX:xs[i].x+xs[i].w,sample:bu});}else{var g=groups[map[k]];g.minX=Math.min(g.minX,xs[i].x);g.maxX=Math.max(g.maxX,xs[i].x+xs[i].w);}});return groups;}
function drawBar(){var bb=barBuckets(),buckets=bb.buckets,series=bb.series,n=buckets.length;
  var maxT=0;buckets.forEach(function(bu,ci){var s=0;series.forEach(function(se){s+=se.vals[ci];});if(s>maxT)maxT=s;});
  if(maxT<=0||!n){el('barWrap').innerHTML='<div class="empty">Nothing to show.</div>';return;}
  var WU={month:1,quarter:2,year:3},uw=16,gap=5,padL=46,padT=10;
  var showMonth=(S.barGran==='month'),showQtr=(S.barGran!=='year');
  var padB=showMonth?58:(showQtr?42:26);
  var _bh=el('barWrap')?el('barWrap').parentNode:null,availW=(_bh&&_bh.clientWidth)||620,availH=(_bh&&_bh.clientHeight)||300;
  var h=Math.max(170,availH-52),plotH=h-padB-padT;
  var totalU=0;buckets.forEach(function(bu){totalU+=WU[bu.type];});
  var n=buckets.length,avail=availW-6-padL-14,per=avail/(n||1);
  gap=per<6?1:(per<12?2:5);
  uw=Math.max(0.5,(avail-n*gap)/(totalU||1));
  var xs=[],x=padL;buckets.forEach(function(bu,i){var w=WU[bu.type]*uw;var from=P.bands[bu.idx[0]].from,mo=+from.slice(5,7),off=((mo-P.fsm)%12+12)%12;bu._fy=fyOf(from);bu._fq=Math.floor(off/3)+1;xs.push({x:x,w:w});x+=w+gap;});
  var cw=availW-6,yBase=padT+plotH;
  var svg='<svg width="'+cw+'" height="'+h+'" viewBox="0 0 '+cw+' '+h+'" style="display:block">';
  for(var gl=0;gl<=4;gl++){var yy=padT+plotH*gl/4;svg+='<line x1="'+padL+'" y1="'+yy.toFixed(1)+'" x2="'+cw+'" y2="'+yy.toFixed(1)+'" stroke="#21262d"/><text x="4" y="'+(yy+3).toFixed(1)+'" fill="#8b949e" font-size="8">'+fmt(maxT*(1-gl/4))+'</text>';}
  buckets.forEach(function(bu,ci){var X=xs[ci].x,W=xs[ci].w;svg+='<rect class="bkthit" x="'+(X-gap/2).toFixed(1)+'" y="'+yBase+'" width="'+(W+gap).toFixed(1)+'" height="'+(h-yBase)+'" fill="transparent" data-bkt="'+ci+'"/>';});
  var focus=(S.stackBy==='fleet')?(S.pie[0]||null):(S.pie.length>=2?S.pie[1]:null);
  buckets.forEach(function(bu,ci){var X=xs[ci].x,W=xs[ci].w,y=yBase,dim=(S.barSel&&S.barSel.bucket!==ci)?0.4:1;
    series.forEach(function(se,si){var v=se.vals[ci];if(v<=0)return;var hh=v/maxT*plotH;y-=hh;var so=(S.barSel&&S.barSel.bucket===ci&&S.barSel.series&&S.barSel.series!==se.label)?0.4:dim;var col=colorOf(se.label);var outl=(focus&&se.label!==focus);
      svg+='<rect class="barseg" x="'+X+'" y="'+y.toFixed(1)+'" width="'+W+'" height="'+hh.toFixed(1)+'" '+(outl?'fill="none" stroke="'+col+'" stroke-width="1" stroke-dasharray="2 2"':'fill="'+col+'"')+' opacity="'+so+'" data-bkt="'+ci+'" data-series="'+attr(se.label)+'"><title>'+esc(se.label)+' \\u2014 '+esc(bu.label)+': '+fmt(v)+'</title></rect>';});
    var bt=0;series.forEach(function(se){bt+=se.vals[ci];});
    if(bt>0){var lab=(S.measure==='cost')?(bt/1e6).toFixed(1):fmt(bt);svg+='<text x="'+(X+W/2)+'" y="'+(y-3).toFixed(1)+'" fill="#c9d1d9" font-size="8.5" text-anchor="middle" style="pointer-events:none">'+lab+'</text>';}});
  if(showMonth){buckets.forEach(function(bu,ci){if(bu.type!=='month')return;var X=xs[ci].x+xs[ci].w/2;svg+='<text x="'+X+'" y="'+(yBase+10)+'" fill="#8b949e" font-size="7.5" text-anchor="end" transform="rotate(-45 '+X+' '+(yBase+10)+')">'+esc(bu.label.split(' ')[0])+'</text>';});}
  if(showQtr){var qg=groupBy(buckets,xs,function(bu){return bu.type==='year'?null:('q'+bu._fy+'.'+bu._fq);});
    qg.forEach(function(g,gi){if(gi>0&&showMonth)svg+='<line x1="'+(g.minX-gap/2).toFixed(1)+'" y1="'+padT+'" x2="'+(g.minX-gap/2).toFixed(1)+'" y2="'+yBase+'" stroke="#30363d" stroke-dasharray="2 3"/>';
      svg+='<text x="'+((g.minX+g.maxX)/2).toFixed(1)+'" y="'+(yBase+(showMonth?28:13))+'" fill="#a9b1bb" font-size="8.5" text-anchor="middle">Q'+g.sample._fq+'</text>';});}
  var yg=groupBy(buckets,xs,function(bu){return 'y'+bu._fy;});
  yg.forEach(function(g,gi){if(gi>0)svg+='<line x1="'+(g.minX-gap/2).toFixed(1)+'" y1="'+padT+'" x2="'+(g.minX-gap/2).toFixed(1)+'" y2="'+(yBase+(showMonth?42:showQtr?26:11)).toFixed(1)+'" stroke="#565e68"/>';
    svg+='<text x="'+((g.minX+g.maxX)/2).toFixed(1)+'" y="'+(yBase+(showMonth?45:showQtr?29:14))+'" fill="#e6edf3" font-size="9.5" font-weight="700" text-anchor="middle">'+esc(fyLabel(g.sample._fy))+'</text>';});
  svg+='</svg>';
  var leg='<div class="legend">';series.forEach(function(se,si){if(se.vals.some(function(v){return v>0;}))leg+='<span><i style="background:'+colorOf(se.label)+'"></i>'+esc(se.label)+'</span>';});leg+='</div>';
  el('barWrap').innerHTML=svg+leg+'<div class="note">Click a bar for its detail below; click empty space to clear. Width = period length (month 1 &middot; qtr 2 &middot; year 3).'+(S.measure==='cost'?' Bar-top totals in $m.':'')+'</div>';}
function barDetailRows(){if(!S.barSel)return null;var bb=barBuckets(),bu=bb.buckets[S.barSel.bucket];if(!bu)return null;var idx=bu.idx,sel=S.barSel.series,rows=[];
  (function walk(nd){if(nd.leaf){if(sel){if(S.stackBy==='fleet'&&nd.row.f!==sel)return;if(S.stackBy==='model'&&nd.row.m!==sel)return;}var cost=0,cnt=0;idx.forEach(function(i){cost+=nd.cost[i];cnt+=nd.cnt[i];});if(cost>0||cnt>0)rows.push({f:nd.row.f,m:nd.row.m,u:nd.row.u,c:nd.row.c,cost:cost,cnt:cnt});}else sortedKids(nd).forEach(walk);})(TREE);
  rows.sort(function(a,b){return b.cost-a.cost;});return {label:bu.label,series:sel,rows:rows};}
function renderBarDetail(){var d=el('barDetail');if(!S.barSel){d.innerHTML='';return;}var dd=barDetailRows();if(!dd||!dd.rows.length){d.innerHTML='';return;}
  var isC=S.measure==='cost',tot=0;
  var h='<div class="card"><h2>'+esc(dd.label)+(dd.series?' \\u2014 '+esc(dd.series):'')+' \\u2014 '+dd.rows.length+' component(s) <span id="barDetClose" style="float:right;cursor:pointer;color:var(--txt2);font-weight:400">&times; clear</span></h2>';
  h+='<div class="scroll" style="max-height:320px"><table class="'+(isC?'':'cntmode')+'"><thead><tr><th class="name">Fleet</th><th class="name">Model</th><th class="name">Unit</th><th class="name">Component</th><th>'+(isC?'Cost':'Interventions')+'</th></tr></thead><tbody>';
  dd.rows.forEach(function(r){var v=isC?r.cost:r.cnt;tot+=v;h+='<tr><td class="name">'+esc(r.f)+'</td><td class="name">'+esc(r.m)+'</td><td class="name">'+esc(r.u)+'</td><td class="name">'+esc(r.c)+'</td><td>'+fmt(v)+'</td></tr>';});
  h+='<tr class="tot"><td class="name" colspan="4">TOTAL</td><td>'+fmt(tot)+'</td></tr></tbody></table></div></div>';
  d.innerHTML=h;}
// ----- excel export of current view -----
function toXlsx(){if(!window.XLSX){alert('Excel library still loading - try again in a moment.');return;}
  var cols=tableCols(),rowsN=flatRows();
  var hdr=['Fleet','Model','Unit','Component'].concat(cols.map(function(c){return c.label;})).concat(['Total']);
  var aoa=[hdr];
  rowsN.forEach(function(n){var path=n.key.split(SEP).slice(1);var pref=['','','',''];for(var i=0;i<path.length;i++)pref[i]=path[i];
    var row=pref.slice();var t=0;cols.forEach(function(c){var v=colSum(n,c);t+=v;row.push(v);});row.push(t);aoa.push(row);});
  var tr=['TOTAL','','',''],gt=0;cols.forEach(function(c){var v=colSum(TREE,c);gt+=v;tr.push(v);});tr.push(gt);aoa.push(tr);
  var ws=XLSX.utils.aoa_to_sheet(aoa),rng=XLSX.utils.decode_range(ws['!ref']);
  for(var c=4;c<=rng.e.c;c++)for(var r=1;r<=rng.e.r;r++){var cell=ws[XLSX.utils.encode_cell({r:r,c:c})];if(cell&&cell.t==='n')cell.z='#,##0';}
  ws['!autofilter']={ref:ws['!ref']};var wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,S.measure==='cost'?'Cost':'Count');
  XLSX.writeFile(wb,'Horizon Budget View '+P.gen+'.xlsx');}
// ----- wire -----
(function init(){TREE=buildTree();assignColors();
  el('tab-parameters').parentNode.addEventListener('click',function(e){var t=e.target.closest('.tab');if(!t)return;S.tab=t.getAttribute('data-tab');render();});
  el('segMeasure').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;S.measure=b.getAttribute('data-v');S.pie=[];S.barSel=null;render();});
  el('segMeasure2').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;S.measure=b.getAttribute('data-v');S.pie=[];S.barSel=null;render();});
  el('segHeat').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;S.heat=(b.getAttribute('data-v')==='on');render();});
  el('segStack').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;S.stackBy=b.getAttribute('data-v');S.barSel=null;render();});
  el('segGran').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;S.barGran=b.getAttribute('data-v');S.barSel=null;render();});
  el('lvlSel').addEventListener('change',function(e){S.level=e.target.value;expandToLevel(+S.level);render();});
  el('colGran').addEventListener('change',function(e){S.tableGran=e.target.value;render();});
  el('btnXlsx').addEventListener('click',toXlsx);
  el('barWrap').addEventListener('click',function(e){
    var seg=e.target.closest('.barseg');
    if(seg){var bkt=+seg.getAttribute('data-bkt'),ser=seg.getAttribute('data-series');
      S.barSel=(S.barSel&&S.barSel.bucket===bkt&&S.barSel.series===ser)?null:{bucket:bkt,series:ser};
      drawBar();renderBarDetail();return;}
    var hit=e.target.closest('.bkthit');
    if(hit){var b=+hit.getAttribute('data-bkt');S.barSel=(S.barSel&&S.barSel.bucket===b&&!S.barSel.series)?null:{bucket:b,series:null};drawBar();renderBarDetail();return;}
    if(S.barSel){S.barSel=null;drawBar();renderBarDetail();}});
  el('barDetail').addEventListener('click',function(e){if(e.target.closest('#barDetClose')){S.barSel=null;drawBar();renderBarDetail();}});
  el('panel-risk').addEventListener('click',function(e){var tr=e.target.closest('tr.drill');if(!tr)return;openRiskModal(tr.getAttribute('data-panel'),tr.getAttribute('data-fleet'));});
  el('mclose').addEventListener('click',function(){el('rmodal').classList.remove('show');});
  el('rmodal').addEventListener('click',function(e){if(e.target===el('rmodal'))el('rmodal').classList.remove('show');});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')el('rmodal').classList.remove('show');});
  el('tableWrap').addEventListener('click',function(e){var yr=e.target.closest('th.yr');if(yr){var fy=yr.getAttribute('data-fy');S.colYears[fy]=!S.colYears[fy];render();return;}var nm=e.target.closest('td.name[data-row]');if(nm){var k=nm.getAttribute('data-row');S.openRows[k]=!S.openRows[k];render();}});
  el('pieWrap').addEventListener('click',function(e){var bk=e.target.closest('.pieback');if(bk){if(S.pie.length){S.pie.pop();drawPie('out');drawBar();}return;}var sl=e.target.closest('.pieslice');if(!sl)return;if(sl.getAttribute('data-leaf')==='1')return;if(S.pie.length>=3)return;S.pie.push(sl.getAttribute('data-label'));drawPie('in');drawBar();});
  el('pieCrumb').addEventListener('click',function(e){var a=e.target.closest('a');if(!a)return;var i=+a.getAttribute('data-i');S.pie=S.pie.slice(0,i+1);drawPie('out');drawBar();});
  var _rap=null;function scheduleRedraw(){if(_rap)return;_rap=requestAnimationFrame(function(){_rap=null;if(S.tab==='budget'){drawPie(null);drawBar();}});}
  (function(){var row=el('chartsRow'),pieC=el('pieCard'),split=el('chartSplit'),vh=el('chartVHandle');var cdrag=false,vdrag=false;
    split.addEventListener('mousedown',function(e){cdrag=true;e.preventDefault();document.body.style.userSelect='none';});
    vh.addEventListener('mousedown',function(e){vdrag=true;e.preventDefault();document.body.style.userSelect='none';});
    document.addEventListener('mousemove',function(e){if(cdrag){var r=row.getBoundingClientRect();var wpx=Math.max(190,Math.min(r.width-230,e.clientX-r.left));pieC.style.flex='0 0 '+wpx+'px';scheduleRedraw();}else if(vdrag){var r=row.getBoundingClientRect();var hpx=Math.max(240,Math.min(1100,e.clientY-r.top));row.style.height=hpx+'px';scheduleRedraw();}});
    document.addEventListener('mouseup',function(){if(cdrag||vdrag){cdrag=vdrag=false;document.body.style.userSelect='';scheduleRedraw();}});
    window.addEventListener('resize',scheduleRedraw);})();
  el('ddSearch').addEventListener('input',function(e){S.ddSearch=e.target.value.trim().toLowerCase();renderDrill();});
  el('ddClear').addEventListener('click',function(){S.ddSearch='';renderDrill();});
  el('ddExpand').addEventListener('click',function(){S.ddOpen={};(function w(n){sortedKids(n).forEach(function(k){if(!k.leaf){S.ddOpen[k.key]=1;w(k);}});})(TREE);renderDrill();});
  el('ddCollapse').addEventListener('click',function(){S.ddOpen={};renderDrill();});
  el('ddGran').addEventListener('change',function(e){S.ddGran=e.target.value;renderDrill();});
  el('ddWrap').addEventListener('click',function(e){var nm=e.target.closest('td.name[data-ddrow]');if(!nm)return;var k=nm.getAttribute('data-ddrow');S.ddOpen[k]=!S.ddOpen[k];renderDrill();});
  render();})();
<\/script></body></html>`;
}
function _bmDownloadPivot(){
  const res=window._bmLastResult, opts=window._bmLastOpts; if(!res||!opts){ return; }
  try{
    const html=_bmBuildPivotHtml(res,opts);
    const blob=new Blob([html],{type:'text/html'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='Horizon Budget Report '+_localDateStamp()+'.html';   // v18.10.6 — computer-local date (was UTC)
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
  }catch(e){ console.error('report export failed', e); alert('Budget report export failed: '+e.message); }
}
function _bmExportExcel(res, opts){
  const note=document.getElementById('bmExportNote');
  const wb=_bmBuildWorkbook(res,opts);
  if(!wb){ if(note) note.textContent='Excel library not available.'; return; }
  const fname='Horizon Budget '+_localDs(new Date())+'.xlsx';   // v18.12 A: local date
  try {
    window.XLSX.writeFile(wb, fname);
    if(note) note.innerHTML='&#11015; Excel downloaded: '+fname+' ('+wb.SheetNames.length+' sheets). '+
      '<a onclick="_bmDownloadPivot()" style="color:#3dc9a0;cursor:pointer;text-decoration:underline">&#11015; Interactive budget report (HTML)</a>';
  }
  catch(e){ if(note) note.textContent='Export failed: '+e.message; console.error(e); }
}

// ── Budget Adjustment Factor (BAF) — hierarchical % uplift, inherit/override ──
function _bafObj(){ if(!budgetConfig.baf) budgetConfig.baf={total:'',fleet:{},model:{},unit:{},component:{}}; return budgetConfig.baf; }
function _bafNum(x){ if(x===undefined||x===null||x==='') return undefined; const n=Number(x); return isFinite(n)?n:undefined; }
function _bafFirst(){ for(let i=0;i<arguments.length;i++) if(arguments[i]!==undefined) return arguments[i]; }
function _bafKey(level,d){ if(level==='fleet') return d.fleet; if(level==='model') return d.fleet+'||'+d.model; if(level==='unit') return d.unit; if(level==='component') return d.unit+'||'+d.comp; return null; }
function _bafMap(level){ const b=_bafObj(); return {fleet:b.fleet,model:b.model,unit:b.unit,component:b.component}[level]; }
function _bafOwn(level,d){ const b=_bafObj(); if(level==='total') return _bafNum(b.total); return _bafNum(_bafMap(level)[_bafKey(level,d)]); }
function _bafInherited(level,d){ const b=_bafObj(); const t=_bafNum(b.total), fv=_bafNum(b.fleet[d.fleet]), mv=_bafNum(b.model[d.fleet+'||'+d.model]), uv=_bafNum(b.unit[d.unit]);
  if(level==='component') return _bafFirst(uv,mv,fv,t,0);
  if(level==='unit') return _bafFirst(mv,fv,t,0);
  if(level==='model') return _bafFirst(fv,t,0);
  if(level==='fleet') return _bafFirst(t,0);
  return 0; }
function _bafTreeData(){ const sel=window._bmSelUnits; const t={};
  (typeof DATA!=='undefined'?DATA:[]).forEach(r=>{ const u=String(r.unit||'(no unit)'); if(sel && !sel.has(u)) return;
    const f=r.fleet||'(no fleet)', m=r.model||'(no model)', c=r.component||'';
    ((t[f]=t[f]||{})[m]=t[f][m]||{}); (t[f][m][u]=t[f][m][u]||new Set()); t[f][m][u].add(c); });
  return t; }
function _bafInp(level,d){ return '<input type="text" class="baf-inp" data-level="'+level+'" data-fleet="'+_beEsc(d.fleet||'')+'" data-model="'+_beEsc(d.model||'')+'" data-unit="'+_beEsc(d.unit||'')+'" data-comp="'+_beEsc(d.comp||'')+'"><span class="baf-pct">%</span>'; }
function _bafRender(){ const t=_bafTreeData(); let html='';
  if(!Object.keys(t).length) return '<div style="color:#6e7681;font-size:11px;padding:8px">No equipment selected.</div>';
  Object.keys(t).sort().forEach(f=>{
    html+='<div class="baf-node"><div class="baf-row"><span class="baf-caret">&#9654;</span><span class="baf-lbl baf-lbl-fleet">'+_beEsc(f)+'</span>'+_bafInp('fleet',{fleet:f})+'</div><div class="baf-children" style="display:none">';
    Object.keys(t[f]).sort().forEach(m=>{
      html+='<div class="baf-node"><div class="baf-row"><span class="baf-caret">&#9654;</span><span class="baf-lbl baf-lbl-model">'+_beEsc(m)+'</span>'+_bafInp('model',{fleet:f,model:m})+'</div><div class="baf-children" style="display:none">';
      Object.keys(t[f][m]).sort().forEach(u=>{
        html+='<div class="baf-node"><div class="baf-row"><span class="baf-caret">&#9654;</span><span class="baf-lbl">'+_beEsc(u)+'</span>'+_bafInp('unit',{fleet:f,model:m,unit:u})+'</div><div class="baf-children" style="display:none">';
        [...t[f][m][u]].sort().forEach(c=>{ html+='<div class="baf-node"><div class="baf-row"><span class="baf-caret baf-caret-none"></span><span class="baf-lbl baf-lbl-comp">'+_beEsc(c)+'</span>'+_bafInp('component',{fleet:f,model:m,unit:u,comp:c})+'</div></div>'; });
        html+='</div></div>';
      });
      html+='</div></div>';
    });
    html+='</div></div>';
  });
  return html; }
function _bafRefreshTree(){
  const tb=document.getElementById('bafTotalInp');
  if(tb){ const own=_bafOwn('total',{}); if(own!==undefined){ if(document.activeElement!==tb) tb.value=own; tb.classList.add('baf-explicit'); } else { if(document.activeElement!==tb) tb.value=''; tb.classList.remove('baf-explicit'); } tb.placeholder='0'; }
  document.querySelectorAll('#bmBafTree .baf-inp').forEach(inp=>{
    const level=inp.dataset.level, d={fleet:inp.dataset.fleet,model:inp.dataset.model,unit:inp.dataset.unit,comp:inp.dataset.comp};
    const own=_bafOwn(level,d);
    if(own!==undefined){ if(document.activeElement!==inp) inp.value=own; inp.classList.add('baf-explicit'); inp.placeholder=''; }
    else { if(document.activeElement!==inp) inp.value=''; inp.classList.remove('baf-explicit'); inp.placeholder=String(_bafInherited(level,d)); }
  });
}
function _bafOnChange(inp){
  const level=inp.dataset.level, d={fleet:inp.dataset.fleet,model:inp.dataset.model,unit:inp.dataset.unit,comp:inp.dataset.comp};
  const raw=(inp.value||'').trim(); const b=_bafObj();
  const apply=(v)=>{ if(level==='total'){ b.total=v; return; } const m=_bafMap(level), k=_bafKey(level,d); if(v===''||v===undefined) delete m[k]; else m[k]=v; };
  if(raw===''){ apply(''); } else { const n=Number(raw); apply(isFinite(n)?n:''); }
  _bafRefreshTree(); _bmUpdateBafSummary();
  try{ if(typeof _scheduleSave==='function') _scheduleSave(); }catch(e){}
}
function _bafToggle(caret){ const node=caret.closest('.baf-node'); const kids=node.querySelector(':scope > .baf-children'); if(!kids) return; const open=kids.style.display!=='none'; kids.style.display=open?'none':''; caret.innerHTML=open?'&#9654;':'&#9660;'; }
function _bafExpandAll(open){ document.querySelectorAll('#bmBafTree .baf-children').forEach(c=>c.style.display=open?'':'none'); document.querySelectorAll('#bmBafTree .baf-caret:not(.baf-caret-none)').forEach(c=>c.innerHTML=open?'&#9660;':'&#9654;'); }
function _bafResetAll(){ budgetConfig.baf={total:'',fleet:{},model:{},unit:{},component:{}}; _bafRefreshTree(); _bmUpdateBafSummary(); try{ if(typeof _scheduleSave==='function') _scheduleSave(); }catch(e){} }
function _bmOpenBaf(){ _bafObj(); document.getElementById('bmBafTree').innerHTML=_bafRender(); _bafRefreshTree(); document.getElementById('bmBafModal').classList.add('show'); }
function _bmCloseBaf(){ document.getElementById('bmBafModal').classList.remove('show'); }
function _bmUpdateBafSummary(){ const el=document.getElementById('bmBafSummary'); if(!el) return; const b=_bafObj(); const total=_bafNum(b.total)||0; const n=Object.keys(b.fleet).length+Object.keys(b.model).length+Object.keys(b.unit).length+Object.keys(b.component).length; el.textContent='Total +'+total+'%'+(n?(' · '+n+' override'+(n!==1?'s':'')):''); }
// Enumerate template rows from the selected equipment (current explicit values; blank = inheriting).
function _bafTreeRows(){
  const t=_bafTreeData(); const b=_bafObj(); const rows=[];
  const own=(lvl,d)=>{ const v=_bafOwn(lvl,d); return (v===undefined)?'':v; };
  rows.push(['(TOTAL - all selected)','','','', (_bafNum(b.total)===undefined?'':_bafNum(b.total))]);
  Object.keys(t).sort().forEach(f=>{
    rows.push([f,'','','', own('fleet',{fleet:f})]);
    Object.keys(t[f]).sort().forEach(m=>{
      rows.push([f,m,'','', own('model',{fleet:f,model:m})]);
      Object.keys(t[f][m]).sort().forEach(u=>{
        rows.push([f,m,u,'', own('unit',{fleet:f,model:m,unit:u})]);
        [...t[f][m][u]].sort().forEach(c=>{ rows.push([f,m,u,c, own('component',{fleet:f,model:m,unit:u,comp:c})]); });
      });
    });
  });
  return rows;
}
function _bafDownload(){
  const XL=window.XLSX; if(!XL){ alert('Excel library not available.'); return; }
  const instr=[
    ['Budget Adjustment Factor (BAF) - parts / labour uplift %'],[],
    ['HOW IT WORKS - the cascade rule'],
    ['You do NOT have to complete every level. Values cascade DOWN the hierarchy:'],
    ['      Total  ->  Fleet  ->  Model  ->  Unit  ->  Component'],
    ['Leave a cell BLANK to inherit from its parent. Enter a % only where it should DIFFER from the parent.'],[],
    ['Example:'],
    ['   - Set a Fleet to 30 and leave its models / units / components blank  ->  they all inherit 30%.'],
    ['   - Then set one Component to 0  ->  only that component changes; everything else stays 30%.'],
    ['   - A value entered at a child is NOT overridden when you later change the parent.'],[],
    ['ON RE-IMPORT:'],
    ['   - If EVERY % cell is filled, all are imported as explicit (direct) entries.'],
    ['   - If ANY % cells are blank, you will be asked whether blanks mean "inherit (cascade)" or "0%".'],[],
    ['Fill in the "BAF" sheet. Only the "BAF %" column is read; Fleet/Model/Unit/Component identify each row.']
  ];
  const data=[['Fleet','Model','Unit','Component','BAF %']].concat(_bafTreeRows());
  const wb=XL.utils.book_new();
  XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(instr), 'Instructions');
  const ws=XL.utils.aoa_to_sheet(data); ws['!cols']=[{wch:18},{wch:14},{wch:16},{wch:20},{wch:8}];
  XL.utils.book_append_sheet(wb, ws, 'BAF');
  try{ XL.writeFile(wb, 'Horizon BAF template.xlsx'); }catch(e){ alert('Download failed: '+e.message); }
}
// Structural signature of the CURRENT template — upload must match this EXACTLY.
function _bafExpectedKeys(){
  const t=_bafTreeData(); const keys=new Set(['TOTAL']);
  Object.keys(t).forEach(f=>{ keys.add('F|'+f);
    Object.keys(t[f]).forEach(m=>{ keys.add('M|'+f+'||'+m);
      Object.keys(t[f][m]).forEach(u=>{ keys.add('U|'+u);
        [...t[f][m][u]].forEach(c=>keys.add('C|'+u+'||'+c)); }); }); });
  return keys;
}
function _bafRowKey(r){ return (r.level==='total')?'TOTAL':(r.level.charAt(0).toUpperCase()+'|'+r.key); }
function _bafParseWorkbook(wb){
  const XL=window.XLSX;
  const hasBaf=(wb.SheetNames.indexOf('BAF')>=0);
  const name=hasBaf?'BAF':(wb.SheetNames.filter(n=>n!=='Instructions')[0]||wb.SheetNames[0]);
  const aoa=XL.utils.sheet_to_json(wb.Sheets[name],{header:1});
  const header=(aoa[0]||[]).map(x=>x==null?'':String(x).trim());
  const rows=[]; let anyBlank=false;
  for(let i=1;i<aoa.length;i++){ const r=aoa[i]||[];
    const fleet=(r[0]==null?'':String(r[0])).trim(), model=(r[1]==null?'':String(r[1])).trim(), unit=(r[2]==null?'':String(r[2])).trim(), comp=(r[3]==null?'':String(r[3])).trim();
    const pctRaw=r[4]; const blank=(pctRaw===undefined||pctRaw===null||String(pctRaw).trim()==='');
    if(!fleet && !model && !unit && !comp && blank) continue;
    let level,key;
    if(fleet.toUpperCase().indexOf('TOTAL')>=0 && !model && !unit && !comp){ level='total'; key=null; }
    else if(comp){ level='component'; key=unit+'||'+comp; }
    else if(unit){ level='unit'; key=unit; }
    else if(model){ level='model'; key=fleet+'||'+model; }
    else if(fleet){ level='fleet'; key=fleet; }
    else continue;
    if(blank) anyBlank=true;
    rows.push({level,key,val:blank?undefined:Number(pctRaw),blank});
  }
  return {rows,anyBlank,header,hasBaf};
}
function _bafApplyImport(parsed, emptyMode){
  const baf={total:'',fleet:{},model:{},unit:{},component:{}};
  parsed.rows.forEach(r=>{ let v;
    if(r.blank){ if(emptyMode==='zero') v=0; else return; }
    else { if(!isFinite(r.val)) return; v=r.val; }
    if(r.level==='total') baf.total=v; else baf[r.level][r.key]=v;
  });
  budgetConfig.baf=baf;
  document.getElementById('bmBafTree').innerHTML=_bafRender(); _bafRefreshTree(); _bmUpdateBafSummary();
  try{ if(typeof _scheduleSave==='function') _scheduleSave(); }catch(e){}
}
function _bafImportChoose(mode){ const p=document.getElementById('bafImportPrompt'); if(p) p.classList.remove('show'); if(window._bafPending){ _bafApplyImport(window._bafPending, mode); window._bafPending=null; } }
function _bafUpload(ev){
  const f=ev.target.files&&ev.target.files[0]; if(!f) return; ev.target.value='';
  const XL=window.XLSX; if(!XL){ alert('Excel library not available.'); return; }
  const rd=new FileReader();
  rd.onload=function(){ try{
    const wb=XL.read(new Uint8Array(rd.result),{type:'array'});
    const parsed=_bafParseWorkbook(wb);
    // STRICT — must be an unaltered Horizon template matching the current selection exactly. No mapping, no guessing.
    const HDR=['Fleet','Model','Unit','Component','BAF %'];
    if(!parsed.hasBaf || parsed.header.length!==HDR.length || HDR.some((h,i)=>parsed.header[i]!==h)){
      alert('Upload rejected.\n\nThis is not a valid Horizon BAF template (the "BAF" sheet is missing or its header row was changed).\n\nDownload a fresh template and fill in the BAF % column only.'); return;
    }
    const expected=_bafExpectedKeys();
    const got=new Set(parsed.rows.map(_bafRowKey));
    const missing=[...expected].filter(k=>!got.has(k));
    const extra=[...got].filter(k=>!expected.has(k));
    if(missing.length || extra.length || got.size!==expected.size || parsed.rows.length!==expected.size){
      alert('Upload rejected.\n\nThe file does not exactly match the current equipment selection — rows may have been added, removed, renamed, reordered into duplicates, or the selection changed since download.\n'+
        (missing.length?('   Missing rows: '+missing.length+'\n'):'')+
        (extra.length?('   Unexpected / renamed rows: '+extra.length+'\n'):'')+
        '\nNo additions, deletions, or renames are allowed. Download a fresh template, fill in the BAF % column only, and re-upload.'); return;
    }
    if(!parsed.anyBlank){ _bafApplyImport(parsed,'zero'); return; }
    window._bafPending=parsed;
    const p=document.getElementById('bafImportPrompt'); if(p) p.classList.add('show'); else _bafApplyImport(parsed,'inherit');
  }catch(e){ alert('Could not read Excel file: '+e.message); } };
  rd.readAsArrayBuffer(f);
}


// ── the dialogs: built once, on first use ─────────────────────────────────
var _mounted = false;
function _nbMount() {
  if (_mounted || !root.document) return;
  var st = document.createElement('style'); st.id = 'nb-style'; st.textContent = NB_CSS; document.head.appendChild(st);
  var box = document.createElement('div'); box.id = 'nb-root'; box.innerHTML = NB_MARKUP; document.body.appendChild(box);
  _mounted = true;
  _nbWire();
  var mark = function () { budgetConfig.periodManual = true; };
  ['bmPeriodNum', 'bmPeriodUnit'].forEach(function (id) { var el = document.getElementById(id); if (el) el.addEventListener('change', mark); });
}
function _nbEnsureXLSX() {
  if (root.XLSX) return Promise.resolve(root.XLSX);
  return new Promise(function (res, rej) {
    var s = document.createElement('script'); s.src = 'vendor/xlsx.full.min.js';
    s.onload = function () { root.XLSX ? res(root.XLSX) : rej(new Error('SheetJS did not load')); };
    s.onerror = function () { rej(new Error('could not load vendor/xlsx.full.min.js')); };
    document.head.appendChild(s);
  });
}
// what the machine timeline did, in words (the Excel cover sheet and the report's Parameters tab)
function _nbWinText(res, opts) {
  if (!opts.windows) return "Off: Cadence's rule (every machine budgeted to the end of the period)";
  var w = res.windowEffect || {}, g = Object.keys(w.goneUnits || {}).sort();
  return 'On: nothing after a retired date; parked periods move change-outs out. ' + g.length + ' machine(s) past their retired date left out' +
    (g.length ? ' (' + g.slice(0, 12).join(', ') + (g.length > 12 ? ', …' : '') + ')' : '') + '; ' + (w.dropped || 0) + ' change-out(s) after a retired date not budgeted; ' + (w.moved || 0) + ' moved by parked periods.';
}
function _nbWindowsOn() { var el = document.getElementById('bmWindows'); return el ? !!el.checked : (budgetConfig.windows !== false); }
// the period follows Horizon's "today until <year>" until the person sets one in the dialog
function _nbDefaultPeriod() {
  var y = HOST && HOST.horizonEnd ? Number(HOST.horizonEnd()) : 0, now = new Date();
  if (!(y > now.getFullYear())) return null;
  return { num: (y - now.getFullYear()) * 12 + (12 - now.getMonth()), unit: 'months', year: y };
}
function _nbOpenExtras() {
  var w = document.getElementById('bmWindows'); if (w) w.checked = budgetConfig.windows !== false;
  if (!budgetConfig.periodManual) {
    var p = _nbDefaultPeriod();
    if (p) { document.getElementById('bmPeriodNum').value = p.num; document.getElementById('bmPeriodUnit').value = p.unit; }
  }
  var n = document.getElementById('bmSeedNote');
  if (n) { var h = ''; try { h = (HOST && HOST.seedNote) ? (HOST.seedNote() || '') : ''; } catch (e) {} n.innerHTML = h; n.style.display = h ? '' : 'none'; }
}
function _nbPack(res, opts) {
  var base = null;
  if (opts.windows) { try { base = _computeBudget(Object.assign({}, opts, { windows: false })); } catch (e) { console.warn('budget base run:', e); } }
  LAST = { res: res, opts: opts, base: base };
  return LAST;
}
function _nbAfterRun(res, opts) {
  var pack = _nbPack(res, opts);
  closeBudgetModal();
  try { if (HOST && HOST.onResult) HOST.onResult(pack); } catch (e) { console.warn('budget onResult:', e); }
}
function _nbRefresh() {
  if (!HOST) return;
  try { setPlan(HOST.plan ? HOST.plan() : null, HOST.horizon ? HOST.horizon() : null); } catch (e) { console.warn('budget rows:', e); DATA = []; DATA_W = []; WIN = {}; }
}
function _nbSavedOpts() {
  var fsm = budgetConfig.fiscalStartMonth || 1, proj = budgetConfig.projectionStart || 'thisMonth', now = new Date();
  if (proj === 'today') proj = 'thisMonth';
  var startD = (proj === 'nextFY') ? _fyNextStart(now, fsm) : new Date(now.getFullYear(), now.getMonth(), 1);
  var num = budgetConfig.periodNum || 10, unit = budgetConfig.periodUnit || 'years';
  if (!budgetConfig.periodManual) { var p = _nbDefaultPeriod(); if (p) { num = p.num; unit = p.unit; } }
  var end = new Date(startD.getFullYear(), startD.getMonth() + (unit === 'years' ? num * 12 : num), 0);
  return { fromDate: startD.getFullYear() + '-' + String(startD.getMonth() + 1).padStart(2, '0') + '-01',
    toDate: end.getFullYear() + '-' + String(end.getMonth() + 1).padStart(2, '0') + '-' + String(end.getDate()).padStart(2, '0'),
    periodNum: num, periodUnit: unit, bucketSize: budgetConfig.bucketSize || 'month', projectionStart: proj, fiscalStartMonth: fsm,
    includeOverdueForward: budgetConfig.includeOverdueForward !== false, fleets: null, units: root._bmSelUnits || null,
    baf: (budgetConfig.baf || null), windows: budgetConfig.windows !== false };
}

root.NumaCoreBudget = {
  version: VERSION, liftedFrom: LIFTED_FROM,
  attach: function (host) { HOST = host || null; },
  open: function () { _nbMount(); _nbRefresh(); _nbEnsureXLSX().catch(function () {}); openBudgetModal(); },
  run: function (extra) { _nbRefresh(); var opts = Object.assign(_nbSavedOpts(), extra || {}); var res = _computeBudget(opts); root._bmLastResult = res; root._bmLastOpts = opts; return _nbPack(res, opts); },
  compute: function (opts) { return _computeBudget(opts); },
  setPlan: setPlan,
  rows: function (windows) { return windows ? DATA_W : DATA; },
  windows: function () { return WIN; },
  config: function () { return budgetConfig; },
  setConfig: function (cfg) { Object.keys(budgetConfig).forEach(function (k) { delete budgetConfig[k]; }); Object.assign(budgetConfig, NB_DEFAULTS, JSON.parse(JSON.stringify(cfg || {}))); },
  last: function () { return LAST; },
  reportHtml: function () { return LAST ? _bmBuildPivotHtml(LAST.res, LAST.opts) : ''; },
  exportExcel: function () { if (!LAST) return Promise.resolve(false); return _nbEnsureXLSX().then(function () { _bmExportExcel(LAST.res, LAST.opts); return true; }); },
  downloadReport: function () { _bmDownloadPivot(); },
  openRisk: function () { _nbMount(); _bmOpenRisk(); },
  _internal: { buildRows: _nbBuildRows, windowsOf: _nbWindows, shiftMs: _nbShiftMs, buildBands: _buildBudgetBands, componentEvents: _budgetComponentEvents, bafFactor: _bafFactor, savedOpts: _nbSavedOpts, buildWorkbook: function (r, o) { return _bmBuildWorkbook(r, o); }, ensureXLSX: _nbEnsureXLSX }
};

// the functions the dialogs call from inline handlers

[['_bafDownload', _bafDownload], ['_bafExpandAll', _bafExpandAll], ['_bafImportChoose', _bafImportChoose], ['_bafResetAll', _bafResetAll], ['_bafUpload', _bafUpload], ['_beApply', _beApply], ['_beExpandAll', _beExpandAll], ['_beSelectAll', _beSelectAll], ['_bmCloseBaf', _bmCloseBaf], ['_bmCloseEquip', _bmCloseEquip], ['_bmCloseRisk', _bmCloseRisk], ['_bmDownloadPivot', _bmDownloadPivot], ['_bmGenerate', _bmGenerate], ['_bmGenerateProceed', _bmGenerateProceed], ['_bmOpenBaf', _bmOpenBaf], ['_bmOpenEquip', _bmOpenEquip], ['_bmOpenRisk', _bmOpenRisk], ['_bmRiskDownload', _bmRiskDownload], ['_bmZeroBafReview', _bmZeroBafReview], ['closeBudgetModal', closeBudgetModal]].forEach(function (p) { root[p[0]] = p[1]; });

})(typeof window !== 'undefined' ? window : this);

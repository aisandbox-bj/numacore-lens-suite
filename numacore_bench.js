/* ═══════════════════════════════════════════════════════════════════════════
   numacore_bench.js — BENCH (critical spares) for NumaCore Lens
   v1.3.0 · 2026-09-27

   What it does
     Shows every critical component (majors + minors) per model with its stock
     unpacked — on the shelf · on the way · reserved · cover after inbound — and
     links each spares pocket to the Lens components it serves (worst life %,
     next due). A machine board (picture + cards + leader lines) sits above the
     table.

   Where things live
     • Definition: the fleet JSON's top-level `bench` section (Lens-owned, same
       place on V4 Flat and V5 files). Which part numbers fit which pocket, and
       where each major sits on the machine picture. Seeded from Critical Spares
       Review V3; imported once with "Import Bench definition".
     • Stock: read from the INV_MSTR at load time, NEVER stored in the JSON.
       It comes from the client folder (numacore_workspace → setStock); without
       a folder the operator loads the file by hand for the session.

   Ported from Critical Spares Review V3 (2026-09-14 build), behaviour-for-
   behaviour so its numbers are the test oracle: buildIndex (valuation split:
   NEW + REBUILT on hand, DEFECTIVE excluded; transit / PO / reserved averaged
   across a material's rows), headerAt, lookup (+ "SEE <material>" redirect),
   resolveU, netStatus, assembly minimum, catOf, mrpStr, board layout + anchors.

   Rules held here (operator, 2026-09-26)
     • Status is judged on COVER AFTER INBOUND = on hand + in transit + on order
       − reserved. Every row still shows all four numbers.
     • v1.0.1 status rule (operator, 2026-09-26): Spare = cover > 0; No spare =
       cover exactly 0, INCLUDING zero stock with no demand; Short = demand
       (reserved) the shelf + inbound cannot meet (cover < 0). This is the one
       deliberate departure from V3, whose netStatus also called "nothing on the
       shelf or inbound" Short when nothing was reserved.
     • Words, never just a colour. Five states: Spare / No spare / Short /
       Not in SAP / Not in review (grey — tracked in Lens, no pocket matches).
     • Lens components join by SAP number, then part number. Never by name; a
       name only SUGGESTS where an unmatched component may belong.
     • The stock file's date is its DATA date: from the file name, or entered;
       unknown shows red. Never the upload time. Local calendar dates only.
     • v1.1.0 (operator, 2026-09-26): amber after 7 days, red after 14, and
       nothing older than 30 days is loaded. Stock can come from the client
       folder (numacore_workspace → setStock). Stock never carries over to
       another client's plan. The Older / Other Sandvik reference models are
       tables only, listed in their own group.
     • v1.1.1 (operator, 2026-09-27: "cant have that" — every headline must add
       up to the rows under it):
       – Assemblies (sub-part groups, e.g. DI650i Rotary Head) count COMPLETE
         KITS: the headline is the binding group's own numbers (the group with
         the least cover after inbound), shelf / on the way / reserved from the
         same group. V3 took the minimum of each quantity separately and summed
         reserved over every group, so no set of rows added up to it.
         The detail rows are grouped per sub-part group, each with a subtotal.
       – Split components (one pocket per part number, from V3's variant rows)
         show as one family: the first row, then ↳ rows, each with the units it
         fits and why it is split. Numbers unchanged (V3 already had a row each).
       – Headline quantities are the sums of the ROUNDED per-material numbers,
         so they equal the detail rows exactly. One minus sign (−) everywhere.
       – A part number that only matches the INV_MSTR once leading zeros are
         ignored, and then matches two different part numbers ("15200" vs
         "015200"), is not counted; it is flagged instead.
       – Tiles follow the Majors / Minors / Needs-attention filter. Repeated
         component names carry their location. A new client resets the view.
       – "Link file" is gone (the client folder replaced it). With a folder
         connected, "Load INV_MSTR" moves into the ⋯ menu with the definition
         import / export.
     • v1.1.2 (operator, 2026-09-27, after working through Bench):
       – The summary page's three group tables share one fixed set of column
         widths, so every column lines up down the page.
       – An opened component's SAP detail is now rows of the same table: each
         number sits under the column it adds up to, a bar in the component's
         status colour runs from the row down through its detail, and a tree
         connector ties each detail row to it (it "floated" on wide screens).
       – V3 sizes: the board is never scaled above its 1520 x 860 design size,
         and the page is one centred column no wider than V3's (1520 px).
     • v1.2.0 (operator, 2026-09-27: "I do not want to adjust INVENTORY… I want to be
       able to see the component details (snapshot stuff) and be able to see what pulls
       through… maybe even update — either manually or via the upload"):
       – A model page has two views: Stock (the board and table, as before) and PART
         NUMBERS: every part number of every component, what it pulls through to in the
         INV_MSTR (SAP material, shelf / on the way / reserved — read-only; "rows ▸" shows
         the INV_MSTR rows behind them and how they were counted), whether a snapshot in
         the client folder lists it, and how many Lens units carry it.
       – Component Snapshots (from numacore_workspace) are compared with the definition:
         part numbers and components a snapshot has that the definition doesn't become
         SUGGESTIONS. Never a removal (a list can span several snapshots).
       – Editing by hand: add / remove part numbers (not an assembly's sub-part groups).
       – One review for all of it: before / after, tick, Apply. Unticked suggestions are
         declined and not suggested again. A replacement definition file (⋯ or the
         client folder) gets a per-model before / after and applies whole or not at all.
       – Everything is logged in the definition (bench.log, travels in the plan); a
         Change log page lists it. A "not saved yet" banner stays until SAVE FILE.
       – The Lens join tries every unit's SAP number, then every unit's part number
         (v1.1.x tried only the first unit's).
       – Stock is never written: INV_MSTR stays read-only.
     • v1.2.1 (operator, 2026-09-27, after using v1.2.0):
       – "When I open a component… the column widths change to fit the additional text… dont like these jerky moves":
         the model table has fixed columns (set widths for status and numbers; Component and Tracked in Lens share
         the rest; text wraps in its cell). Opening a row moved a column by up to 172 px at 1920; now 0, and every
         model's table has the same columns. A part number no longer splits at its hyphen.
       – "Replace all 0 with - to make it more visible": a zero in any quantity cell (stock table, detail rows,
         subtotals, Part numbers, INV_MSTR rows, summary counts, tiles) is a dimmed en dash "–" (hover: 0).
         "—" still means no data. Sentences and board cards keep their numbers.
     • v1.3.0 (operator, 2026-09-27, notes after using the suite):
       – "Overdue should not read from the Project dates… only from the Component hrs as stated in Lens… anything > 100%
         is overdue": a row is overdue when its worst life % is over 100 (shown under the %). "Next due (plan)" shows
         the plan's date as it is and never calls it overdue.
       – "Where you have a comment box under a component… leave the header card that I can open if I want": an opened
         row keeps its SAP rows and one-line statement; the notes fold into one "Notes ▸" line (remembered in this browser).
       – Hide (right-click a row or a board card): hidden on this model, kept in the plan (Lens's ui_settings). A
         "Hidden on this model" bar shows the count and unhides. Hidden rows leave the board, table, tiles and counts; they
         stay in the definition, and Cadence shows every component. Components hidden in Lens are left out of "not
         matched" and the suggestions.
       – "If there is no snapshot, bench should use the part numbers in Lens": for a model with no Component Snapshot in
         the client folder, Lens's part numbers are the reference: a Lens component with the SAME name as a component here
         (left / right / front / rear and words like "cyl" or "group" aside: "Front Differential" = "Differential", but
         "Transmission Charging Pump" ≠ "Transmission"), with a part number its list doesn't have → suggest adding it. Same review, same log; never a
         removal; a declined one is not suggested again. A Lens component with no component here is NOT suggested as a
         new one (Lens tracks every component; the definition is the critical list): it stays in "Tracked in Lens, not
         matched", as before.

   API
     NumaCoreBench.render(containerEl, host)
       host = { raw, fleetData, imageBase, planSaved, clientCode,
                markUnsaved(msg), toast(msg, sev),
                v1.3.0 (optional): isHidden(fleet, model, unit, component) · benchHidden() → [{model, pid, label, at}] ·
                setBenchHidden(list) · openHidden() }
     NumaCoreBench.setStock(rows, {fileName, dataAsOf, method, clientCode})   rows = [headers, ...]
     NumaCoreBench.clearStock()
     NumaCoreBench.setSnapshots([snapshot])            v1.2.0 — the Component Snapshots in the client folder
     NumaCoreBench.reviewDefinition(json, fileName)    v1.2.0 — a definition file for the before / after
     NumaCoreBench.previewSnapshot(snapshot) → {adds, newComps}   v1.2.0 — for the folder's check card
     NumaCoreBench.version
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var VERSION = '1.3.0';
  var STOCK_AGE = { amber: 7, red: 14, refuse: 30 };   // days — operator 2026-09-26: 7/14 for every SAP source; nothing older than 30 days is loaded
  var XLSX_LOCAL = 'vendor/xlsx.full.min.js';
  var XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.20.2/dist/xlsx.full.min.js';
  var BENCH_SCHEMA = 'numacore.bench/';

  // ── session state (stock is session-only by design) ──────────────────────
  var S = {
    host: null, el: null, rawRef: null,
    model: null,            // selected bench model key, or '' = fleet summary, or 'notin:<fleet>|<model>'
    filter: 'all',
    open: {},               // pocket id -> true when its detail row is open
    idx: null,              // INV_MSTR index (V3 shape)
    stock: null,            // { fileName, sheet, dataAsOf, method, loadedAt, materials, rowsIn, rowsUsed, lastModified }
    askDate: false,         // show the "enter the stock date" box
    busy: '',               // reading-file message
    cc: null,              // v1.1.0 — the client the stock belongs to; a different client's plan clears it
    prev: null,             // v1.1.0 — stock kept while a hand-loaded file waits for its date (restored if refused)
    // v1.2.0 — the Part numbers view, the review and the change log
    view: 'stock',          // on a model page: 'stock' (board + table) | 'parts' (part numbers and what they pull through)
    page: '',               // '' | 'review' | 'log' — full-width pages
    snaps: [],              // Component Snapshots in the client folder's 2 In use\Snapshots (from numacore_workspace)
    staged: [],             // hand edits waiting for the review: {kind:'add'|'remove', model, pid, pn}
    defReview: null,        // a Bench definition file waiting for its before / after: {bench, fileName}
    tick: {},               // review item id -> false when unticked (ticked by default)
    edit: false,            // Part numbers view: editing by hand
    pfilter: 'all',         // Part numbers view filter: all | nostock | nolens | snap
    raw: {},                // "pid|pn" -> true when its INV_MSTR rows are shown
    unsaved: null,          // {at, what} — the definition changed in this tab and SAVE FILE has not run since
    // v1.3.0
    notesOpen: readPref('ncb_notes_open') === '1',   // an opened row's notes: folded unless the reader opened them
    hidePanel: false,       // the "Hidden on this model" list is open
    hideKeys: [],           // that list's rows → the pocket ids each one unhides
    views: null,            // the model views of the last render (Lens suggestions read them)
    bhLocal: null           // hidden rows when the host can't keep them (an older Lens): this tab only
  };
  function readPref(k) { try { return root.localStorage ? root.localStorage.getItem(k) : null; } catch (e) { return null; } }
  function writePref(k, v) { try { if (root.localStorage) root.localStorage.setItem(k, v); } catch (e) {} }

  // ── small helpers ─────────────────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function localIso(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function isoToDate(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function daysSince(iso) { var d = isoToDate(iso); if (!d) return null; var n = new Date(); return Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - d) / 86400000); }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(iso) { var d = isoToDate(iso); return d ? d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() : '—'; }
  function validYmd(y, mo, d) {
    if (!(y >= 2000 && y <= 2099 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
    var dt = new Date(y, mo - 1, d); return dt.getMonth() === mo - 1 ? localIso(dt) : null;
  }
  var MON3 = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
  // Same rule as Deploy v8.19 _dateFromFileName: full dates only; month-only names are not dates.
  function dateFromFileName(name) {
    var s = String(name || '').toUpperCase(), m;
    if ((m = /(20\d\d)[_\-. ](\d\d)[_\-. ](\d\d)/.exec(s))) return validYmd(+m[1], +m[2], +m[3]);
    if ((m = /(?:^|\D)(20\d\d)(\d\d)(\d\d)(?:\D|$)/.exec(s))) return validYmd(+m[1], +m[2], +m[3]);
    if ((m = /(?:^|[^0-9])(\d{1,2})[ _\-]?(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[ _\-]?(\d{4}|\d{2})(?:\D|$)/.exec(s)))
      return validYmd(m[3].length === 2 ? 2000 + +m[3] : +m[3], MON3[m[2]], +m[1]);
    return null;
  }
  // Join key for part numbers: upper-case, alphanumerics only, no leading zeros
  // ("308-3235" == "3083235"; "-EXC" stays distinct as "…EXC").
  function joinKey(p) { return String(p == null ? '' : p).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, ''); }
  function sapKey(p) { return String(p == null ? '' : p).trim().replace(/\.0+$/, '').replace(/^0+/, ''); }

  // ── V3 port: INV_MSTR reader ──────────────────────────────────────────────
  function num(v) { if (v == null) return 0; if (typeof v === 'number') return isFinite(v) ? v : 0; v = ('' + v).replace(/,/g, '').trim(); var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function norm(x) { x = ('' + x).trim().toUpperCase().replace(/^0+/, ''); return x || '0'; }
  function findCol(h, preds) { for (var i = 0; i < h.length; i++) { for (var j = 0; j < preds.length; j++) { if (preds[j](h[i])) return i; } } return -1; }
  // a header row is one (within the first 6) that has both Material and Manufacturer Part No.
  function headerAt(rows) {
    for (var i = 0; i < Math.min(6, rows.length); i++) {
      var h = (rows[i] || []).map(function (x) { return ('' + x).trim().toLowerCase(); });
      var hasM = h.some(function (x) { return x === 'material' || x === 'material number'; });
      var hasP = h.some(function (x) { return x.indexOf('manufacturer part') >= 0 || x.indexOf('mfg part') >= 0; });
      if (hasM && hasP) return i;
    }
    return -1;
  }
  function buildIndex(rows) {
    var h = rows[0].map(function (x) { return ('' + x).trim().toLowerCase(); });
    var col = {
      material: findCol(h, [function (x) { return x === 'material'; }, function (x) { return x === 'material number'; }]),
      desc: findCol(h, [function (x) { return x.indexOf('description') >= 0; }]),
      mfg: findCol(h, [function (x) { return x.indexOf('manufacturer part') >= 0 || x.indexOf('mfg part') >= 0; }]),
      soh: findCol(h, [function (x) { return x === 'unrestricted' || x === 'tot_qty_oh' || x === 'soh qty' || x === 'qoh'; }, function (x) { return x.indexOf('soh') >= 0; }]),
      transit: findCol(h, [function (x) { return x.indexOf('transit') >= 0; }]),
      po: findCol(h, [function (x) { return (x.indexOf('po qty') >= 0 && x.indexOf('mla') < 0) || x === 'open_po'; }]),
      res: findCol(h, [function (x) { return x === 'total res qty'; }]),
      mrp: findCol(h, [function (x) { return x === 'mrp type' || x === 'mrp_ind' || x === 'mrp ind'; }, function (x) { return x.indexOf('mrp') >= 0 && x.indexOf('type') >= 0; }]),
      min: findCol(h, [function (x) { return x === 'min' || x.indexOf('reorder') >= 0; }]),
      max: findCol(h, [function (x) { return x === 'max' || x.indexOf('maximum') >= 0; }]),
      ss: findCol(h, [function (x) { return x.indexOf('safety') >= 0; }]),
      val: findCol(h, [function (x) { return x === 'valuation type' || x === 'valuation'; }]),
      plant: findCol(h, [function (x) { return x === 'plant'; }]),                                             // v1.2.0 — shown on the raw rows only
      sloc: findCol(h, [function (x) { return x === 'storage location' || x === 'sloc' || x === 'stor. loc.'; }])
    };
    // every required column must be present — otherwise refuse the file (no partial / zeroed load)
    var req = [['material', 'Material'], ['mfg', 'Manufacturer Part No.'], ['soh', 'Unrestricted (on hand)'],
      ['transit', 'Stock in Transit'], ['po', 'PO Qty · non-MLA (on order)'], ['res', 'Total Res Qty (reserved)'], ['val', 'Valuation Type']];
    var missing = req.filter(function (w) { return col[w[0]] < 0; }).map(function (w) { return w[1]; });
    if (missing.length) throw new Error('missing required column(s): ' + missing.join(', ') + '. Correct the export and load it again.');
    var agg = new Map(), rowsIn = 0, noMat = 0, noMpn = 0;
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r]; if (!row || row.length < 2) continue;
      rowsIn++;
      var mat = ('' + row[col.material]).trim(); if (!mat) { noMat++; continue; }
      var mpn = ('' + row[col.mfg]).trim(); if (!mpn) { noMpn++; continue; }
      var val = col.val >= 0 ? ('' + row[col.val]).trim().toUpperCase() : '';
      var a = agg.get(mat);
      if (!a) { a = { material: mat, mpn: mpn, desc: col.desc >= 0 ? ('' + row[col.desc]) : '', soh: 0, transit: 0, po: 0, _nr: 0, _blank: 0, _hasval: false, _tr: 0, _po: 0, _res: 0, _n: 0, mrp: '', mn: 0, mx: 0, ss: 0, raw: [] }; agg.set(mat, a); }
      var q = num(row[col.soh]);
      // v1.2.0 — the INV_MSTR rows behind each material, kept as read (read-only; the Part numbers view shows them)
      a.raw.push({ val: val, soh: q, tr: col.transit >= 0 ? num(row[col.transit]) : 0, po: col.po >= 0 ? num(row[col.po]) : 0, res: col.res >= 0 ? num(row[col.res]) : 0,
                   plant: col.plant >= 0 ? ('' + row[col.plant]).trim() : '', sloc: col.sloc >= 0 ? ('' + row[col.sloc]).trim() : '' });
      if (col.val < 0) { a._blank += q; }
      else { if (val === 'NEW' || val === 'REBUILT' || val === 'DEFECTIVE') a._hasval = true; if (val === 'NEW' || val === 'REBUILT') a._nr += q; if (val === '') a._blank += q; }
      a._tr += (col.transit >= 0 ? num(row[col.transit]) : 0); a._po += (col.po >= 0 ? num(row[col.po]) : 0); a._res += (col.res >= 0 ? num(row[col.res]) : 0); a._n++;
      var mrp = col.mrp >= 0 ? ('' + row[col.mrp]).trim() : '';
      if (mrp && (!a.mrp || (a.mrp.toUpperCase() === 'PD' && mrp.toUpperCase() !== 'PD'))) a.mrp = mrp;
      if (col.min >= 0) a.mn = Math.max(a.mn, num(row[col.min]));
      if (col.max >= 0) a.mx = Math.max(a.mx, num(row[col.max]));
      if (col.ss >= 0) a.ss = Math.max(a.ss, num(row[col.ss]));
    }
    var MAT = new Map(), MPN = new Map(), MPNn = new Map();
    agg.forEach(function (a, mat) {
      a.soh = a._hasval ? a._nr : a._blank; a.transit = Math.round(a._tr / a._n); a.po = Math.round(a._po / a._n); a.res = Math.round(a._res / a._n); MAT.set(mat, a);
      var k = a.mpn.toUpperCase(); if (!MPN.has(k)) MPN.set(k, []); MPN.get(k).push(mat);
      var nk = norm(a.mpn); if (!MPNn.has(nk)) MPNn.set(nk, []); MPNn.get(nk).push(mat);
    });
    // SAP-number lookup for the Lens join (normalised: no leading zeros)
    var SAPn = new Map(); MAT.forEach(function (a, mat) { SAPn.set(sapKey(mat), mat); });
    return { MAT: MAT, MPN: MPN, MPNn: MPNn, SAPn: SAPn, val: col.val >= 0, nmat: MAT.size,
             ledger: { rowsIn: rowsIn, noMaterial: noMat, noPartNumber: noMpn, used: rowsIn - noMat - noMpn } };
  }
  function seeRef(d) { var m = ('' + d).toUpperCase().match(/SEE\s+(\w+)/); return m ? m[1] : null; }
  // v1.1.1 — the leading-zero fallback only counts when it points at ONE part number. "15200" and "015200" are
  // different parts in this INV_MSTR; a code that matches neither exactly must not borrow both.
  function ambiguousCode(idx, code) {
    code = ('' + code).trim(); if (!code || idx.MPN.get(code.toUpperCase())) return false;
    var nb = idx.MPNn.get(norm(code)) || [];
    return new Set(nb.map(function (mat) { return String(idx.MAT.get(mat).mpn).trim().toUpperCase(); })).size > 1;
  }
  function lookup(idx, code) {
    code = ('' + code).trim(); var u = code.toUpperCase();
    if (!code || u === 'N/A' || u === 'NOT AVL.' || u === 'ITEM OUTPHASED' || u === 'NONE') return [];
    var base = idx.MPN.get(u) || (ambiguousCode(idx, code) ? null : idx.MPNn.get(norm(code))) || []; var out = [], seen = new Set();
    for (var i = 0; i < base.length; i++) {
      var mat = base[i]; if (seen.has(mat)) continue; seen.add(mat); var rec = idx.MAT.get(mat); out.push(rec);
      var t = seeRef(rec.desc); if (t && idx.MAT.has(t) && !seen.has(t)) { seen.add(t); out.push(idx.MAT.get(t)); }
    }
    return out;
  }
  function resolveU(idx, vpns) {
    var mats = [], seen = new Set();
    for (var i = 0; i < vpns.length; i++) { var L = lookup(idx, vpns[i]); for (var j = 0; j < L.length; j++) { if (!seen.has(L[j].material)) { seen.add(L[j].material); mats.push(L[j]); } } }
    return mats;
  }
  // v1.1.1 — sums of the ROUNDED per-material numbers, so a headline always equals the detail rows under it
  function sumf(mats, k) { return mats.reduce(function (a, m) { return a + Math.round(m[k] || 0); }, 0); }
  // Bench states from cover after inbound. v1.0.1 (operator, 2026-09-26): zero stock with no demand is
  // No spare, not Short; Short needs demand (reserved) that the shelf + inbound cannot meet.
  // (V3 netStatus had `supply <= 0 || net < 0` -> short.)
  function netStatus(soh, tr, po, rs, has) {
    if (!has) return 'notsap'; var net = soh + tr + po - rs;
    if (net < 0) return 'short'; if (net === 0) return 'nospare'; return 'spare';
  }
  function catOf(pn) { pn = ('' + pn).trim().toUpperCase(); if (/-EXC$/.test(pn)) return 'EXC'; if (/^\d+R\d+$/.test(pn)) return 'REMAN'; return 'NEW'; }
  function keptMats(mats) {
    var kept = [], seen = {};
    for (var k = 0; k < mats.length; k++) {
      var mm = mats[k]; if (seen[mm.material]) continue; seen[mm.material] = 1;
      // v1.1.1 — a reservation counts too: a "SEE" placeholder holding only a reservation stays listed (its reservation is in the headline)
      var isSee = ('' + mm.desc).toUpperCase().indexOf('SEE') >= 0; var hasStock = (mm.soh > 0 || mm.transit > 0 || mm.po > 0 || mm.res > 0);
      if (isSee && !hasStock) continue; kept.push(mm);
    }
    return kept;
  }
  function mrpStr(idx, vpn, mats) {
    var m = lookup(idx, vpn); var r = m.length ? m[0] : ((mats && mats.length) ? mats[0] : null); if (!r) return '—'; var t = ('' + r.mrp).trim().toUpperCase();
    if (!t) return '—'; if (t === 'PD') return 'PD-' + Math.round(r.ss); if (t[0] === 'V') return t + '-' + Math.round(r.mn) + '-' + Math.round(r.mx);
    return t + '-' + Math.round(r.mn) + '-' + Math.round(r.mx) + '-' + Math.round(r.ss);
  }
  function detailRow(mm, grp) { var d = { sap: mm.material, desc: ('' + mm.desc), vpn: mm.mpn, cat: catOf(mm.mpn), qoh: Math.round(mm.soh), qoo: Math.round(mm.po), qit: Math.round(mm.transit), rsrv: Math.round(mm.res) }; if (grp != null) d.grp = grp; return d; }
  // One pocket's stock position (V3 compute()). v1.1.1: an assembly counts COMPLETE KITS — one of every sub-part group.
  // The headline is the binding group's own numbers (least cover after inbound; ties: least on the shelf), so it
  // equals that group's subtotal. V3 took the minimum of each quantity separately and summed reserved over all
  // groups, which no set of detail rows added up to (DI650i Rotary Head: headline 1, rows 2).
  function pocketStock(idx, p) {
    var mats = resolveU(idx, p.vpns || []), s;
    if (p.groups && p.groups.length) {
      var gl = p.groups.map(function (g, i) {
        var gm = resolveU(idx, g), o = { i: i, vpns: g, soh: sumf(gm, 'soh'), tr: sumf(gm, 'transit'), po: sumf(gm, 'po'), res: sumf(gm, 'res'), n: gm.length };
        o.net = o.soh + o.tr + o.po - o.res; o.rows = keptMats(gm).map(function (mm) { return detailRow(mm, i); }); return o;
      });
      var bind = gl.slice().sort(function (a, b) { return (a.net - b.net) || (a.soh - b.soh) || (a.i - b.i); })[0];
      s = { soh: bind.soh, tr: bind.tr, po: bind.po, res: bind.res, assembly: true, bind: bind.i,
            groups: gl.map(function (o) { return { i: o.i, vpns: o.vpns, soh: o.soh, tr: o.tr, po: o.po, res: o.res, net: o.net, n: o.n }; }) };
      s.detail = [].concat.apply([], gl.map(function (o) { return o.rows; }));
    } else {
      s = { soh: sumf(mats, 'soh'), tr: sumf(mats, 'transit'), po: sumf(mats, 'po'), res: sumf(mats, 'res') };
      s.detail = keptMats(mats).map(function (mm) { return detailRow(mm); });
    }
    s.status = netStatus(s.soh, s.tr, s.po, s.res, mats.length > 0);
    s.net = s.soh + s.tr + s.po - s.res;
    s.ambiguous = (p.vpns || []).filter(function (v) { return ambiguousCode(idx, v); });
    s.types = ['NEW', 'EXC', 'REMAN'].filter(function (t) { return s.detail.some(function (d) { return d.cat === t && (d.qoh + d.qoo + d.qit) > 0; }); });
    s.saps = mats.map(function (mm) { return sapKey(mm.material); });
    s.mrp = mrpStr(idx, p.vpn, mats);
    return s;
  }

  // ── reading the file (SheetJS, loaded on first use — Lens doesn't pay for it until Bench needs it) ──
  function ensureXLSX() {
    if (root.XLSX) return Promise.resolve(root.XLSX);
    function load(src) {
      return new Promise(function (ok, bad) { var sc = document.createElement('script'); sc.src = src; sc.onload = function () { root.XLSX ? ok(root.XLSX) : bad(new Error('SheetJS did not initialise')); }; sc.onerror = function () { bad(new Error('could not load ' + src)); }; document.head.appendChild(sc); });
    }
    return load(XLSX_LOCAL).catch(function () { return load(XLSX_CDN); });
  }
  function readInvMstrFile(file) {
    return ensureXLSX().then(function (X) {
      return file.arrayBuffer().then(function (buf) {
        var wb = X.read(new Uint8Array(buf), { type: 'array', dense: true });
        for (var s = 0; s < wb.SheetNames.length; s++) {
          var rr = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[s]], { header: 1, raw: true, defval: '' });
          var k = headerAt(rr);
          if (k >= 0) { var idx = buildIndex(rr.slice(k)); return { idx: idx, sheet: wb.SheetNames[s] }; }
        }
        throw new Error('no sheet has both a Material and a Manufacturer Part No. column (checked ' + wb.SheetNames.length + ' sheet(s): ' + wb.SheetNames.join(', ') + ')');
      });
    });
  }
  function ingestFile(file) {
    S.busy = 'Reading ' + file.name + ' … a full INV_MSTR takes up to half a minute';
    rerender();
    setTimeout(function () {
      readInvMstrFile(file).then(function (res) {
        if (res.idx.nmat === 0) throw new Error('0 material rows found under those headers');
        var nameDate = dateFromFileName(file.name);
        if (nameDate && daysSince(nameDate) > STOCK_AGE.refuse) {   // v1.1.0 — nothing older than 30 days is loaded
          S.busy = ''; toast('INV_MSTR not loaded — it is dated ' + fmtDate(nameDate) + ', ' + daysSince(nameDate) + ' days old. Nothing older than ' + STOCK_AGE.refuse + ' days is loaded: export a fresh one.', 'error'); rerender(); return;
        }
        S.prev = S.stock ? { idx: S.idx, stock: S.stock } : null;
        S.idx = res.idx;
        S.stock = { fileName: file.name, sheet: res.sheet, dataAsOf: nameDate, method: nameDate ? 'file name' : 'unknown',
                    loadedAt: new Date(), materials: res.idx.nmat, ledger: res.idx.ledger, lastModified: file.lastModified || 0 };
        S.askDate = !nameDate;
        S.busy = '';
        toast('INV_MSTR loaded — ' + res.idx.nmat.toLocaleString() + ' materials' + (nameDate ? ' · stock ' + fmtDate(nameDate) : ' · stock date needed'), nameDate ? 'success' : 'warn');
        rerender();
      }).catch(function (e) {
        S.busy = '';
        toast('INV_MSTR not loaded — ' + e.message, 'error');
        rerender();
      });
    }, 30);
  }
  // v1.1.1 — the remembered file link ("⛓ Link file", from Critical Spares V3) is gone: the client folder replaced it.

  // ── Lens side ─────────────────────────────────────────────────────────────
  function benchDef() { var r = S.host && S.host.raw; return (r && r.bench && Array.isArray(r.bench.models)) ? r.bench : null; }
  function fleetModelComps(fleet, model, units) {
    var fd = S.host.fleetData || {}, out = [];
    var fk = Object.keys(fd).find(function (f) { return f.toUpperCase() === String(fleet).toUpperCase(); }); if (!fk) return out;
    var mk = Object.keys(fd[fk]).find(function (m) { return m.toUpperCase() === String(model).toUpperCase(); }); if (!mk) return out;
    var want = units ? new Set(units.map(function (u) { return String(u).toUpperCase(); })) : null;
    Object.keys(fd[fk][mk]).forEach(function (u) {
      if (want && !want.has(u.toUpperCase())) return;
      (fd[fk][mk][u] || []).forEach(function (c) { var o = Object.assign({ unit: u }, c); if (lensHidden(fk, mk, u, c.component)) o._hidden = true; out.push(o); });   // v1.3.0 + _hidden
    });
    return out;
  }
  // v1.3.0 — hidden components: Lens's (right-click in Lens) and Bench rows (right-click here), both kept by the host
  function lensHidden(f, m, u, c) { try { return !!(S.host && S.host.isHidden && S.host.isHidden(f, m, u, c)); } catch (e) { return false; } }
  function benchHiddenList() { try { if (S.host && S.host.benchHidden) return S.host.benchHidden() || []; } catch (e) {} return S.bhLocal || (S.bhLocal = []); }
  function setBenchHiddenList(list) { if (S.host && S.host.setBenchHidden) S.host.setBenchHidden(list); else S.bhLocal = list; }
  function hiddenPocketSet(key) { var o = {}; benchHiddenList().forEach(function (h) { if (h.model === key) o[h.pid] = h; }); return o; }
  function modelUnits(m) {
    var fd = S.host.fleetData || {};
    var fk = Object.keys(fd).find(function (f) { return f.toUpperCase() === String(m.lens.fleet).toUpperCase(); });
    var mk = fk && Object.keys(fd[fk]).find(function (x) { return x.toUpperCase() === String(m.lens.model).toUpperCase(); });
    var all = mk ? Object.keys(fd[fk][mk]).sort() : [];
    return m.lens.units ? all.filter(function (u) { return m.lens.units.map(function (x) { return x.toUpperCase(); }).indexOf(u.toUpperCase()) >= 0; }) : all;
  }
  var STOP = { LEFT: 1, RIGHT: 1, FRONT: 1, REAR: 1, LH: 1, RH: 1, L: 1, R: 1, CYL: 1, CYLINDER: 1, GP: 1, GROUP: 1, ASSY: 1, ASSEMBLY: 1, AND: 1, THE: 1 };
  var POSN = { FRONT: 'F', REAR: 'R', LEFT: 'L', LH: 'L', RIGHT: 'R', RH: 'R' };
  function toks(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean); }
  function sig(s) { return toks(s).map(function (t) { return t === 'SUSP' ? 'SUSPENSION' : t; }).filter(function (t) { return !STOP[t]; }); }
  function posOf(s) { var p = {}; toks(s).forEach(function (t) { if (t === 'FRONT' || t === 'REAR') p.fr = t; if (POSN[t] === 'L' || POSN[t] === 'R') { if (t !== 'REAR') p.lr = POSN[t]; } }); return p; }
  // v1.1.1 — display names. V3's split continuation rows were seeded with their "↳" arrow in the name;
  // the arrow is drawn by the table now, never stored text.
  function baseName(p) { return String(p.component || '').replace(/^\s*↳\s*/, ''); }
  // v1.1.1 — split families: V3 gave each part number of a split component its own row (pocket). The first
  // pocket carries p.split {reason, variants[{vpn, units}]}; the ↳ pockets that follow are its other part numbers.
  var SPLIT_WHY = {
    multiple: 'Different parts, all required (e.g. left / right, or different positions): each part number is stocked and counted on its own row.',
    supersession: 'Supersession: a later part number replaces an earlier one. Each number still has its own row, as in Critical Spares V3.'
  };
  function families(m) {
    var fam = {}, head = null, seq = 0;
    m.pockets.forEach(function (p) {
      if (p.split && p.split.variants && p.split.variants.length) {
        head = p; seq = 1; var v0 = p.split.variants.find(function (sv) { return sv.vpn === p.vpn; }) || p.split.variants[0];
        fam[p.id] = { head: p.id, n: 1, of: p.split.variants.length, units: v0.units || [], reason: p.split.reason || 'multiple', first: true };
        return;
      }
      var cont = /^\s*↳/.test(p.component || '');
      var sv = cont && head ? head.split.variants.find(function (x, i) { return i > 0 && x.vpn === p.vpn; }) : null;
      if (sv) { seq++; fam[p.id] = { head: head.id, n: seq, of: head.split.variants.length, units: sv.units || [], reason: head.split.reason || 'multiple', first: false }; }
      else if (!cont) head = null;
    });
    return fam;
  }
  // v1.1.1 — a name that repeats within a model (DI650i "Hydraulic Cylinder, Double-Acting" ×5) carries its location,
  // then its part number if the location repeats too. Split ↳ rows share their first row's name on purpose.
  function labels(m, fam) {
    var byName = {}, out = {};
    m.pockets.forEach(function (p) { if (fam[p.id] && !fam[p.id].first) return; var k = baseName(p).toLowerCase(); (byName[k] = byName[k] || []).push(p); });
    Object.keys(byName).forEach(function (k) {
      var ps = byName[k];
      ps.forEach(function (p) {
        var lbl = baseName(p);
        if (ps.length > 1) {
          var loc = String(p.location || '').replace(/\s+/g, ' ').trim();
          var sameLoc = ps.filter(function (q) { return String(q.location || '').replace(/\s+/g, ' ').trim().toLowerCase() === loc.toLowerCase(); }).length > 1;
          lbl += loc ? ' · ' + loc : ''; if (sameLoc || !loc) lbl += ' · ' + p.vpn;
        }
        out[p.id] = lbl;
      });
    });
    m.pockets.forEach(function (p) { if (!out[p.id]) out[p.id] = out[fam[p.id] && fam[p.id].head] || baseName(p); });
    return out;
  }
  // Build the per-model view: stock per pocket (if loaded) + Lens components joined to pockets
  function modelView(m) {
    var fam = families(m), lbl = labels(m, fam);
    var pockets = m.pockets.map(function (p) {
      var st = S.idx ? pocketStock(S.idx, p) : null;
      var keys = new Set((p.vpns || []).map(joinKey));
      (p.groups || []).forEach(function (g) { g.forEach(function (v) { keys.add(joinKey(v)); }); });
      return { p: p, st: st, keys: keys, saps: st ? new Set(st.saps) : new Set(), lens: [], fam: fam[p.id] || null, label: lbl[p.id] };
    });
    var comps = fleetModelComps(m.lens.fleet, m.lens.model, m.lens.units);
    var groups = {};
    comps.forEach(function (c) { (groups[c.component] = groups[c.component] || []).push(c); });
    var unmatched = [], hiddenLens = [];
    Object.keys(groups).sort().forEach(function (name) {
      var cs = groups[name], c0 = cs.find(function (c) { return c.mm_number || c.part_number; }) || cs[0];
      var hit = null, how = '', pnHit = '';
      // v1.2.0 — every unit's SAP number, then every unit's part number (v1.1.x tried only the FIRST unit's, so the 775G
      // Left Hoist stayed unlinked although TD404's 2960738 is in the pocket). Most common numbers are tried first.
      var uniq = function (k, keyFn) { var n = {}; cs.forEach(function (c) { var v = String(c[k] || '').trim(); if (v && keyFn(v)) n[v] = (n[v] || 0) + 1; }); return Object.keys(n).sort(function (a, b) { return n[b] - n[a]; }); };
      if (S.idx) uniq('mm_number', sapKey).some(function (mm) { hit = pockets.find(function (x) { return x.saps.has(sapKey(mm)); }); if (hit) how = 'SAP number ' + mm; return !!hit; });
      if (!hit) uniq('part_number', joinKey).some(function (pn) { hit = pockets.find(function (x) { return x.keys.has(joinKey(pn)); }); if (hit) { how = 'part number ' + pn; pnHit = pn; } return !!hit; });
      var pcts = cs.map(function (c) { return c.pct; }).filter(function (v) { return v != null; });
      var dues = cs.map(function (c) { return c.pred_changeout; }).filter(Boolean).map(function (d) { return String(d).slice(0, 10); }).sort();
      var rec = { name: name, n: cs.length, worst: pcts.length ? Math.max.apply(null, pcts) : null, due: dues[0] || null,
                  pn: pnHit || c0.part_number || '', mm: c0.mm_number || '', how: how, units: cs.map(function (c) { return c.unit; }) };
      // v1.1.2 — every part number Lens holds for this component, with its units (shown when it doesn't match a pocket)
      rec.pnc = {}; cs.forEach(function (c) { var k = String(c.part_number || '').trim() || '(none)', e = rec.pnc[k] || (rec.pnc[k] = { n: 0, units: [], mm: {} }); e.n++; e.units.push(c.unit); if (c.mm_number) e.mm[String(c.mm_number).trim()] = 1; });
      if (hit) { hit.lens.push(rec); return; }
      // v1.3.0 — a component hidden in Lens (every unit of it) is left out of "not matched" and the suggestions
      if (cs.every(function (c) { return c._hidden; })) { hiddenLens.push(name); return; }
      // a name may SUGGEST a pocket (shown as a check, never counted as a match)
      var cs0 = sig(name), cp = posOf(name), best = null, bestScore = 0;
      pockets.forEach(function (x) {
        var ps = sig(x.p.component); if (!ps.length) return;
        var overlap = ps.filter(function (t) { return cs0.indexOf(t) >= 0; }).length;
        if (overlap < ps.length) return;                            // every significant word of the pocket name must appear
        var pp = posOf(x.p.component);
        if (pp.fr && cp.fr && pp.fr !== cp.fr) return;               // front/rear must agree when both say
        if (pp.lr && cp.lr && pp.lr !== cp.lr) return;               // left/right likewise
        var score = overlap * 10 + (pp.fr && cp.fr ? 2 : 0) + (pp.lr && cp.lr ? 1 : 0);
        if (score > bestScore) { bestScore = score; best = x; }
      });
      rec.hint = best ? best.p : null;
      unmatched.push(rec);
    });
    // v1.3.0 — rows hidden on this model leave the board, table, tiles and counts (the Lens join above used every row)
    var hp = hiddenPocketSet(m.key);
    return { m: m, pockets: pockets.filter(function (x) { return !hp[x.p.id]; }), hiddenPockets: pockets.filter(function (x) { return hp[x.p.id]; }), allPockets: pockets,
             unmatched: unmatched, hiddenLens: hiddenLens, units: modelUnits(m), comps: comps.length };
  }
  function lensModelsNotInReview() {
    var def = benchDef(), fd = S.host.fleetData || {}, out = [];
    Object.keys(fd).sort().forEach(function (f) {
      Object.keys(fd[f]).sort().forEach(function (mo) {
        var units = Object.keys(fd[f][mo]);
        var covered = new Set();
        (def ? def.models : []).forEach(function (m) {
          if (m.lens.fleet.toUpperCase() !== f.toUpperCase() || m.lens.model.toUpperCase() !== mo.toUpperCase()) return;
          if (!m.lens.units) units.forEach(function (u) { covered.add(u); }); else m.lens.units.forEach(function (u) { covered.add(String(u).toUpperCase()); });
        });
        var gap = units.filter(function (u) { return !covered.has(u) && !covered.has(u.toUpperCase()); }).sort();
        if (gap.length) out.push({ fleet: f, model: mo, units: gap, partial: gap.length < units.length, comps: gap.reduce(function (s, u) { return s + (fd[f][mo][u] || []).length; }, 0) });
      });
    });
    return out;
  }

  // ── rendering ─────────────────────────────────────────────────────────────
  var ST = {
    spare: { w: 'Spare', c: 'var(--ncb-spare)' }, nospare: { w: 'No spare', c: 'var(--ncb-nospare)' },
    short: { w: 'Short', c: 'var(--ncb-short)' }, notsap: { w: 'Not in SAP', c: 'var(--ncb-notsap)' },
    notin: { w: 'Not in review', c: 'var(--ncb-notin)' }, nostock: { w: 'No stock data', c: 'var(--ncb-notin)' }
  };
  function badge(k) { return '<span class="ncb-st" style="--c:' + ST[k].c + '"><i></i>' + ST[k].w + '</span>'; }
  function toast(msg, sev) { if (S.host && S.host.toast) S.host.toast(msg, sev); }
  function stockAgeClass() { if (!S.stock) return 'none'; if (!S.stock.dataAsOf) return 'red'; var d = daysSince(S.stock.dataAsOf); return d > STOCK_AGE.refuse ? 'expired' : d > STOCK_AGE.red ? 'red' : d > STOCK_AGE.amber ? 'amber' : 'ok'; }

  function injectStyle() {
    if (document.getElementById('ncb-style')) return;
    var st = document.createElement('style'); st.id = 'ncb-style';
    st.textContent = [
      '.ncb{--ncb-accent:#5FA8E0;--ncb-spare:var(--nc-ok,#34D399);--ncb-nospare:var(--nc-warn,#FBBF24);--ncb-short:#F97316;--ncb-notsap:var(--nc-crit,#EF4444);--ncb-notin:#8B8FA3;',
      ' display:flex;width:100%;height:100%;min-height:0;font-family:var(--nc-font-body,Barlow,sans-serif);color:var(--nc-text,#E8E9ED);font-size:13.5px;line-height:1.5}',
      '.ncb *{box-sizing:border-box}',
      '.ncb-list{width:260px;flex:none;border-right:1px solid var(--nc-border,#2A2D3A);background:var(--nc-surface,#080C14);overflow-y:auto;padding:10px 8px 24px}',
      '.ncb-grp{font-family:var(--nc-font-mono,monospace);font-size:9.5px;letter-spacing:1.6px;color:var(--nc-text-d,#5C6078);text-transform:uppercase;margin:14px 6px 6px;display:flex;justify-content:space-between}',
      '.ncb-mi{padding:7px 10px;border-radius:6px;border:1px solid transparent;margin-bottom:3px;cursor:pointer}',
      '.ncb-mi:hover{background:rgba(255,255,255,.03)}.ncb-mi.on{border-color:rgba(95,168,224,.5);background:rgba(95,168,224,.09)}',
      '.ncb-mi b{font-family:var(--nc-font-head,Rajdhani);font-weight:600;font-size:14.5px;display:flex;justify-content:space-between;align-items:baseline;gap:6px}',
      '.ncb-mi b small{font-family:var(--nc-font-mono);font-size:10px;font-weight:400;color:var(--nc-text-d)}',
      '.ncb-mi>span{display:block;font-size:11.5px;color:var(--nc-text-m,#8B8FA3)}',   /* v1.1.2 — ">" : the line only; its coloured pieces stay inline (they stacked, with a lone "·" between) */
      '.ncb-bar{display:flex;height:4px;border-radius:2px;overflow:hidden;margin-top:5px;background:rgba(255,255,255,.05)}.ncb-bar i{display:block;height:100%}',
      '.ncb-mi.gap b{color:var(--nc-text-m);font-weight:500;font-size:13.5px}',
      '.ncb-main{flex:1;min-width:0;overflow-y:auto;padding:16px 22px 60px}',
      '.ncb-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}',
      '.ncb-eyebrow{font-family:var(--nc-font-mono);font-size:10px;letter-spacing:2px;color:rgba(95,168,224,.85);text-transform:uppercase}',
      '.ncb-chip{font-family:var(--nc-font-mono);font-size:11px;padding:3px 10px;border-radius:999px;border:1px solid var(--nc-border);color:var(--nc-text-m);white-space:nowrap}',
      '.ncb-chip.ok{border-color:rgba(52,211,153,.4);color:#a7f3d0}.ncb-chip.amber{border-color:rgba(251,191,36,.5);color:#fde68a;background:rgba(251,191,36,.07)}.ncb-chip.red{border-color:rgba(239,68,68,.5);color:#fca5a5;background:rgba(239,68,68,.08)}',
      '.ncb-btn{font-family:var(--nc-font-head,Rajdhani);font-weight:600;font-size:13px;padding:4px 12px;border-radius:4px;border:1px solid rgba(95,168,224,.45);color:var(--ncb-accent);background:transparent;cursor:pointer}',
      '.ncb-btn:hover{background:rgba(95,168,224,.1)}.ncb-btn.solid{background:var(--ncb-accent);color:#06121e;border-color:var(--ncb-accent)}.ncb-btn.ghost{border-color:var(--nc-border);color:var(--nc-text-m)}',
      '.ncb-spacer{flex:1}',
      'h1.ncb-h{font-family:var(--nc-font-display,"Barlow Condensed");font-weight:700;font-size:40px;letter-spacing:3px;text-transform:uppercase;margin:0;line-height:1.05}',
      '.ncb-sub{color:var(--nc-text-m);font-size:13px}',
      '.ncb-banner{margin:10px 0;padding:9px 14px;border-radius:8px;border:1px solid;font-size:13px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}',
      '.ncb-banner.red{border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.06);color:#fecaca}.ncb-banner.amber{border-color:rgba(251,191,36,.4);background:rgba(251,191,36,.06);color:#fde68a}.ncb-banner.info{border-color:rgba(95,168,224,.4);background:rgba(95,168,224,.06);color:#cfe3f5}',
      '.ncb-banner input[type=date]{background:var(--nc-void,#0A0D1A);border:1px solid var(--nc-border);color:var(--nc-text);border-radius:4px;padding:3px 6px;font-size:12px}',
      '.ncb-tiles{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:10px 0 6px}',
      '.ncb-tile{border:1px solid var(--nc-border);border-radius:10px;padding:8px 12px;background:var(--nc-surface);text-align:center}',
      '.ncb-tile .k{font-family:var(--nc-font-mono);font-size:10px;letter-spacing:1.3px;text-transform:uppercase;display:flex;gap:6px;align-items:center;justify-content:center}',
      '.ncb-tile .v{font-family:var(--nc-font-mono);font-size:24px;font-weight:500;line-height:1.25}.ncb-tile .d{font-size:11px;color:var(--nc-text-m)}',
      '.ncb-dot,.ncb-st i{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none;background:currentColor;box-shadow:0 0 6px currentColor}',
      '.ncb-st{--c:#888;color:var(--c);font-family:var(--nc-font-mono);font-size:10.5px;letter-spacing:1px;text-transform:uppercase;display:inline-flex;gap:6px;align-items:center;padding:2px 8px;border-radius:4px;white-space:nowrap;background:color-mix(in srgb,var(--c) 12%,transparent);border:1px solid color-mix(in srgb,var(--c) 38%,transparent)}',
      '.ncb-rule{font-size:12px;color:var(--nc-text-m);margin:4px 0 10px}.ncb-rule b{color:var(--nc-text);font-weight:600}',
      '.ncb-filters{display:flex;gap:6px;margin:8px 0}',
      '.ncb-fb{font-family:var(--nc-font-head);font-weight:600;font-size:13px;padding:4px 12px;border-radius:4px;border:1px solid var(--nc-border);color:var(--nc-text-m);background:transparent;cursor:pointer}.ncb-fb.on{border-color:rgba(95,168,224,.55);color:var(--ncb-accent);background:rgba(95,168,224,.09)}',
      /* tables — operator rule 2026-09-26: data columns centred (header + cells); only name/description columns left */
      '.ncb table{width:100%;border-collapse:collapse}',
      '.ncb-tscroll{width:100%;overflow-x:auto}.ncb-tscroll>table{min-width:980px}',
      '.ncb th{font-family:var(--nc-font-head);font-weight:600;font-size:11.5px;letter-spacing:.8px;text-transform:uppercase;color:var(--nc-text-m);text-align:center;padding:7px 8px;border-bottom:1px solid var(--nc-border);background:rgba(255,255,255,.02);white-space:nowrap}',
      '.ncb td{padding:8px;border-bottom:1px solid rgba(42,45,58,.6);vertical-align:middle;text-align:center}',
      '.ncb th.l,.ncb td.l{text-align:left}',
      '.ncb td.n{font-family:var(--nc-font-mono);font-size:13px}',
      '.ncb tr.ncb-row{cursor:pointer}.ncb tr.ncb-row:hover td{background:rgba(95,168,224,.04)}',
      '.ncb-cname{font-family:var(--nc-font-head);font-weight:600;font-size:14.5px}',
      '.ncb-meta{font-family:var(--nc-font-mono);font-size:9.5px;letter-spacing:.6px;color:var(--nc-text-d);text-transform:uppercase}',
      '.ncb-lens{font-size:12px;color:var(--nc-text-m)}.ncb-how{font-family:var(--nc-font-mono);font-size:10px;color:var(--nc-text-d)}',
      '.ncb-warn{font-size:12px;color:#fdba74}',
      '.ncb-net{font-family:var(--nc-font-mono);font-size:13px;font-weight:600}',
      '.ncb-pill{font-family:var(--nc-font-mono);font-size:9.5px;padding:1px 6px;border-radius:3px;margin:0 2px;border:1px solid;display:inline-block}',
      '.ncb-pill.NEW{color:#a7f3d0;border-color:rgba(52,211,153,.4)}.ncb-pill.EXC{color:#fde68a;border-color:rgba(251,191,36,.4)}.ncb-pill.REMAN{color:#c4b5fd;border-color:rgba(155,151,232,.5)}',
      /* v1.1.2 — the open row and its detail rows: one tint, one status-coloured bar down the left, a tree connector */
      '.ncb tr.ncb-row.open td{background:rgba(95,168,224,.08);border-bottom-color:transparent}',
      '.ncb tr.ncb-row.open td:first-child,.ncb tr.ncb-drow td:first-child{box-shadow:inset 3px 0 0 var(--bar,#5FA8E0)}',
      '.ncb tr.ncb-drow td{background:rgba(95,168,224,.035);padding:5px 8px;font-size:12.5px;border-bottom:1px solid rgba(42,45,58,.35)}',
      '.ncb tr.ncb-drow td.n{font-family:var(--nc-font-mono);font-size:12.5px}.ncb td.ncb-dim{color:var(--nc-text-m)}',
      '.ncb-tree{display:inline-block;width:16px;height:12px;margin-left:34px;border-left:1px solid color-mix(in srgb,var(--bar,#5FA8E0) 70%,transparent);border-bottom:1px solid color-mix(in srgb,var(--bar,#5FA8E0) 70%,transparent);vertical-align:4px}',
      '.ncb-ddesc{color:var(--nc-text-m);font-size:12px}',
      '.ncb-mis{border:1px solid rgba(249,115,22,.35);background:rgba(249,115,22,.05);border-radius:8px;padding:9px 12px;margin:0 0 10px;font-size:12.5px;max-width:1100px}',
      '.ncb tr.ncb-dgrp td{font-family:var(--nc-font-mono);font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#9ccbf0;background:rgba(95,168,224,.06)}',
      '.ncb tr.ncb-dsub td{font-weight:600;color:var(--nc-text)}.ncb tr.ncb-dsub.bind td{color:var(--ncb-accent)}',
      '.ncb tr.ncb-dnote td{text-align:left;padding:8px 14px 14px 12px;border-bottom:1px solid color-mix(in srgb,var(--bar,#5FA8E0) 45%,transparent)}',
      '.ncb table.ncb-sumtbl{table-layout:fixed}.ncb table.ncb-sumtbl th{white-space:normal;vertical-align:bottom;line-height:1.25}.ncb table.ncb-sumtbl td{overflow-wrap:anywhere}',
      /* v1.1.2 — V3 sizes: the board is never scaled above its 1520 px design size, and the page is one centred column */
      '.ncb-col{max-width:1520px;margin:0 auto}',
      '.ncb-stmt{font-size:14px;margin-bottom:8px}.ncb-stmt b{font-weight:600}',
      '.ncb table.ncb-mats{max-width:1000px}.ncb table.ncb-mats th{font-family:var(--nc-font-mono);font-size:9.5px;letter-spacing:1px;color:var(--nc-text-d)}.ncb table.ncb-mats td{font-size:12.5px;padding:5px 8px}',
      '.ncb-mono{font-family:var(--nc-font-mono);font-size:12px}',
      '.ncb-note{font-size:11.5px;color:var(--nc-text-m);margin-top:6px}',
      '.ncb-panel{margin-top:22px;border:1px solid rgba(249,115,22,.3);border-radius:12px;padding:12px 16px;background:rgba(249,115,22,.03)}',
      '.ncb-panel h3{font-family:var(--nc-font-head);font-weight:600;font-size:16.5px;margin:0 0 4px}.ncb-panel p{margin:0 0 8px;font-size:12.5px;color:var(--nc-text-m)}',
      '.ncb-empty{max-width:720px;margin:40px auto;text-align:center;color:var(--nc-text-m)}.ncb-empty h2{font-family:var(--nc-font-display);letter-spacing:2px;text-transform:uppercase;color:var(--nc-text);margin:0 0 8px}',
      /* board — V3 layout in a 1520 x 860 virtual space, scaled to the panel width */
      '.ncb-boardwrap{position:relative;width:100%;overflow:hidden;margin:8px 0 14px;border:1px solid rgba(95,168,224,.18);border-radius:12px;background:radial-gradient(ellipse at 50% 46%,rgba(95,168,224,.08),transparent 65%),var(--nc-void,#0A0D1A)}',
      '.ncb-board{position:absolute;left:0;top:0;width:1520px;height:860px;transform-origin:0 0}',
      '.ncb-board img.mach{position:absolute;opacity:.95}',
      '.ncb-board svg{position:absolute;left:0;top:0;width:1520px;height:860px;pointer-events:none}',
      '.ncb-card{position:absolute;width:248px;min-height:104px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(10,13,26,.92);overflow:hidden;cursor:pointer}',
      '.ncb-card:hover{border-color:rgba(95,168,224,.6)}',
      '.ncb-card .acc{height:3px}.ncb-card .in{padding:9px 13px 10px}',
      '.ncb-card .nm{font-family:var(--nc-font-head);font-weight:600;font-size:19px;line-height:1.2;margin:5px 0 1px}',
      '.ncb-card .pn{font-family:var(--nc-font-mono);font-size:11.5px;color:var(--nc-text-d)}',
      '.ncb-card .q{font-family:var(--nc-font-mono);font-size:11.5px;margin-top:3px}',
      '.ncb-hero{position:absolute;left:40px;top:34px;width:370px;padding:14px 18px;border:1px solid rgba(95,168,224,.25);border-top:3px solid var(--ncb-accent);border-radius:8px;background:rgba(10,13,26,.9)}',
      '.ncb-hero .b{font-family:var(--nc-font-mono);font-size:12px;letter-spacing:3px;color:rgba(95,168,224,.85)}',
      '.ncb-hero .m{font-family:var(--nc-font-display);font-weight:700;font-size:54px;letter-spacing:2px;line-height:1.05}',
      '.ncb-hero .c{font-family:var(--nc-font-mono);font-size:12px;letter-spacing:1.5px;color:var(--nc-text-m);text-transform:uppercase}',
      '.ncb-hero .u{font-family:var(--nc-font-mono);font-size:13px;color:var(--nc-text);margin-top:8px}',
      '.ncb-legend{position:absolute;right:40px;top:34px;font-family:var(--nc-font-mono);font-size:12px;line-height:1.9;text-align:right;color:var(--nc-text-m)}',
      '.ncb-legend div{display:flex;gap:8px;align-items:center;justify-content:flex-end}.ncb-legend i{width:10px;height:10px;border-radius:2px;display:inline-block}',
      /* v1.1.1 — split families, unit chips, assembly groups, the ⋯ menu; hover + keyboard focus (UI audit BEN-06) */
      '.ncb-fb:hover{border-color:rgba(95,168,224,.4);color:var(--nc-text)}',
      '.ncb-tile.aside{border-style:dashed;background:transparent;margin-left:10px}',
      /* UI audit BEN-04 / BEN-05 — readable group headers; models outside the review dimmed */
      '.ncb-grp{font-size:10.5px;font-weight:600;color:var(--nc-text-m);border-bottom:1px solid var(--nc-border);padding-bottom:4px}',
      '.ncb-mi.gap{opacity:.62}.ncb-mi.gap:hover,.ncb-mi.gap.on{opacity:1}',
      '.ncb button:focus-visible,.ncb summary:focus-visible,.ncb [data-model]:focus-visible,.ncb tr.ncb-row:focus-visible{outline:2px solid var(--ncb-accent);outline-offset:2px}',
      '.ncb-uchip{font-family:var(--nc-font-mono);font-size:10px;padding:0 6px;border-radius:3px;border:1px solid rgba(95,168,224,.35);color:#9ccbf0;margin-left:4px;white-space:nowrap;display:inline-block;line-height:16px}',
      '.ncb-why{font-family:var(--nc-font-mono);font-size:9.5px;color:#9ccbf0;border:1px solid rgba(95,168,224,.35);border-radius:50%;width:15px;height:15px;display:inline-flex;align-items:center;justify-content:center;margin-left:6px;cursor:help;vertical-align:1px}',
      '.ncb tr.ncb-fam td{border-bottom-color:transparent}',
      '.ncb tr.ncb-cont td{background:rgba(95,168,224,.025)}.ncb tr.ncb-cont .ncb-cname{font-weight:500;font-size:13.5px;color:var(--nc-text-m)}',
      '.ncb-arrow{color:rgba(95,168,224,.7);margin-right:6px;font-family:var(--nc-font-mono)}',
      '.ncb table.ncb-mats tr.ncb-grp td{font-family:var(--nc-font-mono);font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#9ccbf0;background:rgba(95,168,224,.05);text-align:left;padding:6px 8px}',
      '.ncb table.ncb-mats tr.ncb-sub td{font-weight:600;border-bottom:1px solid var(--nc-border);color:var(--nc-text)}.ncb table.ncb-mats tr.ncb-sub.bind td{color:var(--ncb-accent)}',
      '.ncb-kit{font-family:var(--nc-font-mono);font-size:9.5px;color:var(--nc-text-d);display:block;line-height:1.1}',
      '.ncb-more{position:relative}.ncb-more>summary{list-style:none;cursor:pointer;font-family:var(--nc-font-head);font-weight:700;font-size:15px;line-height:1;padding:5px 11px;border-radius:4px;border:1px solid var(--nc-border);color:var(--nc-text-m)}.ncb-more>summary::-webkit-details-marker{display:none}.ncb-more[open]>summary,.ncb-more>summary:hover{border-color:rgba(95,168,224,.55);color:var(--ncb-accent)}',
      '.ncb-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:30;min-width:280px;padding:6px;border:1px solid var(--nc-border);border-radius:8px;background:var(--nc-chrome,#14161D);box-shadow:0 10px 28px rgba(0,0,0,.45)}',
      '.ncb-menu button{display:block;width:100%;text-align:left;background:transparent;border:0;border-radius:5px;color:var(--nc-text);font-family:var(--nc-font-body);font-size:13px;padding:7px 10px;cursor:pointer}.ncb-menu button:hover{background:rgba(95,168,224,.1)}.ncb-menu button small{display:block;color:var(--nc-text-d);font-size:11px}',
      /* v1.2.0 — the Stock / Part numbers switch, the Part numbers table, the review and the change log */
      '.ncb-views{display:inline-flex;border:1px solid var(--nc-border);border-radius:6px;overflow:hidden;margin:2px 0 10px}',
      '.ncb-views button{font-family:var(--nc-font-head,Rajdhani);font-weight:600;font-size:13px;letter-spacing:.3px;padding:5px 16px;background:transparent;color:var(--nc-text-m);border:0;cursor:pointer}',
      '.ncb-views button+button{border-left:1px solid var(--nc-border)}.ncb-views button.on{background:rgba(95,168,224,.14);color:var(--ncb-accent)}.ncb-views button:hover{color:var(--nc-text)}',
      '.ncb table.ncb-parts{table-layout:fixed;min-width:980px}',
      '.ncb tr.ncb-prow td{background:rgba(255,255,255,.028);border-top:1px solid var(--nc-border);text-align:left;padding:9px 10px 7px}',
      '.ncb-pline{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}.ncb-pline .ncb-spacer{flex:1}',
      '.ncb tr.ncb-pnrow td{padding:5px 8px;font-size:12.5px;border-bottom:1px solid rgba(42,45,58,.35)}.ncb tr.ncb-pnrow td.n{font-family:var(--nc-font-mono);font-size:12.5px}',
      '.ncb tr.ncb-pnrow td:first-child{box-shadow:inset 3px 0 0 rgba(95,168,224,.25)}',
      '.ncb-miss{color:#fdba74}.ncb-dim{color:var(--nc-text-d)}',
      '.ncb tr.ncb-pnrow.sugg td{background:rgba(52,211,153,.045)}.ncb tr.ncb-pnrow.sugg td:first-child{box-shadow:inset 3px 0 0 rgba(52,211,153,.6)}',
      '.ncb tr.ncb-pnrow.staged-add td{background:rgba(52,211,153,.08)}.ncb tr.ncb-pnrow.staged-add td:first-child{box-shadow:inset 3px 0 0 #34D399}',
      '.ncb tr.ncb-pnrow.staged-rem td{opacity:.55}.ncb tr.ncb-pnrow.staged-rem td .ncb-mono{text-decoration:line-through}.ncb tr.ncb-pnrow.staged-rem td:first-child{box-shadow:inset 3px 0 0 #EF4444}',
      '.ncb tr.ncb-pgrp td{font-family:var(--nc-font-mono);font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#9ccbf0;padding:4px 8px}',
      '.ncb tr.ncb-rawrow td{font-size:11.5px;color:var(--nc-text-m);padding:3px 8px;background:rgba(95,168,224,.035);border-bottom:1px dashed rgba(42,45,58,.5)}.ncb tr.ncb-rawrow td.n{font-family:var(--nc-font-mono);font-size:11.5px}',
      '.ncb tr.ncb-rawrow.sum td{color:var(--nc-text);font-size:11.5px;padding:5px 8px 8px}',
      '.ncb-lnk{white-space:nowrap;background:transparent;border:0;color:var(--ncb-accent);font-family:var(--nc-font-mono);font-size:11px;cursor:pointer;padding:2px 4px;border-radius:3px}.ncb-lnk:hover{background:rgba(95,168,224,.1)}.ncb-lnk.on{color:#fdba74}',
      '.ncb-add{display:inline-flex;gap:6px;align-items:center}.ncb-add input{background:var(--nc-void,#0A0D1A);border:1px solid var(--nc-border);color:var(--nc-text);border-radius:4px;padding:3px 7px;font-family:var(--nc-font-mono);font-size:12px;width:150px}',
      'h3.ncb-h3{font-family:var(--nc-font-head);font-weight:600;font-size:17px;margin:18px 0 4px}',
      '.ncb-rmodel{margin:14px 0 2px;font-size:13.5px}',
      '.ncb-rcard{border:1px solid var(--nc-border);border-radius:8px;padding:9px 14px 10px;margin:8px 0;background:var(--nc-surface,#080C14);max-width:1100px}.ncb-rcard.new{border-color:rgba(52,211,153,.35)}',
      '.ncb-rcard h4{margin:0 0 6px;font-family:var(--nc-font-head);font-weight:600;font-size:15px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}',
      '.ncb-ba{display:grid;grid-template-columns:60px 1fr;gap:5px 10px;font-size:12.5px;align-items:start}',
      '.ncb-pnchip{font-family:var(--nc-font-mono);font-size:11.5px;padding:2px 7px;border-radius:4px;border:1px solid var(--nc-border);display:inline-flex;gap:5px;align-items:center;margin:2px 6px 2px 0}',
      '.ncb-pnchip .ncb-pill{margin:0}.ncb-pnchip.add{border-color:rgba(52,211,153,.5);background:rgba(52,211,153,.06)}.ncb-pnchip.rem{border-color:rgba(239,68,68,.45);background:rgba(239,68,68,.05);text-decoration:line-through}',
      '.ncb-tickl{display:inline-flex;align-items:center;gap:4px;cursor:pointer}.ncb-tickl input{accent-color:#34D399}',
      '.ncb-revfoot{position:sticky;bottom:-60px;background:var(--nc-void,#0A0D1A);border-top:1px solid var(--nc-border);padding:12px 0 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px;z-index:5}',
      '.ncb-log td{font-size:12.5px;vertical-align:top}',
      '.ncb-banner>span:not(.ncb-dot){flex:1 1 320px;min-width:0}',
      /* v1.2.1 — the model table's columns are fixed: opening a row never moves them */
      '.ncb table.ncb-modeltbl{table-layout:fixed}.ncb table.ncb-modeltbl th{white-space:normal;vertical-align:bottom;line-height:1.25}.ncb table.ncb-modeltbl td{overflow-wrap:break-word}',
      '.ncb table.ncb-modeltbl td .ncb-pill{margin:1px 2px}',
      '.ncb-nw{white-space:nowrap}.ncb-zero{color:var(--nc-text-d);opacity:.85}',   /* the text stays beside its dot (it wrapped under it) */
      // v1.3.0 — the notes line, the hidden bar and list, the right-click menu (on document.body, so not under .ncb)
      '.ncb-notesbtn{display:flex;align-items:baseline;gap:6px;background:none;border:0;padding:2px 0;margin:2px 0 0;color:var(--ncb-accent);font:inherit;font-size:12.5px;cursor:pointer;text-align:left}',
      '.ncb-notesbtn:hover{text-decoration:underline}.ncb-notesbtn .ncb-dim{font-size:12px}',
      '.ncb-hiddenbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;margin:2px 0 8px;padding:6px 10px;border:1px dashed var(--nc-border,#2A2D3A);border-radius:4px}',
      '.ncb-hidelist{border:1px solid var(--nc-border,#2A2D3A);border-radius:4px;margin:-4px 0 10px;padding:2px 10px}',
      '.ncb-hidelist>div{display:flex;align-items:baseline;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)}.ncb-hidelist>div:last-child{border-bottom:0}',
      '.ncb-ctx{position:fixed;z-index:9800;min-width:240px;max-width:400px;background:#0b1210;border:1px solid rgba(95,168,224,.4);border-radius:4px;box-shadow:0 8px 28px rgba(0,0,0,.55);padding:4px 0;font-family:var(--nc-font-body,Barlow,sans-serif)}',
      '.ncb-ctx-t{padding:6px 12px 5px;font-family:var(--nc-font-mono,monospace);font-size:10px;letter-spacing:1px;color:rgba(95,168,224,.9);text-transform:uppercase;border-bottom:1px solid rgba(95,168,224,.18);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ncb-ctx button{display:block;width:100%;text-align:left;background:none;border:0;color:#e8e9ed;padding:7px 12px;font-size:13px;cursor:pointer;font-family:inherit}',
      '.ncb-ctx button:hover,.ncb-ctx button:focus{background:rgba(95,168,224,.12);color:#9fd0f5;outline:none}',
      '.ncb-ctx-n{padding:5px 12px 3px;font-size:11px;color:#8b8fa3;border-top:1px solid rgba(95,168,224,.12)}',
      '@media (max-width:1100px){.ncb-list{width:210px}.ncb-tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function modelSummary(v) {
    var c = { spare: 0, nospare: 0, short: 0, notsap: 0 }, maj = 0, majSpare = 0;
    v.pockets.forEach(function (x) { if (x.st) c[x.st.status]++; if (x.p.tier === 'major') { maj++; if (x.st && x.st.status === 'spare') majSpare++; } });
    return { c: c, maj: maj, majSpare: majSpare, unmatched: v.unmatched.length };
  }
  var GROUP_NAME = { OP: 'Open pit', UG: 'Underground', REF: 'Older / other Sandvik (reference)' };
  function listHtml(def, views) {
    var h = '';
    ['OP', 'UG', 'REF'].forEach(function (g) {
      var ms = def.models.filter(function (m) { return m.group === g; });
      if (!ms.length) return;
      h += '<div class="ncb-grp"><span>' + GROUP_NAME[g] + '</span><span>' + ms.length + '</span></div>';
      ms.forEach(function (m) {
        var v = views[m.key], s = modelSummary(v), units = v.units.length;
        var lbl = m.lens.model + (m.lens.units ? ' · ' + (m.lens.units.length > 2 ? m.lens.units[0] + '–' + m.lens.units[m.lens.units.length - 1] : m.lens.units.join(', ')) : '');
        var seg = function (t, col) { return '<span style="white-space:nowrap' + (col ? ';color:' + col : '') + '">' + t + '</span>'; };
        var line = S.idx ? [seg(s.majSpare + '/' + s.maj + ' majors spare')].concat(s.c.short ? [seg(s.c.short + ' short', '#fdba74')] : [], s.c.notsap ? [seg(s.c.notsap + ' not in SAP', '#fca5a5')] : []).join(' · ') : seg(m.pockets.length + ' pockets · load stock');
        var tot = v.pockets.length || 1;
        var bar = S.idx ? '<div class="ncb-bar"><i style="width:' + (s.c.spare / tot * 100) + '%;background:var(--ncb-spare)"></i><i style="width:' + (s.c.nospare / tot * 100) + '%;background:var(--ncb-nospare)"></i><i style="width:' + (s.c.short / tot * 100) + '%;background:var(--ncb-short)"></i><i style="width:' + (s.c.notsap / tot * 100) + '%;background:var(--ncb-notsap)"></i></div>' : '';
        h += '<div class="ncb-mi' + (S.model === m.key ? ' on' : '') + '" data-model="' + esc(m.key) + '"><b>' + esc(lbl) + '<small>' + units + ' ' + (units === 1 ? 'unit' : 'units') + '</small></b><span>' + line + '</span>' + bar + '</div>';
      });
    });
    var gaps = lensModelsNotInReview();
    h += '<div class="ncb-grp"><span>Not in the spares review</span><span>' + gaps.length + '</span></div>';
    gaps.forEach(function (g) {
      var k = 'notin:' + g.fleet + '|' + g.model;
      h += '<div class="ncb-mi gap' + (S.model === k ? ' on' : '') + '" data-model="' + esc(k) + '"><b>' + esc(g.model) + (g.partial ? ' · ' + esc(g.units.join(', ')) : '') + '<small>' + g.units.length + ' ' + (g.units.length === 1 ? 'unit' : 'units') + '</small></b><span>' + esc(g.fleet.toLowerCase()) + ' · no spares pocket</span></div>';
    });
    return h;
  }
  function stockChip() {
    var cls = stockAgeClass();
    if (cls === 'none') return '<span class="ncb-chip">Stock · not loaded</span>';
    var s = S.stock, age = s.dataAsOf ? daysSince(s.dataAsOf) : null;
    var from = s.source === 'folder' ? 'from the client folder · ' : '';
    return '<span class="ncb-chip ' + (cls === 'expired' ? 'red' : cls) + '" title="' + esc('INV_MSTR ' + from + s.fileName + ' [' + s.sheet + '] · ' + s.materials.toLocaleString() + ' materials · dated from ' + s.method + ' · loaded ' + s.loadedAt.toLocaleTimeString() + ' · amber after ' + STOCK_AGE.amber + ' days, red after ' + STOCK_AGE.red + ', not loaded after ' + STOCK_AGE.refuse) + '">Stock · ' + (s.dataAsOf ? fmtDate(s.dataAsOf) + ' · ' + age + (age === 1 ? ' day' : ' days') + (cls === 'expired' ? ' · expired' : '') : 'date unknown') + (s.source === 'folder' ? ' · folder' : '') + '</span>';
  }
  function topBar() {
    // local calendar date of the save stamp (an ISO timestamp is UTC — slicing it would read tomorrow after 5 pm Pacific)
    var ps = S.host.planSaved, pd = ps ? (/^\d{4}-\d{2}-\d{2}$/.test(ps) ? isoToDate(ps) : new Date(ps)) : null;
    var plan = pd && !isNaN(pd) ? localIso(pd) : '';
    return '<div class="ncb-top"><span class="ncb-eyebrow">Bench · critical spares</span>' +
      (plan ? '<span class="ncb-chip ok">Plan · saved ' + fmtDate(plan) + '</span>' : '') + stockChip() +
      '<span class="ncb-spacer"></span>' +
      // v1.1.1 — the client folder is the stock source; loading by hand is the fallback. "Link file" is gone.
      (folderOn() ? '' : '<button class="ncb-btn" data-act="load" title="Load an INV_MSTR by hand for this session. Connect the client folder (header) to have it read automatically.">⬆ Load INV_MSTR</button>') +
      '<details class="ncb-more"><summary title="More: definition import / export' + (folderOn() ? ', load stock by hand' : '') + '">⋯</summary><div class="ncb-menu">' +
      (folderOn() ? '<button data-act="load">Load an INV_MSTR by hand<small>This session only — replaces the client folder\'s stock until reload</small></button>' : '') +
      (benchDef() ? '<button data-act="parts">Part numbers<small>Each component\'s part numbers and what they pull through from stock</small></button>' +   // v1.2.0
        '<button data-act="review">Review changes' + (allProposals().length + S.staged.length ? ' (' + (allProposals().length + S.staged.length) + ')' : '') + '<small>Snapshot suggestions and edits by hand, before / after</small></button>' +
        '<button data-act="log">Change log' + ((benchDef().log || []).length ? ' (' + benchDef().log.length + ')' : '') + '<small>Every change to the definition, and every declined suggestion</small></button>' : '') +
      '<button data-act="import">' + (benchDef() ? 'Replace the Bench definition…' : 'Import a Bench definition…') + '<small>A bench_definition_*.json: which part numbers fit which component' + (benchDef() ? ' (you see a before / after first)' : '') + '</small></button>' +
      (benchDef() ? '<button data-act="export">Export the Bench definition<small>Downloads it as JSON</small></button>' : '') +
      '</div></details>' +
      '<input type="file" id="ncb-file-inv" accept=".xlsx,.xls,.xlsm" hidden><input type="file" id="ncb-file-def" accept=".json" hidden></div>';
  }
  function folderOn() { try { return !!(root.NumaCoreWorkspace && root.NumaCoreWorkspace.state().connected); } catch (e) { return false; } }
  function banners() {
    var h = '';
    if (S.busy) h += '<div class="ncb-banner info"><span class="ncb-dot" style="color:var(--ncb-accent)"></span>' + esc(S.busy) + '</div>';
    // v1.2.0 — the definition changed in this tab and is not in the saved plan yet (operator: "I have to load the Bench def every time")
    if (S.unsaved) h += '<div class="ncb-banner amber"><span class="ncb-dot" style="color:var(--ncb-nospare)"></span><span><b>Not saved yet:</b> ' + esc(S.unsaved.what) + '. Until you press <b>SAVE FILE</b> it lives only in this browser tab: reopening the old fleet file brings back the definition without it. With the client folder in edit, SAVE FILE keeps the plan in <code>lens\\plan</code>, and opening the folder loads it.</span></div>';
    if (S.page !== 'review' && benchDef()) {
      var pr = allProposals();
      if (S.defReview) h += '<div class="ncb-banner info"><span class="ncb-dot" style="color:var(--ncb-accent)"></span><span>A Bench definition file (<span class="ncb-mono">' + esc(S.defReview.fileName) + '</span>) is waiting for your before / after review. Nothing has changed yet.</span> <button class="ncb-btn solid" data-act="review">Review</button></div>';
      else if (pr.length) {
        var np = pr.filter(function (x) { return x.kind === 'add'; }).length, nc = pr.length - np;
        h += '<div class="ncb-banner info"><span class="ncb-dot" style="color:var(--ncb-accent)"></span><span>' + propSource(pr) + ' list <b>' + np + '</b> part number' + (np === 1 ? '' : 's') + (nc ? ' and <b>' + nc + '</b> component' + (nc === 1 ? '' : 's') : '') + ' that the Bench definition doesn\'t have. Nothing changes until you review them.</span> <button class="ncb-btn solid" data-act="review">Review</button></div>';
      }
    }
    if (!S.stock && !S.busy && benchDef() && folderOn()) h += '<div class="ncb-banner info"><span class="ncb-dot" style="color:var(--ncb-accent)"></span><span>Stock comes from the client folder, and it has no INV_MSTR yet. Put the export in <b>1 New files</b>, press <b>↻</b> in the header, then <b>NEW FILES: CHECK</b> and Publish.</span></div>';
    if (S.stock && S.askDate) {
      var saved = S.stock.lastModified ? localIso(new Date(S.stock.lastModified)) : '';
      h += '<div class="ncb-banner amber"><b>Stock date needed.</b> The INV_MSTR has no date inside it and its file name has none. Enter the date the export was taken: <input type="date" id="ncb-stockdate" value=""> <button class="ncb-btn" data-act="setdate">Use this date</button> <button class="ncb-btn ghost" data-act="nodate">Don\'t know</button>' + (saved ? ' <span style="color:var(--nc-text-m)">The file was last saved on ' + fmtDate(saved) + ' — use that only if nobody opened and re-saved it in Excel.</span>' : '') + '</div>';
    } else if (S.stock) {
      var cls = stockAgeClass(), age = S.stock.dataAsOf ? daysSince(S.stock.dataAsOf) : null;
      if (cls === 'expired') h += '<div class="ncb-banner red"><span class="ncb-dot" style="color:var(--ncb-notsap)"></span><span><b>Stock is ' + age + ' days old: past the ' + STOCK_AGE.refuse + '-day limit.</b> (INV_MSTR ' + fmtDate(S.stock.dataAsOf) + ') Refresh the client folder with a fresh export; until then every stock number here is out of date.</span></div>';
      else if (cls === 'red') h += '<div class="ncb-banner red"><span class="ncb-dot" style="color:var(--ncb-notsap)"></span>' + (S.stock.dataAsOf ? '<span><b>Stock is ' + age + ' days old</b> (INV_MSTR ' + fmtDate(S.stock.dataAsOf) + ', red after ' + STOCK_AGE.red + ' days). Every stock number here carries that age.</span>' : '<span><b>Stock date unknown.</b> Every stock number here is undated — confirm the export date.</span> <button class="ncb-btn ghost" data-act="askdate">Enter date</button>') + '</div>';
      else if (cls === 'amber') h += '<div class="ncb-banner amber"><span class="ncb-dot" style="color:var(--ncb-nospare)"></span><span>Stock is ' + age + ' days old (INV_MSTR ' + fmtDate(S.stock.dataAsOf) + ', amber after ' + STOCK_AGE.amber + ' days).</span></div>';
    }
    return h;
  }
  // v1.1.1 — the rows the filter shows; the tiles count exactly these (they ignored the filter before)
  var FILTER_NAME = { all: 'All', major: 'Majors', minor: 'Minors', attn: 'Needs attention' };
  function filteredPockets(v) {
    return v.pockets.filter(function (x) {
      if (S.filter === 'major' || S.filter === 'minor') return x.p.tier === S.filter;
      if (S.filter === 'attn') return (x.st && x.st.status !== 'spare') || (!x.lens.length && v.unmatched.some(function (u) { return u.hint === x.p; }));
      return true;
    });
  }
  function tiles(v) {
    var rows = filteredPockets(v), c = { spare: 0, nospare: 0, short: 0, notsap: 0 };
    rows.forEach(function (x) { if (x.st) c[x.st.status]++; });
    // the fifth tile counts LENS components with no pocket — a different thing from the spares components the first
    // four count, so it stands apart and says so (UI audit: 20 + 11 + 1 + 6 + 9 = 47 on a 38-component model)
    var t = [['spare', c.spare, 'cover after inbound > 0'], ['nospare', c.nospare, 'cover 0: nothing spare, or no stock and no demand'], ['short', c.short, 'demand the shelf + inbound cannot meet'], ['notsap', c.notsap, 'no SAP material set up'], ['notin', v.unmatched.length, 'Lens components with no spares match — not part of the ' + rows.length]];
    return '<div class="ncb-meta" style="margin-top:10px">Counting ' + rows.length + ' of ' + v.pockets.length + ' components' + ((v.hiddenPockets || []).length ? ' (' + v.hiddenPockets.length + ' hidden)' : '') + ' · ' + FILTER_NAME[S.filter] + (v.pockets.some(function (x) { return x.fam; }) ? ' · each part number of a split component counts once' : '') + '</div>' +
      '<div class="ncb-tiles">' + t.map(function (x) { return '<div class="ncb-tile' + (x[0] === 'notin' ? ' aside' : '') + '"><div class="k" style="color:' + ST[x[0]].c + '"><span class="ncb-dot"></span>' + ST[x[0]].w + '</div><div class="v">' + (S.idx || x[0] === 'notin' ? z(x[1]) : '—') + '</div><div class="d">' + x[2] + '</div></div>'; }).join('') + '</div>';
  }
  // v1.1.1 — one signed-number format for card, table and statement (the card wrote "-3", the table "−3")
  function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n); }
  // v1.2.1 (operator: "can we please replace all 0 with - to make it more visible") — in every quantity CELL a zero is a
  // dimmed en dash (hover: 0), so the numbers that aren't zero stand out. "—" (em dash) still means no data. Sentences and
  // the board cards keep their numbers ("shelf 0" reads; "shelf –" doesn't).
  var ZERO = '<span class="ncb-zero" title="0">–</span>';
  function z(n) { return n === 0 ? ZERO : String(n); }
  function zs(n) { return n === 0 ? ZERO : signed(n); }
  function qtyWords(st) {
    if (!st) return '<span style="color:var(--nc-text-d)">no stock data</span>';
    if (st.status === 'notsap') return 'not set up in SAP';
    return (st.assembly ? 'kits · ' : '') + 'shelf ' + st.soh + ' · on the way ' + (st.po + st.tr) + ' · reserved ' + st.res + ' · cover ' + signed(st.net);
  }
  function boardHtml(v) {
    var m = v.m, majors = v.pockets.filter(function (x) { return x.p.tier === 'major'; });
    if (!majors.length || m.reference || !majors.some(function (x) { return x.p.anchor; })) {   // v1.1.0 — reference models are tables only
      // v1.1.1 (UI audit BEN-03) — with no board there was no model name anywhere on the page
      var u = v.units;
      return '<div class="ncb-eyebrow" style="margin-top:6px">' + esc(m.brand || '') + (m.group === 'REF' ? ' · ' + GROUP_NAME.REF : '') + '</div><h1 class="ncb-h">' + esc(m.label) + '</h1><div class="ncb-sub">' + esc(m.class || '') + ' · ' + u.length + ' ' + (u.length === 1 ? 'unit' : 'units') + (u.length ? ' (' + esc(u.length > 3 ? u[0] + '–' + u[u.length - 1] : u.join(', ')) + ')' : '') + ' · tables only, no machine board</div>';
    }
    return '<div class="ncb-boardwrap" id="ncb-boardwrap"><div class="ncb-board" id="ncb-board" data-img="' + esc(S.host.imageBase + m.image) + '"></div></div>';
  }
  // V3 board(): image box, anchors, top row, left/right columns, leader lines
  function layoutBoard(v) {
    var wrap = document.getElementById('ncb-boardwrap'), board = document.getElementById('ncb-board');
    if (!wrap || !board) return;
    var BW = 1520, BH = 860, CARDW = 248, CARDH = 108, MID = 395;
    // v1.1.2 — never above V3's 1:1 size
    var scale = Math.min(1, wrap.clientWidth / BW); board.style.transform = 'scale(' + scale + ')'; wrap.style.height = Math.round(BH * scale) + 'px';
    var img = new Image();
    img.onload = function () { draw(img.naturalWidth, img.naturalHeight, true); };
    img.onerror = function () { draw(640, 400, false); };
    img.src = board.getAttribute('data-img');
    function draw(iw, ih, ok) {
      var dispw = 640, disph = ih * dispw / iw;
      if (disph > 520) { disph = 520; dispw = iw * disph / ih; }
      var mx = BW / 2 - dispw / 2, my = MID - disph / 2;
      var items = v.pockets.filter(function (x) { return x.p.tier === 'major'; }).map(function (x) {
        var a = x.p.anchor || [0.5, 0.55];
        return { x: x, ax: mx + a[0] * dispw, ay: my + a[1] * disph, side: a[0] < 0.5 ? 'L' : 'R', top: !!x.p.top };
      });
      var tops = items.filter(function (c) { return c.top; }).sort(function (a, b) { return a.ax - b.ax; });
      var rest = items.filter(function (c) { return !c.top; });
      var L = rest.filter(function (c) { return c.side === 'L'; }).sort(function (a, b) { return a.ay - b.ay; });
      var R = rest.filter(function (c) { return c.side === 'R'; }).sort(function (a, b) { return a.ay - b.ay; });
      if (tops.length) {
        var TOPL = 455, TOPR = 1295, gap = 44, total = tops.length * CARDW + (tops.length - 1) * gap;
        var x0 = TOPL + ((TOPR - TOPL) - total) / 2; if (x0 < TOPL) x0 = (BW - total) / 2;
        tops.forEach(function (c, i) { c.cx = x0 + i * (CARDW + gap); c.cy = 34; });
      }
      function place(list, x) {
        var n = list.length; if (!n) return;
        if (n === 1) list[0].cy = MID - CARDH / 2;
        else {
          var g = CARDH * 0.5, bt = 205, bb = 760, block = n * CARDH + (n - 1) * g;
          if (block > bb - bt) { g = Math.max(6, (bb - bt - n * CARDH) / (n - 1)); block = n * CARDH + (n - 1) * g; }
          var start = Math.max(bt, Math.min(MID - block / 2, bb - block));
          list.forEach(function (c, i) { c.cy = start + i * (CARDH + g); });
        }
        list.forEach(function (c) { c.cx = x; });
      }
      place(L, 40); place(R, BW - 40 - CARDW);
      var m = v.m, units = v.units;
      var h = (ok ? '<img class="mach" src="' + esc(board.getAttribute('data-img')) + '" style="left:' + mx + 'px;top:' + my + 'px;width:' + dispw + 'px;height:' + disph + 'px" alt="">' : '') +
        '<div class="ncb-hero"><div class="b">' + esc(m.brand) + '</div><div class="m">' + esc(m.label) + '</div><div class="c">' + esc(m.class) + '</div><div class="u">' + units.length + ' ' + (units.length === 1 ? 'unit' : 'units') + ' · ' + esc(units.length > 3 ? units[0] + '–' + units[units.length - 1] : units.join(', ')) + '</div></div>' +
        '<div class="ncb-legend"><div>STATUS · COVER AFTER INBOUND</div>' + ['spare', 'nospare', 'short', 'notsap'].map(function (k) { return '<div>' + ST[k].w + ' <i style="background:' + ST[k].c + '"></i></div>'; }).join('') + '</div>';
      var svg = '<svg viewBox="0 0 1520 860">';
      items.forEach(function (c) {
        var k = c.x.st ? c.x.st.status : 'nostock', col = ST[k].c;
        var ex, ey;
        if (c.top) { ex = c.cx + CARDW / 2; ey = c.cy + CARDH; } else { ex = c.side === 'L' ? c.cx + CARDW : c.cx; ey = c.cy + CARDH / 2; }
        svg += '<g style="color:' + col + '"><line x1="' + ex.toFixed(0) + '" y1="' + ey.toFixed(0) + '" x2="' + c.ax.toFixed(0) + '" y2="' + c.ay.toFixed(0) + '" stroke="currentColor" stroke-width="1.5" opacity=".82"/>' +
          '<circle cx="' + ex.toFixed(0) + '" cy="' + ey.toFixed(0) + '" r="3.2" fill="currentColor"/><circle cx="' + c.ax.toFixed(0) + '" cy="' + c.ay.toFixed(0) + '" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="' + c.ax.toFixed(0) + '" cy="' + c.ay.toFixed(0) + '" r="2.8" fill="currentColor"/></g>';
        h += '<div class="ncb-card" data-open="' + esc(c.x.p.id) + '" style="left:' + c.cx.toFixed(0) + 'px;top:' + c.cy.toFixed(0) + 'px"><div class="acc" style="background:' + col + '"></div><div class="in">' + badge(k) +
          '<div class="nm">' + esc(c.x.label) + '</div><div class="pn">' + esc(c.x.p.vpn) + (c.x.st && c.x.st.assembly ? ' · assembly' : '') + (c.x.lens.length ? ' · ' + c.x.lens.reduce(function (s, l) { return s + l.n; }, 0) + ' in Lens' : '') + '</div><div class="q" style="color:' + col + '">' + qtyWords(c.x.st) + '</div></div></div>';
      });
      svg += '</svg>';
      board.innerHTML = svg + h;
      board.querySelectorAll('[data-open]').forEach(function (el) {
        el.onclick = function () { var id = el.getAttribute('data-open'); S.open[id] = true; rerender(); var row = S.el.querySelector('tr.ncb-row[data-id="' + CSS.escape(id) + '"]'); if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
        el.oncontextmenu = function (e) { pocketMenu(e, v, el.getAttribute('data-open')); };   // v1.3.0 — right-click → Hide
      });
    }
  }
  function statement(st) {
    if (!st) return 'No stock data yet: it comes from the client folder\'s INV_MSTR (or load one by hand from ⋯).';
    if (st.status === 'notsap') return 'No SAP material is set up for any of this pocket\'s part numbers.';
    var way = st.po + st.tr;
    var s = (st.assembly ? '<b>Complete kits</b> (one of every sub-part group, counted by the scarcest group — group ' + (st.bind + 1) + ' of ' + st.groups.length + '): ' : '') +
      '<b>' + st.soh + '</b> on the shelf, <b>' + way + '</b> on the way' + (way ? ' (' + st.po + ' on order' + (st.tr ? ', ' + st.tr + ' in transit' : '') + ')' : '') + ', <b>' + st.res + '</b> reserved ';
    if (st.status === 'spare') s += '→ <b style="color:var(--ncb-spare)">' + st.net + ' spare</b> after everything inbound arrives.';
    else if (st.status === 'nospare') s += (st.soh + way === 0 ? '→ <b style="color:var(--ncb-nospare)">no spare</b>: nothing on the shelf or on the way, and nothing reserved against it.' : '→ <b style="color:var(--ncb-nospare)">exactly covered</b>: nothing spare once reservations are met.');
    else if (st.soh + way === 0) s += '→ <b style="color:var(--ncb-short)">short by ' + (-st.net) + '</b>: demand, with nothing on the shelf or inbound.';
    else s += '→ <b style="color:var(--ncb-short)">short by ' + (-st.net) + '</b> even after everything inbound arrives.';
    if (st.assembly) s += ' <span style="color:var(--nc-text-m)">The rows below are grouped by sub-part group; the highlighted subtotal is the one that sets the count.</span>';
    return s;
  }
  function netCell(st) {
    if (!st) return '<span style="color:var(--nc-text-d)">—</span>';
    if (st.status === 'notsap') return '<span style="color:var(--nc-text-d)">—</span>';
    var col = st.status === 'spare' ? 'var(--ncb-spare)' : st.status === 'nospare' ? 'var(--ncb-nospare)' : 'var(--ncb-short)';
    return '<span class="ncb-net" style="color:' + col + '"' + (st.net === 0 ? ' title="0"' : '') + '>' + (st.net === 0 ? '–' : signed(st.net)) + '</span>';
  }
  // v1.1.2 — the SAP detail opens as rows of the SAME table, each number directly under the column it adds up to
  // (operator: the detail "looks like it is floating in the middle of nowhere… need a visual way to link it").
  // A bar in the component's status colour runs from its row down through its detail rows.
  // An assembly's rows come grouped per sub-part group with a subtotal each; the binding subtotal equals the headline.
  function wayCell(o, t) { return z(o + t) + (o && t ? '<span class="ncb-kit">order ' + o + ' · transit ' + t + '</span>' : t ? '<span class="ncb-kit">in transit</span>' : ''); }
  // v1.3.0 (operator: "Where you have a comment box under a component… please leave the header card that I can open if
  // I want… takes up a lot of RE if always open") — the notes fold into one line that says what is inside; one click opens
  // them for every row (remembered in this browser), another folds them again
  function notesBlock(notes, what) {
    var open = !!S.notesOpen;
    return '<button class="ncb-notesbtn" data-act="notes" aria-expanded="' + open + '" title="' + (open ? 'Fold the notes' : 'Open the notes') + '">' + (open ? '▾' : '▸') + ' Notes <span class="ncb-dim">· ' + esc(what.join(' · ')) + '</span></button>' +
      (open ? notes.map(function (n) { return '<div class="ncb-note">' + n + '</div>'; }).join('') : '');
  }
  function detailRows(st, bar, notesHtml) {
    var out = [], tree = '<td><i class="ncb-tree"></i></td>', sty = ' style="--bar:' + bar + '"';
    var row = function (d, showCover) {
      return '<tr class="ncb-drow"' + sty + '>' + tree + '<td class="l"><span class="ncb-mono">SAP ' + esc(d.sap) + '</span> <span class="ncb-ddesc">' + esc(d.desc) + '</span></td><td class="l"><span class="ncb-mono">' + esc(d.vpn) + '</span></td><td></td><td></td>' +
        '<td class="n">' + z(d.qoh) + '</td><td class="n">' + wayCell(d.qoo, d.qit) + '</td><td class="n">' + z(d.rsrv) + '</td><td class="n ncb-dim">' + (showCover ? zs(d.qoh + d.qoo + d.qit - d.rsrv) : '') + '</td><td><span class="ncb-pill ' + d.cat + '">' + d.cat + '</span></td><td></td></tr>';
    };
    if (st && st.detail.length) {
      if (!st.assembly) st.detail.forEach(function (d) { out.push(row(d, true)); });
      else st.groups.forEach(function (g) {
        var bind = g.i === st.bind;
        out.push('<tr class="ncb-drow ncb-dgrp"' + sty + '>' + tree + '<td class="l" colspan="10">Sub-part group ' + (g.i + 1) + ' of ' + st.groups.length + ' · ' + esc(g.vpns.join(' / ')) + (g.n ? '' : ' · not set up in SAP') + '</td></tr>');
        st.detail.filter(function (d) { return d.grp === g.i; }).forEach(function (d) { out.push(row(d, false)); });
        out.push('<tr class="ncb-drow ncb-dsub' + (bind ? ' bind' : '') + '"' + sty + '>' + tree + '<td class="l" colspan="4">Group ' + (g.i + 1) + ' subtotal' + (bind ? ' · sets the kit count' : '') + '</td><td class="n">' + z(g.soh) + '</td><td class="n">' + wayCell(g.po, g.tr) + '</td><td class="n">' + z(g.res) + '</td><td class="n">' + zs(g.net) + '</td><td></td><td></td></tr>');
      });
    }
    out.push('<tr class="ncb-drow ncb-dnote"' + sty + '><td></td><td colspan="10">' + notesHtml + '</td></tr>');
    return out.join('');
  }
  // v1.1.2 — operator: "what is this about?? when I click down, there is nothing to see". The row said "part number on
  // file differs — see below" and pointed at a panel at the page foot. The opened row now shows both part lists side by
  // side: every part number Lens holds for the component (with its units) against this component's list, marking a
  // number that does match and one that looks like a typing slip of a listed number (same digits, two swapped).
  function digitsKey(s) { return String(s || '').replace(/[^0-9A-Z]/gi, '').toUpperCase(); }
  function swapTypo(a, list) {
    a = digitsKey(a); if (a.length < 5) return null;
    for (var i = 0; i < list.length; i++) {
      var b = digitsKey(list[i]); if (b.length !== a.length || b === a) continue;
      var diff = []; for (var j = 0; j < a.length; j++) if (a[j] !== b[j]) diff.push(j);
      if (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]) return list[i];
    }
    return null;
  }
  function mismatchNote(x, likely) {
    var list = x.p.vpns || [];
    var rows = likely.map(function (u) {
      return '<div style="margin:4px 0 2px"><b>' + esc(u.name) + '</b> — ' + Object.keys(u.pnc || {}).sort(function (a, b) { return u.pnc[b].n - u.pnc[a].n; }).map(function (pn) {
        var e = u.pnc[pn], hit = x.keys.has(joinKey(pn)), typo = !hit && swapTypo(pn, list);
        var mm = Object.keys(e.mm); var units = e.units.slice().sort();
        return '<span class="ncb-mono" style="color:' + (hit ? 'var(--ncb-spare)' : 'var(--nc-text)') + '">' + esc(pn) + '</span> on ' + e.n + ' ' + (e.n === 1 ? 'unit' : 'units') +
          ' <span style="color:var(--nc-text-d)">(' + esc(units.length > 4 ? units[0] + '…' + units[units.length - 1] : units.join(', ')) + (mm.length ? '; SAP ' + esc(mm.join(', ')) : '') + ')</span>' +
          (hit ? ' <span style="color:var(--ncb-spare)">matches this list</span>' : typo ? ' <span style="color:#fdba74">looks like a typing slip of ' + esc(typo) + '</span>' : '');
      }).join(' · ') + '</div>';
    }).join('');
    return '<div class="ncb-mis"><div class="ncb-warn" style="font-size:13px;font-weight:600">Part numbers don\'t match, so these Lens components are not linked here (no life % or due date on this row)</div>' +
      '<div style="margin-top:4px"><span style="color:var(--nc-text-m)">In Lens:</span>' + rows + '</div>' +
      '<div style="margin-top:4px"><span style="color:var(--nc-text-m)">This component\'s part list:</span> <span class="ncb-mono">' + esc(list.join(', ')) + '</span></div>' +
      '<div style="margin-top:6px;color:var(--nc-text-m)">The names say they are the same component, but neither list has the other\'s number. Usually one is an older number that has since been superseded, or a typing slip. Check the part fitted; then correct the Lens component data (Intake) or this part list (Bench definition). They are also listed at the foot of the page.</div></div>';
  }
  function unitChips(units) { return (units || []).map(function (u) { return '<span class="ncb-uchip">' + esc(u) + '</span>'; }).join(''); }
  function tableHtml(v) {
    var rows = filteredPockets(v);
    // v1.2.1 (operator: "when I open a component… the column widths change to fit the additional text… dont like these
    // jerky moves") — fixed columns: the status and number columns have set widths, Component and Tracked in Lens share
    // the rest, and text wraps inside its cell. Opening a row never moves a column, and every model's table lines up.
    var h = '<div class="ncb-tscroll"><table class="ncb-modeltbl"><colgroup><col style="width:112px"><col><col><col style="width:64px"><col style="width:96px"><col style="width:64px"><col style="width:80px"><col style="width:70px"><col style="width:86px"><col style="width:96px"><col style="width:28px"></colgroup>' +
      '<thead><tr><th>Status</th><th class="l">Component</th><th class="l">Tracked in Lens</th><th>Worst life</th><th>Next due (plan)</th><th>On shelf</th><th>On the way</th><th>Reserved</th><th>Cover after inbound</th><th>Types in stock</th><th></th></tr></thead><tbody>';
    rows.forEach(function (x, ri) {
      var p = x.p, st = x.st, k = st ? st.status : 'nostock';
      var nx = rows[ri + 1], famNext = x.fam && nx && nx.fam && nx.fam.head === x.fam.head && !S.open[p.id];
      var likely = v.unmatched.filter(function (u) { return u.hint === p; });
      var lens = x.lens.length
        ? '<div class="ncb-lens">' + x.lens.map(function (l) { return esc(l.name); }).join(', ') + ' <span style="color:var(--nc-text-d)">· ' + x.lens.reduce(function (s, l) { return s + l.n; }, 0) + ' tracked</span></div><div class="ncb-how">by ' + esc(x.lens[0].how).replace(/(\S+)$/, '<span class="ncb-nw">$1</span>') + '</div>'
        : likely.length ? '<div class="ncb-warn">' + likely.map(function (u) { return esc(u.name); }).join(', ') + '</div><div class="ncb-how" style="color:#fdba74">part numbers don\'t match — open the row</div>'
          : '<div class="ncb-lens" style="color:var(--nc-text-d)">not tracked in Lens</div>';
      var worst = x.lens.length ? x.lens.map(function (l) { return l.worst; }).filter(function (w) { return w != null; }) : [];
      // v1.3.0 (operator: "Overdue should not read from the Project dates… only from the Component hrs as stated in Lens…
      // anything > 100% is overdue") — overdue is the worst life % over 100; the plan date is shown as it is, never judged
      var wmax = worst.length ? Math.max.apply(null, worst) : null;
      var worstTxt = wmax == null ? '—' : wmax > 1 ? '<span style="color:var(--ncb-short)">' + Math.round(wmax * 100) + '%</span><div class="ncb-how" style="color:var(--ncb-short)">overdue</div>' : Math.round(wmax * 100) + '%';
      var dueIso = x.lens.map(function (l) { return l.due; }).filter(Boolean).sort()[0];
      var dueTxt = !dueIso ? '—' : fmtDate(dueIso);
      var open = !!S.open[p.id];
      var types = st && st.types.length ? st.types.map(function (t) { return '<span class="ncb-pill ' + t + '">' + t + '</span>'; }).join('') : '<span style="color:var(--nc-text-d)">—</span>';
      var q = function (n) { return st && st.status !== 'notsap' ? n : '<span style="color:var(--nc-text-d)">—</span>'; };
      var f = x.fam, cont = f && !f.first;
      var name = (cont ? '<span class="ncb-arrow">↳</span>' : '') + esc(x.label) + (f ? unitChips(f.units) : '') + (f && f.first ? '<span class="ncb-why" title="' + esc(SPLIT_WHY[f.reason] || SPLIT_WHY.multiple) + '">i</span>' : '');
      h += '<tr class="ncb-row' + (cont ? ' ncb-cont' : '') + (famNext ? ' ncb-fam' : '') + (open ? ' open' : '') + '" data-id="' + esc(p.id) + '" style="--bar:' + ST[k].c + '"><td>' + badge(k) + '</td><td class="l"><div class="ncb-cname">' + name + '</div><div class="ncb-meta">' + p.tier + (p.location ? ' · ' + esc(p.location) : '') + ' · VPN ' + esc(p.vpn) + (f ? ' · part number ' + f.n + ' of ' + f.of : '') + (st && st.assembly ? ' · assembly · counted in complete kits' : '') + (p.alsoFits ? ' · also fits other models' : '') + '</div></td>' +
        '<td class="l">' + lens + '</td><td class="n">' + worstTxt + '</td><td class="n" style="font-size:12px">' + dueTxt + '</td>' +
        '<td class="n">' + q(st ? z(st.soh) : 0) + (st && st.assembly && st.status !== 'notsap' ? '<span class="ncb-kit">kits</span>' : '') + '</td><td class="n">' + q(st ? z(st.po + st.tr) : 0) + '</td><td class="n">' + q(st ? z(st.res) : 0) + '</td><td>' + netCell(st) + '</td><td>' + types + '</td><td style="color:var(--nc-text-d)">' + (open ? '▾' : '▸') + '</td></tr>';
      if (open) {
        var notes = [];
        if (!x.lens.length && likely.length) notes.push(mismatchNote(x, likely));
        if (st && st.ambiguous && st.ambiguous.length) notes.push('<span class="ncb-warn">Not counted: part number ' + st.ambiguous.map(function (a) { return '<span class="ncb-mono">' + esc(a) + '</span>'; }).join(', ') + ' is not in the INV_MSTR as written, and with leading zeros ignored it matches more than one different part number. Check which one is right.</span>');
        if (st) notes.push('SAP stock rule (MRP): <span class="ncb-mono">' + esc(st.mrp) + '</span>');
        notes.push('Part numbers in this pocket: <span class="ncb-mono">' + esc((p.vpns || []).join(', ')) + '</span>');
        if (f) notes.push('Split component: part number ' + f.n + ' of ' + f.of + ', fits ' + esc(f.units.join(', ') || 'the model') + '. ' + esc(SPLIT_WHY[f.reason] || SPLIT_WHY.multiple));
        if (p.alsoFits) notes.push('Also fits: ' + p.alsoFits.map(function (a) { return esc(a.model) + ' (' + esc((a.comps || []).join(', ')) + ')'; }).join(' · '));
        if (x.lens.length) notes.push('Lens components on this pocket: ' + x.lens.map(function (l) { return esc(l.name) + ' (' + l.n + ', part ' + esc(l.pn) + (l.mm ? ', SAP ' + esc(l.mm) : '') + (l.worst != null ? ', worst ' + Math.round(l.worst * 100) + '%' : '') + ')'; }).join(' · '));
        var what = [];
        if (!x.lens.length && likely.length) what.push('why the part numbers don\'t match');
        if (st && st.ambiguous && st.ambiguous.length) what.push('a part number not counted');
        if (st) what.push('SAP stock rule');
        what.push('part numbers');
        if (f) what.push('split component');
        if (p.alsoFits) what.push('also fits');
        if (x.lens.length) what.push('Lens components');
        h += detailRows(st, ST[k].c, '<div class="ncb-stmt">' + statement(st) + '</div>' + notesBlock(notes, what));
      }
    });
    return h + '</tbody></table></div>';
  }
  // v1.3.0 — what is hidden on this model, and the list to unhide it (split rows hide and unhide together)
  function hiddenBar(v) {
    var hp = v.hiddenPockets || [], hl = v.hiddenLens || [];
    if (!hp.length && !hl.length) return '';
    var groups = [], by = {};
    hp.forEach(function (x) { var k = x.fam ? x.fam.head : x.p.id; if (!by[k]) { by[k] = { label: x.label, ids: [], tier: x.p.tier, vpn: x.p.vpn }; groups.push(by[k]); } by[k].ids.push(x.p.id); });
    S.hideKeys = groups.map(function (g) { return g.ids; });
    var h = '<div class="ncb-hiddenbar"><span class="ncb-dim">Hidden on this model:</span>' +
      (groups.length ? ' <b>' + groups.length + '</b> component' + (groups.length === 1 ? '' : 's') + ' <button class="ncb-lnk" data-act="hidden">' + (S.hidePanel ? 'close' : 'show / unhide') + '</button>' : '') +
      (hl.length ? (groups.length ? ' · ' : ' ') + '<b>' + hl.length + '</b> Lens component' + (hl.length === 1 ? '' : 's') + ' hidden in Lens (left out of "not matched")' + (S.host && S.host.openHidden ? ' <button class="ncb-lnk" data-act="lenshidden">manage in Lens</button>' : '') : '') +
      '<span class="ncb-spacer"></span><span class="ncb-dim" style="font-size:11.5px">Right-click a row or card to hide it · hidden rows stay in the definition · Cadence shows every component</span></div>';
    if (S.hidePanel && groups.length) h += '<div class="ncb-hidelist">' + groups.map(function (g, i) {
      return '<div><span class="ncb-cname" style="font-size:13.5px">' + esc(g.label) + '</span><span class="ncb-meta">' + g.tier + ' · VPN ' + esc(g.vpn) + (g.ids.length > 1 ? ' · ' + g.ids.length + ' part-number rows' : '') + '</span><span class="ncb-spacer"></span><button class="ncb-lnk" data-unhide="' + i + '">unhide</button></div>';
    }).join('') + (groups.length > 1 ? '<div><span class="ncb-spacer"></span><button class="ncb-lnk" data-unhide="*">unhide all</button></div>' : '') + '</div>';
    return h;
  }
  function ctxClose() { var m = document.getElementById('ncb-ctx'); if (m) m.remove(); document.removeEventListener('mousedown', ctxAway, true); document.removeEventListener('keydown', ctxKey, true); }
  function ctxAway(e) { if (!e.target.closest || !e.target.closest('#ncb-ctx')) ctxClose(); }
  function ctxKey(e) { if (e.key === 'Escape') ctxClose(); }
  function ctxMenu(e, title, items) {
    ctxClose();
    var d = document.createElement('div'); d.id = 'ncb-ctx'; d.className = 'ncb-ctx'; d.setAttribute('role', 'menu');
    d.innerHTML = '<div class="ncb-ctx-t">' + esc(title) + '</div>' + items.map(function (it, i) { return '<button role="menuitem" data-i="' + i + '">' + esc(it[0]) + '</button>'; }).join('') +
      '<div class="ncb-ctx-n">A hidden row stays in the definition; Cadence shows every component.</div>';
    document.body.appendChild(d);
    d.style.left = Math.max(4, Math.min(e.clientX, root.innerWidth - d.offsetWidth - 8)) + 'px';
    d.style.top = Math.max(4, Math.min(e.clientY, root.innerHeight - d.offsetHeight - 8)) + 'px';
    d.querySelectorAll('button[data-i]').forEach(function (b) { b.onclick = function () { var it = items[+b.getAttribute('data-i')]; ctxClose(); it[1](); }; });
    var first = d.querySelector('button[data-i]'); if (first) first.focus();
    setTimeout(function () { document.addEventListener('mousedown', ctxAway, true); document.addEventListener('keydown', ctxKey, true); }, 0);
  }
  function pocketMenu(e, v, pid) {
    var all = v.allPockets || v.pockets, x = all.find(function (y) { return y.p.id === pid; });
    if (!x) return;
    e.preventDefault();
    var ids = x.fam ? all.filter(function (y) { return y.fam && y.fam.head === x.fam.head; }).map(function (y) { return y.p.id; }) : [pid];
    var items = [['Hide “' + x.label + '” on the ' + v.m.label + (ids.length > 1 ? ' (its ' + ids.length + ' part-number rows)' : ''), function () { hidePockets(v, ids, x.label); }]];
    if ((v.hiddenPockets || []).length) items.push(['Hidden on this model (' + v.hiddenPockets.length + ')…', function () { S.hidePanel = true; rerender(); }]);
    ctxMenu(e, x.label + ' · ' + v.m.label, items);
  }
  function hidePockets(v, ids, label) {
    var list = benchHiddenList().slice(), at = stampNow();
    ids.forEach(function (pid) { if (!list.some(function (h) { return h.model === v.m.key && h.pid === pid; })) list.push({ model: v.m.key, pid: pid, label: label, at: at }); delete S.open[pid]; });
    setBenchHiddenList(list);
    toast('Hidden on the ' + v.m.label + ': ' + label + '. It stays in the definition, and Cadence shows every component. Unhide it from "Hidden on this model" above the table; SAVE FILE keeps this in the plan.', 'info');
    rerender();
  }
  function gapPanel(v) {
    if (!v.unmatched.length) return '';
    return '<section class="ncb-panel"><h3>Tracked in Lens, not matched to a spares pocket (' + v.unmatched.length + ')</h3><p>Neither the SAP number nor the part number of these components appears in any ' + esc(v.m.label) + ' pocket. Where the name points at a pocket, the part number on file differs from that pocket\'s part list, so one of the two is out of date. They count as <b>Not in review</b> — never as covered, never as zero stock.</p>' +
      ((v.hiddenLens || []).length ? '<p class="ncb-dim" style="margin-top:-4px">Hidden in Lens, so not listed: ' + esc(v.hiddenLens.join(', ')) + '.</p>' : '') +
      '<table class="ncb-mats"><thead><tr><th class="l">Lens component</th><th>Units</th><th>Part number</th><th>SAP number</th><th>Worst life</th><th class="l">What to check</th></tr></thead><tbody>' +
      v.unmatched.map(function (u) { return '<tr><td class="l">' + esc(u.name) + '</td><td class="n">' + u.n + '</td><td class="ncb-mono">' + (esc(u.pn) || '—') + '</td><td class="ncb-mono">' + (esc(u.mm) || '—') + '</td><td class="n">' + (u.worst != null ? Math.round(u.worst * 100) + '%' : '—') + '</td><td class="l">' + (u.hint ? 'Name suggests <b>' + esc(baseName(u.hint)) + '</b> (parts ' + esc((u.hint.vpns || []).slice(0, 3).join(', ')) + (u.hint.vpns.length > 3 ? ', …' : '') + ') — confirm which part number is current' : '<span style="color:var(--nc-text-m)">No pocket for this component on the ' + esc(v.m.label) + ' — add one, or accept the gap</span>') + '</td></tr>'; }).join('') + '</tbody></table></section>';
  }
  function summaryHtml(def, views) {
    var h = '<h1 class="ncb-h">Fleet spares cover</h1><div class="ncb-sub">Every critical component per model, judged on <b>cover after inbound</b> (on the shelf + on the way − reserved). Click a model for its board and table.</div>';
    ['OP', 'UG', 'REF'].forEach(function (g) {
      var ms = def.models.filter(function (m) { return m.group === g; }); if (!ms.length) return;
      // v1.1.2 — the three group tables share one fixed set of column widths, so every column lines up down the page
      h += '<h3 style="font-family:var(--nc-font-head);margin:18px 0 6px">' + GROUP_NAME[g] + (g === 'REF' ? ' <small style="font-weight:400;color:var(--nc-text-m)">· tables only, no machine board</small>' : '') + '</h3><table class="ncb-sumtbl"><colgroup><col style="width:30%"><col style="width:8%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:10%"><col style="width:16%"></colgroup><thead><tr><th class="l">Model</th><th>Units</th><th>Pockets</th><th>Spare</th><th>No spare</th><th>Short</th><th>Not in SAP</th><th>Lens components not matched</th></tr></thead><tbody>';
      ms.forEach(function (m) {
        var v = views[m.key], s = modelSummary(v), d = function (n, k) { return S.idx ? (n ? '<span style="color:' + ST[k].c + '">' + n + '</span>' : ZERO) : '—'; };
        h += '<tr class="ncb-row" data-model="' + esc(m.key) + '"><td class="l"><div class="ncb-cname">' + esc(m.lens.model) + '</div><div class="ncb-meta">' + esc(m.class) + (m.lens.units ? ' · ' + esc(m.lens.units.join(', ')) : '') + '</div></td><td class="n">' + v.units.length + '</td><td class="n">' + v.pockets.length + '</td><td class="n">' + d(s.c.spare, 'spare') + '</td><td class="n">' + d(s.c.nospare, 'nospare') + '</td><td class="n">' + d(s.c.short, 'short') + '</td><td class="n">' + d(s.c.notsap, 'notsap') + '</td><td class="n">' + z(s.unmatched) + '</td></tr>';
      });
      h += '</tbody></table>';
    });
    return h;
  }
  function notInReviewHtml(key) {
    var fm = key.slice(6).split('|'), g = lensModelsNotInReview().find(function (x) { return x.fleet === fm[0] && x.model === fm[1]; });
    if (!g) return '<div class="ncb-empty">Nothing to show.</div>';
    var comps = fleetModelComps(g.fleet, g.model, g.units), names = {};
    comps.forEach(function (c) { names[c.component] = (names[c.component] || 0) + 1; });
    return '<div class="ncb-eyebrow">Not in the spares review · ' + esc(g.fleet.toLowerCase()) + '</div><h1 class="ncb-h">' + esc(g.model) + '</h1><div class="ncb-sub">' + g.units.length + ' ' + (g.units.length === 1 ? 'unit' : 'units') + ' (' + esc(g.units.join(', ')) + ') · ' + comps.length + ' tracked components · no spares pocket defined</div>' +
      '<div class="ncb-banner info" style="margin-top:12px">These components are tracked in Lens for life and dates, but the spares review has no pockets for this ' + (g.partial ? 'unit' : 'model') + '. They show as <b>Not in review</b> — never as covered, never as zero stock. Add the model to the Bench definition to bring it in.</div>' +
      '<table class="ncb-mats"><thead><tr><th class="l">Lens component</th><th>Tracked</th></tr></thead><tbody>' + Object.keys(names).sort().map(function (n) { return '<tr><td class="l">' + esc(n) + '</td><td class="n">' + names[n] + '</td></tr>'; }).join('') + '</tbody></table>';
  }
  function emptyHtml() {
    // v1.1.1 — says what the definition is (not a snapshot or SAP file), where it comes from and how often it changes
    return '<div class="ncb-empty"><h2>No Bench definition in this fleet file</h2>' +
      '<p>The Bench definition is the <b>critical-spares list</b>: which part numbers fit which component on each model, and where each major sits on the machine picture. It is not a SAP export or a snapshot — it is built once from the Cat component snapshots and the Sandvik parts lists (the Critical Spares Review V3 work), and changes only when that list changes.</p>' +
      '<p>Import it once (a <span class="ncb-mono">bench_definition_*.json</span> file), then SAVE FILE: it travels inside the fleet JSON from then on.</p>' +
      '<p><button class="ncb-btn solid" data-act="import">Import Bench definition</button></p>' +
      '<p style="font-size:12px">Stock is never stored in the fleet file: it is read each session from the INV_MSTR in the client folder (or loaded by hand when there is no folder).</p></div>';
  }

  // ══ v1.2.0 — Part numbers · snapshot suggestions · editing by hand · the review · the change log ══════════════
  // Operator 2026-09-27: "I do not want to adjust INVENTORY… I want to be able to see the component details (snapshot
  // stuff) and be able to see what pulls through… maybe even update — either manually or via the upload."
  // Stock is read-only here. Only the definition (which part numbers belong to which component) changes, and only
  // through the review: before / after, tick, Apply — logged in the definition (bench.log) — then SAVE FILE.
  function stampNow() { var d = new Date(), o = -d.getTimezoneOffset(), sg = o >= 0 ? '+' : '-'; o = Math.abs(o); return localIso(d) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) + sg + pad2(Math.floor(o / 60)) + ':' + pad2(o % 60); }
  function nameKey(s) { return String(s || '').replace(/^\s*↳\s*/, '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/S$/, ''); }
  function pocketKeys(p) { var k = new Set((p.vpns || []).map(joinKey)); (p.groups || []).forEach(function (g) { g.forEach(function (v) { k.add(joinKey(v)); }); }); return k; }
  function findModel(key) { var d = benchDef(); return d ? d.models.find(function (m) { return m.key === key; }) || null : null; }
  function findPocket(m, pid) { return m ? m.pockets.find(function (p) { return p.id === pid; }) || null : null; }
  function snapModelKey(s) { return s.benchModel || (s.inUse && s.inUse.benchModel) || ''; }
  function snapFile(s) { return (s.inUse && s.inUse.standardName) || s.fileName || (s.model + '-' + s.prefix + ' Component Snapshot'); }
  // which component a snapshot row is: shared part numbers first (the name breaks a tie — 6015 Front / Rear Swing Drive
  // share theirs), then the name ("Final Drives" = "Final Drive")
  function matchPocket(m, comp) {
    var keys = comp.pns.map(function (x) { return joinKey(x.pn); }), nk = nameKey(comp.component), best = null, bs = -1;
    m.pockets.forEach(function (p, i) {
      var pk = pocketKeys(p), ov = keys.filter(function (k) { return pk.has(k); }).length; if (!ov) return;
      var sc = (nameKey(p.component) === nk ? 1000 : 0) + ov * 10 - i * 0.001;
      if (sc > bs) { bs = sc; best = p; }
    });
    if (best) return { p: best, how: 'shared part numbers' };
    var byName = m.pockets.filter(function (p) { return nameKey(p.component) === nk; })[0];
    return byName ? { p: byName, how: 'the component name' } : null;
  }
  function declinedIds(def) { var d = {}; ((def && def.log) || []).forEach(function (e) { if (e.change === 'declined' && e.id) d[e.id] = 1; }); return d; }
  // What the snapshots in use have that the definition doesn't: part numbers for a component it has ('add'), and
  // components it has no entry for ('new'). Never a removal: a component's list can span several snapshots (775G MJS + FY2).
  // A suggestion declined once is logged and not made again.
  function snapProposals(def, snaps) {
    if (!def) return [];
    var out = [], byId = {}, dec = declinedIds(def);
    (snaps || []).forEach(function (s) {
      var m = def.models.find(function (x) { return x.key === snapModelKey(s); }); if (!m) return;
      var file = snapFile(s);
      var add = function (pr) {
        var e = byId[pr.id]; if (e) { if (e.files.indexOf(file) < 0) e.files.push(file); return; }
        if (dec[pr.id]) return;
        pr.files = [file]; pr.prefix = s.prefix || ''; byId[pr.id] = pr; out.push(pr);
      };
      (s.comps || []).forEach(function (comp) {
        var seen = {}, pns = comp.pns.filter(function (x) { var k = joinKey(x.pn); if (!k || seen[k]) return false; seen[k] = 1; return true; });
        if (!pns.length) return;
        var hit = matchPocket(m, { component: comp.component, pns: pns });
        if (hit && hit.p.groups && hit.p.groups.length) return;   // an assembly's sub-part groups are edited in the definition file
        if (hit) {
          var pk = pocketKeys(hit.p);
          pns.forEach(function (x) {
            if (pk.has(joinKey(x.pn))) return;
            add({ id: 'add|' + m.key + '|' + hit.p.id + '|' + joinKey(x.pn), kind: 'add', by: 'snapshot', model: m.key, pid: hit.p.id, pn: x.pn, type: x.type, col: x.col, comp: comp.component, how: hit.how });
          });
        } else {
          add({ id: 'new|' + m.key + '|' + nameKey(comp.component), kind: 'new', by: 'snapshot', model: m.key, name: comp.component, location: comp.identifier || '', note: comp.note || '',
                pns: pns.map(function (x) { return { pn: x.pn, type: x.type, col: x.col }; }) });
        }
      });
    });
    return out;
  }
  // v1.3.0 (operator: "if there is no snapshot, bench should use the part numbers in Lens") — for a model with no Component
  // Snapshot in the client folder, the part numbers Lens holds are the reference: a Lens component that is not linked
  // and has the SAME name as a component here, position words aside ("Front Differential" = "Differential"; the looser
  // "points at" hint would put a Transmission Charging Pump's number on the Transmission) → 'add' its part numbers. Same review, same log; never
  // a removal; hidden Lens components are left out; a declined one is not suggested again. A Lens component with no
  // component here is not suggested as a new one: Lens tracks every component, the definition is the critical list
  // (it stays in "Tracked in Lens, not matched"). Two Lens components pointing at one component with the same part
  // number (left / right) make one suggestion.
  function lensProposals(def) {
    if (!def || !S.host || !S.host.fleetData) return [];
    var out = [], byId = {}, dec = declinedIds(def), views = S.views || {};
    def.models.forEach(function (m) {
      if (snapsFor(m.key).length) return;
      var v = views[m.key] || modelView(m);
      v.unmatched.forEach(function (u) {
        var pns = Object.keys(u.pnc || {}).filter(function (k) { return k !== '(none)' && joinKey(k); });
        if (!pns.length) return;
        var from = 'Lens: ' + u.name + ' (' + u.n + ' unit' + (u.n === 1 ? '' : 's') + ')';
        var on = function (pn) { var e = u.pnc[pn]; return e.n + ' unit' + (e.n === 1 ? '' : 's'); };
        if (!u.hint || (u.hint.groups && u.hint.groups.length)) return;   // no component here; or an assembly (edited in the definition file)
        if (sameName(u.name) !== sameName(u.hint.component)) return;   // the same component, not just a name that contains its words
        var pk = pocketKeys(u.hint);
        pns.forEach(function (pn) {
          if (pk.has(joinKey(pn))) return;
          var id = 'lens|add|' + m.key + '|' + u.hint.id + '|' + joinKey(pn);
          if (dec[id]) return;
          var e = byId[id], n = u.pnc[pn].n;
          if (e) { e.files.push(from); e.comp += ', ' + u.name; e.nu += n; e.col = e.nu + ' units'; return; }
          e = byId[id] = { id: id, kind: 'add', by: 'Lens', model: m.key, pid: u.hint.id, pn: pn, type: catOf(pn), prefix: 'Lens', col: on(pn), nu: n, comp: u.name, how: 'the component name', files: [from] };
          out.push(e);
        });
      });
    });
    return out;
  }
  function sameName(s) { var o = {}; sig(s).forEach(function (t) { o[t] = 1; }); return Object.keys(o).sort().join(' '); }
  function allProposals() { var d = benchDef(); return snapProposals(d, S.snaps).concat(lensProposals(d)); }
  function propSource(pr) {
    var sn = pr.some(function (x) { return x.by !== 'Lens'; }), ln = pr.some(function (x) { return x.by === 'Lens'; });
    return sn && ln ? 'The Component Snapshots in the client folder, and Lens\'s part numbers for models with no snapshot,' : sn ? 'The Component Snapshots in the client folder' : 'Lens\'s part numbers (for models with no Component Snapshot)';
  }
  function previewSnapshot(sn, d) { var ps = snapProposals(d || benchDef(), [sn]); return { adds: ps.filter(function (p) { return p.kind === 'add'; }).length, newComps: ps.filter(function (p) { return p.kind === 'new'; }).length }; }
  // one part number's stock, read-only: every material it finds (with "SEE" redirects), summed as the pocket does
  function pnStock(pn) {
    if (!S.idx) return null;
    var mats = lookup(S.idx, pn);
    return { mats: mats, amb: ambiguousCode(S.idx, pn), soh: sumf(mats, 'soh'), tr: sumf(mats, 'transit'), po: sumf(mats, 'po'), res: sumf(mats, 'res') };
  }
  function stageToggle(kind, model, pid, pn) {
    var id = 'hand|' + kind + '|' + model + '|' + pid + '|' + joinKey(pn);
    var i = -1; S.staged.forEach(function (s, k) { if (s.id === id) i = k; });
    if (i >= 0) S.staged.splice(i, 1); else S.staged.push({ id: id, kind: kind, by: 'by hand', model: model, pid: pid, pn: pn });
  }
  function logEntry(def, e) { def.log = def.log || []; e.at = e.at || stampNow(); def.log.push(e); }
  function markChanged(what) { S.unsaved = { at: Date.now(), what: what }; if (S.host && S.host.markUnsaved) S.host.markUnsaved(); }
  // apply ticked items (hand edits and snapshot suggestions); unticked snapshot suggestions are declined (logged)
  function applyItems(items, declinedItems) {
    var def = benchDef(); if (!def) return 0;
    var at = stampNow(), n = 0;
    items.forEach(function (it) {
      var m = findModel(it.model); if (!m) return;
      if (it.kind === 'add' || it.kind === 'remove') {
        var p = findPocket(m, it.pid); if (!p) return;
        var before = (p.vpns || []).slice(), k = joinKey(it.pn);
        if (it.kind === 'add') { if (pocketKeys(p).has(k)) return; p.vpns = before.concat([String(it.pn).trim()]); if (!p.vpn) p.vpn = p.vpns[0]; }
        else { if (!before.some(function (v) { return joinKey(v) === k; })) return; p.vpns = before.filter(function (v) { return joinKey(v) !== k; }); if (joinKey(p.vpn) === k) p.vpn = p.vpns[0] || ''; }
        logEntry(def, { at: at, by: it.by, file: (it.files || []).join(', '), model: m.key, pid: p.id, component: baseName(p), change: it.kind === 'add' ? 'added part number' : 'removed part number',
                        pn: it.pn, type: it.type || catOf(it.pn), col: it.col || '', before: before, after: p.vpns.slice(), id: it.id });
        n++;
      } else if (it.kind === 'new') {
        var base = m.key + (it.by === 'Lens' ? '-lens-' : '-snap-') + nameKey(it.name).toLowerCase(), pid = base, q = 2;   // v1.3.0 + Lens
        while (findPocket(m, pid)) pid = base + '-' + (q++);
        var vp = it.pns.map(function (x) { return x.pn; }), news = it.pns.filter(function (x) { return x.type === 'NEW'; });
        m.pockets.push({ id: pid, tier: 'minor', component: it.name, location: it.location || '', vpn: news.length ? news[news.length - 1].pn : vp[0], vpns: vp, added: { from: (it.files || []).join(', '), at: at } });
        logEntry(def, { at: at, by: it.by, file: (it.files || []).join(', '), model: m.key, pid: pid, component: it.name, change: 'added component', pn: vp.join(', '), before: [], after: vp.slice(), id: it.id });
        n++;
      }
      // a snapshot matched by model name (an S/N prefix new to the model) joins the model's snapshot list
      if (it.by === 'snapshot' && it.prefix) {
        m.snapshots = m.snapshots || [];
        var listed = m.snapshots.some(function (f) { return String(f).toUpperCase().indexOf('-' + String(it.prefix).toUpperCase()) > 0; });
        if (!listed && it.files && it.files[0]) m.snapshots.push(it.files[0]);
      }
    });
    (declinedItems || []).forEach(function (it) {
      var m = findModel(it.model), p = m && it.pid ? findPocket(m, it.pid) : null;
      logEntry(def, { at: at, by: it.by, file: (it.files || []).join(', '), model: it.model, pid: it.pid || '', component: p ? baseName(p) : (it.name || ''), change: 'declined',
                      pn: it.kind === 'new' ? it.pns.map(function (x) { return x.pn; }).join(', ') : it.pn, what: it.kind === 'new' ? 'add component' : 'add part number', id: it.id });
    });
    if (n || (declinedItems || []).length) def.updatedAt = at;
    return n;
  }
  // a definition file against the one in the plan: per model, components added / removed / part lists changed
  function defDiff(cur, nb) {
    var out = [], keys = [];
    (cur ? cur.models : []).concat(nb.models).forEach(function (m) { if (keys.indexOf(m.key) < 0) keys.push(m.key); });
    keys.forEach(function (k) {
      var a = cur ? cur.models.find(function (m) { return m.key === k; }) : null, b = nb.models.find(function (m) { return m.key === k; });
      var r = { key: k, label: (b || a).label, a: a ? a.pockets.length : 0, b: b ? b.pockets.length : 0, added: [], removed: [], changed: [] };
      if (!a) r.status = 'added'; else if (!b) r.status = 'removed';
      else {
        b.pockets.forEach(function (p) {
          var q = a.pockets.find(function (x) { return x.id === p.id; });
          if (!q) { r.added.push(baseName(p)); return; }
          var ka = pocketKeys(q), kb = pocketKeys(p);
          var plus = (p.vpns || []).filter(function (v) { return !ka.has(joinKey(v)); }), minus = (q.vpns || []).filter(function (v) { return !kb.has(joinKey(v)); });
          if (plus.length || minus.length) r.changed.push({ name: baseName(p), plus: plus, minus: minus });
        });
        a.pockets.forEach(function (q) { if (!b.pockets.some(function (x) { return x.id === q.id; })) r.removed.push(baseName(q)); });
        r.status = r.added.length || r.removed.length || r.changed.length ? 'changed' : 'same';
      }
      out.push(r);
    });
    return out;
  }
  function applyDefinition(replace) {
    var cur = benchDef(), rv = S.defReview, at = stampNow();
    if (!rv) return;
    if (replace) {
      var nb = JSON.parse(JSON.stringify(rv.bench)), seen = {}, merged = [];
      ((cur && cur.log) || []).concat(nb.log || []).forEach(function (e) { var k = [e.at, e.change, e.model, e.pid, e.pn].join('|'); if (!seen[k]) { seen[k] = 1; merged.push(e); } });
      nb.log = merged;
      var d = defDiff(cur, nb), ch = d.filter(function (r) { return r.status !== 'same'; }).length;
      logEntry(nb, { at: at, by: 'definition file', file: rv.fileName, model: '', component: '', change: cur ? 'replaced the definition' : 'imported the definition', pn: '', what: nb.models.length + ' models; ' + ch + ' differ from the one it replaced' });
      S.host.raw.bench = nb;
      markChanged('the definition from ' + rv.fileName);
      toast('Bench definition ' + (cur ? 'replaced' : 'imported') + ' from ' + rv.fileName + '. SAVE FILE to keep it in the plan.', 'success');
    } else if (cur) {
      logEntry(cur, { at: at, by: 'definition file', file: rv.fileName, model: '', component: '', change: 'declined', pn: '', what: 'kept the current definition' });
      markChanged('a declined definition file (logged)');
      toast('Kept the current definition. The file stays in 3 Archive\\Definitions; the decision is logged.', 'info');
    }
    S.defReview = null; S.tick = {}; S.page = allProposals().length || S.staged.length ? 'review' : '';
    rerender();
  }
  function applyReview() {
    var props = allProposals(), hand = S.staged.slice();
    var ticked = function (id) { return S.tick[id] !== false; };
    var doHand = hand.filter(function (h) { return ticked(h.id); }), doSnap = props.filter(function (p) { return ticked(p.id); }), noSnap = props.filter(function (p) { return !ticked(p.id); });
    if (!doHand.length && !doSnap.length && !noSnap.length) { toast('Nothing ticked.', 'warn'); return; }
    var n = applyItems(doHand.concat(doSnap), noSnap);
    S.staged = S.staged.filter(function (h) { return !ticked(h.id); });
    S.tick = {}; S.page = ''; S.edit = S.staged.length ? S.edit : false;
    markChanged(n + ' change' + (n === 1 ? '' : 's') + (noSnap.length ? ' and ' + noSnap.length + ' declined suggestion' + (noSnap.length === 1 ? '' : 's') : ''));
    toast('Applied ' + n + ' change' + (n === 1 ? '' : 's') + ' to the Bench definition' + (noSnap.length ? ', declined ' + noSnap.length : '') + '. Logged. SAVE FILE to keep them in the plan.', 'success');
    rerender();
  }

  // ── the Part numbers view ──
  function snapsFor(key) { return (S.snaps || []).filter(function (s) { return snapModelKey(s) === key; }); }
  function snapIndex(key) {
    var ix = {};
    snapsFor(key).forEach(function (s) { (s.comps || []).forEach(function (c) { c.pns.forEach(function (x) { var k = joinKey(x.pn); (ix[k] = ix[k] || []).push({ prefix: s.prefix, col: x.col }); }); }); });
    return ix;
  }
  function snapCell(ix, pn, hasSnaps) {
    var e = ix[joinKey(pn)];
    if (e) { var seen = {}; return e.filter(function (x) { var k = x.prefix + x.col; if (seen[k]) return false; seen[k] = 1; return true; }).map(function (x) { return '<span class="ncb-mono" style="font-size:11px">' + esc(x.prefix) + ' · ' + esc(x.col) + '</span>'; }).join('<br>'); }
    return hasSnaps ? '<span class="ncb-dim" style="font-size:11px">not in the snapshot</span>' : '<span class="ncb-dim">—</span>';
  }
  function pullCell(ps) {
    if (!S.idx) return '<span class="ncb-dim">stock not loaded</span>';
    if (ps.amb) return '<span class="ncb-warn">not counted: with leading zeros ignored it matches more than one part number</span>';
    if (!ps.mats.length) return '<span class="ncb-miss">no stock record</span>';
    return ps.mats.map(function (mm) { return '<span class="ncb-mono">SAP ' + esc(mm.material) + '</span> <span class="ncb-ddesc">' + esc(mm.desc) + '</span>'; }).join('<br>');
  }
  function qtyCells(ps) {
    if (!ps || ps.amb || !ps.mats.length) return '<td class="n"></td><td class="n"></td><td class="n"></td>';
    return '<td class="n">' + z(ps.soh) + '</td><td class="n">' + wayCell(ps.po, ps.tr) + '</td><td class="n">' + z(ps.res) + '</td>';
  }
  // the INV_MSTR rows behind one part number, as read, and how Bench counted them
  function rawRows(ps) {
    var out = '';
    ps.mats.forEach(function (mm) {
      var raw = mm.raw || [], hasVal = raw.some(function (r) { return r.val === 'NEW' || r.val === 'REBUILT' || r.val === 'DEFECTIVE'; });
      raw.forEach(function (r) {
        var counted = !hasVal ? 'counted on the shelf' : (r.val === 'NEW' || r.val === 'REBUILT') ? 'counted on the shelf' : r.val === 'DEFECTIVE' ? 'not counted (defective)' : 'not counted (no valuation beside NEW / REBUILT rows)';
        out += '<tr class="ncb-rawrow"><td></td><td class="l" colspan="2"><span class="ncb-mono">SAP ' + esc(mm.material) + '</span> · ' + esc(r.val || 'no valuation type') + (r.plant ? ' · plant ' + esc(r.plant) : '') + (r.sloc ? ' · ' + esc(r.sloc) : '') + '</td>' +
          '<td class="n">' + z(Math.round(r.soh * 100) / 100) + '</td><td class="n">' + z(r.po + r.tr) + (r.po + r.tr ? '<span class="ncb-kit">order ' + r.po + ' · transit ' + r.tr + '</span>' : '') + '</td><td class="n">' + z(r.res) + '</td><td class="l" colspan="3"><span class="ncb-dim">' + counted + '</span></td></tr>';
      });
      out += '<tr class="ncb-rawrow sum"><td></td><td class="l" colspan="8">SAP ' + esc(mm.material) + ' as Bench counts it: shelf <b>' + Math.round(mm.soh) + '</b> (' + (hasVal ? 'NEW + REBUILT rows' : 'all rows') + ') · on the way <b>' + (Math.round(mm.po) + Math.round(mm.transit)) + '</b> and reserved <b>' + Math.round(mm.res) + '</b> (the average over its ' + raw.length + ' row' + (raw.length === 1 ? '' : 's') + ', as Critical Spares V3 did)</td></tr>';
    });
    return out;
  }
  function viewSwitch() {
    return '<div class="ncb-views" role="tablist"><button data-view="stock"' + (S.view === 'stock' ? ' class="on"' : '') + '>Stock</button><button data-view="parts"' + (S.view === 'parts' ? ' class="on"' : '') + '>Part numbers</button></div>';
  }
  function partsHtml(v) {
    var m = v.m, snaps = snapsFor(m.key), sx = snapIndex(m.key), props = allProposals().filter(function (p) { return p.model === m.key; });
    var comps = fleetModelComps(m.lens.fleet, m.lens.model, m.lens.units), lensPn = {};
    comps.forEach(function (c) { var k = joinKey(c.part_number); if (k) (lensPn[k] = lensPn[k] || []).push(c.unit); });
    var tot = { comps: 0, pns: 0, hit: 0, miss: 0, amb: 0, nolens: 0 };
    var rowsFor = function (x) {
      var p = x.p, list = [];
      (p.groups && p.groups.length ? p.groups.map(function (g, gi) { return { gi: gi, vs: g }; }) : [{ gi: null, vs: p.vpns || [] }]).forEach(function (g) {
        g.vs.forEach(function (pn) { list.push({ pn: pn, gi: g.gi, ps: pnStock(pn) }); });
      });
      return list;
    };
    var blocks = [];
    v.pockets.forEach(function (x) {
      var list = rowsFor(x), p = x.p;
      var sug = props.filter(function (pr) { return pr.kind === 'add' && pr.pid === p.id; });
      var stAdd = S.staged.filter(function (s) { return s.kind === 'add' && s.model === m.key && s.pid === p.id; });
      var likely = v.unmatched.filter(function (u) { return u.hint === p; });
      var noStock = S.idx && list.some(function (r) { return !r.ps.amb && !r.ps.mats.length; });
      if (S.pfilter === 'nostock' && !noStock) return;
      if (S.pfilter === 'nolens' && x.lens.length) return;
      if (S.pfilter === 'snap' && !sug.length) return;
      tot.comps++; if (!x.lens.length) tot.nolens++;
      list.forEach(function (r) { tot.pns++; if (r.ps) { if (r.ps.amb) tot.amb++; else if (r.ps.mats.length) tot.hit++; else tot.miss++; } });
      blocks.push({ x: x, list: list, sug: sug, stAdd: stAdd, likely: likely });
    });
    var h = '<div class="ncb-eyebrow" style="margin-top:6px">' + esc(m.brand || '') + ' · part numbers</div><h1 class="ncb-h">' + esc(m.label) + '</h1>' +
      '<div class="ncb-sub">' + esc(m.class || '') + ' · ' + v.units.length + ' ' + (v.units.length === 1 ? 'unit' : 'units') + ' · which part numbers make up each component, and what each one pulls through from the INV_MSTR (read-only)</div>';
    h += '<div class="ncb-stmt" style="margin-top:10px">' + tot.comps + ' component' + (tot.comps === 1 ? '' : 's') + ' · ' + tot.pns + ' part numbers' +
      (S.idx ? ' — <b style="color:var(--ncb-spare)">' + tot.hit + '</b> pull through to a stock record, <b style="color:#fdba74">' + tot.miss + '</b> don\'t' + (tot.amb ? ', <b>' + tot.amb + '</b> ambiguous' : '') : ' — load stock to see what they pull through') +
      ' · ' + (tot.comps - tot.nolens) + ' of ' + tot.comps + ' linked to Lens</div>';
    var snapLine = snaps.length ? 'Snapshot' + (snaps.length > 1 ? 's' : '') + ' in the client folder: ' + snaps.map(function (s) { return '<span class="ncb-mono">' + esc(snapFile(s)) + '</span>' + (s.inUse && s.inUse.refreshedAt ? ' (filed ' + fmtDate(String(s.inUse.refreshedAt).slice(0, 10)) + ')' : ''); }).join(', ') +
        (props.length ? ' · <b>' + props.length + '</b> suggestion' + (props.length === 1 ? '' : 's') + ' not in the definition <button class="ncb-btn" data-act="review">Review</button>' : (function () { var dn = ((benchDef() || {}).log || []).filter(function (e) { return e.model === m.key && e.change === 'declined'; }).length; return ' · nothing left to review' + (dn ? ' (' + dn + ' declined suggestion' + (dn === 1 ? '' : 's') + ', in the change log)' : ': the definition has everything they list'); })())
      : 'No Component Snapshot for this model in the client folder' + ((m.snapshots || []).length ? ' (the definition was built from ' + esc(m.snapshots.join(', ')) + ')' : '') + '. Drop one in <b>1 New files</b> to compare. ' +
        // v1.3.0 — until then Lens's part numbers are the reference
        'Until then <b>Lens\'s part numbers</b> are the reference' + (props.length ? ': <b>' + props.length + '</b> suggestion' + (props.length === 1 ? '' : 's') + ' not in the definition <button class="ncb-btn" data-act="review">Review</button>' : ': they add nothing the definition doesn\'t have.');
    h += '<div class="ncb-note" style="margin-bottom:8px">' + snapLine + '</div>';
    h += '<div class="ncb-filters">' + [['all', 'All'], ['nostock', 'No stock record'], ['nolens', 'Not linked to Lens'], ['snap', 'Suggestions']].map(function (f) { return '<button class="ncb-fb' + (S.pfilter === f[0] ? ' on' : '') + '" data-pfilter="' + f[0] + '">' + f[1] + '</button>'; }).join('') +
      '<span class="ncb-spacer"></span>' + (S.edit ? '<button class="ncb-btn solid" data-act="editoff">Done editing</button>' : '<button class="ncb-btn" data-act="editon" title="Add or remove part numbers by hand. Nothing changes until you review and apply.">✎ Edit part numbers</button>') + '</div>';
    if (S.staged.length) h += '<div class="ncb-banner info"><span class="ncb-dot" style="color:var(--ncb-accent)"></span><span><b>' + S.staged.length + '</b> change' + (S.staged.length === 1 ? '' : 's') + ' by hand waiting for review (nothing has changed yet).</span> <button class="ncb-btn solid" data-act="review">Review and apply</button></div>';
    h += '<div class="ncb-tscroll"><table class="ncb-parts"><colgroup><col style="width:70px"><col style="width:150px"><col><col style="width:72px"><col style="width:112px"><col style="width:78px"><col style="width:120px"><col style="width:84px"><col style="width:92px"></colgroup>' +
      '<thead><tr><th>Type</th><th class="l">Part number</th><th class="l">Pulls through to (INV_MSTR, read-only)</th><th>On shelf</th><th>On the way</th><th>Reserved</th><th>In snapshot</th><th>Lens units</th><th></th></tr></thead><tbody>';
    blocks.forEach(function (b) {
      var x = b.x, p = x.p, f = x.fam, cont = f && !f.first, asm = !!(p.groups && p.groups.length);
      var lensTxt = x.lens.length ? '<span class="ncb-lens">Lens: ' + x.lens.map(function (l) { return esc(l.name); }).join(', ') + ' · ' + x.lens.reduce(function (s, l) { return s + l.n; }, 0) + ' units · by ' + esc(x.lens[0].how) + '</span>'
        : b.likely.length ? '<span class="ncb-warn">Lens: ' + b.likely.map(function (u) { return esc(u.name); }).join(', ') + ' — part numbers don\'t match</span>' : '<span class="ncb-dim">not tracked in Lens</span>';
      var addCtl = !S.edit ? '' : asm ? '<span class="ncb-dim" style="font-size:11px">assembly: edit its sub-part groups in the definition file</span>'
        : '<span class="ncb-add"><input data-addin="' + esc(p.id) + '" placeholder="part number" aria-label="Part number to add to ' + esc(x.label) + '"><button class="ncb-btn" data-add="' + esc(p.id) + '">+ Add</button></span>';
      h += '<tr class="ncb-prow"><td colspan="9"><div class="ncb-pline"><span class="ncb-cname">' + (cont ? '<span class="ncb-arrow">↳</span>' : '') + esc(x.label) + (f ? unitChips(f.units) : '') + '</span>' +
        '<span class="ncb-meta">' + p.tier + (p.location ? ' · ' + esc(p.location) : '') + ' · ' + b.list.length + ' part number' + (b.list.length === 1 ? '' : 's') + (asm ? ' · assembly, ' + p.groups.length + ' sub-part groups' : '') + (p.added ? ' · added from ' + esc(p.added.from) : '') + '</span>' +
        '<span class="ncb-spacer"></span>' + lensTxt + addCtl + '</div></td></tr>';
      var lastG = null;
      b.list.forEach(function (r) {
        if (asm && r.gi !== lastG) { lastG = r.gi; h += '<tr class="ncb-pgrp"><td></td><td class="l" colspan="8">Sub-part group ' + (r.gi + 1) + ' of ' + p.groups.length + '</td></tr>'; }
        var rid = p.id + '|' + r.pn, stRem = S.staged.some(function (s) { return s.kind === 'remove' && s.model === v.m.key && s.pid === p.id && joinKey(s.pn) === joinKey(r.pn); });
        var miss = r.ps && !r.ps.amb && !r.ps.mats.length;
        var lu = lensPn[joinKey(r.pn)] || [];
        var act = S.edit ? (asm ? '' : '<button class="ncb-lnk' + (stRem ? ' on' : '') + '" data-rm="' + esc(rid) + '" title="' + (stRem ? 'Keep it (undo)' : 'Remove it from this component (after review)') + '">' + (stRem ? 'undo' : '✕ remove') + '</button>')
          : (r.ps && r.ps.mats.length ? '<button class="ncb-lnk" data-raw="' + esc(rid) + '" title="The INV_MSTR rows behind these numbers">' + (S.raw[rid] ? 'rows ▾' : 'rows ▸') + '</button>' : '');
        h += '<tr class="ncb-pnrow' + (miss ? ' miss' : '') + (stRem ? ' staged-rem' : '') + '"><td><span class="ncb-pill ' + catOf(r.pn) + '">' + catOf(r.pn) + '</span></td><td class="l"><span class="ncb-mono">' + esc(r.pn) + '</span>' + (r.pn === p.vpn ? ' <span class="ncb-dim" style="font-size:10px" title="The number shown on the card and in the stock table">· shown</span>' : '') + '</td>' +
          '<td class="l pt">' + pullCell(r.ps || { mats: [] }) + '</td>' + qtyCells(r.ps) + '<td>' + snapCell(sx, r.pn, snaps.length > 0) + '</td>' +
          '<td class="n" title="' + esc(lu.slice().sort().join(', ')) + '">' + (lu.length ? lu.length : '<span class="ncb-dim">—</span>') + '</td><td>' + act + '</td></tr>';
        if (!S.edit && S.raw[rid] && r.ps && r.ps.mats.length) h += rawRows(r.ps);
      });
      b.stAdd.forEach(function (s) {
        var ps = pnStock(s.pn);
        h += '<tr class="ncb-pnrow staged-add"><td><span class="ncb-pill ' + catOf(s.pn) + '">' + catOf(s.pn) + '</span></td><td class="l"><span class="ncb-mono">' + esc(s.pn) + '</span> <span class="ncb-dim" style="font-size:10px" title="Added by hand; waiting for the review">· to add</span></td><td class="l pt">' + pullCell(ps || { mats: [] }) + '</td>' + qtyCells(ps) +
          '<td>' + snapCell(sx, s.pn, snaps.length > 0) + '</td><td class="n">' + ((lensPn[joinKey(s.pn)] || []).length || '<span class="ncb-dim">—</span>') + '</td><td><button class="ncb-lnk on" data-unstage="' + esc(s.id) + '">undo</button></td></tr>';
      });
      b.sug.forEach(function (pr) {
        var ps = pnStock(pr.pn);
        h += '<tr class="ncb-pnrow sugg"><td><span class="ncb-pill ' + esc(pr.type) + '">' + esc(pr.type) + '</span></td><td class="l"><span class="ncb-mono">' + esc(pr.pn) + '</span> <span class="ncb-dim" style="font-size:10px" title="' + (pr.by === 'Lens' ? 'On Lens components' : 'In the snapshot') + ', not in the definition yet">· suggested</span></td><td class="l pt">' + pullCell(ps || { mats: [] }) + '</td>' + qtyCells(ps) +
          '<td><span class="ncb-mono" style="font-size:11px">' + esc(pr.prefix) + ' · ' + esc(pr.col) + '</span></td><td class="n">' + ((lensPn[joinKey(pr.pn)] || []).length || '<span class="ncb-dim">—</span>') + '</td><td><button class="ncb-lnk" data-act="review">review</button></td></tr>';
      });
    });
    var newc = props.filter(function (pr) { return pr.kind === 'new'; });
    if (newc.length && (S.pfilter === 'all' || S.pfilter === 'snap')) {
      h += '<tr class="ncb-prow"><td colspan="9"><div class="ncb-pline"><span class="ncb-cname" style="color:#a7f3d0">' + (newc.every(function (pr) { return pr.by === 'Lens'; }) ? 'In Lens' : newc.some(function (pr) { return pr.by === 'Lens'; }) ? 'In a snapshot or in Lens' : 'In the snapshot') + ', not in the definition</span><span class="ncb-meta">' + newc.length + ' component' + (newc.length === 1 ? '' : 's') + ' · suggestions until you review them</span><span class="ncb-spacer"></span><button class="ncb-btn" data-act="review">Review</button></div></td></tr>';
      newc.forEach(function (pr) {
        pr.pns.forEach(function (x, i) {
          var ps = pnStock(x.pn);
          h += '<tr class="ncb-pnrow sugg"><td><span class="ncb-pill ' + esc(x.type) + '">' + esc(x.type) + '</span></td><td class="l"><span class="ncb-mono">' + esc(x.pn) + '</span>' + (i === 0 ? ' <span class="ncb-dim" style="font-size:10px">· ' + esc(pr.name) + (pr.location ? ' (' + esc(pr.location) + ')' : '') + '</span>' : '') + '</td><td class="l pt">' + pullCell(ps || { mats: [] }) + '</td>' + qtyCells(ps) +
            '<td><span class="ncb-mono" style="font-size:11px">' + esc(pr.prefix) + ' · ' + esc(x.col) + '</span></td><td class="n">' + ((lensPn[joinKey(x.pn)] || []).length || '<span class="ncb-dim">—</span>') + '</td><td></td></tr>';
        });
      });
    }
    h += '</tbody></table></div>';
    var lg = ((benchDef() || {}).log || []).filter(function (e) { return e.model === m.key; });
    h += '<div class="ncb-note" style="margin-top:10px">Stock is read from the INV_MSTR and never changed here. Changes to this list are made by hand (✎ Edit part numbers) or from a Component Snapshot, always through the review, and logged: ' +
      '<button class="ncb-lnk" data-act="log">change log' + (lg.length ? ' (' + lg.length + ' for ' + esc(m.label) + ')' : '') + '</button>.</div>';
    return h;
  }

  // ── the review page ──
  function chip(pn, cls, extra) { return '<span class="ncb-pnchip' + (cls ? ' ' + cls : '') + '"><span class="ncb-pill ' + catOf(pn) + '">' + catOf(pn) + '</span> ' + esc(pn) + (extra || '') + '</span>'; }
  function stockWords(pn) {
    var ps = pnStock(pn); if (!ps) return '';
    if (ps.amb) return ' <span class="ncb-warn" style="font-size:11px">ambiguous in the INV_MSTR</span>';
    if (!ps.mats.length) return ' <span class="ncb-miss" style="font-size:11px">no stock record</span>';
    return ' <span class="ncb-dim" style="font-size:11px">SAP ' + esc(ps.mats.map(function (x) { return x.material; }).join(', ')) + ' · shelf ' + ps.soh + '</span>';
  }
  function tickBox(id) { return '<input type="checkbox" data-tick="' + esc(id) + '"' + (S.tick[id] === false ? '' : ' checked') + '>'; }
  function reviewHtml() {
    var def = benchDef(), h = '<div class="ncb-eyebrow" style="margin-top:6px">Bench · the definition</div><h1 class="ncb-h">Review changes</h1>' +
      '<div class="ncb-sub">Nothing changes until you press Apply. Only the definition changes (which part numbers belong to which component); stock (INV_MSTR) is never changed here. Every change, and every suggestion you decline, is logged in the definition. Then SAVE FILE.</div>';
    if (S.defReview) {
      var rv = S.defReview, d = defDiff(def, rv.bench), diff = d.filter(function (r) { return r.status !== 'same'; });
      h += '<h3 class="ncb-h3">Bench definition file · <span class="ncb-mono">' + esc(rv.fileName) + '</span></h3>' +
        '<div class="ncb-note">' + rv.bench.models.length + ' models' + (rv.bench.updatedAt ? ', updated ' + esc(String(rv.bench.updatedAt).slice(0, 10)) : '') + '. ' + (def ? diff.length + ' of ' + d.length + ' models differ from the definition in the plan (' + def.models.length + ' models).' : 'The plan has no definition yet.') + '</div>' +
        '<div class="ncb-note">Key: ' + chip('1234567', 'add') + ' the file has it and the plan doesn\'t (it would be added) · ' + chip('1234567', 'rem') + ' the plan has it and the file doesn\'t (it would be removed) · <span style="color:#a7f3d0">+ component</span> / <span style="color:#fca5a5">− component</span> likewise.</div>';
      h += '<table class="ncb-mats" style="max-width:none;margin-top:8px"><thead><tr><th class="l">Model</th><th>Components now → in the file</th><th class="l">What changes</th></tr></thead><tbody>' +
        d.map(function (r) {
          var what = r.status === 'added' ? '<span style="color:#a7f3d0">new model</span>' : r.status === 'removed' ? '<span style="color:#fca5a5">model not in the file (it would be removed)</span>' : r.status === 'same' ? '<span class="ncb-dim">no change</span>'
            : [r.added.length ? '<span style="color:#a7f3d0">+ ' + esc(r.added.join(', ')) + '</span>' : '', r.removed.length ? '<span style="color:#fca5a5">− ' + esc(r.removed.join(', ')) + '</span>' : '',
               r.changed.map(function (c) { return esc(c.name) + ': ' + c.plus.map(function (x) { return chip(x, 'add'); }).join('') + c.minus.map(function (x) { return chip(x, 'rem'); }).join(''); }).join('<br>')].filter(Boolean).join('<br>');
          return '<tr><td class="l"><b>' + esc(r.label) + '</b></td><td class="n">' + r.a + ' → ' + r.b + '</td><td class="l">' + what + '</td></tr>';
        }).join('') + '</tbody></table>';
      h += '<div class="ncb-revfoot"><button class="ncb-btn solid" data-act="defreplace">' + (def ? 'Replace the definition with this file' : 'Use this definition') + '</button>' + (def ? '<button class="ncb-btn" data-act="defkeep">Keep the current one</button>' : '') +
        '<button class="ncb-btn ghost" data-act="back">Back</button><span class="ncb-note" style="margin:0">' + (def ? 'Replacing keeps the change log. Either way the decision is logged.' : '') + '</span></div>';
      return h;
    }
    var props = allProposals(), hand = S.staged, n = 0;
    if (!props.length && !hand.length) return h + '<div class="ncb-empty" style="margin:30px 0">Nothing to review: no changes by hand, the Component Snapshots in the client folder list nothing the definition doesn\'t have, and for models with no snapshot Lens\'s part numbers add nothing.<p><button class="ncb-btn" data-act="back">Back</button></p></div>';
    if (hand.length) {
      h += '<h3 class="ncb-h3">By hand · ' + hand.length + '</h3>';
      var byP = {};
      hand.forEach(function (s) { var k = s.model + '|' + s.pid; (byP[k] = byP[k] || []).push(s); });
      Object.keys(byP).forEach(function (k) {
        var list = byP[k], m = findModel(list[0].model), p = findPocket(m, list[0].pid); if (!p) return;
        h += '<div class="ncb-rcard"><h4>' + esc(baseName(p)) + ' <span class="ncb-meta">' + esc(m.label) + ' · ' + p.tier + '</span></h4><div class="ncb-ba"><span class="ncb-dim">Now</span><div>' + (p.vpns || []).map(function (x) { return chip(x); }).join('') + '</div>' +
          '<span class="ncb-dim">Change</span><div>' + list.map(function (s) { n++; return '<label class="ncb-tickl">' + tickBox(s.id) + chip(s.pn, s.kind === 'add' ? 'add' : 'rem', s.kind === 'add' ? stockWords(s.pn) : '') + '</label>'; }).join('') + '</div></div></div>';
      });
    }
    // v1.3.0 — snapshot suggestions, then Lens's (models with no snapshot), each in its own section
    [props.filter(function (pr) { return pr.by !== 'Lens'; }), props.filter(function (pr) { return pr.by === 'Lens'; })].forEach(function (props, sec) {
      if (!props.length) return;
      h += sec === 0 ? '<h3 class="ncb-h3">From Component Snapshots · ' + props.length + '</h3><div class="ncb-note">Part numbers and components a snapshot in <code>2 In use\\Snapshots</code> lists and the definition doesn\'t. Untick what should not be added: it is declined, logged, and not suggested again.</div>'
        : '<h3 class="ncb-h3">From Lens · ' + props.length + '</h3><div class="ncb-note">For a model with <b>no Component Snapshot</b> in the client folder, the part numbers Lens holds are the reference: a Lens component with the same name as a component here (the same words once left / right / front / rear and words like "cyl" are set aside), with a part number its list doesn\'t have. (A Lens component with no component of that name here is not suggested: it stays in "Tracked in Lens, not matched".) Components hidden in Lens are left out. Untick what should not be added: it is declined, logged, and not suggested again.</div>';
      var models = []; props.forEach(function (pr) { if (models.indexOf(pr.model) < 0) models.push(pr.model); });
      models.forEach(function (mk) {
        var m = findModel(mk), mp = props.filter(function (pr) { return pr.model === mk; });
        var files = []; mp.forEach(function (pr) { pr.files.forEach(function (f) { if (files.indexOf(f) < 0) files.push(f); }); });
        h += '<div class="ncb-rmodel"><b>' + esc(m.label) + '</b> <span class="ncb-dim">· from ' + (sec === 0 ? esc(files.join(', ')) : 'Lens (no Component Snapshot for this model)') + '</span></div>';
        var byP = {}, order = [];
        mp.forEach(function (pr) { var k = pr.kind === 'new' ? pr.id : pr.pid; if (!byP[k]) { byP[k] = []; order.push(k); } byP[k].push(pr); });
        order.forEach(function (k) {
          var list = byP[k];
          if (list[0].kind === 'new') {
            var pr = list[0]; n++;
            h += '<div class="ncb-rcard new"><h4><label class="ncb-tickl">' + tickBox(pr.id) + ' New component: ' + esc(pr.name) + '</label> <span class="ncb-meta">' + esc(m.label) + (pr.location ? ' · ' + esc(pr.location) : '') + (pr.by === 'Lens' ? ' · ' + esc(pr.files[0]) : '') + ' · added as a minor component</span></h4>' +
              '<div class="ncb-ba"><span class="ncb-dim">Now</span><div class="ncb-dim">not in the definition</div><span class="ncb-dim">After</span><div>' + pr.pns.map(function (x) { return chip(x.pn, 'add', ' <span class="ncb-dim" style="font-size:10px">' + esc(x.col) + '</span>' + stockWords(x.pn)); }).join('') + '</div></div>' +
              (pr.note ? '<div class="ncb-note">Snapshot note: ' + esc(pr.note) + '</div>' : '') + '</div>';
            return;
          }
          var p = findPocket(m, k);
          h += '<div class="ncb-rcard"><h4>' + esc(baseName(p)) + ' <span class="ncb-meta">' + esc(m.label) + ' · ' + p.tier + (list[0].by === 'Lens' ? ' · Lens component "' + esc(list[0].comp) + '" (same name)' : ' · snapshot row "' + esc(list[0].comp) + '", matched by ' + esc(list[0].how)) + '</span></h4>' +
            '<div class="ncb-ba"><span class="ncb-dim">Now</span><div>' + (p.vpns || []).map(function (x) { return chip(x); }).join('') + '</div>' +
            '<span class="ncb-dim">Add</span><div>' + list.map(function (pr) { n++; return '<label class="ncb-tickl">' + tickBox(pr.id) + chip(pr.pn, 'add', ' <span class="ncb-dim" style="font-size:10px">' + esc(pr.col) + '</span>' + stockWords(pr.pn)) + '</label>'; }).join('') + '</div></div></div>';
        });
      });
    });
    h += '<div class="ncb-revfoot"><button class="ncb-btn solid" data-act="apply">Apply the ticked changes</button><button class="ncb-btn ghost" data-act="back">Back (nothing changes)</button>' +
      '<span class="ncb-note" style="margin:0">' + n + ' item' + (n === 1 ? '' : 's') + '. Unticked suggestions are declined (logged); unticked hand edits stay waiting.</span></div>';
    return h;
  }
  function logHtml() {
    var def = benchDef(), all = ((def && def.log) || []).slice().reverse();
    var mine = S.model && S.model.indexOf('notin:') !== 0 ? all.filter(function (e) { return e.model === S.model || !e.model; }) : all;
    var h = '<div class="ncb-eyebrow" style="margin-top:6px">Bench · the definition</div><h1 class="ncb-h">Change log</h1>' +
      '<div class="ncb-sub">Every change to the definition (by hand, from a snapshot, from a definition file) and every declined suggestion, newest first. It travels in the plan with the definition.' + (mine.length !== all.length ? ' Showing ' + esc(S.model) + ' (' + mine.length + ' of ' + all.length + ').' : '') + '</div>';
    if (!mine.length) return h + '<div class="ncb-empty" style="margin:30px 0">No changes logged yet.<p><button class="ncb-btn" data-act="back">Back</button></p></div>';
    h += '<table class="ncb-mats ncb-log" style="max-width:none;margin-top:10px"><thead><tr><th class="l">When</th><th class="l">Model</th><th class="l">Component</th><th class="l">Change</th><th class="l">Part number(s)</th><th class="l">How</th><th class="l">From</th></tr></thead><tbody>' +
      mine.map(function (e) {
        var col = e.change === 'declined' ? 'var(--nc-text-d)' : /removed/.test(e.change) ? '#fca5a5' : '#a7f3d0';
        return '<tr><td class="l ncb-mono" style="white-space:nowrap">' + esc(String(e.at || '').slice(0, 16).replace('T', ' ')) + '</td><td class="l">' + esc(e.model || '—') + '</td><td class="l">' + esc(e.component || '') + '</td><td class="l" style="color:' + col + '">' + esc(e.change) + (e.what ? ' <span class="ncb-dim">(' + esc(e.what) + ')</span>' : '') + '</td>' +
          '<td class="l ncb-mono">' + esc(e.pn || '') + '</td><td class="l">' + esc(e.by || '') + '</td><td class="l" style="font-size:11.5px">' + esc(e.file || '') + '</td></tr>';
      }).join('') + '</tbody></table><p><button class="ncb-btn" data-act="back">Back</button></p>';
    return h;
  }

  function rerender() { if (S.el && S.host) render(S.el, S.host); }
  function render(el, host) {
    injectStyle();
    S.el = el; S.host = host;
    // a different fleet file was loaded (v1.2.0: hand edits and reviews belonged to the old one)
    if (S.rawRef !== host.raw) { S.rawRef = host.raw; S.model = ''; S.open = {}; S.staged = []; S.page = ''; S.defReview = null; S.tick = {}; S.edit = false; S.unsaved = null; S.raw = {}; }
    var cc = host.clientCode || 'DEFAULT';                                               // v1.1.0 — stock never carries over to another client
    // v1.1.1 — a new client also resets the view (model, open rows, filter), not just the stock
    if (S.cc && S.cc !== cc) { S.idx = null; S.stock = null; S.prev = null; S.askDate = false; S.model = ''; S.open = {}; S.filter = 'all'; S.snaps = []; }
    S.cc = cc;
    // v1.2.0 — "not saved yet" clears once the plan has been saved after the change
    if (S.unsaved && host.planSaved) { var ps = Date.parse(host.planSaved); if (ps && ps >= S.unsaved.at - 1000) S.unsaved = null; }
    var def = benchDef();
    var main;
    var views = {};
    if (def) def.models.forEach(function (m) { views[m.key] = modelView(m); });
    S.views = views;   // v1.3.0 — Lens's suggestions read this render's model views
    if (!def && S.defReview) S.page = 'review';
    if (S.page === 'review') main = topBar() + banners() + reviewHtml();
    else if (S.page === 'log' && def) main = topBar() + banners() + logHtml();
    else if (!def) main = topBar() + banners() + emptyHtml();
    else if (!S.model) main = topBar() + banners() + summaryHtml(def, views);
    else if (S.model.indexOf('notin:') === 0) main = topBar() + banners() + notInReviewHtml(S.model);
    else if (S.view === 'parts' && views[S.model]) main = topBar() + banners() + viewSwitch() + partsHtml(views[S.model]);
    else {
      var v = views[S.model];
      if (!v) { S.model = ''; return render(el, host); }
      main = topBar() + banners() + viewSwitch() + boardHtml(v) + tiles(v) +
        '<div class="ncb-rule"><b>Cover after inbound</b> = on the shelf + on the way (on order + in transit) − reserved. The status is judged on it; every row still shows all four, so a spare that exists only on a truck is never mistaken for one on the shelf. Click a card or a row for the SAP detail; right-click one to hide it.</div>' +
        '<div class="ncb-filters">' + [['all', 'All ' + v.pockets.length], ['major', 'Majors'], ['minor', 'Minors'], ['attn', 'Needs attention']].map(function (f) { return '<button class="ncb-fb' + (S.filter === f[0] ? ' on' : '') + '" data-filter="' + f[0] + '">' + f[1] + '</button>'; }).join('') + '</div>' +
        hiddenBar(v) + tableHtml(v) + gapPanel(v);   // v1.3.0 + hiddenBar
    }
    // keep the reader where they were: a re-render (opening a row, a filter) must not jump to the top
    var pm = el.querySelector('.ncb-main'), pl = el.querySelector('.ncb-list');
    var keepMain = pm ? pm.scrollTop : 0, keepList = pl ? pl.scrollTop : 0;
    el.innerHTML = '<div class="ncb">' + (def ? '<aside class="ncb-list"><div class="ncb-mi' + (!S.model ? ' on' : '') + '" data-model=""><b>Fleet summary</b><span>' + def.models.length + ' models in the spares review</span></div>' + listHtml(def, views) + '</aside>' : '') + '<div class="ncb-main"><div class="ncb-col">' + main + '</div></div></div>';
    wire(el, views);
    if (S.model && views[S.model] && !S.page && S.view !== 'parts') layoutBoard(views[S.model]);   // sets the board height synchronously, so the scroll below lands right
    var nm = el.querySelector('.ncb-main'), nl = el.querySelector('.ncb-list');
    if (nm) nm.scrollTop = keepMain;
    if (nl) nl.scrollTop = keepList;
  }
  function wire(el, views) {
    el.querySelectorAll('[data-model]').forEach(function (n) { n.onclick = function () { S.model = n.getAttribute('data-model'); S.filter = 'all'; S.open = {}; S.raw = {}; S.hidePanel = false; if (S.page === 'log' || (S.page === 'review' && !S.defReview)) S.page = ''; rerender(); var mn = el.querySelector('.ncb-main'); if (mn) mn.scrollTop = 0; }; });
    el.querySelectorAll('[data-filter]').forEach(function (n) { n.onclick = function () { S.filter = n.getAttribute('data-filter'); rerender(); }; });
    // v1.2.0 — the Part numbers view, editing by hand, the review
    el.querySelectorAll('[data-view]').forEach(function (n) { n.onclick = function () { S.view = n.getAttribute('data-view'); rerender(); }; });
    el.querySelectorAll('[data-pfilter]').forEach(function (n) { n.onclick = function () { S.pfilter = n.getAttribute('data-pfilter'); rerender(); }; });
    el.querySelectorAll('[data-raw]').forEach(function (n) { n.onclick = function () { var k = n.getAttribute('data-raw'); S.raw[k] = !S.raw[k]; rerender(); }; });
    el.querySelectorAll('[data-rm]').forEach(function (n) { n.onclick = function () { var k = n.getAttribute('data-rm'), cut = k.indexOf('|'); stageToggle('remove', S.model, k.slice(0, cut), k.slice(cut + 1)); rerender(); }; });
    el.querySelectorAll('[data-unstage]').forEach(function (n) { n.onclick = function () { var id = n.getAttribute('data-unstage'); S.staged = S.staged.filter(function (s) { return s.id !== id; }); rerender(); }; });
    el.querySelectorAll('[data-tick]').forEach(function (n) { n.onchange = function () { S.tick[n.getAttribute('data-tick')] = n.checked; }; });
    el.querySelectorAll('[data-add]').forEach(function (n) {
      var pid = n.getAttribute('data-add'), inp = el.querySelector('[data-addin="' + CSS.escape(pid) + '"]');
      var go = function () {
        var pn = String(inp && inp.value || '').trim(), m = findModel(S.model), p = findPocket(m, pid);
        if (!pn || !p) { toast('Type a part number first.', 'warn'); return; }
        if (pocketKeys(p).has(joinKey(pn))) { toast(pn + ' is already on ' + baseName(p) + '.', 'warn'); return; }
        if (S.staged.some(function (s) { return s.kind === 'add' && s.pid === pid && joinKey(s.pn) === joinKey(pn); })) { toast(pn + ' is already waiting to be added.', 'warn'); return; }
        stageToggle('add', S.model, pid, pn); rerender();
        var again = el.querySelector('[data-addin="' + CSS.escape(pid) + '"]'); if (again) again.focus();
      };
      n.onclick = go;
      if (inp) inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } };
    });
    el.querySelectorAll('tr.ncb-row[data-id]').forEach(function (n) {
      n.onclick = function () { var id = n.getAttribute('data-id'); S.open[id] = !S.open[id]; rerender(); };
      n.oncontextmenu = function (e) { var v = views[S.model]; if (v) pocketMenu(e, v, n.getAttribute('data-id')); };   // v1.3.0 — right-click → Hide
    });
    // v1.3.0 — unhide from the "Hidden on this model" list
    el.querySelectorAll('[data-unhide]').forEach(function (n) {
      n.onclick = function () {
        var k = n.getAttribute('data-unhide'), key = S.model, ids = k === '*' ? null : (S.hideKeys[+k] || []);
        var list = benchHiddenList().filter(function (h) { return h.model !== key || (ids && ids.indexOf(h.pid) < 0); });
        setBenchHiddenList(list);
        if (!list.some(function (h) { return h.model === key; })) S.hidePanel = false;
        toast('Shown again on the Bench board and table. SAVE FILE keeps this in the plan.', 'info');
        rerender();
      };
    });
    var inv = el.querySelector('#ncb-file-inv'), defIn = el.querySelector('#ncb-file-def');
    el.querySelectorAll('[data-act]').forEach(function (n) {
      n.onclick = function () {
        var a = n.getAttribute('data-act');
        var menu = n.closest && n.closest('details.ncb-more'); if (menu) menu.open = false;
        if (a === 'load') inv.click();
        else if (a === 'import') defIn.click();
        else if (a === 'export') exportDef();
        else if (a === 'setdate') {
          var d = (el.querySelector('#ncb-stockdate') || {}).value; if (!d) { toast('Pick a date first, or choose "Don\'t know"', 'warn'); return; }
          if (daysSince(d) > STOCK_AGE.refuse) {   // v1.1.0 — nothing older than 30 days is loaded
            toast('INV_MSTR not loaded — dated ' + fmtDate(d) + ', ' + daysSince(d) + ' days old. Nothing older than ' + STOCK_AGE.refuse + ' days is loaded.', 'error');
            if (S.prev) { S.idx = S.prev.idx; S.stock = S.prev.stock; } else { S.idx = null; S.stock = null; }
            S.prev = null; S.askDate = false; rerender(); return;
          }
          S.stock.dataAsOf = d; S.stock.method = 'entered'; S.askDate = false; S.prev = null; rerender();
        }
        else if (a === 'nodate') { S.stock.dataAsOf = null; S.stock.method = 'unknown'; S.askDate = false; rerender(); }
        else if (a === 'askdate') { S.askDate = true; rerender(); }
        else if (a === 'review') { S.page = 'review'; rerender(); var mr = el.querySelector('.ncb-main'); if (mr) mr.scrollTop = 0; }   // v1.2.0
        else if (a === 'log') { S.page = 'log'; rerender(); var ml = el.querySelector('.ncb-main'); if (ml) ml.scrollTop = 0; }
        else if (a === 'back') { S.page = ''; rerender(); }
        else if (a === 'apply') applyReview();
        else if (a === 'defreplace') applyDefinition(true);
        else if (a === 'defkeep') applyDefinition(false);
        else if (a === 'editon') { S.edit = true; S.view = 'parts'; rerender(); }
        else if (a === 'editoff') { S.edit = false; rerender(); }
        else if (a === 'parts') { S.view = 'parts'; S.page = ''; rerender(); }
        else if (a === 'notes') { S.notesOpen = !S.notesOpen; writePref('ncb_notes_open', S.notesOpen ? '1' : '0'); rerender(); }   // v1.3.0
        else if (a === 'hidden') { S.hidePanel = !S.hidePanel; rerender(); }
        else if (a === 'lenshidden') { if (S.host && S.host.openHidden) S.host.openHidden(); }
      };
    });
    if (inv) inv.onchange = function () { var f = inv.files[0]; inv.value = ''; if (f) ingestFile(f); };
    if (defIn) defIn.onchange = function () { var f = defIn.files[0]; defIn.value = ''; if (f) importDef(f); };
    if (!S._resize) { S._resize = true; root.addEventListener('resize', function () { if (S.el && S.el.offsetParent && S.model && S.model.indexOf('notin:') !== 0) rerender(); }); }
  }
  function importDef(file) {
    file.text().then(function (txt) { reviewDefinition(JSON.parse(txt), file.name); }).catch(function (e) { toast('Bench definition not imported — ' + e.message, 'error'); });
  }
  // v1.2.0 — a definition (from ⋯ or from the client folder): the first one goes straight in (nothing to compare);
  // a replacement is shown as a before / after first and applied only when the operator says so.
  function reviewDefinition(j, fileName) {
    try {
      var b = j && j.bench ? j.bench : j;
      if (!b || typeof b.schema !== 'string' || b.schema.indexOf(BENCH_SCHEMA) !== 0 || !Array.isArray(b.models)) throw new Error('not a Bench definition (expected schema "' + BENCH_SCHEMA + '…" with a models list)');
      var raw = S.host && S.host.raw; if (!raw) throw new Error('load a fleet file first');
      if (raw.bench && Array.isArray(raw.bench.models)) {
        S.defReview = { bench: b, fileName: fileName || 'definition file' }; S.page = 'review';
        toast('Bench definition read: review the before / after, then replace or keep the current one.', 'info');
        rerender(); return;
      }
      raw.bench = b;                                      // top-level, Lens-owned; same place on V4 Flat and V5 files
      logEntry(b, { by: 'definition file', file: fileName || '', model: '', component: '', change: 'imported the definition', pn: '', what: b.models.length + ' models' });
      S.model = ''; S.open = {}; S.page = '';
      markChanged('the imported Bench definition (' + (fileName || 'file') + ')');
      toast('Bench definition imported — ' + b.models.length + ' models. SAVE FILE to keep it in the fleet JSON.', 'success');
      rerender();
    } catch (e) { toast('Bench definition not used — ' + e.message, 'error'); }
  }
  function setSnapshots(list) { S.snaps = Array.isArray(list) ? list.filter(function (s) { return s && Array.isArray(s.comps); }) : []; rerender(); }
  function exportDef() {
    var b = benchDef(); if (!b) return;
    var blob = new Blob([JSON.stringify({ bench: b }, null, 1)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'bench_definition_' + String(S.host.clientCode || 'CLIENT').replace(/[^A-Z0-9_]/gi, '_') + '_' + localIso(new Date()) + '.json';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // v1.1.0 — stock from the client folder (numacore_workspace): rows = [headers, ...] in the V3 reader's layout.
  function setStock(rows, meta) {
    meta = meta || {};
    var k = headerAt(rows); if (k < 0) throw new Error('no header row with Material and Manufacturer Part No.');
    var idx = buildIndex(rows.slice(k));
    if (meta.clientCode) { if (S.cc && S.cc !== meta.clientCode) { S.model = ''; S.open = {}; } S.cc = meta.clientCode; }
    S.idx = idx; S.prev = null;
    S.stock = { fileName: meta.fileName || 'client folder', sheet: 'folder copy', dataAsOf: meta.dataAsOf || null, method: meta.method || 'unknown',
                loadedAt: new Date(), materials: idx.nmat, ledger: idx.ledger, lastModified: 0, source: 'folder' };
    S.askDate = false;
    rerender();
    return idx.nmat;
  }
  function clearStock() { S.idx = null; S.stock = null; S.prev = null; S.askDate = false; rerender(); }

  root.NumaCoreBench = {
    version: VERSION, render: render, setStock: setStock, clearStock: clearStock,
    setSnapshots: setSnapshots, reviewDefinition: reviewDefinition, previewSnapshot: previewSnapshot,   // v1.2.0
    // exposed for tests / the folder reader to come
    _internal: { buildIndex: buildIndex, headerAt: headerAt, lookup: lookup, resolveU: resolveU, pocketStock: pocketStock, netStatus: netStatus, catOf: catOf, joinKey: joinKey, dateFromFileName: dateFromFileName, state: S,
                 ambiguousCode: ambiguousCode, families: families, labels: labels, baseName: baseName, qtyWords: qtyWords, signed: signed,   // v1.1.1 — for the reconcile test
                 snapProposals: snapProposals, matchPocket: matchPocket, applyItems: applyItems, defDiff: defDiff, pnStock: pnStock, modelView: modelView, stageToggle: stageToggle,   // v1.2.0
                 applyDefinition: applyDefinition, applyReview: applyReview, partsHtml: partsHtml, reviewHtml: reviewHtml, logHtml: logHtml,
                 lensProposals: lensProposals, allProposals: allProposals, hiddenBar: hiddenBar, notesBlock: notesBlock, tableHtml: tableHtml, benchHiddenList: benchHiddenList, sameName: sameName,   // v1.3.0
                 setHost: function (h) { S.host = h; },
                 setIndex: function (idx, stock) { S.idx = idx; S.stock = stock; S.askDate = !stock.dataAsOf; rerender(); } }
  };
})(typeof window !== 'undefined' ? window : this);

/* ═══════════════════════════════════════════════════════════════════════════
   numacore_bench.js — BENCH (critical spares) for NumaCore Lens
   v1.0.0 · 2026-09-26

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
       Until the client-folder reader lands, the operator picks or links the
       file here (the link is remembered per browser, like Critical Spares V3).

   Ported from Critical Spares Review V3 (2026-09-14 build), behaviour-for-
   behaviour so its numbers are the test oracle: buildIndex (valuation split:
   NEW + REBUILT on hand, DEFECTIVE excluded; transit / PO / reserved averaged
   across a material's rows), headerAt, lookup (+ "SEE <material>" redirect),
   resolveU, netStatus, assembly minimum, catOf, mrpStr, board layout + anchors.

   Rules held here (operator, 2026-09-26)
     • Status is judged on COVER AFTER INBOUND = on hand + in transit + on order
       − reserved (V3 netStatus). Every row still shows all four numbers.
     • Words, never just a colour. Five states: Spare / No spare / Short /
       Not in SAP / Not in review (grey — tracked in Lens, no pocket matches).
     • Lens components join by SAP number, then part number. Never by name; a
       name only SUGGESTS where an unmatched component may belong.
     • The stock file's date is its DATA date: from the file name, or entered;
       unknown shows red. Never the upload time. Local calendar dates only.

   API
     NumaCoreBench.render(containerEl, host)
       host = { raw, fleetData, imageBase, planSaved, clientCode,
                markUnsaved(msg), toast(msg, sev) }
     NumaCoreBench.version
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var STOCK_AGE = { amber: 7, red: 14 };        // days — suggested limits (drive-folder spec §5), operator to confirm
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
    linkTried: false
  };

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
      val: findCol(h, [function (x) { return x === 'valuation type' || x === 'valuation'; }])
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
      if (!a) { a = { material: mat, mpn: mpn, desc: col.desc >= 0 ? ('' + row[col.desc]) : '', soh: 0, transit: 0, po: 0, _nr: 0, _blank: 0, _hasval: false, _tr: 0, _po: 0, _res: 0, _n: 0, mrp: '', mn: 0, mx: 0, ss: 0 }; agg.set(mat, a); }
      var q = num(row[col.soh]);
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
  function lookup(idx, code) {
    code = ('' + code).trim(); var u = code.toUpperCase();
    if (!code || u === 'N/A' || u === 'NOT AVL.' || u === 'ITEM OUTPHASED' || u === 'NONE') return [];
    var base = idx.MPN.get(u) || idx.MPNn.get(norm(code)) || []; var out = [], seen = new Set();
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
  function sumf(mats, k) { return mats.reduce(function (a, m) { return a + (m[k] || 0); }, 0); }
  // V3 colours -> Bench state names
  function netStatus(soh, tr, po, rs, has) {
    if (!has) return 'notsap'; var supply = soh + tr + po, net = supply - rs;
    if (supply <= 0 || net < 0) return 'short'; if (net === 0) return 'nospare'; return 'spare';
  }
  function catOf(pn) { pn = ('' + pn).trim().toUpperCase(); if (/-EXC$/.test(pn)) return 'EXC'; if (/^\d+R\d+$/.test(pn)) return 'REMAN'; return 'NEW'; }
  function keptMats(mats) {
    var kept = [], seen = {};
    for (var k = 0; k < mats.length; k++) {
      var mm = mats[k]; if (seen[mm.material]) continue; seen[mm.material] = 1;
      var isSee = ('' + mm.desc).toUpperCase().indexOf('SEE') >= 0; var hasStock = (mm.soh > 0 || mm.transit > 0 || mm.po > 0);
      if (isSee && !hasStock) continue; kept.push(mm);
    }
    return kept;
  }
  function mrpStr(idx, vpn, mats) {
    var m = lookup(idx, vpn); var r = m.length ? m[0] : ((mats && mats.length) ? mats[0] : null); if (!r) return '—'; var t = ('' + r.mrp).trim().toUpperCase();
    if (!t) return '—'; if (t === 'PD') return 'PD-' + Math.round(r.ss); if (t[0] === 'V') return t + '-' + Math.round(r.mn) + '-' + Math.round(r.mx);
    return t + '-' + Math.round(r.mn) + '-' + Math.round(r.mx) + '-' + Math.round(r.ss);
  }
  // One pocket's stock position (V3 compute(), incl. the assembly minimum rule)
  function pocketStock(idx, p) {
    var mats = resolveU(idx, p.vpns || []), s;
    if (p.groups && p.groups.length) {
      var gs = p.groups.map(function (g) { var gm = resolveU(idx, g); return [sumf(gm, 'soh'), sumf(gm, 'transit'), sumf(gm, 'po')]; });
      var gsoh = Math.min.apply(null, gs.map(function (x) { return x[0]; })), gtr = Math.min.apply(null, gs.map(function (x) { return x[1]; })), gpo = Math.min.apply(null, gs.map(function (x) { return x[2]; }));
      var grs = sumf(mats, 'res');
      s = { soh: gsoh, tr: gtr, po: gpo, res: grs, assembly: true };
    } else {
      s = { soh: sumf(mats, 'soh'), tr: sumf(mats, 'transit'), po: sumf(mats, 'po'), res: sumf(mats, 'res') };
    }
    s.status = netStatus(s.soh, s.tr, s.po, s.res, mats.length > 0);
    s.net = s.soh + s.tr + s.po - s.res;
    s.detail = keptMats(mats).map(function (mm) { return { sap: mm.material, desc: ('' + mm.desc), vpn: mm.mpn, cat: catOf(mm.mpn), qoh: Math.round(mm.soh), qoo: Math.round(mm.po), qit: Math.round(mm.transit), rsrv: Math.round(mm.res) }; });
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
  // ── remembered file link (File System Access, Edge / Chrome) ──
  var IDB = 'numacore_bench';
  function idbKey() { return 'inv_mstr_' + String((S.host && S.host.clientCode) || 'DEFAULT').replace(/[^A-Z0-9_]/gi, '_'); }
  function idb(mode, fn) {
    return new Promise(function (ok) {
      try {
        var r = indexedDB.open(IDB, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('h'); };
        r.onsuccess = function () { try { var st = r.result.transaction('h', mode).objectStore('h'); var q = fn(st); q.onsuccess = function () { ok(q.result || null); }; q.onerror = function () { ok(null); }; } catch (e) { ok(null); } };
        r.onerror = function () { ok(null); };
      } catch (e) { ok(null); }
    });
  }
  function linkFile() {
    if (!root.showOpenFilePicker) { toast('Linking a file needs Edge or Chrome — use "Load INV_MSTR" instead', 'warn'); return; }
    root.showOpenFilePicker({ types: [{ description: 'INV_MSTR', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }] })
      .then(function (res) { var h = res[0]; idb('readwrite', function (st) { return st.put(h, idbKey()); }); return h.getFile(); })
      .then(ingestFile).catch(function () {});
  }
  function reReadLinked(fromGesture) {
    return idb('readonly', function (st) { return st.get(idbKey()); }).then(function (h) {
      if (!h) { if (fromGesture) linkFile(); return false; }
      var ask = fromGesture && h.requestPermission ? h.requestPermission({ mode: 'read' }) : (h.queryPermission ? h.queryPermission({ mode: 'read' }) : Promise.resolve('granted'));
      return ask.then(function (p) { if (p === 'granted') { return h.getFile().then(function (f) { ingestFile(f); return true; }); } S.linkPending = h.name || 'INV_MSTR'; rerender(); return false; });
    }).catch(function () { return false; });
  }

  // ── Lens side ─────────────────────────────────────────────────────────────
  function benchDef() { var r = S.host && S.host.raw; return (r && r.bench && Array.isArray(r.bench.models)) ? r.bench : null; }
  function fleetModelComps(fleet, model, units) {
    var fd = S.host.fleetData || {}, out = [];
    var fk = Object.keys(fd).find(function (f) { return f.toUpperCase() === String(fleet).toUpperCase(); }); if (!fk) return out;
    var mk = Object.keys(fd[fk]).find(function (m) { return m.toUpperCase() === String(model).toUpperCase(); }); if (!mk) return out;
    var want = units ? new Set(units.map(function (u) { return String(u).toUpperCase(); })) : null;
    Object.keys(fd[fk][mk]).forEach(function (u) {
      if (want && !want.has(u.toUpperCase())) return;
      (fd[fk][mk][u] || []).forEach(function (c) { out.push(Object.assign({ unit: u }, c)); });
    });
    return out;
  }
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
  // Build the per-model view: stock per pocket (if loaded) + Lens components joined to pockets
  function modelView(m) {
    var pockets = m.pockets.map(function (p) {
      var st = S.idx ? pocketStock(S.idx, p) : null;
      var keys = new Set((p.vpns || []).map(joinKey));
      (p.groups || []).forEach(function (g) { g.forEach(function (v) { keys.add(joinKey(v)); }); });
      return { p: p, st: st, keys: keys, saps: st ? new Set(st.saps) : new Set(), lens: [] };
    });
    var comps = fleetModelComps(m.lens.fleet, m.lens.model, m.lens.units);
    var groups = {};
    comps.forEach(function (c) { (groups[c.component] = groups[c.component] || []).push(c); });
    var unmatched = [];
    Object.keys(groups).sort().forEach(function (name) {
      var cs = groups[name], c0 = cs.find(function (c) { return c.mm_number || c.part_number; }) || cs[0];
      var hit = null, how = '';
      var sk = sapKey(c0.mm_number), pk = joinKey(c0.part_number);
      if (S.idx && sk) { hit = pockets.find(function (x) { return x.saps.has(sk); }); if (hit) how = 'SAP number ' + c0.mm_number; }
      if (!hit && pk) { hit = pockets.find(function (x) { return x.keys.has(pk); }); if (hit) how = 'part number ' + c0.part_number; }
      var pcts = cs.map(function (c) { return c.pct; }).filter(function (v) { return v != null; });
      var dues = cs.map(function (c) { return c.pred_changeout; }).filter(Boolean).map(function (d) { return String(d).slice(0, 10); }).sort();
      var rec = { name: name, n: cs.length, worst: pcts.length ? Math.max.apply(null, pcts) : null, due: dues[0] || null,
                  pn: c0.part_number || '', mm: c0.mm_number || '', how: how, units: cs.map(function (c) { return c.unit; }) };
      if (hit) { hit.lens.push(rec); return; }
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
    return { m: m, pockets: pockets, unmatched: unmatched, units: modelUnits(m), comps: comps.length };
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
  function stockAgeClass() { if (!S.stock) return 'none'; if (!S.stock.dataAsOf) return 'red'; var d = daysSince(S.stock.dataAsOf); return d > STOCK_AGE.red ? 'red' : d > STOCK_AGE.amber ? 'amber' : 'ok'; }

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
      '.ncb-mi span{display:block;font-size:11.5px;color:var(--nc-text-m,#8B8FA3)}',
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
      '.ncb tr.ncb-detail>td{background:rgba(8,12,20,.75);padding:12px 18px 16px 36px;text-align:left}',
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
      '@media (max-width:1100px){.ncb-list{width:210px}.ncb-tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function modelSummary(v) {
    var c = { spare: 0, nospare: 0, short: 0, notsap: 0 }, maj = 0, majSpare = 0;
    v.pockets.forEach(function (x) { if (x.st) c[x.st.status]++; if (x.p.tier === 'major') { maj++; if (x.st && x.st.status === 'spare') majSpare++; } });
    return { c: c, maj: maj, majSpare: majSpare, unmatched: v.unmatched.length };
  }
  function listHtml(def, views) {
    var h = '';
    ['OP', 'UG'].forEach(function (g) {
      var ms = def.models.filter(function (m) { return m.group === g; });
      if (!ms.length) return;
      h += '<div class="ncb-grp"><span>' + (g === 'OP' ? 'Open pit' : 'Underground') + '</span><span>' + ms.length + '</span></div>';
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
    return '<span class="ncb-chip ' + cls + '" title="' + esc('INV_MSTR ' + s.fileName + ' [' + s.sheet + '] · ' + s.materials.toLocaleString() + ' materials · dated from ' + s.method + ' · loaded ' + s.loadedAt.toLocaleTimeString()) + '">Stock · ' + (s.dataAsOf ? fmtDate(s.dataAsOf) + ' · ' + age + (age === 1 ? ' day' : ' days') : 'date unknown') + '</span>';
  }
  function topBar() {
    // local calendar date of the save stamp (an ISO timestamp is UTC — slicing it would read tomorrow after 5 pm Pacific)
    var ps = S.host.planSaved, pd = ps ? (/^\d{4}-\d{2}-\d{2}$/.test(ps) ? isoToDate(ps) : new Date(ps)) : null;
    var plan = pd && !isNaN(pd) ? localIso(pd) : '';
    return '<div class="ncb-top"><span class="ncb-eyebrow">Bench · critical spares</span>' +
      (plan ? '<span class="ncb-chip ok">Plan · saved ' + fmtDate(plan) + '</span>' : '') + stockChip() +
      '<span class="ncb-spacer"></span>' +
      '<button class="ncb-btn" data-act="load">⬆ Load INV_MSTR</button>' +
      (root.showOpenFilePicker ? '<button class="ncb-btn ghost" data-act="link" title="Link the INV_MSTR file (e.g. in the client\'s OneDrive folder). This browser remembers it and re-reads it next time.">⛓ Link file</button>' : '') +
      '<button class="ncb-btn ghost" data-act="import" title="Import a Bench definition (.json) into this fleet file">Import definition</button>' +
      (benchDef() ? '<button class="ncb-btn ghost" data-act="export" title="Download this fleet file\'s Bench definition as JSON">Export definition</button>' : '') +
      '<input type="file" id="ncb-file-inv" accept=".xlsx,.xls,.xlsm" hidden><input type="file" id="ncb-file-def" accept=".json" hidden></div>';
  }
  function banners() {
    var h = '';
    if (S.busy) h += '<div class="ncb-banner info"><span class="ncb-dot" style="color:var(--ncb-accent)"></span>' + esc(S.busy) + '</div>';
    if (S.linkPending) h += '<div class="ncb-banner info">The linked file <b>' + esc(S.linkPending) + '</b> needs one click to re-read in this session. <button class="ncb-btn" data-act="reread">Re-read linked INV_MSTR</button></div>';
    if (S.stock && S.askDate) {
      var saved = S.stock.lastModified ? localIso(new Date(S.stock.lastModified)) : '';
      h += '<div class="ncb-banner amber"><b>Stock date needed.</b> The INV_MSTR has no date inside it and its file name has none. Enter the date the export was taken: <input type="date" id="ncb-stockdate" value=""> <button class="ncb-btn" data-act="setdate">Use this date</button> <button class="ncb-btn ghost" data-act="nodate">Don\'t know</button>' + (saved ? ' <span style="color:var(--nc-text-m)">The file was last saved on ' + fmtDate(saved) + ' — use that only if nobody opened and re-saved it in Excel.</span>' : '') + '</div>';
    } else if (S.stock) {
      var cls = stockAgeClass(), age = S.stock.dataAsOf ? daysSince(S.stock.dataAsOf) : null;
      if (cls === 'red') h += '<div class="ncb-banner red"><span class="ncb-dot" style="color:var(--ncb-notsap)"></span>' + (S.stock.dataAsOf ? '<span><b>Stock is ' + age + ' days old</b> (INV_MSTR ' + fmtDate(S.stock.dataAsOf) + ', red after ' + STOCK_AGE.red + ' days). Every stock number here carries that age.</span>' : '<span><b>Stock date unknown.</b> Every stock number here is undated — confirm the export date.</span> <button class="ncb-btn ghost" data-act="askdate">Enter date</button>') + '</div>';
      else if (cls === 'amber') h += '<div class="ncb-banner amber"><span class="ncb-dot" style="color:var(--ncb-nospare)"></span><span>Stock is ' + age + ' days old (INV_MSTR ' + fmtDate(S.stock.dataAsOf) + ', amber after ' + STOCK_AGE.amber + ' days).</span></div>';
    }
    return h;
  }
  function tiles(v) {
    var s = modelSummary(v);
    var t = [['spare', s.c.spare, 'cover after inbound > 0'], ['nospare', s.c.nospare, 'covered, nothing spare'], ['short', s.c.short, 'demand exceeds supply, or none'], ['notsap', s.c.notsap, 'no SAP material set up'], ['notin', s.unmatched, 'tracked in Lens, no pocket match']];
    return '<div class="ncb-tiles">' + t.map(function (x) { return '<div class="ncb-tile"><div class="k" style="color:' + ST[x[0]].c + '"><span class="ncb-dot"></span>' + ST[x[0]].w + '</div><div class="v">' + (S.idx || x[0] === 'notin' ? x[1] : '—') + '</div><div class="d">' + x[2] + '</div></div>'; }).join('') + '</div>';
  }
  function qtyWords(st) {
    if (!st) return '<span style="color:var(--nc-text-d)">no stock data</span>';
    if (st.status === 'notsap') return 'not set up in SAP';
    return 'shelf ' + st.soh + ' · on the way ' + (st.po + st.tr) + ' · reserved ' + st.res + ' · cover ' + (st.net > 0 ? '+' : '') + st.net;
  }
  function boardHtml(v) {
    var m = v.m, majors = v.pockets.filter(function (x) { return x.p.tier === 'major'; });
    if (!majors.length) return '';
    return '<div class="ncb-boardwrap" id="ncb-boardwrap"><div class="ncb-board" id="ncb-board" data-img="' + esc(S.host.imageBase + m.image) + '"></div></div>';
  }
  // V3 board(): image box, anchors, top row, left/right columns, leader lines
  function layoutBoard(v) {
    var wrap = document.getElementById('ncb-boardwrap'), board = document.getElementById('ncb-board');
    if (!wrap || !board) return;
    var BW = 1520, BH = 860, CARDW = 248, CARDH = 108, MID = 395;
    var scale = wrap.clientWidth / BW; board.style.transform = 'scale(' + scale + ')'; wrap.style.height = Math.round(BH * scale) + 'px';
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
          '<div class="nm">' + esc(c.x.p.component) + '</div><div class="pn">' + esc(c.x.p.vpn) + (c.x.lens.length ? ' · ' + c.x.lens.reduce(function (s, l) { return s + l.n; }, 0) + ' in Lens' : '') + '</div><div class="q" style="color:' + col + '">' + qtyWords(c.x.st) + '</div></div></div>';
      });
      svg += '</svg>';
      board.innerHTML = svg + h;
      board.querySelectorAll('[data-open]').forEach(function (el) { el.onclick = function () { var id = el.getAttribute('data-open'); S.open[id] = true; rerender(); var row = S.el.querySelector('tr.ncb-row[data-id="' + CSS.escape(id) + '"]'); if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' }); }; });
    }
  }
  function statement(st) {
    if (!st) return 'No stock data yet — load or link the INV_MSTR.';
    if (st.status === 'notsap') return 'No SAP material is set up for any of this pocket\'s part numbers.';
    var way = st.po + st.tr;
    var s = '<b>' + st.soh + '</b> on the shelf, <b>' + way + '</b> on the way' + (way ? ' (' + st.po + ' on order' + (st.tr ? ', ' + st.tr + ' in transit' : '') + ')' : '') + ', <b>' + st.res + '</b> reserved ';
    if (st.status === 'spare') s += '→ <b style="color:var(--ncb-spare)">' + st.net + ' spare</b> after everything inbound arrives.';
    else if (st.status === 'nospare') s += '→ <b style="color:var(--ncb-nospare)">exactly covered</b>: nothing spare once reservations are met.';
    else if (st.net < 0) s += '→ <b style="color:var(--ncb-short)">short by ' + (-st.net) + '</b> even after everything inbound arrives.';
    else s += '→ <b style="color:var(--ncb-short)">nothing on the shelf or inbound</b>.';
    if (st.assembly) s += ' <span style="color:var(--nc-text-m)">(an assembly: counted as the smallest of its sub-part groups, as in Critical Spares V3)</span>';
    return s;
  }
  function netCell(st) {
    if (!st) return '<span style="color:var(--nc-text-d)">—</span>';
    if (st.status === 'notsap') return '<span style="color:var(--nc-text-d)">—</span>';
    var col = st.status === 'spare' ? 'var(--ncb-spare)' : st.status === 'nospare' ? 'var(--ncb-nospare)' : 'var(--ncb-short)';
    return '<span class="ncb-net" style="color:' + col + '">' + (st.net > 0 ? '+' : st.net < 0 ? '−' : '') + Math.abs(st.net) + '</span>';
  }
  function tableHtml(v) {
    var today = localIso(new Date());
    var rows = v.pockets.filter(function (x) {
      if (S.filter === 'major' || S.filter === 'minor') return x.p.tier === S.filter;
      if (S.filter === 'attn') return (x.st && x.st.status !== 'spare') || (!x.lens.length && v.unmatched.some(function (u) { return u.hint === x.p; }));
      return true;
    });
    var h = '<div class="ncb-tscroll"><table><thead><tr><th>Status</th><th class="l">Component</th><th class="l">Tracked in Lens</th><th>Worst life</th><th>Next due (plan)</th><th>On shelf</th><th>On the way</th><th>Reserved</th><th>Cover after inbound</th><th>Types in stock</th><th></th></tr></thead><tbody>';
    rows.forEach(function (x) {
      var p = x.p, st = x.st, k = st ? st.status : 'nostock';
      var likely = v.unmatched.filter(function (u) { return u.hint === p; });
      var lens = x.lens.length
        ? '<div class="ncb-lens">' + x.lens.map(function (l) { return esc(l.name); }).join(', ') + ' <span style="color:var(--nc-text-d)">· ' + x.lens.reduce(function (s, l) { return s + l.n; }, 0) + ' tracked</span></div><div class="ncb-how">by ' + esc(x.lens[0].how) + '</div>'
        : likely.length ? '<div class="ncb-warn">' + likely.map(function (u) { return esc(u.name); }).join(', ') + '</div><div class="ncb-how" style="color:#fdba74">part number on file differs — see below</div>'
          : '<div class="ncb-lens" style="color:var(--nc-text-d)">not tracked in Lens</div>';
      var worst = x.lens.length ? x.lens.map(function (l) { return l.worst; }).filter(function (w) { return w != null; }) : [];
      var worstTxt = worst.length ? Math.round(Math.max.apply(null, worst) * 100) + '%' : '—';
      var dueIso = x.lens.map(function (l) { return l.due; }).filter(Boolean).sort()[0];
      var dueTxt = !dueIso ? '—' : (dueIso < today ? '<span style="color:var(--ncb-short)">overdue</span><div class="ncb-how">' + fmtDate(dueIso) + '</div>' : fmtDate(dueIso));
      var open = !!S.open[p.id];
      var types = st && st.types.length ? st.types.map(function (t) { return '<span class="ncb-pill ' + t + '">' + t + '</span>'; }).join('') : '<span style="color:var(--nc-text-d)">—</span>';
      var q = function (n) { return st && st.status !== 'notsap' ? n : '<span style="color:var(--nc-text-d)">—</span>'; };
      h += '<tr class="ncb-row" data-id="' + esc(p.id) + '"><td>' + badge(k) + '</td><td class="l"><div class="ncb-cname">' + esc(p.component) + '</div><div class="ncb-meta">' + p.tier + (p.location ? ' · ' + esc(p.location) : '') + ' · VPN ' + esc(p.vpn) + (p.split ? ' · split ⓘ' : '') + (p.alsoFits ? ' · also fits other models' : '') + '</div></td>' +
        '<td class="l">' + lens + '</td><td class="n">' + worstTxt + '</td><td class="n" style="font-size:12px">' + dueTxt + '</td>' +
        '<td class="n">' + q(st ? st.soh : 0) + '</td><td class="n">' + q(st ? st.po + st.tr : 0) + '</td><td class="n">' + q(st ? st.res : 0) + '</td><td>' + netCell(st) + '</td><td>' + types + '</td><td style="color:var(--nc-text-d)">' + (open ? '▾' : '▸') + '</td></tr>';
      if (open) {
        var mats = st && st.detail.length ? '<table class="ncb-mats"><thead><tr><th>SAP #</th><th>Type</th><th>VPN</th><th class="l">Description</th><th>On shelf</th><th>On order</th><th>In transit</th><th>Reserved</th></tr></thead><tbody>' +
          st.detail.map(function (d) { return '<tr><td class="ncb-mono">' + esc(d.sap) + '</td><td><span class="ncb-pill ' + d.cat + '">' + d.cat + '</span></td><td class="ncb-mono">' + esc(d.vpn) + '</td><td class="l">' + esc(d.desc) + '</td><td class="n">' + d.qoh + '</td><td class="n">' + d.qoo + '</td><td class="n">' + d.qit + '</td><td class="n">' + d.rsrv + '</td></tr>'; }).join('') + '</tbody></table>' : '';
        var notes = [];
        if (st) notes.push('SAP stock rule (MRP): <span class="ncb-mono">' + esc(st.mrp) + '</span>');
        notes.push('Part numbers in this pocket: <span class="ncb-mono">' + esc((p.vpns || []).join(', ')) + '</span>');
        if (p.split) notes.push('Split (' + esc(p.split.reason || '') + '): ' + p.split.variants.map(function (sv) { return '<span class="ncb-mono">' + esc(sv.vpn) + '</span> on ' + esc((sv.units || []).join(', ')); }).join(' · '));
        if (p.alsoFits) notes.push('Also fits: ' + p.alsoFits.map(function (a) { return esc(a.model) + ' (' + esc((a.comps || []).join(', ')) + ')'; }).join(' · '));
        if (x.lens.length) notes.push('Lens components on this pocket: ' + x.lens.map(function (l) { return esc(l.name) + ' (' + l.n + ', part ' + esc(l.pn) + (l.mm ? ', SAP ' + esc(l.mm) : '') + (l.worst != null ? ', worst ' + Math.round(l.worst * 100) + '%' : '') + ')'; }).join(' · '));
        h += '<tr class="ncb-detail"><td colspan="11"><div class="ncb-stmt">' + statement(st) + '</div>' + mats + notes.map(function (n) { return '<div class="ncb-note">' + n + '</div>'; }).join('') + '</td></tr>';
      }
    });
    return h + '</tbody></table></div>';
  }
  function gapPanel(v) {
    if (!v.unmatched.length) return '';
    return '<section class="ncb-panel"><h3>Tracked in Lens, not matched to a spares pocket (' + v.unmatched.length + ')</h3><p>Neither the SAP number nor the part number of these components appears in any ' + esc(v.m.label) + ' pocket. Where the name points at a pocket, the part number on file differs from that pocket\'s part list, so one of the two is out of date. They count as <b>Not in review</b> — never as covered, never as zero stock.</p>' +
      '<table class="ncb-mats"><thead><tr><th class="l">Lens component</th><th>Units</th><th>Part number</th><th>SAP number</th><th>Worst life</th><th class="l">What to check</th></tr></thead><tbody>' +
      v.unmatched.map(function (u) { return '<tr><td class="l">' + esc(u.name) + '</td><td class="n">' + u.n + '</td><td class="ncb-mono">' + (esc(u.pn) || '—') + '</td><td class="ncb-mono">' + (esc(u.mm) || '—') + '</td><td class="n">' + (u.worst != null ? Math.round(u.worst * 100) + '%' : '—') + '</td><td class="l">' + (u.hint ? 'Name suggests <b>' + esc(u.hint.component) + '</b> (parts ' + esc((u.hint.vpns || []).slice(0, 3).join(', ')) + (u.hint.vpns.length > 3 ? ', …' : '') + ') — confirm which part number is current' : '<span style="color:var(--nc-text-m)">No pocket for this component on the ' + esc(v.m.label) + ' — add one, or accept the gap</span>') + '</td></tr>'; }).join('') + '</tbody></table></section>';
  }
  function summaryHtml(def, views) {
    var h = '<h1 class="ncb-h">Fleet spares cover</h1><div class="ncb-sub">Every critical component per model, judged on <b>cover after inbound</b> (on the shelf + on the way − reserved). Click a model for its board and table.</div>';
    ['OP', 'UG'].forEach(function (g) {
      var ms = def.models.filter(function (m) { return m.group === g; }); if (!ms.length) return;
      h += '<h3 style="font-family:var(--nc-font-head);margin:18px 0 6px">' + (g === 'OP' ? 'Open pit' : 'Underground') + '</h3><table><thead><tr><th class="l">Model</th><th>Units</th><th>Pockets</th><th>Spare</th><th>No spare</th><th>Short</th><th>Not in SAP</th><th>Lens components not matched</th></tr></thead><tbody>';
      ms.forEach(function (m) {
        var v = views[m.key], s = modelSummary(v), d = function (n, k) { return S.idx ? '<span style="color:' + (n ? ST[k].c : 'var(--nc-text-d)') + '">' + n + '</span>' : '—'; };
        h += '<tr class="ncb-row" data-model="' + esc(m.key) + '"><td class="l"><div class="ncb-cname">' + esc(m.lens.model) + '</div><div class="ncb-meta">' + esc(m.class) + (m.lens.units ? ' · ' + esc(m.lens.units.join(', ')) : '') + '</div></td><td class="n">' + v.units.length + '</td><td class="n">' + v.pockets.length + '</td><td class="n">' + d(s.c.spare, 'spare') + '</td><td class="n">' + d(s.c.nospare, 'nospare') + '</td><td class="n">' + d(s.c.short, 'short') + '</td><td class="n">' + d(s.c.notsap, 'notsap') + '</td><td class="n">' + s.unmatched + '</td></tr>';
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
    return '<div class="ncb-empty"><h2>No Bench definition in this fleet file</h2><p>Bench needs the spares definition — which part numbers fit which component pocket on each model. Import it once (the <span class="ncb-mono">bench_definition_*.json</span> built from Critical Spares Review V3), then SAVE FILE to keep it in the fleet JSON.</p><p><button class="ncb-btn solid" data-act="import">Import Bench definition</button></p><p style="font-size:12px">Stock is never stored in the fleet file: it is read from the INV_MSTR each session (Load or Link), and later from the client folder.</p></div>';
  }

  function rerender() { if (S.el && S.host) render(S.el, S.host); }
  function render(el, host) {
    injectStyle();
    S.el = el; S.host = host;
    if (S.rawRef !== host.raw) { S.rawRef = host.raw; S.model = ''; S.open = {}; }     // a different fleet file was loaded
    var def = benchDef();
    if (!S.linkTried && root.indexedDB) { S.linkTried = true; reReadLinked(false); }
    var main;
    var views = {};
    if (def) def.models.forEach(function (m) { views[m.key] = modelView(m); });
    if (!def) main = topBar() + banners() + emptyHtml();
    else if (!S.model) main = topBar() + banners() + summaryHtml(def, views);
    else if (S.model.indexOf('notin:') === 0) main = topBar() + banners() + notInReviewHtml(S.model);
    else {
      var v = views[S.model];
      if (!v) { S.model = ''; return render(el, host); }
      main = topBar() + banners() + boardHtml(v) + tiles(v) +
        '<div class="ncb-rule"><b>Cover after inbound</b> = on the shelf + on the way (on order + in transit) − reserved. The status is judged on it; every row still shows all four, so a spare that exists only on a truck is never mistaken for one on the shelf. Click a card or a row for the SAP detail.</div>' +
        '<div class="ncb-filters">' + [['all', 'All ' + v.pockets.length], ['major', 'Majors'], ['minor', 'Minors'], ['attn', 'Needs attention']].map(function (f) { return '<button class="ncb-fb' + (S.filter === f[0] ? ' on' : '') + '" data-filter="' + f[0] + '">' + f[1] + '</button>'; }).join('') + '</div>' +
        tableHtml(v) + gapPanel(v);
    }
    // keep the reader where they were: a re-render (opening a row, a filter) must not jump to the top
    var pm = el.querySelector('.ncb-main'), pl = el.querySelector('.ncb-list');
    var keepMain = pm ? pm.scrollTop : 0, keepList = pl ? pl.scrollTop : 0;
    el.innerHTML = '<div class="ncb">' + (def ? '<aside class="ncb-list"><div class="ncb-mi' + (!S.model ? ' on' : '') + '" data-model=""><b>Fleet summary</b><span>' + def.models.length + ' models in the spares review</span></div>' + listHtml(def, views) + '</aside>' : '') + '<div class="ncb-main">' + main + '</div></div>';
    wire(el, views);
    if (S.model && views[S.model]) layoutBoard(views[S.model]);   // sets the board height synchronously, so the scroll below lands right
    var nm = el.querySelector('.ncb-main'), nl = el.querySelector('.ncb-list');
    if (nm) nm.scrollTop = keepMain;
    if (nl) nl.scrollTop = keepList;
  }
  function wire(el, views) {
    el.querySelectorAll('[data-model]').forEach(function (n) { n.onclick = function () { S.model = n.getAttribute('data-model'); S.filter = 'all'; S.open = {}; rerender(); var mn = el.querySelector('.ncb-main'); if (mn) mn.scrollTop = 0; }; });
    el.querySelectorAll('[data-filter]').forEach(function (n) { n.onclick = function () { S.filter = n.getAttribute('data-filter'); rerender(); }; });
    el.querySelectorAll('tr.ncb-row[data-id]').forEach(function (n) { n.onclick = function () { var id = n.getAttribute('data-id'); S.open[id] = !S.open[id]; rerender(); }; });
    var inv = el.querySelector('#ncb-file-inv'), defIn = el.querySelector('#ncb-file-def');
    el.querySelectorAll('[data-act]').forEach(function (n) {
      n.onclick = function () {
        var a = n.getAttribute('data-act');
        if (a === 'load') inv.click();
        else if (a === 'link') linkFile();
        else if (a === 'reread') { S.linkPending = null; reReadLinked(true); }
        else if (a === 'import') defIn.click();
        else if (a === 'export') exportDef();
        else if (a === 'setdate') { var d = (el.querySelector('#ncb-stockdate') || {}).value; if (!d) { toast('Pick a date first, or choose "Don\'t know"', 'warn'); return; } S.stock.dataAsOf = d; S.stock.method = 'entered'; S.askDate = false; rerender(); }
        else if (a === 'nodate') { S.stock.dataAsOf = null; S.stock.method = 'unknown'; S.askDate = false; rerender(); }
        else if (a === 'askdate') { S.askDate = true; rerender(); }
      };
    });
    if (inv) inv.onchange = function () { var f = inv.files[0]; inv.value = ''; if (f) ingestFile(f); };
    if (defIn) defIn.onchange = function () { var f = defIn.files[0]; defIn.value = ''; if (f) importDef(f); };
    if (!S._resize) { S._resize = true; root.addEventListener('resize', function () { if (S.el && S.el.offsetParent && S.model && S.model.indexOf('notin:') !== 0) rerender(); }); }
  }
  function importDef(file) {
    file.text().then(function (txt) {
      var j = JSON.parse(txt), b = j && j.bench ? j.bench : j;
      if (!b || typeof b.schema !== 'string' || b.schema.indexOf(BENCH_SCHEMA) !== 0 || !Array.isArray(b.models)) throw new Error('not a Bench definition (expected schema "' + BENCH_SCHEMA + '…" with a models list)');
      var raw = S.host.raw; if (!raw) throw new Error('load a fleet file first');
      var had = !!raw.bench;
      raw.bench = b;                                      // top-level, Lens-owned; same place on V4 Flat and V5 files
      S.model = ''; S.open = {};
      if (S.host.markUnsaved) S.host.markUnsaved();
      toast('Bench definition ' + (had ? 'replaced' : 'imported') + ' — ' + b.models.length + ' models. SAVE FILE to keep it in the fleet JSON.', 'success');
      rerender();
    }).catch(function (e) { toast('Bench definition not imported — ' + e.message, 'error'); });
  }
  function exportDef() {
    var b = benchDef(); if (!b) return;
    var blob = new Blob([JSON.stringify({ bench: b }, null, 1)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'bench_definition_' + String(S.host.clientCode || 'CLIENT').replace(/[^A-Z0-9_]/gi, '_') + '_' + localIso(new Date()) + '.json';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  root.NumaCoreBench = {
    version: VERSION, render: render,
    // exposed for tests / the folder reader to come
    _internal: { buildIndex: buildIndex, headerAt: headerAt, lookup: lookup, resolveU: resolveU, pocketStock: pocketStock, netStatus: netStatus, catOf: catOf, joinKey: joinKey, dateFromFileName: dateFromFileName, state: S,
                 setIndex: function (idx, stock) { S.idx = idx; S.stock = stock; S.askDate = !stock.dataAsOf; rerender(); } }
  };
})(typeof window !== 'undefined' ? window : this);

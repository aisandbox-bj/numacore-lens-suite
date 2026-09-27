/* ═══════════════════════════════════════════════════════════════════════════
   numacore_workspace.js — WORKSPACE (the client-folder reader) for NumaCore Lens
   v0.2.0 · 2026-09-27

   What it does
     The operator connects the client's synced OneDrive folder once. Lens then
       • reads each new SAP export dropped in "1 New files" (IW39, INV_MSTR),
       • recognises it by its COLUMNS (never its name) and maps columns by exact
         header name,
       • dates it from its DATA (IW39: newest Created On, checked against the file
         name; INV_MSTR: the file name, or the refresher is asked),
       • checks it (age, newer than the file in use, name vs data, re-saved in
         Excel, row count) and shows a check card per file,
       • on Publish: writes a small dated copy to lens\data, records it in
         lens\data\register.js, moves the file in use to "3 Archive\<source>",
         files the new one in "2 In use" under its standard name, moves refused
         files to "1 New files\Not used", and appends to "3 Archive\Refresh log.csv".
         NOTHING is ever deleted.
     On every plan open it loads the dated copies and hands them to Lens, which
     passes them to Bench (stock) and Deploy (work orders + stock).
     It also writes the Meeting record (3 Archive\Meetings\<date>\: the saved plan
     JSON + "What was in use.txt"; never the SAP files).

   Rules (operator, 2026-09-26)
     • Age: amber after 7 days, red after 14, for every SAP source.
     • Nothing older than 30 days is loaded (refused at the check step).
     • Dates are local calendar dates; never toISOString() for a date.
     • Words, never just a colour.
     • People's names never enter a dated copy (Entered By / Last Changed By dropped).
     • v0.2.0 (operator, 2026-09-27):
       – Refresher edits, others view. A folder is connected in one of two modes.
         EDIT (the person who refreshes it): the browser grants "edit files" and
         Publish, dated copies, the plan and meeting records are written. VIEW ONLY:
         the browser grants "view files"; everything is read, nothing is written,
         Publish is hidden, and saves / meeting records download instead.
       – The plan lives in the folder: lens\plan\ holds the latest saved fleet JSON
         (SAVE FILE writes it there in edit mode); older plans move to
         3 Archive\Plans\. Nothing is deleted.
       – A folder can be opened BEFORE any plan (Lens's landing page): the newest
         plan in lens\plan\ is read, else a fleet JSON waiting in 1 New files.
       – Recent client folders are remembered in this browser (handle + mode).
       – A fleet JSON dropped in 1 New files is recognised as a plan: its check card
         files it in lens\plan\ on Publish and offers to open it. A Bench definition
         JSON is recognised and left in place until Bench's before / after review.

   Building Blocks
     Built to the ingest SPEC (blocks/ingest, spec 0.1) and SOURCE-REGISTRY v1: exact
     alias matching after normalising, type coercion, data-date rules, a row ledger,
     the digest shape {meta, columns, types, rows}, and the data-contract file://
     wrapper (window.__INTAKE__[key] + window.__INTAKE_LOADED__[key]). When the
     shared ingest core exists, this file's reader swaps for it (harvest log).

   API
     NumaCoreWorkspace.attach(host)      host = { clientCode, clientName, planUnits:[ids],
                                                  lensVersion, toast(msg,sev), onData(payload),
                                                  onState(state) }
     NumaCoreWorkspace.mountStrip(el)    the header strip (sources + folder button)
     NumaCoreWorkspace.meetingRecord({json, fileName})  → Promise<{ok, where}>
     NumaCoreWorkspace.forDeploy(digest) / forBench(digest)
     NumaCoreWorkspace.state()
     v0.2.0: openFolder(mode) / openRecent(id) → Promise<{folderName, mode, setUp, cc, plan}>
             recent() → Promise<[{id, cc, clientName, folderName, mode, lastOpened}]>
             savePlan(text, fileName) → Promise<{ok, where, file}> · canSavePlan() · setMode(mode)
             host.onPlan({fileName, json}) — a plan published from 1 New files
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var VERSION = '0.2.0';
  var AGE = { amber: 7, red: 14, refuse: 30 };
  var DIR = { NEW: '1 New files', NOTUSED: 'Not used', INUSE: '2 In use', ARCHIVE: '3 Archive', MEETINGS: 'Meetings', LENS: 'lens', DATA: 'data', PLAN: 'plan', PLANS: 'Plans' };   // v0.2.0 + plan / Plans
  var LOG_NAME = 'Refresh log.csv';
  var REGISTER = 'register.js';

  // ── small helpers ─────────────────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function localIso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function localStamp(d) {   // local ISO with offset, e.g. 2026-09-26T21:04:11-06:00
    var o = -d.getTimezoneOffset(), sg = o >= 0 ? '+' : '-'; o = Math.abs(o);
    return localIso(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + sg + pad(Math.floor(o / 60)) + ':' + pad(o % 60);
  }
  function isoToDate(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function ageDays(iso) { var d = isoToDate(iso); if (!d) return null; var t = new Date(); return Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - d) / 86400000); }
  function ageClass(iso) { var a = ageDays(iso); if (a === null) return 'red'; if (a > AGE.refuse) return 'expired'; return a > AGE.red ? 'red' : a > AGE.amber ? 'amber' : 'ok'; }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(iso) { var d = isoToDate(iso); return d ? d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() : 'date unknown'; }
  function fmtShort(iso) { var d = isoToDate(iso); return d ? d.getDate() + ' ' + MON[d.getMonth()] : 'date unknown'; }
  function tz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } }
  function safeName(s) { return String(s || '').replace(/[^A-Za-z0-9 _\-]/g, '_').trim() || 'CLIENT'; }
  function nameDate(iso) { return iso ? iso.replace(/-/g, '_') : ''; }

  // ── the source registry (Building Blocks SOURCE-REGISTRY v1 draft; IW39 + INV_MSTR) ─────────
  // type: id (string, trailing .0 removed, leading zeros kept) · idUpper · code (upper) · text · number · money · date
  var REG = {
    IW39: {
      key: 'iw39', label: 'Work orders (IW39)', short: 'Work orders',
      fields: [
        ['order', ['Order', 'Order Number', 'Order No', 'Order No.', 'WO', 'WO #', 'Work Order'], 'id'],
        ['orderType', ['Order Type', 'Order Typ', 'OTyp'], 'code'],
        ['basicStart', ['Basic start date', 'Bas. Start', 'Basic Start', 'Bas. start date', 'Planned start'], 'date'],
        ['unit', ['Sort Field', 'Sort field', 'Sort No.', 'SortFld', 'Unit', 'Unit ID'], 'idUpper'],
        ['description', ['Description', 'Order Description', 'Short Text', 'Operation Short Text', 'Long Text'], 'text'],
        ['systemStatus', ['System status', 'Syst. Status', 'Syst.Status', 'Sys Status', 'Status'], 'text'],
        ['activityType', ['MaintActivityType', 'Maint. activity type'], 'code'],
        ['userStatus', ['User Status'], 'text'],
        ['plannerGroup', ['Maint. Planner Group', 'Planner group'], 'code'],
        ['workCenter', ['Main Work Center', 'Main work ctr', 'Work Center'], 'code'],
        ['floc', ['Functional Location', 'Functional Loc.', 'Func. Loc.', 'Funct. Loc.', 'FLOC'], 'text'],
        ['equipment', ['Equipment', 'Equipment Number', 'Equipment No.'], 'id'],
        ['maintPlan', ['Maintenance Plan'], 'id'],
        ['maintItem', ['Maintenance Item'], 'id'],
        ['notification', ['Notification'], 'id'],
        ['plannedCost', ['Total planned costs', 'Total plnd costs', 'TotalPlnndCosts', 'Plan Costs'], 'money'],
        ['actualCost', ['Total actual costs', 'Total act.costs', 'Act. Costs'], 'money'],
        ['createdOn', ['Created On', 'Entered on', 'Creation Date'], 'date'],
        ['basicFinish', ['Basic fin. date', 'Basic finish date', 'Bas. Finish'], 'date'],
        ['completionDate', ['Actual finish', 'Act. finish', 'Actual Finish Date', 'Actl. Finish', 'Completion Date', 'Completn Date', 'Ref. Date', 'Reference Date', 'TECO Date'], 'date']
      ],
      pii: ['Entered By', 'Last Changed By', 'Created By', 'Changed By'],
      keyField: 'order',
      required: ['order', 'description'],
      signature: function (f) { return f.order !== undefined && f.description !== undefined && (f.unit !== undefined || f.systemStatus !== undefined); },
      reject: ['Movement Type', 'MvT', 'Material']
    },
    INV_MSTR: {
      key: 'inv_mstr', label: 'Stock (INV_MSTR)', short: 'Stock',
      fields: [
        ['material', ['Material', 'Material Number', 'Material No', 'Material No.'], 'id'],
        ['description', ['Material Description', 'Mat Desc', 'Material descr.'], 'text'],
        ['mfgPartNo', ['Manufacturer Part No.', 'Manufacturer Part Number', 'Mfg Part No', 'MPN'], 'text'],
        ['plant', ['Plant'], 'code'],
        ['storageLocation', ['Storage Location', 'Sloc', 'Stor. Loc.', 'SLoc'], 'code'],
        ['materialGroup', ['Material Group'], 'code'],
        ['materialGroupDesc', ['Material Group Desc.', 'Material Group Description'], 'text'],
        ['unrestricted', ['Unrestricted', 'Unrestricted Stock', 'Unrestricted-Use Stock', 'Tot_Qty_OH', 'Tot Qty OH', 'Total Qty', 'Stock On Hand', 'SOH', 'Qty On Hand', 'OnHand', 'QOH'], 'number'],
        ['stockInTransit', ['Stock in Transit', 'In Transit'], 'number'],
        ['gmPoQty', ['GM PO Qty', 'Open_PO', 'Open PO', 'Open PO Qty'], 'number'],
        ['mlaPoQty', ['MLA PO Qty'], 'number'],
        ['poFlag', ['PO_Flag', 'PO Flag'], 'code'],
        ['totalResQty', ['Total Res Qty', 'Total Reserved Qty'], 'number'],
        ['mrpType', ['MRP Type', 'MRP_Ind', 'MRP Ind', 'MRP_Type', 'MRP Indicator'], 'code'],
        ['reorderPoint', ['Reorder Point', 'MRP_Min', 'MRP Min', 'Min'], 'number'],
        ['maxStock', ['Maximum Stock Level', 'MRP_Max', 'MRP Max', 'Max'], 'number'],
        ['safetyStock', ['Safety Stock', 'SS'], 'number'],
        ['valuationType', ['Valuation Type'], 'code'],
        ['movingPrice', ['Moving price', 'Moving Avg Price', 'MovAvePrice', 'MAP'], 'money'],
        ['baseUnit', ['Base Unit of Measure', 'BUn'], 'code']
      ],
      pii: [],
      keyField: 'material',
      // Bench (the V3 reader) needs every one of these; Deploy needs material.
      required: ['material', 'mfgPartNo', 'unrestricted', 'stockInTransit', 'gmPoQty', 'totalResQty', 'valuationType'],
      signature: function (f) { if (f.material === undefined) return false; var n = 0; ['unrestricted', 'mrpType', 'reorderPoint', 'maxStock', 'valuationType', 'plant'].forEach(function (k) { if (f[k] !== undefined) n++; }); return n >= 2; },
      reject: ['Movement Type', 'MvT']
    }
  };
  var SOURCES = ['IW39', 'INV_MSTR'];
  // Files we recognise but don't read yet (left where they are, with a note)
  var LATER = [
    { name: 'MB51 (goods movements)', test: function (N) { return has(N, ['material', 'materialnumber']) && has(N, ['movementtype', 'mvt', 'mvttype']) && has(N, ['postingdate', 'pstngdate']); } },
    { name: 'Component Snapshot', test: function (N) { return has(N, ['component']) && has(N, ['new04', 'exc04', 'reman04', 'new01']); } }
  ];
  function has(N, list) { for (var i = 0; i < list.length; i++) if (N.indexOf(list[i]) >= 0) return true; return false; }
  // header name normalise: lower-case, strip spaces and . , _ - ( ) / # : % '  → EXACT match only
  function norm(h) { return String(h == null ? '' : h).toLowerCase().replace(/[\s.,_\-()\/#:%']/g, ''); }

  // map headers → {field: columnIndex}. Alias order = priority; one header per field.
  function mapColumns(headers, src) {
    var N = headers.map(norm), taken = {}, map = {}, spec = REG[src];
    spec.fields.forEach(function (f) {
      for (var a = 0; a < f[1].length; a++) {
        var target = norm(f[1][a]);
        for (var i = 0; i < N.length; i++) {
          if (!taken[i] && N[i] === target) { map[f[0]] = i; taken[i] = true; return; }
        }
      }
    });
    return map;
  }
  function recognise(headers) {
    var N = headers.map(norm), best = null;
    SOURCES.forEach(function (src) {
      var spec = REG[src], map = mapColumns(headers, src);
      var rejected = spec.reject.some(function (r) { return N.indexOf(norm(r)) >= 0; });
      if (!rejected && spec.signature(map)) { var score = Object.keys(map).length; if (!best || score > best.score) best = { src: src, map: map, score: score }; }
    });
    if (best) return best;
    for (var i = 0; i < LATER.length; i++) if (LATER[i].test(N)) return { later: LATER[i].name };
    return null;
  }
  // header row: within the first 20 rows, the row with most alias hits (ties → earliest)
  function findHeaderRow(rows) {
    var allAliases = {};
    SOURCES.forEach(function (s) { REG[s].fields.forEach(function (f) { f[1].forEach(function (a) { allAliases[norm(a)] = 1; }); }); });
    var best = -1, bestScore = 0;
    for (var r = 0; r < Math.min(20, rows.length); r++) {
      var row = rows[r] || [], hits = 0, filled = 0;
      for (var c = 0; c < row.length; c++) { var v = row[c]; if (v !== '' && v != null) { filled++; if (allAliases[norm(v)]) hits++; } }
      var sc = hits * 1000 + filled;
      if (hits >= 2 && sc > bestScore) { best = r; bestScore = sc; }
    }
    return best;
  }

  // ── type coercion (ingest SPEC §4). A failed cell → null, counted; the row is kept ──
  function serialToIso(n) { if (!(n >= 20000 && n <= 80000)) return null; var d = new Date(1899, 11, 30 + Math.floor(n)); return localIso(d); }
  function validYmd(y, mo, d) { if (!(y >= 1990 && y <= 2099 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null; var dt = new Date(y, mo - 1, d); return dt.getMonth() === mo - 1 ? localIso(dt) : null; }
  function coerce(v, type) {
    if (v === '' || v == null) return null;
    switch (type) {
      case 'id': case 'idUpper': case 'code': {
        var s = String(v).trim(); if (typeof v === 'number' && isFinite(v)) s = String(v);
        s = s.replace(/\.0+$/, '');
        return s === '' ? null : (type === 'text' ? s : (type === 'id' ? s : s.toUpperCase()));
      }
      case 'text': { var t = String(v).trim(); return t === '' ? null : t; }
      case 'number': case 'money': {
        if (typeof v === 'number') return isFinite(v) ? v : undefined;
        var x = String(v).trim().replace(/[\s$€£]/g, ''); var neg = false;
        if (/-$/.test(x)) { neg = true; x = x.slice(0, -1); }           // SAP trailing minus 12-
        if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(x)) x = x.replace(/,/g, '');   // 1,234.5
        else if (/^-?\d+,\d+$/.test(x)) x = x.replace(',', '.');           // 19778,00
        var n = Number(x); if (!isFinite(n)) return undefined; return neg ? -n : n;
      }
      case 'date': {
        if (typeof v === 'number') return serialToIso(v) || undefined;
        var sd = String(v).trim(), m;
        if (/^\d+(\.\d+)?$/.test(sd)) return serialToIso(Number(sd)) || undefined;
        if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(sd))) return validYmd(+m[1], +m[2], +m[3]) || undefined;
        if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(sd))) return validYmd(+m[3], +m[2], +m[1]) || undefined;
        return undefined;   // slash dates are ambiguous → refused (counted)
      }
    }
    return v;
  }

  // ── data dates (ported from Deploy v8.19 _dateFromFileName / _iw39DataDate; same rules) ─────
  var MON3 = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
  function dateFromFileName(name) {
    var s = String(name || '').toUpperCase(), m;
    if ((m = /(20\d\d)[_\-. ](\d\d)[_\-. ](\d\d)/.exec(s))) return validYmd(+m[1], +m[2], +m[3]);
    if ((m = /(?:^|\D)(20\d\d)(\d\d)(\d\d)(?:\D|$)/.exec(s))) return validYmd(+m[1], +m[2], +m[3]);
    if ((m = /(?:^|[^0-9])(\d{1,2})[ _\-]?(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[ _\-]?(\d{4}|\d{2})(?:\D|$)/.exec(s))) {
      return validYmd(m[3].length === 2 ? 2000 + +m[3] : +m[3], MON3[m[2]], +m[1]);
    }
    return null;
  }
  // IW39: newest Created On = the floor; a file-name date 0–4 days after the floor wins; else the floor, flagged.
  function iw39DataDate(createdIso, fileName) {
    var newest = null, oldest = null;
    createdIso.forEach(function (iso) { if (!iso) return; if (!newest || iso > newest) newest = iso; if (!oldest || iso < oldest) oldest = iso; });
    var nd = dateFromFileName(fileName), asOf = null, method = 'unknown', warn = '';
    if (newest) {
      var gap = nd ? Math.round((isoToDate(nd) - isoToDate(newest)) / 86400000) : null;
      if (gap !== null && gap >= 0 && gap <= 4) { asOf = nd; method = 'file_name+created_on'; }
      else { asOf = newest; method = 'created_on'; if (nd) warn = 'The file name says ' + fmtDate(nd) + ', but the newest Created On in the file is ' + fmtDate(newest) + '. Using ' + fmtDate(newest) + '.'; }
    } else if (nd) { asOf = nd; method = 'file_name'; }
    return { asOf: asOf, method: method, window: oldest ? { from: oldest, to: newest } : null, nameDate: nd, warn: warn };
  }
  var METHOD_WORDS = { 'file_name+created_on': 'file name, matching the newest Created On', 'created_on': 'newest Created On in the file', 'file_name': 'file name', 'entered': 'entered at refresh', 'unknown': 'unknown' };
  function methodWords(m) { return METHOD_WORDS[m] || m || 'unknown'; }

  // ── read + digest one workbook ───────────────────────────────────────────
  var XLSX_READ = { type: 'array', dense: true, cellFormula: false, cellHTML: false, cellText: false, cellStyles: false };
  function readWorkbook(XLSX, bytes, fileName) {
    var wb = XLSX.read(bytes, XLSX_READ), props = wb.Props || {};
    var app = String(props.Application || ''), author = String(props.LastAuthor || '');
    var sapStamp = /word/i.test(app) || author === 'SAP WebAS';
    var resaved = /excel/i.test(app) && !sapStamp;
    for (var i = 0; i < wb.SheetNames.length; i++) {
      var name = wb.SheetNames[i], rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
      var hr = findHeaderRow(rows); if (hr < 0) continue;
      var headers = rows[hr].map(function (h) { return String(h == null ? '' : h).trim(); });
      var rec = recognise(headers);
      if (rec) return { sheet: name, headerRow: hr, headers: headers, rows: rows.slice(hr + 1), rec: rec, sapStamp: sapStamp, resaved: resaved, modifiedProp: props.ModifiedDate || null };
    }
    return { rec: null, sapStamp: sapStamp, resaved: resaved };
  }
  function buildDigest(wbr, src, ctx) {
    var spec = REG[src], map = wbr.rec.map, cols = [], types = [], idx = [];
    spec.fields.forEach(function (f) { if (map[f[0]] !== undefined) { cols.push(f[0]); types.push(f[2]); idx.push(map[f[0]]); } });
    var keyPos = cols.indexOf(spec.keyField), rows = [], drops = { blank_row: 0, no_key: 0 }, issues = {}, rowsIn = 0, createdIso = [];
    var coPos = cols.indexOf('createdOn');
    for (var r = 0; r < wbr.rows.length; r++) {
      var raw = wbr.rows[r];
      if (!raw || !raw.some(function (c) { return c !== '' && c != null; })) { drops.blank_row++; continue; }
      rowsIn++;
      var out = new Array(cols.length);
      for (var c = 0; c < cols.length; c++) {
        var v = coerce(raw[idx[c]], types[c]);
        if (v === undefined) { issues[cols[c]] = (issues[cols[c]] || 0) + 1; v = null; }
        out[c] = v;
      }
      if (coPos >= 0 && out[coPos]) createdIso.push(out[coPos]);
      if (keyPos >= 0 && (out[keyPos] === null || out[keyPos] === '')) { drops.no_key++; continue; }
      rows.push(out);
    }
    var dd;
    if (src === 'IW39') dd = iw39DataDate(createdIso, ctx.fileName);
    else { var nd = dateFromFileName(ctx.fileName); dd = { asOf: nd, method: nd ? 'file_name' : 'unknown', window: null, nameDate: nd, warn: '' }; }
    var mapping = {}; cols.forEach(function (k, i) { mapping[k] = wbr.headers[idx[i]]; });
    var headerIndex = {}; cols.forEach(function (k, i) { headerIndex[k] = idx[i]; });
    var dropped = wbr.headers.filter(function (h, i) { return h && idx.indexOf(i) < 0; });
    var extra = {};
    if (src === 'IW39') { var u = {}, up = cols.indexOf('unit'); if (up >= 0) rows.forEach(function (x) { if (x[up]) u[x[up]] = 1; }); extra.units = Object.keys(u); }
    if (src === 'INV_MSTR') { var p = {}, pp = cols.indexOf('plant'); if (pp >= 0) rows.forEach(function (x) { if (x[pp]) p[x[pp]] = 1; }); extra.plants = Object.keys(p); }
    var now = new Date();
    return {
      meta: {
        contract: 1, kind: 'intake.digest.' + spec.key, schemaVersion: '1.0.0', tool: 'numacore_workspace', toolVersion: VERSION,
        generatedAt: localStamp(now), tz: tz(), clientCode: ctx.clientCode || '',
        coreVersion: 'workspace-' + VERSION, registryVersion: 'v1-draft',
        privacy: { droppedColumns: dropped, scrubbed: spec.pii.filter(function (h) { return wbr.headers.map(norm).indexOf(norm(h)) >= 0; }) },
        sources: [{
          source: src, file: ctx.standardName || '', originalFile: ctx.fileName || '', bytes: ctx.bytes || 0, sheet: wbr.sheet, headerRow: wbr.headerRow,
          sapStamp: wbr.sapStamp, resaved: wbr.resaved, rowsIn: rowsIn, rowsOut: rows.length, drops: drops, issues: issues,
          dataAsOf: dd.asOf, asOfMethod: dd.method, window: dd.window, uploadedAt: localStamp(now), mapping: mapping, headerIndex: headerIndex,
          warnings: dd.warn ? [dd.warn] : [], units: extra.units, plants: extra.plants
        }]
      },
      columns: cols, types: types, rows: rows, agg: null,
      _dd: dd
    };
  }

  // ── consumers ────────────────────────────────────────────────────────────
  // Deploy v8.20 field names. Where Deploy's own auto-match takes "the first matching column", the
  // same choice is made here from the source's column order (Sort Field before Functional Location).
  function firstByColumn(digest, keys) {
    var hi = digest.meta.sources[0].headerIndex || {}, best = null;
    keys.forEach(function (k) { if (hi[k] !== undefined && (best === null || hi[k] < hi[best])) best = k; });
    return best;
  }
  function forDeploy(digest) {
    var src = digest.meta.sources[0].source, cols = digest.columns, map;
    if (src === 'IW39') {
      map = { wo_number: 'order', description: 'description', status: 'systemStatus', planned_cost: 'plannedCost', actual_cost: 'actualCost',
        floc: firstByColumn(digest, ['unit', 'floc', 'equipment']), order_type: 'orderType', basic_start: 'basicStart', completion_date: 'completionDate', created_on: 'createdOn' };
    } else {
      map = { material: 'material', description: 'description', mfg_part_no: 'mfgPartNo', open_po: 'gmPoQty', po_flag: 'poFlag', tot_qty_oh: 'unrestricted',
        mov_ave_price: 'movingPrice', onhand_loc: firstByColumn(digest, ['plant', 'storageLocation']), mrp_min: 'reorderPoint', mrp_max: 'maxStock', mat_grp_descr: 'materialGroup' };
    }
    var pos = {}; Object.keys(map).forEach(function (k) { var p = map[k] ? cols.indexOf(map[k]) : -1; if (p >= 0) pos[k] = p; });
    return digest.rows.map(function (r) { var o = {}; Object.keys(pos).forEach(function (k) { var v = r[pos[k]]; o[k] = v == null ? '' : v; }); return o; });
  }
  // Bench's V3 reader finds columns by these header words, so the rows get the standard headers.
  var BENCH_HEAD = { material: 'Material', description: 'Material Description', mfgPartNo: 'Manufacturer Part No.', plant: 'Plant', storageLocation: 'Storage Location',
    unrestricted: 'Unrestricted', stockInTransit: 'Stock in Transit', gmPoQty: 'GM PO Qty', mlaPoQty: 'MLA PO Qty', totalResQty: 'Total Res Qty',
    mrpType: 'MRP Type', reorderPoint: 'Reorder Point', maxStock: 'Maximum Stock Level', safetyStock: 'Safety Stock', valuationType: 'Valuation Type' };
  function forBench(digest) {
    var keep = [], head = [];
    digest.columns.forEach(function (k, i) { if (BENCH_HEAD[k]) { keep.push(i); head.push(BENCH_HEAD[k]); } });
    var out = [head];
    digest.rows.forEach(function (r) { out.push(keep.map(function (i) { return r[i] == null ? '' : r[i]; })); });
    return out;
  }

  // ── file:// wrapper (data-contract §4): JSON on its own line, loaded flag on the last line ────
  function toScript(obj, key, comment) {
    var j = JSON.stringify(obj, function (k, v) { return k === '_dd' ? undefined : v; });
    return '// ' + (comment || 'NumaCore workspace') + '\n' +
      '(window.__INTAKE__=window.__INTAKE__||{})["' + key + '"]=\n' + j + '\n' +
      ';(window.__INTAKE_LOADED__=window.__INTAKE_LOADED__||{})["' + key + '"]=true;\n';
  }
  function parseScript(text) {
    var lines = String(text).split('\n');
    var loaded = lines.some(function (l) { return l.indexOf('__INTAKE_LOADED__') >= 0; });
    if (!loaded) throw new Error('the file is cut off or damaged (no loaded flag)');
    for (var i = 0; i < lines.length; i++) { var l = lines[i]; if (l.charAt(0) === '{') return JSON.parse(l); }
    throw new Error('no data found in the file');
  }

  // ── browser plumbing (skipped in Node) ───────────────────────────────────
  var S = { host: null, cc: '', handle: null, perm: 'none', folderName: '', register: null, loaded: {}, newFiles: [], stripEl: null, busy: false, cards: null, lastError: '',
            mode: 'edit',     // v0.2.0 — 'edit' (the refresher) | 'view' (everyone else). v0.1.0 connections were all edit.
            pending: null };  // v0.2.0 — a folder opened on the landing page, adopted by the next attach()
  function toast(msg, sev) { try { if (S.host && S.host.toast) S.host.toast(msg, sev); } catch (e) {} }
  function setState(p) { for (var k in p) S[k] = p[k]; renderStrip(); try { if (S.host && S.host.onState) S.host.onState(publicState()); } catch (e) {} }
  function publicState() { return { connected: !!S.handle && S.perm === 'granted', perm: S.perm, folderName: S.folderName, newFiles: S.newFiles.length, sources: S.register ? S.register.sources : {}, loaded: S.loaded, mode: S.mode, canSavePlan: canSavePlan() }; }

  // IndexedDB: the folder handle per client (own DB; never bump numacore_bench)
  function idb() {
    return new Promise(function (res) {
      try { var rq = root.indexedDB.open('numacore_workspace', 1); rq.onupgradeneeded = function () { rq.result.createObjectStore('h'); }; rq.onsuccess = function () { res(rq.result); }; rq.onerror = function () { res(null); }; } catch (e) { res(null); }
    });
  }
  function idbGet(k) { return idb().then(function (db) { if (!db) return null; return new Promise(function (res) { var t = db.transaction('h', 'readonly').objectStore('h').get(k); t.onsuccess = function () { res(t.result || null); }; t.onerror = function () { res(null); }; }); }); }
  function idbPut(k, v) { return idb().then(function (db) { if (!db) return false; return new Promise(function (res) { var t = db.transaction('h', 'readwrite').objectStore('h').put(v, k); t.onsuccess = function () { res(true); }; t.onerror = function () { res(false); }; }); }); }
  function handleKey() { return 'folder_' + String(S.cc || 'DEFAULT').replace(/[^A-Z0-9_]/gi, '_'); }
  // v0.2.0 — per-client memory beside the handle: mode, folder name, last opened, last plan saved
  function metaKey() { return 'meta_' + String(S.cc || 'DEFAULT').replace(/[^A-Z0-9_]/gi, '_'); }
  // the permission asked for follows the mode: VIEW ONLY asks the browser to "view files", EDIT to "edit files"
  function permMode() { return S.mode === 'view' ? 'read' : 'readwrite'; }
  function putMeta(extra) {
    var m = { cc: S.cc, clientName: (S.host && S.host.clientName) || '', folderName: S.folderName, mode: S.mode, lastOpened: localStamp(new Date()) };
    for (var k in (extra || {})) m[k] = extra[k];
    return idbGet(metaKey()).then(function (old) { var o = old || {}; for (var q in m) o[q] = m[q]; return idbPut(metaKey(), o); });
  }
  function idbAll() {
    return idb().then(function (db) {
      if (!db) return [];
      return new Promise(function (res) {
        var out = [], rq = db.transaction('h', 'readonly').objectStore('h').openCursor();
        rq.onsuccess = function () { var c = rq.result; if (!c) return res(out); out.push({ key: c.key, value: c.value }); c.continue(); };
        rq.onerror = function () { res(out); };
      });
    });
  }
  // the client folders this browser has opened, newest first (Lens's landing page)
  function recent() {
    return idbAll().then(function (all) {
      var metas = {}, handles = {};
      all.forEach(function (e) { var k = String(e.key); if (k.indexOf('meta_') === 0) metas[k.slice(5)] = e.value; else if (k.indexOf('folder_') === 0) handles[k.slice(7)] = e.value; });
      return Object.keys(handles).map(function (id) {
        var m = metas[id] || {}, h = handles[id];
        return { id: id, cc: m.cc || id, clientName: m.clientName || '', folderName: m.folderName || (h && h.name) || '', mode: m.mode || 'edit', lastOpened: m.lastOpened || '', planFile: m.planFile || '', planSaved: m.planSaved || '' };
      }).sort(function (a, b) { return String(b.lastOpened).localeCompare(String(a.lastOpened)); });
    });
  }

  function ensureXLSX() {
    if (root.XLSX) return Promise.resolve(root.XLSX);
    function load(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = function () { root.XLSX ? res(root.XLSX) : rej(new Error('SheetJS did not load')); }; s.onerror = function () { rej(new Error('could not load ' + src)); }; document.head.appendChild(s); }); }
    return load('vendor/xlsx.full.min.js').catch(function () { return load('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'); });
  }

  // directory helpers
  function dir(parent, name, create) { return parent.getDirectoryHandle(name, { create: !!create }); }
  function path(names, create) { var p = Promise.resolve(S.handle); names.forEach(function (n) { p = p.then(function (d) { return dir(d, n, create); }); }); return p; }
  function exists(parent, name, kind) {
    return (kind === 'dir' ? parent.getDirectoryHandle(name) : parent.getFileHandle(name)).then(function () { return true; }, function () { return false; });
  }
  function readText(d, name) { return d.getFileHandle(name).then(function (fh) { return fh.getFile(); }).then(function (f) { return f.text(); }); }
  function writeFile(d, name, data) {
    return d.getFileHandle(name, { create: true }).then(function (fh) { return fh.createWritable(); }).then(function (w) { return w.write(data).then(function () { return w.close(); }); });
  }
  function freeName(d, name) {   // "x.xlsx" → "x (2).xlsx" if taken
    var dot = name.lastIndexOf('.'), stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
    function tryN(n) { var nm = n === 1 ? name : stem + ' (' + n + ')' + ext; return exists(d, nm, 'file').then(function (taken) { return taken ? tryN(n + 1) : nm; }); }
    return tryN(1);
  }
  // move = copy, verify the size, then remove the original. Never overwrites: a taken name gets " (2)".
  function moveFile(fromDir, name, toDir, newName) {
    var srcFile;
    return fromDir.getFileHandle(name).then(function (fh) { return fh.getFile(); }).then(function (f) {
      srcFile = f; return freeName(toDir, newName || name);
    }).then(function (dest) {
      return writeFile(toDir, dest, srcFile).then(function () { return toDir.getFileHandle(dest); }).then(function (fh) { return fh.getFile(); }).then(function (copy) {
        if (copy.size !== srcFile.size) throw new Error('copy of ' + name + ' is incomplete (' + copy.size + ' of ' + srcFile.size + ' bytes); the original was left in place');
        return fromDir.removeEntry(name).then(function () { return dest; });
      });
    });
  }
  function appendLog(lines) {
    return path([DIR.ARCHIVE], true).then(function (a) {
      return exists(a, LOG_NAME, 'file').then(function (ex) {
        var head = ex ? Promise.resolve('') : Promise.resolve('when,source,original file,standard name,data date,dated from,rows in,rows kept,result,reason,reader\r\n');
        return head.then(function (h) {
          return (ex ? readText(a, LOG_NAME) : Promise.resolve('')).then(function (old) {
            function q(v) { v = String(v == null ? '' : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
            var add = lines.map(function (l) { return l.map(q).join(','); }).join('\r\n') + '\r\n';
            return writeFile(a, LOG_NAME, (old || h) + add);
          });
        });
      });
    });
  }

  // ── connect / restore ────────────────────────────────────────────────────
  function layoutPresent(h) {
    return Promise.all([exists(h, DIR.NEW, 'dir'), exists(h, DIR.INUSE, 'dir'), exists(h, DIR.ARCHIVE, 'dir'), exists(h, DIR.LENS, 'dir')]).then(function (r) { return r.filter(Boolean).length; });
  }
  function setUpLayout() {
    return path([DIR.NEW, DIR.NOTUSED], true).then(function () { return path([DIR.INUSE], true); }).then(function () { return path([DIR.ARCHIVE, DIR.MEETINGS], true); }).then(function () { return path([DIR.LENS, DIR.DATA], true); });
  }
  function useHandle(h, fromPicker) {
    var wasPerm;
    return (h.queryPermission ? h.queryPermission({ mode: permMode() }) : Promise.resolve('granted')).then(function (p) {
      wasPerm = p; S.handle = h; S.folderName = h.name;
      if (p !== 'granted') { setState({ perm: 'prompt' }); return false; }
      return layoutPresent(h).then(function (n) {
        if (n < 4) {
          if ([DIR.NEW, DIR.INUSE, DIR.ARCHIVE, DIR.LENS, DIR.DATA, DIR.NOTUSED, DIR.MEETINGS].indexOf(h.name) >= 0) { toast('That is a folder inside the client folder. Pick the client folder itself.', 'warn'); S.handle = null; setState({ perm: 'none' }); return false; }
          if (!fromPicker) { setState({ perm: 'granted' }); return true; }
          if (S.mode === 'view') { toast('"' + h.name + '" is not set up as a Lens client folder yet. The person who refreshes it sets it up by connecting with "I refresh it".', 'warn'); S.handle = null; setState({ perm: 'none' }); return false; }
          var ok = root.confirm('Set up "' + h.name + '" as the Lens client folder for ' + S.cc + '?\n\nLens will create four folders in it: 1 New files, 2 In use, 3 Archive and lens. Nothing already there is changed.');
          if (!ok) { S.handle = null; setState({ perm: 'none' }); return false; }
          return setUpLayout().then(function () { return true; });
        }
        return true;
      }).then(function (ok) {
        if (!ok) return false;
        return loadRegister().then(function (reg) {
          if (reg && reg.meta && reg.meta.clientCode && S.cc && reg.meta.clientCode !== S.cc) {
            toast('This folder belongs to ' + reg.meta.clientCode + ', but the plan loaded is ' + S.cc + '. Not connected.', 'error');
            S.handle = null; S.register = null; setState({ perm: 'none' }); return false;
          }
          return idbPut(handleKey(), h).then(function () { return putMeta(); }).then(function () { setState({ perm: 'granted' }); return true; });
        });
      });
    });
  }
  function connect(mode) {
    if (!root.showDirectoryPicker) { toast('Connecting a folder needs Edge or Chrome.', 'warn'); return Promise.resolve(false); }
    if (mode !== 'view' && mode !== 'edit') { openChooser(); return Promise.resolve(false); }   // v0.2.0 — view only, or edit (the refresher)
    S.mode = mode;
    return root.showDirectoryPicker({ id: 'numacore-client', mode: mode === 'view' ? 'read' : 'readwrite' }).then(function (h) { return useHandle(h, true); }).then(function (ok) { if (ok) return refreshAll(); }).catch(function (e) {
      if (e && e.name === 'AbortError') return false;
      toast('Could not connect the folder: ' + (e && e.message || e), 'error'); return false;
    });
  }
  function allow() {   // user gesture → permission for the remembered folder
    if (!S.handle) return connect();
    return S.handle.requestPermission({ mode: permMode() }).then(function (p) { if (p === 'granted') return useHandle(S.handle, false).then(function (ok) { if (ok) return refreshAll(); }); setState({ perm: 'prompt' }); });
  }
  function restore() {
    return Promise.all([idbGet(handleKey()), idbGet(metaKey())]).then(function (r) {
      var h = r[0], m = r[1];
      if (!h) { setState({ perm: 'none', handle: null, folderName: '' }); return false; }
      S.mode = (m && m.mode) || 'edit';   // v0.2.0 — v0.1.0 connections had no mode: they were edit
      return useHandle(h, false).then(function (ok) { if (ok) return refreshAll(); });
    });
  }
  // v0.2.0 — switch this browser between view only and edit for the connected folder (the "?" panel)
  function setMode(m) {
    if (!S.handle) return Promise.resolve();
    if (m === 'edit') {
      return S.handle.requestPermission({ mode: 'readwrite' }).then(function (p) {
        if (p !== 'granted') { toast('Edit was not allowed, so this browser stays view only.', 'warn'); return; }
        S.mode = 'edit'; setState({ perm: 'granted' }); putMeta(); scanNew(); toast('This browser now refreshes "' + S.folderName + '" (edit).', 'success');
      });
    }
    S.mode = 'view'; setState({}); putMeta(); toast('View only: this browser will not change "' + S.folderName + '".', 'info');
    return Promise.resolve();
  }

  // ── register + loading the dated copies ──────────────────────────────────
  function loadRegister() {
    return path([DIR.LENS, DIR.DATA], false).then(function (d) {
      return exists(d, REGISTER, 'file').then(function (ex) { if (!ex) return null; return readText(d, REGISTER).then(parseScript); });
    }).catch(function () { return null; }).then(function (reg) { S.register = reg; return reg; });
  }
  function newRegister() {
    return { meta: { contract: 1, kind: 'workspace.register', schemaVersion: '1.0.0', tool: 'numacore_workspace', toolVersion: VERSION, generatedAt: localStamp(new Date()), tz: tz(), clientCode: S.cc }, ageLimits: { amber: AGE.amber, red: AGE.red, refuse: AGE.refuse }, sources: {}, overrides: [] };
  }
  function loadCopies() {
    var reg = S.register; if (!reg || !reg.sources) return Promise.resolve();
    var dataDir;
    return path([DIR.LENS, DIR.DATA], false).then(function (d) {
      dataDir = d;
      return SOURCES.reduce(function (p, src) {
        return p.then(function () {
          var cur = reg.sources[src] && reg.sources[src].current; if (!cur || !cur.dataFile) return;
          if (S.loaded[src] && S.loaded[src].dataFile === cur.dataFile) return;   // already delivered
          return readText(dataDir, cur.dataFile).then(parseScript).then(function (dg) {
            var a = ageDays(cur.dataAsOf);
            var payload = { source: src, label: REG[src].label, dataAsOf: cur.dataAsOf || null, method: cur.method, methodWords: methodWords(cur.method), window: cur.window || null,
              fileName: cur.standardName, originalName: cur.originalName, rows: dg.rows.length, ageDays: a, age: ageClass(cur.dataAsOf), expired: a !== null && a > AGE.refuse, clientCode: S.cc, digest: dg };
            S.loaded[src] = { dataFile: cur.dataFile, dataAsOf: cur.dataAsOf, rows: dg.rows.length };
            try { if (S.host && S.host.onData) S.host.onData(payload); } catch (e) { console.warn('workspace onData:', e); }
          }).catch(function (e) { toast('Could not read the dated copy for ' + REG[src].short + ' (' + cur.dataFile + '): ' + e.message + '. Refresh from the folder, or check that OneDrive has downloaded lens\\data.', 'error'); });
        });
      }, Promise.resolve());
    }).catch(function () {});
  }
  function scanNew() {
    return path([DIR.NEW], false).then(function (d) {
      var out = [], it = d.values();
      // skips Excel lock files (~$…), temp and OneDrive swap files
      function step() { return it.next().then(function (r) { if (r.done) return out; var e = r.value; if (e.kind === 'file' && !/^~\$|\.tmp$|\.crswap$|^\./i.test(e.name) && /\.(xlsx|xlsm|xls|xlsb|csv|json)$/i.test(e.name)) out.push(e.name);   /* v0.2.0 + json (plans) */ return step(); }); }
      return step();
    }).catch(function () { return []; }).then(function (list) { setState({ newFiles: list }); return list; });
  }
  function refreshAll() { return loadRegister().then(loadCopies).then(scanNew).then(function () { renderStrip(); }); }

  // ── check new files → cards ──────────────────────────────────────────────
  function checkNew() {
    if (S.busy) return; if (!S.handle || S.perm !== 'granted') return allow();
    if (S.mode === 'view') { toast('View only: new files are checked and published by the person who refreshes this folder.', 'info'); return; }   // v0.2.0
    S.busy = true; openCards([], 'Reading the new files…');
    var XLSX, newDir, cards = [];
    return ensureXLSX().then(function (X) { XLSX = X; return path([DIR.NEW], false); }).then(function (d) {
      newDir = d;
      return S.newFiles.reduce(function (p, name) {
        return p.then(function () {
          setCardsMsg('Reading ' + name + '…  (a full INV_MSTR takes up to half a minute)');
          return new Promise(function (r) { setTimeout(r, 60); }).then(function () { return d.getFileHandle(name); }).then(function (fh) { return fh.getFile(); }).then(function (f) {
            if (/\.json$/i.test(name)) return f.text().then(function (t) { cards.push(assessJson(name, f, t)); });   // v0.2.0
            return f.arrayBuffer().then(function (buf) { cards.push(assess(XLSX, name, f, buf)); });
          }).catch(function (e) { cards.push({ name: name, status: 'error', reasons: ['Could not read the file: ' + (e && e.message || e) + '. If OneDrive is still syncing it, wait for the green tick and check again.'] }); });
        });
      }, Promise.resolve());
    }).then(function () {
      // several files of one source in the same drop: only the newest data date can be used
      SOURCES.forEach(function (src) {
        var same = cards.filter(function (c) { return c.src === src && c.status !== 'refuse' && c.status !== 'error'; });
        if (same.length < 2) return;
        same.sort(function (a, b) { return String(b.dataAsOf || '').localeCompare(String(a.dataAsOf || '')); });
        same.slice(1).forEach(function (c) { c.status = 'refuse'; c.reasons.push('A newer ' + REG[src].short.toLowerCase() + ' file (' + same[0].name + ') is in the same drop.'); });
      });
      // v0.2.0 — several plans in one drop: only the most recently saved one is filed
      var plans = cards.filter(function (c) { return c.src === 'PLAN' && c.status === 'accept'; });
      if (plans.length > 1) {
        plans.sort(function (a, b) { return String(b.plan.saved || '').localeCompare(String(a.plan.saved || '')); });
        plans.slice(1).forEach(function (c) { c.status = 'refuse'; c.reasons.push('A more recently saved plan (' + plans[0].name + ') is in the same drop.'); });
      }
      S.cards = cards; S.busy = false; openCards(cards, '');
    }).catch(function (e) { S.busy = false; setCardsMsg('Could not read the folder: ' + (e && e.message || e)); });
  }
  // v0.2.0 — a JSON in 1 New files. A fleet plan is filed in lens\plan\ on Publish; a Bench definition is left in
  // place until Bench's before / after review (Bench v1.2.0). Plans carry no data date: the 7 / 14 / 30-day limits
  // are for SAP exports.
  function planInfo(j) {
    if (!j || typeof j !== 'object') return null;
    var comps = (j.masterData && Array.isArray(j.masterData.components)) ? j.masterData.components : Array.isArray(j.components) ? j.components : null;
    if (!comps || !comps.length) return null;
    var units = {}; comps.forEach(function (c) { var u = c && (c.unit || c.unit_id); if (u) units[u] = 1; });
    var m = j.meta || {};
    return { cc: m.clientCode || '', client: m.clientName || m.client || '', saved: m.lastSaved || '', comps: comps.length, units: Object.keys(units).length, shape: j.masterData ? 'V5' : 'V4 Flat', bench: !!(j.bench && j.bench.models) };
  }
  function assessJson(name, file, text) {
    var c = { name: name, bytes: file.size, lastModified: file.lastModified, status: 'accept', reasons: [], warnings: [], json: true };
    var j; try { j = JSON.parse(text); } catch (e) { c.status = 'error'; c.reasons.push('Not valid JSON: ' + e.message); return c; }
    var pi = planInfo(j), b = j && (j.bench || j);
    if (!pi && b && typeof b.schema === 'string' && b.schema.indexOf('numacore.bench/') === 0 && Array.isArray(b.models)) {
      c.status = 'ignore'; c.label = 'Bench definition';
      c.reasons.push('A Bench definition (' + b.models.length + ' models). Its before / after review comes with the next Bench release, so it is left where it is. Until then, import it in Bench (⋯ → Replace the Bench definition…).');
      return c;
    }
    if (!pi) { c.status = 'ignore'; c.reasons.push('Not a fleet plan or a Bench definition, so it is left where it is.'); return c; }
    c.src = 'PLAN'; c.label = 'Plan (fleet JSON)'; c.plan = pi; c.text = text;
    if (pi.cc && S.cc && S.cc !== 'DEFAULT' && pi.cc !== S.cc) { c.status = 'refuse'; c.reasons.push('This plan belongs to ' + pi.cc + ', but the plan open in Lens is ' + S.cc + '\'s.'); return c; }
    if (!pi.cc) c.warnings.push('The plan has no client code inside it.');
    return c;
  }
  function assess(XLSX, name, file, buf) {
    var c = { name: name, bytes: file.size, lastModified: file.lastModified, status: 'accept', reasons: [], warnings: [] };
    var wbr;
    try { wbr = readWorkbook(XLSX, new Uint8Array(buf), name); } catch (e) { c.status = 'error'; c.reasons.push('Excel could not read it: ' + e.message); return c; }
    if (!wbr.rec) { c.status = 'ignore'; c.reasons.push('Not recognised from its columns, so it is left where it is.'); return c; }
    if (wbr.rec.later) { c.status = 'ignore'; c.reasons.push(wbr.rec.later + ' is not read by Lens yet, so it is left where it is.'); return c; }
    var src = wbr.rec.src, spec = REG[src]; c.src = src; c.label = spec.label;
    var missing = spec.required.filter(function (k) { return wbr.rec.map[k] === undefined; }).map(function (k) { var f = spec.fields.filter(function (x) { return x[0] === k; })[0]; return f ? f[1][0] : k; });
    if (missing.length) { c.status = 'refuse'; c.reasons.push('Missing column' + (missing.length > 1 ? 's' : '') + ': ' + missing.join(', ') + '. Export it again with the Lens layout.'); return c; }
    var dg = buildDigest(wbr, src, { fileName: name, clientCode: S.cc, bytes: file.size });
    c.digest = dg; var s0 = dg.meta.sources[0];
    c.rowsIn = s0.rowsIn; c.rowsOut = s0.rowsOut; c.window = s0.window; c.dataAsOf = s0.dataAsOf; c.method = s0.asOfMethod;
    if (dg._dd.warn) c.warnings.push(dg._dd.warn);
    if (s0.rowsOut === 0) { c.status = 'refuse'; c.reasons.push('No usable rows.'); return c; }
    // right client?
    if (src === 'IW39' && s0.units && S.host && S.host.planUnits && S.host.planUnits.length) {
      var pu = {}; S.host.planUnits.forEach(function (u) { pu[String(u).toUpperCase()] = 1; });
      var hit = s0.units.filter(function (u) { return pu[u]; }).length;
      if (hit === 0) { c.status = 'refuse'; c.reasons.push('None of its ' + s0.units.length + ' units are in this plan (' + S.cc + '). It looks like another client\'s IW39.'); return c; }
      c.unitsInPlan = hit;
    }
    var cur = S.register && S.register.sources && S.register.sources[src] && S.register.sources[src].current;
    if (src === 'INV_MSTR' && cur && cur.plants && cur.plants.length && s0.plants && s0.plants.length) {
      var same = s0.plants.some(function (p) { return cur.plants.indexOf(p) >= 0; });
      if (!same) { c.status = 'refuse'; c.reasons.push('Its plant' + (s0.plants.length > 1 ? 's' : '') + ' (' + s0.plants.slice(0, 4).join(', ') + ') differ from the stock file in use (' + cur.plants.join(', ') + '). It looks like another client\'s INV_MSTR.'); return c; }
    }
    if (s0.resaved) c.warnings.push('It was re-saved in Excel after the SAP export. Check the export date, and that no columns were edited.');
    if (cur && cur.rows && Math.abs(s0.rowsOut - cur.rows) / cur.rows > 0.2) c.warnings.push('Rows: ' + s0.rowsOut.toLocaleString() + ' against ' + cur.rows.toLocaleString() + ' in the file in use. A partial export?');
    if (src === 'INV_MSTR' && !c.dataAsOf) {
      c.status = 'ask'; c.suggest = (!s0.resaved && file.lastModified) ? localIso(new Date(file.lastModified)) : '';
    }
    judgeDate(c, cur);
    return c;
  }
  // age + newer-than-in-use; re-run when the refresher enters a date
  function judgeDate(c, cur) {
    c.reasons = c.reasons.filter(function (r) { return !r._date; }); c.override = c.override || false;
    function reason(t) { var r = new String(t); r._date = true; c.reasons.push(r); }
    if (c.status === 'ask' && !c.dataAsOf) return;
    if (c.dataAsOf) {
      var a = ageDays(c.dataAsOf);
      if (a > AGE.refuse) { c.status = 'refuse'; reason('Its data is dated ' + fmtDate(c.dataAsOf) + ', ' + a + ' days old. Nothing older than ' + AGE.refuse + ' days is loaded: export a fresh one.'); return; }
      if (a < -1) { c.status = 'refuse'; reason('Its date (' + fmtDate(c.dataAsOf) + ') is in the future. Check the file name.'); return; }
      if (cur && cur.dataAsOf && c.dataAsOf < cur.dataAsOf) {
        if (!c.override) { c.status = 'older'; reason('It is older (' + fmtDate(c.dataAsOf) + ') than the file in use (' + fmtDate(cur.dataAsOf) + ').'); return; }
      }
      if (cur && cur.dataAsOf === c.dataAsOf && cur.rows === c.rowsOut && cur.bytes === c.bytes) { c.status = 'refuse'; reason('It is the same as the file in use (' + cur.standardName + ').'); return; }
    }
    if (c.status !== 'refuse' && c.status !== 'error' && c.status !== 'ignore') c.status = 'accept';
  }

  // ── publish ──────────────────────────────────────────────────────────────
  function publish() {
    var cards = S.cards || [], accepted = cards.filter(function (c) { return c.status === 'accept'; }), refused = cards.filter(function (c) { return c.status === 'refuse'; });
    if (!accepted.length && !refused.length) { closeCards(); return Promise.resolve(); }
    S.busy = true; setCardsMsg('Publishing…');
    var reg = S.register || newRegister(), newDir, inUse, dataDir, archive, log = [], now = new Date(), stamp = localStamp(now), planPublished = null;
    reg.meta.generatedAt = stamp; reg.meta.toolVersion = VERSION; reg.meta.clientCode = S.cc;
    reg.ageLimits = { amber: AGE.amber, red: AGE.red, refuse: AGE.refuse };
    return path([DIR.NEW], true).then(function (d) { newDir = d; return path([DIR.INUSE], true); }).then(function (d) { inUse = d; return path([DIR.LENS, DIR.DATA], true); })
      .then(function (d) { dataDir = d; return path([DIR.ARCHIVE], true); }).then(function (d) { archive = d; })
      .then(function () {
        return accepted.reduce(function (p, c) {
          return p.then(function () {
            if (c.src === 'PLAN') {   // v0.2.0 — a plan: into lens\plan\, the previous one to 3 Archive\Plans\
              return placePlan(newDir, c.name).then(function (placed) {
                reg.plan = { current: { file: placed, from: c.name, savedAt: c.plan.saved || null, filedAt: stamp, units: c.plan.units, shape: c.plan.shape } };
                log.push([stamp, 'PLAN', c.name, DIR.LENS + '\\' + DIR.PLAN + '\\' + placed, '', 'plan', '', '', 'filed as the plan', c.warnings.join(' | '), VERSION]);
                planPublished = { fileName: placed, text: c.text };
              });
            }
            var src = c.src, ext = (c.name.match(/\.\w+$/) || ['.xlsx'])[0].toLowerCase();
            var dateTag = c.dataAsOf ? nameDate(c.dataAsOf) : 'undated ' + nameDate(localIso(now));
            var std = src + ' ' + safeName(S.cc) + ' ' + dateTag + ext, dataFile = src + ' ' + safeName(S.cc) + ' ' + dateTag + '.js';
            var s0 = c.digest.meta.sources[0]; s0.file = std; s0.dataAsOf = c.dataAsOf || null; s0.asOfMethod = c.method;
            var prev = reg.sources[src] && reg.sources[src].current;
            // 1 · the dated copy
            return writeFile(dataDir, dataFile, toScript(c.digest, REG[src].key, REG[src].label + ' · data ' + (c.dataAsOf || 'unknown') + ' · from ' + c.name + ' · written ' + stamp + ' by numacore_workspace ' + VERSION))
              // 2 · the file in use goes to the archive
              .then(function () {
                if (!prev || !prev.standardName) return;
                return exists(inUse, prev.standardName, 'file').then(function (ex) { if (!ex) return; return dir(archive, src, true).then(function (ad) { return moveFile(inUse, prev.standardName, ad); }); });
              })
              // 3 · the new file goes into 2 In use under its standard name
              .then(function () { return moveFile(newDir, c.name, inUse, std); })
              .then(function (placed) {
                var entry = { dataFile: dataFile, standardName: placed, originalName: c.name, bytes: c.bytes, dataAsOf: c.dataAsOf || null, method: c.method, window: c.window || null,
                  rows: c.rowsOut, rowsIn: c.rowsIn, sheet: s0.sheet, refreshedAt: stamp, readerVersion: VERSION, warnings: c.warnings.map(String), units: s0.units ? s0.units.length : undefined, plants: s0.plants };
                reg.sources[src] = reg.sources[src] || { current: null, history: [] };
                if (prev) { reg.sources[src].history.unshift(prev); reg.sources[src].history = reg.sources[src].history.slice(0, 12); }
                reg.sources[src].current = entry;
                if (c.override) reg.overrides.push({ at: stamp, source: src, file: c.name, reason: 'older than the file in use (' + (prev && prev.dataAsOf) + '); used by the refresher' });
                log.push([stamp, src, c.name, placed, c.dataAsOf || 'unknown', methodWords(c.method), c.rowsIn, c.rowsOut, c.override ? 'published (override)' : 'published', c.warnings.join(' | '), VERSION]);
              });
          });
        }, Promise.resolve());
      })
      .then(function () {
        return refused.reduce(function (p, c) {
          return p.then(function () { return path([DIR.NEW, DIR.NOTUSED], true).then(function (nu) { return moveFile(newDir, c.name, nu); }).then(function (placed) {
            log.push([stamp, c.src || '', c.name, DIR.NOTUSED + '\\' + placed, c.dataAsOf || '', c.method ? methodWords(c.method) : '', c.rowsIn || '', c.rowsOut || '', 'not used', c.reasons.map(String).join(' | '), VERSION]);
          }); });
        }, Promise.resolve());
      })
      .then(function () { return writeFile(dataDir, REGISTER, toScript(reg, 'register', 'Lens client-folder register · ' + S.cc + ' · written ' + stamp)); })
      .then(function () { return appendLog(log); })
      .then(function () {
        S.register = reg; S.busy = false; S.cards = null; closeCards();
        toast('Published: ' + accepted.map(function (c) { return c.src === 'PLAN' ? 'plan ' + c.name : REG[c.src].short + ' ' + (c.dataAsOf ? fmtShort(c.dataAsOf) : 'date unknown'); }).join(' · ') + (refused.length ? ' · ' + refused.length + ' moved to Not used' : ''), 'success');
        if (planPublished && S.host && S.host.onPlan) { try { S.host.onPlan({ fileName: planPublished.fileName, json: JSON.parse(planPublished.text) }); } catch (e) { console.warn('workspace onPlan:', e); } }
        return loadCopies().then(scanNew);
      })
      .catch(function (e) { S.busy = false; setCardsMsg('Publish stopped: ' + (e && e.message || e) + '. Files already moved are listed in the refresh log; nothing was deleted.'); return appendLog(log).catch(function () {}); });
  }

  // ── meeting record: the saved plan + "What was in use.txt" (never the SAP files) ─────
  function meetingRecord(opts) {
    var json = opts.json, fileName = opts.fileName || (safeName(S.cc) + '_plan.json'), now = new Date(), day = localIso(now);
    var lines = ['Meeting record · ' + S.cc + (S.host && S.host.clientName ? ' — ' + S.host.clientName : '') + ' · ' + fmtDate(day) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()),
      '', 'Plan (the fleet JSON, saved just before this record)', '  ' + fileName + '  ·  saved ' + localStamp(now), '', 'SAP data in use at the meeting (the files themselves are in 3 Archive\\<source> or 2 In use)'];
    var reg = S.register;
    SOURCES.forEach(function (src) {
      var cur = reg && reg.sources && reg.sources[src] && reg.sources[src].current;
      if (!cur) { lines.push('  ' + REG[src].label + ': none in the folder'); return; }
      var a = ageDays(cur.dataAsOf);
      lines.push('  ' + REG[src].label + ': data ' + (cur.dataAsOf ? fmtDate(cur.dataAsOf) : 'date unknown') + (a !== null ? ' (' + a + ' day' + (a === 1 ? '' : 's') + ' old' + (a > AGE.red ? ', RED' : a > AGE.amber ? ', amber' : '') + ')' : '') + ' · ' + cur.standardName + ' · dated from ' + methodWords(cur.method) + ' · ' + (cur.rows || 0).toLocaleString() + ' rows');
    });
    lines.push('', 'Written by NumaCore Lens ' + (S.host && S.host.lensVersion || '') + ' · numacore_workspace ' + VERSION);
    var txt = lines.join('\r\n') + '\r\n';
    var body = typeof json === 'string' ? json : JSON.stringify(json, null, 2);
    if (!S.handle || S.perm !== 'granted' || S.mode === 'view') return Promise.resolve({ ok: false, txt: txt, body: body, reason: S.mode === 'view' && S.handle ? 'view' : 'no folder' });   // v0.2.0 — view only writes nothing
    return path([DIR.ARCHIVE, DIR.MEETINGS, day], true).then(function (md) {
      return freeName(md, fileName).then(function (nm) { return writeFile(md, nm, body).then(function () { return freeName(md, 'What was in use.txt'); }).then(function (tn) { return writeFile(md, tn, txt).then(function () { return { ok: true, where: DIR.ARCHIVE + '\\' + DIR.MEETINGS + '\\' + day + '\\', file: nm, txtFile: tn }; }); }); });
    });
  }

  // ── v0.2.0 — the plan in the folder: lens\plan\ (latest) + 3 Archive\Plans\ (earlier ones; nothing deleted) ──
  function canSavePlan() { return !!S.handle && S.perm === 'granted' && S.mode === 'edit'; }
  function listJson(dirH) {
    var it = dirH.values(), out = [];
    function step() { return it.next().then(function (r) { if (r.done) return out; var e = r.value; if (e.kind === 'file' && /\.json$/i.test(e.name) && !/^~\$|^\./.test(e.name)) out.push(e); return step(); }); }
    return step();
  }
  function archiveOldPlans(planDir, keep) {
    return listJson(planDir).then(function (files) {
      var old = files.filter(function (e) { return e.name !== keep; });
      if (!old.length) return;
      return path([DIR.ARCHIVE, DIR.PLANS], true).then(function (ad) { return old.reduce(function (p, e) { return p.then(function () { return moveFile(planDir, e.name, ad); }); }, Promise.resolve()); });
    });
  }
  function placePlan(fromDir, name) {   // the new plan in first, then the others out: lens\plan is never empty
    var planDir;
    return path([DIR.LENS, DIR.PLAN], true).then(function (d) { planDir = d; return moveFile(fromDir, name, planDir); })
      .then(function (placed) { return archiveOldPlans(planDir, placed).then(function () { putMeta({ planFile: placed }); return placed; }); });
  }
  function savePlan(text, fileName) {
    if (!canSavePlan()) return Promise.resolve({ ok: false, reason: S.mode === 'view' ? 'view' : 'no folder' });
    var planDir;
    return path([DIR.LENS, DIR.PLAN], true).then(function (d) { planDir = d; return freeName(d, fileName); })
      .then(function (nm) { return writeFile(planDir, nm, text).then(function () { return nm; }); })
      .then(function (nm) { return archiveOldPlans(planDir, nm).then(function () { return nm; }); })
      .then(function (nm) { putMeta({ planFile: nm, planSaved: localStamp(new Date()) }); return { ok: true, where: DIR.LENS + '\\' + DIR.PLAN + '\\', file: nm }; });
  }
  function stampOf(d) { return localIso(d) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); }
  function planStamp(name) { var m = /(\d{4}-\d{2}-\d{2})[_ T](\d{2})[-:.]?(\d{2})[-:.]?(\d{2})?/.exec(name); return m ? m[1] + 'T' + m[2] + m[3] + (m[4] || '00') : ''; }
  // the newest fleet plan in a folder: lens\plan\ first, else a fleet JSON waiting in 1 New files
  function findPlan(h) {
    function sub(names) { var p = Promise.resolve(h); names.forEach(function (n) { p = p.then(function (d) { return d.getDirectoryHandle(n); }); }); return p; }
    function newest(dirH, where) {
      return listJson(dirH).then(function (files) {
        return Promise.all(files.map(function (fh) { return fh.getFile().then(function (f) { return { f: f, key: planStamp(f.name) || stampOf(new Date(f.lastModified)) }; }); }));
      }).then(function (xs) {
        xs.sort(function (a, b) { return String(b.key).localeCompare(String(a.key)); });
        return xs.reduce(function (p, x) {
          return p.then(function (found) {
            if (found) return found;
            return x.f.text().then(function (t) { var j; try { j = JSON.parse(t); } catch (e) { return null; } var pi = planInfo(j); return pi ? { json: j, fileName: x.f.name, info: pi, where: where } : null; });
          });
        }, Promise.resolve(null));
      });
    }
    return sub([DIR.LENS, DIR.PLAN]).then(function (d) { return newest(d, 'plan'); }, function () { return null; })
      .then(function (p) { return p || sub([DIR.NEW]).then(function (d) { return newest(d, 'new'); }, function () { return null; }); });
  }
  function readRegisterOf(h) {
    return h.getDirectoryHandle(DIR.LENS).then(function (l) { return l.getDirectoryHandle(DIR.DATA); }).then(function (d) { return d.getFileHandle(REGISTER); })
      .then(function (fh) { return fh.getFile(); }).then(function (f) { return f.text(); }).then(parseScript).catch(function () { return null; });
  }
  function inspectFolder(h, mode) {
    if ([DIR.NEW, DIR.INUSE, DIR.ARCHIVE, DIR.LENS, DIR.DATA, DIR.NOTUSED, DIR.MEETINGS, DIR.PLAN, DIR.PLANS].indexOf(h.name) >= 0)
      return Promise.reject(new Error('"' + h.name + '" is a folder inside the client folder. Pick the client folder itself.'));
    return Promise.all([layoutPresent(h), findPlan(h), readRegisterOf(h)]).then(function (r) {
      var setUp = r[0] >= 4, plan = r[1], reg = r[2], cc = (reg && reg.meta && reg.meta.clientCode) || '';
      S.pending = { handle: h, mode: mode, folderName: h.name, cc: cc, setUp: setUp, planWhere: plan && plan.where, planFile: plan && plan.fileName };
      return { folderName: h.name, mode: mode, setUp: setUp, cc: cc, plan: plan };
    });
  }
  // Lens's landing page: pick a client folder (a user gesture), then read its newest plan
  function openFolder(mode) {
    if (!root.showDirectoryPicker) return Promise.reject(new Error('Opening a folder needs Edge or Chrome.'));
    mode = mode === 'view' ? 'view' : 'edit';
    return root.showDirectoryPicker({ id: 'numacore-client', mode: mode === 'view' ? 'read' : 'readwrite' }).then(function (h) { return inspectFolder(h, mode); });
  }
  function openRecent(id) {
    id = String(id || '').replace(/[^A-Z0-9_]/gi, '_');
    return Promise.all([idbGet('folder_' + id), idbGet('meta_' + id)]).then(function (r) {
      var h = r[0], m = r[1] || {}, mode = m.mode || 'edit';
      if (!h) throw new Error('That folder is no longer remembered in this browser. Open it again.');
      return (h.requestPermission ? h.requestPermission({ mode: mode === 'view' ? 'read' : 'readwrite' }) : Promise.resolve('granted')).then(function (p) {
        if (p !== 'granted') throw new Error('The browser did not allow access to "' + h.name + '".');
        return inspectFolder(h, mode);
      });
    });
  }

  // ── UI: the header strip + the check cards ───────────────────────────────
  function injectStyle() {
    if (!root.document || document.getElementById('ncw-style')) return;
    var st = document.createElement('style'); st.id = 'ncw-style';
    st.textContent = [
      '.ncw-strip{display:flex;align-items:center;gap:6px;font-family:var(--nc-font-mono,"JetBrains Mono",monospace);font-size:.58rem;letter-spacing:.3px;white-space:nowrap}',
      '.ncw-chip{border:1px solid var(--nc-border,#2A2D3A);border-radius:10px;padding:2px 8px;color:var(--nc-text-m,#8B8FA3);cursor:default}',
      '.ncw-chip.ok{color:#34D399;border-color:rgba(52,211,153,.35)}.ncw-chip.amber{color:#FBBF24;border-color:rgba(251,191,36,.45)}.ncw-chip.red,.ncw-chip.expired{color:#EF4444;border-color:rgba(239,68,68,.5)}',
      '.ncw-btn{background:transparent;border:1px solid rgba(61,201,160,.3);color:#3dc9a0;padding:3px 9px;border-radius:4px;font-size:.58rem;letter-spacing:1px;cursor:pointer;font-family:inherit}',
      '.ncw-btn:hover{background:rgba(61,201,160,.08)}.ncw-btn.gold{border-color:rgba(251,191,36,.55);color:#FBBF24}.ncw-btn.solid{background:#3dc9a0;color:#030F0C;border-color:#3dc9a0;font-weight:600}',
      '.ncw-ov{position:fixed;inset:0;background:rgba(3,8,14,.72);z-index:9600;display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto}',
      '.ncw-dlg{background:var(--nc-surface,#080C14);border:1px solid rgba(61,201,160,.25);border-radius:10px;max-width:760px;width:100%;padding:18px 20px;color:var(--nc-text,#E8E9ED);font-family:var(--nc-font-body,Barlow,sans-serif);font-size:13px;box-shadow:0 10px 40px rgba(0,0,0,.5)}',
      '.ncw-dlg h3{margin:0 0 4px;font-family:var(--nc-font-head,Rajdhani,sans-serif);font-size:18px;color:#3dc9a0;letter-spacing:.5px}',
      '.ncw-sub{color:var(--nc-text-m,#8B8FA3);font-size:12px;margin-bottom:12px}',
      '.ncw-card{border:1px solid var(--nc-border,#2A2D3A);border-left-width:4px;border-radius:6px;padding:10px 12px;margin:8px 0}',
      '.ncw-card.accept{border-left-color:#34D399}.ncw-card.refuse,.ncw-card.error{border-left-color:#EF4444}.ncw-card.ask,.ncw-card.older{border-left-color:#FBBF24}.ncw-card.ignore{border-left-color:#5C6078;opacity:.8}',
      '.ncw-card .t{display:flex;justify-content:space-between;gap:10px;font-weight:600}.ncw-card .w{font-size:11px;letter-spacing:1px;text-transform:uppercase}',
      '.ncw-card .m{color:var(--nc-text-m,#8B8FA3);font-size:12px;margin-top:4px}.ncw-card .r{margin-top:6px;font-size:12px}.ncw-card .r.bad{color:#EF4444}.ncw-card .r.warn{color:#FBBF24}',
      '.ncw-card input[type=date]{background:#040E1C;border:1px solid #2A2D3A;color:#E8E9ED;border-radius:4px;padding:3px 6px;font-size:12px}',
      '.ncw-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.ncw-msg{color:var(--nc-text-m,#8B8FA3);font-size:12px;padding:8px 0}',
      /* the "?" helper */
      '.ncw-q{padding:3px 8px;font-weight:700}',
      '.ncw-help h4{font-family:var(--nc-font-head,Rajdhani,sans-serif);font-size:14px;font-weight:600;color:var(--nc-text,#E8E9ED);margin:14px 0 4px;letter-spacing:.3px}',
      '.ncw-help p{margin:0 0 6px;font-size:12.5px;line-height:1.55;color:#B8BCC8}',
      '.ncw-help pre{background:#040E1C;border:1px solid var(--nc-border,#2A2D3A);border-radius:6px;padding:10px 12px;font-family:var(--nc-font-mono,"JetBrains Mono",monospace);font-size:11.5px;line-height:1.55;color:var(--nc-text,#E8E9ED);overflow-x:auto;margin:6px 0;white-space:pre}',
      '.ncw-help table{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0}',
      '.ncw-help th{text-align:left;font-family:var(--nc-font-mono,monospace);font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--nc-text-m,#8B8FA3);border-bottom:1px solid var(--nc-border,#2A2D3A);padding:5px 8px}',
      '.ncw-help td{border-bottom:1px solid rgba(42,45,58,.6);padding:6px 8px;vertical-align:top;color:#D6D8E0}',
      '.ncw-help ul{margin:4px 0 0 18px;padding:0;font-size:12.5px;color:#B8BCC8}.ncw-help li{margin:3px 0;line-height:1.5}',
      '.ncw-help code{font-family:var(--nc-font-mono,monospace);font-size:11.5px;color:#3dc9a0}'
    ].join('');
    document.head.appendChild(st);
  }
  function mountStrip(el) { injectStyle(); S.stripEl = el; renderStrip(); }
  function renderStrip() {
    var el = S.stripEl; if (!el || !root.document) return;
    if (!S.host) { el.innerHTML = ''; return; }
    var h = '<span class="ncw-strip">';
    var helpBtn = '<button class="ncw-btn ncw-q" data-ncw="help" title="How the client folder works: what to create, where to put what">?</button>';
    if (!S.handle || S.perm === 'none') {
      h += '<button class="ncw-btn" data-ncw="connect" title="Connect the client\'s synced OneDrive folder once. Lens then reads SAP exports dropped in 1 New files. Edge or Chrome.">📁 CONNECT FOLDER</button>' + helpBtn;
    } else if (S.perm !== 'granted') {
      h += '<button class="ncw-btn gold" data-ncw="allow" title="The browser needs your OK once per session to read the client folder ' + esc(S.folderName) + '.">📁 ALLOW ' + esc(S.folderName).toUpperCase() + '</button>' + helpBtn;
    } else {
      if (S.mode === 'view') h += '<span class="ncw-chip" title="View only: this browser reads the folder but never changes it. The person who refreshes the folder publishes new files and keeps the plan. Switch in the ? panel.">VIEW ONLY</span>';   // v0.2.0
      SOURCES.forEach(function (src) {
        var cur = S.register && S.register.sources && S.register.sources[src] && S.register.sources[src].current;
        if (!cur) { h += '<span class="ncw-chip" title="No ' + esc(REG[src].label) + ' in the folder yet. Drop an export in 1 New files.">' + esc(REG[src].short) + ' · none</span>'; return; }
        var a = ageDays(cur.dataAsOf), cls = ageClass(cur.dataAsOf);
        var words = !cur.dataAsOf ? 'date unknown' : cls === 'expired' ? fmtShort(cur.dataAsOf) + ' · expired, refresh' : fmtShort(cur.dataAsOf) + ' · ' + a + ' d';
        var tip = REG[src].label + ': data ' + fmtDate(cur.dataAsOf) + (a !== null ? ' (' + a + ' days old)' : '') + ' · dated from ' + methodWords(cur.method) + (cur.window ? ' · covers ' + fmtDate(cur.window.from) + ' – ' + fmtDate(cur.window.to) : '') +
          ' · ' + cur.standardName + ' · ' + (cur.rows || 0).toLocaleString() + ' rows · refreshed ' + String(cur.refreshedAt || '').slice(0, 16).replace('T', ' ') + ' · amber after ' + AGE.amber + ' days, red after ' + AGE.red + ', not loaded after ' + AGE.refuse;
        h += '<span class="ncw-chip ' + cls + '" title="' + esc(tip) + '">' + esc(REG[src].short) + ' ' + esc(words) + '</span>';
      });
      if (S.newFiles.length && S.mode === 'view') h += '<span class="ncw-chip amber" title="' + esc(S.newFiles.join(', ')) + ' — waiting for the person who refreshes the folder">' + S.newFiles.length + ' NEW · FOR THE REFRESHER</span>';   // v0.2.0
      else if (S.newFiles.length) h += '<button class="ncw-btn gold" data-ncw="check" title="' + esc(S.newFiles.join(', ')) + '">' + S.newFiles.length + ' NEW FILE' + (S.newFiles.length > 1 ? 'S' : '') + ': CHECK</button>';
      else h += '<button class="ncw-btn" data-ncw="rescan" title="Folder: ' + esc(S.folderName) + '. Look in 1 New files again.">↻</button>';
      h += helpBtn;
    }
    h += '</span>';
    el.innerHTML = h;
    el.querySelectorAll('[data-ncw]').forEach(function (b) {
      b.onclick = function () { var a = b.getAttribute('data-ncw'); if (a === 'connect') connect(); else if (a === 'allow') allow(); else if (a === 'check') checkNew(); else if (a === 'rescan') scanNew(); else if (a === 'help') openHelp(); };
    });
  }
  // v0.2.0 — CONNECT FOLDER asks how the folder will be used, then asks the browser for exactly that permission
  var CH = null;
  function openChooser() {
    injectStyle();
    if (!CH) { CH = document.createElement('div'); CH.className = 'ncw-ov'; document.body.appendChild(CH); CH.addEventListener('click', function (e) { if (e.target === CH) CH.style.display = 'none'; }); }
    CH.innerHTML = '<div class="ncw-dlg" style="max-width:640px"><h3>Connect the client folder</h3><div class="ncw-sub">How will you use it in this browser? Chrome or Edge then asks for exactly that permission, for this one folder and this web address only.</div>' +
      '<div class="ncw-card accept"><div class="t"><span>View only</span><span class="w">most people</span></div><div class="m">Lens reads the published SAP data and the plan, and never changes anything in the folder: the browser asks to <b>view</b> files. SAVE FILE and MEETING RECORD go to your Downloads.</div><div class="ncw-foot" style="margin-top:8px"><button class="ncw-btn solid" data-ncw-mode="view">Connect — view only</button></div></div>' +
      '<div class="ncw-card ask"><div class="t"><span>I refresh this folder</span><span class="w">edit</span></div><div class="m">For the person who drops the SAP exports and publishes them. Lens moves files between the folders (never deleting anything), writes the dated copies, keeps the plan in <code>lens\\plan</code> and writes meeting records. The browser asks to <b>edit</b> files, in this folder only.</div><div class="ncw-foot" style="margin-top:8px"><button class="ncw-btn gold" data-ncw-mode="edit">Connect — I refresh it</button></div></div>' +
      '<div class="ncw-foot"><button class="ncw-btn" data-ncw-mode="">Cancel</button></div></div>';
    CH.style.display = 'flex';
    CH.querySelectorAll('[data-ncw-mode]').forEach(function (b) { b.onclick = function () { var m = b.getAttribute('data-ncw-mode'); CH.style.display = 'none'; if (m) connect(m); }; });
  }
  var OV = null;
  function openCards(cards, msg) {
    injectStyle();
    if (!OV) { OV = document.createElement('div'); OV.className = 'ncw-ov'; document.body.appendChild(OV); OV.addEventListener('click', function (e) { if (e.target === OV && !S.busy) closeCards(); }); }
    OV.style.display = 'flex';
    var acc = cards.filter(function (c) { return c.status === 'accept'; }).length, ref = cards.filter(function (c) { return c.status === 'refuse'; }).length;
    var h = '<div class="ncw-dlg"><h3>New files in ' + esc(S.folderName) + '</h3><div class="ncw-sub">Checked against the ' + AGE.amber + ' / ' + AGE.red + '-day limits and the files in use. Nothing is moved until you press Publish.</div>';
    if (msg) h += '<div class="ncw-msg" id="ncw-msg">' + esc(msg) + '</div>';
    cards.forEach(function (c, i) {
      var word = { accept: 'Will be used', refuse: 'Not used', error: 'Could not read', ask: 'Question', older: 'Older than in use', ignore: 'Left in place' }[c.status] || c.status;
      h += '<div class="ncw-card ' + c.status + '"><div class="t"><span>' + esc(c.label || 'File') + ' · ' + esc(c.name) + '</span><span class="w">' + esc(word) + '</span></div>';
      if (c.plan) h += '<div class="m">Client <b>' + esc(c.plan.cc || '—') + '</b>' + (c.plan.client ? ' · ' + esc(c.plan.client) : '') + ' · ' + c.plan.units + ' units · ' + c.plan.comps.toLocaleString() + ' components · ' + esc(c.plan.shape) + (c.plan.saved ? ' · saved ' + esc(fmtDate(localIso(new Date(c.plan.saved)))) : '') + (c.plan.bench ? ' · with its Bench definition' : '') + (c.status === 'accept' ? ' · Publish files it in <code>lens\\plan</code> and offers to open it' : '') + '</div>';   // v0.2.0
      if (c.digest) h += '<div class="m">' + (c.dataAsOf ? 'Data date <b>' + esc(fmtDate(c.dataAsOf)) + '</b> (' + ageDays(c.dataAsOf) + ' days old) · dated from ' + esc(methodWords(c.method)) : 'Data date not known yet') +
        (c.window ? ' · covers ' + esc(fmtDate(c.window.from)) + ' – ' + esc(fmtDate(c.window.to)) : '') + ' · ' + (c.rowsOut || 0).toLocaleString() + ' rows kept of ' + (c.rowsIn || 0).toLocaleString() + (c.unitsInPlan ? ' · ' + c.unitsInPlan + ' plan units found' : '') + '</div>';
      if (c.status === 'ask') h += '<div class="r warn">The INV_MSTR has no date inside it and its file name has none. Enter the date the export was taken: <input type="date" data-ncw-date="' + i + '" value="' + esc(c.suggest || '') + '"> ' +
        (c.suggest ? '<span style="color:#8B8FA3">(pre-filled with the day the file was last saved; it was not re-saved in Excel)</span>' : '') + ' <button class="ncw-btn" data-ncw-use="' + i + '">Use this date</button> <button class="ncw-btn" data-ncw-unknown="' + i + '">Don\'t know</button></div>';
      if (c.status === 'older') h += '<div class="r warn"><label><input type="checkbox" data-ncw-over="' + i + '"> Use it anyway (the override is logged)</label></div>';
      c.reasons.forEach(function (r) { h += '<div class="r ' + (c.status === 'ignore' ? '' : 'bad') + '">' + esc(r) + '</div>'; });
      (c.warnings || []).forEach(function (w) { h += '<div class="r warn">⚠ ' + esc(w) + '</div>'; });
      h += '</div>';
    });
    if (cards.length) h += '<div class="ncw-foot"><button class="ncw-btn" data-ncw-x="1">Cancel</button><button class="ncw-btn solid" data-ncw-pub="1"' + (acc + ref ? '' : ' disabled') + '>Publish' + (acc ? ' ' + acc + ' file' + (acc > 1 ? 's' : '') : '') + (ref ? ' · move ' + ref + ' to Not used' : '') + '</button></div>';
    h += '</div>';
    OV.innerHTML = h;
    var q = function (sel) { return OV.querySelectorAll(sel); };
    q('[data-ncw-x]').forEach(function (b) { b.onclick = closeCards; });
    q('[data-ncw-pub]').forEach(function (b) { b.onclick = function () { if (S.cards && S.cards.some(function (c) { return c.status === 'ask'; })) { setCardsMsg('Answer the date question first (or press "Don\'t know").'); return; } publish(); }; });
    q('[data-ncw-use]').forEach(function (b) { b.onclick = function () { var i = +b.getAttribute('data-ncw-use'), c = S.cards[i], v = (OV.querySelector('[data-ncw-date="' + i + '"]') || {}).value; if (!v) return; c.dataAsOf = v; c.method = 'entered'; c.status = 'accept'; judgeDate(c, curOf(c.src)); openCards(S.cards, ''); }; });
    q('[data-ncw-unknown]').forEach(function (b) { b.onclick = function () { var c = S.cards[+b.getAttribute('data-ncw-unknown')]; c.dataAsOf = null; c.method = 'unknown'; c.status = 'accept'; c.warnings.push('Stock date unknown: stock shows red everywhere until a dated export replaces it.'); openCards(S.cards, ''); }; });
    q('[data-ncw-over]').forEach(function (b) { b.onchange = function () { var c = S.cards[+b.getAttribute('data-ncw-over')]; c.override = b.checked; c.status = 'accept'; judgeDate(c, curOf(c.src)); openCards(S.cards, ''); }; });
  }
  function curOf(src) { return S.register && S.register.sources && S.register.sources[src] && S.register.sources[src].current; }
  function setCardsMsg(t) { if (!OV) return; var m = OV.querySelector('#ncw-msg'); if (m) m.textContent = t; else { var d = OV.querySelector('.ncw-sub'); if (d) d.insertAdjacentHTML('afterend', '<div class="ncw-msg" id="ncw-msg">' + esc(t) + '</div>'); } }
  function closeCards() { if (OV) OV.style.display = 'none'; S.cards = S.busy ? S.cards : null; }

  // ── the "?" helper: what to create, where to put what (operator request 2026-09-27) ─────
  var HELP = null;
  function openHelp() {
    injectStyle();
    if (!HELP) {
      HELP = document.createElement('div'); HELP.className = 'ncw-ov'; document.body.appendChild(HELP);
      HELP.addEventListener('click', function (e) { if (e.target === HELP || e.target.hasAttribute('data-ncw-hx')) HELP.style.display = 'none'; });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && HELP && HELP.style.display !== 'none') HELP.style.display = 'none'; });
    }
    var cc = safeName(S.cc || 'CLIENT'), ex = nameDate(localIso(new Date()));
    var now = !S.handle || S.perm === 'none' ? '<b>Not connected yet.</b> Create the folder (step 1), then open it from Lens\'s start page or press <b>📁 CONNECT FOLDER</b>.'
      : S.perm !== 'granted' ? 'Connected to <b>' + esc(S.folderName) + '</b>. The browser needs one <b>Allow</b> this session (the gold button).'
      : 'Connected to <b>' + esc(S.folderName) + '</b> for ' + esc(cc) + (S.mode === 'view' ? ', <b>view only</b>' : ', <b>edit</b> (you refresh it)') + '.';
    HELP.innerHTML = '<div class="ncw-dlg ncw-help">' +
      '<h3>The client folder — how it works</h3>' +
      '<div class="ncw-sub">' + now + ' Lens reads SAP exports from the folder, dates them from their data, and hands them to Bench and Deploy. You never load them by hand.</div>' +
      '<h4>1 · Create one folder per client</h4>' +
      '<p>In that client\'s OneDrive / SharePoint library, synced to your PC. For example <code>' + esc(cc) + ' Lens</code>. Right-click it and choose <b>Always keep on this device</b>.</p>' +
      '<h4>2 · Connect it (once per client)</h4>' +
      '<p>On Lens\'s start page choose <b>Open a client folder</b> (or, with a plan loaded, press <b>📁 CONNECT FOLDER</b>) and pick that folder itself, not a folder inside it. Choose <b>View only</b> (most people: Lens never changes the folder) or <b>I refresh it</b> (the one person who publishes new files: the browser allows editing this folder only). Lens creates everything else and remembers it for this client (Edge or Chrome):</p>' +
      '<pre>' + esc(cc) + ' Lens\\\n' +
      '├── 1 New files\\          ← YOU drop SAP exports here\n' +
      '│   └── Not used\\         ← Lens: refused files (reason in the log)\n' +
      '├── 2 In use\\             ← Lens only: the IW39 + INV_MSTR in use now\n' +
      '├── 3 Archive\\            ← Lens only: replaced files, Refresh log.csv\n' +
      '│   └── Meetings\\&lt;date&gt;\\  ← MEETING RECORD: saved plan + "What was in use"\n' +
      '│   └── Plans\\             ← Lens: earlier plans (nothing is deleted)\n' +
      '└── lens\\\n' +
      '    ├── plan\\             ← the plan: SAVE FILE (edit) keeps it here\n' +
      '    └── data\\             ← Lens only: dated copies. Never edit</pre>' +
      '<h4>3 · Where to put what</h4>' +
      '<table><thead><tr><th>What</th><th>Where</th><th>Name / notes</th></tr></thead><tbody>' +
      '<tr><td>IW39 export</td><td><code>1 New files</code></td><td><code>IW39 ' + esc(cc) + ' ' + ex + '.xlsx</code> (the export day)</td></tr>' +
      '<tr><td>INV_MSTR export</td><td><code>1 New files</code></td><td><code>INV_MSTR ' + esc(cc) + ' ' + ex + '.xlsx</code>. The date in the name matters most: the file has no date inside, otherwise Lens asks you</td></tr>' +
      '<tr><td>The plan (fleet JSON)</td><td><code>1 New files</code> once; then Lens keeps it in <code>lens\\plan</code></td><td>Publish files it and offers to open it. From then on SAVE FILE (edit) saves it there and moves the previous one to <code>3 Archive\\Plans</code>. Each MEETING RECORD also puts a copy in <code>3 Archive\\Meetings</code></td></tr>' +
      '<tr><td>Bench definition (.json)</td><td>Import it in Bench for now</td><td>Recognised in <code>1 New files</code> but left there until Bench\'s before / after review arrives</td></tr>' +
      '<tr><td>MB51, Component Snapshots</td><td>Keep them out for now</td><td>Not read yet (snapshots come with the next Bench release, reviewed before they change anything). If dropped, they are left where they are</td></tr>' +
      '</tbody></table>' +
      '<h4>4 · Each refresh (weekly)</h4>' +
      '<p>Drop fresh IW39 + INV_MSTR the same day → press <b>N NEW FILES: CHECK</b> → read the cards → <b>Publish</b>. The header then shows each source\'s data date and age.</p>' +
      '<h4>Rules</h4><ul>' +
      '<li>Save exports <b>straight from SAP</b> as .xlsx, with the same saved layout every time. Don\'t open and re-save them in Excel (it is flagged).</li>' +
      '<li>Age: <span style="color:#34D399">green</span> up to ' + AGE.amber + ' days, <span style="color:#FBBF24">amber</span> after ' + AGE.amber + ', <span style="color:#EF4444">red</span> after ' + AGE.red + '. <b>Nothing older than ' + AGE.refuse + ' days is loaded.</b></li>' +
      '<li>An older file never replaces a newer one without your say-so. An old export renamed with a new date is caught.</li>' +
      '<li>Never edit anything in <code>2 In use</code>, <code>3 Archive</code> or <code>lens</code>. Lens moves the files; <b>nothing is ever deleted</b>.</li>' +
      '<li>One folder per client. A folder is refused for another client\'s plan.</li>' +
      '<li><b>What "edit" allows:</b> this web address can change files in this one folder only, nothing else on your PC or OneDrive. Lens only creates its folders, moves files between them (copy, check, then remove the original), and writes its own files (dated copies, register, log, plans, meeting records). OneDrive keeps version history and a recycle bin for all of it. To withdraw it: the icon left of the address bar → Site settings.</li></ul>' +
      (S.handle && S.perm === 'granted' ? '<div class="ncw-foot" style="justify-content:flex-start">' + (S.mode === 'view' ? '<button class="ncw-btn gold" data-ncw-sm="edit">I refresh this folder — switch to edit</button>' : '<button class="ncw-btn" data-ncw-sm="view">Switch this browser to view only</button>') + '</div>' : '') +
      '<div class="ncw-foot"><button class="ncw-btn solid" data-ncw-hx="1">Got it</button></div></div>';
    HELP.querySelectorAll('[data-ncw-sm]').forEach(function (b) { b.onclick = function () { HELP.style.display = 'none'; setMode(b.getAttribute('data-ncw-sm')); }; });
    HELP.style.display = 'flex';
  }

  // ── attach to a plan (called by Lens after every plan load) ─────────────
  function attach(host) {
    var sameClient = S.host && S.cc === (host.clientCode || 'DEFAULT');
    S.host = host; S.cc = host.clientCode || 'DEFAULT';
    if (!sameClient) { S.handle = null; S.perm = 'none'; S.folderName = ''; S.register = null; S.loaded = {}; S.newFiles = []; }
    else S.loaded = {};   // a re-load of the same client re-delivers the copies (Lens rebuilt its state)
    renderStrip();
    if (!root.indexedDB || !root.document) return Promise.resolve();
    // v0.2.0 — a folder opened on Lens's landing page is adopted for this plan instead of the remembered one
    var pend = S.pending; S.pending = null;
    if (pend && pend.cc && pend.cc !== S.cc) toast('The folder "' + pend.folderName + '" belongs to ' + pend.cc + ', not ' + S.cc + ', so it was not connected.', 'warn');
    else if (pend) {
      S.mode = pend.mode;
      return useHandle(pend.handle, !pend.setUp).then(function (ok) {
        if (!ok) return;
        // a plan opened straight from 1 New files is filed in lens\plan (edit only)
        var file = pend.planWhere === 'new' && S.mode === 'edit' ? path([DIR.NEW], false).then(function (d) { return placePlan(d, pend.planFile); }).then(function (p) { toast('The plan ' + p + ' was filed in lens\\plan.', 'success'); }) : Promise.resolve();
        return file.catch(function (e) { toast('The plan stays in 1 New files: ' + (e && e.message || e), 'warn'); }).then(refreshAll);
      }).catch(function (e) { console.warn('workspace adopt:', e); });
    }
    return restore().catch(function (e) { console.warn('workspace restore:', e); });
  }
  if (root.document) {
    root.document.addEventListener('visibilitychange', function () { if (!document.hidden && S.handle && S.perm === 'granted' && !S.busy) scanNew(); });
  }

  root.NumaCoreWorkspace = {
    version: VERSION, AGE: AGE,
    attach: attach, mountStrip: mountStrip, connect: connect, allow: allow, checkNew: checkNew, rescan: scanNew,
    openFolder: openFolder, openRecent: openRecent, recent: recent, savePlan: savePlan, canSavePlan: canSavePlan, setMode: setMode,   // v0.2.0
    meetingRecord: meetingRecord, forDeploy: forDeploy, forBench: forBench, state: publicState,
    _internal: { REG: REG, norm: norm, mapColumns: mapColumns, recognise: recognise, findHeaderRow: findHeaderRow, coerce: coerce, dateFromFileName: dateFromFileName,
      iw39DataDate: iw39DataDate, readWorkbook: readWorkbook, buildDigest: buildDigest, toScript: toScript, parseScript: parseScript, ageDays: ageDays, ageClass: ageClass,
      useHandle: useHandle, refreshAll: refreshAll, publish: publish, assess: assess, S: S,
      assessJson: assessJson, planInfo: planInfo, findPlan: findPlan, inspectFolder: inspectFolder, placePlan: placePlan, planStamp: planStamp }
  };
})(typeof window !== 'undefined' ? window : this);

/**
 * numacore_lib.js — NumaCore Lens Suite shared helpers
 *
 * Loaded by all four suite tools via <script src="numacore_lib.js"></script>.
 * Exposes a single global: window.NumaCoreLib
 *
 * No external dependencies, no build step. Works on file:// and https
 * (GitHub Pages production deployment + standalone disk runs).
 *
 * Lifted from existing tool implementations:
 *   esc()         — Intake v7.5:761
 *   parseDate()   — Intake v7.5:771
 *   fmtDate()     — synthesised from CPT v17:1652-1660
 *   scopedKey()   — CPT v17:1219 (getSaveKey pattern)
 *   showToast()   — CPT v17:2299 (extended with severity)
 *   loadFleetFile()— synthesised from CPT:6136 + Deploy:1033 + Lens:3596
 *
 * Version 1.0.0 — Chunk 1 baseline (six helpers).
 * Future chunks add: makeComponentId, validateFleetJSON_v5, migrateV4FlatToV5.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var DEFAULT_TZ = 'America/Edmonton';

  // ─────────────────────────────────────────────────────────────
  // HTML ESCAPE
  // ─────────────────────────────────────────────────────────────
  /**
   * Escape a value for safe innerHTML interpolation.
   * Handles null/undefined gracefully (returns empty string).
   * Escapes the five XML-special characters plus single quote.
   */
  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─────────────────────────────────────────────────────────────
  // DATE PARSING
  // ─────────────────────────────────────────────────────────────
  /**
   * Parse a value of any common origin into an ISO date string (YYYY-MM-DD).
   * Handles ISO strings, Excel serial numbers, JS Date objects.
   * Returns null if unparseable.
   */
  function parseDate(val) {
    if (val == null || val === '') return null;
    if (val instanceof Date) {
      if (isNaN(val)) return null;
      return val.toISOString().split('T')[0];
    }
    if (typeof val === 'number') {
      // Excel serial date — origin 1900-01-01, offset 25569 days from Unix epoch
      var d = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (isNaN(d)) return null;
      return d.toISOString().split('T')[0];
    }
    if (typeof val === 'string') {
      var s = val.trim();
      if (!s) return null;
      var dd = new Date(s);
      if (!isNaN(dd)) return dd.toISOString().split('T')[0];
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────
  // DATE FORMATTING
  // ─────────────────────────────────────────────────────────────
  /**
   * Format an ISO date string for display.
   * Format options:
   *   'iso'       (default) — returns the input as-is (YYYY-MM-DD)
   *   'short'     — "Jan 5, 2026"
   *   'monthYear' — "Jan 26"
   *   'long'      — "January 5, 2026"
   * Timezone-aware via DEFAULT_TZ ('America/Edmonton' / Mountain).
   */
  function fmtDate(s, format) {
    if (!s) return '';
    format = format || 'iso';
    if (format === 'iso') return String(s).slice(0, 10);

    var d = (s instanceof Date) ? s : new Date(String(s).slice(0, 10) + 'T00:00:00');
    if (isNaN(d)) return '';

    var opts = { timeZone: DEFAULT_TZ };
    if (format === 'short') {
      opts.year = 'numeric'; opts.month = 'short'; opts.day = 'numeric';
    } else if (format === 'monthYear') {
      opts.year = '2-digit'; opts.month = 'short';
    } else if (format === 'long') {
      opts.year = 'numeric'; opts.month = 'long'; opts.day = 'numeric';
    } else {
      opts.year = 'numeric'; opts.month = 'short';
    }
    return d.toLocaleDateString('en-CA', opts);
  }

  // ─────────────────────────────────────────────────────────────
  // SCOPED LOCALSTORAGE KEY
  // ─────────────────────────────────────────────────────────────
  /**
   * Build a localStorage key scoped to a clientCode.
   * Pattern: <prefix>_<sanitised_clientCode>.
   * Sanitises clientCode by replacing non-alphanumeric/underscore with '_'.
   * Used by Cadence autosave, Intake state persistence, Deploy autosave.
   */
  function scopedKey(prefix, clientCode) {
    var code = String(clientCode || 'default').replace(/[^A-Z0-9_]/gi, '_');
    return prefix + '_' + code;
  }

  // ─────────────────────────────────────────────────────────────
  // TOAST NOTIFICATIONS
  // ─────────────────────────────────────────────────────────────
  var _toastTimer = null;
  var _toastEl = null;

  /**
   * Show a transient toast notification.
   * Severity: 'info' (default) | 'success' | 'warn' | 'error'.
   * Default duration: 2800 ms.
   * Auto-creates the toast container on first call. Idempotent.
   */
  function showToast(msg, severity, durationMs) {
    severity = severity || 'info';
    durationMs = durationMs || 2800;

    if (!_toastEl) {
      _toastEl = document.createElement('div');
      _toastEl.id = '_numacoreToast';
      _toastEl.style.cssText = [
        'position:fixed',
        'bottom:24px',
        'left:50%',
        'transform:translateX(-50%) translateY(20px)',
        'padding:10px 18px',
        'border-radius:8px',
        'font-size:12px',
        'font-weight:500',
        'color:#e6edf3',
        'box-shadow:0 4px 20px rgba(0,0,0,0.6)',
        'z-index:9999',
        'opacity:0',
        'transition:opacity 0.2s, transform 0.2s',
        'pointer-events:none',
        'max-width:420px',
        'text-align:center',
        'font-family:"Segoe UI",system-ui,sans-serif',
        'line-height:1.45'
      ].join(';');
      document.body.appendChild(_toastEl);
    }

    var sevStyles = {
      info:    { bg: '#21262d', border: '#30363d' },
      success: { bg: '#1b3a2a', border: '#2ea043' },
      warn:    { bg: '#3a2a1b', border: '#d29922' },
      error:   { bg: '#3a1b1b', border: '#f85149' }
    };
    var sty = sevStyles[severity] || sevStyles.info;
    _toastEl.style.background = sty.bg;
    _toastEl.style.border = '1px solid ' + sty.border;

    _toastEl.textContent = msg;
    _toastEl.style.opacity = '1';
    _toastEl.style.transform = 'translateX(-50%) translateY(0)';

    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () {
      if (_toastEl) {
        _toastEl.style.opacity = '0';
        _toastEl.style.transform = 'translateX(-50%) translateY(10px)';
      }
    }, durationMs);
  }

  // ─────────────────────────────────────────────────────────────
  // FLEET FILE LOAD
  // ─────────────────────────────────────────────────────────────
  /**
   * Load a fleet JSON file via FileReader. Validates extension and parses.
   * Calls onSuccess(json, filename) on success.
   * Calls onError(message) on failure (wrong extension, parse error, read error).
   */
  function loadFleetFile(file, onSuccess, onError) {
    if (!file) {
      if (onError) onError('No file provided');
      return;
    }
    if (!file.name || !file.name.toLowerCase().endsWith('.json')) {
      if (onError) onError('Please drop a .json file (got: ' + (file.name || 'unnamed') + ')');
      return;
    }
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var json = JSON.parse(ev.target.result);
        if (onSuccess) onSuccess(json, file.name);
      } catch (err) {
        if (onError) onError('Could not parse JSON: ' + err.message);
      }
    };
    reader.onerror = function () {
      if (onError) onError('Could not read file');
    };
    reader.readAsText(file);
  }

  // ─────────────────────────────────────────────────────────────
  // EXPORT
  // ─────────────────────────────────────────────────────────────
  window.NumaCoreLib = {
    esc: esc,
    parseDate: parseDate,
    fmtDate: fmtDate,
    scopedKey: scopedKey,
    showToast: showToast,
    loadFleetFile: loadFleetFile,
    VERSION: VERSION
  };
})();

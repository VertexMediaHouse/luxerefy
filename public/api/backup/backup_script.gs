/**
 * Luxerefy CRM - Google Sheets backup (v4)
 *
 * The script pulls every table straight from Supabase. The CRM never sends records to it, so a
 * stranger who finds the web app URL can at most trigger a re-sync — never overwrite the sheet.
 * A daily timer keeps the sheet fresh even when nobody has the CRM open.
 *
 * SETUP (one time):
 * 1. Open the backup Google Sheet > Extensions > Apps Script. Replace all of Code.gs with this file. Save.
 * 2. Project Settings (gear icon) > Script Properties > add:
 *      SUPABASE_URL          https://<project>.supabase.co
 *      SUPABASE_SERVICE_KEY  <service role key from Supabase > Project Settings > API>
 *    Script Properties are private to the script owner. The service key can read every row, so do not
 *    share edit access to this script with anyone you would not give the database to.
 * 3. In the editor pick the function "installDailyTrigger" and click Run. Authorize when asked.
 *    (This also runs the first sync.)
 * 4. Deploy > Manage deployments > edit the existing Web app > Version: "New version" > Deploy.
 *    Keep "Execute as: Me" and "Who has access: Anyone". The /exec URL stays the same.
 *    First time only: Deploy > New deployment > Web app, then put the /exec URL in .env.local as
 *    VITE_GOOGLE_SCRIPT_WEBAPP_URL and the sheet URL as VITE_GOOGLE_SHEET_URL.
 */

var TABLES = [
  'leads', 'contacts', 'lead_activities', 'lead_assignment_history', 'tasks', 'tickets',
  'properties', 'pipelines', 'stages', 'documents', 'doc_folders', 'goals', 'profiles'
];
var PAGE = 1000;           // Supabase returns at most 1000 rows per request
var CELL_MAX = 49000;      // Sheets rejects cells over 50,000 characters
var MIN_GAP_MS = 60 * 1000; // ignore button mashing: one sync per minute at most

function doGet() {
  return json(status());
}

function doPost() {
  try {
    var last = Number(props().getProperty('LAST_SYNC_MS') || 0);
    if (Date.now() - last < MIN_GAP_MS) return json(Object.assign(status(), { status: 'success', skipped: true }));
    syncAll();
    return json(Object.assign(status(), { status: 'success' }));
  } catch (err) {
    return json({ status: 'error', message: String(err && err.message || err) });
  }
}

/** Run once from the editor: schedules the daily sync and runs the first one. */
function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncAll') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncAll').timeBased().everyDays(1).atHour(2).create();
  syncAll();
}

function syncAll() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) throw new Error('Another sync is already running. Try again in a minute.');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var data = {}, counts = [];
    TABLES.forEach(function (t) {
      data[t] = fetchTable(t);
      if (data[t]) writeSheet(ss, t, toGrid(data[t]));
      counts.push([t, data[t] ? data[t].length : 'not in database']);
    });
    writeSheet(ss, 'Leads View', leadsView(data));
    var at = new Date().toISOString();
    writeOverview(ss, at, counts);
    props().setProperties({ LAST_SYNC_MS: String(Date.now()), LAST_SYNC_AT: at, LAST_COUNTS: JSON.stringify(counts) });
  } finally {
    lock.releaseLock();
  }
}

function status() {
  var p = props();
  return {
    status: 'ok',
    version: 4,
    configured: !!(p.getProperty('SUPABASE_URL') && p.getProperty('SUPABASE_SERVICE_KEY')),
    scheduled: ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'syncAll'; }),
    lastSyncAt: p.getProperty('LAST_SYNC_AT'),
    counts: JSON.parse(p.getProperty('LAST_COUNTS') || '[]')
  };
}

/** Every row of one table, page by page. Null when the table does not exist in this database. */
function fetchTable(table) {
  var url = props().getProperty('SUPABASE_URL'), key = props().getProperty('SUPABASE_SERVICE_KEY');
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY in Apps Script > Project Settings > Script Properties.');
  var rows = [];
  for (var from = 0; ; from += PAGE) {
    var res = UrlFetchApp.fetch(url.replace(/\/$/, '') + '/rest/v1/' + table + '?select=*&order=id', {
      headers: { apikey: key, Authorization: 'Bearer ' + key, Range: from + '-' + (from + PAGE - 1) },
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code === 404 || (code === 400 && /does not exist|Could not find/.test(res.getContentText()))) return null;
    if (code >= 300) throw new Error(table + ': Supabase returned ' + code + ' ' + res.getContentText().slice(0, 200));
    var page = JSON.parse(res.getContentText());
    rows = rows.concat(page);
    if (page.length < PAGE) return rows;
  }
}

/** One row per lead with names instead of ids — the tab people actually read. */
function leadsView(d) {
  var byId = function (list) { var m = {}; (list || []).forEach(function (r) { m[r.id] = r; }); return m; };
  var contacts = byId(d.contacts), stages = byId(d.stages), people = byId(d.profiles);
  var cr = function (n) { return n ? Math.round(n / 1e5) / 100 : ''; }; // rupees -> crores, 2 dp
  var head = ['Created', 'Name', 'Phone', 'Email', 'Source', 'Stage', 'Assigned To', 'Interest', 'Project',
    'Locality', 'City', 'Budget Min (Cr)', 'Budget Max (Cr)', 'Lost Reason', 'Notes', 'Updated', 'Lead ID'];
  var rows = (d.leads || []).slice().sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; }).map(function (l) {
    var c = contacts[l.contact_id] || {}, s = stages[l.status], p = people[l.assigned_to];
    return [day(l.created_at), c.name || '', c.phone || '', c.email || '', l.source, s ? s.label : l.status,
      p ? p.full_name : '', l.property_interest || '', l.project || '', l.locality || '', l.city || '',
      cr(l.budget_min), cr(l.budget_max), l.lost_reason || '', l.notes || '', day(l.updated_at), l.id];
  });
  return [head].concat(rows);
}

function toGrid(rows) {
  var headers = [], seen = {};
  rows.forEach(function (r) { for (var k in r) if (!seen[k]) { seen[k] = true; headers.push(k); } });
  if (!headers.length) return [['(No records)']];
  return [headers].concat(rows.map(function (r) {
    return headers.map(function (h) {
      var v = r[h];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') v = JSON.stringify(v);
      return typeof v === 'string' && v.length > CELL_MAX ? v.slice(0, CELL_MAX) + '…[truncated]' : v;
    });
  }));
}

function writeSheet(ss, name, grid) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.clear();
  var width = grid[0].length;
  // Text format first, so phones keep their "+91" and ids are never turned into numbers or dates.
  sheet.getRange(1, 1, grid.length, width).setNumberFormat('@').setValues(grid.map(function (r) {
    return r.map(function (v) { return typeof v === 'number' || typeof v === 'boolean' ? v : String(v); });
  }));
  if (grid.length > 1) {
    sheet.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
}

function writeOverview(ss, at, counts) {
  var sheet = ss.getSheetByName('Overview') || ss.insertSheet('Overview', 0);
  sheet.clear();
  var grid = [['Luxerefy CRM Backup', ''], ['Last synced (UTC)', at], ['Schedule', 'Daily at 2 AM + on demand from the CRM'], ['', ''], ['Table', 'Rows']].concat(counts);
  sheet.getRange(1, 1, grid.length, 2).setValues(grid);
  sheet.getRange('A1:B1').setFontWeight('bold').setFontSize(12).setBackground('#e2e8f0');
  sheet.getRange('A5:B5').setFontWeight('bold').setBackground('#f1f5f9');
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 260);
}

function day(iso) { return iso ? String(iso).slice(0, 10) : ''; }
function props() { return PropertiesService.getScriptProperties(); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

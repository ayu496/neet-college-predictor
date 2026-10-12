/**
 * NEET College Predictor: lead + event store on Google Sheets.
 *
 * Setup (5 min):
 *  1. Create a Google Sheet → Extensions → Apps Script → paste this file.
 *  2. Change ADMIN_KEY below.
 *  3. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 *  4. Copy the /exec URL into config.js → ENDPOINT.
 *
 * Tabs "Leads" and "Events" are created automatically on the first request.
 */

var ADMIN_KEY = "change-me-to-a-long-random-string";

var LEAD_HEADERS = ["timestamp", "name", "phone", "score", "category", "state", "predicted_rank",
  "utm_source", "utm_medium", "utm_campaign", "is_test", "is_duplicate",
  "safe_count", "moderate_count", "reach_count", "session_id", "device"];
var EVENT_HEADERS = ["timestamp", "event", "session_id", "utm_source", "utm_medium", "utm_campaign",
  "device", "is_test", "props"];
var CATEGORIES = ["UR", "EWS", "OBC", "SC", "ST"];
var EVENTS = ["page_view", "form_start", "form_submit", "result_view", "cta_click"];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.type === "lead") return json_(saveLead_(body.data || {}));
    if (body.type === "event") return json_(saveEvent_(body.data || {}));
    return json_({ ok: false, error: "unknown type" });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === "stats") {
    if (p.key !== ADMIN_KEY) return json_({ ok: false, error: "unauthorized" });
    return json_(stats_(p.include_test === "1"));
  }
  return json_({ ok: true, service: "neet-college-predictor" });
}

function saveLead_(d) {
  var phone = String(d.phone || "").replace(/\D/g, "");
  var score = Number(d.score);
  if (!/^[6-9]\d{9}$/.test(phone)) return { ok: false, error: "invalid phone" };
  if (!(score >= 0 && score <= 720)) return { ok: false, error: "invalid score" };
  if (CATEGORIES.indexOf(d.category) < 0) return { ok: false, error: "invalid category" };

  var sh = sheet_("Leads", LEAD_HEADERS);
  var dup = sh.getLastRow() > 1 &&
    sh.getRange(2, 3, sh.getLastRow() - 1, 1).createTextFinder(phone).matchEntireCell(true).findNext() != null;

  sh.appendRow([new Date(), clean_(d.name, 60), phone, score, d.category, clean_(d.state, 60),
    d.predicted_rank === "" ? "" : Number(d.predicted_rank),
    clean_(d.utm_source), clean_(d.utm_medium), clean_(d.utm_campaign),
    d.is_test === true, dup,
    Number(d.safe_count) || 0, Number(d.moderate_count) || 0, Number(d.reach_count) || 0,
    clean_(d.session_id, 40), clean_(d.device, 10)]);
  return { ok: true, duplicate: dup };
}

function saveEvent_(d) {
  if (EVENTS.indexOf(d.event) < 0) return { ok: false, error: "unknown event" };
  var known = ["event", "session_id", "utm_source", "utm_medium", "utm_campaign", "device", "is_test"];
  var props = {};
  Object.keys(d).forEach(function (k) { if (known.indexOf(k) < 0) props[k] = d[k]; });
  sheet_("Events", EVENT_HEADERS).appendRow([new Date(), d.event, clean_(d.session_id, 40),
    clean_(d.utm_source), clean_(d.utm_medium), clean_(d.utm_campaign), clean_(d.device, 10),
    d.is_test === true, clean_(JSON.stringify(props), 500)]);
  return { ok: true };
}

/** Funnel (unique sessions per event) and leads, split by utm_source. Phones are masked. */
function stats_(includeTest) {
  var funnel = {}, leadsBySource = {}, recent = [];
  var ev = rows_("Events");
  var seen = {};
  ev.forEach(function (r) {
    if (r.is_test && !includeTest) return;
    var src = r.utm_source || "direct";
    var k = r.event + "|" + r.session_id;
    if (seen[k]) return;
    seen[k] = true;
    funnel[src] = funnel[src] || { page_view: 0, form_start: 0, form_submit: 0, result_view: 0, cta_click: 0 };
    if (funnel[src][r.event] != null) funnel[src][r.event]++;
  });
  rows_("Leads").forEach(function (r) {
    if (r.is_test && !includeTest) return;
    var src = r.utm_source || "direct";
    leadsBySource[src] = leadsBySource[src] || { leads: 0, unique: 0 };
    leadsBySource[src].leads++;
    if (!r.is_duplicate) leadsBySource[src].unique++;
    recent.push({
      timestamp: r.timestamp, name: r.name, phone: mask_(String(r.phone)), score: r.score, category: r.category,
      state: r.state, predicted_rank: r.predicted_rank, utm_source: r.utm_source, utm_medium: r.utm_medium,
      utm_campaign: r.utm_campaign, is_test: r.is_test, is_duplicate: r.is_duplicate
    });
  });
  recent.reverse();
  return { ok: true, funnel: funnel, leadsBySource: leadsBySource, recent: recent.slice(0, 200) };
}

// ---------- helpers ----------
function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    if (name === "Leads") sh.getRange("C:C").setNumberFormat("@");
  }
  return sh;
}

function rows_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getDataRange().getValues();
  var h = v.shift();
  return v.map(function (row) {
    var o = {};
    h.forEach(function (k, i) { o[k] = row[i]; });
    return o;
  });
}

// Strip leading formula characters so user input can never execute as a Sheets formula.
function clean_(s, max) {
  s = String(s == null ? "" : s).slice(0, max || 100);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function mask_(p) { return p.length === 10 ? p.slice(0, 2) + "XXXXXX" + p.slice(8) : "XXXXXXXXXX"; }

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

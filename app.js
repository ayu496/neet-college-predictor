(function () {
  "use strict";

  var CFG = window.APP_CONFIG || {};
  var STATES = ["Andaman & Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
    "Chhattisgarh", "Dadra & Nagar Haveli and Daman & Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
    "Jammu & Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra",
    "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim",
    "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"];
  var CAT_LABEL = { UR: "General", EWS: "EWS", OBC: "OBC", SC: "SC", ST: "ST" };
  var BUCKETS = [
    { key: "safe", title: "Safe", why: "Your estimated rank is comfortably inside last year's closing rank (≤ 85%)." },
    { key: "moderate", title: "Moderate", why: "Close to last year's closing rank (85–100%). Good chance with smart choice filling." },
    { key: "reach", title: "Reach", why: "Slightly beyond last year's closing rank (100–115%). Possible if cut-offs move in later rounds." }
  ];
  var MAX_PER_BUCKET = 10;
  var MIN_QUALIFYING = { UR: 144, EWS: 144, OBC: 113, SC: 113, ST: 113 };

  var colleges = [];
  var anchors = [];
  var state = { input: null, result: null, formStarted: false };

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function fmt(n) { return n == null ? "—" : n.toLocaleString("en-IN"); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function store(kind, key, val) {
    try {
      var s = kind === "local" ? localStorage : sessionStorage;
      if (val === undefined) return s.getItem(key);
      s.setItem(key, val);
    } catch (e) { return null; }
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  var params = new URLSearchParams(location.search);
  var sessionId = store("session", "np_sid") || uid();
  store("session", "np_sid", sessionId);

  // First-touch UTM within the session, so values survive in-page navigation.
  var utm = (function () {
    var saved = store("session", "np_utm");
    if (saved) { try { return JSON.parse(saved); } catch (e) { /* fall through */ } }
    var u = {
      utm_source: params.get("utm_source") || (document.referrer ? "referral:" + safeHost(document.referrer) : "direct"),
      utm_medium: params.get("utm_medium") || (document.referrer ? "referral" : "none"),
      utm_campaign: params.get("utm_campaign") || "none"
    };
    store("session", "np_utm", JSON.stringify(u));
    return u;
  })();
  function safeHost(url) { try { return new URL(url).hostname; } catch (e) { return "unknown"; } }

  var isTest = params.get("test") === "1" || /test/i.test(utm.utm_source) || /test/i.test(utm.utm_campaign);
  var device = /iPad|Tablet/i.test(navigator.userAgent) ? "tablet" : (/Mobi|Android|iPhone/i.test(navigator.userAgent) ? "mobile" : "desktop");

  // ---------- backend / tracking ----------
  function post(payload, opts) {
    opts = opts || {};
    if (!CFG.ENDPOINT) {
      // Local demo mode: keep a copy in this browser so admin.html still works.
      var key = payload.type === "lead" ? "np_local_leads" : "np_local_events";
      var list = [];
      try { list = JSON.parse(store("local", key) || "[]"); } catch (e) { list = []; }
      if (payload.type === "lead") {
        var dup = list.some(function (l) { return l.phone === payload.data.phone; });
        payload.data.is_duplicate = dup;
      }
      list.push(Object.assign({ timestamp: new Date().toISOString() }, payload.data));
      store("local", key, JSON.stringify(list.slice(-500)));
      return Promise.resolve({ ok: true, local: true, duplicate: payload.data.is_duplicate });
    }
    var body = JSON.stringify(payload);
    if (opts.beacon && navigator.sendBeacon) {
      // text/plain avoids a CORS preflight, which Apps Script doesn't answer.
      navigator.sendBeacon(CFG.ENDPOINT, new Blob([body], { type: "text/plain;charset=utf-8" }));
      return Promise.resolve({ ok: true });
    }
    var ctrl = "AbortController" in window ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, opts.timeout || 6000) : null;
    return fetch(CFG.ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: body,
      signal: ctrl ? ctrl.signal : undefined,
      keepalive: true
    }).then(function (r) { return r.json(); })
      .catch(function () { return { ok: false }; })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  function track(event, props) {
    var data = Object.assign({
      event: event,
      session_id: sessionId,
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      device: device,
      is_test: isTest
    }, props || {});
    if (window.gtag) window.gtag("event", event, props || {});
    if (window.console && params.get("debug") === "1") console.log("[track]", data);
    return post({ type: "event", data: data }, { beacon: true });
  }

  if (CFG.GA4_ID) {
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(CFG.GA4_ID);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", CFG.GA4_ID, { send_page_view: false });
    window.gtag("set", "user_properties", { utm_source: utm.utm_source });
  }

  // ---------- prediction ----------
  // Linear interpolation between the two nearest anchor points (anchors sorted by score desc).
  function scoreToAir(score) {
    if (!anchors.length) return null;
    var top = anchors[0], last = anchors[anchors.length - 1];
    if (score >= top.score) return 1;
    for (var i = 0; i < anchors.length - 1; i++) {
      var a = anchors[i], b = anchors[i + 1];
      if (score <= a.score && score >= b.score) {
        var t = (a.score - score) / (a.score - b.score);
        return Math.max(1, Math.round(a.air + t * (b.air - a.air)));
      }
    }
    // Below the lowest anchor: extrapolate along the last segment.
    var p = anchors[anchors.length - 2];
    var slope = (last.air - p.air) / (p.score - last.score);
    return Math.round(last.air + (last.score - score) * slope);
  }

  function predict(score, category, homeState) {
    var air = scoreToAir(score);
    var qualified = score >= MIN_QUALIFYING[category];
    var groups = { safe: [], moderate: [], reach: [] };
    if (qualified && air != null) {
      colleges.forEach(function (c) {
        var close = c.closing_rank_2025[category];
        if (!close) return;
        var ratio = air / close;
        var g = ratio <= 0.85 ? "safe" : ratio <= 1 ? "moderate" : ratio <= 1.15 ? "reach" : null;
        if (g) groups[g].push({ c: c, close: close, ratio: ratio, home: c.state === homeState });
      });
    }
    Object.keys(groups).forEach(function (k) {
      groups[k].sort(function (x, y) { return x.close - y.close; });
      groups[k] = groups[k].slice(0, MAX_PER_BUCKET);
    });
    return {
      air: air,
      qualified: qualified,
      groups: groups,
      total: groups.safe.length + groups.moderate.length + groups.reach.length
    };
  }

  function scoreBand(score) {
    var lo = Math.floor(score / 50) * 50;
    return lo + "-" + Math.min(lo + 49, 720);
  }

  // ---------- validation ----------
  function normalizePhone(raw) {
    var d = String(raw).replace(/\D/g, "");
    if (d.length === 12 && d.indexOf("91") === 0) d = d.slice(2);
    if (d.length === 11 && d[0] === "0") d = d.slice(1);
    return d;
  }
  // Returns "" when valid, otherwise the message to show. Mirrored server-side in backend/Code.gs.
  function phoneError(d) {
    if (!d) return "Enter your 10-digit mobile number.";
    if (d.length !== 10) return "Mobile number must be exactly 10 digits (you entered " + d.length + ").";
    if (!/^[6-9]/.test(d)) return "Indian mobile numbers start with 6, 7, 8 or 9.";
    var distinct = {};
    for (var i = 0; i < d.length; i++) distinct[d[i]] = 1;
    // Catches 9999999999, 9898989898, 9999988888 and straight runs like 9876543210 / 6789012345.
    if (Object.keys(distinct).length < 4 || "01234567890123456789".indexOf(d) >= 0 || "98765432109876543210".indexOf(d) >= 0)
      return "This doesn't look like a real mobile number. Please check it.";
    return "";
  }
  function validPhone(d) { return !phoneError(d); }
  function setErr(input, errEl, msg) {
    errEl.textContent = msg || "";
    input.classList.toggle("bad", !!msg);
    if (msg) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
  }

  // ---------- rendering ----------
  function show(id) {
    ["step1", "step2", "results"].forEach(function (s) { $(s).hidden = s !== id; });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderResults() {
    var inp = state.input, res = state.result;
    $("rScore").textContent = inp.score;
    $("rCat").textContent = CAT_LABEL[inp.category];
    $("rAir").textContent = res.qualified ? "~" + fmt(res.air) : "—";
    $("rCounts").innerHTML = BUCKETS.map(function (b) {
      return '<a class="c-' + b.key + '" href="#b-' + b.key + '">' + res.groups[b.key].length + " " + b.title + "</a>";
    }).join("");

    var html = "";
    if (!res.total) {
      html = '<div class="card empty"><h3>No AIQ government seats in range this year</h3>' +
        "<p>" + (res.qualified
          ? "With an estimated AIR of ~" + fmt(res.air) + " (" + CAT_LABEL[inp.category] + "), none of these 50 colleges' All India Quota seats closed within reach in 2025. You still have real options:"
          : "A score of " + inp.score + " is below the 2025 qualifying cut-off for " + CAT_LABEL[inp.category] + " (" + MIN_QUALIFYING[inp.category] + "). Here's what you can do next:") +
        "</p><ul>" +
        "<li><strong>State quota counselling (85%)</strong> in " + esc(inp.state) + ": state closing ranks are often much higher than AIQ.</li>" +
        "<li>Newer government colleges and later rounds (Round 3 / Stray) open up more seats.</li>" +
        "<li>Deemed/private MBBS, BDS and AYUSH counselling run in parallel.</li>" +
        "<li>Planning a drop year? A focused plan can add 80–150 marks.</li>" +
        "</ul></div>";
    }
    BUCKETS.forEach(function (b) {
      var list = res.groups[b.key];
      if (!list.length) return;
      html += '<section class="bucket ' + b.key + '" id="b-' + b.key + '"><h2>' + b.title +
        ' <span class="tag c-' + b.key + '">' + list.length + "</span></h2>" +
        '<p class="why">' + b.why + "</p>";
      list.forEach(function (x) {
        html += '<article class="college"><div class="name">' + esc(x.c.college) + "</div>" +
          '<div class="meta">' + esc(x.c.city) + ", " + esc(x.c.state) + "</div>" +
          '<div class="row"><span>2025 closing rank (' + CAT_LABEL[inp.category] + "): <strong>" + fmt(x.close) + "</strong></span>" +
          "<span>" + (x.home ? '<span class="badge home">🏠 Home state</span> ' : "") +
          '<span class="badge">' + esc(x.c.type) + "</span></span></div></article>";
      });
      html += "</section>";
    });
    $("buckets").innerHTML = html;
  }

  // ---------- flow ----------
  function onFirstInput() {
    if (state.formStarted) return;
    state.formStarted = true;
    track("form_start", { utm_source: utm.utm_source });
  }

  function onScoreSubmit(e) {
    e.preventDefault();
    var scoreEl = $("score"), stateEl = $("state");
    var raw = scoreEl.value.trim();
    var score = Number(raw);
    var ok = true;
    if (raw === "" || !Number.isInteger(score) || score < 0 || score > 720) {
      setErr(scoreEl, $("scoreErr"), "Enter a whole number between 0 and 720.");
      ok = false;
    } else setErr(scoreEl, $("scoreErr"));
    if (!stateEl.value) { setErr(stateEl, $("stateErr"), "Select your home state."); ok = false; }
    else setErr(stateEl, $("stateErr"));
    if (!ok) { (scoreEl.classList.contains("bad") ? scoreEl : stateEl).focus(); return; }

    var category = document.querySelector('input[name="category"]:checked').value;
    state.input = { score: score, category: category, state: stateEl.value };
    state.result = predict(score, category, stateEl.value);

    $("teaserAir").textContent = state.result.qualified ? "~" + fmt(state.result.air) : "Not qualified";
    $("teaserMatch").textContent = state.result.total
      ? "🎯 " + state.result.total + " government MBBS college" + (state.result.total > 1 ? "s" : "") + " match your profile"
      : "We've put together your next-step options";
    show("step2");
    setTimeout(function () { $("name").focus(); }, 300);
  }

  function onLeadSubmit(e) {
    e.preventDefault();
    var nameEl = $("name"), phoneEl = $("phone");
    var name = nameEl.value.trim().replace(/\s+/g, " ");
    var phone = normalizePhone(phoneEl.value);
    var ok = true;
    if (name.length < 2 || !/^[\p{L} .'-]+$/u.test(name)) {
      setErr(nameEl, $("nameErr"), "Enter your name (letters only).");
      ok = false;
    } else setErr(nameEl, $("nameErr"));
    var pErr = phoneError(phone);
    setErr(phoneEl, $("phoneErr"), pErr);
    if (pErr) ok = false;
    if (!ok) { (nameEl.classList.contains("bad") ? nameEl : phoneEl).focus(); return; }

    var inp = state.input, res = state.result;
    var g = res.groups;
    var lead = {
      name: name,
      phone: phone,
      score: inp.score,
      category: inp.category,
      state: inp.state,
      predicted_rank: res.qualified ? res.air : "",
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      is_test: isTest,
      session_id: sessionId,
      device: device,
      safe_count: g.safe.length,
      moderate_count: g.moderate.length,
      reach_count: g.reach.length
    };

    var btn = $("leadBtn");
    btn.disabled = true;
    btn.textContent = "Preparing your list…";
    track("form_submit", { score_band: scoreBand(inp.score), category: inp.category, state: inp.state, utm_source: utm.utm_source });

    // Never block the result on the network: show results once saved, or after a short timeout.
    var shown = false;
    function reveal() {
      if (shown) return;
      shown = true;
      btn.disabled = false;
      btn.textContent = "Show my colleges";
      renderResults();
      show("results");
      store("local", "np_last_phone", phone);
      track("result_view", { safe_count: g.safe.length, moderate_count: g.moderate.length, reach_count: g.reach.length });
    }
    post({ type: "lead", data: lead }, { timeout: 5000 }).then(reveal);
    setTimeout(reveal, 3500);
  }

  function shareUrl() {
    var u = new URL(location.origin + location.pathname);
    u.searchParams.set("utm_source", "whatsapp");
    u.searchParams.set("utm_medium", "referral");
    u.searchParams.set("utm_campaign", "result_share");
    return u.toString();
  }

  function onShare() {
    var inp = state.input, res = state.result;
    var top = res.groups.safe[0] || res.groups.moderate[0] || res.groups.reach[0];
    var msg = res.total
      ? "I just checked my NEET 2025 college chances 🩺\nScore " + inp.score + " (" + CAT_LABEL[inp.category] + ") → " +
        res.total + " government MBBS colleges in range" + (top ? ", incl. " + top.c.college : "") +
        ".\n\nCheck yours free in 30 sec 👉 " + shareUrl()
      : "Found a free NEET college predictor that shows which government MBBS colleges you can get with your score 🩺\nTry it 👉 " + shareUrl();
    track("cta_click", { cta_type: "whatsapp_share" });
    window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank", "noopener");
  }

  function onCta() {
    track("cta_click", { cta_type: "counselling_call" });
    $("ctaCall").hidden = true;
    $("ctaDone").hidden = false;
  }

  // ---------- boot ----------
  function init() {
    var sel = $("state");
    STATES.forEach(function (s) {
      var o = document.createElement("option");
      o.value = o.textContent = s;
      sel.appendChild(o);
    });

    ["score", "state", "name", "phone"].forEach(function (id) {
      $(id).addEventListener("focus", onFirstInput, { once: true });
      $(id).addEventListener("input", onFirstInput, { once: true });
    });
    document.querySelectorAll('input[name="category"]').forEach(function (r) { r.addEventListener("change", onFirstInput); });
    // Keep the field to 10 digits as the user types or pastes ("+91 98…" / "098…" are trimmed).
    $("phone").addEventListener("input", function () {
      var d = this.value.replace(/\D/g, "");
      if (d.length > 10) d = normalizePhone(d).slice(0, 10);
      this.value = d;
      var hint = $("phoneHint");
      hint.textContent = d.length + "/10 digits";
      hint.classList.toggle("done", d.length === 10 && validPhone(d));
      if (this.classList.contains("bad") && validPhone(d)) setErr(this, $("phoneErr"));
    });
    $("phone").addEventListener("blur", function () {
      if (this.value) setErr(this, $("phoneErr"), phoneError(this.value));
    });

    $("scoreForm").addEventListener("submit", onScoreSubmit);
    $("leadForm").addEventListener("submit", onLeadSubmit);
    $("backBtn").addEventListener("click", function () { show("step1"); });
    $("shareBtn").addEventListener("click", onShare);
    $("ctaCall").addEventListener("click", onCta);
    $("restartBtn").addEventListener("click", function () {
      // A new attempt is a new pass through the funnel.
      state.formStarted = false;
      show("step1");
      $("score").focus();
      onFirstInput();
    });

    track("page_view", { utm_source: utm.utm_source, utm_medium: utm.utm_medium, utm_campaign: utm.utm_campaign, device: device });
  }

  Promise.all([
    fetch("data/neet_2025_college_cutoffs.json").then(function (r) { return r.json(); }),
    fetch("data/neet_2025_score_to_rank.json").then(function (r) { return r.json(); })
  ]).then(function (d) {
    colleges = d[0].colleges;
    anchors = d[1].points.slice().sort(function (a, b) { return b.score - a.score; });
  }).catch(function () {
    $("scoreErr").textContent = "Couldn't load college data. Check your connection and refresh.";
  });

  // Expose pure functions for tests.
  window.__predictor = { scoreToAir: scoreToAir, predict: predict, normalizePhone: normalizePhone, validPhone: validPhone, phoneError: phoneError,
    _load: function (c, a) { colleges = c; anchors = a.slice().sort(function (x, y) { return y.score - x.score; }); } };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

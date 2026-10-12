# NEET College Predictor (with lead capture)

A mobile-first NEET UG college predictor. A student enters their score, category and home state, leaves a name and mobile number, and sees the government MBBS colleges (All India Quota) they're likely to get, grouped as **Safe / Moderate / Reach**.

**Live:** https://ayu496.github.io/neet-college-predictor/ · **Admin dashboard:** [/admin.html](https://ayu496.github.io/neet-college-predictor/admin.html) · **PRD:** [docs/PRD.md](docs/PRD.md) · **UTM links:** [docs/UTM_LINKS.md](docs/UTM_LINKS.md)

## Stack

| Layer | Choice | Why |
|---|---|---|
| Front end | Plain HTML + CSS + vanilla JS (no framework, no build) | ~15 KB of JS+CSS, fast on mid-range Android over mobile data |
| Hosting | GitHub Pages | Free, HTTPS, deploys on push |
| Lead + event store | Google Sheet via Google Apps Script web app ([backend/Code.gs](backend/Code.gs)) | Zero cost, non-engineers can open the sheet, view link is shareable |
| Analytics | Same Apps Script endpoint logs every event to an `Events` tab; optional GA4 mirror (`GA4_ID` in `config.js`) | Funnel split by `utm_source` without depending on a third-party tool |

## How it works

1. **Step 1:** score (0–720), category (General/EWS/OBC/SC/ST), home state.
2. **Step 2 (lead gate):** shows a teaser (estimated AIR and number of matching colleges), then asks for name and a 10-digit mobile number with a consent line.
3. **Step 3:** results grouped Safe/Moderate/Reach (max 10 each, sorted by closing rank, 🏠 home-state badge), an empty state with next steps, a counselling-call CTA, WhatsApp share, and the data disclaimer.

**Prediction:** score → AIR by linear interpolation between the two nearest anchor points in `data/neet_2025_score_to_rank.json`. Then `ratio = AIR / closing_rank[category]`: ≤ 0.85 is Safe, ≤ 1.00 Moderate, ≤ 1.15 Reach, otherwise hidden. Scores below the qualifying cut-off (144 UR/EWS, 113 reserved) show a "not qualified" empty state. The logic is checked against the brief's worked example in `tests/predict.test.js`.

## Where leads are stored

Google Sheet → tab **`Leads`**: `timestamp, name, phone, score, category, state, predicted_rank, utm_source, utm_medium, utm_campaign, is_test, is_duplicate, safe_count, moderate_count, reach_count, session_id, device`.

Tab **`Events`**: `timestamp, event, session_id, utm_*, device, is_test, props(JSON)` for `page_view`, `form_start`, `form_submit`, `result_view` and `cta_click`.

- **Test leads:** any visit with `?test=1`, or with `test` in `utm_source`/`utm_campaign`, is flagged `is_test=TRUE` and excluded from the dashboard by default.
- **Duplicate phones:** checked server-side and flagged `is_duplicate=TRUE`. The student still sees results (no dead end), but the lead is not counted as unique.
- **Admin view:** [/admin.html](https://ayu496.github.io/neet-college-predictor/admin.html) shows funnel event counts by source (plus unique sessions), conversion %, and leads with masked phones (`98XXXXXX10`). It's protected by `ADMIN_KEY`.

## Run locally

```bash
python3 -m http.server 8000      # then open http://localhost:8000
node tests/predict.test.js       # prediction + validation tests
```

With `ENDPOINT` empty in `config.js`, the app runs in **local demo mode**: leads and events are saved to your browser's localStorage, and `admin.html` reads them from there.

## Connect the Google Sheet (5 min)

1. Create a Google Sheet → **Extensions → Apps Script** → paste `backend/Code.gs`, set `ADMIN_KEY`.
2. **Deploy → New deployment → Web app**. Execute as **Me**, access **Anyone**. Copy the `/exec` URL.
3. Paste it into `config.js` → `ENDPOINT`, commit, push. Done. `Leads` and `Events` tabs are created on first hit.
4. (Optional) Add a GA4 measurement ID to `GA4_ID`.

## How AI was used

- Built with Claude Code: read the brief and datasets, wrote the front end, the Apps Script backend, tests, and this README/PRD.
- Claude checked the interpolation and bucketing against the brief's worked example (UR 600 → AIIMS Raipur Reach, AIIMS Nagpur Moderate, KEM Safe; Bhopal/Patna hidden). It also rendered the page at 360px in headless Chrome to verify the mobile layout.
- Human decisions: the two-step "teaser then lead gate" flow, not blocking results on duplicates, and the success metric.

## Data disclaimer

Cut-offs are indicative values prepared for this exercise (some from published 2025 MCC summaries, the rest trend-based estimates). Not official NTA/MCC data.

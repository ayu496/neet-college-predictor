# PRD: NEET College Predictor with Lead Capture

**Problem.** After NEET results, ~22 lakh students ask "With my score, which medical college can I get?" Answers are scattered across Google, YouTube and Telegram, and are often slow, ad-heavy or untrustworthy. For NEETprep, this moment is one of the highest-intent lead sources in ed-tech.

**Target user.** A NEET aspirant (17–20) or parent on a mid-range Android phone over mobile data. They know their **score and category, not their rank**.

**MVP scope (shipped).**
- One mobile-first page: score (0–720), category, home state → name + 10-digit mobile (validated, consent line) → results.
- Score → AIR via linear interpolation; colleges bucketed Safe (≤85% of closing rank), Moderate (85–100%), Reach (100–115%), max 10 each, home-state badge, helpful empty state, data disclaimer.
- Every lead stored with name, phone, score, category, state, predicted rank, timestamp and UTM source/medium/campaign (Google Sheet).
- Funnel events: page_view, form_start, form_submit, result_view, cta_click, split by utm_source.
- Bonus: duplicate-phone flag, WhatsApp share with referral UTM, counselling-call CTA, SEO/OG tags, admin dashboard by source.

**Key decision.** A two-step form. Step 1 asks only the three fields the student *wants* to give. Step 2 shows a teaser ("~AIR 1,300 · 12 colleges match") before asking for the phone number. The value is visible but locked, which lifts lead-form completion compared with a single long form.

**What we cut and why.**
- **OTP verification:** adds SMS cost and a ~15–25% drop-off step. Replaced with strict format validation plus a duplicate flag. Add OTP if the sales team reports a junk-number rate above 10%.
- **State-quota (85%) predictions, private/deemed, BDS/AYUSH:** out of scope, and no reliable data. Surfaced as next steps in the empty state instead.
- **Category rank vs overall AIR:** the baseline compares overall AIR with category closing ranks. That is conservative for reserved categories. Kept it for consistency with the brief; it's the first model improvement for week 2.
- **Framework/build tooling:** plain HTML/JS keeps the page small and fast on 3G/4G.

**Success metric.** **Landing → qualified lead conversion** (unique, non-test leads ÷ unique page-view sessions). **Target: ≥ 35%** in the first two weeks, with form_start → form_submit ≥ 60% as the guardrail for form friction.

// Run: node tests/predict.test.js
const fs = require("fs"), path = require("path"), assert = require("assert");
const store = {};
global.window = { APP_CONFIG: {}, scrollTo() {} };
global.location = { search: "", origin: "http://x", pathname: "/" };
global.document = { readyState: "loading", referrer: "", addEventListener() {}, head: { appendChild() {} } };
global.navigator = { userAgent: "node" };
global.sessionStorage = global.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => (store[k] = v) };
global.fetch = () => new Promise(() => {});
(0, eval)(fs.readFileSync(path.join(__dirname, "../app.js"), "utf8"));
const P = window.__predictor;
const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, "../data", f), "utf8"));
P._load(read("neet_2025_college_cutoffs.json").colleges, read("neet_2025_score_to_rank.json").points);

// Interpolation
assert.strictEqual(P.scoreToAir(600), 1300);
assert.strictEqual(P.scoreToAir(720), 1);
assert.strictEqual(P.scoreToAir(686), 1);
assert.strictEqual(P.scoreToAir(144), 1236000);
assert.strictEqual(P.scoreToAir(588), 2836);

// Worked example from the brief: UR, 600 → AIR ~1300
const r = P.predict(600, "UR", "Maharashtra");
const where = name => ["safe", "moderate", "reach"].find(b => r.groups[b].some(x => x.c.college.includes(name))) || "hidden";
assert.strictEqual(where("AIIMS Bhopal"), "hidden");
assert.strictEqual(where("AIIMS Patna"), "hidden");
assert.strictEqual(where("AIIMS Raipur"), "reach");
assert.strictEqual(where("AIIMS Nagpur"), "moderate");
assert.strictEqual(where("KEM"), "safe");
assert.ok(r.groups.safe.find(x => x.c.college.includes("KEM")).home, "home-state badge");
for (const b of ["safe", "moderate", "reach"]) {
  assert.ok(r.groups[b].length <= 10);
  const ranks = r.groups[b].map(x => x.close);
  assert.deepStrictEqual(ranks, [...ranks].sort((a, b) => a - b));
}

// Empty / not-qualified states
assert.strictEqual(P.predict(140, "UR", "Delhi").qualified, false);
assert.strictEqual(P.predict(130, "SC", "Delhi").qualified, true);
assert.strictEqual(P.predict(200, "UR", "Delhi").total, 0);

// Phone validation
assert.strictEqual(P.normalizePhone("+91 98123 45670"), "9812345670");
assert.strictEqual(P.normalizePhone("09812345670"), "9812345670");
for (const ok of ["9812345670", "7019283746", "6300112233", "8800450067"]) assert.ok(P.validPhone(ok), ok);
for (const bad of ["", "98123", "981234567", "98123456701", "5812345670", "0812345670",
  "9999999999", "9898989898", "9999988888", "9876543210", "6789012345", "8901234567"]) assert.ok(!P.validPhone(bad), bad);
assert.ok(/exactly 10 digits \(you entered 5\)/.test(P.phoneError("98123")));
assert.ok(/start with 6, 7, 8 or 9/.test(P.phoneError("5812345670")));
assert.ok(/real mobile number/.test(P.phoneError("9876543210")));
console.log("All tests passed. UR 600 → safe/moderate/reach =", r.groups.safe.length, r.groups.moderate.length, r.groups.reach.length);

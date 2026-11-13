/* BLOOMRA Employee Assessment Portal — local version (v3)
   Data lives in this browser's localStorage. Use Backup / Import in the admin
   console (or the employee "Download result file") to bring results together
   from several computers. */

const ADMIN_USERNAME = "bloomora";
const RESULTS_KEY = "bloomraEmployeeResults_v2";   // unchanged: existing results keep working
const ATTEMPTS_KEY = "bloomraEmployeeAttempts_v2";
const SETTINGS_KEY = "bloomraSettings_v3";
const PROGRESS_KEY = "bloomraProgress_v3";
const DEFAULTS = { passMark: 60, timeLimit: 40, shuffle: true, showAnswers: true, antiCheat: true, requireFullscreen: true, maxStrikes: 3, empPass: "123", admPass: "000" };

const $ = id => document.getElementById(id);
const views = ["loginView", "examView", "resultView", "adminView"];
const DEPTS = Object.keys(EXAM_DATA);
const state = { dept: "", name: "", key: "", order: [], answers: {}, flags: {}, idx: 0, startedAt: 0, limitSec: 0, viol: {}, timer: null, submitting: false };
const STRIKE_TYPES = ["tab", "fullscreen", "devtools"];
const VIOL_LABEL = { tab: "tab/window switches", fullscreen: "full-screen exits", devtools: "dev-tools/view-source attempts", clipboard: "copy/paste attempts", contextmenu: "right-click attempts", print: "print/screenshot attempts" };
const strikesOf = v => STRIKE_TYPES.reduce((n, t) => n + ((v && v[t]) || 0), 0);
const adminState = { sort: "submittedAt", dir: -1 };

/* ---------- helpers ---------- */
function normalize(v) { return String(v || "").trim().toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " "); }
function show(id) { views.forEach(v => $(v).classList.toggle("hidden", v !== id)); window.scrollTo(0, 0); }
function readJSON(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } }
function writeJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; } }
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => { if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else n.setAttribute(k, v); });
  kids.flat().forEach(k => n.append(k));
  return n;
}
const getSettings = () => ({ ...DEFAULTS, ...readJSON(SETTINGS_KEY, {}) });
const getResults = () => { const r = readJSON(RESULTS_KEY, []); return Array.isArray(r) ? r : []; };
const saveResults = r => writeJSON(RESULTS_KEY, r);
const getAttempts = () => readJSON(ATTEMPTS_KEY, {});
const pctOf = r => r.total ? Math.round(r.correct / r.total * 100) : 0;
const isPassed = r => typeof r.passed === "boolean" ? r.passed : pctOf(r) >= getSettings().passMark;
const keyOf = (name, dept) => normalize(name) + "::" + normalize(dept);
function fmtDuration(sec) {
  if (sec == null || isNaN(sec)) return "—";
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
function shuffled(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function activeResults() { return getResults().filter(r => !r.superseded); }

/* ---------- login ---------- */
function initLogin() {
  const dept = $("empDept"); dept.innerHTML = "";
  dept.append(el("option", { value: "", text: "Select your department" }));
  DEPTS.forEach(d => dept.append(el("option", { value: d, text: d })));
  fillDeptFilter($("filterDept"), "All departments"); fillDeptFilter($("qaDept"), null);
  renderRules();
}
function renderRules() {
  const s = getSettings();
  $("examRules").innerHTML = "";
  const items = [
    `${Object.values(EXAM_DATA)[0].length} multiple-choice questions · pass mark ${s.passMark}%`,
    s.timeLimit ? `Time limit: ${s.timeLimit} minutes (auto-submits when time is up)` : "No time limit",
    s.antiCheat ? `Anti-cheat is on: copy/paste is blocked${s.requireFullscreen ? ", full-screen is required" : ""}, and leaving the exam window is recorded${s.maxStrikes ? " (auto-submit after " + s.maxStrikes + " strikes)" : ""}. One attempt only.` : "One attempt per employee."
  ];
  items.forEach(t => $("examRules").append(el("div", { text: "• " + t })));
}
function setTab(admin) {
  $("tabAdmin").classList.toggle("active", admin); $("tabEmployee").classList.toggle("active", !admin);
  $("employeeForm").classList.toggle("hidden", admin); $("adminForm").classList.toggle("hidden", !admin);
  $("empError").textContent = ""; $("admError").textContent = "";
}
$("tabEmployee").onclick = () => setTab(false);
$("tabAdmin").onclick = () => setTab(true);

$("adminForm").addEventListener("submit", e => {
  e.preventDefault();
  if (normalize($("admUser").value) === ADMIN_USERNAME && $("admPass").value === getSettings().admPass) {
    $("adminForm").reset(); renderAdmin(); show("adminView");
  } else $("admError").textContent = "Incorrect admin username or password.";
});

$("employeeForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("empName").value.trim().replace(/\s+/g, " "), dept = $("empDept").value, pass = $("empPass").value;
  const err = $("empError"); err.textContent = "";
  if (name.length < 2 || !dept) { err.textContent = "Please enter your full name and choose a department."; return; }
  if (pass !== getSettings().empPass) { err.textContent = "Incorrect password."; return; }
  const key = keyOf(name, dept);
  const saved = readJSON(PROGRESS_KEY, null);
  if (saved && saved.key === key) { resumeExam(saved); return; }
  const mine = getResults().filter(r => r.employeeKey === key && !r.superseded);
  const blocked = (getAttempts()[key] || mine.length) && !(mine.length && mine.every(r => r.retakeAllowed));
  if (blocked) { err.textContent = "An assessment has already been submitted for this employee in this browser. Contact your administrator if you need a retake."; return; }
  if (saved && saved.key !== key) { err.textContent = `Another exam (${saved.name}) is still in progress in this browser. That person must finish it first.`; return; }
  startExam(name, dept, key);
});

/* ---------- exam ---------- */
function startExam(name, dept, key) {
  const s = getSettings(), ids = EXAM_DATA[dept].map(q => q.id);
  Object.assign(state, { dept, name, key, order: s.shuffle ? shuffled(ids) : ids, answers: {}, flags: {}, idx: 0, startedAt: Date.now(), limitSec: s.timeLimit * 60, viol: {}, submitting: false });
  persistProgress(); openExam();
}
function resumeExam(p) {
  Object.assign(state, { dept: p.dept, name: p.name, key: p.key, order: p.order, answers: p.answers, flags: p.flags, idx: p.idx || 0, startedAt: p.startedAt, limitSec: p.limitSec, viol: p.viol || {}, submitting: false });
  openExam();
}
function persistProgress() {
  writeJSON(PROGRESS_KEY, { key: state.key, name: state.name, dept: state.dept, order: state.order, answers: state.answers, flags: state.flags, idx: state.idx, startedAt: state.startedAt, limitSec: state.limitSec, viol: state.viol });
}
const qById = id => EXAM_DATA[state.dept].find(q => q.id === id);
function openExam() {
  $("departmentTitle").textContent = state.dept; $("employeeTitle").textContent = "Employee: " + state.name;
  buildPalette(); renderQuestion(); show("examView");
  enableGuard();
  clearInterval(state.timer); tick(); state.timer = setInterval(tick, 500);
}
function tick() {
  const box = $("timerBox");
  if (!state.limitSec) { $("timerText").textContent = "No limit"; box.className = "timer"; return; }
  const left = Math.max(0, state.limitSec - Math.floor((Date.now() - state.startedAt) / 1000));
  $("timerText").textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
  box.className = "timer" + (left <= 60 ? " danger" : left <= state.limitSec * 0.2 ? " warn" : "");
  if (left === 0 && !state.submitting) submitExam(true);
}
function buildPalette() {
  const p = $("palette"); p.innerHTML = "";
  state.order.forEach((id, i) => { const b = el("button", { type: "button", class: "pal-btn", text: i + 1 }); b.onclick = () => go(i); b.dataset.id = id; p.append(b); });
}
function go(i) { state.idx = Math.max(0, Math.min(state.order.length - 1, i)); persistProgress(); renderQuestion(); }
function renderQuestion() {
  const id = state.order[state.idx], q = qById(id), total = state.order.length;
  const stage = $("questionStage"); stage.innerHTML = "";
  const card = el("section", { class: "question-card" });
  card.append(el("div", { class: "question-top" }, el("span", { class: "q-number", text: `Q${state.idx + 1}` }), el("h3", { text: q.question })));
  Object.entries(q.options).forEach(([letter, label]) => {
    const radio = el("input", { type: "radio", name: "opt", value: letter });
    radio.checked = state.answers[id] === letter;
    const opt = el("label", { class: "option" + (radio.checked ? " selected" : "") }, radio, el("span", { text: `${letter}. ${label}` }));
    radio.onchange = () => { state.answers[id] = letter; persistProgress(); renderQuestion(); };
    card.append(opt);
  });
  stage.append(card);
  $("prevBtn").disabled = state.idx === 0;
  $("nextBtn").textContent = state.idx === total - 1 ? "Review & submit" : "Next →";
  $("flagBtn").classList.toggle("on", !!state.flags[id]);
  $("flagBtn").textContent = state.flags[id] ? "⚑ Marked for review" : "⚑ Mark for review";
  updateProgress();
}
function updateProgress() {
  const total = state.order.length, count = state.order.filter(id => state.answers[id]).length;
  $("progressText").textContent = `Question ${state.idx + 1} of ${total}`; $("answeredText").textContent = `${count}/${total} answered`;
  $("progressBar").style.width = `${count / total * 100}%`;
  $("palette").querySelectorAll(".pal-btn").forEach((b, i) => {
    const id = state.order[i];
    b.className = "pal-btn" + (state.answers[id] ? " answered" : "") + (state.flags[id] ? " flagged" : "") + (i === state.idx ? " current" : "");
  });
}
$("prevBtn").onclick = () => go(state.idx - 1);
$("nextBtn").onclick = () => { if (state.idx === state.order.length - 1) $("submitBtn").click(); else go(state.idx + 1); };
$("flagBtn").onclick = () => { const id = state.order[state.idx]; state.flags[id] = !state.flags[id]; if (!state.flags[id]) delete state.flags[id]; persistProgress(); renderQuestion(); };
$("submitBtn").onclick = () => {
  const unanswered = state.order.filter(id => !state.answers[id]).length, flagged = Object.keys(state.flags).length;
  let msg = "Submit your exam now? You cannot change answers afterwards.";
  if (unanswered || flagged) msg = `${unanswered} unanswered and ${flagged} flagged question(s). Submit anyway?`;
  if (ask(msg)) submitExam(false);
};
/* ---------- anti-cheat guard ---------- */
let guardOn = false, lastStrikeAt = 0, dialogOpen = false;
const examLive = () => guardOn && !state.submitting && !$("examView").classList.contains("hidden");
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
function warn(text) { const b = $("warnBar"); b.textContent = "⚠ " + text; b.classList.remove("hidden"); clearTimeout(warn.t); warn.t = setTimeout(() => b.classList.add("hidden"), 6000); }
function violation(type) {
  if (!examLive()) return;
  const isStrike = STRIKE_TYPES.includes(type);
  if (isStrike) { if (Date.now() - lastStrikeAt < 1500) return; lastStrikeAt = Date.now(); } // tab switch fires several events
  state.viol[type] = (state.viol[type] || 0) + 1; persistProgress();
  const max = getSettings().maxStrikes, strikes = strikesOf(state.viol);
  if (isStrike) {
    if (max && strikes >= max) { warn("Too many violations — your exam is being submitted."); submitExam(false, "Auto-submitted: too many integrity violations"); return; }
    warn(`Violation recorded (${strikes}${max ? "/" + max : ""}): ${VIOL_LABEL[type]}.${max ? " Your exam will be submitted automatically at " + max + "." : ""}`);
  } else warn(`Blocked: ${VIOL_LABEL[type]} are not allowed and have been recorded.`);
}
function enableGuard() {
  const s = getSettings(); if (!s.antiCheat) return;
  guardOn = true; document.body.classList.add("exam-active");
  const wm = $("watermark"); wm.innerHTML = ""; wm.classList.remove("hidden");
  for (let i = 0; i < 120; i++) wm.append(el("span", { text: `${state.name} · BLOOMRA` }));
  if (s.requireFullscreen) enterFullscreen();
}
function disableGuard() {
  guardOn = false; document.body.classList.remove("exam-active"); $("watermark").classList.add("hidden"); $("fsOverlay").classList.add("hidden"); $("warnBar").classList.add("hidden");
  if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document).catch(() => {});
}
function enterFullscreen() {
  const r = document.documentElement, f = r.requestFullscreen || r.webkitRequestFullscreen;
  if (f) { try { const p = f.call(r); if (p && p.catch) p.catch(() => {}); } catch {} }
}
$("fsBtn").onclick = enterFullscreen;
function onFsChange() {
  if (!examLive() || !getSettings().requireFullscreen) return;
  if (fsEl()) $("fsOverlay").classList.add("hidden");
  else { $("fsOverlay").classList.remove("hidden"); violation("fullscreen"); }
}
document.addEventListener("fullscreenchange", onFsChange); document.addEventListener("webkitfullscreenchange", onFsChange);
document.addEventListener("visibilitychange", () => { if (document.hidden) violation("tab"); });
window.addEventListener("blur", () => { if (!dialogOpen) setTimeout(() => { if (!document.hasFocus() && !dialogOpen) violation("tab"); }, 150); });
["copy", "cut", "paste"].forEach(ev => document.addEventListener(ev, e => { if (examLive()) { e.preventDefault(); violation("clipboard"); } }, true));
document.addEventListener("contextmenu", e => { if (examLive()) { e.preventDefault(); violation("contextmenu"); } }, true);
["dragstart", "selectstart"].forEach(ev => document.addEventListener(ev, e => { if (examLive()) e.preventDefault(); }, true));
document.addEventListener("keydown", e => {
  if (!examLive()) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (k === "printscreen") { try { navigator.clipboard.writeText(""); } catch {} e.preventDefault(); violation("print"); return; }
  if (k === "f12" || (mod && e.shiftKey && ["i", "j", "c"].includes(k)) || (mod && k === "u") || (e.metaKey && e.altKey && ["i", "j", "u"].includes(k))) { e.preventDefault(); violation("devtools"); return; }
  if (mod && ["c", "v", "x", "a", "insert"].includes(k)) { e.preventDefault(); violation("clipboard"); return; }
  if (mod && ["p", "s"].includes(k)) { e.preventDefault(); violation("print"); }
  if (e.shiftKey && e.metaKey && ["3", "4", "5"].includes(k)) violation("print");
}, true);
window.addEventListener("beforeprint", () => { if (examLive()) violation("print"); });
const ask = msg => { dialogOpen = true; const r = confirm(msg); setTimeout(() => dialogOpen = false, 300); return r; };

window.addEventListener("beforeunload", e => { if (!$("examView").classList.contains("hidden") && !state.submitting) { e.preventDefault(); e.returnValue = ""; } });

function submitExam(auto, reason) {
  if (state.submitting) return;
  state.submitting = true; clearInterval(state.timer); disableGuard();
  const qs = EXAM_DATA[state.dept], s = getSettings();
  const correct = qs.filter(q => state.answers[q.id] === q.answer).length;
  const elapsed = Math.round((Date.now() - state.startedAt) / 1000);
  const duration = state.limitSec ? Math.min(elapsed, state.limitSec) : elapsed;
  const result = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), employee: state.name, employeeKey: state.key, department: state.dept,
    answers: { ...state.answers }, order: state.order.slice(), correct, total: qs.length, submittedAt: new Date().toISOString(),
    duration, violations: { ...state.viol }, strikes: strikesOf(state.viol), tabSwitches: state.viol.tab || 0, autoSubmitted: !!auto || !!reason, autoReason: reason || (auto ? "Auto-submitted: time limit reached" : ""), passMark: s.passMark, passed: Math.round(correct / qs.length * 100) >= s.passMark
  };
  const results = getResults().map(r => r.employeeKey === state.key ? { ...r, superseded: true } : r);
  results.push(result);
  const ok = saveResults(results);
  const attempts = getAttempts(); attempts[state.key] = true; writeJSON(ATTEMPTS_KEY, attempts);
  localStorage.removeItem(PROGRESS_KEY);
  showResult(result, ok, false); show("resultView");
}

/* ---------- employee result ---------- */
let lastResult = null;
function showResult(r, saved = true, auto = false) {
  lastResult = r;
  const qs = EXAM_DATA[r.department], pct = pctOf(r), passed = isPassed(r), s = getSettings();
  $("resultIdentity").textContent = `${r.employee} · ${r.department} · ${new Date(r.submittedAt).toLocaleString()}`;
  $("percentage").textContent = pct + "%"; $("scoreRing").style.setProperty("--score", pct + "%");
  $("scoreRing").style.setProperty("--ringc", passed ? "var(--green)" : "var(--red)");
  const skipped = qs.filter(q => !r.answers[q.id]).length;
  $("correctCount").textContent = r.correct; $("wrongCount").textContent = r.total - r.correct - skipped; $("skippedCount").textContent = skipped;
  $("timeTaken").textContent = fmtDuration(r.duration);
  const v = $("verdict"); v.className = "verdict " + (passed ? "pass" : "fail");
  v.textContent = passed ? `✓ Passed — pass mark ${r.passMark ?? s.passMark}%` : `✗ Not passed — pass mark ${r.passMark ?? s.passMark}%`;
  const list = $("reviewList"); list.innerHTML = "";
  (r.order || qs.map(q => q.id)).forEach((id, i) => {
    const q = qs.find(x => x.id === id), chosen = r.answers[id], ok = chosen === q.answer;
    const item = el("article", { class: "review-item " + (ok ? "ok" : "bad") }, el("h4", { text: `Q${i + 1}. ${q.question}` }));
    item.append(el("p", { class: "review-line" + (ok ? "" : " wrong-answer"), text: `Your answer: ${chosen ? chosen + ". " + q.options[chosen] : "Not answered"}` }));
    if (s.showAnswers && !ok) item.append(el("p", { class: "review-line correct-answer", text: `Correct answer: ${q.answer}. ${q.options[q.answer]}` }));
    item.append(el("p", { class: "review-line", text: ok ? "Result: Correct" : chosen ? "Result: Incorrect" : "Result: Skipped" }));
    list.append(item);
  });
  $("lockNote").textContent = (r.autoReason ? r.autoReason + ". " : "") + (saved
    ? "Your assessment has been saved in this browser. Please also download your result file and send it to your administrator."
    : "Warning: your result could not be saved in this browser (storage full or blocked). Download the result file and send it to your administrator.");
}
$("printResultBtn").onclick = () => window.print();
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })); const a = el("a", { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const slug = s => normalize(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
$("downloadResultBtn").onclick = () => lastResult && download(`bloomra-result-${slug(lastResult.employee)}.json`, JSON.stringify({ app: "bloomra", version: 3, results: [lastResult] }, null, 1), "application/json");

function logout() {
  if (!$("examView").classList.contains("hidden") && !state.submitting) { if (!ask("Leave the exam? Your progress is saved and the timer keeps running.")) return; }
  clearInterval(state.timer); disableGuard(); lastResult = null; $("employeeForm").reset(); $("adminForm").reset(); setTab(false); show("loginView");
}
$("adminLogoutBtn").onclick = logout; $("resultLogoutBtn").onclick = logout;

/* ---------- admin ---------- */
function fillDeptFilter(sel, allLabel) {
  sel.innerHTML = ""; if (allLabel) sel.append(el("option", { value: "", text: allLabel }));
  DEPTS.forEach(d => sel.append(el("option", { value: d, text: d })));
}
function barRow(label, pct, text, cls) {
  return el("div", { class: "bar-row" }, el("span", { class: "lbl", title: label, text: label }),
    el("div", { class: "bar-track" }, Object.assign(el("div", { class: "bar-fill " + (cls || "") }), { style: `width:${Math.max(0, Math.min(100, pct))}%` })),
    el("span", { class: "bar-val", text }));
}
const tone = p => p >= 75 ? "good" : p >= 50 ? "mid" : "low";

function renderAdmin() {
  const all = getResults(), res = activeResults(), s = getSettings();
  $("adminSub").textContent = `Results saved in this browser · pass mark ${s.passMark}% · ${s.timeLimit ? s.timeLimit + " min limit" : "no time limit"}`;
  $("adminWarning").textContent = "Local-only notice: results are stored in this browser. Employees on other computers will not appear here until you import their result files (Import / merge). Take regular backups and do not clear browser data.";

  const pcts = res.map(pctOf), avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
  const passRate = res.length ? Math.round(res.filter(isPassed).length / res.length * 100) : 0;
  const durs = res.map(r => r.duration).filter(d => typeof d === "number");
  const stats = [["Submissions", res.length], ["Average score", avg + "%"], ["Pass rate", passRate + "%"],
    ["Highest", pcts.length ? Math.max(...pcts) + "%" : "—"], ["Lowest", pcts.length ? Math.min(...pcts) + "%" : "—"],
    ["Avg time", durs.length ? fmtDuration(durs.reduce((a, b) => a + b, 0) / durs.length) : "—"],
    ["Departments covered", `${new Set(res.map(r => r.department)).size}/${DEPTS.length}`]];
  $("statsGrid").innerHTML = ""; stats.forEach(([l, v]) => $("statsGrid").append(el("div", { class: "stat-card" }, el("span", { text: l }), el("strong", { text: String(v) }))));

  // department chart
  const dc = $("deptChart"); dc.innerHTML = "";
  if (!res.length) dc.append(el("p", { class: "muted small", text: "No data yet." }));
  DEPTS.forEach(d => {
    const rs = res.filter(r => r.department === d); if (!rs.length) return;
    const a = Math.round(rs.reduce((x, r) => x + pctOf(r), 0) / rs.length);
    dc.append(barRow(d, a, `${a}% (${rs.length})`, tone(a)));
  });
  // distribution
  const dist = $("distChart"); dist.innerHTML = "";
  [[0, 19], [20, 39], [40, 59], [60, 79], [80, 100]].forEach(([lo, hi]) => {
    const n = pcts.filter(p => p >= lo && p <= hi).length;
    dist.append(barRow(`${lo}–${hi}%`, res.length ? n / res.length * 100 : 0, String(n), tone((lo + hi) / 2)));
  });

  renderQuestionAnalysis(res);

  const lb = $("leaderboard"); lb.innerHTML = "";
  [...res].sort((a, b) => pctOf(b) - pctOf(a) || (a.duration ?? 1e9) - (b.duration ?? 1e9)).slice(0, 5)
    .forEach(r => lb.append(el("li", { text: `${r.employee} (${r.department}) — ${pctOf(r)}%${typeof r.duration === "number" ? " in " + fmtDuration(r.duration) : ""}` })));
  if (!res.length) lb.append(el("li", { class: "muted", text: "No submissions yet." }));

  renderTable(all);
}
function renderQuestionAnalysis(res) {
  const dept = $("qaDept").value || DEPTS[0], rs = res.filter(r => r.department === dept), list = $("qaList"); list.innerHTML = "";
  $("qaHint").textContent = rs.length ? `· ${rs.length} submission(s), hardest first` : "";
  if (!rs.length) { list.append(el("p", { class: "muted small", text: "No submissions for this department yet." })); return; }
  EXAM_DATA[dept].map(q => ({ q, ok: rs.filter(r => r.answers[q.id] === q.answer).length }))
    .sort((a, b) => a.ok - b.ok).forEach(({ q, ok }) => {
      const p = Math.round(ok / rs.length * 100);
      list.append(el("div", { class: "qa-row" }, el("div", { class: "q" }, el("span", { text: q.question }), el("b", { text: `${p}% correct` })), barRow("", p, `${ok}/${rs.length}`, tone(p))));
    });
}
function renderTable(all) {
  const q = normalize($("resultSearch").value), fd = $("filterDept").value, fs = $("filterStatus").value;
  const { sort, dir } = adminState;
  const val = r => sort === "pct" ? pctOf(r) : sort === "strikes" ? (r.strikes ?? r.tabSwitches ?? 0) : sort === "duration" ? (r.duration ?? -1) : String(r[sort] ?? "").toLowerCase();
  const rows = all.filter(r => (!q || normalize(r.employee + " " + r.department).includes(q)) && (!fd || r.department === fd) && (!fs || (fs === "pass") === isPassed(r)))
    .sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * dir);
  const body = $("resultsBody"); body.innerHTML = ""; $("emptyResults").classList.toggle("hidden", rows.length > 0);
  rows.forEach(r => {
    const tr = el("tr");
    const outcome = r.superseded ? el("span", { class: "badge", text: "Old attempt" }) : el("span", { class: "badge " + (isPassed(r) ? "pass" : "fail"), text: isPassed(r) ? "Passed" : "Failed" });
    [r.employee, r.department, `${r.correct}/${r.total}`, pctOf(r) + "%"].forEach(v => tr.append(el("td", { text: v })));
    tr.append(el("td", {}, outcome), el("td", { text: fmtDuration(r.duration) }), el("td", {}, integrityBadge(r)), el("td", { text: new Date(r.submittedAt).toLocaleString() }));
    const act = el("td", { class: "no-print" });
    const view = el("button", { class: "table-button", text: "View" }); view.onclick = () => showAdminDetail(r); act.append(view);
    if (!r.superseded) {
      const retake = el("button", { class: "table-button", text: r.retakeAllowed ? "Retake on" : "Allow retake" });
      retake.disabled = !!r.retakeAllowed; retake.onclick = () => allowRetake(r); act.append(retake);
    }
    const del = el("button", { class: "table-button danger", text: "Delete" }); del.onclick = () => deleteResult(r); act.append(del);
    tr.append(act); body.append(tr);
  });
}
function integrityBadge(r) {
  const n = r.strikes ?? (r.tabSwitches || 0), other = Object.entries(r.violations || {}).filter(([t]) => !STRIKE_TYPES.includes(t)).reduce((a, [, v]) => a + v, 0);
  if (!n && !other) return el("span", { class: "badge pass", text: "Clean" });
  return el("span", { class: "badge " + (n ? "fail" : "warn"), title: violationText(r), text: n ? `${n} strike${n > 1 ? "s" : ""}` : `${other} blocked` });
}
function violationText(r) {
  const e = Object.entries(r.violations || {}).filter(([, v]) => v).map(([t, v]) => `${v} ${VIOL_LABEL[t] || t}`);
  return e.length ? e.join(", ") : "none recorded";
}
function showAdminDetail(r) {
  const box = $("adminDetail"); box.innerHTML = ""; box.classList.remove("hidden");
  box.append(el("h3", { text: `${r.employee} — ${r.department} — ${r.correct}/${r.total} (${pctOf(r)}%) · ${isPassed(r) ? "Passed" : "Failed"}` }));
  box.append(el("p", { class: "muted small", text: `Submitted ${new Date(r.submittedAt).toLocaleString()} · time ${fmtDuration(r.duration)} · integrity: ${violationText(r)}${r.autoReason ? " · " + r.autoReason : ""}` }));
  const qs = EXAM_DATA[r.department];
  (r.order || qs.map(q => q.id)).forEach((id, i) => {
    const q = qs.find(x => x.id === id), chosen = r.answers[id], ok = chosen === q.answer;
    const item = el("div", { class: "review-item " + (ok ? "ok" : "bad") }, el("h4", { text: `Q${i + 1}. ${q.question}` }),
      el("p", { class: "review-line" + (ok ? "" : " wrong-answer"), text: `Employee: ${chosen ? chosen + ". " + q.options[chosen] : "Not answered"}` }));
    if (!ok) item.append(el("p", { class: "review-line correct-answer", text: `Correct: ${q.answer}. ${q.options[q.answer]}` }));
    box.append(item);
  });
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}
function allowRetake(r) {
  if (!confirm(`Allow ${r.employee} (${r.department}) to take the assessment again? Their current result stays on record until they resubmit.`)) return;
  saveResults(getResults().map(x => x.id === r.id ? { ...x, retakeAllowed: true } : x)); renderAdmin();
}
function deleteResult(r) {
  if (!confirm(`Permanently delete the result for ${r.employee}? Export a backup first if unsure.`)) return;
  const rest = getResults().filter(x => x.id !== r.id); saveResults(rest);
  if (!rest.some(x => x.employeeKey === r.employeeKey)) { const a = getAttempts(); delete a[r.employeeKey]; writeJSON(ATTEMPTS_KEY, a); }
  $("adminDetail").classList.add("hidden"); renderAdmin();
}
["resultSearch", "filterDept", "filterStatus"].forEach(id => $(id).addEventListener("input", () => renderTable(getResults())));
$("qaDept").addEventListener("change", () => renderQuestionAnalysis(activeResults()));
$("refreshBtn").onclick = renderAdmin; $("printBtn").onclick = () => window.print();
document.querySelectorAll("th[data-sort]").forEach(th => th.addEventListener("click", () => {
  const k = th.dataset.sort; adminState.dir = adminState.sort === k ? -adminState.dir : (k === "employee" || k === "department" ? 1 : -1); adminState.sort = k; renderTable(getResults());
}));

/* exports / imports */
const csvCell = v => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
$("exportBtn").onclick = () => {
  const rows = [["Employee", "Department", "Correct", "Total", "Percentage", "Outcome", "Time taken (s)", "Strikes", "Violation details", "Attempt", "Submitted"]];
  getResults().forEach(r => rows.push([r.employee, r.department, r.correct, r.total, pctOf(r) + "%", isPassed(r) ? "Passed" : "Failed", r.duration ?? "", r.strikes ?? r.tabSwitches ?? "", violationText(r), r.superseded ? "Previous" : "Current", new Date(r.submittedAt).toLocaleString()]));
  download("bloomra-employee-results.csv", "﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8;");
};
$("backupBtn").onclick = () => download(`bloomra-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: "bloomra", version: 3, results: getResults() }, null, 1), "application/json");
$("importFile").addEventListener("change", async e => {
  const msg = $("importMsg"); let added = 0, skipped = 0, bad = 0;
  const results = getResults(), ids = new Set(results.map(r => r.id));
  for (const f of e.target.files) {
    try {
      const data = JSON.parse(await f.text());
      const list = Array.isArray(data) ? data : Array.isArray(data.results) ? data.results : [data];
      list.forEach(r => {
        const valid = r && typeof r.id === "string" && typeof r.employee === "string" && EXAM_DATA[r.department] && Number.isFinite(r.correct) && Number.isFinite(r.total) && r.total > 0 && r.answers && typeof r.answers === "object";
        if (!valid) { bad++; return; }
        if (ids.has(r.id)) { skipped++; return; }
        ids.add(r.id);
        const key = keyOf(r.employee, r.department);
        const clean = { ...r, employeeKey: key, employee: String(r.employee).slice(0, 80) };
        // newer attempt wins; older ones are kept as previous attempts
        const same = results.filter(x => x.employeeKey === key && !x.superseded);
        if (same.some(x => x.submittedAt > clean.submittedAt)) clean.superseded = true; else same.forEach(x => x.superseded = true);
        results.push(clean); added++;
      });
    } catch { bad++; }
  }
  saveResults(results);
  const att = getAttempts(); results.forEach(r => att[r.employeeKey] = true); writeJSON(ATTEMPTS_KEY, att);
  e.target.value = ""; msg.classList.remove("hidden");
  msg.textContent = `Import finished: ${added} added, ${skipped} duplicate(s) skipped${bad ? `, ${bad} invalid record(s) ignored` : ""}.`;
  renderAdmin();
});

/* settings */
$("settingsBtn").onclick = () => {
  const s = getSettings();
  $("setPass").value = s.passMark; $("setTime").value = s.timeLimit; $("setShuffle").checked = s.shuffle; $("setShowAnswers").checked = s.showAnswers; $("setAnti").checked = s.antiCheat; $("setFull").checked = s.requireFullscreen; $("setStrikes").value = s.maxStrikes;
  $("setEmpPass").value = s.empPass; $("setAdmPass").value = s.admPass; $("settingsDialog").showModal();
};
$("settingsForm").addEventListener("submit", e => {
  if (e.submitter && e.submitter.value !== "save") return;
  const n = (id, min, max, d) => { const v = parseInt($(id).value, 10); return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : d; };
  const cur = getSettings();
  writeJSON(SETTINGS_KEY, {
    passMark: n("setPass", 1, 100, cur.passMark), timeLimit: n("setTime", 0, 240, cur.timeLimit), shuffle: $("setShuffle").checked, showAnswers: $("setShowAnswers").checked, antiCheat: $("setAnti").checked, requireFullscreen: $("setFull").checked, maxStrikes: n("setStrikes", 0, 20, cur.maxStrikes),
    empPass: $("setEmpPass").value.trim() || cur.empPass, admPass: $("setAdmPass").value.trim() || cur.admPass
  });
  renderRules(); renderAdmin();
});

/* ---------- boot ---------- */
initLogin();

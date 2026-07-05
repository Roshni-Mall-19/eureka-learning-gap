const appEl = document.getElementById("app");
const bodyEl = document.getElementById("bodyEl");
const brandText = document.getElementById("brandText");

const state = {
  lang: "en",
  standard: null,
  student: { name: "", age: "", gender: "", school_name: "", area: "" },
  questions: [],   // fetched from Supabase for the chosen standard
  answers: {},     // question.id -> value
  qIndex: 0
};

function t() { return UI_TEXT[state.lang]; }
function applyLangAttrs() { bodyEl.setAttribute("lang", state.lang); brandText.textContent = t().appTitle; }

// ---------- Accessibility: read-aloud (built into the browser, no external service needed) ----------
let ttsVoices = [];
function loadVoices() { ttsVoices = window.speechSynthesis ? window.speechSynthesis.getVoices() : []; }
if ("speechSynthesis" in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}
function speak(text) {
  if (!("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const langCode = state.lang === "hi" ? "hi-IN" : state.lang === "mr" ? "mr-IN" : "en-IN";
  if (!ttsVoices.length) loadVoices();
  // Try exact match, then language-prefix match (e.g. any "hi-*"), then just let the browser use its default voice
  const voice = ttsVoices.find(v => v.lang === langCode) || ttsVoices.find(v => v.lang && v.lang.toLowerCase().startsWith(state.lang));
  if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = langCode; }
  window.speechSynthesis.speak(u);
}

// ---------- Accessibility: font-size toggle (cycles through 3 sizes app-wide) ----------
const FONT_SCALES = [16, 19, 23];
let fontScaleIdx = 0;
document.getElementById("fontToggleBtn").addEventListener("click", () => {
  fontScaleIdx = (fontScaleIdx + 1) % FONT_SCALES.length;
  document.documentElement.style.fontSize = FONT_SCALES[fontScaleIdx] + "px";
});

// ---------- Screen: Language select ----------
function screenLang() {
  applyLangAttrs();
  appEl.innerHTML = `
    <div class="card">
      <h1 class="student-h">Choose your language / अपनी भाषा चुनें / तुमची भाषा निवडा</h1>
      <div class="lang-row">
        <button class="lang-btn" data-l="en">English</button>
        <button class="lang-btn" data-l="hi">हिंदी</button>
        <button class="lang-btn" data-l="mr">मराठी</button>
      </div>
    </div>`;
  appEl.querySelectorAll(".lang-btn").forEach(b => b.onclick = () => { state.lang = b.dataset.l; screenConsent(); });
}

// ---------- Screen: Consent (research ethics — shown before any data is collected) ----------
function screenConsent() {
  applyLangAttrs();
  appEl.innerHTML = `
    <div class="card">
      <h1 class="student-h">${t().consentTitle}</h1>
      <button class="speak-btn" id="speakConsent">🔊 ${t().readAloud}</button>
      <p class="sub">${t().consentBody}</p>
      <label class="consent-check-row">
        <input type="checkbox" id="consentBox">
        <span>${t().consentCheck}</span>
      </label>
      <button class="big-btn" id="consentNext" disabled style="opacity:.4;">${t().start}</button>
    </div>`;
  document.getElementById("speakConsent").onclick = () => speak(t().consentBody);
  const box = document.getElementById("consentBox");
  const btn = document.getElementById("consentNext");
  box.onchange = () => { btn.disabled = !box.checked; btn.style.opacity = box.checked ? "1" : ".4"; };
  btn.onclick = () => { if (box.checked) screenWelcome(); };
}

// ---------- Screen: Welcome ----------
function screenWelcome() {
  applyLangAttrs();
  appEl.innerHTML = `
    <div class="card">
      <h1 class="student-h">${t().welcome}</h1>
      <button class="speak-btn" id="speakWelcome">🔊 ${t().readAloud}</button>
      <p class="sub">${t().welcomeSub}</p>
      <button class="big-btn" id="startBtn">${t().start}</button>
    </div>`;
  document.getElementById("speakWelcome").onclick = () => speak(t().welcomeSub);
  document.getElementById("startBtn").onclick = screenStandard;
}

// ---------- Screen: Standard select ----------
function screenStandard() {
  appEl.innerHTML = `
    <div class="card">
      <h1 class="student-h">${t().selectStandard}</h1>
      <button class="big-btn" data-s="8">${t().std8}</button>
      <button class="big-btn alt" data-s="9">${t().std9}</button>
      <button class="big-btn coral" data-s="10">${t().std10}</button>
    </div>`;
  appEl.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { state.standard = b.dataset.s; screenDetails(); });
}

// ---------- Screen: Student details ----------
function screenDetails() {
  appEl.innerHTML = `
    <div class="card">
      <h1 class="student-h">${t().studentDetails}</h1>
      <label class="field-label">${t().name}</label>
      <input class="field" id="fName" type="text">
      <label class="field-label">${t().age}</label>
      <input class="field" id="fAge" type="number" min="12" max="18" inputmode="numeric">
      <label class="field-label">${t().gender}</label>
      <select class="field" id="fGender"><option value="">--</option><option value="Male">${t().male}</option><option value="Female">${t().female}</option></select>
      <label class="field-label">${t().school}</label>
      <input class="field" id="fSchool" type="text">
      <label class="field-label">${t().area}</label>
      <select class="field" id="fArea"><option value="">--</option><option value="Rural">${t().rural}</option><option value="Urban">${t().urban}</option></select>
      <button class="big-btn" id="detailsNext" style="margin-top:16px;">${t().next}</button>
      <p id="detailsErr" style="color:#C64B4B;font-weight:600;display:none;">${t().required}</p>
    </div>`;
  document.getElementById("detailsNext").onclick = () => {
    const name = document.getElementById("fName").value.trim();
    const ageRaw = document.getElementById("fAge").value;
    const age = Number(ageRaw);
    const gender = document.getElementById("fGender").value;
    const school = document.getElementById("fSchool").value.trim();
    const area = document.getElementById("fArea").value;
    const errEl = document.getElementById("detailsErr");
    if (!name || !ageRaw || !gender || !school || !area) {
      errEl.textContent = t().required;
      errEl.style.display = "block";
      return;
    }
    // Sanity bound: no 0, no negative, no unrealistic values (students here are roughly 10-20 yrs old)
    if (!Number.isFinite(age) || !Number.isInteger(age) || age < 12 || age > 18) {
      errEl.textContent = t().invalidAge;
      errEl.style.display = "block";
      return;
    }
    errEl.style.display = "none";
    state.student = { name, age, gender, school_name: school, area };
    loadQuestionsAndStart();
  };
}

// ---------- Load questions from Supabase, then start wizard ----------
async function loadQuestionsAndStart() {
  appEl.innerHTML = `<div class="card"><p class="sub">Loading your questions...</p></div>`;
  const { data, error } = await supabaseClient
    .from("questions").select("*").eq("standard", state.standard).eq("active", true)
    .order("order_index", { ascending: true });
  if (error || !data || data.length === 0) {
    appEl.innerHTML = `<div class="card"><p class="sub">Could not load questions. Please check that the database has been seeded (see seed.html) and that js/supabase-client.js has your project keys, then reload.</p></div>`;
    return;
  }
  state.questions = data;
  state.qIndex = 0;
  state.answers = {};
  screenQuestion();
}

const SECTION_TITLES = { likert: "sectionA", mcq_behaviour: "sectionB", ai_readiness: "sectionC", mcq: "sectionD", text: "sectionE" };

// ---------- Screen: Question wizard ----------
function screenQuestion() {
  const q = state.questions[state.qIndex];
  const total = state.questions.length;
  const pct = Math.round((state.qIndex / total) * 100);
  const qText = q["question_" + state.lang] || q.question_en;

  let bodyHtml = "";
  if (q.type === "likert") {
    const labels = t().likertLabels;
    bodyHtml = `
      <div class="likert-row">
        <div class="likert-q">${qText}</div>
        <div class="likert-scale">
          ${[1,2,3,4,5].map(v => `
            <label class="likert-opt">
              <input type="radio" name="likert" value="${v}" ${state.answers[q.id]==v ? "checked":""}>
              <div class="dot">${v}</div>
              <div class="likert-caption">${v===1||v===5 ? labels[v-1] : ""}</div>
            </label>`).join("")}
        </div>
      </div>`;
  } else if (q.type === "text") {
    bodyHtml = `
      <div class="likert-q">${qText}</div>
      <textarea class="field" id="textAns" placeholder="${t().typeAnswer}">${state.answers[q.id] || ""}</textarea>`;
  } else if (q.type === "mcq_multi") {
    let opts = [];
    try { opts = typeof q.options === "string" ? JSON.parse(q.options) : (q.options || []); } catch (e) { opts = []; }
    const selected = Array.isArray(state.answers[q.id]) ? state.answers[q.id] : [];
    bodyHtml = `
      <div class="likert-q">${qText}</div>
      <p style="font-size:.82rem;color:#6a756f;margin:-6px 0 10px;font-weight:600;">(Select all that apply)</p>
      ${opts.map(opt => `
        <label class="mcq-option ${selected.includes(opt) ? "selected":""}" data-opt="${opt.replace(/"/g,'&quot;')}">
          <input type="checkbox" value="${opt.replace(/"/g,'&quot;')}" ${selected.includes(opt) ? "checked":""}> ${translateOption(opt, state.lang)}
        </label>`).join("")}`;
  } else {
    // mcq_behaviour, ai_readiness, mcq
    let opts = [];
    try { opts = typeof q.options === "string" ? JSON.parse(q.options) : (q.options || []); } catch (e) { opts = []; }
    if (q.type === "ai_readiness" && opts.every(o => ["yes","no","maybe"].includes(o))) {
      opts = opts.map(o => t()[o]);
    }
    bodyHtml = `
      <div class="likert-q">${qText}</div>
      ${opts.map(opt => `
        <label class="mcq-option ${state.answers[q.id]===opt ? "selected":""}" data-opt="${opt.replace(/"/g,'&quot;')}">
          <input type="radio" name="mcq" value="${opt.replace(/"/g,'&quot;')}" ${state.answers[q.id]===opt ? "checked":""}> ${translateOption(opt, state.lang)}
        </label>`).join("")}`;
  }

  appEl.innerHTML = `
    <div class="progress-label">${t().progress} ${state.qIndex+1} ${t().of} ${total}</div>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    <span class="section-tag">${t()[SECTION_TITLES[q.type]]}</span>
    <div class="card">
      <button class="speak-btn" id="speakQ">🔊 ${t().readAloud}</button>
      ${bodyHtml}
    </div>
    <div style="display:flex;gap:10px;">
      ${state.qIndex > 0 ? `<button class="big-btn alt" id="backBtn" style="flex:1;">${t().back}</button>` : ""}
      <button class="big-btn" id="nextBtn" style="flex:2;">${state.qIndex === total-1 ? t().submit : t().next}</button>
    </div>
    <p id="qErr" style="color:#C64B4B;font-weight:600;display:none;">${t().required}</p>`;

  document.getElementById("speakQ").onclick = () => speak(qText);

  if (q.type === "likert") {
    appEl.querySelectorAll('input[name="likert"]').forEach(r => r.onchange = () => { state.answers[q.id] = r.value; });
  } else if (q.type === "mcq_multi") {
    appEl.querySelectorAll(".mcq-option").forEach(el => el.onclick = (e) => {
      if (e.target.tagName !== "INPUT") el.querySelector("input").checked = !el.querySelector("input").checked;
      const current = Array.isArray(state.answers[q.id]) ? [...state.answers[q.id]] : [];
      const opt = el.dataset.opt;
      const idx = current.indexOf(opt);
      if (el.querySelector("input").checked) { if (idx === -1) current.push(opt); }
      else { if (idx > -1) current.splice(idx, 1); }
      state.answers[q.id] = current;
      el.classList.toggle("selected", el.querySelector("input").checked);
    });
  } else if (q.type !== "text") {
    appEl.querySelectorAll(".mcq-option").forEach(el => el.onclick = () => {
      state.answers[q.id] = el.dataset.opt;
      appEl.querySelectorAll(".mcq-option").forEach(x => x.classList.remove("selected"));
      el.classList.add("selected");
    });
  }

  if (document.getElementById("backBtn")) document.getElementById("backBtn").onclick = () => { state.qIndex--; screenQuestion(); };

  document.getElementById("nextBtn").onclick = () => {
    if (q.type === "text") {
      const val = document.getElementById("textAns").value.trim();
      state.answers[q.id] = val; // text answers are optional
    } else if (q.type === "mcq_multi") {
      if (!Array.isArray(state.answers[q.id]) || state.answers[q.id].length === 0) {
        document.getElementById("qErr").style.display = "block";
        return;
      }
    } else if (state.answers[q.id] === undefined) {
      document.getElementById("qErr").style.display = "block";
      return;
    }
    if (state.qIndex < total - 1) { state.qIndex++; screenQuestion(); }
    else submitQuestionnaire();
  };
}

// ---------- Submit ----------
async function submitQuestionnaire() {
  appEl.innerHTML = `<div class="card"><p class="sub">Saving your answers...</p></div>`;

  const { data: studentRow, error: studentErr } = await supabaseClient
    .from("students")
    .insert([{ ...state.student, standard: state.standard, language_used: state.lang }])
    .select().single();

  if (studentErr) {
    appEl.innerHTML = `<div class="card"><p class="sub">Something went wrong saving your details: ${studentErr.message}</p></div>`;
    return;
  }

  const responseRows = state.questions.map(q => {
    const val = state.answers[q.id];
    let is_correct = null;
    let answer_value;
    if (q.type === "mcq") {
      is_correct = (val === q.correct_answer);
      answer_value = val === undefined ? null : String(val);
    } else if (q.type === "mcq_multi") {
      const selected = Array.isArray(val) ? val : [];
      let correct = [];
      try { correct = typeof q.correct_answers === "string" ? JSON.parse(q.correct_answers) : (q.correct_answers || []); } catch (e) {}
      is_correct = selected.length === correct.length && [...selected].sort().join("|") === [...correct].sort().join("|");
      answer_value = selected.join(", ");
    } else {
      answer_value = val === undefined ? null : String(val);
    }
    return { student_id: studentRow.id, question_id: q.id, answer_value, is_correct };
  });

  const { error: respErr } = await supabaseClient.from("responses").insert(responseRows);
  if (respErr) {
    appEl.innerHTML = `<div class="card"><p class="sub">Something went wrong saving your answers: ${respErr.message}</p></div>`;
    return;
  }

  const conceptResult = computeScores(responseRows, state.questions); // gives confidenceIndex10 (Section A self-rating)
  const subjectResult = computeSubjectScores(responseRows, state.questions); // statistically meaningful per-subject %
  screenResults(subjectResult, conceptResult.confidenceIndex10, responseRows);
}

// ---------- Screen: Results ----------
function screenResults(subjectResult, confidenceIndex10, responseRows) {
  const level = overallLevel(subjectResult.overallScore10);
  const subjects = subjectResult.subjects; // sorted weakest-first
  const weakSubjects = subjects.filter(s => s.score10 < 6);
  const totalCorrect = subjects.reduce((a, s) => a + s.correct, 0);
  const totalQ = subjects.reduce((a, s) => a + s.total, 0);

  appEl.innerHTML = `
    <div class="card score-hero" id="reportTop">
      <h1 class="student-h">${t().finishTitle}</h1>
      <p class="sub">${t().finishSub}</p>
      ${donutSvg(subjectResult.overallScore10 * 10, level.color, `${totalCorrect}/${totalQ}`, "correct")}
      <div class="score-max">${t().yourScore}: ${subjectResult.overallScore10} ${t().outOf10} — ${level.label}</div>
    </div>

    <div class="card">
      <h3 style="margin-top:0;">Confidence vs. Actual Performance</h3>
      <p class="sub" style="margin-bottom:14px;">How sure you felt vs. how you actually scored — this gap is exactly what this research is trying to find.</p>
      ${compareBar("How confident you feel", confidenceIndex10)}
      ${compareBar("How you actually scored", subjectResult.overallScore10)}
    </div>

    <div class="card">
      <h3 style="margin-top:0;">Subject-wise Performance</h3>
      ${subjects.map(s => subjectBar(s)).join("")}
    </div>

    ${weakSubjects.length ? `
    <div class="card">
      <h3 style="margin-top:0;">${t().recommendation}</h3>
      ${weakSubjects.map(s => `<div class="rec-card">${recommendationForSubject(s.subject, [...new Set(s.weakConcepts)], state.lang)}</div>`).join("")}
    </div>` : `
    <div class="card"><p class="sub">${t().noWeak}</p></div>`}

    <div class="card">
      <h3 style="margin-top:0;">${t().myAnswers}</h3>
      ${answerReviewHtml(responseRows)}
    </div>

    <div class="card" style="text-align:center;">
      <p class="sub">${t().thankYou}</p>
      <button class="big-btn" id="downloadBtn" style="margin-bottom:10px;">📄 ${t().downloadReport}</button>
      <button class="big-btn alt" id="doneBtn">${t().finishBtn}</button>
    </div>`;

  document.getElementById("downloadBtn").onclick = () => window.print();
  document.getElementById("doneBtn").onclick = () => { window.location.href = "index.html"; };
}

// Full answer review: shows every scored question with the student's answer, whether it was
// correct, and the correct answer if they got it wrong — so they can actually learn from the test.
function answerReviewHtml(responseRows) {
  const qMap = {}; state.questions.forEach(q => { qMap[q.id] = q; });
  return responseRows.map(r => {
    const q = qMap[r.question_id];
    if (!q) return "";
    const qText = q["question_" + state.lang] || q.question_en;
    if (q.type === "mcq" || q.type === "mcq_multi") {
      let correctText = q.correct_answer || "";
      if (!correctText && q.correct_answers) {
        try { correctText = (typeof q.correct_answers === "string" ? JSON.parse(q.correct_answers) : q.correct_answers).join(", "); } catch (e) {}
      }
      return `
        <div class="answer-row">
          <div class="answer-q">${qText} <span class="answer-badge ${r.is_correct ? "ok" : "bad"}">${r.is_correct ? t().correct : t().incorrect}</span></div>
          <div class="answer-you">${t().yourAnswer}: ${r.answer_value || "—"}</div>
          ${!r.is_correct ? `<div class="answer-correct">${t().correctAnswer}: ${correctText}</div>` : ""}
        </div>`;
    } else if (q.type === "likert") {
      return `<div class="answer-row"><div class="answer-q">${qText}</div><div class="answer-you">${r.answer_value}/5</div></div>`;
    } else if (q.type === "text") {
      if (!r.answer_value) return "";
      return `<div class="answer-row"><div class="answer-q">${qText}</div><div class="answer-you">${r.answer_value}</div></div>`;
    } else {
      return `<div class="answer-row"><div class="answer-q">${qText}</div><div class="answer-you">${r.answer_value || "—"}</div></div>`;
    }
  }).join("");
}

function subjectBar(s) {
  const color = s.score10 >= 8 ? "#1E8A5F" : s.score10 >= 5 ? "#D98A2B" : "#C64B4B";
  return `
    <div class="concept-bar-row">
      <div class="concept-bar-label"><span>${s.subject}</span><span>${s.correct}/${s.total} · ${s.score10}/10</span></div>
      <div class="concept-bar-track"><div class="concept-bar-fill" style="width:${s.score10*10}%;background:${color};"></div></div>
    </div>`;
}

function compareBar(label, score10) {
  const color = score10 >= 8 ? "#1E8A5F" : score10 >= 5 ? "#D98A2B" : "#C64B4B";
  return `
    <div class="concept-bar-row">
      <div class="concept-bar-label"><span>${label}</span><span>${score10}/10</span></div>
      <div class="concept-bar-track"><div class="concept-bar-fill" style="width:${score10*10}%;background:${color};"></div></div>
    </div>`;
}

function donutSvg(pct, color, centerBig, centerSmall) {
  const r = 60, c = 2 * Math.PI * r;
  const filled = (pct / 100) * c;
  return `
    <svg viewBox="0 0 150 150" style="width:150px;height:150px;margin:10px auto;display:block;">
      <circle cx="75" cy="75" r="${r}" fill="none" stroke="#EAE2CF" stroke-width="16"/>
      <circle cx="75" cy="75" r="${r}" fill="none" stroke="${color}" stroke-width="16"
        stroke-dasharray="${filled} ${c-filled}" stroke-linecap="round" transform="rotate(-90 75 75)"/>
      <text x="75" y="72" text-anchor="middle" font-size="26" font-weight="800" fill="#23302B" font-family="'Baloo 2',sans-serif">${centerBig}</text>
      <text x="75" y="92" text-anchor="middle" font-size="12" fill="#6a756f" font-family="'Baloo 2',sans-serif">${centerSmall}</text>
    </svg>`;
}

// Boot
screenLang();

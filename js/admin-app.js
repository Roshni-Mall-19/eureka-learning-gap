const pageBody = document.getElementById("pageBody");
const topbarTitle = document.getElementById("topbarTitle");

// ================= Real login (Supabase Auth) =================
// Access to student data and question-bank editing is enforced at the DATABASE level via Row Level
// Security (see schema.sql) — only a signed-in Supabase Auth user can read students/responses or
// manage questions. This login form just calls Supabase's real auth, so the protection is genuine,
// not just a JS gate a visitor could bypass by reading this file.
async function checkLogin() {
  const email = document.getElementById("loginUser").value.trim();
  const pass = document.getElementById("loginPass").value;
  document.getElementById("loginBtn").disabled = true;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
  document.getElementById("loginBtn").disabled = false;
  if (error) {
    document.getElementById("loginErr").textContent = error.message;
    document.getElementById("loginErr").style.display = "block";
  } else {
    showDashboard();
  }
}

function showDashboard() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("dashboardRoot").style.display = "block";
  initDashboard();
}

document.getElementById("loginBtn").onclick = checkLogin;
document.getElementById("loginPass").addEventListener("keydown", (e) => { if (e.key === "Enter") checkLogin(); });

supabaseClient.auth.getSession().then(({ data: { session } }) => {
  if (session) showDashboard();
});

const AVATAR_COLORS = [
  { bg: "#EEF2FF", fg: "#3B6BF5" }, { bg: "#EEE9FF", fg: "#6C4FD4" },
  { bg: "#E6F7F5", fg: "#0D9E87" }, { bg: "#FDEAEA", fg: "#D63B3B" },
  { bg: "#FEF3E2", fg: "#E08A1A" }, { bg: "#E8F7EE", fg: "#2E9E5B" }
];

const adminState = {
  tab: "overview",
  students: [], questions: [], responses: [],
  qbankStandard: "8",
  search: "",
  filterStandard: "",
  filterSchool: "",
  editingId: null
};

const TAB_TITLES = { overview: "Dashboard", students: "Students", questions: "Question Bank" };

document.querySelectorAll(".nav-item[data-tab]").forEach(a => {
  a.onclick = (e) => {
    e.preventDefault();
    document.querySelectorAll(".nav-item").forEach(x => x.classList.remove("active"));
    a.classList.add("active");
    adminState.tab = a.dataset.tab;
    topbarTitle.textContent = TAB_TITLES[adminState.tab];
    render();
  };
});
document.getElementById("searchBox").addEventListener("input", (e) => {
  adminState.search = e.target.value.toLowerCase();
  render();
});
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  location.reload();
});
document.getElementById("exportBtn").addEventListener("click", exportExcel);

// Filter bar (Class + School) — rendered inside the page body on Overview/Students tabs, rather than
// cramming more controls into the topbar.
function filterBarHtml() {
  const schools = [...new Set(adminState.students.map(s => s.school_name).filter(Boolean))].sort();
  return `
    <div class="filters" style="margin-bottom:1rem;">
      <select id="filterStdSel">
        <option value="">All Classes</option>
        <option value="8" ${adminState.filterStandard==="8"?"selected":""}>Class 8</option>
        <option value="9" ${adminState.filterStandard==="9"?"selected":""}>Class 9</option>
        <option value="10" ${adminState.filterStandard==="10"?"selected":""}>Class 10</option>
      </select>
      <select id="filterSchoolSel">
        <option value="">All Schools</option>
        ${schools.map(sch => `<option value="${sch.replace(/"/g,'&quot;')}" ${adminState.filterSchool===sch?"selected":""}>${sch}</option>`).join("")}
      </select>
      ${(adminState.filterStandard || adminState.filterSchool) ? `<button class="btn btn-secondary" id="clearFiltersBtn">Clear filters</button>` : ""}
    </div>`;
}
function wireFilterBar() {
  const stdSel = document.getElementById("filterStdSel");
  const schoolSel = document.getElementById("filterSchoolSel");
  if (stdSel) stdSel.onchange = (e) => { adminState.filterStandard = e.target.value; render(); };
  if (schoolSel) schoolSel.onchange = (e) => { adminState.filterSchool = e.target.value; render(); };
  const clearBtn = document.getElementById("clearFiltersBtn");
  if (clearBtn) clearBtn.onclick = () => { adminState.filterStandard = ""; adminState.filterSchool = ""; render(); };
}

// Students currently in scope, after applying class filter + school filter + search box
function visibleStudents() {
  return adminState.students.filter(s =>
    (!adminState.filterStandard || s.standard === adminState.filterStandard) &&
    (!adminState.filterSchool || s.school_name === adminState.filterSchool) &&
    (!adminState.search || s.name.toLowerCase().includes(adminState.search) || (s.school_name || "").toLowerCase().includes(adminState.search))
  );
}

// Full data export — always exports the ENTIRE dataset (not just the currently filtered/searched
// view) since this is meant to be the complete research dataset for analysis outside the app.
function buildSummaryRows(students) {
  return students.map(s => {
    const resp = adminState.responses.filter(r => r.student_id === s.id);
    const subj = computeSubjectScores(resp, adminState.questions);
    const bySubj = {}; subj.subjects.forEach(x => bySubj[x.subject] = x.pct);
    const weak = subj.subjects.filter(x => x.pct < 60).flatMap(x => x.weakConcepts);
    return {
      "Student Name": s.name, "Age": s.age || "", "Gender": s.gender || "", "Class": s.standard,
      "School": s.school_name || "", "Area": s.area || "", "Language Used": s.language_used || "",
      "Submitted At": new Date(s.created_at).toLocaleString(),
      "Overall %": subj.overallPct, "Science %": bySubj["Science"] ?? "", "Maths %": bySubj["Maths"] ?? "",
      "English %": bySubj["English"] ?? "", "Computer %": bySubj["Computer"] ?? "",
      "Weak Concepts": [...new Set(weak)].join("; ")
    };
  });
}

function buildResponseRows(students, questions, responses, standardFilter) {
  const qMap = {}; questions.forEach(q => qMap[q.id] = q);
  const sMap = {}; students.forEach(s => sMap[s.id] = s);
  return responses
    .filter(r => sMap[r.student_id] && (!standardFilter || sMap[r.student_id].standard === standardFilter))
    .map(r => {
      const q = qMap[r.question_id] || {};
      const s = sMap[r.student_id] || {};
      let correctAns = q.correct_answer || "";
      if (!correctAns && q.correct_answers) {
        try { correctAns = (typeof q.correct_answers === "string" ? JSON.parse(q.correct_answers) : q.correct_answers).join(", "); } catch (e) {}
      }
      return {
        "Student Name": s.name || "", "Class": s.standard || "", "School": s.school_name || "", "Area": s.area || "",
        "Gender": s.gender || "", "Age": s.age || "",
        "Question Type": q.type || "", "Subject": q.subject || "", "Concept": q.concept || "",
        "Chapter": q.chapter || "", "Difficulty": q.difficulty || "",
        "Question (English)": q.question_en || "", "Student's Answer": r.answer_value || "",
        "Correct Answer": correctAns, "Is Correct": r.is_correct === null ? "" : (r.is_correct ? "Yes" : "No"),
        "Submitted At": s.created_at ? new Date(s.created_at).toLocaleString() : ""
      };
    });
}

function exportExcel() {
  if (typeof XLSX === "undefined") { alert("Excel export library failed to load — check your internet connection and try again."); return; }
  const allStudents = adminState.students;
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildSummaryRows(allStudents)), "Summary (All Students)");

  ["8", "9", "10"].forEach(std => {
    const rows = buildResponseRows(allStudents, adminState.questions, adminState.responses, std);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "No responses yet for this class" }]), `Std ${std} Responses`);
  });

  const allRows = buildResponseRows(allStudents, adminState.questions, adminState.responses, "");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allRows.length ? allRows : [{ Note: "No responses yet" }]), "All Responses");

  XLSX.writeFile(wb, `learning-gap-full-data-${new Date().toISOString().slice(0,10)}.xlsx`);
}

async function loadAll() {
  const [{ data: students }, { data: questions }, { data: responses }] = await Promise.all([
    supabaseClient.from("students").select("*").order("created_at", { ascending: false }),
    supabaseClient.from("questions").select("*").order("order_index", { ascending: true }),
    supabaseClient.from("responses").select("*")
  ]);
  adminState.students = students || [];
  adminState.questions = questions || [];
  adminState.responses = responses || [];
  document.getElementById("liveDot").style.display = "inline";
  document.getElementById("navStudentCount").textContent = adminState.students.length;
  render();
}

function studentScore(studentId) {
  const resp = adminState.responses.filter(r => r.student_id === studentId);
  return computeScores(resp, adminState.questions);
}
function studentSubjectScore(studentId) {
  const resp = adminState.responses.filter(r => r.student_id === studentId);
  return computeSubjectScores(resp, adminState.questions);
}

function initials(name) {
  return (name || "?").trim().split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase();
}
function avatarColor(seed) {
  let h = 0; for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function pctColor(pct) {
  if (pct >= 80) return "#3B6BF5";
  if (pct >= 60) return "#2E9E5B";
  if (pct >= 40) return "#E08A1A";
  return "#D63B3B";
}
function statusBadge(pct) {
  if (pct >= 80) return { cls: "badge-excellent", label: "Excellent" };
  if (pct >= 60) return { cls: "badge-good", label: "Good" };
  if (pct >= 40) return { cls: "badge-needs", label: "Needs work" };
  return { cls: "badge-critical", label: "Critical" };
}
function stdBadgeClass(std) { return std === "8" ? "badge-8" : std === "9" ? "badge-9" : "badge-10"; }
function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.floor(hrs / 24) + "d ago";
}

// Build a per-student list of { concept, score10, standard, name } across all attempted concepts
function allConceptEntries(students) {
  const rows = [];
  students.forEach(s => {
    const sc = studentScore(s.id);
    sc.conceptScores.forEach(c => {
      if (c.attempted) {
        const q = adminState.questions.find(q => q.concept === c.concept && q.standard === s.standard);
        rows.push({ concept: c.concept, score10: c.score10, standard: s.standard, name: s.name, area: s.area, subject: q ? q.subject : null });
      }
    });
  });
  return rows;
}

// Aggregates per-student concept entries into ONE row per (concept + class), averaged across every
// student who attempted it. This is the number that should drive "gap severity" and "recent gaps" —
// a single student's single wrong answer is not, by itself, a "40% accuracy" or "0% accuracy" class
// statistic; it only becomes a meaningful percentage once averaged across everyone who took that question.
function aggregateConceptStats(conceptEntries) {
  const agg = {};
  conceptEntries.forEach(e => {
    const key = e.standard + "||" + e.concept;
    if (!agg[key]) agg[key] = { concept: e.concept, standard: e.standard, subject: e.subject, sum: 0, n: 0, wrongCount: 0 };
    agg[key].sum += e.score10;
    agg[key].n += 1;
    if (e.score10 < 5) agg[key].wrongCount += 1;
  });
  return Object.values(agg).map(a => ({
    concept: a.concept, standard: a.standard, subject: a.subject,
    avgPct: Math.round((a.sum / a.n) * 10),
    studentsTotal: a.n, studentsWrong: a.wrongCount
  }));
}

function render() {
  if (adminState.tab === "overview") renderOverview();
  else if (adminState.tab === "students") renderStudents();
  else if (adminState.tab === "questions") renderQuestions();
}

// ================= OVERVIEW =================
function renderOverview() {
  const students = visibleStudents();
  const conceptEntries = allConceptEntries(students);
  const conceptStats = aggregateConceptStats(conceptEntries); // ONE row per concept, averaged across students
  const gapConcepts = conceptStats.filter(c => c.avgPct < 70); // anything below 70% class-average counts as a "gap"
  const scores = students.map(s => studentSubjectScore(s.id).overallPct);
  const avgPct = scores.length ? Math.round(scores.reduce((a, c) => a + c, 0) / scores.length) : 0;

  document.getElementById("navGapCount").textContent = gapConcepts.length;

  // Topic performance grouped by standard (already a proper per-concept average — this panel was correct before)
  function topicGroup(std) {
    const entries = conceptEntries.filter(c => c.standard === std);
    const agg = {};
    entries.forEach(e => { if (!agg[e.concept]) agg[e.concept] = { sum: 0, n: 0 }; agg[e.concept].sum += e.score10; agg[e.concept].n += 1; });
    return Object.keys(agg).map(k => ({ concept: k, pct: Math.round((agg[k].sum / agg[k].n) * 10) })).sort((a, b) => a.pct - b.pct).slice(0, 6);
  }
  function topicRowsHtml(std) {
    const rows = topicGroup(std);
    if (!rows.length) return `<p style="font-size:12px;color:var(--ink-muted);margin-bottom:8px;">No responses yet for this class.</p>`;
    return rows.map(r => `
      <div class="topic-row">
        <span class="topic-label">${r.concept}</span>
        <div class="topic-bar-wrap"><div class="topic-bar-fill" style="width:${r.pct}%;background:${pctColor(r.pct)}"></div></div>
        <span class="topic-pct" style="color:${pctColor(r.pct)}">${r.pct}%</span>
      </div>`).join("");
  }

  // Gap severity donut — now built from the AGGREGATED per-concept average, not raw per-student instances,
  // so "Needs work" / "Borderline" can actually populate (a concept only lands in "Critical" if the class
  // AVERAGE on it is genuinely below 40%, not just because one student got one question wrong).
  const critical = gapConcepts.filter(c => c.avgPct < 40).length;
  const needsWork = gapConcepts.filter(c => c.avgPct >= 40 && c.avgPct < 60).length;
  const borderline = gapConcepts.filter(c => c.avgPct >= 60 && c.avgPct < 70).length;
  const totalGaps = gapConcepts.length || 1;
  const circumference = 345.4;
  const critLen = (critical / totalGaps) * circumference;
  const needsLen = (needsWork / totalGaps) * circumference;
  const borderLen = (borderline / totalGaps) * circumference;

  const recentGaps = [...gapConcepts].sort((a, b) => a.avgPct - b.avgPct).slice(0, 7);
  const recentStudents = [...students].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 4);

  const smallSampleWarning = students.length > 0 && students.length < 5 ? `
    <div style="background:var(--amber-soft);border:1px solid #F5D9A8;border-radius:var(--radius);padding:10px 14px;margin-bottom:1rem;font-size:12.5px;color:#8A5A0F;">
      ⚠️ Only <b>${students.length}</b> student${students.length===1?"":"s"} assessed so far — percentages below are indicative only, not yet statistically reliable. They'll firm up as more students are tested.
    </div>` : "";

  pageBody.innerHTML = `
    ${filterBarHtml()}
    ${smallSampleWarning}
    <div class="stats-grid">
      <div class="stat-card blue">
        <div class="stat-top"><div class="stat-icon blue">👨‍🎓</div></div>
        <div class="stat-num">${students.length}</div>
        <div class="stat-label">Total students assessed</div>
      </div>
      <div class="stat-card teal">
        <div class="stat-top"><div class="stat-icon teal">📋</div></div>
        <div class="stat-num">${students.length}</div>
        <div class="stat-label">Assessments completed</div>
      </div>
      <div class="stat-card amber">
        <div class="stat-top"><div class="stat-icon amber">⚠️</div></div>
        <div class="stat-num">${gapConcepts.length}</div>
        <div class="stat-label">Distinct concepts below 70% class avg</div>
      </div>
      <div class="stat-card red">
        <div class="stat-top"><div class="stat-icon red">🎯</div></div>
        <div class="stat-num">${avgPct}<span style="font-size:18px;color:var(--ink-muted)">%</span></div>
        <div class="stat-label">Average score, all classes</div>
      </div>
    </div>

    <div class="mid-grid">
      <div class="card">
        <div class="card-header"><span class="card-header-icon">📊</span><h3>Topic performance — by class</h3></div>
        <div class="card-body">
          <div class="topic-group-label">Class 8 topics</div>
          ${topicRowsHtml("8")}
          <div class="topic-group-label">Class 9 topics</div>
          ${topicRowsHtml("9")}
          <div class="topic-group-label">Class 10 topics</div>
          ${topicRowsHtml("10")}
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:1rem;">
        <div class="card">
          <div class="card-header"><span class="card-header-icon">🍩</span><h3>Gap severity distribution</h3></div>
          <div class="donut-wrap">
            <svg class="donut-svg" viewBox="0 0 150 150">
              <circle cx="75" cy="75" r="55" fill="none" stroke="#F0F1F8" stroke-width="22"/>
              <circle cx="75" cy="75" r="55" fill="none" stroke="#D63B3B" stroke-width="22"
                stroke-dasharray="${critLen} ${circumference-critLen}" stroke-dashoffset="0" transform="rotate(-90 75 75)"/>
              <circle cx="75" cy="75" r="55" fill="none" stroke="#E08A1A" stroke-width="22"
                stroke-dasharray="${needsLen} ${circumference-needsLen}" stroke-dashoffset="${-critLen}" transform="rotate(-90 75 75)"/>
              <circle cx="75" cy="75" r="55" fill="none" stroke="#2E9E5B" stroke-width="22"
                stroke-dasharray="${borderLen} ${circumference-borderLen}" stroke-dashoffset="${-(critLen+needsLen)}" transform="rotate(-90 75 75)"/>
              <text x="75" y="70" text-anchor="middle" font-size="22" font-weight="700" fill="#1A1A2E" font-family="'Space Grotesk',sans-serif">${gapConcepts.length}</text>
              <text x="75" y="87" text-anchor="middle" font-size="11" fill="#7B7B9D" font-family="'Inter',sans-serif">concepts w/ gaps</text>
            </svg>
            <div class="donut-legend">
              <div class="legend-item"><div class="legend-dot" style="background:#D63B3B"></div><span class="legend-label">Critical (&lt;40% class avg)</span><span class="legend-val">${critical}</span></div>
              <div class="legend-item"><div class="legend-dot" style="background:#E08A1A"></div><span class="legend-label">Needs work (40–60%)</span><span class="legend-val">${needsWork}</span></div>
              <div class="legend-item"><div class="legend-dot" style="background:#2E9E5B"></div><span class="legend-label">Borderline (60–70%)</span><span class="legend-val">${borderline}</span></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-header-icon">🕒</span><h3>Recent submissions</h3></div>
          <div class="card-body" style="padding-top:0.5rem">
            ${recentStudents.length ? recentStudents.map(s => {
              const pct = studentSubjectScore(s.id).overallPct;
              const c = avatarColor(s.id);
              return `<div class="session-item">
                <div class="session-date" style="background:${c.bg};color:${c.fg}">${initials(s.name)}</div>
                <div><div class="session-title">${s.name} · Std ${s.standard}</div><div class="session-sub">${s.school_name || "—"} · ${timeAgo(s.created_at)}</div></div>
                <span class="session-chip" style="background:${pct<40?'var(--red-soft)':'var(--green-soft)'};color:${pctColor(pct)}">${pct}%</span>
              </div>`;
            }).join("") : `<div class="empty-state">No submissions yet.</div>`}
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-header"><span class="card-header-icon">📚</span><h3>Subject-wise performance — all classes</h3></div>
      <div class="card-body">${subjectRowsHtml(conceptEntries)}</div>
    </div>

    ${clusteringPanelHtml(students)}

    <div class="bottom-grid">
      <div class="card">
        <div class="card-header"><span class="card-header-icon">👩‍🎓</span><h3>Student roster</h3>
          <div style="display:flex;gap:8px;align-items:center">
            <span style="font-size:11px;color:var(--ink-muted)">Showing ${Math.min(8,students.length)} of ${students.length}</span>
            <button class="card-action" id="viewAllBtn">View all</button>
          </div>
        </div>
        <div style="padding:0 0.75rem;">
          <table class="student-table">
            <thead><tr><th>Student</th><th>Std</th><th>Score</th><th>Status</th></tr></thead>
            <tbody>
              ${students.slice(0, 8).map(s => studentRowHtml(s)).join("") || `<tr><td colspan="4" class="empty-state">No students yet — collect responses via student.html</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-header-icon">🔍</span><h3>Recent gaps detected</h3></div>
        <div class="card-body" style="padding-top:0.25rem">
          ${recentGaps.length ? recentGaps.map(g => {
            const sev = g.avgPct < 40 ? { label: "Critical", bg: "var(--red-soft)", fg: "var(--red)" } :
                        g.avgPct < 60 ? { label: "Needs work", bg: "var(--amber-soft)", fg: "var(--amber)" } :
                                        { label: "Borderline", bg: "var(--green-soft)", fg: "var(--green)" };
            return `<div class="gap-item">
              <div class="gap-type-dot" style="background:${sev.fg}"></div>
              <div class="gap-content"><div class="gap-title">${g.concept}</div><div class="gap-meta">Class ${g.standard} · ${g.subject||""} · ${g.avgPct}% class accuracy (${g.studentsWrong}/${g.studentsTotal} students struggling)</div></div>
              <span class="gap-severity" style="background:${sev.bg};color:${sev.fg}">${sev.label}</span>
            </div>`;
          }).join("") : `<div class="empty-state">No gaps detected yet.</div>`}
        </div>
      </div>
    </div>`;

  wireFilterBar();
  const viewAllBtn = document.getElementById("viewAllBtn");
  if (viewAllBtn) viewAllBtn.onclick = () => {
    document.querySelectorAll(".nav-item").forEach(x => x.classList.remove("active"));
    document.querySelector('.nav-item[data-tab="students"]').classList.add("active");
    adminState.tab = "students"; topbarTitle.textContent = TAB_TITLES.students; render();
  };
}

function subjectRowsHtml(conceptEntries) {
  const subjects = ["Science", "Maths", "English", "Computer"];
  const agg = {};
  conceptEntries.forEach(e => {
    if (!e.subject) return;
    if (!agg[e.subject]) agg[e.subject] = { sum: 0, n: 0 };
    agg[e.subject].sum += e.score10; agg[e.subject].n += 1;
  });
  const rows = subjects.map(s => ({ subject: s, pct: agg[s] && agg[s].n ? Math.round((agg[s].sum / agg[s].n) * 10) : null }));
  if (rows.every(r => r.pct === null)) return `<div class="empty-state">No responses yet.</div>`;
  return rows.map(r => r.pct === null ? "" : `
    <div class="topic-row">
      <span class="topic-label">${r.subject}</span>
      <div class="topic-bar-wrap"><div class="topic-bar-fill" style="width:${r.pct}%;background:${pctColor(r.pct)}"></div></div>
      <span class="topic-pct" style="color:${pctColor(r.pct)}">${r.pct}%</span>
    </div>`).join("");
}

// Genuine unsupervised ML (k-means clustering, see js/clustering.js) — groups students into
// learning-profile clusters based on their 4-subject score vector. Clearly labeled as clustering,
// not a trained/predictive model — see README for an honest breakdown of what's ML here vs. the
// rule-based weighted scoring used elsewhere.
function clusteringPanelHtml(students) {
  if (students.length < 3) {
    return `
      <div class="card" style="margin-bottom:1.5rem;">
        <div class="card-header"><span class="card-header-icon">🤖</span><h3>AI Student Clustering (k-means)</h3></div>
        <div class="card-body"><div class="empty-state">Need at least 3 students in the current filter to run clustering.</div></div>
      </div>`;
  }
  const withScores = students.map(s => {
    const subj = studentSubjectScore(s.id);
    const subjectPct = {}; subj.subjects.forEach(x => subjectPct[x.subject] = x.pct);
    return { id: s.id, name: s.name, standard: s.standard, subjectPct };
  });
  const result = clusterStudents(withScores, 3);
  if (!result) return "";

  return `
    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-header"><span class="card-header-icon">🤖</span><h3>AI Student Clustering (k-means, unsupervised ML)</h3></div>
      <div class="card-body">
        <p style="font-size:12px;color:var(--ink-muted);margin-bottom:14px;">
          Groups students by their Science/Maths/English/Computer score pattern — no labels given, the
          algorithm finds the groupings itself. This is genuine machine learning (unsupervised clustering),
          distinct from the rule-based scoring used for individual gap detection.
        </p>
        ${result.clusters.map(c => `
          <div style="border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-weight:600;font-size:13px;color:${c.color}">${c.label}</span>
              <span class="tag">${c.members.length} student${c.members.length===1?"":"s"}</span>
            </div>
            <div style="font-size:11.5px;color:var(--ink-muted);margin-bottom:8px;">
              Cluster average — ${result.subjects.map((subj, i) => `${subj}: ${Math.round(c.centroid[i])}%`).join(" · ")}
            </div>
            <div style="font-size:12px;color:var(--ink-soft);">${c.members.map(m => `${m.name} (Std ${m.standard})`).join(", ")}</div>
          </div>`).join("")}
      </div>
    </div>`;
}

function studentRowHtml(s) {
  const sc = studentSubjectScore(s.id);
  const pct = sc.overallPct;
  const badge = statusBadge(pct);
  const c = avatarColor(s.id);
  return `<tr>
    <td><div class="stu-name-cell">
      <div class="stu-avatar" style="background:${c.bg};color:${c.fg}">${initials(s.name)}</div>
      <div><div class="stu-name">${s.name}</div><div class="stu-roll">ID ${s.id.slice(0,8).toUpperCase()} · Age ${s.age || "—"} · <span class="badge ${s.area==='Rural'?'badge-rural':'badge-urban'}" style="padding:1px 6px;">${s.area||"—"}</span></div></div>
    </div></td>
    <td><span class="badge ${stdBadgeClass(s.standard)}">${s.standard}th</span></td>
    <td><div class="score-pill"><span>${pct}%</span><span class="mini-bar"><span class="mini-bar-fill" style="width:${pct}%;background:${pctColor(pct)}"></span></span></div></td>
    <td><span class="badge ${badge.cls}">${badge.label}</span></td>
  </tr>`;
}

// ================= STUDENTS TAB =================
function renderStudents() {
  const list = visibleStudents();
  pageBody.innerHTML = `
    ${filterBarHtml()}
    <div class="card">
      <div class="card-header"><span class="card-header-icon">👩‍🎓</span><h3>All students</h3><span style="font-size:11px;color:var(--ink-muted)">${list.length} shown</span></div>
      <div style="padding:0 0.75rem;">
        <table class="student-table">
          <thead><tr><th>Student</th><th>Std</th><th>Score</th><th>Status</th></tr></thead>
          <tbody>${list.length ? list.map(s => studentRowHtml(s)).join("") : `<tr><td colspan="4" class="empty-state">No matching students.</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
  wireFilterBar();
}

// ================= QUESTION BANK TAB =================
function renderQuestions() {
  const qs = adminState.questions.filter(q => q.standard === adminState.qbankStandard);
  pageBody.innerHTML = `
    <div class="filters">
      <select id="qbStandard">
        <option value="8" ${adminState.qbankStandard==="8"?"selected":""}>8th Standard</option>
        <option value="9" ${adminState.qbankStandard==="9"?"selected":""}>9th Standard</option>
        <option value="10" ${adminState.qbankStandard==="10"?"selected":""}>10th Standard</option>
      </select>
    </div>

    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-header"><span class="card-header-icon">➕</span><h3>Add a new question</h3></div>
      <div class="card-body">
        <div class="form-row"><label>Type</label>
          <select id="newType">
            <option value="mcq">Knowledge MCQ — single answer (scored)</option>
            <option value="mcq_multi">Knowledge MCQ — multiple correct answers (scored)</option>
            <option value="likert">Behaviour (1-5 scale)</option>
            <option value="mcq_behaviour">Multiple Choice (behaviour)</option>
            <option value="ai_readiness">AI Readiness (choice)</option>
            <option value="text">Open Text</option>
          </select>
        </div>
        <div id="mcqFields">
          <div class="form-row"><label>Subject</label>
            <select id="newSubject"><option>Science</option><option>Maths</option><option>English</option><option>Computer</option></select>
          </div>
          <div class="form-row"><label>Concept (e.g. Photosynthesis)</label><input id="newConcept"></div>
          <div class="form-row"><label>Chapter</label><input id="newChapter"></div>
          <div class="form-row"><label>Difficulty</label>
            <select id="newDifficulty"><option value="basic">Basic</option><option value="medium">Medium</option><option value="hard">Hard</option></select>
          </div>
        </div>
        <div class="form-row"><label>Question (English)</label><textarea id="newQEn"></textarea></div>
        <div class="form-row"><label>Question (Hindi) — optional</label><textarea id="newQHi"></textarea></div>
        <div class="form-row"><label>Question (Marathi) — optional</label><textarea id="newQMr"></textarea></div>
        <div class="form-row" id="optionsRow"><label>Options (comma-separated)</label><input id="newOptions" placeholder="Force, Pressure, Heat, Motion"></div>
        <div class="form-row" id="correctRow"><label>Correct Answer (must match one option exactly)</label><input id="newCorrect"></div>
        <div class="form-row" id="correctMultiRow"><label>Correct Answers (comma-separated, must match options exactly)</label><input id="newCorrectMulti" placeholder="Force, Pressure"></div>
        <button class="btn btn-primary" id="addQBtn">Add to Standard ${adminState.qbankStandard}</button>
        <span id="addQMsg" style="margin-left:10px;font-size:12px;"></span>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-header-icon">🗂️</span><h3>Existing questions — Standard ${adminState.qbankStandard} (${qs.length})</h3></div>
      <div class="card-body">
        ${qs.length ? qs.map(q => qbankRow(q)).join("") : `<div class="empty-state">No questions yet — run seed.html or add one above.</div>`}
      </div>
    </div>`;

  document.getElementById("qbStandard").onchange = (e) => { adminState.qbankStandard = e.target.value; renderQuestions(); };
  document.getElementById("newType").onchange = toggleQFields;
  toggleQFields();
  document.getElementById("addQBtn").onclick = addQuestion;
  qs.forEach(q => {
    const delBtn = document.getElementById("del_" + q.id); if (delBtn) delBtn.onclick = () => deleteQuestion(q.id);
    const editBtn = document.getElementById("edit_" + q.id); if (editBtn) editBtn.onclick = () => { adminState.editingId = q.id; renderQuestions(); };
    const saveBtn = document.getElementById("save_" + q.id); if (saveBtn) saveBtn.onclick = () => saveQuestionEdit(q);
    const cancelBtn = document.getElementById("cancel_" + q.id); if (cancelBtn) cancelBtn.onclick = () => { adminState.editingId = null; renderQuestions(); };
  });
}

async function saveQuestionEdit(q) {
  const g = (id) => document.getElementById(id + "_" + q.id);
  const newType = g("ed_type").value;
  const isMcqLike = newType === "mcq" || newType === "mcq_multi";
  const optionsRaw = g("ed_options").value.trim();
  const options = optionsRaw ? optionsRaw.split(",").map(s => s.trim()).filter(Boolean) : null;

  const update = {
    type: newType,
    question_en: g("ed_qEn").value.trim(),
    question_hi: g("ed_qHi").value.trim() || null,
    question_mr: g("ed_qMr").value.trim() || null,
    options: options ? JSON.stringify(options) : null,
    subject: isMcqLike ? (g("ed_subject").value || null) : null,
    concept: isMcqLike ? (g("ed_concept").value.trim() || null) : null,
    chapter: g("ed_chapter").value.trim() || null,
    difficulty: isMcqLike ? (g("ed_difficulty").value || null) : null,
    correct_answer: newType === "mcq" ? g("ed_correct").value.trim() : null,
    correct_answers: null
  };
  if (newType === "mcq_multi") {
    const raw = g("ed_correctMulti").value.trim();
    update.correct_answers = raw ? JSON.stringify(raw.split(",").map(s => s.trim()).filter(Boolean)) : null;
  }

  const { error } = await supabaseClient.from("questions").update(update).eq("id", q.id);
  if (error) { alert("Could not save: " + error.message); return; }
  adminState.editingId = null;
  await loadAll();
  renderQuestions();
}

function toggleQFields() {
  const type = document.getElementById("newType").value;
  const isMcqLike = type === "mcq" || type === "mcq_multi";
  document.getElementById("mcqFields").style.display = isMcqLike ? "block" : "none";
  document.getElementById("optionsRow").style.display = (isMcqLike || type === "mcq_behaviour" || type === "ai_readiness") ? "block" : "none";
  document.getElementById("correctRow").style.display = type === "mcq" ? "block" : "none";
  document.getElementById("correctMultiRow").style.display = type === "mcq_multi" ? "block" : "none";
}

function qbankRow(q) {
  let opts = [];
  try { opts = typeof q.options === "string" ? JSON.parse(q.options) : (q.options || []); } catch (e) {}
  let correctAnswers = [];
  try { correctAnswers = typeof q.correct_answers === "string" ? JSON.parse(q.correct_answers) : (q.correct_answers || []); } catch (e) {}

  if (adminState.editingId === q.id) {
    return `
      <div class="qbank-row" style="flex-direction:column;align-items:stretch;background:var(--surface-2);border-radius:var(--radius);padding:14px;margin-bottom:10px;">
        <div class="form-row"><label>Type</label>
          <select id="ed_type_${q.id}">
            <option value="mcq" ${q.type==="mcq"?"selected":""}>Knowledge MCQ — single answer (scored)</option>
            <option value="mcq_multi" ${q.type==="mcq_multi"?"selected":""}>Knowledge MCQ — multiple correct answers (scored)</option>
            <option value="likert" ${q.type==="likert"?"selected":""}>Behaviour (1-5 scale)</option>
            <option value="mcq_behaviour" ${q.type==="mcq_behaviour"?"selected":""}>Multiple Choice (behaviour)</option>
            <option value="ai_readiness" ${q.type==="ai_readiness"?"selected":""}>AI Readiness (choice)</option>
            <option value="text" ${q.type==="text"?"selected":""}>Open Text</option>
          </select>
        </div>
        <div class="form-row"><label>Question (English)</label><textarea id="ed_qEn_${q.id}">${q.question_en || ""}</textarea></div>
        <div class="form-row"><label>Question (Hindi)</label><textarea id="ed_qHi_${q.id}">${q.question_hi || ""}</textarea></div>
        <div class="form-row"><label>Question (Marathi)</label><textarea id="ed_qMr_${q.id}">${q.question_mr || ""}</textarea></div>
        <div class="form-row"><label>Subject (only used for Knowledge MCQ types)</label>
          <select id="ed_subject_${q.id}">
            <option value="" ${!q.subject?"selected":""}>—</option>
            <option ${q.subject==="Science"?"selected":""}>Science</option>
            <option ${q.subject==="Maths"?"selected":""}>Maths</option>
            <option ${q.subject==="English"?"selected":""}>English</option>
            <option ${q.subject==="Computer"?"selected":""}>Computer</option>
          </select>
        </div>
        <div class="form-row"><label>Concept (only used for Knowledge MCQ types)</label><input id="ed_concept_${q.id}" value="${q.concept || ""}"></div>
        <div class="form-row"><label>Chapter</label><input id="ed_chapter_${q.id}" value="${q.chapter || ""}"></div>
        <div class="form-row"><label>Difficulty (only used for Knowledge MCQ types)</label>
          <select id="ed_difficulty_${q.id}">
            <option value="" ${!q.difficulty?"selected":""}>—</option>
            <option value="basic" ${q.difficulty==="basic"?"selected":""}>Basic</option>
            <option value="medium" ${q.difficulty==="medium"?"selected":""}>Medium</option>
            <option value="hard" ${q.difficulty==="hard"?"selected":""}>Hard</option>
          </select>
        </div>
        <div class="form-row"><label>Options (comma-separated — used by all choice-based types)</label><input id="ed_options_${q.id}" value="${opts.join(", ")}"></div>
        <div class="form-row"><label>Correct Answer (only for single-answer MCQ — must match one option exactly)</label><input id="ed_correct_${q.id}" value="${q.correct_answer || ""}"></div>
        <div class="form-row"><label>Correct Answers (only for multi-select MCQ — comma-separated, must match options exactly)</label><input id="ed_correctMulti_${q.id}" value="${correctAnswers.join(", ")}"></div>
        <div style="display:flex;gap:8px;margin-top:4px;">
          <button class="btn btn-primary" id="save_${q.id}">Save</button>
          <button class="btn" style="background:var(--surface);border:1px solid var(--border);" id="cancel_${q.id}">Cancel</button>
        </div>
      </div>`;
  }

  return `
    <div class="qbank-row">
      <div>
        <div style="font-size:13px;font-weight:500;">${q.question_en}</div>
        <div class="meta">
          <span class="tag">${q.type}</span>
          ${q.subject ? `<span class="tag">${q.subject}</span>` : ""}
          ${q.concept ? `<span class="tag">${q.concept}</span>` : ""}
          ${q.difficulty ? `<span class="tag">${q.difficulty}</span>` : ""}
          ${opts.length ? ` Options: ${opts.join(" / ")}` : ""}
          ${q.correct_answer ? ` — Correct: ${q.correct_answer}` : ""}
          ${correctAnswers.length ? ` — Correct: ${correctAnswers.join(", ")}` : ""}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="btn" style="background:var(--surface-2);" id="edit_${q.id}">Edit</button>
        <button class="btn btn-danger" id="del_${q.id}">Delete</button>
      </div>
    </div>`;
}

async function addQuestion() {
  const type = document.getElementById("newType").value;
  const question_en = document.getElementById("newQEn").value.trim();
  if (!question_en) { document.getElementById("addQMsg").textContent = "Question text (English) is required."; return; }
  const optionsRaw = document.getElementById("newOptions").value.trim();
  const options = optionsRaw ? optionsRaw.split(",").map(s => s.trim()).filter(Boolean) : null;
  const maxOrder = Math.max(0, ...adminState.questions.filter(q => q.standard === adminState.qbankStandard).map(q => q.order_index || 0));

  const isMcqLike = type === "mcq" || type === "mcq_multi";
  const correctMultiRaw = document.getElementById("newCorrectMulti").value.trim();

  const row = {
    standard: adminState.qbankStandard, type,
    subject: isMcqLike ? document.getElementById("newSubject").value : null,
    concept: isMcqLike ? document.getElementById("newConcept").value.trim() : null,
    chapter: isMcqLike ? document.getElementById("newChapter").value.trim() : null,
    difficulty: isMcqLike ? document.getElementById("newDifficulty").value : null,
    question_en,
    question_hi: document.getElementById("newQHi").value.trim() || null,
    question_mr: document.getElementById("newQMr").value.trim() || null,
    options: options ? JSON.stringify(options) : null,
    correct_answer: type === "mcq" ? document.getElementById("newCorrect").value.trim() : null,
    correct_answers: type === "mcq_multi" && correctMultiRaw ? JSON.stringify(correctMultiRaw.split(",").map(s => s.trim()).filter(Boolean)) : null,
    order_index: maxOrder + 1
  };

  const { error } = await supabaseClient.from("questions").insert([row]);
  document.getElementById("addQMsg").textContent = error ? "Error: " + error.message : "Added ✔";
  if (!error) { await loadAll(); renderQuestions(); }
}

async function deleteQuestion(id) {
  if (!confirm("Delete this question? This cannot be undone.")) return;
  await supabaseClient.from("questions").delete().eq("id", id);
  await loadAll(); renderQuestions();
}

// ================= Realtime =================
function subscribeRealtime() {
  supabaseClient.channel("admin-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "students" }, loadAll)
    .on("postgres_changes", { event: "*", schema: "public", table: "responses" }, loadAll)
    .on("postgres_changes", { event: "*", schema: "public", table: "questions" }, loadAll)
    .subscribe();
}

function initDashboard() {
  loadAll();
  subscribeRealtime();
}

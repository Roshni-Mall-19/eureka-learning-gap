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

// Mobile sidebar toggle (hamburger button — sidebar is translateX(-100%) below 780px)
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const sidebarEl = document.querySelector(".sidebar");
function openSidebar() { sidebarEl.classList.add("open"); sidebarBackdrop.classList.add("show"); }
function closeSidebar() { sidebarEl.classList.remove("open"); sidebarBackdrop.classList.remove("show"); }
if (mobileMenuBtn) mobileMenuBtn.onclick = openSidebar;
if (sidebarBackdrop) sidebarBackdrop.onclick = closeSidebar;
document.querySelectorAll(".nav-item").forEach(a => a.addEventListener("click", closeSidebar));

// ================= Modal (used by clickable stat cards + "View Response") =================
function ensureModalRoot() {
  if (document.getElementById("modalOverlay")) return;
  const div = document.createElement("div");
  div.id = "modalOverlay";
  div.className = "modal-overlay hidden";
  div.innerHTML = `
    <div class="modal-box" id="modalBox">
      <div class="modal-header">
        <h3 id="modalTitle"></h3>
        <button class="modal-close" id="modalCloseBtn" title="Close">&times;</button>
      </div>
      <div class="modal-body" id="modalBody"></div>
    </div>`;
  document.body.appendChild(div);
  div.addEventListener("click", (e) => { if (e.target === div) closeModal(); });
  document.getElementById("modalCloseBtn").onclick = closeModal;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}
function openModal(title, html) {
  ensureModalRoot();
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = html;
  document.getElementById("modalOverlay").classList.remove("hidden");
  document.getElementById("modalBox").scrollTop = 0;
  // Any "View Response" buttons rendered inside a modal (e.g. a student list) should open
  // that student's full response — wired here so it works no matter which modal opened it.
  document.querySelectorAll("#modalBody [data-view-resp]").forEach(b => {
    b.onclick = () => openStudentResponseModal(b.dataset.viewResp);
  });
}
function closeModal() {
  const el = document.getElementById("modalOverlay");
  if (el) el.classList.add("hidden");
}

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

// Wide, "Google Forms style" export — ONE ROW PER STUDENT, one column per question (Q1, Q2, ... Qn),
// in the exact order questions appear in the app. Automatically picks up any question added later
// (no hardcoded question count), since the columns are built fresh from the current question bank.
function buildWideDataRows(students, questions, responses, standard) {
  const qs = questions.filter(q => q.standard === standard).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const respByStudent = {};
  responses.forEach(r => {
    if (!respByStudent[r.student_id]) respByStudent[r.student_id] = {};
    respByStudent[r.student_id][r.question_id] = r;
  });
  return students.filter(s => s.standard === standard).map(s => {
    const row = {
      "Student Name": s.name, "Age": s.age || "", "Gender": s.gender || "", "Class": s.standard,
      "School": s.school_name || "", "Area": s.area || "", "Language Used": s.language_used || "",
      "Submitted At": s.created_at ? new Date(s.created_at).toLocaleString() : ""
    };
    const sResp = respByStudent[s.id] || {};
    qs.forEach((q, idx) => {
      const r = sResp[q.id];
      const label = `Q${idx + 1}: ${(q.question_en || "").slice(0, 60)}`;
      row[label] = r ? (r.answer_value || "") : "";
      if (q.type === "mcq" || q.type === "mcq_multi") {
        row[label + " — Correct?"] = r ? (r.is_correct ? "Yes" : "No") : "";
      }
    });
    return row;
  });
}

function exportExcel() {
  if (typeof XLSX === "undefined") { alert("Excel export library failed to load — check your internet connection and try again."); return; }
  const allStudents = adminState.students;
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildSummaryRows(allStudents)), "Summary (All Students)");

  // Complete data, Google-Forms style: one row per student, every question as its own column (1 to N).
  ["8", "9", "10"].forEach(std => {
    const wideRows = buildWideDataRows(allStudents, adminState.questions, adminState.responses, std);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wideRows.length ? wideRows : [{ Note: "No responses yet for this class" }]), `Std ${std} Complete Data`);
  });

  // Long format (one row per answer) — easier for pivot tables / statistical analysis in Excel.
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
        rows.push({ concept: c.concept, score10: c.score10, standard: s.standard, name: s.name, area: s.area, gender: s.gender, subject: q ? q.subject : null });
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

const MIN_STUDENTS_FOR_INSIGHTS = 10;
const INSUFFICIENT_DATA_MSG = "More assessments are needed before reliable class-level insights can be generated.";

// ================= OVERVIEW (research-focused redesign) =================
function renderOverview() {
  const students = visibleStudents();
  const conceptEntries = allConceptEntries(students);
  const conceptStats = aggregateConceptStats(conceptEntries);
  const enough = students.length >= MIN_STUDENTS_FOR_INSIGHTS;

  // Per-student overall % (plain, unweighted — matches what students themselves see)
  const studentPcts = students.map(s => ({ s, pct: studentSubjectScore(s.id).overallPct }));
  const avgPct = studentPcts.length ? Math.round(studentPcts.reduce((a, x) => a + x.pct, 0) / studentPcts.length) : 0;
  const needingSupport = studentPcts.filter(x => x.pct < 70).length;

  const subjectPerf = computeSubjectPerformance(conceptEntries);
  const topGaps = [...conceptStats].filter(c => c.avgPct < 70).sort((a, b) => a.avgPct - b.avgPct);
  const criticalGaps = topGaps.filter(g => g.avgPct < 40).length;
  document.getElementById("navGapCount").textContent = topGaps.length;
  const strongestSubj = subjectPerf.length ? subjectPerf.reduce((a, b) => a.avgPct > b.avgPct ? a : b) : null;
  const weakestSubj = subjectPerf.length ? subjectPerf.reduce((a, b) => a.avgPct < b.avgPct ? a : b) : null;

  pageBody.innerHTML = `
    ${filterBarHtml()}

    <div class="stats-grid">
      <div class="stat-card blue clickable" id="statTotal">
        <div class="stat-top"><div class="stat-icon blue">👨‍🎓</div></div>
        <div class="stat-num">${students.length}</div>
        <div class="stat-label">Total Students Assessed</div>
        <div class="stat-hint">Click to view all →</div>
      </div>
      <div class="stat-card teal clickable" id="statAvg">
        <div class="stat-top"><div class="stat-icon teal">🎯</div></div>
        <div class="stat-num">${students.length ? avgPct + "%" : "—"}</div>
        <div class="stat-label">Average Assessment Score</div>
        <div class="stat-hint">Click to view all →</div>
      </div>
      ${enough ? `
      <div class="stat-card amber clickable" id="statSupport">
        <div class="stat-top"><div class="stat-icon amber">🤝</div></div>
        <div class="stat-num">${needingSupport}</div>
        <div class="stat-label">Students Needing Support</div>
        <div class="stat-hint">Click to view list →</div>
      </div>
      <div class="stat-card red clickable" id="statCritical">
        <div class="stat-top"><div class="stat-icon red">⚠️</div></div>
        <div class="stat-num">${criticalGaps}</div>
        <div class="stat-label">Critical Learning Gaps</div>
        <div class="stat-hint">Click to view list →</div>
      </div>
      <div class="stat-card teal clickable" id="statStrong">
        <div class="stat-top"><div class="stat-icon teal">💪</div></div>
        <div class="stat-num" style="font-size:20px;">${strongestSubj ? strongestSubj.subject : "—"}</div>
        <div class="stat-label">Strongest Subject</div>
        <div class="stat-hint">Click for details →</div>
      </div>
      <div class="stat-card amber clickable" id="statWeak">
        <div class="stat-top"><div class="stat-icon amber">📌</div></div>
        <div class="stat-num" style="font-size:20px;">${weakestSubj ? weakestSubj.subject : "—"}</div>
        <div class="stat-label">Weakest Subject</div>
        <div class="stat-hint">Click for details →</div>
      </div>` : ""}
    </div>

    ${!enough ? insufficientDataCard(students.length) : `
    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-header"><span class="card-header-icon">📚</span><h3>Subject Performance</h3></div>
      <div class="card-body" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;">
        ${subjectPerf.map(sp => subjectPerfCard(sp)).join("")}
      </div>
    </div>

    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-header"><span class="card-header-icon">🚻</span><h3>Gender-wise Performance</h3></div>
      <div style="padding:0.5rem 0.75rem 1rem;">${demographicTableHtml(groupPerfRows(students, "gender"))}</div>
    </div>

    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-header"><span class="card-header-icon">🏘️</span><h3>Rural vs Urban Performance</h3></div>
      <div style="padding:0.5rem 0.75rem 1rem;">${demographicTableHtml(groupPerfRows(students, "area"))}</div>
    </div>

    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-header"><span class="card-header-icon">🔍</span><h3>Top Learning Gaps</h3></div>
      <div style="padding:0 0.75rem;">
        <table class="student-table">
          <thead><tr><th>Concept</th><th>Subject</th><th>Class</th><th>Students Struggling</th><th>Avg Accuracy</th><th>Severity</th></tr></thead>
          <tbody>
            ${topGaps.length ? topGaps.slice(0, 10).map(g => topGapRow(g)).join("") : `<tr><td colspan="6" class="empty-state">No significant learning gaps detected.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-header"><span class="card-header-icon">🤖</span><h3>AI Learning Gap Analysis</h3></div>
      <div class="card-body">${aiAnalysisHtml(students)}</div>
    </div>

    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-header"><span class="card-header-icon">✅</span><h3>Teacher Recommendations</h3></div>
      <div class="card-body">${teacherRecommendationsHtml(subjectPerf, topGaps, studentPcts)}</div>
    </div>`}

    <div class="bottom-grid">
      <div class="card">
        <div class="card-header"><span class="card-header-icon">👩‍🎓</span><h3>Student List</h3></div>
        <div style="padding:0 0.75rem;">
          <table class="student-table">
            <thead><tr><th>Student</th><th>Standard</th><th>Overall Score</th><th>Weakest Subject</th><th>Status</th></tr></thead>
            <tbody>${students.length ? students.map(s => simpleStudentRow(s)).join("") : `<tr><td colspan="5" class="empty-state">No students yet — collect responses via student.html</td></tr>`}</tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-header-icon">🕒</span><h3>Recent Assessments</h3></div>
        <div style="padding:0 0.75rem;">
          <table class="student-table">
            <thead><tr><th>Student</th><th>Standard</th><th>Overall Score</th><th>Weakest Subject</th></tr></thead>
            <tbody>
              ${[...students].sort((a,b) => new Date(b.created_at)-new Date(a.created_at)).slice(0,6).map(s => recentAssessmentRow(s)).join("") || `<tr><td colspan="4" class="empty-state">No assessments yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  wireFilterBar();
  wireOverviewCards({ students, studentPcts, topGaps, subjectPerf, strongestSubj, weakestSubj });
}

// Wires clicks on the 6 stat cards to open a modal with the underlying data behind that number.
function wireOverviewCards(ctx) {
  const { students, studentPcts, topGaps, subjectPerf, strongestSubj, weakestSubj } = ctx;
  const byId = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };

  byId("statTotal", () => openModal("All Students Assessed", modalStudentTableHtml(students)));

  byId("statAvg", () => {
    const sorted = [...students].sort((a, b) => studentSubjectScore(b.id).overallPct - studentSubjectScore(a.id).overallPct);
    openModal("All Students — Sorted by Score", modalStudentTableHtml(sorted));
  });

  byId("statSupport", () => {
    const list = studentPcts.filter(x => x.pct < 70).map(x => x.s);
    openModal("Students Needing Support (below 70%)", modalStudentTableHtml(list));
  });

  byId("statCritical", () => {
    const rows = topGaps.filter(g => g.avgPct < 40);
    openModal("Critical Learning Gaps (below 40% class average)", criticalGapsModalHtml(rows));
  });

  if (strongestSubj) byId("statStrong", () => openModal(`Strongest Subject — ${strongestSubj.subject}`, subjectDetailModalHtml(strongestSubj, students)));
  if (weakestSubj) byId("statWeak", () => openModal(`Weakest Subject — ${weakestSubj.subject}`, subjectDetailModalHtml(weakestSubj, students)));
}

// Table of students shown inside a modal — each row has a "View Response" button that drills
// into that specific student's full, question-by-question answers.
function modalStudentTableHtml(students) {
  if (!students.length) return `<div class="empty-state">No students found.</div>`;
  return `
    <table class="student-table">
      <thead><tr><th>Student</th><th>Std</th><th>School</th><th>Area</th><th>Gender</th><th>Age</th><th>Score</th><th>Status</th><th></th></tr></thead>
      <tbody>${students.map(s => modalStudentRow(s)).join("")}</tbody>
    </table>`;
}
function modalStudentRow(s) {
  const pct = studentSubjectScore(s.id).overallPct;
  const st = statusFromPct(pct);
  return `<tr>
    <td>${s.name}</td>
    <td><span class="badge ${stdBadgeClass(s.standard)}">${s.standard}th</span></td>
    <td>${s.school_name || "—"}</td>
    <td><span class="badge ${s.area==='Rural'?'badge-rural':'badge-urban'}">${s.area || "—"}</span></td>
    <td>${s.gender || "—"}</td>
    <td>${s.age || "—"}</td>
    <td>${pct}%</td>
    <td><span class="badge ${st.cls}">${st.label}</span></td>
    <td><button class="btn" style="background:var(--surface-2);padding:5px 10px;font-size:11px;" data-view-resp="${s.id}">View Response</button></td>
  </tr>`;
}

function criticalGapsModalHtml(rows) {
  if (!rows.length) return `<div class="empty-state">No critical gaps right now.</div>`;
  return `
    <table class="student-table">
      <thead><tr><th>Concept</th><th>Subject</th><th>Class</th><th>Students Struggling</th><th>Avg Accuracy</th></tr></thead>
      <tbody>${rows.map(g => `<tr><td>${g.concept}</td><td>${g.subject || "—"}</td><td>${g.standard}th</td><td>${g.studentsWrong}/${g.studentsTotal}</td><td>${g.avgPct}%</td></tr>`).join("")}</tbody>
    </table>`;
}

// Concept breakdown for one subject, plus the specific students who are weak in it.
function subjectDetailModalHtml(sp, students) {
  const weakList = sp.weakConcepts.length
    ? `<table class="student-table"><thead><tr><th>Concept</th><th>Avg Accuracy</th></tr></thead><tbody>${sp.weakConcepts.map(c => `<tr><td>${c.concept}</td><td>${c.pct}%</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty-state">No major weak concepts in this subject.</div>`;
  const weakStudents = students.filter(s => {
    const subj = studentSubjectScore(s.id).subjects.find(x => x.subject === sp.subject);
    return subj && subj.pct < 60;
  });
  return `
    <p style="font-size:13px;color:var(--ink-soft);margin-bottom:14px;">Class average in <b>${sp.subject}</b>: <b style="color:${pctColor(sp.avgPct)}">${sp.avgPct}%</b> (${sp.status})</p>
    <div style="font-size:11px;font-weight:600;color:var(--ink-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Concept Breakdown</div>
    ${weakList}
    <div style="font-size:11px;font-weight:600;color:var(--ink-muted);text-transform:uppercase;letter-spacing:0.5px;margin:18px 0 8px;">Students Below 60% in ${sp.subject}</div>
    ${modalStudentTableHtml(weakStudents)}`;
}

// Full question-by-question response viewer for one student — used by every "View Response" button.
function openStudentResponseModal(studentId) {
  const s = adminState.students.find(x => x.id === studentId);
  if (!s) return;
  const resp = adminState.responses.filter(r => r.student_id === studentId);
  const qs = adminState.questions.filter(q => q.standard === s.standard).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const subj = computeSubjectScores(resp, adminState.questions);
  const c = avatarColor(s.id);
  const header = `
    <div class="modal-student-header">
      <div class="stu-avatar" style="background:${c.bg};color:${c.fg};width:44px;height:44px;font-size:15px;">${initials(s.name)}</div>
      <div>
        <div style="font-weight:700;font-size:14px;">${s.name}</div>
        <div style="font-size:11.5px;color:var(--ink-muted);margin-top:2px;">Class ${s.standard}th · ${s.school_name || "—"} · ${s.area || "—"} · ${s.gender || "—"} · Age ${s.age || "—"}</div>
        <div style="font-size:11.5px;color:var(--ink-muted);margin-top:1px;">Submitted ${s.created_at ? new Date(s.created_at).toLocaleString() : "—"} · Language: ${s.language_used || "en"}</div>
        <div style="font-size:12.5px;font-weight:700;margin-top:6px;color:${pctColor(subj.overallPct)};">Overall: ${subj.overallPct}% (${subj.totalCorrect}/${subj.totalQ} correct)</div>
      </div>
    </div>`;
  const body = qs.length
    ? qs.map((q, i) => answerReviewRowAdmin(q, resp.find(r => r.question_id === q.id), i + 1)).join("")
    : `<div class="empty-state">No questions found for this class.</div>`;
  openModal(`Complete Response — ${s.name}`, header + body);
}

function answerReviewRowAdmin(q, r, num) {
  const qText = q.question_en;
  if (!r) {
    return `<div class="answer-review-row"><div class="answer-review-q">Q${num}. ${qText}</div><div class="answer-review-you" style="color:var(--ink-muted);">Not answered</div></div>`;
  }
  if (q.type === "mcq" || q.type === "mcq_multi") {
    let correctText = q.correct_answer || "";
    if (!correctText && q.correct_answers) {
      try { correctText = (typeof q.correct_answers === "string" ? JSON.parse(q.correct_answers) : q.correct_answers).join(", "); } catch (e) {}
    }
    return `<div class="answer-review-row">
      <div class="answer-review-meta">${[q.subject, q.concept, q.difficulty].filter(Boolean).join(" · ")}</div>
      <div class="answer-review-q">Q${num}. ${qText} <span class="badge ${r.is_correct ? "badge-good" : "badge-critical"}" style="margin-left:6px;">${r.is_correct ? "Correct" : "Incorrect"}</span></div>
      <div class="answer-review-you">Answer: ${r.answer_value || "—"}</div>
      ${!r.is_correct ? `<div class="answer-review-correct wrong">Correct answer: ${correctText}</div>` : ""}
    </div>`;
  } else if (q.type === "likert") {
    return `<div class="answer-review-row"><div class="answer-review-q">Q${num}. ${qText}</div><div class="answer-review-you">Rating: ${r.answer_value}/5</div></div>`;
  } else {
    return `<div class="answer-review-row"><div class="answer-review-q">Q${num}. ${qText}</div><div class="answer-review-you">${r.answer_value || "—"}</div></div>`;
  }
}

function insufficientDataCard(n) {
  return `
    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-body" style="text-align:center;padding:2.5rem 1.5rem;">
        <div style="font-size:32px;margin-bottom:10px;">📊</div>
        <p style="font-size:14px;color:var(--ink-soft);font-weight:600;max-width:420px;margin:0 auto;">${INSUFFICIENT_DATA_MSG}</p>
        <p style="font-size:12px;color:var(--ink-muted);margin-top:8px;">${n} of ${MIN_STUDENTS_FOR_INSIGHTS} students assessed so far.</p>
      </div>
    </div>`;
}

// One row per subject: average %, status, and only the genuinely weak concepts (never 0-data ones)
function computeSubjectPerformance(conceptEntries) {
  const bySubject = {};
  conceptEntries.forEach(e => {
    if (!e.subject) return;
    if (!bySubject[e.subject]) bySubject[e.subject] = { sum: 0, n: 0, concepts: {} };
    bySubject[e.subject].sum += e.score10; bySubject[e.subject].n += 1;
    if (!bySubject[e.subject].concepts[e.concept]) bySubject[e.subject].concepts[e.concept] = { sum: 0, n: 0 };
    bySubject[e.subject].concepts[e.concept].sum += e.score10;
    bySubject[e.subject].concepts[e.concept].n += 1;
  });
  return ["Science", "Maths", "English", "Computer"].filter(s => bySubject[s]).map(subject => {
    const s = bySubject[subject];
    const avgPct = Math.round((s.sum / s.n) * 10);
    const weakConcepts = Object.keys(s.concepts)
      .map(c => ({ concept: c, pct: Math.round((s.concepts[c].sum / s.concepts[c].n) * 10) }))
      .filter(c => c.pct < 70)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 3);
    const status = avgPct >= 70 ? "Good" : avgPct >= 40 ? "Moderate" : "Critical";
    return { subject, avgPct, weakConcepts, status };
  });
}

// Groups students by a demographic field ("gender" or "area") and computes overall + per-subject
// average % for each group — used for the Gender-wise / Rural vs Urban performance cards.
function groupPerfRows(students, groupField) {
  const values = groupField === "gender" ? ["Male", "Female"] : ["Rural", "Urban"];
  return values
    .map(v => students.filter(s => s[groupField] === v))
    .filter(group => group.length)
    .map(group => {
      const key = group[0][groupField];
      const pcts = group.map(s => studentSubjectScore(s.id).overallPct);
      const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
      const entries = allConceptEntries(group);
      const bySubj = {};
      computeSubjectPerformance(entries).forEach(sp => { bySubj[sp.subject] = sp.avgPct; });
      return { key, count: group.length, avg, bySubj };
    });
}

function demographicTableHtml(rows) {
  const subjects = ["Science", "Maths", "English", "Computer"];
  if (!rows.length) return `<div class="empty-state">Not enough data for this breakdown yet.</div>`;
  return `
    <table class="student-table">
      <thead><tr><th>Group</th><th>Students</th><th>Avg Score</th>${subjects.map(s => `<th>${s}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td>${r.key}</td>
          <td>${r.count}</td>
          <td><span style="font-weight:700;color:${pctColor(r.avg)}">${r.avg}%</span></td>
          ${subjects.map(s => `<td>${r.bySubj[s] !== undefined ? r.bySubj[s] + "%" : "—"}</td>`).join("")}
        </tr>`).join("")}
      </tbody>
    </table>`;
}

function subjectPerfCard(sp) {
  const color = sp.status === "Good" ? "#2E9E5B" : sp.status === "Moderate" ? "#E08A1A" : "#D63B3B";
  const badgeCls = sp.status === "Good" ? "badge-good" : sp.status === "Moderate" ? "badge-needs" : "badge-critical";
  return `
    <div style="border:1px solid var(--border);border-radius:var(--radius);padding:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-weight:600;font-size:14px;">${sp.subject}</span>
        <span class="badge ${badgeCls}">${sp.status}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--ink-muted);margin-bottom:4px;">
        <span>Average</span><span style="font-weight:600;color:${color}">${sp.avgPct}%</span>
      </div>
      <div class="topic-bar-wrap" style="margin-bottom:12px;"><div class="topic-bar-fill" style="width:${sp.avgPct}%;background:${color};"></div></div>
      ${sp.weakConcepts.length ? `
        <div style="font-size:11px;color:var(--ink-muted);font-weight:600;margin-bottom:4px;">TOP WEAK CONCEPTS</div>
        ${sp.weakConcepts.map(c => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;"><span>${c.concept}</span><span style="color:var(--ink-muted)">${c.pct}%</span></div>`).join("")}
      ` : `<div style="font-size:12px;color:var(--green);">No major weak concepts</div>`}
    </div>`;
}

function topGapRow(g) {
  const sev = g.avgPct < 40 ? { label: "High", cls: "badge-critical" } : g.avgPct < 60 ? { label: "Medium", cls: "badge-needs" } : { label: "Low", cls: "badge-good" };
  return `<tr>
    <td>${g.concept}</td><td>${g.subject || "—"}</td><td>${g.standard}th</td>
    <td>${g.studentsWrong}/${g.studentsTotal}</td><td>${g.avgPct}%</td>
    <td><span class="badge ${sev.cls}">${sev.label}</span></td>
  </tr>`;
}

// Natural-language description of each AI-clustered group (not raw cluster centroids)
function aiAnalysisHtml(students) {
  if (students.length < 3) return `<div class="empty-state">Need at least 3 students to detect learning-profile groups.</div>`;
  const withScores = students.map(s => {
    const subj = studentSubjectScore(s.id);
    const subjectPct = {}; subj.subjects.forEach(x => subjectPct[x.subject] = x.pct);
    return { id: s.id, name: s.name, standard: s.standard, subjectPct };
  });
  const result = clusterStudents(withScores, 3);
  if (!result) return `<div class="empty-state">Not enough data yet.</div>`;

  return result.clusters.map((c, i) => {
    const vals = result.subjects.map((subj, idx) => ({ subject: subj, val: c.centroid[idx] }));
    const strong = vals.reduce((a, b) => a.val > b.val ? a : b);
    const weak = vals.reduce((a, b) => a.val < b.val ? a : b);
    const rec = weak.subject === "Science" ? "Conduct science concept revision sessions."
      : weak.subject === "Maths" ? "Assign extra Maths practice worksheets."
      : weak.subject === "English" ? "Focus on grammar/vocabulary practice."
      : "Schedule hands-on programming/computer practice.";
    return `
      <div style="border-left:3px solid var(--blue);padding:10px 16px;margin-bottom:14px;background:var(--surface-2);border-radius:0 8px 8px 0;">
        <div style="font-weight:700;font-size:13px;margin-bottom:6px;">Group ${i+1} <span class="tag">${c.members.length} student${c.members.length===1?"":"s"}</span></div>
        <div style="font-size:12.5px;color:var(--ink-soft);">Strong in <b>${strong.subject}</b> (${Math.round(strong.val)}%) · Weak in <b>${weak.subject}</b> (${Math.round(weak.val)}%)</div>
        <div style="font-size:12.5px;color:var(--blue-dark);margin-top:4px;">Recommendation: ${rec}</div>
      </div>`;
  }).join("");
}

function teacherRecommendationsHtml(subjectPerf, topGaps, studentPcts) {
  const recs = [];
  const criticalSubjects = subjectPerf.filter(s => s.status === "Critical");
  criticalSubjects.forEach(s => recs.push(`Conduct a remedial session for <b>${s.subject}</b> — class average is only ${s.avgPct}%.`));
  if (topGaps.length) {
    const names = topGaps.slice(0, 3).map(g => g.concept).join(", ");
    recs.push(`Revise these specific weak concepts across the class: <b>${names}</b>.`);
    recs.push(`Assign targeted practice worksheets for concepts scoring below 70% class average.`);
  }
  const spread = studentPcts.length ? Math.max(...studentPcts.map(x=>x.pct)) - Math.min(...studentPcts.map(x=>x.pct)) : 0;
  if (spread > 40) recs.push(`Scores vary widely across students — consider pairing stronger and weaker learners for peer learning.`);
  const scienceOrComputer = subjectPerf.find(s => (s.subject === "Science" || s.subject === "Computer") && s.status !== "Good");
  if (scienceOrComputer) recs.push(`Encourage activity-based / hands-on learning for ${scienceOrComputer.subject}.`);
  if (!recs.length) recs.push(`Class is performing well overall — continue current teaching approach and monitor future assessments.`);
  return `<ul style="margin:0;padding-left:20px;font-size:13px;line-height:2;color:var(--ink-soft);">${recs.map(r => `<li>${r}</li>`).join("")}</ul>`;
}

function statusFromPct(pct) {
  return pct >= 70 ? { label: "Good", cls: "badge-good" } : pct >= 40 ? { label: "Needs Support", cls: "badge-needs" } : { label: "Critical", cls: "badge-critical" };
}

function weakestSubjectFor(studentId) {
  const subj = studentSubjectScore(studentId).subjects;
  if (!subj.length) return "—";
  return subj.reduce((a, b) => a.pct < b.pct ? a : b).subject;
}

function simpleStudentRow(s) {
  const pct = studentSubjectScore(s.id).overallPct;
  const st = statusFromPct(pct);
  const c = avatarColor(s.id);
  return `<tr>
    <td><div class="stu-name-cell"><div class="stu-avatar" style="background:${c.bg};color:${c.fg}">${initials(s.name)}</div><div class="stu-name">${s.name}</div></div></td>
    <td><span class="badge ${stdBadgeClass(s.standard)}">${s.standard}th</span></td>
    <td>${pct}%</td>
    <td>${weakestSubjectFor(s.id)}</td>
    <td><span class="badge ${st.cls}">${st.label}</span></td>
  </tr>`;
}

function recentAssessmentRow(s) {
  const pct = studentSubjectScore(s.id).overallPct;
  return `<tr>
    <td>${s.name}</td><td>${s.standard}th</td><td>${pct}%</td><td>${weakestSubjectFor(s.id)}</td>
  </tr>`;
}


function studentRowHtml(s) {
  const sc = studentSubjectScore(s.id);
  const pct = sc.overallPct;
  const badge = statusBadge(pct);
  const c = avatarColor(s.id);
  return `<tr>
    <td><div class="stu-name-cell">
      <div class="stu-avatar" style="background:${c.bg};color:${c.fg}">${initials(s.name)}</div>
      <div><div class="stu-name">${s.name}</div><div class="stu-roll">ID ${s.id.slice(0,8).toUpperCase()} · Age ${s.age || "—"} · ${s.gender || "—"} · <span class="badge ${s.area==='Rural'?'badge-rural':'badge-urban'}" style="padding:1px 6px;">${s.area||"—"}</span></div></div>
    </div></td>
    <td><span class="badge ${stdBadgeClass(s.standard)}">${s.standard}th</span></td>
    <td><div class="score-pill"><span>${pct}%</span><span class="mini-bar"><span class="mini-bar-fill" style="width:${pct}%;background:${pctColor(pct)}"></span></span></div></td>
    <td><span class="badge ${badge.cls}">${badge.label}</span></td>
    <td><button class="btn" style="background:var(--surface-2);padding:5px 10px;font-size:11px;" data-view-resp="${s.id}">View Response</button></td>
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
          <thead><tr><th>Student</th><th>Std</th><th>Score</th><th>Status</th><th></th></tr></thead>
          <tbody>${list.length ? list.map(s => studentRowHtml(s)).join("") : `<tr><td colspan="5" class="empty-state">No matching students.</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
  wireFilterBar();
  document.querySelectorAll("[data-view-resp]").forEach(b => { b.onclick = () => openStudentResponseModal(b.dataset.viewResp); });
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

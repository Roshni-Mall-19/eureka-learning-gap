// AI Scoring Layer — concept-wise gap detection
// Weighting: harder correct answers count for more (they signal deeper understanding)
const DIFFICULTY_WEIGHT = { basic: 1, medium: 1.5, hard: 2 };

/**
 * responses: array of { question_id, answer_value, is_correct }
 * questions: array of question objects (from DB) with concept, difficulty, type
 * Returns: { conceptScores: [{concept, score10, weak, attempted}], overallScore10, confidenceIndex10 }
 */
function computeScores(responses, questions) {
  const qMap = {};
  questions.forEach(q => { qMap[q.id] = q; });

  const conceptTotals = {}; // concept -> {earned, possible}
  let likertSum = 0, likertCount = 0;

  responses.forEach(r => {
    const q = qMap[r.question_id];
    if (!q) return;
    if (q.type === "mcq" || q.type === "mcq_multi") {
      const w = DIFFICULTY_WEIGHT[q.difficulty] || 1;
      if (!conceptTotals[q.concept]) conceptTotals[q.concept] = { earned: 0, possible: 0 };
      conceptTotals[q.concept].possible += w;
      if (r.is_correct) conceptTotals[q.concept].earned += w;
    } else if (q.type === "likert") {
      likertSum += Number(r.answer_value) || 0;
      likertCount += 1;
    }
  });

  const conceptScores = Object.keys(conceptTotals).map(concept => {
    const t = conceptTotals[concept];
    const score10 = t.possible > 0 ? Math.round((t.earned / t.possible) * 100) / 10 : 0;
    return { concept, score10, weak: score10 < 5, attempted: t.possible > 0 };
  }).sort((a, b) => a.score10 - b.score10);

  const overallScore10 = conceptScores.length
    ? Math.round((conceptScores.reduce((s, c) => s + c.score10, 0) / conceptScores.length) * 10) / 10
    : 0;

  const confidenceIndex10 = likertCount ? Math.round((likertSum / likertCount) * 2 * 10) / 10 : 0;

  return { conceptScores, overallScore10, confidenceIndex10 };
}

/**
 * Subject-level scoring — used on the STUDENT result screen.
 * Each subject has ~5 questions answered, so a percentage here is statistically
 * meaningful (unlike per-concept scores, which are based on just 1 question each
 * and would misleadingly show 100% or 0%).
 * Returns: { subjects: [{subject, score10, correct, total, weakConcepts}], overallScore10 }
 */
function computeSubjectScores(responses, questions) {
  const qMap = {};
  questions.forEach(q => { qMap[q.id] = q; });

  const bySubject = {};
  responses.forEach(r => {
    const q = qMap[r.question_id];
    if (!q || (q.type !== "mcq" && q.type !== "mcq_multi")) return;
    const subj = q.subject || "Other";
    if (!bySubject[subj]) bySubject[subj] = { earned: 0, possible: 0, correct: 0, total: 0, weakConcepts: [] };
    const w = DIFFICULTY_WEIGHT[q.difficulty] || 1;
    bySubject[subj].possible += w;
    bySubject[subj].total += 1;
    if (r.is_correct) { bySubject[subj].earned += w; bySubject[subj].correct += 1; }
    else { bySubject[subj].weakConcepts.push(q.concept); }
  });

  const subjects = Object.keys(bySubject).map(subj => {
    const s = bySubject[subj];
    const score10 = s.possible > 0 ? Math.round((s.earned / s.possible) * 100) / 10 : 0; // difficulty-weighted (for research/admin use)
    const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0; // plain % correct (for student-facing display)
    return { subject: subj, score10, pct, correct: s.correct, total: s.total, weakConcepts: s.weakConcepts };
  }).sort((a, b) => a.pct - b.pct);

  const totalCorrect = subjects.reduce((a, s) => a + s.correct, 0);
  const totalQ = subjects.reduce((a, s) => a + s.total, 0);
  const overallPct = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;
  const overallScore10 = subjects.length
    ? Math.round((subjects.reduce((s, c) => s + c.score10, 0) / subjects.length) * 10) / 10
    : 0;

  return { subjects, overallScore10, overallPct, totalCorrect, totalQ };
}

// One consolidated recommendation per weak SUBJECT, naming the specific weak concepts inside it
// (instead of repeating a near-identical block once per concept).
function recommendationForSubject(subject, weakConcepts, lang) {
  const named = weakConcepts.slice(0, 3).join(lang === "en" ? ", " : ", ");
  const templates = {
    en: (s, l) => `Your ${s} needs more practice${l ? ", especially around " + l : ""}. Watch short explainer videos, redo the textbook examples, and try a few extra practice questions on these topics this week.`,
    hi: (s, l) => `तुम्हें ${s} में और अभ्यास की जरूरत है${l ? ", खासकर " + l + " में" : ""}। इन विषयों पर एक छोटा वीडियो देखो, पाठ्यपुस्तक के उदाहरण फिर से हल करो, और इस हफ्ते कुछ अतिरिक्त सवाल हल करो।`,
    mr: (s, l) => `तुम्हाला ${s} मध्ये अजून सराव हवा आहे${l ? ", विशेषतः " + l + " यावर" : ""}. या विषयांवर एक छोटा व्हिडिओ बघा, पाठ्यपुस्तकातील उदाहरणं पुन्हा सोडवा, आणि या आठवड्यात काही जास्तीचे सराव प्रश्न सोडवा.`
  };
  return (templates[lang] || templates.en)(subject, named);
}

// Recommendation templates — generic pattern per resource type, filled with the concept name
// (kept for backward compatibility / admin-side per-concept notes)
function recommendationFor(concept, lang) {
  const templates = {
    en: (c) => `Your concepts in "${c}" need more practice. Watch a short explainer video, redo the textbook examples, and try 5 extra practice questions on this topic this week.`,
    hi: (c) => `"${c}" में तुम्हें और अभ्यास की जरूरत है। इस पर एक छोटा वीडियो देखो, पाठ्यपुस्तक के उदाहरण फिर से हल करो, और इस हफ्ते 5 अतिरिक्त सवाल हल करो।`,
    mr: (c) => `"${c}" या विषयात अजून सराव हवा आहे. यावर एक छोटा व्हिडिओ बघा, पाठ्यपुस्तकातील उदाहरणं पुन्हा सोडवा, आणि या आठवड्यात 5 जास्तीचे सराव प्रश्न सोडवा.`
  };
  return (templates[lang] || templates.en)(concept);
}

function overallLevel(score10) {
  if (score10 >= 8) return { label: "Strong", color: "#1E8A5F" };
  if (score10 >= 5) return { label: "Developing", color: "#D98A2B" };
  return { label: "Needs Support", color: "#C64B4B" };
}
function overallLevelPct(pct) {
  if (pct >= 80) return { label: "Strong", color: "#1E8A5F" };
  if (pct >= 50) return { label: "Developing", color: "#D98A2B" };
  return { label: "Needs Support", color: "#C64B4B" };
}

if (typeof module !== "undefined") {
  module.exports = { computeScores, computeSubjectScores, recommendationFor, recommendationForSubject, overallLevel, overallLevelPct };
}

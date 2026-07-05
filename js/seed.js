const logEl = document.getElementById("log");
function log(msg) { logEl.textContent += msg + "\n"; }

supabaseClient.auth.getSession().then(({ data: { session } }) => {
  if (!session) {
    document.getElementById("authGate").style.display = "block";
    document.getElementById("seedBtn").disabled = true;
  }
});

function rowsForStandard(standard, bank) {
  const rows = [];
  let order = 0;
  bank.likert.forEach(q => rows.push({
    standard, type: "likert", concept: q.concept, chapter: null, difficulty: null,
    question_en: q.en, question_hi: q.hi, question_mr: q.mr,
    options: null, correct_answer: null, order_index: order++
  }));
  bank.behaviour.forEach(q => rows.push({
    standard, type: "mcq_behaviour", concept: null, chapter: null, difficulty: null,
    question_en: q.en, question_hi: q.hi, question_mr: q.mr,
    options: JSON.stringify(q.options), correct_answer: null, order_index: order++
  }));
  bank.ai.forEach(q => rows.push({
    standard, type: "ai_readiness", concept: null, chapter: null, difficulty: null,
    question_en: q.en, question_hi: q.hi, question_mr: q.mr,
    options: JSON.stringify(q.options), correct_answer: null, order_index: order++
  }));
  bank.mcq.forEach(q => rows.push({
    standard, type: q.type || "mcq", subject: q.subject, concept: q.concept, chapter: q.chapter, difficulty: q.difficulty,
    question_en: q.en, question_hi: q.hi, question_mr: q.mr,
    options: JSON.stringify(q.options),
    correct_answer: q.type === "mcq_multi" ? null : q.answer,
    correct_answers: q.type === "mcq_multi" ? JSON.stringify(q.answers) : null,
    order_index: order++
  }));
  bank.text.forEach(q => rows.push({
    standard, type: "text", concept: null, chapter: null, difficulty: null,
    question_en: q.en, question_hi: q.hi, question_mr: q.mr,
    options: null, correct_answer: null, order_index: order++
  }));
  return rows;
}

document.getElementById("seedBtn").addEventListener("click", async () => {
  document.getElementById("seedBtn").disabled = true;
  log("Starting seed...");
  for (const standard of ["8", "9", "10"]) {
    const { count, error: countErr } = await supabaseClient
      .from("questions").select("id", { count: "exact", head: true }).eq("standard", standard);
    if (countErr) { log(`Error checking standard ${standard}: ${countErr.message}`); continue; }
    if (count > 0) { log(`Standard ${standard}: already has ${count} questions — skipping.`); continue; }

    const rows = rowsForStandard(standard, QUESTION_BANK[standard]);
    const { error } = await supabaseClient.from("questions").insert(rows);
    if (error) log(`Standard ${standard}: FAILED — ${error.message}`);
    else log(`Standard ${standard}: inserted ${rows.length} questions ✔`);
  }
  log("\nDone. Go to student.html to try the questionnaire.");
  document.getElementById("seedBtn").disabled = false;
});

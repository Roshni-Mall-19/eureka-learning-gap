# AI-Based Personalized Learning Gap Detection System
IEEE Eu-Reka 2026 — Technologies for Virtual Education in STEAM

Three screens, one app:
- `index.html` — landing page (choose Student or Researcher)
- `student.html` — the questionnaire kids fill on your phone (English/Hindi/Marathi)
- `admin.html` — your live research dashboard (English only)
- `seed.html` — one-time button to load the ~40-question-per-class Science bank into your database

---
## How data collection works in the field
1. Open `student.html` on your (or a volunteer's) phone.
2. Student picks their language, standard (8th/9th/10th), fills basic details, and answers ~40 questions (5-point agree/disagree scale + MCQs + a few open questions).
3. On submit, they immediately see their own score (1-10), strong/weak concepts, and a personalized recommendation — so the research is also useful to them, not just to you.
4. Their response appears on your `admin.html` dashboard in real time (no refresh needed).

## Adding, editing or removing questions
Go to `admin.html` → **Question Bank** → pick a standard → fill the "Add a New Question" form, or click **Edit**/**Delete** on any existing question. Changes save straight to Supabase and appear for the *next* student who opens `student.html`. The dashboard itself updates instantly for you and any other researcher with the link open, since it's subscribed to realtime changes on the `questions`, `students`, and `responses` tables.

## How the AI scoring works
- Every knowledge question (`mcq`/`mcq_multi`) is tagged with a **subject** (Science/Maths/English/Computer), a **concept**, and a **difficulty** (basic/medium/hard).
- **Student result screen** shows scores **per subject** (5 questions each — a statistically meaningful percentage), not per individual concept. A single concept is only ever tested by 1 question, so showing "10/10" for one correct answer would be misleading — that number only becomes meaningful once averaged across many students, which is what the **admin dashboard's** concept/topic panels do (see `aggregateConceptStats` in `js/admin-app.js`).
- The 1–5 "Learning Behaviour" (Likert) questions measure **self-perceived confidence**. The student result screen shows this side-by-side with their actual subject score — that comparison *is* the learning gap this research is about.
- Subjects scoring below 6/10 trigger one consolidated recommendation (naming the specific weak concepts inside that subject), not one repeated block per concept.
- This logic lives in `js/scoring.js` (`computeSubjectScores` for students, `computeScores`/`aggregateConceptStats` for admin-side aggregation) if you want to explain/adjust it for your paper.

## How much of this is actually "AI"?
Worth being precise about this for a research submission:
- **The scoring/gap-detection (`js/scoring.js`) is a rule-based weighted algorithm** — difficulty-weighted percentages and fixed thresholds (e.g. "<70% = gap"). It's a deterministic diagnostic formula, similar to how a smart quiz-grader works. It is **not** machine learning — there's no model being trained on data.
- **`js/clustering.js` IS genuine machine learning** — it implements k-means, an unsupervised clustering algorithm, to group students into learning-profile clusters purely from their score patterns (no labels given to it). This is what powers the "AI Student Clustering" panel on the dashboard. It's real, but simple and fully explainable — worth describing exactly this way in your paper rather than implying a deep/trained model.
- If your mentor wants a stronger ML claim, the natural next step is a real trained model (e.g. a small classifier trained on more collected data to *predict* which concepts a student is likely to struggle with before they even answer, rather than just measuring after the fact) — that's a good "Future Work" section for your paper, and something we can build once you have enough data.
- Bottom line for the paper: call the system "AI-based" citing the clustering component specifically, and describe the concept scoring as a **rule-based diagnostic layer** feeding into it. That's accurate and still sounds credible to judges — claiming more than this without a trained model is the kind of thing a technical judge will probe on.

## Is all the raw data actually saved?
Yes — every single question a student answers is saved as its own row in the `responses` table (student, question, their exact answer, whether it was correct, timestamp). That's the complete "a-to-z" trail. Computed scores (subject %, overall %, weak concepts) are **not** separately stored — they're recalculated live from those raw responses every time the dashboard loads. This is deliberate: it means today's scoring bug fix automatically corrected all of your historical data the moment you reloaded the dashboard, with nothing to migrate. If you ever want a permanent snapshot of a score (e.g. to freeze it for a specific report date), export it via the Excel button — that file is a fixed point-in-time copy.

## Dashboard features
- **Class + School filters** (top of Dashboard/Students pages): narrow everything — stats, charts, roster — down to one class and/or one school, so rural-school-A data doesn't blend into rural-school-B or into a different class.
- **Search box**: filters the whole dashboard to students matching a name/school.
- **Small-sample warning**: when fewer than 5 students are in the current filtered view, a banner reminds you the percentages are indicative only — avoids over-reading noisy early data (exactly the "6 gaps from 1 student" confusion from testing).
- **Gap severity donut**: now built from the true class-average per concept (not a single student's single right/wrong answer), so Critical/Needs Work/Borderline actually populate correctly as you collect more responses.
- **"Distinct concepts below 70%" stat**: replaces the old raw "gap count," which grew forever as more students were added (since eventually every concept gets answered wrong by *someone*). The new number is capped at the number of concepts that actually exist per class, and is a much better comparison metric.
- **AI Student Clustering panel**: k-means grouping of students into learning profiles (see "How much of this is actually AI?" above).
- **Export Excel**: one workbook, always covering the *complete* dataset regardless of current filters — a "Summary" sheet (one row per student with subject %s) plus separate "Std 8 Responses" / "Std 9 Responses" / "Std 10 Responses" sheets (every single answer, matched to its question text) plus one combined "All Responses" sheet.
- **Question Bank → Edit**: you can change a question's Type (e.g. single-answer MCQ → multi-select) as well as every other field.

## Student-side features
- **Consent screen**: shown right after language selection, before any data is collected — explains this is research (not an exam), answers are private to the teacher/researcher, and nothing is mandatory. Standard practice when minors are involved.
- **Read-aloud (🔊)**: uses the browser's built-in text-to-speech (no external service, works for all 3 languages) — tap it on any screen to have the text read out, useful for students with lower reading confidence.
- **Text size toggle (Aa)**: top-right corner, cycles through 3 sizes app-wide.
- **"My Answers" + Download Report (PDF)**: after finishing, students see every question with their answer, whether it was right, and the correct answer if not — then can download/print the whole result as a PDF (browser's built-in "Save as PDF" via the print dialog) to keep or hand to their school.

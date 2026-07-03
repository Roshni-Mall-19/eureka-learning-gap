# AI-Based Personalized Learning Gap Detection System
IEEE Eu-Reka 2026 — Technologies for Virtual Education in STEAM

Three screens, one app:
- `index.html` — landing page (choose Student or Researcher)
- `student.html` — the questionnaire kids fill on your phone (English/Hindi/Marathi)
- `admin.html` — your live research dashboard (English only)
- `seed.html` — one-time button to load the ~40-question-per-class Science bank into your database

---

## STEP 1 — Create your Supabase project (2 minutes)
1. Go to supabase.com → log in → **New Project**.
2. Pick any name/password/region (closest to India = Singapore or Mumbai). Wait ~2 min for it to spin up.
3. In the left sidebar: **SQL Editor** → **New query** → paste the entire contents of `schema.sql` → **Run**.
4. In the left sidebar: **Project Settings → API**. Copy the **Project URL** and the **anon public key**.

## STEP 2 — Connect the app to your database
Open `js/supabase-client.js` and paste your values:
```js
const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi....";
```
Save the file.

## STEP 3 — Load the question bank
Open `seed.html` in a browser (double-click it, or after deploying, visit `yoursite.com/seed.html`) and click **"Seed Questions Now"**. This loads 42 questions per class (Std 8/9/10, Maharashtra SSC syllabus) into your database:
- 10 Learning Behaviour (1–5 scale), 5 Difficulty diagnostic, 4 AI-readiness, 3 open-text
- 20 knowledge MCQs — **5 each in Science, Maths, English, and Computer/Tech** — including a couple of multiple-select questions (more than one correct option) per class

You only need to do this once.

## STEP 4 — Try it locally (optional, before deploying)
Just double-click `index.html` to open it in a browser. Try the student flow, then check `admin.html` to see the response appear.

## STEP 5 — Deploy so you can share a live link with your mentor

**Recommended — GitHub + Netlify (auto-updates every time you make a change):**

1. **Create a GitHub account** (free) at github.com if you don't have one.
2. **Create a new repository**: click the **+** top-right → **New repository** → name it e.g. `eureka-learning-gap` → keep it Public or Private, doesn't matter → **Create repository**.
3. **Upload your files**: on the new repo's page, click **"uploading an existing file"** → drag in *everything inside* the `eureka-app` folder (not the folder itself — its contents: `index.html`, `admin.html`, `student.html`, `seed.html`, `schema.sql`, `README.md`, the `css` folder, the `js` folder) → scroll down → **Commit changes**.
4. Go to **netlify.com** → sign up free (you can sign up with your GitHub account directly, it's one click) → **Add new site → Import an existing project → Deploy with GitHub** → pick the repo you just created.
5. Leave build settings empty/default (this app needs no build step) → **Deploy site**.
6. Netlify gives you a live link like `https://random-name-123.netlify.app`. Share that — `/student.html` for data collection, `/admin.html` for your dashboard.
7. (Optional) In Netlify → **Site settings → Change site name**, pick a nicer name for the URL.

**From now on, whenever you want to change anything** (add a feature, fix text, tweak design):
1. Go to your GitHub repo → open the file you want to change → click the **pencil (edit) icon** → make your change → **Commit changes**.
2. Netlify detects the change automatically and redeploys within ~30 seconds — same link, no extra steps.

(If you prefer editing on your computer instead of GitHub's website: install GitHub Desktop, clone your repo, edit files locally, then "Commit" and "Push" — same auto-redeploy effect.)

**Alternative — Netlify Drop (no GitHub, but no auto-updates):**
Go to **app.netlify.com/drop** and drag the whole `eureka-app` folder onto the page for an instant link. Fine for a one-time demo, but every future change means dragging the folder again and you may get a *different* link each time — GitHub is the better choice if you expect to keep tweaking things.

---

## How data collection works in the field
1. Open `student.html` on your (or a volunteer's) phone.
2. Student picks their language, standard (8th/9th/10th), fills basic details, and answers ~40 questions (5-point agree/disagree scale + MCQs + a few open questions).
3. On submit, they immediately see their own score (1-10), strong/weak concepts, and a personalized recommendation — so the research is also useful to them, not just to you.
4. Their response appears on your `admin.html` dashboard in real time (no refresh needed).

## Adding, editing or removing questions
Go to `admin.html` → **Question Bank** → pick a standard → fill the "Add a New Question" form, or click **Edit**/**Delete** on any existing question. Changes save straight to Supabase and appear for the *next* student who opens `student.html` (each student loads a fresh copy of the question set when they start). The dashboard itself updates instantly for you and any other researcher with the link open, since it's subscribed to realtime changes on the `questions`, `students`, and `responses` tables.

## How the AI scoring works (for your report)
- Every knowledge question (`mcq`) is tagged with a **concept** (e.g. "Photosynthesis") and a **difficulty** (basic/medium/hard).
- A student's score for a concept = (weighted correct answers) ÷ (weighted total), scaled to 1–10. Harder questions count for more, so it measures depth, not just marks.
- The 1–5 "Learning Behaviour" (Likert) questions measure **self-perceived confidence** — the "I think I know this" side.
- Comparing self-perceived confidence to actual concept scores is your **learning gap** — the exact research variable in your problem statement.
- Concepts scoring below 5/10 trigger a personalized recommendation shown to the student and flagged on the dashboard.
- This logic lives in `js/scoring.js` if you want to explain/adjust the weighting for your paper.

## Admin dashboard login
`admin.html` now asks for a username/password before showing any data:
- **Username:** `admin`
- **Password:** `admin#4`

This is a *basic* gate (kids clicking "I'm the Researcher" by mistake won't see anything) — it is **not real security**, since the password lives in `js/admin-app.js` in plain text and anyone who views the page source can read it. It stops casual access, not a determined person. If you later want real protection (e.g. before sharing the link widely), add Supabase Auth — ask if you'd like help with that.

You can change the username/password anytime by editing the `ADMIN_USER` / `ADMIN_PASS` values near the top of `js/admin-app.js`.

## Notes on security
This is built for a research hackathon (fast to set up, no login for students or admin). The database policies allow anyone with the link to insert/read data. Before sharing the admin link widely, consider adding Supabase Auth to `admin.html` so only you can view it — ask if you'd like help adding that.

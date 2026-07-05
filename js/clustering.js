// ============================================================
// Genuine unsupervised ML: k-means clustering.
// This groups students by their 4-subject score vector (Science%, Maths%, English%, Computer%)
// into learning-profile clusters — this IS a real machine learning technique (unsupervised
// clustering), unlike the rule-based weighted scoring in scoring.js. See README for an honest
// breakdown of what in this app is "AI" vs. a plain algorithm.
// ============================================================

function euclideanDistance(a, b) {
  return Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
}

function kMeans(points, k, maxIter = 25) {
  if (points.length === 0) return { assignments: [], centroids: [] };
  k = Math.min(k, points.length);
  const dims = points[0].length;

  // k-means++ -ish init: pick first centroid randomly, rest as farthest-point spread (deterministic-ish, avoids empty clusters)
  let centroids = [points[Math.floor(Math.random() * points.length)].slice()];
  while (centroids.length < k) {
    let farthest = null, farthestDist = -1;
    points.forEach(p => {
      const minDist = Math.min(...centroids.map(c => euclideanDistance(p, c)));
      if (minDist > farthestDist) { farthestDist = minDist; farthest = p; }
    });
    centroids.push(farthest.slice());
  }

  let assignments = new Array(points.length).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    points.forEach((p, i) => {
      let best = 0, bestDist = Infinity;
      centroids.forEach((c, ci) => {
        const d = euclideanDistance(p, c);
        if (d < bestDist) { bestDist = d; best = ci; }
      });
      if (assignments[i] !== best) changed = true;
      assignments[i] = best;
    });

    const sums = centroids.map(() => new Array(dims).fill(0));
    const counts = new Array(k).fill(0);
    points.forEach((p, i) => {
      const c = assignments[i];
      counts[c]++;
      p.forEach((v, d) => { sums[c][d] += v; });
    });
    centroids = sums.map((s, ci) => counts[ci] > 0 ? s.map(v => v / counts[ci]) : centroids[ci]);
    if (!changed) break;
  }
  return { assignments, centroids };
}

// Turns a centroid's 4 subject-percentage averages into a human-readable profile label
function labelCluster(centroid) {
  const avg = centroid.reduce((a, v) => a + v, 0) / centroid.length;
  const spread = Math.max(...centroid) - Math.min(...centroid);
  if (avg >= 70) return { label: "Strong all-rounder", color: "#1E8A5F" };
  if (spread >= 25) return { label: "Uneven — subject-specific gaps", color: "#E08A1A" };
  if (avg >= 45) return { label: "Developing across subjects", color: "#3B6BF5" };
  return { label: "Needs broad support", color: "#D63B3B" };
}

// students: [{ id, name, standard, subjectPct: {Science, Maths, English, Computer} }]
// Returns null if too few students to cluster meaningfully.
function clusterStudents(students, k = 3) {
  if (students.length < 3) return null;
  const SUBJECTS = ["Science", "Maths", "English", "Computer"];
  const points = students.map(s => SUBJECTS.map(subj => s.subjectPct[subj] ?? 0));
  const { assignments, centroids } = kMeans(points, Math.min(k, students.length));

  const clusters = centroids.map((centroid, ci) => {
    const members = students.filter((_, i) => assignments[i] === ci);
    return { centroid, members, ...labelCluster(centroid) };
  }).filter(c => c.members.length > 0)
    .sort((a, b) => (b.centroid.reduce((x, y) => x + y, 0)) - (a.centroid.reduce((x, y) => x + y, 0)));

  return { clusters, subjects: SUBJECTS };
}

if (typeof module !== "undefined") {
  module.exports = { kMeans, clusterStudents, euclideanDistance };
}

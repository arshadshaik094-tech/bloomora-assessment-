BLOOMRA EMPLOYEE ASSESSMENT PORTAL - LOCAL VERSION (v3)

RUN: open the employee-exam-portal folder in VS Code and use Live Server on index.html (or just open index.html).

LOGIN
Employee: full name + department (dropdown) + password (default 123)
Admin tab: username bloomara, password 000 (change both in Admin > Settings)

ANTI-CHEAT (Admin > Settings to configure)
- Copy/cut/paste, text selection, right-click, drag, print, save, view-source and dev-tools shortcuts are blocked and logged
- Full-screen required; leaving full-screen, switching tab or window = a strike
- Auto-submit after N strikes (default 3); every violation shows in the admin table, detail view and CSV
- Name watermark over the exam deters screenshots/photos
- NOTE: browser-based deterrence only. It cannot stop a phone, a second device or a second person.

EMPLOYEE FEATURES
- Timer (default 15 min, auto-submits), question navigator, mark-for-review
- Progress autosaved: a refresh resumes the exam, timer keeps running
- Shuffled question order, tab-switch counter
- Pass/fail result, time taken, answer review, print/PDF, downloadable result file

ADMIN FEATURES
- Stats: submissions, average, pass rate, highest/lowest, avg time
- Charts: score by department, score distribution; per-question difficulty analysis; top performers
- Search, filter by department/outcome, sortable columns, full answer review per employee
- Allow retake, delete result, settings (pass mark, time limit, shuffle, show answers, passwords)
- Export CSV, Backup JSON, Import/merge (combine results from several computers), Print report

SHARING RESULTS ACROSS COMPUTERS
There is no server, so each browser stores its own results. Employees click "Download result file" and send it
to the admin, who uses Admin > Import / merge (duplicates are skipped automatically).
For live shared results a small backend (e.g. Firebase/Supabase) would be needed.

LIMITATIONS
Not secure authentication: passwords and answer keys are visible in the source files. One-attempt rule can be
bypassed by clearing browser data or switching browser.

# BLOOMRA - Supabase Integration Setup Guide

## Overview
Your BLOOMRA application is now integrated with **Supabase** (PostgreSQL database). This allows:
- ✅ Real-time result sharing across all devices
- ✅ All employees' results visible in admin panel immediately
- ✅ No need to manually import result files
- ✅ Centralized data storage in the cloud

---

## Step 1: Create a Supabase Account

1. Go to [supabase.com](https://supabase.com)
2. Sign up with email or GitHub
3. Create a new project:
   - Project name: `bloomora-assessment` (or your choice)
   - Database password: Create a strong password
   - Region: Choose closest to your location
   - Pricing: Start with Free tier

---

## Step 2: Get Your Supabase Credentials

1. Once project is created, go to **Project Settings** → **API**
2. Copy:
   - **Project URL** (SUPABASE_URL)
   - **Anon Public Key** (SUPABASE_ANON_KEY)

Example URLs look like:
```
SUPABASE_URL: https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Step 3: Create the Database Table

1. In Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. Paste this SQL and run it:

```sql
CREATE TABLE exam_results (
  id TEXT PRIMARY KEY,
  employee_name TEXT NOT NULL,
  employee_key TEXT NOT NULL,
  department TEXT NOT NULL,
  correct_answers INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  percentage INTEGER NOT NULL,
  passed BOOLEAN NOT NULL,
  submitted_at TIMESTAMP NOT NULL,
  duration_seconds INTEGER,
  violations JSONB,
  strikes INTEGER DEFAULT 0,
  auto_submitted BOOLEAN DEFAULT FALSE,
  auto_reason TEXT,
  pass_mark INTEGER,
  answers_data JSONB,
  order_data JSONB,
  retake_allowed BOOLEAN DEFAULT FALSE,
  superseded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_employee_key ON exam_results(employee_key);
CREATE INDEX idx_department ON exam_results(department);
CREATE INDEX idx_submitted_at ON exam_results(submitted_at);
```

---

## Step 4: Configure the Application

1. Open `employee-exam-portal/db.js`
2. Find these lines (around line 4-5):
```javascript
const SUPABASE_URL = "https://your-project.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-key";
```

3. Replace with your actual credentials:
```javascript
const SUPABASE_URL = "https://xxxxxxxxxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
```

---

## Step 5: Test the Integration

1. **Local testing:**
   - Start your local server: `python -m http.server 8000`
   - Open http://localhost:8000
   - Take a test exam
   - Check if results appear in **Admin Console**

2. **Check Supabase:**
   - Go to Supabase dashboard
   - Click **Table Editor**
   - Click `exam_results` table
   - You should see your test results there

---

## Step 6: Deploy to Netlify

1. Push your changes to GitHub:
```bash
git add .
git commit -m "Add Supabase integration for cloud sync"
git push
```

2. In Netlify:
   - Go to your site
   - Settings → Build & Deploy → Environment
   - Add two environment variables:
     - `SUPABASE_URL`: Your Supabase URL
     - `SUPABASE_ANON_KEY`: Your Supabase key
   - Trigger a new deploy

---

## How It Works

### Employee Takes Exam:
1. Employee completes the exam and submits
2. Result is saved to **localStorage** (backup)
3. Result is also sent to **Supabase database**

### Admin Views Results:
1. Admin logs in
2. Application fetches results from:
   - localStorage (if available)
   - Supabase database (if configured)
3. All employee results from all devices appear in real-time

---

## Key Features

✅ **Real-time sync** - No need to import/export files
✅ **Multi-device** - Results from different devices/browsers visible instantly
✅ **Backup** - Results stored in database even if employee closes browser
✅ **Scalable** - Free tier supports thousands of results
✅ **Secure** - Anon key is read-only by default

---

## Troubleshooting

### Results not appearing?
1. Check browser console (F12) for errors
2. Verify Supabase credentials in `db.js`
3. Ensure table was created successfully
4. Check Supabase dashboard → Realtime → All Updates

### "Supabase not initialized"?
1. Check SUPABASE_URL and SUPABASE_ANON_KEY are correct
2. Ensure internet connection is working
3. Check browser console for network errors

### Database connection error?
1. Verify your project is still active in Supabase
2. Check your API keys haven't expired
3. Try creating a new key in Supabase → Settings → API

---

## Important Security Notes

⚠️ **The Anon key is PUBLIC** - This is intentional and safe. It only allows:
- Reading/writing results table
- No access to user data or settings

⚠️ **Enable Row Level Security (RLS)** for production:
1. Go to Supabase → Authentication → Policies
2. Set up policies to restrict who can view/edit results

---

## Optional: Real-time Updates

To see results update in real-time as employees submit:

The `db.js` file includes `subscribeToResults()` function. Add this to `app.js` in `renderAdmin()`:

```javascript
subscribeToResults((payload) => {
  console.log("New result received:", payload);
  renderAdmin(); // Refresh admin page
});
```

---

## Next Steps

- Test with multiple devices
- Configure Row Level Security for production
- Set up automatic backups in Supabase
- Monitor database usage in Supabase dashboard

**Questions?** Check Supabase documentation: https://supabase.com/docs


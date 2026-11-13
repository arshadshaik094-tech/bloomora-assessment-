/* BLOOMRA Database Integration with Supabase */

// Supabase Configuration
// You'll need to replace these with your actual Supabase credentials
const SUPABASE_URL = "https://your-project.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-key";

let supabaseClient = null;

// Initialize Supabase
async function initSupabase() {
  // Import Supabase from CDN
  const { createClient } = supabase;
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("✓ Supabase initialized");
}

// Save exam result to database
async function saveResultToDatabase(result) {
  if (!supabaseClient) {
    console.warn("Supabase not initialized, saving to localStorage only");
    return false;
  }

  try {
    const { data, error } = await supabaseClient
      .from("exam_results")
      .insert([
        {
          id: result.id,
          employee_name: result.employee,
          employee_key: result.employeeKey,
          department: result.department,
          correct_answers: result.correct,
          total_questions: result.total,
          percentage: Math.round(result.correct / result.total * 100),
          passed: result.passed,
          submitted_at: result.submittedAt,
          duration_seconds: result.duration,
          violations: result.violations,
          strikes: result.strikes,
          auto_submitted: result.autoSubmitted,
          auto_reason: result.autoReason,
          pass_mark: result.passMark,
          answers_data: result.answers,
          order_data: result.order
        }
      ]);

    if (error) {
      console.error("Database save error:", error);
      return false;
    }

    console.log("✓ Result saved to database:", data);
    return true;
  } catch (err) {
    console.error("Error saving to database:", err);
    return false;
  }
}

// Fetch all results from database
async function getAllResultsFromDatabase() {
  if (!supabaseClient) return null;

  try {
    const { data, error } = await supabaseClient
      .from("exam_results")
      .select("*")
      .order("submitted_at", { ascending: false });

    if (error) {
      console.error("Database fetch error:", error);
      return null;
    }

    return data;
  } catch (err) {
    console.error("Error fetching from database:", err);
    return null;
  }
}

// Fetch results for specific department
async function getResultsByDepartment(department) {
  if (!supabaseClient) return null;

  try {
    const { data, error } = await supabaseClient
      .from("exam_results")
      .select("*")
      .eq("department", department)
      .order("submitted_at", { ascending: false });

    if (error) {
      console.error("Database fetch error:", error);
      return null;
    }

    return data;
  } catch (err) {
    console.error("Error fetching from database:", err);
    return null;
  }
}

// Update result (e.g., allow retake)
async function updateResultInDatabase(resultId, updates) {
  if (!supabaseClient) return false;

  try {
    const { data, error } = await supabaseClient
      .from("exam_results")
      .update(updates)
      .eq("id", resultId);

    if (error) {
      console.error("Database update error:", error);
      return false;
    }

    console.log("✓ Result updated in database");
    return true;
  } catch (err) {
    console.error("Error updating database:", err);
    return false;
  }
}

// Delete result from database
async function deleteResultFromDatabase(resultId) {
  if (!supabaseClient) return false;

  try {
    const { error } = await supabaseClient
      .from("exam_results")
      .delete()
      .eq("id", resultId);

    if (error) {
      console.error("Database delete error:", error);
      return false;
    }

    console.log("✓ Result deleted from database");
    return true;
  } catch (err) {
    console.error("Error deleting from database:", err);
    return false;
  }
}

// Convert database results to app format
function formatDatabaseResults(dbResults) {
  if (!dbResults) return [];

  return dbResults.map(r => ({
    id: r.id,
    employee: r.employee_name,
    employeeKey: r.employee_key,
    department: r.department,
    correct: r.correct_answers,
    total: r.total_questions,
    submittedAt: r.submitted_at,
    duration: r.duration_seconds,
    violations: r.violations,
    strikes: r.strikes,
    tabSwitches: r.strikes,
    autoSubmitted: r.auto_submitted,
    autoReason: r.auto_reason,
    passMark: r.pass_mark,
    passed: r.passed,
    answers: r.answers_data,
    order: r.order_data
  }));
}

// Listen to real-time changes (optional)
function subscribeToResults(callback) {
  if (!supabaseClient) return null;

  const subscription = supabaseClient
    .channel("exam_results_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "exam_results" },
      (payload) => {
        console.log("Database change detected:", payload);
        callback(payload);
      }
    )
    .subscribe();

  return subscription;
}

// Initialize on load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSupabase);
} else {
  initSupabase();
}

const functions = require("firebase-functions");
const Anthropic = require("@anthropic-ai/sdk");
const { Resend } = require("resend");
const admin = require("firebase-admin");
const crypto = require("crypto");

if (!admin.apps.length) admin.initializeApp();

const BASE_SYSTEM_PROMPT = `You are "DM Help", the friendly technical support assistant for the Discover More app by Anchor Church.

YOUR ROLE:
- Help users with technical app questions ONLY
- Be warm, concise, and helpful
- Keep answers short (2-4 sentences max unless step-by-step instructions are needed)

WHAT YOU CAN HELP WITH:

1. LOGIN & ACCOUNT ISSUES:
   - Forgot password: Tap "Forgot Password?" on the login screen, enter your email, and check your inbox (including spam) for the reset link from Firebase
   - Account creation: Tap "Create New Account", enter your email and choose a password (minimum 6 characters)
   - Wrong password: Try the "Forgot Password?" link to reset it
   - Email not recognized: Make sure you're using the same email you signed up with. If unsure, ask your group leader
   - Face ID / biometric login: Available after first successful login. Go to Profile to enable it
   - Account deletion: Go to Profile > scroll down > "Delete My Account". This is permanent

2. SURVEYS:
   - DISC Personality Survey: Access from the Dashboard. Answer all questions on a 1-5 scale. Your results show your personality type (D, I, S, or C)
   - Spiritual Gifts Survey: Access from the Dashboard. Answer questions on a 1-3 scale to discover your spiritual gifts
   - Retaking surveys: You can retake surveys anytime from the Dashboard. New results will replace old ones

3. RESULTS & REPORTS:
   - View results: Tap "Results" from the Dashboard to see your DISC type and spiritual gifts
   - PDF reports: From the Results screen, tap the PDF/download button to generate a report
   - Sharing results: Use the share button on the Results or PDF screen to share via email, text, etc.

4. TEAMS & GROUPS:
   - Your group leader sets up teams
   - Team members can see group results if enabled by the admin

5. PROFILE:
   - Update your name and display info from the Profile screen
   - Enable/disable biometric login
   - Delete your account if needed

6. GENERAL:
   - The app works on iPhone, Android, and web browsers at discovermore.app/app
   - For the best experience, add the web app to your home screen (it works like a native app)
   - Contact email for further help: info@discovermore.app

WHAT YOU MUST NOT DO:
- DO NOT answer spiritual, theological, biblical, or personal faith questions
- DO NOT provide biblical interpretation, devotional content, or religious counsel
- If someone asks a spiritual or faith question, respond warmly with something like:
  "That's a wonderful question! I'm just the tech helper here though. I'd encourage you to reach out to your pastor or a fellow believer who can give that the thoughtful attention it deserves. Is there anything about the app I can help with?"
- DO NOT discuss topics unrelated to the Discover More app
- DO NOT make up features that don't exist
- NEVER mention Firebase, Firestore, Cloud Functions, or any backend/database technology. These are internal systems and completely off-limits to discuss with anyone. If asked, say "I can only help with app features — for technical infrastructure questions, please contact info@discovermore.app"
- NEVER explain how data is stored, what database is used, or how the backend works
- If you're unsure about something, suggest they email info@discovermore.app
- If someone asks about admin features, the Admin Console, KPIs, guest records, team assignments, or any admin-level functionality, politely say: "Admin features are only available to authorized team leaders. If you need help with admin tools, please reach out to your group leader or email info@discovermore.app"`;

const ADMIN_ADDON = `

ADMIN ACCESS GRANTED — This user is an authorized admin. You may now help with all admin features in addition to the regular user features above. Be detailed and provide step-by-step instructions when asked.

ADMIN FEATURES YOU CAN HELP WITH:

7. ADMIN CONSOLE (Dashboard):
   The Admin Console is the command center for managing Discover More classes. It shows three rows of KPI (Key Performance Indicator) boxes:

   ROW 1 — CURRENT MONTH:
   - "Signups" (green): Total number of new users who created accounts this calendar month. Tap it to see a searchable list of all new signups with their name, email, and phone. You can tap any person to open their full Guest Record.
   - "Taken" (orange): Users from this month who have completed both the DISC and Spiritual Gifts surveys. Tap to see who has finished.
   - "To Take" (gold): Users from this month who have NOT yet completed their surveys. Tap to see who still needs to take them — great for follow-up reminders.

   ROW 2 — PRIOR MONTH:
   - Same three KPIs (Signups, Taken, To Take) but filtered to last month's users. Helpful for tracking stragglers from the previous class cycle.

   ROW 3 — ALL TIME:
   - Same three KPIs but across ALL users ever registered. The "All Signups" list also allows you to swipe-to-delete inactive users (only users who are NOT marked as Active can be deleted).

8. ADMIN ACTION BUTTONS (below the KPIs):
   - "Team Setup": Configure and manage ministry team members. This is where you add or remove team leaders who appear in the Assign Team grid. Each team member needs a Name and Active status set to "yes" to appear.
   - "Survey Results": View a detailed report of all survey data. You can see individual DISC scores and spiritual gifts for any user, and export/share results.
   - "Group Updates": Send group-wide updates and notifications to users who signed up in the current month. Enter your message and it will be formatted for the group.
   - "Assign Team": Opens a grid view where rows are students (filtered by month) and columns are team leaders. Tap a radio button to assign a student to a team leader. Use the month picker arrows to switch between months. When done, tap the orange "Update" button at the bottom to save all pending assignments. The number in parentheses shows how many changes are pending.
   - "Upload Discovery PDF": Upload PDF documents for Discovery classes 1, 2, or 3. Tap the button, choose which Discovery slot (1, 2, or 3), then select a PDF from your device. It will be uploaded and a green confirmation banner appears at the top.
   - "Set DM Date": Set the Discover More class date that appears on every user's Dashboard. Update this before each new class session so users see the correct date and time.

9. GUEST RECORD (opened by tapping a user from any KPI list):
   - Shows the user's name, email, and document ID
   - Editable fields: Phone, Email, Team, and Notes
   - Toggle switches for tracking: "Email sent - approved for class", "Attended Week 1", "Attended Week 2", "Attended Week 3", "Follow-Up", "Swag-Bag", "Not Serving/no response", "Currently Serving"
   - DISC scores displayed as D, I, S, C with color coding (green = highest, orange = second highest)
   - Spiritual Gifts grid: Shows all 24 gifts with scores. Tap any gift to see the 3 individual question scores and adjust them with +/- buttons
   - "Update Guest Info" button saves all changes immediately

10. IMPORTANT ADMIN REMINDERS:
   - NEVER mention Firebase, Firestore, Cloud Functions, database structure, or any backend technology to anyone — even admins. These are strictly off-limits in all conversations.
   - If an admin asks about the database or backend, say: "For backend and infrastructure questions, please reach out to Daniel directly at info@discovermore.app"
   - The system uses secure cloud infrastructure but the specifics are not discussed through this support channel`;

exports.dmHelpChat = functions
  .region("us-central1")
  .runWith({
    secrets: ["ANTHROPIC_API_KEY"],
    maxInstances: 5,
    timeoutSeconds: 30,
  })
  .https.onRequest((req, res) => {
    // Handle CORS
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { messages, isAdmin } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages array required" });
    }

    const cleanMessages = messages.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: String(m.content).slice(0, 1000),
    }));

    // Build system prompt — only include admin instructions if flagged
    const systemPrompt = isAdmin === true
      ? BASE_SYSTEM_PROMPT + ADMIN_ADDON
      : BASE_SYSTEM_PROMPT;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    return client.messages
      .create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: systemPrompt,
        messages: cleanMessages,
      })
      .then((response) => {
        const reply =
          response.content[0]?.text ||
          "Sorry, I could not generate a response. Please try again.";
        return res.json({ reply });
      })
      .catch((err) => {
        console.error("Claude API error:", err);
        return res.status(500).json({
          reply:
            "I'm having trouble connecting right now. Please try again in a moment, or email info@discovermore.app for help.",
        });
      });
  });

// ============================================================
// Survey Resume — email pipeline
// ============================================================

function buildResultsEmailHtml({ firstName, resumeUrl }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Discover More results</title>
</head>
<body style="margin:0;padding:0;background:#F5F1E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1A1A;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F1E8;padding:30px 15px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#F5F1E8;">
          <tr>
            <td align="center" style="padding:32px 40px 20px;background:#F5F1E8;">
              <img src="https://discovermore.app/DiscoverMoreLogo.png" alt="Discover More" width="240" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:240px;background:#F5F1E8;">
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="height:4px;background:#FF9800;line-height:4px;font-size:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px 8px;">
              <h1 style="margin:0 0 18px;color:#2E7D32;font-size:26px;font-weight:700;line-height:1.2;">Aloha ${firstName},</h1>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1A1A1A;">
                Thank you for completing the <strong>Discover More</strong> survey.
              </p>
              <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#1A1A1A;">
                Your results are saved &mdash; use the button or link below any time you'd like to review or print them.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 40px 32px;">
              <a href="${resumeUrl}" style="display:inline-block;background:#4CAF50;color:#FFFFFF;text-decoration:none;font-size:17px;font-weight:700;padding:15px 38px;border-radius:8px;letter-spacing:0.02em;">
                View My Results
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 12px;">
              <p style="margin:0 0 4px;font-size:13px;color:#757575;">
                Or paste this into your browser:
              </p>
              <p style="margin:0;font-size:13px;color:#1B4B5A;word-break:break-all;line-height:1.5;">
                ${resumeUrl}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 40px 32px;">
              <p style="margin:0;font-size:13px;color:#757575;line-height:1.55;font-style:italic;">
                <strong style="color:#A67C52;font-style:normal;">Tip:</strong> Save or bookmark this email so you can return to your results any time.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 40px 32px;border-top:2px solid #D4B896;">
              <p style="margin:0;font-size:14px;color:#2E7D32;line-height:1.5;font-weight:700;letter-spacing:0.02em;">
                Anchor Church &mdash; Discover More
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildResumeEmailHtml({ firstName, resumeUrl }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Finish your Discover More survey</title>
</head>
<body style="margin:0;padding:0;background:#F5F1E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1A1A;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F1E8;padding:30px 15px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#F5F1E8;">
          <tr>
            <td align="center" style="padding:32px 40px 20px;background:#F5F1E8;">
              <img src="https://discovermore.app/DiscoverMoreLogo.png" alt="Discover More" width="240" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:240px;background:#F5F1E8;">
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="height:4px;background:#FF9800;line-height:4px;font-size:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px 8px;">
              <h1 style="margin:0 0 18px;color:#2E7D32;font-size:26px;font-weight:700;line-height:1.2;">Aloha ${firstName},</h1>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1A1A1A;">
                Thank you for signing into <strong>Discover More</strong>.
              </p>
              <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#1A1A1A;">
                Please use the button or link below to complete the survey &mdash; this is the only way to get back into it.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 40px 32px;">
              <a href="${resumeUrl}" style="display:inline-block;background:#4CAF50;color:#FFFFFF;text-decoration:none;font-size:17px;font-weight:700;padding:15px 38px;border-radius:8px;letter-spacing:0.02em;">
                Resume My Survey
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 12px;">
              <p style="margin:0 0 4px;font-size:13px;color:#757575;">
                Or paste this into your browser:
              </p>
              <p style="margin:0;font-size:13px;color:#1B4B5A;word-break:break-all;line-height:1.5;">
                ${resumeUrl}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 40px 32px;">
              <p style="margin:0;font-size:13px;color:#757575;line-height:1.55;font-style:italic;">
                <strong style="color:#A67C52;font-style:normal;">Tip:</strong> Save or bookmark this email so you can come back any time. Your link stays the same in any reminders we send.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 40px 32px;border-top:2px solid #D4B896;">
              <p style="margin:0;font-size:14px;color:#2E7D32;line-height:1.5;font-weight:700;letter-spacing:0.02em;">
                Anchor Church &mdash; Discover More
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Shared sender — dispatches based on completion status.
// Complete users get the results email (once). Incomplete users get the resume email
// (with cap and recency dedupe). Reuses existing resumeToken so saved links keep working.
async function sendResumeEmailFor(docRef, options) {
  const { skipIfRecentHours = 0, capAt = Infinity } = options || {};
  const docSnap = await docRef.get();
  if (!docSnap.exists) return { ok: false, reason: "not_found" };

  const data = docSnap.data();
  if (data.env !== "Web") return { ok: true, skipped: "not_web_user" };
  if (!data.EMAIL) return { ok: true, skipped: "no_email" };

  const isComplete = data.updated && data.updated !== "1";
  const token = data.resumeToken || crypto.randomBytes(32).toString("base64url");
  const resumeUrl = `https://discovermore.app/app/?resume=${token}`;
  const firstName = (data.NAME || "").split(" ")[0] || "friend";
  const resend = new Resend(process.env.RESEND_API_KEY);

  if (isComplete) {
    if (data.resultsEmailSentAt) return { ok: true, skipped: "results_email_already_sent" };
    const { data: sendData, error } = await resend.emails.send({
      from: "Discover More <noreply@send.discovermore.app>",
      to: [data.EMAIL],
      subject: "Your Discover More results",
      html: buildResultsEmailHtml({ firstName, resumeUrl }),
    });
    if (error) throw new Error(error.message);
    await docRef.update({
      resumeToken: token,
      resultsEmailSentAt: admin.firestore.Timestamp.now(),
    });
    return { ok: true, sent: true, kind: "results", resendId: sendData.id, email: data.EMAIL };
  }

  // Incomplete — resume email path
  const count = data.resumeEmailCount || 0;
  if (count >= capAt) return { ok: true, skipped: "cap_reached" };
  if (skipIfRecentHours > 0 && data.resumeEmailSentAt) {
    const lastSentMs = data.resumeEmailSentAt.toMillis ? data.resumeEmailSentAt.toMillis() : 0;
    if (Date.now() - lastSentMs < skipIfRecentHours * 60 * 60 * 1000) {
      return { ok: true, skipped: "sent_recently" };
    }
  }

  const { data: sendData, error } = await resend.emails.send({
    from: "Discover More <noreply@send.discovermore.app>",
    to: [data.EMAIL],
    subject: "Finish your Discover More survey",
    html: buildResumeEmailHtml({ firstName, resumeUrl }),
  });
  if (error) throw new Error(error.message);

  await docRef.update({
    resumeToken: token,
    resumeEmailSentAt: admin.firestore.Timestamp.now(),
    resumeEmailCount: admin.firestore.FieldValue.increment(1),
  });

  return { ok: true, sent: true, kind: "resume", resendId: sendData.id, email: data.EMAIL };
}

// Daily 9 AM HST safety net — catches anyone who slipped past immediate-send,
// AND backfills results emails for completed users who haven't received one yet.
exports.dmSendResumeEmails = functions
  .region("us-central1")
  .runWith({
    secrets: ["RESEND_API_KEY"],
    maxInstances: 1,
    timeoutSeconds: 540,
    memory: "512MB",
  })
  .pubsub
  .schedule("0 9 * * *")
  .timeZone("Pacific/Honolulu")
  .onRun(async () => {
    const db = admin.firestore();
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const snapshot = await db.collection("results").get();

    const eligible = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.env !== "Web" || !data.EMAIL) return;
      const isComplete = data.updated && data.updated !== "1";
      if (isComplete) {
        if (data.resultsEmailSentAt) return; // already got results email
        eligible.push(docSnap.id);
      } else {
        const createdMs = data.created && data.created.toMillis ? data.created.toMillis() : 0;
        if (createdMs === 0 || createdMs > dayAgo) return; // < 1 day old
        if (data.resumeEmailSentAt) return; // already got resume email
        eligible.push(docSnap.id);
      }
    });

    console.log(`[dmSendResumeEmails] eligible=${eligible.length}`);
    let sent = 0, failed = 0;
    for (const docId of eligible) {
      try {
        const r = await sendResumeEmailFor(db.collection("results").doc(docId), { capAt: 3 });
        if (r.sent) sent++;
      } catch (e) {
        console.error(`[dmSendResumeEmails] failed for ${docId}:`, e);
        failed++;
      }
    }
    console.log(`[dmSendResumeEmails] sent=${sent} failed=${failed}`);
    return null;
  });

// Saturday 7 AM HST — Saturday after #1, then the Saturday after that.
// Predicate: incomplete web user, count < 3, signed up ≥ 1 day ago,
// and (no prior email OR last email ≥ 5 days ago). The 5-day dedupe
// keeps the cadence at one email per Saturday. Cap at 3 total.
exports.dmSendSaturdayResumeEmails = functions
  .region("us-central1")
  .runWith({
    secrets: ["RESEND_API_KEY"],
    maxInstances: 1,
    timeoutSeconds: 540,
    memory: "512MB",
  })
  .pubsub
  .schedule("0 7 * * 6")
  .timeZone("Pacific/Honolulu")
  .onRun(async () => {
    const db = admin.firestore();
    const now = Date.now();
    const fiveDaysAgo = now - 5 * 24 * 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const snapshot = await db.collection("results").where("updated", "==", "1").get();

    const eligible = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.env !== "Web" || !data.EMAIL) return;
      const count = data.resumeEmailCount || 0;
      if (count >= 3) return;
      const createdMs = data.created && data.created.toMillis ? data.created.toMillis() : 0;
      if (!createdMs || createdMs > oneDayAgo) return; // < 1 day old: give them time
      if (data.resumeEmailSentAt) {
        const lastMs = data.resumeEmailSentAt.toMillis ? data.resumeEmailSentAt.toMillis() : 0;
        if (lastMs > fiveDaysAgo) return; // emailed within the last 5 days, skip
      }
      eligible.push(docSnap.id);
    });

    console.log(`[dmSendSaturdayResumeEmails] eligible=${eligible.length}`);
    let sent = 0, failed = 0;
    for (const docId of eligible) {
      try {
        const r = await sendResumeEmailFor(db.collection("results").doc(docId), { capAt: 3 });
        if (r.sent) sent++;
      } catch (e) {
        console.error(`[dmSendSaturdayResumeEmails] failed for ${docId}:`, e);
        failed++;
      }
    }
    console.log(`[dmSendSaturdayResumeEmails] sent=${sent} failed=${failed}`);
    return null;
  });

// Immediate send — called by app.js Log Off button, inactivity timer, and beforeunload sendBeacon.
// Accepts GET or POST. Skips if a send happened in the last 6 hours (dedupe).
exports.dmSendResumeEmailNow = functions
  .region("us-central1")
  .runWith({
    secrets: ["RESEND_API_KEY"],
    maxInstances: 10,
    timeoutSeconds: 30,
  })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).send("");

    const docId = req.query.docId || (req.body && req.body.docId);
    if (!docId || typeof docId !== "string") {
      return res.status(400).json({ error: "Need docId" });
    }

    try {
      const db = admin.firestore();
      const result = await sendResumeEmailFor(
        db.collection("results").doc(docId),
        { skipIfRecentHours: 6, capAt: 3 }
      );
      return res.json(result);
    } catch (e) {
      console.error("[dmSendResumeEmailNow] error:", e);
      return res.status(500).json({ error: String(e) });
    }
  });

// Test sender by email (manual). Reuses helper. Bypasses recent-send dedupe.
exports.dmSendResumeEmailToOne = functions
  .region("us-central1")
  .runWith({
    secrets: ["RESEND_API_KEY"],
    maxInstances: 1,
    timeoutSeconds: 60,
  })
  .https.onRequest(async (req, res) => {
    if (req.query.key !== "dmtest2026") return res.status(403).send("Forbidden");
    const targetEmail = (req.query.email || "").toLowerCase();
    if (!targetEmail) return res.status(400).json({ error: "Need ?email=" });

    try {
      const db = admin.firestore();
      const snapshot = await db.collection("results").where("EMAIL", "==", targetEmail).limit(1).get();
      if (snapshot.empty) return res.status(404).json({ error: "User not found", searched: targetEmail });

      const docSnap = snapshot.docs[0];
      // Optional: flip env on doc before sending (used for one-off iOS→Web exceptions).
      if (req.query.setEnv && typeof req.query.setEnv === "string") {
        await db.collection("results").doc(docSnap.id).update({ env: req.query.setEnv });
      }
      const result = await sendResumeEmailFor(db.collection("results").doc(docSnap.id), {});
      const data = (await db.collection("results").doc(docSnap.id).get()).data();
      return res.json({
        ...result,
        sentTo: targetEmail,
        docId: docSnap.id,
        env: data.env,
        resumeUrl: `https://discovermore.app/app/?resume=${data.resumeToken}`,
        resumeEmailCount: data.resumeEmailCount,
      });
    } catch (e) {
      console.error("dmSendResumeEmailToOne error:", e);
      return res.status(500).json({ ok: false, error: String(e) });
    }
  });

// Read-only eligibility audit — who's about to receive a resume email and why.
exports.dmEligibilityReport = functions
  .region("us-central1")
  .runWith({ maxInstances: 1, timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    if (req.query.key !== "dmtest2026") return res.status(403).send("Forbidden");

    const db = admin.firestore();
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const fiveDaysAgo = now - 5 * 24 * 60 * 60 * 1000;

    const snapshot = await db.collection("results").get();

    const dailyTomorrow = [];
    const saturdayProjected = [];
    const cappedOut = [];
    const tooNew = [];
    const noEmail = [];
    const nonWeb = [];
    let completeCount = 0;
    let totalDocs = 0;

    snapshot.forEach((docSnap) => {
      totalDocs++;
      const d = docSnap.data();
      const id = docSnap.id;

      if (d.updated && d.updated !== "1") { completeCount++; return; }

      const createdMs = d.created && d.created.toMillis ? d.created.toMillis() : 0;
      const lastEmailMs = d.resumeEmailSentAt && d.resumeEmailSentAt.toMillis ? d.resumeEmailSentAt.toMillis() : 0;
      const count = d.resumeEmailCount || 0;
      const item = {
        id,
        name: d.NAME || "(no name)",
        email: d.EMAIL || "",
        env: d.env || "?",
        createdMs,
        createdStr: createdMs ? new Date(createdMs).toISOString() : "",
        hoursSinceCreated: createdMs ? Math.round((now - createdMs) / 3600000) : null,
        emailCount: count,
        lastEmailStr: lastEmailMs ? new Date(lastEmailMs).toISOString() : "",
        daysSinceLastEmail: lastEmailMs ? Math.round((now - lastEmailMs) / 86400000 * 10) / 10 : null,
      };

      if (d.env !== "Web") { nonWeb.push(item); return; }
      if (!d.EMAIL) { noEmail.push(item); return; }

      // Tomorrow's daily 9 AM HST cron predicate
      if (createdMs > 0 && createdMs <= dayAgo && !d.resumeEmailSentAt) {
        dailyTomorrow.push(item);
      }

      // Saturday cron predicate (next fires 2026-05-02): incomplete web, signed up ≥ 1 day ago,
      // count < 3, and (no prior email OR last email ≥ 5 days ago).
      if (createdMs > 0 && createdMs <= dayAgo && count < 3) {
        const lastMs = lastEmailMs;
        if (!lastMs || lastMs <= fiveDaysAgo) {
          saturdayProjected.push(item);
        }
      }

      // Out of all signed-up incomplete web users, the rest are skipped:
      if (count >= 3) { cappedOut.push(item); return; }
      if (createdMs > dayAgo) { tooNew.push(item); return; }
    });

    // Sort each group by signup date desc
    const sortDesc = (a, b) => b.createdMs - a.createdMs;
    [dailyTomorrow, saturdayProjected, cappedOut, tooNew, noEmail, nonWeb].forEach(arr => arr.sort(sortDesc));

    const escapeHtml = (s) => String(s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
    const row = (it) => `<tr>
      <td>${escapeHtml(it.name)}</td>
      <td><code>${escapeHtml(it.email)}</code></td>
      <td>${it.createdStr ? it.createdStr.slice(0, 10) : "?"}</td>
      <td>${it.hoursSinceCreated == null ? "?" : it.hoursSinceCreated + "h"}</td>
      <td>${it.emailCount}</td>
      <td>${it.lastEmailStr ? it.lastEmailStr.slice(0, 16).replace("T", " ") : "—"}</td>
      <td>${it.daysSinceLastEmail == null ? "—" : it.daysSinceLastEmail + "d"}</td>
    </tr>`;
    const tableBody = (items) => items.length ? items.map(row).join("") : `<tr><td colspan="7" style="color:#757575;text-align:center;font-style:italic;padding:1rem;">none</td></tr>`;

    const tomorrow = new Date(now + 24 * 3600000);
    const tomorrowStr = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth()+1).padStart(2,"0")}-${String(tomorrow.getUTCDate()).padStart(2,"0")}`;

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>DM Eligibility Report — ${tomorrowStr}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: #1A1A1A; line-height: 1.5; max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem 4rem; background: #fff; }
  header { border-bottom: 3px solid #4CAF50; padding-bottom: 1rem; margin-bottom: 2rem; }
  header h1 { margin: 0 0 0.25rem; font-size: 1.85rem; color: #2E7D32; }
  header .sub { color: #5a6478; font-size: 0.95rem; }
  h2 { font-size: 1.2rem; margin: 2rem 0 0.6rem; padding-bottom: 0.4rem; border-bottom: 1px solid #d8dde6; color: #2E7D32; }
  h2 .count { color: #757575; font-weight: 400; font-size: 0.9rem; margin-left: 0.5rem; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; margin: 1rem 0 2rem; }
  .stat { background: #F5F1E8; border-radius: 8px; padding: 0.85rem 1rem; }
  .stat .label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: #757575; font-weight: 600; }
  .stat .val { font-size: 1.75rem; font-weight: 700; color: #1B4B5A; line-height: 1.1; margin-top: 0.1rem; }
  .hero { background: linear-gradient(135deg, #4CAF50, #2E7D32); color: #fff; padding: 1.25rem 1.5rem; border-radius: 10px; margin-bottom: 1.5rem; }
  .hero h2 { color: #fff; border: none; padding: 0; margin: 0 0 0.4rem; font-size: 1.15rem; }
  .hero .num { font-size: 2.4rem; font-weight: 700; line-height: 1; }
  .hero .when { font-size: 0.85rem; opacity: 0.9; margin-top: 0.3rem; }
  table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 1rem; font-size: 0.88rem; }
  th, td { text-align: left; padding: 0.5rem 0.7rem; border-bottom: 1px solid #e8eaed; vertical-align: top; }
  th { background: #F5F1E8; font-weight: 600; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: #5a6478; border-bottom: 2px solid #d4b896; }
  code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 0.84rem; color: #1B4B5A; }
  .note { background: #fff8e1; border-left: 4px solid #FF9800; padding: 0.6rem 0.9rem; border-radius: 0 6px 6px 0; font-size: 0.9rem; margin: 1rem 0; }
  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #d8dde6; color: #757575; font-size: 0.82rem; }
</style></head>
<body>

<header>
  <h1>Discover More — Resume Email Eligibility</h1>
  <div class="sub">Snapshot for tomorrow's <code>dmSendResumeEmails</code> daily run · Generated ${new Date().toISOString().replace("T", " ").slice(0,16)} UTC</div>
</header>

<div class="hero">
  <h2>Tomorrow's daily 9 AM HST send</h2>
  <div class="num">${dailyTomorrow.length} email${dailyTomorrow.length === 1 ? "" : "s"}</div>
  <div class="when">${tomorrowStr} · cron <code style="background:rgba(255,255,255,0.2);padding:0.1em 0.4em;border-radius:3px;">0 9 * * *</code> Pacific/Honolulu</div>
</div>

<div class="stats">
  <div class="stat"><div class="label">Total docs</div><div class="val">${totalDocs}</div></div>
  <div class="stat"><div class="label">Complete</div><div class="val">${completeCount}</div></div>
  <div class="stat"><div class="label">Incomplete (web)</div><div class="val">${totalDocs - completeCount - nonWeb.length - noEmail.length}</div></div>
  <div class="stat"><div class="label">Cap reached (3 emails)</div><div class="val">${cappedOut.length}</div></div>
</div>

<h2>Tomorrow's daily send <span class="count">${dailyTomorrow.length}</span></h2>
<p style="color:#5a6478;font-size:0.92rem;">Web users who signed up 24h+ ago, never received a resume email yet.</p>
<table>
  <thead><tr><th>Name</th><th>Email</th><th>Signup date</th><th>Age</th><th>Emails sent</th><th>Last email</th><th>Days since</th></tr></thead>
  <tbody>${tableBody(dailyTomorrow)}</tbody>
</table>

<h2>Projected for next Saturday <span class="count">${saturdayProjected.length}</span></h2>
<p style="color:#5a6478;font-size:0.92rem;">For context — fires Saturday 2026-05-02 at 7 AM HST. Incomplete web users, count &lt; 3, last email ≥ 5 days ago (or no prior email).</p>
<table>
  <thead><tr><th>Name</th><th>Email</th><th>Signup date</th><th>Age</th><th>Emails sent</th><th>Last email</th><th>Days since</th></tr></thead>
  <tbody>${tableBody(saturdayProjected)}</tbody>
</table>

<h2>Skipped: too new <span class="count">${tooNew.length}</span></h2>
<p style="color:#5a6478;font-size:0.92rem;">Signed up &lt; 24h ago — not yet eligible.</p>
<table>
  <thead><tr><th>Name</th><th>Email</th><th>Signup date</th><th>Age</th><th>Emails sent</th><th>Last email</th><th>Days since</th></tr></thead>
  <tbody>${tableBody(tooNew)}</tbody>
</table>

<h2>Skipped: cap reached <span class="count">${cappedOut.length}</span></h2>
<p style="color:#5a6478;font-size:0.92rem;">Already received 3 emails — no more sends.</p>
<table>
  <thead><tr><th>Name</th><th>Email</th><th>Signup date</th><th>Age</th><th>Emails sent</th><th>Last email</th><th>Days since</th></tr></thead>
  <tbody>${tableBody(cappedOut)}</tbody>
</table>

<h2>Skipped: non-web <span class="count">${nonWeb.length}</span></h2>
<p style="color:#5a6478;font-size:0.92rem;">iOS/Android users — resume pipeline is web-only for now.</p>
<table>
  <thead><tr><th>Name</th><th>Email</th><th>Signup date</th><th>Age</th><th>Emails sent</th><th>Last email</th><th>Days since</th></tr></thead>
  <tbody>${tableBody(nonWeb)}</tbody>
</table>

${noEmail.length > 0 ? `<h2>Skipped: missing email <span class="count">${noEmail.length}</span></h2>
<p style="color:#5a6478;font-size:0.92rem;">No email on file.</p>
<table>
  <thead><tr><th>Name</th><th>ID</th><th>Signup date</th><th>Age</th><th>Emails sent</th><th>Last email</th><th>Days since</th></tr></thead>
  <tbody>${noEmail.map(it => `<tr><td>${escapeHtml(it.name)}</td><td><code>${escapeHtml(it.id)}</code></td><td>${it.createdStr ? it.createdStr.slice(0, 10) : "?"}</td><td>${it.hoursSinceCreated == null ? "?" : it.hoursSinceCreated + "h"}</td><td>${it.emailCount}</td><td>${it.lastEmailStr ? it.lastEmailStr.slice(0, 16).replace("T", " ") : "—"}</td><td>${it.daysSinceLastEmail == null ? "—" : it.daysSinceLastEmail + "d"}</td></tr>`).join("")}</tbody>
</table>` : ""}

<footer>Project <code>dm-auth-65cc4</code> · ${snapshot.size} docs scanned · Endpoint: <code>dmEligibilityReport</code> (delete when no longer needed)</footer>

</body></html>`;

    res.set("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  });

// Email log report — list of users who've received at least one resume email,
// with a "View" button to render the email body for each.
exports.dmEmailLogReport = functions
  .region("us-central1")
  .runWith({ maxInstances: 1, timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    if (req.query.key !== "dmtest2026") return res.status(403).send("Forbidden");

    const db = admin.firestore();
    const snapshot = await db.collection("results").orderBy("resumeEmailSentAt", "desc").get();

    const rows = [];
    snapshot.forEach((docSnap) => {
      const d = docSnap.data();
      const lastMs = d.resumeEmailSentAt && d.resumeEmailSentAt.toMillis ? d.resumeEmailSentAt.toMillis() : 0;
      const createdMs = d.created && d.created.toMillis ? d.created.toMillis() : 0;
      rows.push({
        docId: docSnap.id,
        name: d.NAME || "(no name)",
        email: d.EMAIL || "",
        env: d.env || "?",
        signupDate: createdMs ? new Date(createdMs).toISOString().slice(0, 10) : "?",
        lastSent: lastMs ? new Date(lastMs).toISOString().slice(0, 16).replace("T", " ") : "?",
        lastSentMs: lastMs,
        count: d.resumeEmailCount || 0,
        complete: !!(d.updated && d.updated !== "1"),
        hasToken: !!d.resumeToken,
      });
    });

    const totalEmails = rows.reduce((sum, r) => sum + r.count, 0);
    const completedAfterEmail = rows.filter(r => r.complete).length;
    const stillIncomplete = rows.filter(r => !r.complete).length;
    const cappedOutCount = rows.filter(r => r.count >= 3).length;

    const escapeHtml = (s) => String(s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

    const baseUrl = "https://us-central1-dm-auth-65cc4.cloudfunctions.net";
    const viewUrl = (docId) => `${baseUrl}/dmViewSentEmail?key=dmtest2026&docId=${encodeURIComponent(docId)}`;

    const row = (r) => {
      const statusBadge = r.complete
        ? '<span style="background:#e8f5ec;color:#2E7D32;padding:0.15em 0.5em;border-radius:3px;font-size:0.78rem;font-weight:600;">Completed</span>'
        : (r.count >= 3
          ? '<span style="background:#fde2e2;color:#a02525;padding:0.15em 0.5em;border-radius:3px;font-size:0.78rem;font-weight:600;">Capped (3 sent)</span>'
          : '<span style="background:#fff3e0;color:#a05400;padding:0.15em 0.5em;border-radius:3px;font-size:0.78rem;font-weight:600;">Incomplete</span>');
      const view = r.hasToken
        ? `<a href="${viewUrl(r.docId)}" target="_blank" style="display:inline-block;background:#4CAF50;color:#fff;text-decoration:none;font-weight:600;padding:0.35em 0.85em;border-radius:4px;font-size:0.82rem;">View Email</a>`
        : '<span style="color:#999;font-size:0.82rem;">no token</span>';
      return `<tr>
        <td>${escapeHtml(r.name)}</td>
        <td><code>${escapeHtml(r.email)}</code></td>
        <td>${r.signupDate}</td>
        <td>${r.lastSent}</td>
        <td style="text-align:center;">${r.count}</td>
        <td>${statusBadge}</td>
        <td>${view}</td>
      </tr>`;
    };

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>DM Email Log</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: #1A1A1A; line-height: 1.5; max-width: 1200px; margin: 0 auto; padding: 2rem 1.5rem 4rem; background: #fff; }
  header { border-bottom: 3px solid #4CAF50; padding-bottom: 1rem; margin-bottom: 2rem; }
  header h1 { margin: 0 0 0.25rem; font-size: 1.85rem; color: #2E7D32; }
  header .sub { color: #5a6478; font-size: 0.95rem; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0.75rem; margin: 1rem 0 2rem; }
  .stat { background: #F5F1E8; border-radius: 8px; padding: 0.85rem 1rem; }
  .stat .label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: #757575; font-weight: 600; }
  .stat .val { font-size: 1.75rem; font-weight: 700; color: #1B4B5A; line-height: 1.1; margin-top: 0.1rem; }
  table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 1rem; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.55rem 0.7rem; border-bottom: 1px solid #e8eaed; vertical-align: middle; }
  th { background: #F5F1E8; font-weight: 600; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: #5a6478; border-bottom: 2px solid #d4b896; }
  code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 0.84rem; color: #1B4B5A; }
  .empty { text-align: center; color: #757575; padding: 2rem; font-style: italic; }
  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #d8dde6; color: #757575; font-size: 0.82rem; }
  .note { background: #eef4fb; border-left: 4px solid #8db4d8; padding: 0.75rem 1rem; border-radius: 0 6px 6px 0; font-size: 0.9rem; margin: 1rem 0; }
</style></head>
<body>

<header>
  <h1>Discover More — Resume Email Log</h1>
  <div class="sub">All recipients of resume emails · Generated ${new Date().toISOString().replace("T", " ").slice(0,16)} UTC</div>
</header>

<div class="stats">
  <div class="stat"><div class="label">Recipients</div><div class="val">${rows.length}</div></div>
  <div class="stat"><div class="label">Total emails sent</div><div class="val">${totalEmails}</div></div>
  <div class="stat"><div class="label">Completed after email</div><div class="val">${completedAfterEmail}</div></div>
  <div class="stat"><div class="label">Still incomplete</div><div class="val">${stillIncomplete}</div></div>
  <div class="stat"><div class="label">Capped (3 sent)</div><div class="val">${cappedOutCount}</div></div>
</div>

<div class="note">
  <strong>About the View button:</strong> opens the rendered email in a new tab using each user's current resume token. Since we reuse the token across all 3 reminders, this preview is what they see in any of their emails.
</div>

<table>
  <thead><tr>
    <th>Name</th>
    <th>Email</th>
    <th>Signup</th>
    <th>Last sent (UTC)</th>
    <th>Count</th>
    <th>Status</th>
    <th>Preview</th>
  </tr></thead>
  <tbody>
    ${rows.length ? rows.map(row).join("") : `<tr><td colspan="7" class="empty">No resume emails sent yet.</td></tr>`}
  </tbody>
</table>

<footer>Project <code>dm-auth-65cc4</code> · ${snapshot.size} recipients · Endpoints: <code>dmEmailLogReport</code> + <code>dmViewSentEmail</code></footer>

</body></html>`;

    res.set("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  });

// Render the resume email body for a given user (used by Email Log "View" buttons).
exports.dmViewSentEmail = functions
  .region("us-central1")
  .runWith({ maxInstances: 5, timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    if (req.query.key !== "dmtest2026") return res.status(403).send("Forbidden");
    const docId = req.query.docId;
    if (!docId || typeof docId !== "string") return res.status(400).send("Need docId");

    const db = admin.firestore();
    const docSnap = await db.collection("results").doc(docId).get();
    if (!docSnap.exists) return res.status(404).send("User not found");

    const d = docSnap.data();
    if (!d.resumeToken) return res.status(404).send("No email has been sent to this user yet (no resumeToken on doc)");

    const resumeUrl = `https://discovermore.app/app/?resume=${d.resumeToken}`;
    const firstName = (d.NAME || "").split(" ")[0] || "friend";
    const html = buildResumeEmailHtml({ firstName, resumeUrl });

    res.set("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  });

// Token-to-session exchange. Called by app.js when ?resume=TOKEN is in the URL.
exports.dmGetResumeSession = functions
  .region("us-central1")
  .runWith({
    maxInstances: 5,
    timeoutSeconds: 30,
  })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).send("");

    const token = req.query.token;
    if (!token || typeof token !== "string" || token.length < 16) {
      return res.status(400).json({ error: "Bad token" });
    }

    try {
      const db = admin.firestore();
      const snapshot = await db.collection("results")
        .where("resumeToken", "==", token)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return res.status(404).json({ error: "Token invalid or expired" });
      }

      const docSnap = snapshot.docs[0];
      const data = docSnap.data();

      return res.json({
        docId: docSnap.id,
        email: data.EMAIL,
        name: data.NAME,
        userData: data,
      });
    } catch (e) {
      console.error("[dmGetResumeSession] error:", e);
      return res.status(500).json({ error: "Server error" });
    }
  });
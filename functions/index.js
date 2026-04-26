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

// Shared sender. Reuses existing token (so saved email links keep working).
// Returns: { ok, sent? skipped?, reason? } — or throws on Resend/Firestore failure.
async function sendResumeEmailFor(docRef, options) {
  const { skipIfRecentHours = 0, capAt = Infinity } = options || {};
  const docSnap = await docRef.get();
  if (!docSnap.exists) return { ok: false, reason: "not_found" };

  const data = docSnap.data();
  if (data.updated && data.updated !== "1") return { ok: true, skipped: "already_complete" };
  if (data.env !== "Web") return { ok: true, skipped: "not_web_user" };
  if (!data.EMAIL) return { ok: true, skipped: "no_email" };

  const count = data.resumeEmailCount || 0;
  if (count >= capAt) return { ok: true, skipped: "cap_reached" };

  if (skipIfRecentHours > 0 && data.resumeEmailSentAt) {
    const lastSentMs = data.resumeEmailSentAt.toMillis ? data.resumeEmailSentAt.toMillis() : 0;
    if (Date.now() - lastSentMs < skipIfRecentHours * 60 * 60 * 1000) {
      return { ok: true, skipped: "sent_recently" };
    }
  }

  // Reuse existing token if present — preserves saved email links across reminders.
  const token = data.resumeToken || crypto.randomBytes(32).toString("base64url");
  const resumeUrl = `https://discovermore.app/app/?resume=${token}`;
  const firstName = (data.NAME || "").split(" ")[0] || "friend";

  const resend = new Resend(process.env.RESEND_API_KEY);
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

  return { ok: true, sent: true, resendId: sendData.id, email: data.EMAIL };
}

// Daily 9 AM HST safety net — catches anyone who slipped past immediate-send.
// Eligibility: incomplete web user, created 24h+ ago, no email yet.
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
    const snapshot = await db.collection("results").where("updated", "==", "1").get();

    const eligible = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const createdMs = data.created && data.created.toMillis ? data.created.toMillis() : 0;
      if (createdMs === 0 || createdMs > dayAgo) return;
      if (data.resumeEmailSentAt) return;
      if (!data.EMAIL || data.env !== "Web") return;
      eligible.push(docSnap.id);
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

// Saturday 7 AM HST — sends follow-up #2 and #3 to incomplete users.
// Caps at 3 total emails per user (initial + 2 Saturdays).
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
    const sixDaysAgo = Date.now() - 6 * 24 * 60 * 60 * 1000;
    const snapshot = await db.collection("results").where("updated", "==", "1").get();

    const eligible = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.env !== "Web" || !data.EMAIL) return;
      if (!data.resumeEmailSentAt) return; // never got initial — skip until daily cron sends one
      const lastSentMs = data.resumeEmailSentAt.toMillis ? data.resumeEmailSentAt.toMillis() : 0;
      if (lastSentMs > sixDaysAgo) return; // sent within last 6 days, don't double up
      const count = data.resumeEmailCount || 0;
      if (count >= 3) return; // cap reached
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
      const result = await sendResumeEmailFor(db.collection("results").doc(docSnap.id), {});
      const data = (await db.collection("results").doc(docSnap.id).get()).data();
      return res.json({
        ...result,
        sentTo: targetEmail,
        docId: docSnap.id,
        resumeUrl: `https://discovermore.app/app/?resume=${data.resumeToken}`,
        resumeEmailCount: data.resumeEmailCount,
      });
    } catch (e) {
      console.error("dmSendResumeEmailToOne error:", e);
      return res.status(500).json({ ok: false, error: String(e) });
    }
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
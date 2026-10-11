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

    // Every question and answer is saved to helpChatLog (Admin SDK only; no
    // client can read it) so the Help Chat report can show what people ask.
    // A daily cap keeps an abused public endpoint from running up the bill.
    const db = admin.firestore();
    const lastUser = [...cleanMessages].reverse().find((m) => m.role === "user");
    const ua = String(req.get("user-agent") || "");
    const platform = /CFNetwork|Darwin/.test(ua) && !/Mozilla/.test(ua) ? "iOS app"
      : /iPhone|Android|Mobile/.test(ua) ? "Web (phone)" : "Web";
    const logChat = (fields) => db.collection("helpChatLog").add(Object.assign({
      at: admin.firestore.FieldValue.serverTimestamp(),
      question: lastUser ? lastUser.content : "",
      turn: cleanMessages.filter((m) => m.role === "user").length,
      isAdmin: isAdmin === true,
      platform,
    }, fields)).catch((e) => console.error("helpChatLog write failed:", e.message));

    const askClaude = () => {
      const client = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY || "").trim() });
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
          const u = response.usage || {};
          return logChat({
            answer: reply, status: "ok", model: response.model || "",
            inputTokens: u.input_tokens || 0, outputTokens: u.output_tokens || 0,
          }).then(() => res.json({ reply }));
        })
        .catch((err) => {
          console.error("Claude API error:", err && err.status, err && err.message);
          const reply =
            "I'm having trouble connecting right now. Please try again in a moment, or email info@discovermore.app for help.";
          return logChat({
            answer: reply, status: "error",
            error: (String((err && err.status) || "") + " " + String((err && err.message) || "")).slice(0, 200),
          }).then(() => res.status(500).json({ reply }));
        });
    };

    const day = new Date(Date.now() - 10 * 3600e3).toISOString().slice(0, 10); // HST date
    const dayRef = db.collection("helpChatDaily").doc(day);
    return dayRef.set({ count: admin.firestore.FieldValue.increment(1) }, { merge: true })
      .then(() => dayRef.get())
      .then((snap) => {
        if (((snap.data() || {}).count || 0) > HELP_CHAT_DAILY_CAP) {
          const reply = "The help chat is resting for today. Please try again tomorrow, or email info@discovermore.app for help.";
          return logChat({ answer: reply, status: "capped" }).then(() => res.json({ reply }));
        }
        return askClaude();
      })
      .catch((err) => {
        console.error("dmHelpChat daily cap check failed:", err.message);
        return askClaude();
      });
  });

const HELP_CHAT_DAILY_CAP = 300;

// ============================================================
// Survey Resume — email pipeline
// ============================================================

function extractTokenFromUrl(url) {
  const m = String(url).match(/[?&]resume=([^&]+)/);
  return m ? m[1] : "";
}

function buildResultsEmailHtml({ firstName, resumeUrl }) {
  const token = extractTokenFromUrl(resumeUrl);
  const saveLinkUrl = `https://discovermore.app/app/?savelink=${token}`;
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
            <td align="center" style="padding:0 40px 16px;">
              <a href="${resumeUrl}" style="display:inline-block;background:#4CAF50;color:#FFFFFF;text-decoration:none;font-size:17px;font-weight:700;padding:15px 38px;border-radius:8px;letter-spacing:0.02em;">
                View My Results
              </a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 40px 32px;">
              <a href="${saveLinkUrl}" style="display:inline-block;background:transparent;color:#A67C52;text-decoration:none;font-size:14px;font-weight:600;padding:9px 22px;border:1.5px solid #D4B896;border-radius:6px;letter-spacing:0.02em;">
                Save This Link
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
  const token = extractTokenFromUrl(resumeUrl);
  const saveLinkUrl = `https://discovermore.app/app/?savelink=${token}`;
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
            <td align="center" style="padding:0 40px 16px;">
              <a href="${resumeUrl}" style="display:inline-block;background:#4CAF50;color:#FFFFFF;text-decoration:none;font-size:17px;font-weight:700;padding:15px 38px;border-radius:8px;letter-spacing:0.02em;">
                Resume My Survey
              </a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 40px 32px;">
              <a href="${saveLinkUrl}" style="display:inline-block;background:transparent;color:#A67C52;text-decoration:none;font-size:14px;font-weight:600;padding:9px 22px;border:1.5px solid #D4B896;border-radius:6px;letter-spacing:0.02em;">
                Save This Link
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
// Complete users get the results email (once unless force=true). Incomplete users get the resume
// email (with cap and recency dedupe; force=true bypasses dedupe but respects the 3-email cap).
// Each successful send is logged to the `emailLog` Firestore collection for audit and resend.
async function sendResumeEmailFor(docRef, options) {
  const { skipIfRecentHours = 0, capAt = Infinity, force = false, triggeredBy = "unknown" } = options || {};
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

  let subject, html, kind, count;
  if (isComplete) {
    if (data.resultsEmailSentAt && !force) return { ok: true, skipped: "results_email_already_sent" };
    subject = "Your Discover More results";
    html = buildResultsEmailHtml({ firstName, resumeUrl });
    kind = "results";
    count = null;
  } else {
    const currentCount = data.resumeEmailCount || 0;
    if (currentCount >= capAt) return { ok: true, skipped: "cap_reached" };
    if (skipIfRecentHours > 0 && !force && data.resumeEmailSentAt) {
      const lastSentMs = data.resumeEmailSentAt.toMillis ? data.resumeEmailSentAt.toMillis() : 0;
      if (Date.now() - lastSentMs < skipIfRecentHours * 60 * 60 * 1000) {
        return { ok: true, skipped: "sent_recently" };
      }
    }
    subject = "Finish your Discover More survey";
    html = buildResumeEmailHtml({ firstName, resumeUrl });
    kind = "resume";
    count = currentCount + 1;
  }

  const { data: sendData, error } = await resend.emails.send({
    from: "Discover More <noreply@send.discovermore.app>",
    to: [data.EMAIL],
    subject,
    html,
  });
  if (error) throw new Error(error.message);

  // Update the user doc
  if (kind === "results") {
    await docRef.update({
      resumeToken: token,
      resultsEmailSentAt: admin.firestore.Timestamp.now(),
    });
  } else {
    await docRef.update({
      resumeToken: token,
      resumeEmailSentAt: admin.firestore.Timestamp.now(),
      resumeEmailCount: admin.firestore.FieldValue.increment(1),
    });
  }

  // Persist the actual sent email to emailLog (audit + admin resend reference)
  try {
    await admin.firestore().collection("emailLog").add({
      sentAt: admin.firestore.Timestamp.now(),
      to: data.EMAIL,
      name: data.NAME || "",
      subject,
      html,
      resendId: sendData.id || null,
      userDocId: docRef.id,
      kind,
      count: count,
      forced: !!force,
      triggeredBy,
    });
  } catch (logErr) {
    console.error("[emailLog write failed — non-fatal]", logErr);
  }

  return { ok: true, sent: true, kind, resendId: sendData.id, email: data.EMAIL };
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
    // Was 24h. With a once-daily 9 AM run that meant anyone starting after 9 AM
    // waited nearly two days: five people registered 9:53 AM on 9 Aug, missed
    // Monday's run by 53 minutes, and would not have been contacted until
    // Tuesday. Two hours is still long enough that nobody mid-survey is nagged.
    const cutoffMs = Date.now() - 2 * 60 * 60 * 1000;
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
        if (createdMs === 0 || createdMs > cutoffMs) return; // still within the grace window
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
    secrets: ["RESEND_API_KEY", "DM_ADMIN_KEY"],
    maxInstances: 1,
    timeoutSeconds: 60,
  })
  .https.onRequest(async (req, res) => {
    if (req.query.key !== (process.env.DM_ADMIN_KEY || "").trim()) return res.status(403).send("Forbidden");
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
  .runWith({ secrets: ["DM_ADMIN_KEY"], maxInstances: 1, timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    if (req.query.key !== (process.env.DM_ADMIN_KEY || "").trim()) return res.status(403).send("Forbidden");

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
  .runWith({ secrets: ["DM_ADMIN_KEY"], maxInstances: 1, timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    if (req.query.key !== (process.env.DM_ADMIN_KEY || "").trim()) return res.status(403).send("Forbidden");

    const db = admin.firestore();
    const baseUrl = "https://us-central1-dm-auth-65cc4.cloudfunctions.net";
    const adminKey = encodeURIComponent(req.query.key);

    // Source 1: emailLog collection (per-send audit, kept going forward)
    const logSnapshot = await db.collection("emailLog").orderBy("sentAt", "desc").get();
    const logRows = [];
    logSnapshot.forEach((doc) => {
      const d = doc.data();
      const sentMs = d.sentAt && d.sentAt.toMillis ? d.sentAt.toMillis() : 0;
      logRows.push({
        source: "log",
        logId: doc.id,
        docId: d.userDocId || "",
        name: d.name || "(no name)",
        email: d.to || "",
        subject: d.subject || "",
        kind: d.kind || "?",
        count: d.count == null ? "—" : d.count,
        sentAt: sentMs ? new Date(sentMs).toISOString().slice(0, 16).replace("T", " ") : "?",
        sentMs,
        forced: !!d.forced,
        triggeredBy: d.triggeredBy || "",
      });
    });

    // Source 2: legacy fallback — users with sentAt timestamps on results doc but no emailLog
    // entry yet (sends that pre-date the emailLog collection).
    const loggedDocIds = new Set(logRows.map((r) => r.docId).filter(Boolean));
    const resultsSnapshot = await db.collection("results").get();
    const legacyRows = [];
    resultsSnapshot.forEach((docSnap) => {
      if (loggedDocIds.has(docSnap.id)) return;
      const d = docSnap.data();
      const isComplete = d.updated && d.updated !== "1";
      const lastMs = isComplete
        ? (d.resultsEmailSentAt && d.resultsEmailSentAt.toMillis ? d.resultsEmailSentAt.toMillis() : 0)
        : (d.resumeEmailSentAt && d.resumeEmailSentAt.toMillis ? d.resumeEmailSentAt.toMillis() : 0);
      if (!lastMs) return;
      legacyRows.push({
        source: "legacy",
        logId: null,
        docId: docSnap.id,
        name: d.NAME || "(no name)",
        email: d.EMAIL || "",
        subject: isComplete ? "Your Discover More results" : "Finish your Discover More survey",
        kind: isComplete ? "results" : "resume",
        count: d.resumeEmailCount == null ? "—" : (d.resumeEmailCount || 0),
        sentAt: new Date(lastMs).toISOString().slice(0, 16).replace("T", " "),
        sentMs: lastMs,
        forced: false,
        triggeredBy: "pre-emailLog",
      });
    });

    const allRows = [...logRows, ...legacyRows].sort((a, b) => b.sentMs - a.sentMs);
    const uniqueRecipients = new Set(allRows.map((r) => r.email)).size;

    const escapeHtml = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

    const previewBtn = (r) => {
      if (r.source === "log") {
        return `<a href="${baseUrl}/dmViewSentEmail?key=${adminKey}&logId=${encodeURIComponent(r.logId)}" target="_blank" style="display:inline-block;background:#4CAF50;color:#fff;text-decoration:none;font-weight:600;padding:0.35em 0.85em;border-radius:4px;font-size:0.82rem;">View</a>`;
      }
      if (r.docId) {
        return `<a href="${baseUrl}/dmViewSentEmail?key=${adminKey}&docId=${encodeURIComponent(r.docId)}" target="_blank" style="display:inline-block;background:#4CAF50;color:#fff;text-decoration:none;font-weight:600;padding:0.35em 0.85em;border-radius:4px;font-size:0.82rem;" title="Reconstructed from current template">View*</a>`;
      }
      return '<span style="color:#999;font-size:0.82rem;">—</span>';
    };
    const resendBtn = (r) => r.docId
      ? `<button onclick="resendOne('${r.docId}', this)" style="display:inline-block;background:#FFA34D;color:#fff;border:none;font-weight:600;padding:0.4em 0.9em;border-radius:4px;font-size:0.82rem;cursor:pointer;">Resend</button>`
      : '<span style="color:#999;font-size:0.82rem;">—</span>';

    const kindBadge = (kind) => {
      if (kind === "results") return '<span style="background:#e8f5ec;color:#2E7D32;padding:0.15em 0.5em;border-radius:3px;font-size:0.75rem;font-weight:600;">Results</span>';
      if (kind === "resume") return '<span style="background:#fff3e0;color:#a05400;padding:0.15em 0.5em;border-radius:3px;font-size:0.75rem;font-weight:600;">Resume</span>';
      return '<span style="background:#eee;color:#666;padding:0.15em 0.5em;border-radius:3px;font-size:0.75rem;">—</span>';
    };

    const row = (r) => `<tr>
      <td>${escapeHtml(r.name)}</td>
      <td><code>${escapeHtml(r.email)}</code></td>
      <td>${kindBadge(r.kind)}</td>
      <td style="text-align:center;">${r.count}</td>
      <td>${r.sentAt}</td>
      <td style="font-size:0.78rem;color:#757575;">${escapeHtml(r.triggeredBy)}${r.forced ? ' (forced)' : ''}</td>
      <td>${previewBtn(r)}</td>
      <td>${resendBtn(r)}</td>
    </tr>`;

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>DM Email Log</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: #1A1A1A; line-height: 1.5; max-width: 1280px; margin: 0 auto; padding: 2rem 1.5rem 4rem; background: #fff; }
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
</style>
<script>
async function resendOne(docId, btn) {
  if (!confirm("Resend the appropriate email (resume or results) to this user?")) return;
  btn.disabled = true; btn.textContent = "Sending...";
  try {
    const url = '${baseUrl}/dmAdminResend?key=${adminKey}&docId=' + encodeURIComponent(docId);
    const r = await fetch(url);
    const data = await r.json();
    if (data.sent) { btn.textContent = "✓ Sent"; btn.style.background = "#4CAF50"; }
    else if (data.skipped) { btn.textContent = "Skipped: " + data.skipped; }
    else { btn.textContent = "Failed"; btn.style.background = "#d32f2f"; }
  } catch (e) {
    btn.textContent = "Error"; btn.style.background = "#d32f2f";
    console.error(e);
  }
  setTimeout(() => { window.location.reload(); }, 1500);
}
</script>
</head>
<body>

<header>
  <h1>Discover More — Email Log</h1>
  <div class="sub">Every send recorded · Generated ${new Date().toISOString().replace("T", " ").slice(0,16)} UTC</div>
</header>

<div class="stats">
  <div class="stat"><div class="label">Sends recorded</div><div class="val">${allRows.length}</div></div>
  <div class="stat"><div class="label">Unique recipients</div><div class="val">${uniqueRecipients}</div></div>
  <div class="stat"><div class="label">From log</div><div class="val">${logRows.length}</div></div>
  <div class="stat"><div class="label">Legacy (pre-log)</div><div class="val">${legacyRows.length}</div></div>
</div>

<div class="note">
  <strong>View</strong> opens the rendered email body in a new tab. Rows marked <strong>View*</strong> are reconstructed from the current template (these are sends that pre-date the <code>emailLog</code> collection). <strong>Resend</strong> fires the appropriate email type (resume or results) for that user, bypassing dedupe and "already-sent" guards.
</div>

<table>
  <thead><tr>
    <th>Name</th>
    <th>Email</th>
    <th>Type</th>
    <th>#</th>
    <th>Sent (UTC)</th>
    <th>Trigger</th>
    <th>Preview</th>
    <th>Resend</th>
  </tr></thead>
  <tbody>
    ${allRows.length ? allRows.map(row).join("") : `<tr><td colspan="8" class="empty">No emails recorded yet.</td></tr>`}
  </tbody>
</table>

<footer>Project <code>dm-auth-65cc4</code> · ${allRows.length} sends · ${uniqueRecipients} recipients · Endpoints: <code>dmEmailLogReport</code> · <code>dmViewSentEmail</code> · <code>dmAdminResend</code></footer>

</body></html>`;

    res.set("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  });

// Render the resume email body for a given user (used by Email Log "View" buttons).
exports.dmViewSentEmail = functions
  .region("us-central1")
  .runWith({ secrets: ["DM_ADMIN_KEY"], maxInstances: 5, timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    if (req.query.key !== (process.env.DM_ADMIN_KEY || "").trim()) return res.status(403).send("Forbidden");
    const db = admin.firestore();

    // Preferred: stored html from emailLog (?logId=XXX) — exact bytes that were sent.
    if (req.query.logId && typeof req.query.logId === "string") {
      const logSnap = await db.collection("emailLog").doc(req.query.logId).get();
      if (!logSnap.exists) return res.status(404).send("Log entry not found");
      res.set("Content-Type", "text/html; charset=utf-8");
      return res.send(logSnap.data().html || "(no html stored)");
    }

    // Fallback: reconstruct from current template (?docId=XXX) — used for sends that
    // pre-date the emailLog collection.
    const docId = req.query.docId;
    if (!docId || typeof docId !== "string") return res.status(400).send("Need docId or logId");

    const docSnap = await db.collection("results").doc(docId).get();
    if (!docSnap.exists) return res.status(404).send("User not found");

    const d = docSnap.data();
    if (!d.resumeToken) return res.status(404).send("No email has been sent to this user yet (no resumeToken on doc)");

    const resumeUrl = `https://discovermore.app/app/?resume=${d.resumeToken}`;
    const firstName = (d.NAME || "").split(" ")[0] || "friend";
    const isComplete = d.updated && d.updated !== "1";
    const html = isComplete
      ? buildResultsEmailHtml({ firstName, resumeUrl })
      : buildResumeEmailHtml({ firstName, resumeUrl });

    res.set("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  });

// Admin-only resend — fires the appropriate email (resume or results) for a given user
// docId, bypassing dedupe/already-sent guards. Returns JSON with the result.
exports.dmAdminResend = functions
  .region("us-central1")
  .runWith({
    secrets: ["RESEND_API_KEY", "DM_ADMIN_KEY"],
    maxInstances: 5,
    timeoutSeconds: 30,
  })
  .https.onRequest(async (req, res) => {
    if (req.query.key !== (process.env.DM_ADMIN_KEY || "").trim()) return res.status(403).send("Forbidden");
    const docId = req.query.docId;
    if (!docId || typeof docId !== "string") return res.status(400).json({ error: "Need docId" });

    try {
      const db = admin.firestore();
      const result = await sendResumeEmailFor(
        db.collection("results").doc(docId),
        { force: true, triggeredBy: "admin-resend" }
      );
      return res.json(result);
    } catch (e) {
      console.error("[dmAdminResend] error:", e);
      return res.status(500).json({ error: String(e) });
    }
  });

const SPIRITUAL_GIFT_NAMES = [
  "Administration", "Apostleship", "Craftsmanship", "Discernment",
  "Evangelism", "Exhortation", "Faith", "Giving",
  "Healing", "Helps", "Hospitality", "Intercession",
  "Knowledge", "Leadership", "Mercy", "Miracles",
  "Missionary", "Music / Worship", "Pastor / Shepherd", "Prophecy",
  "Service", "Teaching", "Tongues (and Interpretation)", "Wisdom"
];

exports.dmAnalyticsReport = functions
  .region("us-central1")
  .runWith({ secrets: ["DM_ADMIN_KEY"], maxInstances: 1, timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    if (req.query.key !== (process.env.DM_ADMIN_KEY || "").trim()) return res.status(403).send("Forbidden");

    const db = admin.firestore();
    const snapshot = await db.collection("results").get();

    let total = 0;
    let completed = 0;
    const disc = { D: 0, I: 0, S: 0, C: 0 };
    const topGiftCounts = new Array(24).fill(0);
    const giftScoreSum = new Array(24).fill(0);
    const giftScoreN = new Array(24).fill(0);
    const monthlySignups = {};
    const monthlyCompletions = {};
    const platformCounts = {};
    const activity = { serving: 0, follow: 0, w1: 0, w2: 0, swag: 0, noServe: 0 };
    const daysToComplete = [];

    snapshot.forEach((docSnap) => {
      total++;
      const d = docSnap.data();

      const env = d.env || "Unknown";
      platformCounts[env] = (platformCounts[env] || 0) + 1;

      const createdMs = d.created && d.created.toMillis ? d.created.toMillis() : 0;
      if (createdMs) {
        const dt = new Date(createdMs);
        const m = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
        monthlySignups[m] = (monthlySignups[m] || 0) + 1;
      }

      const isComplete = d.updated && d.updated !== "1";
      if (!isComplete) return;
      completed++;

      if (/^\d+\/\d+\/\d+$/.test(d.updated)) {
        const [mo, dd, y] = d.updated.split("/");
        const compDate = new Date(`${y}-${mo.padStart(2, "0")}-${dd.padStart(2, "0")}T00:00:00Z`);
        const cm = `${compDate.getUTCFullYear()}-${String(compDate.getUTCMonth() + 1).padStart(2, "0")}`;
        monthlyCompletions[cm] = (monthlyCompletions[cm] || 0) + 1;
        if (createdMs) {
          const days = Math.round((compDate.getTime() - createdMs) / 86400000);
          if (days >= 0 && days < 365) daysToComplete.push(days);
        }
      }

      if (d.discH && disc.hasOwnProperty(d.discH)) disc[d.discH]++;

      // Gift scoring (24 gifts × 3 questions each)
      const scores = [];
      for (let i = 0; i < 24; i++) {
        const z1 = Number(d["ZZ" + (i + 1)]) || 0;
        const z2 = Number(d["ZZ" + (i + 25)]) || 0;
        const z3 = Number(d["ZZ" + (i + 49)]) || 0;
        const s = Math.min(z1 + z2 + z3, 9);
        scores.push({ idx: i, score: s });
        giftScoreSum[i] += s;
        giftScoreN[i]++;
      }
      scores.sort((a, b) => b.score - a.score);
      if (scores[0]) topGiftCounts[scores[0].idx]++;

      const isTrue = (v) => v === "true" || v === true;
      if (isTrue(d.Serving)) activity.serving++;
      if (isTrue(d.Follow)) activity.follow++;
      if (isTrue(d.W1)) activity.w1++;
      if (isTrue(d.W2)) activity.w2++;
      if (isTrue(d.Swag)) activity.swag++;
      if (isTrue(d.NoServe)) activity.noServe++;
    });

    const completionRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;
    const avgDays = daysToComplete.length
      ? Math.round((daysToComplete.reduce((a, b) => a + b, 0) / daysToComplete.length) * 10) / 10
      : 0;
    let topGiftIdx = 0;
    for (let i = 1; i < 24; i++) if (topGiftCounts[i] > topGiftCounts[topGiftIdx]) topGiftIdx = i;
    const topGiftName = topGiftCounts[topGiftIdx] > 0 ? SPIRITUAL_GIFT_NAMES[topGiftIdx] : "—";
    const topDiscEntry = Object.entries(disc).sort((a, b) => b[1] - a[1])[0];
    const topDisc = (topDiscEntry && topDiscEntry[1] > 0) ? topDiscEntry[0] : "—";

    const giftsRanked = topGiftCounts
      .map((count, idx) => ({
        name: SPIRITUAL_GIFT_NAMES[idx],
        count,
        avg: giftScoreN[idx] ? Math.round((giftScoreSum[idx] / giftScoreN[idx]) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);
    const top10Gifts = giftsRanked.slice(0, 10);

    const allMonths = Array.from(new Set([
      ...Object.keys(monthlySignups), ...Object.keys(monthlyCompletions)
    ])).sort();

    const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Discover More — Analytics</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  *,*::before,*::after { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: #1A1A1A; background: #F5F1E8; line-height: 1.5; }
  .wrap { max-width: 1240px; margin: 0 auto; padding: 2.5rem 1.5rem 4rem; }
  header { text-align: center; padding: 2rem 1rem 1.5rem; background: #FFFFFF; border-radius: 16px; margin-bottom: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.04); position: relative; overflow: hidden; }
  header::after { content:""; display: block; height: 4px; background: linear-gradient(90deg, #4CAF50 0%, #FFA34D 100%); position: absolute; bottom: 0; left: 0; right: 0; }
  header img { width: 220px; height: auto; display: block; margin: 0 auto 0.5rem; }
  header h1 { margin: 0.5rem 0 0.25rem; color: #2E7D32; font-size: 1.85rem; letter-spacing: -0.01em; }
  header .sub { color: #5a6478; font-size: 0.9rem; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.85rem; margin-bottom: 1.5rem; }
  .kpi { background: #FFFFFF; border-radius: 12px; padding: 1.1rem 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04); position: relative; overflow: hidden; }
  .kpi::before { content:""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--accent, #4CAF50); }
  .kpi .label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.12em; color: #757575; font-weight: 600; }
  .kpi .val { font-size: 2rem; font-weight: 700; color: #1B4B5A; line-height: 1.1; margin-top: 0.3rem; }
  .kpi .unit { font-size: 0.95rem; color: #5a6478; font-weight: 500; margin-left: 0.2em; }
  .kpi.green { --accent: #4CAF50; }
  .kpi.orange { --accent: #FFA34D; }
  .kpi.teal { --accent: #1B4B5A; }
  .kpi.tan { --accent: #D4B896; }
  .kpi.brown { --accent: #A67C52; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(440px, 1fr)); gap: 1.25rem; }
  .card { background: #FFFFFF; border-radius: 12px; padding: 1.4rem 1.4rem 1.6rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
  .card h2 { margin: 0 0 1rem; font-size: 1rem; color: #2E7D32; font-weight: 700; padding-bottom: 0.6rem; border-bottom: 2px solid #D4B896; letter-spacing: 0.02em; }
  .card .sub { font-size: 0.8rem; color: #757575; margin: -0.6rem 0 0.9rem; font-weight: 400; }
  .chart-box { position: relative; height: 320px; }
  .chart-box.tall { height: 420px; }
  footer { margin-top: 2rem; text-align: center; color: #757575; font-size: 0.78rem; }
  .tag { display: inline-block; background: #F5F1E8; color: #1B4B5A; padding: 0.18em 0.6em; border-radius: 4px; font-size: 0.78rem; font-weight: 600; }
  @media (max-width: 600px) {
    .wrap { padding: 1.25rem 0.75rem 2rem; }
    .grid { grid-template-columns: 1fr; }
    .kpi .val { font-size: 1.65rem; }
  }
</style></head>
<body>
<div class="wrap">

  <header>
    <img src="https://discovermore.app/DiscoverMoreLogo.png" alt="Discover More">
    <h1>Discover More — Analytics</h1>
    <div class="sub">Anchor Church · DISC + Spiritual Gifts surveys · Generated ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC</div>
  </header>

  <section class="kpis">
    <div class="kpi green"><div class="label">Total Signups</div><div class="val">${total.toLocaleString()}</div></div>
    <div class="kpi orange"><div class="label">Completed</div><div class="val">${completed.toLocaleString()}</div></div>
    <div class="kpi teal"><div class="label">Completion Rate</div><div class="val">${completionRate}<span class="unit">%</span></div></div>
    <div class="kpi tan"><div class="label">Avg Days to Complete</div><div class="val">${avgDays}<span class="unit">d</span></div></div>
    <div class="kpi brown"><div class="label">Most Common DISC</div><div class="val">${topDisc}</div></div>
    <div class="kpi green"><div class="label">Most Common Top Gift</div><div class="val" style="font-size:1.3rem;line-height:1.25;">${topGiftName}</div></div>
  </section>

  <section class="grid">

    <div class="card">
      <h2>DISC Personality Distribution</h2>
      <div class="sub">Among ${completed} completed surveys, by primary type (highest letter)</div>
      <div class="chart-box"><canvas id="discChart"></canvas></div>
    </div>

    <div class="card">
      <h2>Top 10 Spiritual Gifts</h2>
      <div class="sub">How often each gift is someone's #1 highest-scoring gift</div>
      <div class="chart-box tall"><canvas id="giftsChart"></canvas></div>
    </div>

    <div class="card">
      <h2>Signups vs Completions by Month</h2>
      <div class="sub">Monthly trend across all available data</div>
      <div class="chart-box"><canvas id="monthlyChart"></canvas></div>
    </div>

    <div class="card">
      <h2>Average Score per Gift</h2>
      <div class="sub">Mean score (3-9) across all completed surveys, all 24 gifts</div>
      <div class="chart-box tall"><canvas id="giftAvgChart"></canvas></div>
    </div>

    <div class="card">
      <h2>Platform Breakdown</h2>
      <div class="sub">Where users created their account</div>
      <div class="chart-box"><canvas id="platformChart"></canvas></div>
    </div>

    <div class="card">
      <h2>Engagement Flags</h2>
      <div class="sub">Counts across the full population (admin-set tags on each user)</div>
      <div class="chart-box"><canvas id="activityChart"></canvas></div>
    </div>

  </section>

  <footer>Project <code>dm-auth-65cc4</code> · ${snapshot.size} records scanned · Endpoint: <code>dmAnalyticsReport</code></footer>
</div>

<script>
  Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
  Chart.defaults.color = "#1A1A1A";
  Chart.defaults.plugins.legend.labels.font = { size: 12, weight: 500 };

  const PALETTE = ['#4CAF50','#FFA34D','#1B4B5A','#A67C52','#D4B896','#2E7D32','#FF9800','#5C8A92','#7CB342','#FFB74D'];

  // DISC donut
  new Chart(document.getElementById('discChart'), {
    type: 'doughnut',
    data: {
      labels: ['D — Dominant', 'I — Influential', 'S — Steady', 'C — Conscientious'],
      datasets: [{
        data: [${disc.D}, ${disc.I}, ${disc.S}, ${disc.C}],
        backgroundColor: ['#D04C4C', '#FFC107', '#4CAF50', '#1976D2'],
        borderWidth: 2, borderColor: '#fff',
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: { legend: { position: 'right' } } }
  });

  // Top 10 gifts horizontal bar
  new Chart(document.getElementById('giftsChart'), {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(top10Gifts.map(g => g.name))},
      datasets: [{
        data: ${JSON.stringify(top10Gifts.map(g => g.count))},
        backgroundColor: '#4CAF50', borderRadius: 4,
      }]
    },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => c.parsed.x + ' users' } } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  // Monthly stacked bar — signups + completions
  const months = ${JSON.stringify(allMonths)};
  const signupsByMonth = ${JSON.stringify(allMonths.map(m => monthlySignups[m] || 0))};
  const completionsByMonth = ${JSON.stringify(allMonths.map(m => monthlyCompletions[m] || 0))};
  new Chart(document.getElementById('monthlyChart'), {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        { label: 'Signups', data: signupsByMonth, backgroundColor: '#1B4B5A', borderRadius: 3 },
        { label: 'Completions', data: completionsByMonth, backgroundColor: '#FFA34D', borderRadius: 3 },
      ]
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { x: { stacked: false }, y: { stacked: false, beginAtZero: true, ticks: { precision: 0 } } } }
  });

  // Average score per gift
  const giftAvgLabels = ${JSON.stringify(SPIRITUAL_GIFT_NAMES)};
  const giftAvgData = ${JSON.stringify(giftScoreSum.map((s, i) => giftScoreN[i] ? Math.round((s / giftScoreN[i]) * 10) / 10 : 0))};
  new Chart(document.getElementById('giftAvgChart'), {
    type: 'bar',
    data: {
      labels: giftAvgLabels,
      datasets: [{ data: giftAvgData, backgroundColor: '#A67C52', borderRadius: 3 }]
    },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, max: 9, ticks: { stepSize: 1 } } } }
  });

  // Platform donut
  const platformEntries = Object.entries(${JSON.stringify(platformCounts)});
  new Chart(document.getElementById('platformChart'), {
    type: 'doughnut',
    data: {
      labels: platformEntries.map(e => e[0]),
      datasets: [{
        data: platformEntries.map(e => e[1]),
        backgroundColor: PALETTE,
        borderWidth: 2, borderColor: '#fff'
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: { legend: { position: 'right' } } }
  });

  // Activity flags
  const a = ${JSON.stringify(activity)};
  new Chart(document.getElementById('activityChart'), {
    type: 'bar',
    data: {
      labels: ['Currently Serving', 'Following Up', 'Attended W1', 'Attended W2', 'Swag Bag', 'Not Serving'],
      datasets: [{
        data: [a.serving, a.follow, a.w1, a.w2, a.swag, a.noServe],
        backgroundColor: ['#4CAF50','#FFA34D','#1B4B5A','#5C8A92','#A67C52','#D04C4C'],
        borderRadius: 4
      }]
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
</script>
</body></html>`;

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
// Help Chat report: every question and answer from helpChatLog, newest first.
exports.dmHelpChatReport = functions
  .region("us-central1")
  .runWith({ secrets: ["DM_ADMIN_KEY"], maxInstances: 1, timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    if (req.query.key !== (process.env.DM_ADMIN_KEY || "").trim()) return res.status(403).send("Forbidden");
    const escapeHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
    const snap = await admin.firestore().collection("helpChatLog").orderBy("at", "desc").limit(2000).get();
    const rows = [];
    snap.forEach((doc) => {
      const d = doc.data();
      rows.push(Object.assign({}, d, { ms: d.at && d.at.toMillis ? d.at.toMillis() : 0 }));
    });
    const now = Date.now();
    const in30 = rows.filter((r) => r.ms && now - r.ms <= 30 * 86400e3).length;
    const convos = rows.filter((r) => r.turn === 1).length;
    const problems = rows.filter((r) => r.status && r.status !== "ok").length;
    const tokIn = rows.reduce((a, r) => a + (r.inputTokens || 0), 0);
    const tokOut = rows.reduce((a, r) => a + (r.outputTokens || 0), 0);
    const cost = (tokIn / 1e6) * 1 + (tokOut / 1e6) * 5; // Claude Haiku 4.5 list price
    const hst = (ms) => ms ? new Date(ms - 10 * 3600e3).toISOString().slice(0, 16).replace("T", " ") : "?";
    const badge = (r) => (!r.status || r.status === "ok") ? "" : `<span style="background:#fff3e0;color:#a05400;border-radius:999px;padding:1px 8px;font-size:0.72rem;font-weight:700;margin-left:6px;">${escapeHtml(r.status)}</span>`;
    const who = (r) => escapeHtml(r.platform || "?") + (r.isAdmin ? ' <span style="background:#e8f5ec;color:#2E7D32;border-radius:999px;padding:1px 8px;font-size:0.72rem;font-weight:700;">admin</span>' : "");
    const short = (t) => { t = String(t || ""); return escapeHtml(t.slice(0, 90)) + (t.length > 90 ? "…" : ""); };
    const row = (r) => `<tr>
      <td style="white-space:nowrap;">${hst(r.ms)}</td>
      <td style="white-space:nowrap;">${who(r)}</td>
      <td style="text-align:center;">${r.turn || ""}</td>
      <td><strong>${escapeHtml(r.question)}</strong>${badge(r)}</td>
      <td><details><summary style="cursor:pointer;color:#1B4B5A;">${short(r.answer)}</summary><div style="white-space:pre-wrap;margin-top:6px;">${escapeHtml(r.answer)}</div></details></td>
    </tr>`;
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>DM Help Chat</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: #1A1A1A; line-height: 1.5; max-width: 1280px; margin: 0 auto; padding: 2rem 1.5rem 4rem; background: #fff; }
  header { border-bottom: 3px solid #4CAF50; padding-bottom: 1rem; margin-bottom: 2rem; }
  header h1 { margin: 0 0 0.25rem; font-size: 1.85rem; color: #2E7D32; }
  header .sub { color: #5a6478; font-size: 0.95rem; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0.75rem; margin: 1rem 0 2rem; }
  .stat { background: #F5F1E8; border-radius: 8px; padding: 0.85rem 1rem; }
  .stat .label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: #757575; font-weight: 600; }
  .stat .val { font-size: 1.75rem; font-weight: 700; color: #1B4B5A; line-height: 1.1; margin-top: 0.1rem; }
  table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 1rem; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.55rem 0.7rem; border-bottom: 1px solid #e8eaed; vertical-align: top; }
  th { background: #F5F1E8; font-weight: 600; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: #5a6478; border-bottom: 2px solid #d4b896; }
  code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 0.84rem; color: #1B4B5A; }
  .empty { text-align: center; color: #757575; padding: 2rem; font-style: italic; }
  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #d8dde6; color: #757575; font-size: 0.82rem; }
  .note { background: #eef4fb; border-left: 4px solid #8db4d8; padding: 0.75rem 1rem; border-radius: 0 6px 6px 0; font-size: 0.9rem; margin: 1rem 0; }
  #q { width: 100%; max-width: 420px; padding: 8px 10px; border: 1px solid #d8dde6; border-radius: 8px; font-size: 0.95rem; margin-bottom: 0.5rem; }
</style>
</head>
<body>
<header>
  <h1>Discover More — Help Chat</h1>
  <div class="sub">Every question asked in the app and on the website · Generated ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC · times below are Hawaiʻi time</div>
</header>
<div class="stats">
  <div class="stat"><div class="label">Questions asked</div><div class="val">${rows.length}</div></div>
  <div class="stat"><div class="label">Last 30 days</div><div class="val">${in30}</div></div>
  <div class="stat"><div class="label">Conversations</div><div class="val">${convos}</div></div>
  <div class="stat"><div class="label">Problems</div><div class="val">${problems}</div></div>
  <div class="stat"><div class="label">AI cost so far</div><div class="val">$${cost.toFixed(2)}</div></div>
</div>
<div class="note">Each row is one question. <strong>Turn</strong> 1 starts a conversation; 2, 3… are follow-ups in the same chat. Click an answer to read all of it. Use this to spot questions the chat answers badly, then improve its instructions. The chat is capped at ${HELP_CHAT_DAILY_CAP} questions a day.</div>
<input id="q" type="search" placeholder="Search questions and answers…" oninput="var t=this.value.toLowerCase();document.querySelectorAll('tbody tr').forEach(function(r){r.style.display=r.textContent.toLowerCase().indexOf(t)>=0?'':'none'})">
<table>
  <thead><tr><th>When (HST)</th><th>Where</th><th>Turn</th><th>Question</th><th>Answer</th></tr></thead>
  <tbody>
    ${rows.length ? rows.map(row).join("") : `<tr><td colspan="5" class="empty">No questions yet. They will appear here as soon as someone uses the help chat.</td></tr>`}
  </tbody>
</table>
<footer>Project <code>dm-auth-65cc4</code> · collection <code>helpChatLog</code> · model Claude Haiku 4.5 · Endpoints: <code>dmHelpChat</code> · <code>dmHelpChatReport</code></footer>
</body></html>`;
    res.set("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  });

// Signup Log: one row per person, built to help diagnose why someone is stuck.
// Read-only. Answers are only saved when a whole survey is finished (each new
// record starts with every answer set to 1), so the stage comes from discH
// (personality finished) and `updated` (gifts finished), never from answer counts.
exports.dmSignupLogReport = functions
  .region("us-central1")
  .runWith({ secrets: ["DM_ADMIN_KEY"], maxInstances: 1, timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    if (req.query.key !== (process.env.DM_ADMIN_KEY || "").trim()) return res.status(403).send("Forbidden");

    const db = admin.firestore();
    const baseUrl = "https://us-central1-dm-auth-65cc4.cloudfunctions.net";
    const adminKey = encodeURIComponent(req.query.key);
    const now = Date.now();
    const DAY = 86400000;
    const ms = (t) => (t && t.toMillis ? t.toMillis() : 0);

    const [resultsSnap, logSnap] = await Promise.all([
      db.collection("results").get(),
      db.collection("emailLog").orderBy("sentAt", "desc").get(),
    ]);

    // Emails per person, newest first
    const emailsByDoc = {};
    logSnap.forEach((doc) => {
      const d = doc.data();
      if (!d.userDocId) return;
      (emailsByDoc[d.userDocId] = emailsByDoc[d.userDocId] || []).push({
        logId: doc.id, kind: d.kind || "?", at: ms(d.sentAt), trigger: d.triggeredBy || "", forced: !!d.forced,
      });
    });

    const TYPO_DOMAINS = /@(gmial|gmal|gmaill|gnail|gamil|gmali|yaho|yahooo|hotmial|hotmal|iclod|icoud|outlok)\.|\.(con|cmo|ocm|comm|cm|co\.)$/i;
    const people = [];
    const byEmail = {};
    const byName = {};
    resultsSnap.forEach((snap) => {
      const d = snap.data();
      const email = String(d.EMAIL || "").trim().toLowerCase();
      const name = String(d.NAME || "").trim();
      const p = {
        id: snap.id,
        name, email,
        phone: String(d.Phone1 || "").trim(),
        env: d.env || "?",
        team: d.Team || "",
        created: ms(d.created),
        lastSaved: snap.updateTime ? snap.updateTime.toMillis() : 0,
        personalityDone: !!d.discH,
        complete: !!(d.updated && d.updated !== "1"),
        completedOn: d.updated && d.updated !== "1" ? d.updated : "",
        disc: d.discH ? d.discH + (d.discL ? "/" + d.discL : "") : "",
        resultsEmailAt: ms(d.resultsEmailSentAt),
        resumeCount: Number(d.resumeEmailCount || 0),
        resumeLastAt: ms(d.resumeEmailSentAt),
        emails: emailsByDoc[snap.id] || [],
        flags: [],
      };
      p.stage = p.complete ? "complete" : p.personalityDone ? "gifts" : "personality";
      people.push(p);
      if (email) (byEmail[email] = byEmail[email] || []).push(p);
      if (name) (byName[name.toLowerCase()] = byName[name.toLowerCase()] || []).push(p);
    });

    // Only flag "stuck" for recent signups, and only expect a results email for
    // web records finished after results emails started (older records never got one).
    const RECENT = 45 * DAY;
    const firstResultsEmail = Math.min(...people.map((p) => p.resultsEmailAt).filter(Boolean), now);
    for (const p of people) {
      const f = p.flags;
      const recent = now - p.created <= RECENT;
      const sameEmail = p.email ? byEmail[p.email].length : 0;
      if (sameEmail > 1) f.push({ k: "dup", t: `Same email on ${sameEmail} records` });
      const sameName = p.name ? byName[p.name.toLowerCase()].filter((o) => o.email !== p.email).length : 0;
      if (sameName > 0) f.push({ k: "dup", t: `Same name on ${sameName} other record${sameName > 1 ? "s" : ""} (different email)` });
      if (!p.email) f.push({ k: "email", t: "No email" });
      else if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(p.email) || TYPO_DOMAINS.test(p.email)) f.push({ k: "email", t: "Email looks mistyped" });
      if (!p.name) f.push({ k: "data", t: "No name" });
      const idle = p.lastSaved ? now - p.lastSaved : now - p.created;
      if (!p.complete && recent && idle >= 2 * DAY) {
        f.push({ k: "stuck", t: p.personalityDone
          ? `Stopped before Spiritual Gifts for ${Math.floor(idle / DAY)} days`
          : `Never finished Personality (${Math.floor(idle / DAY)} days)` });
      }
      if (!p.complete && recent && p.resumeCount >= 3) f.push({ k: "stuck", t: "Got all 3 reminder emails, still not finished" });
      const hasResultsLog = p.emails.some((e) => e.kind === "results");
      if (p.complete && p.env === "Web" && p.lastSaved > firstResultsEmail && !p.resultsEmailAt && !hasResultsLog) f.push({ k: "email", t: "Finished but results email never sent" });
      if (/\btest\b/i.test(p.name) || /test/i.test(p.email.split("@")[0] || "")) f.push({ k: "test", t: "Looks like a test record" });
    }

    people.sort((a, b) => b.created - a.created);

    const hst = (t) => t ? new Date(t).toLocaleString("en-US", { timeZone: "Pacific/Honolulu", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
    const monthKey = (t) => t ? new Date(t).toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" }).slice(0, 7) : "";
    const out = people.map((p) => Object.assign({}, p, {
      createdStr: hst(p.created), lastSavedStr: hst(p.lastSaved), month: monthKey(p.created),
      resultsEmailStr: hst(p.resultsEmailAt), resumeLastStr: hst(p.resumeLastAt),
      emails: p.emails.map((e) => Object.assign({}, e, { atStr: hst(e.at) })),
    }));
    const json = JSON.stringify(out).replace(/</g, "\\u003c");

    const thisMonth = monthKey(now);

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DM Signup Log</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: #1A1A1A; line-height: 1.5; max-width: 1280px; margin: 0 auto; padding: 2rem 1.5rem 4rem; background: #fff; }
  header { border-bottom: 3px solid #4CAF50; padding-bottom: 1rem; margin-bottom: 1.5rem; }
  header h1 { margin: 0 0 0.25rem; font-size: 1.85rem; color: #2E7D32; }
  header .sub { color: #5a6478; font-size: 0.95rem; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; margin: 1rem 0 1.5rem; }
  .stat { background: #F5F1E8; border-radius: 8px; padding: 0.85rem 1rem; }
  .stat .label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: #757575; font-weight: 600; }
  .stat .val { font-size: 1.75rem; font-weight: 700; color: #1B4B5A; line-height: 1.1; margin-top: 0.1rem; }
  .stat.warn .val { color: #a05400; }
  .tools { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 1rem; }
  .tools input, .tools select { padding: 0.5rem 0.7rem; border: 1px solid #cfd5dd; border-radius: 6px; font: inherit; font-size: 0.9rem; }
  .tools input { flex: 1; min-width: 220px; }
  .chip { border: 1px solid #cfd5dd; background: #fff; border-radius: 999px; padding: 0.35rem 0.85rem; font: inherit; font-size: 0.85rem; cursor: pointer; color: #1B4B5A; }
  .chip.on { background: #2E7D32; border-color: #2E7D32; color: #fff; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.55rem 0.7rem; border-bottom: 1px solid #e8eaed; vertical-align: top; }
  th { background: #F5F1E8; font-weight: 600; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: #5a6478; border-bottom: 2px solid #d4b896; }
  tr.row { cursor: pointer; } tr.row:hover td { background: #fafaf7; }
  tr.open td { background: #f6faf6; }
  code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 0.82rem; color: #1B4B5A; }
  .sub2 { color: #757575; font-size: 0.8rem; }
  .pill { display: inline-block; padding: 0.1em 0.55em; border-radius: 4px; font-size: 0.75rem; font-weight: 600; white-space: nowrap; }
  .p-complete { background: #e8f5ec; color: #2E7D32; } .p-gifts { background: #fff3e0; color: #a05400; } .p-personality { background: #eef1f5; color: #5a6478; }
  .flag { display: inline-block; margin: 0 0.3rem 0.3rem 0; padding: 0.1em 0.5em; border-radius: 4px; font-size: 0.75rem; }
  .f-stuck { background: #fff3e0; color: #a05400; } .f-dup { background: #eef4fb; color: #1d5a91; } .f-email, .f-data { background: #fdecea; color: #b3261e; } .f-test { background: #eee; color: #666; }
  .detail td { background: #fbfcfb; padding: 1rem 1.2rem 1.3rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 0.4rem 2rem; font-size: 0.88rem; }
  .grid b { color: #5a6478; font-weight: 600; display: inline-block; min-width: 9.5em; }
  .why { margin: 0.8rem 0; padding: 0.6rem 0.9rem; background: #eef4fb; border-left: 4px solid #8db4d8; border-radius: 0 6px 6px 0; font-size: 0.88rem; }
  .btn { display: inline-block; border: none; border-radius: 4px; padding: 0.4em 0.9em; font: inherit; font-size: 0.82rem; font-weight: 600; cursor: pointer; text-decoration: none; color: #fff; margin-right: 0.4rem; }
  .b-green { background: #4CAF50; } .b-orange { background: #FFA34D; } .b-blue { background: #1B4B5A; }
  .empty { text-align: center; color: #757575; padding: 2rem; font-style: italic; }
  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #d8dde6; color: #757575; font-size: 0.82rem; }
  @media (max-width: 760px) { .hide-sm { display: none; } body { padding: 1rem 0.75rem 3rem; } }
</style>
</head>
<body>
<header>
  <h1>Discover More — Signup Log</h1>
  <div class="sub">Everyone who has signed up, where they got to, and anything that looks wrong · Times in Hawaiʻi time · Generated ${hst(now)}</div>
</header>

<div class="stats">
  <div class="stat"><div class="label">Signups</div><div class="val" id="kSign"></div></div>
  <div class="stat"><div class="label">Finished both</div><div class="val" id="kDone"></div></div>
  <div class="stat"><div class="label">Not finished</div><div class="val" id="kOpen"></div></div>
  <div class="stat warn"><div class="label">Duplicate records</div><div class="val" id="kDup"></div></div>
  <div class="stat warn"><div class="label">May need help</div><div class="val" id="kHelp"></div></div>
</div>

<div class="tools">
  <input id="q" type="search" placeholder="Search name, email or phone">
  <select id="month"></select>
  <button class="chip on" data-f="all">All</button>
  <button class="chip" data-f="help">May need help</button>
  <button class="chip" data-f="dup">Duplicates</button>
  <button class="chip" data-f="personality">Signed up only</button>
  <button class="chip" data-f="gifts">Personality done</button>
  <button class="chip" data-f="complete">Finished</button>
</div>

<table>
  <thead><tr><th>Name</th><th class="hide-sm">Email</th><th>Signed up</th><th>Where they are</th><th class="hide-sm">Device</th><th>Notes</th></tr></thead>
  <tbody id="rows"></tbody>
</table>
<div id="count" class="sub2" style="margin-top:0.6rem;"></div>

<footer>Project <code>dm-auth-65cc4</code> · collections <code>results</code> + <code>emailLog</code> · Answers are saved only when a whole survey is finished, so someone who quits halfway loses that survey's answers · Endpoint <code>dmSignupLogReport</code></footer>

<script>
const PEOPLE = ${json};
const BASE = ${JSON.stringify(baseUrl)}, KEY = ${JSON.stringify(adminKey)};
const STAGE = { personality: ["Signed up", "Hasn't finished the Personality survey yet"], gifts: ["Personality done", "Finished Personality; Spiritual Gifts not finished"], complete: ["Finished both", ""] };
const DEVICE = { Web: "Web", IOS: "iPhone app", Android: "Android app", ANDROID: "Android app", "?": "Unknown (older record)" };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c]));
let filter = "all", openId = null;

const THIS_MONTH = ${JSON.stringify(thisMonth)};
const months = [...new Set([THIS_MONTH, ...PEOPLE.map((p) => p.month).filter(Boolean)])].sort().reverse();
const msel = document.getElementById("month");
months.forEach((m) => { const o = document.createElement("option"); o.value = m;
  o.textContent = new Date(m + "-15").toLocaleDateString("en-US", { month: "long", year: "numeric" }) + (m === THIS_MONTH ? " (this month)" : ""); msel.appendChild(o); });
{ const o = document.createElement("option"); o.value = ""; o.textContent = "All months"; msel.appendChild(o); }
msel.value = THIS_MONTH;
const isHelp = (p) => p.flags.some((f) => f.k !== "test");
const isDup = (p) => p.flags.some((f) => f.k === "dup");
function kpis() {
  const inMonth = PEOPLE.filter((p) => !msel.value || p.month === msel.value);
  const set = (id, v) => { document.getElementById(id).textContent = v; };
  set("kSign", inMonth.length); set("kDone", inMonth.filter((p) => p.complete).length);
  set("kOpen", inMonth.filter((p) => !p.complete).length); set("kDup", inMonth.filter(isDup).length);
  set("kHelp", inMonth.filter(isHelp).length);
}

function whatToTry(p) {
  const tips = [];
  if (p.flags.some((f) => f.t.startsWith("Same email"))) tips.push("They have more than one record. Ask which one they're using; the newest may be empty while an older one holds their answers.");
  if (p.flags.some((f) => f.t.startsWith("Same name"))) tips.push("Someone with the same name signed up with a different email. They may have typed a different email the second time.");
  if (p.flags.some((f) => f.t === "Email looks mistyped")) tips.push("The email looks mistyped, so reminder and results emails may never arrive.");
  if (p.stage === "personality") tips.push("Answers are only saved at the end of each survey. If they closed the page partway through, they start that survey again.");
  if (p.stage === "gifts") tips.push("Their Personality answers are saved. They only need to do Spiritual Gifts (72 questions); quitting halfway means starting it again.");
  if (!p.complete && p.resumeCount) tips.push("They've had " + p.resumeCount + " reminder email" + (p.resumeCount > 1 ? "s" : "") + " with a link back in. Ask them to check spam, or press Resend below.");
  if (p.flags.some((f) => f.t.startsWith("Finished but"))) tips.push("They finished but no results email was sent. Resend below sends it.");
  if (p.complete && (p.resultsEmailAt || p.emails.some((e) => e.kind === "results"))) tips.push("Results email was sent " + (p.resultsEmailStr || "") + ". If they can't find it, check spam or Resend.");
  return tips;
}

function summary(p) {
  return [
    "Discover More signup",
    "Name: " + p.name, "Email: " + p.email, p.phone ? "Phone: " + p.phone : "",
    "Device: " + (DEVICE[p.env] || p.env),
    "Signed up: " + p.createdStr, "Last saved: " + p.lastSavedStr,
    "Where they are: " + STAGE[p.stage][0] + (p.completedOn ? " (" + p.completedOn + ")" : ""),
    p.disc ? "DISC: " + p.disc : "",
    "Reminder emails: " + p.resumeCount + (p.resumeLastStr ? " (last " + p.resumeLastStr + ")" : ""),
    "Results email: " + (p.resultsEmailStr || "not sent"),
    p.flags.length ? "Notes: " + p.flags.map((f) => f.t).join("; ") : "",
    "Record: " + p.id,
  ].filter(Boolean).join("\\n");
}

function detail(p) {
  const emails = p.emails.length ? p.emails.map((e) =>
    '<div>' + esc(e.atStr) + ' · ' + (e.kind === "results" ? "Results" : e.kind === "resume" ? "Reminder" : esc(e.kind)) +
    (e.trigger && e.trigger !== "unknown" ? ' <span class="sub2">(' + esc(e.trigger) + (e.forced ? ", resent by hand" : "") + ')</span>' : '') +
    ' · <a target="_blank" href="' + BASE + '/dmViewSentEmail?key=' + KEY + '&logId=' + encodeURIComponent(e.logId) + '">View</a></div>').join("")
    : '<div class="sub2">None recorded</div>';
  const tips = whatToTry(p);
  const others = PEOPLE.filter((o) => o.id !== p.id && ((p.email && o.email === p.email) || (p.name && o.name.toLowerCase() === p.name.toLowerCase())));
  const otherHtml = others.length ? '<div style="margin:0.6rem 0;"><strong style="font-size:0.85rem;">Their other records</strong>' + others.map((o) =>
    '<div><a href="#" onclick="event.preventDefault();event.stopPropagation();jump(\\'' + o.id + '\\')">' + esc(o.name) + '</a> · <code>' + esc(o.email) + '</code> · signed up ' + esc(o.createdStr) +
    ' · <span class="pill p-' + o.stage + '">' + STAGE[o.stage][0] + '</span></div>').join("") + '</div>' : '';
  return '<tr class="detail"><td colspan="6">' +
    '<div class="grid">' +
      '<div><b>Name</b>' + esc(p.name || "(none)") + '</div>' +
      '<div><b>Email</b><code>' + esc(p.email || "(none)") + '</code></div>' +
      '<div><b>Phone</b>' + esc(p.phone || "(none)") + '</div>' +
      '<div><b>Device</b>' + esc(DEVICE[p.env] || p.env) + '</div>' +
      '<div><b>Signed up</b>' + esc(p.createdStr) + '</div>' +
      '<div><b>Last saved</b>' + esc(p.lastSavedStr) + '</div>' +
      '<div><b>Where they are</b>' + esc(STAGE[p.stage][0]) + (p.completedOn ? ' (' + esc(p.completedOn) + ')' : '') + '</div>' +
      '<div><b>DISC result</b>' + esc(p.disc || "(not yet)") + '</div>' +
      '<div><b>Reminder emails</b>' + p.resumeCount + (p.resumeLastStr ? ' (last ' + esc(p.resumeLastStr) + ')' : '') + '</div>' +
      '<div><b>Results email</b>' + esc(p.resultsEmailStr || "not sent") + '</div>' +
      (p.team ? '<div><b>Team</b>' + esc(p.team) + '</div>' : '') +
      '<div><b>Record</b><code>' + esc(p.id) + '</code></div>' +
    '</div>' +
    (tips.length ? '<div class="why"><strong>What to try</strong><ul style="margin:0.3rem 0 0;padding-left:1.2rem;">' + tips.map((t) => '<li>' + esc(t) + '</li>').join("") + '</ul></div>' : '') +
    otherHtml +
    '<div style="margin:0.6rem 0 0.9rem;"><strong style="font-size:0.85rem;">Emails sent</strong>' + emails + '</div>' +
    '<button class="btn b-blue" onclick="copySummary(event,\\'' + p.id + '\\')">Copy summary</button>' +
    (p.email ? '<button class="btn b-orange" onclick="resendOne(event,\\'' + p.id + '\\',this)">Resend ' + (p.complete ? "results" : "reminder") + ' email</button>' : '') +
    '</td></tr>';
}

function render() {
  const q = document.getElementById("q").value.trim().toLowerCase();
  const m = msel.value;
  const list = PEOPLE.filter((p) => {
    if (m && p.month !== m) return false;
    if (filter === "help" && !isHelp(p)) return false;
    if (filter === "dup" && !isDup(p)) return false;
    if (["personality", "gifts", "complete"].includes(filter) && p.stage !== filter) return false;
    if (q && !(p.name.toLowerCase().includes(q) || p.email.includes(q) || p.phone.replace(/\\D/g, "").includes(q.replace(/\\D/g, "") || "~"))) return false;
    return true;
  });
  document.getElementById("rows").innerHTML = list.length ? list.map((p) =>
    '<tr class="row' + (p.id === openId ? ' open' : '') + '" onclick="toggle(\\'' + p.id + '\\')">' +
      '<td><strong>' + esc(p.name || "(no name)") + '</strong>' + (p.phone ? '<div class="sub2">' + esc(p.phone) + '</div>' : '') + '</td>' +
      '<td class="hide-sm"><code>' + esc(p.email) + '</code></td>' +
      '<td>' + esc(p.createdStr) + '</td>' +
      '<td><span class="pill p-' + p.stage + '">' + STAGE[p.stage][0] + '</span>' + (p.completedOn ? '<div class="sub2">' + esc(p.completedOn) + '</div>' : '') + '</td>' +
      '<td class="hide-sm">' + esc(DEVICE[p.env] || p.env) + '</td>' +
      '<td>' + p.flags.map((f) => '<span class="flag f-' + f.k + '">' + esc(f.t) + '</span>').join("") + '</td>' +
    '</tr>' + (p.id === openId ? detail(p) : '')).join("")
    : '<tr><td colspan="6" class="empty">' + (msel.value && !PEOPLE.some((p) => p.month === msel.value) ? "No signups yet in " + msel.options[msel.selectedIndex].text.replace(" (this month)", "") + ". Pick an earlier month above." : "Nobody matches.") + '</td></tr>';
  kpis();
  document.getElementById("count").textContent = list.length + " of " + PEOPLE.length + " shown · click a row for details";
}
function jump(id) {
  document.getElementById("q").value = ""; msel.value = ""; filter = "all";
  document.querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x.dataset.f === "all"));
  openId = id; render();
  const el = document.querySelector("tr.open"); if (el) el.scrollIntoView({ block: "center" });
}
function toggle(id) { openId = openId === id ? null : id; render(); }
function copySummary(ev, id) {
  ev.stopPropagation();
  const p = PEOPLE.find((x) => x.id === id);
  navigator.clipboard.writeText(summary(p)).then(() => { ev.target.textContent = "Copied"; setTimeout(() => { ev.target.textContent = "Copy summary"; }, 1500); });
}
async function resendOne(ev, docId, btn) {
  ev.stopPropagation();
  if (btn.dataset.armed !== "1") { btn.dataset.label = btn.textContent; btn.dataset.armed = "1"; btn.textContent = "Click again to send"; setTimeout(() => { if (btn.dataset.armed === "1") { btn.dataset.armed = ""; btn.textContent = btn.dataset.label; } }, 4000); return; }
  btn.dataset.armed = ""; btn.disabled = true; btn.textContent = "Sending...";
  try {
    const r = await fetch(BASE + "/dmAdminResend?key=" + KEY + "&docId=" + encodeURIComponent(docId));
    const data = await r.json();
    btn.textContent = data.sent ? "Sent" : data.skipped ? "Skipped: " + data.skipped : "Failed";
    btn.style.background = data.sent ? "#4CAF50" : "#d32f2f";
  } catch (e) { btn.textContent = "Error"; btn.style.background = "#d32f2f"; }
}
document.getElementById("q").addEventListener("input", render);
msel.addEventListener("change", render);
document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => {
  document.querySelectorAll(".chip").forEach((x) => x.classList.remove("on")); c.classList.add("on"); filter = c.dataset.f; render();
}));
render();
</script>
</body></html>`;

    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "no-store");
    return res.send(html);
  });

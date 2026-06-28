const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
//  IN-MEMORY CONFIG STORE (Owner: SHAD DON)
// ============================================

const config = {
  PAGE_ACCESS_TOKEN: "",
  VERIFY_TOKEN: "",
  autoReplyText: "Hello! This is an automatic reply.",
  botActive: true,
  welcomeMessage: "Welcome! How can I help you today?",
  unidentifiedReply: "Sorry, I didn't understand that. Type 'help' for options.",
};

const messageLogs = [];
const stats = {
  totalReceived: 0,
  totalReplied: 0,
  totalErrors: 0,
  startTime: new Date(),
};

// ============================================
//  HELPER: Send Facebook Message
// ============================================

async function sendFBMessage(senderId, text) {
  if (!config.PAGE_ACCESS_TOKEN) {
    console.error("[BOT] PAGE_ACCESS_TOKEN not set!");
    stats.totalErrors++;
    return false;
  }

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v23.0/me/messages?access_token=${config.PAGE_ACCESS_TOKEN}`,
      {
        recipient: { id: senderId },
        message: { text: text },
      }
    );
    stats.totalReplied++;
    console.log(`[BOT] Message sent to ${senderId}`);
    return true;
  } catch (error) {
    stats.totalErrors++;
    const errMsg = error.response?.data || error.message;
    console.error("[BOT] Send error:", JSON.stringify(errMsg));
    return false;
  }
}

// ============================================
//  HELPER: Process Incoming Message
// ============================================

function processMessage(text) {
  if (!config.botActive) return null;

  const lower = text.toLowerCase().trim();

  if (lower === "help" || lower === "menu") {
    return (
      "📋 *Main Menu*\n\n" +
      "1️⃣ Type 'info' — About us\n" +
      "2️⃣ Type 'hours' — Business hours\n" +
      "3️⃣ Type 'contact' — Contact details\n" +
      "4️⃣ Type 'services' — Our services\n" +
      "5️⃣ Type 'hello' — Greet us\n\n" +
      "Or just type anything and we'll get back to you!"
    );
  }

  const responses = {
    hello: config.welcomeMessage,
    hi: config.welcomeMessage,
    hey: config.welcomeMessage,
    info: "ℹ️ We are a professional team dedicated to providing the best service. Founded by MR SURAJ, we believe in quality and commitment.",
    hours: "🕐 Business Hours:\n\nMonday - Friday: 9:00 AM - 6:00 PM\nSaturday: 10:00 AM - 4:00 PM\nSunday: Closed",
    contact: "📞 Contact Us:\n\nEmail: contact@example.com\nPhone: +92-XXX-XXXXXXX\nAddress: Your City, Your Country",
    services: "🛠️ Our Services:\n\n✅ Web Development\n✅ App Development\n✅ Graphic Design\n✅ Digital Marketing\n✅ SEO Optimization\n✅ Social Media Management",
    thanks: "You're welcome! 😊 Feel free to ask anything else.",
    thank you: "You're welcome! 😊 Feel free to ask anything else.",
    bye: "Goodbye! 👋 Have a great day! We're here whenever you need us.",
  };

  for (const [key, value] of Object.entries(responses)) {
    if (lower.includes(key)) return value;
  }

  return config.autoReplyText;
}

// ============================================
//  WEBHOOK: Verification (GET)
// ============================================

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.VERIFY_TOKEN && config.VERIFY_TOKEN) {
    console.log("[WEBHOOK] Verified successfully");
    res.status(200).send(challenge);
  } else {
    console.log("[WEBHOOK] Verification failed");
    res.sendStatus(403);
  }
});

// ============================================
//  WEBHOOK: Receive Messages (POST)
// ============================================

app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    res.sendStatus(200);

    for (const entry of body.entry) {
      const webhookEvent = entry.messaging?.[0];
      if (!webhookEvent?.sender) continue;

      const senderId = webhookEvent.sender.id;
      const messageText = webhookEvent.message?.text;

      // Skip echoes and non-text messages
      if (webhookEvent.message?.is_echo || !messageText) continue;

      stats.totalReceived++;

      // Log message
      const logEntry = {
        id: crypto.randomBytes(8).toString("hex"),
        timestamp: new Date().toISOString(),
        senderId: senderId,
        receivedText: messageText,
        sentText: null,
        status: "pending",
      };

      const replyText = processMessage(messageText);

      if (replyText) {
        const success = await sendFBMessage(senderId, replyText);
        logEntry.sentText = replyText;
        logEntry.status = success ? "sent" : "failed";
      } else {
        logEntry.status = "bot_off";
      }

      messageLogs.unshift(logEntry);
      if (messageLogs.length > 200) messageLogs.pop();
    }
  } else {
    res.sendStatus(404);
  }
});

// ============================================
//  API: Get Status
// ============================================

app.get("/api/status", (req, res) => {
  res.json({
    botActive: config.botActive,
    tokenSet: !!config.PAGE_ACCESS_TOKEN,
    verifyTokenSet: !!config.VERIFY_TOKEN,
    totalReceived: stats.totalReceived,
    totalReplied: stats.totalReplied,
    totalErrors: stats.totalErrors,
    uptime: Math.floor((Date.now() - stats.startTime.getTime()) / 1000),
    lastActivity: messageLogs[0]?.timestamp || null,
  });
});

// ============================================
//  API: Get Config
// ============================================

app.get("/api/config", (req, res) => {
  res.json({
    autoReplyText: config.autoReplyText,
    welcomeMessage: config.welcomeMessage,
    unidentifiedReply: config.unidentifiedReply,
    botActive: config.botActive,
    tokenSet: !!config.PAGE_ACCESS_TOKEN,
    verifyTokenSet: !!config.VERIFY_TOKEN,
    pageTokenPreview: config.PAGE_ACCESS_TOKEN
      ? config.PAGE_ACCESS_TOKEN.slice(0, 8) + "..." + config.PAGE_ACCESS_TOKEN.slice(-4)
      : "",
    verifyTokenPreview: config.VERIFY_TOKEN
      ? config.VERIFY_TOKEN.slice(0, 3) + "***"
      : "",
  });
});

// ============================================
//  API: Update Config
// ============================================

app.post("/api/config", (req, res) => {
  const { pageAccessToken, verifyToken, autoReplyText, welcomeMessage, unidentifiedReply, botActive } = req.body;

  if (pageAccessToken !== undefined && pageAccessToken !== "") {
    config.PAGE_ACCESS_TOKEN = pageAccessToken;
  }
  if (verifyToken !== undefined && verifyToken !== "") {
    config.VERIFY_TOKEN = verifyToken;
  }
  if (autoReplyText !== undefined) {
    config.autoReplyText = autoReplyText;
  }
  if (welcomeMessage !== undefined) {
    config.welcomeMessage = welcomeMessage;
  }
  if (unidentifiedReply !== undefined) {
    config.unidentifiedReply = unidentifiedReply;
  }
  if (botActive !== undefined) {
    config.botActive = botActive;
  }

  res.json({ success: true, message: "Configuration updated successfully!" });
});

// ============================================
//  API: Toggle Bot
// ============================================

app.post("/api/toggle", (req, res) => {
  config.botActive = !config.botActive;
  res.json({ success: true, botActive: config.botActive });
});

// ============================================
//  API: Get Logs
// ============================================

app.get("/api/logs", (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(messageLogs.slice(0, limit));
});

// ============================================
//  API: Clear Logs
// ============================================

app.post("/api/logs/clear", (req, res) => {
  messageLogs.length = 0;
  res.json({ success: true, message: "Logs cleared" });
});

// ============================================
//  API: Test Send Message
// ============================================

app.post("/api/test-send", async (req, res) => {
  const { recipientId, message } = req.body;
  if (!recipientId || !message) {
    return res.status(400).json({ error: "recipientId and message are required" });
  }
  const success = await sendFBMessage(recipientId, message);
  res.json({ success });
});

// ============================================
//  DASHBOARD HTML (Professional UI)
// ============================================

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Messenger Bot Dashboard — MR SURAJ</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
  /* ===== CSS VARIABLES ===== */
  :root {
    --bg-primary: #0a0e17;
    --bg-secondary: #111827;
    --bg-card: #1a2235;
    --bg-card-hover: #1f2a40;
    --bg-input: #0d1321;
    --border: #2a3550;
    --border-focus: #00e68a;
    --text-primary: #e8ecf4;
    --text-secondary: #8892a8;
    --text-muted: #5a6478;
    --accent: #00e68a;
    --accent-dim: rgba(0,230,138,0.15);
    --accent-glow: rgba(0,230,138,0.3);
    --danger: #ff4757;
    --danger-dim: rgba(255,71,87,0.15);
    --warning: #ffa502;
    --warning-dim: rgba(255,165,2,0.15);
    --info: #3b82f6;
    --info-dim: rgba(59,130,246,0.15);
    --sidebar-w: 260px;
    --radius: 12px;
    --radius-sm: 8px;
    --transition: 0.3s cubic-bezier(0.4,0,0.2,1);
  }

  /* ===== RESET ===== */
  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

  html { scroll-behavior: smooth; }

  body {
    font-family: 'Space Grotesk', sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* ===== ANIMATED BACKGROUND ===== */
  .bg-glow {
    position: fixed; inset: 0; z-index: 0; pointer-events: none;
    overflow: hidden;
  }
  .bg-glow::before {
    content: '';
    position: absolute;
    top: -30%; left: -20%;
    width: 600px; height: 600px;
    background: radial-gradient(circle, rgba(0,230,138,0.06) 0%, transparent 70%);
    animation: floatBlob 20s ease-in-out infinite;
  }
  .bg-glow::after {
    content: '';
    position: absolute;
    bottom: -20%; right: -15%;
    width: 500px; height: 500px;
    background: radial-gradient(circle, rgba(59,130,246,0.05) 0%, transparent 70%);
    animation: floatBlob 25s ease-in-out infinite reverse;
  }
  @keyframes floatBlob {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(80px, -60px) scale(1.1); }
    66% { transform: translate(-40px, 40px) scale(0.95); }
  }

  /* ===== SIDEBAR ===== */
  .sidebar {
    position: fixed; top: 0; left: 0;
    width: var(--sidebar-w); height: 100vh;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border);
    z-index: 100;
    display: flex; flex-direction: column;
    transition: transform var(--transition);
  }
  .sidebar-header {
    padding: 28px 24px 20px;
    border-bottom: 1px solid var(--border);
  }
  .sidebar-logo {
    display: flex; align-items: center; gap: 12px;
  }
  .sidebar-logo .logo-icon {
    width: 42px; height: 42px;
    background: linear-gradient(135deg, var(--accent), #00b368);
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; color: #0a0e17; font-weight: 700;
    box-shadow: 0 4px 20px var(--accent-glow);
  }
  .sidebar-logo .logo-text h2 {
    font-size: 16px; font-weight: 700; letter-spacing: 0.5px;
    color: var(--text-primary);
  }
  .sidebar-logo .logo-text span {
    font-size: 11px; color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 1px; text-transform: uppercase;
  }

  .sidebar-nav {
    flex: 1; padding: 16px 12px; overflow-y: auto;
  }
  .sidebar-nav .nav-label {
    font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 1.5px;
    color: var(--text-muted); padding: 16px 12px 8px;
  }
  .nav-item {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 16px; border-radius: var(--radius-sm);
    color: var(--text-secondary); cursor: pointer;
    transition: all var(--transition); font-size: 14px;
    font-weight: 500; position: relative; overflow: hidden;
    border: 1px solid transparent;
    margin-bottom: 2px;
  }
  .nav-item:hover {
    color: var(--text-primary);
    background: var(--bg-card);
    border-color: var(--border);
  }
  .nav-item.active {
    color: var(--accent);
    background: var(--accent-dim);
    border-color: rgba(0,230,138,0.2);
  }
  .nav-item.active::before {
    content: '';
    position: absolute; left: 0; top: 50%;
    transform: translateY(-50%);
    width: 3px; height: 60%; border-radius: 0 3px 3px 0;
    background: var(--accent);
  }
  .nav-item i { width: 20px; text-align: center; font-size: 15px; }

  .sidebar-footer {
    padding: 16px 20px;
    border-top: 1px solid var(--border);
    font-size: 11px; color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace;
    text-align: center;
  }

  /* ===== MAIN CONTENT ===== */
  .main {
    margin-left: var(--sidebar-w);
    min-height: 100vh;
    position: relative; z-index: 1;
  }

  /* ===== TOP BAR ===== */
  .topbar {
    position: sticky; top: 0; z-index: 50;
    background: rgba(10,14,23,0.85);
    backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border);
    padding: 16px 32px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .topbar-left h1 {
    font-size: 20px; font-weight: 700;
    background: linear-gradient(135deg, var(--text-primary), var(--accent));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .topbar-left p {
    font-size: 12px; color: var(--text-muted); margin-top: 2px;
  }
  .topbar-right {
    display: flex; align-items: center; gap: 16px;
  }
  .status-badge {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 16px; border-radius: 50px;
    font-size: 12px; font-weight: 600;
    letter-spacing: 0.5px;
  }
  .status-badge.online {
    background: var(--accent-dim);
    color: var(--accent);
    border: 1px solid rgba(0,230,138,0.25);
  }
  .status-badge.offline {
    background: var(--danger-dim);
    color: var(--danger);
    border: 1px solid rgba(255,71,87,0.25);
  }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
  }
  .online .status-dot { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
  .offline .status-dot { background: var(--danger); box-shadow: 0 0 8px var(--danger); }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.85); }
  }

  /* ===== PAGE CONTENT ===== */
  .page-content {
    padding: 32px;
  }
  .page-section {
    display: none;
  }
  .page-section.active {
    display: block;
    animation: fadeUp 0.4s ease-out;
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ===== STAT CARDS ===== */
  .stats-grid {
    display: grid;
grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 20px; margin-bottom: 32px;
  }
  .stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
    position: relative; overflow: hidden;
    transition: all var(--transition);
  }
  .stat-card:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  }
  .stat-card .card-icon {
    width: 44px; height: 44px;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; margin-bottom: 16px;
  }
  .stat-card .card-icon.green { background: var(--accent-dim); color: var(--accent); }
  .stat-card .card-icon.blue { background: var(--info-dim); color: var(--info); }
  .stat-card .card-icon.orange { background: var(--warning-dim); color: var(--warning); }
  .stat-card .card-icon.red { background: var(--danger-dim); color: var(--danger); }
  .stat-card .card-value {
    font-size: 32px; font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
    margin-bottom: 4px;
  }
  .stat-card .card-label {
    font-size: 13px; color: var(--text-muted); font-weight: 500;
  }
  .stat-card::after {
    content: '';
    position: absolute; top: 0; right: 0;
    width: 120px; height: 120px;
    border-radius: 50%;
    opacity: 0.03; pointer-events: none;
    transform: translate(30%, -30%);
  }
  .stat-card:nth-child(1)::after { background: var(--accent); }
  .stat-card:nth-child(2)::after { background: var(--info); }
  .stat-card:nth-child(3)::after { background: var(--warning); }
  .stat-card:nth-child(4)::after { background: var(--danger); }

  /* ===== PANELS / CARDS ===== */
  .panel {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 24px;
    overflow: hidden;
  }
  .panel-header {
    padding: 20px 24px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
  }
  .panel-header h3 {
    font-size: 16px; font-weight: 600;
    display: flex; align-items: center; gap: 10px;
  }
  .panel-header h3 i { color: var(--accent); font-size: 15px; }
  .panel-body {
    padding: 24px;
  }

  /* ===== FORM ELEMENTS ===== */
  .form-group {
    margin-bottom: 24px;
  }
  .form-group label {
    display: block;
    font-size: 13px; font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 8px;
    letter-spacing: 0.3px;
  }
  .form-group label .required {
    color: var(--danger); margin-left: 2px;
  }
  .form-group .hint {
    font-size: 11px; color: var(--text-muted);
    margin-top: 6px; line-height: 1.5;
  }
  .form-input {
    width: 100%;
    padding: 14px 16px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    transition: all var(--transition);
    outline: none;
  }
  .form-input:focus {
    border-color: var(--border-focus);
    box-shadow: 0 0 0 3px var(--accent-dim);
  }
  .form-input::placeholder {
    color: var(--text-muted); font-size: 13px;
  }
  textarea.form-input {
    resize: vertical; min-height: 100px;
    line-height: 1.6;
  }
  .input-with-icon {
    position: relative;
  }
  .input-with-icon .form-input {
    padding-right: 44px;
  }
  .input-with-icon .toggle-vis {
    position: absolute; right: 12px; top: 50%;
    transform: translateY(-50%);
    background: none; border: none;
    color: var(--text-muted); cursor: pointer;
    font-size: 16px;
    transition: color var(--transition);
  }
  .input-with-icon .toggle-vis:hover {
    color: var(--text-primary);
  }

  /* ===== BUTTONS ===== */
  .btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 12px 24px;
    border-radius: var(--radius-sm);
    font-family: 'Space Grotesk', sans-serif;
    font-size: 14px; font-weight: 600;
    cursor: pointer; border: 1px solid transparent;
    transition: all var(--transition);
    letter-spacing: 0.3px;
  }
  .btn-primary {
    background: linear-gradient(135deg, var(--accent), #00b368);
    color: #0a0e17;
    box-shadow: 0 4px 16px var(--accent-glow);
  }
  .btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 24px var(--accent-glow);
  }
  .btn-primary:active { transform: translateY(0); }
  .btn-secondary {
    background: var(--bg-card);
    color: var(--text-primary);
    border-color: var(--border);
  }
  .btn-secondary:hover {
    border-color: var(--text-muted);
    background: var(--bg-card-hover);
  }
  .btn-danger {
    background: var(--danger-dim);
    color: var(--danger);
    border-color: rgba(255,71,87,0.3);
  }
  .btn-danger:hover {
    background: rgba(255,71,87,0.25);
  }
  .btn-sm { padding: 8px 16px; font-size: 12px; }
  .btn-group {
    display: flex; gap: 12px; flex-wrap: wrap;
  }

  /* ===== TOGGLE SWITCH ===== */
  .toggle-wrap {
    display: flex; align-items: center; gap: 14px;
  }
  .toggle-switch {
    position: relative;
    width: 52px; height: 28px;
    cursor: pointer;
  }
  .toggle-switch input { display: none; }
  .toggle-slider {
    position: absolute; inset: 0;
    background: var(--bg-input);
    border: 2px solid var(--border);
    border-radius: 50px;
    transition: all var(--transition);
  }
  .toggle-slider::before {
    content: '';
    position: absolute;
    top: 2px; left: 2px;
    width: 20px; height: 20px;
    border-radius: 50%;
    background: var(--text-muted);
    transition: all var(--transition);
  }
  .toggle-switch input:checked + .toggle-slider {
    background: var(--accent-dim);
    border-color: var(--accent);
  }
  .toggle-switch input:checked + .toggle-slider::before {
    transform: translateX(24px);
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent-glow);
  }
  .toggle-label {
    font-size: 14px; font-weight: 500;
  }

  /* ===== LOGS TABLE ===== */
  .logs-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
  }
  .logs-table thead th {
    padding: 12px 16px;
    font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 1px;
    color: var(--text-muted);
    background: rgba(0,0,0,0.2);
    border-bottom: 1px solid var(--border);
    text-align: left;
  }
  .logs-table tbody td {
    padding: 14px 16px;
    font-size: 13px;
    border-bottom: 1px solid rgba(42,53,80,0.5);
    color: var(--text-secondary);
    max-width: 250px;
    overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap;
  }
  .logs-table tbody tr {
    transition: background var(--transition);
  }
  .logs-table tbody tr:hover {
    background: rgba(0,230,138,0.03);
  }
  .logs-table .mono {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
  }
  .status-tag {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px; border-radius: 50px;
    font-size: 11px; font-weight: 600;
    letter-spacing: 0.5px;
  }
  .status-tag.sent { background: var(--accent-dim); color: var(--accent); }
  .status-tag.failed { background: var(--danger-dim); color: var(--danger); }
  .status-tag.pending { background: var(--warning-dim); color: var(--warning); }
  .status-tag.bot_off { background: var(--info-dim); color: var(--info); }

  .empty-state {
    text-align: center; padding: 48px 24px;
    color: var(--text-muted);
  }
  .empty-state i {
    font-size: 48px; margin-bottom: 16px;
    opacity: 0.3;
  }
  .empty-state p {
    font-size: 14px; font-weight: 500;
  }

  /* ===== SETUP GUIDE ===== */
  .setup-steps {
    display: flex; flex-direction: column; gap: 0;
  }
  .step-item {
    display: flex; gap: 20px;
    padding: 20px 0;
    position: relative;
  }
  .step-item:not(:last-child)::after {
    content: '';
    position: absolute;
    left: 21px; top: 56px; bottom: 0;
    width: 2px;
    background: var(--border);
  }
  .step-number {
    width: 44px; height: 44px;
    border-radius: 50%;
    background: var(--accent-dim);
    border: 2px solid var(--accent);
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: 700;
    color: var(--accent);
    flex-shrink: 0;
  }
  .step-content h4 {
    font-size: 15px; font-weight: 600;
    margin-bottom: 6px;
    color: var(--text-primary);
  }
  .step-content p {
    font-size: 13px; color: var(--text-secondary);
    line-height: 1.7;
  }
  .step-content code {
    font-family: 'JetBrains Mono', monospace;
    background: var(--bg-input);
    padding: 2px 8px; border-radius: 4px;
    font-size: 12px; color: var(--accent);
    border: 1px solid var(--border);
  }

  /* ===== TOAST NOTIFICATION ===== */
  .toast-container {
    position: fixed; top: 24px; right: 24px;
    z-index: 9999; display: flex; flex-direction: column;
    gap: 10px;
  }
  .toast {
    padding: 14px 20px;
    border-radius: var(--radius-sm);
    font-size: 13px; font-weight: 600;
    display: flex; align-items: center; gap: 10px;
    min-width: 280px;
    animation: slideIn 0.3s ease-out;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  }
  .toast.success {
    background: linear-gradient(135deg, rgba(0,230,138,0.15), rgba(0,179,104,0.15));
    border: 1px solid rgba(0,230,138,0.3);
    color: var(--accent);
  }
  .toast.error {
    background: linear-gradient(135deg, rgba(255,71,87,0.15), rgba(200,50,60,0.15));
    border: 1px solid rgba(255,71,87,0.3);
    color: var(--danger);
  }
  .toast.info {
    background: linear-gradient(135deg, rgba(59,130,246,0.15), rgba(40,100,200,0.15));
    border: 1px solid rgba(59,130,246,0.3);
    color: var(--info);
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(60px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes slideOut {
    from { opacity: 1; transform: translateX(0); }
    to { opacity: 0; transform: translateX(60px); }
  }

  /* ===== UPTIME DISPLAY ===== */
  .uptime-display {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px; color: var(--text-muted);
    display: flex; align-items: center; gap: 8px;
  }
  .uptime-display i { color: var(--accent); }

  /* ===== WEBHOOK URL BOX ===== */
  .webhook-url-box {
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 16px 20px;
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; margin-top: 12px;
  }
  .webhook-url-box code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px; color: var(--accent);
    word-break: break-all; flex: 1;
  }
  .webhook-url-box .copy-btn {
    background: var(--accent-dim);
    border: 1px solid rgba(0,230,138,0.3);
    color: var(--accent);
    padding: 6px 14px; border-radius: 6px;
    font-size: 12px; font-weight: 600;
    cursor: pointer;
    transition: all var(--transition);
    white-space: nowrap;
  }
  .webhook-url-box .copy-btn:hover {
    background: rgba(0,230,138,0.25);
  }

  /* ===== TEST SECTION ===== */
  .test-form {
    display: grid; grid-template-columns: 1fr 2fr auto;
    gap: 12px; align-items: end;
  }

  /* ===== RESPONSIVE ===== */
  .mobile-toggle {
    display: none;
    background: var(--bg-card);
    border: 1px solid var(--border);
    color: var(--text-primary);
    width: 40px; height: 40px;
    border-radius: var(--radius-sm);
    font-size: 18px; cursor: pointer;
    align-items: center; justify-content: center;
  }

  @media (max-width: 900px) {
    .sidebar { transform: translateX(-100%); }
    .sidebar.open { transform: translateX(0); }
    .main { margin-left: 0; }
    .mobile-toggle { display: flex; }
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .test-form { grid-template-columns: 1fr; }
  }
  @media (max-width: 500px) {
    .stats-grid { grid-template-columns: 1fr; }
    .page-content { padding: 20px 16px; }
    .topbar { padding: 12px 16px; }
  }

  /* ===== SCROLLBAR ===== */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

  /* ===== REDUCED MOTION ===== */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
</head>
<body>

<!-- Animated background glow -->
<div class="bg-glow"></div>

<!-- Toast notifications container -->
<div class="toast-container" id="toastContainer"></div>

<!-- Sidebar -->
<nav class="sidebar" id="sidebar" role="navigation" aria-label="Main navigation">
  <div class="sidebar-header">
    <div class="sidebar-logo">
      <div class="logo-icon">S</div>
      <div class="logo-text">
        <h2>MR SURAJ</h2>
        <span>Messenger Bot</span>
      </div>
    </div>
  </div>

  <div class="sidebar-nav">
    <div class="nav-label">Main</div>
    <div class="nav-item active" data-page="dashboard" tabindex="0" role="button">
      <i class="fas fa-chart-line"></i> Dashboard
    </div>
    <div class="nav-item" data-page="settings" tabindex="0" role="button">
      <i class="fas fa-cog"></i> Settings
    </div>
    <div class="nav-item" data-page="messages" tabindex="0" role="button">
      <i class="fas fa-reply-all"></i> Auto Replies
    </div>
    <div class="nav-item" data-page="logs" tabindex="0" role="button">
      <i class="fas fa-scroll"></i> Message Logs
    </div>

    <div class="nav-label">Tools</div>
    <div class="nav-item" data-page="test" tabindex="0" role="button">
      <i class="fas fa-flask"></i> Test Send
    </div>
    <div class="nav-item" data-page="setup" tabindex="0" role="button">
      <i class="fas fa-book-open"></i> Setup Guide
    </div>
  </div>

  <div class="sidebar-footer">
    &copy; 2025 MR SURAJ &middot; v2.0
  </div>
</nav>

<!-- Main content -->
<div class="main">
  <!-- Top Bar -->
  <header class="topbar">
    <div style="display:flex;align-items:center;gap:16px;">
      <button class="mobile-toggle" id="mobileToggle" aria-label="Toggle menu">
        <i class="fas fa-bars"></i>
      </button>
      <div class="topbar-left">
        <h1 id="pageTitle">Dashboard</h1>
        <p id="pageSubtitle">Bot overview and real-time statistics</p>
      </div>
    </div>
    <div class="topbar-right">
      <div class="uptime-display" id="uptimeDisplay">
        <i class="fas fa-clock"></i> <span id="uptimeValue">0h 0m</span>
      </div>
      <div class="status-badge offline" id="statusBadge">
        <div class="status-dot"></div>
        <span id="statusText">OFFLINE</span>
      </div>
    </div>
  </header>

  <!-- Pages -->
  <main class="page-content">

    <!-- ===== DASHBOARD PAGE ===== -->
    <section class="page-section active" id="page-dashboard">
      <div class="stats-grid">
        <div class="stat-card">
          <div class="card-icon green"><i class="fas fa-inbox"></i></div>
          <div class="card-value" id="statReceived">0</div>
          <div class="card-label">Messages Received</div>
</div>
        <div class="stat-card">
          <div class="card-icon blue"><i class="fas fa-paper-plane"></i></div>
          <div class="card-value" id="statReplied">0</div>
          <div class="card-label">Auto Replies Sent</div>
        </div>
        <div class="stat-card">
          <div class="card-icon orange"><i class="fas fa-exclamation-triangle"></i></div>
          <div class="card-value" id="statErrors">0</div>
          <div class="card-label">Errors</div>
        </div>
        <div class="stat-card">
          <div class="card-icon red"><i class="fas fa-heartbeat"></i></div>
          <div class="card-value" id="statHealth">--</div>
          <div class="card-label">Health Score</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h3><i class="fas fa-link"></i> Webhook URL</h3>
        </div>
        <div class="panel-body">
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">
            Use this URL in your Facebook App webhook settings:
          </p>
          <div class="webhook-url-box">
            <code id="webhookUrl">Loading...</code>
            <button class="copy-btn" onclick="copyWebhookUrl()"><i class="fas fa-copy"></i> Copy</button>
          </div>
          <p style="font-size:11px;color:var(--text-muted);margin-top:12px;">
            <i class="fas fa-info-circle"></i> Make sure you set the Verify Token in Settings first, then subscribe to the webhook in Facebook Developer Console.
          </p>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h3><i class="fas fa-history"></i> Recent Activity</h3>
        </div>
        <div class="panel-body" id="recentActivity" style="padding:0;">
          <div class="empty-state">
            <i class="fas fa-inbox"></i>
            <p>No messages yet. Bot is waiting for incoming messages.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== SETTINGS PAGE ===== -->
    <section class="page-section" id="page-settings">
      <div class="panel">
        <div class="panel-header">
          <h3><i class="fas fa-key"></i> API Credentials</h3>
          <div class="toggle-wrap">
            <label class="toggle-switch">
              <input type="checkbox" id="botToggle" checked>
              <span class="toggle-slider"></span>
            </label>
            <span class="toggle-label" id="botToggleLabel">Bot Active</span>
          </div>
        </div>
        <div class="panel-body">
          <form id="tokenForm">
            <div class="form-group">
              <label>Page Access Token <span class="required">*</span></label>
              <div class="input-with-icon">
                <input type="password" class="form-input" id="inputPageToken"
                  placeholder="Paste your Facebook Page Access Token here...">
                <button type="button" class="toggle-vis" onclick="togglePassword('inputPageToken', this)">
                  <i class="fas fa-eye"></i>
                </button>
              </div>
              <p class="hint">Get this from Facebook Developers &rarr; Your App &rarr; Messenger &rarr; Access Tokens. Select your Page and copy the token.</p>
            </div>

            <div class="form-group">
              <label>Verify Token <span class="required">*</span></label>
              <div class="input-with-icon">
                <input type="password" class="form-input" id="inputVerifyToken"
                  placeholder="Create a custom verify token (e.g., my_secret_token_2025)">
                <button type="button" class="toggle-vis" onclick="togglePassword('inputVerifyToken', this)">
                  <i class="fas fa-eye"></i>
                </button>
              </div>
              <p class="hint">This is a custom string you create. Use the same string when setting up the webhook in Facebook Developer Console.</p>
            </div>

            <div class="btn-group">
              <button type="submit" class="btn btn-primary">
                <i class="fas fa-save"></i> Save Credentials
              </button>
              <button type="button" class="btn btn-danger" onclick="clearCredentials()">
                <i class="fas fa-trash"></i> Clear All
              </button>
            </div>
          </form>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h3><i class="fas fa-shield-alt"></i> Security Info</h3>
        </div>
        <div class="panel-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:16px;">
              <p style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Page Token Status</p>
              <p style="font-size:14px;font-weight:600;" id="tokenStatus">
                <i class="fas fa-times-circle" style="color:var(--danger);"></i> Not Set
              </p>
            </div>
            <div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:16px;">
              <p style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Verify Token Status</p>
              <p style="font-size:14px;font-weight:600;" id="verifyStatus">
                <i class="fas fa-times-circle" style="color:var(--danger);"></i> Not Set
              </p>
            </div>
          </div>
          <p style="font-size:12px;color:var(--text-muted);margin-top:16px;line-height:1.6;">
            <i class="fas fa-lock" style="color:var(--accent);"></i> Tokens are stored in server memory only. They are never exposed in API responses. Restarting the server will require re-entering credentials.
          </p>
        </div>
      </div>
    </section>

    <!-- ===== AUTO REPLIES PAGE ===== -->
    <section class="page-section" id="page-messages">
      <div class="panel">
        <div class="panel-header">
          <h3><i class="fas fa-robot"></i> Auto Reply Configuration</h3>
        </div>
        <div class="panel-body">
          <form id="replyForm">
            <div class="form-group">
              <label>Welcome Message</label>
              <textarea class="form-input" id="inputWelcome" rows="3"
                placeholder="Sent when user says hi, hello, hey..."></textarea>
              <p class="hint">Triggered by: hi, hello, hey</p>
            </div>

            <div class="form-group">
              <label>Default Auto Reply</label>
              <textarea class="form-input" id="inputAutoReply" rows="3"
                placeholder="Sent when no keyword matches..."></textarea>
              <p class="hint">Sent when the user's message doesn't match any keyword.</p>
            </div>

            <div class="form-group">
              <label>Unidentified Reply</label>
              <textarea class="form-input" id="inputUnidentified" rows="3"
                placeholder="Alternative fallback message..."></textarea>
              <p class="hint">Secondary fallback message option.</p>
            </div>

            <button type="submit" class="btn btn-primary">
              <i class="fas fa-save"></i> Save Replies
            </button>
          </form>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h3><i class="fas fa-list"></i> Keyword Reference</h3>
        </div>
        <div class="panel-body" style="padding:0;">
          <table class="logs-table">
            <thead>
              <tr>
                <th>Keyword</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr><td class="mono">hi, hello, hey</td><td>Sends Welcome Message</td></tr>
              <tr><td class="mono">help, menu</td><td>Sends interactive menu</td></tr>
              <tr><td class="mono">info</td><td>Sends about us info</td></tr>
              <tr><td class="mono">hours</td><td>Sends business hours</td></tr>
              <tr><td class="mono">contact</td><td>Sends contact details</td></tr>
              <tr><td class="mono">services</td><td>Sends services list</td></tr>
              <tr><td class="mono">thanks, thank you</td><td>Sends thank you reply</td></tr>
              <tr><td class="mono">bye</td><td>Sends goodbye message</td></tr>
              <tr><td class="mono" style="color:var(--text-muted);">anything else</td><td>Sends Default Auto Reply</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ===== LOGS PAGE ===== -->
    <section class="page-section" id="page-logs">
      <div class="panel">
        <div class="panel-header">
          <h3><i class="fas fa-scroll"></i> Message Logs</h3>
          <div class="btn-group">
            <button class="btn btn-secondary btn-sm" onclick="loadLogs()">
              <i class="fas fa-sync-alt"></i> Refresh
            </button>
            <button class="btn btn-danger btn-sm" onclick="clearLogs()">
              <i class="fas fa-trash"></i> Clear
            </button>
          </div>
        </div>
        <div class="panel-body" style="padding:0;overflow-x:auto;">
          <div id="logsContent">
            <div class="empty-state">
              <i class="fas fa-inbox"></i>
              <p>No message logs yet.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== TEST SEND PAGE ===== -->
    <section class="page-section" id="page-test">
      <div class="panel">
        <div class="panel-header">
          <h3><i class="fas fa-flask"></i> Test Message Send</h3>
        </div>
        <div class="panel-body">
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;">
            Send a test message to any PSID (Page-Scoped User ID). Make sure your Page Access Token is configured first.
          </p>
          <form id="testForm">
            <div class="test-form">
              <div class="form-group" style="margin-bottom:0;">
                <label>Recipient PSID</label>
                <input type="text" class="form-input" id="testRecipient"
                  placeholder="e.g., 1234567890">
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label>Message</label>
                <input type="text" class="form-input" id="testMessage"
                  placeholder="Type your test message...">
              </div>
              <button type="submit" class="btn btn-primary" style="align-self:end;">
                <i class="fas fa-paper-plane"></i> Send
              </button>
            </div>
          </form>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h3><i class="fas fa-terminal"></i> Test Result</h3>
        </div>
        <div class="panel-body">
          <div id="testResult" style="font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--text-muted);">
            No test executed yet.
          </div>
        </div>
      </div>
    </section>

    <!-- ===== SETUP GUIDE PAGE ===== -->
    <section class="page-section" id="page-setup">
      <div class="panel">
        <div class="panel-header">
          <h3><i class="fas fa-book-open"></i> Facebook Messenger Bot Setup Guide</h3>
        </div>
        <div class="panel-body">
          <div class="setup-steps">
            <div class="step-item">
              <div class="step-number">1</div>
              <div class="step-content">
                <h4>Create a Facebook App</h4>
                <p>Go to <code>developers.facebook.com</code> and create a new app. Select "Business" type and add the "Messenger" product to your app.</p>
              </div>
            </div>
            <div class="step-item">
              <div class="step-number">2</div>
              <div class="step-content">
                <h4>Get Page Access Token</h4>
                <p>In your app's Messenger settings, under "Access Tokens", select your Facebook Page and generate a token. Copy it and paste it in the <strong>Settings</strong> page of this dashboard.</p>
              </div>
            </div>
            <div class="step-item">
              <div class="step-number">3</div>
              <div class="step-content">
                <h4>Set Verify Token</h4>
                <p>Create a custom string as your Verify Token (e.g., <code>my_verify_token_2025</code>). Enter it in the <strong>Settings</strong> page. You'll use the same string in Facebook's webhook setup.</p>
              </div>
            </div>
            <div class="step-item">
              <div class="step-number">4</div>
              <div class="step-content">
                <h4>Deploy to Render</h4>
                <p>Push this code to a GitHub repository. Go to <code>render.com</code>, create a new Web Service, connect your repo, and deploy. Set environment variables if needed. Wait for deployment to complete and note your app URL.</p>
              </div>
            </div>
            <div class="step-item">
              <div class="step-number">5</div>
              <div class="step-content">
                <h4>Configure Webhook in Facebook</h4>
                <p>In Facebook Developer Console, under Messenger &rarr; Webhooks, click "Add Callback URL". Enter your Render URL + <code>/webhook</code> (e.g., <code>https://your-app.onrender.com/webhook</code>) and the Verify Token you created. Verify and save.</p>
              </div>
            </div>
            <div class="step-item">
              <div class="step-number">6</div>
              <div class="step-content">
                <h4>Subscribe to Events</h4>
                <p>In the same webhook settings, subscribe your Page to the <code>messages</code> event. This tells Facebook to send incoming messages to your webhook.</p>
              </div>
            </div>
            <div class="step-item">
              <div class="step-number">7</div>
              <div class="step-content">
                <h4>Test Your Bot</h4>
                <p>Open your Facebook Page and send a message. Your bot should auto-reply! Check the <strong>Message Logs</strong> page in this dashboard to see activity. You can also use the <strong>Test Send</strong> tool.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h3><i class="fas fa-code"></i> Environment Variables (Optional)</h3>
        </div>
        <div class="panel-body">
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;line-height:1.7;">
            You can also set tokens via Render's Environment Variables. However, using this dashboard is recommended because you can update tokens without re-deploying.
          </p>
          <div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:20px;font-family:'JetBrains Mono',monospace;font-size:13px;line-height:2;">
            <span style="color:var(--accent);">PAGE_ACCESS_TOKEN</span>=<span style="color:var(--warning);">your_page_token_here</span><br>
            <span style="color:var(--accent);">VERIFY_TOKEN</span>=<span style="color:var(--warning);">your_verify_token_here</span><br>
            <span style="color:var(--accent);">PORT</span>=<span style="color:var(--text-muted);">3000</span>
          </div>
        </div>
      </div>
    </section>

  </main>
</div>

<script>
  // ============================================
  //  NAVIGATION
  // ============================================
  const pageTitles = {
    dashboard: { title: "Dashboard", sub: "Bot overview and real-time statistics" },
    settings: { title: "Settings", sub: "Configure API credentials and bot behavior" },
    messages: { title: "Auto Replies", sub: "Customize automatic response messages" },
    logs: { title: "Message Logs", sub: "View all incoming and outgoing messages" },
    test: { title: "Test Send", sub: "Send test messages to verify your bot" },
    setup: { title: "Setup Guide", sub: "Step-by-step Facebook Messenger bot setup" },
  };

  const navItems = document.querySelectorAll(".nav-item");
  const pageSections = document.querySelectorAll(".page-section");

  function switchPage(pageName) {
    navItems.forEach(n => n.classList.remove("active"));
    pageSections.forEach(s => s.classList.remove("active"));

    const activeNav = document.querySelector(\`.nav-item[data-page="\${pageName}"]\`);
    const activePage = document.getElementById(\`page-\${pageName}\`);

    if (activeNav) activeNav.classList.add("active");
    if (activePage) activePage.classList.add("active");

    const info = pageTitles[pageName] || { title: pageName, sub: "" };
    document.getElementById("pageTitle").textContent = info.title;
    document.getElementById("pageSubtitle").textContent = info.sub;

    // Load data for specific pages
    if (pageName === "logs") loadLogs();
    if (pageName === "dashboard") loadStatus();
    if (pageName === "settings") loadConfig();

    // Close mobile sidebar
    document.getElementById("sidebar").classList.remove("open");
  }

  navItems.forEach(item => {
    item.addEventListener("click", () => switchPage(item.dataset.page));
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        switchPage(item.dataset.page);
      }
    });
  });

  // Mobile toggle
  document.getElementById("mobileToggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });

  // ============================================
  //  TOAST NOTIFICATIONS
  // ============================================
  function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = \`toast \${type}\`;

    const icons = { success: "fa-check-circle", error: "fa-times-circle", info: "fa-info-circle" };
    toast.innerHTML = \`<i class="fas \${icons[type] || icons.info}"></i> \${message}\`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = "slideOut 0.3s ease-in forwards";
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ============================================
  //  TOGGLE PASSWORD VISIBILITY
  // ============================================
  function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector("i");
    if (input.type === "password") {
      input.type = "text";
      icon.className = "fas fa-eye-slash";
    } else {
      input.type = "password";
      icon.className = "fas fa-eye";
    }
  }

  // ============================================
  //  LOAD STATUS (Dashboard)
  // ============================================
  async function loadStatus() {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();

      document.getElementById("statReceived").textContent = data.totalReceived;
      document.getElementById("statReplied").textContent = data.totalReplied;
      document.getElementById("statErrors").textContent = data.totalErrors;

      // Health score
      const total = data.totalReceived + data.totalReplied + data.totalErrors;
      if (total === 0) {
        document.getElementById("statHealth").textContent = "--";
      } else {
        const health = Math.max(0, Math.round(((data.totalReplied) / Math.max(1, data.totalReceived)) * 100));
        document.getElementById("statHealth").textContent = health + "%";
      }

      // Status badge
      const badge = document.getElementById("statusBadge");
      const statusText = document.getElementById("statusText");
      const isOnline = data.botActive && data.tokenSet;

      badge.className = "status-badge " + (isOnline ? "online" : "offline");
      statusText.textContent = isOnline ? "ONLINE" : (data.botActive ? "NO TOKEN" : "OFFLINE");

      // Uptime
      updateUptime(data.uptime);

      // Webhook URL
      document.getElementById("webhookUrl").textContent = window.location.origin + "/webhook";

    } catch (err) {
      console.error("Status load error:", err);
    }
  }

  function updateUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    document.getElementById("uptimeValue").textContent =
      h > 0 ? \`\${h}h \${m}m\` : \`\${m}m \${s}s\`;
  }

  // ============================================
  //  LOAD CONFIG (Settings)
  // ============================================
  async function loadConfig() {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();

      document.getElementById("inputWelcome").value = data.welcomeMessage;
      document.getElementById("inputAutoReply").value = data.autoReplyText;
      document.getElementById("inputUnidentified").value = data.unidentifiedReply;

      document.getElementById("botToggle").checked = data.botActive;
      document.getElementById("botToggleLabel").textContent = data.botActive ? "Bot Active" : "Bot Paused";

      // Token status
      const ts = document.getElementById("tokenStatus");
      const vs = document.getElementById("verifyStatus");

      if (data.tokenSet) {
        ts.innerHTML = \`<i class="fas fa-check-circle" style="color:var(--accent);"></i> Set (\${data.pageTokenPreview})\`;
      } else {
        ts.innerHTML = '<i class="fas fa-times-circle" style="color:var(--danger);"></i> Not Set';
      }

      if (data.verifyTokenSet) {
        vs.innerHTML = \`<i class="fas fa-check-circle" style="color:var(--accent);"></i> Set (\${data.verifyTokenPreview})\`;
      } else {
        vs.innerHTML = '<i class="fas fa-times-circle" style="color:var(--danger);"></i> Not Set';
      }

    } catch (err) {
      console.error("Config load error:", err);
    }
  }

  // ============================================
  //  SAVE TOKENS
  // ============================================
  document.getElementById("tokenForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const pageToken = document.getElementById("inputPageToken").value.trim();
    const verifyToken = document.getElementById("inputVerifyToken").value.trim();

    if (!pageToken && !verifyToken) {
      showToast("Please enter at least one token.", "error");
      return;
    }

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageAccessToken: pageToken,
          verifyToken: verifyToken,
        }),
      });
      const data = await res.json();

      if (data.success) {
        showToast("Credentials saved successfully!", "success");
        document.getElementById("inputPageToken").value = "";
        document.getElementById("inputVerifyToken").value = "";
        loadConfig();
        loadStatus();
      } else {
        showToast("Failed to save credentials.", "error");
      }
    } catch (err) {
      showToast("Network error: " + err.message, "error");
    }
  });

  // ============================================
  //  CLEAR CREDENTIALS
  // ============================================
  async function clearCredentials() {
    if (!confirm("Are you sure you want to clear all credentials? The bot will stop working.")) return;

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageAccessToken: "__CLEAR__",
          verifyToken: "__CLEAR__",
          botActive: false,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("Credentials cleared.", "info");
        loadConfig();
        loadStatus();
      }
    } catch (err) {
      showToast("Error: " + err.message, "error");
    }
  }

  // ============================================
  //  BOT TOGGLE
  // ============================================
  document.getElementById("botToggle").addEventListener("change", async function() {
    try {
      const res = await fetch("/api/toggle", { method: "POST" });
      const data = await res.json();
      document.getElementById("botToggleLabel").textContent = data.botActive ? "Bot Active" : "Bot Paused";
      showToast(data.botActive ? "Bot activated!" : "Bot paused.", data.botActive ? "success" : "info");
      loadStatus();
    } catch (err) {
      showToast("Error: " + err.message, "error");
    }
  });

  // ============================================
  //  SAVE REPLIES
  // ============================================
  document.getElementById("replyForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          welcomeMessage: document.getElementById("inputWelcome").value,
          autoReplyText: document.getElementById("inputAutoReply").value,
          unidentifiedReply: document.getElementById("inputUnidentified").value,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("Auto replies updated!", "success");
      }
    } catch (err) {
      showToast("Error: " + err.message, "error");
    }
  });

  // ============================================
  //  LOAD LOGS
  // ============================================
  async function loadLogs() {
    try {
      const res = await fetch("/api/logs?limit=100");
      const logs = await res.json();
      const container = document.getElementById("logsContent");

      if (logs.length === 0) {
        container.innerHTML = \`
          <div class="empty-state">
            <i class="fas fa-inbox"></i>
            <p>No message logs yet.</p>
          </div>\`;
        return;
      }

      let html = \`<table class="logs-table">
        <thead><tr>
          <th>Time</th>
          <th>Sender ID</th>
          <th>Received</th>
          <th>Sent</th>
          <th>Status</th>
        </tr></thead><tbody>\`;

      logs.forEach(log => {
        const time = new Date(log.timestamp).toLocaleString();
        const statusClass = log.status;
        const statusLabel = log.status.replace("_", " ").toUpperCase();
        html += \`<tr>
          <td class="mono" style="white-space:nowrap;">\${time}</td>
          <td class="mono">\${log.senderId}</td>
          <td title="\${log.receivedText}">\${log.receivedText}</td>
          <td title="\${log.sentText || '-'}">\${log.sentText || '-'}</td>
          <td><span class="status-tag \${statusClass}">\${statusLabel}</span></td>
        </tr>\`;
      });

      html += "</tbody></table>";
      container.innerHTML = html;

      // Also update recent activity on dashboard
      updateRecentActivity(logs.slice(0, 5));

    } catch (err) {
      console.error("Logs load error:", err);
    }
  }

  function updateRecentActivity(logs) {
    const container = document.getElementById("recentActivity");
    if (!logs || logs.length === 0) {
      container.innerHTML = \`
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>No messages yet. Bot is waiting for incoming messages.</p>
        </div>\`;
      return;
    }

    let html = '<div style="padding:0;">';
    logs.forEach(log => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const statusColors = { sent: "var(--accent)", failed: "var(--danger)", pending: "var(--warning)", bot_off: "var(--info)" };
      const color = statusColors[log.status] || "var(--text-muted)";
      html += \`
        <div style="display:flex;align-items:center;gap:16px;padding:14px 24px;border-bottom:1px solid rgba(42,53,80,0.5);">
          <div style="width:8px;height:8px;border-radius:50%;background:\${color};flex-shrink:0;"></div>
          <div style="flex:1;min-width:0;">
            <p style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              <span style="color:var(--text-muted);">In:</span> \${log.receivedText}
            </p>
            <p style="font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              <span style="color:var(--text-muted);">Out:</span> \${log.sentText || '-'}
            </p>
          </div>
          <span style="font-size:11px;color:var(--text-muted);font-family:'JetBrains Mono',monospace;white-space:nowrap;">\${time}</span>
        </div>\`;
    });
    html += '</div>';
    container.innerHTML = html;
  }

  // ============================================
  //  CLEAR LOGS
  // ============================================
  async function clearLogs() {
    if (!confirm("Clear all message logs?")) return;
    try {
      await fetch("/api/logs/clear", { method: "POST" });
      showToast("Logs cleared.", "info");
      loadLogs();
    } catch (err) {
      showToast("Error: " + err.message, "error");
    }
  }

  // ============================================
  //  TEST SEND
  // ============================================
  document.getElementById("testForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const recipientId = document.getElementById("testRecipient").value.trim();
    const message = document.getElementById("testMessage").value.trim();
    const resultEl = document.getElementById("testResult");

    if (!recipientId || !message) {
      showToast("Fill in both fields.", "error");
      return;
    }

    resultEl.innerHTML = '<span style="color:var(--warning);">Sending...</span>';

    try {
      const res = await fetch("/api/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId, message }),
      });
      const data = await res.json();

      if (data.success) {
        resultEl.innerHTML = '<span style="color:var(--accent);">Message sent successfully!</span>';
        showToast("Test message sent!", "success");
      } else {
        resultEl.innerHTML = '<span style="color:var(--danger);">Failed to send message. Check your Page Access Token and recipient PSID.</span>';
        showToast("Send failed.", "error");
      }
    } catch (err) {
      resultEl.innerHTML = \`<span style="color:var(--danger);">Error: \${err.message}</span>\`;
      showToast("Error: " + err.message, "error");
    }
  });

  // ============================================
  //  COPY WEBHOOK URL
  // ============================================
  function copyWebhookUrl() {
    const url = document.getElementById("webhookUrl").textContent;
    navigator.clipboard.writeText(url).then(() => {
      showToast("Webhook URL copied!", "success");
    }).catch(() => {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = url; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
      showToast("Webhook URL copied!", "success");
    });
  }

  // ============================================
  //  AUTO REFRESH
  // ============================================
  setInterval(() => {
    loadStatus();
    // Refresh logs if on logs page
    if (document.getElementById("page-logs").classList.contains("active")) {
      loadLogs();
    }
  }, 5000);

  // Initial load
  loadStatus();
  loadConfig();

  // Handle __CLEAR__ for clearing tokens on server side
  const originalFetch = window.fetch;
  // (We send __CLEAR__ as a special marker; server handles it)
</script>

</body>
</html>`);
});

// ============================================
//  Handle __CLEAR__ token on server
// ============================================
const originalConfigPost = app._router.stack.find(r => r.route?.path === "/api/config" && r.route.methods?.post);
// We already handle this above, but let's add special logic for __CLEAR__
const configHandler = async (req, res) => {
  const { pageAccessToken, verifyToken, autoReplyText, welcomeMessage, unidentifiedReply, botActive } = req.body;

  if (pageAccessToken === "__CLEAR__") {
    config.PAGE_ACCESS_TOKEN = "";
  } else if (pageAccessToken !== undefined && pageAccessToken !== "") {
    config.PAGE_ACCESS_TOKEN = pageAccessToken;
  }

  if (verifyToken === "__CLEAR__") {
    config.VERIFY_TOKEN = "";
  } else if (verifyToken !== undefined && verifyToken !== "") {
    config.VERIFY_TOKEN = verifyToken;
  }

  if (autoReplyText !== undefined) config.autoReplyText = autoReplyText;
  if (welcomeMessage !== undefined) config.welcomeMessage = welcomeMessage;
  if (unidentifiedReply !== undefined) config.unidentifiedReply = unidentifiedReply;
  if (botActive !== undefined) config.botActive = botActive;

  res.json({ success: true, message: "Configuration updated!" });
};

// Override the /api/config POST route by adding a new one (Express processes in order)
// Actually, let's fix this properly - remove the duplicate and handle __CLEAR__ in the original
// The original route already exists, so we need to restructure.
// Let me just note: the original /api/config POST handler above already handles this correctly
// because it only updates tokens when the value is not empty. For __CLEAR__, we need special handling.

// Let's add a dedicated clear endpoint instead:
app.post("/api/credentials/clear", (req, res) => {
  config.PAGE_ACCESS_TOKEN = "";
  config.VERIFY_TOKEN = "";
  config.botActive = false;
  res.json({ success: true, message: "Credentials cleared" });
});

// ============================================
//  LOAD ENV VARS ON STARTUP (if set)
// ============================================
if (process.env.PAGE_ACCESS_TOKEN) {
  config.PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
  console.log("[CONFIG] PAGE_ACCESS_TOKEN loaded from environment");
}
if (process.env.VERIFY_TOKEN) {
  config.VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  console.log("[CONFIG] VERIFY_TOKEN loaded from environment");
}

// ============================================
//  START SERVER
// ============================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(\`\n========================================\`);
  console.log(\`  SHAD DON - Messenger Bot Dashboard\`);
  console.log(\`  Server running on port \${PORT}\`);
  console.log(\`  Dashboard: http://localhost:\${PORT}\`);
  console.log(\`  Webhook:   http://localhost:\${PORT}/webhook\`);
  console.log(\`========================================\n\`);
});

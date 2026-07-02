import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import * as gsheets from './google-sheets.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ===== User Registry =====
// validUsers maps USERID -> { name, pin, email, position }
const USERS_FILE = path.join(__dirname, '..', 'src', 'users.json');
let validUsers = {};
try {
  const raw = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  // Support both flat {id: name} and full {id: {name, pin, email, position}} formats
  for (const [id, val] of Object.entries(raw)) {
    if (typeof val === 'string') {
      validUsers[id.toUpperCase()] = { name: val, pin: '', email: '', position: '' };
    } else {
      validUsers[id.toUpperCase()] = { name: val.name || '', pin: val.pin || '', email: val.email || '', position: val.position || '' };
    }
  }
  console.log(`👥 Loaded ${Object.keys(validUsers).length} users from registry`);
} catch { console.warn('⚠️  Could not load users.json'); }

// ===== In-memory fallback (when Google Sheets not configured) =====
let localFaqs = [];
let localLogs = [];
let localRatings = {}; // { [faqId]: { [userId]: vote } }
let localRelated = []; // [{ faqIdA, faqIdB, linkedBy, note }]
const DATA_FILE = path.join(__dirname, '..', 'src', 'faq-data.json');

function loadLocalData() {
  try {
    localFaqs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch { localFaqs = []; }
}
loadLocalData();

// Questionnaire local mock stores (when Google Sheets is disabled)
let localQuestionnaireLogs = [];
let localQuestionnaireSubmissions = [];

// SMTP Config
const smtpConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT, 10) || 465,
  secure: process.env.SMTP_SECURE === 'true' || (process.env.SMTP_PORT ? process.env.SMTP_PORT === '465' : true),
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  }
};
const smtpEnabled = !!(smtpConfig.auth.user && smtpConfig.auth.pass);
let transporter = null;
if (smtpEnabled) {
  try {
    transporter = nodemailer.createTransport(smtpConfig);
    console.log('✉️ SMTP configuration loaded. Real emails will be sent.');
  } catch (err) {
    console.error('❌ Failed to construct SMTP transporter:', err.message);
  }
} else {
  console.log('ℹ️ SMTP not configured. Questionnaire emails will fall back to Console Logging.');
}

const useSheets = gsheets.isConfigured();

async function logActivity(userId, action, targetId, details) {
  try {
    if (useSheets) {
      await gsheets.addLog({ userId, action, targetId, details });
    } else {
      localLogs.unshift({
        timestamp: new Date().toISOString(),
        userId,
        action,
        targetId,
        details,
      });
    }
  } catch (err) {
    console.error('Failed to log activity:', err.message);
  }
}
if (useSheets) {
  console.log('✅ Google Sheets configured — attempting synchronization...');
  
  // Set a timeout for the initial connection to alert the user if it hangs
  const initTimeout = setTimeout(() => {
    console.error('❌ TIMEOUT: Google Sheets synchronization is taking too long (> 10s).');
    console.error('   This usually means the GOOGLE_PRIVATE_KEY is invalid or the Sheet ID is inaccessible.');
  }, 10000);
  gsheets.initializeSheet(localFaqs)
    .then(async () => {
      clearTimeout(initTimeout);
      console.log('✨ Google Sheets sync complete');
      try {
        const sheetUsers = await gsheets.getUsers();
        if (Object.keys(sheetUsers).length > 0) {
          validUsers = sheetUsers;
          console.log(`👥 Synchronized ${Object.keys(validUsers).length} users from Google Sheets`);
        }
      } catch (err) {
        console.error('Failed to sync users at startup:', err.message);
      }
      // Run migration to backfill SenderName for existing submissions
      try {
        await gsheets.backfillSenderNames();
      } catch (err) {
        console.error('Failed to backfill SenderNames:', err.message);
      }
    })
    .catch(err => {
      clearTimeout(initTimeout);
      console.error('❌ Google Sheets Initialization Failed:', err.message);
    });
} else {
  console.log('⚠️  Google Sheets NOT configured — using local JSON fallback');
}

async function resolveUserName(userId) {
  if (!userId) return '';
  const code = userId.trim().toUpperCase();
  if (validUsers[code]) {
    return validUsers[code].name || validUsers[code];
  }
  if (useSheets) {
    try {
      console.log(`🔍 User ${code} not in cache, fetching latest from Google Sheets...`);
      const sheetUsers = await gsheets.getUsers();
      if (Object.keys(sheetUsers).length > 0) {
        validUsers = { ...validUsers, ...sheetUsers };
      }
    } catch (err) {
      console.error('Failed to refresh users cache:', err.message);
    }
  }
  const u = validUsers[code];
  return (u && u.name) ? u.name : (typeof u === 'string' ? u : userId);
}

// Find a user by UserID (case-insensitive) OR by registered email
function findUserByIdOrEmail(identifier) {
  if (!identifier) return null;
  const lower = identifier.trim().toLowerCase();
  const upper = identifier.trim().toUpperCase();
  // Try UserID first
  if (validUsers[upper]) {
    return { userId: upper, ...validUsers[upper] };
  }
  // Try email match
  for (const [id, data] of Object.entries(validUsers)) {
    const email = (typeof data === 'string') ? '' : (data.email || '');
    if (email && email.toLowerCase() === lower) {
      return { userId: id, ...(typeof data === 'string' ? { name: data, pin: '', email: '' } : data) };
    }
  }
  return null;
}

// Save PIN & Email locally (fallback when Sheets not configured)
function saveUserLocal(userId, pin, email) {
  try {
    const code = userId.toUpperCase();
    if (validUsers[code]) {
      validUsers[code].pin = pin;
      validUsers[code].email = email;
    }
    // Persist to users.json — write as flat name strings since that's the existing format
    // But also preserve pin/email by writing a mixed format isn't ideal.
    // For local dev, we just keep it in-memory (pin works per session).
    // To fully persist locally, we'd need to rewrite users.json. We skip that for now.
    console.log(`💾 PIN saved in-memory for local dev: ${code}`);
  } catch (err) {
    console.warn('⚠️ saveUserLocal error:', err.message);
  }
}

// ===== AUTH =====
app.post('/api/auth', async (req, res) => {
  const { identifier, pin, email } = req.body;

  if (!identifier || !identifier.trim()) {
    return res.status(400).json({ success: false, error: 'PrivyID or email is required' });
  }

  // Always refresh user registry from Sheets on auth calls
  if (useSheets) {
    try {
      console.log('🔄 Fetching latest user registry from Google Sheets...');
      const sheetUsers = await gsheets.getUsers();
      if (Object.keys(sheetUsers).length > 0) {
        validUsers = sheetUsers;
      }
    } catch (err) {
      console.warn('⚠️ Could not refresh users from Google Sheets during auth:', err.message);
    }
  }

  const user = findUserByIdOrEmail(identifier);

  if (!user) {
    return res.status(401).json({ success: false, error: 'PrivyID or email not found. Please check and try again.' });
  }

  // --- Flow 1: Check only (no pin/email provided) — determine what step is next ---
  if (pin === undefined && email === undefined) {
    if (user.pin && user.pin.length === 6) {
      return res.json({ success: false, status: 'requires_pin', userId: user.userId, name: user.name });
    } else {
      return res.json({ success: false, status: 'setup_pin', userId: user.userId, name: user.name });
    }
  }

  // --- Flow 2: Verify PIN (existing user) ---
  if (pin !== undefined && email === undefined) {
    if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ success: false, error: 'PIN must be exactly 6 digits.' });
    }
    if (!user.pin) {
      return res.status(400).json({ success: false, error: 'No PIN set. Please set up your PIN first.' });
    }
    if (user.pin !== pin) {
      return res.status(401).json({ success: false, error: 'Incorrect PIN. Please try again.' });
    }
    // Log successful login
    await logActivity(user.name || user.userId, 'LOGIN', user.userId, 'User logged in successfully');
    return res.json({
      success: true,
      userId: user.userId,
      name: user.name,
      position: user.position || '',
      email: user.email || ''
    });
  }

  // --- Flow 3: Setup PIN + Email (first-time) ---
  if (pin !== undefined && email !== undefined) {
    if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ success: false, error: 'PIN must be exactly 6 digits.' });
    }
    if (!email || !email.trim().toLowerCase().endsWith('@privy.id')) {
      return res.status(400).json({ success: false, error: 'Email must be a valid @privy.id address.' });
    }
    try {
      if (useSheets) {
        await gsheets.saveUserCredentials(user.userId, pin, email.trim().toLowerCase());
        // Refresh cache
        const sheetUsers = await gsheets.getUsers();
        if (Object.keys(sheetUsers).length > 0) validUsers = sheetUsers;
      } else {
        saveUserLocal(user.userId, pin, email.trim().toLowerCase());
      }
      // Log successful PIN setup
      await logActivity(user.name || user.userId, 'SETUP_PIN', user.userId, `First-time login: set PIN and email (${email})`);
      return res.json({
        success: true,
        userId: user.userId,
        name: user.name,
        position: user.position || '',
        email: email.trim().toLowerCase()
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Failed to save PIN. Please try again.' });
    }
  }

  return res.status(400).json({ success: false, error: 'Invalid request.' });
});

// ===== FAQs =====
app.get('/api/faqs', async (req, res) => {
  try {
    if (useSheets) {
      const faqs = await gsheets.getFAQs();
      return res.json(faqs);
    }
    res.json(localFaqs);
  } catch (err) {
    console.error('GET /api/faqs error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/faqs', async (req, res) => {
  try {
    const { userId, ...faqData } = req.body;
    const userName = await resolveUserName(userId);
    
    if (useSheets) {
      const newFaq = await gsheets.addFAQ(faqData, userName);
      await gsheets.addLog({ userId: userName, action: 'ADD', targetId: newFaq.id, details: `Added FAQ: "${faqData.question}"` });
      return res.json(newFaq);
    }
    // Local fallback
    const newFaq = {
      ...faqData,
      id: `faq-${Date.now()}`,
      reporter: userName,
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    };
    localFaqs.unshift(newFaq);
    localLogs.unshift({
      timestamp: new Date().toISOString(), userId: userName, action: 'ADD',
      targetId: newFaq.id, details: `Added FAQ: "${faqData.question}"`,
    });
    res.json(newFaq);
  } catch (err) {
    console.error('POST /api/faqs error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/faqs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, ...faqData } = req.body;
    const userName = await resolveUserName(userId);

    if (useSheets) {
      const updated = await gsheets.updateFAQ(id, faqData, userName);
      await gsheets.addLog({ userId: userName, action: 'EDIT', targetId: id, details: `Edited FAQ: "${faqData.question}"` });
      return res.json(updated);
    }
    // Local fallback
    const idx = localFaqs.findIndex(f => f.id === id);
    if (idx === -1) return res.status(404).json({ error: 'FAQ not found' });
    const oldQ = localFaqs[idx].question;
    const now = new Date().toISOString();
    
    localFaqs[idx] = { 
      ...localFaqs[idx], 
      ...faqData, 
      lastEditor: userName,
      updatedAt: now 
    };

    localLogs.unshift({
      timestamp: now, userId: userName, action: 'EDIT',
      targetId: id, details: `Edited FAQ: "${oldQ}"`,
    });
    res.json(localFaqs[idx]);
  } catch (err) {
    console.error('PUT /api/faqs error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/faqs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const userName = await resolveUserName(userId);

    if (useSheets) {
      await gsheets.deleteFAQ(id, userName);
      await gsheets.addLog({ userId: userName, action: 'DELETE', targetId: id, details: `Deleted FAQ: ${id}` });
      return res.json({ success: true });
    }
    // Local fallback
    const idx = localFaqs.findIndex(f => f.id === id);
    if (idx === -1) return res.status(404).json({ error: 'FAQ not found' });
    const removed = localFaqs.splice(idx, 1)[0];
    localLogs.unshift({
      timestamp: new Date().toISOString(), userId: userName, action: 'DELETE',
      targetId: id, details: `Deleted FAQ: "${removed.question}"`,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/faqs error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== RATINGS =====

// GET /api/ratings — aggregated rating data for all FAQs
app.get('/api/ratings', async (req, res) => {
  try {
     if (useSheets) {
       const ratings = await gsheets.getRatings();
       return res.json(ratings);
     }
     // Local fallback: convert localRatings to aggregated format
     const aggregated = {};
     for (const [faqId, votes] of Object.entries(localRatings)) {
       const voters = Object.entries(votes).map(([userId, vote]) => ({ userId, vote }));
       const sum = voters.reduce((acc, v) => acc + v.vote, 0);
       const total = voters.length;
       const average = total > 0 ? parseFloat((sum / total).toFixed(1)) : 0;
       aggregated[faqId] = { sum, total, average, voters };
     }
     res.json(aggregated);
  } catch (err) {
    console.error('GET /api/ratings error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/faqs/:id/rate — cast, update or cancel (vote=0) a rating
app.post('/api/faqs/:id/rate', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, vote } = req.body;
    const userName = await resolveUserName(userId);

    const numericVote = parseInt(vote, 10);
    if (isNaN(numericVote) || numericVote < 0 || numericVote > 5) {
      return res.status(400).json({ error: 'vote must be between 1 and 5, or 0 to cancel' });
    }

    if (useSheets) {
      if (numericVote === 0) {
        await gsheets.deleteRating(id, userName || userId);
        await logActivity(userName || userId, 'CANCEL_RATE', id, 'Cancelled rating for FAQ');
      } else {
        await gsheets.upsertRating(id, userName || userId, numericVote);
        await logActivity(userName || userId, 'RATE', id, `Rated FAQ: ${numericVote} Stars`);
      }
      // Return fresh aggregated ratings for this FAQ
      const allRatings = await gsheets.getRatings();
      return res.json(allRatings[id] || { sum: 0, total: 0, average: 0, voters: [] });
    }
    // Local fallback
    if (!localRatings[id]) localRatings[id] = {};
    if (numericVote === 0) {
      delete localRatings[id][userName || userId];
      await logActivity(userName || userId, 'CANCEL_RATE', id, 'Cancelled rating for FAQ');
    } else {
      localRatings[id][userName || userId] = numericVote;
      await logActivity(userName || userId, 'RATE', id, `Rated FAQ: ${numericVote} Stars`);
    }
    const voters = Object.entries(localRatings[id]).map(([uid, v]) => ({ userId: uid, vote: v }));
    const sum = voters.reduce((acc, v) => acc + v.vote, 0);
    const total = voters.length;
    const average = total > 0 ? parseFloat((sum / total).toFixed(1)) : 0;
    res.json({ sum, total, average, voters });
  } catch (err) {
    console.error('POST /api/faqs/:id/rate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== RELATED FAQs =====

// GET /api/related — all related links
app.get('/api/related', async (req, res) => {
  try {
    if (useSheets) {
      const related = await gsheets.getRelated();
      return res.json(related);
    }
    res.json(localRelated);
  } catch (err) {
    console.error('GET /api/related error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/faqs/:id/related — link two FAQs
app.post('/api/faqs/:id/related', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, relatedFaqId, note } = req.body;
    const userName = await resolveUserName(userId);

    if (!relatedFaqId || relatedFaqId === id) {
      return res.status(400).json({ error: 'Invalid relatedFaqId' });
    }

    if (useSheets) {
      const result = await gsheets.addRelated(id, relatedFaqId, userName || userId, note || '');
      if (result.success) {
        await logActivity(userName || userId, 'LINK_RELATED', id, `Linked FAQ with: ${relatedFaqId}`);
      }
      return res.json(result);
    }
    // Local fallback
    const alreadyExists = localRelated.some(
      r => (r.faqIdA === id && r.faqIdB === relatedFaqId) ||
           (r.faqIdA === relatedFaqId && r.faqIdB === id)
    );
    if (alreadyExists) return res.json({ success: false, reason: 'already_exists' });
    localRelated.push({ faqIdA: id, faqIdB: relatedFaqId, linkedBy: userName || userId, note: note || '', linkedAt: new Date().toISOString() });
    await logActivity(userName || userId, 'LINK_RELATED', id, `Linked FAQ with: ${relatedFaqId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/faqs/:id/related error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/faqs/:id/related/:relatedId — unlink two FAQs
app.delete('/api/faqs/:id/related/:relatedId', async (req, res) => {
  try {
    const { id, relatedId } = req.params;
    const { userId } = req.body || {}; // Attempt to capture userId if provided
    const userName = userId ? await resolveUserName(userId) : 'System';

    if (useSheets) {
      const result = await gsheets.removeRelated(id, relatedId);
      if (result.success) {
        await logActivity(userName, 'UNLINK_RELATED', id, `Unlinked FAQ from: ${relatedId}`);
      }
      return res.json(result);
    }
    // Local fallback
    const idx = localRelated.findIndex(
      r => (r.faqIdA === id && r.faqIdB === relatedId) ||
           (r.faqIdA === relatedId && r.faqIdB === id)
    );
    if (idx === -1) return res.json({ success: false });
    localRelated.splice(idx, 1);
    await logActivity(userName, 'UNLINK_RELATED', id, `Unlinked FAQ from: ${relatedId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/faqs/:id/related/:relatedId error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== CATEGORIES =====
app.get('/api/categories', async (req, res) => {
  try {
    if (useSheets) {
      const cats = await gsheets.getCategories();
      return res.json(cats);
    }
    res.json(['General', 'Policies & Compliance', 'Digital-ID', 'Liveness SDK', 'Technical Details']);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const { name } = req.body;
    if (useSheets) {
      const result = await gsheets.addCategory(name);
      return res.json(result);
    }
    res.json({ name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:name', async (req, res) => {
  try {
    const { name } = req.params;
    if (useSheets) {
      const result = await gsheets.deleteCategory(name);
      return res.json(result);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== LOGS =====
app.get('/api/logs', async (req, res) => {
  try {
    const { userId } = req.query;
    const resolvedName = userId ? (await resolveUserName(userId)) : null;
    
    console.log(`📋 Fetching logs for userId: ${userId} (Resolved Name: ${resolvedName})`);

    let logs = [];
    if (useSheets) {
      logs = await gsheets.getLogs();
    } else {
      logs = localLogs;
    }

    if (userId) {
      const filteredLogs = logs.filter(log => {
        const logUser = String(log.userId || '').trim().toUpperCase();
        const targetId = String(userId).trim().toUpperCase();
        const targetName = String(resolvedName || '').trim().toUpperCase();
        
        return logUser === targetId || logUser === targetName;
      });
      console.log(`✅ Filtered ${logs.length} logs down to ${filteredLogs.length} for ${userId}`);
      return res.json(filteredLogs);
    }
    
    res.json(logs);
  } catch (err) {
    console.error('GET /api/logs error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== DIAGNOSTICS =====
app.get('/api/debug', async (req, res) => {
  try {
    console.log('🔍 Running diagnostics...');
    const report = await gsheets.testConnection();
    res.json(report);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ===== QUESTIONNAIRE API ENDPOINTS =====

// GET /api/officers — reads directly from Users sheet, filtered by position=Officer
app.get('/api/officers', async (req, res) => {
  try {
    // Always fetch fresh from Sheets so we never rely on the in-memory cache
    const sheetUsers = await gsheets.getUsers();
    const source = Object.keys(sheetUsers).length > 0 ? sheetUsers : validUsers;

    const officers = Object.entries(source)
      .filter(([id, data]) => {
        const pos = (data.position || '').trim().toLowerCase();
        return pos === 'officer';
      })
      .map(([id, data]) => ({
        id,
        name: data.name || id,
        email: data.email || ''
      }));

    console.log(`👷 Officers from Users sheet: ${officers.map(o => o.name).join(', ')}`);
    res.json(officers);
  } catch (err) {
    console.error('GET /api/officers error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/questionnaire-templates
app.get('/api/questionnaire-templates', async (req, res) => {
  try {
    const { category } = req.query;
    const questions = await gsheets.getQuestionnaireQuestions(category);
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/questionnaires/logs
app.get('/api/questionnaires/logs', async (req, res) => {
  try {
    const { senderId } = req.query;
    if (useSheets) {
      const logs = await gsheets.getQuestionnaireLogs(senderId);
      return res.json(logs);
    }
    // Local fallback filter
    const logs = senderId 
      ? localQuestionnaireLogs.filter(l => l.senderId.toUpperCase() === senderId.toUpperCase())
      : localQuestionnaireLogs;
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/questionnaires/details/:logId (Public details load for form)
app.get('/api/questionnaires/details/:logId', async (req, res) => {
  try {
    const { logId } = req.params;
    let logDetail = null;
    if (useSheets) {
      logDetail = await gsheets.getQuestionnaireLogById(logId);
    } else {
      logDetail = localQuestionnaireLogs.find(l => l.logId === logId) || null;
    }
    if (!logDetail) {
      return res.status(404).json({ error: 'Questionnaire link not found or expired.' });
    }

    // Parse selected questions from Category JSON string
    let questions = [];
    try {
      const selectedIds = JSON.parse(logDetail.category);
      if (Array.isArray(selectedIds)) {
        const allQuestions = await gsheets.getQuestionnaireQuestions();
        questions = allQuestions.filter(q => selectedIds.includes(q.id));
      }
    } catch (e) {
      // Fallback for plain text categories or legacy logs
      const allQuestions = await gsheets.getQuestionnaireQuestions();
      questions = allQuestions.filter(q => q.category === logDetail.category || logDetail.category.includes('Privy'));
      if (questions.length === 0) {
        questions = allQuestions;
      }
    }

    res.json({
      logId: logDetail.logId,
      receiverEmail: logDetail.receiverEmail,
      officerName: logDetail.officerName,
      category: 'Privy Integration Officer Performance Questionnaire',
      questions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/questionnaires/send
app.post('/api/questionnaires/send', async (req, res) => {
  try {
    const { senderId, receiverEmail, officerName, selectedQuestions } = req.body;
    if (!senderId || !receiverEmail || !officerName || !selectedQuestions || !Array.isArray(selectedQuestions) || selectedQuestions.length === 0) {
      return res.status(400).json({ error: 'Missing required parameters (senderId, receiverEmail, officerName, selectedQuestions).' });
    }

    const sender = validUsers[senderId.toUpperCase()];
    if (!sender) {
      return res.status(401).json({ error: 'Sender user not found.' });
    }

    // Role check: Only VP and Manager position can send
    const role = (sender.position || '').trim().toLowerCase();
    const isVp = role.includes('vp');
    const isManager = role.includes('manager');
    if (!isVp && !isManager) {
      return res.status(403).json({ error: 'Unauthorized: Only VPs and Managers can send questionnaires.' });
    }

    const logId = `qlog-${Date.now()}`;
    const sentAt = new Date().toISOString();
    
    // Store selected questions as JSON in the Category column
    const categoryJson = JSON.stringify(selectedQuestions);

    const logData = {
      logId,
      senderId: senderId.toUpperCase(),
      senderName: sender.name,
      receiverEmail: receiverEmail.trim().toLowerCase(),
      officerName,
      category: categoryJson,
      sentAt,
      status: 'Sent'
    };

    // Log questionnaire sending in database
    if (useSheets) {
      await gsheets.addQuestionnaireLog(logData);
    } else {
      localQuestionnaireLogs.unshift(logData);
    }

    // Build the questionnaire URL dynamically based on the request host
    const origin = req.headers.referer || req.headers.origin || `http://localhost:${PORT}`;
    // Construct base path (removing trailing slash or extra segments)
    let baseUrl = new URL(origin).origin;
    const questionnaireLink = `${baseUrl}/privy-officer-performance-questionnaire?id=${logId}`;

    const emailSubject = `[Privy] Integration Officer Performance Evaluation`;
    const emailHtml = `
      <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <img src="https://privy.id/_nuxt/Privy_Logo_Red.BXNsidzu.png" alt="Privy" style="height: 32px; object-fit: contain;" />
        </div>
        <h2 style="color: #1e293b; font-size: 20px; font-weight: 700; margin-bottom: 12px; text-align: center;">Officer Integration Evaluation</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
          Dear Partner,
        </p>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
          Thank you for choosing Privy as your integration partner. To continuously improve our support, we would be grateful if you could take a brief moment to fill out a questionnaire assessing our integration officer's performance.
        </p>
        <div style="background-color: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="color: #64748b; font-size: 14px; padding: 4px 0; font-weight: 500;">Officer Evaluated:</td>
              <td style="color: #0f172a; font-size: 14px; padding: 4px 0; font-weight: 600; text-align: right;">${officerName}</td>
            </tr>
          </table>
        </div>
        <div style="text-align: center; margin-bottom: 28px;">
          <a href="${questionnaireLink}" target="_blank" style="display: inline-block; background-color: #e11d48; color: #ffffff; text-decoration: none; padding: 12px 28px; font-weight: 600; font-size: 14px; border-radius: 6px; box-shadow: 0 4px 6px -1px rgba(225, 29, 72, 0.2), 0 2px 4px -1px rgba(225, 29, 72, 0.1);">
            Start Questionnaire
          </a>
        </div>
        <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin-bottom: 0; text-align: center;">
          Or copy and paste this link into your browser:<br/>
          <a href="${questionnaireLink}" style="color: #3b82f6; text-decoration: underline;">${questionnaireLink}</a>
        </p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">
          This email was sent on behalf of Privy VE Integration Team. Please do not reply directly to this email.
        </p>
      </div>
    `;

    if (smtpEnabled && transporter) {
      const mailOptions = {
        from: `"Privy VE Team" <${smtpConfig.auth.user}>`,
        to: receiverEmail.trim().toLowerCase(),
        subject: emailSubject,
        html: emailHtml,
      };
      await transporter.sendMail(mailOptions);
      console.log(`✉️ Email successfully sent to ${receiverEmail} for officer ${officerName}`);
    } else {
      console.log(`\n=============================================================`);
      console.log(`✉️ EMAIL WORKFLOW FALLBACK (SMTP not configured)`);
      console.log(`Subject: ${emailSubject}`);
      console.log(`To: ${receiverEmail}`);
      console.log(`Link: ${questionnaireLink}`);
      console.log(`=============================================================\n`);
    }

    // Log this email sending action in activity logs
    await logActivity(sender.name, 'SEND_QUESTIONNAIRE', logId, `Sent questionnaire to ${receiverEmail} evaluating ${officerName}`);

    res.json({ success: true, logId, link: questionnaireLink, smtpSent: smtpEnabled });
  } catch (err) {
    console.error('Error sending questionnaire:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/questionnaires/submit
app.post('/api/questionnaires/submit', async (req, res) => {
  try {
    const { logId, receiverEmail, officerName, category, answers, advice } = req.body;
    if (!receiverEmail || !officerName || !answers) {
      return res.status(400).json({ error: 'Missing required parameters for submission.' });
    }
    const safeCategory = category || 'Privy Integration Officer Performance Questionnaire';

    // Check if submission already exists for this logId
    if (logId) {
      let alreadySubmitted = false;
      if (useSheets) {
        const submissions = await gsheets.getSubmissions();
        alreadySubmitted = submissions.some(s => s.logId === logId);
      } else {
        alreadySubmitted = localQuestionnaireSubmissions.some(s => s.logId === logId);
      }
      
      if (alreadySubmitted) {
        return res.status(409).json({ 
          success: false, 
          error: 'This questionnaire has already been submitted. You cannot submit it again.' 
        });
      }
    }

    const submissionId = `qsub-${Date.now()}`;
    const answersJson = JSON.stringify(answers);

    // Save submission
    if (useSheets) {
      await gsheets.submitQuestionnaire({
        submissionId,
        logId: logId || '',
        receiverEmail,
        officerName,
        category: safeCategory,
        q1_rating: answers.Q1 || '',
        q2_rating: answers.Q2 || '',
        q3_rating: answers.Q3 || '',
        q4_rating: answers.Q4 || '',
        q5_rating: answers.Q5 || '',
        answersJson,
        advice: advice || '',
        submittedAt: new Date().toISOString()
      });
    } else {
      // Local fallback logic
      localQuestionnaireSubmissions.unshift({
        submissionId,
        logId: logId || '',
        receiverEmail,
        officerName,
        category: safeCategory,
        answers,
        advice: advice || '',
        submittedAt: new Date().toISOString()
      });
      // Update local log status
      if (logId) {
        const log = localQuestionnaireLogs.find(l => l.logId === logId);
        if (log) log.status = 'Submitted';
      }
    }

    // Log this client submission in activity logs
    await logActivity('Client (Anonymous)', 'SUBMIT_QUESTIONNAIRE', logId || submissionId, `Submitted feedback questionnaire for officer ${officerName}`);

    res.json({ success: true, submissionId });
  } catch (err) {
    console.error('Error submitting questionnaire:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/questionnaires/submissions — for VP/Manager results dashboard
app.get('/api/questionnaires/submissions', async (req, res) => {
  try {
    const { officerName, dateFrom, dateTo } = req.query;
    if (useSheets) {
      const submissions = await gsheets.getSubmissions(
        officerName || null,
        dateFrom || null,
        dateTo || null
      );
      return res.json(submissions);
    }
    // Local fallback
    let results = localQuestionnaireSubmissions;
    
    if (officerName) {
      results = results.filter(s => s.officerName === officerName);
    }
    
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      results = results.filter(s => {
        const submissionDate = s.submittedAt ? new Date(s.submittedAt) : null;
        return submissionDate && submissionDate >= fromDate;
      });
    }
    
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999); // End of day
      results = results.filter(s => {
        const submissionDate = s.submittedAt ? new Date(s.submittedAt) : null;
        return submissionDate && submissionDate <= toDate;
      });
    }
    
    res.json(results);
  } catch (err) {
    console.error('GET /api/questionnaires/submissions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== START =====
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 VE FAQ Server running on http://localhost:${PORT}`);
    console.log(`   API endpoints: http://localhost:${PORT}/api/faqs`);
  });
}

export default app;

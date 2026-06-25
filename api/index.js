import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as gsheets from './google-sheets.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ===== User Registry =====
// validUsers maps USERID -> { name, pin, email }
const USERS_FILE = path.join(__dirname, '..', 'src', 'users.json');
let validUsers = {};
try {
  const raw = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  // Support both flat {id: name} and full {id: {name, pin, email}} formats
  for (const [id, val] of Object.entries(raw)) {
    if (typeof val === 'string') {
      validUsers[id.toUpperCase()] = { name: val, pin: '', email: '' };
    } else {
      validUsers[id.toUpperCase()] = { name: val.name || '', pin: val.pin || '', email: val.email || '' };
    }
  }
  console.log(`👥 Loaded ${Object.keys(validUsers).length} users from registry`);
} catch { console.warn('⚠️  Could not load users.json'); }

// ===== In-memory fallback (when Google Sheets not configured) =====
let localFaqs = [];
let localLogs = [];
const DATA_FILE = path.join(__dirname, '..', 'src', 'faq-data.json');

function loadLocalData() {
  try {
    localFaqs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch { localFaqs = []; }
}
loadLocalData();

const useSheets = gsheets.isConfigured();
if (useSheets) {
  console.log('✅ Google Sheets configured — attempting synchronization...');
  
  // Set a timeout for the initial connection to alert the user if it hangs
  const initTimeout = setTimeout(() => {
    console.error('❌ TIMEOUT: Google Sheets synchronization is taking too long (> 10s).');
    console.error('   This usually means the GOOGLE_PRIVATE_KEY is invalid or the Sheet ID is inaccessible.');
  }, 10000);

  gsheets.initializeSheet(localFaqs)
    .then(() => {
      clearTimeout(initTimeout);
      console.log('✨ Google Sheets sync complete');
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
    return res.json({ success: true, userId: user.userId, name: user.name });
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
      return res.json({ success: true, userId: user.userId, name: user.name });
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

// ===== START =====
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 VE FAQ Server running on http://localhost:${PORT}`);
    console.log(`   API endpoints: http://localhost:${PORT}/api/faqs`);
  });
}

export default app;

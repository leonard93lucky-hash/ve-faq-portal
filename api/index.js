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
const USERS_FILE = path.join(__dirname, '..', 'src', 'users.json');
let validUsers = {};
try {
  validUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
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

// ===== AUTH =====
app.post('/api/auth', (req, res) => {
  const { userId } = req.body;
  if (!userId || !userId.trim()) {
    return res.status(400).json({ success: false, error: 'Access code is required' });
  }
  const code = userId.trim().toUpperCase();
  const name = validUsers[code];
  if (!name) {
    return res.status(401).json({ success: false, error: 'Invalid access code. Please check your code and try again.' });
  }
  res.json({ success: true, userId: code, name });
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
    const userName = validUsers[userId] || userId;
    
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
    const userName = validUsers[userId] || userId;

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
    const userName = validUsers[userId] || userId;

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
    const resolvedName = userId ? (validUsers[userId] || userId) : null;
    
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

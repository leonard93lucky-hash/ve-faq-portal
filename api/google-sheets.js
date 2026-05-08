import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
const FAQ_SHEET = 'FAQ_Data';
const LOG_SHEET = 'Activity_Log';
const DELETED_SHEET = 'Deleted';
const CATEGORIES_SHEET = 'Categories';

let sheets = null;

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !privateKey) {
    console.warn('⚠️ Missing Google Credentials:', { 
      email: !!email, 
      privateKey: !!privateKey 
    });
    return null;
  }

  // Robust parsing for Vercel:
  // 1. Remove literal quotes if the user pasted it with them
  // 2. Fix double-escaped newlines (\\n -> \n)
  privateKey = privateKey.trim();
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.substring(1, privateKey.length - 1);
  }
  privateKey = privateKey.replace(/\\n/g, '\n');

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: email,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return auth;
  } catch (err) {
    console.error('❌ Google Auth Error (Construction):', err.message);
    return null;
  }
}

async function getSheetsClient() {
  if (sheets) return sheets;
  const auth = getAuth();
  if (!auth) return null; // Return null instead of throwing to allow local fallback
  sheets = google.sheets({ version: 'v4', auth });
  return sheets;
}

export async function initializeSheet(initialFaqs = []) {
  const client = await getSheetsClient();
  if (!client) return;

  try {
    // 1. Get spreadsheet metadata to check for sheet existence
    const meta = await client.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const existingSheets = meta.data.sheets.map(s => s.properties.title);
    
    const requiredSheets = [FAQ_SHEET, LOG_SHEET, DELETED_SHEET, CATEGORIES_SHEET];
    const missingSheets = requiredSheets.filter(s => !existingSheets.includes(s));

    if (missingSheets.length > 0) {
      console.log(`🛠️ Creating missing sheets: ${missingSheets.join(', ')}...`);
      await client.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: missingSheets.map(title => ({
            addSheet: { properties: { title } }
          }))
        }
      });
    }

    // 2. Check FAQ_Data headers
    const faqRes = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${FAQ_SHEET}!A1:A1`,
    });

    if (!faqRes.data.values || faqRes.data.values.length === 0) {
      console.log('📄 Initializing FAQ_Data headers...');
      await client.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${FAQ_SHEET}!A1:I1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['ID', 'Category', 'Question', 'Answer', 'Date', 'Reporter', 'Merchant', 'CreatedAt', 'UpdatedAt']],
        },
      });

      if (initialFaqs.length > 0) {
        console.log(`📤 Uploading ${initialFaqs.length} initial FAQs to Google Sheets...`);
        const values = initialFaqs.map(f => [
          f.id, f.category, f.question, f.answer, f.date, f.reporter, f.merchant, new Date().toISOString(), new Date().toISOString()
        ]);
        await client.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${FAQ_SHEET}!A2`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values },
        });
      }
    }

    // 3. Check Activity_Log headers
    const logRes = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${LOG_SHEET}!A1:A1`,
    });

    if (!logRes.data.values || logRes.data.values.length === 0) {
      console.log('📜 Initializing Activity_Log headers...');
      await client.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${LOG_SHEET}!A1:E1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['Timestamp', 'UserName', 'Action', 'TargetID', 'Details']],
        },
      });
    }
    // 4. Check Deleted headers
    const delRes = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${DELETED_SHEET}!A1:A1`,
    });

    if (!delRes.data.values || delRes.data.values.length === 0) {
      console.log('🗑️ Initializing Deleted headers...');
      await client.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${DELETED_SHEET}!A1:K1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['DeletionTimestamp', 'DeletedBy', 'ID', 'Category', 'Question', 'Answer', 'Date', 'Reporter', 'Merchant', 'CreatedAt', 'UpdatedAt']],
        },
      });
    }

    // 5. Check Categories headers
    const catListRes = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${CATEGORIES_SHEET}!A1:A1`,
    });

    if (!catListRes.data.values || catListRes.data.values.length === 0) {
      console.log('📂 Initializing Categories sheet...');
      await client.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${CATEGORIES_SHEET}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['CategoryName']],
        },
      });
      // Add default categories
      const defaults = [['General'], ['Policies & Compliance'], ['Digital-ID'], ['Liveness SDK'], ['Technical Details']];
      await client.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${CATEGORIES_SHEET}!A2`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: defaults },
      });
    }
  } catch (err) {
    console.error('❌ Google Sheets Initialization Error:', err.message);
  }
}

// ===== FAQ CRUD =====

export async function getFAQs() {
  const client = await getSheetsClient();
  const res = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${FAQ_SHEET}!A2:I`,
  });
  const rows = res.data.values || [];
  return rows.map(row => ({
    id: row[0] || '',
    category: row[1] || '',
    question: row[2] || '',
    answer: row[3] || '',
    date: row[4] || '',
    reporter: row[5] || '',
    merchant: row[6] || '',
    createdAt: row[7] || '',
    updatedAt: row[8] || '',
  }));
}

export async function addFAQ(faq, reporterName) {
  const client = await getSheetsClient();
  const id = `faq-${Date.now()}`;
  const now = new Date().toISOString();
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  await client.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${FAQ_SHEET}!A:I`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        id,
        faq.category || 'General',
        faq.question,
        faq.answer,
        date,
        reporterName || faq.reporter || '',
        faq.merchant || '',
        now,
        now,
      ]],
    },
  });

  return { id, ...faq, date, reporter: reporterName || faq.reporter, createdAt: now, updatedAt: now };
}

export async function updateFAQ(targetId, faq) {
  const client = await getSheetsClient();
  // Find the row with matching ID
  const res = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${FAQ_SHEET}!A:A`,
  });
  const rows = res.data.values || [];
  let rowIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === targetId) { rowIndex = i + 1; break; }
  }
  if (rowIndex === -1) throw new Error('FAQ not found');

  const now = new Date().toISOString();
  await client.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${FAQ_SHEET}!B${rowIndex}:I${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        faq.category || 'General',
        faq.question,
        faq.answer,
        faq.date || '',
        faq.reporter || '',
        faq.merchant || '',
        '',
        now,
      ]],
    },
  });

  return { id: targetId, ...faq, updatedAt: now };
}

export async function deleteFAQ(targetId, deletedByName) {
  const client = await getSheetsClient();
  console.log(`🗑️ Attempting to delete FAQ with ID: ${targetId} by ${deletedByName}`);
  
  // Find the row and get its data for backup
  const res = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${FAQ_SHEET}!A:I`,
  });
  const rows = res.data.values || [];
  let rowIndex = -1;
  let rowData = null;

  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === targetId) { 
      rowIndex = i; 
      rowData = rows[i];
      break; 
    }
  }
  
  if (rowIndex === -1) {
    console.warn(`⚠️ FAQ ID ${targetId} not found in sheet.`);
    throw new Error('FAQ not found');
  }

  console.log(`📦 Backing up row ${rowIndex + 1} to Deleted sheet...`);
  // Backup to Deleted sheet (Column A: Timestamp, Column B: DeletedBy, C-K: original data)
  await client.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${DELETED_SHEET}!A:K`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[new Date().toISOString(), deletedByName, ...rowData]],
    },
  });

  console.log(`🧨 Deleting row ${rowIndex + 1} from FAQ_Data...`);
  // Delete from main sheet
  const meta = await client.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = meta.data.sheets.find(s => s.properties.title === FAQ_SHEET);
  if (!sheet) throw new Error('FAQ sheet not found');

  await client.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheet.properties.sheetId,
            dimension: 'ROWS',
            startIndex: rowIndex,
            endIndex: rowIndex + 1,
          },
        },
      }],
    },
  });

  console.log(`✅ FAQ ${targetId} deleted and backed up successfully.`);
  return { success: true };
}

// ===== CATEGORY MANAGEMENT =====

export async function getCategories() {
  const client = await getSheetsClient();
  const res = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${CATEGORIES_SHEET}!A2:A`,
  });
  return (res.data.values || []).map(row => row[0]).filter(Boolean);
}

export async function addCategory(name) {
  const client = await getSheetsClient();
  await client.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${CATEGORIES_SHEET}!A:A`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[name]] },
  });
  return { name };
}

export async function deleteCategory(name) {
  const client = await getSheetsClient();
  const res = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${CATEGORIES_SHEET}!A:A`,
  });
  const rows = res.data.values || [];
  const rowIndex = rows.findIndex(row => row[0] === name);
  if (rowIndex === -1) return { success: false };

  const meta = await client.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = meta.data.sheets.find(s => s.properties.title === CATEGORIES_SHEET);
  
  await client.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheet.properties.sheetId,
            dimension: 'ROWS',
            startIndex: rowIndex,
            endIndex: rowIndex + 1,
          },
        },
      }],
    },
  });
  return { success: true };
}

// ===== ACTIVITY LOG =====

export async function getLogs() {
  const client = await getSheetsClient();
  const res = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${LOG_SHEET}!A2:E`,
  });
  const rows = res.data.values || [];
  return rows.map(row => ({
    timestamp: row[0] || '',
    userId: row[1] || '',
    action: row[2] || '',
    targetId: row[3] || '',
    details: row[4] || '',
  })).reverse(); // newest first
}

export async function addLog(log) {
  const client = await getSheetsClient();
  await client.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${LOG_SHEET}!A:E`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        new Date().toISOString(),
        log.userId || '',
        log.action || '',
        log.targetId || '',
        log.details || '',
      ]],
    },
  });
  return { success: true };
}

export function isConfigured() {
  const hasId = !!process.env.GOOGLE_SHEETS_ID && !process.env.GOOGLE_SHEETS_ID.includes('your_');
  const hasEmail = !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const hasKey = !!process.env.GOOGLE_PRIVATE_KEY;

  if (!hasId || !hasEmail || !hasKey) {
    console.log('ℹ️ Google Sheets Config Check:', { hasId, hasEmail, hasKey });
  }

  return hasId && hasEmail && hasKey;
}

/**
 * Attempts to connect to Google Sheets with a timeout.
 * Returns a diagnostic report.
 */
export async function testConnection() {
  const report = {
    timestamp: new Date().toISOString(),
    config: {
      hasId: !!process.env.GOOGLE_SHEETS_ID,
      hasEmail: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      hasKey: !!process.env.GOOGLE_PRIVATE_KEY,
    },
    auth: { status: 'pending' },
    connectivity: { status: 'pending' }
  };

  if (!isConfigured()) {
    report.status = 'error';
    report.message = 'Environment variables are missing or incorrectly configured.';
    return report;
  }

  // 1. Try Auth
  const auth = getAuth();
  if (!auth) {
    report.auth.status = 'error';
    report.auth.message = 'Failed to construct Google Auth client. Check private key format.';
    report.status = 'error';
    return report;
  }
  report.auth.status = 'ok';

  // 2. Try Connectivity (with timeout)
  try {
    const client = await getSheetsClient();
    
    // Wrap the metadata call in a timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timed out after 5s')), 5000)
    );
    
    const fetchPromise = client.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    
    await Promise.race([fetchPromise, timeoutPromise]);
    
    report.connectivity.status = 'ok';
    report.status = 'ok';
    report.message = 'Successfully connected to Google Sheets.';
  } catch (err) {
    report.connectivity.status = 'error';
    report.connectivity.message = err.message;
    report.status = 'error';
    report.message = `Connectivity check failed: ${err.message}`;
  }

  return report;
}

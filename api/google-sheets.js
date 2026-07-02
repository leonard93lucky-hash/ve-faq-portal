import dotenv from 'dotenv';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
const FAQ_SHEET = 'FAQ_Data';
const LOG_SHEET = 'Activity_Log';
const DELETED_SHEET = 'Deleted';
const CATEGORIES_SHEET = 'Categories';
const USERS_SHEET = 'Users';
const FAQ_RATINGS_SHEET = 'FAQ_Ratings';
const FAQ_RELATED_SHEET = 'FAQ_Related';
const OFFICERS_SHEET = 'Officers';
const QUESTIONNAIRE_TEMPLATES_SHEET = 'Questionnaire_Templates';
const QUESTIONNAIRE_LOGS_SHEET = 'Questionnaire_Logs';
const QUESTIONNAIRE_SUBMISSIONS_SHEET = 'Questionnaire_Submissions';

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
    
    const requiredSheets = [
      FAQ_SHEET, LOG_SHEET, DELETED_SHEET, CATEGORIES_SHEET, USERS_SHEET, FAQ_RATINGS_SHEET, FAQ_RELATED_SHEET,
      QUESTIONNAIRE_TEMPLATES_SHEET, QUESTIONNAIRE_LOGS_SHEET, QUESTIONNAIRE_SUBMISSIONS_SHEET
    ];
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
      range: `${FAQ_SHEET}!A1:J1`,
    });

    if (!faqRes.data.values || faqRes.data.values.length === 0) {
      console.log('📄 Initializing FAQ_Data headers...');
      await client.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${FAQ_SHEET}!A1:J1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['ID', 'Category', 'Question', 'Answer', 'Date', 'Reporter', 'Merchant', 'CreatedAt', 'UpdatedAt', 'LastEditor']],
        },
      });

      if (initialFaqs.length > 0) {
        console.log(`📤 Uploading ${initialFaqs.length} initial FAQs to Google Sheets...`);
        
        const parseInitialDate = (dateStr) => {
          if (!dateStr) return new Date().toISOString();
          try {
            // Handle various formats like "1 oct 2025", "14-Nov-25", "18/12/2025"
            let normalized = dateStr.replace(/-/g, ' ').replace(/\//g, ' ');
            
            // Handle DD MM YYYY by checking if the first part is a day
            const parts = normalized.split(/\s+/);
            if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[2].length === 4) {
              // Swap DD and MM for JS Date constructor (expects MM DD YYYY)
              normalized = `${parts[1]} ${parts[0]} ${parts[2]}`;
            }

            const d = new Date(normalized);
            return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
          } catch { return new Date().toISOString(); }
        };

        const values = initialFaqs.map(f => {
          const createdAt = parseInitialDate(f.date);
          return [
            f.id, f.category, f.question, f.answer, f.date, f.reporter, f.merchant, createdAt, createdAt, ''
          ];
        });
        await client.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${FAQ_SHEET}!A2`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values },
        });
      }
    } else {
      // Ensure the header includes LastEditor if it's missing (for existing sheets)
      const currentHeaders = faqRes.data.values[0] || [];
      if (currentHeaders.length < 10 || !currentHeaders.includes('LastEditor')) {
        console.log('🔧 Updating FAQ_Data headers to include LastEditor...');
        await client.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${FAQ_SHEET}!A1:J1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [['ID', 'Category', 'Question', 'Answer', 'Date', 'Reporter', 'Merchant', 'CreatedAt', 'UpdatedAt', 'LastEditor']],
          },
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

    // 6. Check Users headers
    const usersListRes = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${USERS_SHEET}!A1:A1`,
    });

    if (!usersListRes.data.values || usersListRes.data.values.length === 0) {
      console.log('👥 Initializing Users sheet...');
      await client.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${USERS_SHEET}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['UserID', 'UserName', 'PIN', 'Email', 'Position']],
        },
      });
      // Try to load initial users from users.json to populate the sheet
      try {
        const USERS_FILE = path.join(__dirname, '..', 'src', 'users.json');
        if (fs.existsSync(USERS_FILE)) {
          const defaultUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
          const userRows = Object.entries(defaultUsers).map(([userId, val]) => {
            if (typeof val === 'string') {
              return [userId, val, '', '', ''];
            } else {
              return [userId, val.name || '', val.pin || '', val.email || '', val.position || ''];
            }
          });
          if (userRows.length > 0) {
            console.log(`📤 Uploading ${userRows.length} initial users to Google Sheets...`);
            await client.spreadsheets.values.append({
              spreadsheetId: SPREADSHEET_ID,
              range: `${USERS_SHEET}!A2`,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: userRows },
            });
          }
        }
      } catch (jsonErr) {
        console.warn('⚠️ Could not populate Users sheet from users.json fallback:', jsonErr.message);
      }
    } else {
      // Ensure the header includes PIN, Email, and Position columns if missing (for existing sheets)
      const currentHeaders = usersListRes.data.values[0] || [];
      if (!currentHeaders.includes('PIN') || !currentHeaders.includes('Position')) {
        console.log('🔧 Adding PIN, Email, and Position headers to Users sheet...');
        const newHeaders = ['UserID', 'UserName', 'PIN', 'Email', 'Position'];
        await client.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${USERS_SHEET}!A1:E1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [newHeaders] },
        });
      }
    }

    // 9. Check Questionnaire_Templates sheet
    const templatesRes = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${QUESTIONNAIRE_TEMPLATES_SHEET}!A1:A1`,
    }).catch(() => null);

    if (!templatesRes || !templatesRes.data.values || templatesRes.data.values.length === 0) {
      console.log('📝 Initializing Questionnaire Templates sheet...');
      await client.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${QUESTIONNAIRE_TEMPLATES_SHEET}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['QuestionID', 'Category', 'QuestionText', 'Order']],
        },
      });
      // Add initial 5 questions
      const defaults = [
        ['Q1', 'Privy Integration Officer Performance Questionnaire', 'The integration team clearly explained the integration process and technical requirements', 1],
        ['Q2', 'Privy Integration Officer Performance Questionnaire', 'The proposed solution met our business and technical needs.', 2],
        ['Q3', 'Privy Integration Officer Performance Questionnaire', 'The integration team provided timely and helpful support throughout the integration process.', 3],
        ['Q4', 'Privy Integration Officer Performance Questionnaire', 'Communication from the integration team was clear, responsive, and easy to understand', 4],
        ['Q5', 'Privy Integration Officer Performance Questionnaire', 'Overall, we are satisfied with the support and collaboration provided by the integration team during the integration project.', 5],
      ];
      await client.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${QUESTIONNAIRE_TEMPLATES_SHEET}!A2`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: defaults },
      });
    }

    // 11. Check Questionnaire_Logs sheet
    const qLogsRes = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${QUESTIONNAIRE_LOGS_SHEET}!A1:A1`,
    }).catch(() => null);

    if (!qLogsRes || !qLogsRes.data.values || qLogsRes.data.values.length === 0) {
      console.log('📜 Initializing Questionnaire Logs sheet...');
      await client.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${QUESTIONNAIRE_LOGS_SHEET}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['LogID', 'SenderID', 'SenderName', 'ReceiverEmail', 'OfficerName', 'Category', 'SentAt', 'Status']],
        },
      });
    }

    // 12. Check Questionnaire_Submissions sheet
    const qSubsRes = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${QUESTIONNAIRE_SUBMISSIONS_SHEET}!A1:A1`,
    }).catch(() => null);

    if (!qSubsRes || !qSubsRes.data.values || qSubsRes.data.values.length === 0) {
      console.log('📥 Initializing Questionnaire Submissions sheet...');
      await client.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${QUESTIONNAIRE_SUBMISSIONS_SHEET}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['SubmissionID', 'LogID', 'ReceiverEmail', 'OfficerName', 'Category', 'Q1_Rating', 'Q2_Rating', 'Q3_Rating', 'Q4_Rating', 'Q5_Rating', 'AnswersJSON', 'Advice', 'SubmittedAt', 'SenderName']],
        },
      });
    }

    // 7. Check FAQ_Ratings headers
    const ratingsHeaderRes = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${FAQ_RATINGS_SHEET}!A1:D1`,
    });
    if (!ratingsHeaderRes.data.values || ratingsHeaderRes.data.values.length === 0) {
      console.log('⭐ Initializing FAQ_Ratings headers...');
      await client.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${FAQ_RATINGS_SHEET}!A1:D1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['FaqID', 'UserID', 'Vote', 'RatedAt']] },
      });
    }

    // 8. Check FAQ_Related headers
    const relatedHeaderRes = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${FAQ_RELATED_SHEET}!A1:E1`,
    });
    if (!relatedHeaderRes.data.values || relatedHeaderRes.data.values.length === 0) {
      console.log('🔗 Initializing FAQ_Related headers...');
      await client.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${FAQ_RELATED_SHEET}!A1:E1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['FaqID_A', 'FaqID_B', 'LinkedBy', 'LinkedAt', 'Note']] },
      });
    }
  } catch (err) {
    console.error('❌ Google Sheets Initialization Error:', err.message);
  }
}

// ===== MIGRATION: Backfill SenderName for existing submissions =====
export async function backfillSenderNames() {
  const client = await getSheetsClient();
  if (!client) return;
  
  try {
    console.log('🔄 Checking for submissions missing SenderName...');
    
    // Get all submissions
    const submissionsRes = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${QUESTIONNAIRE_SUBMISSIONS_SHEET}!A2:N`,
    });
    const submissionRows = submissionsRes.data.values || [];
    
    // Get all logs
    const logsRes = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${QUESTIONNAIRE_LOGS_SHEET}!A2:H`,
    });
    const logsRows = logsRes.data.values || [];
    
    // Create a map of logId -> senderName
    const logsMap = {};
    logsRows.forEach(logRow => {
      const logId = logRow[0] || '';
      const senderName = logRow[2] || '';
      if (logId) {
        logsMap[logId] = senderName;
      }
    });
    
    // Find submissions that need updating (missing or empty SenderName in column N)
    const updates = [];
    submissionRows.forEach((row, index) => {
      const logId = row[1] || '';
      const currentSenderName = row[13] || ''; // Column N
      
      // If SenderName is missing and we have a logId with a matching sender
      if (!currentSenderName && logId && logsMap[logId]) {
        updates.push({
          rowIndex: index + 2, // +2 because sheet is 1-indexed and we start at row 2
          senderName: logsMap[logId]
        });
      }
    });
    
    if (updates.length > 0) {
      console.log(`📝 Updating ${updates.length} submissions with missing SenderName...`);
      
      // Update each row
      for (const update of updates) {
        await client.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${QUESTIONNAIRE_SUBMISSIONS_SHEET}!N${update.rowIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[update.senderName]],
          },
        });
      }
      
      console.log(`✅ Successfully backfilled ${updates.length} SenderName values`);
    } else {
      console.log('✅ All submissions already have SenderName populated');
    }
  } catch (err) {
    console.error('❌ Error backfilling SenderNames:', err.message);
  }
}

// ===== FAQ CRUD =====

export async function getFAQs() {
  const client = await getSheetsClient();
  const res = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${FAQ_SHEET}!A2:J`,
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
    lastEditor: row[9] || '',
  }));
}

export async function addFAQ(faq, reporterName) {
  const client = await getSheetsClient();
  const id = `faq-${Date.now()}`;
  const now = new Date().toISOString();
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  await client.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${FAQ_SHEET}!A:J`,
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
        '',
      ]],
    },
  });

  return { id, ...faq, date, reporter: reporterName || faq.reporter, createdAt: now, updatedAt: now, lastEditor: '' };
}

export async function updateFAQ(targetId, faq, editorName) {
  const client = await getSheetsClient();
  // Find the row with matching ID and get current data to preserve metadata
  const res = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${FAQ_SHEET}!A:J`,
  });
  const rows = res.data.values || [];
  let rowIndex = -1;
  let existingData = {};
  
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === targetId) { 
      rowIndex = i + 1; 
      existingData = {
        category: rows[i][1],
        question: rows[i][2],
        answer: rows[i][3],
        date: rows[i][4],
        reporter: rows[i][5],
        merchant: rows[i][6],
        createdAt: rows[i][7],
        updatedAt: rows[i][8],
        lastEditor: rows[i][9]
      };
      break; 
    }
  }
  if (rowIndex === -1) throw new Error('FAQ not found');

  const now = new Date().toISOString();
  console.log(`📝 Updating FAQ ${targetId} at row ${rowIndex}. Editor: ${editorName}`);
  
  const updatedData = [
    faq.category || existingData.category || 'General',
    faq.question || existingData.question,
    faq.answer || existingData.answer,
    faq.date || existingData.date || '',
    faq.reporter || existingData.reporter || '',
    faq.merchant || existingData.merchant || '',
    existingData.createdAt || '',
    now,
    editorName || '',
  ];

  await client.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${FAQ_SHEET}!B${rowIndex}:J${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [updatedData],
    },
  });

  return { 
    id: targetId, 
    ...faq, 
    date: faq.date || existingData.date,
    reporter: faq.reporter || existingData.reporter,
    createdAt: existingData.createdAt, 
    updatedAt: now, 
    lastEditor: editorName || '' 
  };
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

export async function getUsers() {
  const client = await getSheetsClient();
  if (!client) return {};
  try {
    const res = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${USERS_SHEET}!A2:E`,
    });
    const rows = res.data.values || [];
    const userMap = {};
    for (const row of rows) {
      if (row[0]) {
        userMap[row[0].trim().toUpperCase()] = {
          name: row[1] ? row[1].trim() : '',
          pin: row[2] ? row[2].trim() : '',
          email: row[3] ? row[3].trim().toLowerCase() : '',
          position: row[4] ? row[4].trim() : '',
        };
      }
    }
    return userMap;
  } catch (err) {
    console.error('❌ Error fetching users from Google Sheet:', err.message);
    return {};
  }
}

export async function saveUserCredentials(userId, pin, email) {
  const client = await getSheetsClient();
  if (!client) throw new Error('Google Sheets not configured');
  try {
    const res = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${USERS_SHEET}!A:D`,
    });
    const rows = res.data.values || [];
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] && rows[i][0].trim().toUpperCase() === userId.toUpperCase()) {
        rowIndex = i + 1; // 1-based
        break;
      }
    }
    if (rowIndex === -1) throw new Error('User not found in sheet');
    await client.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${USERS_SHEET}!C${rowIndex}:D${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[pin, email]] },
    });
    return { success: true };
  } catch (err) {
    console.error('❌ Error saving user credentials:', err.message);
    throw err;
  }
}

// ===== RATINGS =====

/**
 * Fetch all rating rows from FAQ_Ratings and aggregate per FAQ.
 * Returns: { [faqId]: { thumbsUp, thumbsDown, score, voters: [{userId, vote}] } }
 */
export async function getRatings() {
  const client = await getSheetsClient();
  if (!client) return {};
  try {
    const res = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${FAQ_RATINGS_SHEET}!A2:D`,
    });
    const rows = res.data.values || [];
    const aggregated = {};
    for (const row of rows) {
      const faqId = row[0] || '';
      const userId = row[1] || '';
      const vote = parseInt(row[2], 10); // 1 to 5
      if (!faqId || isNaN(vote) || vote < 1 || vote > 5) continue;
      if (!aggregated[faqId]) {
        aggregated[faqId] = { sum: 0, total: 0, average: 0, voters: [] };
      }
      aggregated[faqId].sum += vote;
      aggregated[faqId].total++;
      aggregated[faqId].average = parseFloat((aggregated[faqId].sum / aggregated[faqId].total).toFixed(1));
      aggregated[faqId].voters.push({ userId, vote });
    }
    return aggregated;
  } catch (err) {
    console.error('❌ Error fetching ratings:', err.message);
    return {};
  }
}

/**
 * Upsert a vote: if [faqId, userId] row exists, update Vote + RatedAt; else append.
 * vote: 1 = helpful, -1 = not helpful
 */
export async function upsertRating(faqId, userId, vote) {
  const client = await getSheetsClient();
  if (!client) throw new Error('Google Sheets not configured');

  const res = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${FAQ_RATINGS_SHEET}!A:D`,
  });
  const rows = res.data.values || [];
  const now = new Date().toISOString();

  // Find existing row for this [faqId, userId]
  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) { // skip header row (index 0)
    if (rows[i][0] === faqId && rows[i][1] === userId) {
      rowIndex = i + 1; // 1-based sheet row
      break;
    }
  }

  if (rowIndex !== -1) {
    // Update existing row
    await client.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${FAQ_RATINGS_SHEET}!C${rowIndex}:D${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[vote, now]] },
    });
    console.log(`⭐ Updated rating for FAQ ${faqId} by ${userId}: ${vote}`);
  } else {
    // Append new row
    await client.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${FAQ_RATINGS_SHEET}!A:D`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[faqId, userId, vote, now]] },
    });
    console.log(`⭐ New rating for FAQ ${faqId} by ${userId}: ${vote}`);
  }
  return { success: true };
}

/**
 * Delete a vote row when user cancels rating.
 */
export async function deleteRating(faqId, userId) {
  const client = await getSheetsClient();
  if (!client) throw new Error('Google Sheets not configured');

  const res = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${FAQ_RATINGS_SHEET}!A:B`,
  });
  const rows = res.data.values || [];
  let rowIndex = -1;

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === faqId && rows[i][1] === userId) {
      rowIndex = i; // 0-based
      break;
    }
  }

  if (rowIndex === -1) return { success: false };

  const meta = await client.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = meta.data.sheets.find(s => s.properties.title === FAQ_RATINGS_SHEET);
  if (!sheet) throw new Error('Ratings sheet not found');

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

  console.log(`⭐ Deleted rating for FAQ ${faqId} by ${userId}`);
  return { success: true };
}

// ===== RELATED FAQs =====

/**
 * Fetch all related-link rows.
 * Returns: [{ faqIdA, faqIdB, linkedBy, linkedAt, note }]
 */
export async function getRelated() {
  const client = await getSheetsClient();
  if (!client) return [];
  try {
    const res = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${FAQ_RELATED_SHEET}!A2:E`,
    });
    const rows = res.data.values || [];
    return rows
      .filter(row => row[0] && row[1])
      .map(row => ({
        faqIdA: row[0],
        faqIdB: row[1],
        linkedBy: row[2] || '',
        linkedAt: row[3] || '',
        note: row[4] || '',
      }));
  } catch (err) {
    console.error('❌ Error fetching related FAQs:', err.message);
    return [];
  }
}

/**
 * Add a related-link between two FAQs (bi-directional: stored once, resolved both ways).
 */
export async function addRelated(faqIdA, faqIdB, linkedBy, note = '') {
  const client = await getSheetsClient();
  if (!client) throw new Error('Google Sheets not configured');
  const now = new Date().toISOString();
  // Check if link already exists (in either direction)
  const existing = await getRelated();
  const alreadyExists = existing.some(
    r => (r.faqIdA === faqIdA && r.faqIdB === faqIdB) ||
         (r.faqIdA === faqIdB && r.faqIdB === faqIdA)
  );
  if (alreadyExists) return { success: false, reason: 'already_exists' };

  await client.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${FAQ_RELATED_SHEET}!A:E`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[faqIdA, faqIdB, linkedBy, now, note]] },
  });
  console.log(`🔗 Linked FAQ ${faqIdA} <-> ${faqIdB} by ${linkedBy}`);
  return { success: true };
}

/**
 * Remove a related-link between two FAQs (checks both directions).
 */
export async function removeRelated(faqIdA, faqIdB) {
  const client = await getSheetsClient();
  if (!client) throw new Error('Google Sheets not configured');

  const res = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${FAQ_RELATED_SHEET}!A:B`,
  });
  const rows = res.data.values || [];
  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i][0]; const b = rows[i][1];
    if ((a === faqIdA && b === faqIdB) || (a === faqIdB && b === faqIdA)) {
      rowIndex = i; // 0-based
      break;
    }
  }
  if (rowIndex === -1) return { success: false };

  const meta = await client.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = meta.data.sheets.find(s => s.properties.title === FAQ_RELATED_SHEET);
  await client.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{ deleteDimension: { range: {
        sheetId: sheet.properties.sheetId,
        dimension: 'ROWS',
        startIndex: rowIndex,
        endIndex: rowIndex + 1,
      }}}],
    },
  });
  console.log(`🔗 Unlinked FAQ ${faqIdA} <-> ${faqIdB}`);
  return { success: true };
}

// ===== QUESTIONNAIRE FUNCTIONS =====

export async function getOfficers() {
  const client = await getSheetsClient();
  if (!client) {
    // Local mock officers fallback
    return [
      { id: 'OFF-01', name: 'Kenny Chandra', email: 'kenny@privy.id' },
      { id: 'OFF-02', name: 'Fitriana Diah', email: 'fitriana@privy.id' },
      { id: 'OFF-03', name: 'Anindita Lola Rizka', email: 'lola@privy.id' },
      { id: 'OFF-04', name: 'Rizki Aji Pramono', email: 'rizki@privy.id' },
    ];
  }
  try {
    // Read from Users sheet and filter by position="Officer"
    const res = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${USERS_SHEET}!A2:E`,
    });
    const rows = res.data.values || [];
    const officers = rows
      .filter(row => {
        const position = (row[4] || '').trim().toLowerCase();
        return position === 'officer';
      })
      .map(row => ({
        id: row[0] || '',
        name: row[1] || '',
        email: row[3] || '',
      }));
    console.log(`👷 Found ${officers.length} officers from Users sheet`);
    return officers;
  } catch (err) {
    console.error('Error fetching officers:', err.message);
    return [];
  }
}

export async function getQuestionnaireQuestions(category) {
  const client = await getSheetsClient();
  const defaultQuestions = [
    { id: 'Q1', category: 'Privy Integration Officer Performance Questionnaire', questionText: 'The integration team clearly explained the integration process and technical requirements', order: 1 },
    { id: 'Q2', category: 'Privy Integration Officer Performance Questionnaire', questionText: 'The proposed solution met our business and technical needs.', order: 2 },
    { id: 'Q3', category: 'Privy Integration Officer Performance Questionnaire', questionText: 'The integration team provided timely and helpful support throughout the integration process.', order: 3 },
    { id: 'Q4', category: 'Privy Integration Officer Performance Questionnaire', questionText: 'Communication from the integration team was clear, responsive, and easy to understand', order: 4 },
    { id: 'Q5', category: 'Privy Integration Officer Performance Questionnaire', questionText: 'Overall, we are satisfied with the support and collaboration provided by the integration team during the integration project.', order: 5 },
  ];
  if (!client) {
    return category ? defaultQuestions.filter(q => q.category === category) : defaultQuestions;
  }
  try {
    const res = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${QUESTIONNAIRE_TEMPLATES_SHEET}!A2:D`,
    });
    const rows = res.data.values || [];
    const questions = rows.map(row => ({
      id: row[0] || '',
      category: row[1] || '',
      questionText: row[2] || '',
      order: parseInt(row[3], 10) || 0,
    }));
    return category ? questions.filter(q => q.category === category) : questions;
  } catch (err) {
    console.error('Error fetching templates:', err.message);
    return defaultQuestions;
  }
}

export async function getQuestionnaireLogs(senderId = null) {
  const client = await getSheetsClient();
  if (!client) return [];
  try {
    const res = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${QUESTIONNAIRE_LOGS_SHEET}!A2:H`,
    });
    const rows = res.data.values || [];
    const logs = rows.map(row => ({
      logId: row[0] || '',
      senderId: row[1] || '',
      senderName: row[2] || '',
      receiverEmail: row[3] || '',
      officerName: row[4] || '',
      category: row[5] || '',
      sentAt: row[6] || '',
      status: row[7] || '',
    }));
    return senderId ? logs.filter(l => l.senderId.toUpperCase() === senderId.toUpperCase()) : logs;
  } catch (err) {
    console.error('Error fetching questionnaire logs:', err.message);
    return [];
  }
}

export async function addQuestionnaireLog(log) {
  const client = await getSheetsClient();
  if (!client) return { success: true };
  try {
    await client.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${QUESTIONNAIRE_LOGS_SHEET}!A:H`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          log.logId,
          log.senderId || '',
          log.senderName || '',
          log.receiverEmail || '',
          log.officerName || '',
          log.category || '',
          log.sentAt || new Date().toISOString(),
          log.status || 'Sent',
        ]],
      },
    });
    return { success: true };
  } catch (err) {
    console.error('Error logging questionnaire send:', err.message);
    throw err;
  }
}

export async function updateQuestionnaireLogStatus(logId, status) {
  const client = await getSheetsClient();
  if (!client) return { success: true };
  try {
    const res = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${QUESTIONNAIRE_LOGS_SHEET}!A:A`,
    });
    const rows = res.data.values || [];
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === logId) {
        rowIndex = i + 1; // 1-based
        break;
      }
    }
    if (rowIndex === -1) throw new Error('Questionnaire log not found');
    await client.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${QUESTIONNAIRE_LOGS_SHEET}!H${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[status]],
      },
    });
    return { success: true };
  } catch (err) {
    console.error('Error updating questionnaire log status:', err.message);
    throw err;
  }
}

export async function getQuestionnaireLogById(logId) {
  const client = await getSheetsClient();
  if (!client) return null;
  try {
    const res = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${QUESTIONNAIRE_LOGS_SHEET}!A2:H`,
    });
    const rows = res.data.values || [];
    const row = rows.find(r => r[0] === logId);
    if (!row) return null;
    return {
      logId: row[0] || '',
      senderId: row[1] || '',
      senderName: row[2] || '',
      receiverEmail: row[3] || '',
      officerName: row[4] || '',
      category: row[5] || '',
      sentAt: row[6] || '',
      status: row[7] || '',
    };
  } catch (err) {
    console.error('Error fetching questionnaire log by id:', err.message);
    return null;
  }
}

export async function submitQuestionnaire(sub) {
  const client = await getSheetsClient();
  if (!client) return { success: true };
  try {
    // Look up sender name from Questionnaire_Logs if logId is provided
    let senderName = '';
    if (sub.logId) {
      try {
        const logsRes = await client.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${QUESTIONNAIRE_LOGS_SHEET}!A2:H`,
        });
        const logsRows = logsRes.data.values || [];
        const logRow = logsRows.find(row => row[0] === sub.logId);
        if (logRow) {
          senderName = logRow[2] || ''; // Column C is SenderName
        }
      } catch (err) {
        console.error('Error looking up sender name:', err.message);
      }
    }
    
    // Append to Questionnaire_Submissions
    await client.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${QUESTIONNAIRE_SUBMISSIONS_SHEET}!A:N`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          sub.submissionId,
          sub.logId || '',
          sub.receiverEmail || '',
          sub.officerName || '',
          sub.category || '',
          sub.q1_rating || '',
          sub.q2_rating || '',
          sub.q3_rating || '',
          sub.q4_rating || '',
          sub.q5_rating || '',
          sub.answersJson || '',
          sub.advice || '',
          sub.submittedAt || new Date().toISOString(),
          senderName,
        ]],
      },
    });
    // Update log status to 'Submitted'
    if (sub.logId) {
      await updateQuestionnaireLogStatus(sub.logId, 'Submitted');
    }
    return { success: true };
  } catch (err) {
    console.error('Error submitting questionnaire answers:', err.message);
    throw err;
  }
}

export async function getSubmissions(officerName = null, dateFrom = null, dateTo = null) {
  const client = await getSheetsClient();
  if (!client) return [];
  try {
    // Fetch submissions
    const res = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${QUESTIONNAIRE_SUBMISSIONS_SHEET}!A2:N`,
    });
    const rows = res.data.values || [];
    
    // Fetch logs to join with submissions
    const logsRes = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${QUESTIONNAIRE_LOGS_SHEET}!A2:H`,
    });
    const logsRows = logsRes.data.values || [];
    
    // Create a map: logId -> senderName
    const logMap = {};
    logsRows.forEach(logRow => {
      const logId = logRow[0];
      const senderName = logRow[2];
      if (logId) {
        logMap[logId] = senderName || 'Unknown';
      }
    });
    
    const submissions = rows.map(row => {
      const ratings = [row[5], row[6], row[7], row[8], row[9]]
        .map(v => parseFloat(v))
        .filter(v => !isNaN(v));
      const avgScore = ratings.length > 0
        ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)
        : null;
      
      const logId = row[1] || '';
      const senderName = logId && logMap[logId] ? logMap[logId] : 'Unknown';
      
      return {
        submissionId: row[0] || '',
        logId: logId,
        receiverEmail: row[2] || '',
        officerName: row[3] || '',
        category: row[4] || '',
        ratings: {
          Q1: row[5] || '', Q2: row[6] || '', Q3: row[7] || '',
          Q4: row[8] || '', Q5: row[9] || '',
        },
        answersJson: row[10] || '',
        advice: row[11] || '',
        submittedAt: row[12] || '',
        senderName: senderName,
        avgScore,
      };
    });
    
    // Apply filters
    let filtered = submissions;
    
    if (officerName) {
      filtered = filtered.filter(s => s.officerName === officerName);
    }
    
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      filtered = filtered.filter(s => {
        const submissionDate = s.submittedAt ? new Date(s.submittedAt) : null;
        return submissionDate && submissionDate >= fromDate;
      });
    }
    
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999); // End of day
      filtered = filtered.filter(s => {
        const submissionDate = s.submittedAt ? new Date(s.submittedAt) : null;
        return submissionDate && submissionDate <= toDate;
      });
    }
    
    return filtered;
  } catch (err) {
    console.error('Error fetching submissions:', err.message);
    return [];
  }
}


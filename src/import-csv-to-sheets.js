import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_FILE = path.join(__dirname, 'VE FAQ(FAQ All).csv');
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
const FAQ_SHEET = 'FAQ_Data';
const CATEGORIES_SHEET = 'Categories';

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// Simple CSV parser that handles quotes and newlines
function parseCSV(content) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ';') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        if (char === '\r') i++;
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }
  
  if (currentRow.length > 0 || currentField !== '') {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  
  return rows;
}

async function run() {
  console.log('🚀 Starting CSV to Google Sheets import...');
  
  const content = fs.readFileSync(CSV_FILE, 'utf-8');
  const rows = parseCSV(content);
  
  // Remove header row
  const headers = rows.shift();
  console.log(`📊 Found ${rows.length} FAQ entries in CSV`);

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // 1. Prepare data for FAQ_Data sheet
  // Headers: ID, Category, Question, Answer, Date, Reporter, Merchant, CreatedAt, UpdatedAt
  const now = new Date().toISOString();
  const faqValues = rows.filter(row => row.length >= 3 && row[1]).map((row, index) => {
    const [category, question, answer, date, reporter, merchant] = row;
    return [
      `faq-${String(index + 1).padStart(3, '0')}`,
      category || 'General',
      question || '',
      answer || '',
      date || '',
      reporter || '',
      merchant || '',
      now,
      now
    ];
  });

  // 2. Clear and Update FAQ_Data
  console.log('🧹 Clearing existing FAQ data...');
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${FAQ_SHEET}!A2:I`,
  });

  console.log('📤 Uploading new FAQ data...');
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${FAQ_SHEET}!A2`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: faqValues },
  });

  // 3. Update Categories
  const categories = [...new Set(faqValues.map(v => v[1]))].filter(Boolean);
  console.log(`📂 Updating ${categories.length} categories...`);
  
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${CATEGORIES_SHEET}!A2:A`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${CATEGORIES_SHEET}!A2`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: categories.map(c => [c]) },
  });

  console.log('✅ Import complete!');
}

run().catch(console.error);

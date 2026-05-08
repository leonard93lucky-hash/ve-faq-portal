import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_FILE = path.join(__dirname, 'VE FAQ(FAQ All).csv');
const JSON_FILE = path.join(__dirname, 'faq-data.json');

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

const content = fs.readFileSync(CSV_FILE, 'utf-8');
const rows = parseCSV(content);
rows.shift(); // remove header

const faqData = rows.filter(row => row.length >= 3 && row[1]).map((row, index) => {
  const [category, question, answer, date, reporter, merchant] = row;
  return {
    id: `faq-${String(index + 1).padStart(3, '0')}`,
    category: category || 'General',
    question: question || '',
    answer: answer || '',
    date: date || '',
    reporter: reporter || '',
    merchant: merchant || ''
  };
});

fs.writeFileSync(JSON_FILE, JSON.stringify(faqData, null, 2));
console.log(`✅ Updated ${JSON_FILE} with ${faqData.length} entries.`);

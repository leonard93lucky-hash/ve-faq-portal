// API client — uses backend when available, falls back to local mock data
import initialFaqData from './faq-data.json';
import usersData from './users.json';

const isProd = import.meta.env.PROD;
const API_URL = import.meta.env.VITE_API_URL || (isProd ? '/api' : 'http://localhost:3001/api');

let mockFaqs = [...initialFaqData];
let mockLogs = [];
let useBackend = true;

// --- Helper ---
async function request(endpoint, options = {}) {
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const json = await res.json();
    if (!res.ok) {
      const err = new Error(json.error || `API error: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return json;
  } catch (err) {
    if (err.status) throw err; // Re-throw API errors (like 401)
    console.warn('Backend unavailable, using local mock:', err.message);
    useBackend = false;
    return null;
  }
}

// --- Auth ---
export async function login(identifier, pin, email) {
  if (!identifier || !identifier.trim()) throw new Error('PrivyID or email is required');
  const body = { identifier: identifier.trim() };
  if (pin !== undefined) body.pin = pin;
  if (email !== undefined) body.email = email;

  // Auth MUST go to the real backend — no mock fallback for security
  const res = await fetch(`${API_URL}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json.error || `Auth error: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}


// --- FAQs ---
export async function fetchFAQs() {
  const data = await request('/faqs');
  if (data) return data;
  // Mock fallback
  return [...mockFaqs];
}

export async function addFAQ(faq, userId) {
  const payload = { ...faq, userId };
  const data = await request('/faqs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (data) return data;
  // Mock fallback
  const newFaq = {
    ...faq,
    id: `faq-${String(mockFaqs.length + 1).padStart(3, '0')}-${Date.now()}`,
    date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
  mockFaqs.unshift(newFaq);
  mockLogs.unshift({
    timestamp: new Date().toISOString(),
    userId,
    action: 'ADD',
    targetId: newFaq.id,
    details: `Added FAQ: "${newFaq.question}"`,
  });
  return newFaq;
}

export async function updateFAQ(id, faq, userId) {
  const payload = { ...faq, userId };
  const data = await request(`/faqs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (data) return data;
  // Mock fallback
  const idx = mockFaqs.findIndex(f => f.id === id);
  if (idx === -1) throw new Error('FAQ not found');
  const oldQuestion = mockFaqs[idx].question;
  mockFaqs[idx] = { ...mockFaqs[idx], ...faq };
  mockLogs.unshift({
    timestamp: new Date().toISOString(),
    userId,
    action: 'EDIT',
    targetId: id,
    details: `Edited FAQ: "${oldQuestion}"`,
  });
  return mockFaqs[idx];
}

export async function deleteFAQ(id, userId) {
  const data = await request(`/faqs/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ userId }),
  });
  if (data) return data;
  // Mock fallback
  const idx = mockFaqs.findIndex(f => f.id === id);
  if (idx === -1) throw new Error('FAQ not found');
  const removed = mockFaqs.splice(idx, 1)[0];
  mockLogs.unshift({
    timestamp: new Date().toISOString(),
    userId,
    action: 'DELETE',
    targetId: id,
    details: `Deleted FAQ: "${removed.question}"`,
  });
  return { success: true };
}

// --- Activity Logs ---
export async function fetchLogs(userId) {
  const query = userId ? `?userId=${userId}` : '';
  const data = await request(`/logs${query}`);
  if (data) return data;
  // Mock fallback
  if (userId) {
    const name = usersData[userId] || userId;
    return mockLogs.filter(log => log.userId === name);
  }
  return [...mockLogs];
}

// --- Categories ---
export async function fetchCategories() {
  const data = await request('/categories');
  if (data) return data;
  // Mock fallback
  return ['General', 'Policies & Compliance', 'Digital-ID', 'Liveness SDK', 'Technical Details'];
}

export async function addCategory(name) {
  const data = await request('/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return data;
}

export async function deleteCategory(name) {
  const data = await request(`/categories/${name}`, {
    method: 'DELETE',
  });
  return data;
}

// --- Ratings ---
export async function fetchRatings() {
  const data = await request('/ratings');
  return data || {};
}

export async function rateFAQ(faqId, userId, vote) {
  const data = await request(`/faqs/${faqId}/rate`, {
    method: 'POST',
    body: JSON.stringify({ userId, vote }),
  });
  return data;
}

// --- Related FAQs ---
export async function fetchRelated() {
  const data = await request('/related');
  return data || [];
}

export async function addRelated(faqId, userId, relatedFaqId, note = '') {
  const data = await request(`/faqs/${faqId}/related`, {
    method: 'POST',
    body: JSON.stringify({ userId, relatedFaqId, note }),
  });
  return data;
}

export async function removeRelated(faqId, relatedFaqId, userId) {
  const data = await request(`/faqs/${faqId}/related/${relatedFaqId}`, {
    method: 'DELETE',
    body: JSON.stringify({ userId }),
  });
  return data;
}

// --- Questionnaires ---
export async function fetchOfficers() {
  const data = await request('/officers');
  if (data) return data;
  return [];
}

export async function sendQuestionnaire(payload) {
  const data = await request('/questionnaires/send', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (data) return data;

  // Mock implementation for offline mode
  const mockLog = {
    logId: `qlog-${Date.now()}`,
    senderId: payload.senderId,
    senderName: 'Test User',
    receiverEmail: payload.receiverEmail,
    officerName: payload.officerName,
    category: JSON.stringify(payload.selectedQuestions || []),
    sentAt: new Date().toISOString(),
    status: 'Sent'
  };

  const currentLogs = JSON.parse(sessionStorage.getItem('mock_q_logs') || '[]');
  currentLogs.unshift(mockLog);
  sessionStorage.setItem('mock_q_logs', JSON.stringify(currentLogs));

  const link = `${window.location.origin}/privy-officer-performance-questionnaire?id=${mockLog.logId}`;
  console.log('✉️ Mock send success. Link:', link);
  return { success: true, logId: mockLog.logId, link };
}

export async function fetchQuestionnaireLogs(senderId = '') {
  const url = senderId 
    ? `/questionnaires/logs?senderId=${senderId}`
    : '/questionnaires/logs';
  const data = await request(url);
  if (data) return data;

  // Mock implementation
  const currentLogs = JSON.parse(sessionStorage.getItem('mock_q_logs') || '[]');
  return currentLogs.filter(l => l.senderId.toUpperCase() === senderId.toUpperCase());
}

export async function fetchQuestionnaireDetails(logId) {
  const data = await request(`/questionnaires/details/${logId}`);
  if (data) return data;

  // Mock: reconstruct details with inline questions
  const currentLogs = JSON.parse(sessionStorage.getItem('mock_q_logs') || '[]');
  const log = currentLogs.find(l => l.logId === logId);
  if (!log) throw new Error('Questionnaire link not found or expired.');

  const defaultQuestions = [
    { id: 'Q1', questionText: 'The integration team clearly explained the integration process and technical requirements', order: 1 },
    { id: 'Q2', questionText: 'The proposed solution met our business and technical needs.', order: 2 },
    { id: 'Q3', questionText: 'The integration team provided timely and helpful support throughout the integration process.', order: 3 },
    { id: 'Q4', questionText: 'Communication from the integration team was clear, responsive, and easy to understand.', order: 4 },
    { id: 'Q5', questionText: 'Overall, we are satisfied with the support and collaboration provided by the integration team during the integration project.', order: 5 },
  ];

  let questions = defaultQuestions;
  try {
    const selectedIds = JSON.parse(log.category);
    if (Array.isArray(selectedIds)) {
      questions = defaultQuestions.filter(q => selectedIds.includes(q.id));
    }
  } catch { /* use all default questions */ }

  return {
    logId: log.logId,
    receiverEmail: log.receiverEmail,
    officerName: log.officerName,
    category: 'Privy Integration Officer Performance Questionnaire',
    questions
  };
}

export async function fetchQuestionnaireQuestions(category) {
  const url = category
    ? `/questionnaire-templates?category=${encodeURIComponent(category)}`
    : '/questionnaire-templates';
  const data = await request(url);
  if (data) return data;

  return [
    { id: 'Q1', questionText: 'The integration team clearly explained the integration process and technical requirements', order: 1 },
    { id: 'Q2', questionText: 'The proposed solution met our business and technical needs.', order: 2 },
    { id: 'Q3', questionText: 'The integration team provided timely and helpful support throughout the integration process.', order: 3 },
    { id: 'Q4', questionText: 'Communication from the integration team was clear, responsive, and easy to understand.', order: 4 },
    { id: 'Q5', questionText: 'Overall, we are satisfied with the support and collaboration provided by the integration team during the integration project.', order: 5 },
  ];
}

export async function submitQuestionnaireAnswers(payload) {
  const data = await request('/questionnaires/submit', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (data) return data;

  // Mock implementation
  const currentLogs = JSON.parse(sessionStorage.getItem('mock_q_logs') || '[]');
  const logIndex = currentLogs.findIndex(l => l.logId === payload.logId);
  if (logIndex !== -1) {
    // Check if already submitted
    if (currentLogs[logIndex].status === 'Submitted') {
      throw new Error('This questionnaire has already been submitted. You cannot submit it again.');
    }
    currentLogs[logIndex].status = 'Submitted';
    sessionStorage.setItem('mock_q_logs', JSON.stringify(currentLogs));
  }
  return { success: true };
}

export async function fetchSubmissions(officerName = '', dateFrom = '', dateTo = '') {
  const params = new URLSearchParams();
  if (officerName) params.append('officerName', officerName);
  if (dateFrom) params.append('dateFrom', dateFrom);
  if (dateTo) params.append('dateTo', dateTo);
  
  const url = `/questionnaires/submissions?${params.toString()}`;
  const data = await request(url);
  if (data) return data;
  return [];
}


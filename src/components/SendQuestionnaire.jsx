import { useState, useEffect, useCallback } from 'react';
import { FiMail, FiUser, FiSend, FiClock, FiCheckCircle, FiRefreshCw, FiArrowLeft, FiFileText, FiList, FiBarChart2, FiMessageSquare, FiStar, FiDownload, FiFilter, FiCalendar } from 'react-icons/fi';
import { fetchOfficers, fetchQuestionnaireQuestions, sendQuestionnaire, fetchQuestionnaireLogs, fetchSubmissions } from '../api.js';

export default function SendQuestionnaire({ userId, userName, onBack, showToast }) {
  const [activeTab, setActiveTab] = useState('send'); // 'send' | 'results'
  const [officers, setOfficers] = useState([]);
  const [allQuestions, setAllQuestions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshingLogs, setRefreshingLogs] = useState(false);
  const [lastSentLink, setLastSentLink] = useState(null);
  const [copied, setCopied] = useState(false);

  // Form State
  const [receiverEmail, setReceiverEmail] = useState('');
  const [selectedOfficer, setSelectedOfficer] = useState('');
  const [selectedQuestions, setSelectedQuestions] = useState([]);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const [officersList, questionsList, logList] = await Promise.all([
        fetchOfficers(),
        fetchQuestionnaireQuestions(),
        fetchQuestionnaireLogs(), // Remove userId to fetch ALL logs
      ]);
      setOfficers(officersList);
      setAllQuestions(questionsList);
      setSelectedQuestions(questionsList.map(q => q.id));
      setLogs(logList);
    } catch (err) {
      showToast('Failed to load questionnaire data: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]); // Remove userId from dependencies

  // Filter states
  const [selectedOfficerFilter, setSelectedOfficerFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filteredSubmissions, setFilteredSubmissions] = useState([]);

  const loadSubmissions = useCallback(async (filters = {}) => {
    setSubmissionsLoading(true);
    try {
      const data = await fetchSubmissions(
        filters.officerName || '',
        filters.dateFrom || '',
        filters.dateTo || ''
      );
      setSubmissions(data);
      setFilteredSubmissions(data);
    } catch (err) {
      showToast('Failed to load submission results: ' + err.message, 'error');
    } finally {
      setSubmissionsLoading(false);
    }
  }, [showToast]);

  // Apply filters whenever filter states change
  useEffect(() => {
    if (submissions.length === 0) {
      setFilteredSubmissions([]);
      return;
    }

    let filtered = [...submissions];

    // Filter by officer
    if (selectedOfficerFilter) {
      filtered = filtered.filter(s => s.officerName === selectedOfficerFilter);
    }

    // Filter by date range
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

    setFilteredSubmissions(filtered);
  }, [submissions, selectedOfficerFilter, dateFrom, dateTo]);

  const handleExportCSV = () => {
    if (filteredSubmissions.length === 0) {
      showToast('No submissions to export', 'error');
      return;
    }

    const csvRows = [];
    
    // CSV headers
    const headers = [
      'Submission ID',
      'Officer Name',
      'Receiver Email',
      'Sent By',
      'Q1 Rating',
      'Q2 Rating',
      'Q3 Rating',
      'Q4 Rating',
      'Q5 Rating',
      'Average Score',
      'Advice',
      'Submitted At'
    ];
    csvRows.push(headers.join(','));

    // CSV data rows
    filteredSubmissions.forEach(sub => {
      const row = [
        `"${sub.submissionId || ''}"`,
        `"${sub.officerName || ''}"`,
        `"${sub.receiverEmail || ''}"`,
        `"${sub.senderName || 'Unknown'}"`,
        sub.ratings?.Q1 || '',
        sub.ratings?.Q2 || '',
        sub.ratings?.Q3 || '',
        sub.ratings?.Q4 || '',
        sub.ratings?.Q5 || '',
        sub.avgScore || '',
        `"${(sub.advice || '').replace(/"/g, '""')}"`,
        `"${sub.submittedAt || ''}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `questionnaire_submissions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast(`Exported ${filteredSubmissions.length} submissions to CSV`, 'success');
  };

  const handleClearFilters = () => {
    setSelectedOfficerFilter('');
    setDateFrom('');
    setDateTo('');
  };

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (activeTab === 'results') {
      loadSubmissions();
    }
  }, [activeTab, loadSubmissions]);

  const handleRefreshLogs = async () => {
    setRefreshingLogs(true);
    try {
      const logList = await fetchQuestionnaireLogs(); // Remove userId to fetch ALL logs
      setLogs(logList);
      showToast('Logs refreshed.');
    } catch (err) {
      showToast('Failed to refresh logs: ' + err.message, 'error');
    } finally {
      setRefreshingLogs(false);
    }
  };

  const handleToggleQuestion = (qId) => {
    setSelectedQuestions(prev =>
      prev.includes(qId) ? prev.filter(id => id !== qId) : [...prev, qId]
    );
  };

  const handleSelectAll = () => {
    setSelectedQuestions(
      selectedQuestions.length === allQuestions.length ? [] : allQuestions.map(q => q.id)
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!receiverEmail.trim()) { showToast('Please enter receiver email.', 'error'); return; }
    if (!selectedOfficer) { showToast('Please select an officer.', 'error'); return; }
    if (selectedQuestions.length === 0) { showToast('Please select at least one question.', 'error'); return; }

    setSubmitting(true);
    try {
      const result = await sendQuestionnaire({
        senderId: userId,
        receiverEmail: receiverEmail.trim().toLowerCase(),
        officerName: selectedOfficer,
        selectedQuestions,
      });
      if (result.success) {
        showToast('Questionnaire link generated successfully!');
        setLastSentLink(result.link);
        setReceiverEmail('');
        setSelectedOfficer('');
        const logList = await fetchQuestionnaireLogs(); // Remove userId to fetch ALL logs
        setLogs(logList);
      } else {
        showToast('Failed to send questionnaire.', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    if (!lastSentLink) return;
    navigator.clipboard.writeText(lastSentLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const allSelected = allQuestions.length > 0 && selectedQuestions.length === allQuestions.length;
  const someSelected = selectedQuestions.length > 0 && !allSelected;

  // Score badge color
  const scoreBadgeClass = (score) => {
    if (!score) return 'score-na';
    const n = parseFloat(score);
    if (n >= 4.5) return 'score-excellent';
    if (n >= 3.5) return 'score-good';
    if (n >= 2.5) return 'score-average';
    return 'score-poor';
  };

  const scoreLabel = (score) => {
    if (!score) return 'N/A';
    const n = parseFloat(score);
    if (n >= 4.5) return `${n} ⭐ Excellent`;
    if (n >= 3.5) return `${n} 👍 Good`;
    if (n >= 2.5) return `${n} 😐 Average`;
    return `${n} ⚠️ Poor`;
  };

  return (
    <div className="questionnaire-page animate-fade-in">
      <div className="q-header">
        <button className="q-back-btn" onClick={onBack} title="Back to Portal">
          <FiArrowLeft /> Back
        </button>
        <h2>Questionnaire Management</h2>
        <p>Send evaluation links to partners and review submission results from clients.</p>
      </div>

      {/* Tabs */}
      <div className="q-tabs">
        <button
          className={`q-tab ${activeTab === 'send' ? 'active' : ''}`}
          onClick={() => setActiveTab('send')}
          id="tab-send"
        >
          <FiSend /> Send Questionnaire
        </button>
        <button
          className={`q-tab ${activeTab === 'results' ? 'active' : ''}`}
          onClick={() => setActiveTab('results')}
          id="tab-results"
        >
          <FiBarChart2 /> Submission Results {submissions.length > 0 && <span className="q-tab-badge">{submissions.length}</span>}
        </button>
      </div>

      {/* ---- SEND TAB ---- */}
      {activeTab === 'send' && (
        <div className="q-content-grid">
          {/* Form Card */}
          <div className="q-card glass">
            <h3><FiSend style={{ marginRight: '0.5rem', verticalAlign: 'middle', color: 'var(--primary)' }} /> Send Evaluation Form</h3>

            {loading ? (
              <div className="q-loading"><span className="spin-icon">⏳</span> Loading setup...</div>
            ) : (
              <form onSubmit={handleSubmit} className="q-form">
                <div className="q-input-group">
                  <label htmlFor="receiver-email"><FiMail /> Receiver Email Address</label>
                  <input
                    id="receiver-email"
                    type="email"
                    placeholder="partner@merchant.com"
                    value={receiverEmail}
                    onChange={(e) => setReceiverEmail(e.target.value)}
                    disabled={submitting}
                    required
                  />
                </div>

                <div className="q-input-group">
                  <label htmlFor="officer-select"><FiUser /> Select Integration Officer</label>
                  <select
                    id="officer-select"
                    value={selectedOfficer}
                    onChange={(e) => setSelectedOfficer(e.target.value)}
                    disabled={submitting}
                    required
                  >
                    <option value="">-- Choose Officer --</option>
                    {officers.length === 0 ? (
                      <option disabled>No officers found in registry</option>
                    ) : (
                      officers.map((off) => (
                        <option key={off.id} value={off.name}>
                          {off.name}{off.email ? ` (${off.email})` : ''}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="q-input-group">
                  <label><FiList /> Select Questions to Send</label>
                  <div className="q-questions-picker">
                    <label className={`q-question-check select-all-check ${allSelected ? 'selected' : someSelected ? 'partial' : ''}`}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected; }}
                        onChange={handleSelectAll}
                        disabled={submitting}
                      />
                      <span className="q-check-label">
                        <strong>Select All</strong>
                        <small>{selectedQuestions.length}/{allQuestions.length} selected</small>
                      </span>
                    </label>
                    <div className="q-questions-divider" />
                    {allQuestions.map((q, idx) => (
                      <label
                        key={q.id}
                        className={`q-question-check ${selectedQuestions.includes(q.id) ? 'selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedQuestions.includes(q.id)}
                          onChange={() => handleToggleQuestion(q.id)}
                          disabled={submitting}
                        />
                        <span className="q-check-label">
                          <span className="q-check-num">{idx + 1}</span>
                          {q.questionText}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <button type="submit" className="btn-primary q-send-btn" disabled={submitting || selectedQuestions.length === 0}>
                  {submitting
                    ? <><span className="spin-icon">⏳</span> Generating link...</>
                    : <><FiSend style={{ marginRight: '0.4rem' }} /> Send Questionnaire Link</>}
                </button>
              </form>
            )}

            {lastSentLink && (
              <div className="q-link-banner">
                <div className="q-link-banner-label">✅ Questionnaire link ready — share or open to test:</div>
                <div className="q-link-row">
                  <a href={lastSentLink} target="_blank" rel="noreferrer" className="q-link-url">{lastSentLink}</a>
                  <button className="q-copy-btn" onClick={handleCopyLink}>{copied ? '✅ Copied!' : '📋 Copy'}</button>
                </div>
              </div>
            )}
          </div>

          {/* History Log Card */}
          <div className="q-card glass">
            <div className="history-title-row">
              <h3><FiClock style={{ marginRight: '0.5rem', verticalAlign: 'middle', color: 'var(--primary)' }} /> Sent History</h3>
              <button className="icon-btn-small" onClick={handleRefreshLogs} disabled={refreshingLogs || loading} title="Refresh logs">
                <FiRefreshCw className={refreshingLogs ? 'spin' : ''} />
              </button>
            </div>
            <div className="q-logs-list">
              {logs.length === 0 ? (
                <div className="no-q-logs">
                  <FiClock size={24} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
                  <p>No questionnaires sent yet.</p>
                </div>
              ) : (
                logs.map((log) => {
                  let questionCount = 'All questions';
                  try {
                    const ids = JSON.parse(log.category);
                    if (Array.isArray(ids)) questionCount = `${ids.length} question${ids.length !== 1 ? 's' : ''}`;
                  } catch { /* use default */ }
                  return (
                    <div key={log.logId} className="q-log-item">
                      <div className="q-log-info">
                        <div className="q-log-receiver"><strong>{log.receiverEmail}</strong></div>
                        <div className="q-log-meta">
                          Sent by: <span style={{ color: 'var(--primary)', fontWeight: '600' }}>{log.senderName}</span> | 
                          Officer: <span>{log.officerName}</span> | 
                          <span>{new Date(log.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                        <div className="q-log-category">{questionCount}</div>
                      </div>
                      <div className={`q-log-status ${log.status === 'Submitted' ? 'status-submitted' : 'status-sent'}`}>
                        {log.status === 'Submitted' ? <><FiCheckCircle /> Submitted</> : 'Sent'}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- RESULTS TAB ---- */}
      {activeTab === 'results' && (
        <div className="q-results-section">
          {/* Export and Filter Controls */}
          <div className="q-export-controls">
            <div className="q-filters-row">
              <div className="q-filter-group">
                <label className="q-filter-label"><FiFilter /> Filter by Officer</label>
                <select
                  className="q-filter-select"
                  value={selectedOfficerFilter}
                  onChange={(e) => setSelectedOfficerFilter(e.target.value)}
                >
                  <option value="">All Officers</option>
                  {Array.from(new Set(submissions.map(s => s.officerName))).sort().map(officer => (
                    <option key={officer} value={officer}>{officer}</option>
                  ))}
                </select>
              </div>
              
              <div className="q-filter-group">
                <label className="q-filter-label"><FiCalendar /> Date Range</label>
                <div className="q-date-range">
                  <input
                    type="date"
                    className="q-date-input"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    title="From date"
                  />
                  <span className="q-date-divider">to</span>
                  <input
                    type="date"
                    className="q-date-input"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    title="To date"
                  />
                </div>
              </div>
              
              {(selectedOfficerFilter || dateFrom || dateTo) && (
                <button className="q-clear-filters" onClick={handleClearFilters}>
                  Clear Filters
                </button>
              )}
            </div>
            
            <div className="q-export-actions">
              <button className="q-export-btn secondary" onClick={handleClearFilters}>
                <FiRefreshCw /> Reset
              </button>
              <button className="q-export-btn" onClick={handleExportCSV}>
                <FiDownload /> Export CSV ({filteredSubmissions.length})
              </button>
            </div>
          </div>
          
          <div className="q-results-header-row">
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Showing {filteredSubmissions.length} of {submissions.length} submission{submissions.length !== 1 ? 's' : ''}
              {(selectedOfficerFilter || dateFrom || dateTo) && (
                <span style={{ marginLeft: '0.5rem', color: 'var(--primary)' }}>
                  (Filtered)
                </span>
              )}
            </p>
            <button className="icon-btn-small" onClick={loadSubmissions} disabled={submissionsLoading} title="Refresh results">
              <FiRefreshCw className={submissionsLoading ? 'spin' : ''} />
            </button>
          </div>

          {submissionsLoading ? (
            <div className="q-loading"><span className="spin-icon">⏳</span> Loading results...</div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="no-results-message">
              <FiBarChart2 size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
              <h4>No submissions found</h4>
              <p>
                {submissions.length === 0 
                  ? 'No submissions yet. Results will appear here once clients submit the form.'
                  : 'No submissions match your current filters. Try changing the officer or date range.'}
              </p>
            </div>
          ) : (
            <div className="q-results-list">
              {filteredSubmissions.slice().reverse().map((sub, idx) => (
                <div key={sub.submissionId || idx} className="q-result-card glass">
                  <div className="q-result-top">
                    <div className="q-result-meta">
                      <div className="q-result-officer">
                        <FiUser style={{ marginRight: '0.4rem', color: 'var(--primary)' }} />
                        <strong>{sub.officerName}</strong>
                      </div>
                      <div className="q-result-email">
                        <FiMail style={{ marginRight: '0.4rem', color: 'var(--text-muted)' }} />
                        {sub.receiverEmail}
                      </div>
                      <div className="q-result-time">
                        <FiSend style={{ marginRight: '0.4rem', color: 'var(--text-muted)' }} />
                        Sent by: <strong style={{ color: 'var(--primary)', marginLeft: '0.25rem' }}>{sub.senderName || 'Unknown'}</strong>
                      </div>
                      <div className="q-result-time">
                        <FiClock style={{ marginRight: '0.4rem', color: 'var(--text-muted)' }} />
                        {sub.submittedAt
                          ? new Date(sub.submittedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : 'Unknown time'}
                      </div>
                    </div>
                    <div className={`q-score-badge ${scoreBadgeClass(sub.avgScore)}`}>
                      <FiStar style={{ marginRight: '0.3rem' }} />
                      {scoreLabel(sub.avgScore)}
                    </div>
                  </div>

                  {/* Individual ratings */}
                  <div className="q-result-ratings">
                    {Object.entries(sub.ratings || {}).filter(([, v]) => v !== '').map(([key, val]) => (
                      <div key={key} className="q-result-rating-chip">
                        <span className="q-result-rating-key">{key}</span>
                        <span className="q-result-rating-val">{val}/5</span>
                      </div>
                    ))}
                  </div>

                  {/* Free text advice */}
                  {sub.advice && (
                    <div className="q-result-advice">
                      <FiMessageSquare style={{ marginRight: '0.4rem', color: 'var(--text-muted)', flexShrink: 0, marginTop: '2px' }} />
                      <p>{sub.advice}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

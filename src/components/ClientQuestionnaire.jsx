import { useState, useEffect } from 'react';
import { fetchQuestionnaireDetails, submitQuestionnaireAnswers, fetchSubmissions } from '../api.js';

export default function ClientQuestionnaire() {
  const [logDetails, setLogDetails] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  // Answers state: { Q1: rating, Q2: rating, ... }
  const [answers, setAnswers] = useState({});
  const [advice, setAdvice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const logId = urlParams.get('id');

  useEffect(() => {
    async function loadData() {
      if (!logId) {
        setError('Missing Questionnaire ID in URL. Please use the link provided in the email.');
        setLoading(false);
        return;
      }
      try {
        const details = await fetchQuestionnaireDetails(logId);
        setLogDetails(details);
        const qList = details.questions || [];
        setQuestions(qList);
        const initialAnswers = {};
        qList.forEach(q => { initialAnswers[q.id] = ''; });
        setAnswers(initialAnswers);
        
        // Check if already submitted
        try {
          const submissions = await fetchSubmissions();
          const alreadySubmitted = submissions.some(s => s.logId === logId);
          if (alreadySubmitted) {
            setSubmitted(true);
          }
        } catch (submissionErr) {
          console.log('Could not check submission status:', submissionErr.message);
        }
      } catch (err) {
        setError(err.message || 'Failed to load questionnaire. The link may have expired.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [logId]);

  const handleRatingChange = (qId, ratingValue) => {
    setAnswers(prev => ({ ...prev, [qId]: ratingValue }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setShowValidation(true);

    const unanswered = questions.some(q => !answers[q.id]);
    if (unanswered) {
      // Scroll to the first unanswered question
      const firstUnanswered = questions.find(q => !answers[q.id]);
      if (firstUnanswered) {
        document.getElementById(`q-${firstUnanswered.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setSubmitting(true);
    try {
      await submitQuestionnaireAnswers({
        logId: logDetails.logId,
        receiverEmail: logDetails.receiverEmail,
        officerName: logDetails.officerName,
        answers,
        advice
      });
      setSubmitted(true);
    } catch (err) {
      if (err.message.includes('already been submitted')) {
        // Mark as submitted if already submitted
        setSubmitted(true);
      } else {
        alert('Failed to submit questionnaire: ' + err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const ratingOptions = [
    { label: 'Strongly Disagree', value: '1' },
    { label: 'Disagree', value: '2' },
    { label: 'Neutral', value: '3' },
    { label: 'Agree', value: '4' },
    { label: 'Strongly Agree', value: '5' }
  ];

  if (loading) {
    return (
      <div className="client-q-wrapper">
        <div className="client-q-card glass text-center">
          <span style={{ fontSize: '2rem' }}>⏳</span>
          <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Loading questionnaire...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="client-q-wrapper">
        <div className="client-q-card glass text-center">
          <h2 style={{ color: 'var(--primary)', marginBottom: '1rem' }}>Oops!</h2>
          <p style={{ color: 'var(--text-muted)' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="client-q-wrapper">
        <div className="client-q-card glass text-center animate-fade-in">
          <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>✅</div>
          <h2 style={{ marginBottom: '0.75rem' }}>Thank You!</h2>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.7' }}>
            Your feedback has been successfully submitted. We appreciate your time and cooperation in helping us improve our integration services.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="client-q-wrapper animate-fade-in">
      <div className="client-q-card glass">
        <div className="client-q-header">
          <img
            src="https://privy.id/_nuxt/Privy_Logo_Red.BXNsidzu.png"
            alt="Privy"
            style={{ height: '32px', marginBottom: '1.5rem' }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <h2>Privy Integration Officer Performance Questionnaire</h2>
          <div className="client-q-meta-box">
            <p><strong>Officer Being Evaluated:</strong> {logDetails?.officerName}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="client-q-form">
          {/* Validation banner */}
          {showValidation && questions.some(q => !answers[q.id]) && (
            <div className="client-q-validation-banner">
              ⚠️ Please answer all {questions.length} questions before submitting. Unanswered questions are highlighted in red.
            </div>
          )}

          {questions.map((q, idx) => {
            const isUnanswered = showValidation && !answers[q.id];
            return (
              <div
                key={q.id}
                id={`q-${q.id}`}
                className={`client-q-item ${isUnanswered ? 'unanswered' : ''}`}
              >
                <p className="client-q-text">
                  {idx + 1}. {q.questionText}
                  <span className="client-q-required"> *</span>
                  {isUnanswered && <span className="client-q-error-label"> — Required</span>}
                </p>
                <div className="client-q-rating-group">
                  {ratingOptions.map(opt => (
                    <label
                      key={opt.value}
                      className={`client-q-rating-label ${answers[q.id] === opt.value ? 'selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name={`question_${q.id}`}
                        value={opt.value}
                        checked={answers[q.id] === opt.value}
                        onChange={() => handleRatingChange(q.id, opt.value)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="client-q-advice-group">
            <label htmlFor="advice-input">Additional feedback or suggestions for the officer: <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Optional)</span></label>
            <textarea
              id="advice-input"
              rows={4}
              placeholder="Share any additional comments, suggestions, or areas of improvement here..."
              value={advice}
              onChange={(e) => setAdvice(e.target.value)}
            />
          </div>

          <button type="submit" className="btn-primary client-q-submit-btn" disabled={submitting}>
            {submitting ? 'Submitting your feedback...' : 'Submit Feedback'}
          </button>
        </form>
      </div>
    </div>
  );
}

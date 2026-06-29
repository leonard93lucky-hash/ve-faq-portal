import { useState, useMemo } from 'react';
import { FiX, FiAward, FiStar, FiCalendar, FiUser, FiTrendingUp, FiThumbsUp, FiAlertTriangle, FiThumbsDown } from 'react-icons/fi';

export default function StatsDashboard({ isOpen, onClose, faqs, ratings = {} }) {
  const [activeTab, setActiveTab] = useState('all-time');

  // Helper to parse dates consistently
  const parseDate = (dateStr) => {
    if (!dateStr) return 0;
    try {
      let normalized = dateStr.replace(/-/g, ' ').replace(/\//g, ' ');
      const parts = normalized.split(/\s+/);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[2].length === 4) {
        normalized = `${parts[1]} ${parts[0]} ${parts[2]}`;
      }
      const d = new Date(normalized);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    } catch { return 0; }
  };

  // Top 10 Contributors - All time
  const topAllTime = useMemo(() => {
    const counts = {};
    faqs.forEach(faq => {
      const reporter = (faq.reporter || 'Unknown').trim();
      if (reporter) {
        counts[reporter] = (counts[reporter] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [faqs]);

  // Top 3 Contributors per Quarter
  const topQuarterly = useMemo(() => {
    const quarters = {}; // e.g. { "2026-Q1": { label: "Q1 2026", counts: { "Lucky": 5 } } }
    
    faqs.forEach(faq => {
      const dateVal = parseDate(faq.date);
      const created = dateVal > 0 ? new Date(dateVal) : (faq.createdAt ? new Date(faq.createdAt) : null);
      if (!created) return;
      
      const year = created.getFullYear();
      const q = Math.floor(created.getMonth() / 3) + 1;
      const key = `${year}-Q${q}`;
      const label = `Q${q} ${year}`;
      
      if (!quarters[key]) {
        quarters[key] = { label, counts: {} };
      }
      
      const reporter = (faq.reporter || 'Unknown').trim();
      quarters[key].counts[reporter] = (quarters[key].counts[reporter] || 0) + 1;
    });
    
    return Object.entries(quarters)
      .map(([key, data]) => {
        const top3 = Object.entries(data.counts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);
        return { key, label: data.label, contributors: top3 };
      })
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [faqs]);

  // Top 10 Rated FAQs (highest average score first)
  const topRatedFaqs = useMemo(() => {
    return faqs
      .map(faq => {
        const r = ratings[faq.id] || { average: 0, total: 0 };
        return { ...faq, average: r.average || 0, totalVotes: r.total || 0 };
      })
      .filter(faq => faq.totalVotes > 0)
      .sort((a, b) => {
        if (b.average !== a.average) return b.average - a.average;
        return b.totalVotes - a.totalVotes;
      })
      .slice(0, 10);
  }, [faqs, ratings]);

  // Low-Rated FAQs (average < 3.0 stars, needs review)
  const lowRatedFaqs = useMemo(() => {
    return faqs
      .map(faq => {
        const r = ratings[faq.id] || { average: 0, total: 0 };
        return { ...faq, average: r.average || 0, totalVotes: r.total || 0 };
      })
      .filter(faq => faq.totalVotes >= 1 && faq.average < 3.0)
      .sort((a, b) => a.average - b.average); // worst average first
  }, [faqs, ratings]);

  if (!isOpen) return null;

  return (
    <div className="activity-log-overlay" onClick={onClose}>
      <div className="activity-log-panel glass animate-slide-in" onClick={e => e.stopPropagation()} style={{ width: '480px' }}>
        <div className="activity-log-header">
          <h2><FiAward style={{ marginRight: '0.5rem', color: 'var(--primary)' }} /> Contributor Leaderboard</h2>
          <button className="close-btn" onClick={onClose} id="stats-close-btn">
            <FiX />
          </button>
        </div>

        <div className="stats-tabs">
          <button
            className={`stats-tab ${activeTab === 'all-time' ? 'active' : ''}`}
            onClick={() => setActiveTab('all-time')}
          >
            <FiTrendingUp /><span>Top 10 All-Time</span>
          </button>
          <button
            className={`stats-tab ${activeTab === 'quarterly' ? 'active' : ''}`}
            onClick={() => setActiveTab('quarterly')}
          >
            <FiCalendar /><span>Quarterly</span>
          </button>
          <button
            className={`stats-tab ${activeTab === 'top-rated' ? 'active' : ''}`}
            onClick={() => setActiveTab('top-rated')}
          >
            <FiThumbsUp /><span>Top Rated</span>
          </button>
          <button
            className={`stats-tab ${activeTab === 'low-rated' ? 'active' : ''}`}
            onClick={() => setActiveTab('low-rated')}
          >
            <FiAlertTriangle /><span>Needs Review {lowRatedFaqs.length > 0 && <span className="low-rated-badge" style={{marginLeft:'0.3rem'}}>{lowRatedFaqs.length}</span>}</span>
          </button>
        </div>

        <div className="activity-log-body">
          {activeTab === 'all-time' && (
            <div className="leaderboard-list">
              {topAllTime.length === 0 ? (
                <div className="log-empty"><FiAward className="log-empty-icon" /><p>No contributors found</p></div>
              ) : (
                topAllTime.map((item, index) => {
                  const rank = index + 1;
                  let badgeClass = '';
                  if (rank === 1) badgeClass = 'rank-gold';
                  else if (rank === 2) badgeClass = 'rank-silver';
                  else if (rank === 3) badgeClass = 'rank-bronze';
                  const maxCount = topAllTime[0]?.count || 1;
                  const percent = Math.min((item.count / maxCount) * 100, 100);
                  return (
                    <div key={item.name} className="leaderboard-item animate-fade-in">
                      <div className={`leaderboard-rank ${badgeClass}`}>{rank <= 3 ? <FiStar /> : rank}</div>
                      <div className="leaderboard-info">
                        <div className="leaderboard-meta">
                          <span className="leaderboard-name">{item.name}</span>
                          <span className="leaderboard-count"><strong>{item.count}</strong> FAQs</span>
                        </div>
                        <div className="leaderboard-progress-bg">
                          <div className="leaderboard-progress-bar" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'quarterly' && (
            <div className="quarterly-timeline">
              {topQuarterly.length === 0 ? (
                <div className="log-empty"><FiCalendar className="log-empty-icon" /><p>No data recorded yet</p></div>
              ) : (
                topQuarterly.map((qData) => (
                  <div key={qData.key} className="quarter-card glass animate-fade-in">
                    <h3 className="quarter-title"><FiCalendar style={{ marginRight: '0.4rem' }} />{qData.label}</h3>
                    <div className="quarter-contributors">
                      {qData.contributors.map((item, idx) => {
                        const rank = idx + 1;
                        let rankText = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
                        return (
                          <div key={item.name} className="quarter-contributor-row">
                            <span className="quarter-rank-emoji">{rankText}</span>
                            <span className="quarter-name">{item.name}</span>
                            <span className="quarter-count"><strong>{item.count}</strong> FAQs</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'top-rated' && (
            <div className="leaderboard-list">
              {topRatedFaqs.length === 0 ? (
                <div className="log-empty"><FiThumbsUp className="log-empty-icon" /><p>No rated FAQs yet</p></div>
              ) : (
                topRatedFaqs.map((faq, index) => {
                  const rank = index + 1;
                  let badgeClass = '';
                  if (rank === 1) badgeClass = 'rank-gold';
                  else if (rank === 2) badgeClass = 'rank-silver';
                  else if (rank === 3) badgeClass = 'rank-bronze';
                  const maxScore = topRatedFaqs[0]?.average || 5;
                  const percent = Math.min((faq.average / Math.max(maxScore, 1)) * 100, 100);
                  return (
                    <div key={faq.id} className="leaderboard-item animate-fade-in">
                      <div className={`leaderboard-rank ${badgeClass}`}>{rank <= 3 ? <FiStar /> : rank}</div>
                      <div className="leaderboard-info">
                        <div className="leaderboard-meta">
                          <span className="leaderboard-name" style={{fontSize:'0.8rem', maxWidth:'260px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                            {faq.question}
                          </span>
                          <span className="leaderboard-count" style={{color:'var(--warning)'}}>
                            ★ {faq.average} ({faq.totalVotes} {faq.totalVotes === 1 ? 'review' : 'reviews'})
                          </span>
                        </div>
                        <div className="leaderboard-progress-bg">
                          <div className="leaderboard-progress-bar" style={{ width: `${Math.max(percent, 4)}%`, background: 'var(--warning)' }} />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'low-rated' && (
            <div className="leaderboard-list">
              {lowRatedFaqs.length === 0 ? (
                <div className="log-empty">
                  <FiThumbsUp className="log-empty-icon" style={{color:'var(--success)'}} />
                  <p style={{color:'var(--success)'}}>All FAQs have good ratings! Nothing to review.</p>
                </div>
              ) : (
                <>
                  <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.1)', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FiAlertTriangle />
                    <span>These FAQs have an average rating lower than 3.0 ★. Consider reviewing or updating them.</span>
                  </div>
                  {lowRatedFaqs.map((faq) => (
                    <div key={faq.id} className="leaderboard-item animate-fade-in" style={{borderLeft: '3px solid var(--danger)'}}>
                      <div className="leaderboard-rank" style={{background:'rgba(239,68,68,0.15)', color:'var(--danger)'}}>
                        <FiAlertTriangle />
                      </div>
                      <div className="leaderboard-info">
                        <div className="leaderboard-meta">
                          <span className="leaderboard-name" style={{fontSize:'0.8rem', maxWidth:'260px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                            {faq.question}
                          </span>
                          <span className="leaderboard-count" style={{color:'var(--danger)'}}>
                            ★ {faq.average} ({faq.totalVotes} {faq.totalVotes === 1 ? 'review' : 'reviews'})
                          </span>
                        </div>
                        <div style={{fontSize:'0.72rem', color:'var(--text-muted)', marginTop:'0.2rem'}}>{faq.category} · {faq.reporter}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

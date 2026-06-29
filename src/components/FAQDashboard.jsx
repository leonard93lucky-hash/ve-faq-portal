import { useState, useMemo, useEffect, useRef } from 'react';
import {
  FiSearch, FiPlus, FiChevronDown, FiEdit2, FiTrash2,
  FiClock, FiLogOut, FiUser, FiFilter, FiX, FiRefreshCw,
  FiArrowUp, FiArrowDown, FiAward, FiStar, FiLink, FiAlertTriangle, FiTrendingUp
} from 'react-icons/fi';

// Default category list as fallback
const DEFAULT_CATEGORIES = [
  'General',
  'Policies & Compliance',
  'Digital-ID',
  'Liveness SDK',
  'Technical Details',
];

const CATEGORY_COLORS = {
  'General': 'cat-general',
  'Policies & Compliance': 'cat-policies',
  'Digital-ID': 'cat-digital',
  'Liveness SDK': 'cat-liveness',
  'Technical Details': 'cat-technical',
};

export default function FAQDashboard({
  faqs,
  userName,
  userId,
  categories = DEFAULT_CATEGORIES,
  ratings = {},
  related = [],
  onAdd,
  onEdit,
  onDelete,
  onShowLogs,
  onShowStats,
  onLogout,
  logCount,
  onRefresh,
  isLoading,
  onRate,
  onAddRelated,
  onRemoveRelated,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeContributor, setActiveContributor] = useState('All');
  const [openFaqId, setOpenFaqId] = useState(null);
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [showLowRated, setShowLowRated] = useState(false);

  // Related FAQ picker state
  const [relatedPickerFaqId, setRelatedPickerFaqId] = useState(null);
  const [relatedSearch, setRelatedSearch] = useState('');
  const [ratingInFlight, setRatingInFlight] = useState({});
  const [hoveredStar, setHoveredStar] = useState({}); // { [faqId]: starIndex }
  const relatedPickerRef = useRef(null);

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

  const uniqueContributors = useMemo(() => {
    const reporters = faqs.map(faq => (faq.reporter || '').trim()).filter(Boolean);
    return [...new Set(reporters)].sort((a, b) => a.localeCompare(b));
  }, [faqs]);

  // Low rated threshold: average rating < 3.0 stars (requires at least 1 review)
  const lowRatedFaqIds = useMemo(() => {
    const ids = new Set();
    for (const [faqId, data] of Object.entries(ratings)) {
      if (data.total >= 1 && (data.average || 0) < 3.0) {
        ids.add(faqId);
      }
    }
    return ids;
  }, [ratings]);

  const filteredFaqs = useMemo(() => {
    return faqs.filter(faq => {
      const matchesSearch = !searchQuery ||
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (faq.merchant && faq.merchant.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (faq.reporter && faq.reporter.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = activeCategory === 'All' || faq.category === activeCategory;
      const matchesContributor = activeContributor === 'All' || (faq.reporter && faq.reporter.trim() === activeContributor);
      const matchesLowRated = !showLowRated || lowRatedFaqIds.has(faq.id);
      return matchesSearch && matchesCategory && matchesContributor && matchesLowRated;
    });
  }, [faqs, searchQuery, activeCategory, activeContributor, showLowRated, lowRatedFaqIds]);

  const sortedFaqs = useMemo(() => {
    return [...filteredFaqs].sort((a, b) => {
      if (sortOrder === 'top-rated') {
        const ratingA = ratings[a.id]?.average ?? 0;
        const ratingB = ratings[b.id]?.average ?? 0;
        if (ratingB !== ratingA) return ratingB - ratingA;
        const totalA = ratings[a.id]?.total ?? 0;
        const totalB = ratings[b.id]?.total ?? 0;
        return totalB - totalA;
      }
      if (sortOrder === 'most-voted') {
        const totalA = ratings[a.id]?.total ?? 0;
        const totalB = ratings[b.id]?.total ?? 0;
        return totalB - totalA;
      }
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : parseDate(a.date);
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : parseDate(b.date);
      if (timeA === timeB) {
        return sortOrder === 'desc'
          ? (b.id || '').localeCompare(a.id || '')
          : (a.id || '').localeCompare(b.id || '');
      }
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }, [filteredFaqs, sortOrder, ratings]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeCategory, activeContributor, itemsPerPage, showLowRated, sortOrder]);

  const totalPages = Math.ceil(sortedFaqs.length / itemsPerPage);

  const paginatedFaqs = useMemo(() => {
    return sortedFaqs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [sortedFaqs, currentPage, itemsPerPage]);

  const contributorsData = useMemo(() => {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3);
    const year = now.getFullYear();
    const startOfQuarter = new Date(year, quarter * 3, 1);
    const currentQuarterFaqs = faqs.filter(faq => {
      const dateVal = parseDate(faq.date);
      const created = dateVal > 0 ? new Date(dateVal) : (faq.createdAt ? new Date(faq.createdAt) : null);
      return created && created >= startOfQuarter;
    });
    const counts = currentQuarterFaqs.reduce((acc, faq) => {
      const reporter = (faq.reporter || 'Unknown').trim();
      if (reporter) acc[reporter] = (acc[reporter] || 0) + 1;
      return acc;
    }, {});
    const top5 = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 5).map(([name, count]) => ({ name, count }));
    return { list: top5, label: `Q${quarter + 1} ${year}` };
  }, [faqs]);

  const toggleFaq = (id) => {
    setOpenFaqId(openFaqId === id ? null : id);
    setRelatedPickerFaqId(null);
    setRelatedSearch('');
  };

  const formatEditTime = (ts) => {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  const getUserVote = (faqId) => {
    const r = ratings[faqId];
    if (!r || !r.voters) return null;
    const voter = r.voters.find(v => v.userId === (userName || userId));
    return voter ? voter.vote : null;
  };

  // --- Rating Handler with toggle cancel capability ---
  const handleRateClick = async (faqId, starValue) => {
    if (ratingInFlight[faqId]) return;
    const currentVote = getUserVote(faqId);
    
    // If user clicks the exact same star they already rated, cancel it (send 0)
    const targetVote = currentVote === starValue ? 0 : starValue;

    setRatingInFlight(prev => ({ ...prev, [faqId]: true }));
    try {
      await onRate(faqId, targetVote);
    } finally {
      setRatingInFlight(prev => ({ ...prev, [faqId]: false }));
    }
  };

  const getRelatedFaqs = (faqId) => {
    return related
      .filter(r => r.faqIdA === faqId || r.faqIdB === faqId)
      .map(r => {
        const linkedId = r.faqIdA === faqId ? r.faqIdB : r.faqIdA;
        const linkedFaq = faqs.find(f => f.id === linkedId);
        return linkedFaq ? { ...linkedFaq, note: r.note, linkedBy: r.linkedBy } : null;
      })
      .filter(Boolean);
  };

  const getLinkCandidates = (faqId) => {
    const linkedIds = new Set(
      related
        .filter(r => r.faqIdA === faqId || r.faqIdB === faqId)
        .map(r => r.faqIdA === faqId ? r.faqIdB : r.faqIdA)
    );
    return faqs.filter(f =>
      f.id !== faqId &&
      !linkedIds.has(f.id) &&
      (!relatedSearch ||
        f.question.toLowerCase().includes(relatedSearch.toLowerCase()) ||
        (f.category || '').toLowerCase().includes(relatedSearch.toLowerCase()))
    ).slice(0, 8);
  };

  const handleScrollToFaq = (faqId) => {
    setOpenFaqId(faqId);
    setTimeout(() => {
      const el = document.getElementById(`faq-item-${faqId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  return (
    <div className="dashboard-container animate-fade-in">
      {/* Top Bar */}
      <header className="top-bar glass">
        <div className="top-bar-left">
          <img
            src="https://privy.id/_nuxt/Privy_Logo_Red.BXNsidzu.png"
            alt="Privy"
            style={{ height: '24px', objectFit: 'contain' }}
          />
          <span className="top-bar-divider" />
          <h1 className="logo-text" style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>VE FAQ Portal</h1>
        </div>
        <div className="top-bar-right">
          <button className="icon-btn-text" onClick={onShowStats} id="show-stats-btn">
            <FiAward /><span>Leaderboard</span>
          </button>
          <button className="icon-btn-text" onClick={onShowLogs} id="show-logs-btn">
            <FiClock /><span>Activity Log</span>
            {logCount > 0 && <span className="log-badge-count">{logCount}</span>}
          </button>
          <button className="icon-btn" onClick={onRefresh} disabled={isLoading} title="Refresh Data" id="refresh-data-btn">
            <FiRefreshCw className={isLoading ? 'spin' : ''} />
          </button>
          <div className="user-pill"><FiUser /><span>{userName}</span></div>
          <button className="icon-btn" onClick={onLogout} title="Logout" id="logout-btn"><FiLogOut /></button>
        </div>
      </header>

      {/* Hero Section */}
      <div className="hero-section">
        <h2>How can we help you?</h2>
        <p>Search through our frequently asked questions or add new knowledge</p>
        <div className="search-bar">
          <FiSearch className="search-icon" />
          <input
            id="search-input"
            type="text"
            className="input-field search-input glass"
            placeholder="Search questions, answers, merchants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')}><FiX /></button>
          )}
        </div>
      </div>

      {/* Top Contributors Section */}
      {contributorsData.list.length > 0 && (
        <div className="contributors-container animate-fade-in">
          <div className="contributors-header">
            <FiAward className="award-icon" />
            <span>Top Contributors <strong>{contributorsData.label}</strong></span>
          </div>
          <div className="contributors-list">
            {contributorsData.list.map((c, i) => (
              <div key={c.name} className="contributor-tag glass">
                <span className="contributor-rank">{i + 1}</span>
                <span className="contributor-name">{c.name}</span>
                <span className="contributor-count"><FiStar className="star-icon" />{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category Filters & Add Button */}
      <div className="toolbar">
        <div className="category-filters">
          <FiFilter className="filter-icon" />
          {['All', ...categories].map(cat => (
            <button
              key={cat}
              className={`category-chip ${activeCategory === cat ? 'active' : ''} ${cat !== 'All' ? (CATEGORY_COLORS[cat] || 'cat-general') : ''}`}
              onClick={() => { setActiveCategory(cat); setShowLowRated(false); }}
              id={`filter-${cat.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {cat}
            </button>
          ))}
          <button
            className={`category-chip low-rated-chip ${showLowRated ? 'active-warning' : ''}`}
            onClick={() => { setShowLowRated(prev => !prev); setActiveCategory('All'); }}
            title="Show FAQs with negative ratings that need review"
            id="filter-low-rated"
          >
            <FiAlertTriangle style={{ marginRight: '0.3rem', fontSize: '0.75rem' }} />
            Low Rated
            {lowRatedFaqIds.size > 0 && (
              <span className="low-rated-badge">{lowRatedFaqIds.size}</span>
            )}
          </button>
        </div>

        <div className="toolbar-actions">
          <div className="contributor-filter-container glass" title="Filter by Contributor">
            <FiUser className="filter-icon-sm" />
            <select
              value={activeContributor}
              onChange={(e) => setActiveContributor(e.target.value)}
              className="contributor-select"
              id="contributor-filter-select"
            >
              <option value="All">All Contributors</option>
              {uniqueContributors.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="sort-control glass">
            <button className={`sort-btn ${sortOrder === 'desc' ? 'active' : ''}`} onClick={() => setSortOrder('desc')} title="Newest first">
              <FiArrowDown /><span>Latest</span>
            </button>
            <button className={`sort-btn ${sortOrder === 'asc' ? 'active' : ''}`} onClick={() => setSortOrder('asc')} title="Oldest first">
              <FiArrowUp /><span>Oldest</span>
            </button>
            <button className={`sort-btn ${sortOrder === 'top-rated' ? 'active' : ''}`} onClick={() => setSortOrder('top-rated')} title="Highest rated">
              <FiStar /><span>Top Rated</span>
            </button>
            <button className={`sort-btn ${sortOrder === 'most-voted' ? 'active' : ''}`} onClick={() => setSortOrder('most-voted')} title="Most reviews">
              <FiTrendingUp /><span>Most Reviewed</span>
            </button>
          </div>
          <button className="btn-primary add-btn" onClick={onAdd} id="add-faq-btn">
            <FiPlus style={{ marginRight: '0.5rem' }} />Add FAQ
          </button>
        </div>
      </div>

      {/* Results Count */}
      <div className="results-info">
        <span>{sortedFaqs.length} {sortedFaqs.length === 1 ? 'result' : 'results'}</span>
        {showLowRated && (
          <span className="low-rated-notice">
            <FiAlertTriangle /> Showing FAQs that need review (average &lt; 3.0 ★)
          </span>
        )}
        {(searchQuery || activeCategory !== 'All' || activeContributor !== 'All' || showLowRated) && (
          <button
            className="clear-filters"
            onClick={() => { setSearchQuery(''); setActiveCategory('All'); setActiveContributor('All'); setShowLowRated(false); }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* FAQ List */}
      <div className="faq-list">
        {paginatedFaqs.length > 0 ? (
          paginatedFaqs.map(faq => {
            const faqRating = ratings[faq.id] || { sum: 0, total: 0, average: 0, voters: [] };
            const userVote = getUserVote(faq.id);
            const relatedFaqs = getRelatedFaqs(faq.id);
            const isLowRated = lowRatedFaqIds.has(faq.id);
            const isOpen = openFaqId === faq.id;

            return (
              <div
                key={faq.id}
                id={`faq-item-${faq.id}`}
                className={`faq-item glass ${isOpen ? 'open' : ''} ${isLowRated ? 'faq-low-rated' : ''}`}
              >
                <div className="faq-question" onClick={() => toggleFaq(faq.id)}>
                  <div className="faq-question-left">
                    <span className={`category-badge ${CATEGORY_COLORS[faq.category] || ''}`}>
                      {faq.category}
                    </span>
                    <span className="faq-question-text">{faq.question}</span>
                  </div>
                  <div className="faq-question-right">
                    {faqRating.total > 0 && (
                      <span className={`rating-preview ${faqRating.average >= 4.0 ? 'positive' : faqRating.average < 3.0 ? 'negative' : 'neutral'}`}>
                        ★ {faqRating.average}
                      </span>
                    )}
                    {isLowRated && (
                      <span className="low-rated-tag" title="Needs review"><FiAlertTriangle /></span>
                    )}
                    <FiChevronDown className="faq-icon" />
                  </div>
                </div>

                <div className="faq-answer">
                  <div className="faq-answer-text">
                    {faq.answer.split('\n').map((line, i) => (
                      <span key={i}>{line}<br /></span>
                    ))}
                  </div>

                  {/* Star Rating Row */}
                  <div className="faq-rating-row">
                    <span className="faq-rating-label">Rate this FAQ:</span>
                    <div className="faq-rating-stars">
                      {[1, 2, 3, 4, 5].map((star) => {
                        const isSelected = userVote !== null && star <= userVote;
                        const isHovered = hoveredStar[faq.id] !== undefined && star <= hoveredStar[faq.id];
                        return (
                          <button
                            key={star}
                            className={`star-rating-btn ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}`}
                            onClick={(e) => { e.stopPropagation(); handleRateClick(faq.id, star); }}
                            onMouseEnter={() => setHoveredStar(prev => ({ ...prev, [faq.id]: star }))}
                            onMouseLeave={() => setHoveredStar(prev => {
                              const next = { ...prev };
                              delete next[faq.id];
                              return next;
                            })}
                            disabled={ratingInFlight[faq.id]}
                            title={`${star} Star${star > 1 ? 's' : ''}${userVote === star ? ' (Click to cancel)' : ''}`}
                          >
                            ★
                          </button>
                        );
                      })}
                    </div>
                    {faqRating.total > 0 && (
                      <span className="rating-total-votes">
                        Average: {faqRating.average} ★ ({faqRating.total} {faqRating.total === 1 ? 'review' : 'reviews'})
                      </span>
                    )}
                    {userVote && (
                      <span className="user-rating-tip" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        (You rated: {userVote} ★. Click it again to cancel)
                      </span>
                    )}
                  </div>

                  {/* Related FAQs Section */}
                  {(relatedFaqs.length > 0 || relatedPickerFaqId === faq.id) && (
                    <div className="related-section">
                      {relatedFaqs.length > 0 && (
                        <>
                          <span className="related-section-label">
                            <FiLink style={{ marginRight: '0.35rem' }} />See also:
                          </span>
                          <div className="related-chips">
                            {relatedFaqs.map(rf => (
                              <div key={rf.id} className="related-chip-group">
                                <button
                                  className="related-chip"
                                  onClick={(e) => { e.stopPropagation(); handleScrollToFaq(rf.id); }}
                                  title={rf.note ? `Note: ${rf.note}` : rf.question}
                                >
                                  <span className={`category-badge-xs ${CATEGORY_COLORS[rf.category] || ''}`}>{rf.category}</span>
                                  <span className="related-chip-text">{rf.question.length > 60 ? rf.question.slice(0, 60) + '…' : rf.question}</span>
                                </button>
                                <button
                                  className="related-chip-remove"
                                  onClick={(e) => { e.stopPropagation(); onRemoveRelated(faq.id, rf.id); }}
                                  title="Remove link"
                                >
                                  <FiX />
                                </button>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {relatedPickerFaqId === faq.id && (
                        <div className="related-picker" ref={relatedPickerRef} onClick={e => e.stopPropagation()}>
                          <input
                            type="text"
                            className="related-picker-input"
                            placeholder="Search FAQ to link..."
                            value={relatedSearch}
                            onChange={e => setRelatedSearch(e.target.value)}
                            autoFocus
                          />
                          <div className="related-picker-list">
                            {getLinkCandidates(faq.id).length === 0 ? (
                              <div className="related-picker-empty">No matching FAQs found</div>
                            ) : (
                              getLinkCandidates(faq.id).map(candidate => (
                                <button
                                  key={candidate.id}
                                  className="related-picker-item"
                                  onClick={() => {
                                    onAddRelated(faq.id, candidate.id, '');
                                    setRelatedPickerFaqId(null);
                                    setRelatedSearch('');
                                  }}
                                >
                                  <span className={`category-badge-xs ${CATEGORY_COLORS[candidate.category] || ''}`}>{candidate.category}</span>
                                  <span>{candidate.question.length > 70 ? candidate.question.slice(0, 70) + '…' : candidate.question}</span>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="faq-meta">
                    <span className="faq-meta-item">📅 {faq.date}</span>
                    <span className="faq-meta-item">👤 {faq.reporter}</span>
                    {faq.merchant && <span className="faq-meta-item">🏢 {faq.merchant}</span>}
                    {faq.lastEditor && (
                      <span className="faq-meta-item" style={{ width: '100%', marginTop: '0.25rem', color: 'var(--primary)', opacity: 0.8, fontSize: '0.75rem' }}>
                        <FiEdit2 style={{ fontSize: '0.7rem', marginRight: '0.3rem' }} />
                        Last edited by {faq.lastEditor} on {formatEditTime(faq.updatedAt)}
                      </span>
                    )}
                  </div>
                  <div className="faq-actions">
                    <button className="btn-icon-sm btn-edit" onClick={(e) => { e.stopPropagation(); onEdit(faq); }} title="Edit" id={`edit-${faq.id}`}>
                      <FiEdit2 /> Edit
                    </button>
                    <button
                      className={`btn-icon-sm btn-link-related ${relatedPickerFaqId === faq.id ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRelatedPickerFaqId(relatedPickerFaqId === faq.id ? null : faq.id);
                        setRelatedSearch('');
                      }}
                      title="Link a related FAQ"
                      id={`link-related-${faq.id}`}
                    >
                      <FiLink /> Link Related
                    </button>
                    <button className="btn-icon-sm btn-delete" onClick={(e) => { e.stopPropagation(); onDelete(faq); }} title="Delete" id={`delete-${faq.id}`}>
                      <FiTrash2 /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty-state glass">
            <div className="empty-state-icon">{showLowRated ? '✅' : '🔍'}</div>
            <h3>{showLowRated ? 'No low-rated FAQs!' : 'No results found'}</h3>
            <p>{showLowRated ? 'All FAQs have average ratings above 3.0 ★. Great job!' : 'Try adjusting your search or filters, or add a new FAQ.'}</p>
            {!showLowRated && (
              <button className="btn-primary" onClick={onAdd}>
                <FiPlus style={{ marginRight: '0.5rem' }} /> Add New FAQ
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {sortedFaqs.length > 0 && (
        <div className="pagination-container glass animate-fade-in">
          <div className="pagination-left">
            <span>Show:</span>
            <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="pagination-select">
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
            <span className="pagination-info">
              Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, sortedFaqs.length)} of {sortedFaqs.length} FAQs
            </span>
          </div>
          <div className="pagination-right">
            <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="pagination-btn">Previous</button>
            <span className="pagination-current">Page {currentPage} of {totalPages || 1}</span>
            <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages || totalPages === 0} className="pagination-btn">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

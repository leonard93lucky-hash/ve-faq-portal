import { useState, useMemo } from 'react';
import {
  FiSearch, FiPlus, FiChevronDown, FiEdit2, FiTrash2,
  FiClock, FiLogOut, FiUser, FiFilter, FiX, FiRefreshCw,
  FiArrowUp, FiArrowDown, FiAward, FiStar
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
  categories = DEFAULT_CATEGORIES,
  onAdd,
  onEdit,
  onDelete,
  onShowLogs,
  onLogout,
  logCount,
  onRefresh,
  isLoading,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [openFaqId, setOpenFaqId] = useState(null);
  const [sortOrder, setSortOrder] = useState('desc'); // default latest

  // --- Sorting Logic ---
  const parseDate = (dateStr) => {
    if (!dateStr) return 0;
    try {
      // Normalize common formats: "1 oct 2025", "14-Nov-25", "18/12/2025"
      let normalized = dateStr.replace(/-/g, ' ').replace(/\//g, ' ');
      
      const parts = normalized.split(/\s+/);
      // Handle DD MM YYYY (common in the dataset)
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[2].length === 4) {
        normalized = `${parts[1]} ${parts[0]} ${parts[2]}`;
      }

      const d = new Date(normalized);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    } catch { return 0; }
  };

  const filteredFaqs = useMemo(() => {
    return faqs.filter(faq => {
      const matchesSearch = !searchQuery ||
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (faq.merchant && faq.merchant.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (faq.reporter && faq.reporter.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCategory = activeCategory === 'All' || faq.category === activeCategory;

      return matchesSearch && matchesCategory;
    });
  }, [faqs, searchQuery, activeCategory]);

  const sortedFaqs = useMemo(() => {
    return [...filteredFaqs].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : parseDate(a.date);
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : parseDate(b.date);
      
      if (timeA === timeB) {
        // Fallback to sequential ID comparison if dates are identical
        return sortOrder === 'desc' 
          ? (b.id || '').localeCompare(a.id || '') 
          : (a.id || '').localeCompare(b.id || '');
      }

      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }, [filteredFaqs, sortOrder]);

  // --- Top Contributors Logic ---
  const contributorsData = useMemo(() => {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3);
    const year = now.getFullYear();
    const startOfQuarter = new Date(year, quarter * 3, 1);
    
    const currentQuarterFaqs = faqs.filter(faq => {
      // Prioritize the manual 'date' field for the leaderboard to avoid 
      // issues with initialization timestamps in the 'createdAt' field.
      const dateVal = parseDate(faq.date);
      const created = dateVal > 0 ? new Date(dateVal) : (faq.createdAt ? new Date(faq.createdAt) : null);
      return created && created >= startOfQuarter;
    });

    const counts = currentQuarterFaqs.reduce((acc, faq) => {
      const reporter = (faq.reporter || 'Unknown').trim();
      if (reporter) {
        acc[reporter] = (acc[reporter] || 0) + 1;
      }
      return acc;
    }, {});

    const top5 = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    return {
      list: top5,
      label: `Q${quarter + 1} ${year}`
    };
  }, [faqs]);

  const toggleFaq = (id) => {
    setOpenFaqId(openFaqId === id ? null : id);
  };

  const formatEditTime = (ts) => {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch { return ''; }
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
          <button className="icon-btn-text" onClick={onShowLogs} id="show-logs-btn">
            <FiClock />
            <span>Activity Log</span>
            {logCount > 0 && <span className="log-badge-count">{logCount}</span>}
          </button>
          <button 
            className="icon-btn" 
            onClick={onRefresh} 
            disabled={isLoading}
            title="Refresh Data"
            id="refresh-data-btn"
          >
            <FiRefreshCw className={isLoading ? 'spin' : ''} />
          </button>
          <div className="user-pill">
            <FiUser />
            <span>{userName}</span>
          </div>
          <button className="icon-btn" onClick={onLogout} title="Logout" id="logout-btn">
            <FiLogOut />
          </button>
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
            <button className="search-clear" onClick={() => setSearchQuery('')}>
              <FiX />
            </button>
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
                <span className="contributor-count">
                  <FiStar className="star-icon" />
                  {c.count}
                </span>
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
              onClick={() => setActiveCategory(cat)}
              id={`filter-${cat.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {cat}
            </button>
          ))}
        </div>
        
        <div className="toolbar-actions">
          <div className="sort-control glass">
            <button 
              className={`sort-btn ${sortOrder === 'desc' ? 'active' : ''}`}
              onClick={() => setSortOrder('desc')}
              title="Newest first"
            >
              <FiArrowDown />
              <span>Latest</span>
            </button>
            <button 
              className={`sort-btn ${sortOrder === 'asc' ? 'active' : ''}`}
              onClick={() => setSortOrder('asc')}
              title="Oldest first"
            >
              <FiArrowUp />
              <span>Oldest</span>
            </button>
          </div>
          <button className="btn-primary add-btn" onClick={onAdd} id="add-faq-btn">
            <FiPlus style={{ marginRight: '0.5rem' }} />
            Add FAQ
          </button>
        </div>
      </div>

      {/* Results Count */}
      <div className="results-info">
        <span>{sortedFaqs.length} {sortedFaqs.length === 1 ? 'result' : 'results'}</span>
        {(searchQuery || activeCategory !== 'All') && (
          <button
            className="clear-filters"
            onClick={() => { setSearchQuery(''); setActiveCategory('All'); }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* FAQ List */}
      <div className="faq-list">
        {sortedFaqs.length > 0 ? (
          sortedFaqs.map(faq => (
            <div
              key={faq.id}
              className={`faq-item glass ${openFaqId === faq.id ? 'open' : ''}`}
            >
              <div className="faq-question" onClick={() => toggleFaq(faq.id)}>
                <div className="faq-question-left">
                  <span className={`category-badge ${CATEGORY_COLORS[faq.category] || ''}`}>
                    {faq.category}
                  </span>
                  <span className="faq-question-text">{faq.question}</span>
                </div>
                <FiChevronDown className="faq-icon" />
              </div>
              <div className="faq-answer">
                <div className="faq-answer-text">
                  {faq.answer.split('\n').map((line, i) => (
                    <span key={i}>{line}<br /></span>
                  ))}
                </div>
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
                  <button
                    className="btn-icon-sm btn-edit"
                    onClick={(e) => { e.stopPropagation(); onEdit(faq); }}
                    title="Edit"
                    id={`edit-${faq.id}`}
                  >
                    <FiEdit2 /> Edit
                  </button>
                  <button
                    className="btn-icon-sm btn-delete"
                    onClick={(e) => { e.stopPropagation(); onDelete(faq); }}
                    title="Delete"
                    id={`delete-${faq.id}`}
                  >
                    <FiTrash2 /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state glass">
            <div className="empty-state-icon">🔍</div>
            <h3>No results found</h3>
            <p>Try adjusting your search or filters, or add a new FAQ.</p>
            <button className="btn-primary" onClick={onAdd}>
              <FiPlus style={{ marginRight: '0.5rem' }} /> Add New FAQ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

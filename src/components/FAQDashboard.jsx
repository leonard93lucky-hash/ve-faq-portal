import { useState } from 'react';
import {
  FiSearch, FiPlus, FiChevronDown, FiEdit2, FiTrash2,
  FiClock, FiLogOut, FiUser, FiFilter, FiX, FiRefreshCw
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

  const filteredFaqs = faqs.filter(faq => {
    const matchesSearch = !searchQuery ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (faq.merchant && faq.merchant.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (faq.reporter && faq.reporter.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = activeCategory === 'All' || faq.category === activeCategory;

    return matchesSearch && matchesCategory;
  });

  const toggleFaq = (id) => {
    setOpenFaqId(openFaqId === id ? null : id);
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
        <button className="btn-primary add-btn" onClick={onAdd} id="add-faq-btn">
          <FiPlus style={{ marginRight: '0.5rem' }} />
          Add FAQ
        </button>
      </div>

      {/* Results Count */}
      <div className="results-info">
        <span>{filteredFaqs.length} {filteredFaqs.length === 1 ? 'result' : 'results'}</span>
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
        {filteredFaqs.length > 0 ? (
          filteredFaqs.map(faq => (
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

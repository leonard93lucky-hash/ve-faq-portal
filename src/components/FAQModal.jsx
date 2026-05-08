import { useState, useEffect } from 'react';
import { FiX, FiSave, FiLoader } from 'react-icons/fi';

const CATEGORIES = [
  'General',
  'Policies & Compliance',
  'Digital-ID',
  'Liveness SDK',
  'Technical Details',
];

export default function FAQModal({ 
  isOpen, onClose, onSave, editData, categories = [], 
  onAddCategory, onDeleteCategory 
}) {
  const [form, setForm] = useState({
    category: 'General',
    question: '',
    answer: '',
    merchant: '',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [newCatName, setNewCatName] = useState('');
  const [showCatManager, setShowCatManager] = useState(false);

  useEffect(() => {
    if (editData) {
      setForm({
        category: editData.category || 'General',
        question: editData.question || '',
        answer: editData.answer || '',
        merchant: editData.merchant || '',
      });
    } else {
      setForm({ category: categories[0] || 'General', question: '', answer: '', merchant: '' });
    }
    setErrors({});
    setShowCatManager(false);
  }, [editData, isOpen, categories]);

  const validate = () => {
    const errs = {};
    if (!form.question.trim()) errs.question = 'Question is required';
    if (!form.answer.trim()) errs.answer = 'Answer is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setErrors({ submit: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const handleAddCat = async () => {
    if (!newCatName.trim()) return;
    await onAddCategory(newCatName.trim());
    setNewCatName('');
  };

  const handleDeleteCat = async (name) => {
    if (window.confirm(`Are you sure you want to delete category "${name}"?`)) {
      await onDeleteCategory(name);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editData ? 'Edit FAQ' : 'Add New FAQ'}</h2>
          <button className="close-btn" onClick={onClose} id="modal-close-btn">
            <FiX />
          </button>
        </div>
        <form onSubmit={handleSubmit} id="faq-form">
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="faq-category">Category</label>
                <button 
                  type="button" 
                  className="link-btn" 
                  onClick={() => setShowCatManager(!showCatManager)}
                  style={{ fontSize: '0.8rem', padding: '0 0.5rem' }}
                >
                  {showCatManager ? 'Close Manager' : 'Manage List'}
                </button>
              </div>
              
              {showCatManager ? (
                <div className="cat-manager-box glass-card">
                  <div className="cat-add-row">
                    <input 
                      type="text" 
                      placeholder="New category..." 
                      value={newCatName}
                      onChange={e => setNewCatName(e.target.value)}
                    />
                    <button type="button" className="btn-small" onClick={handleAddCat}>Add</button>
                  </div>
                  <div className="cat-list-scroll">
                    {categories.map(cat => (
                      <div key={cat} className="cat-item-mini">
                        <span>{cat}</span>
                        <button type="button" className="cat-del-btn" onClick={() => handleDeleteCat(cat)}><FiX /></button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <select
                  id="faq-category"
                  className="input-field"
                  value={form.category}
                  onChange={e => handleChange('category', e.target.value)}
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="faq-merchant">Merchant</label>
              <input
                id="faq-merchant"
                type="text"
                className="input-field"
                placeholder="Sea Group (optional)"
                value={form.merchant}
                onChange={e => handleChange('merchant', e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="faq-question">Question</label>
            <input
              id="faq-question"
              type="text"
              className={`input-field ${errors.question ? 'input-error' : ''}`}
              placeholder="Enter the FAQ question..."
              value={form.question}
              onChange={e => handleChange('question', e.target.value)}
            />
            {errors.question && <span className="field-error">{errors.question}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="faq-answer">Answer</label>
            <textarea
              id="faq-answer"
              className={`input-field ${errors.answer ? 'input-error' : ''}`}
              placeholder="Provide a detailed answer..."
              value={form.answer}
              onChange={e => handleChange('answer', e.target.value)}
              rows={5}
            />
            {errors.answer && <span className="field-error">{errors.answer}</span>}
          </div>

          {errors.submit && <div className="error-msg">{errors.submit}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving} id="faq-save-btn">
              {saving ? (
                <><FiLoader className="spin" /> Saving...</>
              ) : (
                <><FiSave style={{ marginRight: '0.5rem' }} /> {editData ? 'Update' : 'Save'} FAQ</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

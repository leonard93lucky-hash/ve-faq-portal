import { useState, useEffect, useCallback } from 'react';
import LoginScreen from './components/LoginScreen.jsx';
import FAQDashboard from './components/FAQDashboard.jsx';
import FAQModal from './components/FAQModal.jsx';
import ActivityLog from './components/ActivityLog.jsx';
import StatsDashboard from './components/StatsDashboard.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import Toast from './components/Toast.jsx';
import { 
  fetchFAQs, addFAQ, updateFAQ, deleteFAQ, fetchLogs, 
  fetchCategories, addCategory, deleteCategory,
  fetchRatings, rateFAQ, fetchRelated, addRelated, removeRelated
} from './api.js';

function App() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');

  // Data state
  const [faqs, setFaqs] = useState([]);
  const [logs, setLogs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ratings, setRatings] = useState({});
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(false);

  // UI state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState(null);
  const [deletingFaq, setDeletingFaq] = useState(null);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [faqData, logData, catData, ratingsData, relatedData] = await Promise.all([
        fetchFAQs(), 
        fetchLogs(userId), 
        fetchCategories(),
        fetchRatings(),
        fetchRelated(),
      ]);
      
      // Frontend validation: Filter logs by userId or resolved userName
      const resolvedName = userName || userId;
      const filteredLogs = logData.filter(log => {
        const logUser = String(log.userId || '').trim().toUpperCase();
        const targetId = String(userId).trim().toUpperCase();
        const targetName = String(resolvedName || '').trim().toUpperCase();
        return logUser === targetId || logUser === targetName;
      });

      setFaqs(faqData);
      setLogs(filteredLogs);
      setCategories(catData);
      setRatings(ratingsData);
      setRelated(relatedData);
    } catch (err) {
      showToast('Failed to load data: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [userId, userName]);

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated, loadData]);

  // --- Handlers ---
  // LoginScreen fully handles authentication steps and calls onLogin with the resolved user
  const handleLogin = (result) => {
    setUserId(result.userId);
    setUserName(result.name);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserId('');
    setUserName('');
    setFaqs([]);
    setLogs([]);
    setRatings({});
    setRelated([]);
  };

  const handleAddFaq = () => {
    setEditingFaq(null);
    setIsModalOpen(true);
  };

  const handleEditFaq = (faq) => {
    setEditingFaq(faq);
    setIsModalOpen(true);
  };

  const handleDeleteFaq = (faq) => {
    setDeletingFaq(faq);
  };

  const handleSaveFaq = async (formData) => {
    if (editingFaq) {
      // Update existing
      await updateFAQ(editingFaq.id, formData, userId);
      showToast('FAQ updated successfully!');
    } else {
      // Add new
      await addFAQ(formData, userId);
      showToast('FAQ added successfully!');
    }
    await loadData();
  };

  const handleConfirmDelete = async () => {
    if (!deletingFaq) return;
    await deleteFAQ(deletingFaq.id, userId);
    setDeletingFaq(null);
    showToast('FAQ deleted successfully!');
    await loadData();
  };

  const handleRefreshLogs = async () => {
    const logData = await fetchLogs(userId);
    const resolvedName = userName || userId;
    const filteredLogs = logData.filter(log => {
      const logUser = String(log.userId || '').trim().toUpperCase();
      const targetId = String(userId).trim().toUpperCase();
      const targetName = String(resolvedName || '').trim().toUpperCase();
      return logUser === targetId || logUser === targetName;
    });
    setLogs(filteredLogs);
  };

  const handleAddCategory = async (name) => {
    await addCategory(name);
    await loadData();
  };

  const handleDeleteCategory = async (name) => {
    await deleteCategory(name);
    await loadData();
  };

  const handleRate = async (faqId, vote) => {
    try {
      const updated = await rateFAQ(faqId, userId, vote);
      if (updated) {
        setRatings(prev => ({ ...prev, [faqId]: updated }));
      }
    } catch (err) {
      showToast('Failed to submit rating: ' + err.message, 'error');
    }
  };

  const handleAddRelated = async (faqId, relatedFaqId, note) => {
    try {
      const result = await addRelated(faqId, userId, relatedFaqId, note);
      if (result?.success === false && result?.reason === 'already_exists') {
        showToast('These FAQs are already linked.', 'error');
      } else {
        showToast('Related FAQ linked!');
        const relatedData = await fetchRelated();
        setRelated(relatedData);
      }
    } catch (err) {
      showToast('Failed to link FAQ: ' + err.message, 'error');
    }
  };

  const handleRemoveRelated = async (faqId, relatedFaqId) => {
    try {
      await removeRelated(faqId, relatedFaqId, userId);
      showToast('Link removed.');
      const relatedData = await fetchRelated();
      setRelated(relatedData);
    } catch (err) {
      showToast('Failed to remove link: ' + err.message, 'error');
    }
  };

  // --- Render ---
  if (!isAuthenticated) {
    return (
      <>
        <LoginScreen onLogin={handleLogin} />
        <Toast toast={toast} onDismiss={() => setToast(null)} />
      </>
    );
  }

  return (
    <>
      <FAQDashboard
        faqs={faqs}
        userName={userName}
        userId={userId}
        categories={categories}
        ratings={ratings}
        related={related}
        onAdd={handleAddFaq}
        onEdit={handleEditFaq}
        onDelete={handleDeleteFaq}
        onShowLogs={() => setIsLogOpen(true)}
        onShowStats={() => setIsStatsOpen(true)}
        onLogout={handleLogout}
        logCount={logs.length}
        onRefresh={loadData}
        isLoading={loading}
        onRate={handleRate}
        onAddRelated={handleAddRelated}
        onRemoveRelated={handleRemoveRelated}
      />

      <FAQModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingFaq(null); }}
        onSave={handleSaveFaq}
        editData={editingFaq}
        categories={categories}
        onAddCategory={handleAddCategory}
        onDeleteCategory={handleDeleteCategory}
      />

      <ActivityLog
        isOpen={isLogOpen}
        onClose={() => setIsLogOpen(false)}
        logs={logs}
        onRefresh={handleRefreshLogs}
      />

      <StatsDashboard
        isOpen={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
        faqs={faqs}
        ratings={ratings}
      />

      <ConfirmDialog
        isOpen={!!deletingFaq}
        onClose={() => setDeletingFaq(null)}
        onConfirm={handleConfirmDelete}
        title="Delete FAQ"
        message={`Are you sure you want to delete "${deletingFaq?.question}"? This action cannot be undone.`}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

export default App;

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Local browser preferences. These are intentionally separate from MongoDB data.
// They remember only the last successfully used dropdown selections for each flow.
const NORMAL_BUG_PREFERENCES_KEY = 'ps_qa_last_successful_bug_preferences';
const BULK_PREFERENCES_KEY = 'ps_qa_last_successful_bulk_preferences';

const readLocalPreferences = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error(`Failed to read local preferences: ${key}`, err);
    return null;
  }
};

const writeLocalPreferences = (key, preferences) => {
  try {
    localStorage.setItem(key, JSON.stringify(preferences));
  } catch (err) {
    console.error(`Failed to save local preferences: ${key}`, err);
  }
};

function App() {
  // =========================================================
  // WELCOME MODAL
  // =========================================================
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const hasSeenWelcome = sessionStorage.getItem('ps_qa_welcomed');

    if (!hasSeenWelcome) {
      setShowWelcome(true);
    }
  }, []);

  const handleCloseWelcome = () => {
    setShowWelcome(false);
    sessionStorage.setItem('ps_qa_welcomed', 'true');
  };

  // =========================================================
  // TAB NAVIGATION ('report' | 'knowledge' | 'bulk' | 'settings' | 'templates' | 'dashboard')
  // =========================================================
  const [activeTab, setActiveTab] = useState('report');

  // =========================================================
  // QA PROFILES & TICKETS STATE
  // =========================================================
  const [users, setUsers] = useState([]);
  const [createdBy, setCreatedBy] = useState('');
  const [apiTokenInput, setApiTokenInput] = useState('');
  const [settingsMessage, setSettingsMessage] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [pendingUser, setPendingUser] = useState(null); // For two-step confirmation

  // Ticket History State for Dashboard
  const [allTickets, setAllTickets] = useState([]);

  // Dashboard profile drill-down state
  const [selectedDashboardProfile, setSelectedDashboardProfile] = useState(null);
  const [dashboardProfileLoadCount, setDashboardProfileLoadCount] = useState(10);

  // =========================================================
  // FETCH DASHBOARD TICKETS
  // =========================================================
  // Reusable ticket refresh used on initial load and after ticket creation.
  // Updating allTickets automatically refreshes dashboard metrics/activity.
  const fetchTickets = async () => {
    try {
      const ticketRes = await axios.get(`${API_URL}/api/get-tickets`);

      if (ticketRes.data.status === 'success') {
        setAllTickets(ticketRes.data.tickets);
        return true;
      }

      return false;
    } catch (err) {
      console.error('Failed to fetch dashboard tickets', err);
      return false;
    }
  };

  // Preload all initial data (users, tickets, assignees, and features) on website startup
  useEffect(() => {
    const fetchAllStartupData = async () => {
      try {
        // 1. Fetch Users & Dashboard Tickets
        const userRes = await axios.get(`${API_URL}/api/get-users`);
        if (userRes.data.status === 'success') {
          const fetchedUsers = userRes.data.users;
          setUsers(fetchedUsers);

          const savedUser = localStorage.getItem('ps_qa_active_user');
          if (savedUser && fetchedUsers.includes(savedUser)) {
            setCreatedBy(savedUser);
          } else if (fetchedUsers.length > 0) {
            setCreatedBy(fetchedUsers[0]);
          }

          const savedBulkPreferences = readLocalPreferences(BULK_PREFERENCES_KEY);
          if (
            savedBulkPreferences?.createdBy &&
            fetchedUsers.includes(savedBulkPreferences.createdBy)
          ) {
            setBulkCreatedBy(savedBulkPreferences.createdBy);
          } else if (savedUser && fetchedUsers.includes(savedUser)) {
            setBulkCreatedBy(savedUser);
          } else if (fetchedUsers.length > 0) {
            setBulkCreatedBy(fetchedUsers[0]);
          }
        }

        await fetchTickets();

        // 2. Preload Default (Prod) Assignees
        const assigneeRes = await axios.get(`${API_URL}/api/get-assignees?bug_type=prod`);
        if (assigneeRes.data.status === 'success') {
          const fetchedAssignees = assigneeRes.data.assignees;
          setAssignees(fetchedAssignees);
          if (fetchedAssignees.length > 0) {
            setSelectedAssignee(fetchedAssignees[0].id);
          }
          setBulkAssignees(fetchedAssignees);
          if (fetchedAssignees.length > 0) {
            setBulkSelectedAssignee(fetchedAssignees[0].id);
          }
        }

        // 3. Preload Feature Custom Field Options
        const featureRes = await axios.get(`${API_URL}/api/get-feature-options`);
        if (featureRes.data.status === 'success') {
          const fetchedFeatures = featureRes.data.features;
          setFeatureOptions(fetchedFeatures);
          if (fetchedFeatures.length > 0) {
            setSelectedFeature(fetchedFeatures[0]);
          }
          setBulkFeatureOptions(fetchedFeatures);
          if (fetchedFeatures.length > 0) {
            setBulkSelectedFeature(fetchedFeatures[0]);
          }
        }

      } catch (err) {
        console.error('Failed to preload initial application data', err);
      }
    };
    fetchAllStartupData();
  }, []);

  const handleUserChange = (name) => {
    setCreatedBy(name);
    localStorage.setItem('ps_qa_active_user', name);
  };

  // Step 1: Verify Token Action (Checks duplicates & fetches username)
  const handleVerifyToken = async (e) => {
    e.preventDefault();
    if (!apiTokenInput.trim()) return;

    setSettingsLoading(true);
    setSettingsMessage('');
    setPendingUser(null);

    const formData = new FormData();
    formData.append('api_token', apiTokenInput.trim());

    try {
      const res = await axios.post(`${API_URL}/api/verify-token`, formData);
      if (res.data.status === 'success') {
        setPendingUser(res.data.username);
        setSettingsMessage('');
      } else {
        setSettingsMessage(`❌ ${res.data.message || 'Verification failed.'}`);
      }
    } catch (err) {
      console.error(err);
      setSettingsMessage('❌ Failed to connect to server.');
    } finally {
      setSettingsLoading(false);
    }
  };

  // Step 2: Confirm & Save Token Action to Database
  const handleConfirmToken = async () => {
    if (!pendingUser || !apiTokenInput.trim()) return;

    setSettingsLoading(true);

    const formData = new FormData();
    formData.append('api_token', apiTokenInput.trim());
    formData.append('username', pendingUser);

    try {
      const res = await axios.post(`${API_URL}/api/confirm-register-token`, formData);
      if (res.data.status === 'success') {
        const newUsername = res.data.username;
        setSettingsMessage(`✅ Profile for "${newUsername}" successfully added to database and activated!`);
        setApiTokenInput('');
        setPendingUser(null);

        // Refresh user list from database
        const userRes = await axios.get(`${API_URL}/api/get-users`);
        if (userRes.data.status === 'success') {
          const updatedUsers = userRes.data.users;
          setUsers(updatedUsers);
          setCreatedBy(newUsername);
          localStorage.setItem('ps_qa_active_user', newUsername);
        }
      } else {
        setSettingsMessage(`❌ ${res.data.message || 'Registration failed.'}`);
      }
    } catch (err) {
      console.error(err);
      setSettingsMessage('❌ Failed to save profile.');
    } finally {
      setSettingsLoading(false);
    }
  };

  // =========================================================
  // DOWNLOAD SAMPLE CSV TEMPLATE ACTION
  // =========================================================
  const handleDownloadCsvTemplate = () => {
    const csvContent =
      "Description,Priority\n" +
      "\"Lost connection during Treasure Road reward, item duplicated\",P1\n" +
      "\"App crashes when clicking the inventory button after a match\",P0";

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'ps_qa_bulk_bugs_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // =========================================================
  // BUG GENERATOR STATE
  // =========================================================
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [summary, setSummary] = useState('');
  const [generatedReport, setGeneratedReport] = useState('');
  const [priority, setPriority] = useState('');
  const [reproRate, setReproRate] = useState('');
  const [bugType, setBugType] = useState('prod');

  // Dynamic Dropdown States for Assignee and Feature
  const [assignees, setAssignees] = useState([]);
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [featureOptions, setFeatureOptions] = useState([]);
  const [selectedFeature, setSelectedFeature] = useState('');

  // Custom Feature Dropdown State & Refs
  const [isFeatureOpen, setIsFeatureOpen] = useState(false);
  const [featureSearch, setFeatureSearch] = useState('');
  const featureDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (featureDropdownRef.current && !featureDropdownRef.current.contains(event.target)) {
        setIsFeatureOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsFeatureOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Fetch dynamic assignees and feature options when bugType changes
  useEffect(() => {
    const fetchDynamicDropdowns = async () => {
      try {
        const assigneeRes = await axios.get(`${API_URL}/api/get-assignees?bug_type=${bugType}`);
        if (assigneeRes.data.status === 'success') {
          setAssignees(assigneeRes.data.assignees);
          if (assigneeRes.data.assignees.length > 0 && !selectedAssignee) {
            setSelectedAssignee(assigneeRes.data.assignees[0].id);
          }
        }

        if (bugType === 'feature') {
          const featureRes = await axios.get(`${API_URL}/api/get-feature-options`);
          if (featureRes.data.status === 'success') {
            setFeatureOptions(featureRes.data.features);
            if (featureRes.data.features.length > 0 && !selectedFeature) {
              setSelectedFeature(featureRes.data.features[0]);
            }
          }
        } else {
          setFeatureOptions([]);
          setSelectedFeature('');
        }
      } catch (err) {
        console.error('Failed to fetch dynamic dropdown options', err);
      }
    };
    fetchDynamicDropdowns();
  }, [bugType]);

  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [ticketUrl, setTicketUrl] = useState('');
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);

  // =========================================================
  // KNOWLEDGE BASE STATE
  // =========================================================
  const [rulebookFile, setRulebookFile] = useState(null);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);

  const rulebookInputRef = useRef(null);

  // =========================================================
  // BULK UPLOAD STATE
  // =========================================================
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkBugType, setBulkBugType] = useState(() => {
    const saved = readLocalPreferences(BULK_PREFERENCES_KEY);
    return saved?.bugType || 'prod';
  });
  const [bulkCreatedBy, setBulkCreatedBy] = useState(() => {
    const saved = readLocalPreferences(BULK_PREFERENCES_KEY);
    return saved?.createdBy || '';
  });
  const [bulkAssignees, setBulkAssignees] = useState([]);
  const [bulkSelectedAssignee, setBulkSelectedAssignee] = useState(() => {
    const saved = readLocalPreferences(BULK_PREFERENCES_KEY);
    return saved?.selectedAssignee || '';
  });
  const [bulkFeatureOptions, setBulkFeatureOptions] = useState([]);
  const [bulkSelectedFeature, setBulkSelectedFeature] = useState(() => {
    const saved = readLocalPreferences(BULK_PREFERENCES_KEY);
    return saved?.selectedFeature || '';
  });
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState(null);

  // Custom Bulk Feature Dropdown State & Refs
  const [isBulkFeatureOpen, setIsBulkFeatureOpen] = useState(false);
  const [bulkFeatureSearch, setBulkFeatureSearch] = useState('');
  const bulkFeatureDropdownRef = useRef(null);

  useEffect(() => {
    const handleBulkClickOutside = (event) => {
      if (bulkFeatureDropdownRef.current && !bulkFeatureDropdownRef.current.contains(event.target)) {
        setIsBulkFeatureOpen(false);
      }
    };
    document.addEventListener('mousedown', handleBulkClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleBulkClickOutside);
    };
  }, []);

  // Fetch dynamic assignees and feature options when bulkBugType changes
  useEffect(() => {
    const fetchBulkDynamicDropdowns = async () => {
      try {
        const assigneeRes = await axios.get(`${API_URL}/api/get-assignees?bug_type=${bulkBugType}`);
        if (assigneeRes.data.status === 'success') {
          const fetchedBulkAssignees = assigneeRes.data.assignees;
          setBulkAssignees(fetchedBulkAssignees);

          setBulkSelectedAssignee((currentValue) => {
            const saved = readLocalPreferences(BULK_PREFERENCES_KEY);
            const savedValue =
              saved?.bugType === bulkBugType ? saved?.selectedAssignee : '';

            if (savedValue && fetchedBulkAssignees.some((a) => String(a.id) === String(savedValue))) {
              return savedValue;
            }

            if (currentValue && fetchedBulkAssignees.some((a) => String(a.id) === String(currentValue))) {
              return currentValue;
            }

            return fetchedBulkAssignees.length > 0 ? fetchedBulkAssignees[0].id : '';
          });
        }

        if (bulkBugType === 'feature') {
          const featureRes = await axios.get(`${API_URL}/api/get-feature-options`);
          if (featureRes.data.status === 'success') {
            const fetchedBulkFeatures = featureRes.data.features;
            setBulkFeatureOptions(fetchedBulkFeatures);

            setBulkSelectedFeature((currentValue) => {
              const saved = readLocalPreferences(BULK_PREFERENCES_KEY);
              const savedValue =
                saved?.bugType === bulkBugType ? saved?.selectedFeature : '';

              if (savedValue && fetchedBulkFeatures.includes(savedValue)) {
                return savedValue;
              }

              if (currentValue && fetchedBulkFeatures.includes(currentValue)) {
                return currentValue;
              }

              return fetchedBulkFeatures.length > 0 ? fetchedBulkFeatures[0] : '';
            });
          }
        } else {
          setBulkFeatureOptions([]);
          setBulkSelectedFeature('');
        }
      } catch (err) {
        console.error('Failed to fetch bulk dynamic dropdown options', err);
      }
    };
    fetchBulkDynamicDropdowns();
  }, [bulkBugType]);

  const bulkInputRef = useRef(null);

  // =========================================================
  // GENERATE PREVIEW
  // =========================================================
  const handleGeneratePreview = async (e) => {
    e.preventDefault();

    if (!description.trim()) return;

    setLoading(true);

    setLoadingMessage(
      '🔍 Querying Pinecone Cloud for game rules & running Gemini AI RAG pipeline...'
    );

    setError('');
    setTicketUrl('');
    setGeneratedReport('');
    setSummary('');
    setPriority('');
    setReproRate('');

    // Restore the last successful Normal Bug Generator selections only when
    // the user starts generating a new bug. Priority and repro rate are AI-generated.
    const savedNormalPreferences = readLocalPreferences(NORMAL_BUG_PREFERENCES_KEY);
    if (savedNormalPreferences) {
      if (savedNormalPreferences.bugType === 'prod' || savedNormalPreferences.bugType === 'feature') {
        setBugType(savedNormalPreferences.bugType);
      } else {
        setBugType('prod');
      }

      if (savedNormalPreferences.createdBy) {
        setCreatedBy(savedNormalPreferences.createdBy);
      }

      setSelectedAssignee(savedNormalPreferences.selectedAssignee || '');
      setSelectedFeature(savedNormalPreferences.selectedFeature || '');
    } else {
      setBugType('prod');
    }

    const formData = new FormData();

    formData.append('description', description);

    try {
      const response = await axios.post(
        `${API_URL}/api/generate-bug`,
        formData
      );

      setSummary(response.data.summary);
      setGeneratedReport(response.data.generated_report);
      setPriority(response.data.priority);
      setReproRate(response.data.repro_rate);
    } catch (err) {
      console.error(err);
      setError(
        'Failed to generate preview. Check backend connection.'
      );
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  // =========================================================
  // CREATE CLICKUP TICKET
  // =========================================================
  const handleCreateTicket = async () => {
    setLoading(true);

    setLoadingMessage(
      '🚀 Formatting Markdown description & pushing structured task to ClickUp...'
    );

    setError('');

    const formData = new FormData();

    formData.append('summary', summary);
    formData.append('report', generatedReport);
    formData.append('priority', priority);
    formData.append('repro_rate', reproRate);
    formData.append('bug_type', bugType);

    if (selectedAssignee) {
      formData.append('assignee_id', selectedAssignee);
    }

    if (bugType === 'feature' && selectedFeature) {
      formData.append('feature_val', selectedFeature);
    }

    if (createdBy) {
      formData.append('created_by', createdBy);
    }

    if (file) {
      formData.append('evidence', file);
    }

    try {
      const response = await axios.post(
        `${API_URL}/api/create-ticket`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      if (response.data.status === 'success') {
        setTicketUrl(response.data.ticket_url);

        // Save Normal Bug Generator preferences only after successful ticket creation.
        // Priority and repro rate are intentionally excluded.
        writeLocalPreferences(NORMAL_BUG_PREFERENCES_KEY, {
          bugType,
          createdBy,
          selectedAssignee,
          selectedFeature: bugType === 'feature' ? selectedFeature : '',
        });

        setDescription('');
        setFile(null);
        setSummary('');
        setGeneratedReport('');
        setPriority('');
        setReproRate('');
        setBugType('prod');
        setSelectedAssignee('');
        setSelectedFeature('');

        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        setError('ClickUp ticket creation failed.');
      }
    } catch (err) {
      console.error(err);
      setError('Failed to push ticket to ClickUp.');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  // =========================================================
  // KNOWLEDGE BASE UPLOAD
  // =========================================================
  const handleUploadRulebook = async (e) => {
    e.preventDefault();

    if (!rulebookFile) return;

    setUploadLoading(true);
    setUploadMessage('');

    const formData = new FormData();

    formData.append('file', rulebookFile);

    try {
      const response = await axios.post(
        `${API_URL}/api/upload-rulebook`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      if (response.data.status === 'success') {
        setUploadMessage(`✅ ${response.data.message}`);

        setRulebookFile(null);

        if (rulebookInputRef.current) {
          rulebookInputRef.current.value = '';
        }
      } else {
        setUploadMessage(`❌ ${response.data.message}`);
      }
    } catch (err) {
      console.error(err);

      setUploadMessage(
        '❌ Failed to upload and index document.'
      );
    } finally {
      setUploadLoading(false);
    }
  };

  // =========================================================
  // BULK UPLOAD
  // =========================================================
  const handleBulkSubmit = async (e) => {
    e.preventDefault();

    if (!bulkFile) return;

    setBulkLoading(true);
    setBulkResults(null);
    setError('');

    const formData = new FormData();

    formData.append('file', bulkFile);
    formData.append('bug_type', bulkBugType);

    if (bulkSelectedAssignee) {
      formData.append('assignee_id', bulkSelectedAssignee);
    }

    if (bulkBugType === 'feature' && bulkSelectedFeature) {
      formData.append('feature_val', bulkSelectedFeature);
    }

    if (bulkCreatedBy) {
      formData.append('created_by', bulkCreatedBy);
    }

    try {
      const response = await axios.post(
        `${API_URL}/api/bulk-upload-bugs`,
        formData
      );

      if (response.data.status === 'success') {
        setBulkResults(response.data);

        // Save Bulk Importer preferences only after successful upload.
        // This storage is intentionally separate from Normal Bug Generator preferences.
        writeLocalPreferences(BULK_PREFERENCES_KEY, {
          bugType: bulkBugType,
          createdBy: bulkCreatedBy,
          selectedAssignee: bulkSelectedAssignee,
          selectedFeature: bulkBugType === 'feature' ? bulkSelectedFeature : '',
        });

        setBulkFile(null);

        if (bulkInputRef.current) {
          bulkInputRef.current.value = '';
        }
      } else {
        setError(
          `Bulk upload failed: ${response.data.message}`
        );
      }
    } catch (err) {
      console.error(err);
      setError('Failed to process bulk upload.');
    } finally {
      setBulkLoading(false);
    }
  };

  // =========================================================
  // NAVIGATION (Dashboard, Templates, Settings accessed via Quick Links)
  // =========================================================
  const navItems = [
    {
      id: 'report',
      label: 'Bug Ticket Generator',
      icon: '⚙️',
    },
    {
      id: 'knowledge',
      label: 'Knowledge Base',
      icon: '📖',
      sub: '(Rulebooks)',
    },
    {
      id: 'bulk',
      label: 'Bulk Importer',
      icon: '📁',
    },
  ];

  const quickLinks = [
    {
      label: 'Dashboard',
      icon: '🖥️',
      action: () => setActiveTab('dashboard'),
    },
    {
      label: 'Templates',
      icon: '📄',
      action: () => setActiveTab('templates'),
    },
    {
      label: 'Settings',
      icon: '⚙️',
      action: () => setActiveTab('settings'),
    },
  ];

  // =========================================================
  // HERO CONTENT
  // =========================================================
  const heroCopy = {
    report: {
      title: (
        <>
          Bug Ticket <span className="grad-text">Generator</span>
        </>
      ),
      subtitle:
        'Convert raw QA observations into detailed, developer-ready ClickUp tickets using AI and your game rulebook context.',
      art: '🐞',
    },

    knowledge: {
      title: (
        <>
          Knowledge <span className="grad-text">Base</span>
        </>
      ),
      subtitle:
        'Upload and manage game rulebooks and feature specifications so the AI can understand your product context.',
      art: '📚',
    },

    bulk: {
      title: (
        <>
          Welcome to <span className="grad-text">PS-QA Copilot</span>
        </>
      ),
      subtitle:
        'Convert raw QA notes into developer-ready ClickUp tickets with RAG context.',
      art: '🎟️',
    },

    settings: {
      title: (
        <>
          QA <span className="grad-text">Settings</span>
        </>
      ),
      subtitle:
        'Register your ClickUp API token to authenticate and record tickets under your own name.',
      art: '🔑',
    },

    templates: {
      title: (
        <>
          Bulk Import <span className="grad-text">Templates</span>
        </>
      ),
      subtitle:
        'Download official CSV spreadsheet templates and sample formats for seamless batch bug reporting.',
      art: '📄',
    },

    dashboard: {
      title: (
        <>
          QA Command <span className="grad-text">Dashboard</span>
        </>
      ),
      subtitle:
        'Real-time overview of ticket creation metrics, team activity, and priority-wise bug reporting statistics.',
      art: '🖥️',
    },
  };

  return (
    <div className="app-shell d-flex position-relative">

      {/* =====================================================
          WELCOME POPUP
      ===================================================== */}
      {showWelcome && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-title"

         className="welcome-overlay">
          <div

           className="welcome-shell">
            <div

             className="welcome-content">
              <div

               className="welcome-glow"/>

              <div

               className="welcome-logo-wrap">
                <img
                  src="/logo.png"
                  alt="PS-QA Copilot Logo"

                 className="welcome-logo"/>
              </div>

              <div

               className="welcome-label">
                Welcome to
              </div>

              <h2
                id="welcome-title"

               className="welcome-title">
                PS-QA{' '}

                <span

                 className="welcome-title-gradient">
                  Copilot!
                </span>
              </h2>

              <div

               className="welcome-divider">
                <div

                 className="welcome-divider-line-left"/>

                <span

                 className="welcome-divider-dot">
                  ◆
                </span>

                <div

                 className="welcome-divider-line-right"/>
              </div>

              <p

               className="welcome-description">
                Your intelligent assistant for converting raw QA observations
                into developer-ready ClickUp tickets with RAG rulebook
                context.
              </p>

              <div

               className="welcome-tip">
                <div

                 className="welcome-tip-icon">
                  💡
                </div>

                <div

                 className="welcome-tip-text">
                  <strong

                   className="welcome-tip-strong">
                    Quick Tip:
                  </strong>{' '}
                  Generate single tickets, train the AI with new rulebooks,
                  or upload bulk CSV bug sheets in seconds!
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseWelcome}
                className="welcome-start-btn">
                <span

                 className="welcome-start-icon">
                  🚀
                </span>

                Let's Get Started

                <span

                 className="welcome-start-arrow">
                  →
                </span>
              </button>

              <div

               className="welcome-security">
                <span

                 className="welcome-security-icon">
                  ♢
                </span>

                Your data is secure and used only to generate tickets.
              </div>

            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          LOADING OVERLAY - BUG GENERATOR
      ========================================================= */}
      {loading && activeTab === 'report' && (
        <div

         className="loading-overlay-report">
          <div
            className="spinner-border text-primary mb-4 loading-spinner-report"

            role="status"
          />

          <h2 className="fw-bold mb-2">
            🤖 AI Copilot at Work
          </h2>

          <p
            className="text-info fs-5 mb-4 loading-message"

          >
            {loadingMessage ||
              'Processing your bug observation with RAG context...'}
          </p>

          <div className="badge bg-dark border border-secondary text-light px-3 py-2">
            ⚡ Pinecone Cloud + Google Gemini Pipeline Active
          </div>
        </div>
      )}

      {/* =========================================================
          KNOWLEDGE BASE LOADING
      ========================================================= */}
      {uploadLoading && (
        <div

         className="loading-overlay-knowledge">
          <div
            className="spinner-border text-info mb-4 loading-spinner-knowledge"

            role="status"
          />

          <h2 className="fw-bold mb-2">
            📄 Neural Indexer Active
          </h2>

          <p
            className="text-success fs-5 mb-4 loading-message"

          >
            Reading document structure, chunking rulebook segments, and
            syncing 3072-dim vectors to Pinecone...
          </p>

          <div className="badge bg-dark border border-info text-info px-3 py-2">
            🧠 Training AI Brain with New Rules
          </div>
        </div>
      )}

      {/* =========================================================
          BULK LOADING
      ========================================================= */}
      {bulkLoading && (
        <div

         className="loading-overlay-bulk">
          <div
            className="spinner-border mb-4 loading-spinner-bulk"

            role="status"
          />

          <h2 className="fw-bold mb-2">
            📂 Batch Spreadsheet Processing
          </h2>

          <p
            className="text-warning fs-5 mb-4 loading-message"

          >
            Validating CSV rows, mapping each observation against game rules,
            and generating multiple ClickUp tickets...
          </p>

          <div
            className="badge bg-dark text-light px-3 py-2 bulk-pipeline-badge"

          >
            ⚡ Automated Bulk Pipeline Running
          </div>
        </div>
      )}

      {/* =========================================================
          SIDEBAR
      ===================================================== */}
      <aside className="sidebar d-flex flex-column">

        <div className="sidebar-brand d-flex align-items-center gap-2">
          <img
            src="/logo.png"
            alt="PS-QA Copilot"
            className="brand-icon brand-logo-img"

          />

          <span className="brand-name">
            PS-QA Copilot
          </span>
        </div>

        <nav className="sidebar-nav nav flex-column">

          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item btn text-start d-flex align-items-center gap-2 ${activeTab === item.id
                ? 'active'
                : ''
                }`}
              onClick={() => setActiveTab(item.id)}
            >
              <span className="nav-icon">
                {item.icon}
              </span>

              <span>

                {item.label}

                {item.sub && (
                  <>
                    <br />

                    <span className="nav-sub">
                      {item.sub}
                    </span>
                  </>
                )}

              </span>

            </button>
          ))}

        </nav>

        <div className="quick-links">

          <div className="quick-links-title">
            QUICK LINKS
          </div>

          <nav className="nav flex-column">

            {quickLinks.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={q.action ? q.action : undefined}
                className={`nav-item nav-item--quiet btn text-start d-flex align-items-center gap-2 ${activeTab === q.label.toLowerCase().replace(' ', '-') ? 'active' : ''}`}
              >
                <span className="nav-icon">
                  {q.icon}
                </span>

                {q.label}
              </button>
            ))}

          </nav>

        </div>

        <div className="sidebar-footer mt-auto">
          <div className="user-chip d-flex align-items-center gap-2">
            <span className="user-avatar">
              PS
            </span>
            <div className="user-meta flex-grow-1">
              <div className="user-name">
                PS-QA Copilot
              </div>
              <div className="user-role">
                AI Assistant
              </div>
            </div>
          </div>
        </div>

      </aside>

      {/* =========================================================
          MAIN CONTENT
      ===================================================== */}
      <main className="main-content flex-grow-1">

        <section
          className="page-hero d-flex align-items-center justify-content-between page-hero-custom"

        >
          <div
            className="hero-copy hero-copy-custom"

          >
            <h1>
              {heroCopy[activeTab].title}
            </h1>

            <p className="mb-0">
              {heroCopy[activeTab].subtitle}
            </p>
          </div>

          <div
            className="hero-art hero-art-custom"
            aria-hidden="true"

          >
            {heroCopy[activeTab].art}
          </div>
        </section>

        {/* Tabs - HIDE TOP NAV BAR FOR UTILITY PAGES (Settings, Templates, Dashboard) */}
        {['report', 'knowledge', 'bulk'].includes(activeTab) && (
          <div className="tab-strip d-flex">

            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`tab-btn btn d-flex align-items-center gap-2 ${activeTab === item.id
                  ? 'active'
                  : ''
                  }`}
                onClick={() => setActiveTab(item.id)}
              >
                <span className="nav-icon">
                  {item.icon}
                </span>

                {item.label}

                {item.sub
                  ? ` ${item.sub}`
                  : ''}
              </button>
            ))}

          </div>
        )}

        {/* =====================================================
            BUG REPORTER
        ===================================================== */}
        {activeTab === 'report' && (
          <section className="panel">

            <form onSubmit={handleGeneratePreview}>

              <div className="field mb-4">

                <label className="field-label d-flex align-items-center gap-2">

                  <span className="step-badge">
                    1
                  </span>

                  Enter Raw Bug Observation

                </label>

                <p className="field-hint">
                  Describe the issue as you experienced it. Be specific and
                  include any relevant details.
                </p>

                <textarea
                  rows="3"
                  className="form-control input textarea"
                  placeholder="e.g., Reward popup appears twice after reconnecting to the internet..."
                  value={description}
                  onChange={(e) =>
                    setDescription(e.target.value)
                  }
                  required
                />

                <div className="char-count">
                  {description.length} / 2000
                </div>

              </div>

              <div className="field mb-4">

                <label className="field-label d-flex align-items-center gap-2">

                  <span className="step-badge">
                    2
                  </span>

                  Attach Screenshot / Video Evidence (Optional)

                </label>

                <p className="field-hint">
                  Add screenshots or a short video to help AI understand the
                  issue better.
                </p>

                <div className="row g-3">

                  <div className="col-md-8">

                    <div className="dropzone dropzone--lg">

                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={(e) =>
                          setFile(e.target.files[0])
                        }
                        className="dropzone-input"
                      />

                      <span className="dropzone-icon">
                        ☁️
                      </span>

                      <span>
                        {file
                          ? file.name
                          : (
                            <>
                              Drag &amp; drop your files here
                              <br />
                              or{' '}
                              <span className="browse-link">
                                click to browse
                              </span>
                            </>
                          )}
                      </span>

                    </div>

                  </div>

                  <div className="col-md-4">

                    <div className="info-box h-100">

                      <strong>
                        📄 Supported formats
                      </strong>

                      <ul>

                        <li>
                          Images: PNG, JPG, JPEG, GIF, WebP
                        </li>

                        <li>
                          Videos: MP4, MOV, WebM
                        </li>

                        <li>
                          Max file size: 50MB per file
                        </li>

                      </ul>

                    </div>

                  </div>

                </div>

              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-grad w-100"
              >
                {loading && !generatedReport
                  ? 'Processing RAG & AI...'
                  : '✨ Generate AI Preview'}
              </button>

              <p className="form-note text-center mt-2">
                🛡️ Your data is secure and used only to generate the ticket
                preview.
              </p>

            </form>

            {error && (
              <div className="alert alert-error mt-3">
                {error}
              </div>
            )}

            {ticketUrl && (
              <div className="alert alert-success mt-3">

                🎉{' '}

                <strong>
                  Ticket Created Successfully!
                </strong>

                <br />

                <a
                  href={ticketUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="alert-link"
                >
                  Open in ClickUp ↗
                </a>

              </div>
            )}

            {generatedReport && (
              <div className="panel panel-nested mt-4">

                <h2 className="panel-title">
                  2. Review &amp; Edit Ticket
                </h2>

                <div className="field mb-3">

                  <label className="field-label field-label--sm">
                    Summary (Title):
                  </label>

                  <input
                    type="text"
                    value={summary}
                    onChange={(e) =>
                      setSummary(e.target.value)
                    }
                    className="form-control input"
                  />

                </div>

                <div className="row g-3 mb-3">

                  <div className="col-md-6">

                    <label className="field-label field-label--sm">
                      Bug Type:
                    </label>

                    <select
                      value={bugType}
                      onChange={(e) =>
                        setBugType(e.target.value)
                      }
                      className="form-select input"
                    >
                      <option value="prod">
                        Prod Bugs
                      </option>

                      <option value="feature">
                        Feature Bugs
                      </option>
                    </select>

                  </div>

                  <div className="col-md-6">

                    <label className="field-label field-label--sm">
                      Created By (QA Profile):
                    </label>

                    <select
                      value={createdBy}
                      onChange={(e) => handleUserChange(e.target.value)}
                      className="form-select input"
                    >
                      {users.length === 0 ? (
                        <option value="">No profiles registered (Go to Settings)</option>
                      ) : (
                        users.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))
                      )}
                    </select>

                  </div>

                </div>

                {/* --- Dynamic Assignee & Feature Fields (Optimized Layout) --- */}
                <div className="row g-3 mb-3">
                  <div className={bugType === 'feature' ? 'col-md-6' : 'col-12'}>
                    <label className="field-label field-label--sm">
                      Assignee:
                    </label>
                    <select
                      value={selectedAssignee}
                      onChange={(e) => setSelectedAssignee(e.target.value)}
                      className="form-select input"
                    >
                      {assignees.length === 0 ? (
                        <option value="">No assignees available</option>
                      ) : (
                        assignees.map((m) => (
                          <option key={m.id} value={m.id}>{m.username}</option>
                        ))
                      )}
                    </select>
                  </div>

                  {bugType === 'feature' && (
                    <div className="col-md-6">
                      <label className="field-label field-label--sm">
                        Feature:
                      </label>
                      <div className="custom-dropdown-container position-relative" ref={featureDropdownRef}>
                        <div
                          className={`form-control input custom-dropdown-trigger d-flex align-items-center justify-content-between ${isFeatureOpen ? 'is-open' : ''} dropdown-trigger`}
                          onClick={() => setIsFeatureOpen(!isFeatureOpen)}

                        >
                          <span className="text-truncate">
                            {selectedFeature || 'Select feature...'}
                          </span>
                          <span className={`dropdown-chevron ${isFeatureOpen ? 'rotate' : ''}`}>▼</span>
                        </div>

                        {isFeatureOpen && (
                          <div
                            className="position-absolute w-100 mt-1 shadow-lg rounded-3 p-2 custom-feature-dropdown-menu"

                          >
                            <div className="mb-2 px-1">
                              <input
                                type="text"
                                className="form-control form-control-sm dropdown-search"
                                placeholder="Search features..."
                                value={featureSearch}
                                onChange={(e) => setFeatureSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}

                                autoFocus
                              />
                            </div>
                            <div className="custom-dropdown-list-scroll" >
                              {featureOptions.length === 0 ? (
                                <div className="p-2 text-muted text-center small">No features available</div>
                              ) : (
                                (() => {
                                  const filteredOptions = featureOptions.filter((opt) =>
                                    opt.toLowerCase().includes(featureSearch.toLowerCase())
                                  );
                                  if (filteredOptions.length === 0) {
                                    return <div className="p-2 text-muted text-center small">No matching features</div>;
                                  }
                                  return filteredOptions.map((opt) => {
                                    const isSelected = selectedFeature === opt;
                                    return (
                                      <div
                                        key={opt}
                                        className={`px-3 py-2 rounded-2 d-flex align-items-center justify-content-between custom-dropdown-option ${isSelected ? 'selected' : ''}`}
                                        onClick={() => {
                                          setSelectedFeature(opt);
                                          setIsFeatureOpen(false);
                                          setFeatureSearch('');
                                        }}                                      >
                                        <span className="text-truncate">{opt}</span>
                                        {isSelected && <span className="ms-2 text-success fw-bold">✓</span>}
                                      </div>
                                    );
                                  });
                                })()
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="row g-3 mb-3">

                  <div className="col-md-6">

                    <label className="field-label field-label--sm">
                      Priority:
                    </label>

                    <select
                      value={priority}
                      onChange={(e) =>
                        setPriority(e.target.value)
                      }
                      className="form-select input"
                    >
                      <option value="P0">P0</option>
                      <option value="P1">P1</option>
                      <option value="P2">P2</option>
                      <option value="P3">P3</option>
                      <option value="P4">P4</option>
                      <option value="P5">P5</option>
                    </select>

                  </div>

                  <div className="col-md-6">

                    <label className="field-label field-label--sm">
                      Repro Rate:
                    </label>

                    <select
                      value={reproRate}
                      onChange={(e) =>
                        setReproRate(e.target.value)
                      }
                      className="form-select input"
                    >
                      <option value="100%">100%</option>
                      <option value="75%">75%</option>
                      <option value="50%">50%</option>
                      <option value="25%">25%</option>
                      <option value="10%">10%</option>
                      <option value="Once">Once</option>
                    </select>

                  </div>

                </div>

                <div className="field mb-3">

                  <label className="field-label field-label--sm">
                    Description:
                  </label>

                  <textarea
                    rows="12"
                    value={generatedReport}
                    onChange={(e) =>
                      setGeneratedReport(e.target.value)
                    }
                    className="form-control input textarea textarea-mono"
                  />

                </div>

                <button
                  type="button"
                  onClick={handleCreateTicket}
                  disabled={loading}
                  className="btn btn-success-grad w-100"
                >
                  {loading
                    ? 'Creating Ticket...'
                    : '🚀 Approve & Create ClickUp Ticket'}
                </button>

              </div>
            )}

          </section>
        )}

        {/* =====================================================
            KNOWLEDGE BASE
        ===================================================== */}
        {activeTab === 'knowledge' && (
          <section className="panel text-center">

            <div className="kb-icon-circle mx-auto mb-3">
              📖
            </div>

            <h2 className="panel-title">
              Knowledge Base Management
            </h2>

            <p
              className="panel-intro mx-auto kb-intro"

            >
              Upload new game rulebooks or updated feature specs (PDF or TXT).
              The system will automatically chunk, embed, and index them into
              Pinecone Cloud so that future bug reports reference the updated
              rules.
            </p>

            <form
              onSubmit={handleUploadRulebook}
              className="text-start mt-4"
            >

              <div className="field mb-3">

                <label className="field-label d-flex align-items-center gap-2">

                  <span className="step-badge">
                    1
                  </span>

                  Select Rulebook (.pdf or .txt)

                </label>

                <p className="field-hint">
                  Upload your rulebook or feature specification file.
                </p>

                <div className="row g-3">

                  <div className="col-md-8">

                    <div className="dropzone dropzone--lg">

                      <input
                        type="file"
                        accept=".pdf,.txt"
                        ref={rulebookInputRef}
                        onChange={(e) =>
                          setRulebookFile(e.target.files[0])
                        }
                        className="dropzone-input"
                      />

                      <span className="dropzone-icon">
                        ☁️
                      </span>

                      <span>
                        {rulebookFile
                          ? rulebookFile.name
                          : (
                            <>
                              Drag &amp; drop your file here
                              <br />
                              or{' '}
                              <span className="browse-link">
                                click to browse
                              </span>
                            </>
                          )}
                      </span>

                    </div>

                  </div>

                  <div className="col-md-4">

                    <div className="info-box h-100">

                      <strong>
                        📄 Supported formats
                      </strong>

                      <ul>

                        <li>
                          PDF (.pdf)
                        </li>

                        <li>
                          Text (.txt)
                        </li>

                        <li>
                          Maximum file size: 50MB
                        </li>

                      </ul>

                    </div>

                  </div>

                </div>

              </div>

              <button
                type="submit"
                disabled={!rulebookFile || uploadLoading}
                className="btn btn-grad w-100"
              >
                {uploadLoading
                  ? 'Uploading & Indexing to Pinecone...'
                  : '✨ Upload & Train AI'}
              </button>

              <p className="form-note text-center mt-2">
                🛡️ Once uploaded, the AI will be trained and your rulebook
                will be ready to use.
              </p>

            </form>

            {uploadMessage && (
              <div className="alert alert-neutral mt-3 text-start">

                <p className="mb-0 fw-bold">
                  {uploadMessage}
                </p>

              </div>
            )}

          </section>
        )}

        {/* =====================================================
            BULK IMPORTER
        ================================================     */}
        {activeTab === 'bulk' && (
          <>

            <section className="panel feature-panel mb-3">

              <div className="row g-4">

                <div className="col-md-4 feature-item d-flex align-items-start gap-3">

                  <span className="feature-icon">
                    ☁️
                  </span>

                  <div>

                    <strong>
                      Bulk Processing
                    </strong>

                    <p>
                      Process hundreds of bugs in one go
                    </p>

                  </div>

                </div>

                <div className="col-md-4 feature-item d-flex align-items-start gap-3">

                  <span className="feature-icon">
                    🧠
                  </span>

                  <div>

                    <strong>
                      RAG Powered
                    </strong>

                    <p>
                      AI maps bugs with rulebook context
                    </p>

                  </div>

                </div>

                <div className="col-md-4 feature-item d-flex align-items-start gap-3">

                  <span className="feature-icon">
                    🎟️
                  </span>

                  <div>

                    <strong>
                      Auto Ticket Creation
                    </strong>

                    <p>
                      Create detailed ClickUp tickets automatically
                    </p>

                  </div>

                </div>

              </div>

            </section>

            <section className="panel">

              <div className="d-flex align-items-start gap-3 mb-3">

                <div className="kb-icon-circle kb-icon-circle--sm">
                  ☁️
                </div>

                <div>

                  <h3 className="panel-title mb-1">
                    Bulk Bug Import
                  </h3>

                  <p className="panel-intro mb-0">

                    Upload a{' '}
                    <strong>
                      .csv
                    </strong>{' '}
                    spreadsheet containing at least{' '}

                    <span className="badge-pill">
                      Description
                    </span>{' '}

                    and{' '}

                    <span className="badge-pill">
                      Priority
                    </span>{' '}

                    columns. Need a template? Check out the <span  onClick={() => setActiveTab('templates')} className="templates-link">Templates</span> section.

                  </p>

                </div>

              </div>

              <form onSubmit={handleBulkSubmit}>

                <div className="row g-3 mb-3">

                  <div className="col-md-6">

                    <label className="field-label d-flex align-items-center gap-2">

                      <span className="step-badge">
                        1
                      </span>

                      Select Bug Type

                    </label>

                    <select
                      value={bulkBugType}
                      onChange={(e) =>
                        setBulkBugType(e.target.value)
                      }
                      className="form-select input"
                    >
                      <option value="prod">
                        Prod Bugs
                      </option>

                      <option value="feature">
                        Feature Bugs
                      </option>
                    </select>

                  </div>

                  <div className="col-md-6">

                    <label className="field-label d-flex align-items-center gap-2">

                      <span className="step-badge">
                        2
                      </span>

                      Created By (QA Profile)

                    </label>

                    <select
                      value={bulkCreatedBy}
                      onChange={(e) => setBulkCreatedBy(e.target.value)}
                      className="form-select input"
                    >
                      {users.length === 0 ? (
                        <option value="">No profiles registered (Go to Settings)</option>
                      ) : (
                        users.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))
                      )}
                    </select>

                  </div>

                </div>

                {/* --- Assignee & Feature Fields for Bulk Importer (Sequential Steps) --- */}
                <div className="row g-3 mb-4">
                  <div className={bulkBugType === 'feature' ? 'col-md-6' : 'col-12'}>
                    <label className="field-label d-flex align-items-center gap-2">
                      <span className="step-badge">3</span>
                      Assignee
                    </label>
                    <select
                      value={bulkSelectedAssignee}
                      onChange={(e) => setBulkSelectedAssignee(e.target.value)}
                      className="form-select input"
                    >
                      {bulkAssignees.length === 0 ? (
                        <option value="">No assignees available</option>
                      ) : (
                        bulkAssignees.map((m) => (
                          <option key={m.id} value={m.id}>{m.username}</option>
                        ))
                      )}
                    </select>
                  </div>

                  {bulkBugType === 'feature' && (
                    <div className="col-md-6">
                      <label className="field-label d-flex align-items-center gap-2">
                        <span className="step-badge">4</span>
                        Feature
                      </label>
                      <div className="custom-dropdown-container position-relative" ref={bulkFeatureDropdownRef}>
                        <div
                          className={`form-control input custom-dropdown-trigger d-flex align-items-center justify-content-between ${isBulkFeatureOpen ? 'is-open' : ''} dropdown-trigger`}
                          onClick={() => setIsBulkFeatureOpen(!isBulkFeatureOpen)}

                        >
                          <span className="text-truncate">
                            {bulkSelectedFeature || 'Select feature...'}
                          </span>
                          <span className={`dropdown-chevron ${isBulkFeatureOpen ? 'rotate' : ''}`}>▼</span>
                        </div>

                        {isBulkFeatureOpen && (
                          <div
                            className="position-absolute w-100 mt-1 shadow-lg rounded-3 p-2 custom-feature-dropdown-menu"

                          >
                            <div className="mb-2 px-1">
                              <input
                                type="text"
                                className="form-control form-control-sm dropdown-search"
                                placeholder="Search features..."
                                value={bulkFeatureSearch}
                                onChange={(e) => setBulkFeatureSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}

                                autoFocus
                              />
                            </div>
                            <div className="custom-dropdown-list-scroll" >
                              {bulkFeatureOptions.length === 0 ? (
                                <div className="p-2 text-muted text-center small">No features available</div>
                              ) : (
                                (() => {
                                  const filteredBulkOptions = bulkFeatureOptions.filter((opt) =>
                                    opt.toLowerCase().includes(bulkFeatureSearch.toLowerCase())
                                  );
                                  if (filteredBulkOptions.length === 0) {
                                    return <div className="p-2 text-muted text-center small">No matching features</div>;
                                  }
                                  return filteredBulkOptions.map((opt) => {
                                    const isSelected = bulkSelectedFeature === opt;
                                    return (
                                      <div
                                        key={opt}
                                        className={`px-3 py-2 rounded-2 d-flex align-items-center justify-content-between custom-dropdown-option ${isSelected ? 'selected' : ''}`}
                                        onClick={() => {
                                          setBulkSelectedFeature(opt);
                                          setIsBulkFeatureOpen(false);
                                          setBulkFeatureSearch('');
                                        }}                                      >
                                        <span className="text-truncate">{opt}</span>
                                        {isSelected && <span className="ms-2 text-success fw-bold">✓</span>}
                                      </div>
                                    );
                                  });
                                })()
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="field mb-4">

                  <label className="field-label d-flex align-items-center gap-2">

                    <span className="step-badge">
                      {bulkBugType === 'feature' ? '5' : '4'}
                    </span>

                    Upload .csv Spreadsheet

                  </label>

                  <div className="row g-3">

                    <div className="col-md-8">

                      <div className="dropzone dropzone--lg">

                        <input
                          type="file"
                          accept=".csv"
                          ref={bulkInputRef}
                          onChange={(e) =>
                            setBulkFile(e.target.files[0])
                          }
                          className="dropzone-input"
                        />

                        <span className="dropzone-icon">
                          ☁️
                        </span>

                        <span>
                          {bulkFile
                            ? bulkFile.name
                            : (
                              <>
                                Drag &amp; drop your .csv file here
                                <br />
                                or{' '}
                                <span className="browse-link">
                                  click to browse
                                </span>
                              </>
                            )}
                        </span>

                      </div>

                    </div>

                    <div className="col-md-4">

                      <div className="info-box h-100">

                        <strong>
                          ☰ Requirements
                        </strong>

                        <ul>

                          <li>
                            File format: .csv
                          </li>

                          <li>
                            Minimum columns: Description, Priority
                          </li>

                          <li>
                            Maximum file size: 25MB
                          </li>

                          <li>
                            UTF-8 encoding recommended
                          </li>

                        </ul>

                      </div>

                    </div>

                  </div>

                </div>

                <button
                  type="submit"
                  disabled={!bulkFile || bulkLoading}
                  className="btn btn-purple-grad w-100"
                >
                  {bulkLoading
                    ? '🤖 AI is processing sheet (this may take a moment)...'
                    : '🚀 Process & Create Tickets'}
                </button>

                <p className="form-note text-center mt-2">
                  The AI will validate, process and create ClickUp tickets for
                  all valid rows.
                </p>

              </form>

              {error && (
                <div className="alert alert-error mt-3">
                  {error}
                </div>
              )}

              {bulkResults && (
                <div className="alert alert-success mt-3">

                  <h3>
                    ✅ Successfully created{' '}
                    {bulkResults.total_created} tickets!
                  </h3>

                  <ul className="ticket-list">

                    {bulkResults.tickets.map((t, idx) => (
                      <li key={idx}>

                        <strong>
                          [{t.priority}]
                        </strong>{' '}

                        {t.summary}

                        {t.url && (
                          <>
                            {' '}
                            —{' '}

                            <a
                              href={t.url}
                              target="_blank"
                              rel="noreferrer"
                              className="alert-link"
                            >
                              Open ↗
                            </a>
                          </>
                        )}

                      </li>
                    ))}

                  </ul>

                </div>
              )}

            </section>

          </>
        )}

        {/* =====================================================
            DASHBOARD TAB
        ===================================================== */}
        {activeTab === 'dashboard' && (
          <section className="panel">
            <h2 className="panel-title mb-3">📊 QA Command Overview</h2>

            {/* Top Metric Cards */}
            <div className="row g-3 mb-4 dashboard-metrics-grid">
              <div className="col-md-4">
                <div className="p-4 text-center rounded-3 shadow-sm dashboard-stat-card">
                  <div className="fs-2 fw-bold text-info">{allTickets.length}</div>
                  <div className="text-light fs-6 fw-semibold mt-1">Total Tickets Logged</div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="p-4 text-center rounded-3 shadow-sm dashboard-stat-card">
                  <div className="fs-2 fw-bold text-success">
                    {allTickets.filter(t => t.bug_type?.toString().toLowerCase() === 'prod').length}
                  </div>
                  <div className="text-light fs-6 fw-semibold mt-1">Prod Bugs</div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="p-4 text-center rounded-3 shadow-sm dashboard-stat-card">
                  <div className="fs-2 fw-bold text-warning">{users.length}</div>
                  <div className="text-light fs-6 fw-semibold mt-1">Active QA Profiles</div>
                </div>
              </div>
            </div>

            {/* Priority Count Breakdown Grid */}
            <h4 className="fs-6 fw-bold mb-3 text-info">🎯 Bug Reports by Priority Type (All Users):</h4>
            <div className="row g-3 mb-4 dashboard-priority-grid">
              {['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].map((pLevel) => {
                const count = allTickets.filter(
                  t => t.priority && t.priority.toString().toUpperCase() === pLevel
                ).length;

                return (
                  <div className="col-md-2 col-4" key={pLevel}>
                    <div className="p-3 text-center rounded-3 dashboard-summary-card priority-summary-card">
                      <div className="fs-4 fw-bold text-light">{count}</div>
                      <div className="badge bg-secondary mt-1">{pLevel}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {(() => {
              // Build profile statistics from the tickets already loaded in allTickets.
              // Users with zero tickets are also shown so every registered QA profile is visible.
              const profileNames = Array.from(
                new Set([
                  ...users,
                  ...allTickets.map(t => t.created_by).filter(Boolean),
                ])
              );

              const profileStats = profileNames.map((profileName) => {
                const profileTickets = allTickets.filter(
                  t => (t.created_by || '').toString().trim().toLowerCase() ===
                    profileName.toString().trim().toLowerCase()
                );

                return {
                  name: profileName,
                  total: profileTickets.length,
                  prod: profileTickets.filter(
                    t => t.bug_type?.toString().toLowerCase() === 'prod'
                  ).length,
                  feature: profileTickets.filter(
                    t => t.bug_type?.toString().toLowerCase() === 'feature'
                  ).length,
                };
              }).sort((a, b) => {
                if (b.total !== a.total) return b.total - a.total;
                return a.name.toString().localeCompare(b.name.toString());
              });

              const selectedProfileTickets = selectedDashboardProfile
                ? allTickets.filter(
                    t => (t.created_by || '').toString().trim().toLowerCase() ===
                      selectedDashboardProfile.toString().trim().toLowerCase()
                  )
                : [];

              const visibleProfileTickets = selectedProfileTickets.slice(
                0,
                dashboardProfileLoadCount
              );

              if (selectedDashboardProfile) {
                return (
                  <>
                    {/* Profile Detail View */}
                    <div className="dashboard-profile-detail-header mb-3">
                      <button
                        type="button"
                        className="btn btn-outline-info btn-sm dashboard-back-button"
                        onClick={() => {
                          setSelectedDashboardProfile(null);
                          setDashboardProfileLoadCount(10);
                        }}
                      >
                        ← Back to Profiles
                      </button>

                      <div className="dashboard-profile-detail-title">
                        <h4 className="fs-6 fw-bold mb-1 text-info">
                          👤 {selectedDashboardProfile}
                        </h4>
                        <p className="text-muted mb-0">
                          Showing {Math.min(dashboardProfileLoadCount, selectedProfileTickets.length)} of {selectedProfileTickets.length} bugs
                        </p>
                      </div>

                      <div className="dashboard-profile-detail-spacer" aria-hidden="true" />
                    </div>

                    {/* Selected Profile Metrics */}
                    <div className="row g-3 mb-4 dashboard-profile-metrics">
                      <div className="col-md-4">
                        <div className="p-3 text-center rounded-3 dashboard-summary-card dashboard-profile-metric-card">
                          <div className="fs-4 fw-bold text-primary">{selectedProfileTickets.length}</div>
                          <div className="dashboard-profile-metric-label">Total Bugs</div>
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div className="p-3 text-center rounded-3 dashboard-summary-card dashboard-profile-metric-card">
                          <div className="fs-4 fw-bold text-success">
                            {selectedProfileTickets.filter(t => t.bug_type?.toString().toLowerCase() === 'prod').length}
                          </div>
                          <div className="dashboard-profile-metric-label">Prod Bugs</div>
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div className="p-3 text-center rounded-3 dashboard-summary-card dashboard-profile-metric-card">
                          <div className="fs-4 fw-bold text-warning">
                            {selectedProfileTickets.filter(t => t.bug_type?.toString().toLowerCase() === 'feature').length}
                          </div>
                          <div className="dashboard-profile-metric-label">Feature Bugs</div>
                        </div>
                      </div>
                    </div>

                    {selectedProfileTickets.length === 0 ? (
                      <p className="text-muted">
                        No bugs have been logged by this profile yet.
                      </p>
                    ) : (
                      <>
                        <div className="table-responsive rounded border border-secondary dashboard-activity-table-wrap">
                          <table className="table table-dark table-sm table-hover mb-0 align-middle dashboard-table">
                            <thead className="dashboard-table-head">
                              <tr>
                                <th className="p-3">Summary</th>
                                <th className="p-3 col-priority">Priority</th>
                                <th className="p-3">Type</th>
                                <th className="p-3 col-timestamp">Timestamp</th>
                                <th className="p-3 col-action">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleProfileTickets.map((t, idx) => (
                                <tr key={t.id || t.ticket_id || `${t.timestamp}-${idx}`}>
                                  <td className="p-3 text-light text-truncate ticket-summary-cell">
                                    {t.summary}
                                  </td>
                                  <td className="p-3">
                                    <span
                                      className={`badge ${['P0', 'P1'].includes(t.priority?.toUpperCase()) ? 'bg-danger' : 'bg-secondary'}`}
                                    >
                                      {t.priority || '—'}
                                    </span>
                                  </td>
                                  <td className="p-3">
                                    <span className="badge bg-secondary">
                                      {t.bug_type === 'feature' ? 'Feature' : 'Prod'}
                                    </span>
                                  </td>
                                  <td className="p-3 text-light ticket-timestamp">
                                    {t.timestamp}
                                  </td>
                                  <td className="p-3">
                                    {t.url ? (
                                      <a
                                        href={t.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="btn btn-sm btn-outline-primary"
                                      >
                                        Open ↗
                                      </a>
                                    ) : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {dashboardProfileLoadCount < selectedProfileTickets.length && (
                          <div className="text-center mt-3">
                            <button
                              type="button"
                              className="btn btn-outline-info px-4"
                              onClick={() =>
                                setDashboardProfileLoadCount(prev => prev + 10)
                              }
                            >
                              Load More ({selectedProfileTickets.length - dashboardProfileLoadCount} remaining)
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                );
              }

              return (
                <>
                  {/* Profile Summary */}
                  <div className="dashboard-profile-summary-header mb-4">
                    <h4 className="fs-6 fw-bold mb-1 text-info">👥 Bugs by QA Profile</h4>
                    <p className="text-muted mb-0">
                      Select a profile to view its complete bug list.
                    </p>
                  </div>

                  {profileStats.length === 0 ? (
                    <p className="text-muted">
                      No QA profiles or tickets are available yet.
                    </p>
                  ) : (
                    <div className="row g-3">
                      {profileStats.map((profile) => (
                        <div className="col-md-6 col-xl-4" key={profile.name}>
                          <button
                            type="button"
                            className="w-100 text-start p-4 rounded-3 dashboard-summary-card dashboard-profile-card border"
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              setSelectedDashboardProfile(profile.name);
                              setDashboardProfileLoadCount(10);
                            }}
                          >
                            <div className="d-flex justify-content-between align-items-center mb-3">
                              <div className="fw-bold text-info dashboard-profile-name">
                                👤 {profile.name}
                              </div>
                              <span className="badge bg-secondary">
                                {profile.total} Total
                              </span>
                            </div>

                            <div className="row g-2">
                              <div className="col-6">
                                <div className="p-2 rounded border border-secondary text-center dashboard-profile-type-card">
                                  <div className="fs-5 fw-bold text-success">{profile.prod}</div>
                                  <small className="dashboard-profile-type-label">Prod Bugs</small>
                                </div>
                              </div>
                              <div className="col-6">
                                <div className="p-2 rounded border border-secondary text-center dashboard-profile-type-card">
                                  <div className="fs-5 fw-bold text-warning">{profile.feature}</div>
                                  <small className="dashboard-profile-type-label">Feature Bugs</small>
                                </div>
                              </div>
                            </div>

                            <div className="text-info small fw-semibold mt-3">
                              View Bugs →
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </section>
        )}

        {/* =====================================================
            TEMPLATES TAB
        ================================================ */}
        {activeTab === 'templates' && (
          <section className="panel text-center">
            <div className="kb-icon-circle mx-auto mb-3">📄</div>
            <h2 className="panel-title">Bulk Import CSV Templates</h2>
            <p className="panel-intro mx-auto templates-intro" >
              Download our official sample CSV spreadsheet to use with the Bulk Importer. It contains the exact required columns and sample rows pre-formatted for your team.
            </p>

            <div className="mt-4 templates-content" >
              <button
                type="button"
                onClick={handleDownloadCsvTemplate}
                className="btn btn-grad w-100 mb-4 template-download-btn"

              >
                📥 Download Official Bulk CSV Template (.csv)
              </button>

              <div className="card bg-dark text-light border-secondary p-4 text-start shadow template-preview-card">
                <h4 className="fs-6 fw-bold mb-3 text-info d-flex align-items-center gap-2">
                  <span>📊</span> Expected Spreadsheet Format (Sheet Preview):
                </h4>
                <p className="text-muted fs-6 mb-3">Your spreadsheet editor (Excel / Google Sheets) should look like this:</p>

                <div className="table-responsive rounded border border-secondary">
                  <table className="table table-dark table-sm table-hover table-bordered border-secondary mb-0 align-middle template-preview-table">
                    <thead className="table-secondary text-dark">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-center">Description<br />(Column A)</th>
                        <th scope="col" className="px-3 py-2 text-center template-priority-col" >Priority (Column B)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-3 py-2 text-light">Lost connection during Treasure Road reward, item duplicated</td>
                        <td className="px-3 py-2 text-center"><span className="badge bg-danger">P1</span></td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-light">App crashes when clicking the inventory button after a match</td>
                        <td className="px-3 py-2 text-center"><span className="badge bg-danger">P0</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => setActiveTab('bulk')}
                    className="btn btn-outline-info btn-sm px-4 py-2 fw-bold"
                  >
                    🚀 Go to Bulk Importer Now
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* =====================================================
            SETTINGS TAB
        ================================================ */}
        {activeTab === 'settings' && (
          <section className="panel text-center">
            <div className="kb-icon-circle mx-auto mb-3">🔑</div>
            <h2 className="panel-title">QA Profile & ClickUp Token Settings</h2>
            <p className="panel-intro mx-auto settings-intro" >
              Register your personal ClickUp API token below. We will verify your token against ClickUp, fetch your username, and ask for confirmation before saving it to the shared database.
            </p>

            <form onSubmit={handleVerifyToken} className="text-start mt-4 settings-form" >
              <div className="field mb-3">
                <label className="field-label d-flex align-items-center gap-2">
                  <span className="step-badge">1</span>
                  Your ClickUp API Token
                </label>
                <p className="field-hint">Paste your personal ClickUp API token (starts with pk_...).</p>
                <input
                  type="password"
                  placeholder="pk_XXXXXXXXXXXXXXXXXXXXXXXX"
                  value={apiTokenInput}
                  onChange={(e) => {
                    setApiTokenInput(e.target.value);
                    setPendingUser(null); // Reset confirmation state if input changes
                  }}
                  className="form-control input"
                  required
                />
              </div>

              {!pendingUser ? (
                <button type="submit" disabled={settingsLoading} className="btn btn-grad w-100">
                  {settingsLoading ? 'Verifying with ClickUp...' : '🔍 Verify Token'}
                </button>
              ) : (
                <div className="alert alert-info mt-3 text-center">
                  <p className="mb-2">✨ Verified successfully! ClickUp Username found: <strong>{pendingUser}</strong></p>
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmToken}
                      disabled={settingsLoading}
                      className="btn btn-success flex-grow-1"
                    >
                      {settingsLoading ? 'Saving Profile...' : '✅ Confirm & Add Profile'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingUser(null)}
                      className="btn btn-outline-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </form>

            {settingsMessage && (
              <div className="alert alert-neutral mt-3 text-start settings-alert" >
                <p className="mb-0 fw-bold">{settingsMessage}</p>
              </div>
            )}

            <div className="mt-4 text-start settings-content" >
              <h4 className="fs-6 fw-bold mb-2">Registered Profiles in Shared Database:</h4>
              {users.length === 0 ? (
                <p className="text-muted fs-6">No profiles registered yet.</p>
              ) : (
                <ul className="list-group settings-profiles-list">
                  {users.map((u) => (
                    <li key={u} className="list-group-item bg-dark text-light border-secondary d-flex justify-content-between align-items-center settings-profile-item">
                      <span>👤 {u}</span>
                      {createdBy === u && <span className="badge bg-primary">Active Profile</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

      </main>
    </div>
  );
}

export default App;

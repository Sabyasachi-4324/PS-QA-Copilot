import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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

  // Fetch users & tickets on startup and tab changes
  useEffect(() => {
    const fetchData = async () => {
      try {
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
        }

        const ticketRes = await axios.get(`${API_URL}/api/get-tickets`);
        if (ticketRes.data.status === 'success') {
          setAllTickets(ticketRes.data.tickets);
        }
      } catch (err) {
        console.error('Failed to fetch initial data', err);
      }
    };
    fetchData();
  }, [activeTab]);

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
  const [bulkBugType, setBulkBugType] = useState('prod');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState(null);

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
    setBugType('prod');

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

        setDescription('');
        setFile(null);
        setSummary('');
        setGeneratedReport('');
        setPriority('');
        setReproRate('');
        setBugType('prod');

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
    if (createdBy) {
      formData.append('created_by', createdBy);
    }

    try {
      const response = await axios.post(
        `${API_URL}/api/bulk-upload-bugs`,
        formData
      );

      if (response.data.status === 'success') {
        setBulkResults(response.data);

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
          style={{
            position: 'fixed',
            inset: 0,
            width: '100%',
            height: '100%',
            zIndex: 10000,

            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',

            padding: '15px',
            boxSizing: 'border-box',

            background: 'rgba(2, 6, 23, 0.70)',

            backdropFilter: 'blur(7px)',
            WebkitBackdropFilter: 'blur(7px)',
          }}
        >
          <div
            style={{
              width: 'min(455px, 92vw)',
              padding: '1.5px',
              borderRadius: '20px',

              background:
                'linear-gradient(135deg, #60a5fa, #8b5cf6 38%, #d946ef 68%, #f59e0b)',

              boxShadow:
                '0 22px 55px rgba(0,0,0,0.50), 0 0 40px rgba(139,92,246,0.18)',
            }}
          >
            <div
              style={{
                position: 'relative',

                width: '100%',
                boxSizing: 'border-box',

                padding: '22px 25px 18px',

                borderRadius: '18.5px',

                overflow: 'hidden',

                background:
                  'radial-gradient(circle at 50% 0%, rgba(139,92,246,0.30), transparent 34%), linear-gradient(145deg, #0d1328 0%, #151536 52%, #21142f 100%)',

                color: '#fff',

                textAlign: 'center',
              }}
            >
              <div
                style={{
                  position: 'absolute',

                  width: '170px',
                  height: '110px',

                  top: '-75px',
                  left: '50%',

                  transform: 'translateX(-50%)',

                  borderRadius: '50%',

                  background:
                    'radial-gradient(circle, rgba(168,85,247,0.40), transparent 70%)',

                  filter: 'blur(10px)',

                  pointerEvents: 'none',
                }}
              />

              <div
                style={{
                  width: '76px',
                  height: '76px',

                  margin: '0 auto 12px',

                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',

                  background: 'transparent',

                  border: 'none',

                  boxShadow: 'none',

                  position: 'relative',
                }}
              >
                <img
                  src="/logo.png"
                  alt="PS-QA Copilot Logo"
                  style={{
                    width: '70px',
                    height: '70px',

                    objectFit: 'contain',

                    display: 'block',

                    background: 'transparent',

                    border: 'none',
                    outline: 'none',
                    boxShadow: 'none',
                  }}
                />
              </div>

              <div
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 700,

                  color: '#f8fafc',

                  marginBottom: '2px',
                }}
              >
                Welcome to
              </div>

              <h2
                id="welcome-title"
                style={{
                  margin: 0,

                  fontSize: '2.15rem',

                  lineHeight: 1.05,

                  fontWeight: 900,

                  letterSpacing: '-0.045em',

                  color: '#fff',
                }}
              >
                PS-QA{' '}

                <span
                  style={{
                    background:
                      'linear-gradient(90deg, #f9a8d4, #d946ef 40%, #8b5cf6 70%, #60a5fa)',

                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',

                    backgroundClip: 'text',
                  }}
                >
                  Copilot!
                </span>
              </h2>

              <div
                style={{
                  display: 'flex',

                  alignItems: 'center',

                  justifyContent: 'center',

                  gap: '7px',

                  margin: '12px auto 11px',

                  maxWidth: '330px',
                }}
              >
                <div
                  style={{
                    flex: 1,

                    height: '1px',

                    background:
                      'linear-gradient(90deg, transparent, rgba(168,85,247,0.7))',
                  }}
                />

                <span
                  style={{
                    color: '#d946ef',
                    fontSize: '9px',
                  }}
                >
                  ◆
                </span>

                <div
                  style={{
                    flex: 1,

                    height: '1px',

                    background:
                      'linear-gradient(90deg, rgba(168,85,247,0.7), transparent)',
                  }}
                />
              </div>

              <p
                style={{
                  maxWidth: '365px',

                  margin: '0 auto 14px',

                  color: '#cbd5e1',

                  fontSize: '0.76rem',

                  lineHeight: 1.45,
                }}
              >
                Your intelligent assistant for converting raw QA observations
                into developer-ready ClickUp tickets with RAG rulebook
                context.
              </p>

              <div
                style={{
                  display: 'flex',

                  alignItems: 'center',

                  gap: '10px',

                  width: '100%',

                  boxSizing: 'border-box',

                  margin: '0 auto 12px',

                  padding: '10px 12px',

                  textAlign: 'left',

                  borderRadius: '12px',

                  border:
                    '1px solid rgba(139,92,246,0.38)',

                  background:
                    'rgba(15,23,42,0.60)',
                }}
              >
                <div
                  style={{
                    flex: '0 0 auto',

                    width: '37px',
                    height: '37px',

                    display: 'grid',
                    placeItems: 'center',

                    borderRadius: '50%',

                    fontSize: '18px',

                    background:
                      'radial-gradient(circle at 35% 30%, #fef08a, #facc15 35%, #7c3aed 72%, #312e81)',

                    boxShadow:
                      '0 0 15px rgba(250,204,21,0.15)',
                  }}
                >
                  💡
                </div>

                <div
                  style={{
                    color: '#dbe4f5',

                    fontSize: '0.68rem',

                    lineHeight: 1.4,
                  }}
                >
                  <strong
                    style={{
                      color: '#facc15',
                    }}
                  >
                    Quick Tip:
                  </strong>{' '}
                  Generate single tickets, train the AI with new rulebooks,
                  or upload bulk CSV bug sheets in seconds!
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseWelcome}
                style={{
                  width: '100%',

                  height: '44px',

                  border: 'none',

                  borderRadius: '10px',

                  padding: '0 15px',

                  cursor: 'pointer',

                  color: '#fff',

                  fontSize: '0.82rem',

                  fontWeight: 800,

                  background:
                    'linear-gradient(100deg, #f59e0b 0%, #f43f5e 30%, #d946ef 62%, #4f46e5 100%)',

                  boxShadow:
                    '0 8px 20px rgba(217,70,239,0.22)',

                  transition:
                    'transform 0.18s ease, filter 0.18s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform =
                    'translateY(-1px)';

                  e.currentTarget.style.filter =
                    'brightness(1.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform =
                    'translateY(0)';

                  e.currentTarget.style.filter =
                    'brightness(1)';
                }}
              >
                <span
                  style={{
                    marginRight: '6px',
                  }}
                >
                  🚀
                </span>

                Let's Get Started

                <span
                  style={{
                    marginLeft: '8px',
                    fontSize: '1rem',
                  }}
                >
                  →
                </span>
              </button>

              <div
                style={{
                  marginTop: '9px',

                  color: '#94a3b8',

                  fontSize: '0.59rem',

                  display: 'flex',

                  alignItems: 'center',

                  justifyContent: 'center',

                  gap: '5px',
                }}
              >
                <span
                  style={{
                    color: '#38bdf8',
                    fontSize: '0.75rem',
                  }}
                >
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
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',

            backgroundColor:
              'rgba(11, 15, 25, 0.88)',

            backdropFilter: 'blur(8px)',

            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',

            zIndex: 9999,

            color: '#fff',
            textAlign: 'center',

            padding: '2rem',
          }}
        >
          <div
            className="spinner-border text-primary mb-4"
            style={{
              width: '4rem',
              height: '4rem',
              borderWidth: '4px',
            }}
            role="status"
          />

          <h2 className="fw-bold mb-2">
            🤖 AI Copilot at Work
          </h2>

          <p
            className="text-info fs-5 mb-4"
            style={{
              maxWidth: '500px',
            }}
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
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',

            backgroundColor:
              'rgba(11,25,23,0.88)',

            backdropFilter: 'blur(8px)',

            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',

            zIndex: 9999,

            color: '#fff',
            textAlign: 'center',

            padding: '2rem',
          }}
        >
          <div
            className="spinner-border text-info mb-4"
            style={{
              width: '4rem',
              height: '4rem',
              borderWidth: '4px',
            }}
            role="status"
          />

          <h2 className="fw-bold mb-2">
            📄 Neural Indexer Active
          </h2>

          <p
            className="text-success fs-5 mb-4"
            style={{
              maxWidth: '500px',
            }}
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
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',

            backgroundColor:
              'rgba(25,11,25,0.88)',

            backdropFilter: 'blur(8px)',

            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',

            zIndex: 9999,

            color: '#fff',
            textAlign: 'center',

            padding: '2rem',
          }}
        >
          <div
            className="spinner-border mb-4"
            style={{
              width: '4rem',
              height: '4rem',
              borderWidth: '4px',
              color: '#a855f7',
            }}
            role="status"
          />

          <h2 className="fw-bold mb-2">
            📂 Batch Spreadsheet Processing
          </h2>

          <p
            className="text-warning fs-5 mb-4"
            style={{
              maxWidth: '500px',
            }}
          >
            Validating CSV rows, mapping each observation against game rules,
            and generating multiple ClickUp tickets...
          </p>

          <div
            className="badge bg-dark text-light px-3 py-2"
            style={{
              border: '1px solid #a855f7',
            }}
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
            className="brand-icon"
            style={{
              width: '32px',
              height: '32px',
              objectFit: 'contain',
              display: 'block',
            }}
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
          className="page-hero d-flex align-items-center justify-content-between"
          style={{
            minHeight: '130px',
          }}
        >
          <div
            className="hero-copy"
            style={{
              flex: 1,
            }}
          >
            <h1>
              {heroCopy[activeTab].title}
            </h1>

            <p className="mb-0">
              {heroCopy[activeTab].subtitle}
            </p>
          </div>

          <div
            className="hero-art"
            aria-hidden="true"
            style={{
              fontSize: '3.5rem',
              marginLeft: '1.5rem',
              flexShrink: 0,
            }}
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
              className="panel-intro mx-auto"
              style={{
                maxWidth: '640px',
              }}
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
        ===================================================== */}
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

                    columns. Need a template? Check out the <span style={{ color: '#38bdf8', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setActiveTab('templates')}>Templates</span> section.

                  </p>

                </div>

              </div>

              <form onSubmit={handleBulkSubmit}>

                <div className="row g-3 mb-4">

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

                <div className="field mb-4">

                  <label className="field-label d-flex align-items-center gap-2">

                    <span className="step-badge">
                      3
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
            DASHBOARD TAB (Improved with Priority Breakdown & Center Aligned Headers)
        ===================================================== */}
        {activeTab === 'dashboard' && (
          <section className="panel">
            <h2 className="panel-title mb-3">📊 QA Command Overview</h2>

            {/* Top Metric Cards */}
            <div className="row g-3 mb-4">
              <div className="col-md-4">
                <div className="p-4 text-center rounded-3 shadow-sm" style={{ background: 'linear-gradient(135deg, #131d31 0%, #1a103c 100%)', border: '1px solid rgba(139,92,246,0.3)' }}>
                  <div className="fs-2 fw-bold text-info">{allTickets.length}</div>
                  <div className="text-light fs-6 fw-semibold mt-1">Total Tickets Logged</div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="p-4 text-center rounded-3 shadow-sm" style={{ background: 'linear-gradient(135deg, #131d31 0%, #1a103c 100%)', border: '1px solid rgba(139,92,246,0.3)' }}>
                  <div className="fs-2 fw-bold text-success">{allTickets.filter(t => t.bug_type === 'prod').length}</div>
                  <div className="text-light fs-6 fw-semibold mt-1">Prod Bugs</div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="p-4 text-center rounded-3 shadow-sm" style={{ background: 'linear-gradient(135deg, #131d31 0%, #1a103c 100%)', border: '1px solid rgba(139,92,246,0.3)' }}>
                  <div className="fs-2 fw-bold text-warning">{users.length}</div>
                  <div className="text-light fs-6 fw-semibold mt-1">Active QA Profiles</div>
                </div>
              </div>
            </div>

            {/* Priority Count Breakdown Grid */}
            <h4 className="fs-6 fw-bold mb-3 text-info">🎯 Bug Reports by Priority Type (All Users):</h4>
            <div className="row g-3 mb-4">
              {['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].map((pLevel) => {
                const count = allTickets.filter(t => t.priority === pLevel).length;
                return (
                  <div className="col-md-2 col-4" key={pLevel}>
                    <div className="p-3 text-center rounded-3" style={{ background: '#131d31', border: '1px solid #22304a' }}>
                      <div className="fs-4 fw-bold text-light">{count}</div>
                      <div className="badge bg-secondary mt-1">{pLevel}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <h4 className="fs-6 fw-bold mb-3 text-info">🕒 Recent Team Activity Feed:</h4>
            {allTickets.length === 0 ? (
              <p className="text-muted">No tickets created yet. Start generating bugs from the Bug Ticket Generator!</p>
            ) : (
              <div className="table-responsive rounded border border-secondary">
                <table className="table table-dark table-sm table-hover mb-0 align-middle">
                  <thead style={{ background: '#1e293b' }}>
                    <tr>
                      <th className="p-3">Summary</th>
                      <th className="p-3" style={{ width: '100px' }}>Priority</th>
                      <th className="p-3" style={{ width: '140px' }}>Created By</th>
                      <th className="p-3" style={{ width: '150px' }}>Timestamp</th>
                      <th className="p-3" style={{ width: '100px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allTickets.slice(0, 10).map((t, idx) => (
                      <tr key={idx}>
                        <td className="p-3 text-light text-truncate" style={{ maxWidth: '300px' }}>{t.summary}</td>
                        <td className="p-3"><span className={`badge ${['P0', 'P1'].includes(t.priority) ? 'bg-danger' : 'bg-secondary'}`}>{t.priority}</span></td>
                        <td className="p-3 text-light">👤 {t.created_by}</td>
                        <td className="p-3 text-light" style={{ fontSize: '0.85rem' }}>{t.timestamp}</td>
                        <td className="p-3">
                          {t.url ? <a href={t.url} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-primary">Open ↗</a> : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* =====================================================
            TEMPLATES TAB (Compact Sheet Table Preview - Center Aligned Headers)
        ===================================================== */}
        {activeTab === 'templates' && (
          <section className="panel text-center">
            <div className="kb-icon-circle mx-auto mb-3">📄</div>
            <h2 className="panel-title">Bulk Import CSV Templates</h2>
            <p className="panel-intro mx-auto" style={{ maxWidth: '640px' }}>
              Download our official sample CSV spreadsheet to use with the Bulk Importer. It contains the exact required columns and sample rows pre-formatted for your team.
            </p>

            <div className="mt-4" style={{ maxWidth: '800px', margin: '2rem auto 0' }}>
              <button
                type="button"
                onClick={handleDownloadCsvTemplate}
                className="btn btn-grad w-100 mb-4"
                style={{ padding: '1rem', fontWeight: 'bold' }}
              >
                📥 Download Official Bulk CSV Template (.csv)
              </button>

              <div className="card bg-dark text-light border-secondary p-4 text-start shadow">
                <h4 className="fs-6 fw-bold mb-3 text-info d-flex align-items-center gap-2">
                  <span>📊</span> Expected Spreadsheet Format (Sheet Preview):
                </h4>
                <p className="text-muted fs-6 mb-3">Your spreadsheet editor (Excel / Google Sheets) should look like this:</p>

                <div className="table-responsive rounded border border-secondary">
                  <table className="table table-dark table-sm table-hover table-bordered border-secondary mb-0 align-middle">
                    <thead className="table-secondary text-dark">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-center">Description<br />(Column A)</th>
                        <th scope="col" className="px-3 py-2 text-center" style={{ width: '160px' }}>Priority (Column B)</th>
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
        ===================================================== */}
        {activeTab === 'settings' && (
          <section className="panel text-center">
            <div className="kb-icon-circle mx-auto mb-3">🔑</div>
            <h2 className="panel-title">QA Profile & ClickUp Token Settings</h2>
            <p className="panel-intro mx-auto" style={{ maxWidth: '640px' }}>
              Register your personal ClickUp API token below. We will verify your token against ClickUp, fetch your username, and ask for confirmation before saving it to the shared database.
            </p>

            <form onSubmit={handleVerifyToken} className="text-start mt-4" style={{ maxWidth: '640px', margin: '0 auto' }}>
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
              <div className="alert alert-neutral mt-3 text-start" style={{ maxWidth: '640px', margin: '1rem auto 0' }}>
                <p className="mb-0 fw-bold">{settingsMessage}</p>
              </div>
            )}

            <div className="mt-4 text-start" style={{ maxWidth: '640px', margin: '2rem auto 0' }}>
              <h4 className="fs-6 fw-bold mb-2">Registered Profiles in Shared Database:</h4>
              {users.length === 0 ? (
                <p className="text-muted fs-6">No profiles registered yet.</p>
              ) : (
                <ul className="list-group">
                  {users.map((u) => (
                    <li key={u} className="list-group-item bg-dark text-light border-secondary d-flex justify-content-between align-items-center">
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

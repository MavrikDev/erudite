import { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Settings as SettingsIcon, Palette, Key, Database, Info, Eye, EyeOff, Sun, Moon } from 'lucide-react';
import { getProvider, setProvider, getProviders, getProviderConfig, testKey } from '../utils/ai';

export default function SettingsPage() {
  const { themeName, setThemeName, themes, isDark, baseId, toggleMode, palettes } = useTheme();
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('solorev-api-key') || '');
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const [providerId, setProviderId] = useState(getProvider);
  const providers = getProviders();

  const paletteEntries = Object.entries(palettes);

  const selectTheme = (id) => {
    // Use functional update to read current state, not stale isDark from render
    setThemeName((prev) => {
      const dark = prev.endsWith('-dark');
      return dark ? `${id}-dark` : id;
    });
  };

  const handleProviderChange = (id) => {
    if (id === providerId) return;
    setProviderId(id);
    setProvider(id);
    setApiKey('');
    localStorage.removeItem('solorev-api-key');
    setTestResult(null);
    setSaved(false);
  };

  const saveApiKey = () => {
    localStorage.setItem('solorev-api-key', apiKey.trim());
    setSaved(true);
    setTestResult(null);
    setTimeout(() => setSaved(false), 2000);
  };

  const testApiKey = async () => {
    const key = apiKey.trim();
    if (!key) { setTestResult({ ok: false, msg: 'No key entered.' }); return; }
    localStorage.setItem('solorev-api-key', key);
    setTesting(true);
    setTestResult(null);
    const result = await testKey(key);
    setTestResult(result);
    setTesting(false);
  };

  const exportData = () => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('solorev-')) {
        data[key] = localStorage.getItem(key);
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `erudite-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        // Support both old format (progress/theme keys) and new format (solorev-* keys)
        if (data.progress && !data['solorev-progress']) {
          localStorage.setItem('solorev-progress', data.progress);
          if (data.theme) localStorage.setItem('solorev-theme', data.theme);
        } else {
          for (const [key, value] of Object.entries(data)) {
            if (key.startsWith('solorev-') && value != null) {
              localStorage.setItem(key, value);
            }
          }
        }
        window.location.reload();
      } catch {
        alert('Invalid backup file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1><SettingsIcon size={28} /> Settings</h1>
      </div>

      <div className="settings-section">
        <h2><Palette size={20} /> Theme</h2>

        <div className="theme-mode-toggle">
          <button className={`theme-mode-btn ${!isDark ? 'theme-mode-btn--active' : ''}`} onClick={() => isDark && toggleMode()}>
            <Sun size={16} /> Light
          </button>
          <button className={`theme-mode-btn ${isDark ? 'theme-mode-btn--active' : ''}`} onClick={() => !isDark && toggleMode()}>
            <Moon size={16} /> Dark
          </button>
        </div>

        <div className="theme-grid">
          {paletteEntries.map(([key, p]) => (
            <button
              key={key}
              className={`theme-option ${baseId === key ? 'theme-option--active' : ''}`}
              onClick={() => selectTheme(key)}
            >
              <div className="theme-option__preview" style={{
                background: `linear-gradient(135deg, ${p.sidebarBg} 0%, ${p.accent} 50%, ${isDark ? '#0d1117' : '#f0f2f5'} 100%)`
              }} />
              <span className="theme-option__icon">{p.icon}</span>
              <span className="theme-option__name">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h2><Key size={20} /> AI Provider & API Key</h2>

        <div className="settings-provider-select">
          {Object.entries(providers).map(([id, p]) => (
            <button
              key={id}
              className={`provider-option ${id === providerId ? 'provider-option--active' : ''}`}
              onClick={() => handleProviderChange(id)}
            >
              <strong>{p.name}</strong>
              <span className="provider-option__hint">{id === 'groq' ? 'Fast inference' : 'Free models, reliable'}</span>
            </button>
          ))}
        </div>

        <p className="settings-description">
          Get a free API key at{' '}
          <a href={providers[providerId].keyUrl} target="_blank" rel="noopener noreferrer">
            {providers[providerId].keyUrl.replace('https://', '')}
          </a>{' '}
          (sign up with email, no payment needed).
        </p>
        <div className="settings-input-group">
          <div className="settings-key-wrapper">
            <input
              type={showKey ? 'text' : 'password'}
              placeholder={`${providers[providerId].keyPrefix}...`}
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
              className="settings-input"
            />
            <button
              type="button"
              className="settings-key-toggle"
              onClick={() => setShowKey(!showKey)}
              title={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button onClick={saveApiKey} className="action-btn action-btn--primary">
            {saved ? '✓ Saved!' : 'Save Key'}
          </button>
          <button onClick={testApiKey} className="action-btn" disabled={testing}>
            {testing ? 'Testing...' : 'Test Key'}
          </button>
        </div>
        {testResult && (
          <p className={`settings-hint ${testResult.ok ? 'settings-hint--success' : 'settings-hint--error'}`}>
            {testResult.msg}
          </p>
        )}
        <p className="settings-hint">Your key is stored locally and never sent to our servers.</p>
      </div>

      <div className="settings-section">
        <h2><Database size={20} /> Data</h2>
        <div className="settings-data-actions">
          <button onClick={exportData} className="action-btn">
            Export Progress
          </button>
          <label className="action-btn">
            Import Progress
            <input type="file" accept=".json" onChange={importData} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h2><Info size={20} /> About</h2>
        <div className="settings-about">
          <p><strong>Erudite</strong> - A-Level Revision App</p>
          <p>Subjects: Computer Science (AQA), Mathematics (AQA), Further Mathematics (AQA), Physics (OCR A)</p>
          <p>Built with React</p>
        </div>
      </div>
    </div>
  );
}

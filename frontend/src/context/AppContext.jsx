/**
 * AppContext – state that several pages share:
 *   - serverStatus / modelInfo: read once from GET /api/model-info, so the
 *     form's limits always match the server's (no hard-coded 10,000)
 *   - current: the analysis being looked at on the Results screens
 *   - settings: default model, whether to keep a history
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { addToHistory, loadSettings, saveSettings } from '../lib/storage.js';

const AppContext = createContext(null);

const FALLBACK_LIMITS = { min_text_chars: 20, max_text_chars: 10000, min_sentence_words: 10, max_sentences: 200 };

const SESSION_KEY = 'aidetect.current.v1';

function readSessionCurrent() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AppProvider({ children }) {
  const [settings, setSettingsState] = useState(loadSettings);
  const [modelInfo, setModelInfo] = useState(null);
  const [serverStatus, setServerStatus] = useState('checking'); // checking | online | offline
  const [current, setCurrentState] = useState(readSessionCurrent);

  const checkServer = useCallback(async () => {
    setServerStatus('checking');
    try {
      const info = await api.modelInfo();
      setModelInfo(info);
      setServerStatus('online');
    } catch {
      setServerStatus('offline');
    }
  }, []);

  useEffect(() => {
    checkServer();
  }, [checkServer]);

  const setSettings = useCallback((patch) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  /** Store a finished analysis as "current" and (if allowed) in History. */
  const setCurrent = useCallback(
    (entry, { save = false } = {}) => {
      setCurrentState(entry);
      try {
        if (entry) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(entry));
        else window.sessionStorage.removeItem(SESSION_KEY);
      } catch {
        // Session storage unavailable: the result still lives in memory.
      }
      if (entry && save && settings.saveHistory) addToHistory(entry);
    },
    [settings.saveHistory],
  );

  const value = useMemo(
    () => ({
      settings,
      setSettings,
      modelInfo,
      limits: modelInfo?.limits || FALLBACK_LIMITS,
      serverStatus,
      checkServer,
      current,
      setCurrent,
    }),
    [settings, setSettings, modelInfo, serverStatus, checkServer, current, setCurrent],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

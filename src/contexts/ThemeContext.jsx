import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { themes, palettes, applyTheme } from '../themes';

const ThemeContext = createContext();

// Validate a theme name — fall back to 'default' if it doesn't exist
function validThemeName(name) {
  return themes[name] ? name : 'default';
}

export function ThemeProvider({ children }) {
  const [themeName, setThemeNameRaw] = useState(() => {
    const saved = localStorage.getItem('solorev-theme') || 'default';
    return validThemeName(saved);
  });

  const isDark = themeName.endsWith('-dark');
  const baseId = isDark ? themeName.replace(/-dark$/, '') : themeName;

  const setThemeName = useCallback((nameOrFn) => {
    if (typeof nameOrFn === 'function') {
      setThemeNameRaw(prev => validThemeName(nameOrFn(prev)));
    } else {
      setThemeNameRaw(validThemeName(nameOrFn));
    }
  }, []);

  const toggleMode = useCallback(() => {
    setThemeNameRaw(prev => {
      const wasDark = prev.endsWith('-dark');
      const base = wasDark ? prev.replace(/-dark$/, '') : prev;
      return wasDark ? base : `${base}-dark`;
    });
  }, []);

  // Apply theme colors to :root whenever themeName changes
  useEffect(() => {
    const theme = themes[themeName];
    if (!theme) return;
    applyTheme(theme);
    localStorage.setItem('solorev-theme', themeName);
  }, [themeName]);

  const value = {
    themeName,
    setThemeName,
    theme: themes[themeName] || themes.default,
    themes,
    isDark,
    baseId,
    toggleMode,
    palettes,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}

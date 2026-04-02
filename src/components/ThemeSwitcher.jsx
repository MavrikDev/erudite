import { useTheme } from '../contexts/ThemeContext';
import { Palette, Sun, Moon } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export default function ThemeSwitcher() {
  const { setThemeName, isDark, baseId, toggleMode, palettes } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectPalette = (id) => {
    setThemeName((prev) => {
      const dark = prev.endsWith('-dark');
      return dark ? `${id}-dark` : id;
    });
    setOpen(false);
  };

  return (
    <div className="theme-switcher" ref={ref}>
      <button className="theme-switcher__btn" onClick={() => setOpen(!open)} title="Change theme">
        <Palette size={18} />
      </button>
      {open && (
        <div className="theme-switcher__dropdown">
          <div className="theme-switcher__title">Color Theme</div>
          <div className="theme-switcher__mode">
            <button className={`theme-switcher__mode-btn ${!isDark ? 'theme-switcher__mode-btn--active' : ''}`} onClick={() => isDark && toggleMode()}>
              <Sun size={14} /> Light
            </button>
            <button className={`theme-switcher__mode-btn ${isDark ? 'theme-switcher__mode-btn--active' : ''}`} onClick={() => !isDark && toggleMode()}>
              <Moon size={14} /> Dark
            </button>
          </div>
          {Object.entries(palettes).map(([id, p]) => (
            <button
              key={id}
              className={`theme-switcher__option ${baseId === id ? 'theme-switcher__option--active' : ''}`}
              onClick={() => selectPalette(id)}
            >
              <span className="theme-switcher__icon">{p.icon}</span>
              <span>{p.name}</span>
              <div
                className="theme-switcher__preview"
                style={{
                  background: `linear-gradient(135deg, ${p.accent} 0%, ${p.sidebarBg} 100%)`
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

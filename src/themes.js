// Each theme has light and dark variants
// The key palette defines accent + sidebar colors; light/dark variants are generated

const palettes = {
  default: { name: 'Default', icon: '💎', accent: '#4361ee', accentHover: '#3651d4', accentRgb: '67, 97, 238', sidebarBg: '#1a1a2e', sidebarHover: '#25253f', sidebarText: '#c8c8e0', sidebarActive: '#4361ee' },
  maroon:  { name: 'Maroon',  icon: '🍷', accent: '#800020', accentHover: '#a00028', accentRgb: '128, 0, 32',   sidebarBg: '#3d000f', sidebarHover: '#55001a', sidebarText: '#e8b0b8', sidebarActive: '#ff4d6d' },
  ocean:   { name: 'Ocean',   icon: '🌊', accent: '#0077b6', accentHover: '#0096c7', accentRgb: '0, 119, 182',  sidebarBg: '#023e8a', sidebarHover: '#0353a4', sidebarText: '#90cdf4', sidebarActive: '#48cae4' },
  forest:  { name: 'Forest',  icon: '🌲', accent: '#2d6a4f', accentHover: '#40916c', accentRgb: '45, 106, 79',  sidebarBg: '#1b4332', sidebarHover: '#245540', sidebarText: '#a8d8b8', sidebarActive: '#52b788' },
  sunset:  { name: 'Sunset',  icon: '🌅', accent: '#e07a5f', accentHover: '#f4845f', accentRgb: '224, 122, 95', sidebarBg: '#5c2018', sidebarHover: '#743020', sidebarText: '#f0c0a8', sidebarActive: '#f4845f' },
};

function lightVariant(p) {
  return {
    '--bg-primary': '#ffffff',
    '--bg-secondary': '#f8f9fa',
    '--bg-tertiary': '#eef0f3',
    '--bg-hover': '#e8eaef',
    '--text-primary': '#1a1a2e',
    '--text-secondary': '#5a5a7a',
    '--text-muted': '#9a9ab0',
    '--accent': p.accent,
    '--accent-hover': p.accentHover,
    '--accent-light': '#eef1ff',
    '--accent-rgb': p.accentRgb,
    '--sidebar-bg': p.sidebarBg,
    '--sidebar-hover': p.sidebarHover,
    '--sidebar-text': p.sidebarText,
    '--sidebar-active': p.sidebarActive,
    '--card-bg': '#ffffff',
    '--card-border': '#e4e7ec',
    '--card-shadow': 'rgba(0,0,0,0.06)',
    '--header-bg': '#ffffff',
    '--header-border': '#e4e7ec',
    '--input-bg': '#f5f6f8',
    '--input-border': '#d1d5db',
    '--success': '#10b981',
    '--success-light': '#d1fae5',
    '--warning': '#f59e0b',
    '--warning-light': '#fef3c7',
    '--danger': '#ef4444',
    '--danger-light': '#fee2e2',
    '--info': '#3b82f6',
    '--info-light': '#dbeafe',
    '--canvas-bg': '#ffffff',
    '--scrollbar-thumb': '#c1c1d0',
    '--scrollbar-track': '#f5f5f5',
  };
}

function darkVariant(p) {
  return {
    '--bg-primary': '#0d1117',
    '--bg-secondary': '#161b22',
    '--bg-tertiary': '#21262d',
    '--bg-hover': '#292e36',
    '--text-primary': '#e6edf3',
    '--text-secondary': '#8b949e',
    '--text-muted': '#6e7681',
    '--accent': p.accent,
    '--accent-hover': p.accentHover,
    '--accent-light': '#1c2d41',
    '--accent-rgb': p.accentRgb,
    '--sidebar-bg': '#010409',
    '--sidebar-hover': '#161b22',
    '--sidebar-text': '#8b949e',
    '--sidebar-active': p.sidebarActive,
    '--card-bg': '#161b22',
    '--card-border': '#30363d',
    '--card-shadow': 'rgba(0,0,0,0.3)',
    '--header-bg': '#161b22',
    '--header-border': '#30363d',
    '--input-bg': '#0d1117',
    '--input-border': '#30363d',
    '--success': '#3fb950',
    '--success-light': '#0d2818',
    '--warning': '#d29922',
    '--warning-light': '#2d2006',
    '--danger': '#f85149',
    '--danger-light': '#3d0c0c',
    '--info': '#58a6ff',
    '--info-light': '#0c2135',
    '--canvas-bg': '#1a1f27',
    '--scrollbar-thumb': '#484f58',
    '--scrollbar-track': '#0d1117',
  };
}

// Build all themes: each palette gets a light and dark key
const themes = {};
for (const [id, p] of Object.entries(palettes)) {
  themes[id] = { name: p.name, icon: p.icon, colors: lightVariant(p), mode: 'light' };
  themes[`${id}-dark`] = { name: p.name, icon: p.icon, colors: darkVariant(p), mode: 'dark' };
}

// Apply theme by injecting a <style> tag with high-specificity rules AND
// setting inline CSS vars on <html>.  The style tag includes explicit
// html/body background + color-scheme to override browser-level dark mode.
function applyTheme(theme) {
  if (!theme || !theme.colors) return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme.mode);

  const entries = Object.entries(theme.colors);
  const vars = entries.map(([k, v]) => `${k}:${v}`).join(';');

  // 1. Style tag — vars on :root, plus explicit html/body backgrounds
  //    color-scheme tells the browser not to apply its own dark mode
  let el = document.getElementById('erudite-theme');
  if (!el) {
    el = document.createElement('style');
    el.id = 'erudite-theme';
  }
  el.textContent =
    `:root{${vars};color-scheme:${theme.mode}}` +
    `html,body{background:${theme.colors['--bg-primary']}!important;` +
    `color:${theme.colors['--text-primary']}!important}`;
  // Always move to end of <head> so it wins over any other stylesheets
  document.head.appendChild(el);

  // 2. Inline vars on <html> — highest specificity backup
  for (const [k, v] of entries) {
    root.style.setProperty(k, v);
  }
}

// Force dark mode on every page load
function forceDark(name) {
  if (!name) return 'default-dark';
  return name.endsWith('-dark') ? name : `${name}-dark`;
}

{
  const _saved = forceDark(localStorage.getItem('solorev-theme'));
  const _initial = themes[_saved] || themes['default-dark'];
  localStorage.setItem('solorev-theme', _saved);
  applyTheme(_initial);
  // Re-apply after all stylesheets are injected (handles Vite CSS timing)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyTheme(_initial), { once: true });
  }
  window.addEventListener('load', () => applyTheme(themes[localStorage.getItem('solorev-theme')] || themes['default-dark']), { once: true });
}

export { themes, palettes, applyTheme };

import { NavLink, useLocation } from 'react-router-dom';
import { Home, BookOpen, FileText, CreditCard, Brain, BarChart3, AlertTriangle, Settings, ChevronLeft, ChevronRight, Calendar, Flame } from 'lucide-react';
import { subjects } from '../data/subjects';
import { useState, useEffect } from 'react';

export default function Sidebar({ onMotivate, onEditMotivation }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('solorev-sidebar-collapsed') === 'true');
  const location = useLocation();

  useEffect(() => {
    localStorage.setItem('solorev-sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  const mainLinks = [
    { to: '/', icon: <Home size={20} />, label: 'Dashboard' },
    { to: '/progress', icon: <BarChart3 size={20} />, label: 'Progress' },
    { to: '/improvements', icon: <AlertTriangle size={20} />, label: 'Improvements' },
    { to: '/calendar', icon: <Calendar size={20} />, label: 'Timetable' },
    { to: '/settings', icon: <Settings size={20} />, label: 'Settings' },
  ];

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <div className="sidebar__header">
        {!collapsed && (
          <div className="sidebar__brand">
            <span className="sidebar__title">ERUDITE</span>
          </div>
        )}
        <button className="sidebar__toggle" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="sidebar__nav">
        <div className="sidebar__section">
          {!collapsed && <span className="sidebar__section-title">GENERAL</span>}
          {mainLinks.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
              title={collapsed ? link.label : undefined}
            >
              {link.icon}
              {!collapsed && <span>{link.label}</span>}
            </NavLink>
          ))}
        </div>

        <div className="sidebar__section">
          {!collapsed && <span className="sidebar__section-title">SUBJECTS</span>}
          {subjects.map(subject => {
            const isActive = location.pathname.startsWith(`/subject/${subject.id}`);
            return (
              <div key={subject.id}>
                <NavLink
                  to={`/subject/${subject.id}`}
                  className={`sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                  title={collapsed ? subject.name : undefined}
                >
                  <span className="sidebar__subject-icon">{subject.icon}</span>
                  {!collapsed && (
                    <span className="sidebar__subject-name">
                      {subject.name}
                      <small className="sidebar__exam-board">{subject.examBoard}</small>
                    </span>
                  )}
                </NavLink>
                {isActive && !collapsed && (
                  <div className="sidebar__sublinks">
                    <NavLink to={`/subject/${subject.id}/flashcards`} className="sidebar__sublink">
                      <CreditCard size={14} /> Flash Cards
                    </NavLink>
                    <NavLink to={`/subject/${subject.id}/questions`} className="sidebar__sublink">
                      <Brain size={14} /> Questions
                    </NavLink>
                    <NavLink to={`/subject/${subject.id}/papers`} className="sidebar__sublink">
                      <FileText size={14} /> Past Papers
                    </NavLink>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>
      <button className="sidebar__motivate" onClick={onMotivate} title="Get motivated">
        <Flame size={20} />
        {!collapsed && <span>Get Motivated</span>}
      </button>
      {!collapsed && (
        <button className="sidebar__motivate-edit" onClick={onEditMotivation} title="Edit motivation info">
          Edit my info
        </button>
      )}
      {!collapsed && <div className="sidebar__version">v1.0</div>}
    </aside>
  );
}

import { Routes, Route, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Timer from './components/Timer';
import ThemeSwitcher from './components/ThemeSwitcher';
import AISidebar from './components/AISidebar';
import DrawingCanvas from './components/DrawingCanvas';
import Dashboard from './pages/Dashboard';
import SubjectPage from './pages/SubjectPage';
import FlashCardsPage from './pages/FlashCardsPage';
import PracticeQuestionsPage from './pages/PracticeQuestionsPage';
import PastPapersPage from './pages/PastPapersPage';
import ProgressPage from './pages/ProgressPage';
import ImprovementsPage from './pages/ImprovementsPage';
import CalendarPage from './pages/CalendarPage';
import SettingsPage from './pages/SettingsPage';
import { useTimer } from './contexts/TimerContext';
import MissedSessionNotice from './components/MissedSessionNotice';
import { PenTool } from 'lucide-react';

export default function App() {
  const [showDrawing, setShowDrawing] = useState(false);
  const { elapsed } = useTimer();
  const navigate = useNavigate();
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;
  const motivateRef = useRef(null);

  const handleMotivate = useCallback(() => {
    motivateRef.current?.trigger();
  }, []);

  const handleEditMotivation = useCallback(() => {
    motivateRef.current?.editProfile();
  }, []);

  // Prompt user to log a session when closing the page (if timer has significant time)
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (elapsedRef.current >= 60) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // When a timetable session ends, navigate to calendar page so the log modal shows
  useEffect(() => {
    const handler = () => {
      // Navigate to calendar page so the session-ended event handler in CalendarPage triggers
      if (window.location.pathname !== '/calendar') {
        navigate('/calendar');
      }
    };
    window.addEventListener('solorev-session-ended', handler);
    return () => window.removeEventListener('solorev-session-ended', handler);
  }, [navigate]);

  return (
    <div className="app">
      <Sidebar onMotivate={handleMotivate} onEditMotivation={handleEditMotivation} />
      <div className="app__main">
        <header className="app__header">
          <div className="app__header-left">
          </div>
          <div className="app__header-right">
            <Timer />
            <button
              className={`drawing-toggle ${showDrawing ? 'drawing-toggle--active' : ''}`}
              onClick={() => setShowDrawing(!showDrawing)}
              title="Drawing mode"
            >
              <PenTool size={18} />
            </button>
            <ThemeSwitcher />
          </div>
        </header>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/subject/:subjectId" element={<SubjectPage />} />
            <Route path="/subject/:subjectId/flashcards" element={<FlashCardsPage />} />
            <Route path="/subject/:subjectId/questions" element={<PracticeQuestionsPage />} />
            <Route path="/subject/:subjectId/papers" element={<PastPapersPage />} />
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/improvements" element={<ImprovementsPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>

      <AISidebar />
      {showDrawing && <DrawingCanvas onClose={() => setShowDrawing(false)} />}
      <MissedSessionNotice ref={motivateRef} />
    </div>
  );
}

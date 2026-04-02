import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useProgress } from './ProgressContext';

const TimerContext = createContext();

const IDLE_TIMEOUT = 3 * 60 * 1000; // 3 minutes of inactivity
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

export function TimerProvider({ children }) {
  const [isRunning, setIsRunning] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [elapsed, setElapsed] = useState(() => {
    // Restore elapsed from localStorage so it persists across sessions
    try { return Number(localStorage.getItem('solorev-timer-elapsed')) || 0; } catch { return 0; }
  });
  const [currentSubject, setCurrentSubject] = useState(null);
  const [currentLevel, setCurrentLevel] = useState(null);
  const intervalRef = useRef(null);
  const lastSaveRef = useRef(0);
  const idleTimerRef = useRef(null);
  const hasStartedRef = useRef(false);
  const { addStudyTime } = useProgress();

  const saveTime = useCallback(() => {
    const toSave = elapsed - lastSaveRef.current;
    if (toSave > 0) {
      addStudyTime(currentSubject, currentLevel, toSave);
      lastSaveRef.current = elapsed;
    }
  }, [elapsed, currentSubject, currentLevel, addStudyTime]);

  // Persist elapsed to localStorage
  useEffect(() => {
    localStorage.setItem('solorev-timer-elapsed', String(elapsed));
  }, [elapsed]);

  useEffect(() => {
    if (isRunning && !isIdle) {
      intervalRef.current = setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, isIdle]);

  // Save time every 60 seconds
  useEffect(() => {
    if (isRunning && !isIdle && elapsed > 0 && elapsed % 60 === 0) {
      saveTime();
    }
  }, [elapsed, isRunning, isIdle, saveTime]);

  // Idle detection: auto-start on first activity, auto-pause after inactivity
  useEffect(() => {
    const resetIdleTimer = () => {
      // If idle, resume
      if (isIdle) {
        setIsIdle(false);
      }
      // Auto-start timer on first activity
      if (!hasStartedRef.current) {
        hasStartedRef.current = true;
        setIsRunning(true);
      }
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        if (isRunning) {
          setIsIdle(true);
        }
      }, IDLE_TIMEOUT);
    };

    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, resetIdleTimer, { passive: true }));
    // Start the idle countdown immediately
    resetIdleTimer();

    return () => {
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, resetIdleTimer));
      clearTimeout(idleTimerRef.current);
    };
  }, [isRunning, isIdle]);

  const startTimer = (subjectId = null, level = null) => {
    setCurrentSubject(subjectId);
    setCurrentLevel(level);
    setIsRunning(true);
    setIsIdle(false);
    hasStartedRef.current = true;
  };

  const pauseTimer = () => {
    setIsRunning(false);
    setIsIdle(false);
    saveTime();
  };

  const resetTimer = () => {
    saveTime();
    setIsRunning(false);
    setIsIdle(false);
    setElapsed(0);
    lastSaveRef.current = 0;
    setCurrentSubject(null);
    setCurrentLevel(null);
    localStorage.removeItem('solorev-timer-elapsed');
  };

  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const value = {
    isRunning,
    isIdle,
    elapsed,
    currentSubject,
    currentLevel,
    startTimer,
    pauseTimer,
    resetTimer,
    formatTime,
  };

  return (
    <TimerContext.Provider value={value}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const context = useContext(TimerContext);
  if (!context) throw new Error('useTimer must be used within TimerProvider');
  return context;
}

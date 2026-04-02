import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { subjects } from '../data/subjects';
import { useProgress } from '../contexts/ProgressContext';
import { Calendar, ChevronLeft, ChevronRight, Clock, X, Sparkles, Trash2, Bell, BellOff, Loader, Pencil, CheckSquare, Square, FileText, Star } from 'lucide-react';
import { aiChat, getApiKey } from '../utils/ai';

const STORAGE_KEY = 'solorev-timetable';
const SESSION_LOG_KEY = 'solorev-session-logs';
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 7am–10pm
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Schedule notification timers
function scheduleNotifications(slots, notificationsEnabled) {
  if (window._solorevTimers) {
    window._solorevTimers.forEach(id => clearTimeout(id));
  }
  window._solorevTimers = [];

  if (!notificationsEnabled || Notification.permission !== 'granted') return;

  const now = Date.now();
  const today = dateKey(new Date());

  slots.filter(s => s.date === today).forEach(slot => {
    const startDate = new Date(slot.date);
    startDate.setHours(slot.hour, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setHours(slot.hour + slot.duration, 0, 0, 0);

    const startMs = startDate.getTime() - now;
    const endMs = endDate.getTime() - now;

    // Break notifications if slot has breaks enabled
    if (slot.breaks !== false) {
      for (let h = 0; h < slot.duration; h++) {
        const breakMs = startDate.getTime() + (h * 60 + 25) * 60 * 1000 - now;
        if (breakMs > 0 && breakMs < endMs) {
          const id = setTimeout(() => {
            new Notification('⏸️ Time for a break!', {
              body: `You've been studying ${slot.topic || slot.subjectName} for 25 min. Take a 5 min break.`,
              icon: '/favicon.ico',
              tag: `break-${slot.id}-${h}`,
            });
          }, breakMs);
          window._solorevTimers.push(id);
        }
      }
    }

    // Start notification
    if (startMs > 0) {
      const id = setTimeout(() => {
        new Notification(`📖 Time to revise: ${slot.topic || slot.subjectName}`, {
          body: `${slot.subjectIcon} ${slot.subjectName} — ${slot.type} session for ${slot.duration}h`,
          icon: '/favicon.ico',
          tag: `start-${slot.id}`,
        });
      }, startMs);
      window._solorevTimers.push(id);
    }

    // End / stop notification
    if (endMs > 0) {
      const id = setTimeout(() => {
        new Notification(`🛑 Session complete: ${slot.topic || slot.subjectName}`, {
          body: `Time to stop! Log what you covered in the timetable page.`,
          icon: '/favicon.ico',
          tag: `end-${slot.id}`,
        });
        // Set a flag so the page can show the log prompt
        window._solorevSessionEnded = slot;
        window.dispatchEvent(new Event('solorev-session-ended'));
      }, endMs);
      window._solorevTimers.push(id);
    }
  });
}

export default function CalendarPage() {
  const { progress } = useProgress();
  const [weekOffset, setWeekOffset] = useState(() => {
    try { return parseInt(localStorage.getItem('solorev-cal-week-offset')) || 0; } catch { return 0; }
  });
  const [showAIModal, setShowAIModal] = useState(false);
  const [showEditAIModal, setShowEditAIModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiEditPrompt, setAiEditPrompt] = useState('');
  const [editWeeks, setEditWeeks] = useState(1);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [editSlot, setEditSlot] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => localStorage.getItem('solorev-timetable-notif') === 'true');

  // Generation options
  const [genWeeks, setGenWeeks] = useState(1);
  const [genBreaks, setGenBreaks] = useState(true);

  useEffect(() => {
    localStorage.setItem('solorev-cal-week-offset', String(weekOffset));
  }, [weekOffset]);
  const [genUseWeakTopics, setGenUseWeakTopics] = useState(true);

  // Session logging
  const [showLogModal, setShowLogModal] = useState(false);
  const [logSubject, setLogSubject] = useState(subjects[0]?.id || '');
  const [logType, setLogType] = useState('revision');
  const [logTopics, setLogTopics] = useState([]);
  const [logPaper, setLogPaper] = useState('');
  const [logDate, setLogDate] = useState(dateKey(new Date()));
  const [logStartTime, setLogStartTime] = useState(9);
  const [logDuration, setLogDuration] = useState(1);
  const [logRating, setLogRating] = useState(3);
  const [logNotes, setLogNotes] = useState('');
  const [sessionLogs, setSessionLogs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SESSION_LOG_KEY) || '[]'); } catch { return []; }
  });

  // Edit form state
  const [formSubject, setFormSubject] = useState(subjects[0]?.id || '');
  const [formTopic, setFormTopic] = useState('');
  const [formType, setFormType] = useState('revision');
  const [formHour, setFormHour] = useState(9);
  const [formDuration, setFormDuration] = useState(1);
  const [formNotes, setFormNotes] = useState('');

  // Load / save timetable from localStorage
  const [slots, setSlots] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  });

  const saveSlots = useCallback((newSlots) => {
    setSlots(newSlots);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSlots));
  }, []);

  const saveLogs = useCallback((newLogs) => {
    setSessionLogs(newLogs);
    localStorage.setItem(SESSION_LOG_KEY, JSON.stringify(newLogs));
  }, []);

  const weekStart = useMemo(() => {
    const today = new Date();
    const ws = getWeekStart(today);
    return addDays(ws, weekOffset * 7);
  }, [weekOffset]);

  const weekDates = useMemo(() => DAY_NAMES.map((_, i) => addDays(weekStart, i)), [weekStart]);

  const weekLabel = useMemo(() => {
    const start = weekDates[0];
    const end = weekDates[6];
    const opts = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString(undefined, opts)} — ${end.toLocaleDateString(undefined, opts)}, ${end.getFullYear()}`;
  }, [weekDates]);

  // Slots for this week
  const weekSlots = useMemo(() => {
    const keys = new Set(weekDates.map(d => dateKey(d)));
    return slots.filter(s => keys.has(s.date));
  }, [slots, weekDates]);

  // Get weak topics from progress data
  const weakTopics = useMemo(() => {
    const topicStats = {};
    // From question sessions
    (progress.questionSessions || []).forEach(s => {
      (s.questions || []).forEach(q => {
        const key = `${s.subjectId}::${q.topic || 'Unknown'}`;
        if (!topicStats[key]) topicStats[key] = { subjectId: s.subjectId, topic: q.topic || 'Unknown', total: 0, correct: 0 };
        topicStats[key].total++;
        if (q.correct) topicStats[key].correct++;
      });
    });
    // From struggled questions
    (progress.struggledQuestions || []).forEach(sq => {
      const key = `${sq.subjectId}::${sq.topic || 'Unknown'}`;
      if (!topicStats[key]) topicStats[key] = { subjectId: sq.subjectId, topic: sq.topic || 'Unknown', total: 0, correct: 0 };
      topicStats[key].total += 2; // Weight struggled questions more
    });
    return Object.values(topicStats)
      .map(t => ({ ...t, accuracy: t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0 }))
      .filter(t => t.total >= 1)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 10);
  }, [progress]);

  // Reschedule notifications when slots or notifications setting changes
  useEffect(() => {
    scheduleNotifications(slots, notificationsEnabled);
    return () => {
      if (window._solorevTimers) {
        window._solorevTimers.forEach(id => clearTimeout(id));
      }
    };
  }, [slots, notificationsEnabled]);

  // Topics for the selected log subject
  const logSubjectObj = subjects.find(s => s.id === logSubject);
  const logAvailableTopics = logSubjectObj
    ? [...new Set([...(logSubjectObj.levels.as?.topics || []), ...(logSubjectObj.levels.a2?.topics || [])])]
    : [];

  // Past papers for the selected log subject (from localStorage)
  const logAvailablePapers = useMemo(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(`solorev-user-papers-${logSubject}`) || '{}');
      const all = [...(stored.as || []), ...(stored.a2 || [])];
      return all.sort((a, b) => (b.year || 0) - (a.year || 0));
    } catch { return []; }
  }, [logSubject]);

  // Auto-fill duration when a paper is selected (from completion time logs)
  useEffect(() => {
    if (logType === 'paper' && logPaper) {
      const timeLog = progress.paperTimeLogs?.[logPaper];
      if (timeLog?.elapsed) {
        // Round to nearest 0.5h
        const hours = Math.max(0.5, Math.round((timeLog.elapsed / 3600) * 2) / 2);
        setLogDuration(Math.min(hours, 4));
      }
    }
  }, [logPaper, logType, progress.paperTimeLogs]);

  const openLogModal = (slot) => {
    if (slot) {
      setLogSubject(slot.subjectId || subjects[0]?.id);
      setLogType(slot.type || 'revision');
      setLogTopics(slot.topic ? [slot.topic] : []);
      setLogDate(slot.date || dateKey(new Date()));
      setLogStartTime(slot.hour || 9);
      setLogDuration(slot.duration || 1);
    } else {
      setLogSubject(subjects[0]?.id || '');
      setLogType('revision');
      setLogTopics([]);
      setLogDate(dateKey(new Date()));
      setLogStartTime(9);
      setLogDuration(1);
    }
    setLogPaper('');
    setLogRating(3);
    setLogNotes('');
    setShowLogModal(true);
  };

  // Listen for session-ended events
  useEffect(() => {
    const handler = () => {
      const slot = window._solorevSessionEnded;
      if (slot) {
        openLogModal(slot);
        window._solorevSessionEnded = null;
      }
    };
    window.addEventListener('solorev-session-ended', handler);
    return () => window.removeEventListener('solorev-session-ended', handler);
  }, []);

  const toggleNotifications = async () => {
    if (!notificationsEnabled) {
      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') return;
      } else if (Notification.permission === 'denied') {
        alert('Notifications are blocked. Please enable them in your browser settings.');
        return;
      }
      setNotificationsEnabled(true);
      localStorage.setItem('solorev-timetable-notif', 'true');
    } else {
      setNotificationsEnabled(false);
      localStorage.setItem('solorev-timetable-notif', 'false');
    }
  };

  const isSlotStart = (dayIdx, hour) => {
    const dk = dateKey(weekDates[dayIdx]);
    return weekSlots.find(s => s.date === dk && s.hour === hour);
  };

  const getSlotAt = (dayIdx, hour) => {
    const dk = dateKey(weekDates[dayIdx]);
    return weekSlots.filter(s => s.date === dk && hour >= s.hour && hour < s.hour + s.duration);
  };

  const openEditModal = (slot) => {
    setEditSlot(slot);
    setFormSubject(slot.subjectId);
    setFormTopic(slot.topic || '');
    setFormType(slot.type || 'revision');
    setFormHour(slot.hour);
    setFormDuration(slot.duration);
    setFormNotes(slot.notes || '');
    setShowEditModal(true);
  };

  const saveEditSlot = () => {
    const sub = subjects.find(s => s.id === formSubject);
    const updated = {
      ...editSlot,
      hour: formHour,
      duration: formDuration,
      subjectId: formSubject,
      subjectName: sub?.name || formSubject,
      subjectIcon: sub?.icon || '📚',
      subjectColor: sub?.color || '#888',
      topic: formTopic,
      type: formType,
      notes: formNotes,
    };
    saveSlots(slots.map(s => s.id === editSlot.id ? updated : s));
    setShowEditModal(false);
  };

  const deleteSlot = (id) => {
    saveSlots(slots.filter(s => s.id !== id));
    setShowEditModal(false);
  };

  const clearWeek = () => {
    if (!confirm('Clear all sessions for this week?')) return;
    const keys = new Set(weekDates.map(d => dateKey(d)));
    saveSlots(slots.filter(s => !keys.has(s.date)));
  };

  const selectedSubject = subjects.find(s => s.id === formSubject);
  const allTopics = selectedSubject
    ? [...new Set([...(selectedSubject.levels.as?.topics || []), ...(selectedSubject.levels.a2?.topics || [])])]
    : [];

  // Build the weak topics string for AI prompts
  const weakTopicsStr = useMemo(() => {
    if (weakTopics.length === 0) return '';
    return '\n\nSTUDENT WEAK AREAS (prioritize these topics):\n' +
      weakTopics.map(t => {
        const sub = subjects.find(s => s.id === t.subjectId);
        return `- ${sub?.name || t.subjectId}: ${t.topic} (${t.accuracy}% accuracy)`;
      }).join('\n');
  }, [weakTopics]);

  // Build dates string for multi-week generation
  const getGenDatesStr = () => {
    const allDates = [];
    for (let w = 0; w < genWeeks; w++) {
      const ws = addDays(weekStart, w * 7);
      for (let d = 0; d < 7; d++) {
        const dt = addDays(ws, d);
        allDates.push(`${DAY_NAMES[d]} ${dateKey(dt)}`);
      }
    }
    return allDates.join('\n');
  };

  // Extract JSON array from AI response (handles markdown fences, extra text, etc.)
  const extractJsonArray = (text) => {
    console.log('[Erudite] Raw AI response:', text);
    // Strip markdown code fences
    let cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
    // Try direct parse first
    try {
      const direct = JSON.parse(cleaned);
      if (Array.isArray(direct)) return direct;
      // AI might return { sessions: [...] } or { timetable: [...] }
      if (direct && typeof direct === 'object') {
        const arrVal = Object.values(direct).find(v => Array.isArray(v));
        if (arrVal) return arrVal;
      }
    } catch {}
    // Find the outermost [...] block using balanced bracket matching
    let depth = 0, start = -1;
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '[') { if (depth === 0) start = i; depth++; }
      else if (cleaned[i] === ']') { depth--; if (depth === 0 && start !== -1) {
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { start = -1; }
      }}
    }
    // If response was truncated (no closing ]), try to recover partial JSON
    if (start !== -1 && depth > 0) {
      let partial = cleaned.slice(start);
      // Find the last complete object (ending with })
      const lastBrace = partial.lastIndexOf('}');
      if (lastBrace > 0) {
        partial = partial.slice(0, lastBrace + 1) + ']';
        try { return JSON.parse(partial); } catch {}
        // Try removing trailing comma before ]
        partial = partial.slice(0, lastBrace + 1).replace(/,\s*$/, '') + ']';
        try { return JSON.parse(partial); } catch {}
      }
    }
    return null;
  };

  // AI generation
  const generateTimetable = async () => {
    if (!getApiKey()) {
      alert('Please set your API key in Settings first.');
      return;
    }
    if (!aiPrompt.trim()) return;

    setAiGenerating(true);
    try {
      const datesStr = getGenDatesStr();
      const subjectsList = subjects.map(s => `${s.id}: ${s.name} (${s.examBoard}) — topics: ${[...new Set([...(s.levels.as?.topics || []), ...(s.levels.a2?.topics || [])])].join(', ')}`).join('\n');

      const content = await aiChat({
        messages: [{
          role: 'system',
          content: `You are a revision timetable planner for A-Level students. Generate a revision timetable based on the student's description. Return ONLY a valid JSON array of session objects.

Each session object must have:
- "date": ISO date string (YYYY-MM-DD) from the provided dates
- "hour": start hour (integer 7-21)
- "duration": hours (integer 1-3)
- "subjectId": one of the provided subject IDs
- "topic": specific topic from the subject's topic list
- "type": one of "revision", "flashcards", "questions", "paper", "notes"
- "notes": brief description of what to focus on
${genBreaks ? '- "breaks": true (all sessions include 25-min Pomodoro breaks)' : '- "breaks": false (no breaks during sessions)'}

Available dates:
${datesStr}

Available subjects and topics:
${subjectsList}
${genUseWeakTopics ? weakTopicsStr : ''}

Rules:
- Sessions must not overlap
${genBreaks ? '- Include 30-60min breaks between sessions' : '- Sessions can be back-to-back'}
- Balance subjects based on the student's description
- Keep sessions between 1-3 hours
- Schedule reasonable times (not too early or late)
- Include variety in session types
- Use short field values to keep response compact
- Return ONLY the JSON array, nothing else`
        }, {
          role: 'user',
          content: aiPrompt
        }],
        maxTokens: 8000,
        temperature: 0.7
      });

      const parsed = extractJsonArray(content);
      if (!parsed) throw new Error('AI did not return a valid timetable. Try rephrasing your request.');
      // Build set of all valid dates for the generation period
      const validDates = new Set();
      for (let w = 0; w < genWeeks; w++) {
        const ws = addDays(weekStart, w * 7);
        for (let d = 0; d < 7; d++) validDates.add(dateKey(addDays(ws, d)));
      }

      const newSlots = parsed
        .filter(s => validDates.has(s.date) && s.hour >= 7 && s.hour <= 21 && s.duration >= 1 && s.duration <= 4)
        .map(s => {
          const sub = subjects.find(sub => sub.id === s.subjectId) || subjects[0];
          return {
            id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            date: s.date,
            hour: s.hour,
            duration: s.duration,
            subjectId: sub.id,
            subjectName: sub.name,
            subjectIcon: sub.icon,
            subjectColor: sub.color,
            topic: s.topic || '',
            type: s.type || 'revision',
            notes: s.notes || '',
            breaks: genBreaks,
          };
        });

      // Remove existing slots for the generation period and add new ones
      const kept = slots.filter(s => !validDates.has(s.date));
      saveSlots([...kept, ...newSlots]);
      setShowAIModal(false);
      setAiPrompt('');
    } catch (err) {
      alert('Failed to generate timetable: ' + err.message);
    } finally {
      setAiGenerating(false);
    }
  };

  // AI edit existing timetable
  const editTimetableWithAI = async () => {
    if (!getApiKey()) {
      alert('Please set your API key in Settings first.');
      return;
    }
    if (!aiEditPrompt.trim()) return;

    setAiGenerating(true);
    try {
      // Build date range for editWeeks
      const editValidDates = new Set();
      const editDatesArr = [];
      for (let w = 0; w < editWeeks; w++) {
        const ws = addDays(weekStart, w * 7);
        for (let d = 0; d < 7; d++) {
          const dt = addDays(ws, d);
          const dk = dateKey(dt);
          editValidDates.add(dk);
          editDatesArr.push(`${DAY_NAMES[d]} ${dk}`);
        }
      }

      // Gather all existing slots in the edit range
      const editRangeSlots = slots.filter(s => editValidDates.has(s.date));
      const currentSlotsJSON = JSON.stringify(editRangeSlots.map(s => ({
        id: s.id, date: s.date, hour: s.hour, duration: s.duration,
        subjectId: s.subjectId, topic: s.topic, type: s.type, notes: s.notes,
      })));
      const subjectsList = subjects.map(s => `${s.id}: ${s.name} — topics: ${[...new Set([...(s.levels.as?.topics || []), ...(s.levels.a2?.topics || [])])].join(', ')}`).join('\n');

      const content = await aiChat({
        messages: [{
          role: 'system',
          content: `You are modifying an existing revision timetable. The student wants changes. Return ONLY a valid JSON array of the COMPLETE updated timetable (all sessions, modified and unmodified).

Each session object must have: date, hour, duration, subjectId, topic, type, notes.

Current timetable:
${currentSlotsJSON}

Available dates:
${editDatesArr.join('\n')}

Available subjects and topics:
${subjectsList}

Rules:
- Keep sessions that the student doesn't mention changing
- Apply the requested modifications
- Return the FULL updated array, not just changes
- Use short field values to keep response compact
- Return ONLY the JSON array`
        }, {
          role: 'user',
          content: aiEditPrompt
        }],
        maxTokens: 8000,
        temperature: 0.5
      });

      const parsed = extractJsonArray(content);
      if (!parsed) throw new Error('AI did not return a valid timetable. Try rephrasing your request.');
      const newSlots = parsed
        .filter(s => editValidDates.has(s.date) && s.hour >= 7 && s.hour <= 21 && s.duration >= 1 && s.duration <= 4)
        .map(s => {
          const sub = subjects.find(sub => sub.id === s.subjectId) || subjects[0];
          return {
            id: s.id || `slot-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            date: s.date,
            hour: s.hour,
            duration: s.duration,
            subjectId: sub.id,
            subjectName: sub.name,
            subjectIcon: sub.icon,
            subjectColor: sub.color,
            topic: s.topic || '',
            type: s.type || 'revision',
            notes: s.notes || '',
            breaks: genBreaks,
          };
        });

      const kept = slots.filter(s => !editValidDates.has(s.date));
      saveSlots([...kept, ...newSlots]);
      setShowEditAIModal(false);
      setAiEditPrompt('');
    } catch (err) {
      alert('Failed to edit timetable: ' + err.message);
    } finally {
      setAiGenerating(false);
    }
  };

  // Save session log (form-based)
  const saveSessionLog = () => {
    const sub = subjects.find(s => s.id === logSubject) || subjects[0];
    // Resolve paper ID to display name
    let paperName = '';
    if (logPaper) {
      const p = logAvailablePapers.find(pp => pp.id === logPaper);
      paperName = p ? (p.title || `${p.month || ''} ${p.year || ''}${p.paperNumber ? ` P${p.paperNumber}` : ''}`) : logPaper;
    }
    const log = {
      id: `log-${Date.now()}`,
      date: logDate,
      subjectId: sub.id,
      subjectName: sub.name,
      subjectIcon: sub.icon,
      subjectColor: sub.color,
      topics: logTopics,
      type: logType,
      paper: logPaper,
      paperName,
      startTime: logStartTime,
      duration: logDuration,
      rating: logRating,
      notes: logNotes.trim(),
      timestamp: Date.now(),
    };
    saveLogs([log, ...sessionLogs]);
    setShowLogModal(false);
  };

  // Week stats
  const weekTotalHours = weekSlots.reduce((sum, s) => sum + s.duration, 0);
  const weekBySubject = {};
  weekSlots.forEach(s => {
    weekBySubject[s.subjectId] = (weekBySubject[s.subjectId] || 0) + s.duration;
  });

  // Today's sessions
  const todayKey = dateKey(new Date());
  const todaySessions = slots.filter(s => s.date === todayKey).sort((a, b) => a.hour - b.hour);
  const currentHour = new Date().getHours();

  // Session logs for display (30 most recent)
  const recentLogs = sessionLogs.slice(0, 30);

  // Build grid data for log history
  const logDates = useMemo(() => {
    const dates = new Set(sessionLogs.map(l => l.date));
    return [...dates].sort().reverse().slice(0, 60);
  }, [sessionLogs]);

  return (
    <div className="calendar-page">
      <div className="page-header">
        <h1><Calendar size={28} /> Revision Timetable</h1>
        <p className="page-header__subtitle">Plan your revision schedule and track your sessions.</p>
      </div>

      {/* Today's plan */}
      {todaySessions.length > 0 && (
        <div className="cal-today">
          <h2 className="cal-today__title">📅 Today's Plan</h2>
          <div className="cal-today__sessions">
            {todaySessions.map(s => {
              const isPast = currentHour >= s.hour + s.duration;
              const isCurrent = currentHour >= s.hour && currentHour < s.hour + s.duration;
              const isLogged = sessionLogs.some(l => l.slotId === s.id);
              return (
                <div key={s.id} className={`cal-today__item ${isPast ? 'cal-today__item--past' : ''} ${isCurrent ? 'cal-today__item--active' : ''}`} style={{ '--slot-color': s.subjectColor }}>
                  <span className="cal-today__time">{s.hour}:00 – {s.hour + s.duration}:00</span>
                  <span className="cal-today__subject">{s.subjectIcon} {s.topic || s.subjectName}</span>
                  <span className="cal-today__type">{s.type}{s.breaks !== false ? ' ☕' : ''}</span>
                  {s.notes && <span className="cal-today__notes">{s.notes}</span>}
                  {isPast && !isLogged && (
                    <button className="cal-today__log-btn" onClick={() => openLogModal(s)}>
                      📝 Log Session
                    </button>
                  )}
                  {isLogged && <span className="cal-today__logged">✓ Logged</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weak topics hint */}
      {weakTopics.length > 0 && (
        <div className="cal-weak-topics">
          <h3 className="cal-weak-topics__title">📊 Your Weakest Topics</h3>
          <div className="cal-weak-topics__list">
            {weakTopics.slice(0, 5).map((t, i) => {
              const sub = subjects.find(s => s.id === t.subjectId);
              return (
                <span key={i} className="cal-weak-topics__item" style={{ '--sub-color': sub?.color }}>
                  {sub?.icon} {t.topic} <small>({t.accuracy}%)</small>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions bar */}
      <div className="cal-actions">
        <button className="action-btn action-btn--accent" onClick={() => setShowAIModal(true)}>
          <Sparkles size={16} /> Generate with AI
        </button>
        {weekSlots.length > 0 && (
          <button className="action-btn action-btn--accent" onClick={() => setShowEditAIModal(true)}>
            <Pencil size={16} /> Edit with AI
          </button>
        )}
        <button className="action-btn" onClick={() => openLogModal(null)}>
          <FileText size={16} /> Log Session
        </button>
        <button className={`action-btn ${notificationsEnabled ? 'action-btn--accent' : ''}`} onClick={toggleNotifications} title={notificationsEnabled ? 'Notifications on' : 'Notifications off'}>
          {notificationsEnabled ? <Bell size={16} /> : <BellOff size={16} />}
          {notificationsEnabled ? 'Notifications On' : 'Notifications Off'}
        </button>
        {weekSlots.length > 0 && (
          <button className="action-btn action-btn--danger" onClick={clearWeek}>
            <Trash2 size={14} /> Clear Week
          </button>
        )}
      </div>

      {/* Week navigation */}
      <div className="cal-nav">
        <button className="cal-nav__btn" onClick={() => setWeekOffset(w => w - 1)}><ChevronLeft size={18} /></button>
        <div className="cal-nav__label">
          <span className="cal-nav__week">{weekLabel}</span>
          {weekOffset !== 0 && <button className="cal-nav__today" onClick={() => setWeekOffset(0)}>Today</button>}
        </div>
        <button className="cal-nav__btn" onClick={() => setWeekOffset(w => w + 1)}><ChevronRight size={18} /></button>
      </div>

      {/* Week stats */}
      {weekSlots.length > 0 && (
        <div className="cal-stats">
          <div className="cal-stats__total"><Clock size={14} /> {weekTotalHours}h planned this week</div>
          <div className="cal-stats__subjects">
            {Object.entries(weekBySubject).map(([subId, hrs]) => {
              const sub = subjects.find(s => s.id === subId);
              return <span key={subId} className="cal-stats__subject" style={{ '--sub-color': sub?.color }}>{sub?.icon} {hrs}h</span>;
            })}
          </div>
        </div>
      )}

      {/* Timetable grid */}
      <div className="cal-grid">
        <div className="cal-grid__times">
          <div className="cal-grid__corner" />
          {HOURS.map(h => (
            <div key={h} className="cal-grid__time">{h}:00</div>
          ))}
        </div>

        {weekDates.map((date, dayIdx) => {
          const isToday = dateKey(date) === todayKey;
          return (
            <div key={dayIdx} className={`cal-grid__day ${isToday ? 'cal-grid__day--today' : ''}`}>
              <div className="cal-grid__day-header">
                <span className="cal-grid__day-name">{DAY_SHORT[dayIdx]}</span>
                <span className="cal-grid__day-date">{date.getDate()}</span>
              </div>
              {HOURS.map(hour => {
                const startSlot = isSlotStart(dayIdx, hour);
                const coveredSlots = getSlotAt(dayIdx, hour);
                const isCovered = coveredSlots.length > 0 && !startSlot;

                if (isCovered) return null;

                if (startSlot) {
                  return (
                    <div
                      key={hour}
                      className="cal-grid__slot cal-grid__slot--filled"
                      style={{
                        '--slot-color': startSlot.subjectColor,
                        gridRow: `span ${startSlot.duration}`
                      }}
                      onClick={() => openEditModal(startSlot)}
                    >
                      <span className="cal-grid__slot-icon">{startSlot.subjectIcon}</span>
                      <span className="cal-grid__slot-name">{startSlot.topic || startSlot.subjectName}</span>
                      <span className="cal-grid__slot-type">{startSlot.type}{startSlot.breaks !== false ? ' ☕' : ''}</span>
                    </div>
                  );
                }

                return (
                  <div key={hour} className="cal-grid__slot cal-grid__slot--empty" />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Session History Grid */}
      {sessionLogs.length > 0 && (
        <div className="cal-history">
          <h2 className="cal-history__title"><FileText size={20} /> Session History</h2>
          <div className="cal-history__grid">
            {recentLogs.map(log => (
              <div key={log.id} className="cal-history__card" style={{ '--slot-color': log.subjectColor }}>
                <div className="cal-history__card-header">
                  <span className="cal-history__card-icon">{log.subjectIcon}</span>
                  <span className="cal-history__card-subject">{log.subjectName}</span>
                  <span className="cal-history__card-date">{log.date}</span>
                </div>
                <div className="cal-history__card-meta">
                  <span>{log.type}</span>
                  <span>{log.startTime != null ? `${log.startTime}:00` : ''}</span>
                  <span>{log.duration}h</span>
                  <span className="cal-history__card-rating">{'★'.repeat(log.rating || 0)}{'☆'.repeat(5 - (log.rating || 0))}</span>
                </div>
                {(log.topics?.length > 0 || log.topic) && (
                  <div className="cal-history__card-topics">
                    {(log.topics || (log.topic ? [log.topic] : [])).map((t, i) => (
                      <span key={i} className="cal-history__card-tag">{t}</span>
                    ))}
                  </div>
                )}
                {log.paper && <div className="cal-history__card-paper">📄 {log.paperName || log.paper}</div>}
                {log.notes && <div className="cal-history__card-notes">{log.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Generate modal */}
      {showAIModal && (
        <div className="modal-overlay" onClick={() => !aiGenerating && setShowAIModal(false)}>
          <div className="modal cal-modal" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h2><Sparkles size={18} /> Generate Timetable</h2>
              <button className="modal__close" onClick={() => !aiGenerating && setShowAIModal(false)}><X size={18} /></button>
            </div>
            <div className="modal__body">
              <p className="cal-ai-desc">Describe your revision needs and the AI will create a timetable.</p>

              <div className="cal-gen-options">
                <div className="cal-gen-option">
                  <label className="form-label">Weeks to generate</label>
                  <select className="topic-select" value={genWeeks} onChange={e => setGenWeeks(Number(e.target.value))}>
                    {[1, 2, 3, 4].map(w => <option key={w} value={w}>{w} week{w > 1 ? 's' : ''}</option>)}
                  </select>
                </div>
                <label className="cal-gen-checkbox" onClick={() => setGenBreaks(!genBreaks)}>
                  {genBreaks ? <CheckSquare size={18} /> : <Square size={18} />}
                  <span>Include Pomodoro breaks (25min work / 5min rest)</span>
                </label>
                <label className="cal-gen-checkbox" onClick={() => setGenUseWeakTopics(!genUseWeakTopics)}>
                  {genUseWeakTopics ? <CheckSquare size={18} /> : <Square size={18} />}
                  <span>Prioritize my weakest topics{weakTopics.length > 0 ? ` (${weakTopics.length} found)` : ''}</span>
                </label>
              </div>

              <label className="form-label">Describe your timetable plan</label>
              <textarea
                className="cal-ai-input"
                rows={5}
                placeholder={"e.g. I have exams in 3 weeks. Focus more on Physics and Computer Science. I want to study 4-5 hours per day. Mornings for harder subjects, evenings for flashcard review."}
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                disabled={aiGenerating}
              />
              <p className="cal-ai-hint">This will replace sessions for <strong>{genWeeks} week{genWeeks > 1 ? 's' : ''}</strong> starting {weekDates[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.</p>
            </div>
            <div className="modal__footer">
              <button className="action-btn" onClick={() => setShowAIModal(false)} disabled={aiGenerating}>Cancel</button>
              <button className="action-btn action-btn--accent" onClick={generateTimetable} disabled={aiGenerating || !aiPrompt.trim()}>
                {aiGenerating ? <><Loader size={14} className="spin" /> Generating...</> : <><Sparkles size={14} /> Generate</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Edit modal */}
      {showEditAIModal && (
        <div className="modal-overlay" onClick={() => !aiGenerating && setShowEditAIModal(false)}>
          <div className="modal cal-modal" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h2><Pencil size={18} /> Edit Timetable with AI</h2>
              <button className="modal__close" onClick={() => !aiGenerating && setShowEditAIModal(false)}><X size={18} /></button>
            </div>
            <div className="modal__body">
              <p className="cal-ai-desc">Describe what changes you want to make to the timetable. The AI will modify the existing schedule while keeping unchanged sessions.</p>

              <div className="cal-gen-options">
                <div className="cal-gen-option">
                  <label className="form-label">Weeks to edit</label>
                  <select className="topic-select" value={editWeeks} onChange={e => setEditWeeks(Number(e.target.value))}>
                    {[1, 2, 3, 4].map(w => <option key={w} value={w}>{w} week{w > 1 ? 's' : ''}</option>)}
                  </select>
                </div>
              </div>

              <textarea
                className="cal-ai-input"
                rows={4}
                placeholder={"e.g. Move the Physics session on Tuesday to Wednesday. Add more Computer Science sessions. Make all sessions shorter. Remove the Saturday sessions."}
                value={aiEditPrompt}
                onChange={e => setAiEditPrompt(e.target.value)}
                disabled={aiGenerating}
              />
              <p className="cal-ai-hint">Editing <strong>{editWeeks} week{editWeeks > 1 ? 's' : ''}</strong> starting {weekDates[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ({slots.filter(s => { const d = new Set(); for (let w = 0; w < editWeeks; w++) { const ws = addDays(weekStart, w * 7); for (let i = 0; i < 7; i++) d.add(dateKey(addDays(ws, i))); } return d.has(s.date); }).length} sessions)</p>
            </div>
            <div className="modal__footer">
              <button className="action-btn" onClick={() => setShowEditAIModal(false)} disabled={aiGenerating}>Cancel</button>
              <button className="action-btn action-btn--accent" onClick={editTimetableWithAI} disabled={aiGenerating || !aiEditPrompt.trim()}>
                {aiGenerating ? <><Loader size={14} className="spin" /> Updating...</> : <><Pencil size={14} /> Update</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Log modal */}
      {showLogModal && (
        <div className="modal-overlay" onClick={() => setShowLogModal(false)}>
          <div className="modal cal-modal cal-modal--log" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h2><FileText size={18} /> Log Session</h2>
              <button className="modal__close" onClick={() => setShowLogModal(false)}><X size={18} /></button>
            </div>
            <div className="modal__body">
              <label className="form-label">Subject</label>
              <select className="topic-select" value={logSubject} onChange={e => { setLogSubject(e.target.value); setLogTopics([]); setLogPaper(''); }}>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
              </select>

              <label className="form-label">What did you do?</label>
              <select className="topic-select" value={logType} onChange={e => { setLogType(e.target.value); setLogTopics([]); setLogPaper(''); }}>
                <option value="revision">📖 Topic Revision</option>
                <option value="flashcards">🃏 Flashcards</option>
                <option value="questions">❓ Practice Questions</option>
                <option value="paper">📄 Past Paper</option>
                <option value="notes">📝 Notes</option>
              </select>

              {logType === 'paper' ? (
                <>
                  <label className="form-label">Which paper?</label>
                  {logAvailablePapers.length > 0 ? (
                    <div className="cal-log-topics">
                      {logAvailablePapers.map(p => (
                        <button
                          key={p.id}
                          className={`cal-log-topic-btn ${logPaper === p.id ? 'cal-log-topic-btn--active' : ''}`}
                          onClick={() => setLogPaper(logPaper === p.id ? '' : p.id)}
                        >
                          📄 {p.title || `${p.month || ''} ${p.year || ''}`}{p.paperNumber ? ` P${p.paperNumber}` : ''}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="cal-log-no-topics">No papers imported for this subject. Import papers in the Past Papers page first.</p>
                  )}
                </>
              ) : (
                <>
                  <label className="form-label">Topics covered <small>(click to select)</small></label>
                  <div className="cal-log-topics">
                    {logAvailableTopics.map(t => (
                      <button
                        key={t}
                        className={`cal-log-topic-btn ${logTopics.includes(t) ? 'cal-log-topic-btn--active' : ''}`}
                        onClick={() => setLogTopics(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                      >
                        {t}
                      </button>
                    ))}
                    {logAvailableTopics.length === 0 && <span className="cal-log-no-topics">No topics available for this subject</span>}
                  </div>
                </>
              )}

              <div className="cal-modal__row cal-modal__row--3">
                <div>
                  <label className="form-label">Date</label>
                  <input type="date" className="topic-select" value={logDate} onChange={e => setLogDate(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Start Time</label>
                  <select className="topic-select" value={logStartTime} onChange={e => setLogStartTime(Number(e.target.value))}>
                    {HOURS.map(h => <option key={h} value={h}>{h}:00</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Duration</label>
                  <select className="topic-select" value={logDuration} onChange={e => setLogDuration(Number(e.target.value))}>
                    {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4].map(d => <option key={d} value={d}>{d}h</option>)}
                  </select>
                </div>
              </div>

              <label className="form-label">How well did it go?</label>
              <div className="cal-log-rating">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    className={`cal-log-star ${n <= logRating ? 'cal-log-star--filled' : ''}`}
                    onClick={() => setLogRating(n)}
                  >
                    <Star size={24} fill={n <= logRating ? 'var(--accent)' : 'none'} />
                  </button>
                ))}
                <span className="cal-log-rating-label">
                  {logRating === 1 ? 'Struggled' : logRating === 2 ? 'Difficult' : logRating === 3 ? 'Okay' : logRating === 4 ? 'Good' : 'Great'}
                </span>
              </div>

              <label className="form-label">Notes <small>(optional)</small></label>
              <textarea
                className="cal-ai-input"
                rows={2}
                placeholder="Any extra notes about this session..."
                value={logNotes}
                onChange={e => setLogNotes(e.target.value)}
              />
            </div>
            <div className="modal__footer">
              <button className="action-btn" onClick={() => setShowLogModal(false)}>Cancel</button>
              <button className="action-btn action-btn--accent" onClick={saveSessionLog}>
                <FileText size={14} /> Save Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit slot modal */}
      {showEditModal && editSlot && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal cal-modal" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h2>Edit Session</h2>
              <button className="modal__close" onClick={() => setShowEditModal(false)}><X size={18} /></button>
            </div>
            <div className="modal__body">
              <div className="cal-modal__row">
                <div>
                  <label className="form-label">Start Time</label>
                  <select className="topic-select" value={formHour} onChange={e => setFormHour(Number(e.target.value))}>
                    {HOURS.map(h => <option key={h} value={h}>{h}:00</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Duration (hours)</label>
                  <select className="topic-select" value={formDuration} onChange={e => setFormDuration(Number(e.target.value))}>
                    {[1, 2, 3, 4].map(d => <option key={d} value={d}>{d}h</option>)}
                  </select>
                </div>
              </div>

              <label className="form-label">Subject</label>
              <select className="topic-select" value={formSubject} onChange={e => { setFormSubject(e.target.value); setFormTopic(''); }}>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
              </select>

              <label className="form-label">Topic</label>
              <select className="topic-select" value={formTopic} onChange={e => setFormTopic(e.target.value)}>
                <option value="">— General —</option>
                {allTopics.map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              <label className="form-label">Type</label>
              <select className="topic-select" value={formType} onChange={e => setFormType(e.target.value)}>
                <option value="revision">📖 Revision</option>
                <option value="flashcards">🃏 Flashcards</option>
                <option value="questions">❓ Practice Questions</option>
                <option value="paper">📄 Past Paper</option>
                <option value="notes">📝 Notes</option>
              </select>

              <label className="form-label">Notes</label>
              <input
                type="text"
                className="topic-select"
                placeholder="Quick notes..."
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
              />
            </div>
            <div className="modal__footer">
              <button className="action-btn action-btn--danger" onClick={() => deleteSlot(editSlot.id)}>
                <Trash2 size={14} /> Delete
              </button>
              <button className="action-btn" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="action-btn action-btn--accent" onClick={saveEditSlot}>Update</button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {weekSlots.length === 0 && (
        <div className="empty-state" style={{ marginTop: 32 }}>
          <Sparkles size={48} />
          <h3>No revision planned this week</h3>
          <p>Click "Generate with AI" to describe your needs and have a timetable created for you.</p>
        </div>
      )}
    </div>
  );
}

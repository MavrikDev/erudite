import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { X, Flame, Zap, Loader } from 'lucide-react';
import { aiChat } from '../utils/ai';

const STORAGE_KEY = 'solorev-timetable';
const SESSION_LOG_KEY = 'solorev-session-logs';
const DISMISSED_KEY = 'solorev-motivation-dismissed';
const PROFILE_KEY = 'solorev-motivation-profile';
const CACHED_MSG_KEY = 'solorev-motivation-cached';

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

function getProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)); } catch { return null; }
}

function saveProfile(p) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}

// Check only the most recent past revision slot — was it logged?
function getMostRecentMissed() {
  try {
    const slots = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const logs = JSON.parse(localStorage.getItem(SESSION_LOG_KEY) || '[]');
    const loggedSlotIds = new Set(logs.map(l => l.slotId).filter(Boolean));

    const now = new Date();
    const today = dateKey(now);
    const currentHour = now.getHours();

    // Get all past slots, sorted most recent first
    const pastSlots = slots
      .filter(s => {
        if (s.date > today) return false;
        if (s.date === today && s.hour + s.duration > currentHour) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return b.hour - a.hour;
      });

    if (pastSlots.length === 0) return null;

    const mostRecent = pastSlots[0];
    // If it was logged, no missed session
    if (loggedSlotIds.has(mostRecent.id)) return null;
    return mostRecent;
  } catch {
    return null;
  }
}

async function generateMotivation(profile) {
  const systemMsg = `You are a direct, no-nonsense motivational coach for A-Level students. You give short, powerful wake-up calls. Always respond with exactly 5 sentences, one per line.`;

  const userMsg = `The student told you:
- They want: ${profile.targetGrade}
- Their dream: ${profile.dream}
- Prove wrong: ${profile.proveWrong}
- Pride: ${profile.pride}
- Fear: ${profile.fear}

Write 5 powerful motivational sentences. One sentence per line. Reference their actual words. Max 20 words each. No bullets, no numbers, no quotes. Address them as "you". Be direct and personal.`;

  const result = await aiChat({
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: userMsg },
    ],
    maxTokens: 300,
    temperature: 0.9,
  });

  // Some models return null content — guard against it
  if (!result || typeof result !== 'string' || !result.trim()) {
    throw new Error('AI returned empty. Please try again.');
  }
  return result;
}

const MissedSessionNotice = forwardRef(function MissedSessionNotice(_, ref) {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState('closed'); // 'closed' | 'setup' | 'loading' | 'message'
  const [aiText, setAiText] = useState(() => localStorage.getItem(CACHED_MSG_KEY) || '');
  const [aiError, setAiError] = useState('');
  const [missedSlot, setMissedSlot] = useState(null);

  // Setup form state
  const [targetGrade, setTargetGrade] = useState('');
  const [dream, setDream] = useState('');
  const [proveWrong, setProveWrong] = useState('');
  const [pride, setPride] = useState('');
  const [fear, setFear] = useState('');

  // Show the cached message (no regeneration). If no profile, show setup form.
  const showMotivation = useCallback(() => {
    const profile = getProfile();
    if (!profile) {
      setMode('setup');
      setVisible(true);
      return;
    }
    const cached = localStorage.getItem(CACHED_MSG_KEY);
    if (cached && cached.trim()) {
      setAiText(cached);
      setAiError('');
      setMode('message');
      setVisible(true);
    } else {
      // No valid cached message — generate once
      setMode('loading');
      setAiText('');
      setAiError('');
      setVisible(true);
      generateMotivation(profile).then(text => {
        if (text && text.trim()) {
          setAiText(text);
          localStorage.setItem(CACHED_MSG_KEY, text);
          setMode('message');
        } else {
          setAiError('AI returned an empty response. Try again later.');
          setMode('message');
        }
      }).catch(err => {
        setAiError(err.message || 'Failed to generate motivation.');
        setMode('message');
      });
    }
  }, []);

  // Auto-trigger: check most recent revision slot on mount
  useEffect(() => {
    const dismissedDate = localStorage.getItem(DISMISSED_KEY);
    const today = dateKey(new Date());
    if (dismissedDate === today) return;

    const missed = getMostRecentMissed();
    if (missed) {
      setMissedSlot(missed);
      const timer = setTimeout(() => showMotivation(), 1500);
      return () => clearTimeout(timer);
    }
  }, [showMotivation]);

  // Auto-trigger: show when user returns from idle (visibility change)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const dismissedDate = localStorage.getItem(DISMISSED_KEY);
      const today = dateKey(new Date());
      if (dismissedDate === today) return;

      const missed = getMostRecentMissed();
      if (missed) {
        setMissedSlot(missed);
        showMotivation();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [showMotivation]);

  const openSetupForm = useCallback(() => {
    const profile = getProfile();
    if (profile) {
      setTargetGrade(profile.targetGrade || '');
      setDream(profile.dream || '');
      setProveWrong(profile.proveWrong || '');
      setPride(profile.pride || '');
      setFear(profile.fear || '');
    }
    setMode('setup');
    setVisible(true);
  }, []);

  // Expose to parent: trigger just shows cached message, editProfile opens form
  useImperativeHandle(ref, () => ({ trigger: showMotivation, editProfile: openSetupForm }), [showMotivation, openSetupForm]);

  const dismiss = () => {
    setVisible(false);
    setMode('closed');
    localStorage.setItem(DISMISSED_KEY, dateKey(new Date()));
  };

  const handleSetupSubmit = async (e) => {
    e.preventDefault();
    const profile = { targetGrade, dream, proveWrong, pride, fear };
    saveProfile(profile);
    localStorage.removeItem(CACHED_MSG_KEY);
    // Generate the message once
    setMode('loading');
    setAiError('');
    try {
      const text = await generateMotivation(profile);
      if (text && text.trim()) {
        setAiText(text);
        localStorage.setItem(CACHED_MSG_KEY, text);
        setMode('message');
      } else {
        setAiError('AI returned an empty response. Try again later.');
        setMode('message');
      }
    } catch (err) {
      setAiError(err.message || 'Failed to generate motivation.');
      setMode('message');
    }
  };

  if (!visible) return null;

  return (
    <div className="motivation-overlay" onClick={dismiss}>
      <div className="motivation-notice" onClick={e => e.stopPropagation()}>
        <button className="motivation-notice__close" onClick={dismiss}><X size={20} /></button>

        <div className="motivation-notice__icon">
          {mode === 'loading' ? <Loader size={40} className="motiv-spin" /> : <Zap size={40} />}
        </div>

        {/* ── Setup Form (first time) ── */}
        {mode === 'setup' && (
          <>
            <h2 className="motivation-notice__title">Make it personal.</h2>
            <p className="motivation-notice__subtitle">
              Tell me what drives you. This will be used to generate motivation that actually hits — every single time.
            </p>
            <form className="motivation-setup" onSubmit={handleSetupSubmit}>
              <label className="motivation-setup__field">
                <span>What grade are you going for?</span>
                <input type="text" value={targetGrade} onChange={e => setTargetGrade(e.target.value)}
                  placeholder="e.g. A* in all subjects" required />
              </label>
              <label className="motivation-setup__field">
                <span>What's your dream after these exams?</span>
                <input type="text" value={dream} onChange={e => setDream(e.target.value)}
                  placeholder="e.g. Get into Imperial for CS" required />
              </label>
              <label className="motivation-setup__field">
                <span>Who do you want to prove wrong?</span>
                <input type="text" value={proveWrong} onChange={e => setProveWrong(e.target.value)}
                  placeholder="e.g. Everyone who said I couldn't do it" required />
              </label>
              <label className="motivation-setup__field">
                <span>What would make you proud?</span>
                <input type="text" value={pride} onChange={e => setPride(e.target.value)}
                  placeholder="e.g. Seeing my parents' faces on results day" required />
              </label>
              <label className="motivation-setup__field">
                <span>What's your biggest fear about these exams?</span>
                <input type="text" value={fear} onChange={e => setFear(e.target.value)}
                  placeholder="e.g. Getting a C and having no options" required />
              </label>
              <button type="submit" className="motivation-notice__cta">
                <Flame size={16} /> Lock it in
              </button>
            </form>
          </>
        )}

        {/* ── Loading ── */}
        {mode === 'loading' && (
          <>
            <h2 className="motivation-notice__title">Generating your wake-up call...</h2>
            <p className="motivation-notice__subtitle">Using what you told me to hit where it hurts.</p>
          </>
        )}

        {/* ── AI Message ── */}
        {mode === 'message' && (
          <>
            <h2 className="motivation-notice__title">
              {aiError ? 'Something went wrong.' : 'Read this. All of it.'}
            </h2>
            {missedSlot && !aiError && (
              <div className="motivation-notice__missed">
                You missed your <strong>{missedSlot.subjectName || 'revision'}</strong> session
                {missedSlot.topic ? <> on {missedSlot.topic}</> : null}
              </div>
            )}
            <div className="motivation-notice__lines">
              {aiError
                ? <p className="motivation-notice__line motivation-notice__error">{aiError}</p>
                : (aiText || '').split('\n').filter(Boolean).map((p, i) => (
                    <div key={i} className="motivation-notice__card">
                      <span className="motivation-notice__card-num">{i + 1}</span>
                      <p className="motivation-notice__card-text">{p}</p>
                    </div>
                  ))
              }
            </div>
            <button className="motivation-notice__cta" onClick={dismiss}>
              <Flame size={16} /> I'm on it. Let's go.
            </button>
          </>
        )}
      </div>
    </div>
  );
});

export default MissedSessionNotice;

import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSubject } from '../data/subjects';
import { useProgress } from '../contexts/ProgressContext';
import { CheckCircle2, XCircle, ChevronRight, Sparkles, Loader, Clock, AlertTriangle, X, ArrowLeft, BarChart3, Calendar, TrendingUp, BookOpen } from 'lucide-react';
import { aiChat, getApiKey } from '../utils/ai';

export default function PracticeQuestionsPage() {
  const { subjectId } = useParams();
  const subject = getSubject(subjectId);
  const { progress, recordQuestion, saveQuestionSession, markStruggled } = useProgress();

  const QUIZ_KEY = `solorev-quiz-session-${subjectId}`;

  // Restore in-progress quiz from localStorage
  const savedQuiz = (() => { try { return JSON.parse(localStorage.getItem(QUIZ_KEY)); } catch { return null; } })();

  // Views: 'sessions' (history list), 'active' (doing questions), 'review' (reviewing a past session)
  const [view, setView] = useState(savedQuiz ? 'active' : 'sessions');
  const [activeQuestions, setActiveQuestions] = useState(savedQuiz?.activeQuestions || []);
  const [currentIndex, setCurrentIndex] = useState(savedQuiz?.currentIndex || 0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [textAnswer, setTextAnswer] = useState('');
  const [score, setScore] = useState(savedQuiz?.score || { correct: 0, total: 0 });
  const [answers, setAnswers] = useState(savedQuiz?.answers || []);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [genTopic, setGenTopic] = useState('');
  const [genCount, setGenCount] = useState(5);
  const [sessionStartTime, setSessionStartTime] = useState(savedQuiz?.sessionStartTime || null);

  // Question timer
  const [questionTimer, setQuestionTimer] = useState(0);
  const [questionTimerRunning, setQuestionTimerRunning] = useState(false);
  const timerRef = useRef(null);

  // Review a past session
  const [reviewSession, setReviewSession] = useState(null);
  const [reviewIndex, setReviewIndex] = useState(0);

  useEffect(() => {
    if (questionTimerRunning) {
      timerRef.current = setInterval(() => setQuestionTimer(t => t + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [questionTimerRunning]);

  // Save in-progress quiz to localStorage
  useEffect(() => {
    if (view === 'active' && activeQuestions.length > 0) {
      localStorage.setItem(QUIZ_KEY, JSON.stringify({ activeQuestions, currentIndex, score, answers, sessionStartTime }));
    }
  }, [view, activeQuestions, currentIndex, score, answers, sessionStartTime, QUIZ_KEY]);

  useEffect(() => {
    if (view === 'active') {
      setQuestionTimer(0);
      setQuestionTimerRunning(true);
    }
  }, [currentIndex, view]);

  if (!subject) return <div className="page-error">Subject not found</div>;

  const sessions = (progress.questionSessions || [])
    .filter(s => s.subjectId === subjectId)
    .sort((a, b) => (b.completedAt || b.createdAt) - (a.completedAt || a.createdAt));

  const availableTopics = [
    ...(subject.levels.as?.topics || []),
    ...(subject.levels.a2?.topics || []),
  ].filter((t, i, arr) => arr.indexOf(t) === i);

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const currentQ = activeQuestions[currentIndex];

  const checkAnswer = (answerIndex) => {
    if (showAnswer) return;
    setSelectedAnswer(answerIndex);
    setShowAnswer(true);
    setQuestionTimerRunning(false);
    const correct = answerIndex === currentQ.answer;
    setScore(prev => ({ correct: prev.correct + (correct ? 1 : 0), total: prev.total + 1 }));
    setAnswers(prev => [...prev, { questionIndex: currentIndex, selectedAnswer: answerIndex, correct, timeTaken: questionTimer }]);
    recordQuestion(subjectId, 'as', correct);
  };

  const showSolution = () => {
    setShowAnswer(true);
    setQuestionTimerRunning(false);
    setScore(prev => ({ ...prev, total: prev.total + 1 }));
    setAnswers(prev => [...prev, { questionIndex: currentIndex, selectedAnswer: null, correct: false, timeTaken: questionTimer }]);
    recordQuestion(subjectId, 'as', false);
  };

  const nextQuestion = () => {
    if (currentIndex >= activeQuestions.length - 1) {
      completeSession();
      return;
    }
    setSelectedAnswer(null);
    setShowAnswer(false);
    setTextAnswer('');
    setCurrentIndex(prev => prev + 1);
  };

  const completeSession = () => {
    localStorage.removeItem(QUIZ_KEY);
    const finalCorrect = answers.filter(a => a.correct).length;
    const session = {
      id: `qs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      subjectId,
      topic: activeQuestions[0]?.topic || 'Mixed',
      questionCount: activeQuestions.length,
      questions: activeQuestions.map((q, i) => {
        const ans = answers.find(a => a.questionIndex === i);
        return { ...q, userAnswer: ans?.selectedAnswer ?? null, correct: ans?.correct ?? false, timeTaken: ans?.timeTaken ?? 0 };
      }),
      score: { correct: finalCorrect, total: activeQuestions.length },
      createdAt: sessionStartTime,
      completedAt: Date.now(),
    };
    saveQuestionSession(session);
    setReviewSession(session);
    setReviewIndex(0);
    setView('review');
  };

  const generateAIQuestions = async () => {
    if (!getApiKey()) {
      alert('Please set your API key in Settings first.');
      return;
    }

    setGeneratingAI(true);
    try {
      const topicStr = genTopic || `any ${subject.name} topic`;

      const content = await aiChat({
        messages: [{
          role: 'system',
          content: `Generate ${genCount} A-Level ${subject.name} (${subject.examBoard}) practice questions for quick recall. Return ONLY valid JSON array with this exact format:
[{"id":"ai-1","topic":"Topic Name","difficulty":"medium","type":"multiple-choice","question":"Question text","options":["A","B","C","D"],"answer":0,"explanation":"Explanation"},{"id":"ai-2","topic":"Topic Name","difficulty":"medium","type":"short-answer","question":"Question text","answer":"Answer text","explanation":"Explanation"}]
Mix multiple-choice and short-answer questions. Make them realistic exam-style questions. Focus on quick recall and understanding.`
        }, {
          role: 'user',
          content: `Generate ${genCount} practice questions on: ${topicStr}`
        }],
        maxTokens: 3000,
        temperature: 0.8
      });

      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setActiveQuestions(parsed);
        setCurrentIndex(0);
        setSelectedAnswer(null);
        setShowAnswer(false);
        setTextAnswer('');
        setScore({ correct: 0, total: 0 });
        setAnswers([]);
        setSessionStartTime(Date.now());
        setShowGenerateModal(false);
        setView('active');
      } else {
        throw new Error('Could not parse AI response');
      }
    } catch (err) {
      alert(`Failed to generate questions: ${err.message}`);
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleMarkStruggled = () => {
    if (!currentQ) return;
    markStruggled({
      questionId: currentQ.id || `qs-${Date.now()}`,
      subjectId,
      level: 'as',
      topic: currentQ.topic || 'Unknown',
      question: currentQ.question,
      source: 'question',
      difficulty: currentQ.difficulty,
    });
  };

  // Compute topic difficulty stats from sessions
  const topicStats = {};
  sessions.forEach(s => {
    s.questions?.forEach(q => {
      const t = q.topic || 'Unknown';
      if (!topicStats[t]) topicStats[t] = { total: 0, correct: 0 };
      topicStats[t].total++;
      if (q.correct) topicStats[t].correct++;
    });
  });
  const hardTopics = Object.entries(topicStats)
    .map(([topic, stats]) => ({ topic, ...stats, accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0 }))
    .filter(t => t.total >= 2)
    .sort((a, b) => a.accuracy - b.accuracy);

  // ===== REVIEW VIEW: viewing a past session =====
  if (view === 'review' && reviewSession) {
    const rq = reviewSession.questions[reviewIndex];
    const pct = reviewSession.score.total > 0 ? Math.round((reviewSession.score.correct / reviewSession.score.total) * 100) : 0;

    return (
      <div className="questions-page">
        <div className="page-header">
          <div className="page-header__breadcrumb">
            <Link to={`/subject/${subjectId}`}>{subject.icon} {subject.name}</Link>
            <span>/</span>
            <span className="breadcrumb-link" onClick={() => { setView('sessions'); setReviewSession(null); }}>Practice Questions</span>
            <span>/</span>
            <span>Session Review</span>
          </div>
          <h1>Session Review — {reviewSession.topic}</h1>
        </div>

        <div className="qs-session-summary">
          <div className="qs-session-summary__stat">
            <CheckCircle2 size={18} />
            <span>{reviewSession.score.correct}/{reviewSession.score.total} correct ({pct}%)</span>
          </div>
          <div className="qs-session-summary__stat">
            <Calendar size={14} />
            <span>Created: {formatDate(reviewSession.createdAt)}</span>
          </div>
          <div className="qs-session-summary__stat">
            <Clock size={14} />
            <span>Completed: {formatDate(reviewSession.completedAt)}</span>
          </div>
          <button className="action-btn" onClick={() => { setView('sessions'); setReviewSession(null); }}>
            <ArrowLeft size={16} /> Back to Sessions
          </button>
        </div>

        {rq && (
          <div className="question-card">
            <div className="question-card__header">
              <span className="question-card__topic">{rq.topic}</span>
              <span className={`question-card__difficulty difficulty--${rq.difficulty}`}>{rq.difficulty}</span>
              {rq.correct ? <span className="qs-result qs-result--correct"><CheckCircle2 size={14} /> Correct</span> : <span className="qs-result qs-result--wrong"><XCircle size={14} /> Incorrect</span>}
              {rq.timeTaken > 0 && <span className="question-card__timer"><Clock size={14} /> {formatTimer(rq.timeTaken)}</span>}
              <span className="question-card__count">{reviewIndex + 1}/{reviewSession.questions.length}</span>
            </div>
            <div className="question-card__body">
              <p className="question-card__text">{rq.question}</p>
              {rq.type === 'multiple-choice' && rq.options ? (
                <div className="question-card__options">
                  {rq.options.map((opt, i) => {
                    let cls = 'option-btn';
                    if (i === rq.answer) cls += ' option-btn--correct';
                    else if (i === rq.userAnswer && i !== rq.answer) cls += ' option-btn--wrong';
                    return (
                      <button key={i} className={cls} disabled>
                        <span className="option-btn__letter">{String.fromCharCode(65 + i)}</span>
                        {opt}
                        {i === rq.answer && <CheckCircle2 size={18} />}
                        {i === rq.userAnswer && i !== rq.answer && <XCircle size={18} />}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="question-card__explanation">
                  <h4>Model Answer</h4>
                  <div className="question-card__model-answer">{rq.answer}</div>
                </div>
              )}
              {rq.explanation && (
                <div className="question-card__explanation">
                  <p>{rq.explanation}</p>
                </div>
              )}
            </div>
            <div className="question-card__footer">
              <button onClick={() => setReviewIndex(Math.max(0, reviewIndex - 1))} disabled={reviewIndex === 0} className="action-btn">
                Previous
              </button>
              <button onClick={() => setReviewIndex(Math.min(reviewSession.questions.length - 1, reviewIndex + 1))} disabled={reviewIndex >= reviewSession.questions.length - 1} className="action-btn action-btn--primary">
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== ACTIVE VIEW: answering questions =====
  if (view === 'active' && activeQuestions.length > 0) {
    return (
      <div className="questions-page">
        <div className="page-header">
          <div className="page-header__breadcrumb">
            <Link to={`/subject/${subjectId}`}>{subject.icon} {subject.name}</Link>
            <span>/</span>
            <span className="breadcrumb-link" onClick={() => { if (confirm('Leave this session? Progress will be lost.')) { setView('sessions'); } }}>Practice Questions</span>
            <span>/</span>
            <span>Active Session</span>
          </div>
          <h1>Practice Questions</h1>
        </div>

        <div className="score-bar">
          <div className="score-bar__stats">
            <span className="score-bar__correct"><CheckCircle2 size={16} /> {score.correct} correct</span>
            <span className="score-bar__total">out of {score.total}</span>
            {score.total > 0 && <span className="score-bar__percent">{Math.round((score.correct / score.total) * 100)}%</span>}
          </div>
          <span className="score-bar__progress">{currentIndex + 1} / {activeQuestions.length}</span>
        </div>

        {currentQ ? (
          <div className="question-card">
            <div className="question-card__header">
              <span className="question-card__topic">{currentQ.topic}</span>
              <span className={`question-card__difficulty difficulty--${currentQ.difficulty}`}>{currentQ.difficulty}</span>
              <span className="question-card__timer"><Clock size={14} /> {formatTimer(questionTimer)}</span>
              <span className="question-card__count">{currentIndex + 1}/{activeQuestions.length}</span>
            </div>
            <div className="question-card__body">
              <p className="question-card__text">{currentQ.question}</p>
              {currentQ.type === 'multiple-choice' && currentQ.options ? (
                <div className="question-card__options">
                  {currentQ.options.map((opt, i) => {
                    let cls = 'option-btn';
                    if (showAnswer) {
                      if (i === currentQ.answer) cls += ' option-btn--correct';
                      else if (i === selectedAnswer) cls += ' option-btn--wrong';
                    } else if (i === selectedAnswer) cls += ' option-btn--selected';
                    return (
                      <button key={i} className={cls} onClick={() => checkAnswer(i)} disabled={showAnswer}>
                        <span className="option-btn__letter">{String.fromCharCode(65 + i)}</span>
                        {opt}
                        {showAnswer && i === currentQ.answer && <CheckCircle2 size={18} />}
                        {showAnswer && i === selectedAnswer && i !== currentQ.answer && <XCircle size={18} />}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="question-card__short-answer">
                  <textarea placeholder="Type your answer here..." value={textAnswer} onChange={(e) => setTextAnswer(e.target.value)} disabled={showAnswer} rows={4} />
                  {!showAnswer && (
                    <button onClick={showSolution} className="action-btn action-btn--primary">Show Solution</button>
                  )}
                </div>
              )}
            </div>
            {showAnswer && (
              <div className="question-card__explanation">
                <h4>{currentQ.type === 'short-answer' ? 'Model Answer' : (selectedAnswer === currentQ.answer ? '✓ Correct!' : '✗ Incorrect')}</h4>
                {currentQ.type === 'short-answer' && <div className="question-card__model-answer">{currentQ.answer}</div>}
                <p>{currentQ.explanation}</p>
                <div className="question-card__time-taken"><Clock size={14} /> Time taken: {formatTimer(questionTimer)}</div>
              </div>
            )}
            {showAnswer && (
              <div className="question-card__footer">
                <button onClick={handleMarkStruggled} className="action-btn action-btn--danger" title="Flag as struggled">
                  <AlertTriangle size={16} /> Flag
                </button>
                <button onClick={nextQuestion} className="action-btn action-btn--primary">
                  {currentIndex >= activeQuestions.length - 1 ? 'Finish Session' : 'Next Question'} <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  // ===== SESSIONS VIEW: history list =====
  return (
    <div className="questions-page">
      <div className="page-header">
        <div className="page-header__breadcrumb">
          <Link to={`/subject/${subjectId}`}>{subject.icon} {subject.name}</Link>
          <span>/</span>
          <span>Practice Questions</span>
        </div>
        <h1>Practice Questions</h1>
      </div>

      <div className="flashcards-toolbar">
        <button className="action-btn action-btn--ai" onClick={() => setShowGenerateModal(true)}>
          <Sparkles size={16} /> Generate Questions
        </button>
      </div>

      {/* Topic Difficulty Stats */}
      {hardTopics.length > 0 && (
        <div className="qs-topic-stats">
          <h3><TrendingUp size={16} /> Topic Accuracy</h3>
          <div className="qs-topic-stats__list">
            {hardTopics.map(t => (
              <div key={t.topic} className="qs-topic-stat">
                <span className="qs-topic-stat__name">{t.topic}</span>
                <div className="qs-topic-stat__bar-wrap">
                  <div className="qs-topic-stat__bar" style={{ width: `${t.accuracy}%`, background: t.accuracy < 50 ? 'var(--danger)' : t.accuracy < 75 ? 'var(--warning)' : 'var(--success)' }} />
                </div>
                <span className="qs-topic-stat__pct">{t.accuracy}%</span>
                <span className="qs-topic-stat__count">({t.correct}/{t.total})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session History */}
      {sessions.length === 0 ? (
        <div className="empty-state">
          <BookOpen size={48} />
          <h3>No question sessions yet</h3>
          <p>Generate AI questions to start a quick recall session.</p>
          <button className="action-btn action-btn--ai" onClick={() => setShowGenerateModal(true)} style={{ marginTop: '1rem' }}>
            <Sparkles size={16} /> Generate Questions
          </button>
        </div>
      ) : (
        <div className="qs-sessions-list">
          <h3><BarChart3 size={16} /> Session History</h3>
          {sessions.map(s => {
            const pct = s.score.total > 0 ? Math.round((s.score.correct / s.score.total) * 100) : 0;
            return (
              <div key={s.id} className="qs-session-card" onClick={() => { setReviewSession(s); setReviewIndex(0); setView('review'); }}>
                <div className="qs-session-card__header">
                  <span className="qs-session-card__topic">{s.topic}</span>
                  <span className={`qs-session-card__score ${pct >= 75 ? 'qs-session-card__score--good' : pct >= 50 ? 'qs-session-card__score--ok' : 'qs-session-card__score--bad'}`}>
                    {pct}%
                  </span>
                </div>
                <div className="qs-session-card__meta">
                  <span><CheckCircle2 size={12} /> {s.score.correct}/{s.score.total}</span>
                  <span><Calendar size={12} /> {formatDate(s.createdAt)}</span>
                  {s.completedAt && <span><Clock size={12} /> Completed: {formatDate(s.completedAt)}</span>}
                  <span>{s.questionCount} questions</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Generate Questions Modal */}
      {showGenerateModal && (
        <div className="modal-overlay" onClick={() => !generatingAI && setShowGenerateModal(false)}>
          <div className="modal deck-modal" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h2><Sparkles size={20} /> Generate Questions</h2>
              <button className="modal__close" onClick={() => !generatingAI && setShowGenerateModal(false)}><X size={20} /></button>
            </div>
            <div className="modal__body">
              <p className="ai-deck-info">Generate quick recall questions using AI for <strong>{subject.name}</strong>.</p>
              <label className="modal__label">
                Topic (optional — leave blank for mixed)
                <select className="modal__input" value={genTopic} onChange={e => setGenTopic(e.target.value)} disabled={generatingAI}>
                  <option value="">Mixed Topics</option>
                  {availableTopics.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="modal__label">
                Number of Questions
                <input type="number" className="modal__input" min={3} max={20} value={genCount} onChange={e => setGenCount(Math.max(3, Math.min(20, parseInt(e.target.value) || 5)))} disabled={generatingAI} />
              </label>
            </div>
            <div className="modal__footer">
              <button className="action-btn" onClick={() => setShowGenerateModal(false)} disabled={generatingAI}>Cancel</button>
              <button className="action-btn action-btn--ai" onClick={generateAIQuestions} disabled={generatingAI}>
                {generatingAI ? <><Loader size={16} className="spin-icon" /> Generating...</> : <><Sparkles size={16} /> Generate</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

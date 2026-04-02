import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useProgress } from '../contexts/ProgressContext';
import { subjects } from '../data/subjects';
import { AlertTriangle, Target, TrendingDown, Trash2, Clock, Brain, ChevronRight, BookOpen, BarChart3, RefreshCw, Layers, GitBranch } from 'lucide-react';

export default function ImprovementsPage() {
  const { progress, removeStruggled } = useProgress();
  const savedFilters = (() => { try { return JSON.parse(localStorage.getItem('solorev-improvements-prefs')); } catch { return null; } })();
  const [subjectFilter, setSubjectFilter] = useState(savedFilters?.subjectFilter || 'all');
  const [sourceFilter, setSourceFilter] = useState(savedFilters?.sourceFilter || 'all');

  useEffect(() => {
    localStorage.setItem('solorev-improvements-prefs', JSON.stringify({ subjectFilter, sourceFilter }));
  }, [subjectFilter, sourceFilter]);

  const struggled = progress.struggledQuestions || [];

  // Filter
  let filtered = struggled;
  if (subjectFilter !== 'all') filtered = filtered.filter(s => s.subjectId === subjectFilter);
  if (sourceFilter !== 'all') filtered = filtered.filter(s => s.source === sourceFilter);

  // Group by topic
  const byTopic = {};
  filtered.forEach(s => {
    const key = `${s.subjectId}:${s.topic}`;
    if (!byTopic[key]) byTopic[key] = { subjectId: s.subjectId, topic: s.topic, items: [] };
    byTopic[key].items.push(s);
  });

  // Sort topics by most struggled
  const topicList = Object.values(byTopic).sort((a, b) => b.items.length - a.items.length);

  // Paper time analysis
  const paperTimeLogs = progress.paperTimeLogs || {};

  const formatTimer = (secs) => {
    if (!secs) return '—';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const getSubjectInfo = (id) => subjects.find(s => s.id === id);

  // Load all user papers from localStorage for cross-referencing
  const allPapersMap = useMemo(() => {
    const map = {};
    subjects.forEach(sub => {
      try {
        const stored = JSON.parse(localStorage.getItem(`solorev-user-papers-${sub.id}`) || '{}');
        for (const level of ['as', 'a2']) {
          (stored[level] || []).forEach(paper => {
            map[paper.id] = { ...paper, subjectId: sub.id, subjectName: sub.name, subjectIcon: sub.icon, level };
          });
        }
      } catch { /* skip */ }
    });
    return map;
  }, []);

  // Papers to revisit — completed >14 days ago
  const papersToRevisit = useMemo(() => {
    const now = Date.now();
    const twoWeeks = 14 * 24 * 60 * 60 * 1000;
    const completedIds = progress.pastPapersCompleted || [];
    return completedIds
      .filter(id => {
        const log = paperTimeLogs[id];
        return log && (now - log.timestamp > twoWeeks);
      })
      .map(id => {
        const paper = allPapersMap[id];
        const log = paperTimeLogs[id];
        return {
          id,
          title: paper?.title || id,
          year: paper?.year,
          month: paper?.month,
          subjectName: paper?.subjectName || 'Unknown',
          subjectIcon: paper?.subjectIcon || '📄',
          subjectId: paper?.subjectId,
          lastCompleted: log?.timestamp,
          daysSince: Math.floor((now - (log?.timestamp || 0)) / (24 * 60 * 60 * 1000)),
        };
      })
      .sort((a, b) => (a.lastCompleted || 0) - (b.lastCompleted || 0));
  }, [progress.pastPapersCompleted, paperTimeLogs, allPapersMap]);

  // Paper completion times with labels
  const paperCompletionEntries = useMemo(() => {
    return Object.entries(paperTimeLogs).map(([paperId, log]) => {
      const paper = allPapersMap[paperId];
      return {
        id: paperId,
        title: paper?.title || paperId,
        year: paper?.year,
        month: paper?.month,
        subjectId: paper?.subjectId,
        subjectName: paper?.subjectName || 'Unknown',
        subjectIcon: paper?.subjectIcon || '📄',
        elapsed: log.elapsed,
        completedDate: log.timestamp ? new Date(log.timestamp).toLocaleDateString() : '—',
      };
    }).sort((a, b) => (b.elapsed || 0) - (a.elapsed || 0));
  }, [paperTimeLogs, allPapersMap]);

  // Decks due for review
  const decksDue = useMemo(() => {
    const now = Date.now();
    const results = [];
    const sr = progress.flashcardSR || {};
    const decks = progress.flashcardDecks || {};
    for (const [subjectId, subDecks] of Object.entries(decks)) {
      const sub = getSubjectInfo(subjectId);
      for (const deck of subDecks) {
        const activeCards = (deck.cards || []).filter(c => !c.archived);
        const dueCount = activeCards.filter(c => {
          const srData = sr[c.id];
          return !srData || !srData.nextReview || srData.nextReview <= now;
        }).length;
        if (dueCount > 0) {
          results.push({
            deckId: deck.id,
            deckName: deck.name,
            subjectId,
            subjectName: sub?.name || subjectId,
            subjectIcon: sub?.icon || '📚',
            level: deck.level,
            dueCount,
            totalCards: activeCards.length,
          });
        }
      }
    }
    return results.sort((a, b) => b.dueCount - a.dueCount).slice(0, 3);
  }, [progress.flashcardDecks, progress.flashcardSR]);

  // Question sessions to redo (score < 70%)
  const sessionsToRedo = useMemo(() => {
    return (progress.questionSessions || [])
      .filter(s => s.score && s.score.total > 0 && (s.score.correct / s.score.total) < 0.7)
      .map(s => {
        const sub = getSubjectInfo(s.subjectId);
        return {
          ...s,
          subjectName: sub?.name || s.subjectId,
          subjectIcon: sub?.icon || '❓',
          accuracy: Math.round((s.score.correct / s.score.total) * 100),
        };
      })
      .sort((a, b) => a.accuracy - b.accuracy);
  }, [progress.questionSessions]);

  // Average marks per subject
  const subjectAverages = useMemo(() => {
    return subjects.map(sub => {
      // Paper averages: papers with a score and totalMarks
      const subPapers = Object.values(allPapersMap).filter(p => p.subjectId === sub.id && p.score != null && p.totalMarks);
      const avgPaper = subPapers.length > 0
        ? Math.round(subPapers.reduce((sum, p) => sum + (p.score / p.totalMarks) * 100, 0) / subPapers.length)
        : null;

      // Question session averages
      const subSessions = (progress.questionSessions || []).filter(s => s.subjectId === sub.id && s.score && s.score.total > 0);
      const avgQuestions = subSessions.length > 0
        ? Math.round(subSessions.reduce((sum, s) => sum + (s.score.correct / s.score.total) * 100, 0) / subSessions.length)
        : null;

      // Flashcard stats: average last rating across reviewed cards in this subject's decks
      const subDecks = (progress.flashcardDecks || {})[sub.id] || [];
      const sr = progress.flashcardSR || {};
      let ratedCount = 0, ratingSum = 0;
      subDecks.forEach(deck => {
        (deck.cards || []).forEach(card => {
          const srData = sr[card.id];
          if (srData && srData.lastRating != null) {
            ratedCount++;
            ratingSum += srData.lastRating;
          }
        });
      });
      const avgFlashcard = ratedCount > 0 ? (ratingSum / ratedCount).toFixed(1) : null;

      const hasData = avgPaper != null || avgQuestions != null || avgFlashcard != null;
      return { ...sub, avgPaper, avgQuestions, avgFlashcard, paperCount: subPapers.length, sessionCount: subSessions.length, ratedCount, hasData };
    }).filter(s => s.hasData);
  }, [allPapersMap, progress.questionSessions, progress.flashcardDecks, progress.flashcardSR]);

  // Topic performance per subject (from question sessions)
  const topicPerformance = useMemo(() => {
    const sessions = progress.questionSessions || [];
    const topicMap = {};
    sessions.forEach(s => {
      if (!s.score || !s.score.total) return;
      const sub = getSubjectInfo(s.subjectId);
      const key = `${s.subjectId}:${s.topic}`;
      if (!topicMap[key]) topicMap[key] = { subjectId: s.subjectId, subjectName: sub?.name || s.subjectId, subjectIcon: sub?.icon || '❓', topic: s.topic, correct: 0, total: 0, sessions: 0 };
      topicMap[key].correct += s.score.correct;
      topicMap[key].total += s.score.total;
      topicMap[key].sessions++;
    });
    // Also gather from struggled questions
    (progress.struggledQuestions || []).forEach(sq => {
      const key = `${sq.subjectId}:${sq.topic}`;
      if (!topicMap[key]) {
        const sub = getSubjectInfo(sq.subjectId);
        topicMap[key] = { subjectId: sq.subjectId, subjectName: sub?.name || sq.subjectId, subjectIcon: sub?.icon || '❓', topic: sq.topic, correct: 0, total: 0, sessions: 0 };
      }
    });
    return Object.values(topicMap)
      .map(t => ({ ...t, accuracy: t.total > 0 ? Math.round((t.correct / t.total) * 100) : null }))
      .sort((a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100));
  }, [progress.questionSessions, progress.struggledQuestions]);

  // Per-subject topic accuracy breakdown (from question sessions + subject topics)
  const subjectTopicBreakdown = useMemo(() => {
    const sessions = progress.questionSessions || [];
    const struggled = progress.struggledQuestions || [];
    return subjects.map(sub => {
      // Gather all topics from both levels
      const allTopics = [...new Set([...(sub.levels.as?.topics || []), ...(sub.levels.a2?.topics || [])])];
      // Build per-topic stats from sessions
      const topicStats = {};
      sessions.filter(s => s.subjectId === sub.id && s.score && s.score.total > 0).forEach(s => {
        const t = s.topic;
        if (!topicStats[t]) topicStats[t] = { correct: 0, total: 0, sessions: 0, flagged: 0 };
        topicStats[t].correct += s.score.correct;
        topicStats[t].total += s.score.total;
        topicStats[t].sessions++;
      });
      // Count flagged per topic
      struggled.filter(s => s.subjectId === sub.id).forEach(s => {
        if (!topicStats[s.topic]) topicStats[s.topic] = { correct: 0, total: 0, sessions: 0, flagged: 0 };
        topicStats[s.topic].flagged++;
      });
      // Merge: for topics in allTopics that appear in stats, add accuracy; otherwise mark as no data
      const topics = allTopics.map(t => {
        const st = topicStats[t] || null;
        return {
          topic: t,
          accuracy: st && st.total > 0 ? Math.round((st.correct / st.total) * 100) : null,
          sessions: st?.sessions || 0,
          flagged: st?.flagged || 0,
          total: st?.total || 0,
        };
      });
      // Add topics from sessions/struggled not in the syllabus
      Object.keys(topicStats).forEach(t => {
        if (!allTopics.includes(t)) {
          const st = topicStats[t];
          topics.push({
            topic: t,
            accuracy: st.total > 0 ? Math.round((st.correct / st.total) * 100) : null,
            sessions: st.sessions,
            flagged: st.flagged,
            total: st.total,
          });
        }
      });
      // Sort: topics with data first (worst accuracy first), then no-data ones
      topics.sort((a, b) => {
        if (a.accuracy != null && b.accuracy != null) return a.accuracy - b.accuracy;
        if (a.accuracy != null) return -1;
        if (b.accuracy != null) return 1;
        if (a.flagged !== b.flagged) return b.flagged - a.flagged;
        return 0;
      });
      const hasAnyData = topics.some(t => t.accuracy != null || t.flagged > 0);
      return { ...sub, topics, hasAnyData };
    }).filter(s => s.hasAnyData);
  }, [progress.questionSessions, progress.struggledQuestions]);

  return (
    <div className="improvements-page">
      <div className="page-header">
        <h1><Target size={28} /> Areas for Improvement</h1>
        <p className="page-header__subtitle">Review your weak topics, struggled questions, and areas that need more practice.</p>
      </div>

      {/* Overview cards */}
      <div className="improvements-overview">
        <div className="stat-card stat-card--large" style={{ borderColor: 'var(--danger)' }}>
          <div className="stat-card__icon" style={{ color: 'var(--danger)' }}><AlertTriangle size={32} /></div>
          <div className="stat-card__value">{struggled.length}</div>
          <div className="stat-card__label">Flagged Questions</div>
        </div>
        <div className="stat-card stat-card--large">
          <div className="stat-card__icon"><BookOpen size={32} /></div>
          <div className="stat-card__value">{topicList.length}</div>
          <div className="stat-card__label">Weak Topics</div>
        </div>
        <div className="stat-card stat-card--large">
          <div className="stat-card__icon"><Brain size={32} /></div>
          <div className="stat-card__value">{subjectTopicBreakdown.length}</div>
          <div className="stat-card__label">Subjects Tracked</div>
        </div>
      </div>

      {/* Average marks per subject */}
      {subjectAverages.length > 0 && (
        <div className="improvements-section">
          <h2><BarChart3 size={20} /> Average Marks by Subject</h2>
          <div className="imp-avg-grid">
            {subjectAverages.map(sub => (
              <Link key={sub.id} to={`/subject/${sub.id}`} className="imp-avg-card" style={{ '--subject-color': sub.color }}>
                <div className="imp-avg-card__header">{sub.icon} {sub.name}</div>
                <div className="imp-avg-card__stats">
                  {sub.avgPaper != null && (
                    <div className="imp-avg-card__stat">
                      <span className="imp-avg-card__label">📄 Papers</span>
                      <span className={`imp-avg-card__value ${sub.avgPaper < 50 ? 'imp-avg--bad' : sub.avgPaper < 75 ? 'imp-avg--ok' : 'imp-avg--good'}`}>{sub.avgPaper}%</span>
                      <span className="imp-avg-card__count">({sub.paperCount} papers)</span>
                    </div>
                  )}
                  {sub.avgQuestions != null && (
                    <div className="imp-avg-card__stat">
                      <span className="imp-avg-card__label">❓ Questions</span>
                      <span className={`imp-avg-card__value ${sub.avgQuestions < 50 ? 'imp-avg--bad' : sub.avgQuestions < 75 ? 'imp-avg--ok' : 'imp-avg--good'}`}>{sub.avgQuestions}%</span>
                      <span className="imp-avg-card__count">({sub.sessionCount} sessions)</span>
                    </div>
                  )}
                  {sub.avgFlashcard != null && (
                    <div className="imp-avg-card__stat">
                      <span className="imp-avg-card__label">🃏 Flashcards</span>
                      <span className="imp-avg-card__value">{sub.avgFlashcard}/5</span>
                      <span className="imp-avg-card__count">({sub.ratedCount} cards)</span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Papers to revisit */}
      {papersToRevisit.length > 0 && (
        <div className="improvements-section">
          <h2><RefreshCw size={20} /> Papers to Revisit</h2>
          <p className="improvements-section__desc">Papers you haven't completed for a while — consider going back to these.</p>
          <div className="imp-revisit-list">
            {papersToRevisit.map(p => (
              <Link key={p.id} to={p.subjectId ? `/subject/${p.subjectId}/papers` : '#'} className="imp-revisit-item">
                <div className="imp-revisit-item__info">
                  <span className="imp-revisit-item__subject">{p.subjectIcon} {p.subjectName}</span>
                  <span className="imp-revisit-item__title">{p.title}{p.year ? ` — ${p.year}` : ''}{p.month ? ` ${p.month}` : ''}</span>
                </div>
                <div className="imp-revisit-item__meta">
                  <span className="imp-revisit-item__days">{p.daysSince} days ago</span>
                  <span className="imp-revisit-item__date">Last: {p.lastCompleted ? new Date(p.lastCompleted).toLocaleDateString() : '—'}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Decks due for review */}
      {decksDue.length > 0 && (
        <div className="improvements-section">
          <h2><Layers size={20} /> Flashcard Decks to Review</h2>
          <div className="imp-decks-list">
            {decksDue.map(d => (
              <Link key={d.deckId} to={`/subject/${d.subjectId}/flashcards`} className="imp-deck-item">
                <div className="imp-deck-item__info">
                  <span className="imp-deck-item__subject">{d.subjectIcon} {d.subjectName}</span>
                  <span className="imp-deck-item__name">{d.deckName} <span className="imp-deck-item__level">{d.level === 'as' ? 'AS' : 'A2'}</span></span>
                </div>
                <div className="imp-deck-item__due">
                  <span className="imp-deck-item__count">{d.dueCount}</span>
                  <span className="imp-deck-item__label">/ {d.totalCards} due</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Question sessions to redo */}
      {sessionsToRedo.length > 0 && (
        <div className="improvements-section">
          <h2><Brain size={20} /> Question Sessions to Redo</h2>
          <p className="improvements-section__desc">Sessions where you scored below 70% — try these topics again.</p>
          <div className="imp-sessions-list">
            {sessionsToRedo.map(s => (
              <Link key={s.id} to={`/subject/${s.subjectId}/questions`} className="imp-session-item">
                <div className="imp-session-item__info">
                  <span className="imp-session-item__subject">{s.subjectIcon} {s.subjectName}</span>
                  <span className="imp-session-item__topic">{s.topic}</span>
                </div>
                <div className="imp-session-item__meta">
                  <span className={`imp-session-item__score ${s.accuracy < 50 ? 'imp-avg--bad' : 'imp-avg--ok'}`}>{s.accuracy}%</span>
                  <span className="imp-session-item__date">{new Date(s.completedAt || s.createdAt).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="improvements-filters">
        <select className="topic-select" value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}>
          <option value="all">All Subjects</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
        </select>
        <select className="topic-select" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
          <option value="all">All Sources</option>
          <option value="question">Practice Questions</option>
          <option value="paper">Past Papers</option>
        </select>
      </div>

      {/* Per-subject topic accuracy */}
      {subjectTopicBreakdown.length > 0 && (
        <div className="improvements-section">
          <h2><TrendingDown size={20} /> Topic Accuracy by Subject</h2>
          <p className="improvements-section__desc">How well you're performing in each topic within every subject.</p>
          <div className="imp-sub-topics">
            {subjectTopicBreakdown.map(sub => (
              <div key={sub.id} className="imp-sub-topic-card" style={{ '--subject-color': sub.color }}>
                <Link to={`/subject/${sub.id}`} className="imp-sub-topic-card__header">
                  <span>{sub.icon} {sub.name}</span>
                  <span className="imp-sub-topic-card__board">{sub.examBoard}</span>
                </Link>
                <div className="imp-sub-topic-card__topics">
                  {sub.topics.map(t => (
                    <Link key={t.topic} to={`/subject/${sub.id}/questions`} className="imp-sub-topic-row">
                      <span className="imp-sub-topic-row__name">{t.topic}</span>
                      <div className="imp-sub-topic-row__stats">
                        {t.accuracy != null ? (
                          <>
                            <div className="imp-sub-topic-row__bar">
                              <div className="imp-sub-topic-row__fill" style={{
                                width: `${t.accuracy}%`,
                                background: t.accuracy < 50 ? 'var(--danger)' : t.accuracy < 75 ? 'var(--warning)' : 'var(--success)'
                              }} />
                            </div>
                            <span className={`imp-sub-topic-row__pct ${t.accuracy < 50 ? 'imp-avg--bad' : t.accuracy < 75 ? 'imp-avg--ok' : 'imp-avg--good'}`}>{t.accuracy}%</span>
                          </>
                        ) : (
                          <>
                            <div className="imp-sub-topic-row__bar"><div className="imp-sub-topic-row__fill" style={{ width: 0 }} /></div>
                            <span className="imp-sub-topic-row__pct" style={{ color: 'var(--text-muted)' }}>—</span>
                          </>
                        )}
                        {t.flagged > 0 && <span className="imp-sub-topic-row__flag">⚠ {t.flagged}</span>}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Topics needing improvement */}
      {topicList.length > 0 && (
        <div className="improvements-section">
          <h2><Target size={20} /> Topics to Improve</h2>
          <p className="improvements-section__desc">Topics where you've flagged questions as difficult — focus your revision here.</p>
          <div className="weak-topics-list">
            {topicList.map(({ subjectId: sid, topic, items }) => {
              const subInfo = getSubjectInfo(sid);
              return (
                <div key={`${sid}:${topic}`} className="weak-topic-card">
                  <div className="weak-topic-card__header">
                    <span className="weak-topic-card__subject">{subInfo?.icon} {subInfo?.name}</span>
                    <span className="weak-topic-card__count">{items.length} flagged</span>
                  </div>
                  <h3 className="weak-topic-card__title">{topic}</h3>
                  <div className="weak-topic-card__items">
                    {items.map(item => (
                      <div key={item.id} className="weak-topic-item">
                        <div className="weak-topic-item__info">
                          <span className="weak-topic-item__source">{item.source === 'paper' ? '📄' : '❓'}</span>
                          <span className="weak-topic-item__text">{item.question}</span>
                          <span className="weak-topic-item__level">{item.level === 'as' ? 'AS' : 'A2'}</span>
                        </div>
                        <button className="weak-topic-item__remove" onClick={() => removeStruggled(item.id)} title="Remove flag">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Link to={`/subject/${sid}/questions`} className="action-btn action-btn--accent weak-topic-card__practice">
                    Practice this topic <ChevronRight size={14} />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Topic Performance Across Subjects */}
      {topicPerformance.length > 0 && (
        <div className="improvements-section">
          <h2><GitBranch size={20} /> Topic Performance</h2>
          <p className="improvements-section__desc">How well you're doing in each topic across all subjects — weakest first.</p>
          <div className="imp-topic-perf-list">
            {topicPerformance.map(t => (
              <Link key={`${t.subjectId}:${t.topic}`} to={`/subject/${t.subjectId}/questions`} className="imp-topic-perf-item">
                <div className="imp-topic-perf-item__info">
                  <span className="imp-topic-perf-item__subject">{t.subjectIcon} {t.subjectName}</span>
                  <span className="imp-topic-perf-item__topic">{t.topic}</span>
                </div>
                <div className="imp-topic-perf-item__stats">
                  {t.accuracy != null ? (
                    <>
                      <div className="imp-topic-perf-item__bar">
                        <div className="imp-topic-perf-item__fill" style={{
                          width: `${t.accuracy}%`,
                          background: t.accuracy < 50 ? 'var(--danger)' : t.accuracy < 75 ? 'var(--warning)' : 'var(--success)'
                        }} />
                      </div>
                      <span className={`imp-topic-perf-item__pct ${t.accuracy < 50 ? 'imp-avg--bad' : t.accuracy < 75 ? 'imp-avg--ok' : 'imp-avg--good'}`}>{t.accuracy}%</span>
                    </>
                  ) : (
                    <span className="imp-topic-perf-item__pct" style={{ color: 'var(--text-muted)' }}>—</span>
                  )}
                  <span className="imp-topic-perf-item__count">{t.sessions} session{t.sessions !== 1 ? 's' : ''}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Paper completion times with labels */}
      {paperCompletionEntries.length > 0 && (
        <div className="improvements-section">
          <h2><Clock size={20} /> Paper Completion Times</h2>
          <div className="time-log-list">
            {paperCompletionEntries.map(entry => (
              <Link key={entry.id} to={entry.subjectId ? `/subject/${entry.subjectId}/papers` : '#'} className="time-log-item time-log-item--link">
                <div className="time-log-item__info">
                  <span className="time-log-item__subject">{entry.subjectIcon} {entry.subjectName}</span>
                  <span className="time-log-item__title">{entry.title}{entry.year ? ` — ${entry.year}` : ''}{entry.month ? ` ${entry.month}` : ''}</span>
                </div>
                <div className="time-log-item__right">
                  <span className="time-log-item__time">{formatTimer(entry.elapsed)}</span>
                  <span className="time-log-item__date">{entry.completedDate}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* All flagged questions list */}
      {filtered.length > 0 ? (
        <div className="improvements-section">
          <h2><AlertTriangle size={20} /> All Flagged Questions ({filtered.length})</h2>
          <div className="flagged-list">
            {filtered.sort((a, b) => b.timestamp - a.timestamp).map(item => {
              const subInfo = getSubjectInfo(item.subjectId);
              return (
                <div key={item.id} className="flagged-item">
                  <div className="flagged-item__main">
                    <div className="flagged-item__header">
                      <span className="flagged-item__subject">{subInfo?.icon} {subInfo?.name}</span>
                      <span className="flagged-item__topic">{item.topic}</span>
                      <span className="flagged-item__level">{item.level === 'as' ? 'AS' : 'A2'}</span>
                      <span className={`flagged-item__source flagged-item__source--${item.source}`}>
                        {item.source === 'paper' ? '📄 Paper' : '❓ Question'}
                      </span>
                    </div>
                    <p className="flagged-item__question">{item.question}</p>
                    {item.paperYear && (
                      <span className="flagged-item__paper-info">{item.paperName} — {item.paperYear} {item.paperSession}</span>
                    )}
                    <span className="flagged-item__date">{new Date(item.timestamp).toLocaleDateString()}</span>
                  </div>
                  <button className="flagged-item__remove" onClick={() => removeStruggled(item.id)} title="Remove flag">
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <Target size={48} />
          <h3>No flagged questions yet</h3>
          <p>When you struggle with a question during practice or past papers, flag it to track areas for improvement.</p>
        </div>
      )}
    </div>
  );
}

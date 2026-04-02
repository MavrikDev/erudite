import { useState, useMemo, useEffect } from 'react';
import { useProgress } from '../contexts/ProgressContext';
import { subjects } from '../data/subjects';
import { Link } from 'react-router-dom';
import { Clock, Brain, CreditCard, FileText, TrendingUp, Flame, RotateCcw, Award, ChevronDown, ExternalLink, Target, BookOpen, BarChart3 } from 'lucide-react';

const METRICS = [
  { id: 'accuracy', label: 'Question Accuracy', unit: '%', format: v => `${Math.round(v)}%` },
  { id: 'papers', label: 'Papers Completed', unit: '', format: v => String(Math.round(v)) },
  { id: 'flagged', label: 'Flagged Questions', unit: '', format: v => String(Math.round(v)) },
  { id: 'studyTime', label: 'Study Time', unit: 'min', format: v => `${Math.round(v)}m` },
  { id: 'sessionScore', label: 'Session Scores', unit: '%', format: v => `${Math.round(v)}%` },
  { id: 'paperSpeed', label: 'Paper Completion Time', unit: 'min', format: v => `${Math.round(v)}m` },
];

const RANGES = [
  { id: '7d', label: '7 Days', days: 7 },
  { id: '30d', label: '30 Days', days: 30 },
  { id: '90d', label: '90 Days', days: 90 },
  { id: 'all', label: 'All Time', days: Infinity },
];

function dateKey(ts) {
  return new Date(ts).toISOString().split('T')[0];
}

const PAGE_SIZE = 8;

function PaperHistory({ progress }) {
  const [showCount, setShowCount] = useState(PAGE_SIZE);
  const getSubjectInfo = (id) => subjects.find(s => s.id === id);

  const formatTime = (secs) => {
    if (!secs) return '—';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Merge completion history + legacy completions (papers without history entries)
  const entries = useMemo(() => {
    const history = progress.paperCompletionHistory || [];
    const paperTimeLogs = progress.paperTimeLogs || {};

    // Legacy entries: papers in pastPapersCompleted that have no history entry
    const historyPaperIds = new Set(history.map(h => h.paperId));
    const legacyIds = (progress.pastPapersCompleted || []).filter(id => !historyPaperIds.has(id));

    // Build legacy entries from localStorage paper data + time logs
    const legacyEntries = legacyIds.map(paperId => {
      const log = paperTimeLogs[paperId];
      // Try to find paper in localStorage
      let paperData = null;
      let foundSubjectId = null;
      let foundLevel = null;
      for (const sub of subjects) {
        try {
          const stored = JSON.parse(localStorage.getItem(`solorev-user-papers-${sub.id}`) || '{}');
          for (const lev of ['as', 'a2']) {
            const found = (stored[lev] || []).find(p => p.id === paperId);
            if (found) { paperData = found; foundSubjectId = sub.id; foundLevel = lev; break; }
          }
          if (paperData) break;
        } catch { /* skip */ }
      }
      return {
        id: `legacy-${paperId}`,
        paperId,
        subjectId: foundSubjectId,
        level: foundLevel,
        title: paperData?.title || paperId,
        year: paperData?.year,
        month: paperData?.month,
        paperNumber: paperData?.paperNumber,
        score: paperData?.score,
        totalMarks: paperData?.totalMarks,
        elapsed: log?.elapsed || null,
        completedAt: log?.timestamp || null,
        createdAt: paperData?.createdAt || null,
      };
    });

    return [...history, ...legacyEntries].sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  }, [progress]);

  const visible = entries.slice(0, showCount);
  const hasMore = showCount < entries.length;

  return (
    <div className="progress-papers">
      <div className="progress-papers__header">
        <h2><FileText size={20} /> Past Papers Completed</h2>
        <span className="progress-papers__count">{entries.length} completion{entries.length !== 1 ? 's' : ''}</span>
      </div>

      {entries.length === 0 ? (
        <div className="progress-papers__empty">No papers completed yet. Go to a subject and complete a past paper to see your history here.</div>
      ) : (
        <>
          <div className="paper-history">
            {visible.map(entry => {
              const sub = getSubjectInfo(entry.subjectId);
              const pct = (entry.score != null && entry.totalMarks) ? Math.round((entry.score / entry.totalMarks) * 100) : null;
              return (
                <Link
                  key={entry.id}
                  to={`/subject/${entry.subjectId}/papers?open=${entry.paperId}`}
                  className="paper-history__item"
                  style={{ '--sub-color': sub?.color || 'var(--accent)' }}
                >
                  <div className="paper-history__left">
                    <span className="paper-history__icon">{sub?.icon || '📄'}</span>
                    <div className="paper-history__info">
                      <div className="paper-history__title">{entry.title}</div>
                      <div className="paper-history__meta">
                        {entry.year && <span>{entry.year}</span>}
                        {entry.month && <span>{entry.month}</span>}
                        {entry.paperNumber && <span>Paper {entry.paperNumber}</span>}
                        <span>{sub?.name || 'Unknown'}</span>
                        {entry.level && <span className="paper-history__level">{entry.level === 'as' ? 'AS' : 'A2'}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="paper-history__right">
                    {pct != null && (
                      <div className="paper-history__score" style={{ color: pct >= 70 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                        <Award size={14} />
                        <span>{entry.score}/{entry.totalMarks}</span>
                        <span className="paper-history__pct">({pct}%)</span>
                      </div>
                    )}
                    {entry.elapsed != null && (
                      <div className="paper-history__time"><Clock size={13} /> {formatTime(entry.elapsed)}</div>
                    )}
                    <div className="paper-history__dates">
                      {entry.completedAt && <span>Completed {formatDate(entry.completedAt)}</span>}
                      {entry.createdAt && <span>Imported {formatDate(entry.createdAt)}</span>}
                    </div>
                    <ExternalLink size={14} className="paper-history__arrow" />
                  </div>
                </Link>
              );
            })}
          </div>
          {hasMore && (
            <button className="paper-history__more" onClick={() => setShowCount(c => c + PAGE_SIZE)}>
              <ChevronDown size={16} /> Show More ({entries.length - showCount} remaining)
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ProgressGraph({ progress }) {
  const savedPrefs = (() => { try { return JSON.parse(localStorage.getItem('solorev-progress-prefs')); } catch { return null; } })();
  const [metric, setMetric] = useState(savedPrefs?.metric || 'accuracy');
  const [range, setRange] = useState(savedPrefs?.range || '30d');
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [hiddenSubjects, setHiddenSubjects] = useState(savedPrefs?.hiddenSubjects || {});

  useEffect(() => {
    localStorage.setItem('solorev-progress-prefs', JSON.stringify({ metric, range, hiddenSubjects }));
  }, [metric, range, hiddenSubjects]);

  const toggleSubject = (id) => setHiddenSubjects(prev => ({ ...prev, [id]: !prev[id] }));

  // Load all user papers from localStorage
  const allPapersMap = useMemo(() => {
    const map = {};
    subjects.forEach(sub => {
      try {
        const stored = JSON.parse(localStorage.getItem(`solorev-user-papers-${sub.id}`) || '{}');
        for (const level of ['as', 'a2']) {
          (stored[level] || []).forEach(paper => {
            map[paper.id] = { ...paper, subjectId: sub.id };
          });
        }
      } catch { /* skip */ }
    });
    return map;
  }, []);

  // Build daily data points per subject per metric
  const chartData = useMemo(() => {
    const { questionSessions = [], paperTimeLogs = {}, struggledQuestions = [], dailyStudyTime = {}, pastPapersCompleted = [] } = progress;

    // Gather all dates with any activity
    const dateSet = new Set();
    questionSessions.forEach(s => { if (s.completedAt) dateSet.add(dateKey(s.completedAt)); });
    Object.values(paperTimeLogs).forEach(l => { if (l.timestamp) dateSet.add(dateKey(l.timestamp)); });
    struggledQuestions.forEach(s => { if (s.timestamp) dateSet.add(dateKey(s.timestamp)); });
    Object.keys(dailyStudyTime).forEach(d => dateSet.add(d));

    if (dateSet.size === 0) return { dates: [], series: {} };

    const allDates = [...dateSet].sort();
    const minDate = allDates[0];
    const maxDate = allDates[allDates.length - 1];

    // Fill in gaps — create continuous date range
    const dates = [];
    const d = new Date(minDate + 'T00:00:00');
    const end = new Date(maxDate + 'T00:00:00');
    while (d <= end) {
      dates.push(d.toISOString().split('T')[0]);
      d.setDate(d.getDate() + 1);
    }

    // Pre-bucket events by date and subject
    const sessionsByDateSub = {};
    questionSessions.forEach(s => {
      if (!s.completedAt || !s.subjectId) return;
      const dk = dateKey(s.completedAt);
      const key = `${dk}:${s.subjectId}`;
      if (!sessionsByDateSub[key]) sessionsByDateSub[key] = [];
      sessionsByDateSub[key].push(s);
    });

    const papersByDateSub = {};
    pastPapersCompleted.forEach(pid => {
      const log = paperTimeLogs[pid];
      const paper = allPapersMap[pid];
      if (!log?.timestamp || !paper?.subjectId) return;
      const dk = dateKey(log.timestamp);
      const key = `${dk}:${paper.subjectId}`;
      if (!papersByDateSub[key]) papersByDateSub[key] = [];
      papersByDateSub[key].push({ elapsed: log.elapsed });
    });

    const flaggedByDateSub = {};
    struggledQuestions.forEach(sq => {
      if (!sq.timestamp || !sq.subjectId) return;
      const dk = dateKey(sq.timestamp);
      const key = `${dk}:${sq.subjectId}`;
      flaggedByDateSub[key] = (flaggedByDateSub[key] || 0) + 1;
    });

    // Build cumulative series per subject
    const series = {};
    subjects.forEach(sub => {
      const id = sub.id;
      let cumPapers = 0;
      let cumFlagged = 0;
      let totalCorrect = 0;
      let totalAttempted = 0;

      series[id] = dates.map(dk => {
        const sessKey = `${dk}:${id}`;
        const daySessions = sessionsByDateSub[sessKey] || [];
        const dayPapers = papersByDateSub[sessKey] || [];
        const dayFlagged = flaggedByDateSub[sessKey] || 0;

        // Accuracy: running total
        daySessions.forEach(s => {
          totalCorrect += (s.score || 0);
          totalAttempted += (s.questionCount || s.questions?.length || 0);
        });

        cumPapers += dayPapers.length;
        cumFlagged += dayFlagged;

        // Study time for this subject on this day
        // dailyStudyTime is global, not per-subject, so we split proportionally by sessions
        const globalTime = (dailyStudyTime[dk] || 0) / 60; // minutes

        // Session scores — average for the day
        const dayScores = daySessions.filter(s => s.questionCount > 0).map(s => Math.round((s.score / s.questionCount) * 100));
        const avgScore = dayScores.length > 0 ? dayScores.reduce((a, b) => a + b, 0) / dayScores.length : null;

        // Paper speed — average for the day  
        const paperSpeeds = dayPapers.filter(p => p.elapsed > 0).map(p => p.elapsed / 60);
        const avgPaperSpeed = paperSpeeds.length > 0 ? paperSpeeds.reduce((a, b) => a + b, 0) / paperSpeeds.length : null;

        return {
          date: dk,
          accuracy: totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : null,
          papers: cumPapers,
          flagged: cumFlagged,
          studyTime: globalTime > 0 ? globalTime : null,
          sessionScore: avgScore,
          paperSpeed: avgPaperSpeed,
        };
      });
    });

    return { dates, series };
  }, [progress, allPapersMap]);

  // Apply range filter
  const rangeDays = RANGES.find(r => r.id === range)?.days || 30;
  const filteredDates = rangeDays === Infinity
    ? chartData.dates
    : chartData.dates.slice(-rangeDays);
  const startIdx = chartData.dates.length - filteredDates.length;

  const metricInfo = METRICS.find(m => m.id === metric);

  // Compute SVG paths
  const W = 800, H = 320, PAD = { top: 20, right: 20, bottom: 40, left: 50 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const visibleSubjects = subjects.filter(s => !hiddenSubjects[s.id]);

  // Get all values in range for Y-axis scale
  const allValues = [];
  visibleSubjects.forEach(sub => {
    const data = chartData.series[sub.id];
    if (!data) return;
    filteredDates.forEach((_, i) => {
      const val = data[startIdx + i]?.[metric];
      if (val != null) allValues.push(val);
    });
  });

  const yMin = 0;
  const yMax = allValues.length > 0 ? Math.max(...allValues) * 1.1 || 1 : 1;

  // Generate Y-axis ticks
  const yTickCount = 5;
  const yStep = yMax / yTickCount;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => Math.round(i * yStep));

  // Generate X-axis labels (show ~6 labels)
  const xLabelInterval = Math.max(1, Math.floor(filteredDates.length / 6));

  const getX = (i) => PAD.left + (filteredDates.length > 1 ? (i / (filteredDates.length - 1)) * plotW : plotW / 2);
  const getY = (v) => PAD.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  const buildPath = (subId) => {
    const data = chartData.series[subId];
    if (!data) return '';
    const points = [];
    filteredDates.forEach((_, i) => {
      const val = data[startIdx + i]?.[metric];
      if (val != null) points.push({ x: getX(i), y: getY(val), i });
    });
    if (points.length === 0) return '';
    return points.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  };

  // Find point data for hover
  const getPointsAtIndex = (idx) => {
    return visibleSubjects.map(sub => {
      const data = chartData.series[sub.id];
      if (!data) return null;
      const val = data[startIdx + idx]?.[metric];
      if (val == null) return null;
      return { subject: sub, value: val };
    }).filter(Boolean);
  };

  const hasData = allValues.length > 0;

  return (
    <div className="prog-graph">
      <div className="prog-graph__header">
        <h2>📊 Progress Over Time</h2>
        <div className="prog-graph__controls">
          <div className="prog-graph__select-group">
            <select className="prog-graph__select" value={metric} onChange={e => setMetric(e.target.value)}>
              {METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="prog-graph__ranges">
            {RANGES.map(r => (
              <button key={r.id} className={`prog-graph__range ${range === r.id ? 'prog-graph__range--active' : ''}`} onClick={() => setRange(r.id)}>{r.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="prog-graph__legend">
        {subjects.map(sub => (
          <button key={sub.id} className={`prog-graph__legend-item ${hiddenSubjects[sub.id] ? 'prog-graph__legend-item--hidden' : ''}`} onClick={() => toggleSubject(sub.id)}>
            <span className="prog-graph__legend-dot" style={{ background: hiddenSubjects[sub.id] ? 'var(--text-muted)' : sub.color }} />
            <span>{sub.icon} {sub.name}</span>
          </button>
        ))}
      </div>

      {!hasData ? (
        <div className="prog-graph__empty">
          <p>No data yet. Complete some questions, papers, or study sessions to see your progress over time.</p>
        </div>
      ) : (
        <div className="prog-graph__chart-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} className="prog-graph__svg" onMouseLeave={() => setHoveredPoint(null)}>
            {/* Grid lines */}
            {yTicks.map((tick, i) => (
              <g key={i}>
                <line x1={PAD.left} x2={W - PAD.right} y1={getY(tick)} y2={getY(tick)} stroke="var(--card-border)" strokeWidth="1" strokeDasharray={i === 0 ? '' : '4 4'} />
                <text x={PAD.left - 8} y={getY(tick) + 4} textAnchor="end" fill="var(--text-muted)" fontSize="11">{metricInfo.format(tick)}</text>
              </g>
            ))}

            {/* X-axis labels */}
            {filteredDates.map((dk, i) => {
              if (i % xLabelInterval !== 0 && i !== filteredDates.length - 1) return null;
              const parts = dk.split('-');
              const label = `${parseInt(parts[2])}/${parseInt(parts[1])}`;
              return <text key={i} x={getX(i)} y={H - 8} textAnchor="middle" fill="var(--text-muted)" fontSize="11">{label}</text>;
            })}

            {/* Lines */}
            {visibleSubjects.map(sub => {
              const path = buildPath(sub.id);
              if (!path) return null;
              return <path key={sub.id} d={path} fill="none" stroke={sub.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />;
            })}

            {/* Data points */}
            {visibleSubjects.map(sub => {
              const data = chartData.series[sub.id];
              if (!data) return null;
              return filteredDates.map((_, i) => {
                const val = data[startIdx + i]?.[metric];
                if (val == null) return null;
                return <circle key={`${sub.id}-${i}`} cx={getX(i)} cy={getY(val)} r={hoveredPoint === i ? 5 : 3} fill={sub.color} stroke="var(--card-bg)" strokeWidth="2" />;
              });
            })}

            {/* Hover overlay */}
            {filteredDates.map((_, i) => (
              <rect key={i} x={getX(i) - (plotW / filteredDates.length / 2)} y={PAD.top} width={plotW / filteredDates.length} height={plotH} fill="transparent" onMouseEnter={() => setHoveredPoint(i)} />
            ))}

            {/* Hover line */}
            {hoveredPoint != null && (
              <line x1={getX(hoveredPoint)} x2={getX(hoveredPoint)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
            )}
          </svg>

          {/* Tooltip */}
          {hoveredPoint != null && (
            <div className="prog-graph__tooltip" style={{ left: `${(getX(hoveredPoint) / W) * 100}%` }}>
              <div className="prog-graph__tooltip-date">{filteredDates[hoveredPoint]}</div>
              {getPointsAtIndex(hoveredPoint).map(p => (
                <div key={p.subject.id} className="prog-graph__tooltip-row">
                  <span className="prog-graph__tooltip-dot" style={{ background: p.subject.color }} />
                  <span>{p.subject.icon} {metricInfo.format(p.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProgressPage() {
  const { progress, resetProgress } = useProgress();

  const formatStudyTime = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const accuracy = progress.questionsAttempted > 0
    ? Math.round((progress.questionsCorrect / progress.questionsAttempted) * 100)
    : 0;

  // Last 30 days study data
  const last30Days = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.now() - (29 - i) * 86400000);
    const key = date.toISOString().split('T')[0];
    return {
      date: key,
      day: date.getDate(),
      time: progress.dailyStudyTime[key] || 0
    };
  });
  const maxDaily = Math.max(...last30Days.map(d => d.time), 1);

  // Weekly totals
  const thisWeekTotal = last30Days.slice(-7).reduce((sum, d) => sum + d.time, 0);
  const lastWeekTotal = last30Days.slice(-14, -7).reduce((sum, d) => sum + d.time, 0);
  const weekChange = lastWeekTotal > 0 ? Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100) : 0;

  // Average stats
  const avgStats = useMemo(() => {
    const sessions = progress.questionSessions || [];
    const completionHistory = progress.paperCompletionHistory || [];
    const paperTimeLogs = progress.paperTimeLogs || {};
    const dailyStudyTime = progress.dailyStudyTime || {};

    // Avg paper score %
    const paperScores = completionHistory.filter(c => c.score != null && c.totalMarks > 0).map(c => (c.score / c.totalMarks) * 100);
    const avgPaperScore = paperScores.length > 0 ? Math.round(paperScores.reduce((a, b) => a + b, 0) / paperScores.length) : null;

    // Avg session score %
    const sessionScores = sessions.filter(s => s.questionCount > 0 && s.score != null).map(s => (s.score / s.questionCount) * 100);
    const avgSessionScore = sessionScores.length > 0 ? Math.round(sessionScores.reduce((a, b) => a + b, 0) / sessionScores.length) : null;

    // Avg paper completion time (seconds)
    const paperTimes = Object.values(paperTimeLogs).filter(l => l.elapsed > 0).map(l => l.elapsed);
    const avgPaperTime = paperTimes.length > 0 ? Math.round(paperTimes.reduce((a, b) => a + b, 0) / paperTimes.length) : null;

    // Avg daily study time (only days with activity)
    const activeDays = Object.values(dailyStudyTime).filter(t => t > 0);
    const avgDailyStudy = activeDays.length > 0 ? Math.round(activeDays.reduce((a, b) => a + b, 0) / activeDays.length) : null;

    // Total flashcard decks & cards
    const decks = progress.flashcardDecks || {};
    let totalCards = 0;
    Object.values(decks).forEach(subDecks => { subDecks.forEach(d => { totalCards += d.cards?.length || 0; }); });

    // Papers completed count
    const papersCompleted = (progress.pastPapersCompleted || []).length;

    return { avgPaperScore, avgSessionScore, avgPaperTime, avgDailyStudy, totalCards, papersCompleted, activeDays: activeDays.length };
  }, [progress]);

  return (
    <div className="progress-page">
      <div className="page-header">
        <h1><TrendingUp size={28} /> Progress Overview</h1>
      </div>

      <div className="progress-overview">
        <div className="stat-card stat-card--large">
          <div className="stat-card__icon"><Flame size={32} /></div>
          <div className="stat-card__value">{progress.streak}</div>
          <div className="stat-card__label">Day Streak</div>
        </div>
        <div className="stat-card stat-card--large">
          <div className="stat-card__icon"><Clock size={32} /></div>
          <div className="stat-card__value">{formatStudyTime(progress.totalStudyTime)}</div>
          <div className="stat-card__label">Total Study Time</div>
        </div>
        <div className="stat-card stat-card--large">
          <div className="stat-card__icon"><Brain size={32} /></div>
          <div className="stat-card__value">{progress.questionsAttempted}</div>
          <div className="stat-card__label">Questions Attempted</div>
        </div>
        <div className="stat-card stat-card--large">
          <div className="stat-card__icon"><Award size={32} /></div>
          <div className="stat-card__value">{accuracy}%</div>
          <div className="stat-card__label">Overall Accuracy</div>
        </div>
      </div>

      <div className="progress-averages">
        <h2><BarChart3 size={20} /> Averages</h2>
        <div className="progress-averages__grid">
          <div className="avg-card">
            <div className="avg-card__value">{avgStats.avgPaperScore != null ? `${avgStats.avgPaperScore}%` : '—'}</div>
            <div className="avg-card__label">Avg Paper Score</div>
            <div className="avg-card__sub">{avgStats.papersCompleted} paper{avgStats.papersCompleted !== 1 ? 's' : ''} completed</div>
          </div>
          <div className="avg-card">
            <div className="avg-card__value">{avgStats.avgSessionScore != null ? `${avgStats.avgSessionScore}%` : '—'}</div>
            <div className="avg-card__label">Avg Session Score</div>
            <div className="avg-card__sub">{(progress.questionSessions || []).length} session{(progress.questionSessions || []).length !== 1 ? 's' : ''}</div>
          </div>
          <div className="avg-card">
            <div className="avg-card__value">{avgStats.avgPaperTime != null ? formatStudyTime(avgStats.avgPaperTime) : '—'}</div>
            <div className="avg-card__label">Avg Paper Time</div>
            <div className="avg-card__sub">Per completion</div>
          </div>
          <div className="avg-card">
            <div className="avg-card__value">{avgStats.avgDailyStudy != null ? formatStudyTime(avgStats.avgDailyStudy) : '—'}</div>
            <div className="avg-card__label">Avg Daily Study</div>
            <div className="avg-card__sub">{avgStats.activeDays} active day{avgStats.activeDays !== 1 ? 's' : ''}</div>
          </div>
          <div className="avg-card">
            <div className="avg-card__value">{progress.flashcardsReviewed}</div>
            <div className="avg-card__label">Flashcards Reviewed</div>
            <div className="avg-card__sub">{avgStats.totalCards} total cards</div>
          </div>
          <div className="avg-card">
            <div className="avg-card__value">{(progress.struggledQuestions || []).length}</div>
            <div className="avg-card__label">Flagged Questions</div>
            <div className="avg-card__sub">Needs review</div>
          </div>
        </div>
      </div>

      <ProgressGraph progress={progress} />

      <div className="progress-chart-section">
        <div className="progress-chart-header">
          <h2>Study Activity (Last 30 Days)</h2>
          <div className="progress-chart-summary">
            <span>This week: {formatStudyTime(thisWeekTotal)}</span>
            {weekChange !== 0 && (
              <span className={weekChange > 0 ? 'text-success' : 'text-danger'}>
                {weekChange > 0 ? '↑' : '↓'} {Math.abs(weekChange)}% vs last week
              </span>
            )}
          </div>
        </div>
        <div className="activity-chart">
          {last30Days.map((d, i) => (
            <div key={i} className="activity-chart__col" title={`${d.date}: ${formatStudyTime(d.time)}`}>
              <div className="activity-chart__bar-wrap">
                <div className="activity-chart__bar" style={{ height: `${(d.time / maxDaily) * 100}%` }} />
              </div>
              {(i % 5 === 0 || i === 29) && <span className="activity-chart__label">{d.day}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="progress-subjects">
        <h2>Subject Breakdown</h2>
        <div className="subject-progress-grid">
          {subjects.map(subject => {
            const sp = progress.subjectProgress[subject.id] || {};
            const levels = ['as', 'a2'];
            return (
              <div key={subject.id} className="subject-progress-card" style={{ '--subject-color': subject.color }}>
                <div className="subject-progress-card__header">
                  <span>{subject.icon}</span>
                  <h3>{subject.name}</h3>
                  <span className="subject-progress-card__board">{subject.examBoard}</span>
                </div>
                <div className="subject-progress-card__levels">
                  {levels.map(lev => {
                    const data = sp[lev] || { attempted: 0, correct: 0, flashcards: 0, timeSpent: 0 };
                    const acc = data.attempted > 0 ? Math.round((data.correct / data.attempted) * 100) : 0;
                    return (
                      <div key={lev} className="level-progress">
                        <h4>{lev === 'as' ? 'AS Level' : 'A Level'}</h4>
                        <div className="level-progress__stats">
                          <div className="level-progress__stat">
                            <Brain size={14} />
                            <span>{data.attempted} questions ({acc}%)</span>
                          </div>
                          <div className="level-progress__stat">
                            <CreditCard size={14} />
                            <span>{data.flashcards} cards</span>
                          </div>
                          <div className="level-progress__stat">
                            <Clock size={14} />
                            <span>{formatStudyTime(data.timeSpent)}</span>
                          </div>
                        </div>
                        {data.attempted > 0 && (
                          <div className="level-progress__bar">
                            <div className="level-progress__fill" style={{ width: `${acc}%` }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <PaperHistory progress={progress} />

      <div className="progress-actions">
        <button className="action-btn action-btn--danger" onClick={() => {
          if (window.confirm('Are you sure you want to reset all progress? This cannot be undone.')) {
            resetProgress();
          }
        }}>
          <RotateCcw size={16} /> Reset All Progress
        </button>
      </div>
    </div>
  );
}

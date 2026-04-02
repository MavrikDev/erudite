import { Link } from 'react-router-dom';
import { subjects } from '../data/subjects';
import { useProgress } from '../contexts/ProgressContext';
import { useTimer } from '../contexts/TimerContext';
import { BookOpen, Brain, Clock, Flame, TrendingUp, CreditCard, FileText, ChevronRight } from 'lucide-react';

export default function Dashboard() {
  const { progress } = useProgress();
  const { formatTime } = useTimer();

  const formatStudyTime = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const today = new Date().toISOString().split('T')[0];
  const todayTime = progress.dailyStudyTime[today] || 0;
  const accuracy = progress.questionsAttempted > 0
    ? Math.round((progress.questionsCorrect / progress.questionsAttempted) * 100)
    : 0;

  // Get last 7 days study data
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.now() - (6 - i) * 86400000);
    const key = date.toISOString().split('T')[0];
    return {
      day: date.toLocaleDateString('en', { weekday: 'short' }),
      time: progress.dailyStudyTime[key] || 0
    };
  });
  const maxTime = Math.max(...last7Days.map(d => d.time), 1);

  return (
    <div className="dashboard">
      <div className="dashboard__welcome">
        <h1>Welcome back! 📚</h1>
        <p>Ready to revise? Pick a subject or continue where you left off.</p>
      </div>

      <div className="dashboard__stats">
        <div className="stat-card stat-card--accent">
          <div className="stat-card__icon"><Flame size={24} /></div>
          <div className="stat-card__value">{progress.streak}</div>
          <div className="stat-card__label">Day Streak</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon"><Clock size={24} /></div>
          <div className="stat-card__value">{formatStudyTime(todayTime)}</div>
          <div className="stat-card__label">Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon"><Brain size={24} /></div>
          <div className="stat-card__value">{progress.questionsAttempted}</div>
          <div className="stat-card__label">Questions Done</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon"><TrendingUp size={24} /></div>
          <div className="stat-card__value">{accuracy}%</div>
          <div className="stat-card__label">Accuracy</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon"><CreditCard size={24} /></div>
          <div className="stat-card__value">{progress.flashcardsReviewed}</div>
          <div className="stat-card__label">Cards Reviewed</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon"><Clock size={24} /></div>
          <div className="stat-card__value">{formatStudyTime(progress.totalStudyTime)}</div>
          <div className="stat-card__label">Total Study Time</div>
        </div>
      </div>

      <div className="dashboard__chart">
        <h2>This Week</h2>
        <div className="mini-chart">
          {last7Days.map((d, i) => (
            <div key={i} className="mini-chart__col">
              <div className="mini-chart__bar-wrap">
                <div
                  className="mini-chart__bar"
                  style={{ height: `${(d.time / maxTime) * 100}%` }}
                  title={`${formatStudyTime(d.time)}`}
                />
              </div>
              <span className="mini-chart__label">{d.day}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="dashboard__subjects">
        <h2>Your Subjects</h2>
        <div className="subject-cards">
          {subjects.map(subject => {
            const sp = progress.subjectProgress[subject.id] || {};
            const totalAttempted = (sp.as?.attempted || 0) + (sp.a2?.attempted || 0);
            const totalCorrect = (sp.as?.correct || 0) + (sp.a2?.correct || 0);
            const subAccuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;
            const totalTime = (sp.as?.timeSpent || 0) + (sp.a2?.timeSpent || 0);

            return (
              <Link key={subject.id} to={`/subject/${subject.id}`} className="subject-card" style={{ '--subject-color': subject.color }}>
                <div className="subject-card__header">
                  <span className="subject-card__icon">{subject.icon}</span>
                  <span className="subject-card__board">{subject.examBoard}</span>
                </div>
                <h3>{subject.name}</h3>
                <div className="subject-card__stats">
                  <span><Brain size={14} /> {totalAttempted} questions ({subAccuracy}%)</span>
                  <span><Clock size={14} /> {formatStudyTime(totalTime)}</span>
                </div>
                <div className="subject-card__arrow"><ChevronRight size={18} /></div>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="dashboard__quick-links">
        <h2>Quick Access</h2>
        <div className="quick-links">
          {subjects.map(s => (
            <div key={s.id} className="quick-link-group">
              <span className="quick-link-group__title">{s.icon} {s.name}</span>
              <div className="quick-link-group__links">
                <Link to={`/subject/${s.id}/flashcards`} className="quick-link"><CreditCard size={14} /> Flash Cards</Link>
                <Link to={`/subject/${s.id}/questions`} className="quick-link"><Brain size={14} /> Questions</Link>
                <Link to={`/subject/${s.id}/papers`} className="quick-link"><FileText size={14} /> Papers</Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

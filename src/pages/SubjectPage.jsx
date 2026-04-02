import { useParams, Link } from 'react-router-dom';
import { getSubject } from '../data/subjects';
import { flashcards } from '../data/flashcards';
import { questions } from '../data/questions';
import { pastPapers } from '../data/pastPapers';
import { useProgress } from '../contexts/ProgressContext';
import { useState } from 'react';
import { CreditCard, Brain, FileText, ChevronRight, BookOpen, TrendingUp } from 'lucide-react';

export default function SubjectPage() {
  const { subjectId } = useParams();
  const subject = getSubject(subjectId);
  const { progress } = useProgress();
  const [level, setLevel] = useState('as');

  if (!subject) return <div className="page-error">Subject not found. <Link to="/">Go home</Link></div>;

  const subProgress = progress.subjectProgress[subjectId]?.[level] || { attempted: 0, correct: 0, flashcards: 0, timeSpent: 0 };
  const cardCount = flashcards[subjectId]?.[level]?.length || 0;
  const questionCount = questions[subjectId]?.[level]?.length || 0;
  const paperCount = pastPapers[subjectId]?.[level]?.length || 0;
  const completedPapers = (pastPapers[subjectId]?.[level] || []).filter(p => progress.pastPapersCompleted.includes(p.id)).length;
  const accuracy = subProgress.attempted > 0 ? Math.round((subProgress.correct / subProgress.attempted) * 100) : 0;

  const formatStudyTime = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  return (
    <div className="subject-page">
      <div className="page-header">
        <div className="subject-header" style={{ '--subject-color': subject.color }}>
          <span className="subject-header__icon">{subject.icon}</span>
          <div>
            <h1>{subject.name}</h1>
            <p className="page-header__subtitle">{subject.examBoard} - {subject.specCode}</p>
          </div>
        </div>
      </div>

      <div className="level-toggle">
        <button className={`level-btn ${level === 'as' ? 'level-btn--active' : ''}`} onClick={() => setLevel('as')}>
          AS Level
        </button>
        <button className={`level-btn ${level === 'a2' ? 'level-btn--active' : ''}`} onClick={() => setLevel('a2')}>
          A Level
        </button>
      </div>

      <div className="subject-stats">
        <div className="stat-card">
          <div className="stat-card__value">{subProgress.attempted}</div>
          <div className="stat-card__label">Questions Attempted</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{accuracy}%</div>
          <div className="stat-card__label">Accuracy</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{subProgress.flashcards}</div>
          <div className="stat-card__label">Cards Reviewed</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{formatStudyTime(subProgress.timeSpent)}</div>
          <div className="stat-card__label">Study Time</div>
        </div>
      </div>

      <div className="subject-resources">
        <Link to={`/subject/${subjectId}/flashcards`} className="resource-card">
          <div className="resource-card__icon"><CreditCard size={32} /></div>
          <div className="resource-card__info">
            <h3>Flash Cards</h3>
            <p>{cardCount} cards available</p>
            <p className="resource-card__reviewed">{subProgress.flashcards} reviewed</p>
          </div>
          <ChevronRight size={20} />
        </Link>

        <Link to={`/subject/${subjectId}/questions`} className="resource-card">
          <div className="resource-card__icon"><Brain size={32} /></div>
          <div className="resource-card__info">
            <h3>Practice Questions</h3>
            <p>{questionCount} questions + AI generation</p>
            <p className="resource-card__reviewed">{subProgress.attempted} attempted ({accuracy}%)</p>
          </div>
          <ChevronRight size={20} />
        </Link>

        <Link to={`/subject/${subjectId}/papers`} className="resource-card">
          <div className="resource-card__icon"><FileText size={32} /></div>
          <div className="resource-card__info">
            <h3>Past Papers</h3>
            <p>{paperCount} papers available</p>
            <p className="resource-card__reviewed">{completedPapers}/{paperCount} completed</p>
          </div>
          <ChevronRight size={20} />
        </Link>
      </div>

      <div className="subject-topics">
        <h2><BookOpen size={20} /> Specification Topics</h2>
        <div className="topics-grid">
          {subject.levels[level].topics.map((topic, i) => (
            <div key={i} className="topic-chip">
              <span className="topic-chip__number">{i + 1}</span>
              {topic}
            </div>
          ))}
        </div>
      </div>

      <div className="subject-papers-info">
        <h2><FileText size={20} /> Papers</h2>
        <div className="papers-info-list">
          {subject.levels[level].papers.map((paper, i) => (
            <div key={i} className="paper-info-chip">{paper}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

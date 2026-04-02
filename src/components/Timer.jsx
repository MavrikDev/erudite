import { useTimer } from '../contexts/TimerContext';
import { RotateCcw, Clock, Coffee } from 'lucide-react';
import { subjects } from '../data/subjects';

export default function Timer() {
  const { isRunning, isIdle, elapsed, currentSubject, resetTimer, formatTime } = useTimer();
  const subjectData = currentSubject ? subjects.find(s => s.id === currentSubject) : null;

  return (
    <div className={`timer-widget ${isIdle ? 'timer-widget--idle' : ''} ${isRunning && !isIdle ? 'timer-widget--active' : ''}`}>
      {isIdle ? <Coffee size={16} /> : <Clock size={16} />}
      <span className="timer-widget__time">{formatTime(elapsed)}</span>
      {isIdle && <span className="timer-widget__idle-label">Idle</span>}
      {subjectData && <span className="timer-widget__subject">{subjectData.icon}</span>}
      <div className="timer-widget__controls">
        <button onClick={resetTimer} className="timer-widget__btn" title="Reset">
          <RotateCcw size={14} />
        </button>
      </div>
    </div>
  );
}

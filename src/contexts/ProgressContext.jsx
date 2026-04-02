import { createContext, useContext, useState, useEffect } from 'react';

const ProgressContext = createContext();

const defaultProgress = {
  questionsAttempted: 0,
  questionsCorrect: 0,
  flashcardsReviewed: 0,
  pastPapersCompleted: [],
  dailyStudyTime: {},
  subjectProgress: {
    'computer-science': { as: { attempted: 0, correct: 0, flashcards: 0, timeSpent: 0 }, a2: { attempted: 0, correct: 0, flashcards: 0, timeSpent: 0 } },
    'maths': { as: { attempted: 0, correct: 0, flashcards: 0, timeSpent: 0 }, a2: { attempted: 0, correct: 0, flashcards: 0, timeSpent: 0 } },
    'further-maths': { as: { attempted: 0, correct: 0, flashcards: 0, timeSpent: 0 }, a2: { attempted: 0, correct: 0, flashcards: 0, timeSpent: 0 } },
    'physics': { as: { attempted: 0, correct: 0, flashcards: 0, timeSpent: 0 }, a2: { attempted: 0, correct: 0, flashcards: 0, timeSpent: 0 } },
  },
  streak: 0,
  lastStudyDate: null,
  totalStudyTime: 0,
  achievements: [],
  // Struggled questions: array of { id, questionId, subjectId, level, topic, question, timestamp, source }
  struggledQuestions: [],
  // Time logs per question/paper: { [id]: { startTime, endTime, elapsed } }
  questionTimeLogs: {},
  paperTimeLogs: {},
  // Custom flashcards (legacy — migrated to decks on load)
  customFlashcards: {},
  archivedFlashcards: {},
  // Deck-based flashcards: { [subjectId]: [ { id, name, level, createdAt, cards: [{ id, front, back, source, frontHtml, backHtml, archived }] } ] }
  flashcardDecks: {},
  // Spaced repetition data: { [cardId]: { ease, interval, repetitions, nextReview, lastRating, lastReviewed } }
  flashcardSR: {},
  // AI question sessions: [ { id, subjectId, topic, questionCount, questions, score, createdAt, completedAt } ]
  questionSessions: [],
  // Paper completion history snapshots
  paperCompletionHistory: [],
};

// Migrate old flat customFlashcards to deck-based structure
const migrateToDecks = (prog) => {
  if (prog.flashcardDecks && Object.keys(prog.flashcardDecks).length > 0) return prog;
  const oldCustom = prog.customFlashcards || {};
  const oldArchived = prog.archivedFlashcards || {};
  if (Object.keys(oldCustom).length === 0 && Object.keys(oldArchived).length === 0) return prog;

  const decks = {};
  let counter = 0;
  const mkId = () => `deck-mig-${Date.now()}-${counter++}`;

  for (const [subjectId, levels] of Object.entries(oldCustom)) {
    if (!decks[subjectId]) decks[subjectId] = [];
    for (const [level, cards] of Object.entries(levels)) {
      const byTopic = {};
      for (const card of cards) {
        const t = card.topic || 'Imported';
        if (!byTopic[t]) byTopic[t] = [];
        byTopic[t].push({ ...card, archived: false });
      }
      for (const [topic, topicCards] of Object.entries(byTopic)) {
        decks[subjectId].push({ id: mkId(), name: topic, level, createdAt: Date.now(), cards: topicCards });
      }
    }
  }
  for (const [subjectId, levels] of Object.entries(oldArchived)) {
    if (!decks[subjectId]) decks[subjectId] = [];
    for (const [level, cards] of Object.entries(levels)) {
      for (const card of cards) {
        const t = card.topic || 'Archived';
        const existing = decks[subjectId].find(d => d.name === t && d.level === level);
        if (existing) {
          existing.cards.push({ ...card, archived: true });
        } else {
          decks[subjectId].push({ id: mkId(), name: t, level, createdAt: Date.now(), cards: [{ ...card, archived: true }] });
        }
      }
    }
  }
  return { ...prog, flashcardDecks: decks };
};

export function ProgressProvider({ children }) {
  const [progress, setProgress] = useState(() => {
    const saved = localStorage.getItem('solorev-progress');
    if (saved) {
      try { return migrateToDecks({ ...defaultProgress, ...JSON.parse(saved) }); }
      catch { return defaultProgress; }
    }
    return defaultProgress;
  });

  useEffect(() => {
    localStorage.setItem('solorev-progress', JSON.stringify(progress));
  }, [progress]);

  const recordQuestion = (subjectId, level, correct) => {
    setProgress(prev => {
      const sp = { ...prev.subjectProgress };
      const sub = { ...sp[subjectId] };
      const lev = { ...sub[level] };
      lev.attempted += 1;
      if (correct) lev.correct += 1;
      sub[level] = lev;
      sp[subjectId] = sub;
      return {
        ...prev,
        questionsAttempted: prev.questionsAttempted + 1,
        questionsCorrect: prev.questionsCorrect + (correct ? 1 : 0),
        subjectProgress: sp,
      };
    });
  };

  const recordFlashcard = (subjectId, level) => {
    setProgress(prev => {
      const sp = { ...prev.subjectProgress };
      const sub = { ...sp[subjectId] };
      const lev = { ...sub[level] };
      lev.flashcards += 1;
      sub[level] = lev;
      sp[subjectId] = sub;
      return {
        ...prev,
        flashcardsReviewed: prev.flashcardsReviewed + 1,
        subjectProgress: sp,
      };
    });
  };

  const recordPastPaper = (paperId) => {
    setProgress(prev => ({
      ...prev,
      pastPapersCompleted: prev.pastPapersCompleted.includes(paperId)
        ? prev.pastPapersCompleted
        : [...prev.pastPapersCompleted, paperId],
    }));
  };

  const addStudyTime = (subjectId, level, seconds) => {
    const today = new Date().toISOString().split('T')[0];
    setProgress(prev => {
      const daily = { ...prev.dailyStudyTime };
      daily[today] = (daily[today] || 0) + seconds;
      const sp = { ...prev.subjectProgress };
      if (subjectId && level) {
        const sub = { ...sp[subjectId] };
        const lev = { ...sub[level] };
        lev.timeSpent += seconds;
        sub[level] = lev;
        sp[subjectId] = sub;
      }
      const lastDate = prev.lastStudyDate;
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      let streak = prev.streak;
      if (lastDate === today) {
        // same day, keep streak
      } else if (lastDate === yesterday) {
        streak += 1;
      } else {
        streak = 1;
      }
      return {
        ...prev,
        totalStudyTime: prev.totalStudyTime + seconds,
        dailyStudyTime: daily,
        subjectProgress: sp,
        streak,
        lastStudyDate: today,
      };
    });
  };

  const markStruggled = (entry) => {
    // entry: { questionId, subjectId, level, topic, question, source ('question'|'paper'), paperName? }
    setProgress(prev => {
      const already = prev.struggledQuestions.find(s => s.questionId === entry.questionId && s.source === entry.source);
      if (already) return prev;
      return {
        ...prev,
        struggledQuestions: [...prev.struggledQuestions, { ...entry, id: `str-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, timestamp: Date.now() }],
      };
    });
  };

  const removeStruggled = (id) => {
    setProgress(prev => ({
      ...prev,
      struggledQuestions: prev.struggledQuestions.filter(s => s.id !== id),
    }));
  };

  const logQuestionTime = (questionId, elapsed) => {
    setProgress(prev => ({
      ...prev,
      questionTimeLogs: { ...prev.questionTimeLogs, [questionId]: { elapsed, timestamp: Date.now() } },
    }));
  };

  const logPaperTime = (paperId, elapsed) => {
    setProgress(prev => ({
      ...prev,
      paperTimeLogs: { ...prev.paperTimeLogs, [paperId]: { elapsed, timestamp: Date.now() } },
    }));
  };

  // ===== Deck-based flashcard functions =====
  const createDeck = (subjectId, name, level) => {
    const id = `deck-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setProgress(prev => {
      const decks = { ...prev.flashcardDecks };
      if (!decks[subjectId]) decks[subjectId] = [];
      decks[subjectId] = [...decks[subjectId], { id, name, level, createdAt: Date.now(), cards: [] }];
      return { ...prev, flashcardDecks: decks };
    });
    return id;
  };

  const deleteDeck = (subjectId, deckId) => {
    setProgress(prev => {
      const decks = { ...prev.flashcardDecks };
      if (decks[subjectId]) {
        decks[subjectId] = decks[subjectId].filter(d => d.id !== deckId);
      }
      return { ...prev, flashcardDecks: decks };
    });
  };

  const renameDeck = (subjectId, deckId, newName) => {
    setProgress(prev => {
      const decks = { ...prev.flashcardDecks };
      if (decks[subjectId]) {
        decks[subjectId] = decks[subjectId].map(d => d.id === deckId ? { ...d, name: newName } : d);
      }
      return { ...prev, flashcardDecks: decks };
    });
  };

  const addCardToDeck = (subjectId, deckId, card) => {
    setProgress(prev => {
      const decks = { ...prev.flashcardDecks };
      if (decks[subjectId]) {
        decks[subjectId] = decks[subjectId].map(d => {
          if (d.id !== deckId) return d;
          const newCard = { ...card, id: card.id || `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, archived: false };
          return { ...d, cards: [...d.cards, newCard] };
        });
      }
      return { ...prev, flashcardDecks: decks };
    });
  };

  const removeCardFromDeck = (subjectId, deckId, cardId) => {
    setProgress(prev => {
      const decks = { ...prev.flashcardDecks };
      if (decks[subjectId]) {
        decks[subjectId] = decks[subjectId].map(d => {
          if (d.id !== deckId) return d;
          return { ...d, cards: d.cards.filter(c => c.id !== cardId) };
        });
      }
      return { ...prev, flashcardDecks: decks };
    });
  };

  const archiveCardInDeck = (subjectId, deckId, cardId) => {
    setProgress(prev => {
      const decks = { ...prev.flashcardDecks };
      if (decks[subjectId]) {
        decks[subjectId] = decks[subjectId].map(d => {
          if (d.id !== deckId) return d;
          return { ...d, cards: d.cards.map(c => c.id === cardId ? { ...c, archived: true } : c) };
        });
      }
      return { ...prev, flashcardDecks: decks };
    });
  };

  const unarchiveCardInDeck = (subjectId, deckId, cardId) => {
    setProgress(prev => {
      const decks = { ...prev.flashcardDecks };
      if (decks[subjectId]) {
        decks[subjectId] = decks[subjectId].map(d => {
          if (d.id !== deckId) return d;
          return { ...d, cards: d.cards.map(c => c.id === cardId ? { ...c, archived: false } : c) };
        });
      }
      return { ...prev, flashcardDecks: decks };
    });
  };

  const importDeck = (subjectId, name, level, cards) => {
    const id = `deck-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newCards = cards.map((c, i) => ({
      ...c,
      id: c.id || `card-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      archived: false,
    }));
    setProgress(prev => {
      const decks = { ...prev.flashcardDecks };
      if (!decks[subjectId]) decks[subjectId] = [];
      decks[subjectId] = [...decks[subjectId], { id, name, level, createdAt: Date.now(), cards: newCards }];
      return { ...prev, flashcardDecks: decks };
    });
    return id;
  };

  // Backward-compatible: addCustomFlashcard now routes to a deck
  const addCustomFlashcard = (subjectId, level, card) => {
    setProgress(prev => {
      const decks = { ...prev.flashcardDecks };
      if (!decks[subjectId]) decks[subjectId] = [];
      const isAI = card.source === 'ai-analysis' || card.source === 'ai-suggested';
      const deckName = isAI ? 'AI Generated' : 'My Cards';
      let deck = decks[subjectId].find(d => d.name === deckName && d.level === level);
      if (!deck) {
        deck = { id: `deck-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: deckName, level, createdAt: Date.now(), cards: [] };
        decks[subjectId] = [...decks[subjectId], deck];
      }
      const newCard = { ...card, id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, archived: false };
      decks[subjectId] = decks[subjectId].map(d => d.id === deck.id ? { ...d, cards: [...d.cards, newCard] } : d);
      return { ...prev, flashcardDecks: decks };
    });
  };

  // Legacy compat stubs
  const removeCustomFlashcard = (subjectId, level, cardId) => {
    setProgress(prev => {
      const decks = { ...prev.flashcardDecks };
      if (decks[subjectId]) {
        decks[subjectId] = decks[subjectId].map(d => ({
          ...d,
          cards: d.cards.filter(c => c.id !== cardId),
        }));
      }
      return { ...prev, flashcardDecks: decks };
    });
  };

  const importCustomFlashcards = (subjectId, level, cards) => {
    importDeck(subjectId, 'Imported', level, cards);
  };

  // SM-2 spaced repetition: rate a flashcard and compute next review
  // rating: 0=very hard, 1=hard, 2=okay, 3=good, 4=easy
  const rateFlashcard = (cardId, rating) => {
    setProgress(prev => {
      const sr = { ...prev.flashcardSR };
      const card = sr[cardId] || { ease: 2.5, interval: 0, repetitions: 0, nextReview: 0, lastRating: null, lastReviewed: null };
      const now = Date.now();
      let { ease, interval, repetitions } = card;

      // SM-2 algorithm adapted for 5 ratings (0-4)
      // Quality maps: 0=complete failure, 1=hard recall, 2=hesitant, 3=correct, 4=effortless
      const quality = rating; // 0-4

      if (quality < 2) {
        // Failed recall — reset to beginning but keep adjusted ease
        repetitions = 0;
        interval = 0;
      } else {
        // Successful recall
        if (repetitions === 0) {
          interval = 1; // 1 minute for first review
        } else if (repetitions === 1) {
          interval = 10; // 10 minutes
        } else if (repetitions === 2) {
          interval = 1440; // 1 day in minutes
        } else {
          interval = Math.round(interval * ease);
        }
        repetitions += 1;
      }

      // Update ease factor (min 1.3)
      ease = ease + (0.1 - (4 - quality) * (0.08 + (4 - quality) * 0.02));
      if (ease < 1.3) ease = 1.3;

      sr[cardId] = {
        ease: Math.round(ease * 100) / 100,
        interval,
        repetitions,
        nextReview: now + interval * 60000, // convert minutes to ms
        lastRating: rating,
        lastReviewed: now,
      };
      return { ...prev, flashcardSR: sr };
    });
  };

  const getFlashcardSR = (cardId) => {
    return progress.flashcardSR?.[cardId] || null;
  };

  const saveQuestionSession = (session) => {
    setProgress(prev => ({
      ...prev,
      questionSessions: [...(prev.questionSessions || []), session],
    }));
  };

  const savePaperCompletion = (entry) => {
    // entry: { paperId, subjectId, level, title, year, month, paperNumber, score, totalMarks, elapsed }
    setProgress(prev => ({
      ...prev,
      paperCompletionHistory: [...(prev.paperCompletionHistory || []), {
        ...entry,
        id: `pc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        completedAt: Date.now(),
      }],
    }));
  };

  const resetProgress = () => {
    setProgress(defaultProgress);
  };

  const value = {
    progress,
    recordQuestion,
    recordFlashcard,
    recordPastPaper,
    addStudyTime,
    resetProgress,
    markStruggled,
    removeStruggled,
    logQuestionTime,
    logPaperTime,
    addCustomFlashcard,
    removeCustomFlashcard,
    importCustomFlashcards,
    createDeck,
    deleteDeck,
    renameDeck,
    addCardToDeck,
    removeCardFromDeck,
    archiveCardInDeck,
    unarchiveCardInDeck,
    importDeck,
    rateFlashcard,
    getFlashcardSR,
    saveQuestionSession,
    savePaperCompletion,
  };

  return (
    <ProgressContext.Provider value={value}>
      {children}
    </ProgressContext.Provider>
  );
}

export function useProgress() {
  const context = useContext(ProgressContext);
  if (!context) throw new Error('useProgress must be used within ProgressProvider');
  return context;
}

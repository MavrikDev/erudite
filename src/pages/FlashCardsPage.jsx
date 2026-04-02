import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSubject } from '../data/subjects';
import { useProgress } from '../contexts/ProgressContext';
import { RotateCcw, ChevronLeft, ChevronRight, Shuffle, Check, BookOpen, Plus, Upload, Trash2, X, FolderOpen, Brain, Zap, ArrowLeft, Pencil, Archive, ArchiveRestore, Sparkles, Layers, Bold, Italic, Underline, List, Image, Loader, Type, BarChart3, Clock, Calendar, TrendingUp } from 'lucide-react';
import { aiChat, getApiKey } from '../utils/ai';

export default function FlashCardsPage() {
  const { subjectId } = useParams();
  const subject = getSubject(subjectId);
  const {
    recordFlashcard, progress, createDeck, deleteDeck, renameDeck,
    addCardToDeck, removeCardFromDeck, archiveCardInDeck, unarchiveCardInDeck,
    importDeck, rateFlashcard, getFlashcardSR, addCustomFlashcard,
  } = useProgress();

  const FC_STATE_KEY = `solorev-fc-state-${subjectId}`;
  const savedFcState = (() => { try { return JSON.parse(localStorage.getItem(FC_STATE_KEY)); } catch { return null; } })();

  const [selectedDeckId, setSelectedDeckId] = useState(savedFcState?.selectedDeckId || null);
  const [deckView, setDeckView] = useState('stats'); // 'stats' or 'cards'
  const [currentIndex, setCurrentIndex] = useState(savedFcState?.currentIndex || 0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(() => new Set(savedFcState?.reviewed || []));
  const [showCreateDeckModal, setShowCreateDeckModal] = useState(false);
  const [showCreateCardModal, setShowCreateCardModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAIDeckModal, setShowAIDeckModal] = useState(false);
  const [showAICardModal, setShowAICardModal] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [reviewMode, setReviewMode] = useState(savedFcState?.reviewMode || false);
  const [reviewAllDecks, setReviewAllDecks] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [renamingDeckId, setRenamingDeckId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [newDeck, setNewDeck] = useState({ name: '', level: 'as' });
  const [newCard, setNewCard] = useState({ front: '', back: '' });
  // Re-queue system: cards rated hard get re-inserted later in the session
  const [requeuedCards, setRequeuedCards] = useState([]);
  // AI deck generation
  const [aiDeckTopic, setAiDeckTopic] = useState('');
  const [aiDeckCount, setAiDeckCount] = useState(10);
  const [aiDeckLevel, setAiDeckLevel] = useState('as');
  const [aiGenerating, setAiGenerating] = useState(false);
  // AI card generation (add to existing deck)
  const [aiCardTopic, setAiCardTopic] = useState('');
  const [aiCardCount, setAiCardCount] = useState(5);
  const [aiCardGenerating, setAiCardGenerating] = useState(false);
  // Rich text refs
  const frontEditorRef = useRef(null);
  const backEditorRef = useRef(null);
  const cardImageRef = useRef(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // Save flashcard state to localStorage
  useEffect(() => {
    localStorage.setItem(FC_STATE_KEY, JSON.stringify({
      selectedDeckId, currentIndex, reviewed: [...reviewed], reviewMode,
    }));
  }, [selectedDeckId, currentIndex, reviewed, reviewMode, FC_STATE_KEY]);

  if (!subject) return <div className="page-error">Subject not found</div>;

  const allDecks = progress.flashcardDecks?.[subjectId] || [];
  const selectedDeck = allDecks.find(d => d.id === selectedDeckId);

  // Cards for current view
  const deckCards = useMemo(() => {
    if (!selectedDeck) return [];
    return selectedDeck.cards.filter(c => showArchived ? c.archived : !c.archived);
  }, [selectedDeck, showArchived]);

  // All cards across all decks for review-all mode
  const allDeckCards = useMemo(() => {
    if (!reviewAllDecks) return [];
    return allDecks.flatMap(d => d.cards.filter(c => !c.archived));
  }, [allDecks, reviewAllDecks]);

  // Compute SR stats for this deck (must be before any early returns to satisfy Rules of Hooks)
  const deckSRStats = useMemo(() => {
    if (!selectedDeck) return { total: 0, newCards: 0, dueCards: 0, learnedCards: 0, avgEase: '—', avgInterval: 0, ratingCounts: [0, 0, 0, 0, 0] };
    const now = Date.now();
    const activeCards = selectedDeck.cards.filter(c => !c.archived);
    let newCards = 0, dueCards = 0, learnedCards = 0;
    let totalEase = 0, easeCount = 0;
    let totalInterval = 0, intervalCount = 0;
    const ratingCounts = [0, 0, 0, 0, 0];
    for (const card of activeCards) {
      const sr = getFlashcardSR(card.id);
      if (!sr) { newCards++; continue; }
      if (now >= sr.nextReview) dueCards++;
      else learnedCards++;
      totalEase += sr.ease;
      easeCount++;
      totalInterval += sr.interval;
      intervalCount++;
      if (sr.lastRating >= 0 && sr.lastRating <= 4) ratingCounts[sr.lastRating]++;
    }
    return {
      total: activeCards.length,
      newCards,
      dueCards,
      learnedCards,
      avgEase: easeCount > 0 ? (totalEase / easeCount).toFixed(2) : '—',
      avgInterval: intervalCount > 0 ? Math.round(totalInterval / intervalCount) : 0,
      ratingCounts,
    };
  }, [selectedDeck, progress.flashcardSR]);

  // SR sorting
  const srSortCards = (cardList) => {
    const now = Date.now();
    return [...cardList].sort((a, b) => {
      const srA = getFlashcardSR(a.id);
      const srB = getFlashcardSR(b.id);
      if (!srA && srB) return -1;
      if (srA && !srB) return 1;
      if (!srA && !srB) return 0;
      const overdueA = now - srA.nextReview;
      const overdueB = now - srB.nextReview;
      if (overdueA > 0 && overdueB > 0) return overdueB - overdueA;
      if (overdueA > 0 && overdueB <= 0) return -1;
      if (overdueA <= 0 && overdueB > 0) return 1;
      return srA.ease - srB.ease;
    });
  };

  // Build review cards: base cards + requeued cards appended at end
  const cards = useMemo(() => {
    if (reviewMode) {
      const pool = reviewAllDecks ? allDeckCards : deckCards;
      return [...srSortCards(pool), ...requeuedCards];
    }
    return deckCards;
  }, [reviewMode, reviewAllDecks, deckCards, allDeckCards, progress.flashcardSR, requeuedCards]);

  const currentCard = cards[currentIndex];

  // Find which deck a card belongs to (for review-all mode)
  const getCardDeckName = (card) => {
    if (!card) return '';
    if (selectedDeck && !reviewAllDecks) return selectedDeck.name;
    for (const d of allDecks) {
      if (d.cards.some(c => c.id === card.id)) return d.name;
    }
    return '';
  };

  const getCardDeckId = (card) => {
    if (!card) return null;
    if (selectedDeck && !reviewAllDecks) return selectedDeck.id;
    for (const d of allDecks) {
      if (d.cards.some(c => c.id === card.id)) return d.id;
    }
    return null;
  };

  const dueCardCount = useMemo(() => {
    const now = Date.now();
    const pool = reviewAllDecks ? allDeckCards : deckCards;
    return pool.filter(c => {
      const sr = getFlashcardSR(c.id);
      return !sr || now >= sr.nextReview;
    }).length;
  }, [deckCards, allDeckCards, reviewAllDecks, progress.flashcardSR]);

  const next = () => { setFlipped(false); setShowRating(false); setCurrentIndex(prev => Math.min(prev + 1, cards.length - 1)); };
  const prev = () => { setFlipped(false); setShowRating(false); setCurrentIndex(prev => Math.max(prev - 1, 0)); };

  // Leitner-inspired intra-session re-queuing:
  // Rating 0 (Very Hard) → reappears 3 cards later
  // Rating 1 (Hard) → reappears 7 cards later
  // Rating 2 (Okay) → reappears at end of session
  // Rating 3-4 → no re-queue
  const handleRate = (rating) => {
    if (!currentCard) return;
    rateFlashcard(currentCard.id, rating);
    if (!reviewed.has(currentCard.id)) {
      setReviewed(prev => new Set([...prev, currentCard.id]));
      recordFlashcard(subjectId, selectedDeck?.level || 'as');
    }
    // Re-queue hard cards within the session
    if (reviewMode && rating <= 2) {
      setRequeuedCards(prev => [...prev, { ...currentCard, _requeueId: `${currentCard.id}-rq-${Date.now()}` }]);
    }
    next();
  };

  const markReviewed = () => {
    if (currentCard && !reviewed.has(currentCard.id)) {
      setReviewed(prev => new Set([...prev, currentCard.id]));
      recordFlashcard(subjectId, selectedDeck?.level || 'as');
    }
    next();
  };

  const toggleReviewMode = () => { setReviewMode(prev => !prev); setCurrentIndex(0); setFlipped(false); setShowRating(false); setReviewed(new Set()); setRequeuedCards([]); };
  const toggleReviewAll = () => { setReviewAllDecks(prev => !prev); setCurrentIndex(0); setFlipped(false); setShowRating(false); setReviewed(new Set()); setRequeuedCards([]); };
  const shuffleCards = () => { setCurrentIndex(Math.floor(Math.random() * cards.length)); setFlipped(false); setShowRating(false); };

  const handleCreateDeck = () => {
    if (!newDeck.name.trim()) return;
    const id = createDeck(subjectId, newDeck.name.trim(), newDeck.level);
    setNewDeck({ name: '', level: 'as' });
    setShowCreateDeckModal(false);
    setSelectedDeckId(id);
  };

  // Rich text card creation
  const applyFormat = (editorRef, command, value = null) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
  };

  const handleInsertImage = (editorRef) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        editorRef.current?.focus();
        document.execCommand('insertImage', false, ev.target.result);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleCreateCard = () => {
    const front = frontEditorRef.current?.innerHTML?.trim();
    const back = backEditorRef.current?.innerHTML?.trim();
    if (!front || !back || !selectedDeckId) return;
    const hasHtml = (s) => /<[a-z][\s\S]*>/i.test(s);
    addCardToDeck(subjectId, selectedDeckId, {
      front: hasHtml(front) ? front : frontEditorRef.current.innerText.trim(),
      back: hasHtml(back) ? back : backEditorRef.current.innerText.trim(),
      frontHtml: hasHtml(front),
      backHtml: hasHtml(back),
      source: 'manual',
    });
    setShowCreateCardModal(false);
  };

  // AI deck generation
  const handleGenerateAIDeck = async () => {
    if (!aiDeckTopic.trim()) return;
    if (!getApiKey()) { alert('Please set your API key in Settings first.'); return; }
    setAiGenerating(true);
    try {
      const text = await aiChat({
        messages: [{
          role: 'user',
          content: `Generate exactly ${aiDeckCount} flashcards for A-Level ${subject.name} on the topic "${aiDeckTopic}". Return ONLY a JSON array of objects with "front" and "back" fields. Front should be a clear question, back should be a concise but complete answer. Make them effective for exam revision — cover key definitions, formulas, processes, and common exam topics. No markdown, no explanation, just the JSON array.`
        }],
        temperature: 0.7,
        maxTokens: 4000,
      });
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('Could not parse AI response');
      const aiCards = JSON.parse(jsonMatch[0]).filter(c => c.front && c.back).map(c => ({
        front: c.front, back: c.back, source: 'ai-suggested',
      }));
      if (aiCards.length === 0) throw new Error('No cards generated');
      importDeck(subjectId, aiDeckTopic.trim(), aiDeckLevel, aiCards);
      alert(`Created deck "${aiDeckTopic}" with ${aiCards.length} AI-generated cards!`);
      setShowAIDeckModal(false);
      setAiDeckTopic('');
    } catch (err) {
      alert('Failed to generate deck: ' + err.message);
    } finally {
      setAiGenerating(false);
    }
  };

  // AI card generation — add to existing deck
  const handleGenerateAICards = async () => {
    if (!aiCardTopic.trim() || !selectedDeckId) return;
    if (!getApiKey()) { alert('Please set your API key in Settings first.'); return; }
    setAiCardGenerating(true);
    try {
      const text = await aiChat({
        messages: [{
          role: 'user',
          content: `Generate exactly ${aiCardCount} flashcards for A-Level ${subject.name} on the topic "${aiCardTopic}". Return ONLY a JSON array of objects with "front" and "back" fields. Front should be a clear question, back should be a concise but complete answer. Make them effective for exam revision. No markdown, no explanation, just the JSON array.`
        }],
        temperature: 0.7,
        maxTokens: 4000,
      });
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('Could not parse AI response');
      const aiCards = JSON.parse(jsonMatch[0]).filter(c => c.front && c.back);
      if (aiCards.length === 0) throw new Error('No cards generated');
      for (const card of aiCards) {
        addCardToDeck(subjectId, selectedDeckId, { front: card.front, back: card.back, source: 'ai-suggested' });
      }
      alert(`Added ${aiCards.length} AI-generated cards to the deck!`);
      setShowAICardModal(false);
      setAiCardTopic('');
    } catch (err) {
      alert('Failed to generate cards: ' + err.message);
    } finally {
      setAiCardGenerating(false);
    }
  };

  const handleDeleteCard = (cardId) => {
    if (!selectedDeck) return;
    if (window.confirm('Delete this flashcard?')) {
      removeCardFromDeck(subjectId, selectedDeck.id, cardId);
      if (currentIndex >= cards.length - 1) setCurrentIndex(Math.max(0, currentIndex - 1));
    }
  };

  const handleDeleteDeck = (deckId) => {
    const deck = allDecks.find(d => d.id === deckId);
    if (!deck) return;
    if (window.confirm(`Delete deck "${deck.name}" and all ${deck.cards.length} cards?`)) {
      deleteDeck(subjectId, deckId);
      if (selectedDeckId === deckId) { setSelectedDeckId(null); setCurrentIndex(0); setFlipped(false); }
    }
  };

  const handleStartRename = (deck) => {
    setRenamingDeckId(deck.id);
    setRenameValue(deck.name);
  };

  const handleFinishRename = () => {
    if (renamingDeckId && renameValue.trim()) {
      renameDeck(subjectId, renamingDeckId, renameValue.trim());
    }
    setRenamingDeckId(null);
    setRenameValue('');
  };

  const isAICard = (card) => card?.source === 'ai-analysis' || card?.source === 'ai-suggested';
  const isManualCard = (card) => card?.source === 'manual';

  // ===== Import Parsers (same as before) =====
  const parseAlgoAppXml = (xmlText, blobDataUrls = {}) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) return { cards: [], name: 'Imported' };
    const deckEl = doc.querySelector('deck');
    const deckName = deckEl?.getAttribute('name') || 'Imported';
    const cards = [];
    const cardEls = doc.querySelectorAll('card');
    for (const card of cardEls) {
      const richTexts = card.querySelectorAll('rich-text');
      let front = '', back = '';
      let frontHasImage = false, backHasImage = false;
      for (const rt of richTexts) {
        const name = rt.getAttribute('name');
        let html = rt.innerHTML;
        let hasImage = false;
        html = html.replace(/\{\{blob\s+([a-f0-9]+)\}\}/g, (_, hash) => {
          hasImage = true;
          if (blobDataUrls[hash]) return `<img src="${blobDataUrls[hash]}" style="max-width:100%;margin:4px 0;border-radius:4px;" />`;
          return '[image]';
        });
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        const text = tmp.innerText.trim();
        if (name === 'Front') { front = hasImage && Object.keys(blobDataUrls).length ? html : text; frontHasImage = hasImage && !!Object.keys(blobDataUrls).length; }
        else if (name === 'Back') { back = hasImage && Object.keys(blobDataUrls).length ? html : text; backHasImage = hasImage && !!Object.keys(blobDataUrls).length; }
      }
      if (front && back) cards.push({ front, back, frontHtml: frontHasImage, backHtml: backHasImage, source: 'import' });
    }
    return { cards, name: deckName };
  };

  const parseGenericXml = (xmlText, fallbackName = 'Imported') => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) return { cards: [], name: fallbackName };
    const deckName = doc.querySelector('deck > name, deck > title, package > name, name')?.textContent?.trim() || fallbackName;
    const cards = [];
    const cardEls = doc.querySelectorAll('card, flashcard, item, entry, fact');
    for (const el of cardEls) {
      const getText = (...tags) => { for (const tag of tags) { const found = el.querySelector(tag); if (found?.textContent?.trim()) return found.textContent.trim(); } return ''; };
      const front = getText('question', 'front', 'term', 'prompt', 'q', 'side1', 'text1');
      const back = getText('answer', 'back', 'definition', 'response', 'a', 'side2', 'text2', 'explanation');
      if (front && back) cards.push({ front, back, source: 'import' });
    }
    return { cards, name: deckName };
  };

  const parseXmlFlashcards = (xmlText, fallbackName = 'Imported', blobDataUrls = {}) => {
    if (xmlText.includes('<deck') && xmlText.includes('rich-text')) return parseAlgoAppXml(xmlText, blobDataUrls);
    return parseGenericXml(xmlText, fallbackName);
  };

  const handleAlgoAppImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = ev.target.result;
        if (file.name.endsWith('.xml') || raw.trimStart().startsWith('<?xml') || raw.trimStart().startsWith('<')) {
          const { cards: xmlCards, name } = parseXmlFlashcards(raw, file.name.replace(/\.\w+$/, ''));
          if (xmlCards.length === 0) { alert('No flashcards found in the XML file.'); return; }
          importDeck(subjectId, name, 'as', xmlCards);
          alert(`Imported ${xmlCards.length} cards into deck "${name}"!`);
          setShowImportModal(false);
          return;
        }
        let parsed;
        try { parsed = JSON.parse(raw); }
        catch {
          const lines = raw.split('\n').filter(l => l.trim());
          parsed = lines.map(line => {
            const sep = line.includes('\t') ? '\t' : ',';
            const parts = line.split(sep);
            return { front: (parts[0] || '').trim(), back: (parts[1] || '').trim() };
          }).filter(c => c.front && c.back);
        }
        let importedCards = [];
        const deckName = parsed?.deck || parsed?.title || file.name.replace(/\.\w+$/, '') || 'Imported';
        if (Array.isArray(parsed)) {
          importedCards = parsed.map(item => ({
            front: item.front || item.question || item.term || item.prompt || '',
            back: item.back || item.answer || item.definition || item.response || '',
            source: 'import',
          })).filter(c => c.front && c.back);
        } else if (parsed.cards && Array.isArray(parsed.cards)) {
          importedCards = parsed.cards.map(item => ({
            front: item.front || item.question || item.term || '',
            back: item.back || item.answer || item.definition || '',
            source: 'import',
          })).filter(c => c.front && c.back);
        } else if (parsed.flashcards && Array.isArray(parsed.flashcards)) {
          importedCards = parsed.flashcards.map(item => ({
            front: item.front || item.question || item.term || '',
            back: item.back || item.answer || item.definition || '',
            source: 'import',
          })).filter(c => c.front && c.back);
        }
        if (importedCards.length === 0) { alert('No valid flashcards found in the file.'); return; }
        importDeck(subjectId, deckName, 'as', importedCards);
        alert(`Imported ${importedCards.length} cards into deck "${deckName}"!`);
        setShowImportModal(false);
      } catch (err) { alert('Failed to parse file: ' + err.message); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleFolderImport = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const xmlFiles = files.filter(f => f.name.endsWith('.xml'));
    const blobFiles = files.filter(f => f.webkitRelativePath?.includes('/blobs/'));
    if (xmlFiles.length === 0) { alert('No XML file found in the selected folder.'); return; }
    const blobDataUrls = {};
    let blobsProcessed = 0;
    const totalBlobs = blobFiles.length;
    const processXml = () => {
      let totalCards = 0;
      let xmlProcessed = 0;
      for (const xmlFile of xmlFiles) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const { cards: xmlCards, name } = parseXmlFlashcards(ev.target.result, xmlFile.name.replace(/\.\w+$/, ''), blobDataUrls);
          if (xmlCards.length > 0) {
            importDeck(subjectId, name, 'as', xmlCards);
            totalCards += xmlCards.length;
          }
          xmlProcessed++;
          if (xmlProcessed === xmlFiles.length) {
            if (totalCards > 0) { alert(`Imported ${totalCards} flashcards from Algo App!`); setShowImportModal(false); }
            else alert('No flashcards found in the XML files.');
          }
        };
        reader.readAsText(xmlFile);
      }
    };
    if (totalBlobs === 0) { processXml(); }
    else {
      for (const bf of blobFiles) {
        const reader = new FileReader();
        reader.onload = (ev) => { blobDataUrls[bf.name] = ev.target.result; blobsProcessed++; if (blobsProcessed === totalBlobs) processXml(); };
        reader.onerror = () => { blobsProcessed++; if (blobsProcessed === totalBlobs) processXml(); };
        reader.readAsDataURL(bf);
      }
    }
    e.target.value = '';
  };

  // ===== RENDER =====

  // Deck List View
  if (!selectedDeckId || !selectedDeck) {
    return (
      <div className="flashcards-page">
        <div className="page-header">
          <div className="page-header__breadcrumb">
            <Link to={`/subject/${subjectId}`}>{subject.icon} {subject.name}</Link>
            <span>/</span>
            <span>Flash Cards</span>
          </div>
          <h1>Flash Cards</h1>
        </div>

        <div className="flashcards-toolbar">
          <button className="action-btn action-btn--primary" onClick={() => setShowCreateDeckModal(true)}>
            <Plus size={16} /> New Deck
          </button>
          <button className="action-btn action-btn--ai" onClick={() => setShowAIDeckModal(true)}>
            <Sparkles size={16} /> AI Deck
          </button>
          <button className="action-btn" onClick={() => setShowImportModal(true)}>
            <Upload size={16} /> Import Deck
          </button>
        </div>

        {allDecks.length === 0 ? (
          <div className="empty-state">
            <Layers size={48} />
            <h3>No decks yet</h3>
            <p>Create a new deck or import flashcards to get started!</p>
          </div>
        ) : (
          <div className="deck-grid">
            {allDecks.map(deck => {
              const activeCards = deck.cards.filter(c => !c.archived).length;
              const archivedCount = deck.cards.filter(c => c.archived).length;
              const now = Date.now();
              const dueCount = deck.cards.filter(c => !c.archived).filter(c => {
                const sr = getFlashcardSR(c.id);
                return !sr || now >= sr.nextReview;
              }).length;
              const aiCount = deck.cards.filter(c => !c.archived && (c.source === 'ai-analysis' || c.source === 'ai-suggested')).length;
              return (
                <div key={deck.id} className="deck-card" onClick={() => { setSelectedDeckId(deck.id); setDeckView('stats'); setCurrentIndex(0); setFlipped(false); setReviewMode(false); setShowArchived(false); }}>
                  <div className="deck-card__header">
                    {renamingDeckId === deck.id ? (
                      <input
                        className="deck-card__rename-input"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={handleFinishRename}
                        onKeyDown={e => { if (e.key === 'Enter') handleFinishRename(); if (e.key === 'Escape') setRenamingDeckId(null); }}
                        onClick={e => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <h3 className="deck-card__name">{deck.name}</h3>
                    )}
                    <span className="deck-card__level">{deck.level === 'as' ? 'AS' : 'A2'}</span>
                  </div>
                  <div className="deck-card__stats">
                    <span>{activeCards} card{activeCards !== 1 ? 's' : ''}</span>
                    {dueCount > 0 && <span className="deck-card__due">{dueCount} due</span>}
                    {aiCount > 0 && <span className="deck-card__ai"><Sparkles size={12} /> {aiCount} AI</span>}
                    {archivedCount > 0 && <span className="deck-card__archived">{archivedCount} archived</span>}
                  </div>
                  <div className="deck-card__actions" onClick={e => e.stopPropagation()}>
                    <button className="deck-card__action-btn" onClick={() => handleStartRename(deck)} title="Rename"><Pencil size={14} /></button>
                    <button className="deck-card__action-btn deck-card__action-btn--danger" onClick={() => handleDeleteDeck(deck.id)} title="Delete"><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create Deck Modal */}
        {showCreateDeckModal && (
          <div className="modal-overlay" onClick={() => setShowCreateDeckModal(false)}>
            <div className="modal deck-modal" onClick={e => e.stopPropagation()}>
              <div className="modal__header">
                <h2>Create New Deck</h2>
                <button className="modal__close" onClick={() => setShowCreateDeckModal(false)}><X size={20} /></button>
              </div>
              <div className="modal__body">
                <label className="modal__label">
                  Deck Name
                  <input
                    type="text"
                    className="modal__input"
                    placeholder="e.g. Sorting Algorithms"
                    value={newDeck.name}
                    onChange={e => setNewDeck(prev => ({ ...prev, name: e.target.value }))}
                    autoFocus
                  />
                </label>
                <label className="modal__label">
                  Level
                  <div className="level-toggle level-toggle--modal">
                    <button className={`level-btn ${newDeck.level === 'as' ? 'level-btn--active' : ''}`} onClick={() => setNewDeck(prev => ({ ...prev, level: 'as' }))}>AS Level</button>
                    <button className={`level-btn ${newDeck.level === 'a2' ? 'level-btn--active' : ''}`} onClick={() => setNewDeck(prev => ({ ...prev, level: 'a2' }))}>A Level</button>
                  </div>
                </label>
              </div>
              <div className="modal__footer">
                <button className="action-btn" onClick={() => setShowCreateDeckModal(false)}>Cancel</button>
                <button className="action-btn action-btn--primary" onClick={handleCreateDeck} disabled={!newDeck.name.trim()}>
                  <Plus size={16} /> Create Deck
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Import Modal */}
        {showImportModal && (
          <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
            <div className="modal deck-modal" onClick={e => e.stopPropagation()}>
              <div className="modal__header">
                <h2><Upload size={20} /> Import Deck</h2>
                <button className="modal__close" onClick={() => setShowImportModal(false)}><X size={20} /></button>
              </div>
              <div className="modal__body">
                <p className="import-info">Import flashcards from a file or an Algo App export folder.</p>
                <div className="import-formats">
                  <strong>Supported formats:</strong> JSON, CSV/TSV, XML (Algo App)
                </div>
                <div className="import-dropzone" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={28} />
                  <p>Click to import a file</p>
                  <input type="file" accept=".json,.csv,.tsv,.txt,.xml" onChange={handleAlgoAppImport} ref={fileInputRef} style={{ display: 'none' }} />
                </div>
                <div className="import-dropzone import-dropzone--folder" onClick={() => folderInputRef.current?.click()}>
                  <FolderOpen size={28} />
                  <p>Click to import an Algo App folder</p>
                  <input type="file" webkitdirectory="true" onChange={handleFolderImport} ref={folderInputRef} style={{ display: 'none' }} />
                </div>
              </div>
              <div className="modal__footer">
                <button className="action-btn" onClick={() => setShowImportModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* AI Deck Modal (deck list view) */}
        {showAIDeckModal && (
          <div className="modal-overlay" onClick={() => setShowAIDeckModal(false)}>
            <div className="modal deck-modal deck-modal--wide" onClick={e => e.stopPropagation()}>
              <div className="modal__header">
                <h2><Sparkles size={20} /> Generate AI Deck</h2>
                <button className="modal__close" onClick={() => setShowAIDeckModal(false)}><X size={20} /></button>
              </div>
              <div className="modal__body">
                <p className="ai-deck-info">Generate flashcards automatically using AI. Just describe the topic you want to study.</p>
                <label className="modal__label">
                  Topic
                  <input
                    type="text"
                    className="modal__input"
                    placeholder="e.g. Binary Search Trees, Cell Division, Electromagnetic Induction..."
                    value={aiDeckTopic}
                    onChange={e => setAiDeckTopic(e.target.value)}
                    autoFocus
                    disabled={aiGenerating}
                  />
                </label>
                <label className="modal__label">
                  Number of Cards
                  <input
                    type="number"
                    className="modal__input"
                    min={3}
                    max={30}
                    value={aiDeckCount}
                    onChange={e => setAiDeckCount(Math.max(3, Math.min(30, parseInt(e.target.value) || 10)))}
                    disabled={aiGenerating}
                  />
                </label>
                <label className="modal__label">
                  Level
                  <div className="level-toggle level-toggle--modal">
                    <button className={`level-btn ${aiDeckLevel === 'as' ? 'level-btn--active' : ''}`} onClick={() => setAiDeckLevel('as')} disabled={aiGenerating}>AS Level</button>
                    <button className={`level-btn ${aiDeckLevel === 'a2' ? 'level-btn--active' : ''}`} onClick={() => setAiDeckLevel('a2')} disabled={aiGenerating}>A Level</button>
                  </div>
                </label>
              </div>
              <div className="modal__footer">
                <button className="action-btn" onClick={() => setShowAIDeckModal(false)} disabled={aiGenerating}>Cancel</button>
                <button className="action-btn action-btn--ai" onClick={handleGenerateAIDeck} disabled={!aiDeckTopic.trim() || aiGenerating}>
                  {aiGenerating ? <><Loader size={16} className="spin-icon" /> Generating...</> : <><Sparkles size={16} /> Generate Deck</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== Deck Stats / Overview Page =====
  const archivedCount = selectedDeck.cards.filter(c => c.archived).length;
  const activeCardCount = selectedDeck.cards.filter(c => !c.archived).length;
  const deckAiCount = selectedDeck.cards.filter(c => !c.archived && (c.source === 'ai-analysis' || c.source === 'ai-suggested')).length;
  const manualCardCount = selectedDeck.cards.filter(c => !c.archived && c.source === 'manual').length;
  const importedCardCount = activeCardCount - deckAiCount - manualCardCount;

  const formatInterval = (mins) => {
    if (!mins) return '—';
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.round(mins / 60)}h`;
    return `${Math.round(mins / 1440)}d`;
  };

  if (deckView === 'stats') {
    return (
      <div className="flashcards-page">
        <div className="page-header">
          <div className="page-header__breadcrumb">
            <Link to={`/subject/${subjectId}`}>{subject.icon} {subject.name}</Link>
            <span>/</span>
            <span className="breadcrumb-link" onClick={() => { setSelectedDeckId(null); setReviewMode(false); }}>Flash Cards</span>
            <span>/</span>
            <span>{selectedDeck.name}</span>
          </div>
          <h1>{selectedDeck.name}</h1>
          <span className="deck-stats__level-badge">{selectedDeck.level === 'as' ? 'AS Level' : 'A Level'}</span>
        </div>

        {/* Action buttons */}
        <div className="flashcards-toolbar">
          <button className="action-btn" onClick={() => { setSelectedDeckId(null); setReviewMode(false); }}>
            <ArrowLeft size={16} /> All Decks
          </button>
          <button className="action-btn action-btn--review" onClick={() => { setDeckView('cards'); setReviewMode(true); setCurrentIndex(0); setFlipped(false); setShowRating(false); setReviewed(new Set()); setRequeuedCards([]); }}>
            <Brain size={16} /> Review{deckSRStats.dueCards > 0 ? ` (${deckSRStats.dueCards} due)` : ''}
          </button>
          <button className="action-btn action-btn--primary" onClick={() => setShowCreateCardModal(true)}>
            <Plus size={16} /> Add Card
          </button>
          <button className="action-btn action-btn--ai" onClick={() => setShowAICardModal(true)}>
            <Sparkles size={16} /> AI Cards
          </button>
        </div>

        {/* Stats Grid */}
        <div className="deck-stats-grid">
          <div className="deck-stat-card deck-stat-card--total">
            <div className="deck-stat-card__icon"><Layers size={22} /></div>
            <div className="deck-stat-card__value">{deckSRStats.total}</div>
            <div className="deck-stat-card__label">Total Cards</div>
          </div>
          <div className="deck-stat-card deck-stat-card--due">
            <div className="deck-stat-card__icon"><Clock size={22} /></div>
            <div className="deck-stat-card__value">{deckSRStats.dueCards}</div>
            <div className="deck-stat-card__label">Due Now</div>
          </div>
          <div className="deck-stat-card deck-stat-card--new">
            <div className="deck-stat-card__icon"><Sparkles size={22} /></div>
            <div className="deck-stat-card__value">{deckSRStats.newCards}</div>
            <div className="deck-stat-card__label">New</div>
          </div>
          <div className="deck-stat-card deck-stat-card--learned">
            <div className="deck-stat-card__icon"><Check size={22} /></div>
            <div className="deck-stat-card__value">{deckSRStats.learnedCards}</div>
            <div className="deck-stat-card__label">Learned</div>
          </div>
        </div>

        {/* Detailed Stats */}
        <div className="deck-stats-details">
          <div className="deck-stats-section">
            <h3><BarChart3 size={16} /> Card Breakdown</h3>
            <div className="deck-stats-breakdown">
              {manualCardCount > 0 && (
                <div className="deck-stats-breakdown__row">
                  <span className="deck-stats-breakdown__label"><Type size={12} /> Custom</span>
                  <div className="deck-stats-breakdown__bar-wrap">
                    <div className="deck-stats-breakdown__bar deck-stats-breakdown__bar--custom" style={{ width: `${(manualCardCount / activeCardCount) * 100}%` }} />
                  </div>
                  <span className="deck-stats-breakdown__count">{manualCardCount}</span>
                </div>
              )}
              {deckAiCount > 0 && (
                <div className="deck-stats-breakdown__row">
                  <span className="deck-stats-breakdown__label"><Sparkles size={12} /> AI</span>
                  <div className="deck-stats-breakdown__bar-wrap">
                    <div className="deck-stats-breakdown__bar deck-stats-breakdown__bar--ai" style={{ width: `${(deckAiCount / activeCardCount) * 100}%` }} />
                  </div>
                  <span className="deck-stats-breakdown__count">{deckAiCount}</span>
                </div>
              )}
              {importedCardCount > 0 && (
                <div className="deck-stats-breakdown__row">
                  <span className="deck-stats-breakdown__label"><Upload size={12} /> Imported</span>
                  <div className="deck-stats-breakdown__bar-wrap">
                    <div className="deck-stats-breakdown__bar deck-stats-breakdown__bar--imported" style={{ width: `${(importedCardCount / activeCardCount) * 100}%` }} />
                  </div>
                  <span className="deck-stats-breakdown__count">{importedCardCount}</span>
                </div>
              )}
              {archivedCount > 0 && (
                <div className="deck-stats-breakdown__row">
                  <span className="deck-stats-breakdown__label"><Archive size={12} /> Archived</span>
                  <div className="deck-stats-breakdown__bar-wrap">
                    <div className="deck-stats-breakdown__bar deck-stats-breakdown__bar--archived" style={{ width: `${(archivedCount / (activeCardCount + archivedCount)) * 100}%` }} />
                  </div>
                  <span className="deck-stats-breakdown__count">{archivedCount}</span>
                </div>
              )}
            </div>
          </div>

          <div className="deck-stats-section">
            <h3><TrendingUp size={16} /> Spaced Repetition</h3>
            <div className="deck-stats-sr">
              <div className="deck-stats-sr__item">
                <span className="deck-stats-sr__label">Avg. Ease</span>
                <span className="deck-stats-sr__value">{deckSRStats.avgEase}</span>
              </div>
              <div className="deck-stats-sr__item">
                <span className="deck-stats-sr__label">Avg. Interval</span>
                <span className="deck-stats-sr__value">{formatInterval(deckSRStats.avgInterval)}</span>
              </div>
            </div>
            {deckSRStats.ratingCounts.some(c => c > 0) && (
              <div className="deck-stats-ratings">
                <span className="deck-stats-ratings__label">Last Ratings:</span>
                <div className="deck-stats-ratings__bars">
                  {['Very Hard', 'Hard', 'Okay', 'Good', 'Easy'].map((label, i) => (
                    <div key={i} className="deck-stats-ratings__bar-item" title={`${label}: ${deckSRStats.ratingCounts[i]}`}>
                      <div className={`deck-stats-ratings__bar deck-stats-ratings__bar--${i}`} style={{ height: `${Math.max(4, (deckSRStats.ratingCounts[i] / Math.max(1, ...deckSRStats.ratingCounts)) * 48)}px` }} />
                      <span className="deck-stats-ratings__count">{deckSRStats.ratingCounts[i]}</span>
                    </div>
                  ))}
                </div>
                <div className="deck-stats-ratings__labels">
                  <span>😰</span><span>😓</span><span>🤔</span><span>😊</span><span>😎</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Create Card Modal — Rich Text */}
        {showCreateCardModal && (
          <div className="modal-overlay" onClick={() => setShowCreateCardModal(false)}>
            <div className="modal deck-modal deck-modal--wide" onClick={e => e.stopPropagation()}>
              <div className="modal__header">
                <h2>Add Card to {selectedDeck.name}</h2>
                <button className="modal__close" onClick={() => setShowCreateCardModal(false)}><X size={20} /></button>
              </div>
              <div className="modal__body">
                <label className="modal__label">
                  Front (Question)
                  <div className="richtext-toolbar">
                    <button type="button" className="richtext-toolbar__btn" title="Bold" onMouseDown={e => { e.preventDefault(); applyFormat(frontEditorRef, 'bold'); }}><Bold size={14} /></button>
                    <button type="button" className="richtext-toolbar__btn" title="Italic" onMouseDown={e => { e.preventDefault(); applyFormat(frontEditorRef, 'italic'); }}><Italic size={14} /></button>
                    <button type="button" className="richtext-toolbar__btn" title="Underline" onMouseDown={e => { e.preventDefault(); applyFormat(frontEditorRef, 'underline'); }}><Underline size={14} /></button>
                    <button type="button" className="richtext-toolbar__btn" title="Bullet List" onMouseDown={e => { e.preventDefault(); applyFormat(frontEditorRef, 'insertUnorderedList'); }}><List size={14} /></button>
                    <button type="button" className="richtext-toolbar__btn" title="Insert Image" onMouseDown={e => { e.preventDefault(); handleInsertImage(frontEditorRef); }}><Image size={14} /></button>
                  </div>
                  <div
                    ref={frontEditorRef}
                    className="richtext-editor"
                    contentEditable
                    data-placeholder="What's on the front of the card?"
                    suppressContentEditableWarning
                  />
                </label>
                <label className="modal__label">
                  Back (Answer)
                  <div className="richtext-toolbar">
                    <button type="button" className="richtext-toolbar__btn" title="Bold" onMouseDown={e => { e.preventDefault(); applyFormat(backEditorRef, 'bold'); }}><Bold size={14} /></button>
                    <button type="button" className="richtext-toolbar__btn" title="Italic" onMouseDown={e => { e.preventDefault(); applyFormat(backEditorRef, 'italic'); }}><Italic size={14} /></button>
                    <button type="button" className="richtext-toolbar__btn" title="Underline" onMouseDown={e => { e.preventDefault(); applyFormat(backEditorRef, 'underline'); }}><Underline size={14} /></button>
                    <button type="button" className="richtext-toolbar__btn" title="Bullet List" onMouseDown={e => { e.preventDefault(); applyFormat(backEditorRef, 'insertUnorderedList'); }}><List size={14} /></button>
                    <button type="button" className="richtext-toolbar__btn" title="Insert Image" onMouseDown={e => { e.preventDefault(); handleInsertImage(backEditorRef); }}><Image size={14} /></button>
                  </div>
                  <div
                    ref={backEditorRef}
                    className="richtext-editor"
                    contentEditable
                    data-placeholder="What's on the back?"
                    suppressContentEditableWarning
                  />
                </label>
              </div>
              <div className="modal__footer">
                <button className="action-btn" onClick={() => setShowCreateCardModal(false)}>Cancel</button>
                <button className="action-btn action-btn--primary" onClick={handleCreateCard}>
                  <Plus size={16} /> Add Card
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI Card Modal — add cards to existing deck */}
        {showAICardModal && (
          <div className="modal-overlay" onClick={() => setShowAICardModal(false)}>
            <div className="modal deck-modal deck-modal--wide" onClick={e => e.stopPropagation()}>
              <div className="modal__header">
                <h2><Sparkles size={20} /> Generate AI Cards</h2>
                <button className="modal__close" onClick={() => setShowAICardModal(false)}><X size={20} /></button>
              </div>
              <div className="modal__body">
                <p className="ai-deck-info">Generate flashcards and add them to <strong>{selectedDeck.name}</strong>.</p>
                <label className="modal__label">
                  Topic
                  <input
                    type="text"
                    className="modal__input"
                    placeholder="e.g. Recursion, Mitosis, Newton's Laws..."
                    value={aiCardTopic}
                    onChange={e => setAiCardTopic(e.target.value)}
                    autoFocus
                    disabled={aiCardGenerating}
                  />
                </label>
                <label className="modal__label">
                  Number of Cards
                  <input
                    type="number"
                    className="modal__input"
                    min={1}
                    max={20}
                    value={aiCardCount}
                    onChange={e => setAiCardCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 5)))}
                    disabled={aiCardGenerating}
                  />
                </label>
              </div>
              <div className="modal__footer">
                <button className="action-btn" onClick={() => setShowAICardModal(false)} disabled={aiCardGenerating}>Cancel</button>
                <button className="action-btn action-btn--ai" onClick={handleGenerateAICards} disabled={!aiCardTopic.trim() || aiCardGenerating}>
                  {aiCardGenerating ? <><Loader size={16} className="spin-icon" /> Generating...</> : <><Sparkles size={16} /> Generate Cards</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== Deck Card Viewer =====

  return (
    <div className="flashcards-page">
      <div className="page-header">
        <div className="page-header__breadcrumb">
          <Link to={`/subject/${subjectId}`}>{subject.icon} {subject.name}</Link>
          <span>/</span>
          <span className="breadcrumb-link" onClick={() => { setSelectedDeckId(null); setReviewMode(false); }}>Flash Cards</span>
          <span>/</span>
          <span className="breadcrumb-link" onClick={() => { setDeckView('stats'); setReviewMode(false); }}>{selectedDeck.name}</span>
          <span>/</span>
          <span>Review</span>
        </div>
        <h1>{selectedDeck.name} — Review</h1>
      </div>

      <div className="flashcards-toolbar">
        <button className="action-btn" onClick={() => { setDeckView('stats'); setReviewMode(false); }}>
          <ArrowLeft size={16} /> Deck Overview
        </button>
        <button className="action-btn action-btn--primary" onClick={() => setShowCreateCardModal(true)}>
          <Plus size={16} /> Add Card
        </button>
        <label className="flashcard-custom-toggle">
          <input type="checkbox" checked={reviewAllDecks} onChange={toggleReviewAll} />
          <Zap size={14} /> All Decks
        </label>
      </div>

      {cards.length === 0 ? (
        <div className="empty-state">
          <BookOpen size={48} />
          <h3>All caught up!</h3>
          <p>No cards due for review right now.</p>
        </div>
      ) : (
        <>
          <div className="sr-banner">
            <Brain size={18} />
            <div>
              <strong>Spaced Repetition Review</strong>
              <span>{reviewAllDecks ? ' — All Decks' : ''} · {dueCardCount} card{dueCardCount !== 1 ? 's' : ''} due</span>
            </div>
          </div>

          {/* Card with drop-down reveal */}
          <div className="flashcard-container flashcard-container--drop" onClick={() => { if (!showRating) { if (!flipped) { setFlipped(true); setShowRating(true); } } }}>
            <div className="flashcard-drop">
              <div className="flashcard-drop__front">
                <div className="flashcard-drop__deck-name">{getCardDeckName(currentCard)}</div>
                {currentCard?.frontHtml
                  ? <div className="flashcard-drop__content" dangerouslySetInnerHTML={{ __html: currentCard.front }} />
                  : <div className="flashcard-drop__content">{currentCard?.front}</div>}
                {!flipped && <div className="flashcard-drop__hint">Tap to reveal answer</div>}
                {isAICard(currentCard) && <span className="flashcard__badge flashcard__badge--ai"><Sparkles size={10} /> AI</span>}
                {isManualCard(currentCard) && <span className="flashcard__badge flashcard__badge--custom"><Type size={10} /> Custom</span>}
                {reviewMode && currentCard && (() => {
                  const sr = getFlashcardSR(currentCard.id);
                  if (!sr) return <span className="flashcard__badge flashcard__badge--new">New</span>;
                  const now = Date.now();
                  if (now >= sr.nextReview) return <span className="flashcard__badge flashcard__badge--due">Due</span>;
                  return <span className="flashcard__badge flashcard__badge--scheduled">Scheduled</span>;
                })()}
              </div>
              <div className={`flashcard-drop__back ${flipped ? 'flashcard-drop__back--visible' : ''}`}>
                <div className="flashcard-drop__divider" />
                {currentCard?.backHtml
                  ? <div className="flashcard-drop__content" dangerouslySetInnerHTML={{ __html: currentCard.back }} />
                  : <div className="flashcard-drop__content">{currentCard?.back}</div>}
              </div>
            </div>
          </div>

          {/* Difficulty Rating */}
          {flipped && showRating && (
            <div className="sr-rating">
              <p className="sr-rating__label">How well did you know this?</p>
              <div className="sr-rating__buttons">
                <button className="sr-rating__btn sr-rating__btn--0" onClick={() => handleRate(0)}><span className="sr-rating__emoji">😰</span> Very Hard</button>
                <button className="sr-rating__btn sr-rating__btn--1" onClick={() => handleRate(1)}><span className="sr-rating__emoji">😓</span> Hard</button>
                <button className="sr-rating__btn sr-rating__btn--2" onClick={() => handleRate(2)}><span className="sr-rating__emoji">🤔</span> Okay</button>
                <button className="sr-rating__btn sr-rating__btn--3" onClick={() => handleRate(3)}><span className="sr-rating__emoji">😊</span> Good</button>
                <button className="sr-rating__btn sr-rating__btn--4" onClick={() => handleRate(4)}><span className="sr-rating__emoji">😎</span> Easy</button>
              </div>
              {currentCard && (() => {
                const sr = getFlashcardSR(currentCard.id);
                if (!sr) return null;
                const formatInterval = (mins) => {
                  if (mins < 60) return `${mins}m`;
                  if (mins < 1440) return `${Math.round(mins / 60)}h`;
                  return `${Math.round(mins / 1440)}d`;
                };
                return <div className="sr-rating__info">Last: {['Very Hard', 'Hard', 'Okay', 'Good', 'Easy'][sr.lastRating]} · Interval: {formatInterval(sr.interval)} · Ease: {sr.ease.toFixed(2)}</div>;
              })()}
            </div>
          )}

          {/* Navigation */}
          <div className="flashcard-nav">
            <button onClick={prev} disabled={currentIndex === 0} className="nav-btn"><ChevronLeft size={20} /> Previous</button>
            <div className="flashcard-nav__info">
              <span>{currentIndex + 1} / {cards.length}</span>
              <span className="flashcard-nav__reviewed"><Check size={14} /> {reviewed.size} reviewed</span>
            </div>
            <button onClick={next} disabled={currentIndex === cards.length - 1} className="nav-btn">Next <ChevronRight size={20} /></button>
          </div>

          {/* Actions */}
          <div className="flashcard-actions">
            <button onClick={next} disabled={currentIndex === cards.length - 1} className="action-btn"><ChevronRight size={16} /> Skip</button>
            {currentCard && (
              <button onClick={() => handleDeleteCard(currentCard.id)} className="action-btn action-btn--danger"><Trash2 size={16} /> Delete</button>
            )}
            {currentCard && (
              <button onClick={() => { archiveCardInDeck(subjectId, getCardDeckId(currentCard), currentCard.id); if (currentIndex >= cards.length - 1) setCurrentIndex(Math.max(0, currentIndex - 1)); }} className="action-btn"><Archive size={16} /> Archive</button>
            )}
            <button onClick={() => { setCurrentIndex(0); setFlipped(false); setShowRating(false); setReviewed(new Set()); }} className="action-btn"><RotateCcw size={16} /> Restart</button>
          </div>

          {/* Progress bar */}
          <div className="flashcard-progress">
            <div className="flashcard-progress__bar">
              <div className="flashcard-progress__fill" style={{ width: `${(reviewed.size / cards.length) * 100}%` }} />
            </div>
            <span>{Math.round((reviewed.size / cards.length) * 100)}% reviewed</span>
          </div>
        </>
      )}

      {/* Create Card Modal — Rich Text */}
      {showCreateCardModal && (
        <div className="modal-overlay" onClick={() => setShowCreateCardModal(false)}>
          <div className="modal deck-modal deck-modal--wide" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h2>Add Card to {selectedDeck.name}</h2>
              <button className="modal__close" onClick={() => setShowCreateCardModal(false)}><X size={20} /></button>
            </div>
            <div className="modal__body">
              <label className="modal__label">
                Front (Question)
                <div className="richtext-toolbar">
                  <button type="button" className="richtext-toolbar__btn" title="Bold" onMouseDown={e => { e.preventDefault(); applyFormat(frontEditorRef, 'bold'); }}><Bold size={14} /></button>
                  <button type="button" className="richtext-toolbar__btn" title="Italic" onMouseDown={e => { e.preventDefault(); applyFormat(frontEditorRef, 'italic'); }}><Italic size={14} /></button>
                  <button type="button" className="richtext-toolbar__btn" title="Underline" onMouseDown={e => { e.preventDefault(); applyFormat(frontEditorRef, 'underline'); }}><Underline size={14} /></button>
                  <button type="button" className="richtext-toolbar__btn" title="Bullet List" onMouseDown={e => { e.preventDefault(); applyFormat(frontEditorRef, 'insertUnorderedList'); }}><List size={14} /></button>
                  <button type="button" className="richtext-toolbar__btn" title="Insert Image" onMouseDown={e => { e.preventDefault(); handleInsertImage(frontEditorRef); }}><Image size={14} /></button>
                </div>
                <div
                  ref={frontEditorRef}
                  className="richtext-editor"
                  contentEditable
                  data-placeholder="What's on the front of the card?"
                  suppressContentEditableWarning
                />
              </label>
              <label className="modal__label">
                Back (Answer)
                <div className="richtext-toolbar">
                  <button type="button" className="richtext-toolbar__btn" title="Bold" onMouseDown={e => { e.preventDefault(); applyFormat(backEditorRef, 'bold'); }}><Bold size={14} /></button>
                  <button type="button" className="richtext-toolbar__btn" title="Italic" onMouseDown={e => { e.preventDefault(); applyFormat(backEditorRef, 'italic'); }}><Italic size={14} /></button>
                  <button type="button" className="richtext-toolbar__btn" title="Underline" onMouseDown={e => { e.preventDefault(); applyFormat(backEditorRef, 'underline'); }}><Underline size={14} /></button>
                  <button type="button" className="richtext-toolbar__btn" title="Bullet List" onMouseDown={e => { e.preventDefault(); applyFormat(backEditorRef, 'insertUnorderedList'); }}><List size={14} /></button>
                  <button type="button" className="richtext-toolbar__btn" title="Insert Image" onMouseDown={e => { e.preventDefault(); handleInsertImage(backEditorRef); }}><Image size={14} /></button>
                </div>
                <div
                  ref={backEditorRef}
                  className="richtext-editor"
                  contentEditable
                  data-placeholder="What's on the back?"
                  suppressContentEditableWarning
                />
              </label>
            </div>
            <div className="modal__footer">
              <button className="action-btn" onClick={() => setShowCreateCardModal(false)}>Cancel</button>
              <button className="action-btn action-btn--primary" onClick={handleCreateCard}>
                <Plus size={16} /> Add Card
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Deck Modal */}
      {showAIDeckModal && (
        <div className="modal-overlay" onClick={() => setShowAIDeckModal(false)}>
          <div className="modal deck-modal deck-modal--wide" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h2><Sparkles size={20} /> Generate AI Deck</h2>
              <button className="modal__close" onClick={() => setShowAIDeckModal(false)}><X size={20} /></button>
            </div>
            <div className="modal__body">
              <p className="ai-deck-info">Generate flashcards automatically using AI. Just describe the topic you want to study.</p>
              <label className="modal__label">
                Topic
                <input
                  type="text"
                  className="modal__input"
                  placeholder="e.g. Binary Search Trees, Cell Division, Electromagnetic Induction..."
                  value={aiDeckTopic}
                  onChange={e => setAiDeckTopic(e.target.value)}
                  autoFocus
                  disabled={aiGenerating}
                />
              </label>
              <label className="modal__label">
                Number of Cards
                <input
                  type="number"
                  className="modal__input"
                  min={3}
                  max={30}
                  value={aiDeckCount}
                  onChange={e => setAiDeckCount(Math.max(3, Math.min(30, parseInt(e.target.value) || 10)))}
                  disabled={aiGenerating}
                />
              </label>
              <label className="modal__label">
                Level
                <div className="level-toggle level-toggle--modal">
                  <button className={`level-btn ${aiDeckLevel === 'as' ? 'level-btn--active' : ''}`} onClick={() => setAiDeckLevel('as')} disabled={aiGenerating}>AS Level</button>
                  <button className={`level-btn ${aiDeckLevel === 'a2' ? 'level-btn--active' : ''}`} onClick={() => setAiDeckLevel('a2')} disabled={aiGenerating}>A Level</button>
                </div>
              </label>
            </div>
            <div className="modal__footer">
              <button className="action-btn" onClick={() => setShowAIDeckModal(false)} disabled={aiGenerating}>Cancel</button>
              <button className="action-btn action-btn--ai" onClick={handleGenerateAIDeck} disabled={!aiDeckTopic.trim() || aiGenerating}>
                {aiGenerating ? <><Loader size={16} className="spin-icon" /> Generating...</> : <><Sparkles size={16} /> Generate Deck</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Minimize2, Maximize2, Sparkles, BookOpen, Loader } from 'lucide-react';
import { aiChat, getApiKey, getProviderConfig } from '../utils/ai';

export default function AISidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const defaultMsg = { role: 'assistant', content: 'Hi! I\'m your AI revision assistant. I can help you understand topics, explain concepts, identify what topic a question belongs to, or generate practice questions. How can I help?' };
  const [messages, setMessages] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem('solorev-ai-messages')); return saved?.length ? saved : [defaultMsg]; } catch { return [defaultMsg]; }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('solorev-api-key') || '');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('solorev-ai-messages', JSON.stringify(messages));
  }, [messages]);

  const saveApiKey = (key) => {
    const trimmed = key.trim();
    setApiKey(trimmed);
    localStorage.setItem('solorev-api-key', trimmed);
    setShowKeyInput(false);
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    if (!getApiKey()) {
      setShowKeyInput(true);
      return;
    }

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const systemPrompt = `You are a helpful A-Level revision assistant specializing in:
- Computer Science (AQA, spec 7516/7517)
- Mathematics (AQA, spec 7356/7357)  
- Further Mathematics (AQA, spec 7366/7367)
- Physics (OCR A, spec H156/H556)

When asked about a question or topic:
1. Identify which subject and specific topic it belongs to
2. Explain clearly and concisely at an A-Level standard
3. Provide worked examples where relevant
4. Reference specification points when possible

For maths/physics, use clear notation. Keep explanations concise but thorough.`;

      const content = await aiChat({
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.filter(m => m.role !== 'assistant' || messages.indexOf(m) !== 0).slice(-10),
          userMessage
        ],
        maxTokens: 1000,
        temperature: 0.7
      });

      setMessages(prev => [...prev, { role: 'assistant', content }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}. Check your API key in Settings.` }]);
    } finally {
      setLoading(false);
    }
  };

  const identifyTopic = async () => {
    if (!getApiKey()) {
      setShowKeyInput(true);
      return;
    }

    const screenText = document.querySelector('.main-content')?.innerText?.slice(0, 2000) || '';
    if (!screenText) return;

    const request = `Look at this content from my revision app and tell me what specific topic and subject this relates to. Also give a brief summary of the key concepts involved:\n\n${screenText}`;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: '🔍 Identify topic on screen...' }]);
    setLoading(true);

    try {
      const content = await aiChat({
        messages: [
          { role: 'system', content: 'You are an A-Level revision assistant. Identify the subject, topic, and specification area of the content shown. Be specific about the exam board and topic area.' },
          { role: 'user', content: request }
        ],
        maxTokens: 500,
        temperature: 0.3
      });

      setMessages(prev => [...prev, { role: 'assistant', content }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button className="ai-fab" onClick={() => setIsOpen(true)} title="AI Assistant">
        <MessageCircle size={24} />
        <span className="ai-fab__pulse" />
      </button>
    );
  }

  if (isMinimized) {
    return (
      <div className="ai-sidebar ai-sidebar--minimized" onClick={() => setIsMinimized(false)}>
        <MessageCircle size={18} />
        <span>AI Assistant</span>
        <Maximize2 size={14} />
      </div>
    );
  }

  return (
    <div className="ai-sidebar">
      <div className="ai-sidebar__header">
        <div className="ai-sidebar__header-title">
          <Sparkles size={18} />
          <span>AI Assistant</span>
        </div>
        <div className="ai-sidebar__header-actions">
          <button onClick={() => setIsMinimized(true)} title="Minimize">
            <Minimize2 size={16} />
          </button>
          <button onClick={() => setIsOpen(false)} title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="ai-sidebar__actions">
        <button className="ai-sidebar__action-btn" onClick={identifyTopic}>
          <BookOpen size={14} />
          <span>Identify Topic</span>
        </button>
        <button className="ai-sidebar__action-btn" onClick={() => setShowKeyInput(!showKeyInput)}>
          <span>⚙️</span>
          <span>API Key</span>
        </button>
      </div>

      {showKeyInput && (
        <div className="ai-sidebar__key-input">
          <input
            type="password"
            placeholder={`Enter ${getProviderConfig().name} API key (${getProviderConfig().keyPrefix}...)...`}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveApiKey(apiKey)}
          />
          <button onClick={() => saveApiKey(apiKey)}>Save</button>
        </div>
      )}

      <div className="ai-sidebar__messages">
        {messages.map((msg, i) => (
          <div key={i} className={`ai-message ai-message--${msg.role}`}>
            <div className="ai-message__content">
              {msg.content.split('\n').map((line, j) => (
                <p key={j}>{line}</p>
              ))}
            </div>
          </div>
        ))}
        {loading && (
          <div className="ai-message ai-message--assistant">
            <div className="ai-message__content ai-message__loading">
              <Loader size={16} className="spin" />
              <span>Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="ai-sidebar__input">
        <input
          ref={inputRef}
          type="text"
          placeholder="Ask me anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          disabled={loading}
        />
        <button onClick={sendMessage} disabled={loading || !input.trim()}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

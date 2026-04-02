import { useState, useRef, useEffect, useCallback } from 'react';
import { Pen, Eraser, Trash2, Undo2, Redo2, X, Minus, Plus, Circle } from 'lucide-react';

const COLORS = ['#000000', '#ffffff', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export default function DrawingCanvas({ onClose }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(3);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const lastPos = useRef(null);

  const saveState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const data = canvas.toDataURL();
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(data);
      return newHistory;
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'var(--canvas-bg, #ffffff)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveState();
  }, []);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      pressure: e.pressure || 0.5
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    const pos = getPos(e);
    lastPos.current = pos;
    setIsDrawing(true);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = lineWidth * 4;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      // Pressure sensitivity for stylus
      ctx.lineWidth = lineWidth * (pos.pressure * 2);
    }

    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    lastPos.current = pos;
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveState();
    }
  };

  const undo = () => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    restoreState(history[newIndex]);
  };

  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    restoreState(history[newIndex]);
  };

  const restoreState = (data) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = data;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveState();
  };

  const saveCanvas = () => {
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = `erudite-drawing-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <div className="drawing-overlay">
      <div className="drawing-toolbar">
        <div className="drawing-toolbar__group">
          <button
            className={`drawing-tool ${tool === 'pen' ? 'drawing-tool--active' : ''}`}
            onClick={() => setTool('pen')}
            title="Pen"
          >
            <Pen size={18} />
          </button>
          <button
            className={`drawing-tool ${tool === 'eraser' ? 'drawing-tool--active' : ''}`}
            onClick={() => setTool('eraser')}
            title="Eraser"
          >
            <Eraser size={18} />
          </button>
        </div>

        <div className="drawing-toolbar__group">
          <button onClick={() => setLineWidth(Math.max(1, lineWidth - 1))} title="Thinner">
            <Minus size={16} />
          </button>
          <span className="drawing-toolbar__size">
            <Circle size={Math.min(lineWidth * 2, 20)} fill="currentColor" />
            {lineWidth}px
          </span>
          <button onClick={() => setLineWidth(Math.min(20, lineWidth + 1))} title="Thicker">
            <Plus size={16} />
          </button>
        </div>

        <div className="drawing-toolbar__group drawing-toolbar__colors">
          {COLORS.map(c => (
            <button
              key={c}
              className={`drawing-color ${c === color ? 'drawing-color--active' : ''}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
              title={c}
            />
          ))}
        </div>

        <div className="drawing-toolbar__group">
          <button onClick={undo} disabled={historyIndex <= 0} title="Undo">
            <Undo2 size={18} />
          </button>
          <button onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo">
            <Redo2 size={18} />
          </button>
          <button onClick={clearCanvas} title="Clear">
            <Trash2 size={18} />
          </button>
        </div>

        <div className="drawing-toolbar__group">
          <button onClick={saveCanvas} className="drawing-tool__save" title="Save drawing">
            💾 Save
          </button>
          <button onClick={onClose} className="drawing-tool__close" title="Close drawing">
            <X size={18} />
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="drawing-canvas"
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
        style={{ touchAction: 'none' }}
      />
    </div>
  );
}

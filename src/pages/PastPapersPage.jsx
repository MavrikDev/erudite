import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSubject } from '../data/subjects';
import { useProgress } from '../contexts/ProgressContext';
import { FileText, Clock, Award, Check, X, Pen, Eraser, Trash2, Undo2, Redo2, Minus, Plus, Upload, ChevronLeft, ChevronRight, Camera, Sparkles, Loader, Image as ImageIcon, ZoomIn, ZoomOut, Play, Pause, AlertTriangle, PieChart, Info, Calendar, Star, BarChart3, BookOpen, Lightbulb, FileCheck } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href;

const COLORS = ['#000000', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function compressImage(dataUrl, maxDim = 1024, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function estimateMarksFromPdf(pdfData) {
  try {
    const binary = atob(pdfData);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
    let fullText = '';
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      fullText += tc.items.map(item => item.str).join(' ') + '\n';
    }
    // Check for explicit "Total N marks" or "TOTAL: N MARKS"
    const totalMatch = fullText.match(/total[:\s]*(\d+)\s*marks?/i);
    if (totalMatch) {
      const t = parseInt(totalMatch[1]);
      if (t > 0 && t <= 300) return t;
    }
    // Pattern: [N] — common A-Level mark allocation per question part
    const matches = fullText.match(/\[(\d{1,2})\]/g) || [];
    let total = 0;
    for (const m of matches) {
      const n = parseInt(m.slice(1, -1));
      if (n >= 1 && n <= 25) total += n;
    }
    // Also try (N marks) or (N mark)
    if (total === 0) {
      const markMatches = fullText.match(/\((\d{1,2})\s*marks?\)/gi) || [];
      for (const m of markMatches) {
        const n = parseInt(m.match(/\d+/)[0]);
        if (n >= 1 && n <= 25) total += n;
      }
    }
    return total > 0 ? total : null;
  } catch { return null; }
}

// Simple pie chart via SVG
function TopicPieChart({ topics }) {
  if (!topics || topics.length === 0) return null;
  const total = topics.reduce((s, t) => s + t.count, 0);
  if (total === 0) return null;
  const palette = ['#4361ee','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316','#84cc16','#6366f1','#14b8a6','#e11d48'];
  let cumAngle = 0;
  const slices = topics.map((t, i) => {
    const frac = t.count / total;
    const startAngle = cumAngle;
    cumAngle += frac * 360;
    const endAngle = cumAngle;
    const startRad = (startAngle - 90) * Math.PI / 180;
    const endRad = (endAngle - 90) * Math.PI / 180;
    const largeArc = frac > 0.5 ? 1 : 0;
    const x1 = 50 + 40 * Math.cos(startRad);
    const y1 = 50 + 40 * Math.sin(startRad);
    const x2 = 50 + 40 * Math.cos(endRad);
    const y2 = 50 + 40 * Math.sin(endRad);
    const color = palette[i % palette.length];
    if (frac >= 0.999) {
      return { path: null, circle: true, color, label: t.topic, pct: Math.round(frac * 100) };
    }
    return { path: `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`, circle: false, color, label: t.topic, pct: Math.round(frac * 100) };
  });
  return (
    <div className="topic-pie">
      <svg viewBox="0 0 100 100" className="topic-pie__svg">
        {slices.map((s, i) => s.circle
          ? <circle key={i} cx="50" cy="50" r="40" fill={s.color} />
          : <path key={i} d={s.path} fill={s.color} stroke="var(--card-bg)" strokeWidth="0.5" />
        )}
      </svg>
      <div className="topic-pie__legend">
        {slices.map((s, i) => (
          <div key={i} className="topic-pie__legend-item">
            <span className="topic-pie__dot" style={{ background: s.color }} />
            <span className="topic-pie__label">{s.label}</span>
            <span className="topic-pie__pct">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PastPapersPage() {
  const { subjectId } = useParams();
  const subject = getSubject(subjectId);
  const { progress, recordPastPaper, logPaperTime, markStruggled, addCustomFlashcard } = useProgress();
  const [level, setLevel] = useState('as');

  // User papers stored in localStorage
  const [userPapers, setUserPapers] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`solorev-user-papers-${subjectId}`) || '{}'); } catch { return {}; }
  });

  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadYear, setUploadYear] = useState(new Date().getFullYear());
  const [uploadMonth, setUploadMonth] = useState('June');
  const [uploadTotalMarks, setUploadTotalMarks] = useState('');
  const uploadFileRef = useRef(null);
  const [uploadPdfData, setUploadPdfData] = useState(null);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadPaperNumber, setUploadPaperNumber] = useState('');
  const [uploadMsPdfData, setUploadMsPdfData] = useState(null);
  const [uploadMsFileName, setUploadMsFileName] = useState('');
  const uploadMsFileRef = useRef(null);

  // Active paper viewer state
  const [activePaper, setActivePaper] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [pdfScale, setPdfScale] = useState(1.5);
  const [pdfLoading, setPdfLoading] = useState(false);
  const pdfCanvasRef = useRef(null);

  // Timer
  const [paperTimer, setPaperTimer] = useState(0);
  const [paperTimerRunning, setPaperTimerRunning] = useState(false);
  const timerRef = useRef(null);

  // Drawing
  const drawCanvasRef = useRef(null);
  const [drawTool, setDrawTool] = useState('pen');
  const [drawColor, setDrawColor] = useState('#ef4444');
  const [drawWidth, setDrawWidth] = useState(3);
  const [pageStrokes, setPageStrokes] = useState({});
  const [strokesHistory, setStrokesHistory] = useState({});
  const [strokesHistoryIdx, setStrokesHistoryIdx] = useState({});
  const isDrawingRef = useRef(false);
  const lastPos = useRef(null);
  const currentStrokeRef = useRef(null);
  const workingStrokesRef = useRef(null);
  const erasedInStrokeRef = useRef(false);
  const [eraserMode, setEraserMode] = useState('stroke');
  const [pdfViewMode, setPdfViewMode] = useState('paged');
  const [scrollPageImages, setScrollPageImages] = useState([]);
  const scrollDrawRefs = useRef({});
  const activeCanvasRef = useRef(null);
  const activePageNumRef = useRef(1);

  // Struggled modal
  const [showStruggledModal, setShowStruggledModal] = useState(false);
  const [struggledInput, setStruggledInput] = useState({ questionNumber: '', topic: '', notes: '' });

  // Score modal
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [scoreInput, setScoreInput] = useState('');

  // Right panel - question analysis
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(true);
  const [analysisImage, setAnalysisImage] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const analysisFileRef = useRef(null);
  const [flaggedQuestions, setFlaggedQuestions] = useState([]);

  // Paper metadata (AI-generated)
  const [showMetadata, setShowMetadata] = useState(null); // paper id
  const [metadataLoading, setMetadataLoading] = useState(false);

  // Mark scheme viewer state
  const [showMarkScheme, setShowMarkScheme] = useState(false);
  const [msPdfDoc, setMsPdfDoc] = useState(null);
  const [msPage, setMsPage] = useState(1);
  const [msTotalPages, setMsTotalPages] = useState(0);
  const msCanvasRef = useRef(null);

  // Analysis panel tab
  const [analysisPanelTab, setAnalysisPanelTab] = useState('analysis');

  useEffect(() => {
    localStorage.setItem(`solorev-user-papers-${subjectId}`, JSON.stringify(userPapers));
  }, [userPapers, subjectId]);

  if (!subject) return <div className="page-error">Subject not found</div>;

  const papers = (userPapers[level] || []).sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return MONTHS.indexOf(b.month) - MONTHS.indexOf(a.month);
  });

  // Timer
  useEffect(() => {
    if (paperTimerRunning) {
      timerRef.current = setInterval(() => setPaperTimer(t => t + 1), 1000);
    } else { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  }, [paperTimerRunning]);

  const formatTimer = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // PDF rendering
  const reRenderStrokesOnCanvas = useCallback((canvas, strokes) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      if (stroke.type === 'erase') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
      }
      ctx.lineWidth = stroke.width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  const reRenderStrokes = useCallback((strokes) => {
    reRenderStrokesOnCanvas(drawCanvasRef.current, strokes);
  }, [reRenderStrokesOnCanvas]);

  const renderPage = useCallback(async (doc, pageNum, scale) => {
    if (!doc || !pdfCanvasRef.current) return;
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = pdfCanvasRef.current;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    if (drawCanvasRef.current) {
      drawCanvasRef.current.width = viewport.width;
      drawCanvasRef.current.height = viewport.height;
      const pageKey = `page-${pageNum}`;
      const strokes = pageStrokes[pageKey] || [];
      reRenderStrokes(strokes);
    }
  }, [pageStrokes, reRenderStrokes]);

  useEffect(() => {
    if (pdfDoc && pdfViewMode === 'paged') renderPage(pdfDoc, pdfPage, pdfScale);
  }, [pdfDoc, pdfPage, pdfScale, pdfViewMode, renderPage]);

  // Mark scheme page rendering
  useEffect(() => {
    if (!msPdfDoc || !msCanvasRef.current || !showMarkScheme) return;
    (async () => {
      const page = await msPdfDoc.getPage(msPage);
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = msCanvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    })();
  }, [msPdfDoc, msPage, showMarkScheme]);

  // Scroll mode — render all pages as images
  useEffect(() => {
    if (pdfViewMode !== 'scroll' || !pdfDoc) { setScrollPageImages([]); return; }
    let cancelled = false;
    (async () => {
      const images = [];
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        if (cancelled) return;
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: pdfScale });
        const offscreen = document.createElement('canvas');
        offscreen.width = viewport.width;
        offscreen.height = viewport.height;
        await page.render({ canvasContext: offscreen.getContext('2d'), viewport }).promise;
        images.push({ dataUrl: offscreen.toDataURL(), width: viewport.width, height: viewport.height, pageNum: i });
      }
      if (!cancelled) setScrollPageImages(images);
    })();
    return () => { cancelled = true; };
  }, [pdfViewMode, pdfDoc, pdfScale]);

  // Restore strokes on scroll canvases
  useEffect(() => {
    if (pdfViewMode !== 'scroll' || scrollPageImages.length === 0) return;
    requestAnimationFrame(() => {
      for (const img of scrollPageImages) {
        const canvas = scrollDrawRefs.current[img.pageNum];
        if (canvas) {
          canvas.width = img.width;
          canvas.height = img.height;
          reRenderStrokesOnCanvas(canvas, pageStrokes[`page-${img.pageNum}`] || []);
        }
      }
    });
  }, [scrollPageImages, pdfViewMode, pageStrokes, reRenderStrokesOnCanvas]);

  // Upload PDF for the modal
  const handleUploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') return;
    const ab = await file.arrayBuffer();
    const base64 = btoa(new Uint8Array(ab).reduce((d, b) => d + String.fromCharCode(b), ''));
    setUploadPdfData(base64);
    setUploadFileName(file.name);
    if (!uploadTitle) setUploadTitle(file.name.replace('.pdf', ''));
    e.target.value = '';
    // Auto-estimate marks from PDF text
    const est = await estimateMarksFromPdf(base64);
    if (est && !uploadTotalMarks) setUploadTotalMarks(String(est));
  };

  const handleUploadMsFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') return;
    const ab = await file.arrayBuffer();
    const base64 = btoa(new Uint8Array(ab).reduce((d, b) => d + String.fromCharCode(b), ''));
    setUploadMsPdfData(base64);
    setUploadMsFileName(file.name);
    e.target.value = '';
  };

  const savePaper = () => {
    if (!uploadPdfData || !uploadTitle.trim()) return;
    const id = `user-paper-${Date.now()}`;
    const paper = {
      id,
      title: uploadTitle.trim(),
      year: parseInt(uploadYear),
      month: uploadMonth,
      paperNumber: uploadPaperNumber || null,
      totalMarks: uploadTotalMarks ? parseInt(uploadTotalMarks) : null,
      pdfData: uploadPdfData,
      markSchemePdfData: uploadMsPdfData || null,
      createdAt: new Date().toISOString(),
      score: null,
      metadata: null,
    };
    setUserPapers(prev => ({ ...prev, [level]: [...(prev[level] || []), paper] }));
    setShowUploadModal(false);
    setUploadTitle('');
    setUploadPdfData(null);
    setUploadFileName('');
    setUploadTotalMarks('');
    setUploadPaperNumber('');
    setUploadMsPdfData(null);
    setUploadMsFileName('');
  };

  const deletePaper = (paperId) => {
    if (!confirm('Delete this paper? This cannot be undone.')) return;
    setUserPapers(prev => ({ ...prev, [level]: (prev[level] || []).filter(p => p.id !== paperId) }));
  };

  // Open paper in viewer
  const openPaper = async (paper) => {
    setActivePaper(paper);
    setPaperTimer(0);
    setPaperTimerRunning(true);
    setPdfDoc(null);
    setPdfTotalPages(0);
    setPdfPage(1);
    setPageStrokes({});
    setStrokesHistory({});
    setStrokesHistoryIdx({});
    setFlaggedQuestions([]);
    setAnalysisImage(null);
    setAnalysisResult(null);
    setShowAnalysisPanel(true);
    setShowMarkScheme(false);
    setMsPdfDoc(null);
    setMsTotalPages(0);
    setMsPage(1);
    setAnalysisPanelTab('analysis');

    // Load pdf from stored base64
    if (paper.pdfData) {
      setPdfLoading(true);
      try {
        const binary = atob(paper.pdfData);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
        setPdfDoc(doc);
        setPdfTotalPages(doc.numPages);
        setPdfPage(1);
      } catch (err) {
        alert('Failed to load PDF: ' + err.message);
      } finally {
        setPdfLoading(false);
      }
    }
    // Load mark scheme PDF if available
    if (paper.markSchemePdfData) {
      try {
        const msBinary = atob(paper.markSchemePdfData);
        const msBytes = new Uint8Array(msBinary.length);
        for (let i = 0; i < msBinary.length; i++) msBytes[i] = msBinary.charCodeAt(i);
        const msDoc = await pdfjsLib.getDocument({ data: msBytes }).promise;
        setMsPdfDoc(msDoc);
        setMsTotalPages(msDoc.numPages);
      } catch { /* ignore mark scheme load error */ }
    }
  };

  const closePaper = () => {
    if (paperTimerRunning || paperTimer > 0) {
      logPaperTime(activePaper.id, paperTimer);
    }
    setPaperTimerRunning(false);
    setActivePaper(null);
    setPaperTimer(0);
    setPdfDoc(null);
    setMsPdfDoc(null);
    setShowMarkScheme(false);
  };

  const completePaper = () => {
    logPaperTime(activePaper.id, paperTimer);
    recordPastPaper(activePaper.id);
    setPaperTimerRunning(false);
    setShowScoreModal(true);
  };

  const saveScore = () => {
    const sc = parseInt(scoreInput);
    if (isNaN(sc) || sc < 0) return;
    setUserPapers(prev => ({
      ...prev,
      [level]: (prev[level] || []).map(p => p.id === activePaper.id ? { ...p, score: sc } : p),
    }));
    setShowScoreModal(false);
    setScoreInput('');
  };

  // Drawing — stroke-based with point/stroke eraser
  const commitStrokes = useCallback((pageNum, newStrokes) => {
    const pageKey = `page-${pageNum}`;
    setPageStrokes(prev => ({ ...prev, [pageKey]: newStrokes }));
    setStrokesHistory(prev => {
      const hist = (prev[pageKey] || []).slice(0, (strokesHistoryIdx[pageKey] ?? -1) + 1);
      hist.push([...newStrokes]);
      return { ...prev, [pageKey]: hist };
    });
    setStrokesHistoryIdx(prev => ({ ...prev, [pageKey]: (prev[pageKey] ?? -1) + 1 }));
  }, [strokesHistoryIdx]);

  const getDrawPos = (canvas, e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY, pressure: e.pressure || 0.5 };
  };

  const findStrokeNear = (strokes, x, y, threshold = 20) => {
    for (let i = strokes.length - 1; i >= 0; i--) {
      for (const pt of strokes[i].points) {
        const dx = pt.x - x;
        const dy = pt.y - y;
        if (dx * dx + dy * dy < threshold * threshold) return i;
      }
    }
    return -1;
  };

  const startDraw = (pageNum, canvas, e) => {
    e.preventDefault();
    isDrawingRef.current = true;
    activeCanvasRef.current = canvas;
    activePageNumRef.current = pageNum;
    const pos = getDrawPos(canvas, e);
    lastPos.current = pos;
    if (drawTool === 'pen') {
      currentStrokeRef.current = {
        points: [pos],
        color: drawColor,
        width: drawWidth * Math.max(pos.pressure * 2, 0.5),
      };
    } else if (eraserMode === 'stroke') {
      const pageKey = `page-${pageNum}`;
      workingStrokesRef.current = [...(pageStrokes[pageKey] || [])];
      erasedInStrokeRef.current = false;
      const idx = findStrokeNear(workingStrokesRef.current, pos.x, pos.y);
      if (idx >= 0) {
        workingStrokesRef.current.splice(idx, 1);
        reRenderStrokesOnCanvas(canvas, workingStrokesRef.current);
        erasedInStrokeRef.current = true;
      }
    } else {
      // Point eraser
      currentStrokeRef.current = {
        type: 'erase',
        points: [pos],
        color: 'rgba(0,0,0,1)',
        width: drawWidth * 6,
      };
    }
  };

  const doDraw = (e) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const canvas = activeCanvasRef.current;
    if (!canvas) return;
    const pos = getDrawPos(canvas, e);
    if (drawTool === 'pen') {
      const stroke = currentStrokeRef.current;
      if (!stroke) return;
      stroke.points.push(pos);
      const ctx = canvas.getContext('2d');
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if (eraserMode === 'stroke') {
      if (!workingStrokesRef.current) return;
      const idx = findStrokeNear(workingStrokesRef.current, pos.x, pos.y);
      if (idx >= 0) {
        workingStrokesRef.current.splice(idx, 1);
        reRenderStrokesOnCanvas(canvas, workingStrokesRef.current);
        erasedInStrokeRef.current = true;
      }
    } else {
      // Point eraser
      const stroke = currentStrokeRef.current;
      if (!stroke) return;
      stroke.points.push(pos);
      const ctx = canvas.getContext('2d');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = stroke.width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
    lastPos.current = pos;
  };

  const stopDraw = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const pageNum = activePageNumRef.current;
    const canvas = activeCanvasRef.current;
    if (drawTool === 'pen' && currentStrokeRef.current) {
      const pageKey = `page-${pageNum}`;
      const newStrokes = [...(pageStrokes[pageKey] || []), currentStrokeRef.current];
      commitStrokes(pageNum, newStrokes);
      currentStrokeRef.current = null;
    } else if (drawTool === 'eraser' && eraserMode === 'stroke' && erasedInStrokeRef.current) {
      commitStrokes(pageNum, workingStrokesRef.current || []);
      erasedInStrokeRef.current = false;
      workingStrokesRef.current = null;
    } else if (drawTool === 'eraser' && eraserMode === 'point' && currentStrokeRef.current) {
      const pageKey = `page-${pageNum}`;
      const newStrokes = [...(pageStrokes[pageKey] || []), currentStrokeRef.current];
      commitStrokes(pageNum, newStrokes);
      currentStrokeRef.current = null;
    }
    if (canvas) canvas.getContext('2d').globalCompositeOperation = 'source-over';
  };

  const getUndoRedoPage = () => pdfViewMode === 'scroll' ? activePageNumRef.current : pdfPage;
  const getUndoRedoCanvas = (pg) => pdfViewMode === 'scroll' ? scrollDrawRefs.current[pg] : drawCanvasRef.current;

  const undoDraw = () => {
    const pg = getUndoRedoPage();
    const k = `page-${pg}`;
    const i = strokesHistoryIdx[k] ?? -1;
    if (i <= 0) {
      if (i === 0) {
        setStrokesHistoryIdx(p => ({ ...p, [k]: -1 }));
        setPageStrokes(p => ({ ...p, [k]: [] }));
        reRenderStrokesOnCanvas(getUndoRedoCanvas(pg), []);
      }
      return;
    }
    setStrokesHistoryIdx(p => ({ ...p, [k]: i - 1 }));
    const restored = strokesHistory[k][i - 1];
    setPageStrokes(p => ({ ...p, [k]: restored }));
    reRenderStrokesOnCanvas(getUndoRedoCanvas(pg), restored);
  };

  const redoDraw = () => {
    const pg = getUndoRedoPage();
    const k = `page-${pg}`;
    const i = strokesHistoryIdx[k] ?? -1;
    const h = strokesHistory[k] || [];
    if (i >= h.length - 1) return;
    setStrokesHistoryIdx(p => ({ ...p, [k]: i + 1 }));
    const restored = h[i + 1];
    setPageStrokes(p => ({ ...p, [k]: restored }));
    reRenderStrokesOnCanvas(getUndoRedoCanvas(pg), restored);
  };

  const clearDraw = () => {
    const pg = getUndoRedoPage();
    commitStrokes(pg, []);
    reRenderStrokesOnCanvas(getUndoRedoCanvas(pg), []);
  };

  // Struggled question
  const handleMarkStruggled = () => {
    if (!struggledInput.questionNumber.trim()) return;
    const entry = {
      questionId: `${activePaper.id}-q${struggledInput.questionNumber}`,
      subjectId, level,
      topic: struggledInput.topic || 'Unknown',
      question: `${activePaper.title} — Q${struggledInput.questionNumber}${struggledInput.notes ? ': ' + struggledInput.notes : ''}`,
      source: 'paper',
      paperName: activePaper.title,
      paperYear: activePaper.year,
      paperSession: activePaper.month,
    };
    markStruggled(entry);
    setFlaggedQuestions(prev => [...prev, { ...entry, id: Date.now(), qNum: struggledInput.questionNumber, notes: struggledInput.notes }]);
    setStruggledInput({ questionNumber: '', topic: '', notes: '' });
    setShowStruggledModal(false);
  };

  // AI analysis - right panel
  const handleAnalysisImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setAnalysisImage(ev.target.result); setAnalysisResult(null); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handlePasteImage = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const reader = new FileReader();
          reader.onload = (ev) => { setAnalysisImage(ev.target.result); setAnalysisResult(null); };
          reader.readAsDataURL(blob);
          return;
        }
      }
      alert('No image found in clipboard. Try taking a screenshot first (Win+Shift+S).');
    } catch { alert('Could not read clipboard. Try uploading an image instead.'); }
  };

  const analyzeQuestion = async () => {
    if (!analysisImage) return;
    const apiKey = localStorage.getItem('solorev-api-key');
    if (!apiKey) { alert('Please set your Groq API key in Settings first.'); return; }
    setAnalysisLoading(true);
    try {
      const compressed = await compressImage(analysisImage, 1024, 0.7);
      const promptText = `You are an expert A-Level tutor for ${subject.name} (${subject.examBoard}). Analyze the exam question in the image. Return a JSON object with:\n{"topic":"specific topic","subtopic":"subtopic if applicable","difficulty":"easy|medium|hard","summary":"what the question asks","approach":"step by step approach","keyConcepts":["list","of","concepts"],"commonMistakes":["common","mistakes"],"solution":"full worked solution"}\nReturn ONLY valid JSON, no markdown fences.`;
      // Try vision model first, fall back to text extraction from PDF page
      let content = '';
      let visionWorked = false;
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: [{ role: 'user', content: [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: compressed } }
            ] }],
            max_tokens: 1500
          })
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          console.warn('Vision model error, falling back to text:', res.status, errBody);
          throw new Error('FALLBACK');
        }
        const data = await res.json();
        content = data.choices[0].message.content;
        visionWorked = true;
      } catch (visionErr) {
        if (visionErr.message !== 'FALLBACK') {
          console.warn('Vision model failed, falling back to text:', visionErr.message);
        }
      }
      // Fallback: extract text from current PDF page and use text model
      if (!visionWorked) {
        if (!pdfDoc) throw new Error('Vision model unavailable and no PDF loaded for text fallback.');
        const currentPageNum = pdfViewMode === 'scroll' ? activePageNumRef.current : pdfPage;
        const page = await pdfDoc.getPage(currentPageNum);
        const tc = await page.getTextContent();
        const pageText = tc.items.map(item => item.str).join(' ');
        if (!pageText.trim()) throw new Error('Could not extract text from this PDF page. The PDF may contain scanned images without embedded text.');
        const fallbackRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'system', content: promptText },
              { role: 'user', content: `Here is the text from the exam paper page. Analyze the question(s) on this page:\n\n${pageText.slice(0, 6000)}` }],
            max_tokens: 1500
          })
        });
        if (!fallbackRes.ok) {
          const err2 = await fallbackRes.json().catch(() => ({}));
          throw new Error(err2.error?.message || `Text fallback API error: ${fallbackRes.status}`);
        }
        const fallbackData = await fallbackRes.json();
        content = fallbackData.choices[0].message.content;
      }
      try {
        const m = content.match(/\{[\s\S]*\}/);
        setAnalysisResult(JSON.parse(m ? m[0] : content));
      } catch { setAnalysisResult({ topic: 'Analysis', summary: content, approach: '', keyConcepts: [], commonMistakes: [], solution: '' }); }
    } catch (err) { alert('Analysis failed: ' + err.message); }
    finally { setAnalysisLoading(false); }
  };

  const flagAnalyzedQuestion = () => {
    if (!analysisResult || !activePaper) return;
    const entry = {
      questionId: `${activePaper.id}-analysis-${Date.now()}`, subjectId, level,
      topic: analysisResult.topic || 'Unknown',
      question: analysisResult.summary || 'Analyzed question',
      source: 'paper', paperName: activePaper.title, paperYear: activePaper.year, paperSession: activePaper.month,
    };
    markStruggled(entry);
    setFlaggedQuestions(prev => [...prev, { ...entry, id: Date.now(), qNum: '?', notes: analysisResult.summary }]);
  };

  const createFlashcardFromAnalysis = () => {
    if (!analysisResult) return;
    const front = analysisResult.summary || 'Question from past paper';
    const back = [
      analysisResult.approach || '',
      analysisResult.solution || '',
      analysisResult.keyConcepts?.length ? `Key concepts: ${analysisResult.keyConcepts.join(', ')}` : '',
    ].filter(Boolean).join('\n\n') || 'See solution';
    addCustomFlashcard(subjectId, level, {
      topic: analysisResult.topic || 'Past Paper',
      front,
      back,
      source: 'ai-analysis',
      paperTitle: activePaper?.title,
    });
    alert('Flashcard created! View it in the Flash Cards section.');
  };

  const getRelatedFlashcards = () => {
    if (!analysisResult) return [];
    const allCards = progress.customFlashcards?.[subjectId]?.[level] || [];
    const topic = (analysisResult.topic || '').toLowerCase();
    const concepts = (analysisResult.keyConcepts || []).map(c => c.toLowerCase());
    return allCards.filter(card => {
      const cardTopic = (card.topic || '').toLowerCase();
      const cardFront = (card.front || '').toLowerCase();
      if (cardTopic === topic || topic.includes(cardTopic) || cardTopic.includes(topic)) return true;
      return concepts.some(c => cardFront.includes(c) || cardTopic.includes(c));
    }).slice(0, 5);
  };

  // AI paper metadata generation — extract text from PDF then send to AI
  const generateMetadata = async (paper) => {
    const apiKey = localStorage.getItem('solorev-api-key');
    if (!apiKey) { alert('Please set your Groq API key in Settings first.'); return; }
    if (!paper.pdfData) return;
    setMetadataLoading(true);
    try {
      const binary = atob(paper.pdfData);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
      let fullText = '';
      const maxPages = Math.min(doc.numPages, 20);
      for (let p = 1; p <= maxPages; p++) {
        const page = await doc.getPage(p);
        const tc = await page.getTextContent();
        fullText += tc.items.map(item => item.str).join(' ') + '\n';
      }
      if (!fullText.trim()) { alert('Could not extract text from PDF. The PDF may be image-based.'); setMetadataLoading(false); return; }
      const topicsList = subject.levels[level]?.topics || [];
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: `You are an expert A-Level ${subject.name} (${subject.examBoard}) examiner. Analyze this past paper and return a JSON object with:\n{"examBoard":"${subject.examBoard}","level":"${level === 'as' ? 'AS' : 'A'} Level","totalQuestions":"number of questions","duration":"estimated duration","topics":[{"topic":"Topic Name","count":4,"difficulty":"medium"}],"hardestTopics":["topic1","topic2"],"summary":"2-3 sentence overview of the paper","keyThemes":["theme1","theme2"],"suggestedFlashcards":[{"front":"A concise question testing a key concept from the paper","back":"The answer with key facts","topic":"Topic Name","questionRef":"Q3a"}]}\nFor suggestedFlashcards: Pick 3-5 questions that would make the most effective flashcards following evidence-based learning principles — focus on questions that test isolated facts/definitions (good for active recall), require application of a single concept (desirable difficulty), or involve commonly confused topics (interleaving benefit). Avoid long multi-part calculations. Write the front as a clear question and the back as a concise answer.\nTopics for this subject: ${topicsList.join(', ')}\nMap each question to one of these topics. Count how many questions/parts test each topic. Return ONLY valid JSON.` },
          { role: 'user', content: `Analyze this past paper:\n\n${fullText.slice(0, 8000)}` }],
          max_tokens: 2500
        })
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      const content = data.choices[0].message.content;
      let meta;
      try {
        const m = content.match(/\{[\s\S]*\}/);
        meta = JSON.parse(m ? m[0] : content);
      } catch { meta = { summary: content, topics: [] }; }
      setUserPapers(prev => ({
        ...prev,
        [level]: (prev[level] || []).map(p => p.id === paper.id ? { ...p, metadata: meta } : p),
      }));
      setShowMetadata(paper.id);
    } catch (err) { alert('Metadata generation failed: ' + err.message); }
    finally { setMetadataLoading(false); }
  };

  const availableTopics = subject.levels[level]?.topics || [];

  // ===== PAPER VIEWER MODE =====
  if (activePaper) {
    return (
      <div className="paper-viewer-layout">
        <div className="paper-viewer">
          <div className="paper-viewer__header">
            <div className="paper-viewer__title">
              <button className="action-btn" onClick={closePaper}><X size={16} /> Close</button>
              <h2>{activePaper.title}</h2>
              <span className="paper-viewer__meta">{activePaper.month} {activePaper.year} — {subject.name}</span>
            </div>
            <div className="paper-viewer__controls">
              <div className="paper-viewer__timer">
                <Clock size={16} />
                <span>{formatTimer(paperTimer)}</span>
                <button onClick={() => setPaperTimerRunning(!paperTimerRunning)} className="timer-btn" title={paperTimerRunning ? 'Pause' : 'Resume'}>
                  {paperTimerRunning ? <Pause size={14} /> : <Play size={14} />}
                </button>
              </div>
              <button className="action-btn action-btn--accent" onClick={() => setShowStruggledModal(true)}>
                <AlertTriangle size={14} /> Flag Question
              </button>
              <button className="action-btn action-btn--primary" onClick={completePaper}>
                <Check size={14} /> Complete
              </button>
            </div>
          </div>

          <div className="paper-viewer__draw-toolbar">
            <div className="drawing-toolbar__group">
              <button className={`drawing-tool ${drawTool === 'pen' ? 'drawing-tool--active' : ''}`} onClick={() => setDrawTool('pen')} title="Pen"><Pen size={16} /></button>
              <button className={`drawing-tool ${drawTool === 'eraser' ? 'drawing-tool--active' : ''}`} onClick={() => setDrawTool('eraser')} title="Eraser"><Eraser size={16} /></button>
              {drawTool === 'eraser' && (
                <div className="eraser-mode-toggle">
                  <button className={`eraser-mode-btn ${eraserMode === 'point' ? 'eraser-mode-btn--active' : ''}`} onClick={() => setEraserMode('point')}>Point</button>
                  <button className={`eraser-mode-btn ${eraserMode === 'stroke' ? 'eraser-mode-btn--active' : ''}`} onClick={() => setEraserMode('stroke')}>Stroke</button>
                </div>
              )}
            </div>
            <div className="drawing-toolbar__group">
              <button className="drawing-tool" onClick={() => setDrawWidth(Math.max(1, drawWidth - 1))}><Minus size={14} /></button>
              <span style={{ fontSize: '0.8rem', minWidth: 30, textAlign: 'center' }}>{drawWidth}px</span>
              <button className="drawing-tool" onClick={() => setDrawWidth(Math.min(15, drawWidth + 1))}><Plus size={14} /></button>
            </div>
            <div className="drawing-toolbar__group drawing-toolbar__colors">
              {COLORS.map(c => (
                <button key={c} className={`drawing-color ${c === drawColor ? 'drawing-color--active' : ''}`} style={{ backgroundColor: c }} onClick={() => setDrawColor(c)} />
              ))}
            </div>
            <div className="drawing-toolbar__group">
              <button className="drawing-tool" onClick={undoDraw} title="Undo"><Undo2 size={16} /></button>
              <button className="drawing-tool" onClick={redoDraw} title="Redo"><Redo2 size={16} /></button>
              <button className="drawing-tool" onClick={clearDraw} title="Clear"><Trash2 size={16} /></button>
            </div>
            {pdfDoc && (
              <div className="drawing-toolbar__group">
                <button className="drawing-tool" onClick={() => setPdfScale(s => Math.max(0.5, s - 0.25))} title="Zoom out"><ZoomOut size={16} /></button>
                <span style={{ fontSize: '0.8rem', minWidth: 40, textAlign: 'center' }}>{Math.round(pdfScale * 100)}%</span>
                <button className="drawing-tool" onClick={() => setPdfScale(s => Math.min(3, s + 0.25))} title="Zoom in"><ZoomIn size={16} /></button>
              </div>
            )}
            {pdfDoc && (
              <div className="drawing-toolbar__group">
                <div className="view-mode-toggle">
                  <button className={`view-mode-btn ${pdfViewMode === 'paged' ? 'view-mode-btn--active' : ''}`} onClick={() => setPdfViewMode('paged')}>Paged</button>
                  <button className={`view-mode-btn ${pdfViewMode === 'scroll' ? 'view-mode-btn--active' : ''}`} onClick={() => setPdfViewMode('scroll')}>Scroll</button>
                </div>
              </div>
            )}
          </div>

          <div className="paper-viewer__workspace">
            {pdfLoading ? (
              <div className="paper-viewer__upload-area"><Loader size={32} className="spin" /><p>Loading PDF...</p></div>
            ) : !pdfDoc ? (
              <div className="paper-viewer__upload-area">
                <div className="paper-viewer__placeholder">
                  <FileText size={56} />
                  <h3>PDF could not be loaded</h3>
                  <p>There was an issue loading this paper's PDF.</p>
                </div>
              </div>
            ) : pdfViewMode === 'scroll' ? (
              <div className="paper-viewer__scroll-container">
                {scrollPageImages.length === 0 && <div className="paper-viewer__upload-area"><Loader size={32} className="spin" /><p>Rendering pages...</p></div>}
                {scrollPageImages.map(sp => (
                  <div key={sp.pageNum} className="paper-viewer__canvas-wrap" style={{ width: sp.width, height: sp.height }}>
                    <img src={sp.dataUrl} width={sp.width} height={sp.height} className="paper-viewer__pdf-canvas" alt={`Page ${sp.pageNum}`} draggable={false} />
                    <canvas
                      ref={el => { if (el) scrollDrawRefs.current[sp.pageNum] = el; }}
                      className="paper-viewer__draw-canvas"
                      width={sp.width}
                      height={sp.height}
                      onPointerDown={(e) => startDraw(sp.pageNum, scrollDrawRefs.current[sp.pageNum], e)}
                      onPointerMove={doDraw}
                      onPointerUp={stopDraw}
                      onPointerLeave={stopDraw}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="paper-viewer__pdf-container">
                <div className="paper-viewer__page-nav">
                  <button className="action-btn" onClick={() => setPdfPage(p => Math.max(1, p - 1))} disabled={pdfPage <= 1}><ChevronLeft size={16} /> Prev</button>
                  <span className="paper-viewer__page-info">Page {pdfPage} / {pdfTotalPages}</span>
                  <button className="action-btn" onClick={() => setPdfPage(p => Math.min(pdfTotalPages, p + 1))} disabled={pdfPage >= pdfTotalPages}>Next <ChevronRight size={16} /></button>
                </div>
                <div className="paper-viewer__canvas-wrap">
                  <canvas ref={pdfCanvasRef} className="paper-viewer__pdf-canvas" />
                  <canvas ref={drawCanvasRef} className="paper-viewer__draw-canvas"
                    onPointerDown={(e) => startDraw(pdfPage, drawCanvasRef.current, e)} onPointerMove={doDraw} onPointerUp={stopDraw} onPointerLeave={stopDraw} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right panel — always show toggle */}
        <div className={`analysis-panel ${showAnalysisPanel ? 'analysis-panel--open' : 'analysis-panel--closed'}`}>
          <button className="analysis-panel__toggle" onClick={() => setShowAnalysisPanel(p => !p)} title={showAnalysisPanel ? 'Hide panel' : 'Show panel'}>
            {showAnalysisPanel ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          {showAnalysisPanel && (
            <div className="analysis-panel__content">
              {/* Panel tabs */}
              <div className="analysis-panel__tabs">
                <button className={`analysis-panel__tab ${analysisPanelTab === 'analysis' ? 'analysis-panel__tab--active' : ''}`} onClick={() => setAnalysisPanelTab('analysis')}>
                  <Camera size={14} /> Analysis
                </button>
                {msPdfDoc && (
                  <button className={`analysis-panel__tab ${analysisPanelTab === 'markscheme' ? 'analysis-panel__tab--active' : ''}`} onClick={() => setAnalysisPanelTab('markscheme')}>
                    <FileCheck size={14} /> Mark Scheme
                  </button>
                )}
              </div>

              {/* Mark Scheme Tab */}
              {analysisPanelTab === 'markscheme' && msPdfDoc && (
                <div className="ms-viewer">
                  <div className="ms-viewer__nav">
                    <button className="action-btn action-btn--small" onClick={() => setMsPage(p => Math.max(1, p - 1))} disabled={msPage <= 1}><ChevronLeft size={14} /></button>
                    <span className="ms-viewer__page-info">Page {msPage} / {msTotalPages}</span>
                    <button className="action-btn action-btn--small" onClick={() => setMsPage(p => Math.min(msTotalPages, p + 1))} disabled={msPage >= msTotalPages}><ChevronRight size={14} /></button>
                  </div>
                  <div className="ms-viewer__canvas-wrap">
                    <canvas ref={msCanvasRef} className="ms-viewer__canvas" />
                  </div>
                </div>
              )}

              {/* Analysis Tab */}
              {analysisPanelTab === 'analysis' && (
                <>
                  <h3 className="analysis-panel__title"><Camera size={18} /> Question Analysis</h3>
                  <p className="analysis-panel__desc">Paste or upload a screenshot of a question to get AI analysis, topic detection, and solution guidance.</p>
                  <div className="analysis-panel__actions">
                    <button className="action-btn action-btn--primary" onClick={handlePasteImage}><ImageIcon size={14} /> Paste from Clipboard</button>
                    <label className="action-btn action-btn--accent" style={{ cursor: 'pointer' }}>
                      <Upload size={14} /> Upload Image
                      <input ref={analysisFileRef} type="file" accept="image/*" onChange={handleAnalysisImageUpload} style={{ display: 'none' }} />
                    </label>
                  </div>
                  {analysisImage && (
                    <div className="analysis-panel__preview">
                      <img src={analysisImage} alt="Question" className="analysis-panel__img" />
                      <div className="analysis-panel__preview-actions">
                        <button className="action-btn action-btn--primary" onClick={analyzeQuestion} disabled={analysisLoading}>
                          {analysisLoading ? <><Loader size={14} className="spin" /> Analyzing...</> : <><Sparkles size={14} /> Analyze</>}
                        </button>
                        <button className="action-btn" onClick={() => { setAnalysisImage(null); setAnalysisResult(null); }}><X size={14} /> Clear</button>
                      </div>
                    </div>
                  )}
                  {analysisResult && (
                    <div className="analysis-panel__result">
                      <div className="analysis-result__header">
                        <span className="analysis-result__topic">{analysisResult.topic}</span>
                        {analysisResult.subtopic && <span className="analysis-result__subtopic">{analysisResult.subtopic}</span>}
                        {analysisResult.difficulty && <span className={`difficulty--${analysisResult.difficulty}`}>{analysisResult.difficulty}</span>}
                      </div>
                      {analysisResult.summary && <div className="analysis-result__section"><h4>Summary</h4><p>{analysisResult.summary}</p></div>}
                      {analysisResult.approach && <div className="analysis-result__section"><h4>Approach</h4><p style={{ whiteSpace: 'pre-wrap' }}>{analysisResult.approach}</p></div>}
                      {analysisResult.keyConcepts?.length > 0 && (
                        <div className="analysis-result__section"><h4>Key Concepts</h4>
                          <div className="analysis-result__tags">{analysisResult.keyConcepts.map((c, i) => <span key={i} className="analysis-result__tag">{c}</span>)}</div>
                        </div>
                      )}
                      {analysisResult.commonMistakes?.length > 0 && (
                        <div className="analysis-result__section"><h4>Common Mistakes</h4>
                          <ul>{analysisResult.commonMistakes.map((m, i) => <li key={i}>{m}</li>)}</ul>
                        </div>
                      )}
                      {analysisResult.solution && <div className="analysis-result__section"><h4>Solution</h4><p style={{ whiteSpace: 'pre-wrap' }}>{analysisResult.solution}</p></div>}
                      <div className="analysis-result__actions">
                        <button className="action-btn action-btn--accent" onClick={createFlashcardFromAnalysis}><BookOpen size={14} /> Create Flashcard</button>
                        <button className="action-btn action-btn--danger" onClick={flagAnalyzedQuestion}><AlertTriangle size={14} /> Flag as Struggled</button>
                      </div>
                      {/* Related flashcards */}
                      {(() => {
                        const related = getRelatedFlashcards();
                        if (related.length === 0) return null;
                        return (
                          <div className="analysis-result__section analysis-result__related">
                            <h4><BookOpen size={14} /> Related Flashcards</h4>
                            {related.map((card, i) => (
                              <div key={i} className="related-flashcard">
                                <span className="related-flashcard__topic">{card.topic}</span>
                                <span className="related-flashcard__front">{card.front}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {flaggedQuestions.length > 0 && (
                    <div className="analysis-panel__flagged">
                      <h4><AlertTriangle size={14} /> Flagged This Session ({flaggedQuestions.length})</h4>
                      {flaggedQuestions.map(fq => (
                        <div key={fq.id} className="analysis-flagged-item">
                          <span className="analysis-flagged-item__q">Q{fq.qNum}</span>
                          <span className="analysis-flagged-item__topic">{fq.topic}</span>
                          {fq.notes && <span className="analysis-flagged-item__notes">{fq.notes}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Struggled modal */}
        {showStruggledModal && (
          <div className="modal-overlay" onClick={() => setShowStruggledModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal__header"><h2>Flag Struggled Question</h2><button className="modal__close" onClick={() => setShowStruggledModal(false)}><X size={20} /></button></div>
              <div className="modal__body">
                <label className="modal__label">Question Number *
                  <input type="text" className="modal__input" placeholder="e.g. 3a, 5, 7ii" value={struggledInput.questionNumber} onChange={e => setStruggledInput(p => ({ ...p, questionNumber: e.target.value }))} />
                </label>
                <label className="modal__label">Topic
                  <select className="modal__input" value={struggledInput.topic} onChange={e => setStruggledInput(p => ({ ...p, topic: e.target.value }))}>
                    <option value="">Select a topic...</option>
                    {availableTopics.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="modal__label">Notes (optional)
                  <textarea className="modal__textarea" placeholder="What did you find difficult?" rows={2} value={struggledInput.notes} onChange={e => setStruggledInput(p => ({ ...p, notes: e.target.value }))} />
                </label>
              </div>
              <div className="modal__footer">
                <button className="action-btn" onClick={() => setShowStruggledModal(false)}>Cancel</button>
                <button className="action-btn action-btn--primary" onClick={handleMarkStruggled} disabled={!struggledInput.questionNumber.trim()}><AlertTriangle size={16} /> Flag</button>
              </div>
            </div>
          </div>
        )}

        {/* Score modal */}
        {showScoreModal && (
          <div className="modal-overlay" onClick={() => setShowScoreModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal__header"><h2>Record Your Score</h2><button className="modal__close" onClick={() => setShowScoreModal(false)}><X size={20} /></button></div>
              <div className="modal__body">
                <p className="modal__subtitle">Paper completed in {formatTimer(paperTimer)}. Enter your score:</p>
                <label className="modal__label">Score{activePaper?.totalMarks ? ` (out of ${activePaper.totalMarks})` : ''}
                  <input type="number" className="modal__input" min="0" max={activePaper?.totalMarks || 999} placeholder="e.g. 65" value={scoreInput} onChange={e => setScoreInput(e.target.value)} />
                </label>
              </div>
              <div className="modal__footer">
                <button className="action-btn" onClick={() => setShowScoreModal(false)}>Skip</button>
                <button className="action-btn action-btn--primary" onClick={saveScore} disabled={!scoreInput}><Check size={16} /> Save Score</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== PAPER LIST VIEW =====
  return (
    <div className="papers-page">
      <div className="page-header">
        <div className="page-header__breadcrumb">
          <Link to={`/subject/${subjectId}`}>{subject.icon} {subject.name}</Link>
          <span>/</span><span>Past Papers</span>
        </div>
        <h1>Past Papers</h1>
        <p className="page-header__subtitle">{subject.examBoard} — {subject.levels[level].name}</p>
      </div>

      <div className="papers-controls">
        <div className="level-toggle">
          <button className={`level-btn ${level === 'as' ? 'level-btn--active' : ''}`} onClick={() => setLevel('as')}>AS Level</button>
          <button className={`level-btn ${level === 'a2' ? 'level-btn--active' : ''}`} onClick={() => setLevel('a2')}>A Level</button>
        </div>
        <button className="action-btn action-btn--primary" onClick={() => setShowUploadModal(true)}>
          <Upload size={16} /> Import Paper
        </button>
      </div>

      <div className="papers-summary">
        <div className="stat-mini"><FileText size={16} /> <span>{papers.length} papers</span></div>
        <div className="stat-mini"><Check size={16} /> <span>{papers.filter(p => progress.pastPapersCompleted.includes(p.id)).length} completed</span></div>
      </div>

      {papers.length === 0 ? (
        <div className="empty-state">
          <FileText size={48} />
          <h3>No papers yet</h3>
          <p>Import your own past paper PDFs to get started. Download them from your exam board's website or Physics & Maths Tutor, then upload here.</p>
          <button className="action-btn action-btn--primary" onClick={() => setShowUploadModal(true)} style={{ marginTop: 12 }}>
            <Upload size={16} /> Import Your First Paper
          </button>
        </div>
      ) : (
        <div className="papers-grid">
          {papers.map(paper => {
            const completed = progress.pastPapersCompleted.includes(paper.id);
            const timeLog = progress.paperTimeLogs?.[paper.id];
            const struggled = (progress.struggledQuestions || []).filter(s => s.questionId?.startsWith(paper.id));
            return (
              <div key={paper.id} className={`paper-card-v2 ${completed ? 'paper-card-v2--completed' : ''}`}>
                <div className="paper-card-v2__header">
                  <FileText size={20} />
                  <div className="paper-card-v2__date">
                    <span className="paper-card-v2__month">{paper.month}</span>
                    <span className="paper-card-v2__year">{paper.year}</span>
                  </div>
                  {completed && <span className="paper-card-v2__badge"><Check size={12} /> Done</span>}
                </div>
                <h4 className="paper-card-v2__title">{paper.title}</h4>
                {paper.paperNumber && <span className="paper-card-v2__paper-num">Paper {paper.paperNumber}</span>}
                {paper.markSchemePdfData && <span className="paper-card-v2__ms-badge"><FileCheck size={12} /> Mark Scheme</span>}
                <div className="paper-card-v2__meta">
                  {paper.totalMarks && <span><Award size={13} /> {paper.totalMarks} marks</span>}
                  {paper.score !== null && paper.score !== undefined && (
                    <span className="paper-card-v2__score"><Star size={13} /> {paper.score}{paper.totalMarks ? `/${paper.totalMarks}` : ''} ({paper.totalMarks ? Math.round(paper.score / paper.totalMarks * 100) : '—'}%)</span>
                  )}
                  {timeLog && <span><Clock size={13} /> {formatTimer(timeLog.elapsed)}</span>}
                  {struggled.length > 0 && <span className="paper-card-v2__struggled"><AlertTriangle size={13} /> {struggled.length} flagged</span>}
                </div>

                {/* Metadata section */}
                {paper.metadata && (
                  <div className="paper-card-v2__metadata-toggle">
                    <button className="action-btn action-btn--small" onClick={() => setShowMetadata(showMetadata === paper.id ? null : paper.id)}>
                      <PieChart size={13} /> {showMetadata === paper.id ? 'Hide' : 'View'} Analysis
                    </button>
                  </div>
                )}

                {showMetadata === paper.id && paper.metadata && (
                  <div className="paper-metadata">
                    {paper.metadata.summary && <p className="paper-metadata__summary">{paper.metadata.summary}</p>}
                    {paper.metadata.totalQuestions && <div className="paper-metadata__stat"><BarChart3 size={13} /> {paper.metadata.totalQuestions} questions</div>}
                    {paper.metadata.duration && <div className="paper-metadata__stat"><Clock size={13} /> {paper.metadata.duration}</div>}
                    {paper.metadata.topics?.length > 0 && (
                      <TopicPieChart topics={paper.metadata.topics} />
                    )}
                    {paper.metadata.hardestTopics?.length > 0 && (
                      <div className="paper-metadata__hard">
                        <h5><AlertTriangle size={13} /> Hardest Topics</h5>
                        <div className="paper-metadata__hard-tags">
                          {paper.metadata.hardestTopics.map((t, i) => <span key={i} className="paper-metadata__hard-tag">{t}</span>)}
                        </div>
                      </div>
                    )}
                    {paper.metadata.keyThemes?.length > 0 && (
                      <div className="paper-metadata__themes">
                        <h5>Key Themes</h5>
                        <div className="paper-metadata__hard-tags">
                          {paper.metadata.keyThemes.map((t, i) => <span key={i} className="analysis-result__tag">{t}</span>)}
                        </div>
                      </div>
                    )}
                    {paper.metadata.suggestedFlashcards?.length > 0 && (
                      <div className="paper-metadata__flashcards">
                        <h5><Lightbulb size={13} /> Suggested Flashcards</h5>
                        <p className="paper-metadata__fc-note">Key questions ideal for active recall practice</p>
                        {paper.metadata.suggestedFlashcards.map((fc, i) => (
                          <div key={i} className="suggested-flashcard">
                            <div className="suggested-flashcard__content">
                              {fc.questionRef && <span className="suggested-flashcard__ref">{fc.questionRef}</span>}
                              <span className="suggested-flashcard__front">{fc.front}</span>
                            </div>
                            <button className="action-btn action-btn--small action-btn--accent" onClick={() => {
                              addCustomFlashcard(subjectId, level, { topic: fc.topic || 'Past Paper', front: fc.front, back: fc.back, source: 'ai-suggested', paperTitle: paper.title });
                              alert('Flashcard created!');
                            }}><Plus size={12} /> Add</button>
                          </div>
                        ))}
                        <button className="action-btn action-btn--primary action-btn--small" style={{ marginTop: 6 }} onClick={() => {
                          paper.metadata.suggestedFlashcards.forEach(fc => {
                            addCustomFlashcard(subjectId, level, { topic: fc.topic || 'Past Paper', front: fc.front, back: fc.back, source: 'ai-suggested', paperTitle: paper.title });
                          });
                          alert(`${paper.metadata.suggestedFlashcards.length} flashcards created!`);
                        }}><Plus size={12} /> Add All ({paper.metadata.suggestedFlashcards.length})</button>
                      </div>
                    )}
                  </div>
                )}

                <div className="paper-card-v2__actions">
                  <button className="action-btn action-btn--accent" onClick={() => openPaper(paper)}><Play size={14} /> Open</button>
                  {!paper.metadata && (
                    <button className="action-btn action-btn--primary" onClick={() => generateMetadata(paper)} disabled={metadataLoading}>
                      {metadataLoading ? <Loader size={14} className="spin" /> : <Sparkles size={14} />} Analyze
                    </button>
                  )}
                  <button className="action-btn action-btn--danger action-btn--small" onClick={() => deletePaper(paper.id)} title="Delete paper"><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal__header"><h2>Import Past Paper</h2><button className="modal__close" onClick={() => setShowUploadModal(false)}><X size={20} /></button></div>
            <div className="modal__body">
              <p className="modal__subtitle">Upload a PDF past paper. You can download papers from your exam board website or Physics & Maths Tutor.</p>
              <label className="modal__label">
                PDF File *
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label className="action-btn action-btn--accent" style={{ cursor: 'pointer' }}>
                    <Upload size={14} /> {uploadFileName || 'Choose PDF'}
                    <input ref={uploadFileRef} type="file" accept=".pdf" onChange={handleUploadFile} style={{ display: 'none' }} />
                  </label>
                  {uploadPdfData && <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>✓ PDF loaded</span>}
                </div>
              </label>
              <label className="modal__label">Paper Title *
                <input type="text" className="modal__input" placeholder="e.g. Pure Mathematics" value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} />
              </label>
              <label className="modal__label">Paper Number
                <select className="modal__input" value={uploadPaperNumber} onChange={e => setUploadPaperNumber(e.target.value)}>
                  <option value="">Not specified</option>
                  <option value="1">Paper 1</option>
                  <option value="2">Paper 2</option>
                  <option value="3">Paper 3</option>
                </select>
              </label>
              <div style={{ display: 'flex', gap: 12 }}>
                <label className="modal__label" style={{ flex: 1 }}>Month
                  <select className="modal__input" value={uploadMonth} onChange={e => setUploadMonth(e.target.value)}>
                    {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <label className="modal__label" style={{ flex: 1 }}>Year
                  <input type="number" className="modal__input" min="2000" max="2030" value={uploadYear} onChange={e => setUploadYear(e.target.value)} />
                </label>
              </div>
              <label className="modal__label">Total Marks {uploadTotalMarks && uploadPdfData && <span className="marks-estimate">✓ auto-detected</span>}
                <input type="number" className="modal__input" placeholder="e.g. 100 (auto-detected from PDF)" min="0" value={uploadTotalMarks} onChange={e => setUploadTotalMarks(e.target.value)} />
              </label>
              <label className="modal__label">
                Mark Scheme PDF (optional)
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label className="action-btn" style={{ cursor: 'pointer' }}>
                    <FileCheck size={14} /> {uploadMsFileName || 'Choose Mark Scheme'}
                    <input ref={uploadMsFileRef} type="file" accept=".pdf" onChange={handleUploadMsFile} style={{ display: 'none' }} />
                  </label>
                  {uploadMsPdfData && <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>✓ Mark scheme loaded</span>}
                </div>
              </label>
            </div>
            <div className="modal__footer">
              <button className="action-btn" onClick={() => setShowUploadModal(false)}>Cancel</button>
              <button className="action-btn action-btn--primary" onClick={savePaper} disabled={!uploadPdfData || !uploadTitle.trim()}>
                <Upload size={16} /> Import Paper
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="papers-note">
        <p>📝 Download past papers from <a href="https://www.physicsandmathstutor.com/past-papers/" target="_blank" rel="noopener noreferrer">Physics & Maths Tutor</a> or the <a href={`https://www.${subject.examBoard.toLowerCase()}.org.uk`} target="_blank" rel="noopener noreferrer">{subject.examBoard} website</a>, then import them here. Use "Analyze" to let AI detect the topics covered in each paper.</p>
      </div>
    </div>
  );
}

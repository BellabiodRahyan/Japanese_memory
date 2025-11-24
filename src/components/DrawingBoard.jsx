import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import './DrawingBoard.css';

/*
 Component:
 - props: width, height
 - methods via ref: undo(), clear()
 - internal state: paths (array of strokes). Each stroke = {points: [{x,y}], width}
*/

const DrawingBoard = forwardRef(({ width = 600, height = 600 }, ref) => {
	const canvasRef = useRef(null);
	const [paths, setPaths] = useState([]);
	const currentStroke = useRef(null);
	const drawing = useRef(false);

	// expose methods
	useImperativeHandle(ref, () => ({
		undo: () => {
			setPaths(p => {
				const np = p.slice(0, -1);
				redraw(canvasRef.current, np);
				return np;
			});
		},
		clear: () => {
			setPaths([]);
			redraw(canvasRef.current, []);
		},
		// new: return a downscaled grayscale Uint8ClampedArray of the strokes (size x size)
		// usage: await boardRef.current.getImage(64)
		getImage: (size = 64) => {
			// draw only strokes (no grid) into an offscreen canvas at CSS pixel size
			const canvas = canvasRef.current;
			if (!canvas) return null;
			const w = canvas.clientWidth;
			const h = canvas.clientHeight;
			const off = document.createElement('canvas');
			off.width = w;
			off.height = h;
			const ctx = off.getContext('2d');
			// white background
			ctx.fillStyle = '#fff';
			ctx.fillRect(0, 0, w, h);
			// draw strokes onto offscreen
			for (const stroke of paths) {
				drawStrokeOffscreen(ctx, stroke);
			}
			// create downscaled canvas
			const small = document.createElement('canvas');
			small.width = size;
			small.height = size;
			const sctx = small.getContext('2d');
			// draw the offscreen onto small (this downsamples)
			sctx.drawImage(off, 0, 0, size, size);
			// get grayscale pixels
			const img = sctx.getImageData(0, 0, size, size).data;
			const gray = new Uint8ClampedArray(size * size);
			for (let i = 0, p = 0; i < img.length; i += 4, p++) {
				// convert to grayscale luminance
				const r = img[i], g = img[i + 1], b = img[i + 2];
				// darker strokes are lower values; invert so strokes -> black (0) and background -> 255
				const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
				gray[p] = lum;
			}
			return gray;
		}
	}), [paths]);

	useEffect(() => {
		const cnv = canvasRef.current;
		setupCanvasSize(cnv, width, height);
		redraw(cnv, paths);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(()=> {
		redraw(canvasRef.current, paths);
	}, [paths]);

	// use pointer events for robustness
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		function getPos(e) {
			const rect = canvas.getBoundingClientRect();
			if (e.touches && e.touches[0]) {
				return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
			}
			return { x: e.clientX - rect.left, y: e.clientY - rect.top };
		}
		function pointerDown(e) {
			e.preventDefault();
			const p = getPos(e);
			drawing.current = true;
			currentStroke.current = { points: [p], width: strokeWidthRef.current || 14 };
			setPaths(ps => [...ps, {...currentStroke.current}]);
			// capture for mouse
			try { canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); } catch(e){}
		}
		function pointerMove(e) {
			if (!drawing.current || !currentStroke.current) return;
			e.preventDefault();
			const p = getPos(e);
			currentStroke.current.points.push(p);
			// update last path
			setPaths(ps => {
				const copy = ps.slice(0, -1);
				copy.push({...currentStroke.current});
				return copy;
			});
		}
		function pointerUp(e) {
			if (!drawing.current) return;
			e.preventDefault();
			drawing.current = false;
			currentStroke.current = null;
			try { canvas.releasePointerCapture && canvas.releasePointerCapture(e.pointerId); } catch(e){}
		}
		// add listeners (pointer preferred)
		canvas.addEventListener('pointerdown', pointerDown);
		canvas.addEventListener('pointermove', pointerMove);
		window.addEventListener('pointerup', pointerUp);
		// touch fallback (in case pointer unsupported)
		canvas.addEventListener('touchstart', pointerDown, { passive: false });
		canvas.addEventListener('touchmove', pointerMove, { passive: false });
		window.addEventListener('touchend', pointerUp, { passive: false });

		return () => {
			canvas.removeEventListener('pointerdown', pointerDown);
			canvas.removeEventListener('pointermove', pointerMove);
			window.removeEventListener('pointerup', pointerUp);
			canvas.removeEventListener('touchstart', pointerDown);
			canvas.removeEventListener('touchmove', pointerMove);
			window.removeEventListener('touchend', pointerUp);
		};
	}, []);

	// keep strokeWidth in ref for event handlers
	const strokeWidthRef = useRef(14);
	const [strokeWidth, setStrokeWidth] = useState(14);
	useEffect(()=> { strokeWidthRef.current = strokeWidth; }, [strokeWidth]);

	// drawing helpers
	function setupCanvasSize(canvas, w, h) {
		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.floor(w * dpr);
		canvas.height = Math.floor(h * dpr);
		canvas.style.width = `${w}px`;
		canvas.style.height = `${h}px`;
		const ctx = canvas.getContext('2d');
		ctx.scale(dpr, dpr);
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
	}

	function redraw(canvas, pathsToDraw) {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		// draw grid (uses CSS pixel coords)
		drawGrid(ctx, canvas);
		// draw strokes (visible color)
		for (const stroke of pathsToDraw) {
			drawStrokeVisible(ctx, stroke);
		}
	}

	function drawGrid(ctx, canvas) {
		const cssW = canvas.clientWidth;
		const cssH = canvas.clientHeight;
		ctx.save();
		ctx.fillStyle = 'rgba(255,255,255,0.02)';
		ctx.fillRect(0, 0, cssW, cssH);
		const cols = 4, rows = 4;
		ctx.strokeStyle = 'rgba(255,255,255,0.04)';
		ctx.lineWidth = 1;
		for (let i=1;i<cols;i++){ const x=(cssW/cols)*i; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,cssH); ctx.stroke(); }
		for (let j=1;j<rows;j++){ const y=(cssH/rows)*j; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(cssW,y); ctx.stroke(); }
		ctx.strokeStyle = '#fb7185'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(8, cssH/2); ctx.lineTo(cssW-8, cssH/2); ctx.stroke();
		ctx.restore();
	}

	function drawStrokeVisible(ctx, stroke) {
		if (!stroke || !stroke.points || stroke.points.length === 0) return;
		ctx.save();
		ctx.lineWidth = stroke.width;
		ctx.strokeStyle = '#e6f3ff';
		ctx.globalCompositeOperation = 'source-over';
		ctx.beginPath();
		const pts = stroke.points;
		ctx.moveTo(pts[0].x, pts[0].y);
		for (let i=1;i<pts.length-1;i++){
			const cpx = (pts[i].x + pts[i+1].x)/2;
			const cpy = (pts[i].y + pts[i+1].y)/2;
			ctx.quadraticCurveTo(pts[i].x, pts[i].y, cpx, cpy);
		}
		if (pts.length>=2) { const last = pts[pts.length-1]; ctx.lineTo(last.x,last.y); }
		ctx.stroke();
		ctx.restore();
	}

	function drawStrokeOffscreen(ctx, stroke) {
		if (!stroke || !stroke.points || stroke.points.length === 0) return;
		ctx.save();
		ctx.lineWidth = stroke.width;
		ctx.strokeStyle = '#000';
		ctx.globalCompositeOperation = 'source-over';
		ctx.beginPath();
		const pts = stroke.points;
		ctx.moveTo(pts[0].x, pts[0].y);
		for (let i=1;i<pts.length-1;i++){
			const cpx = (pts[i].x + pts[i+1].x)/2;
			const cpy = (pts[i].y + pts[i+1].y)/2;
			ctx.quadraticCurveTo(pts[i].x, pts[i].y, cpx, cpy);
		}
		if (pts.length>=2) { const last = pts[pts.length-1]; ctx.lineTo(last.x,last.y); }
		ctx.stroke();
		ctx.restore();
	}

	return (
		<div className="drawing-panel">
			<canvas ref={canvasRef} className="drawing-canvas" role="img" aria-label="handwriting canvas" />
			<div className="drawing-controls">
				<label className="slider-label">Stroke</label>
				<input type="range" min="4" max="48" value={strokeWidth} onChange={e=>setStrokeWidth(Number(e.target.value))} />
			</div>
		</div>
	);
});

export default DrawingBoard;

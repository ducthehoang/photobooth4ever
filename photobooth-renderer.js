/**
 * ============================================================
 *  4EVER Photo Booth — Canvas Renderer
 *  photobooth-renderer.js
 * ============================================================
 *
 *  HOW TO USE (3 lines):
 *  ─────────────────────
 *  const renderer = new PhotoBoothRenderer();
 *  const dataURL  = await renderer.render(photosArray, frameConfig);
 *  // → paste dataURL into <img src="..."> or trigger download
 *
 *  STANDARD PHOTO-STRIP SIZES
 *  ─────────────────────────────────────────────────────────────
 *  Classic 2×6 inch strip  → 600 × 1800 px  (@300 dpi print)
 *  4×6 inch single layout  → 1200 × 1800 px (@300 dpi print)
 *  Screen display strip    → 400 × 1200 px  (this app default)
 *
 *  All slot coordinates below are in LOGICAL pixels
 *  (before the DPR multiplier is applied).
 * ============================================================
 */

// ─── Helper: load a single image as a Promise ───────────────
function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous'; // needed for canvas export when hosting on different origin
    img.onload  = () => resolve(img);
    img.onerror = () => {
      console.warn(`[PhotoBoothRenderer] Could not load image: ${src}`);
      resolve(null); // resolve null so Promise.all never rejects for missing assets
    };
    img.src = src;
  });
}

// ─── Helper: draw one photo into a slot with object-fit:cover ─
/**
 * Draws `img` into the rectangle (slotX, slotY, slotW, slotH)
 * on `ctx`, cropped to fill the slot without distortion
 * (same behaviour as CSS object-fit: cover).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement} img
 * @param {number} slotX  - slot left edge (logical px, pre-DPR)
 * @param {number} slotY  - slot top edge
 * @param {number} slotW  - slot width
 * @param {number} slotH  - slot height
 * @param {number} dpr    - device pixel ratio
 * @param {number} [cornerRadius=0] - rounded corners (px)
 */
function drawImageCover(ctx, img, slotX, slotY, slotW, slotH, dpr, cornerRadius = 0) {
  if (!img) return;

  // Scale all coordinates to physical pixels
  const x = slotX * dpr;
  const y = slotY * dpr;
  const w = slotW * dpr;
  const h = slotH * dpr;
  const r = cornerRadius * dpr;

  // Object-fit: cover math — find the scale that fills the slot
  const scaleX = w / img.naturalWidth;
  const scaleY = h / img.naturalHeight;
  const scale  = Math.max(scaleX, scaleY); // fill (cover), not fit

  const srcW = w / scale;
  const srcH = h / scale;
  const srcX = (img.naturalWidth  - srcW) / 2; // center-crop X
  const srcY = (img.naturalHeight - srcH) / 2; // center-crop Y

  ctx.save();

  // Clip to rounded rectangle slot
  if (r > 0) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x,     y + r);
    ctx.arcTo(x,     y,     x + r, y,         r);
    ctx.closePath();
    ctx.clip();
  }

  ctx.drawImage(img, srcX, srcY, srcW, srcH, x, y, w, h);
  ctx.restore();
}

// ─── Helper: draw text label ───────────────────────────────
function drawText(ctx, text, x, y, dpr, options = {}) {
  const {
    fontSize    = 28,
    fontFamily  = '"Plus Jakarta Sans", sans-serif',
    fontWeight  = 'bold',
    color       = '#111827',
    align       = 'center',
    alpha       = 1,
  } = options;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle   = color;
  ctx.textAlign   = align;
  ctx.font        = `${fontWeight} ${fontSize * dpr}px ${fontFamily}`;
  ctx.fillText(text, x * dpr, y * dpr);
  ctx.restore();
}


// ═══════════════════════════════════════════════════════════════
//  FRAME CONFIGURATIONS
//  Each frame describes:
//    • canvasW / canvasH   — output canvas size in LOGICAL px
//    • bgColor             — solid fallback color
//    • bgImageUrl          — the full-strip frame image (JPG/PNG)
//    • photoSlots[]        — array of { x, y, w, h, r? }
//                            coordinates in LOGICAL px
//    • overlayImageUrl     — optional PNG drawn ON TOP (z-index 3)
//    • blendMode           — CSS/canvas composite op for the overlay
//    • branding            — text drawn at the bottom
// ═══════════════════════════════════════════════════════════════

/**
 * MEASURING YOUR OWN SLOTS
 * ─────────────────────────
 * Open the frame image in any image editor (Photoshop, Figma, etc.)
 * and note the pixel coordinates of each photo placeholder rectangle.
 * Then express them as fractions of the image size and multiply by
 * your desired canvasW / canvasH to get logical-px coordinates.
 *
 * Example:
 *   Frame image is 400×1200 px.
 *   Slot 1 top-left corner is at (40, 80) in the original image,
 *   slot is 320 × 260 px wide.
 *   → Same percentages apply at any output size.
 */

export const FRAME_CONFIGS = {

  // ────────────────────────────────────────────────────────
  //  "Nơ Hồng" — Pink Ribbon (4 photo slots, black background areas)
  //  Frame image: images/frames/frame_pink_ribbon.jpg
  //  The black areas ARE the photo slots — multiply blend punches
  //  through them so photos show behind, decorations stay on top.
  // ────────────────────────────────────────────────────────
  pink_ribbon: {
    id:              'pink_ribbon',
    label:           'Nơ Hồng',
    canvasW:         400,
    canvasH:         1200,
    bgColor:         '#ffffff',
    bgImageUrl:      'images/frames/frame_pink_ribbon.jpg',
    overlayImageUrl: 'images/frames/frame_pink_ribbon.jpg', // same image drawn on top
    blendMode:       'multiply', // black slots → transparent; decorations stay

    // Photo slot positions (logical px, inside the strip)
    // Measured from the frame's known layout (4 equal rows)
    photoSlots: [
      { x: 28, y: 38,  w: 344, h: 255, r: 6 },  // Slot 1
      { x: 28, y: 308, w: 344, h: 255, r: 6 },  // Slot 2
      { x: 28, y: 575, w: 344, h: 255, r: 6 },  // Slot 3
      { x: 28, y: 840, w: 344, h: 255, r: 6 },  // Slot 4
    ],

    branding: { text: '4EVER', x: 200, y: 1170, fontSize: 24, color: '#111827' },
  },


  // ────────────────────────────────────────────────────────
  //  "Monchhichi" — kawaii grid paper, 4 slots
  //  Frame: images/frames/frame_monchhichi.jpg
  //  Black rectangular slots, decorations around them
  // ────────────────────────────────────────────────────────
  monchhichi: {
    id:              'monchhichi',
    label:           'Monchhichi',
    canvasW:         400,
    canvasH:         1200,
    bgColor:         '#fdf6f0',
    bgImageUrl:      'images/frames/frame_monchhichi.jpg',
    overlayImageUrl: 'images/frames/frame_monchhichi.jpg',
    blendMode:       'multiply',

    photoSlots: [
      { x: 32, y: 42,  w: 336, h: 252, r: 4 },  // Slot 1
      { x: 32, y: 306, w: 336, h: 252, r: 4 },  // Slot 2
      { x: 32, y: 566, w: 336, h: 252, r: 4 },  // Slot 3
      { x: 32, y: 826, w: 336, h: 252, r: 4 },  // Slot 4
    ],

    branding: { text: '4EVER', x: 200, y: 1170, fontSize: 22, color: '#333' },
  },


  // ────────────────────────────────────────────────────────
  //  "Hoa Đào" — Orchid/Flower Heart, 3 heart-shaped slots
  //  Frame: images/frames/frame_flower_heart.jpg
  //  Sky-blue heart cutouts — multiply blend maps sky-blue
  //  near-white areas to semi-transparent; use 'darken' instead
  //  if photos look washed out.
  // ────────────────────────────────────────────────────────
  flower_heart: {
    id:              'flower_heart',
    label:           'Hoa Đào',
    canvasW:         360,
    canvasH:         1100,
    bgColor:         '#6b8e4e', // dark green from frame border
    bgImageUrl:      'images/frames/frame_flower_heart.jpg',
    overlayImageUrl: 'images/frames/frame_flower_heart.jpg',
    blendMode:       'multiply',

    // Heart slots — use circular clip (r ≈ half of slot size)
    // to approximate the heart shape visually in canvas
    photoSlots: [
      { x: 60, y: 40,  w: 240, h: 240, r: 120 }, // Slot 1 (circular crop)
      { x: 60, y: 370, w: 240, h: 240, r: 120 }, // Slot 2
      { x: 60, y: 700, w: 240, h: 240, r: 120 }, // Slot 3
    ],

    branding: { text: '4EVER', x: 180, y: 1075, fontSize: 20, color: '#fff' },
  },


  // ────────────────────────────────────────────────────────
  //  "Hoa Lan" — Receiptify (pink dashed border, 3 mixed-shape slots)
  //  Frame: images/frames/frame_receiptify.jpg
  // ────────────────────────────────────────────────────────
  receiptify: {
    id:              'receiptify',
    label:           'Hoa Lan',
    canvasW:         360,
    canvasH:         1100,
    bgColor:         '#f9c8d4',
    bgImageUrl:      'images/frames/frame_receiptify.jpg',
    overlayImageUrl: 'images/frames/frame_receiptify.jpg',
    blendMode:       'multiply',

    photoSlots: [
      { x: 55, y: 95,  w: 250, h: 240, r: 20 }, // Slot 1 (heart-ish)
      { x: 55, y: 420, w: 250, h: 210, r: 20 }, // Slot 2 (cloud-ish)
      { x: 55, y: 710, w: 250, h: 240, r: 20 }, // Slot 3 (heart-bow)
    ],

    branding: { text: '4EVER', x: 180, y: 1070, fontSize: 18, color: '#b06090' },
  },


  // ────────────────────────────────────────────────────────
  //  "Picnic" — Fruit Picnic (wooden frame, 4 rectangular slots)
  //  Frame: images/frames/frame_fruit_picnic.jpg
  //  Sky-blue placeholders → multiply blend makes them transparent
  // ────────────────────────────────────────────────────────
  fruit_picnic: {
    id:              'fruit_picnic',
    label:           'Picnic',
    canvasW:         400,
    canvasH:         1200,
    bgColor:         '#e8d5c4',
    bgImageUrl:      'images/frames/frame_fruit_picnic.jpg',
    overlayImageUrl: 'images/frames/frame_fruit_picnic.jpg',
    blendMode:       'multiply',

    photoSlots: [
      { x: 38, y: 12,  w: 324, h: 258, r: 6 },  // Slot 1
      { x: 38, y: 308, w: 324, h: 258, r: 6 },  // Slot 2
      { x: 38, y: 600, w: 324, h: 258, r: 6 },  // Slot 3
      { x: 38, y: 890, w: 324, h: 258, r: 6 },  // Slot 4
    ],

    branding: { text: '4EVER', x: 200, y: 1175, fontSize: 22, color: '#5a3a1a' },
  },


  // ────────────────────────────────────────────────────────
  //  "Cơ Bản" — Plain Classic (no decorative frame image)
  //  White strip with thin pink border, 4 photos
  // ────────────────────────────────────────────────────────
  classic: {
    id:              'classic',
    label:           'Cơ Bản',
    canvasW:         400,
    canvasH:         1200,
    bgColor:         '#ffffff',
    bgImageUrl:      null,  // no frame image — draw programmatically
    overlayImageUrl: null,
    blendMode:       'source-over',

    photoSlots: [
      { x: 30, y: 30,  w: 340, h: 256, r: 8 },  // Slot 1
      { x: 30, y: 300, w: 340, h: 256, r: 8 },  // Slot 2
      { x: 30, y: 570, w: 340, h: 256, r: 8 },  // Slot 3
      { x: 30, y: 840, w: 340, h: 256, r: 8 },  // Slot 4
    ],

    branding: { text: '4EVER', x: 200, y: 1165, fontSize: 26, color: '#111827' },
  },
};


// ═══════════════════════════════════════════════════════════════
//  PhotoBoothRenderer  ← main class
// ═══════════════════════════════════════════════════════════════

export class PhotoBoothRenderer {

  /**
   * @param {HTMLCanvasElement} [canvas] — pass an existing canvas, or
   *   leave blank and one will be created in memory (headless export).
   */
  constructor(canvas = null) {
    this._canvas = canvas || document.createElement('canvas');
  }

  // ─── Public: render and return Data URL ─────────────────────

  /**
   * Composite photos + frame → High-DPI PNG Data URL.
   *
   * @param {string[]} photosArray    — array of src URLs / base64 data-URLs
   * @param {object}   frameConfig    — one of FRAME_CONFIGS[key]
   * @param {object}   [options]
   * @param {string}   [options.dateText]  — date string for branding strip
   * @param {number}   [options.dpr]       — force a specific DPR (default: devicePixelRatio)
   * @returns {Promise<string>}            — PNG Data URL
   */
  async render(photosArray, frameConfig, options = {}) {
    const {
      dateText = this._todayString(),
      dpr      = Math.min(window.devicePixelRatio || 1, 3), // cap at 3× for perf
    } = options;

    const cfg = { ...frameConfig }; // shallow copy so we don't mutate the original
    const ctx = this._setupCanvas(cfg.canvasW, cfg.canvasH, dpr);

    // ── 1. Pre-load ALL images in parallel ───────────────────
    const [bgImg, overlayImg, ...photoImgs] = await Promise.all([
      loadImage(cfg.bgImageUrl),
      loadImage(cfg.overlayImageUrl),
      ...photosArray.map(src => loadImage(src)),
    ]);

    // ── 2. Draw background ───────────────────────────────────
    this._drawBackground(ctx, cfg, bgImg, dpr);

    // ── 3. Draw each photo into its slot ─────────────────────
    const slots = cfg.photoSlots || [];
    photoImgs.forEach((photoImg, i) => {
      if (i >= slots.length) return; // more photos than slots → ignore extras
      const slot = slots[i];
      drawImageCover(ctx, photoImg, slot.x, slot.y, slot.w, slot.h, dpr, slot.r || 0);
    });

    // ── 4. Draw frame overlay (decorations on top of photos) ─
    if (overlayImg) {
      this._drawOverlay(ctx, overlayImg, cfg, dpr);
    }

    // ── 5. Draw branding strip ────────────────────────────────
    this._drawBranding(ctx, cfg, dateText, dpr);

    // ── 6. Return Data URL ────────────────────────────────────
    return this._canvas.toDataURL('image/png');
  }

  /**
   * Convenience: render and immediately trigger a file download.
   * @param {string[]} photosArray
   * @param {object}   frameConfig
   * @param {string}   [filename]
   * @param {object}   [options]
   */
  async download(photosArray, frameConfig, filename, options = {}) {
    const dataURL = await this.render(photosArray, frameConfig, options);
    const link    = document.createElement('a');
    link.download = filename || `4EVER-${frameConfig.id}-${Date.now()}.png`;
    link.href     = dataURL;
    link.click();
    return dataURL;
  }

  // ─── Private Helpers ─────────────────────────────────────────

  /** Set canvas physical size accounting for DPR */
  _setupCanvas(logicalW, logicalH, dpr) {
    this._canvas.width  = logicalW * dpr;
    this._canvas.height = logicalH * dpr;
    // Keep CSS size at logical pixels so the canvas isn't zoomed in
    this._canvas.style.width  = logicalW + 'px';
    this._canvas.style.height = logicalH + 'px';
    return this._canvas.getContext('2d');
  }

  /** Draw solid color or full-strip background image */
  _drawBackground(ctx, cfg, bgImg, dpr) {
    const W = cfg.canvasW * dpr;
    const H = cfg.canvasH * dpr;

    // Solid background color first (fallback + canvas base)
    ctx.fillStyle = cfg.bgColor || '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // If this frame uses multiply blending for the overlay,
    // we DON'T draw the bg image as background — we draw it as overlay later.
    // For frames with a separate, non-blended bg image, draw it here.
    if (bgImg && cfg.blendMode === 'source-over') {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(bgImg, 0, 0, W, H);
      ctx.restore();
    }
  }

  /**
   * Draw the decorative frame image ON TOP of photos.
   * Uses `cfg.blendMode` (typically 'multiply') so dark/black
   * photo-slot areas in the frame become transparent.
   *
   * Multiply math: result = (frame_color × photo_color) / 255
   *   → frame black (0)  × any photo color = 0  (transparent-like)
   *   → frame white (255) × photo color    = photo color (invisible)
   *   → frame pink (200)  × photo light    = pink tint (visible decoration)
   */
  _drawOverlay(ctx, overlayImg, cfg, dpr) {
    const W = cfg.canvasW * dpr;
    const H = cfg.canvasH * dpr;

    ctx.save();
    ctx.globalCompositeOperation = cfg.blendMode || 'multiply';
    ctx.drawImage(overlayImg, 0, 0, W, H);
    ctx.restore();
  }

  /** Draw "4EVER" logo + date at the bottom */
  _drawBranding(ctx, cfg, dateText, dpr) {
    if (!cfg.branding) return;
    const b = cfg.branding;

    // Studio name
    drawText(ctx, b.text || '4EVER', b.x, b.y, dpr, {
      fontSize:   b.fontSize   || 28,
      fontWeight: 'bold',
      color:      b.color      || '#111827',
      align:      'center',
    });

    // Date (slightly smaller, below the name)
    drawText(ctx, dateText, b.x, b.y + (b.fontSize || 28) + 4, dpr, {
      fontSize:   (b.fontSize || 28) * 0.55,
      fontWeight: 'normal',
      fontFamily: 'monospace',
      color:      b.color || '#666666',
      align:      'center',
      alpha:      0.75,
    });
  }

  /** Format today as YYYY.MM.DD */
  _todayString() {
    return new Date().toISOString().slice(0, 10).replaceAll('-', '.');
  }
}

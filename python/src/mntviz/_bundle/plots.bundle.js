// src/minutiae-renderer.js
var SVG_NS = "http://www.w3.org/2000/svg";
var minutiaDataMap = /* @__PURE__ */ new WeakMap();
var DEFAULTS = {
  markerSize: 2,
  lineWidth: 1,
  segmentLength: 5,
  baseOpacity: 1,
  qualityAlpha: true,
  markerShape: "circle",
  showQuality: false,
  showAngles: false,
  showLabels: false,
  qualityFontSize: 5,
  qualityXShift: 0,
  qualityYShift: 10,
  angleFontSize: 5,
  angleXShift: 0,
  angleYShift: -10,
  labelFontSize: 5,
  labelXShift: 0,
  labelYShift: -8,
  label: null
};
function createMarkerShape(shape, cx, cy, r) {
  let el;
  switch (shape) {
    case "square":
      el = document.createElementNS(SVG_NS, "rect");
      el.setAttribute("x", cx - r);
      el.setAttribute("y", cy - r);
      el.setAttribute("width", 2 * r);
      el.setAttribute("height", 2 * r);
      el.setAttribute("fill", "none");
      break;
    case "diamond": {
      el = document.createElementNS(SVG_NS, "polygon");
      el.setAttribute(
        "points",
        `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`
      );
      el.setAttribute("fill", "none");
      break;
    }
    case "triangle": {
      el = document.createElementNS(SVG_NS, "polygon");
      const cos = (a) => Math.cos(a * Math.PI / 180);
      const sin = (a) => Math.sin(a * Math.PI / 180);
      const pts = [90, 210, 330].map(
        (a) => `${cx + r * cos(a)},${cy - r * sin(a)}`
      ).join(" ");
      el.setAttribute("points", pts);
      el.setAttribute("fill", "none");
      break;
    }
    default:
      el = document.createElementNS(SVG_NS, "circle");
      el.setAttribute("cx", cx);
      el.setAttribute("cy", cy);
      el.setAttribute("r", r);
      el.setAttribute("fill", "none");
      break;
  }
  return el;
}
var MinutiaeRenderer = class {
  /**
   * @param {SVGElement} svgElement - The SVG layer from Viewer.svgLayer.
   */
  constructor(svgElement) {
    this._svg = svgElement;
  }
  /**
   * Draw a set of minutiae as circle + direction line.
   *
   * @param {Array<{x: number, y: number, angle: number, quality: number}>} minutiae
   * @param {string} color - CSS color (e.g. '#FF0000').
   * @param {object} [options] - Override defaults.
   */
  draw(minutiae, color, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const {
      markerSize,
      lineWidth,
      segmentLength,
      baseOpacity,
      qualityAlpha,
      markerShape,
      showQuality,
      showAngles,
      showLabels,
      qualityFontSize,
      qualityXShift,
      qualityYShift,
      angleFontSize,
      angleXShift,
      angleYShift,
      labelFontSize,
      labelXShift,
      labelYShift
    } = opts;
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("stroke", color);
    g.setAttribute("fill", color);
    g.setAttribute("stroke-width", lineWidth);
    g.setAttribute("stroke-linecap", "round");
    g.setAttribute("stroke-linejoin", "round");
    const textGroup = document.createElementNS(SVG_NS, "g");
    textGroup.setAttribute("stroke", "none");
    textGroup.setAttribute("fill", color);
    for (const m of minutiae) {
      const { x, y, angle, quality } = m;
      const mntColor = m._color || color;
      const mntShape = m._shape || markerShape;
      const opacity = qualityAlpha ? baseOpacity * Math.min(1, Math.max(0.2, quality / 100)) : baseOpacity;
      const mg = document.createElementNS(SVG_NS, "g");
      mg.setAttribute("opacity", opacity);
      mg.setAttribute("stroke", mntColor);
      mg.classList.add("mntviz-mnt-marker");
      mg.style.pointerEvents = "auto";
      mg.style.cursor = "crosshair";
      minutiaDataMap.set(mg, { ...m, _color: mntColor, _shape: mntShape, _label: m._label || opts.label || null });
      const hitCircle = document.createElementNS(SVG_NS, "circle");
      hitCircle.setAttribute("cx", x);
      hitCircle.setAttribute("cy", y);
      hitCircle.setAttribute("r", markerSize + 4);
      hitCircle.setAttribute("fill", "transparent");
      hitCircle.setAttribute("stroke", "none");
      mg.appendChild(hitCircle);
      const marker = createMarkerShape(mntShape, x, y, markerSize);
      mg.appendChild(marker);
      const rad = angle * (Math.PI / 180);
      const xEnd = x + segmentLength * Math.cos(rad);
      const yEnd = y - segmentLength * Math.sin(rad);
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", x);
      line.setAttribute("y1", y);
      line.setAttribute("x2", xEnd);
      line.setAttribute("y2", yEnd);
      mg.appendChild(line);
      g.appendChild(mg);
      if (showQuality) {
        const qText = document.createElementNS(SVG_NS, "text");
        qText.setAttribute("x", x + qualityXShift);
        qText.setAttribute("y", y + qualityYShift);
        qText.setAttribute("text-anchor", "middle");
        qText.setAttribute("fill", mntColor);
        qText.setAttribute("font-size", `${qualityFontSize}px`);
        qText.textContent = `Q:${Math.round(quality)}`;
        textGroup.appendChild(qText);
      }
      if (showAngles) {
        const aText = document.createElementNS(SVG_NS, "text");
        aText.setAttribute("x", x + angleXShift);
        aText.setAttribute("y", y + angleYShift);
        aText.setAttribute("text-anchor", "middle");
        aText.setAttribute("fill", mntColor);
        aText.setAttribute("font-size", `${angleFontSize}px`);
        aText.textContent = `${Math.round(angle)}\xB0`;
        textGroup.appendChild(aText);
      }
      if (showLabels) {
        const labelVal = m._label || opts.label;
        if (labelVal != null) {
          const lText = document.createElementNS(SVG_NS, "text");
          lText.setAttribute("x", x + labelXShift);
          lText.setAttribute("y", y + labelYShift);
          lText.setAttribute("text-anchor", "middle");
          lText.setAttribute("fill", mntColor);
          lText.setAttribute("font-size", `${labelFontSize}px`);
          lText.textContent = String(labelVal);
          textGroup.appendChild(lText);
        }
      }
    }
    this._svg.appendChild(g);
    if (showQuality || showAngles || showLabels) {
      this._svg.appendChild(textGroup);
    }
  }
  /** Remove all drawn minutiae. */
  clear() {
    this._svg.innerHTML = "";
  }
};

// src/minutiae-inspector.js
var SVG_NS2 = "http://www.w3.org/2000/svg";
var PATCH_MODE_NONE = "none";
var PATCH_MODE_VISIBLE = "visible";
var DEFAULTS2 = {
  patchSize: 128,
  patchDisplaySize: 256,
  nearbyRadius: 64,
  markerColor: "#00ff00",
  getAllMinutiae: null,
  // Patch overlay settings
  patchMode: PATCH_MODE_VISIBLE,
  // none | visible | all
  patchUseColors: true,
  patchAlphaMultiplier: 0.4
};
var MinutiaeInspector = class {
  /**
   * @param {import('./viewer.js').Viewer} viewer
   * @param {object} [options]
   */
  constructor(viewer, options = {}) {
    this._viewer = viewer;
    this._options = { ...DEFAULTS2, ...options };
    this._isExpanded = false;
    this._activeMinutia = null;
    this._activeMarkerEl = null;
    this._hoveredMarkerEl = null;
    this._ac = null;
    this._hideTimer = null;
    this._mouseDownPos = null;
    this._buildTooltip();
  }
  enable() {
    if (this._ac) this._ac.abort();
    this._ac = new AbortController();
    const sig = { signal: this._ac.signal };
    const svg = this._viewer.svgLayer;
    svg.addEventListener("mouseover", (e) => this._onMouseOver(e), sig);
    svg.addEventListener("mouseout", (e) => this._onMouseOut(e), sig);
    svg.addEventListener("mousedown", (e) => this._onSvgMouseDown(e), sig);
    svg.addEventListener("mouseup", (e) => this._onSvgMouseUp(e), sig);
    this._viewer.viewport.addEventListener("mousedown", (e) => this._onViewportMouseDown(e), sig);
  }
  disable() {
    if (this._ac) {
      this._ac.abort();
      this._ac = null;
    }
    this._unhighlight();
    this._hide();
  }
  setOptions(opts) {
    Object.assign(this._options, opts);
    this._rerenderPatch();
  }
  destroy() {
    this.disable();
    if (this._tooltip && this._tooltip.parentNode) {
      this._tooltip.parentNode.removeChild(this._tooltip);
    }
    this._tooltip = null;
  }
  /* ── DOM ──────────────────────────────────────────────── */
  _buildTooltip() {
    const tip = document.createElement("div");
    tip.className = "mntviz-inspector-tooltip";
    this._fields = document.createElement("div");
    this._fields.className = "mntviz-inspector-fields";
    this._patchWrap = document.createElement("div");
    this._patchWrap.className = "mntviz-inspector-patch";
    this._patchWrap.style.display = "none";
    this._patchCanvas = document.createElement("canvas");
    this._patchSvg = document.createElementNS(SVG_NS2, "svg");
    this._patchWrap.append(this._patchCanvas, this._patchSvg);
    this._closeBtn = document.createElement("span");
    this._closeBtn.className = "mntviz-inspector-close";
    this._closeBtn.textContent = "\xD7";
    this._closeBtn.style.display = "none";
    this._closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._collapse();
    });
    tip.append(this._closeBtn, this._fields, this._patchWrap);
    this._tooltip = tip;
    this._viewer.viewport.appendChild(tip);
    this._fields.classList.add("mntviz-drag-handle");
    this._fields.addEventListener("mousedown", (e) => {
      if (!this._isExpanded) return;
      e.stopPropagation();
      this._dragOffset = {
        x: e.clientX - this._tooltip.offsetLeft,
        y: e.clientY - this._tooltip.offsetTop
      };
      this._fields.classList.add("mntviz-dragging");
      const onMove = (ev) => {
        this._tooltip.style.left = `${ev.clientX - this._dragOffset.x}px`;
        this._tooltip.style.top = `${ev.clientY - this._dragOffset.y}px`;
      };
      const onUp = () => {
        this._fields.classList.remove("mntviz-dragging");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }
  /* ── Event handlers ───────────────────────────────────── */
  _onMouseOver(e) {
    const marker = e.target.closest(".mntviz-mnt-marker");
    if (!marker) return;
    if (this._isExpanded) return;
    clearTimeout(this._hideTimer);
    const m = minutiaDataMap.get(marker);
    if (!m) return;
    this._activeMinutia = m;
    this._activeMarkerEl = marker;
    this._highlight(marker);
    this._updateFields(m);
    this._patchWrap.style.display = "none";
    this._closeBtn.style.display = "none";
    this._tooltip.classList.remove("mntviz-inspector-expanded");
    this._positionTooltip(m.x, m.y);
    this._show();
  }
  _onMouseOut(e) {
    const marker = e.target.closest(".mntviz-mnt-marker");
    if (!marker) return;
    if (this._isExpanded) return;
    this._unhighlight();
    this._hideTimer = setTimeout(() => this._hide(), 60);
  }
  _onSvgMouseDown(e) {
    const marker = e.target.closest(".mntviz-mnt-marker");
    this._mouseDownPos = { x: e.clientX, y: e.clientY };
    if (marker) {
      e.stopPropagation();
      e.preventDefault();
    }
  }
  _onSvgMouseUp(e) {
    if (!this._mouseDownPos) return;
    const dx = e.clientX - this._mouseDownPos.x;
    const dy = e.clientY - this._mouseDownPos.y;
    this._mouseDownPos = null;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) return;
    const marker = e.target.closest(".mntviz-mnt-marker");
    if (!marker) return;
    const m = minutiaDataMap.get(marker);
    if (!m) return;
    e.stopPropagation();
    this._expand(m, marker);
  }
  _onViewportMouseDown(e) {
  }
  /* ── Highlight ────────────────────────────────────────── */
  _highlight(marker) {
    this._unhighlight();
    this._hoveredMarkerEl = marker;
    marker.classList.add("mntviz-mnt-highlighted");
    marker.parentNode.appendChild(marker);
  }
  _unhighlight() {
    if (this._hoveredMarkerEl) {
      this._hoveredMarkerEl.classList.remove("mntviz-mnt-highlighted");
      this._hoveredMarkerEl = null;
    }
  }
  /* ── Show / hide ──────────────────────────────────────── */
  _show() {
    this._tooltip.classList.add("mntviz-inspector-visible");
  }
  _hide() {
    this._tooltip.classList.remove("mntviz-inspector-visible");
    this._tooltip.classList.remove("mntviz-inspector-expanded");
    this._isExpanded = false;
  }
  _collapse() {
    this._isExpanded = false;
    this._unhighlight();
    this._patchWrap.style.display = "none";
    this._closeBtn.style.display = "none";
    this._tooltip.classList.remove("mntviz-inspector-expanded");
    this._hide();
  }
  /* ── Expand with patch ────────────────────────────────── */
  _expand(m, marker) {
    this._isExpanded = true;
    this._activeMinutia = m;
    this._activeMarkerEl = marker;
    this._highlight(marker);
    this._updateFields(m);
    this._renderPatch(m);
    this._patchWrap.style.display = "";
    this._closeBtn.style.display = "";
    this._tooltip.classList.add("mntviz-inspector-expanded");
    this._show();
    requestAnimationFrame(() => this._positionTooltip(m.x, m.y));
  }
  _rerenderPatch() {
    if (!this._isExpanded || !this._activeMinutia) return;
    this._renderPatch(this._activeMinutia);
  }
  /* ── Fields ───────────────────────────────────────────── */
  _updateFields(m) {
    const lines = [];
    if (m._label) {
      lines.push(`<span>src:</span> <b style="color:${m._color || "#fff"}">${m._label}</b>`);
    }
    lines.push(
      `<span>x:</span> ${Math.round(m.x)}  <span>y:</span> ${Math.round(m.y)}`,
      `<span>\u03B8:</span> ${Math.round(m.angle)}\xB0  <span>Q:</span> ${Math.round(m.quality ?? 100)}`
    );
    if (m.extra && m.extra.length) {
      lines.push(`<span>extra:</span> ${m.extra.join(" ")}`);
    }
    this._fields.innerHTML = lines.join("<br>");
  }
  /* ── Tooltip positioning ──────────────────────────────── */
  _positionTooltip(mx, my) {
    const svgRect = this._viewer.svgLayer.getBoundingClientRect();
    const vpRect = this._viewer.viewport.getBoundingClientRect();
    const imgSize = this._viewer.imageSize;
    if (!imgSize.width || !imgSize.height) return;
    const scaleX = svgRect.width / imgSize.width;
    const scaleY = svgRect.height / imgSize.height;
    const screenX = svgRect.left - vpRect.left + mx * scaleX;
    const screenY = svgRect.top - vpRect.top + my * scaleY;
    const tipW = this._tooltip.offsetWidth;
    const tipH = this._tooltip.offsetHeight;
    let left = screenX + 15;
    let top = screenY - tipH / 2;
    if (left + tipW > vpRect.width) left = screenX - tipW - 15;
    if (left < 5) left = 5;
    if (top < 5) top = 5;
    if (top + tipH > vpRect.height - 5) top = vpRect.height - tipH - 5;
    this._tooltip.style.left = `${left}px`;
    this._tooltip.style.top = `${top}px`;
  }
  /* ── Patch extraction ─────────────────────────────────── */
  _extractPatch(mx, my, angleDeg) {
    const ps = this._options.patchSize;
    const rotAngle = angleDeg * (Math.PI / 180);
    const canvas = document.createElement("canvas");
    canvas.width = ps;
    canvas.height = ps;
    const ctx = canvas.getContext("2d");
    ctx.translate(ps / 2, ps / 2);
    ctx.rotate(rotAngle);
    ctx.drawImage(this._viewer.imageElement, -mx, -my);
    return canvas;
  }
  _renderPatch(m) {
    const ps = this._options.patchSize;
    const ds = this._options.patchDisplaySize;
    const patchCanvas = this._extractPatch(m.x, m.y, m.angle);
    this._patchCanvas.width = ps;
    this._patchCanvas.height = ps;
    this._patchCanvas.style.width = `${ds}px`;
    this._patchCanvas.style.height = `${ds}px`;
    const ctx = this._patchCanvas.getContext("2d");
    ctx.drawImage(patchCanvas, 0, 0);
    this._patchSvg.setAttribute("viewBox", `0 0 ${ps} ${ps}`);
    this._patchSvg.innerHTML = "";
    const mode = this._options.patchMode;
    if (mode === PATCH_MODE_NONE) return;
    const rotAngle = m.angle * (Math.PI / 180);
    const useColors = this._options.patchUseColors;
    const alphaMul = this._options.patchAlphaMultiplier;
    const clickedColor = useColors ? m._color || this._options.markerColor : this._options.markerColor;
    const clickedShape = m._shape || this._options.markerShape || "circle";
    this._drawPatchMarker(ps / 2, ps / 2, 0, clickedColor, 1, clickedShape);
    if (mode !== PATCH_MODE_NONE && this._options.getAllMinutiae) {
      const all = this._options.getAllMinutiae();
      const r = this._options.nearbyRadius;
      const visibleKeys = mode === PATCH_MODE_VISIBLE ? this._getVisibleMinutiaeKeys() : null;
      for (const o of all) {
        if (o.x === m.x && o.y === m.y && o.angle === m.angle) continue;
        const dx = o.x - m.x;
        const dy = o.y - m.y;
        if (dx * dx + dy * dy > r * r) continue;
        if (visibleKeys && !visibleKeys.has(`${o.x},${o.y},${o.angle}`)) continue;
        const cos = Math.cos(rotAngle);
        const sin = Math.sin(rotAngle);
        const px = dx * cos - dy * sin + ps / 2;
        const py = dx * sin + dy * cos + ps / 2;
        const pa = ((o.angle - m.angle) % 360 + 360) % 360;
        if (px < 0 || px > ps || py < 0 || py > ps) continue;
        const color = useColors ? o._color || "#fff" : "#fff";
        const oShape = o._shape || this._options.markerShape || "circle";
        const qFactor = Math.min(1, Math.max(0.2, (o.quality ?? 100) / 100));
        const alpha = qFactor * alphaMul;
        this._drawPatchMarker(px, py, pa, color, alpha, oShape);
      }
    }
  }
  _getVisibleMinutiaeKeys() {
    const keys = /* @__PURE__ */ new Set();
    const markers = this._viewer.svgLayer.querySelectorAll(".mntviz-mnt-marker");
    for (const el of markers) {
      const d = minutiaDataMap.get(el);
      if (d) keys.add(`${d.x},${d.y},${d.angle}`);
    }
    return keys;
  }
  _drawPatchMarker(x, y, angleDeg, color, opacity, shape = "circle") {
    const r = 3;
    const segLen = 7;
    const rad = angleDeg * (Math.PI / 180);
    const xEnd = x + segLen * Math.cos(rad);
    const yEnd = y - segLen * Math.sin(rad);
    const g = document.createElementNS(SVG_NS2, "g");
    g.setAttribute("opacity", opacity);
    g.setAttribute("stroke", color);
    g.setAttribute("fill", "none");
    g.setAttribute("stroke-width", "1");
    const marker = createMarkerShape(shape, x, y, r);
    g.appendChild(marker);
    const line = document.createElementNS(SVG_NS2, "line");
    line.setAttribute("x1", x);
    line.setAttribute("y1", y);
    line.setAttribute("x2", xEnd);
    line.setAttribute("y2", yEnd);
    g.appendChild(line);
    this._patchSvg.appendChild(g);
  }
};

// src/viewer.js
var SVG_NS3 = "http://www.w3.org/2000/svg";
var Viewer = class {
  /**
   * @param {string|HTMLElement} container - CSS selector or element.
   * @param {object} [options]
   * @param {boolean} [options.minimap=true]  - Show minimap.
   * @param {Function} [options.onResize]     - Called after internal resize.
   * @param {Function} [options.onTransform]  - Called after every pan/zoom transform.
   */
  constructor(container, options = {}) {
    this._el = typeof container === "string" ? document.querySelector(container) : container;
    if (!this._el) throw new Error(`mntviz: container not found: ${container}`);
    this._options = { minimap: true, ...options };
    this._view = { scale: 1, translateX: 0, translateY: 0, isDragging: false, lastX: 0, lastY: 0 };
    this._abortController = new AbortController();
    this._minutiaeInspector = null;
    this._virtualSize = null;
    this._buildDOM();
    this._bindEvents();
  }
  /* ── Public API ─────────────────────────────────────────── */
  /** The SVG overlay element. Pass this to MinutiaeRenderer / UVFieldRenderer. */
  get svgLayer() {
    return this._svg;
  }
  /** The canvas-container element. Pass this to OverlayLayer. */
  get canvasContainer() {
    return this._canvas;
  }
  /** The underlying <img> element (for pixel-level access). */
  get imageElement() {
    return this._img;
  }
  /** The viewport element (for coordinate transforms and tooltip positioning). */
  get viewport() {
    return this._viewport;
  }
  /** Current view state (read-only snapshot). */
  get viewState() {
    return { scale: this._view.scale, translateX: this._view.translateX, translateY: this._view.translateY };
  }
  /** Natural dimensions of the loaded image (or virtual size). */
  get imageSize() {
    const vs = this._virtualSize;
    return {
      width: vs ? vs.width : this._img.naturalWidth || 0,
      height: vs ? vs.height : this._img.naturalHeight || 0
    };
  }
  /**
   * Load an image and reset the view.
   * @param {string} src - Image URL.
   * @returns {Promise<void>}
   */
  loadImage(src) {
    return new Promise((resolve, reject) => {
      const probe = new Image();
      probe.onload = () => {
        this._virtualSize = null;
        this._img.style.width = "";
        this._img.style.height = "";
        this._img.src = src;
        if (this._minimapImg) this._minimapImg.src = src;
        if (this._minimapWrap) this._minimapWrap.style.display = "block";
        this._syncLayers();
        this.resetView();
        resolve();
      };
      probe.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      probe.src = src;
    });
  }
  /** Clear the image and SVG layer. */
  clear() {
    this._img.removeAttribute("src");
    this._svg.innerHTML = "";
    this._virtualSize = null;
    if (this._minimapWrap) this._minimapWrap.style.display = "none";
  }
  /**
   * Set a virtual viewport size without loading an image.
   * Useful for rendering minutiae-only visualizations.
   * @param {number} width  - Virtual canvas width in pixels.
   * @param {number} height - Virtual canvas height in pixels.
   */
  setViewportSize(width, height) {
    this._virtualSize = { width, height };
    this._img.removeAttribute("src");
    this._img.style.width = width + "px";
    this._img.style.height = height + "px";
    this._syncLayers();
    this.resetView();
  }
  /** Fit the image to 95% of the viewport. */
  resetView() {
    const vw = this._viewport.clientWidth;
    const vh = this._viewport.clientHeight;
    const vs = this._virtualSize;
    const iw = vs ? vs.width : this._img.naturalWidth || 500;
    const ih = vs ? vs.height : this._img.naturalHeight || 500;
    const scale = Math.min(vw / iw, vh / ih);
    this._view.scale = scale;
    this._view.translateX = (vw - iw * scale) / 2;
    this._view.translateY = (vh - ih * scale) / 2;
    this._applyTransform();
  }
  /**
   * Serialize the SVG layer (with background image embedded) as a standalone SVG string.
   * @returns {string} SVG markup.
   */
  exportSVG() {
    const clone = this._svg.cloneNode(true);
    clone.setAttribute("xmlns", SVG_NS3);
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    clone.classList.remove("mntviz-mnt-layer");
    clone.removeAttribute("style");
    if (this._img.src) {
      const canvas = document.createElement("canvas");
      const w = this._img.naturalWidth;
      const h = this._img.naturalHeight;
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(this._img, 0, 0);
      const dataUri = canvas.toDataURL("image/png");
      const img = document.createElementNS(SVG_NS3, "image");
      img.setAttribute("href", dataUri);
      img.setAttribute("width", w);
      img.setAttribute("height", h);
      clone.insertBefore(img, clone.firstChild);
    }
    return new XMLSerializer().serializeToString(clone);
  }
  /**
   * Download the full SVG as a file.
   * @param {string} [filename='minutiae.svg'] - Download filename.
   */
  downloadSVG(filename = "minutiae.svg") {
    const svg = this.exportSVG();
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  /**
   * Return the visible image region based on current zoom/pan.
   * @returns {{ x: number, y: number, w: number, h: number }}
   */
  visibleRegion() {
    const { scale: s, translateX: tx, translateY: ty } = this._view;
    const vpW = this._viewport.clientWidth;
    const vpH = this._viewport.clientHeight;
    return { x: -tx / s, y: -ty / s, w: vpW / s, h: vpH / s };
  }
  /**
   * Serialize only the currently visible viewport region as SVG.
   * @returns {string} SVG markup.
   */
  exportSVGView() {
    const { x, y, w, h } = this.visibleRegion();
    const vpW = this._viewport.clientWidth;
    const vpH = this._viewport.clientHeight;
    const svg = document.createElementNS(SVG_NS3, "svg");
    svg.setAttribute("xmlns", SVG_NS3);
    svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    svg.setAttribute("width", vpW);
    svg.setAttribute("height", vpH);
    svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
    if (this._img.src) {
      const canvas = document.createElement("canvas");
      const nw = this._img.naturalWidth;
      const nh = this._img.naturalHeight;
      canvas.width = nw;
      canvas.height = nh;
      canvas.getContext("2d").drawImage(this._img, 0, 0);
      const img = document.createElementNS(SVG_NS3, "image");
      img.setAttribute("href", canvas.toDataURL("image/png"));
      img.setAttribute("width", nw);
      img.setAttribute("height", nh);
      svg.appendChild(img);
    }
    const mntClone = this._svg.cloneNode(true);
    mntClone.removeAttribute("class");
    mntClone.removeAttribute("style");
    while (mntClone.firstChild) svg.appendChild(mntClone.firstChild);
    return new XMLSerializer().serializeToString(svg);
  }
  /**
   * Download the visible viewport region as an SVG file.
   * @param {string} [filename='minutiae_view.svg'] - Download filename.
   */
  downloadSVGView(filename = "minutiae_view.svg") {
    const svg = this.exportSVGView();
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  /** Remove all event listeners and DOM created by this viewer. */
  destroy() {
    this.disableMinutiaeInspector();
    this._abortController.abort();
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._el.innerHTML = "";
  }
  /**
   * Enable native minutiae interaction (hover info + click patch) on this viewer.
   * @param {object} [options] - MinutiaeInspector options.
   * @returns {import('./minutiae-inspector.js').MinutiaeInspector}
   */
  enableMinutiaeInspector(options = {}) {
    if (this._minutiaeInspector) {
      this._minutiaeInspector.setOptions(options);
      this._minutiaeInspector.enable();
      return this._minutiaeInspector;
    }
    this._minutiaeInspector = new MinutiaeInspector(this, options);
    this._minutiaeInspector.enable();
    return this._minutiaeInspector;
  }
  /** Disable and detach the native minutiae inspector, if active. */
  disableMinutiaeInspector() {
    if (!this._minutiaeInspector) return;
    this._minutiaeInspector.destroy();
    this._minutiaeInspector = null;
  }
  /* ── DOM construction ───────────────────────────────────── */
  _buildDOM() {
    this._el.innerHTML = "";
    this._viewport = _el("div", "mntviz-viewport");
    this._canvas = _el("div", "mntviz-canvas-container");
    this._img = _el("img", "mntviz-img-layer");
    this._img.draggable = false;
    this._svg = document.createElementNS(SVG_NS3, "svg");
    this._svg.classList.add("mntviz-mnt-layer");
    this._canvas.append(this._img, this._svg);
    this._viewport.append(this._canvas);
    if (this._options.minimap) {
      this._minimapWrap = _el("div", "mntviz-minimap-container");
      this._minimapImg = _el("img", "mntviz-minimap-img");
      this._minimapImg.draggable = false;
      this._minimapRect = _el("div", "mntviz-minimap-rect");
      this._minimapWrap.append(this._minimapImg, this._minimapRect);
      this._minimapWrap.style.display = "none";
      this._viewport.append(this._minimapWrap);
    }
    this._zoomWrap = _el("div", "mntviz-zoom-controls");
    this._zoomLabel = _el("span", "mntviz-zoom-level");
    this._zoomLabel.textContent = "100%";
    this._zoomWrap.append(this._zoomLabel);
    this._viewport.append(this._zoomWrap);
    this._exportBtnWrap = _el("div", "mntviz-export-btns");
    this._exportBtn = _el("button", "mntviz-export-svg-btn");
    this._exportBtn.textContent = "SVG";
    this._exportBtn.title = "Download full image as SVG";
    this._exportBtn.addEventListener("click", () => this.downloadSVG());
    this._exportViewBtn = _el("button", "mntviz-export-svg-btn");
    this._exportViewBtn.textContent = "View";
    this._exportViewBtn.title = "Download current view as SVG";
    this._exportViewBtn.addEventListener("click", () => this.downloadSVGView());
    this._exportBtnWrap.append(this._exportBtn, this._exportViewBtn);
    this._viewport.append(this._exportBtnWrap);
    this._el.append(this._viewport);
  }
  /* ── Event binding ──────────────────────────────────────── */
  _bindEvents() {
    const sig = { signal: this._abortController.signal };
    this._viewport.addEventListener("wheel", (e) => this._onWheel(e), { passive: false, ...sig });
    this._viewport.addEventListener("mousedown", (e) => this._onMouseDown(e), sig);
    window.addEventListener("mousemove", (e) => this._onMouseMove(e), sig);
    window.addEventListener("mouseup", () => this._onMouseUp(), sig);
    this._resizeObserver = new ResizeObserver(() => {
      this._syncLayers();
      this._updateMinimap();
      if (this._options.onResize) this._options.onResize();
    });
    this._resizeObserver.observe(this._img);
  }
  /* ── Interaction handlers ───────────────────────────────── */
  _onWheel(e) {
    if (!this._img.src && !this._virtualSize) return;
    e.preventDefault();
    const intensity = 0.1;
    const delta = e.deltaY > 0 ? -intensity : intensity;
    const newScale = Math.min(Math.max(0.1, this._view.scale + delta * this._view.scale), 20);
    const rect = this._viewport.getBoundingClientRect();
    const ox = e.clientX - rect.left;
    const oy = e.clientY - rect.top;
    const wx = (ox - this._view.translateX) / this._view.scale;
    const wy = (oy - this._view.translateY) / this._view.scale;
    this._view.scale = newScale;
    this._view.translateX = ox - wx * newScale;
    this._view.translateY = oy - wy * newScale;
    this._applyTransform();
  }
  _onMouseDown(e) {
    if (e.button !== 0 && e.button !== 1) return;
    this._view.isDragging = true;
    this._view.lastX = e.clientX;
    this._view.lastY = e.clientY;
    this._viewport.style.cursor = "grabbing";
    e.preventDefault();
  }
  _onMouseMove(e) {
    if (!this._view.isDragging) return;
    this._view.translateX += e.clientX - this._view.lastX;
    this._view.translateY += e.clientY - this._view.lastY;
    this._view.lastX = e.clientX;
    this._view.lastY = e.clientY;
    this._applyTransform();
  }
  _onMouseUp() {
    this._view.isDragging = false;
    this._viewport.style.cursor = "grab";
  }
  /* ── Internal rendering ─────────────────────────────────── */
  _applyTransform() {
    const { translateX: tx, translateY: ty, scale: s } = this._view;
    this._canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    this._zoomLabel.textContent = `${Math.round(s * 100)}%`;
    this._updateMinimap();
    if (this._options.onTransform) this._options.onTransform();
  }
  _syncLayers() {
    const vs = this._virtualSize;
    const nw = vs ? vs.width : this._img.naturalWidth;
    const nh = vs ? vs.height : this._img.naturalHeight;
    if (!nw || !nh) return;
    this._svg.setAttribute("width", nw);
    this._svg.setAttribute("height", nh);
    const cw = vs ? vs.width : this._img.clientWidth;
    const ch = vs ? vs.height : this._img.clientHeight;
    this._svg.style.width = cw + "px";
    this._svg.style.height = ch + "px";
    this._svg.setAttribute("viewBox", `0 0 ${nw} ${nh}`);
  }
  _updateMinimap() {
    if (!this._minimapRect || !this._minimapImg) return;
    const vs = this._virtualSize;
    const nw = vs ? vs.width : this._img.naturalWidth;
    const nh = vs ? vs.height : this._img.naturalHeight;
    if (!nw || !nh) return;
    const vw = this._viewport.clientWidth;
    const vh = this._viewport.clientHeight;
    const cw = this._minimapImg.clientWidth;
    const ch = this._minimapImg.clientHeight;
    if (!cw || !ch) return;
    const imgAspect = nw / nh;
    const cAspect = cw / ch;
    let rw, rh, ox, oy;
    if (imgAspect > cAspect) {
      rw = cw;
      rh = cw / imgAspect;
      ox = 0;
      oy = (ch - rh) / 2;
    } else {
      rh = ch;
      rw = ch * imgAspect;
      ox = (cw - rw) / 2;
      oy = 0;
    }
    const visX = -this._view.translateX / this._view.scale;
    const visY = -this._view.translateY / this._view.scale;
    const visW = vw / this._view.scale;
    const visH = vh / this._view.scale;
    const rx = rw / nw;
    const ry = rh / nh;
    const left = Math.max(ox, Math.min(ox + visX * rx, ox + rw));
    const top = Math.max(oy, Math.min(oy + visY * ry, oy + rh));
    const right = Math.min(ox + rw, ox + (visX + visW) * rx);
    const bottom = Math.min(oy + rh, oy + (visY + visH) * ry);
    Object.assign(this._minimapRect.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${Math.max(0, right - left)}px`,
      height: `${Math.max(0, bottom - top)}px`
    });
  }
};
function _el(tag, className) {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}

// src/overlay.js
var OverlayLayer = class {
  /**
   * @param {HTMLElement} container - The canvas-container from Viewer.canvasContainer.
   * @param {object} [options]
   * @param {number} [options.opacity=0.7] - Default opacity when shown.
   */
  constructor(container, options = {}) {
    this._container = container;
    this._defaultOpacity = options.opacity ?? 0.7;
    this._visible = false;
    this._img = document.createElement("img");
    this._img.className = "mntviz-overlay-layer";
    this._img.draggable = false;
    this._img.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;opacity:0;transition:opacity 0.2s;";
    if (options.insertBefore) {
      this._container.insertBefore(this._img, options.insertBefore);
    } else {
      this._container.appendChild(this._img);
    }
    this._resizeObserver = new ResizeObserver(() => this._syncSize());
    const baseImg = this._container.querySelector(".mntviz-img-layer");
    if (baseImg) this._resizeObserver.observe(baseImg);
  }
  /**
   * Load an overlay image (e.g. heatmap PNG, mask PNG).
   * @param {string} src - Image URL.
   * @returns {Promise<void>}
   */
  load(src) {
    return new Promise((resolve, reject) => {
      this._img.onload = () => {
        this._syncSize();
        resolve();
      };
      this._img.onerror = () => reject(new Error(`Failed to load overlay: ${src}`));
      this._img.src = src;
    });
  }
  show() {
    this._visible = true;
    this._img.style.opacity = this._defaultOpacity;
  }
  hide() {
    this._visible = false;
    this._img.style.opacity = 0;
  }
  toggle() {
    this._visible ? this.hide() : this.show();
  }
  /** @param {number} value - 0 to 1. */
  setOpacity(value) {
    this._defaultOpacity = value;
    if (this._visible) this._img.style.opacity = value;
  }
  /** Check if the overlay loaded successfully. */
  get loaded() {
    return this._img.naturalWidth > 0;
  }
  /** Clear the source and hide. */
  clear() {
    this._img.removeAttribute("src");
    this.hide();
  }
  /** Remove the overlay from DOM and clean up observers. */
  destroy() {
    this._resizeObserver.disconnect();
    this._img.remove();
  }
  _syncSize() {
    const base = this._container.querySelector(".mntviz-img-layer");
    if (!base) return;
    this._img.style.width = base.clientWidth + "px";
    this._img.style.height = base.clientHeight + "px";
  }
};

// src/uv-renderer.js
var SVG_NS4 = "http://www.w3.org/2000/svg";
var DEFAULTS3 = {
  /** Rendering style: 'arrow' (directed, with arrowhead) or 'segment' (centered, no arrowhead). */
  style: "arrow",
  arrowSize: 3,
  lineWidth: 1.2,
  /** Segment length for 'segment' style — rescales direction vectors client-side. */
  segmentLength: 6,
  opacity: 1,
  color: "#43C4E4",
  /** Minimum alpha to render (skip near-invisible arrows). */
  alphaThreshold: 0.05
};
var UVFieldRenderer = class {
  /**
   * @param {SVGElement} svgElement - The SVG layer from Viewer.svgLayer or a dedicated SVG.
   */
  constructor(svgElement) {
    this._svg = svgElement;
  }
  /**
   * Draw a UV vector field as arrows with confidence-modulated size and opacity.
   *
   * @param {Array<[number, number, number, number, number]>} arrows
   *   Each arrow is [x, y, dx, dy, confidence] where:
   *   - (x, y): origin in image coordinates
   *   - (dx, dy): direction vector (already scaled to segment length)
   *   - confidence: 0-1 value controlling opacity and size
   * @param {object} [options] - Override defaults.
   */
  draw(arrows, options = {}) {
    const opts = { ...DEFAULTS3, ...options };
    const { style, arrowSize, lineWidth, segmentLength, opacity, color, alphaThreshold } = opts;
    this._svg.innerHTML = "";
    for (const [x, y, dx, dy, conf] of arrows) {
      const alpha = conf * opacity;
      if (alpha < alphaThreshold) continue;
      const g = document.createElementNS(SVG_NS4, "g");
      g.setAttribute("opacity", alpha);
      g.setAttribute("stroke", color);
      g.setAttribute("fill", color);
      g.setAttribute("stroke-linecap", "round");
      const line = document.createElementNS(SVG_NS4, "line");
      line.setAttribute("stroke-width", lineWidth);
      if (style === "segment") {
        const mag = Math.hypot(dx, dy);
        const scale = mag > 1e-6 ? segmentLength / mag : 0;
        const sdx = dx * scale * 0.5;
        const sdy = dy * scale * 0.5;
        line.setAttribute("x1", x - sdx);
        line.setAttribute("y1", y - sdy);
        line.setAttribute("x2", x + sdx);
        line.setAttribute("y2", y + sdy);
      } else {
        line.setAttribute("x1", x);
        line.setAttribute("y1", y);
        line.setAttribute("x2", x + dx);
        line.setAttribute("y2", y + dy);
      }
      g.appendChild(line);
      if (style !== "segment") {
        const mag = Math.hypot(dx, dy);
        const size = arrowSize * (0.3 + 0.7 * conf);
        if (mag > 1e-6) {
          const nx = dx / mag;
          const ny = dy / mag;
          const px = -ny;
          const py = nx;
          const headW = size * 0.8;
          const headL = size * 0.6;
          const bx = x + dx;
          const by = y + dy;
          const tipX = bx + nx * headL;
          const tipY = by + ny * headL;
          const lx = bx + px * (headW / 2);
          const ly = by + py * (headW / 2);
          const rx = bx - px * (headW / 2);
          const ry = by - py * (headW / 2);
          const polygon = document.createElementNS(SVG_NS4, "polygon");
          polygon.setAttribute("points", `${tipX},${tipY} ${lx},${ly} ${rx},${ry}`);
          polygon.setAttribute("stroke", "none");
          g.appendChild(polygon);
        }
      }
      this._svg.appendChild(g);
    }
  }
  /** Remove all drawn arrows. */
  clear() {
    this._svg.innerHTML = "";
  }
};

// src/match-viewer.js
var SVG_NS5 = "http://www.w3.org/2000/svg";
var DEFAULTS4 = {
  leftMinutiae: [],
  rightMinutiae: [],
  pairs: [],
  leftTitle: null,
  rightTitle: null,
  markerColor: "#00ff00",
  rendererOptions: {},
  patchSize: 128,
  patchDisplaySize: 192,
  showSegmentsOnLoad: false
};
var MatchViewer = class {
  /**
   * @param {string|HTMLElement} container
   * @param {object} [options]
   */
  constructor(container, options = {}) {
    this._el = typeof container === "string" ? document.querySelector(container) : container;
    if (!this._el) throw new Error("mntviz MatchViewer: container not found");
    this._options = { ...DEFAULTS4, ...options };
    this._leftViewer = null;
    this._rightViewer = null;
    this._allSegmentsVisible = this._options.showSegmentsOnLoad;
    this._activePopupPairIdx = -1;
    this._segmentLines = [];
    this._ac = new AbortController();
    this._buildDOM();
  }
  /* ── DOM construction ─────────────────────────────────── */
  _buildDOM() {
    this._el.innerHTML = "";
    this._container = _el2("div", "mntviz-match-container");
    this._leftPanel = _el2("div", "mntviz-match-panel");
    if (this._options.leftTitle) {
      const t = _el2("div", "mntviz-match-title");
      t.textContent = this._options.leftTitle;
      this._leftPanel.appendChild(t);
    }
    this._leftHost = _el2("div", "mntviz-match-viewer-host");
    this._leftPanel.appendChild(this._leftHost);
    this._rightPanel = _el2("div", "mntviz-match-panel");
    if (this._options.rightTitle) {
      const t = _el2("div", "mntviz-match-title");
      t.textContent = this._options.rightTitle;
      this._rightPanel.appendChild(t);
    }
    this._rightHost = _el2("div", "mntviz-match-viewer-host");
    this._rightPanel.appendChild(this._rightHost);
    this._overlaySvg = document.createElementNS(SVG_NS5, "svg");
    this._overlaySvg.classList.add("mntviz-match-overlay");
    this._overlaySvg.setAttribute("width", "100%");
    this._overlaySvg.setAttribute("height", "100%");
    this._popup = _el2("div", "mntviz-match-popup");
    this._popup.style.display = "none";
    this._buildPopup();
    this._exportBtnWrap = _el2("div", "mntviz-export-btns");
    this._exportBtn = _el2("button", "mntviz-export-svg-btn");
    this._exportBtn.textContent = "SVG";
    this._exportBtn.title = "Download full match as SVG";
    this._exportBtn.addEventListener("click", () => this.downloadSVG());
    this._exportViewBtn = _el2("button", "mntviz-export-svg-btn");
    this._exportViewBtn.textContent = "View";
    this._exportViewBtn.title = "Download current view as SVG";
    this._exportViewBtn.addEventListener("click", () => this.downloadSVGView());
    this._exportBtnWrap.append(this._exportBtn, this._exportViewBtn);
    this._container.append(this._leftPanel, this._rightPanel, this._overlaySvg, this._popup, this._exportBtnWrap);
    this._el.appendChild(this._container);
  }
  _buildPopup() {
    this._popupClose = _el2("span", "mntviz-match-popup-close");
    this._popupClose.textContent = "\xD7";
    this._popupClose.addEventListener("click", (e) => {
      e.stopPropagation();
      this._hidePopup();
    });
    this._popupFields = _el2("div", "mntviz-match-popup-fields");
    this._popupPatchesWrap = _el2("div", "mntviz-match-popup-patches");
    this._leftPatchWrap = _el2("div", "mntviz-match-popup-patch");
    this._leftPatchCanvas = document.createElement("canvas");
    this._leftPatchSvg = document.createElementNS(SVG_NS5, "svg");
    const leftLabel = _el2("div", "mntviz-match-popup-patch-label");
    leftLabel.textContent = "L";
    this._leftPatchWrap.append(this._leftPatchCanvas, this._leftPatchSvg, leftLabel);
    this._rightPatchWrap = _el2("div", "mntviz-match-popup-patch");
    this._rightPatchCanvas = document.createElement("canvas");
    this._rightPatchSvg = document.createElementNS(SVG_NS5, "svg");
    const rightLabel = _el2("div", "mntviz-match-popup-patch-label");
    rightLabel.textContent = "R";
    this._rightPatchWrap.append(this._rightPatchCanvas, this._rightPatchSvg, rightLabel);
    this._popupPatchesWrap.append(this._leftPatchWrap, this._rightPatchWrap);
    this._popup.append(this._popupClose, this._popupFields, this._popupPatchesWrap);
    this._popupFields.classList.add("mntviz-drag-handle");
    this._popupFields.addEventListener("mousedown", (e) => {
      this._dragOffset = {
        x: e.clientX - this._popup.offsetLeft,
        y: e.clientY - this._popup.offsetTop
      };
      this._popupFields.classList.add("mntviz-dragging");
      const onMove = (ev) => {
        this._popup.style.left = `${ev.clientX - this._dragOffset.x}px`;
        this._popup.style.top = `${ev.clientY - this._dragOffset.y}px`;
      };
      const onUp = () => {
        this._popupFields.classList.remove("mntviz-dragging");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }
  /* ── Public API ───────────────────────────────────────── */
  /**
   * Load images into both viewers and draw minutiae.
   * @param {string} leftSrc
   * @param {string} rightSrc
   */
  async loadImages(leftSrc, rightSrc) {
    this._leftViewer = new Viewer(this._leftHost, {
      minimap: false,
      onTransform: () => this._updateSegments()
    });
    this._rightViewer = new Viewer(this._rightHost, {
      minimap: false,
      onTransform: () => this._updateSegments()
    });
    await Promise.all([
      this._leftViewer.loadImage(leftSrc),
      this._rightViewer.loadImage(rightSrc)
    ]);
    const opts = this._options;
    const rOpts = opts.rendererOptions;
    const leftRenderer = new MinutiaeRenderer(this._leftViewer.svgLayer);
    leftRenderer.draw(opts.leftMinutiae, opts.markerColor, rOpts);
    const rightRenderer = new MinutiaeRenderer(this._rightViewer.svgLayer);
    rightRenderer.draw(opts.rightMinutiae, opts.markerColor, rOpts);
    this._leftViewer.enableMinutiaeInspector({
      getAllMinutiae: () => opts.leftMinutiae,
      patchMode: "visible"
    });
    this._rightViewer.enableMinutiaeInspector({
      getAllMinutiae: () => opts.rightMinutiae,
      patchMode: "visible"
    });
    this._segmentLines = [];
    for (let i = 0; i < opts.pairs.length; i++) {
      const p = opts.pairs[i];
      const line = document.createElementNS(SVG_NS5, "line");
      line.classList.add("mntviz-match-segment");
      line.setAttribute("stroke", p.color || opts.markerColor);
      line.setAttribute("stroke-opacity", p.alpha != null ? p.alpha : 0.6);
      line.setAttribute("stroke-width", p.width != null ? p.width : 1);
      line.style.display = "none";
      this._overlaySvg.appendChild(line);
      this._segmentLines.push(line);
    }
    this._bindEvents();
    if (this._allSegmentsVisible) {
      this._showAllSegments();
    }
  }
  /**
   * Serialize the full match view as a standalone SVG string.
   * Both images, minutiae, and visible segment lines are included.
   * @param {number} [gap=4] - Pixel gap between left and right panels.
   * @returns {string} SVG markup.
   */
  exportSVG(gap = 4) {
    const lSize = this._leftViewer.imageSize;
    const rSize = this._rightViewer.imageSize;
    const totalW = lSize.width + gap + rSize.width;
    const totalH = Math.max(lSize.height, rSize.height);
    const svg = document.createElementNS(SVG_NS5, "svg");
    svg.setAttribute("xmlns", SVG_NS5);
    svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    svg.setAttribute("width", totalW);
    svg.setAttribute("height", totalH);
    svg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
    const embedPanel = (viewer, offsetX) => {
      const g = document.createElementNS(SVG_NS5, "g");
      if (offsetX) g.setAttribute("transform", `translate(${offsetX}, 0)`);
      const img = viewer.imageElement;
      if (img.src) {
        const canvas = document.createElement("canvas");
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0);
        const dataUri = canvas.toDataURL("image/png");
        const svgImg = document.createElementNS(SVG_NS5, "image");
        svgImg.setAttribute("href", dataUri);
        svgImg.setAttribute("width", w);
        svgImg.setAttribute("height", h);
        g.appendChild(svgImg);
      }
      const mntClone = viewer.svgLayer.cloneNode(true);
      mntClone.removeAttribute("class");
      mntClone.removeAttribute("style");
      g.appendChild(mntClone);
      return g;
    };
    svg.appendChild(embedPanel(this._leftViewer, 0));
    svg.appendChild(embedPanel(this._rightViewer, lSize.width + gap));
    const opts = this._options;
    const segG = document.createElementNS(SVG_NS5, "g");
    for (let i = 0; i < opts.pairs.length; i++) {
      const domLine = this._segmentLines[i];
      if (domLine.style.display === "none") continue;
      const p = opts.pairs[i];
      const lm = opts.leftMinutiae[p.leftIdx];
      const rm = opts.rightMinutiae[p.rightIdx];
      const line = document.createElementNS(SVG_NS5, "line");
      line.setAttribute("x1", lm.x);
      line.setAttribute("y1", lm.y);
      line.setAttribute("x2", rm.x + lSize.width + gap);
      line.setAttribute("y2", rm.y);
      line.setAttribute("stroke", domLine.getAttribute("stroke"));
      line.setAttribute("stroke-opacity", domLine.getAttribute("stroke-opacity"));
      line.setAttribute("stroke-width", domLine.getAttribute("stroke-width"));
      line.setAttribute("stroke-linecap", "round");
      segG.appendChild(line);
    }
    svg.appendChild(segG);
    return new XMLSerializer().serializeToString(svg);
  }
  /**
   * Download the match view as an SVG file.
   * @param {string} [filename='match.svg'] - Download filename.
   */
  downloadSVG(filename = "match.svg") {
    const svg = this.exportSVG();
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  /**
   * Serialize the currently visible viewport of both panels as SVG.
   * @param {number} [gap=4] - Pixel gap between panels.
   * @returns {string} SVG markup.
   */
  exportSVGView(gap = 4) {
    const lRegion = this._leftViewer.visibleRegion();
    const rRegion = this._rightViewer.visibleRegion();
    const lVpW = this._leftViewer.viewport.clientWidth;
    const lVpH = this._leftViewer.viewport.clientHeight;
    const rVpW = this._rightViewer.viewport.clientWidth;
    const rVpH = this._rightViewer.viewport.clientHeight;
    const totalW = lVpW + gap + rVpW;
    const totalH = Math.max(lVpH, rVpH);
    const svg = document.createElementNS(SVG_NS5, "svg");
    svg.setAttribute("xmlns", SVG_NS5);
    svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    svg.setAttribute("width", totalW);
    svg.setAttribute("height", totalH);
    svg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
    const embedView = (viewer, region, vpW, vpH, offsetX) => {
      const nested = document.createElementNS(SVG_NS5, "svg");
      nested.setAttribute("x", offsetX);
      nested.setAttribute("y", 0);
      nested.setAttribute("width", vpW);
      nested.setAttribute("height", vpH);
      nested.setAttribute("viewBox", `${region.x} ${region.y} ${region.w} ${region.h}`);
      const img = viewer.imageElement;
      if (img.src) {
        const canvas = document.createElement("canvas");
        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        canvas.width = nw;
        canvas.height = nh;
        canvas.getContext("2d").drawImage(img, 0, 0);
        const svgImg = document.createElementNS(SVG_NS5, "image");
        svgImg.setAttribute("href", canvas.toDataURL("image/png"));
        svgImg.setAttribute("width", nw);
        svgImg.setAttribute("height", nh);
        nested.appendChild(svgImg);
      }
      const mntClone = viewer.svgLayer.cloneNode(true);
      mntClone.removeAttribute("class");
      mntClone.removeAttribute("style");
      while (mntClone.firstChild) nested.appendChild(mntClone.firstChild);
      return nested;
    };
    svg.appendChild(embedView(this._leftViewer, lRegion, lVpW, lVpH, 0));
    svg.appendChild(embedView(this._rightViewer, rRegion, rVpW, rVpH, lVpW + gap));
    const opts = this._options;
    const segG = document.createElementNS(SVG_NS5, "g");
    for (let i = 0; i < opts.pairs.length; i++) {
      const domLine = this._segmentLines[i];
      if (domLine.style.display === "none") continue;
      const p = opts.pairs[i];
      const lm = opts.leftMinutiae[p.leftIdx];
      const rm = opts.rightMinutiae[p.rightIdx];
      const x1 = (lm.x - lRegion.x) / lRegion.w * lVpW;
      const y1 = (lm.y - lRegion.y) / lRegion.h * lVpH;
      const x2 = lVpW + gap + (rm.x - rRegion.x) / rRegion.w * rVpW;
      const y2 = (rm.y - rRegion.y) / rRegion.h * rVpH;
      const line = document.createElementNS(SVG_NS5, "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("stroke", domLine.getAttribute("stroke"));
      line.setAttribute("stroke-opacity", domLine.getAttribute("stroke-opacity"));
      line.setAttribute("stroke-width", domLine.getAttribute("stroke-width"));
      line.setAttribute("stroke-linecap", "round");
      segG.appendChild(line);
    }
    svg.appendChild(segG);
    return new XMLSerializer().serializeToString(svg);
  }
  /**
   * Download the current view as an SVG file.
   * @param {string} [filename='match_view.svg'] - Download filename.
   */
  downloadSVGView(filename = "match_view.svg") {
    const svg = this.exportSVGView();
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  destroy() {
    this._ac.abort();
    if (this._leftViewer) this._leftViewer.destroy();
    if (this._rightViewer) this._rightViewer.destroy();
    this._el.innerHTML = "";
  }
  /* ── Event binding ────────────────────────────────────── */
  _bindEvents() {
    const sig = { signal: this._ac.signal };
    this._leftViewer.svgLayer.addEventListener("mousedown", (e) => this._onSvgMouseDown(e), sig);
    this._leftViewer.svgLayer.addEventListener("mouseup", (e) => this._onSvgMouseUp(e, "left"), sig);
    this._rightViewer.svgLayer.addEventListener("mousedown", (e) => this._onSvgMouseDown(e), sig);
    this._rightViewer.svgLayer.addEventListener("mouseup", (e) => this._onSvgMouseUp(e, "right"), sig);
    this._leftViewer.viewport.addEventListener("dblclick", (e) => this._onDblClick(e), sig);
    this._rightViewer.viewport.addEventListener("dblclick", (e) => this._onDblClick(e), sig);
  }
  _onSvgMouseDown(e) {
    this._mouseDownPos = { x: e.clientX, y: e.clientY };
    const marker = e.target.closest(".mntviz-mnt-marker");
    if (marker) {
      e.stopPropagation();
      e.preventDefault();
    }
  }
  _onSvgMouseUp(e, side) {
    if (!this._mouseDownPos) return;
    const dx = e.clientX - this._mouseDownPos.x;
    const dy = e.clientY - this._mouseDownPos.y;
    this._mouseDownPos = null;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) return;
    const marker = e.target.closest(".mntviz-mnt-marker");
    if (!marker) return;
    const m = minutiaDataMap.get(marker);
    if (!m) return;
    e.stopPropagation();
    const viewer = side === "left" ? this._leftViewer : this._rightViewer;
    if (viewer._minutiaeInspector) {
      viewer._minutiaeInspector._collapse();
    }
    this._onMarkerClick(side, m, e);
  }
  _onDblClick(e) {
    if (e.target.closest(".mntviz-mnt-marker")) return;
    this._allSegmentsVisible = !this._allSegmentsVisible;
    if (this._allSegmentsVisible) {
      this._showAllSegments();
    } else {
      this._hideAllSegments();
    }
    this._hidePopup();
  }
  /* ── Marker click → segment + dual patch popup ────────── */
  _onMarkerClick(side, minutia, event) {
    const pairIdx = minutia._pairIndex;
    if (pairIdx == null || pairIdx < 0) return;
    const pair = this._options.pairs[pairIdx];
    if (!pair) return;
    const leftM = this._options.leftMinutiae[pair.leftIdx];
    const rightM = this._options.rightMinutiae[pair.rightIdx];
    this._showSegment(pairIdx);
    this._updateSegments();
    this._showDualPatchPopup(leftM, rightM, pairIdx, event);
  }
  /* ── Segment management ───────────────────────────────── */
  _showSegment(idx) {
    if (this._segmentLines[idx]) {
      this._segmentLines[idx].style.display = "";
      this._segmentLines[idx].classList.add("mntviz-match-segment-active");
    }
    this._updateSegments();
  }
  _showAllSegments() {
    for (const line of this._segmentLines) {
      line.style.display = "";
      line.classList.remove("mntviz-match-segment-active");
    }
    this._updateSegments();
  }
  _hideAllSegments() {
    for (const line of this._segmentLines) {
      line.style.display = "none";
      line.classList.remove("mntviz-match-segment-active");
    }
  }
  _hideActiveSegment() {
    if (this._activePopupPairIdx >= 0 && !this._allSegmentsVisible) {
      const line = this._segmentLines[this._activePopupPairIdx];
      if (line) {
        line.style.display = "none";
        line.classList.remove("mntviz-match-segment-active");
      }
    } else if (this._activePopupPairIdx >= 0 && this._allSegmentsVisible) {
      const line = this._segmentLines[this._activePopupPairIdx];
      if (line) line.classList.remove("mntviz-match-segment-active");
    }
  }
  /**
   * Recompute all visible segment positions.
   * Called on every pan/zoom via onTransform callback.
   */
  _updateSegments() {
    if (!this._segmentLines.length || !this._leftViewer || !this._rightViewer) return;
    const containerRect = this._container.getBoundingClientRect();
    const pairs = this._options.pairs;
    for (let i = 0; i < pairs.length; i++) {
      const line = this._segmentLines[i];
      if (line.style.display === "none") continue;
      const p = pairs[i];
      const lm = this._options.leftMinutiae[p.leftIdx];
      const rm = this._options.rightMinutiae[p.rightIdx];
      const lp = this._imageToContainerCoords(this._leftViewer, lm.x, lm.y, containerRect);
      const rp = this._imageToContainerCoords(this._rightViewer, rm.x, rm.y, containerRect);
      line.setAttribute("x1", lp.x);
      line.setAttribute("y1", lp.y);
      line.setAttribute("x2", rp.x);
      line.setAttribute("y2", rp.y);
    }
  }
  /**
   * Convert image coordinates to container-relative pixel coords.
   */
  _imageToContainerCoords(viewer, imgX, imgY, containerRect) {
    const svgRect = viewer.svgLayer.getBoundingClientRect();
    const imgSize = viewer.imageSize;
    if (!imgSize.width || !imgSize.height) return { x: 0, y: 0 };
    const scaleX = svgRect.width / imgSize.width;
    const scaleY = svgRect.height / imgSize.height;
    return {
      x: svgRect.left - containerRect.left + imgX * scaleX,
      y: svgRect.top - containerRect.top + imgY * scaleY
    };
  }
  /* ── Dual-patch popup ─────────────────────────────────── */
  _showDualPatchPopup(leftM, rightM, pairIdx, event) {
    this._hideActiveSegment();
    this._activePopupPairIdx = pairIdx;
    const pair = this._options.pairs[pairIdx];
    const color = pair.color || this._options.markerColor;
    this._popupFields.innerHTML = [
      `<span>pair:</span> <b style="color:${color}">#${pairIdx}</b>`,
      `<span>L:</span> (${Math.round(leftM.x)}, ${Math.round(leftM.y)}, ${Math.round(leftM.angle)}\xB0)  <span>R:</span> (${Math.round(rightM.x)}, ${Math.round(rightM.y)}, ${Math.round(rightM.angle)}\xB0)`
    ].join("<br>");
    const ps = this._options.patchSize;
    const ds = this._options.patchDisplaySize;
    this._renderOnePatch(this._leftPatchCanvas, this._leftPatchSvg, this._leftViewer, leftM, ps, ds);
    this._renderOnePatch(this._rightPatchCanvas, this._rightPatchSvg, this._rightViewer, rightM, ps, ds);
    this._popup.style.display = "";
    this._popup.classList.add("mntviz-match-popup-visible");
    this._showSegment(pairIdx);
    requestAnimationFrame(() => this._positionPopup(event));
  }
  _renderOnePatch(canvas, svg, viewer, m, ps, ds) {
    const rotAngle = m.angle * (Math.PI / 180);
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = ps;
    tmpCanvas.height = ps;
    const tmpCtx = tmpCanvas.getContext("2d");
    tmpCtx.translate(ps / 2, ps / 2);
    tmpCtx.rotate(rotAngle);
    tmpCtx.drawImage(viewer.imageElement, -m.x, -m.y);
    canvas.width = ps;
    canvas.height = ps;
    canvas.style.width = `${ds}px`;
    canvas.style.height = `${ds}px`;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(tmpCanvas, 0, 0);
    svg.setAttribute("viewBox", `0 0 ${ps} ${ps}`);
    svg.innerHTML = "";
    const color = m._color || this._options.markerColor;
    const shape = m._shape || this._options.rendererOptions.markerShape || "circle";
    this._drawPatchMarker(svg, ps / 2, ps / 2, 0, color, 1, shape);
  }
  _drawPatchMarker(svg, x, y, angleDeg, color, opacity, shape = "circle") {
    const r = 3;
    const segLen = 7;
    const rad = angleDeg * (Math.PI / 180);
    const xEnd = x + segLen * Math.cos(rad);
    const yEnd = y - segLen * Math.sin(rad);
    const g = document.createElementNS(SVG_NS5, "g");
    g.setAttribute("opacity", opacity);
    g.setAttribute("stroke", color);
    g.setAttribute("fill", "none");
    g.setAttribute("stroke-width", "1");
    const marker = createMarkerShape(shape, x, y, r);
    g.appendChild(marker);
    const line = document.createElementNS(SVG_NS5, "line");
    line.setAttribute("x1", x);
    line.setAttribute("y1", y);
    line.setAttribute("x2", xEnd);
    line.setAttribute("y2", yEnd);
    g.appendChild(line);
    svg.appendChild(g);
  }
  _positionPopup(event) {
    const containerRect = this._container.getBoundingClientRect();
    const tipW = this._popup.offsetWidth;
    const tipH = this._popup.offsetHeight;
    const clickX = event.clientX - containerRect.left;
    const clickY = event.clientY - containerRect.top;
    let left = clickX + 15;
    let top = clickY - tipH / 2;
    if (left + tipW > containerRect.width) left = clickX - tipW - 15;
    if (left < 5) left = 5;
    if (top < 5) top = 5;
    if (top + tipH > containerRect.height - 5) top = containerRect.height - tipH - 5;
    this._popup.style.left = `${left}px`;
    this._popup.style.top = `${top}px`;
  }
  _hidePopup() {
    this._hideActiveSegment();
    this._activePopupPairIdx = -1;
    this._popup.classList.remove("mntviz-match-popup-visible");
    this._popup.style.display = "none";
  }
};
function _el2(tag, className) {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}

// src/plots.js
var SVG_NS6 = "http://www.w3.org/2000/svg";
function renderLegend(viewer, items) {
  if (!items || items.length === 0) return;
  const wrap = document.createElement("div");
  wrap.classList.add("mntviz-legend");
  for (const { label, color, shape } of items) {
    const row = document.createElement("div");
    row.classList.add("mntviz-legend-item");
    const size = 16;
    const r = 5;
    const svg = document.createElementNS(SVG_NS6, "svg");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.classList.add("mntviz-legend-marker");
    const marker = createMarkerShape(shape || "circle", size / 2, size / 2, r);
    marker.setAttribute("stroke", color);
    marker.setAttribute("fill", "none");
    marker.setAttribute("stroke-width", "1.5");
    svg.appendChild(marker);
    const text = document.createElement("span");
    text.classList.add("mntviz-legend-label");
    text.textContent = label;
    row.append(svg, text);
    wrap.appendChild(row);
  }
  viewer.viewport.appendChild(wrap);
}
async function plotMinutiae(host, config) {
  const viewer = new Viewer(host, { minimap: true });
  await viewer.loadImage(config.imageSrc);
  const renderer = new MinutiaeRenderer(viewer.svgLayer);
  renderer.draw(config.minutiae, config.color ?? "#00ff00", config.rendererOptions ?? {});
  if (config.inspectorOptions !== false) {
    viewer.enableMinutiaeInspector({
      getAllMinutiae: () => config.minutiae,
      patchMode: "visible",
      ...config.inspectorOptions ?? {}
    });
  }
  if (config.legend) {
    renderLegend(viewer, config.legend);
  }
  return viewer;
}
async function plotOverlay(host, config) {
  const viewer = new Viewer(host, { minimap: true });
  await viewer.loadImage(config.imageSrc);
  if (config.overlaySrc) {
    const overlay = new OverlayLayer(viewer.canvasContainer, {
      opacity: config.overlayOpacity ?? 1,
      insertBefore: viewer.svgLayer
    });
    await overlay.load(config.overlaySrc);
    overlay.show();
  }
  return viewer;
}
async function plotHuv(host, config) {
  const viewer = new Viewer(host, { minimap: true });
  await viewer.loadImage(config.imageSrc);
  if (config.overlaySrc) {
    const overlay = new OverlayLayer(viewer.canvasContainer, {
      opacity: config.overlayOpacity ?? 1,
      insertBefore: viewer.svgLayer
    });
    await overlay.load(config.overlaySrc);
    overlay.show();
  }
  if (config.arrows && config.arrows.length > 0) {
    const uvRenderer = new UVFieldRenderer(viewer.svgLayer);
    uvRenderer.draw(config.arrows, config.arrowOptions ?? {});
  }
  return viewer;
}
async function plotMatch(host, config) {
  const mv = new MatchViewer(host, {
    leftMinutiae: config.matchData.leftMinutiae,
    rightMinutiae: config.matchData.rightMinutiae,
    pairs: config.matchData.pairs,
    leftTitle: config.leftTitle ?? null,
    rightTitle: config.rightTitle ?? null,
    markerColor: config.markerColor ?? "#00ff00",
    rendererOptions: config.rendererOptions ?? {},
    showSegmentsOnLoad: config.showSegments ?? false
  });
  await mv.loadImages(config.leftImageSrc, config.rightImageSrc);
  return mv;
}
export {
  plotHuv,
  plotMatch,
  plotMinutiae,
  plotOverlay
};

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
    for (const [index, m] of minutiae.entries()) {
      const { x, y, angle, quality } = m;
      const mntColor = m._color || color;
      const mntShape = m._shape || markerShape;
      const mntSize = m._size != null ? m._size : markerSize;
      const sizeRatio = m._size != null ? mntSize / markerSize : 1;
      const mntSegLen = segmentLength * sizeRatio;
      const mntLineWidth = m._lineWidth != null ? m._lineWidth : lineWidth * sizeRatio;
      const opacity = m._opacity != null ? m._opacity : qualityAlpha ? baseOpacity * Math.min(1, Math.max(0.2, quality / 100)) : baseOpacity;
      const mg = document.createElementNS(SVG_NS, "g");
      mg.setAttribute("opacity", opacity);
      mg.setAttribute("stroke", mntColor);
      mg.setAttribute("stroke-width", mntLineWidth);
      mg.classList.add("mntviz-mnt-marker");
      mg.style.pointerEvents = "auto";
      mg.style.cursor = "crosshair";
      minutiaDataMap.set(mg, {
        ...m,
        _index: m._index != null ? m._index : index,
        _color: mntColor,
        _shape: mntShape,
        _label: m._label || opts.label || null
      });
      const visual = document.createElementNS(SVG_NS, "g");
      visual.classList.add("mntviz-mnt-visual");
      const hitCircle = document.createElementNS(SVG_NS, "circle");
      hitCircle.setAttribute("cx", x);
      hitCircle.setAttribute("cy", y);
      hitCircle.setAttribute("r", mntSize + 4);
      hitCircle.setAttribute("fill", "transparent");
      hitCircle.setAttribute("stroke", "none");
      mg.appendChild(hitCircle);
      const marker = createMarkerShape(mntShape, x, y, mntSize);
      visual.appendChild(marker);
      const rad = angle * (Math.PI / 180);
      const xEnd = x + mntSegLen * Math.cos(rad);
      const yEnd = y - mntSegLen * Math.sin(rad);
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", x);
      line.setAttribute("y1", y);
      line.setAttribute("x2", xEnd);
      line.setAttribute("y2", yEnd);
      visual.appendChild(line);
      mg.appendChild(visual);
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
  /** Whether the tooltip is currently visible (hover or expanded). */
  get isVisible() {
    return this._tooltip.classList.contains("mntviz-inspector-visible");
  }
  /** Set probe overlay content (called by FieldProbe). Pass null to clear. */
  setProbeContent(html) {
    if (html) {
      this._probeFields.innerHTML = html;
      this._probeFields.style.display = "";
    } else {
      this._probeFields.innerHTML = "";
      this._probeFields.style.display = "none";
    }
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
    this._probeFields = document.createElement("div");
    this._probeFields.className = "mntviz-probe-fields";
    this._probeFields.style.display = "none";
    tip.append(this._closeBtn, this._fields, this._probeFields, this._patchWrap);
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
    if (m._pairIndex != null && m._pairIndex >= 0) {
      lines.push(`<span>pair:</span> <b style="color:${m._color || "#fff"}">#${m._pairIndex}</b>`);
    }
    if (m._index != null) {
      lines.push(`<span>idx:</span> ${m._index}`);
    }
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
    const vpRect = this._viewer.viewport.getBoundingClientRect();
    const { x: screenX, y: screenY } = this._viewer.imageToViewportCoords(mx, my);
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

// src/field-probe.js
var FieldProbe = class {
  /**
   * @param {import('./viewer.js').Viewer} viewer
   */
  constructor(viewer) {
    this._viewer = viewer;
    this._active = false;
    this._ac = null;
    this._rafPending = false;
    this._lastEvent = null;
    this._buildTooltip();
  }
  /* ── Public API ──────────────────────────────────────────── */
  enable() {
    if (this._ac) this._ac.abort();
    this._ac = new AbortController();
    const sig = { signal: this._ac.signal };
    const vp = this._viewer.viewport;
    vp.addEventListener("mousemove", (e) => this._onMouseMove(e), sig);
    vp.addEventListener("dblclick", (e) => this._onDblClick(e), sig);
    vp.addEventListener("mouseleave", () => this._hideOwn(), sig);
  }
  disable() {
    if (this._ac) {
      this._ac.abort();
      this._ac = null;
    }
    this._active = false;
    this._viewer.viewport.classList.remove("mntviz-probe-active");
    this._hideOwn();
    this._clearInspectorProbe();
  }
  toggle() {
    this._active = !this._active;
    this._viewer.viewport.classList.toggle("mntviz-probe-active", this._active);
    if (!this._active) {
      this._hideOwn();
      this._clearInspectorProbe();
    }
  }
  get active() {
    return this._active;
  }
  destroy() {
    this.disable();
    if (this._tooltip && this._tooltip.parentNode) {
      this._tooltip.parentNode.removeChild(this._tooltip);
    }
    this._tooltip = null;
  }
  /* ── DOM ──────────────────────────────────────────────────── */
  _buildTooltip() {
    this._tooltip = document.createElement("div");
    this._tooltip.className = "mntviz-probe-tooltip";
    this._content = document.createElement("div");
    this._content.className = "mntviz-probe-content";
    this._tooltip.appendChild(this._content);
    this._viewer.viewport.appendChild(this._tooltip);
  }
  /* ── Events ──────────────────────────────────────────────── */
  _onMouseMove(e) {
    if (!this._active) return;
    this._lastEvent = e;
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      if (this._lastEvent) this._sample(this._lastEvent);
    });
  }
  _onDblClick(e) {
    if (e.target.closest(".mntviz-mnt-marker")) return;
    this.toggle();
  }
  /* ── Sampling ────────────────────────────────────────────── */
  _sample(e) {
    const coords = this._mouseToImageCoords(e);
    const imgSize = this._viewer.imageSize;
    if (coords.x < 0 || coords.y < 0 || coords.x >= imgSize.width || coords.y >= imgSize.height) {
      this._hideOwn();
      this._clearInspectorProbe();
      return;
    }
    const lines = [];
    for (const { name, overlay, opts } of this._viewer.getVisibleOverlays()) {
      const value = this._readValue(overlay, opts, coords.x, coords.y);
      if (value === null) continue;
      const formatted = opts.valueMapper ? opts.valueMapper(value) : this._defaultFormat(value);
      lines.push(`<span class="mntviz-probe-label">${name}:</span> ${formatted}`);
    }
    if (lines.length === 0) {
      this._hideOwn();
      this._clearInspectorProbe();
      return;
    }
    const html = lines.join("<br>");
    const inspector = this._viewer._minutiaeInspector;
    if (inspector && inspector.isVisible) {
      inspector.setProbeContent(html);
      this._hideOwn();
    } else {
      this._clearInspectorProbe();
      this._content.innerHTML = html;
      this._positionTooltip(e);
      this._showOwn();
    }
  }
  /* ── Value reading ───────────────────────────────────────── */
  /**
   * Read the scalar value at (x, y) from an overlay.
   * Returns a number (0-255 raw) for grayscale overlays, or null if out of bounds.
   */
  _readValue(overlay, opts, x, y) {
    const raw = overlay.rawData;
    if (raw) {
      const w = overlay.rawWidth;
      const h = overlay.rawHeight;
      if (x < 0 || y < 0 || x >= w || y >= h) return null;
      return raw[y * w + x];
    }
    return null;
  }
  _defaultFormat(v) {
    if (v === 0) return "--";
    return ((v - 1) / 254).toFixed(2);
  }
  /* ── Coordinates ─────────────────────────────────────────── */
  _mouseToImageCoords(e) {
    const vpRect = this._viewer.viewport.getBoundingClientRect();
    const { scale, translateX, translateY } = this._viewer.viewState;
    return {
      x: Math.floor((e.clientX - vpRect.left - translateX) / scale),
      y: Math.floor((e.clientY - vpRect.top - translateY) / scale)
    };
  }
  /* ── Tooltip show/hide/position ──────────────────────────── */
  _showOwn() {
    this._tooltip.classList.add("mntviz-probe-visible");
  }
  _hideOwn() {
    this._tooltip.classList.remove("mntviz-probe-visible");
  }
  _clearInspectorProbe() {
    const inspector = this._viewer._minutiaeInspector;
    if (inspector) inspector.setProbeContent(null);
  }
  _positionTooltip(e) {
    const vpRect = this._viewer.viewport.getBoundingClientRect();
    const tipW = this._tooltip.offsetWidth;
    const tipH = this._tooltip.offsetHeight;
    let left = e.clientX - vpRect.left + 15;
    let top = e.clientY - vpRect.top - tipH / 2;
    if (left + tipW > vpRect.width) left = e.clientX - vpRect.left - tipW - 15;
    if (left < 5) left = 5;
    if (top < 5) top = 5;
    if (top + tipH > vpRect.height - 5) top = vpRect.height - tipH - 5;
    this._tooltip.style.left = `${left}px`;
    this._tooltip.style.top = `${top}px`;
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
    this._view = {
      scale: 1,
      translateX: 0,
      translateY: 0,
      rotation: 0,
      isDragging: false,
      lastX: 0,
      lastY: 0
    };
    this._abortController = new AbortController();
    this._minutiaeInspector = null;
    this._fieldProbe = null;
    this._virtualSize = null;
    this._overlays = /* @__PURE__ */ new Map();
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
    return {
      scale: this._view.scale,
      translateX: this._view.translateX,
      translateY: this._view.translateY,
      rotation: this._view.rotation
    };
  }
  /** Natural dimensions of the loaded image (or virtual size). */
  get imageSize() {
    const vs = this._virtualSize;
    return {
      width: vs ? vs.width : this._img.naturalWidth || 0,
      height: vs ? vs.height : this._img.naturalHeight || 0
    };
  }
  /* ── Overlay registry ─────────────────────────────────────── */
  /**
   * Register an overlay layer.
   * @param {string} name - Unique key (e.g. 'Mask', 'quality|verifinger').
   * @param {import('./overlay.js').OverlayLayer} overlay
   * @param {object} [opts] - Metadata (valueMapper, group, etc.).
   */
  addOverlay(name, overlay, opts = {}) {
    this._overlays.set(name, { overlay, opts });
  }
  /** Unregister and optionally destroy an overlay. */
  removeOverlay(name, { destroy = false } = {}) {
    const entry = this._overlays.get(name);
    if (!entry) return;
    if (destroy) entry.overlay.destroy();
    this._overlays.delete(name);
  }
  /** Get a single overlay entry by name. */
  getOverlay(name) {
    return this._overlays.get(name);
  }
  /** Return all registered overlays as [{name, overlay, opts}]. */
  getOverlays() {
    return [...this._overlays].map(([name, { overlay, opts }]) => ({ name, overlay, opts }));
  }
  /** Return only visible + loaded overlays. */
  getVisibleOverlays() {
    return this.getOverlays().filter((e) => e.overlay.visible && e.overlay.loaded);
  }
  /* ── Image loading ─────────────────────────────────────────── */
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
    this._view.rotation = 0;
    this._applyTransform();
  }
  /**
   * Set absolute image scale.
   * @param {number} scale
   */
  setScale(scale) {
    const nextScale = Math.min(Math.max(Number(scale), 0.1), 20);
    if (!Number.isFinite(nextScale)) return;
    this._view.scale = nextScale;
    this._applyTransform();
  }
  /**
   * Set absolute image rotation in degrees.
   * Positive values rotate clockwise on screen.
   * @param {number} angleDeg
   */
  setRotation(angleDeg) {
    this._view.rotation = _normalizeAngle180(angleDeg);
    this._applyTransform();
  }
  /**
   * Rotate the image by a relative delta in degrees.
   * @param {number} deltaDeg
   */
  rotateBy(deltaDeg) {
    this.setRotation(this._view.rotation + deltaDeg);
  }
  /**
   * Map image coordinates to viewport-relative CSS pixels.
   * Works with pan, zoom, and rotation.
   * @param {number} imgX
   * @param {number} imgY
   * @returns {{x:number, y:number}}
   */
  imageToViewportCoords(imgX, imgY) {
    return this.imageToElementCoords(imgX, imgY, this._viewport);
  }
  /**
   * Map screen/client coordinates to image coordinates.
   * Works with pan, zoom, and rotation.
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{x:number, y:number}}
   */
  screenToImageCoords(clientX, clientY) {
    const ctm = this._svg.getScreenCTM();
    if (!ctm) return { x: NaN, y: NaN };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }
  /**
   * Map image coordinates to an arbitrary element's local CSS pixels.
   * @param {number} imgX
   * @param {number} imgY
   * @param {HTMLElement} element
   * @returns {{x:number, y:number}}
   */
  imageToElementCoords(imgX, imgY, element) {
    const ctm = this._svg.getScreenCTM();
    if (!ctm || !element) return { x: 0, y: 0 };
    const p = new DOMPoint(imgX, imgY).matrixTransform(ctm);
    const rect = element.getBoundingClientRect();
    return { x: p.x - rect.left, y: p.y - rect.top };
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
    this.disableFieldProbe();
    for (const [, { overlay }] of this._overlays) overlay.destroy();
    this._overlays.clear();
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
  /**
   * Enable field probe (overlay value sampling on hover, toggled via double-click).
   * @param {object} [options] - FieldProbe options.
   * @returns {import('./field-probe.js').FieldProbe}
   */
  enableFieldProbe(options = {}) {
    if (this._fieldProbe) {
      this._fieldProbe.enable();
      return this._fieldProbe;
    }
    this._fieldProbe = new FieldProbe(this, options);
    this._fieldProbe.enable();
    return this._fieldProbe;
  }
  /** Disable and detach the field probe, if active. */
  disableFieldProbe() {
    if (!this._fieldProbe) return;
    this._fieldProbe.destroy();
    this._fieldProbe = null;
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
    this._zoomField = this._buildHudField("zoom", "mntviz-zoom-level", "%");
    this._rotationField = this._buildHudField("rot", "mntviz-rotation-level", "\xB0");
    this._zoomWrap.append(this._zoomField.wrap, this._rotationField.wrap);
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
    this._bindHudField(this._zoomField.input, () => this._applyZoomInput());
    this._bindHudField(this._rotationField.input, () => this._applyRotationInput());
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
    const { translateX: tx, translateY: ty, scale: s, rotation: r } = this._view;
    const { width, height } = this.imageSize;
    this._canvas.style.transformOrigin = `${width / 2}px ${height / 2}px`;
    this._canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${s}) rotate(${r}deg)`;
    this._setHudInputValue(this._zoomField.input, `${Math.round(s * 100)}`);
    this._setHudInputValue(this._rotationField.input, _formatSignedAngle(r));
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
    this._canvas.style.width = `${nw}px`;
    this._canvas.style.height = `${nh}px`;
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
  _buildHudField(prefix, fieldClass, suffix) {
    const wrap = _el("label", `mntviz-hud-field ${fieldClass}`);
    const prefixEl = _el("span", "mntviz-hud-prefix");
    prefixEl.textContent = prefix;
    const input = document.createElement("input");
    input.className = "mntviz-hud-input";
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.spellcheck = false;
    const suffixEl = _el("span", "mntviz-hud-suffix");
    suffixEl.textContent = suffix;
    wrap.append(prefixEl, input, suffixEl);
    return { wrap, input };
  }
  _bindHudField(input, onCommit) {
    input.addEventListener("mousedown", (e) => e.stopPropagation());
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onCommit();
        input.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this._applyTransform();
        input.blur();
      }
    });
    input.addEventListener("blur", onCommit);
  }
  _setHudInputValue(input, value) {
    if (document.activeElement === input) return;
    input.value = String(value);
  }
  _applyZoomInput() {
    const scale = _parseScaleInput(this._zoomField.input.value);
    if (scale == null) {
      this._applyTransform();
      return;
    }
    this.setScale(scale);
  }
  _applyRotationInput() {
    const angle = _parseAngleInput(this._rotationField.input.value);
    if (angle == null) {
      this._applyTransform();
      return;
    }
    this.setRotation(angle);
  }
};
function _el(tag, className) {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}
function _normalizeAngle180(angle) {
  return ((Number(angle) + 180) % 360 + 360) % 360 - 180;
}
function _parseScaleInput(value) {
  const cleaned = String(value).replace("%", "").trim();
  if (!cleaned) return null;
  const percent = Number(cleaned);
  if (!Number.isFinite(percent)) return null;
  return percent / 100;
}
function _parseAngleInput(value) {
  const cleaned = String(value).replace("\xB0", "").replace(/^rot\s*/i, "").trim();
  if (!cleaned) return null;
  const angle = Number(cleaned);
  if (!Number.isFinite(angle)) return null;
  return angle;
}
function _formatSignedAngle(angle) {
  const n = Number(angle) || 0;
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
}

// src/segments-renderer.js
var SVG_NS4 = "http://www.w3.org/2000/svg";
var segmentDataMap = /* @__PURE__ */ new WeakMap();
var DEFAULTS3 = {
  color: "#00ff00",
  width: 1,
  alpha: 0.7,
  hitWidth: 8
  // stroke-width of the invisible hit-test line.
};
var SegmentsRenderer = class {
  /**
   * @param {SVGElement} svgElement - Target SVG layer (e.g. Viewer.svgLayer).
   */
  constructor(svgElement) {
    this._svg = svgElement;
  }
  /**
   * Draw segments as straight lines between minutiae endpoints.
   *
   * @param {Array<{x:number, y:number}>} minutiae - Minutiae array. Segment
   *        endpoints are looked up by `m1`/`m2` indices into this array.
   * @param {Array<{m1:number, m2:number, color?:string, width?:number, alpha?:number, pair_id?:number, label?:string}>} segments
   * @param {object} [options] - Defaults for unspecified per-segment fields.
   * @returns {SVGElement[]} The visible `<line>` elements in input order.
   */
  draw(minutiae, segments, options = {}) {
    if (!segments || segments.length === 0) return [];
    const opts = { ...DEFAULTS3, ...options };
    const g = document.createElementNS(SVG_NS4, "g");
    g.classList.add("mntviz-segments");
    g.setAttribute("fill", "none");
    g.setAttribute("stroke-linecap", "round");
    const visibleLines = [];
    for (const s of segments) {
      const a = minutiae[s.m1];
      const b = minutiae[s.m2];
      if (!a || !b) {
        visibleLines.push(null);
        continue;
      }
      const mg = document.createElementNS(SVG_NS4, "g");
      mg.classList.add("mntviz-segment-marker");
      mg.style.pointerEvents = "auto";
      mg.style.cursor = "crosshair";
      const hit = document.createElementNS(SVG_NS4, "line");
      hit.setAttribute("x1", a.x);
      hit.setAttribute("y1", a.y);
      hit.setAttribute("x2", b.x);
      hit.setAttribute("y2", b.y);
      hit.setAttribute("stroke", "transparent");
      hit.setAttribute("stroke-width", opts.hitWidth);
      hit.setAttribute("fill", "none");
      mg.appendChild(hit);
      const line = document.createElementNS(SVG_NS4, "line");
      line.classList.add("mntviz-segment");
      line.setAttribute("x1", a.x);
      line.setAttribute("y1", a.y);
      line.setAttribute("x2", b.x);
      line.setAttribute("y2", b.y);
      line.setAttribute("stroke", s.color || opts.color);
      line.setAttribute("stroke-width", s.width != null ? s.width : opts.width);
      line.setAttribute("stroke-opacity", s.alpha != null ? s.alpha : opts.alpha);
      mg.appendChild(line);
      segmentDataMap.set(mg, { ...s });
      visibleLines.push(mg);
      g.appendChild(mg);
    }
    this._svg.appendChild(g);
    return visibleLines;
  }
  /** Remove any previously-drawn segment group from this layer. */
  clear() {
    for (const el of this._svg.querySelectorAll("g.mntviz-segments")) {
      el.remove();
    }
  }
};

// src/colormaps.js
var _MAGMA = new Uint8Array([
  0,
  0,
  3,
  255,
  0,
  0,
  4,
  255,
  0,
  0,
  6,
  255,
  1,
  0,
  7,
  255,
  1,
  1,
  9,
  255,
  1,
  1,
  11,
  255,
  2,
  2,
  13,
  255,
  2,
  2,
  15,
  255,
  3,
  3,
  17,
  255,
  4,
  3,
  19,
  255,
  4,
  4,
  21,
  255,
  5,
  4,
  23,
  255,
  6,
  5,
  25,
  255,
  7,
  5,
  27,
  255,
  8,
  6,
  29,
  255,
  9,
  7,
  31,
  255,
  10,
  7,
  34,
  255,
  11,
  8,
  36,
  255,
  12,
  9,
  38,
  255,
  13,
  10,
  40,
  255,
  14,
  10,
  42,
  255,
  15,
  11,
  44,
  255,
  16,
  12,
  47,
  255,
  17,
  12,
  49,
  255,
  18,
  13,
  51,
  255,
  20,
  13,
  53,
  255,
  21,
  14,
  56,
  255,
  22,
  14,
  58,
  255,
  23,
  15,
  60,
  255,
  24,
  15,
  63,
  255,
  26,
  16,
  65,
  255,
  27,
  16,
  68,
  255,
  28,
  16,
  70,
  255,
  30,
  16,
  73,
  255,
  31,
  17,
  75,
  255,
  32,
  17,
  77,
  255,
  34,
  17,
  80,
  255,
  35,
  17,
  82,
  255,
  37,
  17,
  85,
  255,
  38,
  17,
  87,
  255,
  40,
  17,
  89,
  255,
  42,
  17,
  92,
  255,
  43,
  17,
  94,
  255,
  45,
  16,
  96,
  255,
  47,
  16,
  98,
  255,
  48,
  16,
  101,
  255,
  50,
  16,
  103,
  255,
  52,
  16,
  104,
  255,
  53,
  15,
  106,
  255,
  55,
  15,
  108,
  255,
  57,
  15,
  110,
  255,
  59,
  15,
  111,
  255,
  60,
  15,
  113,
  255,
  62,
  15,
  114,
  255,
  64,
  15,
  115,
  255,
  66,
  15,
  116,
  255,
  67,
  15,
  117,
  255,
  69,
  15,
  118,
  255,
  71,
  15,
  119,
  255,
  72,
  16,
  120,
  255,
  74,
  16,
  121,
  255,
  75,
  16,
  121,
  255,
  77,
  17,
  122,
  255,
  79,
  17,
  123,
  255,
  80,
  18,
  123,
  255,
  82,
  18,
  124,
  255,
  83,
  19,
  124,
  255,
  85,
  19,
  125,
  255,
  87,
  20,
  125,
  255,
  88,
  21,
  126,
  255,
  90,
  21,
  126,
  255,
  91,
  22,
  126,
  255,
  93,
  23,
  126,
  255,
  94,
  23,
  127,
  255,
  96,
  24,
  127,
  255,
  97,
  24,
  127,
  255,
  99,
  25,
  127,
  255,
  101,
  26,
  128,
  255,
  102,
  26,
  128,
  255,
  104,
  27,
  128,
  255,
  105,
  28,
  128,
  255,
  107,
  28,
  128,
  255,
  108,
  29,
  128,
  255,
  110,
  30,
  129,
  255,
  111,
  30,
  129,
  255,
  113,
  31,
  129,
  255,
  115,
  31,
  129,
  255,
  116,
  32,
  129,
  255,
  118,
  33,
  129,
  255,
  119,
  33,
  129,
  255,
  121,
  34,
  129,
  255,
  122,
  34,
  129,
  255,
  124,
  35,
  129,
  255,
  126,
  36,
  129,
  255,
  127,
  36,
  129,
  255,
  129,
  37,
  129,
  255,
  130,
  37,
  129,
  255,
  132,
  38,
  129,
  255,
  133,
  38,
  129,
  255,
  135,
  39,
  129,
  255,
  137,
  40,
  129,
  255,
  138,
  40,
  129,
  255,
  140,
  41,
  128,
  255,
  141,
  41,
  128,
  255,
  143,
  42,
  128,
  255,
  145,
  42,
  128,
  255,
  146,
  43,
  128,
  255,
  148,
  43,
  128,
  255,
  149,
  44,
  128,
  255,
  151,
  44,
  127,
  255,
  153,
  45,
  127,
  255,
  154,
  45,
  127,
  255,
  156,
  46,
  127,
  255,
  158,
  46,
  126,
  255,
  159,
  47,
  126,
  255,
  161,
  47,
  126,
  255,
  163,
  48,
  126,
  255,
  164,
  48,
  125,
  255,
  166,
  49,
  125,
  255,
  167,
  49,
  125,
  255,
  169,
  50,
  124,
  255,
  171,
  51,
  124,
  255,
  172,
  51,
  123,
  255,
  174,
  52,
  123,
  255,
  176,
  52,
  123,
  255,
  177,
  53,
  122,
  255,
  179,
  53,
  122,
  255,
  181,
  54,
  121,
  255,
  182,
  54,
  121,
  255,
  184,
  55,
  120,
  255,
  185,
  55,
  120,
  255,
  187,
  56,
  119,
  255,
  189,
  57,
  119,
  255,
  190,
  57,
  118,
  255,
  192,
  58,
  117,
  255,
  194,
  58,
  117,
  255,
  195,
  59,
  116,
  255,
  197,
  60,
  116,
  255,
  198,
  60,
  115,
  255,
  200,
  61,
  114,
  255,
  202,
  62,
  114,
  255,
  203,
  62,
  113,
  255,
  205,
  63,
  112,
  255,
  206,
  64,
  112,
  255,
  208,
  65,
  111,
  255,
  209,
  66,
  110,
  255,
  211,
  66,
  109,
  255,
  212,
  67,
  109,
  255,
  214,
  68,
  108,
  255,
  215,
  69,
  107,
  255,
  217,
  70,
  106,
  255,
  218,
  71,
  105,
  255,
  220,
  72,
  105,
  255,
  221,
  73,
  104,
  255,
  222,
  74,
  103,
  255,
  224,
  75,
  102,
  255,
  225,
  76,
  102,
  255,
  226,
  77,
  101,
  255,
  228,
  78,
  100,
  255,
  229,
  80,
  99,
  255,
  230,
  81,
  98,
  255,
  231,
  82,
  98,
  255,
  232,
  84,
  97,
  255,
  234,
  85,
  96,
  255,
  235,
  86,
  96,
  255,
  236,
  88,
  95,
  255,
  237,
  89,
  95,
  255,
  238,
  91,
  94,
  255,
  238,
  93,
  93,
  255,
  239,
  94,
  93,
  255,
  240,
  96,
  93,
  255,
  241,
  97,
  92,
  255,
  242,
  99,
  92,
  255,
  243,
  101,
  92,
  255,
  243,
  103,
  91,
  255,
  244,
  104,
  91,
  255,
  245,
  106,
  91,
  255,
  245,
  108,
  91,
  255,
  246,
  110,
  91,
  255,
  246,
  112,
  91,
  255,
  247,
  113,
  91,
  255,
  247,
  115,
  92,
  255,
  248,
  117,
  92,
  255,
  248,
  119,
  92,
  255,
  249,
  121,
  92,
  255,
  249,
  123,
  93,
  255,
  249,
  125,
  93,
  255,
  250,
  127,
  94,
  255,
  250,
  128,
  94,
  255,
  250,
  130,
  95,
  255,
  251,
  132,
  96,
  255,
  251,
  134,
  96,
  255,
  251,
  136,
  97,
  255,
  251,
  138,
  98,
  255,
  252,
  140,
  99,
  255,
  252,
  142,
  99,
  255,
  252,
  144,
  100,
  255,
  252,
  146,
  101,
  255,
  252,
  147,
  102,
  255,
  253,
  149,
  103,
  255,
  253,
  151,
  104,
  255,
  253,
  153,
  105,
  255,
  253,
  155,
  106,
  255,
  253,
  157,
  107,
  255,
  253,
  159,
  108,
  255,
  253,
  161,
  110,
  255,
  253,
  162,
  111,
  255,
  253,
  164,
  112,
  255,
  254,
  166,
  113,
  255,
  254,
  168,
  115,
  255,
  254,
  170,
  116,
  255,
  254,
  172,
  117,
  255,
  254,
  174,
  118,
  255,
  254,
  175,
  120,
  255,
  254,
  177,
  121,
  255,
  254,
  179,
  123,
  255,
  254,
  181,
  124,
  255,
  254,
  183,
  125,
  255,
  254,
  185,
  127,
  255,
  254,
  187,
  128,
  255,
  254,
  188,
  130,
  255,
  254,
  190,
  131,
  255,
  254,
  192,
  133,
  255,
  254,
  194,
  134,
  255,
  254,
  196,
  136,
  255,
  254,
  198,
  137,
  255,
  254,
  199,
  139,
  255,
  254,
  201,
  141,
  255,
  254,
  203,
  142,
  255,
  253,
  205,
  144,
  255,
  253,
  207,
  146,
  255,
  253,
  209,
  147,
  255,
  253,
  210,
  149,
  255,
  253,
  212,
  151,
  255,
  253,
  214,
  152,
  255,
  253,
  216,
  154,
  255,
  253,
  218,
  156,
  255,
  253,
  220,
  157,
  255,
  253,
  221,
  159,
  255,
  253,
  223,
  161,
  255,
  253,
  225,
  163,
  255,
  252,
  227,
  165,
  255,
  252,
  229,
  166,
  255,
  252,
  230,
  168,
  255,
  252,
  232,
  170,
  255,
  252,
  234,
  172,
  255,
  252,
  236,
  174,
  255,
  252,
  238,
  176,
  255,
  252,
  240,
  177,
  255,
  252,
  241,
  179,
  255,
  252,
  243,
  181,
  255,
  252,
  245,
  183,
  255,
  251,
  247,
  185,
  255,
  251,
  249,
  187,
  255,
  251,
  250,
  189,
  255,
  251,
  252,
  191,
  255
]);
var _VIRIDIS = new Uint8Array([
  68,
  1,
  84,
  255,
  68,
  2,
  85,
  255,
  68,
  3,
  87,
  255,
  69,
  5,
  88,
  255,
  69,
  6,
  90,
  255,
  69,
  8,
  91,
  255,
  70,
  9,
  92,
  255,
  70,
  11,
  94,
  255,
  70,
  12,
  95,
  255,
  70,
  14,
  97,
  255,
  71,
  15,
  98,
  255,
  71,
  17,
  99,
  255,
  71,
  18,
  101,
  255,
  71,
  20,
  102,
  255,
  71,
  21,
  103,
  255,
  71,
  22,
  105,
  255,
  71,
  24,
  106,
  255,
  72,
  25,
  107,
  255,
  72,
  26,
  108,
  255,
  72,
  28,
  110,
  255,
  72,
  29,
  111,
  255,
  72,
  30,
  112,
  255,
  72,
  32,
  113,
  255,
  72,
  33,
  114,
  255,
  72,
  34,
  115,
  255,
  72,
  35,
  116,
  255,
  71,
  37,
  117,
  255,
  71,
  38,
  118,
  255,
  71,
  39,
  119,
  255,
  71,
  40,
  120,
  255,
  71,
  42,
  121,
  255,
  71,
  43,
  122,
  255,
  71,
  44,
  123,
  255,
  70,
  45,
  124,
  255,
  70,
  47,
  124,
  255,
  70,
  48,
  125,
  255,
  70,
  49,
  126,
  255,
  69,
  50,
  127,
  255,
  69,
  52,
  127,
  255,
  69,
  53,
  128,
  255,
  69,
  54,
  129,
  255,
  68,
  55,
  129,
  255,
  68,
  57,
  130,
  255,
  67,
  58,
  131,
  255,
  67,
  59,
  131,
  255,
  67,
  60,
  132,
  255,
  66,
  61,
  132,
  255,
  66,
  62,
  133,
  255,
  66,
  64,
  133,
  255,
  65,
  65,
  134,
  255,
  65,
  66,
  134,
  255,
  64,
  67,
  135,
  255,
  64,
  68,
  135,
  255,
  63,
  69,
  135,
  255,
  63,
  71,
  136,
  255,
  62,
  72,
  136,
  255,
  62,
  73,
  137,
  255,
  61,
  74,
  137,
  255,
  61,
  75,
  137,
  255,
  61,
  76,
  137,
  255,
  60,
  77,
  138,
  255,
  60,
  78,
  138,
  255,
  59,
  80,
  138,
  255,
  59,
  81,
  138,
  255,
  58,
  82,
  139,
  255,
  58,
  83,
  139,
  255,
  57,
  84,
  139,
  255,
  57,
  85,
  139,
  255,
  56,
  86,
  139,
  255,
  56,
  87,
  140,
  255,
  55,
  88,
  140,
  255,
  55,
  89,
  140,
  255,
  54,
  90,
  140,
  255,
  54,
  91,
  140,
  255,
  53,
  92,
  140,
  255,
  53,
  93,
  140,
  255,
  52,
  94,
  141,
  255,
  52,
  95,
  141,
  255,
  51,
  96,
  141,
  255,
  51,
  97,
  141,
  255,
  50,
  98,
  141,
  255,
  50,
  99,
  141,
  255,
  49,
  100,
  141,
  255,
  49,
  101,
  141,
  255,
  49,
  102,
  141,
  255,
  48,
  103,
  141,
  255,
  48,
  104,
  141,
  255,
  47,
  105,
  141,
  255,
  47,
  106,
  141,
  255,
  46,
  107,
  142,
  255,
  46,
  108,
  142,
  255,
  46,
  109,
  142,
  255,
  45,
  110,
  142,
  255,
  45,
  111,
  142,
  255,
  44,
  112,
  142,
  255,
  44,
  113,
  142,
  255,
  44,
  114,
  142,
  255,
  43,
  115,
  142,
  255,
  43,
  116,
  142,
  255,
  42,
  117,
  142,
  255,
  42,
  118,
  142,
  255,
  42,
  119,
  142,
  255,
  41,
  120,
  142,
  255,
  41,
  121,
  142,
  255,
  40,
  122,
  142,
  255,
  40,
  122,
  142,
  255,
  40,
  123,
  142,
  255,
  39,
  124,
  142,
  255,
  39,
  125,
  142,
  255,
  39,
  126,
  142,
  255,
  38,
  127,
  142,
  255,
  38,
  128,
  142,
  255,
  38,
  129,
  142,
  255,
  37,
  130,
  142,
  255,
  37,
  131,
  141,
  255,
  36,
  132,
  141,
  255,
  36,
  133,
  141,
  255,
  36,
  134,
  141,
  255,
  35,
  135,
  141,
  255,
  35,
  136,
  141,
  255,
  35,
  137,
  141,
  255,
  34,
  137,
  141,
  255,
  34,
  138,
  141,
  255,
  34,
  139,
  141,
  255,
  33,
  140,
  141,
  255,
  33,
  141,
  140,
  255,
  33,
  142,
  140,
  255,
  32,
  143,
  140,
  255,
  32,
  144,
  140,
  255,
  32,
  145,
  140,
  255,
  31,
  146,
  140,
  255,
  31,
  147,
  139,
  255,
  31,
  148,
  139,
  255,
  31,
  149,
  139,
  255,
  31,
  150,
  139,
  255,
  30,
  151,
  138,
  255,
  30,
  152,
  138,
  255,
  30,
  153,
  138,
  255,
  30,
  153,
  138,
  255,
  30,
  154,
  137,
  255,
  30,
  155,
  137,
  255,
  30,
  156,
  137,
  255,
  30,
  157,
  136,
  255,
  30,
  158,
  136,
  255,
  30,
  159,
  136,
  255,
  30,
  160,
  135,
  255,
  31,
  161,
  135,
  255,
  31,
  162,
  134,
  255,
  31,
  163,
  134,
  255,
  32,
  164,
  133,
  255,
  32,
  165,
  133,
  255,
  33,
  166,
  133,
  255,
  33,
  167,
  132,
  255,
  34,
  167,
  132,
  255,
  35,
  168,
  131,
  255,
  35,
  169,
  130,
  255,
  36,
  170,
  130,
  255,
  37,
  171,
  129,
  255,
  38,
  172,
  129,
  255,
  39,
  173,
  128,
  255,
  40,
  174,
  127,
  255,
  41,
  175,
  127,
  255,
  42,
  176,
  126,
  255,
  43,
  177,
  125,
  255,
  44,
  177,
  125,
  255,
  46,
  178,
  124,
  255,
  47,
  179,
  123,
  255,
  48,
  180,
  122,
  255,
  50,
  181,
  122,
  255,
  51,
  182,
  121,
  255,
  53,
  183,
  120,
  255,
  54,
  184,
  119,
  255,
  56,
  185,
  118,
  255,
  57,
  185,
  118,
  255,
  59,
  186,
  117,
  255,
  61,
  187,
  116,
  255,
  62,
  188,
  115,
  255,
  64,
  189,
  114,
  255,
  66,
  190,
  113,
  255,
  68,
  190,
  112,
  255,
  69,
  191,
  111,
  255,
  71,
  192,
  110,
  255,
  73,
  193,
  109,
  255,
  75,
  194,
  108,
  255,
  77,
  194,
  107,
  255,
  79,
  195,
  105,
  255,
  81,
  196,
  104,
  255,
  83,
  197,
  103,
  255,
  85,
  198,
  102,
  255,
  87,
  198,
  101,
  255,
  89,
  199,
  100,
  255,
  91,
  200,
  98,
  255,
  94,
  201,
  97,
  255,
  96,
  201,
  96,
  255,
  98,
  202,
  95,
  255,
  100,
  203,
  93,
  255,
  103,
  204,
  92,
  255,
  105,
  204,
  91,
  255,
  107,
  205,
  89,
  255,
  109,
  206,
  88,
  255,
  112,
  206,
  86,
  255,
  114,
  207,
  85,
  255,
  116,
  208,
  84,
  255,
  119,
  208,
  82,
  255,
  121,
  209,
  81,
  255,
  124,
  210,
  79,
  255,
  126,
  210,
  78,
  255,
  129,
  211,
  76,
  255,
  131,
  211,
  75,
  255,
  134,
  212,
  73,
  255,
  136,
  213,
  71,
  255,
  139,
  213,
  70,
  255,
  141,
  214,
  68,
  255,
  144,
  214,
  67,
  255,
  146,
  215,
  65,
  255,
  149,
  215,
  63,
  255,
  151,
  216,
  62,
  255,
  154,
  216,
  60,
  255,
  157,
  217,
  58,
  255,
  159,
  217,
  56,
  255,
  162,
  218,
  55,
  255,
  165,
  218,
  53,
  255,
  167,
  219,
  51,
  255,
  170,
  219,
  50,
  255,
  173,
  220,
  48,
  255,
  175,
  220,
  46,
  255,
  178,
  221,
  44,
  255,
  181,
  221,
  43,
  255,
  183,
  221,
  41,
  255,
  186,
  222,
  39,
  255,
  189,
  222,
  38,
  255,
  191,
  223,
  36,
  255,
  194,
  223,
  34,
  255,
  197,
  223,
  33,
  255,
  199,
  224,
  31,
  255,
  202,
  224,
  30,
  255,
  205,
  224,
  29,
  255,
  207,
  225,
  28,
  255,
  210,
  225,
  27,
  255,
  212,
  225,
  26,
  255,
  215,
  226,
  25,
  255,
  218,
  226,
  24,
  255,
  220,
  226,
  24,
  255,
  223,
  227,
  24,
  255,
  225,
  227,
  24,
  255,
  228,
  227,
  24,
  255,
  231,
  228,
  25,
  255,
  233,
  228,
  25,
  255,
  236,
  228,
  26,
  255,
  238,
  229,
  27,
  255,
  241,
  229,
  28,
  255,
  243,
  229,
  30,
  255,
  246,
  230,
  31,
  255,
  248,
  230,
  33,
  255,
  250,
  230,
  34,
  255,
  253,
  231,
  36,
  255
]);
var _RDYLGN = new Uint8Array([
  165,
  0,
  38,
  255,
  166,
  1,
  38,
  255,
  168,
  3,
  38,
  255,
  170,
  5,
  38,
  255,
  172,
  7,
  38,
  255,
  174,
  9,
  38,
  255,
  176,
  11,
  38,
  255,
  178,
  13,
  38,
  255,
  180,
  15,
  38,
  255,
  182,
  16,
  38,
  255,
  184,
  18,
  38,
  255,
  186,
  20,
  38,
  255,
  188,
  22,
  38,
  255,
  190,
  24,
  38,
  255,
  192,
  26,
  38,
  255,
  194,
  28,
  38,
  255,
  196,
  30,
  38,
  255,
  198,
  32,
  38,
  255,
  200,
  33,
  38,
  255,
  202,
  35,
  38,
  255,
  204,
  37,
  38,
  255,
  206,
  39,
  38,
  255,
  208,
  41,
  38,
  255,
  210,
  43,
  38,
  255,
  212,
  45,
  38,
  255,
  214,
  47,
  38,
  255,
  215,
  49,
  39,
  255,
  216,
  51,
  40,
  255,
  217,
  53,
  41,
  255,
  218,
  56,
  42,
  255,
  220,
  58,
  43,
  255,
  221,
  61,
  45,
  255,
  222,
  63,
  46,
  255,
  223,
  65,
  47,
  255,
  224,
  68,
  48,
  255,
  225,
  70,
  49,
  255,
  226,
  73,
  50,
  255,
  228,
  75,
  51,
  255,
  229,
  77,
  52,
  255,
  230,
  80,
  53,
  255,
  231,
  82,
  54,
  255,
  232,
  85,
  56,
  255,
  233,
  87,
  57,
  255,
  234,
  89,
  58,
  255,
  236,
  92,
  59,
  255,
  237,
  94,
  60,
  255,
  238,
  97,
  61,
  255,
  239,
  99,
  62,
  255,
  240,
  101,
  63,
  255,
  241,
  104,
  64,
  255,
  242,
  106,
  65,
  255,
  244,
  109,
  67,
  255,
  244,
  111,
  68,
  255,
  244,
  114,
  69,
  255,
  245,
  116,
  70,
  255,
  245,
  119,
  71,
  255,
  245,
  121,
  72,
  255,
  246,
  124,
  74,
  255,
  246,
  126,
  75,
  255,
  246,
  129,
  76,
  255,
  247,
  131,
  77,
  255,
  247,
  134,
  78,
  255,
  247,
  137,
  79,
  255,
  248,
  139,
  81,
  255,
  248,
  142,
  82,
  255,
  248,
  144,
  83,
  255,
  249,
  147,
  84,
  255,
  249,
  149,
  85,
  255,
  250,
  152,
  86,
  255,
  250,
  154,
  88,
  255,
  250,
  157,
  89,
  255,
  251,
  159,
  90,
  255,
  251,
  162,
  91,
  255,
  251,
  165,
  92,
  255,
  252,
  167,
  94,
  255,
  252,
  170,
  95,
  255,
  252,
  172,
  96,
  255,
  253,
  174,
  97,
  255,
  253,
  176,
  99,
  255,
  253,
  178,
  101,
  255,
  253,
  180,
  102,
  255,
  253,
  182,
  104,
  255,
  253,
  184,
  106,
  255,
  253,
  186,
  107,
  255,
  253,
  188,
  109,
  255,
  253,
  190,
  110,
  255,
  253,
  192,
  112,
  255,
  253,
  194,
  114,
  255,
  253,
  196,
  115,
  255,
  253,
  198,
  117,
  255,
  253,
  200,
  119,
  255,
  253,
  202,
  120,
  255,
  253,
  204,
  122,
  255,
  253,
  206,
  124,
  255,
  253,
  208,
  125,
  255,
  253,
  210,
  127,
  255,
  253,
  212,
  129,
  255,
  253,
  214,
  130,
  255,
  253,
  216,
  132,
  255,
  253,
  218,
  134,
  255,
  253,
  220,
  135,
  255,
  253,
  222,
  137,
  255,
  254,
  224,
  139,
  255,
  254,
  225,
  141,
  255,
  254,
  226,
  143,
  255,
  254,
  227,
  145,
  255,
  254,
  228,
  147,
  255,
  254,
  230,
  149,
  255,
  254,
  231,
  151,
  255,
  254,
  232,
  153,
  255,
  254,
  233,
  155,
  255,
  254,
  234,
  157,
  255,
  254,
  236,
  159,
  255,
  254,
  237,
  161,
  255,
  254,
  238,
  163,
  255,
  254,
  239,
  165,
  255,
  254,
  241,
  167,
  255,
  254,
  242,
  169,
  255,
  254,
  243,
  171,
  255,
  254,
  244,
  173,
  255,
  254,
  245,
  175,
  255,
  254,
  247,
  177,
  255,
  254,
  248,
  179,
  255,
  254,
  249,
  181,
  255,
  254,
  250,
  183,
  255,
  254,
  251,
  185,
  255,
  254,
  253,
  187,
  255,
  254,
  254,
  189,
  255,
  254,
  254,
  189,
  255,
  252,
  254,
  187,
  255,
  251,
  253,
  185,
  255,
  249,
  252,
  183,
  255,
  248,
  252,
  181,
  255,
  246,
  251,
  179,
  255,
  245,
  250,
  177,
  255,
  243,
  250,
  175,
  255,
  242,
  249,
  173,
  255,
  240,
  249,
  171,
  255,
  239,
  248,
  169,
  255,
  237,
  247,
  167,
  255,
  236,
  247,
  165,
  255,
  234,
  246,
  163,
  255,
  233,
  245,
  161,
  255,
  231,
  245,
  159,
  255,
  230,
  244,
  157,
  255,
  228,
  244,
  155,
  255,
  227,
  243,
  153,
  255,
  225,
  242,
  151,
  255,
  224,
  242,
  149,
  255,
  222,
  241,
  147,
  255,
  221,
  240,
  145,
  255,
  219,
  240,
  143,
  255,
  218,
  239,
  141,
  255,
  217,
  239,
  139,
  255,
  215,
  238,
  137,
  255,
  213,
  237,
  136,
  255,
  211,
  236,
  135,
  255,
  209,
  235,
  133,
  255,
  207,
  234,
  132,
  255,
  205,
  233,
  131,
  255,
  203,
  232,
  129,
  255,
  201,
  232,
  128,
  255,
  199,
  231,
  127,
  255,
  197,
  230,
  126,
  255,
  195,
  229,
  124,
  255,
  193,
  228,
  123,
  255,
  191,
  227,
  122,
  255,
  189,
  226,
  120,
  255,
  187,
  226,
  119,
  255,
  185,
  225,
  118,
  255,
  183,
  224,
  117,
  255,
  181,
  223,
  115,
  255,
  179,
  222,
  114,
  255,
  177,
  221,
  113,
  255,
  175,
  220,
  111,
  255,
  173,
  220,
  110,
  255,
  171,
  219,
  109,
  255,
  169,
  218,
  107,
  255,
  167,
  217,
  106,
  255,
  164,
  216,
  105,
  255,
  162,
  215,
  105,
  255,
  159,
  214,
  105,
  255,
  157,
  213,
  105,
  255,
  154,
  212,
  104,
  255,
  152,
  210,
  104,
  255,
  149,
  209,
  104,
  255,
  147,
  208,
  103,
  255,
  144,
  207,
  103,
  255,
  142,
  206,
  103,
  255,
  139,
  205,
  103,
  255,
  137,
  204,
  102,
  255,
  134,
  203,
  102,
  255,
  132,
  202,
  102,
  255,
  129,
  201,
  102,
  255,
  127,
  199,
  101,
  255,
  124,
  198,
  101,
  255,
  122,
  197,
  101,
  255,
  119,
  196,
  100,
  255,
  117,
  195,
  100,
  255,
  114,
  194,
  100,
  255,
  112,
  193,
  100,
  255,
  109,
  192,
  99,
  255,
  107,
  191,
  99,
  255,
  104,
  190,
  99,
  255,
  102,
  189,
  99,
  255,
  99,
  187,
  98,
  255,
  96,
  186,
  97,
  255,
  93,
  184,
  96,
  255,
  90,
  183,
  96,
  255,
  87,
  181,
  95,
  255,
  84,
  180,
  94,
  255,
  81,
  178,
  93,
  255,
  78,
  177,
  93,
  255,
  75,
  175,
  92,
  255,
  72,
  174,
  91,
  255,
  69,
  173,
  90,
  255,
  66,
  171,
  90,
  255,
  63,
  170,
  89,
  255,
  60,
  168,
  88,
  255,
  57,
  167,
  87,
  255,
  54,
  165,
  87,
  255,
  51,
  164,
  86,
  255,
  48,
  162,
  85,
  255,
  45,
  161,
  84,
  255,
  42,
  159,
  84,
  255,
  39,
  158,
  83,
  255,
  36,
  157,
  82,
  255,
  33,
  155,
  81,
  255,
  30,
  154,
  81,
  255,
  27,
  152,
  80,
  255,
  25,
  151,
  79,
  255,
  24,
  149,
  78,
  255,
  23,
  147,
  77,
  255,
  22,
  145,
  76,
  255,
  21,
  143,
  75,
  255,
  20,
  141,
  74,
  255,
  19,
  139,
  73,
  255,
  18,
  137,
  72,
  255,
  17,
  136,
  71,
  255,
  16,
  134,
  70,
  255,
  15,
  132,
  69,
  255,
  14,
  130,
  68,
  255,
  13,
  128,
  67,
  255,
  12,
  126,
  66,
  255,
  11,
  124,
  65,
  255,
  10,
  122,
  64,
  255,
  9,
  120,
  63,
  255,
  8,
  119,
  62,
  255,
  7,
  117,
  61,
  255,
  6,
  115,
  60,
  255,
  5,
  113,
  59,
  255,
  4,
  111,
  58,
  255,
  3,
  109,
  57,
  255,
  2,
  107,
  56,
  255,
  1,
  105,
  55,
  255,
  0,
  104,
  55,
  255
]);
var _GREENS = new Uint8Array([
  247,
  252,
  245,
  255,
  246,
  251,
  244,
  255,
  245,
  251,
  243,
  255,
  245,
  251,
  243,
  255,
  244,
  251,
  242,
  255,
  244,
  250,
  241,
  255,
  243,
  250,
  241,
  255,
  243,
  250,
  240,
  255,
  242,
  250,
  239,
  255,
  241,
  250,
  239,
  255,
  241,
  249,
  238,
  255,
  240,
  249,
  237,
  255,
  240,
  249,
  237,
  255,
  239,
  249,
  236,
  255,
  239,
  248,
  235,
  255,
  238,
  248,
  235,
  255,
  237,
  248,
  234,
  255,
  237,
  248,
  233,
  255,
  236,
  248,
  233,
  255,
  236,
  247,
  232,
  255,
  235,
  247,
  231,
  255,
  235,
  247,
  231,
  255,
  234,
  247,
  230,
  255,
  234,
  246,
  229,
  255,
  233,
  246,
  229,
  255,
  232,
  246,
  228,
  255,
  232,
  246,
  227,
  255,
  231,
  246,
  227,
  255,
  231,
  245,
  226,
  255,
  230,
  245,
  225,
  255,
  230,
  245,
  225,
  255,
  229,
  245,
  224,
  255,
  228,
  244,
  223,
  255,
  227,
  244,
  222,
  255,
  227,
  244,
  221,
  255,
  226,
  243,
  220,
  255,
  225,
  243,
  219,
  255,
  224,
  243,
  218,
  255,
  223,
  242,
  217,
  255,
  222,
  242,
  216,
  255,
  221,
  241,
  215,
  255,
  220,
  241,
  214,
  255,
  219,
  241,
  213,
  255,
  218,
  240,
  212,
  255,
  217,
  240,
  211,
  255,
  216,
  240,
  210,
  255,
  215,
  239,
  209,
  255,
  214,
  239,
  208,
  255,
  213,
  238,
  207,
  255,
  212,
  238,
  206,
  255,
  211,
  238,
  205,
  255,
  211,
  237,
  204,
  255,
  210,
  237,
  203,
  255,
  209,
  237,
  202,
  255,
  208,
  236,
  201,
  255,
  207,
  236,
  200,
  255,
  206,
  235,
  199,
  255,
  205,
  235,
  198,
  255,
  204,
  235,
  197,
  255,
  203,
  234,
  196,
  255,
  202,
  234,
  195,
  255,
  201,
  234,
  194,
  255,
  200,
  233,
  193,
  255,
  199,
  233,
  192,
  255,
  198,
  232,
  191,
  255,
  197,
  232,
  190,
  255,
  196,
  231,
  189,
  255,
  195,
  231,
  188,
  255,
  193,
  230,
  187,
  255,
  192,
  230,
  185,
  255,
  191,
  229,
  184,
  255,
  190,
  229,
  183,
  255,
  189,
  228,
  182,
  255,
  187,
  228,
  181,
  255,
  186,
  227,
  180,
  255,
  185,
  227,
  178,
  255,
  184,
  226,
  177,
  255,
  183,
  226,
  176,
  255,
  182,
  225,
  175,
  255,
  180,
  225,
  174,
  255,
  179,
  224,
  173,
  255,
  178,
  224,
  171,
  255,
  177,
  223,
  170,
  255,
  176,
  223,
  169,
  255,
  174,
  222,
  168,
  255,
  173,
  222,
  167,
  255,
  172,
  221,
  166,
  255,
  171,
  221,
  165,
  255,
  170,
  220,
  163,
  255,
  168,
  220,
  162,
  255,
  167,
  219,
  161,
  255,
  166,
  219,
  160,
  255,
  165,
  218,
  159,
  255,
  164,
  218,
  158,
  255,
  162,
  217,
  156,
  255,
  161,
  217,
  155,
  255,
  160,
  216,
  154,
  255,
  159,
  216,
  153,
  255,
  157,
  215,
  152,
  255,
  156,
  214,
  151,
  255,
  154,
  214,
  149,
  255,
  153,
  213,
  148,
  255,
  152,
  212,
  147,
  255,
  150,
  212,
  146,
  255,
  149,
  211,
  145,
  255,
  147,
  210,
  144,
  255,
  146,
  210,
  142,
  255,
  144,
  209,
  141,
  255,
  143,
  208,
  140,
  255,
  142,
  208,
  139,
  255,
  140,
  207,
  138,
  255,
  139,
  206,
  137,
  255,
  137,
  206,
  135,
  255,
  136,
  205,
  134,
  255,
  135,
  204,
  133,
  255,
  133,
  204,
  132,
  255,
  132,
  203,
  131,
  255,
  130,
  202,
  130,
  255,
  129,
  202,
  129,
  255,
  128,
  201,
  127,
  255,
  126,
  200,
  126,
  255,
  125,
  200,
  125,
  255,
  123,
  199,
  124,
  255,
  122,
  198,
  123,
  255,
  120,
  198,
  122,
  255,
  119,
  197,
  120,
  255,
  118,
  196,
  119,
  255,
  116,
  196,
  118,
  255,
  115,
  195,
  117,
  255,
  113,
  194,
  116,
  255,
  112,
  194,
  116,
  255,
  110,
  193,
  115,
  255,
  108,
  192,
  114,
  255,
  107,
  191,
  113,
  255,
  105,
  190,
  112,
  255,
  104,
  190,
  112,
  255,
  102,
  189,
  111,
  255,
  100,
  188,
  110,
  255,
  99,
  187,
  109,
  255,
  97,
  186,
  108,
  255,
  96,
  186,
  108,
  255,
  94,
  185,
  107,
  255,
  92,
  184,
  106,
  255,
  91,
  183,
  105,
  255,
  89,
  183,
  105,
  255,
  88,
  182,
  104,
  255,
  86,
  181,
  103,
  255,
  84,
  180,
  102,
  255,
  83,
  179,
  101,
  255,
  81,
  179,
  101,
  255,
  80,
  178,
  100,
  255,
  78,
  177,
  99,
  255,
  76,
  176,
  98,
  255,
  75,
  176,
  97,
  255,
  73,
  175,
  97,
  255,
  72,
  174,
  96,
  255,
  70,
  173,
  95,
  255,
  68,
  172,
  94,
  255,
  67,
  172,
  94,
  255,
  65,
  171,
  93,
  255,
  64,
  170,
  92,
  255,
  63,
  169,
  91,
  255,
  62,
  168,
  91,
  255,
  61,
  167,
  90,
  255,
  60,
  166,
  89,
  255,
  59,
  165,
  88,
  255,
  58,
  164,
  88,
  255,
  57,
  163,
  87,
  255,
  56,
  162,
  86,
  255,
  55,
  161,
  85,
  255,
  55,
  160,
  85,
  255,
  54,
  159,
  84,
  255,
  53,
  158,
  83,
  255,
  52,
  157,
  82,
  255,
  51,
  156,
  81,
  255,
  50,
  155,
  81,
  255,
  49,
  154,
  80,
  255,
  48,
  153,
  79,
  255,
  47,
  152,
  78,
  255,
  46,
  151,
  78,
  255,
  45,
  150,
  77,
  255,
  44,
  149,
  76,
  255,
  43,
  148,
  75,
  255,
  42,
  147,
  75,
  255,
  41,
  146,
  74,
  255,
  40,
  145,
  73,
  255,
  39,
  144,
  72,
  255,
  39,
  143,
  72,
  255,
  38,
  142,
  71,
  255,
  37,
  141,
  70,
  255,
  36,
  140,
  69,
  255,
  35,
  139,
  69,
  255,
  34,
  138,
  68,
  255,
  33,
  137,
  67,
  255,
  31,
  136,
  66,
  255,
  30,
  135,
  66,
  255,
  29,
  134,
  65,
  255,
  28,
  133,
  64,
  255,
  27,
  132,
  63,
  255,
  26,
  131,
  62,
  255,
  25,
  130,
  62,
  255,
  24,
  129,
  61,
  255,
  23,
  128,
  60,
  255,
  22,
  127,
  59,
  255,
  21,
  126,
  58,
  255,
  19,
  126,
  58,
  255,
  18,
  125,
  57,
  255,
  17,
  124,
  56,
  255,
  16,
  123,
  55,
  255,
  15,
  122,
  55,
  255,
  14,
  121,
  54,
  255,
  13,
  120,
  53,
  255,
  12,
  119,
  52,
  255,
  11,
  118,
  51,
  255,
  10,
  117,
  51,
  255,
  8,
  116,
  50,
  255,
  7,
  115,
  49,
  255,
  6,
  114,
  48,
  255,
  5,
  113,
  48,
  255,
  4,
  112,
  47,
  255,
  3,
  111,
  46,
  255,
  2,
  111,
  45,
  255,
  1,
  110,
  44,
  255,
  0,
  109,
  44,
  255,
  0,
  107,
  43,
  255,
  0,
  106,
  43,
  255,
  0,
  105,
  42,
  255,
  0,
  104,
  41,
  255,
  0,
  102,
  41,
  255,
  0,
  101,
  40,
  255,
  0,
  100,
  40,
  255,
  0,
  98,
  39,
  255,
  0,
  97,
  39,
  255,
  0,
  96,
  38,
  255,
  0,
  95,
  38,
  255,
  0,
  93,
  37,
  255,
  0,
  92,
  37,
  255,
  0,
  91,
  36,
  255,
  0,
  89,
  36,
  255,
  0,
  88,
  35,
  255,
  0,
  87,
  35,
  255,
  0,
  86,
  34,
  255,
  0,
  84,
  33,
  255,
  0,
  83,
  33,
  255,
  0,
  82,
  32,
  255,
  0,
  80,
  32,
  255,
  0,
  79,
  31,
  255,
  0,
  78,
  31,
  255,
  0,
  77,
  30,
  255,
  0,
  75,
  30,
  255,
  0,
  74,
  29,
  255,
  0,
  73,
  29,
  255,
  0,
  71,
  28,
  255,
  0,
  70,
  28,
  255,
  0,
  69,
  27,
  255,
  0,
  68,
  27,
  255
]);
var _REDS = new Uint8Array([
  255,
  245,
  240,
  255,
  254,
  244,
  239,
  255,
  254,
  243,
  238,
  255,
  254,
  243,
  237,
  255,
  254,
  242,
  236,
  255,
  254,
  241,
  235,
  255,
  254,
  241,
  234,
  255,
  254,
  240,
  233,
  255,
  254,
  239,
  232,
  255,
  254,
  239,
  231,
  255,
  254,
  238,
  230,
  255,
  254,
  237,
  229,
  255,
  254,
  237,
  228,
  255,
  254,
  236,
  227,
  255,
  254,
  235,
  226,
  255,
  254,
  235,
  225,
  255,
  254,
  234,
  224,
  255,
  254,
  233,
  224,
  255,
  254,
  233,
  223,
  255,
  254,
  232,
  222,
  255,
  254,
  231,
  221,
  255,
  254,
  231,
  220,
  255,
  254,
  230,
  219,
  255,
  254,
  229,
  218,
  255,
  254,
  229,
  217,
  255,
  254,
  228,
  216,
  255,
  254,
  227,
  215,
  255,
  254,
  227,
  214,
  255,
  254,
  226,
  213,
  255,
  254,
  225,
  212,
  255,
  254,
  225,
  211,
  255,
  254,
  224,
  210,
  255,
  253,
  223,
  209,
  255,
  253,
  222,
  208,
  255,
  253,
  221,
  206,
  255,
  253,
  220,
  205,
  255,
  253,
  219,
  203,
  255,
  253,
  218,
  202,
  255,
  253,
  216,
  200,
  255,
  253,
  215,
  199,
  255,
  253,
  214,
  197,
  255,
  253,
  213,
  195,
  255,
  253,
  212,
  194,
  255,
  253,
  211,
  192,
  255,
  253,
  209,
  191,
  255,
  253,
  208,
  189,
  255,
  253,
  207,
  188,
  255,
  253,
  206,
  186,
  255,
  252,
  205,
  185,
  255,
  252,
  204,
  183,
  255,
  252,
  202,
  182,
  255,
  252,
  201,
  180,
  255,
  252,
  200,
  179,
  255,
  252,
  199,
  177,
  255,
  252,
  198,
  175,
  255,
  252,
  197,
  174,
  255,
  252,
  195,
  172,
  255,
  252,
  194,
  171,
  255,
  252,
  193,
  169,
  255,
  252,
  192,
  168,
  255,
  252,
  191,
  166,
  255,
  252,
  190,
  165,
  255,
  252,
  189,
  163,
  255,
  252,
  187,
  162,
  255,
  252,
  186,
  160,
  255,
  252,
  185,
  159,
  255,
  252,
  184,
  157,
  255,
  252,
  182,
  156,
  255,
  252,
  181,
  154,
  255,
  252,
  180,
  153,
  255,
  252,
  178,
  151,
  255,
  252,
  177,
  150,
  255,
  252,
  176,
  148,
  255,
  252,
  175,
  147,
  255,
  252,
  173,
  145,
  255,
  252,
  172,
  144,
  255,
  252,
  171,
  142,
  255,
  252,
  169,
  141,
  255,
  252,
  168,
  139,
  255,
  252,
  167,
  138,
  255,
  252,
  166,
  137,
  255,
  252,
  164,
  135,
  255,
  252,
  163,
  134,
  255,
  252,
  162,
  132,
  255,
  252,
  160,
  131,
  255,
  252,
  159,
  129,
  255,
  252,
  158,
  128,
  255,
  252,
  157,
  126,
  255,
  252,
  155,
  125,
  255,
  252,
  154,
  123,
  255,
  252,
  153,
  122,
  255,
  252,
  151,
  120,
  255,
  252,
  150,
  119,
  255,
  252,
  149,
  117,
  255,
  252,
  148,
  116,
  255,
  252,
  146,
  114,
  255,
  251,
  145,
  113,
  255,
  251,
  144,
  112,
  255,
  251,
  143,
  111,
  255,
  251,
  141,
  109,
  255,
  251,
  140,
  108,
  255,
  251,
  139,
  107,
  255,
  251,
  138,
  106,
  255,
  251,
  136,
  104,
  255,
  251,
  135,
  103,
  255,
  251,
  134,
  102,
  255,
  251,
  132,
  100,
  255,
  251,
  131,
  99,
  255,
  251,
  130,
  98,
  255,
  251,
  129,
  97,
  255,
  251,
  127,
  95,
  255,
  251,
  126,
  94,
  255,
  251,
  125,
  93,
  255,
  251,
  124,
  92,
  255,
  251,
  122,
  90,
  255,
  251,
  121,
  89,
  255,
  251,
  120,
  88,
  255,
  251,
  119,
  87,
  255,
  251,
  117,
  85,
  255,
  251,
  116,
  84,
  255,
  251,
  115,
  83,
  255,
  251,
  114,
  82,
  255,
  251,
  112,
  80,
  255,
  251,
  111,
  79,
  255,
  251,
  110,
  78,
  255,
  251,
  109,
  77,
  255,
  251,
  107,
  75,
  255,
  251,
  106,
  74,
  255,
  250,
  105,
  73,
  255,
  250,
  103,
  72,
  255,
  250,
  102,
  71,
  255,
  249,
  100,
  70,
  255,
  249,
  99,
  69,
  255,
  248,
  97,
  68,
  255,
  248,
  96,
  67,
  255,
  248,
  94,
  66,
  255,
  247,
  93,
  66,
  255,
  247,
  91,
  65,
  255,
  247,
  90,
  64,
  255,
  246,
  89,
  63,
  255,
  246,
  87,
  62,
  255,
  245,
  86,
  61,
  255,
  245,
  84,
  60,
  255,
  245,
  83,
  59,
  255,
  244,
  81,
  58,
  255,
  244,
  80,
  57,
  255,
  244,
  78,
  56,
  255,
  243,
  77,
  55,
  255,
  243,
  75,
  54,
  255,
  242,
  74,
  53,
  255,
  242,
  72,
  52,
  255,
  242,
  71,
  51,
  255,
  241,
  69,
  50,
  255,
  241,
  68,
  50,
  255,
  241,
  66,
  49,
  255,
  240,
  65,
  48,
  255,
  240,
  63,
  47,
  255,
  239,
  62,
  46,
  255,
  239,
  61,
  45,
  255,
  239,
  59,
  44,
  255,
  238,
  58,
  43,
  255,
  237,
  57,
  43,
  255,
  236,
  56,
  42,
  255,
  234,
  55,
  42,
  255,
  233,
  53,
  41,
  255,
  232,
  52,
  41,
  255,
  231,
  51,
  40,
  255,
  230,
  50,
  40,
  255,
  229,
  49,
  39,
  255,
  228,
  48,
  39,
  255,
  227,
  47,
  39,
  255,
  225,
  46,
  38,
  255,
  224,
  45,
  38,
  255,
  223,
  44,
  37,
  255,
  222,
  42,
  37,
  255,
  221,
  41,
  36,
  255,
  220,
  40,
  36,
  255,
  219,
  39,
  35,
  255,
  217,
  38,
  35,
  255,
  216,
  37,
  34,
  255,
  215,
  36,
  34,
  255,
  214,
  35,
  33,
  255,
  213,
  34,
  33,
  255,
  212,
  33,
  32,
  255,
  211,
  31,
  32,
  255,
  210,
  30,
  31,
  255,
  208,
  29,
  31,
  255,
  207,
  28,
  31,
  255,
  206,
  27,
  30,
  255,
  205,
  26,
  30,
  255,
  204,
  25,
  29,
  255,
  203,
  24,
  29,
  255,
  202,
  23,
  28,
  255,
  200,
  23,
  28,
  255,
  199,
  23,
  28,
  255,
  198,
  22,
  28,
  255,
  197,
  22,
  27,
  255,
  196,
  22,
  27,
  255,
  194,
  22,
  27,
  255,
  193,
  21,
  27,
  255,
  192,
  21,
  26,
  255,
  191,
  21,
  26,
  255,
  190,
  20,
  26,
  255,
  188,
  20,
  26,
  255,
  187,
  20,
  25,
  255,
  186,
  20,
  25,
  255,
  185,
  19,
  25,
  255,
  184,
  19,
  25,
  255,
  183,
  19,
  24,
  255,
  181,
  18,
  24,
  255,
  180,
  18,
  24,
  255,
  179,
  18,
  24,
  255,
  178,
  18,
  23,
  255,
  177,
  17,
  23,
  255,
  175,
  17,
  23,
  255,
  174,
  17,
  23,
  255,
  173,
  17,
  22,
  255,
  172,
  16,
  22,
  255,
  171,
  16,
  22,
  255,
  169,
  16,
  22,
  255,
  168,
  15,
  21,
  255,
  167,
  15,
  21,
  255,
  166,
  15,
  21,
  255,
  165,
  15,
  21,
  255,
  163,
  14,
  20,
  255,
  161,
  14,
  20,
  255,
  159,
  13,
  20,
  255,
  157,
  13,
  20,
  255,
  155,
  12,
  19,
  255,
  153,
  12,
  19,
  255,
  151,
  11,
  19,
  255,
  149,
  11,
  19,
  255,
  147,
  10,
  18,
  255,
  145,
  10,
  18,
  255,
  143,
  9,
  18,
  255,
  141,
  9,
  18,
  255,
  139,
  8,
  17,
  255,
  138,
  8,
  17,
  255,
  136,
  8,
  17,
  255,
  134,
  7,
  17,
  255,
  132,
  7,
  16,
  255,
  130,
  6,
  16,
  255,
  128,
  6,
  16,
  255,
  126,
  5,
  16,
  255,
  124,
  5,
  15,
  255,
  122,
  4,
  15,
  255,
  120,
  4,
  15,
  255,
  118,
  3,
  15,
  255,
  116,
  3,
  14,
  255,
  114,
  2,
  14,
  255,
  112,
  2,
  14,
  255,
  110,
  1,
  14,
  255,
  108,
  1,
  13,
  255,
  106,
  0,
  13,
  255,
  104,
  0,
  13,
  255,
  103,
  0,
  12,
  255
]);
var _PIYG = new Uint8Array([
  142,
  1,
  82,
  255,
  144,
  2,
  83,
  255,
  146,
  3,
  85,
  255,
  148,
  4,
  87,
  255,
  150,
  5,
  88,
  255,
  152,
  6,
  90,
  255,
  154,
  7,
  92,
  255,
  157,
  8,
  93,
  255,
  159,
  9,
  95,
  255,
  161,
  10,
  97,
  255,
  163,
  11,
  98,
  255,
  165,
  12,
  100,
  255,
  167,
  13,
  102,
  255,
  170,
  14,
  103,
  255,
  172,
  15,
  105,
  255,
  174,
  16,
  107,
  255,
  176,
  17,
  108,
  255,
  178,
  18,
  110,
  255,
  180,
  19,
  112,
  255,
  182,
  20,
  114,
  255,
  185,
  21,
  115,
  255,
  187,
  22,
  117,
  255,
  189,
  23,
  119,
  255,
  191,
  24,
  120,
  255,
  193,
  25,
  122,
  255,
  195,
  26,
  124,
  255,
  197,
  28,
  125,
  255,
  198,
  32,
  127,
  255,
  199,
  36,
  129,
  255,
  200,
  39,
  131,
  255,
  201,
  43,
  133,
  255,
  202,
  46,
  135,
  255,
  203,
  50,
  137,
  255,
  204,
  54,
  139,
  255,
  205,
  57,
  141,
  255,
  206,
  61,
  143,
  255,
  207,
  64,
  145,
  255,
  208,
  68,
  147,
  255,
  209,
  72,
  149,
  255,
  210,
  75,
  150,
  255,
  211,
  79,
  152,
  255,
  212,
  82,
  154,
  255,
  213,
  86,
  156,
  255,
  214,
  90,
  158,
  255,
  215,
  93,
  160,
  255,
  216,
  97,
  162,
  255,
  217,
  100,
  164,
  255,
  218,
  104,
  166,
  255,
  219,
  108,
  168,
  255,
  220,
  111,
  170,
  255,
  221,
  115,
  172,
  255,
  222,
  119,
  174,
  255,
  222,
  121,
  175,
  255,
  223,
  123,
  177,
  255,
  224,
  126,
  179,
  255,
  224,
  128,
  180,
  255,
  225,
  131,
  182,
  255,
  226,
  133,
  184,
  255,
  227,
  136,
  186,
  255,
  227,
  138,
  187,
  255,
  228,
  141,
  189,
  255,
  229,
  143,
  191,
  255,
  230,
  146,
  192,
  255,
  230,
  148,
  194,
  255,
  231,
  151,
  196,
  255,
  232,
  153,
  198,
  255,
  233,
  156,
  199,
  255,
  233,
  158,
  201,
  255,
  234,
  161,
  203,
  255,
  235,
  163,
  205,
  255,
  236,
  165,
  206,
  255,
  236,
  168,
  208,
  255,
  237,
  170,
  210,
  255,
  238,
  173,
  211,
  255,
  239,
  175,
  213,
  255,
  239,
  178,
  215,
  255,
  240,
  180,
  217,
  255,
  241,
  182,
  218,
  255,
  241,
  184,
  219,
  255,
  242,
  186,
  220,
  255,
  242,
  187,
  220,
  255,
  243,
  189,
  221,
  255,
  243,
  191,
  222,
  255,
  244,
  192,
  223,
  255,
  244,
  194,
  224,
  255,
  245,
  195,
  225,
  255,
  245,
  197,
  225,
  255,
  245,
  199,
  226,
  255,
  246,
  200,
  227,
  255,
  246,
  202,
  228,
  255,
  247,
  204,
  229,
  255,
  247,
  205,
  229,
  255,
  248,
  207,
  230,
  255,
  248,
  209,
  231,
  255,
  249,
  210,
  232,
  255,
  249,
  212,
  233,
  255,
  250,
  214,
  234,
  255,
  250,
  215,
  234,
  255,
  251,
  217,
  235,
  255,
  251,
  219,
  236,
  255,
  252,
  220,
  237,
  255,
  252,
  222,
  238,
  255,
  253,
  224,
  239,
  255,
  252,
  224,
  239,
  255,
  252,
  225,
  239,
  255,
  252,
  226,
  239,
  255,
  252,
  227,
  240,
  255,
  251,
  228,
  240,
  255,
  251,
  229,
  240,
  255,
  251,
  230,
  241,
  255,
  251,
  231,
  241,
  255,
  250,
  232,
  241,
  255,
  250,
  233,
  242,
  255,
  250,
  233,
  242,
  255,
  250,
  234,
  242,
  255,
  249,
  235,
  243,
  255,
  249,
  236,
  243,
  255,
  249,
  237,
  243,
  255,
  249,
  238,
  244,
  255,
  249,
  239,
  244,
  255,
  248,
  240,
  244,
  255,
  248,
  241,
  244,
  255,
  248,
  242,
  245,
  255,
  248,
  242,
  245,
  255,
  247,
  243,
  245,
  255,
  247,
  244,
  246,
  255,
  247,
  245,
  246,
  255,
  247,
  246,
  246,
  255,
  246,
  246,
  246,
  255,
  246,
  246,
  244,
  255,
  245,
  246,
  243,
  255,
  244,
  246,
  241,
  255,
  244,
  246,
  240,
  255,
  243,
  246,
  238,
  255,
  242,
  246,
  237,
  255,
  242,
  246,
  235,
  255,
  241,
  246,
  234,
  255,
  240,
  246,
  232,
  255,
  240,
  246,
  230,
  255,
  239,
  246,
  229,
  255,
  238,
  246,
  227,
  255,
  238,
  245,
  226,
  255,
  237,
  245,
  224,
  255,
  236,
  245,
  223,
  255,
  236,
  245,
  221,
  255,
  235,
  245,
  220,
  255,
  234,
  245,
  218,
  255,
  234,
  245,
  217,
  255,
  233,
  245,
  215,
  255,
  232,
  245,
  214,
  255,
  232,
  245,
  212,
  255,
  231,
  245,
  211,
  255,
  230,
  245,
  209,
  255,
  230,
  245,
  208,
  255,
  228,
  244,
  205,
  255,
  226,
  243,
  202,
  255,
  224,
  242,
  199,
  255,
  222,
  241,
  196,
  255,
  220,
  241,
  193,
  255,
  219,
  240,
  190,
  255,
  217,
  239,
  187,
  255,
  215,
  238,
  184,
  255,
  213,
  237,
  181,
  255,
  211,
  237,
  178,
  255,
  210,
  236,
  176,
  255,
  208,
  235,
  173,
  255,
  206,
  234,
  170,
  255,
  204,
  234,
  167,
  255,
  202,
  233,
  164,
  255,
  201,
  232,
  161,
  255,
  199,
  231,
  158,
  255,
  197,
  230,
  155,
  255,
  195,
  230,
  152,
  255,
  193,
  229,
  149,
  255,
  192,
  228,
  147,
  255,
  190,
  227,
  144,
  255,
  188,
  226,
  141,
  255,
  186,
  226,
  138,
  255,
  184,
  225,
  135,
  255,
  182,
  224,
  132,
  255,
  180,
  222,
  129,
  255,
  178,
  221,
  127,
  255,
  176,
  219,
  124,
  255,
  173,
  218,
  121,
  255,
  171,
  217,
  119,
  255,
  169,
  215,
  116,
  255,
  167,
  214,
  113,
  255,
  165,
  212,
  111,
  255,
  162,
  211,
  108,
  255,
  160,
  209,
  105,
  255,
  158,
  208,
  102,
  255,
  156,
  206,
  100,
  255,
  153,
  205,
  97,
  255,
  151,
  203,
  94,
  255,
  149,
  202,
  92,
  255,
  147,
  201,
  89,
  255,
  144,
  199,
  86,
  255,
  142,
  198,
  83,
  255,
  140,
  196,
  81,
  255,
  138,
  195,
  78,
  255,
  135,
  193,
  75,
  255,
  133,
  192,
  73,
  255,
  131,
  190,
  70,
  255,
  129,
  189,
  67,
  255,
  127,
  188,
  65,
  255,
  125,
  186,
  63,
  255,
  123,
  184,
  62,
  255,
  121,
  183,
  61,
  255,
  119,
  181,
  59,
  255,
  117,
  179,
  58,
  255,
  115,
  178,
  57,
  255,
  113,
  176,
  56,
  255,
  111,
  174,
  54,
  255,
  109,
  173,
  53,
  255,
  107,
  171,
  52,
  255,
  105,
  169,
  51,
  255,
  103,
  168,
  49,
  255,
  101,
  166,
  48,
  255,
  99,
  164,
  47,
  255,
  97,
  163,
  46,
  255,
  95,
  161,
  44,
  255,
  93,
  160,
  43,
  255,
  91,
  158,
  42,
  255,
  89,
  156,
  41,
  255,
  87,
  155,
  39,
  255,
  85,
  153,
  38,
  255,
  83,
  151,
  37,
  255,
  81,
  150,
  36,
  255,
  79,
  148,
  34,
  255,
  77,
  146,
  33,
  255,
  76,
  145,
  32,
  255,
  74,
  143,
  32,
  255,
  73,
  141,
  32,
  255,
  71,
  139,
  31,
  255,
  70,
  137,
  31,
  255,
  68,
  136,
  31,
  255,
  67,
  134,
  30,
  255,
  65,
  132,
  30,
  255,
  64,
  130,
  30,
  255,
  62,
  128,
  30,
  255,
  61,
  127,
  29,
  255,
  59,
  125,
  29,
  255,
  58,
  123,
  29,
  255,
  56,
  121,
  28,
  255,
  55,
  119,
  28,
  255,
  53,
  118,
  28,
  255,
  52,
  116,
  27,
  255,
  50,
  114,
  27,
  255,
  49,
  112,
  27,
  255,
  47,
  110,
  26,
  255,
  46,
  109,
  26,
  255,
  44,
  107,
  26,
  255,
  43,
  105,
  25,
  255,
  41,
  103,
  25,
  255,
  40,
  101,
  25,
  255,
  39,
  100,
  25,
  255
]);
var _INFERNO = new Uint8Array([
  0,
  0,
  3,
  255,
  0,
  0,
  4,
  255,
  0,
  0,
  6,
  255,
  1,
  0,
  7,
  255,
  1,
  1,
  9,
  255,
  1,
  1,
  11,
  255,
  2,
  1,
  14,
  255,
  2,
  2,
  16,
  255,
  3,
  2,
  18,
  255,
  4,
  3,
  20,
  255,
  4,
  3,
  22,
  255,
  5,
  4,
  24,
  255,
  6,
  4,
  27,
  255,
  7,
  5,
  29,
  255,
  8,
  6,
  31,
  255,
  9,
  6,
  33,
  255,
  10,
  7,
  35,
  255,
  11,
  7,
  38,
  255,
  13,
  8,
  40,
  255,
  14,
  8,
  42,
  255,
  15,
  9,
  45,
  255,
  16,
  9,
  47,
  255,
  18,
  10,
  50,
  255,
  19,
  10,
  52,
  255,
  20,
  11,
  54,
  255,
  22,
  11,
  57,
  255,
  23,
  11,
  59,
  255,
  25,
  11,
  62,
  255,
  26,
  11,
  64,
  255,
  28,
  12,
  67,
  255,
  29,
  12,
  69,
  255,
  31,
  12,
  71,
  255,
  32,
  12,
  74,
  255,
  34,
  11,
  76,
  255,
  36,
  11,
  78,
  255,
  38,
  11,
  80,
  255,
  39,
  11,
  82,
  255,
  41,
  11,
  84,
  255,
  43,
  10,
  86,
  255,
  45,
  10,
  88,
  255,
  46,
  10,
  90,
  255,
  48,
  10,
  92,
  255,
  50,
  9,
  93,
  255,
  52,
  9,
  95,
  255,
  53,
  9,
  96,
  255,
  55,
  9,
  97,
  255,
  57,
  9,
  98,
  255,
  59,
  9,
  100,
  255,
  60,
  9,
  101,
  255,
  62,
  9,
  102,
  255,
  64,
  9,
  102,
  255,
  65,
  9,
  103,
  255,
  67,
  10,
  104,
  255,
  69,
  10,
  105,
  255,
  70,
  10,
  105,
  255,
  72,
  11,
  106,
  255,
  74,
  11,
  106,
  255,
  75,
  12,
  107,
  255,
  77,
  12,
  107,
  255,
  79,
  13,
  108,
  255,
  80,
  13,
  108,
  255,
  82,
  14,
  108,
  255,
  83,
  14,
  109,
  255,
  85,
  15,
  109,
  255,
  87,
  15,
  109,
  255,
  88,
  16,
  109,
  255,
  90,
  17,
  109,
  255,
  91,
  17,
  110,
  255,
  93,
  18,
  110,
  255,
  95,
  18,
  110,
  255,
  96,
  19,
  110,
  255,
  98,
  20,
  110,
  255,
  99,
  20,
  110,
  255,
  101,
  21,
  110,
  255,
  102,
  21,
  110,
  255,
  104,
  22,
  110,
  255,
  106,
  23,
  110,
  255,
  107,
  23,
  110,
  255,
  109,
  24,
  110,
  255,
  110,
  24,
  110,
  255,
  112,
  25,
  110,
  255,
  114,
  25,
  109,
  255,
  115,
  26,
  109,
  255,
  117,
  27,
  109,
  255,
  118,
  27,
  109,
  255,
  120,
  28,
  109,
  255,
  122,
  28,
  109,
  255,
  123,
  29,
  108,
  255,
  125,
  29,
  108,
  255,
  126,
  30,
  108,
  255,
  128,
  31,
  107,
  255,
  129,
  31,
  107,
  255,
  131,
  32,
  107,
  255,
  133,
  32,
  106,
  255,
  134,
  33,
  106,
  255,
  136,
  33,
  106,
  255,
  137,
  34,
  105,
  255,
  139,
  34,
  105,
  255,
  141,
  35,
  105,
  255,
  142,
  36,
  104,
  255,
  144,
  36,
  104,
  255,
  145,
  37,
  103,
  255,
  147,
  37,
  103,
  255,
  149,
  38,
  102,
  255,
  150,
  38,
  102,
  255,
  152,
  39,
  101,
  255,
  153,
  40,
  100,
  255,
  155,
  40,
  100,
  255,
  156,
  41,
  99,
  255,
  158,
  41,
  99,
  255,
  160,
  42,
  98,
  255,
  161,
  43,
  97,
  255,
  163,
  43,
  97,
  255,
  164,
  44,
  96,
  255,
  166,
  44,
  95,
  255,
  167,
  45,
  95,
  255,
  169,
  46,
  94,
  255,
  171,
  46,
  93,
  255,
  172,
  47,
  92,
  255,
  174,
  48,
  91,
  255,
  175,
  49,
  91,
  255,
  177,
  49,
  90,
  255,
  178,
  50,
  89,
  255,
  180,
  51,
  88,
  255,
  181,
  51,
  87,
  255,
  183,
  52,
  86,
  255,
  184,
  53,
  86,
  255,
  186,
  54,
  85,
  255,
  187,
  55,
  84,
  255,
  189,
  55,
  83,
  255,
  190,
  56,
  82,
  255,
  191,
  57,
  81,
  255,
  193,
  58,
  80,
  255,
  194,
  59,
  79,
  255,
  196,
  60,
  78,
  255,
  197,
  61,
  77,
  255,
  199,
  62,
  76,
  255,
  200,
  62,
  75,
  255,
  201,
  63,
  74,
  255,
  203,
  64,
  73,
  255,
  204,
  65,
  72,
  255,
  205,
  66,
  71,
  255,
  207,
  68,
  70,
  255,
  208,
  69,
  68,
  255,
  209,
  70,
  67,
  255,
  210,
  71,
  66,
  255,
  212,
  72,
  65,
  255,
  213,
  73,
  64,
  255,
  214,
  74,
  63,
  255,
  215,
  75,
  62,
  255,
  217,
  77,
  61,
  255,
  218,
  78,
  59,
  255,
  219,
  79,
  58,
  255,
  220,
  80,
  57,
  255,
  221,
  82,
  56,
  255,
  222,
  83,
  55,
  255,
  223,
  84,
  54,
  255,
  224,
  86,
  52,
  255,
  226,
  87,
  51,
  255,
  227,
  88,
  50,
  255,
  228,
  90,
  49,
  255,
  229,
  91,
  48,
  255,
  230,
  92,
  46,
  255,
  230,
  94,
  45,
  255,
  231,
  95,
  44,
  255,
  232,
  97,
  43,
  255,
  233,
  98,
  42,
  255,
  234,
  100,
  40,
  255,
  235,
  101,
  39,
  255,
  236,
  103,
  38,
  255,
  237,
  104,
  37,
  255,
  237,
  106,
  35,
  255,
  238,
  108,
  34,
  255,
  239,
  109,
  33,
  255,
  240,
  111,
  31,
  255,
  240,
  112,
  30,
  255,
  241,
  114,
  29,
  255,
  242,
  116,
  28,
  255,
  242,
  117,
  26,
  255,
  243,
  119,
  25,
  255,
  243,
  121,
  24,
  255,
  244,
  122,
  22,
  255,
  245,
  124,
  21,
  255,
  245,
  126,
  20,
  255,
  246,
  128,
  18,
  255,
  246,
  129,
  17,
  255,
  247,
  131,
  16,
  255,
  247,
  133,
  14,
  255,
  248,
  135,
  13,
  255,
  248,
  136,
  12,
  255,
  248,
  138,
  11,
  255,
  249,
  140,
  9,
  255,
  249,
  142,
  8,
  255,
  249,
  144,
  8,
  255,
  250,
  145,
  7,
  255,
  250,
  147,
  6,
  255,
  250,
  149,
  6,
  255,
  250,
  151,
  6,
  255,
  251,
  153,
  6,
  255,
  251,
  155,
  6,
  255,
  251,
  157,
  6,
  255,
  251,
  158,
  7,
  255,
  251,
  160,
  7,
  255,
  251,
  162,
  8,
  255,
  251,
  164,
  10,
  255,
  251,
  166,
  11,
  255,
  251,
  168,
  13,
  255,
  251,
  170,
  14,
  255,
  251,
  172,
  16,
  255,
  251,
  174,
  18,
  255,
  251,
  176,
  20,
  255,
  251,
  177,
  22,
  255,
  251,
  179,
  24,
  255,
  251,
  181,
  26,
  255,
  251,
  183,
  28,
  255,
  251,
  185,
  30,
  255,
  250,
  187,
  33,
  255,
  250,
  189,
  35,
  255,
  250,
  191,
  37,
  255,
  250,
  193,
  40,
  255,
  249,
  195,
  42,
  255,
  249,
  197,
  44,
  255,
  249,
  199,
  47,
  255,
  248,
  201,
  49,
  255,
  248,
  203,
  52,
  255,
  248,
  205,
  55,
  255,
  247,
  207,
  58,
  255,
  247,
  209,
  60,
  255,
  246,
  211,
  63,
  255,
  246,
  213,
  66,
  255,
  245,
  215,
  69,
  255,
  245,
  217,
  72,
  255,
  244,
  219,
  75,
  255,
  244,
  220,
  79,
  255,
  243,
  222,
  82,
  255,
  243,
  224,
  86,
  255,
  243,
  226,
  89,
  255,
  242,
  228,
  93,
  255,
  242,
  230,
  96,
  255,
  241,
  232,
  100,
  255,
  241,
  233,
  104,
  255,
  241,
  235,
  108,
  255,
  241,
  237,
  112,
  255,
  241,
  238,
  116,
  255,
  241,
  240,
  121,
  255,
  241,
  242,
  125,
  255,
  242,
  243,
  129,
  255,
  242,
  244,
  133,
  255,
  243,
  246,
  137,
  255,
  244,
  247,
  141,
  255,
  245,
  248,
  145,
  255,
  246,
  250,
  149,
  255,
  247,
  251,
  153,
  255,
  249,
  252,
  157,
  255,
  250,
  253,
  160,
  255,
  252,
  254,
  164,
  255
]);
var _PLASMA = new Uint8Array([
  12,
  7,
  134,
  255,
  16,
  7,
  135,
  255,
  19,
  6,
  137,
  255,
  21,
  6,
  138,
  255,
  24,
  6,
  139,
  255,
  27,
  6,
  140,
  255,
  29,
  6,
  141,
  255,
  31,
  5,
  142,
  255,
  33,
  5,
  143,
  255,
  35,
  5,
  144,
  255,
  37,
  5,
  145,
  255,
  39,
  5,
  146,
  255,
  41,
  5,
  147,
  255,
  43,
  5,
  148,
  255,
  45,
  4,
  148,
  255,
  47,
  4,
  149,
  255,
  49,
  4,
  150,
  255,
  51,
  4,
  151,
  255,
  52,
  4,
  152,
  255,
  54,
  4,
  152,
  255,
  56,
  4,
  153,
  255,
  58,
  4,
  154,
  255,
  59,
  3,
  154,
  255,
  61,
  3,
  155,
  255,
  63,
  3,
  156,
  255,
  64,
  3,
  156,
  255,
  66,
  3,
  157,
  255,
  68,
  3,
  158,
  255,
  69,
  3,
  158,
  255,
  71,
  2,
  159,
  255,
  73,
  2,
  159,
  255,
  74,
  2,
  160,
  255,
  76,
  2,
  161,
  255,
  78,
  2,
  161,
  255,
  79,
  2,
  162,
  255,
  81,
  1,
  162,
  255,
  82,
  1,
  163,
  255,
  84,
  1,
  163,
  255,
  86,
  1,
  163,
  255,
  87,
  1,
  164,
  255,
  89,
  1,
  164,
  255,
  90,
  0,
  165,
  255,
  92,
  0,
  165,
  255,
  94,
  0,
  165,
  255,
  95,
  0,
  166,
  255,
  97,
  0,
  166,
  255,
  98,
  0,
  166,
  255,
  100,
  0,
  167,
  255,
  101,
  0,
  167,
  255,
  103,
  0,
  167,
  255,
  104,
  0,
  167,
  255,
  106,
  0,
  167,
  255,
  108,
  0,
  168,
  255,
  109,
  0,
  168,
  255,
  111,
  0,
  168,
  255,
  112,
  0,
  168,
  255,
  114,
  0,
  168,
  255,
  115,
  0,
  168,
  255,
  117,
  0,
  168,
  255,
  118,
  1,
  168,
  255,
  120,
  1,
  168,
  255,
  121,
  1,
  168,
  255,
  123,
  2,
  168,
  255,
  124,
  2,
  167,
  255,
  126,
  3,
  167,
  255,
  127,
  3,
  167,
  255,
  129,
  4,
  167,
  255,
  130,
  4,
  167,
  255,
  132,
  5,
  166,
  255,
  133,
  6,
  166,
  255,
  134,
  7,
  166,
  255,
  136,
  7,
  165,
  255,
  137,
  8,
  165,
  255,
  139,
  9,
  164,
  255,
  140,
  10,
  164,
  255,
  142,
  12,
  164,
  255,
  143,
  13,
  163,
  255,
  144,
  14,
  163,
  255,
  146,
  15,
  162,
  255,
  147,
  16,
  161,
  255,
  149,
  17,
  161,
  255,
  150,
  18,
  160,
  255,
  151,
  19,
  160,
  255,
  153,
  20,
  159,
  255,
  154,
  21,
  158,
  255,
  155,
  23,
  158,
  255,
  157,
  24,
  157,
  255,
  158,
  25,
  156,
  255,
  159,
  26,
  155,
  255,
  160,
  27,
  155,
  255,
  162,
  28,
  154,
  255,
  163,
  29,
  153,
  255,
  164,
  30,
  152,
  255,
  165,
  31,
  151,
  255,
  167,
  33,
  151,
  255,
  168,
  34,
  150,
  255,
  169,
  35,
  149,
  255,
  170,
  36,
  148,
  255,
  172,
  37,
  147,
  255,
  173,
  38,
  146,
  255,
  174,
  39,
  145,
  255,
  175,
  40,
  144,
  255,
  176,
  42,
  143,
  255,
  177,
  43,
  143,
  255,
  178,
  44,
  142,
  255,
  180,
  45,
  141,
  255,
  181,
  46,
  140,
  255,
  182,
  47,
  139,
  255,
  183,
  48,
  138,
  255,
  184,
  50,
  137,
  255,
  185,
  51,
  136,
  255,
  186,
  52,
  135,
  255,
  187,
  53,
  134,
  255,
  188,
  54,
  133,
  255,
  189,
  55,
  132,
  255,
  190,
  56,
  131,
  255,
  191,
  57,
  130,
  255,
  192,
  59,
  129,
  255,
  193,
  60,
  128,
  255,
  194,
  61,
  128,
  255,
  195,
  62,
  127,
  255,
  196,
  63,
  126,
  255,
  197,
  64,
  125,
  255,
  198,
  65,
  124,
  255,
  199,
  66,
  123,
  255,
  200,
  68,
  122,
  255,
  201,
  69,
  121,
  255,
  202,
  70,
  120,
  255,
  203,
  71,
  119,
  255,
  204,
  72,
  118,
  255,
  205,
  73,
  117,
  255,
  206,
  74,
  117,
  255,
  207,
  75,
  116,
  255,
  208,
  77,
  115,
  255,
  209,
  78,
  114,
  255,
  209,
  79,
  113,
  255,
  210,
  80,
  112,
  255,
  211,
  81,
  111,
  255,
  212,
  82,
  110,
  255,
  213,
  83,
  109,
  255,
  214,
  85,
  109,
  255,
  215,
  86,
  108,
  255,
  215,
  87,
  107,
  255,
  216,
  88,
  106,
  255,
  217,
  89,
  105,
  255,
  218,
  90,
  104,
  255,
  219,
  91,
  103,
  255,
  220,
  93,
  102,
  255,
  220,
  94,
  102,
  255,
  221,
  95,
  101,
  255,
  222,
  96,
  100,
  255,
  223,
  97,
  99,
  255,
  223,
  98,
  98,
  255,
  224,
  100,
  97,
  255,
  225,
  101,
  96,
  255,
  226,
  102,
  96,
  255,
  227,
  103,
  95,
  255,
  227,
  104,
  94,
  255,
  228,
  106,
  93,
  255,
  229,
  107,
  92,
  255,
  229,
  108,
  91,
  255,
  230,
  109,
  90,
  255,
  231,
  110,
  90,
  255,
  232,
  112,
  89,
  255,
  232,
  113,
  88,
  255,
  233,
  114,
  87,
  255,
  234,
  115,
  86,
  255,
  234,
  116,
  85,
  255,
  235,
  118,
  84,
  255,
  236,
  119,
  84,
  255,
  236,
  120,
  83,
  255,
  237,
  121,
  82,
  255,
  237,
  123,
  81,
  255,
  238,
  124,
  80,
  255,
  239,
  125,
  79,
  255,
  239,
  126,
  78,
  255,
  240,
  128,
  77,
  255,
  240,
  129,
  77,
  255,
  241,
  130,
  76,
  255,
  242,
  132,
  75,
  255,
  242,
  133,
  74,
  255,
  243,
  134,
  73,
  255,
  243,
  135,
  72,
  255,
  244,
  137,
  71,
  255,
  244,
  138,
  71,
  255,
  245,
  139,
  70,
  255,
  245,
  141,
  69,
  255,
  246,
  142,
  68,
  255,
  246,
  143,
  67,
  255,
  246,
  145,
  66,
  255,
  247,
  146,
  65,
  255,
  247,
  147,
  65,
  255,
  248,
  149,
  64,
  255,
  248,
  150,
  63,
  255,
  248,
  152,
  62,
  255,
  249,
  153,
  61,
  255,
  249,
  154,
  60,
  255,
  250,
  156,
  59,
  255,
  250,
  157,
  58,
  255,
  250,
  159,
  58,
  255,
  250,
  160,
  57,
  255,
  251,
  162,
  56,
  255,
  251,
  163,
  55,
  255,
  251,
  164,
  54,
  255,
  252,
  166,
  53,
  255,
  252,
  167,
  53,
  255,
  252,
  169,
  52,
  255,
  252,
  170,
  51,
  255,
  252,
  172,
  50,
  255,
  252,
  173,
  49,
  255,
  253,
  175,
  49,
  255,
  253,
  176,
  48,
  255,
  253,
  178,
  47,
  255,
  253,
  179,
  46,
  255,
  253,
  181,
  45,
  255,
  253,
  182,
  45,
  255,
  253,
  184,
  44,
  255,
  253,
  185,
  43,
  255,
  253,
  187,
  43,
  255,
  253,
  188,
  42,
  255,
  253,
  190,
  41,
  255,
  253,
  192,
  41,
  255,
  253,
  193,
  40,
  255,
  253,
  195,
  40,
  255,
  253,
  196,
  39,
  255,
  253,
  198,
  38,
  255,
  252,
  199,
  38,
  255,
  252,
  201,
  38,
  255,
  252,
  203,
  37,
  255,
  252,
  204,
  37,
  255,
  252,
  206,
  37,
  255,
  251,
  208,
  36,
  255,
  251,
  209,
  36,
  255,
  251,
  211,
  36,
  255,
  250,
  213,
  36,
  255,
  250,
  214,
  36,
  255,
  250,
  216,
  36,
  255,
  249,
  217,
  36,
  255,
  249,
  219,
  36,
  255,
  248,
  221,
  36,
  255,
  248,
  223,
  36,
  255,
  247,
  224,
  36,
  255,
  247,
  226,
  37,
  255,
  246,
  228,
  37,
  255,
  246,
  229,
  37,
  255,
  245,
  231,
  38,
  255,
  245,
  233,
  38,
  255,
  244,
  234,
  38,
  255,
  243,
  236,
  38,
  255,
  243,
  238,
  38,
  255,
  242,
  240,
  38,
  255,
  242,
  241,
  38,
  255,
  241,
  243,
  38,
  255,
  240,
  245,
  37,
  255,
  240,
  246,
  35,
  255,
  239,
  248,
  33,
  255
]);
var _HOT = new Uint8Array([
  10,
  0,
  0,
  255,
  13,
  0,
  0,
  255,
  15,
  0,
  0,
  255,
  18,
  0,
  0,
  255,
  21,
  0,
  0,
  255,
  23,
  0,
  0,
  255,
  26,
  0,
  0,
  255,
  28,
  0,
  0,
  255,
  31,
  0,
  0,
  255,
  34,
  0,
  0,
  255,
  36,
  0,
  0,
  255,
  39,
  0,
  0,
  255,
  42,
  0,
  0,
  255,
  44,
  0,
  0,
  255,
  47,
  0,
  0,
  255,
  49,
  0,
  0,
  255,
  52,
  0,
  0,
  255,
  55,
  0,
  0,
  255,
  57,
  0,
  0,
  255,
  60,
  0,
  0,
  255,
  63,
  0,
  0,
  255,
  65,
  0,
  0,
  255,
  68,
  0,
  0,
  255,
  70,
  0,
  0,
  255,
  73,
  0,
  0,
  255,
  76,
  0,
  0,
  255,
  78,
  0,
  0,
  255,
  81,
  0,
  0,
  255,
  84,
  0,
  0,
  255,
  86,
  0,
  0,
  255,
  89,
  0,
  0,
  255,
  91,
  0,
  0,
  255,
  94,
  0,
  0,
  255,
  97,
  0,
  0,
  255,
  99,
  0,
  0,
  255,
  102,
  0,
  0,
  255,
  105,
  0,
  0,
  255,
  107,
  0,
  0,
  255,
  110,
  0,
  0,
  255,
  112,
  0,
  0,
  255,
  115,
  0,
  0,
  255,
  118,
  0,
  0,
  255,
  120,
  0,
  0,
  255,
  123,
  0,
  0,
  255,
  126,
  0,
  0,
  255,
  128,
  0,
  0,
  255,
  131,
  0,
  0,
  255,
  133,
  0,
  0,
  255,
  136,
  0,
  0,
  255,
  139,
  0,
  0,
  255,
  141,
  0,
  0,
  255,
  144,
  0,
  0,
  255,
  147,
  0,
  0,
  255,
  149,
  0,
  0,
  255,
  152,
  0,
  0,
  255,
  154,
  0,
  0,
  255,
  157,
  0,
  0,
  255,
  160,
  0,
  0,
  255,
  162,
  0,
  0,
  255,
  165,
  0,
  0,
  255,
  168,
  0,
  0,
  255,
  170,
  0,
  0,
  255,
  173,
  0,
  0,
  255,
  175,
  0,
  0,
  255,
  178,
  0,
  0,
  255,
  181,
  0,
  0,
  255,
  183,
  0,
  0,
  255,
  186,
  0,
  0,
  255,
  189,
  0,
  0,
  255,
  191,
  0,
  0,
  255,
  194,
  0,
  0,
  255,
  196,
  0,
  0,
  255,
  199,
  0,
  0,
  255,
  202,
  0,
  0,
  255,
  204,
  0,
  0,
  255,
  207,
  0,
  0,
  255,
  210,
  0,
  0,
  255,
  212,
  0,
  0,
  255,
  215,
  0,
  0,
  255,
  217,
  0,
  0,
  255,
  220,
  0,
  0,
  255,
  223,
  0,
  0,
  255,
  225,
  0,
  0,
  255,
  228,
  0,
  0,
  255,
  231,
  0,
  0,
  255,
  233,
  0,
  0,
  255,
  236,
  0,
  0,
  255,
  238,
  0,
  0,
  255,
  241,
  0,
  0,
  255,
  244,
  0,
  0,
  255,
  246,
  0,
  0,
  255,
  249,
  0,
  0,
  255,
  252,
  0,
  0,
  255,
  254,
  0,
  0,
  255,
  255,
  2,
  0,
  255,
  255,
  5,
  0,
  255,
  255,
  7,
  0,
  255,
  255,
  10,
  0,
  255,
  255,
  12,
  0,
  255,
  255,
  15,
  0,
  255,
  255,
  18,
  0,
  255,
  255,
  20,
  0,
  255,
  255,
  23,
  0,
  255,
  255,
  26,
  0,
  255,
  255,
  28,
  0,
  255,
  255,
  31,
  0,
  255,
  255,
  33,
  0,
  255,
  255,
  36,
  0,
  255,
  255,
  39,
  0,
  255,
  255,
  41,
  0,
  255,
  255,
  44,
  0,
  255,
  255,
  47,
  0,
  255,
  255,
  49,
  0,
  255,
  255,
  52,
  0,
  255,
  255,
  54,
  0,
  255,
  255,
  57,
  0,
  255,
  255,
  60,
  0,
  255,
  255,
  62,
  0,
  255,
  255,
  65,
  0,
  255,
  255,
  68,
  0,
  255,
  255,
  70,
  0,
  255,
  255,
  73,
  0,
  255,
  255,
  75,
  0,
  255,
  255,
  78,
  0,
  255,
  255,
  81,
  0,
  255,
  255,
  83,
  0,
  255,
  255,
  86,
  0,
  255,
  255,
  89,
  0,
  255,
  255,
  91,
  0,
  255,
  255,
  94,
  0,
  255,
  255,
  96,
  0,
  255,
  255,
  99,
  0,
  255,
  255,
  102,
  0,
  255,
  255,
  104,
  0,
  255,
  255,
  107,
  0,
  255,
  255,
  110,
  0,
  255,
  255,
  112,
  0,
  255,
  255,
  115,
  0,
  255,
  255,
  117,
  0,
  255,
  255,
  120,
  0,
  255,
  255,
  123,
  0,
  255,
  255,
  125,
  0,
  255,
  255,
  128,
  0,
  255,
  255,
  131,
  0,
  255,
  255,
  133,
  0,
  255,
  255,
  136,
  0,
  255,
  255,
  138,
  0,
  255,
  255,
  141,
  0,
  255,
  255,
  144,
  0,
  255,
  255,
  146,
  0,
  255,
  255,
  149,
  0,
  255,
  255,
  151,
  0,
  255,
  255,
  154,
  0,
  255,
  255,
  157,
  0,
  255,
  255,
  159,
  0,
  255,
  255,
  162,
  0,
  255,
  255,
  165,
  0,
  255,
  255,
  167,
  0,
  255,
  255,
  170,
  0,
  255,
  255,
  172,
  0,
  255,
  255,
  175,
  0,
  255,
  255,
  178,
  0,
  255,
  255,
  180,
  0,
  255,
  255,
  183,
  0,
  255,
  255,
  186,
  0,
  255,
  255,
  188,
  0,
  255,
  255,
  191,
  0,
  255,
  255,
  193,
  0,
  255,
  255,
  196,
  0,
  255,
  255,
  199,
  0,
  255,
  255,
  201,
  0,
  255,
  255,
  204,
  0,
  255,
  255,
  207,
  0,
  255,
  255,
  209,
  0,
  255,
  255,
  212,
  0,
  255,
  255,
  214,
  0,
  255,
  255,
  217,
  0,
  255,
  255,
  220,
  0,
  255,
  255,
  222,
  0,
  255,
  255,
  225,
  0,
  255,
  255,
  228,
  0,
  255,
  255,
  230,
  0,
  255,
  255,
  233,
  0,
  255,
  255,
  235,
  0,
  255,
  255,
  238,
  0,
  255,
  255,
  241,
  0,
  255,
  255,
  243,
  0,
  255,
  255,
  246,
  0,
  255,
  255,
  249,
  0,
  255,
  255,
  251,
  0,
  255,
  255,
  254,
  0,
  255,
  255,
  255,
  2,
  255,
  255,
  255,
  6,
  255,
  255,
  255,
  10,
  255,
  255,
  255,
  14,
  255,
  255,
  255,
  18,
  255,
  255,
  255,
  22,
  255,
  255,
  255,
  26,
  255,
  255,
  255,
  30,
  255,
  255,
  255,
  34,
  255,
  255,
  255,
  38,
  255,
  255,
  255,
  42,
  255,
  255,
  255,
  46,
  255,
  255,
  255,
  50,
  255,
  255,
  255,
  54,
  255,
  255,
  255,
  58,
  255,
  255,
  255,
  62,
  255,
  255,
  255,
  65,
  255,
  255,
  255,
  69,
  255,
  255,
  255,
  73,
  255,
  255,
  255,
  77,
  255,
  255,
  255,
  81,
  255,
  255,
  255,
  85,
  255,
  255,
  255,
  89,
  255,
  255,
  255,
  93,
  255,
  255,
  255,
  97,
  255,
  255,
  255,
  101,
  255,
  255,
  255,
  105,
  255,
  255,
  255,
  109,
  255,
  255,
  255,
  113,
  255,
  255,
  255,
  117,
  255,
  255,
  255,
  121,
  255,
  255,
  255,
  125,
  255,
  255,
  255,
  128,
  255,
  255,
  255,
  132,
  255,
  255,
  255,
  136,
  255,
  255,
  255,
  140,
  255,
  255,
  255,
  144,
  255,
  255,
  255,
  148,
  255,
  255,
  255,
  152,
  255,
  255,
  255,
  156,
  255,
  255,
  255,
  160,
  255,
  255,
  255,
  164,
  255,
  255,
  255,
  168,
  255,
  255,
  255,
  172,
  255,
  255,
  255,
  176,
  255,
  255,
  255,
  180,
  255,
  255,
  255,
  184,
  255,
  255,
  255,
  188,
  255,
  255,
  255,
  191,
  255,
  255,
  255,
  195,
  255,
  255,
  255,
  199,
  255,
  255,
  255,
  203,
  255,
  255,
  255,
  207,
  255,
  255,
  255,
  211,
  255,
  255,
  255,
  215,
  255,
  255,
  255,
  219,
  255,
  255,
  255,
  223,
  255,
  255,
  255,
  227,
  255,
  255,
  255,
  231,
  255,
  255,
  255,
  235,
  255,
  255,
  255,
  239,
  255,
  255,
  255,
  243,
  255,
  255,
  255,
  247,
  255,
  255,
  255,
  251,
  255,
  255,
  255,
  255,
  255
]);
var _COOLWARM = new Uint8Array([
  58,
  76,
  192,
  255,
  59,
  77,
  193,
  255,
  60,
  79,
  195,
  255,
  62,
  81,
  196,
  255,
  63,
  83,
  198,
  255,
  64,
  84,
  199,
  255,
  65,
  86,
  201,
  255,
  66,
  88,
  202,
  255,
  67,
  90,
  204,
  255,
  69,
  91,
  205,
  255,
  70,
  93,
  207,
  255,
  71,
  95,
  208,
  255,
  72,
  96,
  209,
  255,
  73,
  98,
  211,
  255,
  75,
  100,
  212,
  255,
  76,
  102,
  214,
  255,
  77,
  103,
  215,
  255,
  78,
  105,
  216,
  255,
  80,
  107,
  218,
  255,
  81,
  108,
  219,
  255,
  82,
  110,
  220,
  255,
  83,
  112,
  221,
  255,
  85,
  113,
  222,
  255,
  86,
  115,
  224,
  255,
  87,
  117,
  225,
  255,
  88,
  118,
  226,
  255,
  90,
  120,
  227,
  255,
  91,
  121,
  228,
  255,
  92,
  123,
  229,
  255,
  93,
  125,
  230,
  255,
  95,
  126,
  231,
  255,
  96,
  128,
  232,
  255,
  97,
  130,
  234,
  255,
  99,
  131,
  234,
  255,
  100,
  133,
  235,
  255,
  101,
  134,
  236,
  255,
  103,
  136,
  237,
  255,
  104,
  137,
  238,
  255,
  105,
  139,
  239,
  255,
  107,
  141,
  240,
  255,
  108,
  142,
  241,
  255,
  109,
  144,
  241,
  255,
  111,
  145,
  242,
  255,
  112,
  147,
  243,
  255,
  113,
  148,
  244,
  255,
  115,
  149,
  244,
  255,
  116,
  151,
  245,
  255,
  117,
  152,
  246,
  255,
  119,
  154,
  246,
  255,
  120,
  155,
  247,
  255,
  122,
  157,
  248,
  255,
  123,
  158,
  248,
  255,
  124,
  160,
  249,
  255,
  126,
  161,
  249,
  255,
  127,
  162,
  250,
  255,
  128,
  164,
  250,
  255,
  130,
  165,
  251,
  255,
  131,
  166,
  251,
  255,
  133,
  168,
  251,
  255,
  134,
  169,
  252,
  255,
  135,
  170,
  252,
  255,
  137,
  172,
  252,
  255,
  138,
  173,
  253,
  255,
  139,
  174,
  253,
  255,
  141,
  175,
  253,
  255,
  142,
  177,
  253,
  255,
  144,
  178,
  254,
  255,
  145,
  179,
  254,
  255,
  146,
  180,
  254,
  255,
  148,
  181,
  254,
  255,
  149,
  183,
  254,
  255,
  151,
  184,
  254,
  255,
  152,
  185,
  254,
  255,
  153,
  186,
  254,
  255,
  155,
  187,
  254,
  255,
  156,
  188,
  254,
  255,
  157,
  189,
  254,
  255,
  159,
  190,
  254,
  255,
  160,
  191,
  254,
  255,
  162,
  192,
  254,
  255,
  163,
  193,
  254,
  255,
  164,
  194,
  254,
  255,
  166,
  195,
  253,
  255,
  167,
  196,
  253,
  255,
  168,
  197,
  253,
  255,
  170,
  198,
  253,
  255,
  171,
  199,
  252,
  255,
  172,
  200,
  252,
  255,
  174,
  201,
  252,
  255,
  175,
  202,
  251,
  255,
  176,
  203,
  251,
  255,
  178,
  203,
  251,
  255,
  179,
  204,
  250,
  255,
  180,
  205,
  250,
  255,
  182,
  206,
  249,
  255,
  183,
  207,
  249,
  255,
  184,
  207,
  248,
  255,
  185,
  208,
  248,
  255,
  187,
  209,
  247,
  255,
  188,
  209,
  246,
  255,
  189,
  210,
  246,
  255,
  190,
  211,
  245,
  255,
  192,
  211,
  245,
  255,
  193,
  212,
  244,
  255,
  194,
  212,
  243,
  255,
  195,
  213,
  242,
  255,
  197,
  213,
  242,
  255,
  198,
  214,
  241,
  255,
  199,
  214,
  240,
  255,
  200,
  215,
  239,
  255,
  201,
  215,
  238,
  255,
  202,
  216,
  238,
  255,
  204,
  216,
  237,
  255,
  205,
  217,
  236,
  255,
  206,
  217,
  235,
  255,
  207,
  217,
  234,
  255,
  208,
  218,
  233,
  255,
  209,
  218,
  232,
  255,
  210,
  218,
  231,
  255,
  211,
  219,
  230,
  255,
  213,
  219,
  229,
  255,
  214,
  219,
  228,
  255,
  215,
  219,
  226,
  255,
  216,
  219,
  225,
  255,
  217,
  220,
  224,
  255,
  218,
  220,
  223,
  255,
  219,
  220,
  222,
  255,
  220,
  220,
  221,
  255,
  221,
  220,
  219,
  255,
  222,
  219,
  218,
  255,
  223,
  219,
  217,
  255,
  224,
  218,
  215,
  255,
  225,
  218,
  214,
  255,
  226,
  217,
  212,
  255,
  227,
  217,
  211,
  255,
  228,
  216,
  209,
  255,
  229,
  216,
  208,
  255,
  230,
  215,
  207,
  255,
  231,
  214,
  205,
  255,
  231,
  214,
  204,
  255,
  232,
  213,
  202,
  255,
  233,
  212,
  201,
  255,
  234,
  211,
  199,
  255,
  235,
  211,
  198,
  255,
  236,
  210,
  196,
  255,
  236,
  209,
  195,
  255,
  237,
  208,
  193,
  255,
  237,
  207,
  192,
  255,
  238,
  207,
  190,
  255,
  239,
  206,
  188,
  255,
  239,
  205,
  187,
  255,
  240,
  204,
  185,
  255,
  241,
  203,
  184,
  255,
  241,
  202,
  182,
  255,
  242,
  201,
  181,
  255,
  242,
  200,
  179,
  255,
  242,
  199,
  178,
  255,
  243,
  198,
  176,
  255,
  243,
  197,
  175,
  255,
  244,
  196,
  173,
  255,
  244,
  195,
  171,
  255,
  244,
  194,
  170,
  255,
  245,
  193,
  168,
  255,
  245,
  192,
  167,
  255,
  245,
  191,
  165,
  255,
  246,
  189,
  164,
  255,
  246,
  188,
  162,
  255,
  246,
  187,
  160,
  255,
  246,
  186,
  159,
  255,
  246,
  185,
  157,
  255,
  246,
  183,
  156,
  255,
  246,
  182,
  154,
  255,
  247,
  181,
  152,
  255,
  247,
  179,
  151,
  255,
  247,
  178,
  149,
  255,
  247,
  177,
  148,
  255,
  247,
  176,
  146,
  255,
  247,
  174,
  145,
  255,
  247,
  173,
  143,
  255,
  246,
  171,
  141,
  255,
  246,
  170,
  140,
  255,
  246,
  169,
  138,
  255,
  246,
  167,
  137,
  255,
  246,
  166,
  135,
  255,
  246,
  164,
  134,
  255,
  246,
  163,
  132,
  255,
  245,
  161,
  130,
  255,
  245,
  160,
  129,
  255,
  245,
  158,
  127,
  255,
  244,
  157,
  126,
  255,
  244,
  155,
  124,
  255,
  244,
  154,
  123,
  255,
  243,
  152,
  121,
  255,
  243,
  150,
  120,
  255,
  243,
  149,
  118,
  255,
  242,
  147,
  117,
  255,
  242,
  145,
  115,
  255,
  241,
  144,
  114,
  255,
  241,
  142,
  112,
  255,
  240,
  141,
  111,
  255,
  240,
  139,
  109,
  255,
  239,
  137,
  108,
  255,
  238,
  135,
  106,
  255,
  238,
  134,
  105,
  255,
  237,
  132,
  103,
  255,
  236,
  130,
  102,
  255,
  236,
  128,
  100,
  255,
  235,
  127,
  99,
  255,
  234,
  125,
  97,
  255,
  234,
  123,
  96,
  255,
  233,
  121,
  94,
  255,
  232,
  119,
  93,
  255,
  231,
  117,
  92,
  255,
  230,
  116,
  90,
  255,
  230,
  114,
  89,
  255,
  229,
  112,
  87,
  255,
  228,
  110,
  86,
  255,
  227,
  108,
  84,
  255,
  226,
  106,
  83,
  255,
  225,
  104,
  82,
  255,
  224,
  102,
  80,
  255,
  223,
  100,
  79,
  255,
  222,
  98,
  78,
  255,
  221,
  96,
  76,
  255,
  220,
  94,
  75,
  255,
  219,
  92,
  74,
  255,
  218,
  90,
  72,
  255,
  217,
  88,
  71,
  255,
  216,
  86,
  70,
  255,
  215,
  84,
  68,
  255,
  214,
  82,
  67,
  255,
  212,
  79,
  66,
  255,
  211,
  77,
  64,
  255,
  210,
  75,
  63,
  255,
  209,
  73,
  62,
  255,
  207,
  70,
  61,
  255,
  206,
  68,
  60,
  255,
  205,
  66,
  58,
  255,
  204,
  63,
  57,
  255,
  202,
  61,
  56,
  255,
  201,
  59,
  55,
  255,
  200,
  56,
  53,
  255,
  198,
  53,
  52,
  255,
  197,
  50,
  51,
  255,
  196,
  48,
  50,
  255,
  194,
  45,
  49,
  255,
  193,
  42,
  48,
  255,
  191,
  40,
  46,
  255,
  190,
  35,
  45,
  255,
  188,
  31,
  44,
  255,
  187,
  26,
  43,
  255,
  185,
  22,
  42,
  255,
  184,
  17,
  41,
  255,
  182,
  13,
  40,
  255,
  181,
  8,
  39,
  255,
  179,
  3,
  38,
  255
]);
var _LUTS = {
  "magma": _MAGMA,
  "viridis": _VIRIDIS,
  "RdYlGn": _RDYLGN,
  "Greens": _GREENS,
  "Reds": _REDS,
  "PiYG": _PIYG,
  "inferno": _INFERNO,
  "plasma": _PLASMA,
  "hot": _HOT,
  "coolwarm": _COOLWARM
};
function applyColormap(gray, width, height, cmapName, opts = {}) {
  const lut = _LUTS[cmapName] || _LUTS.magma;
  const alphaMode = opts.alpha ?? "value";
  const alphaArr = opts.alphaData ?? null;
  const n = width * height;
  const rgba = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const v = gray[i];
    const a = alphaArr ? alphaArr[i] : v;
    if (a === 0 && v === 0) continue;
    const li = v * 4;
    rgba[i * 4] = lut[li];
    rgba[i * 4 + 1] = lut[li + 1];
    rgba[i * 4 + 2] = lut[li + 2];
    rgba[i * 4 + 3] = alphaArr ? a : alphaMode === "value" ? v : 255;
  }
  return new ImageData(rgba, width, height);
}

// src/overlay.js
var OverlayLayer = class {
  /**
   * @param {HTMLElement} container - The canvas-container from Viewer.canvasContainer.
   * @param {object} [options]
   * @param {number} [options.opacity=0.7] - Default opacity when shown.
   * @param {string} [options.colormap] - Colormap name (enables grayscale mode).
   */
  constructor(container, options = {}) {
    this._container = container;
    this._defaultOpacity = options.opacity ?? 0.7;
    this._visible = false;
    this._colormap = options.colormap || null;
    this._alphaMode = options.alpha || "value";
    this._rawData = null;
    this._alphaData = null;
    this._rawWidth = 0;
    this._rawHeight = 0;
    this._contourLevels = null;
    this._sourceImg = new Image();
    this._canvas = document.createElement("canvas");
    this._canvas.className = "mntviz-overlay-layer";
    this._canvas.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;opacity:0;transition:opacity 0.2s;";
    this._contourCanvas = document.createElement("canvas");
    this._contourCanvas.className = "mntviz-overlay-layer";
    this._contourCanvas.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;opacity:0;transition:opacity 0.2s;";
    if (options.insertBefore) {
      this._container.insertBefore(this._contourCanvas, options.insertBefore);
      this._container.insertBefore(this._canvas, this._contourCanvas);
    } else {
      this._container.appendChild(this._canvas);
      this._container.appendChild(this._contourCanvas);
    }
    this._resizeObserver = new ResizeObserver(() => this._syncSize());
    const baseImg = this._container.querySelector(".mntviz-img-layer");
    if (baseImg) this._resizeObserver.observe(baseImg);
  }
  /**
   * Load an overlay image.
   * If a colormap is set, the PNG is treated as grayscale and colormapped client-side.
   * @param {string} src - Image URL.
   * @returns {Promise<void>}
   */
  load(src) {
    return new Promise((resolve, reject) => {
      this._sourceImg.onload = () => {
        const w = this._sourceImg.naturalWidth;
        const h = this._sourceImg.naturalHeight;
        this._rawWidth = w;
        this._rawHeight = h;
        this._canvas.width = w;
        this._canvas.height = h;
        if (this._colormap) {
          const tmpCanvas = document.createElement("canvas");
          tmpCanvas.width = w;
          tmpCanvas.height = h;
          const tmpCtx = tmpCanvas.getContext("2d", { willReadFrequently: true });
          tmpCtx.drawImage(this._sourceImg, 0, 0);
          const imgData = tmpCtx.getImageData(0, 0, w, h);
          this._rawData = new Uint8ClampedArray(w * h);
          for (let i = 0; i < w * h; i++) {
            this._rawData[i] = imgData.data[i * 4];
          }
          this._applyAndDraw();
        } else {
          this._rawData = null;
          const ctx = this._canvas.getContext("2d");
          ctx.drawImage(this._sourceImg, 0, 0);
        }
        this._syncSize();
        resolve();
      };
      this._sourceImg.onerror = () => reject(new Error(`Failed to load overlay: ${src}`));
      this._sourceImg.src = src;
    });
  }
  show() {
    this._visible = true;
    this._canvas.style.opacity = this._defaultOpacity;
    this._contourCanvas.style.opacity = this._contourLevels ? 1 : 0;
  }
  hide() {
    this._visible = false;
    this._canvas.style.opacity = 0;
    this._contourCanvas.style.opacity = 0;
  }
  toggle() {
    this._visible ? this.hide() : this.show();
  }
  /** @param {number} value - 0 to 1. */
  setOpacity(value) {
    this._defaultOpacity = value;
    if (this._visible) this._canvas.style.opacity = value;
  }
  /**
   * Change the colormap (instant, no re-fetch).
   * @param {string} name - Colormap name from COLORMAP_NAMES.
   */
  setColormap(name) {
    this._colormap = name;
    if (this._rawData) this._applyAndDraw();
  }
  /**
   * Set iso-contour levels and redraw.  Pass null or [] to clear.
   * Levels are in [0, 100] scale (percentage of max value).
   * @param {number[]|null} levels
   */
  setContours(levels) {
    this._contourLevels = levels && levels.length > 0 ? levels : null;
    this._drawContours();
    if (this._visible) {
      this._contourCanvas.style.opacity = this._contourLevels ? 1 : 0;
    }
  }
  /** Check if the overlay loaded successfully. */
  get loaded() {
    return this._rawWidth > 0;
  }
  /** Whether the overlay is currently shown. */
  get visible() {
    return this._visible;
  }
  /** The visible <canvas> element. */
  get imageElement() {
    return this._canvas;
  }
  /** Raw grayscale pixel data (0-255). Null for legacy RGBA overlays. */
  get rawData() {
    return this._rawData;
  }
  /** Width of the raw data. */
  get rawWidth() {
    return this._rawWidth;
  }
  /** Height of the raw data. */
  get rawHeight() {
    return this._rawHeight;
  }
  /** Clear the source and hide. */
  clear() {
    this._rawData = null;
    this._rawWidth = 0;
    this._rawHeight = 0;
    this._canvas.width = 0;
    this._canvas.height = 0;
    this._contourCanvas.width = 0;
    this._contourCanvas.height = 0;
    this._contourLevels = null;
    this.hide();
  }
  /** Remove the overlay from DOM and clean up observers. */
  destroy() {
    this._resizeObserver.disconnect();
    this._canvas.remove();
    this._contourCanvas.remove();
  }
  /**
   * Compute this overlay from two source overlays (e.g. H_end / H_bif → MType ratio).
   *
   * The ratio ``a / (a + b)`` determines the color (0=B-dominant, 0.5=equal, 1=A-dominant).
   * The peak ``max(a, b)`` determines visibility (alpha).
   *
   * @param {OverlayLayer} overlayA - First source (e.g. H_end).
   * @param {OverlayLayer} overlayB - Second source (e.g. H_bif).
   */
  computeFromRatio(overlayA, overlayB) {
    const a = overlayA.rawData;
    const b = overlayB.rawData;
    if (!a || !b) return;
    const w = overlayA.rawWidth;
    const h = overlayA.rawHeight;
    const n = w * h;
    this._rawWidth = w;
    this._rawHeight = h;
    this._canvas.width = w;
    this._canvas.height = h;
    const ratioData = new Uint8ClampedArray(n);
    const alphaData = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) {
      const va = a[i], vb = b[i];
      const total = va + vb;
      if (total < 3) continue;
      const ratio = va / total;
      ratioData[i] = Math.round(ratio * 254) + 1;
      alphaData[i] = Math.min(Math.max(va, vb), 255);
    }
    this._rawData = ratioData;
    this._alphaData = alphaData;
    this._applyAndDraw();
    this._syncSize();
  }
  /** @private Apply colormap LUT to rawData and draw on canvas. */
  _applyAndDraw() {
    if (!this._rawData || !this._colormap) return;
    const imageData = applyColormap(
      this._rawData,
      this._rawWidth,
      this._rawHeight,
      this._colormap,
      { alpha: this._alphaMode, alphaData: this._alphaData || null }
    );
    const ctx = this._canvas.getContext("2d");
    ctx.putImageData(imageData, 0, 0);
    this._drawContours();
  }
  /**
   * @private Draw iso-contour lines on the contour canvas.
   * Uses simple threshold + edge detection (binary boundary pixels).
   */
  _drawContours() {
    if (!this._rawData || !this._contourLevels) {
      this._contourCanvas.width = 0;
      this._contourCanvas.height = 0;
      return;
    }
    const w = this._rawWidth;
    const h = this._rawHeight;
    this._contourCanvas.width = w;
    this._contourCanvas.height = h;
    const ctx = this._contourCanvas.getContext("2d");
    const imgData = ctx.createImageData(w, h);
    const px = imgData.data;
    const raw = this._rawData;
    for (const level of this._contourLevels) {
      const thresh = Math.round(level * 255 / 100);
      if (thresh <= 0) continue;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (raw[i] < thresh) continue;
          if (raw[i - 1] < thresh || raw[i + 1] < thresh || raw[i - w] < thresh || raw[i + w] < thresh) {
            const pi = i * 4;
            px[pi] = 255;
            px[pi + 1] = 255;
            px[pi + 2] = 255;
            px[pi + 3] = 230;
          }
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
    this._syncSize();
  }
  /** @private */
  _syncSize() {
    const base = this._container.querySelector(".mntviz-img-layer");
    if (!base) return;
    const w = base.clientWidth + "px";
    const h = base.clientHeight + "px";
    this._canvas.style.width = w;
    this._canvas.style.height = h;
    this._contourCanvas.style.width = w;
    this._contourCanvas.style.height = h;
  }
};

// src/uv-renderer.js
var SVG_NS5 = "http://www.w3.org/2000/svg";
var DEFAULTS4 = {
  /** Rendering style: 'arrow' (directed, with arrowhead) or 'segment' (centered, no arrowhead). */
  style: "arrow",
  arrowSize: 3,
  lineWidth: 1.2,
  /** Segment length for 'segment' style — rescales direction vectors client-side. */
  segmentLength: 6,
  opacity: 1,
  color: "#43C4E4",
  /** Minimum alpha to render (skip near-invisible arrows). */
  alphaThreshold: 0.05,
  /** How the optional 6th arrow element (modulation) affects rendering.
   *  'none' = ignored, 'alpha' = modulates opacity, 'width' = modulates line width, 'both' = both. */
  modulationTarget: "none",
  /** Minimum line width as a fraction of lineWidth when modulation is active. */
  modulationWidthMin: 0.3,
  /** Minimum alpha as a fraction when modulation is active. */
  modulationAlphaMin: 0.1
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
    const opts = { ...DEFAULTS4, ...options };
    const {
      style,
      arrowSize,
      lineWidth,
      segmentLength,
      opacity,
      color,
      alphaThreshold,
      modulationTarget,
      modulationWidthMin,
      modulationAlphaMin
    } = opts;
    this._svg.innerHTML = "";
    for (const arrow of arrows) {
      const [x, y, dx, dy, conf] = arrow;
      const mod = arrow.length > 5 ? arrow[5] : 1;
      let alpha = conf * opacity;
      let lw = lineWidth;
      if (modulationTarget === "alpha" || modulationTarget === "both") {
        alpha *= modulationAlphaMin + (1 - modulationAlphaMin) * mod;
      }
      if (modulationTarget === "width" || modulationTarget === "both") {
        lw *= modulationWidthMin + (1 - modulationWidthMin) * mod;
      }
      if (alpha < alphaThreshold) continue;
      const g = document.createElementNS(SVG_NS5, "g");
      g.setAttribute("opacity", alpha);
      g.setAttribute("stroke", color);
      g.setAttribute("fill", color);
      g.setAttribute("stroke-linecap", "round");
      const line = document.createElementNS(SVG_NS5, "line");
      line.setAttribute("stroke-width", lw);
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
          const polygon = document.createElementNS(SVG_NS5, "polygon");
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
var SVG_NS6 = "http://www.w3.org/2000/svg";
var PATCH_NEIGHBOR_ALPHA = 0.4;
var WHEEL_ROTATION_DEG_PER_TICK = 2;
var DEFAULTS5 = {
  leftMinutiae: [],
  rightMinutiae: [],
  pairs: [],
  leftSegments: [],
  rightSegments: [],
  dominantAngle: null,
  matchTransform: null,
  leftTitle: null,
  rightTitle: null,
  markerColor: "#00ff00",
  rendererOptions: {},
  segmentOptions: {},
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
    this._options = { ...DEFAULTS5, ...options };
    this._leftViewer = null;
    this._rightViewer = null;
    this._allSegmentsVisible = this._options.showSegmentsOnLoad;
    this._activePopupPairIdx = -1;
    this._segmentLines = [];
    this._xMntPeer = null;
    this._xSegSelf = null;
    this._xSegPeer = null;
    this._xMatchLine = null;
    this._leftGhostCursor = null;
    this._rightGhostCursor = null;
    this._ghostSourceSide = null;
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
    this._overlaySvg = document.createElementNS(SVG_NS6, "svg");
    this._overlaySvg.classList.add("mntviz-match-overlay");
    this._overlaySvg.setAttribute("width", "100%");
    this._overlaySvg.setAttribute("height", "100%");
    this._popup = _el2("div", "mntviz-match-popup");
    this._popup.style.display = "none";
    this._buildPopup();
    this._contextMenu = _el2("div", "mntviz-context-menu");
    this._contextMenu.style.display = "none";
    this._buildContextMenu();
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
    this._container.append(
      this._leftPanel,
      this._rightPanel,
      this._overlaySvg,
      this._popup,
      this._contextMenu,
      this._exportBtnWrap
    );
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
    this._leftPatchSvg = document.createElementNS(SVG_NS6, "svg");
    const leftLabel = _el2("div", "mntviz-match-popup-patch-label");
    leftLabel.textContent = "L";
    this._leftPatchWrap.append(this._leftPatchCanvas, this._leftPatchSvg, leftLabel);
    this._rightPatchWrap = _el2("div", "mntviz-match-popup-patch");
    this._rightPatchCanvas = document.createElement("canvas");
    this._rightPatchSvg = document.createElementNS(SVG_NS6, "svg");
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
  _buildContextMenu() {
    this._contextMenuAlignBtn = _el2("button", "mntviz-context-menu-btn");
    this._contextMenuAlignBtn.type = "button";
    this._contextMenuAlignBtn.textContent = "Align";
    this._contextMenuAlignBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._alignSelectedSide();
      this._hideContextMenu();
    });
    this._contextMenuGhostBtn = _el2("button", "mntviz-context-menu-btn");
    this._contextMenuGhostBtn.type = "button";
    this._contextMenuGhostBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggleGhostSource(this._contextMenuSide);
      this._hideContextMenu();
    });
    this._contextMenu.append(this._contextMenuAlignBtn, this._contextMenuGhostBtn);
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
      onTransform: () => this._onViewerTransform("left")
    });
    this._rightViewer = new Viewer(this._rightHost, {
      minimap: false,
      onTransform: () => this._onViewerTransform("right")
    });
    await Promise.all([
      this._leftViewer.loadImage(leftSrc),
      this._rightViewer.loadImage(rightSrc)
    ]);
    const opts = this._options;
    const rOpts = opts.rendererOptions;
    this._leftSegEls = [];
    this._rightSegEls = [];
    this._leftSegByPair = /* @__PURE__ */ new Map();
    this._rightSegByPair = /* @__PURE__ */ new Map();
    this._leftSegDataByPair = /* @__PURE__ */ new Map();
    this._rightSegDataByPair = /* @__PURE__ */ new Map();
    if (opts.leftSegments && opts.leftSegments.length) {
      const lsr = new SegmentsRenderer(this._leftViewer.svgLayer);
      this._leftSegEls = lsr.draw(opts.leftMinutiae, opts.leftSegments, opts.segmentOptions);
      for (let i = 0; i < opts.leftSegments.length; i++) {
        const pid = opts.leftSegments[i].pair_id;
        if (pid != null) {
          if (this._leftSegEls[i]) this._leftSegByPair.set(pid, this._leftSegEls[i]);
          this._leftSegDataByPair.set(pid, opts.leftSegments[i]);
        }
      }
    }
    if (opts.rightSegments && opts.rightSegments.length) {
      const rsr = new SegmentsRenderer(this._rightViewer.svgLayer);
      this._rightSegEls = rsr.draw(opts.rightMinutiae, opts.rightSegments, opts.segmentOptions);
      for (let i = 0; i < opts.rightSegments.length; i++) {
        const pid = opts.rightSegments[i].pair_id;
        if (pid != null) {
          if (this._rightSegEls[i]) this._rightSegByPair.set(pid, this._rightSegEls[i]);
          this._rightSegDataByPair.set(pid, opts.rightSegments[i]);
        }
      }
    }
    const leftRenderer = new MinutiaeRenderer(this._leftViewer.svgLayer);
    leftRenderer.draw(opts.leftMinutiae, opts.markerColor, rOpts);
    const rightRenderer = new MinutiaeRenderer(this._rightViewer.svgLayer);
    rightRenderer.draw(opts.rightMinutiae, opts.markerColor, rOpts);
    this._leftGhostCursor = this._createGhostCursor(this._leftViewer.svgLayer);
    this._rightGhostCursor = this._createGhostCursor(this._rightViewer.svgLayer);
    this._leftMntByPair = _indexMarkersByPair(this._leftViewer.svgLayer);
    this._rightMntByPair = _indexMarkersByPair(this._rightViewer.svgLayer);
    this._segTooltip = _el2("div", "mntviz-seg-tooltip");
    this._segTooltip.style.display = "none";
    this._container.appendChild(this._segTooltip);
    this._leftViewer.enableMinutiaeInspector({
      getAllMinutiae: () => opts.leftMinutiae,
      patchMode: "visible"
    });
    this._rightViewer.enableMinutiaeInspector({
      getAllMinutiae: () => opts.rightMinutiae,
      patchMode: "visible"
    });
    this._segmentLines = [];
    this._segmentHitLines = [];
    for (let i = 0; i < opts.pairs.length; i++) {
      const p = opts.pairs[i];
      const line = document.createElementNS(SVG_NS6, "line");
      line.classList.add("mntviz-match-segment");
      line.setAttribute("stroke", p.color || opts.markerColor);
      line.setAttribute("stroke-opacity", p.alpha != null ? p.alpha : 0.6);
      line.setAttribute("stroke-width", p.width != null ? p.width : 1);
      line.style.display = "none";
      this._overlaySvg.appendChild(line);
      this._segmentLines.push(line);
      const hitLine = document.createElementNS(SVG_NS6, "line");
      hitLine.classList.add("mntviz-match-segment-hitbox");
      hitLine.dataset.pairIndex = String(i);
      hitLine.style.display = "none";
      this._overlaySvg.appendChild(hitLine);
      this._segmentHitLines.push(hitLine);
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
    const svg = document.createElementNS(SVG_NS6, "svg");
    svg.setAttribute("xmlns", SVG_NS6);
    svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    svg.setAttribute("width", totalW);
    svg.setAttribute("height", totalH);
    svg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
    const embedPanel = (viewer, offsetX) => {
      const g = document.createElementNS(SVG_NS6, "g");
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
        const svgImg = document.createElementNS(SVG_NS6, "image");
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
    const segG = document.createElementNS(SVG_NS6, "g");
    for (let i = 0; i < opts.pairs.length; i++) {
      const domLine = this._segmentLines[i];
      if (domLine.style.display === "none") continue;
      const p = opts.pairs[i];
      const lm = opts.leftMinutiae[p.leftIdx];
      const rm = opts.rightMinutiae[p.rightIdx];
      const line = document.createElementNS(SVG_NS6, "line");
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
    const lVpW = this._leftViewer.viewport.clientWidth;
    const lVpH = this._leftViewer.viewport.clientHeight;
    const rVpW = this._rightViewer.viewport.clientWidth;
    const rVpH = this._rightViewer.viewport.clientHeight;
    const totalW = lVpW + gap + rVpW;
    const totalH = Math.max(lVpH, rVpH);
    const svg = document.createElementNS(SVG_NS6, "svg");
    svg.setAttribute("xmlns", SVG_NS6);
    svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    svg.setAttribute("width", totalW);
    svg.setAttribute("height", totalH);
    svg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
    const embedView = (viewer, vpW, vpH, offsetX) => {
      const nested = document.createElementNS(SVG_NS6, "svg");
      nested.setAttribute("x", offsetX);
      nested.setAttribute("y", 0);
      nested.setAttribute("width", vpW);
      nested.setAttribute("height", vpH);
      nested.setAttribute("viewBox", `0 0 ${vpW} ${vpH}`);
      const { translateX: tx, translateY: ty, scale: s, rotation: r } = viewer.viewState;
      const { width: iw, height: ih } = viewer.imageSize;
      const ox = iw / 2;
      const oy = ih / 2;
      const g = document.createElementNS(SVG_NS6, "g");
      g.setAttribute(
        "transform",
        `translate(${ox}, ${oy}) translate(${tx}, ${ty}) scale(${s}) rotate(${r}) translate(${-ox}, ${-oy})`
      );
      const img = viewer.imageElement;
      if (img.src) {
        const canvas = document.createElement("canvas");
        canvas.width = iw;
        canvas.height = ih;
        canvas.getContext("2d").drawImage(img, 0, 0);
        const svgImg = document.createElementNS(SVG_NS6, "image");
        svgImg.setAttribute("href", canvas.toDataURL("image/png"));
        svgImg.setAttribute("width", iw);
        svgImg.setAttribute("height", ih);
        g.appendChild(svgImg);
      }
      const mntClone = viewer.svgLayer.cloneNode(true);
      while (mntClone.firstChild) g.appendChild(mntClone.firstChild);
      nested.appendChild(g);
      return nested;
    };
    svg.appendChild(embedView(this._leftViewer, lVpW, lVpH, 0));
    svg.appendChild(embedView(this._rightViewer, rVpW, rVpH, lVpW + gap));
    const opts = this._options;
    const segG = document.createElementNS(SVG_NS6, "g");
    for (let i = 0; i < opts.pairs.length; i++) {
      const domLine = this._segmentLines[i];
      if (domLine.style.display === "none") continue;
      const p = opts.pairs[i];
      const lm = opts.leftMinutiae[p.leftIdx];
      const rm = opts.rightMinutiae[p.rightIdx];
      const lp = this._leftViewer.imageToElementCoords(lm.x, lm.y, this._leftViewer.viewport);
      const rp = this._rightViewer.imageToElementCoords(rm.x, rm.y, this._rightViewer.viewport);
      const line = document.createElementNS(SVG_NS6, "line");
      line.setAttribute("x1", lp.x);
      line.setAttribute("y1", lp.y);
      line.setAttribute("x2", lVpW + gap + rp.x);
      line.setAttribute("y2", rp.y);
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
    this._leftViewer.svgLayer.addEventListener("mouseover", (e) => this._onHoverIn(e, "left"), sig);
    this._leftViewer.svgLayer.addEventListener("mouseout", (e) => this._onHoverOut(e, "left"), sig);
    this._rightViewer.svgLayer.addEventListener("mouseover", (e) => this._onHoverIn(e, "right"), sig);
    this._rightViewer.svgLayer.addEventListener("mouseout", (e) => this._onHoverOut(e, "right"), sig);
    this._leftViewer.viewport.addEventListener("mousemove", (e) => this._onViewportPointerMove(e, "left"), sig);
    this._rightViewer.viewport.addEventListener("mousemove", (e) => this._onViewportPointerMove(e, "right"), sig);
    this._overlaySvg.addEventListener("mousemove", (e) => this._onOverlayPointerMove(e), sig);
    this._container.addEventListener("mouseleave", () => {
      this._hideGhostCursor();
    }, sig);
    for (const line of this._segmentHitLines) {
      line.addEventListener("mouseover", (e) => this._onMatchLineHoverIn(e), sig);
      line.addEventListener("mouseout", (e) => this._onMatchLineHoverOut(e), sig);
      line.addEventListener("mousemove", (e) => this._onOverlayPointerMove(e), sig);
    }
    this._leftViewer.viewport.addEventListener(
      "wheel",
      (e) => this._onWheelRotate(e, "left"),
      { capture: true, passive: false, ...sig }
    );
    this._rightViewer.viewport.addEventListener(
      "wheel",
      (e) => this._onWheelRotate(e, "right"),
      { capture: true, passive: false, ...sig }
    );
    this._leftViewer.viewport.addEventListener("contextmenu", (e) => this._onContextMenu(e, "left"), sig);
    this._rightViewer.viewport.addEventListener("contextmenu", (e) => this._onContextMenu(e, "right"), sig);
    window.addEventListener("click", () => {
      this._hideContextMenu();
    }, sig);
    window.addEventListener("blur", () => {
      this._hideContextMenu();
    }, sig);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this._hideContextMenu();
      }
    }, sig);
  }
  _onWheelRotate(e, side) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const delta = e.deltaY > 0 ? -WHEEL_ROTATION_DEG_PER_TICK : WHEEL_ROTATION_DEG_PER_TICK;
    this._rotateSideBy(side, delta);
  }
  _onViewerTransform(_side) {
    this._updateSegments();
  }
  /* ── Cross-panel hover highlighting ───────────────────── */
  _onHoverIn(e, side) {
    const marker = e.target.closest(".mntviz-mnt-marker");
    if (marker) {
      this._clearCrossMinutiaHighlight();
      const m = minutiaDataMap.get(marker);
      if (m && m._pairIndex != null && m._pairIndex >= 0) {
        const otherMap = side === "left" ? this._rightMntByPair : this._leftMntByPair;
        const peer = otherMap.get(m._pairIndex);
        if (peer) {
          peer.classList.add("mntviz-mnt-cross-highlighted");
          peer.parentNode?.appendChild(peer);
        }
        this._xMntPeer = peer || null;
      }
      return;
    }
    const seg = e.target.closest(".mntviz-segment-marker");
    if (seg) {
      this._clearSegmentHighlights();
      const data = segmentDataMap.get(seg);
      if (!data) return;
      seg.classList.add("mntviz-seg-highlighted");
      seg.parentNode?.appendChild(seg);
      this._xSegSelf = seg;
      if (data.pair_id != null) {
        const otherMap = side === "left" ? this._rightSegByPair : this._leftSegByPair;
        const peer = otherMap.get(data.pair_id);
        if (peer) {
          peer.classList.add("mntviz-seg-cross-highlighted");
          peer.parentNode?.appendChild(peer);
          this._xSegPeer = peer;
        }
      }
      this._showSegTooltip(data, e);
    }
  }
  _onHoverOut(e, side) {
    const marker = e.target.closest(".mntviz-mnt-marker");
    if (marker) {
      this._clearCrossMinutiaHighlight();
    }
    const seg = e.target.closest(".mntviz-segment-marker");
    if (seg) {
      this._clearSegmentHighlights();
      this._hideSegTooltip();
    }
  }
  _onHoverMove(e) {
    if (this._segTooltip && this._segTooltip.style.display !== "none") {
      this._positionSegTooltip(e);
    }
  }
  _onViewportPointerMove(e, side) {
    this._onHoverMove(e);
    if (side === this._ghostSourceSide) {
      this._updateGhostCursor(side, e);
    } else {
      this._hideGhostCursor();
    }
  }
  _onOverlayPointerMove(e) {
    this._onHoverMove(e);
    const side = this._inferPointerSide(e.clientX, e.clientY);
    if (side === this._ghostSourceSide) {
      this._updateGhostCursor(side, e);
    } else {
      this._hideGhostCursor();
    }
  }
  _onMatchLineHoverIn(e) {
    const hitLine = e.currentTarget;
    const pairIdx = Number(hitLine?.dataset?.pairIndex);
    if (!Number.isInteger(pairIdx) || pairIdx < 0) return;
    const pair = this._options.pairs[pairIdx];
    if (!pair) return;
    const line = this._segmentLines[pairIdx];
    if (!line) return;
    line.classList.add("mntviz-match-segment-hovered");
    this._xMatchLine = line;
    this._showMatchLineTooltip(pairIdx, e);
  }
  _onMatchLineHoverOut() {
    if (this._xMatchLine) {
      this._xMatchLine.classList.remove("mntviz-match-segment-hovered");
      this._xMatchLine = null;
    }
    this._hideSegTooltip();
  }
  _showSegTooltip(data, event) {
    const parts = [];
    if (data.pair_id != null) {
      parts.push(`<span>pair:</span> <b style="color:${data.color || "#fff"}">#${data.pair_id}</b>`);
    }
    parts.push(`<span>m1:</span> ${data.m1}  <span>m2:</span> ${data.m2}`);
    parts.push(..._formatSegmentMetaLines(data.label, "seg"));
    parts.push(..._formatSegmentMetaLines(data.info, "info"));
    this._segTooltip.innerHTML = parts.join("<br>");
    this._segTooltip.style.display = "";
    this._positionSegTooltip(event);
  }
  _showMatchLineTooltip(pairIdx, event) {
    const pair = this._options.pairs[pairIdx];
    if (!pair) return;
    const parts = [
      `<span>pair:</span> <b style="color:${pair.color || "#fff"}">#${pairIdx}</b>`,
      `<span>L idx:</span> ${pair.leftIdx}  <span>R idx:</span> ${pair.rightIdx}`
    ];
    if (_isFiniteNumber(pair.similarity)) {
      parts.push(`<span>sim:</span> ${_fmtSimilarity(pair.similarity)}`);
    }
    this._segTooltip.innerHTML = parts.join("<br>");
    this._segTooltip.style.display = "";
    this._positionSegTooltip(event);
  }
  _positionSegTooltip(event) {
    const rect = this._container.getBoundingClientRect();
    const x = event.clientX - rect.left + 12;
    const y = event.clientY - rect.top + 12;
    const w = this._segTooltip.offsetWidth;
    const h = this._segTooltip.offsetHeight;
    const left = Math.min(rect.width - w - 4, x);
    const top = Math.min(rect.height - h - 4, y);
    this._segTooltip.style.left = `${Math.max(0, left)}px`;
    this._segTooltip.style.top = `${Math.max(0, top)}px`;
  }
  _hideSegTooltip() {
    if (this._segTooltip) this._segTooltip.style.display = "none";
  }
  _inferPointerSide(clientX, clientY) {
    const leftRect = this._leftViewer?.viewport?.getBoundingClientRect();
    if (leftRect && _pointInRect(clientX, clientY, leftRect)) return "left";
    const rightRect = this._rightViewer?.viewport?.getBoundingClientRect();
    if (rightRect && _pointInRect(clientX, clientY, rightRect)) return "right";
    return null;
  }
  _createGhostCursor(svgRoot) {
    const g = document.createElementNS(SVG_NS6, "g");
    g.classList.add("mntviz-ghost-cursor");
    g.style.display = "none";
    const circle = document.createElementNS(SVG_NS6, "circle");
    circle.setAttribute("r", "4");
    circle.setAttribute("cx", "0");
    circle.setAttribute("cy", "0");
    g.append(circle);
    svgRoot.appendChild(g);
    return g;
  }
  _updateGhostCursor(side, event) {
    const sourceViewer = side === "left" ? this._leftViewer : this._rightViewer;
    const targetSide = side === "left" ? "right" : "left";
    const { x, y } = sourceViewer.screenToImageCoords(event.clientX, event.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      this._hideGhostCursor(targetSide);
      return;
    }
    const sourceSize = sourceViewer.imageSize;
    if (x < 0 || y < 0 || x > sourceSize.width || y > sourceSize.height) {
      this._hideGhostCursor(targetSide);
      return;
    }
    const mapped = this._mapMatchPoint(side, x, y);
    if (!mapped) {
      this._hideGhostCursor(targetSide);
      return;
    }
    const targetViewer = side === "left" ? this._rightViewer : this._leftViewer;
    const targetSize = targetViewer.imageSize;
    if (mapped.x < 0 || mapped.y < 0 || mapped.x > targetSize.width || mapped.y > targetSize.height) {
      this._hideGhostCursor(targetSide);
      return;
    }
    this._showGhostCursor(targetSide, mapped.x, mapped.y);
  }
  _mapMatchPoint(side, x, y) {
    const t = this._options.matchTransform;
    if (!t) return null;
    const angle = Number(t.angle);
    const tx = Number(t.tx);
    const ty = Number(t.ty);
    if (!Number.isFinite(angle) || !Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    const rad = angle * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    if (side === "right") {
      return {
        x: x * cos + y * sin + tx,
        y: -x * sin + y * cos + ty
      };
    }
    const ux = x - tx;
    const uy = y - ty;
    return {
      x: ux * cos - uy * sin,
      y: ux * sin + uy * cos
    };
  }
  _showGhostCursor(side, x, y) {
    const ghost = side === "left" ? this._leftGhostCursor : this._rightGhostCursor;
    if (!ghost) return;
    ghost.style.display = "";
    ghost.setAttribute("transform", `translate(${x} ${y})`);
  }
  _hideGhostCursor(side = null) {
    const cursors = side === "left" ? [this._leftGhostCursor] : side === "right" ? [this._rightGhostCursor] : [this._leftGhostCursor, this._rightGhostCursor];
    for (const ghost of cursors) {
      if (!ghost) continue;
      ghost.style.display = "none";
    }
  }
  _onContextMenu(e, side) {
    e.preventDefault();
    e.stopPropagation();
    this._showContextMenu(e, side);
  }
  _showContextMenu(event, side) {
    this._contextMenuSide = side;
    const hasAngle = Number.isFinite(this._options.dominantAngle);
    this._contextMenuAlignBtn.disabled = !hasAngle;
    this._updateContextMenuButtons(side);
    this._contextMenu.style.display = "";
    const rect = this._container.getBoundingClientRect();
    const menuW = this._contextMenu.offsetWidth;
    const menuH = this._contextMenu.offsetHeight;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const left = Math.min(Math.max(4, x), Math.max(4, rect.width - menuW - 4));
    const top = Math.min(Math.max(4, y), Math.max(4, rect.height - menuH - 4));
    this._contextMenu.style.left = `${left}px`;
    this._contextMenu.style.top = `${top}px`;
  }
  _hideContextMenu() {
    if (!this._contextMenu) return;
    this._contextMenu.style.display = "none";
    this._contextMenuSide = null;
  }
  _updateContextMenuButtons(side) {
    if (!this._contextMenuGhostBtn) return;
    const enabled = side != null && this._ghostSourceSide === side;
    this._contextMenuGhostBtn.textContent = `${enabled ? "\u2713 " : ""}Ghost`;
  }
  _toggleGhostSource(side) {
    if (side !== "left" && side !== "right") return;
    this._ghostSourceSide = this._ghostSourceSide === side ? null : side;
    this._hideGhostCursor();
  }
  _rotateSideBy(side, delta) {
    const viewer = side === "left" ? this._leftViewer : this._rightViewer;
    viewer?.rotateBy(delta);
  }
  _alignSelectedSide() {
    if (!this._contextMenuSide) return;
    this._alignSide(this._contextMenuSide);
  }
  _alignSide(side) {
    if (!Number.isFinite(this._options.dominantAngle)) return;
    const angle = this._options.dominantAngle;
    if (side === "left") {
      const rightRot = this._rightViewer?.viewState.rotation || 0;
      this._leftViewer?.setRotation(rightRot + angle);
    } else if (side === "right") {
      const leftRot = this._leftViewer?.viewState.rotation || 0;
      this._rightViewer?.setRotation(leftRot - angle);
    }
  }
  _clearCrossMinutiaHighlight() {
    if (!this._xMntPeer) return;
    this._xMntPeer.classList.remove("mntviz-mnt-cross-highlighted");
    this._xMntPeer = null;
  }
  _clearSegmentHighlights() {
    if (this._xSegSelf) this._xSegSelf.classList.remove("mntviz-seg-highlighted");
    if (this._xSegPeer) this._xSegPeer.classList.remove("mntviz-seg-cross-highlighted");
    this._xSegSelf = null;
    this._xSegPeer = null;
  }
  _onSvgMouseDown(e) {
    this._mouseDownPos = { x: e.clientX, y: e.clientY };
    const marker = e.target.closest(".mntviz-mnt-marker");
    const segment = e.target.closest(".mntviz-segment-marker");
    if (marker || segment) {
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
    const viewer = side === "left" ? this._leftViewer : this._rightViewer;
    if (marker) {
      const m = minutiaDataMap.get(marker);
      if (!m) return;
      e.stopPropagation();
      if (viewer._minutiaeInspector) {
        viewer._minutiaeInspector._collapse();
      }
      this._onMarkerClick(side, m, e);
      return;
    }
    const segment = e.target.closest(".mntviz-segment-marker");
    if (!segment) return;
    const data = segmentDataMap.get(segment);
    if (!data) return;
    e.stopPropagation();
    if (viewer._minutiaeInspector) {
      viewer._minutiaeInspector._collapse();
    }
    this._onSegmentClick(side, data, e);
  }
  _onDblClick(e) {
    if (e.target.closest(".mntviz-mnt-marker") || e.target.closest(".mntviz-segment-marker")) return;
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
  _onSegmentClick(side, segment, event) {
    const pairIdx = segment.pair_id;
    if (pairIdx != null && pairIdx >= 0) {
      this._showSegment(pairIdx);
      this._updateSegments();
    }
    this._showSegmentMetadataPopup(side, segment, event);
  }
  /* ── Segment management ───────────────────────────────── */
  _showSegment(idx) {
    if (this._segmentLines[idx]) {
      this._segmentLines[idx].style.display = "";
      this._segmentLines[idx].classList.add("mntviz-match-segment-active");
    }
    if (this._segmentHitLines[idx]) {
      this._segmentHitLines[idx].style.display = "";
    }
    this._updateSegments();
  }
  _showAllSegments() {
    for (let i = 0; i < this._segmentLines.length; i++) {
      const line = this._segmentLines[i];
      line.style.display = "";
      line.classList.remove("mntviz-match-segment-active");
      if (this._segmentHitLines[i]) this._segmentHitLines[i].style.display = "";
    }
    this._updateSegments();
  }
  _hideAllSegments() {
    for (let i = 0; i < this._segmentLines.length; i++) {
      const line = this._segmentLines[i];
      line.style.display = "none";
      line.classList.remove("mntviz-match-segment-active");
      if (this._segmentHitLines[i]) this._segmentHitLines[i].style.display = "none";
    }
  }
  _hideActiveSegment() {
    if (this._activePopupPairIdx >= 0 && !this._allSegmentsVisible) {
      const line = this._segmentLines[this._activePopupPairIdx];
      const hitLine = this._segmentHitLines[this._activePopupPairIdx];
      if (line) {
        line.style.display = "none";
        line.classList.remove("mntviz-match-segment-active");
      }
      if (hitLine) hitLine.style.display = "none";
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
      const hitLine = this._segmentHitLines[i];
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
      if (hitLine) {
        hitLine.setAttribute("x1", lp.x);
        hitLine.setAttribute("y1", lp.y);
        hitLine.setAttribute("x2", rp.x);
        hitLine.setAttribute("y2", rp.y);
      }
    }
  }
  /**
   * Convert image coordinates to container-relative pixel coords.
   */
  _imageToContainerCoords(viewer, imgX, imgY, containerRect) {
    return viewer.imageToElementCoords(imgX, imgY, this._container);
  }
  /* ── Dual-patch popup ─────────────────────────────────── */
  _showDualPatchPopup(leftM, rightM, pairIdx, event) {
    this._hideActiveSegment();
    this._activePopupPairIdx = pairIdx;
    const pair = this._options.pairs[pairIdx];
    const color = pair.color || this._options.markerColor;
    const lines = [
      `<span>pair:</span> <b style="color:${color}">#${pairIdx}</b>`,
      `<span>L:</span> (${Math.round(leftM.x)}, ${Math.round(leftM.y)}, ${Math.round(leftM.angle)}\xB0)  <span>R:</span> (${Math.round(rightM.x)}, ${Math.round(rightM.y)}, ${Math.round(rightM.angle)}\xB0)`
    ];
    if (_isFiniteNumber(pair.similarity)) {
      lines.push(`<span>sim:</span> ${_fmtSimilarity(pair.similarity)}`);
    }
    this._popupFields.innerHTML = lines.join("<br>");
    const ps = this._options.patchSize;
    const ds = this._options.patchDisplaySize;
    this._renderOnePatch(
      this._leftPatchCanvas,
      this._leftPatchSvg,
      this._leftViewer,
      leftM,
      this._options.leftMinutiae,
      ps,
      ds
    );
    this._renderOnePatch(
      this._rightPatchCanvas,
      this._rightPatchSvg,
      this._rightViewer,
      rightM,
      this._options.rightMinutiae,
      ps,
      ds
    );
    this._popupPatchesWrap.style.display = "";
    this._popup.style.display = "";
    this._popup.classList.add("mntviz-match-popup-visible");
    this._showSegment(pairIdx);
    requestAnimationFrame(() => this._positionPopup(event));
  }
  _showSegmentMetadataPopup(side, segment, event) {
    const pairIdx = segment.pair_id;
    this._hideActiveSegment();
    this._activePopupPairIdx = pairIdx != null && pairIdx >= 0 ? pairIdx : -1;
    const leftSeg = pairIdx != null && pairIdx >= 0 ? this._leftSegDataByPair.get(pairIdx) || (side === "left" ? segment : null) : side === "left" ? segment : null;
    const rightSeg = pairIdx != null && pairIdx >= 0 ? this._rightSegDataByPair.get(pairIdx) || (side === "right" ? segment : null) : side === "right" ? segment : null;
    const pairColor = pairIdx != null && pairIdx >= 0 ? this._options.pairs[pairIdx]?.color : null;
    const color = segment.color || pairColor || this._options.markerColor;
    const meta = leftSeg || rightSeg || segment;
    const lines = [];
    if (pairIdx != null && pairIdx >= 0) {
      lines.push(`<span>pair:</span> <b style="color:${color}">#${pairIdx}</b>`);
    }
    if (leftSeg && rightSeg) {
      lines.push(`<span>L seg:</span> ${_fmtIndex(leftSeg.idx)}  <span>R seg:</span> ${_fmtIndex(rightSeg.idx)}`);
      lines.push(`<span>L m1:</span> ${leftSeg.m1}  <span>L m2:</span> ${leftSeg.m2}`);
      lines.push(`<span>R m1:</span> ${rightSeg.m1}  <span>R m2:</span> ${rightSeg.m2}`);
      if (_isFiniteNumber(leftSeg.len) || _isFiniteNumber(rightSeg.len)) {
        lines.push(`<span>L len:</span> ${_fmtNumber(leftSeg.len)}  <span>R len:</span> ${_fmtNumber(rightSeg.len)}`);
      }
      if (_isFiniteNumber(leftSeg.slope) || _isFiniteNumber(rightSeg.slope)) {
        lines.push(`<span>L th:</span> ${_fmtAngle(leftSeg.slope)}  <span>R th:</span> ${_fmtAngle(rightSeg.slope)}`);
      }
    } else {
      const localKey = side === "left" ? "L" : "R";
      lines.push(`<span>${localKey} seg:</span> ${_fmtIndex(segment.idx)}`);
      lines.push(`<span>m1:</span> ${segment.m1}  <span>m2:</span> ${segment.m2}`);
      if (_isFiniteNumber(segment.len)) lines.push(`<span>len:</span> ${_fmtNumber(segment.len)}`);
      if (_isFiniteNumber(segment.slope)) lines.push(`<span>th:</span> ${_fmtAngle(segment.slope)}`);
    }
    if (leftSeg && rightSeg && (_isFiniteNumber(leftSeg.a1) || _isFiniteNumber(rightSeg.a1) || _isFiniteNumber(leftSeg.a2) || _isFiniteNumber(rightSeg.a2))) {
      lines.push(`<span>L a1:</span> ${_fmtAngle(leftSeg.a1)}  <span>R a1:</span> ${_fmtAngle(rightSeg.a1)}`);
      lines.push(`<span>L a2:</span> ${_fmtAngle(leftSeg.a2)}  <span>R a2:</span> ${_fmtAngle(rightSeg.a2)}`);
    } else if (_isFiniteNumber(meta.a1) || _isFiniteNumber(meta.a2)) {
      lines.push(`<span>a1:</span> ${_fmtAngle(meta.a1)}  <span>a2:</span> ${_fmtAngle(meta.a2)}`);
    }
    if (_isFiniteNumber(meta.dtheta) || _isFiniteNumber(meta.da1) || _isFiniteNumber(meta.da2)) {
      lines.push(
        `<span>dth:</span> ${_fmtAngle(meta.dtheta)}  <span>da1:</span> ${_fmtAngle(meta.da1)}  <span>da2:</span> ${_fmtAngle(meta.da2)}`
      );
    }
    if (meta.inverted != null) {
      lines.push(`<span>inv:</span> ${meta.inverted ? "yes" : "no"}`);
    }
    this._popupFields.innerHTML = lines.join("<br>");
    this._popupPatchesWrap.style.display = "none";
    this._popup.style.display = "";
    this._popup.classList.add("mntviz-match-popup-visible");
    if (pairIdx != null && pairIdx >= 0) {
      this._showSegment(pairIdx);
    }
    requestAnimationFrame(() => this._positionPopup(event));
  }
  _renderOnePatch(canvas, svg, viewer, m, allMinutiae, ps, ds) {
    const rotAngle = m.angle * (Math.PI / 180);
    const cos = Math.cos(rotAngle);
    const sin = Math.sin(rotAngle);
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
    for (const other of allMinutiae || []) {
      if (other === m) continue;
      const dx = other.x - m.x;
      const dy = other.y - m.y;
      const px = dx * cos - dy * sin + ps / 2;
      const py = dx * sin + dy * cos + ps / 2;
      if (px < 0 || px > ps || py < 0 || py > ps) continue;
      const pa = ((other.angle - m.angle) % 360 + 360) % 360;
      const otherColor = other._color || this._options.markerColor;
      const otherShape = other._shape || this._options.rendererOptions.markerShape || "circle";
      this._drawPatchMarker(svg, px, py, pa, otherColor, PATCH_NEIGHBOR_ALPHA, otherShape);
    }
    this._drawPatchMarker(svg, ps / 2, ps / 2, 0, color, 1, shape);
  }
  _drawPatchMarker(svg, x, y, angleDeg, color, opacity, shape = "circle") {
    const r = 3;
    const segLen = 7;
    const rad = angleDeg * (Math.PI / 180);
    const xEnd = x + segLen * Math.cos(rad);
    const yEnd = y - segLen * Math.sin(rad);
    const g = document.createElementNS(SVG_NS6, "g");
    g.setAttribute("opacity", opacity);
    g.setAttribute("stroke", color);
    g.setAttribute("fill", "none");
    g.setAttribute("stroke-width", "1");
    const marker = createMarkerShape(shape, x, y, r);
    g.appendChild(marker);
    const line = document.createElementNS(SVG_NS6, "line");
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
    this._hideGhostCursor();
    this._popup.classList.remove("mntviz-match-popup-visible");
    this._popup.style.display = "none";
  }
};
function _el2(tag, className) {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}
function _isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function _fmtNumber(value, digits = 1) {
  return _isFiniteNumber(value) ? value.toFixed(digits) : "-";
}
function _fmtAngle(value, digits = 1) {
  return _isFiniteNumber(value) ? `${value.toFixed(digits)}\xB0` : "-";
}
function _fmtIndex(value) {
  return _isFiniteNumber(value) ? `#${Math.round(value)}` : "-";
}
function _fmtSimilarity(value, digits = 3) {
  return _isFiniteNumber(value) ? value.toFixed(digits) : "-";
}
function _escapeHtml(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function _normalizeSegmentMetaKey(key, fallback) {
  const normalized = String(key).trim().toLowerCase().replaceAll("\u03B1\u2081", "a1").replaceAll("\u03B1\u2082", "a2").replaceAll("\u03B11", "a1").replaceAll("\u03B12", "a2");
  return normalized || fallback;
}
function _formatSegmentMetaLines(raw, fallbackKey) {
  if (raw == null) return [];
  const text = String(raw).trim();
  if (!text) return [];
  const chunks = text.split(/\s{2,}|<br\s*\/?>/i).map((part) => part.trim()).filter(Boolean);
  const lines = [];
  for (const chunk of chunks.length ? chunks : [text]) {
    const segMatch = chunk.match(/^seg\s*#\s*(\d+)$/i);
    if (segMatch) {
      lines.push(`<span>seg:</span> #${_escapeHtml(segMatch[1])}`);
      continue;
    }
    const kvMatches = Array.from(
      chunk.matchAll(/([^\s:=]+)\s*=\s*(.+?)(?=\s+[^\s:=]+\s*=|$)/gu)
    );
    if (kvMatches.length) {
      for (const [, rawKey, rawValue] of kvMatches) {
        const key = _normalizeSegmentMetaKey(rawKey, fallbackKey);
        lines.push(`<span>${_escapeHtml(key)}:</span> ${_escapeHtml(rawValue.trim())}`);
      }
      continue;
    }
    lines.push(`<span>${_escapeHtml(fallbackKey)}:</span> ${_escapeHtml(chunk)}`);
  }
  return lines;
}
function _pointInRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
function _indexMarkersByPair(svgLayer) {
  const map = /* @__PURE__ */ new Map();
  for (const el of svgLayer.querySelectorAll(".mntviz-mnt-marker")) {
    const m = minutiaDataMap.get(el);
    if (m && m._pairIndex != null && m._pairIndex >= 0) {
      map.set(m._pairIndex, el);
    }
  }
  return map;
}

// src/plots.js
var SVG_NS7 = "http://www.w3.org/2000/svg";
function _createShapeElement(shape) {
  if (shape.type === "polygon") {
    const poly = document.createElementNS(SVG_NS7, "polygon");
    poly.setAttribute("points", shape.points.map((p) => p.join(",")).join(" "));
    poly.setAttribute("stroke", shape.stroke || "#ff0000");
    poly.setAttribute("stroke-width", shape.strokeWidth || 2);
    poly.setAttribute("fill", shape.fill || "none");
    if (shape.opacity != null) poly.setAttribute("opacity", shape.opacity);
    return poly;
  }
  if (shape.type === "cross") {
    const g = document.createElementNS(SVG_NS7, "g");
    g.setAttribute("stroke", shape.stroke || "#00ff00");
    g.setAttribute("stroke-width", shape.strokeWidth || 1);
    const s = shape.size || 10;
    const h = document.createElementNS(SVG_NS7, "line");
    h.setAttribute("x1", shape.x - s / 2);
    h.setAttribute("y1", shape.y);
    h.setAttribute("x2", shape.x + s / 2);
    h.setAttribute("y2", shape.y);
    const v = document.createElementNS(SVG_NS7, "line");
    v.setAttribute("x1", shape.x);
    v.setAttribute("y1", shape.y - s / 2);
    v.setAttribute("x2", shape.x);
    v.setAttribute("y2", shape.y + s / 2);
    g.append(h, v);
    if (shape.opacity != null) g.setAttribute("opacity", shape.opacity);
    return g;
  }
  if (shape.type === "minutia") {
    const g = document.createElementNS(SVG_NS7, "g");
    const color = shape.stroke || "#00ff00";
    g.setAttribute("stroke", color);
    g.setAttribute("fill", "none");
    g.setAttribute("stroke-width", shape.strokeWidth || 1.5);
    const r = shape.radius || 6;
    const circle = document.createElementNS(SVG_NS7, "circle");
    circle.setAttribute("cx", shape.x);
    circle.setAttribute("cy", shape.y);
    circle.setAttribute("r", r);
    g.appendChild(circle);
    const segLen = shape.segmentLength || r * 2;
    const rad = (shape.angle || 0) * Math.PI / 180;
    const dx = Math.cos(rad) * segLen;
    const dy = Math.sin(rad) * segLen;
    const line = document.createElementNS(SVG_NS7, "line");
    line.setAttribute("x1", shape.x);
    line.setAttribute("y1", shape.y);
    line.setAttribute("x2", shape.x + dx);
    line.setAttribute("y2", shape.y + dy);
    g.appendChild(line);
    if (shape.opacity != null) g.setAttribute("opacity", shape.opacity);
    return g;
  }
  if (shape.type === "path") {
    const path = document.createElementNS(SVG_NS7, "path");
    path.setAttribute("d", shape.d);
    path.setAttribute("stroke", shape.stroke || "#ff0000");
    path.setAttribute("stroke-width", shape.strokeWidth || 2);
    path.setAttribute("fill", shape.fill || "none");
    if (shape.opacity != null) path.setAttribute("opacity", shape.opacity);
    return path;
  }
  return null;
}
function _renderShapes(svgTarget, shapes) {
  if (!shapes || shapes.length === 0) return;
  const g = document.createElementNS(SVG_NS7, "g");
  for (const shape of shapes) {
    const el = _createShapeElement(shape);
    if (el) g.appendChild(el);
  }
  svgTarget.appendChild(g);
}
function renderLegend(viewer, items) {
  if (!items || items.length === 0) return;
  const wrap = document.createElement("div");
  wrap.classList.add("mntviz-legend");
  for (const { label, color, shape } of items) {
    const row = document.createElement("div");
    row.classList.add("mntviz-legend-item");
    const size = 16;
    const r = 5;
    const svg = document.createElementNS(SVG_NS7, "svg");
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
  if (config.segments && config.segments.length) {
    const sr = new SegmentsRenderer(viewer.svgLayer);
    sr.draw(config.minutiae, config.segments, config.segmentOptions ?? {});
  }
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
  _renderShapes(viewer.svgLayer, config.shapes);
  return viewer;
}
function _loadImageDimensions(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
}
function _createStaticHuvSvg(config, w, h) {
  const svg = document.createElementNS(SVG_NS7, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  if (config.pixelated) svg.style.imageRendering = "pixelated";
  const bgImage = document.createElementNS(SVG_NS7, "image");
  bgImage.setAttribute("href", config.imageSrc);
  bgImage.setAttribute("width", w);
  bgImage.setAttribute("height", h);
  if (config.pixelated) bgImage.setAttribute("image-rendering", "pixelated");
  svg.appendChild(bgImage);
  if (config.overlaySrc) {
    const ovImage = document.createElementNS(SVG_NS7, "image");
    ovImage.setAttribute("href", config.overlaySrc);
    ovImage.setAttribute("width", w);
    ovImage.setAttribute("height", h);
    ovImage.setAttribute("opacity", config.overlayOpacity ?? 1);
    if (config.pixelated) ovImage.setAttribute("image-rendering", "pixelated");
    svg.appendChild(ovImage);
  }
  if (config.arrows && config.arrows.length > 0) {
    const arrowGroup = document.createElementNS(SVG_NS7, "g");
    svg.appendChild(arrowGroup);
    const uvRenderer = new UVFieldRenderer(arrowGroup);
    uvRenderer.draw(config.arrows, config.arrowOptions ?? {});
  }
  _renderShapes(svg, config.shapes);
  return svg;
}
function _openHuvModal(config) {
  const existing = document.querySelector(".mntviz-modal-backdrop");
  if (existing) existing.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "mntviz-modal-backdrop";
  const content = document.createElement("div");
  content.className = "mntviz-modal-content";
  const closeBtn = document.createElement("button");
  closeBtn.className = "mntviz-modal-close";
  closeBtn.textContent = "\xD7";
  function close() {
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", onKey);
  content.appendChild(closeBtn);
  backdrop.appendChild(content);
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => {
    requestAnimationFrame(async () => {
      const viewer = await plotHuv(content, config);
      viewer.resetView();
    });
  });
}
async function plotHuvThumbnail(host, config) {
  const { w, h } = await _loadImageDimensions(config.imageSrc);
  const svg = _createStaticHuvSvg(config, w, h);
  const wrap = document.createElement("div");
  wrap.className = "mntviz-thumbnail-wrap";
  wrap.appendChild(svg);
  wrap.addEventListener("click", () => _openHuvModal(config));
  host.appendChild(wrap);
  return wrap;
}
async function plotMatch(host, config) {
  const mv = new MatchViewer(host, {
    leftMinutiae: config.matchData.leftMinutiae,
    rightMinutiae: config.matchData.rightMinutiae,
    pairs: config.matchData.pairs,
    leftSegments: config.matchData.leftSegments ?? [],
    rightSegments: config.matchData.rightSegments ?? [],
    dominantAngle: config.matchData.dominantAngle ?? null,
    matchTransform: config.matchData.matchTransform ?? null,
    leftTitle: config.leftTitle ?? null,
    rightTitle: config.rightTitle ?? null,
    markerColor: config.markerColor ?? "#00ff00",
    rendererOptions: config.rendererOptions ?? {},
    segmentOptions: config.segmentOptions ?? {},
    showSegmentsOnLoad: config.showSegments ?? false
  });
  await mv.loadImages(config.leftImageSrc, config.rightImageSrc);
  return mv;
}
export {
  plotHuv,
  plotHuvThumbnail,
  plotMatch,
  plotMinutiae,
  plotOverlay,
  renderLegend
};

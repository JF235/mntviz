// src/render-target.js
function resolveTarget(target) {
  if (!target) throw new Error("mntviz: renderer target is required");
  if (target.svgLayer && typeof target.loadImage === "function") return target.svgLayer;
  if (target.el && typeof target.serialize === "function" && target.kind) {
    if (target.kind !== "svg") throw new Error(`mntviz: layer '${target.name}' is not an svg layer`);
    return target.el;
  }
  return target;
}
function isSharedRoot(el) {
  return !!(el && el.classList && el.classList.contains("mntviz-mnt-layer"));
}
function clearOwned(target, nodes, selector = null) {
  if (isSharedRoot(target)) {
    for (const n of nodes) n.remove();
  } else if (selector) {
    for (const el of target.querySelectorAll(selector)) el.remove();
  } else {
    target.replaceChildren();
  }
  nodes.length = 0;
}

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
   * @param {SVGElement|import('./layer-stack.js').Layer|import('./viewer.js').Viewer} svgElement -
   *        Camada da LayerStack (recomendado), elemento SVG próprio ou Viewer
   *        (SVG comum, API antiga).
   */
  constructor(svgElement) {
    this._svg = resolveTarget(svgElement);
    this._nodes = [];
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
      if (mntSegLen > 0) {
        const rad = angle * (Math.PI / 180);
        const xEnd = x + mntSegLen * Math.cos(rad);
        const yEnd = y - mntSegLen * Math.sin(rad);
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("x1", x);
        line.setAttribute("y1", y);
        line.setAttribute("x2", xEnd);
        line.setAttribute("y2", yEnd);
        visual.appendChild(line);
      }
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
    this._nodes.push(g);
    if (showQuality || showAngles || showLabels) {
      this._svg.appendChild(textGroup);
      this._nodes.push(textGroup);
    }
  }
  /**
   * Remove all drawn minutiae. Num alvo próprio (camada ou <g>), esvazia o
   * alvo; no SVG comum do viewer, tira só o que este renderer desenhou.
   */
  clear() {
    clearOwned(this._svg, this._nodes);
  }
};
function parseMinutiaeText(text) {
  const result = [];
  for (let line of text.split("\n")) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.replace(/,/g, " ").split(/\s+/).map(Number);
    if (parts.length >= 3) {
      const [x, y, angle] = parts;
      const quality = parts.length > 3 ? parts[3] : 100;
      const type = parts.length > 4 ? parts[4] : 0;
      const obj = { x, y, angle, quality, type };
      if (parts.length > 5) obj.extra = parts.slice(5);
      result.push(obj);
    }
  }
  return result;
}

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
  constructor(viewer, options = {}) {
    this._viewer = viewer;
    this._showCoords = !!options.showCoords;
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
    if (this._showCoords) lines.push(`<span class="mntviz-probe-label">xy:</span> (${coords.x}, ${coords.y})`);
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
   * ``x``/``y`` come in image-space. When the overlay's raw resolution
   * differs from the image (e.g. minutiae channels at grid res), we scale
   * the coordinates before indexing rawData.
   * Returns a number (0-255 raw) for grayscale overlays, or null if out of bounds.
   */
  _readValue(overlay, opts, x, y) {
    const raw = overlay.rawData;
    if (raw) {
      const w = overlay.rawWidth;
      const h = overlay.rawHeight;
      const imgSize = this._viewer.imageSize;
      if (imgSize.width && imgSize.height && (w !== imgSize.width || h !== imgSize.height)) {
        x = Math.floor(x * w / imgSize.width);
        y = Math.floor(y * h / imgSize.height);
      }
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
    const p = this._viewer.screenToImageCoords(e.clientX, e.clientY);
    return { x: Math.floor(p.x), y: Math.floor(p.y) };
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

// src/point-picker.js
var SVG_NS3 = "http://www.w3.org/2000/svg";
var DEFAULT_OPTIONS = {
  color: "#22c55e",
  markerRadius: 8,
  strokeWidth: 1.6,
  showLabels: true,
  labelFontSize: 11,
  // Drag distance (image px) below which the release is treated as a
  // pure click — point recorded without an angle. Above the threshold,
  // the angle is ISO: degrees CCW from +x, 90° = image top (atan2(-dy, dx)).
  angleThreshold: 5,
  segmentLength: null,
  // defaults to markerRadius * 2 if null
  // Double-click detection (window — first click is left to the Viewer
  // for pan; second click + optional drag adds the point).
  doubleClickMs: 350,
  doubleClickDistPx: 8
};
var PointPicker = class {
  /**
   * @param {Viewer} viewer
   * @param {Object} [options]
   */
  constructor(viewer, options = {}) {
    this._viewer = viewer;
    this._options = { ...DEFAULT_OPTIONS, ...options };
    this._points = [];
    this._listeners = /* @__PURE__ */ new Map();
    this._ac = null;
    this._dragStart = null;
    this._rightDownPos = null;
    this._previewLine = null;
    this._lastClickTime = 0;
    this._lastClickPos = null;
    this._layer = viewer.layers ? viewer.layers.ensure("picker", { kind: "svg", z: 1e3 }) : null;
    this._group = document.createElementNS(SVG_NS3, "g");
    this._group.setAttribute("class", "mntviz-picker-layer");
    this._group.setAttribute("pointer-events", "none");
    this._parent().appendChild(this._group);
  }
  /** @private Onde o grupo do picker mora. */
  _parent() {
    return this._layer ? this._layer.el : this._viewer.svgLayer;
  }
  /* ── Public API ────────────────────────────────────────────── */
  enable() {
    if (this._ac) this._ac.abort();
    this._ac = new AbortController();
    const sig = { signal: this._ac.signal };
    const vp = this._viewer.viewport;
    vp.addEventListener("mousedown", (e) => this._onMouseDown(e), { ...sig, capture: true });
    window.addEventListener("mousemove", (e) => this._onMouseMove(e), { ...sig, capture: true });
    window.addEventListener("mouseup", (e) => this._onMouseUp(e), { ...sig, capture: true });
    vp.addEventListener("contextmenu", (e) => this._onContextMenu(e), sig);
    vp.addEventListener(
      "dblclick",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      { ...sig, capture: true }
    );
    vp.classList.add("mntviz-picker-active");
    this._render();
  }
  disable() {
    if (this._ac) {
      this._ac.abort();
      this._ac = null;
    }
    this._dragStart = null;
    this._rightDownPos = null;
    this._lastClickTime = 0;
    this._lastClickPos = null;
    this._hidePreview();
    this._viewer.viewport.classList.remove("mntviz-picker-active");
  }
  isEnabled() {
    return this._ac !== null;
  }
  destroy() {
    this.disable();
    if (this._group && this._group.parentNode) {
      this._group.parentNode.removeChild(this._group);
    }
    this._listeners.clear();
  }
  getPoints() {
    return this._points.map((p) => ({ ...p }));
  }
  setPoints(points) {
    this._points = (points || []).map((p) => ({
      x: Number(p.x),
      y: Number(p.y),
      ...p.angle != null ? { angle: Number(p.angle) } : {},
      ...p.label != null ? { label: p.label } : {}
    })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    this._render();
    this._emit("change", this.getPoints());
  }
  addPoint(x, y, meta = {}) {
    this._points.push({ x: Number(x), y: Number(y), ...meta });
    this._render();
    this._emit("add", { x, y, ...meta });
    this._emit("change", this.getPoints());
  }
  removeLast() {
    if (this._points.length === 0) return null;
    const removed = this._points.pop();
    this._render();
    this._emit("change", this.getPoints());
    return removed;
  }
  /**
   * Remove the point nearest to (x, y) in image space. The implicit hit
   * radius scales with `markerRadius` and the current zoom so right-click
   * stays usable when zoomed out.
   */
  removeNearest(x, y, radius = null) {
    if (this._points.length === 0) return null;
    const scale = this._viewer.viewState && this._viewer.viewState.scale || 1;
    const r = radius != null ? radius : Math.max(6, this._options.markerRadius * 2) / scale;
    let bestIdx = -1, bestD2 = r * r;
    for (let i = 0; i < this._points.length; i++) {
      const p = this._points[i];
      const dx = p.x - x, dy = p.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD2) {
        bestD2 = d2;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) return null;
    const removed = this._points.splice(bestIdx, 1)[0];
    this._render();
    this._emit("change", this.getPoints());
    return removed;
  }
  clear() {
    if (this._points.length === 0) return;
    this._points = [];
    this._render();
    this._emit("change", this.getPoints());
  }
  setOptions(options) {
    this._options = { ...this._options, ...options };
    this._render();
  }
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, /* @__PURE__ */ new Set());
    this._listeners.get(event).add(fn);
    return () => this._listeners.get(event)?.delete(fn);
  }
  off(event, fn) {
    this._listeners.get(event)?.delete(fn);
  }
  /* ── Pointer handling ──────────────────────────────────────── */
  _onMouseDown(e) {
    if (e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
      this._rightDownPos = { clientX: e.clientX, clientY: e.clientY };
      return;
    }
    if (e.button !== 0) return;
    const now = Date.now();
    const last = this._lastClickPos;
    const isDouble = last && now - this._lastClickTime <= this._options.doubleClickMs && Math.abs(e.clientX - last.x) <= this._options.doubleClickDistPx && Math.abs(e.clientY - last.y) <= this._options.doubleClickDistPx;
    if (!isDouble) {
      this._lastClickTime = now;
      this._lastClickPos = { x: e.clientX, y: e.clientY };
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    this._lastClickTime = 0;
    this._lastClickPos = null;
    if (e.target && e.target.closest && e.target.closest(".mntviz-mnt-marker")) return;
    const { x, y } = this._mouseToImage(e);
    const sz = this._viewer.imageSize;
    if (x < 0 || y < 0 || x >= sz.width || y >= sz.height) return;
    this._dragStart = { x, y };
    this._showPreview(x, y, x, y);
  }
  _onMouseMove(e) {
    if (!this._dragStart) return;
    const { x, y } = this._mouseToImage(e);
    this._showPreview(this._dragStart.x, this._dragStart.y, x, y);
  }
  _onMouseUp(e) {
    if (e.button === 2 && this._rightDownPos) {
      const dx2 = e.clientX - this._rightDownPos.clientX;
      const dy2 = e.clientY - this._rightDownPos.clientY;
      this._rightDownPos = null;
      if (Math.abs(dx2) > 3 || Math.abs(dy2) > 3) return;
      const { x: x2, y: y2 } = this._mouseToImage(e);
      this.removeNearest(x2, y2);
      return;
    }
    if (e.button !== 0 || !this._dragStart) return;
    const start = this._dragStart;
    this._dragStart = null;
    this._hidePreview();
    const { x, y } = this._mouseToImage(e);
    const dx = x - start.x;
    const dy = y - start.y;
    const distSq = dx * dx + dy * dy;
    const thr = this._options.angleThreshold;
    const meta = {};
    if (distSq >= thr * thr) {
      const ang = (Math.atan2(-dy, dx) * 180 / Math.PI + 360) % 360;
      meta.angle = ang;
    }
    this.addPoint(start.x, start.y, meta);
  }
  _onContextMenu(e) {
    e.preventDefault();
  }
  _mouseToImage(e) {
    const p = this._viewer.screenToImageCoords(e.clientX, e.clientY);
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }
  /* ── Rendering ─────────────────────────────────────────────── */
  _render() {
    if (!this._group.isConnected) this._parent().appendChild(this._group);
    const preview = this._previewLine;
    while (this._group.firstChild) this._group.removeChild(this._group.firstChild);
    const { color, markerRadius: r, strokeWidth, showLabels, labelFontSize } = this._options;
    const segLen = this._options.segmentLength != null ? this._options.segmentLength : r * 2;
    this._points.forEach((p, i) => {
      const g = document.createElementNS(SVG_NS3, "g");
      g.setAttribute("class", "mntviz-picker-point");
      const c = document.createElementNS(SVG_NS3, "circle");
      c.setAttribute("cx", p.x);
      c.setAttribute("cy", p.y);
      c.setAttribute("r", r);
      c.setAttribute("fill", `${color}33`);
      c.setAttribute("stroke", color);
      c.setAttribute("stroke-width", strokeWidth);
      g.appendChild(c);
      const dot = document.createElementNS(SVG_NS3, "circle");
      dot.setAttribute("cx", p.x);
      dot.setAttribute("cy", p.y);
      dot.setAttribute("r", Math.max(1, r * 0.2));
      dot.setAttribute("fill", color);
      g.appendChild(dot);
      if (p.angle != null && Number.isFinite(p.angle)) {
        const rad = p.angle * Math.PI / 180;
        const x2 = p.x + Math.cos(rad) * segLen;
        const y2 = p.y - Math.sin(rad) * segLen;
        const seg = document.createElementNS(SVG_NS3, "line");
        seg.setAttribute("x1", p.x);
        seg.setAttribute("y1", p.y);
        seg.setAttribute("x2", x2);
        seg.setAttribute("y2", y2);
        seg.setAttribute("stroke", color);
        seg.setAttribute("stroke-width", strokeWidth);
        seg.setAttribute("stroke-linecap", "round");
        g.appendChild(seg);
      }
      if (showLabels) {
        const t = document.createElementNS(SVG_NS3, "text");
        t.setAttribute("x", p.x + r + 2);
        t.setAttribute("y", p.y - r - 2);
        t.setAttribute("font-size", labelFontSize);
        t.setAttribute("font-family", "monospace");
        t.setAttribute("fill", color);
        t.setAttribute("paint-order", "stroke");
        t.setAttribute("stroke", "rgba(0,0,0,0.6)");
        t.setAttribute("stroke-width", "0.4");
        t.textContent = p.label != null ? String(p.label) : String(i + 1);
        g.appendChild(t);
      }
      this._group.appendChild(g);
    });
    if (preview && this._previewLine === preview) {
      this._group.appendChild(preview);
    }
  }
  _showPreview(x1, y1, x2, y2) {
    const { color, strokeWidth } = this._options;
    if (!this._previewLine) {
      this._previewLine = document.createElementNS(SVG_NS3, "line");
      this._previewLine.setAttribute("class", "mntviz-picker-preview");
      this._previewLine.setAttribute("stroke", color);
      this._previewLine.setAttribute("stroke-width", strokeWidth);
      this._previewLine.setAttribute("stroke-dasharray", "4 3");
      this._previewLine.setAttribute("stroke-linecap", "round");
      this._previewLine.setAttribute("opacity", "0.85");
      this._group.appendChild(this._previewLine);
    }
    this._previewLine.setAttribute("x1", x1);
    this._previewLine.setAttribute("y1", y1);
    this._previewLine.setAttribute("x2", x2);
    this._previewLine.setAttribute("y2", y2);
  }
  _hidePreview() {
    if (this._previewLine && this._previewLine.parentNode) {
      this._previewLine.parentNode.removeChild(this._previewLine);
    }
    this._previewLine = null;
  }
  _emit(event, payload) {
    const subs = this._listeners.get(event);
    if (subs) {
      for (const fn of subs) {
        try {
          fn(payload);
        } catch (err) {
          console.error("PointPicker listener error", err);
        }
      }
    }
    if (event === "change" && typeof this._viewer._emit === "function") {
      this._viewer._emit("change", { source: "picker", type: "points", points: payload });
    }
  }
};

// src/events.js
var Emitter = class {
  constructor() {
    this._listeners = /* @__PURE__ */ new Map();
  }
  /** Registra `fn` para `event`. Devolve uma função que remove o registro. */
  on(event, fn) {
    if (typeof fn !== "function") throw new TypeError("mntviz: listener must be a function");
    if (!this._listeners.has(event)) this._listeners.set(event, /* @__PURE__ */ new Set());
    this._listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }
  /** Como `on`, mas o listener roda uma vez só. */
  once(event, fn) {
    const off = this.on(event, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }
  off(event, fn) {
    const subs = this._listeners.get(event);
    if (!subs) return;
    if (fn) subs.delete(fn);
    else subs.clear();
  }
  /** Há algum listener para `event`? (permite pular trabalho caro.) */
  hasListeners(event) {
    const subs = this._listeners.get(event);
    return !!(subs && subs.size);
  }
  emit(event, payload) {
    const subs = this._listeners.get(event);
    if (!subs || !subs.size) return;
    for (const fn of [...subs]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`mntviz: listener de '${event}' falhou`, err);
      }
    }
  }
  removeAllListeners() {
    this._listeners.clear();
  }
};
var _defaultKey = (it) => {
  if (it == null) return "null";
  if (typeof it !== "object") return String(it);
  if (it.key != null) return String(it.key);
  return `${it.layer ?? ""}:${it.kind ?? ""}:${it.id ?? ""}`;
};
var Selection = class extends Emitter {
  /**
   * @param {object} [options]
   * @param {(item:any) => string} [options.key] - Chave de identidade do item.
   */
  constructor({ key } = {}) {
    super();
    this._key = key || _defaultKey;
    this._items = /* @__PURE__ */ new Map();
  }
  /** Chave de identidade de um item (a mesma usada internamente). */
  keyOf(item) {
    return this._key(item);
  }
  get items() {
    return [...this._items.values()];
  }
  get size() {
    return this._items.size;
  }
  get keys() {
    return [...this._items.keys()];
  }
  has(item) {
    return this._items.has(this._key(item));
  }
  /** Substitui a seleção. */
  set(items, { source = null } = {}) {
    const next = /* @__PURE__ */ new Map();
    for (const it of _asArray(items)) next.set(this._key(it), it);
    const removed = [...this._items].filter(([k]) => !next.has(k)).map(([, v]) => v);
    const added = [...next].filter(([k]) => !this._items.has(k)).map(([, v]) => v);
    this._items = next;
    if (added.length || removed.length) this._changed(added, removed, source);
  }
  add(items, { source = null } = {}) {
    const added = [];
    for (const it of _asArray(items)) {
      const k = this._key(it);
      if (this._items.has(k)) continue;
      this._items.set(k, it);
      added.push(it);
    }
    if (added.length) this._changed(added, [], source);
  }
  remove(items, { source = null } = {}) {
    const removed = [];
    for (const it of _asArray(items)) {
      const k = this._key(it);
      if (!this._items.has(k)) continue;
      removed.push(this._items.get(k));
      this._items.delete(k);
    }
    if (removed.length) this._changed([], removed, source);
  }
  toggle(item, { source = null } = {}) {
    if (this.has(item)) this.remove(item, { source });
    else this.add(item, { source });
  }
  clear({ source = null } = {}) {
    if (!this._items.size) return;
    const removed = this.items;
    this._items = /* @__PURE__ */ new Map();
    this._changed([], removed, source);
  }
  _changed(added, removed, source) {
    this.emit("change", { items: this.items, added, removed, source });
  }
};
function _asArray(items) {
  if (items == null) return [];
  return Array.isArray(items) ? items : [items];
}

// src/layer-stack.js
var SVG_NS4 = "http://www.w3.org/2000/svg";
var KINDS = /* @__PURE__ */ new Set(["svg", "canvas", "html"]);
var Layer = class {
  /**
   * Não instancie direto: use `viewer.layers.add(name, opts)`.
   * @param {LayerStack} stack
   * @param {string} name
   * @param {object} opts
   * @param {number} seq - ordem de criação (desempate do z)
   */
  constructor(stack, name, opts, seq) {
    const { kind = "svg", z = 0, visible = true, opacity = 1, meta = null } = opts || {};
    if (!KINDS.has(kind)) throw new Error(`mntviz: unknown layer kind '${kind}' (svg|canvas|html)`);
    this._stack = stack;
    this._name = String(name);
    this._kind = kind;
    this._z = Number.isFinite(Number(z)) ? Number(z) : 0;
    this._seq = seq;
    this._visible = true;
    this._opacity = 1;
    this.meta = meta;
    this._el = this._createElement();
    this._setOpacity(opacity);
    this._setVisible(visible);
  }
  get name() {
    return this._name;
  }
  get kind() {
    return this._kind;
  }
  get z() {
    return this._z;
  }
  get visible() {
    return this._visible;
  }
  get opacity() {
    return this._opacity;
  }
  /** Elemento da camada: <g> (svg), <canvas> (canvas) ou <div> (html). */
  get el() {
    return this._el;
  }
  /** Atalho para camadas svg. */
  get g() {
    return this._kind === "svg" ? this._el : null;
  }
  /** Atalho para camadas canvas. */
  get canvas() {
    return this._kind === "canvas" ? this._el : null;
  }
  /** Contexto 2D (só camadas canvas). */
  get ctx() {
    return this._kind === "canvas" ? this._el.getContext("2d") : null;
  }
  show() {
    this.setVisible(true);
    return this;
  }
  hide() {
    this.setVisible(false);
    return this;
  }
  toggle() {
    this.setVisible(!this._visible);
    return this;
  }
  setVisible(visible) {
    const next = !!visible;
    if (next === this._visible) return this;
    this._setVisible(next);
    this._stack._changed("visible", this);
    return this;
  }
  /** @param {number} opacity - 0 a 1. */
  setOpacity(opacity) {
    const next = _clamp01(opacity);
    if (next === this._opacity) return this;
    this._setOpacity(next);
    this._stack._changed("opacity", this);
    return this;
  }
  setZ(z) {
    const next = Number(z);
    if (!Number.isFinite(next) || next === this._z) return this;
    this._z = next;
    this._stack._place(this);
    this._stack._changed("z", this);
    return this;
  }
  /** Esvazia a camada (svg/html: tira os filhos; canvas: apaga os pixels). */
  clear() {
    if (this._kind === "canvas") {
      const c = this._el;
      if (c.width && c.height) c.getContext("2d").clearRect(0, 0, c.width, c.height);
    } else {
      this._el.replaceChildren();
    }
    return this;
  }
  remove() {
    this._stack.remove(this._name);
  }
  /** Estado serializável (sem o conteúdo desenhado). */
  serialize() {
    const out = { name: this._name, kind: this._kind, z: this._z, visible: this._visible, opacity: this._opacity };
    if (this.meta != null) out.meta = this.meta;
    return out;
  }
  /* ── interno ─────────────────────────────────────────────── */
  _createElement() {
    let el;
    if (this._kind === "svg") {
      el = document.createElementNS(SVG_NS4, "g");
      el.setAttribute("class", "mntviz-layer");
    } else {
      el = document.createElement(this._kind === "canvas" ? "canvas" : "div");
      el.className = `mntviz-layer mntviz-layer-${this._kind}`;
      el.style.position = "absolute";
      el.style.left = "0";
      el.style.top = "0";
      el.style.pointerEvents = "none";
    }
    el.setAttribute("data-layer", this._name);
    return el;
  }
  _setVisible(visible) {
    this._visible = !!visible;
    if (this._kind === "svg") {
      if (this._visible) this._el.removeAttribute("display");
      else this._el.setAttribute("display", "none");
    } else {
      this._el.style.display = this._visible ? "" : "none";
    }
  }
  _setOpacity(opacity) {
    this._opacity = _clamp01(opacity);
    if (this._kind === "svg") {
      if (this._opacity === 1) this._el.removeAttribute("opacity");
      else this._el.setAttribute("opacity", String(this._opacity));
    } else {
      this._el.style.opacity = this._opacity === 1 ? "" : String(this._opacity);
    }
  }
};
var LayerStack = class extends Emitter {
  /** @param {import('./viewer.js').Viewer} viewer */
  constructor(viewer) {
    super();
    this._viewer = viewer;
    this._layers = /* @__PURE__ */ new Map();
    this._seq = 0;
  }
  /**
   * Cria uma camada. Nome repetido é erro (use `ensure` para obter ou criar).
   * @param {string} name
   * @param {{kind?: 'svg'|'canvas'|'html', z?: number, visible?: boolean, opacity?: number, meta?: any}} [opts]
   * @returns {Layer}
   */
  add(name, opts = {}) {
    const key = String(name);
    if (this._layers.has(key)) throw new Error(`mntviz: layer '${key}' already exists`);
    const layer = new Layer(this, key, opts, this._seq++);
    this._layers.set(key, layer);
    this._place(layer);
    this._syncSize(layer);
    this._changed("add", layer);
    return layer;
  }
  /** Devolve a camada `name`, criando-a com `opts` se não existir. */
  ensure(name, opts = {}) {
    return this._layers.get(String(name)) || this.add(name, opts);
  }
  get(name) {
    return this._layers.get(String(name)) || null;
  }
  has(name) {
    return this._layers.has(String(name));
  }
  remove(name) {
    const key = String(name);
    const layer = this._layers.get(key);
    if (!layer) return false;
    layer._el.remove();
    this._layers.delete(key);
    this._changed("remove", layer);
    return true;
  }
  /** Camadas em ordem de desenho (de baixo para cima): canvas/html, depois svg; z e criação. */
  list() {
    return [...this._layers.values()].sort(_compareDrawOrder);
  }
  names() {
    return this.list().map((l) => l.name);
  }
  get size() {
    return this._layers.size;
  }
  /** Esvazia o conteúdo de todas as camadas (mantém as camadas). */
  clear({ kinds = ["svg", "canvas"] } = {}) {
    for (const layer of this._layers.values()) {
      if (kinds.includes(layer.kind)) layer.clear();
    }
    this._changed("clear", null);
  }
  /** Estado das camadas (nome, tipo, z, visível, opacidade, meta), sem o conteúdo. */
  serialize() {
    return { version: 1, layers: this.list().map((l) => l.serialize()) };
  }
  /**
   * Aplica um estado salvo por `serialize()`. Camadas existentes recebem z,
   * visibilidade e opacidade; as que faltam são criadas vazias (`create`).
   * Camadas fora do estado não mudam.
   */
  restore(state, { create = true } = {}) {
    const entries = Array.isArray(state) ? state : state && state.layers || [];
    for (const s of entries) {
      if (!s || s.name == null) continue;
      let layer = this.get(s.name);
      if (!layer) {
        if (!create) continue;
        layer = this.add(s.name, { kind: s.kind || "svg", z: s.z ?? 0, meta: s.meta ?? null });
      } else {
        if (s.z != null && s.z !== layer.z) {
          layer._z = Number(s.z);
          this._place(layer);
        }
        if (s.meta !== void 0) layer.meta = s.meta;
      }
      if (s.visible != null) layer._setVisible(s.visible);
      if (s.opacity != null) layer._setOpacity(s.opacity);
    }
    this._changed("restore", null);
    return this;
  }
  destroy() {
    for (const layer of this._layers.values()) layer._el.remove();
    this._layers.clear();
    this.removeAllListeners();
  }
  /* ── interno (usado pelo Viewer e pela Layer) ────────────── */
  /** Põe (ou repõe) o elemento da camada na posição dada pelo z. */
  _place(layer) {
    const v = this._viewer;
    const isSvg = layer.kind === "svg";
    const parent = isSvg ? v.svgLayer : v.canvasContainer;
    let next = null;
    for (const other of this._layers.values()) {
      if (other === layer || other.kind === "svg" !== isSvg) continue;
      if (other._el.parentNode !== parent) continue;
      if (_compareZ(other, layer) > 0 && (!next || _compareZ(other, next) < 0)) next = other;
    }
    if (next) parent.insertBefore(layer._el, next._el);
    else if (isSvg) parent.appendChild(layer._el);
    else parent.insertBefore(layer._el, v.svgLayer);
  }
  /** Ajusta canvas/div ao tamanho natural (ou virtual) da imagem. */
  _syncSize(only = null) {
    const { width, height } = this._viewer.imageSize;
    if (!width || !height) return;
    const targets = only ? [only] : [...this._layers.values()];
    for (const layer of targets) {
      if (layer.kind === "svg") continue;
      const el = layer._el;
      if (layer.kind === "canvas" && (el.width !== width || el.height !== height)) {
        el.width = width;
        el.height = height;
      }
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
    }
  }
  _changed(type, layer) {
    const payload = { type, layer: layer ? layer.name : null };
    this.emit("change", payload);
    if (this._viewer && typeof this._viewer._emit === "function") {
      this._viewer._emit("change", { source: "layers", ...payload });
    }
  }
};
function _clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}
function _compareZ(a, b) {
  return a._z - b._z || a._seq - b._seq;
}
function _compareDrawOrder(a, b) {
  const sa = a.kind === "svg" ? 1 : 0;
  const sb = b.kind === "svg" ? 1 : 0;
  return sa - sb || _compareZ(a, b);
}

// src/singularity-renderer.js
var SVG_NS5 = "http://www.w3.org/2000/svg";
var singularityDataMap = /* @__PURE__ */ new WeakMap();
var DEFAULTS3 = {
  markerSize: 5,
  lineWidth: 1.5,
  segmentLength: 12,
  baseOpacity: 1
};
var SingularityRenderer = class {
  /**
   * @param {SVGElement|import('./layer-stack.js').Layer|import('./viewer.js').Viewer} svgElement -
   *        Camada da LayerStack (recomendado), elemento SVG próprio ou Viewer (SVG comum).
   */
  constructor(svgElement) {
    this._svg = resolveTarget(svgElement);
    this._nodes = [];
    this._viewport = this._svg.closest(".mntviz-viewport") || this._svg.parentNode;
    this._tooltip = null;
    this._hideTimer = null;
  }
  _ensureTooltip() {
    if (this._tooltip) return;
    const tip = document.createElement("div");
    tip.className = "mntviz-inspector-tooltip";
    this._viewport.appendChild(tip);
    this._tooltip = tip;
  }
  _showTooltip(html, markerEl) {
    this._ensureTooltip();
    clearTimeout(this._hideTimer);
    this._tooltip.innerHTML = html;
    this._tooltip.classList.add("mntviz-inspector-visible");
    this._positionTooltip(markerEl);
  }
  _hideTooltipSoon() {
    clearTimeout(this._hideTimer);
    this._hideTimer = setTimeout(() => {
      if (this._tooltip) {
        this._tooltip.classList.remove("mntviz-inspector-visible");
      }
    }, 60);
  }
  _positionTooltip(markerEl) {
    const mr = markerEl.getBoundingClientRect();
    const vr = this._viewport.getBoundingClientRect();
    const cx = mr.left + mr.width / 2 - vr.left;
    const cy = mr.top + mr.height / 2 - vr.top;
    const tw = this._tooltip.offsetWidth;
    const th = this._tooltip.offsetHeight;
    let left = cx + 15;
    let top = cy - th / 2;
    if (left + tw > vr.width) left = cx - tw - 15;
    if (left < 5) left = 5;
    if (top < 5) top = 5;
    if (top + th > vr.height - 5) top = vr.height - th - 5;
    this._tooltip.style.left = `${left}px`;
    this._tooltip.style.top = `${top}px`;
  }
  /**
   * Draw singularity points (core and delta).
   *
   * @param {Array<{type: string, x: number, y: number, angles: number[]}>} singularities
   * @param {string} color - CSS color.
   * @param {object} [options] - Override defaults.
   */
  draw(singularities, color, options = {}) {
    const opts = { ...DEFAULTS3, ...options };
    const { markerSize, lineWidth, segmentLength, baseOpacity } = opts;
    const g = document.createElementNS(SVG_NS5, "g");
    g.setAttribute("stroke", color);
    g.setAttribute("fill", "none");
    g.setAttribute("stroke-width", lineWidth);
    g.setAttribute("stroke-linecap", "round");
    g.setAttribute("stroke-linejoin", "round");
    for (const [index, s] of singularities.entries()) {
      const { type, x, y, angles } = s;
      const conf = typeof s.confidence === "number" ? s.confidence : 1;
      const sg = document.createElementNS(SVG_NS5, "g");
      sg.setAttribute("opacity", baseOpacity * conf);
      sg.classList.add("mntviz-sin-marker", "mntviz-mnt-marker");
      sg.style.pointerEvents = "auto";
      sg.style.cursor = "crosshair";
      singularityDataMap.set(sg, { ...s, _index: s._index != null ? s._index : index });
      const hit = document.createElementNS(SVG_NS5, "circle");
      hit.setAttribute("cx", x);
      hit.setAttribute("cy", y);
      hit.setAttribute("r", markerSize + 4);
      hit.setAttribute("fill", "transparent");
      hit.setAttribute("stroke", "none");
      sg.appendChild(hit);
      const visual = document.createElementNS(SVG_NS5, "g");
      visual.classList.add("mntviz-mnt-visual");
      const shape = type === "delta" ? "triangle" : "circle";
      const marker = createMarkerShape(shape, x, y, markerSize);
      visual.appendChild(marker);
      for (const angle of angles) {
        const rad = angle * (Math.PI / 180);
        const xEnd = x + segmentLength * Math.cos(rad);
        const yEnd = y - segmentLength * Math.sin(rad);
        const line = document.createElementNS(SVG_NS5, "line");
        line.setAttribute("x1", x);
        line.setAttribute("y1", y);
        line.setAttribute("x2", xEnd);
        line.setAttribute("y2", yEnd);
        visual.appendChild(line);
      }
      sg.appendChild(visual);
      const angsStr = angles.map((a) => `${Math.round(a)}\xB0`).join(", ");
      const html = `<span>${type.toUpperCase()}</span>  <span>x:</span> ${Math.round(x)}  <span>y:</span> ${Math.round(y)}<br><span>angle${angles.length > 1 ? "s" : ""}:</span> ${angsStr}<br><span>conf:</span> ${(conf * 100).toFixed(0)}`;
      sg.addEventListener("mouseenter", () => {
        sg.classList.add("mntviz-mnt-highlighted");
        this._showTooltip(html, sg);
      });
      sg.addEventListener("mouseleave", () => {
        sg.classList.remove("mntviz-mnt-highlighted");
        this._hideTooltipSoon();
      });
      g.appendChild(sg);
    }
    this._svg.appendChild(g);
    this._nodes.push(g);
  }
  /** Remove all drawn singularities (só as deste renderer, no SVG comum do viewer). */
  clear() {
    clearOwned(this._svg, this._nodes);
    if (this._tooltip) {
      this._tooltip.classList.remove("mntviz-inspector-visible");
    }
  }
};
function parseSingularityText(text) {
  const result = [];
  for (let line of text.split("\n")) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.replace(/,/g, " ").split(/\s+/);
    if (parts.length < 4) continue;
    const type = parts[0].toLowerCase();
    const x = Number(parts[1]);
    const y = Number(parts[2]);
    const expectedAngles = type === "delta" ? 3 : 1;
    const angleEnd = 3 + expectedAngles;
    if (parts.length < angleEnd) continue;
    const angles = parts.slice(3, angleEnd).map(Number);
    const out = { type, x, y, angles };
    if (parts.length > angleEnd) {
      const conf = Number(parts[angleEnd]);
      if (Number.isFinite(conf)) out.confidence = conf;
    }
    result.push(out);
  }
  return result;
}

// src/viewer.js
var SVG_NS6 = "http://www.w3.org/2000/svg";
var Viewer = class {
  /**
   * @param {string|HTMLElement} container - CSS selector or element.
   * @param {object} [options]
   * @param {boolean} [options.minimap=true]  - Show minimap.
   * @param {Function} [options.onResize]     - Called after internal resize.
   * @param {Function} [options.onTransform]  - Called after every pan/zoom transform.
   * @param {import('./events.js').Selection} [options.selection] - Seleção compartilhada
   *        (padrão: uma Selection própria).
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
      flipX: false,
      isDragging: false,
      lastX: 0,
      lastY: 0
    };
    this._abortController = new AbortController();
    this._events = new Emitter();
    this._minutiaeInspector = null;
    this._fieldProbe = null;
    this._virtualSize = null;
    this._overlays = /* @__PURE__ */ new Map();
    this._pointerDown = null;
    this._clickSelect = null;
    this._buildDOM();
    this.layers = new LayerStack(this);
    this._selection = null;
    this._selectionOff = null;
    this.setSelection(options.selection || new Selection());
    this._bindEvents();
  }
  /* ── Eventos ────────────────────────────────────────────── */
  /**
   * Assina um evento do viewer. Devolve a função que cancela a assinatura.
   *  - 'pointer' {type: 'move'|'down'|'up'|'click'|'leave', x, y (imagem, float), px, py (pixel),
   *               inside, clientX, clientY, button, buttons, shiftKey, ctrlKey, altKey, metaKey,
   *               target: {layer, kind, id, data, element} | null, event}
   *  - 'select'  {items, added, removed, source}   (mudança na `selection`)
   *  - 'change'  {source: 'layers'|'picker'|..., type, ...}
   *  - 'view'    {scale, translateX, translateY, rotation, flipX}
   */
  on(event, fn) {
    return this._events.on(event, fn);
  }
  once(event, fn) {
    return this._events.once(event, fn);
  }
  off(event, fn) {
    this._events.off(event, fn);
  }
  /** Emite um evento (usado por componentes acoplados ao viewer, como o picker e os editores). */
  _emit(event, payload) {
    this._events.emit(event, payload);
  }
  /* ── Seleção ────────────────────────────────────────────── */
  /** Seleção atual (compartilhável entre viewers e tabelas). */
  get selection() {
    return this._selection;
  }
  /** Troca a seleção (por exemplo, uma Selection comum a vários viewers). */
  setSelection(selection) {
    if (this._selectionOff) this._selectionOff();
    this._selection = selection;
    this._selectionOff = selection.on("change", (ev) => {
      this._renderSelection();
      this._emit("select", ev);
    });
    this._renderSelection();
    return selection;
  }
  /**
   * Liga a seleção por clique nos marcadores (minúcias e singularidades):
   * clique seleciona; com a tecla `multiKey` alterna; clique no vazio limpa.
   */
  enableClickSelect({ multiKey = "shiftKey" } = {}) {
    this._clickSelect = { multiKey };
    return this;
  }
  disableClickSelect() {
    this._clickSelect = null;
    return this;
  }
  /** Reaplica o destaque da seleção (chame depois de redesenhar marcadores). */
  refreshSelection() {
    this._renderSelection();
  }
  /**
   * Item de seleção de um elemento desenhado (ou null): {layer, kind, id, data}.
   * `layer` é o nome da camada (null fora da LayerStack); `id` é o índice do marcador.
   */
  itemFromElement(el) {
    const it = this._targetFromElement(el);
    if (!it) return null;
    const { element, ...item } = it;
    return item;
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
      rotation: this._view.rotation,
      flipX: this._view.flipX
    };
  }
  /** Espelho horizontal ligado? (aplicado antes da rotação, em torno do centro da imagem) */
  get flipX() {
    return this._view.flipX;
  }
  /** Estado da vista para layouts (o mesmo que `viewState`). */
  getView() {
    return this.viewState;
  }
  /**
   * Aplica um estado de vista de uma vez (um só redesenho). Campos ausentes
   * não mudam: {scale, translateX, translateY, rotation, flipX}.
   */
  setView(state = {}) {
    const v = this._view;
    const num = (x) => x === null || x === void 0 || x === "" ? NaN : Number(x);
    const scale = num(state.scale), tx = num(state.translateX), ty = num(state.translateY), r = num(state.rotation);
    if (Number.isFinite(scale)) v.scale = Math.min(Math.max(scale, 0.1), 20);
    if (Number.isFinite(tx)) v.translateX = tx;
    if (Number.isFinite(ty)) v.translateY = ty;
    if (Number.isFinite(r)) v.rotation = _normalizeAngle180(r);
    if (state.flipX != null) v.flipX = !!state.flipX;
    this._applyTransform();
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
  /** Return only visible + loaded overlays (an overlay inside a hidden layer counts as hidden). */
  getVisibleOverlays() {
    return this.getOverlays().filter((e) => e.overlay.visible && e.overlay.loaded && this._layerFactor(e.overlay.imageElement) !== null);
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
  /**
   * Clear the image and SVG layer. Os nós soltos no SVG raiz (API antiga) saem;
   * as camadas da LayerStack ficam, vazias (svg e canvas; as html hospedam
   * componentes, como OverlayLayer, e não são esvaziadas).
   */
  clear() {
    this._img.removeAttribute("src");
    for (const node of [...this._svg.childNodes]) {
      if (node.nodeType === 1 && node.classList && node.classList.contains("mntviz-layer")) continue;
      node.remove();
    }
    this.layers.clear({ kinds: ["svg", "canvas"] });
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
    this._view.flipX = false;
    this._applyTransform();
  }
  /**
   * Ajusta a imagem ao viewport mantendo a rotação e o espelho (o `resetView`
   * zera os dois). Com rotação, usa a caixa da imagem girada.
   */
  fit() {
    const vw = this._viewport.clientWidth;
    const vh = this._viewport.clientHeight;
    const vs = this._virtualSize;
    const iw = vs ? vs.width : this._img.naturalWidth || 500;
    const ih = vs ? vs.height : this._img.naturalHeight || 500;
    const rad = this._view.rotation * Math.PI / 180;
    const c = Math.abs(Math.cos(rad));
    const s = Math.abs(Math.sin(rad));
    const bw = iw * c + ih * s;
    const bh = iw * s + ih * c;
    const scale = Math.min(Math.max(Math.min(vw / bw, vh / bh), 0.1), 20);
    this._view.scale = scale;
    this._view.translateX = vw / 2 - scale * iw / 2;
    this._view.translateY = vh / 2 - scale * ih / 2;
    this._applyTransform();
  }
  /**
   * Gira 90° em torno do centro da imagem: `dir` > 0 no sentido horário da
   * tela, `dir` < 0 no anti-horário.
   */
  rotate90(dir = 1) {
    this.setRotation(this._view.rotation + (dir < 0 ? -90 : 90));
  }
  /** Liga ou desliga o espelho horizontal (antes da rotação, em torno do centro). */
  setFlip(flipX) {
    const next = !!flipX;
    if (next === this._view.flipX) return;
    this._view.flipX = next;
    this._applyTransform();
  }
  /** Alterna o espelho horizontal. */
  toggleFlip() {
    this.setFlip(!this._view.flipX);
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
   * Set absolute pan in viewport pixels.
   * @param {number} tx
   * @param {number} ty
   */
  setTranslate(tx, ty) {
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;
    this._view.translateX = tx;
    this._view.translateY = ty;
    this._applyTransform();
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
   * Map image coordinates to screen/client coordinates (inverse of
   * screenToImageCoords). Works with pan, zoom, rotation and mirror.
   * @returns {{x:number, y:number}}
   */
  imageToScreenCoords(imgX, imgY) {
    const ctm = this._svg.getScreenCTM();
    if (!ctm) return { x: NaN, y: NaN };
    const p = new DOMPoint(imgX, imgY).matrixTransform(ctm);
    return { x: p.x, y: p.y };
  }
  /**
   * Transformação viva imagem → viewport (px CSS do viewport), a mesma do CSS
   * do container: translate · scale · [rotação e espelho em torno do centro].
   * @returns {DOMMatrix}
   */
  viewMatrix() {
    const { translateX: tx, translateY: ty, scale: s, rotation: r, flipX } = this._view;
    const { width, height } = this.imageSize;
    const cx = width / 2;
    const cy = height / 2;
    const m = new DOMMatrix().translateSelf(tx, ty).scaleSelf(s, s).translateSelf(cx, cy).rotateSelf(r);
    if (flipX) m.scaleSelf(-1, 1);
    return m.translateSelf(-cx, -cy);
  }
  /** @private A transformação viva como atributo `transform` de SVG (sem unidades). */
  _transformAttr() {
    const { translateX: tx, translateY: ty, scale: s, rotation: r, flipX } = this._view;
    const { width, height } = this.imageSize;
    const cx = width / 2;
    const cy = height / 2;
    return `translate(${tx}, ${ty}) scale(${s}) translate(${cx}, ${cy}) rotate(${r})` + (flipX ? " scale(-1, 1)" : "") + ` translate(${-cx}, ${-cy})`;
  }
  /**
   * Serialize the SVG layer (with background image embedded) as a standalone SVG string.
   * @returns {string} SVG markup.
   */
  /**
   * Build a native-SVG legend group matching the on-screen `.mntviz-legend`.
   * @param {Array} items - Array of {label, color, shape}.
   * @param {{x:number, y:number, w:number, h:number}} bounds - Region in SVG
   *        coords where the legend should be anchored (image-coord box for
   *        exportSVG; viewBox for exportSVGView).
   * @param {object} [options]
   * @param {'TL'|'TR'|'BL'|'BR'} [options.position='TL']
   * @param {number} [options.scale=1] - Overall size multiplier. For a
   *        viewBox-scaled SVG also multiply by `imgUnitsPerScreenPx` so the
   *        legend keeps a stable on-screen size.
   * @returns {SVGGElement}
   * @private
   */
  _buildLegendSVG(items, bounds, { position = "TL", scale = 1 } = {}) {
    const pad = 8 * scale;
    const itemH = 22 * scale;
    const swSize = 14 * scale;
    const swR = 5 * scale;
    const fontSz = 12 * scale;
    const gapSw = 6 * scale;
    const margin = 10 * scale;
    const maxChars = items.reduce(
      (m, it) => Math.max(m, String(it.label || "").length),
      0
    );
    const boxW = pad * 2 + swSize + gapSw + maxChars * (fontSz * 0.66);
    const boxH = pad * 2 + items.length * itemH;
    let originX, originY;
    const { x, y, w, h } = bounds;
    switch (position) {
      case "TR":
        originX = x + w - boxW - margin;
        originY = y + margin;
        break;
      case "BL":
        originX = x + margin;
        originY = y + h - boxH - margin;
        break;
      case "BR":
        originX = x + w - boxW - margin;
        originY = y + h - boxH - margin;
        break;
      case "TL":
      default:
        originX = x + margin;
        originY = y + margin;
        break;
    }
    const g = document.createElementNS(SVG_NS6, "g");
    g.setAttribute("transform", `translate(${originX}, ${originY})`);
    const bg = document.createElementNS(SVG_NS6, "rect");
    bg.setAttribute("x", 0);
    bg.setAttribute("y", 0);
    bg.setAttribute("width", boxW);
    bg.setAttribute("height", boxH);
    bg.setAttribute("fill", "rgb(0,0,0)");
    bg.setAttribute("fill-opacity", "0.65");
    bg.setAttribute("stroke", "rgb(255,255,255)");
    bg.setAttribute("stroke-opacity", "0.2");
    bg.setAttribute("stroke-width", 1 * scale);
    bg.setAttribute("rx", 6 * scale);
    g.appendChild(bg);
    items.forEach(({ label, color, shape }, idx) => {
      const rowY = pad + idx * itemH;
      const cx = pad + swSize / 2;
      const cy = rowY + swSize / 2;
      let marker;
      if (shape === "square") {
        marker = document.createElementNS(SVG_NS6, "rect");
        marker.setAttribute("x", cx - swR);
        marker.setAttribute("y", cy - swR);
        marker.setAttribute("width", 2 * swR);
        marker.setAttribute("height", 2 * swR);
      } else {
        marker = document.createElementNS(SVG_NS6, "circle");
        marker.setAttribute("cx", cx);
        marker.setAttribute("cy", cy);
        marker.setAttribute("r", swR);
      }
      marker.setAttribute("stroke", color);
      marker.setAttribute("fill", "none");
      marker.setAttribute("stroke-width", 1.5 * scale);
      g.appendChild(marker);
      const text = document.createElementNS(SVG_NS6, "text");
      text.setAttribute("x", pad + swSize + gapSw);
      text.setAttribute("y", cy + fontSz * 0.35);
      text.setAttribute("fill", "#fff");
      text.setAttribute("font-family", "sans-serif");
      text.setAttribute("font-size", fontSz);
      text.textContent = label;
      g.appendChild(text);
    });
    return g;
  }
  /** @private Pulls stashed legend data from the on-screen legend element.
   * Returns {items, position, scale} or null if no legend is present. */
  _getLegendMeta() {
    const el = this._viewport.querySelector(".mntviz-legend");
    if (!el || !el._legendItems) return null;
    if (el.style.display === "none") return null;
    return {
      items: el._legendItems,
      position: el.dataset.pos || "TL",
      scale: parseFloat(el.dataset.scale) || 1
    };
  }
  exportSVG() {
    const clone2 = this._svg.cloneNode(true);
    clone2.setAttribute("xmlns", SVG_NS6);
    clone2.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    clone2.classList.remove("mntviz-mnt-layer");
    clone2.removeAttribute("style");
    _flattenLayersForExport(clone2);
    const layers = [];
    if (this._img.src) {
      const canvas = document.createElement("canvas");
      const w = this._img.naturalWidth;
      const h = this._img.naturalHeight;
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(this._img, 0, 0);
      const bg = document.createElementNS(SVG_NS6, "image");
      bg.setAttribute("href", canvas.toDataURL("image/png"));
      bg.setAttribute("width", w);
      bg.setAttribute("height", h);
      layers.push(bg);
    }
    layers.push(...this._rasterImagesForExport());
    for (let i = layers.length - 1; i >= 0; i--) {
      clone2.insertBefore(layers[i], clone2.firstChild);
    }
    const lm = this._getLegendMeta();
    if (lm) {
      const bounds = {
        x: 0,
        y: 0,
        w: this._img.naturalWidth || 0,
        h: this._img.naturalHeight || 0
      };
      clone2.appendChild(this._buildLegendSVG(lm.items, bounds, {
        position: lm.position,
        scale: lm.scale
      }));
    }
    return new XMLSerializer().serializeToString(clone2);
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
   * Com rotação ou espelho, é a caixa (alinhada aos eixos da imagem) do
   * viewport levado para a imagem pela transformação viva.
   * @returns {{ x: number, y: number, w: number, h: number }}
   */
  visibleRegion() {
    const { scale: s, translateX: tx, translateY: ty, rotation: r, flipX } = this._view;
    const vpW = this._viewport.clientWidth;
    const vpH = this._viewport.clientHeight;
    if (!r && !flipX) return { x: -tx / s, y: -ty / s, w: vpW / s, h: vpH / s };
    const inv = this.viewMatrix().inverse();
    const pts = [[0, 0], [vpW, 0], [0, vpH], [vpW, vpH]].map(([px, py]) => new DOMPoint(px, py).matrixTransform(inv));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
  }
  /**
   * Serialize only the currently visible viewport region as SVG.
   * Sem rotação nem espelho: viewBox na região visível (coordenadas da imagem).
   * Com rotação ou espelho: SVG do tamanho do viewport com a transformação viva
   * num <g>, como o MatchViewer faz; a legenda fica em coordenadas da tela.
   * @returns {string} SVG markup.
   */
  exportSVGView() {
    if (this._view.rotation || this._view.flipX) return this._exportSVGViewLive();
    const { x, y, w, h } = this.visibleRegion();
    const vpW = this._viewport.clientWidth;
    const vpH = this._viewport.clientHeight;
    const svg = document.createElementNS(SVG_NS6, "svg");
    svg.setAttribute("xmlns", SVG_NS6);
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
      const img = document.createElementNS(SVG_NS6, "image");
      img.setAttribute("href", canvas.toDataURL("image/png"));
      img.setAttribute("width", nw);
      img.setAttribute("height", nh);
      svg.appendChild(img);
    }
    for (const el of this._rasterImagesForExport()) svg.appendChild(el);
    const mntClone = this._svg.cloneNode(true);
    mntClone.removeAttribute("class");
    mntClone.removeAttribute("style");
    _flattenLayersForExport(mntClone);
    while (mntClone.firstChild) svg.appendChild(mntClone.firstChild);
    const lm = this._getLegendMeta();
    if (lm) {
      const unitPx = w / vpW;
      const legendG = this._buildLegendSVG(lm.items, { x, y, w, h }, {
        position: lm.position,
        scale: unitPx * lm.scale
      });
      svg.appendChild(legendG);
    }
    return new XMLSerializer().serializeToString(svg);
  }
  /** @private exportSVGView com rotação/espelho: transformação viva num <g>. */
  _exportSVGViewLive() {
    const vpW = this._viewport.clientWidth;
    const vpH = this._viewport.clientHeight;
    const { width: iw, height: ih } = this.imageSize;
    const svg = document.createElementNS(SVG_NS6, "svg");
    svg.setAttribute("xmlns", SVG_NS6);
    svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    svg.setAttribute("width", vpW);
    svg.setAttribute("height", vpH);
    svg.setAttribute("viewBox", `0 0 ${vpW} ${vpH}`);
    const g = document.createElementNS(SVG_NS6, "g");
    g.setAttribute("transform", this._transformAttr());
    if (this._img.src) {
      const canvas = document.createElement("canvas");
      canvas.width = iw;
      canvas.height = ih;
      canvas.getContext("2d").drawImage(this._img, 0, 0);
      const img = document.createElementNS(SVG_NS6, "image");
      img.setAttribute("href", canvas.toDataURL("image/png"));
      img.setAttribute("width", iw);
      img.setAttribute("height", ih);
      g.appendChild(img);
    }
    for (const el of this._rasterImagesForExport()) g.appendChild(el);
    const mntClone = this._svg.cloneNode(true);
    _flattenLayersForExport(mntClone);
    while (mntClone.firstChild) g.appendChild(mntClone.firstChild);
    svg.appendChild(g);
    const lm = this._getLegendMeta();
    if (lm) {
      svg.appendChild(this._buildLegendSVG(lm.items, { x: 0, y: 0, w: vpW, h: vpH }, {
        position: lm.position,
        scale: lm.scale
      }));
    }
    return new XMLSerializer().serializeToString(svg);
  }
  /**
   * @private Imagens rasterizadas para a exportação: overlays registrados e
   * visíveis (o fator de opacidade da camada que os contém entra junto) e
   * camadas canvas visíveis, na ordem do DOM (= ordem de desenho).
   */
  _rasterImagesForExport() {
    const srcs = [];
    for (const { overlay } of this.getVisibleOverlays()) {
      const cvs = overlay.imageElement;
      if (!cvs || !cvs.width || !cvs.height) continue;
      srcs.push({ cvs, own: cvs.style.opacity, factor: this._layerFactor(cvs) ?? 0 });
    }
    for (const layer of this.layers.list()) {
      if (layer.kind !== "canvas" || !layer.visible) continue;
      const cvs = layer.el;
      if (!cvs.width || !cvs.height) continue;
      srcs.push({ cvs, own: layer.opacity === 1 ? "" : String(layer.opacity), factor: 1 });
    }
    srcs.sort((a, b) => a.cvs === b.cvs ? 0 : a.cvs.compareDocumentPosition(b.cvs) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    return srcs.map(({ cvs, own, factor }) => {
      const w = this._img.naturalWidth || cvs.width;
      const h = this._img.naturalHeight || cvs.height;
      const el = document.createElementNS(SVG_NS6, "image");
      el.setAttribute("href", cvs.toDataURL("image/png"));
      el.setAttribute("width", w);
      el.setAttribute("height", h);
      el.setAttribute("image-rendering", "pixelated");
      let op = own;
      if (factor !== 1) op = String((own === "" ? 1 : Number(own)) * factor);
      if (op) el.setAttribute("opacity", op);
      return el;
    });
  }
  /**
   * @private Produto das opacidades das camadas que contêm `el` (dentro do
   * container transformado); null se alguma delas estiver oculta.
   */
  _layerFactor(el) {
    let f = 1;
    for (let n = el ? el.parentElement : null; n && n !== this._canvas; n = n.parentElement) {
      if (!n.classList || !n.classList.contains("mntviz-layer")) continue;
      const layer = this.layers.get(n.getAttribute("data-layer"));
      if (!layer) continue;
      if (!layer.visible) return null;
      f *= layer.opacity;
    }
    return f;
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
    if (this._pointPicker) {
      this._pointPicker.destroy();
      this._pointPicker = null;
    }
    for (const [, { overlay }] of this._overlays) overlay.destroy();
    this._overlays.clear();
    this._abortController.abort();
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._selectionOff) {
      this._selectionOff();
      this._selectionOff = null;
    }
    this.layers.destroy();
    this._events.removeAllListeners();
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
  /**
   * Enable the point picker (click adds, right-click removes nearest).
   * Idempotent: re-calls update options on the existing picker.
   * The toggle button on the HUD reflects the active state.
   *
   * @param {object} [options] - Forwarded to PointPicker.
   * @returns {import('./point-picker.js').PointPicker}
   */
  enablePointPicker(options = {}) {
    this._ensurePickerButton();
    if (this._pointPicker) {
      this._pointPicker.setOptions(options);
      if (options.points) this._pointPicker.setPoints(options.points);
      this._pointPicker.enable();
      this._setPickerButtonState(true);
      return this._pointPicker;
    }
    this._pointPicker = new PointPicker(this, options);
    if (options.points && options.points.length) {
      this._pointPicker.setPoints(options.points);
    }
    this._pointPicker.enable();
    this._setPickerButtonState(true);
    return this._pointPicker;
  }
  /** Disable the picker but keep the instance + state for re-enabling. */
  disablePointPicker() {
    if (!this._pointPicker) return;
    this._pointPicker.disable();
    this._setPickerButtonState(false);
  }
  /** Toggle picker on/off; creates the picker on first toggle if missing. */
  togglePointPicker(options = {}) {
    if (this._pointPicker && this._pointPicker.isEnabled()) {
      this.disablePointPicker();
    } else {
      this.enablePointPicker(options);
    }
    return this._pointPicker;
  }
  /** Active picker instance (or null). */
  get pointPicker() {
    return this._pointPicker || null;
  }
  /** Lazily create the HUD toggle button — kept off the DOM until opt-in. */
  _ensurePickerButton() {
    if (this._pickerBtn) return;
    this._pickerBtn = _el("button", "mntviz-export-svg-btn mntviz-picker-btn");
    this._pickerBtn.textContent = "Pick";
    this._pickerBtn.setAttribute("aria-pressed", "false");
    this._pickerBtn.title = "Enable point picker";
    this._pickerBtn.addEventListener("click", () => this.togglePointPicker());
    this._exportBtnWrap.insertBefore(this._pickerBtn, this._exportBtnWrap.firstChild);
  }
  _setPickerButtonState(active) {
    if (!this._pickerBtn) return;
    this._pickerBtn.classList.toggle("mntviz-active", active);
    this._pickerBtn.setAttribute("aria-pressed", String(active));
    this._pickerBtn.title = active ? "Picker on \u2014 double-click adds (drag for angle), right-click removes" : "Enable point picker";
  }
  /* ── DOM construction ───────────────────────────────────── */
  _buildDOM() {
    this._el.innerHTML = "";
    this._viewport = _el("div", "mntviz-viewport");
    this._canvas = _el("div", "mntviz-canvas-container");
    this._img = _el("img", "mntviz-img-layer");
    this._img.draggable = false;
    this._svg = document.createElementNS(SVG_NS6, "svg");
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
    const cap = { capture: true, ...sig };
    this._viewport.addEventListener("mousemove", (e) => this._onPointerEvent("move", e), cap);
    this._viewport.addEventListener("mousedown", (e) => this._onPointerEvent("down", e), cap);
    this._viewport.addEventListener("mouseup", (e) => this._onPointerEvent("up", e), cap);
    this._viewport.addEventListener("mouseleave", (e) => this._onPointerEvent("leave", e), sig);
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
  /** @private Converte um evento de mouse em 'pointer' (e 'click'); seleção por clique. */
  _onPointerEvent(type, e) {
    const wantPointer = this._events.hasListeners("pointer");
    if (!wantPointer && !this._clickSelect) return;
    if (type === "down") {
      this._pointerDown = { x: e.clientX, y: e.clientY, button: e.button };
    }
    const payload = wantPointer || type === "up" ? this._pointerPayload(type, e) : null;
    if (wantPointer) this._emit("pointer", payload);
    if (type !== "up") return;
    const d = this._pointerDown;
    this._pointerDown = null;
    if (!d || d.button !== e.button || Math.abs(e.clientX - d.x) > 3 || Math.abs(e.clientY - d.y) > 3) return;
    const click = { ...payload, type: "click" };
    if (wantPointer) this._emit("pointer", click);
    if (this._clickSelect && e.button === 0) this._applyClickSelect(click);
  }
  /** @private */
  _pointerPayload(type, e) {
    const p = this.screenToImageCoords(e.clientX, e.clientY);
    const { width, height } = this.imageSize;
    return {
      type,
      x: p.x,
      y: p.y,
      px: Math.floor(p.x),
      py: Math.floor(p.y),
      inside: p.x >= 0 && p.y >= 0 && p.x < width && p.y < height,
      clientX: e.clientX,
      clientY: e.clientY,
      button: e.button,
      buttons: e.buttons,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      target: this._targetFromElement(e.target),
      event: e
    };
  }
  /** @private */
  _applyClickSelect(click) {
    const multi = !!click[this._clickSelect.multiKey];
    const t = click.target;
    if (!t || t.id == null) {
      if (!multi) this._selection.clear({ source: "click" });
      return;
    }
    const { element, ...item } = t;
    if (multi) this._selection.toggle(item, { source: "click" });
    else this._selection.set([item], { source: "click" });
  }
  /** @private Marcador sob `el` como {layer, kind, id, data, element}, ou null. */
  _targetFromElement(el) {
    const marker = el && el.closest ? el.closest(".mntviz-mnt-marker") : null;
    if (!marker || !this._svg.contains(marker)) return null;
    const layerEl = marker.closest("g.mntviz-layer");
    const layer = layerEl ? layerEl.getAttribute("data-layer") : null;
    let kind = "minutia";
    let data = minutiaDataMap.get(marker);
    if (!data) {
      data = singularityDataMap.get(marker);
      kind = data ? "singularity" : "marker";
    }
    const id = data && data._index != null ? data._index : null;
    return { layer, kind, id, data: data || null, element: marker };
  }
  /** @private Liga a classe `mntviz-selected` nos marcadores selecionados. */
  _renderSelection() {
    if (!this._svg || !this._selection) return;
    const keys = new Set(this._selection.keys);
    if (!keys.size && !this._svg.querySelector(".mntviz-selected")) return;
    for (const m of this._svg.querySelectorAll(".mntviz-mnt-marker")) {
      const t = this._targetFromElement(m);
      const on = !!(t && t.id != null && keys.has(this._selection.keyOf(t)));
      m.classList.toggle("mntviz-selected", on);
    }
  }
  /* ── Internal rendering ─────────────────────────────────── */
  _applyTransform() {
    const { translateX: tx, translateY: ty, scale: s, rotation: r, flipX } = this._view;
    const { width, height } = this.imageSize;
    const cx = width / 2;
    const cy = height / 2;
    const flip = flipX ? " scale(-1, 1)" : "";
    this._canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${s}) translate(${cx}px, ${cy}px) rotate(${r}deg)${flip} translate(${-cx}px, ${-cy}px)`;
    this._setHudInputValue(this._zoomField.input, `${Math.round(s * 100)}`);
    this._setHudInputValue(this._rotationField.input, _formatSignedAngle(r));
    this._updateMinimap();
    if (this._options.onTransform) this._options.onTransform();
    this._emit("view", this.viewState);
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
    if (this.layers) this.layers._syncSize();
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
    const { x: visX, y: visY, w: visW, h: visH } = this.visibleRegion();
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
function _flattenLayersForExport(root) {
  for (const g of [...root.children]) {
    if (g.localName !== "g" || !g.classList.contains("mntviz-layer")) continue;
    if (g.getAttribute("display") === "none") {
      g.remove();
      continue;
    }
    if (g.hasAttribute("opacity")) {
      g.removeAttribute("class");
      continue;
    }
    while (g.firstChild) root.insertBefore(g.firstChild, g);
    g.remove();
  }
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
var SVG_NS7 = "http://www.w3.org/2000/svg";
var segmentDataMap = /* @__PURE__ */ new WeakMap();
var DEFAULTS4 = {
  color: "#00ff00",
  width: 1,
  alpha: 0.7,
  hitWidth: 8
  // stroke-width of the invisible hit-test line.
};
var SegmentsRenderer = class {
  /**
   * @param {SVGElement|import('./layer-stack.js').Layer|import('./viewer.js').Viewer} svgElement -
   *        Camada da LayerStack (recomendado), elemento SVG próprio ou Viewer (SVG comum).
   */
  constructor(svgElement) {
    this._svg = resolveTarget(svgElement);
    this._nodes = [];
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
    const opts = { ...DEFAULTS4, ...options };
    const g = document.createElementNS(SVG_NS7, "g");
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
      const mg = document.createElementNS(SVG_NS7, "g");
      mg.classList.add("mntviz-segment-marker");
      mg.style.pointerEvents = "auto";
      mg.style.cursor = "crosshair";
      const hit = document.createElementNS(SVG_NS7, "line");
      hit.setAttribute("x1", a.x);
      hit.setAttribute("y1", a.y);
      hit.setAttribute("x2", b.x);
      hit.setAttribute("y2", b.y);
      hit.setAttribute("stroke", "transparent");
      hit.setAttribute("stroke-width", opts.hitWidth);
      hit.setAttribute("fill", "none");
      mg.appendChild(hit);
      const line = document.createElementNS(SVG_NS7, "line");
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
    this._nodes.push(g);
    return visibleLines;
  }
  /**
   * Remove any previously-drawn segment group from this layer (no SVG comum
   * do viewer, só os grupos deste renderer).
   */
  clear() {
    clearOwned(this._svg, this._nodes, "g.mntviz-segments");
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
var COLORMAP_NAMES = ["magma", "viridis", "RdYlGn", "Greens", "Reds", "PiYG", "inferno", "plasma", "hot", "coolwarm"];
function applyColormap(gray, width, height, cmapName, opts = {}) {
  const lut = _LUTS[cmapName] || _LUTS.magma;
  const alphaMode = opts.alpha ?? "value";
  const alphaArr = opts.alphaData ?? null;
  const fadeGamma = opts.fadeGamma ?? 1;
  const invert = !!opts.invert;
  const valueLUT = opts.valueLUT ?? null;
  const hideBg = opts.hideBg ?? true;
  const bgThreshold = opts.bgThreshold ?? null;
  const n = width * height;
  const rgba = new Uint8ClampedArray(n * 4);
  let alphaLUT = null;
  if (!alphaArr && alphaMode === "value" && fadeGamma !== 1) {
    alphaLUT = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      alphaLUT[v] = Math.round(255 * Math.pow(v / 255, fadeGamma));
    }
  }
  for (let i = 0; i < n; i++) {
    const stretched = valueLUT ? valueLUT[gray[i]] : gray[i];
    const v = invert ? 255 - stretched : stretched;
    const a = alphaArr ? alphaArr[i] : v;
    if (bgThreshold !== null) {
      if (bgThreshold >= 0 && v <= bgThreshold) continue;
    } else if (hideBg && a === 0 && v === 0) {
      continue;
    }
    const li = v * 4;
    rgba[i * 4] = lut[li];
    rgba[i * 4 + 1] = lut[li + 1];
    rgba[i * 4 + 2] = lut[li + 2];
    if (alphaArr) {
      rgba[i * 4 + 3] = a;
    } else if (alphaMode === "value") {
      rgba[i * 4 + 3] = alphaLUT ? alphaLUT[v] : v;
    } else {
      rgba[i * 4 + 3] = 255;
    }
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
    this._fadeGamma = options.fadeGamma ?? 1;
    this._invert = !!options.invert;
    this._hideBg = options.hideBg ?? true;
    this._bgThreshold = options.bgThreshold ?? null;
    this._autoStretch = !!options.autoStretch;
    this._stretchLow = options.stretchLow ?? 0.01;
    this._stretchHigh = options.stretchHigh ?? 0.99;
    this._stretchLUT = null;
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
    const baseImg = this._baseImage();
    if (baseImg) this._resizeObserver.observe(baseImg);
  }
  /**
   * @private A imagem de base do viewer: irmã no container, ou a do container
   * transformado quando o overlay mora numa camada 'html' da LayerStack.
   */
  _baseImage() {
    const direct = this._container.querySelector(".mntviz-img-layer");
    if (direct) return direct;
    const host = this._container.closest ? this._container.closest(".mntviz-canvas-container") : null;
    return host ? host.querySelector(":scope > .mntviz-img-layer") : null;
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
          this._refreshStretchLUT();
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
   * Change the fade gamma exponent applied to the value→alpha curve.
   * Only meaningful when `alpha === 'value'`. Re-applies LUT immediately.
   * @param {number} gamma - >=0. 1 is linear. >1 fades low values harder.
   */
  setFadeGamma(gamma) {
    this._fadeGamma = gamma;
    if (this._rawData) this._applyAndDraw();
  }
  /**
   * Toggle whether the grayscale value is inverted (255 - v) before colormap
   * lookup. Cheap — only triggers a redraw, no re-decoding.
   * @param {boolean} invert
   */
  setInvert(invert) {
    const next = !!invert;
    if (next === this._invert) return;
    this._invert = next;
    if (this._rawData) this._applyAndDraw();
  }
  /**
   * Toggle whether the no-data sentinel (byte 0) is rendered transparent.
   * Cheap — only triggers a redraw from cached rawData, no re-fetch.
   * @param {boolean} hide
   */
  setHideBg(hide) {
    const next = !!hide;
    if (next === this._hideBg) return;
    this._hideBg = next;
    if (this._rawData) this._applyAndDraw();
  }
  /**
   * Set the tunable background cutoff (byte units [0, 255]). Pixels with
   * value <= threshold render transparent. Pass -1 to show everything, or
   * null to fall back to the legacy byte-0 no-data sentinel (`hideBg`).
   * Cheap — redraws from cached rawData, no re-fetch.
   * @param {number|null} threshold
   */
  setBgThreshold(threshold) {
    const next = threshold === null || threshold === void 0 ? null : Number(threshold);
    if (next === this._bgThreshold) return;
    this._bgThreshold = next;
    if (this._rawData) this._applyAndDraw();
  }
  /**
   * Switch the display-time upsampling between NN (pixelated) and the
   * browser's default smoothing (bilinear). The canvas backing stays at the
   * source PNG resolution (grid res for minutiae layers); CSS scaling on
   * the canvas element is what actually performs the upsample at draw time.
   * Toggle is free — no fetch, no canvas re-render.
   * @param {'pixelated'|'interp'} mode
   */
  setRenderMode(mode) {
    if (mode === "pixelated") {
      this._canvas.classList.add("mntviz-render-pixelated");
      this._canvas.classList.remove("mntviz-render-interp");
    } else {
      this._canvas.classList.add("mntviz-render-interp");
      this._canvas.classList.remove("mntviz-render-pixelated");
    }
  }
  /**
   * Toggle percentile-based auto-stretch of the input range.
   * Useful for low-contrast inputs (e.g. FingerNet gabor, std≈18) where the
   * raw byte range fills only a narrow band and the colormap looks flat.
   * @param {boolean} on
   */
  setAutoStretch(on) {
    const next = !!on;
    if (next === this._autoStretch) return;
    this._autoStretch = next;
    this._refreshStretchLUT();
    if (this._rawData) this._applyAndDraw();
  }
  /**
   * @private Build a 256-entry remap LUT that stretches [p_lo, p_hi] to [0, 255].
   * Called automatically after load and when auto-stretch is toggled.
   */
  _refreshStretchLUT() {
    if (!this._autoStretch || !this._rawData) {
      this._stretchLUT = null;
      return;
    }
    const data = this._rawData;
    const n = data.length;
    if (n === 0) {
      this._stretchLUT = null;
      return;
    }
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) hist[data[i]]++;
    const lowCount = Math.floor(n * this._stretchLow);
    const highCount = Math.floor(n * (1 - this._stretchHigh));
    let cum = 0, pLo = 0, pHi = 255;
    for (let v = 0; v < 256; v++) {
      cum += hist[v];
      if (cum >= lowCount) {
        pLo = v;
        break;
      }
    }
    cum = 0;
    for (let v = 255; v >= 0; v--) {
      cum += hist[v];
      if (cum >= highCount) {
        pHi = v;
        break;
      }
    }
    if (pHi <= pLo) {
      this._stretchLUT = null;
      return;
    }
    const range = pHi - pLo;
    const out = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      if (v <= pLo) out[v] = 0;
      else if (v >= pHi) out[v] = 255;
      else out[v] = Math.round(255 * (v - pLo) / range);
    }
    this._stretchLUT = out;
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
      {
        alpha: this._alphaMode,
        alphaData: this._alphaData || null,
        fadeGamma: this._fadeGamma,
        invert: this._invert,
        valueLUT: this._stretchLUT,
        hideBg: this._hideBg,
        bgThreshold: this._bgThreshold
      }
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
    const base = this._baseImage();
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
var SVG_NS8 = "http://www.w3.org/2000/svg";
var DEFAULTS5 = {
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
   * @param {SVGElement|import('./layer-stack.js').Layer|import('./viewer.js').Viewer} svgElement -
   *        Camada da LayerStack (recomendado), SVG/<g> próprio ou Viewer (SVG comum).
   */
  constructor(svgElement) {
    this._svg = resolveTarget(svgElement);
    this._nodes = [];
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
    const opts = { ...DEFAULTS5, ...options };
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
    clearOwned(this._svg, this._nodes);
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
      const g = document.createElementNS(SVG_NS8, "g");
      g.setAttribute("opacity", alpha);
      g.setAttribute("stroke", color);
      g.setAttribute("fill", color);
      g.setAttribute("stroke-linecap", "round");
      const line = document.createElementNS(SVG_NS8, "line");
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
          const polygon = document.createElementNS(SVG_NS8, "polygon");
          polygon.setAttribute("points", `${tipX},${tipY} ${lx},${ly} ${rx},${ry}`);
          polygon.setAttribute("stroke", "none");
          g.appendChild(polygon);
        }
      }
      this._svg.appendChild(g);
      this._nodes.push(g);
    }
  }
  /** Remove all drawn arrows (só as deste renderer, no SVG comum do viewer). */
  clear() {
    clearOwned(this._svg, this._nodes);
  }
};

// src/match-viewer.js
var SVG_NS9 = "http://www.w3.org/2000/svg";
var PATCH_NEIGHBOR_ALPHA = 0.4;
var WHEEL_ROTATION_DEG_PER_TICK = 2;
var MARKER_VISIBILITY = ["all", "paired", "none"];
var DEFAULTS6 = {
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
  showSegmentsOnLoad: false,
  // Per-panel marker visibility: 'all' | 'paired' | 'none', or {left, right}.
  // Connector lines are NOT affected — they are positioned from the minutiae
  // data, not from the marker DOM, so lines without markers is a valid state.
  markerVisibility: "all",
  // Manual annotation hook. When set, called on every minutia-marker click as
  // onMinutiaClick(side, index, minutia, event). Returning a truthy value
  // suppresses the default paired-only popup behavior. Pairs can then be
  // driven dynamically via setPairs() / getMarkerElement().
  onMinutiaClick: null
};
var MatchViewer = class {
  /**
   * @param {string|HTMLElement} container
   * @param {object} [options]
   */
  constructor(container, options = {}) {
    this._el = typeof container === "string" ? document.querySelector(container) : container;
    if (!this._el) throw new Error("mntviz MatchViewer: container not found");
    this._options = { ...DEFAULTS6, ...options };
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
    this._ghostSources = { left: false, right: false };
    this._markerVis = _normalizeMarkerVisibility(this._options.markerVisibility);
    this._coupledActive = false;
    this._coupledAnchorSide = null;
    this._syncingCoupled = false;
    this._warp = null;
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
    this._overlaySvg = document.createElementNS(SVG_NS9, "svg");
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
    this._leftPatchSvg = document.createElementNS(SVG_NS9, "svg");
    const leftLabel = _el2("div", "mntviz-match-popup-patch-label");
    leftLabel.textContent = "L";
    this._leftPatchWrap.append(this._leftPatchCanvas, this._leftPatchSvg, leftLabel);
    this._rightPatchWrap = _el2("div", "mntviz-match-popup-patch");
    this._rightPatchCanvas = document.createElement("canvas");
    this._rightPatchSvg = document.createElementNS(SVG_NS9, "svg");
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
    this._contextMenuCoupledBtn = _el2("button", "mntviz-context-menu-btn");
    this._contextMenuCoupledBtn.type = "button";
    this._contextMenuCoupledBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggleCoupled(this._contextMenuSide);
      this._hideContextMenu();
    });
    this._contextMenuPointsBtn = _el2("button", "mntviz-context-menu-btn");
    this._contextMenuPointsBtn.type = "button";
    this._contextMenuPointsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._cycleMarkerVisibility(this._contextMenuSide);
      this._updateContextMenuButtons(this._contextMenuSide);
    });
    this._contextMenu.append(
      this._contextMenuAlignBtn,
      this._contextMenuGhostBtn,
      this._contextMenuCoupledBtn,
      this._contextMenuPointsBtn
    );
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
    this._leftMntByIndex = _indexMarkersByIndex(this._leftViewer.svgLayer);
    this._rightMntByIndex = _indexMarkersByIndex(this._rightViewer.svgLayer);
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
      this._buildPairSegment(opts.pairs[i], i);
    }
    this._bindEvents();
    if (this._allSegmentsVisible) {
      this._showAllSegments();
    }
    this._applyMarkerVisibility("left");
    this._applyMarkerVisibility("right");
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
    const svg = document.createElementNS(SVG_NS9, "svg");
    svg.setAttribute("xmlns", SVG_NS9);
    svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    svg.setAttribute("width", totalW);
    svg.setAttribute("height", totalH);
    svg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
    const embedPanel = (viewer, offsetX) => {
      const g = document.createElementNS(SVG_NS9, "g");
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
        const svgImg = document.createElementNS(SVG_NS9, "image");
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
    const segG = document.createElementNS(SVG_NS9, "g");
    for (let i = 0; i < opts.pairs.length; i++) {
      const domLine = this._segmentLines[i];
      if (domLine.style.display === "none") continue;
      const p = opts.pairs[i];
      const lm = opts.leftMinutiae[p.leftIdx];
      const rm = opts.rightMinutiae[p.rightIdx];
      const line = document.createElementNS(SVG_NS9, "line");
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
    const svg = document.createElementNS(SVG_NS9, "svg");
    svg.setAttribute("xmlns", SVG_NS9);
    svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    svg.setAttribute("width", totalW);
    svg.setAttribute("height", totalH);
    svg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
    const embedView = (viewer, vpW, vpH, offsetX) => {
      const nested = document.createElementNS(SVG_NS9, "svg");
      nested.setAttribute("x", offsetX);
      nested.setAttribute("y", 0);
      nested.setAttribute("width", vpW);
      nested.setAttribute("height", vpH);
      nested.setAttribute("viewBox", `0 0 ${vpW} ${vpH}`);
      const { translateX: tx, translateY: ty, scale: s, rotation: r } = viewer.viewState;
      const { width: iw, height: ih } = viewer.imageSize;
      const ox = iw / 2;
      const oy = ih / 2;
      const g = document.createElementNS(SVG_NS9, "g");
      g.setAttribute(
        "transform",
        `translate(${tx}, ${ty}) scale(${s}) translate(${ox}, ${oy}) rotate(${r}) translate(${-ox}, ${-oy})`
      );
      const img = viewer.imageElement;
      if (img.src) {
        const canvas = document.createElement("canvas");
        canvas.width = iw;
        canvas.height = ih;
        canvas.getContext("2d").drawImage(img, 0, 0);
        const svgImg = document.createElementNS(SVG_NS9, "image");
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
    const segG = document.createElementNS(SVG_NS9, "g");
    for (let i = 0; i < opts.pairs.length; i++) {
      const domLine = this._segmentLines[i];
      if (domLine.style.display === "none") continue;
      const p = opts.pairs[i];
      const lm = opts.leftMinutiae[p.leftIdx];
      const rm = opts.rightMinutiae[p.rightIdx];
      const lp = this._leftViewer.imageToElementCoords(lm.x, lm.y, this._leftViewer.viewport);
      const rp = this._rightViewer.imageToElementCoords(rm.x, rm.y, this._rightViewer.viewport);
      const line = document.createElementNS(SVG_NS9, "line");
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
  /**
   * Programmatically select a pair — same effect as clicking the matching
   * minutia: highlights the connecting segment and opens the dual-patch
   * popup. Unlike a direct click, the popup is centered on the midpoint
   * of the connecting segment (between left and right minutiae).
   * @param {number} pairIdx
   */
  selectPair(pairIdx) {
    const pair = this._options.pairs[pairIdx];
    if (!pair) return;
    const leftM = this._options.leftMinutiae[pair.leftIdx];
    const rightM = this._options.rightMinutiae[pair.rightIdx];
    if (!leftM || !rightM) return;
    let midX = 0, midY = 0, haveMid = false;
    if (this._leftViewer && this._rightViewer && this._container) {
      const lp = this._leftViewer.imageToElementCoords(leftM.x, leftM.y, this._container);
      const rp = this._rightViewer.imageToElementCoords(rightM.x, rightM.y, this._container);
      midX = (lp.x + rp.x) / 2;
      midY = (lp.y + rp.y) / 2;
      haveMid = true;
    }
    const cRect = this._container?.getBoundingClientRect();
    const anchor = haveMid ? { clientX: cRect.left + midX, clientY: cRect.top + midY } : { clientX: 0, clientY: 0 };
    this._showDualPatchPopup(leftM, rightM, pairIdx, anchor);
    if (haveMid) {
      requestAnimationFrame(() => {
        const tipW = this._popup.offsetWidth;
        const tipH = this._popup.offsetHeight;
        const cR = this._container.getBoundingClientRect();
        let left = midX - tipW / 2;
        let top = midY - tipH / 2;
        if (left < 5) left = 5;
        if (left + tipW > cR.width - 5) left = cR.width - tipW - 5;
        if (top < 5) top = 5;
        if (top + tipH > cR.height - 5) top = cR.height - tipH - 5;
        this._popup.style.left = `${left}px`;
        this._popup.style.top = `${top}px`;
      });
    }
  }
  /* ── Manual annotation API ────────────────────────────── */
  /**
   * Return the minutia marker <g> element for a given side + index, or null.
   * Useful for applying a transient highlight class (e.g. "armed").
   * @param {'left'|'right'} side
   * @param {number} index
   * @returns {SVGGElement|null}
   */
  getMarkerElement(side, index) {
    const map = side === "left" ? this._leftMntByIndex : this._rightMntByIndex;
    return map && map.get(index) || null;
  }
  /**
   * Update the right→left rigid transform used by ghost-cursor mapping and
   * coupled panning. Pass {angle, tx, ty} (mntviz convention) or null to
   * disable. If coupled mode is active, the follower panel is re-synced live
   * — so callers can stream a freshly estimated transform as the user works.
   * @param {{angle:number, tx:number, ty:number}|null} t
   */
  setMatchTransform(t) {
    this._options.matchTransform = _isValidMatchTransform(t) ? { angle: t.angle, tx: t.tx, ty: t.ty } : null;
    if (this._coupledActive && this._coupledAnchorSide) {
      const follower = this._coupledAnchorSide === "left" ? "right" : "left";
      this._applyCoupledFollower(follower);
    }
  }
  /**
   * Set the dominant rotation (degrees) used by the "Align" context action.
   * @param {number|null} angle
   */
  setDominantAngle(angle) {
    this._options.dominantAngle = Number.isFinite(angle) ? angle : null;
  }
  /**
   * Install an elastic point-warp used by the ghost cursor instead of the
   * rigid `matchTransform`. This maps a point in one panel's image coords to
   * the other panel's — and, unlike the rigid transform, can interpolate
   * marked correspondences exactly (e.g. MLS / TPS).
   *
   * Coupled panning and Align still use the rigid `matchTransform` /
   * `dominantAngle` (they move a whole panel, which must stay rigid).
   *
   * @param {{rightToLeft:(x:number,y:number)=>{x:number,y:number},
   *          leftToRight:(x:number,y:number)=>{x:number,y:number}}|null} warp
   */
  setWarp(warp) {
    this._warp = warp && typeof warp.rightToLeft === "function" && typeof warp.leftToRight === "function" ? warp : null;
  }
  /**
   * Snapshot the pan/zoom/rotation of both panels. Pair with setView() to
   * preserve the framing across a rebuild (e.g. swapping the background image).
   * @returns {{left:object|null, right:object|null}}
   */
  getView() {
    const snap = (vw) => vw ? {
      tx: vw.viewState.translateX,
      ty: vw.viewState.translateY,
      scale: vw.viewState.scale,
      rotation: vw.viewState.rotation
    } : null;
    return { left: snap(this._leftViewer), right: snap(this._rightViewer) };
  }
  /**
   * Restore a snapshot from getView() onto both panels. Assumes the images
   * share dimensions with the snapshot (true for original↔enhanced of the
   * same capture).
   * @param {{left:object|null, right:object|null}} view
   */
  setView(view) {
    const apply = (vw, s) => {
      if (!vw || !s) return;
      vw.setRotation(s.rotation);
      vw.setScale(s.scale);
      vw.setTranslate(s.tx, s.ty);
    };
    apply(this._leftViewer, view && view.left);
    apply(this._rightViewer, view && view.right);
    this._updateSegments();
  }
  /**
   * Set which minutia markers a panel draws. **Connector lines are unaffected** —
   * they are positioned from the minutiae data, so `'none'` gives lines over a
   * clean image.
   *
   *   `'all'`     every marker (default)
   *   `'paired'`  only markers a connector lands on — the decluttered middle state:
   *               a dense panel drops to the endpoints you are actually reading,
   *               keeping the ridges legible without losing the correspondences.
   *   `'none'`    no markers.
   *
   * @param {'left'|'right'|'both'} side
   * @param {'all'|'paired'|'none'} mode
   */
  setMarkerVisibility(side, mode) {
    if (!MARKER_VISIBILITY.includes(mode)) {
      throw new Error(`mntviz MatchViewer: bad marker visibility ${mode}`);
    }
    for (const s of side === "both" ? ["left", "right"] : [side]) {
      if (s !== "left" && s !== "right") continue;
      this._markerVis[s] = mode;
      this._applyMarkerVisibility(s);
    }
  }
  /** @returns {'all'|'paired'|'none'} current marker visibility of `side`. */
  getMarkerVisibility(side) {
    return this._markerVis[side === "right" ? "right" : "left"];
  }
  /**
   * Show/hide all connector lines — the same state a double-click toggles, exposed
   * so it can be driven from code. Orthogonal to `setMarkerVisibility`: markers and
   * connectors are independent layers.
   * @param {boolean} visible
   */
  setSegmentsVisible(visible) {
    this._allSegmentsVisible = !!visible;
    if (this._allSegmentsVisible) this._showAllSegments();
    else this._hideAllSegments();
  }
  /** @returns {boolean} whether all connector lines are currently shown. */
  getSegmentsVisible() {
    return !!this._allSegmentsVisible;
  }
  /** all → paired → none → all. Skips 'paired' when there is nothing paired. */
  _cycleMarkerVisibility(side) {
    if (side !== "left" && side !== "right") return;
    const order = this._options.pairs.length ? MARKER_VISIBILITY : ["all", "none"];
    const i = order.indexOf(this._markerVis[side]);
    this.setMarkerVisibility(side, order[(i + 1) % order.length]);
  }
  _applyMarkerVisibility(side) {
    const viewer = side === "left" ? this._leftViewer : this._rightViewer;
    if (!viewer) return;
    const mode = this._markerVis[side];
    let paired = null;
    if (mode === "paired") {
      const key = side === "left" ? "leftIdx" : "rightIdx";
      paired = new Set(this._options.pairs.map((p) => p[key]));
    }
    for (const el of viewer.svgLayer.querySelectorAll(".mntviz-mnt-marker")) {
      const m = minutiaDataMap.get(el);
      const show = mode === "all" || mode === "paired" && m && paired.has(m._index);
      el.style.display = show ? "" : "none";
    }
  }
  /**
   * Replace the full set of correspondences and rebuild segments + marker
   * colors from scratch. Robust against arbitrary add/remove (no index-shift
   * bookkeeping). Cheap for the small pair counts of manual annotation.
   *
   * Each pair: { leftIdx, rightIdx, color?, alpha?, width?, similarity? }.
   * @param {Array<object>} pairs
   */
  setPairs(pairs) {
    if (!this._leftViewer || !this._rightViewer) {
      this._options.pairs = pairs.slice();
      return;
    }
    for (const line of this._segmentLines) line.remove();
    for (const hit of this._segmentHitLines) hit.remove();
    this._segmentLines = [];
    this._segmentHitLines = [];
    this._activePopupPairIdx = -1;
    this._resetAllMarkers();
    this._options.pairs = pairs.slice();
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i];
      const color = p.color || this._options.markerColor;
      this._applyMarkerPair("left", p.leftIdx, color, i);
      this._applyMarkerPair("right", p.rightIdx, color, i);
      this._buildPairSegment(p, i);
    }
    this._leftMntByPair = _indexMarkersByPair(this._leftViewer.svgLayer);
    this._rightMntByPair = _indexMarkersByPair(this._rightViewer.svgLayer);
    this._showAllSegments();
    this._applyMarkerVisibility("left");
    this._applyMarkerVisibility("right");
  }
  /** Reset marker color/opacity/_pairIndex to the unpaired neutral state. */
  _resetAllMarkers() {
    const reset = (map, viewerOpts) => {
      if (!map) return;
      for (const [, el] of map) {
        const m = minutiaDataMap.get(el);
        if (!m) continue;
        const baseColor = m._baseColor || this._options.markerColor;
        el.setAttribute("stroke", baseColor);
        m._color = baseColor;
        m._pairIndex = -1;
      }
    };
    reset(this._leftMntByIndex);
    reset(this._rightMntByIndex);
    for (const m of this._options.leftMinutiae) m._pairIndex = -1;
    for (const m of this._options.rightMinutiae) m._pairIndex = -1;
  }
  /** Color + tag a single marker (and its source minutia) for pair `pairIdx`. */
  _applyMarkerPair(side, idx, color, pairIdx) {
    const el = this.getMarkerElement(side, idx);
    const srcArr = side === "left" ? this._options.leftMinutiae : this._options.rightMinutiae;
    if (el) {
      const m = minutiaDataMap.get(el);
      if (m) {
        if (m._baseColor == null) m._baseColor = m._color || this._options.markerColor;
        el.setAttribute("stroke", color);
        m._color = color;
        m._pairIndex = pairIdx;
      }
    }
    if (srcArr[idx]) {
      srcArr[idx]._color = color;
      srcArr[idx]._pairIndex = pairIdx;
    }
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
  _onViewerTransform(side) {
    if (this._coupledActive && !this._syncingCoupled) {
      const followerSide = side === "left" ? "right" : "left";
      this._applyCoupledFollower(followerSide);
    }
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
    if (side && this._ghostSources[side]) {
      this._updateGhostCursor(side, e);
    } else {
      this._hideGhostCursor();
    }
  }
  _onOverlayPointerMove(e) {
    this._onHoverMove(e);
    const side = this._inferPointerSide(e.clientX, e.clientY);
    if (side && this._ghostSources[side]) {
      this._updateGhostCursor(side, e);
    } else {
      this._hideGhostCursor();
    }
  }
  _forwardToViewport(e) {
    const side = this._inferPointerSide(e.clientX, e.clientY);
    const viewport = side === "left" ? this._leftViewer?.viewport : side === "right" ? this._rightViewer?.viewport : null;
    if (!viewport) return;
    e.preventDefault();
    const init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: e.view,
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      button: e.button,
      buttons: e.buttons,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey
    };
    let clone2;
    if (e.type === "wheel") {
      clone2 = new WheelEvent("wheel", {
        ...init,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaZ: e.deltaZ,
        deltaMode: e.deltaMode
      });
    } else {
      clone2 = new MouseEvent(e.type, init);
    }
    viewport.dispatchEvent(clone2);
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
    const g = document.createElementNS(SVG_NS9, "g");
    g.classList.add("mntviz-ghost-cursor");
    g.style.display = "none";
    const circle = document.createElementNS(SVG_NS9, "circle");
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
    if (this._warp) {
      const mapped = side === "right" ? this._warp.rightToLeft(x, y) : this._warp.leftToRight(x, y);
      if (mapped && Number.isFinite(mapped.x) && Number.isFinite(mapped.y)) return mapped;
      return null;
    }
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
    if (this._contextMenuGhostBtn) {
      const ghostOn = side != null && this._ghostSources[side];
      this._contextMenuGhostBtn.textContent = `${ghostOn ? "\u2713 " : ""}Ghost`;
    }
    if (this._contextMenuCoupledBtn) {
      this._contextMenuCoupledBtn.textContent = `${this._coupledActive ? "\u2713 " : ""}Coupled`;
      this._contextMenuCoupledBtn.disabled = !_isValidMatchTransform(this._options.matchTransform);
    }
    if (this._contextMenuPointsBtn) {
      const mode = side != null ? this._markerVis[side] : "all";
      const n = this._options.pairs.length;
      const detail = mode === "paired" ? ` (${n})` : "";
      this._contextMenuPointsBtn.textContent = `Points: ${mode}${detail}`;
      this._contextMenuPointsBtn.disabled = side == null;
    }
  }
  _toggleGhostSource(side) {
    if (side !== "left" && side !== "right") return;
    this._ghostSources[side] = !this._ghostSources[side];
    this._hideGhostCursor(side === "left" ? "right" : "left");
  }
  _toggleCoupled(side) {
    if (side !== "left" && side !== "right") return;
    if (!_isValidMatchTransform(this._options.matchTransform)) return;
    if (this._coupledActive) {
      this._coupledActive = false;
      this._coupledAnchorSide = null;
      return;
    }
    this._coupledActive = true;
    this._coupledAnchorSide = side;
    const followerSide = side === "left" ? "right" : "left";
    this._applyCoupledFollower(followerSide);
  }
  /**
   * Compute the follower viewer's (tx, ty, scale, rotation) so that its
   * image-space content aligns with the anchor panel under matchTransform.
   *
   * Derivation: both viewers use F_X(p) = o_X + t_X + s_X·R(r_X)·(p − o_X)
   * with rotation around the image center. matchTransform = { α, t } maps
   * right-image → left-image via p_L = R(−α)·p_R + t (CSS rotate convention).
   * Setting F_R(p_R) = F_L(R(−α)·p_R + t) for all p_R yields:
   *   s_R = s_L,  r_R = r_L − α,
   *   t_R = (o_L − o_R) + t_L + s_L·R(r_L)·(t − o_L) + s_L·R(r_L − α)·o_R.
   * The left-as-follower case is the symmetric inverse.
   */
  _computeCoupledFollowerState(followerSide) {
    const mt = this._options.matchTransform;
    if (!_isValidMatchTransform(mt)) return null;
    if (!this._leftViewer || !this._rightViewer) return null;
    const alpha = mt.angle;
    const tm = { x: mt.tx, y: mt.ty };
    const lSize = this._leftViewer.imageSize;
    const rSize = this._rightViewer.imageSize;
    const oL = { x: lSize.width / 2, y: lSize.height / 2 };
    const oR = { x: rSize.width / 2, y: rSize.height / 2 };
    if (followerSide === "right") {
      const s = this._leftViewer.viewState;
      const rR = s.rotation - alpha;
      const a = _rotVec(s.scale, s.rotation, { x: tm.x - oL.x, y: tm.y - oL.y });
      const b = _rotVec(s.scale, rR, oR);
      return {
        scale: s.scale,
        rotation: rR,
        tx: oL.x - oR.x + s.translateX + a.x + b.x,
        ty: oL.y - oR.y + s.translateY + a.y + b.y
      };
    }
    if (followerSide === "left") {
      const s = this._rightViewer.viewState;
      const rL = s.rotation + alpha;
      const a = _rotVec(s.scale, rL, { x: oL.x - tm.x, y: oL.y - tm.y });
      const b = _rotVec(s.scale, s.rotation, oR);
      return {
        scale: s.scale,
        rotation: rL,
        tx: oR.x - oL.x + s.translateX + a.x - b.x,
        ty: oR.y - oL.y + s.translateY + a.y - b.y
      };
    }
    return null;
  }
  _applyCoupledFollower(followerSide) {
    const next = this._computeCoupledFollowerState(followerSide);
    if (!next) return;
    const follower = followerSide === "left" ? this._leftViewer : this._rightViewer;
    if (!follower) return;
    this._syncingCoupled = true;
    try {
      follower.setRotation(next.rotation);
      follower.setScale(next.scale);
      follower.setTranslate(next.tx, next.ty);
    } finally {
      this._syncingCoupled = false;
    }
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
      if (this._options.onMinutiaClick) {
        const handled = this._options.onMinutiaClick(side, m._index, m, e);
        if (handled) return;
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
  /**
   * Create the (hidden) segment line + hitbox for pair `i` and append them
   * to the overlay, wiring the hover/forwarding listeners. Pushes both into
   * the parallel `_segmentLines` / `_segmentHitLines` arrays at index `i`.
   */
  _buildPairSegment(p, i) {
    const sig = { signal: this._ac.signal };
    const line = document.createElementNS(SVG_NS9, "line");
    line.classList.add("mntviz-match-segment");
    line.setAttribute("stroke", p.color || this._options.markerColor);
    line.setAttribute("stroke-opacity", p.alpha != null ? p.alpha : 0.6);
    line.setAttribute("stroke-width", p.width != null ? p.width : 1);
    line.style.display = "none";
    this._overlaySvg.appendChild(line);
    this._segmentLines[i] = line;
    const hitLine = document.createElementNS(SVG_NS9, "line");
    hitLine.classList.add("mntviz-match-segment-hitbox");
    hitLine.dataset.pairIndex = String(i);
    hitLine.style.display = "none";
    this._overlaySvg.appendChild(hitLine);
    this._segmentHitLines[i] = hitLine;
    hitLine.addEventListener("mouseover", (e) => this._onMatchLineHoverIn(e), sig);
    hitLine.addEventListener("mouseout", (e) => this._onMatchLineHoverOut(e), sig);
    hitLine.addEventListener("mousemove", (e) => this._onOverlayPointerMove(e), sig);
    hitLine.addEventListener("wheel", (e) => this._forwardToViewport(e), { passive: false, ...sig });
    hitLine.addEventListener("mousedown", (e) => this._forwardToViewport(e), sig);
    hitLine.addEventListener("dblclick", (e) => this._forwardToViewport(e), sig);
    hitLine.addEventListener("contextmenu", (e) => this._forwardToViewport(e), sig);
    return line;
  }
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
    const g = document.createElementNS(SVG_NS9, "g");
    g.setAttribute("opacity", opacity);
    g.setAttribute("stroke", color);
    g.setAttribute("fill", "none");
    g.setAttribute("stroke-width", "1");
    const marker = createMarkerShape(shape, x, y, r);
    g.appendChild(marker);
    const line = document.createElementNS(SVG_NS9, "line");
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
function _normalizeMarkerVisibility(v) {
  const one = (x) => MARKER_VISIBILITY.includes(x) ? x : "all";
  return typeof v === "string" ? { left: one(v), right: one(v) } : { left: one(v && v.left), right: one(v && v.right) };
}
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
function _isValidMatchTransform(t) {
  return t != null && Number.isFinite(t.angle) && Number.isFinite(t.tx) && Number.isFinite(t.ty);
}
function _rotVec(scale, angleDeg, v) {
  const rad = angleDeg * (Math.PI / 180);
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return {
    x: scale * (c * v.x - s * v.y),
    y: scale * (s * v.x + c * v.y)
  };
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
function _indexMarkersByIndex(svgLayer) {
  const map = /* @__PURE__ */ new Map();
  for (const el of svgLayer.querySelectorAll(".mntviz-mnt-marker")) {
    const m = minutiaDataMap.get(el);
    if (m && m._index != null) {
      map.set(m._index, el);
    }
  }
  return map;
}

// src/multi-viewer.js
var _el3 = (tag, cls) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};
var MultiViewer = class {
  /**
   * @param {string|HTMLElement} hostOrSelector
   * @param {object} [options]
   * @param {Array<{title?: string}>} [options.panels=[]]
   * @param {boolean} [options.coupled=true]
   */
  constructor(hostOrSelector, { panels = [], coupled = true } = {}) {
    this._host = typeof hostOrSelector === "string" ? document.querySelector(hostOrSelector) : hostOrSelector;
    if (!this._host) throw new Error(`MultiViewer: host not found: ${hostOrSelector}`);
    this._coupled = coupled;
    this._syncing = false;
    this._viewers = [];
    this._buildDOM(panels);
  }
  /* ── Public API ──────────────────────────────────────────── */
  /** Returns the Viewer at the given panel index. */
  getViewer(idx) {
    return this._viewers[idx];
  }
  /** All Viewer instances (read-only copy). */
  get viewers() {
    return [...this._viewers];
  }
  /** Number of panels. */
  get length() {
    return this._viewers.length;
  }
  /** Enable or disable coupled navigation. */
  setCoupled(active) {
    this._coupled = !!active;
  }
  /** Whether coupled navigation is currently active. */
  get coupled() {
    return this._coupled;
  }
  /**
   * Load images into all panels simultaneously.
   * @param {string[]} srcs - One URL per panel; extra entries are ignored.
   */
  async loadImages(srcs) {
    const promises = srcs.map((src, i) => {
      if (i < this._viewers.length) return this._viewers[i].loadImage(src);
      return Promise.resolve();
    });
    await Promise.all(promises);
  }
  /* ── Internal ────────────────────────────────────────────── */
  _buildDOM(panels) {
    this._host.innerHTML = "";
    const container = _el3("div", "mntviz-multi-container");
    for (let i = 0; i < panels.length; i++) {
      const panel = _el3("div", "mntviz-multi-panel");
      if (panels[i].title) {
        const title = _el3("div", "mntviz-multi-title");
        title.textContent = panels[i].title;
        panel.appendChild(title);
      }
      const viewerHost = _el3("div", "mntviz-multi-viewer-host");
      panel.appendChild(viewerHost);
      container.appendChild(panel);
      const idx = i;
      const viewer = new Viewer(viewerHost, {
        minimap: false,
        onTransform: () => this._onViewerTransform(idx)
      });
      this._viewers.push(viewer);
    }
    this._host.appendChild(container);
  }
  _onViewerTransform(idx) {
    if (!this._coupled || this._syncing) return;
    this._syncing = true;
    try {
      const state = this._viewers[idx].viewState;
      for (let i = 0; i < this._viewers.length; i++) {
        if (i === idx) continue;
        this._viewers[i].setView(state);
      }
    } finally {
      this._syncing = false;
    }
  }
};

// src/tools.js
var SVG_NS10 = "http://www.w3.org/2000/svg";
var MODES = ["view", "minutia", "core", "delta", "roi", "ruler", "ridges", "pair"];
var DEFAULT_MODE_KEYS = {
  v: "view",
  m: "minutia",
  c: "core",
  d: "delta",
  r: "roi",
  l: "ruler",
  L: "ridges",
  p: "pair"
};
var MODE_LABELS = {
  view: "ver",
  minutia: "min\xFAcia",
  core: "n\xFAcleo",
  delta: "delta",
  roi: "ROI",
  ruler: "r\xE9gua",
  ridges: "cristas",
  pair: "par"
};
var GYRO = { G: "#22c55e", Y: "#facc15", R: "#ef4444", O: "#f97316" };
var GYRO_KEYS = { 1: "G", 2: "Y", 3: "R" };
var ToolModes = class extends Emitter {
  /**
   * @param {object} [opts]
   * @param {Record<string,string>} [opts.keys] - Tecla → modo (padrão DEFAULT_MODE_KEYS).
   * @param {string} [opts.mode='view']
   */
  constructor({ keys = DEFAULT_MODE_KEYS, mode = "view" } = {}) {
    super();
    this._keys = { ...keys };
    this._mode = mode;
    this._tools = /* @__PURE__ */ new Set();
    this._focus = null;
    this._viewerOff = /* @__PURE__ */ new Map();
    this._unbind = null;
  }
  get mode() {
    return this._mode;
  }
  /** Viewer que recebeu a última interação de mouse (ou null). */
  get focus() {
    return this._focus;
  }
  get tools() {
    return [...this._tools];
  }
  /** Registra uma ferramenta (FeatureEditor, CorrespondenceEditor, Ruler, RidgeCount...). */
  add(tool) {
    if (!tool || this._tools.has(tool)) return tool;
    this._tools.add(tool);
    if (typeof tool._attachModes === "function") tool._attachModes(this);
    for (const v of _viewersOf(tool)) this._watchViewer(v);
    if (typeof tool.setMode === "function") tool.setMode(this._mode, null);
    return tool;
  }
  remove(tool) {
    this._tools.delete(tool);
    if (tool && typeof tool._attachModes === "function") tool._attachModes(null);
  }
  /** Troca o modo. Repetir o modo atual também notifica (repeat = true). */
  setMode(mode, { source = null } = {}) {
    const prev = this._mode;
    this._mode = String(mode);
    for (const v of this._viewerOff.keys()) {
      v.viewport.classList.remove(`mntviz-mode-${prev}`);
      v.viewport.classList.add(`mntviz-mode-${this._mode}`);
    }
    for (const t of this._tools) {
      if (typeof t.setMode === "function") t.setMode(this._mode, prev);
    }
    this.emit("mode", { mode: this._mode, prev, repeat: prev === this._mode, source });
  }
  /** Marca o viewer em foco (as teclas de desfazer valem para as ferramentas dele). */
  setFocus(viewer) {
    if (viewer === this._focus) return;
    this._focus = viewer;
    this.emit("focus", { viewer });
  }
  /**
   * Trata uma tecla: primeiro as ferramentas (uma operação em curso, como a ROI
   * aberta, consome o Esc), depois as teclas de modo e o Esc (volta a 'view').
   * Devolve true se alguém consumiu a tecla (e chama preventDefault).
   */
  handleKey(e) {
    if (_isTyping(e)) return false;
    const ctx = { mode: this._mode, focus: this._focus, modes: this };
    for (const t of this._tools) {
      if (typeof t.handleKey === "function" && t.handleKey(e, ctx)) {
        e.preventDefault();
        return true;
      }
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key === "Escape") {
      if (this._mode !== "view") {
        this.setMode("view", { source: "key" });
        e.preventDefault();
        return true;
      }
      return false;
    }
    let mode = this._keys[e.key];
    if (mode == null && !e.shiftKey && typeof e.key === "string") mode = this._keys[e.key.toLowerCase()];
    if (mode == null) return false;
    this.setMode(mode, { source: "key" });
    e.preventDefault();
    return true;
  }
  /** Liga o teclado (keydown em `target`, padrão window). Devolve a função que desliga. */
  bind(target = window) {
    if (this._unbind) this._unbind();
    const fn = (e) => this.handleKey(e);
    target.addEventListener("keydown", fn);
    this._unbind = () => {
      target.removeEventListener("keydown", fn);
      this._unbind = null;
    };
    return this._unbind;
  }
  destroy() {
    if (this._unbind) this._unbind();
    for (const off of this._viewerOff.values()) off();
    this._viewerOff.clear();
    this._tools.clear();
    this.removeAllListeners();
  }
  /** @private Foco = viewer onde o mouse desceu por último. */
  _watchViewer(viewer) {
    if (!viewer || this._viewerOff.has(viewer)) return;
    const vp = viewer.viewport;
    const fn = () => this.setFocus(viewer);
    vp.addEventListener("mousedown", fn, true);
    vp.classList.add(`mntviz-mode-${this._mode}`);
    this._viewerOff.set(viewer, () => vp.removeEventListener("mousedown", fn, true));
  }
};
var History = class {
  constructor({ limit = 200 } = {}) {
    this._undo = [];
    this._redo = [];
    this._limit = limit;
  }
  push(snapshot) {
    this._undo.push(snapshot);
    if (this._undo.length > this._limit) this._undo.shift();
    this._redo.length = 0;
  }
  undo(current) {
    if (!this._undo.length) return null;
    const prev = this._undo.pop();
    this._redo.push(current);
    return prev;
  }
  redo(current) {
    if (!this._redo.length) return null;
    const next = this._redo.pop();
    this._undo.push(current);
    return next;
  }
  get canUndo() {
    return this._undo.length > 0;
  }
  get canRedo() {
    return this._redo.length > 0;
  }
  get sizes() {
    return { undo: this._undo.length, redo: this._redo.length };
  }
  clear() {
    this._undo.length = 0;
    this._redo.length = 0;
  }
};
function svgEl(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(SVG_NS10, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === void 0 || v === false) continue;
    el.setAttribute(k, String(v));
  }
  if (parent) parent.appendChild(el);
  return el;
}
function norm360(a) {
  const r = Number(a) % 360;
  return (r < 0 ? r + 360 : r) + 0;
}
function isoAngle(x0, y0, x1, y1) {
  return norm360(Math.atan2(-(y1 - y0), x1 - x0) * 180 / Math.PI);
}
function tipPoint(x, y, thetaDeg, len) {
  const r = thetaDeg * Math.PI / 180;
  return { x: x + len * Math.cos(r), y: y - len * Math.sin(r) };
}
function viewScale(viewer) {
  const s = viewer && viewer.viewState ? viewer.viewState.scale : 1;
  return s > 0 ? s : 1;
}
function uprightTransform(viewer, x, y, { exportMode = false } = {}) {
  if (exportMode) return `translate(${x}, ${y})`;
  const { scale, rotation, flipX } = viewer.viewState;
  const s = scale > 0 ? scale : 1;
  return `translate(${x}, ${y})${flipX ? " scale(-1, 1)" : ""} rotate(${-rotation}) scale(${1 / s})`;
}
function screenMapper(viewer) {
  const ctm = viewer.svgLayer.getScreenCTM();
  if (!ctm) return () => ({ x: NaN, y: NaN });
  return (x, y) => ({ x: ctm.a * x + ctm.c * y + ctm.e, y: ctm.b * x + ctm.d * y + ctm.f });
}
function insideImage(viewer, x, y) {
  const { width, height } = viewer.imageSize;
  return x >= 0 && y >= 0 && x < width && y < height;
}
function clone(obj) {
  return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}
function onViewFrame(viewer, fn) {
  let pending = 0, dead = false;
  const off = viewer.on("view", () => {
    if (pending || dead) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      if (!dead) fn();
    });
  });
  return () => {
    dead = true;
    if (pending) {
      cancelAnimationFrame(pending);
      pending = 0;
    }
    off();
  };
}
function stopEvent(e) {
  e.preventDefault();
  e.stopPropagation();
}
function _isTyping(e) {
  const t = e.target;
  if (!t || t === window || t === document) return false;
  const tag = (t.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || !!t.isContentEditable;
}
function _viewersOf(tool) {
  if (!tool) return [];
  if (Array.isArray(tool.viewers)) return tool.viewers;
  return tool.viewer ? [tool.viewer] : [];
}

// src/feature-editor.js
var MINUTIA_TYPES = ["ending", "bifurcation", "unknown"];
var EDIT_MODES = /* @__PURE__ */ new Set(["view", "minutia", "core", "delta", "roi"]);
var CREATE_MODES = /* @__PURE__ */ new Set(["minutia", "core", "delta"]);
var SHAPE_OF_TYPE = { ending: "circle", bifurcation: "square", unknown: "diamond" };
var TYPE_ALIASES = {
  1: "ending",
  2: "bifurcation",
  0: "unknown",
  ending: "ending",
  bifurcation: "bifurcation",
  unknown: "unknown",
  ridgeending: "ending",
  ridgebifurcation: "bifurcation",
  end: "ending",
  bif: "bifurcation",
  other: "unknown"
};
var DEFAULTS7 = {
  layer: "features",
  z: 25,
  suggestionLayer: "suggestions",
  suggestionZ: 24,
  ppi: 500,
  markerRadius: null,
  segmentLength: null,
  color: null,
  suggestionColor: "#38bdf8",
  roiColor: "#a78bfa",
  selectColor: "#ffffff",
  round: true,
  angleStep: 1,
  defaultConfidence: "G",
  phase: "analysis",
  newType: "ending",
  readOnly: false,
  showConfidence: false,
  hitRadius: 9,
  tipRadius: 8,
  dragThreshold: 4,
  selection: true,
  source: null
};
var FeatureEditor = class extends Emitter {
  /**
   * @param {import('./viewer.js').Viewer} viewer
   * @param {object} [opts] - Ver DEFAULTS. `features` e `suggestions` iniciais;
   *        `color(item)` dá a cor de uma feature aceita (padrão: GYRO pela confiança).
   */
  constructor(viewer, opts = {}) {
    super();
    this.viewer = viewer;
    this._o = { ...DEFAULTS7, ...opts };
    this._mode = "view";
    this._items = [];
    this._roi = null;
    this._meta = { frgp: 0, absent: [] };
    this._sug = [];
    this._sugSource = null;
    this._focusSid = null;
    this._selected = /* @__PURE__ */ new Set();
    this._nextId = 1;
    this._history = new History();
    this._drag = null;
    this._roiDraft = null;
    this._roiCursor = null;
    this._exportMode = false;
    this._newType = this._o.newType;
    this._defaultConfidence = this._o.defaultConfidence;
    this._phase = this._o.phase;
    this._readOnly = !!this._o.readOnly;
    this._raf = 0;
    this._syncing = false;
    this._layer = viewer.layers.ensure(this._o.layer, { kind: "svg", z: this._o.z });
    this._sugLayer = viewer.layers.ensure(this._o.suggestionLayer, { kind: "svg", z: this._o.suggestionZ });
    this._g = svgEl("g", { class: "mntviz-fe" });
    this._sg = svgEl("g", { class: "mntviz-fe mntviz-fe-suggestions" });
    this._layer.el.appendChild(this._g);
    this._sugLayer.el.appendChild(this._sg);
    this._ac = new AbortController();
    const sig = { signal: this._ac.signal };
    const vp = viewer.viewport;
    vp.addEventListener("mousedown", (e) => this._down(e), { capture: true, ...sig });
    window.addEventListener("mousemove", (e) => this._move(e), { capture: true, ...sig });
    window.addEventListener("mouseup", (e) => this._up(e), { capture: true, ...sig });
    vp.addEventListener("dblclick", (e) => this._dbl(e), { capture: true, ...sig });
    this._offView = onViewFrame(viewer, () => this.render());
    this._offSel = viewer.selection && this._o.selection ? viewer.selection.on("change", (ev) => this._fromSharedSelection(ev)) : () => {
    };
    if (opts.features) this.setFeatures(opts.features, { silent: true });
    if (opts.suggestions) this.setSuggestions(opts.suggestions, { source: opts.suggestionSource || null });
    this.render();
  }
  /* ── estado e consultas ─────────────────────────────────── */
  get mode() {
    return this._mode;
  }
  get layerName() {
    return this._o.layer;
  }
  get ppi() {
    return this._o.ppi;
  }
  get readOnly() {
    return this._readOnly;
  }
  get canUndo() {
    return this._history.canUndo;
  }
  get canRedo() {
    return this._history.canRedo;
  }
  get newType() {
    return this._newType;
  }
  get defaultConfidence() {
    return this._defaultConfidence;
  }
  get phase() {
    return this._phase;
  }
  get roi() {
    return this._roi ? this._roi.map((p) => [p[0], p[1]]) : null;
  }
  get selected() {
    return [...this._selected];
  }
  get selectedItems() {
    return this.selected.map((id) => this.get(id)).filter(Boolean);
  }
  get focusedSuggestion() {
    const s = this._sugById(this._focusSid);
    return s ? { ...s } : null;
  }
  /** Todas as features (cópias): [{id, kind, x, y, theta, type, ...}]. */
  get items() {
    return this._items.map((it) => ({ ...it }));
  }
  /** Uma feature pelo id (cópia) ou null. */
  get(id) {
    const it = this._items.find((i) => i.id === id);
    return it ? { ...it } : null;
  }
  /** Sugestões com o estado de cada uma ('open' | 'accepted' | 'rejected'). */
  get suggestions() {
    return this._sug.map((s) => ({ ...s }));
  }
  setPpi(ppi) {
    this._o.ppi = Number(ppi);
    this.render();
    return this;
  }
  setReadOnly(on) {
    this._readOnly = !!on;
    this._drag = null;
    this._roiDraft = null;
    this.render();
    return this;
  }
  /** Fase gravada nas marcas novas; em 'comparison' as novas nascem laranja (O). */
  setPhase(phase) {
    this._phase = String(phase);
    this._emitTool();
    return this;
  }
  /** Confiança padrão das próximas marcas (G/Y/R/O). */
  setDefaultConfidence(c) {
    this._defaultConfidence = c;
    this._emitTool();
    return this;
  }
  /** Campos de análise do vestígio: {frgp, pattern, value, absent}. */
  setMeta(meta = {}) {
    const before = this._snap();
    this._meta = { ...this._meta, ...clone(meta) };
    this._commit("meta", before, []);
    return this;
  }
  get meta() {
    return clone(this._meta);
  }
  /* ── modos e teclado ────────────────────────────────────── */
  /** Troca o modo (chamado pelo ToolModes; prev === mode = tecla repetida). */
  setMode(mode, prev = void 0) {
    const was = this._mode;
    this._mode = String(mode);
    if (this._mode === "minutia" && was === "minutia" && prev === "minutia") {
      this._newType = this._newType === "ending" ? "bifurcation" : "ending";
      const mins = this.selectedItems.filter((i) => i.kind === "minutia").map((i) => i.id);
      if (mins.length && !this._readOnly) this.setType(mins, this._newType);
      this._emitTool();
    }
    if (this._mode !== "roi" && this._roiDraft) {
      this._roiDraft = null;
    }
    if (!EDIT_MODES.has(this._mode)) this._drag = null;
    this.render();
  }
  /** Trata uma tecla; devolve true se consumiu. */
  handleKey(e, ctx = null) {
    const mode = ctx ? ctx.mode : this._mode;
    if (!EDIT_MODES.has(mode)) return false;
    if (ctx && ctx.focus && ctx.focus !== this.viewer) return false;
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (k === "z" || k === "Z")) {
      if (e.shiftKey) this.redo();
      else this.undo();
      return true;
    }
    if (ctrl && (k === "y" || k === "Y")) {
      this.redo();
      return true;
    }
    if (ctrl || e.altKey) return false;
    if (k === "Escape") {
      if (this._drag) {
        this._cancelDrag();
        return true;
      }
      if (this._roiDraft) {
        this._roiDraft = null;
        this.render();
        return true;
      }
      if (this._selected.size) {
        this._setSelected([]);
        return true;
      }
      return false;
    }
    if (mode === "roi") {
      if (k === "Enter" && this._roiDraft) {
        this._closeRoi();
        return true;
      }
      if (k === "Backspace" && this._roiDraft) {
        this._roiDraft.pop();
        if (!this._roiDraft.length) this._roiDraft = null;
        this.render();
        return true;
      }
      if ((k === "Delete" || k === "Backspace") && this._roi && !this._readOnly) {
        this.setRoi(null);
        return true;
      }
    }
    if (k === "Delete" || k === "Backspace") {
      if (!this._selected.size || this._readOnly) return false;
      this.remove(this.selected);
      return true;
    }
    if (GYRO_KEYS[k]) {
      this._defaultConfidence = GYRO_KEYS[k];
      if (this._selected.size && !this._readOnly) this.setConfidence(this.selected, GYRO_KEYS[k]);
      this._emitTool();
      return true;
    }
    if (k === "t" || k === "T") {
      if (!this._selected.size || this._readOnly) return false;
      this.cycleType(this.selected);
      return true;
    }
    if (k === "a") return this.accept("focused").length > 0;
    if (k === "A") return this.accept("all").length > 0;
    if (k === "x" || k === "X") return this.reject("focused").length > 0;
    return false;
  }
  /* ── edição programática (cada chamada é um passo de desfazer) ─ */
  /** Cria uma feature. kind: 'minutia' | 'core' | 'delta'. Devolve o id. */
  add(kind, props = {}) {
    const before = this._snap();
    const it = this._newItem(kind, props.x, props.y, props);
    this._items.push(it);
    this._commit("add", before, [it.id]);
    return it.id;
  }
  move(id, x, y) {
    return this._edit("move", [id], (it) => {
      it.x = this._coord(x);
      it.y = this._coord(y);
    });
  }
  rotate(id, theta) {
    return this._edit("rotate", [id], (it) => {
      it.theta = this._angle(theta);
    });
  }
  remove(ids) {
    const set = new Set(_asArray2(ids));
    if (!set.size) return false;
    const before = this._snap();
    const n0 = this._items.length;
    this._items = this._items.filter((it) => !set.has(it.id));
    if (this._items.length === n0) return false;
    for (const id of set) this._selected.delete(id);
    this._pushSelection();
    this._commit("delete", before, [...set]);
    return true;
  }
  /** Muda o tipo: minúcia ending|bifurcation|unknown; singularidade core|delta. */
  setType(ids, type) {
    const t = String(type).toLowerCase();
    return this._edit("type", ids, (it) => {
      if (it.kind === "minutia" && MINUTIA_TYPES.includes(t)) it.type = t;
      else if (it.kind !== "minutia" && (t === "core" || t === "delta")) it.kind = t;
    });
  }
  /** Alterna o tipo: terminação → bifurcação → desconhecida; núcleo ↔ delta. */
  cycleType(ids) {
    return this._edit("type", ids, (it) => {
      if (it.kind === "minutia") {
        it.type = MINUTIA_TYPES[(MINUTIA_TYPES.indexOf(it.type) + 1) % MINUTIA_TYPES.length];
      } else {
        it.kind = it.kind === "core" ? "delta" : "core";
      }
    });
  }
  setConfidence(ids, confidence) {
    return this._edit("confidence", ids, (it) => {
      it.confidence = confidence || void 0;
    });
  }
  /** Raio de incerteza da posição (px) e do ângulo (graus). */
  setUncertainty(ids, { coord_unc, theta_unc } = {}) {
    return this._edit("uncertainty", ids, (it) => {
      if (coord_unc !== void 0) it.coord_unc = coord_unc == null ? void 0 : Math.max(0, Number(coord_unc));
      if (theta_unc !== void 0) it.theta_unc = theta_unc == null ? void 0 : Math.max(0, Number(theta_unc));
    });
  }
  /** Define a ROI (polígono [[x, y], ...] com 3+ vértices) ou a apaga (null). */
  setRoi(points) {
    const before = this._snap();
    this._roi = points && points.length >= 3 ? points.map((p) => [this._coord(p[0]), this._coord(p[1])]) : null;
    this._commit("roi", before, []);
    return this;
  }
  /** Seleciona ids (add: soma à seleção atual). */
  select(ids, { add = false } = {}) {
    const next = add ? new Set(this._selected) : /* @__PURE__ */ new Set();
    for (const id of _asArray2(ids)) if (this._items.some((i) => i.id === id)) next.add(id);
    this._setSelected([...next]);
    return this;
  }
  clearSelection() {
    this._setSelected([]);
    return this;
  }
  /** Troca todas as features (Features do contrato ou listas no formato do mntviz). */
  setFeatures(f, { silent = false, resetHistory = true } = {}) {
    const before = this._snap();
    this._items = [];
    this._nextId = 1;
    const feats = f || {};
    for (const m of feats.minutiae || (Array.isArray(f) ? f : [])) this._items.push(this._importItem("minutia", m));
    for (const c of feats.cores || []) this._items.push(this._importItem("core", c));
    for (const d of feats.deltas || []) this._items.push(this._importItem("delta", d));
    this._roi = feats.roi && feats.roi.length >= 3 ? feats.roi.map((p) => [Number(p[0]), Number(p[1])]) : null;
    const { frgp = 0, pattern, value, absent = [] } = feats;
    this._meta = { frgp, absent: [...absent] };
    if (pattern != null) this._meta.pattern = pattern;
    if (value != null) this._meta.value = value;
    if (feats.ppi) this._o.ppi = Number(feats.ppi);
    this._selected.clear();
    if (resetHistory) this._history.clear();
    if (!silent) this._emitChange("set", before, this._items.map((i) => i.id));
    this.render();
    return this;
  }
  /* ── sugestões ──────────────────────────────────────────── */
  /**
   * Sugestões do algoritmo (camada tracejada, separada das respostas):
   * Features-like {minutiae, cores, deltas} ou uma lista de minúcias.
   * `source` = {kind: 'algo', id, version, params_hash} vai na origem do aceito.
   */
  setSuggestions(sug, { source = null } = {}) {
    this._sug = [];
    let sid = 0;
    const s = sug || {};
    const push = (kind, m) => {
      const it = this._importItem(kind, m, { keepFloat: true });
      this._sug.push({
        sid: sid++,
        kind,
        x: it.x,
        y: it.y,
        theta: it.theta,
        type: it.type,
        quality: it.quality,
        status: "open"
      });
    };
    for (const m of s.minutiae || (Array.isArray(sug) ? sug : [])) push("minutia", m);
    for (const c of s.cores || []) push("core", c);
    for (const d of s.deltas || []) push("delta", d);
    this._sugSource = source ? clone(source) : null;
    this._focusSid = null;
    this.render();
    this.emit("suggestions", { n: this._sug.length, source: this._sugSource });
    return this;
  }
  /** Aceita sugestões ('focused', 'all' ou lista de sid). Devolve os ids criados. */
  accept(which = "focused") {
    const list = this._resolveSug(which);
    if (!list.length || this._readOnly) return [];
    const before = this._snap();
    const ids = [];
    for (const s of list) {
      s.status = "accepted";
      const it = this._newItem(s.kind, s.x, s.y, { theta: s.theta, type: s.type, quality: s.quality });
      it.origin = { ...this._sugSource || { kind: "algo" }, sid: s.sid };
      this._items.push(it);
      ids.push(it.id);
    }
    this._focusNextOpen(list[list.length - 1].sid);
    this._commit("accept", before, ids);
    return ids;
  }
  /** Rejeita sugestões ('focused', 'all' ou lista de sid). Devolve os sid rejeitados. */
  reject(which = "focused") {
    const list = this._resolveSug(which);
    if (!list.length || this._readOnly) return [];
    const before = this._snap();
    for (const s of list) s.status = "rejected";
    this._focusNextOpen(list[list.length - 1].sid);
    this._commit("reject", before, []);
    return list.map((s) => s.sid);
  }
  /** Foco na próxima (ou anterior) sugestão aberta. */
  focusNext(dir = 1) {
    const open = this._sug.filter((s) => s.status === "open");
    if (!open.length) {
      this._setFocus(null);
      return null;
    }
    const i = open.findIndex((s) => s.sid === this._focusSid);
    const next = open[i < 0 ? dir > 0 ? 0 : open.length - 1 : (i + dir + open.length) % open.length];
    this._setFocus(next.sid);
    return { ...next };
  }
  focusPrev() {
    return this.focusNext(-1);
  }
  /**
   * Marca de laranja (O, fase 'comparison') as features sem correspondente na
   * linha de base (por exemplo, a análise travada A0): mesmo tipo de feature a
   * até `tol` px. Devolve os ids marcados.
   */
  markNewAgainst(baseline, { tol = 4 } = {}) {
    const base = [];
    const b = baseline || {};
    for (const m of b.minutiae || []) base.push({ kind: "minutia", x: Number(m.x), y: Number(m.y) });
    for (const c of b.cores || []) base.push({ kind: "core", x: Number(c.x), y: Number(c.y) });
    for (const d of b.deltas || []) base.push({ kind: "delta", x: Number(d.x), y: Number(d.y) });
    const ids = this._items.filter((it) => !base.some((q) => q.kind === it.kind && Math.hypot(q.x - it.x, q.y - it.y) <= tol)).map((it) => it.id);
    if (!ids.length) return [];
    this._edit("diff", ids, (it) => {
      it.confidence = "O";
      it.phase = "comparison";
    });
    return ids;
  }
  /* ── desfazer ───────────────────────────────────────────── */
  undo() {
    const cur = this._snap();
    const prev = this._history.undo(cur);
    if (!prev) return false;
    this._load(prev);
    this._emitChange("undo", cur, []);
    this.render();
    return true;
  }
  redo() {
    const cur = this._snap();
    const next = this._history.redo(cur);
    if (!next) return false;
    this._load(next);
    this._emitChange("redo", cur, []);
    this.render();
    return true;
  }
  /* ── saída ──────────────────────────────────────────────── */
  /** Features no formato do contrato (EFS-JSON v0). */
  toFeatures() {
    const out = {
      ppi: this._o.ppi,
      minutiae: [],
      cores: [],
      deltas: [],
      roi: this.roi,
      frgp: this._meta.frgp ?? 0,
      absent: [...this._meta.absent || []],
      conventions: { angle: "iso", coords: "image" }
    };
    if (this._meta.pattern != null) out.pattern = this._meta.pattern;
    if (this._meta.value != null) out.value = this._meta.value;
    if (this._o.source) out.source = clone(this._o.source);
    for (const it of this._items) {
      if (it.kind === "minutia") {
        out.minutiae.push(_strip({
          x: it.x,
          y: it.y,
          theta_deg_iso: it.theta,
          type: it.type,
          quality: it.quality,
          coord_unc: it.coord_unc,
          theta_unc: it.theta_unc,
          confidence: it.confidence,
          phase: it.phase
        }));
      } else {
        (it.kind === "core" ? out.cores : out.deltas).push(_strip({
          x: it.x,
          y: it.y,
          type: it.kind,
          theta_deg_iso: it.theta,
          confidence: it.confidence
        }));
      }
    }
    return out;
  }
  /** Estado completo do editor (JSON). */
  serialize() {
    return {
      version: 1,
      layer: this._o.layer,
      ppi: this._o.ppi,
      phase: this._phase,
      nextId: this._nextId,
      items: clone(this._items),
      roi: this.roi,
      meta: clone(this._meta),
      suggestions: { source: clone(this._sugSource), items: clone(this._sug) }
    };
  }
  /** Aplica um estado de serialize() (zera o histórico). */
  restore(state) {
    if (!state) return this;
    this._items = clone(state.items || []);
    this._roi = state.roi ? clone(state.roi) : null;
    this._meta = clone(state.meta || { frgp: 0, absent: [] });
    this._sug = clone(state.suggestions && state.suggestions.items || []);
    this._sugSource = clone(state.suggestions && state.suggestions.source || null);
    this._nextId = Math.max(state.nextId || 1, ...this._items.map((i) => i.id + 1), 1);
    if (state.ppi) this._o.ppi = state.ppi;
    if (state.phase) this._phase = state.phase;
    this._selected.clear();
    this._history.clear();
    this.render();
    return this;
  }
  beginExport() {
    this._exportMode = true;
    this.render();
  }
  endExport() {
    this._exportMode = false;
    this.render();
  }
  destroy() {
    this._ac.abort();
    this._offView();
    this._offSel();
    this._g.remove();
    this._sg.remove();
    this.removeAllListeners();
  }
  /* ── desenho ────────────────────────────────────────────── */
  render() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
    if (!this._g.isConnected) this._layer.el.appendChild(this._g);
    if (!this._sg.isConnected) this._sugLayer.el.appendChild(this._sg);
    this._g.replaceChildren();
    this._sg.replaceChildren();
    const ex = this._exportMode;
    this._drawRoi();
    for (const s of this._sug) {
      if (s.status !== "open") continue;
      this._glyph(this._sg, s, this._o.suggestionColor, { dashed: true, focused: !ex && s.sid === this._focusSid });
    }
    for (const it of this._items) {
      this._glyph(this._g, it, this._colorOf(it), { selected: !ex && this._selected.has(it.id) });
    }
  }
  _scheduleRender() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this.render();
    });
  }
  _colorOf(it) {
    if (typeof this._o.color === "function") {
      const c = this._o.color({ ...it });
      if (c) return c;
    }
    return GYRO[it.confidence] || GYRO.G;
  }
  _radius(it) {
    const base = this._o.markerRadius != null ? this._o.markerRadius : 5 * this._o.ppi / 500;
    return it.kind === "core" ? base * 1.35 : it.kind === "delta" ? base * 1.45 : base;
  }
  _segLen(it) {
    const base = this._o.segmentLength != null ? this._o.segmentLength : 13 * this._o.ppi / 500;
    return it.kind === "minutia" ? base : base * 1.25;
  }
  _glyph(parent, it, color, { dashed = false, selected = false, focused = false } = {}) {
    const s = this._exportMode ? 1 : viewScale(this.viewer);
    const r = this._radius(it);
    const L = this._segLen(it);
    const g = svgEl("g", {
      class: `mntviz-fe-item mntviz-fe-${it.kind}${dashed ? " mntviz-fe-suggestion" : ""}${selected ? " mntviz-fe-selected" : ""}`,
      "data-id": dashed ? null : it.id,
      "data-sid": dashed ? it.sid : null,
      "data-kind": it.kind
    }, parent);
    const stroke = { stroke: color, "stroke-width": 1.7, "vector-effect": "non-scaling-stroke" };
    if (dashed) stroke["stroke-dasharray"] = "3 2";
    if (!dashed && it.coord_unc > 0) {
      svgEl("circle", {
        cx: it.x,
        cy: it.y,
        r: it.coord_unc,
        fill: color,
        "fill-opacity": 0.08,
        stroke: color,
        "stroke-opacity": 0.55,
        "stroke-width": 1,
        "vector-effect": "non-scaling-stroke",
        class: "mntviz-fe-unc"
      }, g);
    }
    if (!dashed && it.theta_unc > 0 && it.theta != null) {
      const u = Math.min(it.theta_unc, 179.9);
      const a = tipPoint(it.x, it.y, it.theta - u, L), b = tipPoint(it.x, it.y, it.theta + u, L);
      svgEl("path", {
        d: `M ${it.x} ${it.y} L ${a.x} ${a.y} A ${L} ${L} 0 ${2 * u > 180 ? 1 : 0} 0 ${b.x} ${b.y} Z`,
        fill: color,
        "fill-opacity": 0.16,
        stroke: "none",
        class: "mntviz-fe-thetaunc"
      }, g);
    }
    const shapeName = it.kind === "minutia" ? SHAPE_OF_TYPE[it.type] || "circle" : it.kind === "core" ? "circle" : "triangle";
    if (selected || focused) {
      const halo = createMarkerShape(shapeName, it.x, it.y, r + 2.2 / s);
      _attrs(halo, {
        stroke: focused ? "#fde047" : this._o.selectColor,
        "stroke-width": 4.5,
        "stroke-opacity": 0.9,
        fill: "none",
        "vector-effect": "non-scaling-stroke",
        class: "mntviz-fe-halo"
      });
      g.appendChild(halo);
    }
    const shape = createMarkerShape(shapeName, it.x, it.y, r);
    _attrs(shape, { ...stroke, fill: "none", class: "mntviz-fe-shape" });
    g.appendChild(shape);
    if (it.kind === "core") {
      svgEl("circle", { cx: it.x, cy: it.y, r: Math.max(0.8, r * 0.25), fill: color, stroke: "none" }, g);
    }
    if (it.theta != null && Number.isFinite(it.theta)) {
      const t = tipPoint(it.x, it.y, it.theta, L);
      const st = tipPoint(it.x, it.y, it.theta, r);
      svgEl("line", {
        x1: st.x,
        y1: st.y,
        x2: t.x,
        y2: t.y,
        ...stroke,
        "stroke-linecap": "round",
        class: "mntviz-fe-dir"
      }, g);
      if (selected && !this._readOnly) {
        svgEl("circle", {
          cx: t.x,
          cy: t.y,
          r: 3.2 / s,
          fill: color,
          stroke: "#000",
          "stroke-width": 1,
          "vector-effect": "non-scaling-stroke",
          class: "mntviz-fe-tip"
        }, g);
      }
    }
    if (this._o.showConfidence && !dashed && it.confidence) {
      const lg = svgEl("g", { transform: uprightTransform(this.viewer, it.x, it.y, { exportMode: this._exportMode }) }, g);
      const tx = svgEl("text", {
        x: 7,
        y: 12,
        "font-size": 10,
        "font-family": "sans-serif",
        fill: color,
        stroke: "#000",
        "stroke-width": 2.5,
        "paint-order": "stroke"
      }, lg);
      tx.textContent = it.confidence;
    }
    return g;
  }
  _drawRoi() {
    const pts = this._roi;
    const color = this._o.roiColor;
    const s = this._exportMode ? 1 : viewScale(this.viewer);
    if (pts && pts.length >= 3) {
      svgEl("polygon", {
        points: pts.map((p) => p.join(",")).join(" "),
        fill: color,
        "fill-opacity": 0.06,
        stroke: color,
        "stroke-width": 1.8,
        "vector-effect": "non-scaling-stroke",
        class: "mntviz-fe-roi"
      }, this._g);
      if (this._mode === "roi" && !this._exportMode) {
        for (const p of pts) {
          svgEl("rect", {
            x: p[0] - 3 / s,
            y: p[1] - 3 / s,
            width: 6 / s,
            height: 6 / s,
            fill: color,
            stroke: "#000",
            "stroke-width": 1,
            "vector-effect": "non-scaling-stroke"
          }, this._g);
        }
      }
    }
    const d = this._roiDraft;
    if (d && d.length && !this._exportMode) {
      const all = this._roiCursor ? [...d, this._roiCursor] : d;
      svgEl("polyline", {
        points: all.map((p) => p.join(",")).join(" "),
        fill: "none",
        stroke: color,
        "stroke-width": 1.6,
        "stroke-dasharray": "4 3",
        "vector-effect": "non-scaling-stroke",
        class: "mntviz-fe-roi-draft"
      }, this._g);
      for (const p of d) {
        svgEl("circle", {
          cx: p[0],
          cy: p[1],
          r: 3 / s,
          fill: color,
          stroke: "#000",
          "stroke-width": 1,
          "vector-effect": "non-scaling-stroke"
        }, this._g);
      }
    }
  }
  /* ── mouse ──────────────────────────────────────────────── */
  _img(e) {
    return this.viewer.screenToImageCoords(e.clientX, e.clientY);
  }
  _down(e) {
    if (e.button !== 0 || !EDIT_MODES.has(this._mode)) return;
    if (this._mode === "roi") {
      this._roiDown(e);
      return;
    }
    const hit = this._hit(e);
    if (hit) {
      stopEvent(e);
      const it = this._items.find((i) => i.id === hit.id);
      if (e.shiftKey) {
        const next = new Set(this._selected);
        if (next.has(it.id)) next.delete(it.id);
        else next.add(it.id);
        this._setSelected([...next]);
      } else if (!this._selected.has(it.id)) {
        this._setSelected([it.id]);
      }
      if (this._readOnly || !this._selected.has(it.id)) {
        this.render();
        return;
      }
      const before = this._snap();
      const p = this._img(e);
      if (e.altKey && it.kind === "minutia") this._drag = { type: "radius", id: it.id, before };
      else if (hit.part === "tip") this._drag = { type: "rotate", id: it.id, before };
      else {
        const orig = {};
        for (const id of this._selected) {
          const o = this._items.find((i) => i.id === id);
          if (o) orig[id] = { x: o.x, y: o.y };
        }
        this._drag = { type: "move", ids: Object.keys(orig).map(Number), orig, start: p, before };
      }
      this.render();
      return;
    }
    const sh = this._hitSug(e);
    if (sh) {
      stopEvent(e);
      this._setFocus(sh.sid);
      return;
    }
    if (CREATE_MODES.has(this._mode) && !this._readOnly) {
      const p = this._img(e);
      if (!insideImage(this.viewer, p.x, p.y)) return;
      stopEvent(e);
      const before = this._snap();
      const it = this._newItem(this._mode, p.x, p.y, {});
      this._items.push(it);
      this._selected = /* @__PURE__ */ new Set([it.id]);
      this._drag = { type: "create", id: it.id, start: p, sx: e.clientX, sy: e.clientY, before };
      this.render();
      return;
    }
    if (!e.shiftKey && this._selected.size) this._setSelected([]);
  }
  _move(e) {
    if (this._mode === "roi" && this._roiDraft) {
      const p2 = this._img(e);
      this._roiCursor = [this._coord(p2.x), this._coord(p2.y)];
      this._scheduleRender();
    }
    const d = this._drag;
    if (!d) return;
    const p = this._img(e);
    if (d.type === "roi-vertex") {
      this._roi[d.index] = [this._coord(p.x), this._coord(p.y)];
      this._scheduleRender();
      return;
    }
    const it = this._items.find((i) => i.id === (d.id ?? d.ids[0]));
    if (!it) {
      this._drag = null;
      return;
    }
    switch (d.type) {
      case "create":
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) >= this._o.dragThreshold) {
          it.theta = this._angle(isoAngle(d.start.x, d.start.y, p.x, p.y));
          d.angled = true;
        }
        break;
      case "rotate":
        it.theta = this._angle(isoAngle(it.x, it.y, p.x, p.y));
        break;
      case "move":
        for (const id of d.ids) {
          const o = this._items.find((i) => i.id === id);
          if (!o) continue;
          o.x = this._coord(d.orig[id].x + p.x - d.start.x);
          o.y = this._coord(d.orig[id].y + p.y - d.start.y);
        }
        break;
      case "radius":
        it.coord_unc = Math.round(Math.hypot(p.x - it.x, p.y - it.y) * 10) / 10;
        break;
      default:
        break;
    }
    this._scheduleRender();
  }
  _up() {
    const d = this._drag;
    if (!d) return;
    this._drag = null;
    if (d.type === "roi-vertex") {
      this._commit("roi", d.before, []);
      return;
    }
    const changed = JSON.stringify(d.before.items) !== JSON.stringify(this._items);
    if (d.type !== "create" && !changed) {
      this.render();
      return;
    }
    const type = { create: "add", rotate: "rotate", move: "move", radius: "uncertainty" }[d.type] || d.type;
    if (d.type === "create") this._setSelected([d.id]);
    this._commit(type, d.before, d.ids || [d.id]);
  }
  _dbl(e) {
    if (!EDIT_MODES.has(this._mode)) return;
    const sh = this._hitSug(e);
    if (sh) {
      stopEvent(e);
      this.accept([sh.sid]);
    }
  }
  _cancelDrag() {
    const d = this._drag;
    this._drag = null;
    if (d && d.before) this._load(d.before);
    this.render();
  }
  _roiDown(e) {
    if (this._readOnly) return;
    const p = this._img(e);
    const map = screenMapper(this.viewer);
    const near = (q) => {
      const sp = map(q[0], q[1]);
      return Math.hypot(sp.x - e.clientX, sp.y - e.clientY) <= this._o.hitRadius;
    };
    if (this._roiDraft) {
      stopEvent(e);
      if (this._roiDraft.length >= 3 && near(this._roiDraft[0])) {
        this._closeRoi();
        return;
      }
      this._roiDraft.push([this._coord(p.x), this._coord(p.y)]);
      this.render();
      return;
    }
    if (this._roi) {
      const idx = this._roi.findIndex(near);
      if (idx >= 0) {
        stopEvent(e);
        this._drag = { type: "roi-vertex", index: idx, before: this._snap() };
        return;
      }
    }
    if (!insideImage(this.viewer, p.x, p.y)) return;
    stopEvent(e);
    this._roiDraft = [[this._coord(p.x), this._coord(p.y)]];
    this.render();
  }
  _closeRoi() {
    const pts = this._roiDraft;
    this._roiDraft = null;
    this._roiCursor = null;
    if (pts && pts.length >= 3) this.setRoi(pts);
    else this.render();
  }
  /** Alvo sob o mouse: {id, part: 'center' | 'tip', d} ou null. */
  _hit(e) {
    const map = screenMapper(this.viewer);
    const mx = e.clientX, my = e.clientY;
    let center = null, tip = null;
    for (const it of this._items) {
      const c = map(it.x, it.y);
      const dc = Math.hypot(c.x - mx, c.y - my);
      if (dc <= this._o.hitRadius && (!center || dc < center.d)) center = { id: it.id, part: "center", d: dc };
      if (it.theta == null) continue;
      const tp = tipPoint(it.x, it.y, it.theta, this._segLen(it));
      const t = map(tp.x, tp.y);
      if (Math.hypot(t.x - c.x, t.y - c.y) < 6) continue;
      const dt = Math.hypot(t.x - mx, t.y - my);
      if (dt <= this._o.tipRadius && (!tip || dt < tip.d)) tip = { id: it.id, part: "tip", d: dt };
    }
    if (tip && (!center || this._selected.has(tip.id) || tip.d < center.d)) return tip;
    return center;
  }
  _hitSug(e) {
    const map = screenMapper(this.viewer);
    let best = null;
    for (const s of this._sug) {
      if (s.status !== "open") continue;
      const c = map(s.x, s.y);
      const d = Math.hypot(c.x - e.clientX, c.y - e.clientY);
      if (d <= this._o.hitRadius && (!best || d < best.d)) best = { sid: s.sid, d };
    }
    return best;
  }
  /* ── interno ────────────────────────────────────────────── */
  _coord(v) {
    return (this._o.round ? Math.round(Number(v)) : Number(v)) + 0;
  }
  _angle(a) {
    const st = this._o.angleStep;
    const v = st > 0 ? Math.round(Number(a) / st) * st : Number(a);
    return norm360(v);
  }
  _newItem(kind, x, y, props = {}) {
    const k = kind === "core" || kind === "delta" ? kind : "minutia";
    const it = { id: this._nextId++, kind: k, x: this._coord(x), y: this._coord(y) };
    if (k === "minutia") {
      it.theta = this._angle(props.theta ?? 0);
      it.type = TYPE_ALIASES[String(props.type ?? this._newType).toLowerCase()] || this._newType;
    } else if (props.theta != null) {
      it.theta = this._angle(props.theta);
    }
    if (props.quality != null) it.quality = Number(props.quality);
    if (props.coord_unc != null) it.coord_unc = Number(props.coord_unc);
    if (props.theta_unc != null) it.theta_unc = Number(props.theta_unc);
    it.confidence = props.confidence || (this._phase === "comparison" ? "O" : this._defaultConfidence) || void 0;
    it.phase = props.phase || this._phase;
    return it;
  }
  _importItem(kind, m, { keepFloat = false } = {}) {
    const theta = m.theta_deg_iso ?? m.theta ?? m.angle ?? (Array.isArray(m.angles) ? m.angles[0] : void 0);
    const k = kind === "minutia" ? "minutia" : String(m.type || kind).toLowerCase() === "delta" ? "delta" : kind;
    const it = {
      id: keepFloat ? -1 : this._nextId++,
      kind: k,
      x: keepFloat ? Number(m.x) : this._coord(m.x),
      y: keepFloat ? Number(m.y) : this._coord(m.y)
    };
    if (theta != null && Number.isFinite(Number(theta))) it.theta = keepFloat ? norm360(Number(theta)) : this._angle(theta);
    else if (k === "minutia") it.theta = 0;
    if (k === "minutia") it.type = TYPE_ALIASES[String(m.type ?? "unknown").toLowerCase()] || "unknown";
    for (const f of ["quality", "coord_unc", "theta_unc"]) if (m[f] != null) it[f] = Number(m[f]);
    if (m.confidence && typeof m.confidence === "string") it.confidence = m.confidence;
    if (m.phase) it.phase = m.phase;
    if (m.origin) it.origin = clone(m.origin);
    return it;
  }
  _edit(type, ids, fn) {
    const set = new Set(_asArray2(ids));
    const targets = this._items.filter((it) => set.has(it.id));
    if (!targets.length || this._readOnly) return false;
    const before = this._snap();
    for (const it of targets) fn(it);
    if (JSON.stringify(before.items) === JSON.stringify(this._items)) return false;
    this._commit(type, before, [...set]);
    return true;
  }
  _snap() {
    return {
      items: clone(this._items),
      roi: this._roi ? clone(this._roi) : null,
      meta: clone(this._meta),
      sug: this._sug.map((s) => s.status),
      nextId: this._nextId
    };
  }
  _load(s) {
    this._items = clone(s.items);
    this._roi = s.roi ? clone(s.roi) : null;
    this._meta = clone(s.meta);
    s.sug.forEach((st, i) => {
      if (this._sug[i]) this._sug[i].status = st;
    });
    for (const id of [...this._selected]) if (!this._items.some((i) => i.id === id)) this._selected.delete(id);
    this._pushSelection();
  }
  _commit(type, before, ids) {
    this._history.push(before);
    this._emitChange(type, before, ids);
    this.render();
  }
  _emitChange(type, before, ids) {
    const prev = new Map(before.items.map((i) => [i.id, i]));
    const now = new Map(this._items.map((i) => [i.id, i]));
    const added = [], removed = [], changed = [];
    for (const [id, it] of now) {
      if (!prev.has(id)) added.push({ ...it });
      else if (JSON.stringify(prev.get(id)) !== JSON.stringify(it)) changed.push({ before: { ...prev.get(id) }, after: { ...it } });
    }
    for (const [id, it] of prev) if (!now.has(id)) removed.push({ ...it });
    const payload = {
      source: "feature-editor",
      layer: this._o.layer,
      type,
      ids,
      diff: { added, removed, changed },
      features: this.toFeatures()
    };
    this.emit("change", payload);
    if (typeof this.viewer._emit === "function") this.viewer._emit("change", payload);
  }
  _emitTool() {
    this.emit("tool", { newType: this._newType, defaultConfidence: this._defaultConfidence, phase: this._phase });
  }
  _setSelected(ids) {
    this._selected = new Set(ids);
    this._pushSelection();
    this.emit("select", { ids: this.selected, items: this.selectedItems });
    this.render();
  }
  _pushSelection() {
    const sel = this.viewer.selection;
    if (!sel || !this._o.selection) return;
    const layer = this._o.layer;
    this._syncing = true;
    try {
      const mine = sel.items.filter((it) => it && it.layer === layer);
      const want = this.selected.map((id) => {
        const it = this._items.find((i) => i.id === id);
        return { layer, kind: it ? it.kind : "minutia", id };
      });
      const keys = new Set(want.map((w) => sel.keyOf(w)));
      sel.remove(mine.filter((it) => !keys.has(sel.keyOf(it))), { source: "feature-editor" });
      sel.add(want, { source: "feature-editor" });
    } finally {
      this._syncing = false;
    }
  }
  _fromSharedSelection(ev) {
    if (this._syncing || ev.source === "feature-editor") return;
    const layer = this._o.layer;
    const ids = ev.items.filter((it) => it && it.layer === layer && this._items.some((i) => i.id === it.id)).map((it) => it.id);
    this._selected = new Set(ids);
    this.emit("select", { ids: this.selected, items: this.selectedItems });
    this.render();
  }
  _sugById(sid) {
    return sid == null ? null : this._sug.find((s) => s.sid === sid) || null;
  }
  _setFocus(sid) {
    this._focusSid = sid;
    const s = this._sugById(sid);
    this.emit("focus", { sid, suggestion: s ? { ...s } : null });
    this.render();
  }
  _focusNextOpen(afterSid) {
    const open = this._sug.filter((s) => s.status === "open");
    const next = open.find((s) => s.sid > afterSid) || open[0] || null;
    this._focusSid = next ? next.sid : null;
  }
  _resolveSug(which) {
    if (which === "all") return this._sug.filter((s) => s.status === "open");
    if (which === "focused") {
      const s = this._sugById(this._focusSid);
      return s && s.status === "open" ? [s] : [];
    }
    const set = new Set(_asArray2(which));
    return this._sug.filter((s) => set.has(s.sid) && s.status === "open");
  }
};
function _asArray2(v) {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}
function _strip(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== void 0 && v !== null) out[k] = v;
  return out;
}
function _attrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
}

// src/image-adjust.js
var ADJUST_OPS = ["levels", "brightness", "contrast", "gamma", "invert", "clahe"];
var SERVER_OPS = /* @__PURE__ */ new Set(["clahe"]);
var IDENTITY = (() => {
  const l = new Uint8Array(256);
  for (let i = 0; i < 256; i++) l[i] = i;
  return l;
})();
function _clamp012(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function isServerOp(o) {
  return !!o && (o.server === true || SERVER_OPS.has(o.op));
}
function applyAdjustOp(o, v) {
  switch (o.op) {
    case "levels": {
      const lo = Number(o.lo ?? 0) / 255, hi = Number(o.hi ?? 255) / 255;
      v = hi > lo ? (v - lo) / (hi - lo) : v >= lo ? 1 : 0;
      break;
    }
    case "brightness":
      v = v + Number(o.v ?? 0);
      break;
    case "contrast":
      v = (v - 0.5) * Number(o.v ?? 1) + 0.5;
      break;
    case "gamma": {
      const g = Number(o.v ?? 1);
      if (g > 0) v = Math.pow(_clamp012(v), 1 / g);
      break;
    }
    case "invert":
      if (o.v !== false) v = 1 - v;
      break;
    default:
      return v;
  }
  return _clamp012(v);
}
function buildLut(ops) {
  const client = (ops || []).filter((o) => o && !isServerOp(o) && ADJUST_OPS.includes(o.op));
  if (!client.length) return IDENTITY.slice();
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let v = i / 255;
    for (const o of client) v = applyAdjustOp(o, v);
    lut[i] = Math.round(_clamp012(v) * 255);
  }
  return lut;
}
function describeAdjust(ops) {
  const f = (x, d = 2) => Number(x).toFixed(d);
  const parts = [];
  for (const o of ops || []) {
    switch (o.op) {
      case "clahe":
        parts.push(`CLAHE ${f(o.clip ?? 2, 1)} ${o.tile ?? 8}\xD7${o.tile ?? 8}`);
        break;
      case "levels":
        parts.push(`n\xEDveis ${o.lo ?? 0}-${o.hi ?? 255}`);
        break;
      case "brightness":
        parts.push(`brilho ${Number(o.v) >= 0 ? "+" : ""}${f(o.v ?? 0)}`);
        break;
      case "contrast":
        parts.push(`contraste \xD7${f(o.v ?? 1)}`);
        break;
      case "gamma":
        parts.push(`gama ${f(o.v ?? 1)}`);
        break;
      case "invert":
        if (o.v !== false) parts.push("invers\xE3o");
        break;
      default:
        parts.push(String(o.op));
    }
  }
  return parts.join(" \xB7 ");
}
var ImageAdjust = class extends Emitter {
  /**
   * @param {import('./viewer.js').Viewer} viewer
   * @param {object} [opts]
   * @param {Array<object>} [opts.ops] - Pilha inicial.
   * @param {'raw'|'browser'} [opts.decode='raw'] - Valores do arquivo ou os do navegador.
   * @param {(serverOps: object[], src: string) => string} [opts.server] - URL da versão
   *        processada no servidor (CLAHE). Sem ela, as operações de servidor ficam inativas.
   * @param {string} [opts.layer='adjust'] - Nome da camada canvas.
   */
  constructor(viewer, { ops = [], decode = "raw", server = null, layer = "adjust", z = -1e3 } = {}) {
    super();
    this.viewer = viewer;
    this._ops = _sanitize(ops);
    this._decode = decode === "browser" ? "browser" : "raw";
    this._server = typeof server === "function" ? server : null;
    this._bypass = false;
    this._base = null;
    this._serverBase = null;
    this._serverKey = null;
    this._colorManaged = false;
    this._out = null;
    this._reasons = {};
    this._layer = viewer.layers.ensure(layer, { kind: "canvas", z });
    this._placeLayer();
    this._layer.hide();
    this._onLoad = () => {
      this.ready = this._loadBase();
    };
    viewer.imageElement.addEventListener("load", this._onLoad);
    this.ready = this._loadBase();
  }
  /* ── pilha ──────────────────────────────────────────────── */
  get ops() {
    return this._ops.map((o) => ({ ...o }));
  }
  get decode() {
    return this._decode;
  }
  /** O navegador desenha o original com valores diferentes dos do arquivo (gAMA/ICC)? */
  get colorManaged() {
    return this._colorManaged;
  }
  get bypass() {
    return this._bypass;
  }
  get layer() {
    return this._layer;
  }
  /** Razões das operações inativas ({op: texto}). */
  get reasons() {
    return { ...this._reasons };
  }
  push(op) {
    this._ops.push(..._sanitize([op]));
    this._changed("push");
    return this;
  }
  /** Troca a pilha inteira. */
  set(ops) {
    this._ops = _sanitize(ops);
    this._changed("set");
    return this;
  }
  /** Atualiza a operação `index` (merge de campos). */
  update(index, patch) {
    if (!this._ops[index]) return this;
    this._ops[index] = { ...this._ops[index], ...patch };
    this._changed("update");
    return this;
  }
  /**
   * Define o parâmetro de uma operação pelo nome: cria, atualiza ou remove
   * (remove com `null`). Útil para sliders: adj.setParam('gamma', 0.85).
   */
  setParam(op, value) {
    const i = this._ops.findIndex((o) => o.op === op);
    if (value === null || value === void 0 || value === false) {
      if (i >= 0) {
        this._ops.splice(i, 1);
        this._changed("remove");
      }
      return this;
    }
    const patch = typeof value === "object" ? value : op === "invert" ? {} : { v: Number(value) };
    if (i >= 0) this._ops[i] = { ...this._ops[i], ...patch };
    else this._ops.push(..._sanitize([{ op, ...patch }]));
    this._changed("param");
    return this;
  }
  remove(index) {
    this._ops.splice(index, 1);
    this._changed("remove");
    return this;
  }
  clear() {
    this._ops = [];
    this._changed("clear");
    return this;
  }
  /** Estado JSON da pilha. */
  serialize() {
    return { version: 1, decode: this._decode, ops: this.ops };
  }
  /** Aplica um estado salvo por serialize(). */
  restore(state) {
    const ops = Array.isArray(state) ? state : state && state.ops || [];
    const decode = state && !Array.isArray(state) && state.decode === "browser" ? "browser" : "raw";
    this._ops = _sanitize(ops);
    if (decode !== this._decode) {
      this._decode = decode;
      this.ready = this._loadBase().then(() => this._changed("restore"));
      return this;
    }
    this._changed("restore");
    return this;
  }
  /** LUT das operações de cliente. */
  lut() {
    return buildLut(this._ops);
  }
  /** A pilha não muda nada? */
  isIdentity() {
    if (this._ops.some((o) => isServerOp(o))) return false;
    const lut = this.lut();
    for (let i = 0; i < 256; i++) if (lut[i] !== i) return false;
    return true;
  }
  /** Texto para o rótulo "processado" da exportação ("" se nada muda). */
  label() {
    return this.isIdentity() ? "" : describeAdjust(this._ops);
  }
  /** Antes/depois: com bypass, mostra o original (valores do arquivo). */
  setBypass(on) {
    this._bypass = !!on;
    this._apply();
    this._emitChange("bypass");
    return this;
  }
  toggleBypass() {
    return this.setBypass(!this._bypass);
  }
  /** Pixels exibidos (ImageData) — o original se nada muda. */
  pixels() {
    if (!this._base) return null;
    return this._out && this._layer.visible ? this._out : this._base;
  }
  /** Pixels do original (valores do arquivo no modo 'raw'). */
  basePixels() {
    return this._base;
  }
  destroy() {
    this.viewer.imageElement.removeEventListener("load", this._onLoad);
    this._layer.remove();
    this.removeAllListeners();
  }
  /* ── interno ────────────────────────────────────────────── */
  _placeLayer() {
    const img = this.viewer.imageElement;
    if (img.nextSibling !== this._layer.el) img.after(this._layer.el);
  }
  async _loadBase() {
    const img = this.viewer.imageElement;
    if (!img.src) {
      this._base = null;
      return;
    }
    try {
      await img.decode();
    } catch {
    }
    if (!img.naturalWidth) return;
    this._base = await _pixelsOf(img, this._decode);
    this._colorManaged = false;
    if (this._decode === "raw") {
      const shown = await _pixelsOf(img, "browser");
      this._colorManaged = !_sameSample(this._base, shown);
    }
    this._serverKey = null;
    this._serverBase = null;
    this._placeLayer();
    await this._refreshServer();
    this._apply();
    this._emitChange("load");
  }
  async _refreshServer() {
    const sops = this._ops.filter((o) => isServerOp(o));
    this._reasons = {};
    if (!sops.length) {
      this._serverBase = null;
      this._serverKey = null;
      return;
    }
    if (!this._server) {
      for (const o of sops) this._reasons[o.op] = `${o.op} vem do servidor: falta a op\xE7\xE3o server`;
      this._serverBase = null;
      return;
    }
    const url = this._server(sops.map((o) => ({ ...o })), this.viewer.imageElement.src);
    if (url === this._serverKey && this._serverBase) return;
    try {
      const im = await _loadImage(url);
      this._serverBase = await _pixelsOf(im, this._decode);
      this._serverKey = url;
    } catch (err) {
      for (const o of sops) this._reasons[o.op] = `servidor: ${err.message}`;
      this._serverBase = null;
      this._serverKey = null;
    }
  }
  _apply() {
    const base = this._base;
    if (!base) return;
    const serverActive = !!this._serverBase && !this._bypass;
    const src = serverActive ? this._serverBase : base;
    const lut = this._bypass ? IDENTITY : this.lut();
    const identity = lut.every((v, i) => v === i);
    const show = this._colorManaged || serverActive || !identity;
    if (!show) {
      this._layer.hide();
      this._out = null;
      return;
    }
    const { width: w, height: h } = src;
    if (!this._out || this._out.width !== w || this._out.height !== h) this._out = new ImageData(w, h);
    const s = src.data, d = this._out.data;
    for (let i = 0; i < s.length; i += 4) {
      d[i] = lut[s[i]];
      d[i + 1] = lut[s[i + 1]];
      d[i + 2] = lut[s[i + 2]];
      d[i + 3] = s[i + 3];
    }
    const c = this._layer.el;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    c.getContext("2d").putImageData(this._out, 0, 0);
    this._layer.show();
  }
  _changed(type) {
    const run = async () => {
      await this._refreshServer();
      this._apply();
      this._emitChange(type);
    };
    this.ready = (this.ready || Promise.resolve()).then(run, run);
  }
  _emitChange(type) {
    const payload = {
      source: "image-adjust",
      type,
      ops: this.ops,
      identity: this.isIdentity(),
      label: this.label(),
      bypass: this._bypass,
      colorManaged: this._colorManaged
    };
    this.emit("change", payload);
    if (typeof this.viewer._emit === "function") this.viewer._emit("change", payload);
  }
};
function _sanitize(ops) {
  const out = [];
  for (const o of ops || []) {
    if (!o || typeof o !== "object" || !o.op) continue;
    const c = { ...o, op: String(o.op) };
    if (c.op === "clahe") {
      c.server = true;
      c.clip = Number(c.clip ?? 2);
      c.tile = Number(c.tile ?? 8);
    }
    out.push(c);
  }
  return out;
}
function _loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`falha ao carregar ${src}`));
    im.src = src;
  });
}
async function _pixelsOf(img, decode) {
  const w = img.naturalWidth, h = img.naturalHeight;
  let src = img;
  if (decode === "raw" && typeof createImageBitmap === "function") {
    src = await createImageBitmap(img, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  if (src !== img && typeof src.close === "function") src.close();
  return ctx.getImageData(0, 0, w, h);
}
function _sameSample(a, b) {
  if (!a || !b || a.data.length !== b.data.length) return false;
  const n = a.data.length;
  const step = Math.max(4, 4 * Math.floor(n / 4 / 4096));
  for (let i = 0; i < n; i += step) {
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) return false;
  }
  return true;
}

// src/registration.js
function mlsRigid(controls, x, y) {
  const n = controls.length;
  if (n === 0) return { x, y };
  const EPS = 1e-8;
  let W = 0, pcx = 0, pcy = 0, qcx = 0, qcy = 0;
  const w = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = controls[i].p;
    const dx = p[0] - x, dy = p[1] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < EPS) {
      const q = controls[i].q;
      return { x: q[0], y: q[1] };
    }
    const wi = 1 / d2;
    w[i] = wi;
    W += wi;
    pcx += wi * p[0];
    pcy += wi * p[1];
    qcx += wi * controls[i].q[0];
    qcy += wi * controls[i].q[1];
  }
  pcx /= W;
  pcy /= W;
  qcx /= W;
  qcy /= W;
  let A = 0, B = 0;
  for (let i = 0; i < n; i++) {
    const p = controls[i].p, q = controls[i].q;
    const ax = p[0] - pcx, ay = p[1] - pcy, bx = q[0] - qcx, by = q[1] - qcy;
    A += w[i] * (ax * bx + ay * by);
    B += w[i] * (ax * by - ay * bx);
  }
  const theta = Math.atan2(B, A);
  const c = Math.cos(theta), s = Math.sin(theta);
  const vx = x - pcx, vy = y - pcy;
  return { x: c * vx - s * vy + qcx, y: s * vx + c * vy + qcy };
}
function buildWarp(pairs) {
  const r2l = pairs.map((pr) => ({ p: [pr.r[0], pr.r[1]], q: [pr.l[0], pr.l[1]] }));
  const l2r = pairs.map((pr) => ({ p: [pr.l[0], pr.l[1]], q: [pr.r[0], pr.r[1]] }));
  return {
    rightToLeft: (x, y) => mlsRigid(r2l, x, y),
    leftToRight: (x, y) => mlsRigid(l2r, x, y)
  };
}
function estimateTransform(cs, left, right) {
  const n = cs.length;
  if (n < 1) return null;
  let lx = 0, ly = 0, rx = 0, ry = 0;
  for (const c2 of cs) {
    const L = left[c2.leftIdx], R = right[c2.rightIdx];
    lx += L.x;
    ly += L.y;
    rx += R.x;
    ry += R.y;
  }
  lx /= n;
  ly /= n;
  rx /= n;
  ry /= n;
  let A = 0, B = 0;
  for (const c2 of cs) {
    const L = left[c2.leftIdx], R = right[c2.rightIdx];
    const ax = L.x - lx, ay = L.y - ly, bx = R.x - rx, by = R.y - ry;
    A += ax * bx + ay * by;
    B += ax * by - ay * bx;
  }
  const beta = n >= 2 && (A !== 0 || B !== 0) ? Math.atan2(B, A) : 0;
  const c = Math.cos(beta), s = Math.sin(beta);
  return { angle: beta * 180 / Math.PI, tx: lx - (c * rx + s * ry), ty: ly - (-s * rx + c * ry) };
}
function estimateRigid(pairs) {
  if (!pairs || !pairs.length) return null;
  const left = pairs.map((p) => ({ x: p.l[0], y: p.l[1] }));
  const right = pairs.map((p) => ({ x: p.r[0], y: p.r[1] }));
  const cs = pairs.map((_, i) => ({ leftIdx: i, rightIdx: i }));
  const t = estimateTransform(cs, left, right);
  let ss = 0;
  for (const p of pairs) {
    const q = applyRigid(t, p.r[0], p.r[1]);
    ss += (q.x - p.l[0]) ** 2 + (q.y - p.l[1]) ** 2;
  }
  return { ...t, n: pairs.length, rms: Math.sqrt(ss / pairs.length) };
}
function applyRigid(t, x, y) {
  const b = t.angle * Math.PI / 180;
  const c = Math.cos(b), s = Math.sin(b);
  return { x: c * x + s * y + t.tx, y: -s * x + c * y + t.ty };
}
function invertRigid(t, x, y) {
  const b = t.angle * Math.PI / 180;
  const c = Math.cos(b), s = Math.sin(b);
  const u = x - t.tx, v = y - t.ty;
  return { x: c * u - s * v, y: s * u + c * v };
}
function rigidCanvasMatrix(t) {
  const b = t.angle * Math.PI / 180;
  const c = Math.cos(b), s = Math.sin(b);
  return [c, -s, s, c, t.tx, t.ty];
}
function warpImage(src, dst, map, { step = 8 } = {}) {
  const W = dst.width, H = dst.height;
  const gw = Math.floor((W - 1) / step) + 2, gh = Math.floor((H - 1) / step) + 2;
  const gx = new Float64Array(gw * gh), gy = new Float64Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const p = map(i * step, j * step);
      gx[j * gw + i] = p.x;
      gy[j * gw + i] = p.y;
    }
  }
  const sd = src.data, dd = dst.data, sw = src.width, sh = src.height;
  for (let y = 0; y < H; y++) {
    const fj = y / step, j0 = Math.floor(fj), ty = fj - j0;
    for (let x = 0; x < W; x++) {
      const fi = x / step, i0 = Math.floor(fi), tx = fi - i0;
      const k00 = j0 * gw + i0, k01 = k00 + 1, k10 = k00 + gw, k11 = k10 + 1;
      const u = (1 - ty) * ((1 - tx) * gx[k00] + tx * gx[k01]) + ty * ((1 - tx) * gx[k10] + tx * gx[k11]);
      const v = (1 - ty) * ((1 - tx) * gy[k00] + tx * gy[k01]) + ty * ((1 - tx) * gy[k10] + tx * gy[k11]);
      const o = 4 * (y * W + x);
      if (!(u >= 0 && v >= 0 && u <= sw - 1 && v <= sh - 1)) {
        dd[o + 3] = 0;
        continue;
      }
      const x0 = Math.floor(u), y0 = Math.floor(v);
      const x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1);
      const a = u - x0, b = v - y0;
      for (let ch = 0; ch < 3; ch++) {
        const p00 = sd[4 * (y0 * sw + x0) + ch], p01 = sd[4 * (y0 * sw + x1) + ch];
        const p10 = sd[4 * (y1 * sw + x0) + ch], p11 = sd[4 * (y1 * sw + x1) + ch];
        dd[o + ch] = (1 - b) * ((1 - a) * p00 + a * p01) + b * ((1 - a) * p10 + a * p11);
      }
      dd[o + 3] = 255;
    }
  }
  return dst;
}

// src/correspondence-editor.js
var PAIR_TYPES = ["definite", "possible", "does_not_exist", "out_of_region", "unclear_area"];
var PAIR_TYPE_LABELS = {
  definite: "Definite",
  possible: "Possible",
  does_not_exist: "DoesNotExist",
  out_of_region: "OutOfRegion",
  unclear_area: "UnclearArea"
};
var PAIR_COLORS = {
  definite: "#38bdf8",
  possible: "#f472b6",
  does_not_exist: "#ef4444",
  out_of_region: "#94a3b8",
  unclear_area: "#a78bfa"
};
var KIND_LETTER = { minutia: "M", core: "C", delta: "D", point: "P" };
var LETTER_KIND = { M: "minutia", C: "core", D: "delta", P: "point" };
var OVERLAY_MODES = ["off", "rigid", "mls"];
var DEFAULTS8 = {
  layer: "pairs",
  z: 60,
  overlayLayer: "overlay-ref",
  overlayZ: 5,
  host: null,
  lines: false,
  allowPoints: true,
  ppi: 500,
  hitRadius: 10,
  ringRadius: null,
  mode: "pair",
  overlayOpacity: 0.6,
  flickerMs: 450,
  ghost: false,
  overlayStyle: "ridges",
  overlayColor: "#ff3df5",
  rightPixels: null
};
var CorrespondenceEditor = class extends Emitter {
  /**
   * @param {import('./viewer.js').Viewer} left  - latente (probe)
   * @param {import('./viewer.js').Viewer} right - referência
   * @param {object} [opts] - left/right: FeatureEditor | Features | lista de minúcias;
   *        host: elemento que contém os dois viewers (linhas entre eles);
   *        rightPixels: () => ImageData da referência (sobreposição MLS).
   */
  constructor(left, right, opts = {}) {
    super();
    this.viewers = [left, right];
    this._o = { ...DEFAULTS8, ...opts };
    this._src = [this._makeSource(opts.left), this._makeSource(opts.right)];
    this._pairs = [];
    this._selected = null;
    this._armed = null;
    this._history = new History();
    this._active = false;
    this._exportMode = false;
    this._destroyed = false;
    this._overlay = "off";
    this._flicker = null;
    this._ghost = !!this._o.ghost;
    this._ghostPt = null;
    this._pending = null;
    this._layers = this.viewers.map((v) => v.layers.ensure(this._o.layer, { kind: "svg", z: this._o.z }));
    this._g = this._layers.map((l) => svgEl("g", { class: "mntviz-ce" }, l.el));
    this._ovLayer = null;
    this._ac = new AbortController();
    const sig = { signal: this._ac.signal };
    this.viewers.forEach((v, side) => {
      v.viewport.addEventListener("mousedown", (e) => this._down(side, e), { capture: true, ...sig });
      v.viewport.addEventListener("mouseup", (e) => this._up(side, e), { capture: true, ...sig });
    });
    this._offs = [
      ...this.viewers.map((v) => onViewFrame(v, () => {
        this.render();
        this._drawLines();
      })),
      ...this.viewers.map((v, side) => v.on("pointer", (p) => this._pointer(side, p)))
    ];
    this._srcOff = [null, null];
    this._src.forEach((_, side) => this._watchSource(side));
    this._linesSvg = null;
    if (this._o.host) {
      this._linesSvg = svgEl("svg", { class: "mntviz-ce-lines" });
      this._o.host.appendChild(this._linesSvg);
      this._ro = new ResizeObserver(() => this._drawLines());
      this._ro.observe(this._o.host);
    }
    this.render();
  }
  /* ── consultas ──────────────────────────────────────────── */
  get pairs() {
    return this._pairs.map((p) => this._publicPair(p));
  }
  get selected() {
    return this._selected;
  }
  get armed() {
    return this._armed ? { side: this._armed.side, ...this._armed.ep } : null;
  }
  get overlay() {
    return this._overlay;
  }
  get canUndo() {
    return this._history.canUndo;
  }
  get canRedo() {
    return this._history.canRedo;
  }
  pair(n) {
    const p = this._pairs.find((q) => q.n === n);
    return p ? this._publicPair(p) : null;
  }
  /** Próximo número livre (máximo + 1). */
  nextNumber() {
    return this._pairs.reduce((m, p) => Math.max(m, p.n), 0) + 1;
  }
  /* ── edição ─────────────────────────────────────────────── */
  /**
   * Cria um par. a/b: {kind: 'minutia'|'core'|'delta'|'point', ref?, index?, x?, y?}
   * (ref = id no FeatureEditor ou índice na lista fixa; index = índice entre as
   * minúcias do lado). Devolve n.
   */
  addPair(a, b, { type = "definite", n = null } = {}) {
    const ea = this._endpoint(0, a), eb = this._endpoint(1, b);
    if (!ea || !eb) throw new Error("mntviz CorrespondenceEditor: ponta inv\xE1lida");
    const before = this._snap();
    const num = n != null ? Number(n) : this.nextNumber();
    if (this._pairs.some((p) => p.n === num)) throw new Error(`mntviz CorrespondenceEditor: par ${num} j\xE1 existe`);
    this._pairs.push({ n: num, type: PAIR_TYPES.includes(type) ? type : "definite", a: ea, b: eb });
    this._pairs.sort((p, q) => p.n - q.n);
    this._selected = num;
    this._commit("add", before, [num]);
    return num;
  }
  removePair(n) {
    const before = this._snap();
    const k = this._pairs.findIndex((p) => p.n === n);
    if (k < 0) return false;
    this._pairs.splice(k, 1);
    if (this._selected === n) this._selected = null;
    this._commit("delete", before, [n]);
    return true;
  }
  setType(n, type) {
    const p = this._pairs.find((q) => q.n === n);
    if (!p || !PAIR_TYPES.includes(type) || p.type === type) return false;
    const before = this._snap();
    p.type = type;
    this._commit("type", before, [n]);
    return true;
  }
  /**
   * Pares com uma ponta cuja feature foi apagada no editor de features: continuam na
   * lista (desfazer lá os cura), mas ficam fora do ajuste, da sobreposição e da exportação.
   */
  get missingPairs() {
    return this._pairs.filter((p) => this._isMissing(p)).map((p) => p.n);
  }
  /** Apaga os pares sem feature num passo só (desfazer os traz de volta). Devolve os números. */
  removeMissing() {
    const ns = this.missingPairs;
    if (!ns.length) return [];
    const before = this._snap();
    this._pairs = this._pairs.filter((p) => !ns.includes(p.n));
    if (this._selected != null && ns.includes(this._selected)) this._selected = null;
    this._commit("delete", before, ns);
    return ns;
  }
  /** Renumera 1..N na ordem atual (um passo de desfazer). */
  renumber() {
    const before = this._snap();
    this._pairs.forEach((p, i) => {
      if (this._selected === p.n) this._selected = i + 1;
      p.n = i + 1;
    });
    this._commit("renumber", before, this._pairs.map((p) => p.n));
  }
  clear() {
    if (!this._pairs.length) return;
    const before = this._snap();
    this._pairs = [];
    this._selected = null;
    this._commit("clear", before, []);
  }
  select(n) {
    this._selected = n != null && this._pairs.some((p) => p.n === n) ? n : null;
    this.emit("select", { n: this._selected, pair: this._selected != null ? this.pair(this._selected) : null });
    this.render();
    this._drawLines();
  }
  disarm() {
    if (this._armed) {
      this._armed = null;
      this.render();
    }
  }
  undo() {
    const cur = this._snap();
    const prev = this._history.undo(cur);
    if (!prev) return false;
    this._load(prev);
    this._changed("undo", []);
    return true;
  }
  redo() {
    const cur = this._snap();
    const next = this._history.redo(cur);
    if (!next) return false;
    this._load(next);
    this._changed("redo", []);
    return true;
  }
  /* ── modos e teclado ────────────────────────────────────── */
  setMode(mode) {
    this._active = mode === this._o.mode;
    if (!this._active) {
      this._armed = null;
      this._pending = null;
    }
    this.render();
  }
  handleKey(e, ctx = null) {
    const mode = ctx ? ctx.mode : this._active ? this._o.mode : null;
    if (mode !== this._o.mode) return false;
    if (ctx && ctx.focus && !this.viewers.includes(ctx.focus)) return false;
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (k === "z" || k === "Z")) {
      if (e.shiftKey) this.redo();
      else this.undo();
      return true;
    }
    if (ctrl && (k === "y" || k === "Y")) {
      this.redo();
      return true;
    }
    if (ctrl || e.altKey) return false;
    if (k === "Escape") {
      if (this._armed) {
        this.disarm();
        return true;
      }
      if (this._selected != null) {
        this.select(null);
        return true;
      }
      return false;
    }
    if (/^[1-5]$/.test(k) && this._selected != null) {
      this.setType(this._selected, PAIR_TYPES[Number(k) - 1]);
      return true;
    }
    if ((k === "Delete" || k === "Backspace") && this._selected != null) {
      this.removePair(this._selected);
      return true;
    }
    if (k === "g" || k === "G") {
      this.setGhost(!this._ghost);
      return true;
    }
    if (k === "o" || k === "O") {
      this.cycleOverlay();
      return true;
    }
    if (k === "t" || k === "T") {
      this.setFlicker(!this._flicker);
      return true;
    }
    return false;
  }
  /* ── registro, fantasma e sobreposição ──────────────────── */
  /**
   * Pontos de controle {l: [x, y], r: [x, y], n} dos pares (opcional: só um tipo). Pares
   * com uma ponta cuja feature foi apagada (`missing`) ficam de fora, como da exportação.
   */
  controls({ types = null } = {}) {
    const out = [];
    for (const p of this._pairs) {
      if (types && !types.includes(p.type)) continue;
      const a = this._resolve(0, p.a), b = this._resolve(1, p.b);
      if (a.missing || b.missing) continue;
      out.push({ n: p.n, l: [a.x, a.y], r: [b.x, b.y] });
    }
    return out;
  }
  /** Ajuste rígido referência → latente: {angle, tx, ty, n, rms} ou null. */
  rigid(opts = {}) {
    return estimateRigid(this.controls(opts));
  }
  /** Warp MLS {rightToLeft(x, y), leftToRight(x, y)} ou null sem pares. */
  warp(opts = {}) {
    const c = this.controls(opts);
    return c.length ? buildWarp(c) : null;
  }
  /** Leva um ponto de um lado ao outro (MLS): side 0 → direita, 1 → esquerda. */
  mapPoint(side, x, y) {
    const w = this.warp();
    if (!w) return null;
    return side === 0 ? w.leftToRight(x, y) : w.rightToLeft(x, y);
  }
  setGhost(on) {
    this._ghost = !!on;
    if (!this._ghost) this._ghostPt = null;
    this.render();
    this.emit("ghost", { on: this._ghost });
    return this;
  }
  /** Sobreposição da referência sobre a latente: 'off' | 'rigid' | 'mls'. */
  setOverlay(mode, { opacity = null } = {}) {
    this._overlay = OVERLAY_MODES.includes(mode) ? mode : "off";
    if (opacity != null) this._o.overlayOpacity = Number(opacity);
    if (this._overlay === "off" && this._flicker) this.setFlicker(false);
    this._refreshOverlay();
    this.emit("overlay", { mode: this._overlay, opacity: this._o.overlayOpacity });
    return this;
  }
  cycleOverlay() {
    return this.setOverlay(OVERLAY_MODES[(OVERLAY_MODES.indexOf(this._overlay) + 1) % OVERLAY_MODES.length]);
  }
  /** Alternância (flicker) da sobreposição a cada `ms`. */
  setFlicker(on, { ms = null } = {}) {
    if (this._flicker) {
      clearInterval(this._flicker);
      this._flicker = null;
    }
    if (this._ovLayer) this._ovLayer.setVisible(this._overlay !== "off");
    if (on) {
      if (this._overlay === "off") this.setOverlay("rigid");
      const period = ms || this._o.flickerMs;
      this._flicker = setInterval(() => {
        if (this._ovLayer && this._overlay !== "off") this._ovLayer.toggle();
      }, period);
    }
    this.emit("flicker", { on: !!this._flicker });
    return this;
  }
  /* ── arquivos ───────────────────────────────────────────── */
  /** Estado (JSON) do editor. */
  toJSON() {
    return { version: 1, pairs: this.pairs, rigid: this.rigid(), overlay: this._overlay };
  }
  /**
   * Restaura um estado de toJSON(). O ref salvo é um id interno do editor de features,
   * que muda quando as features são recarregadas (setFeatures renumera), então cada ponta
   * só mantém o ref se a feature que ele aponta ainda está onde a ponta foi salva (até
   * `tol` px); senão volta pelo índice entre as minúcias e, por último, pela posição.
   * Ponta sem feature vira ponto livre (allowPoints); a que estava sem feature já ao
   * salvar (`missing`) descarta o par.
   */
  fromJSON(state, { tol = 2 } = {}) {
    const before = this._snap();
    this._pairs = [];
    for (const p of state && state.pairs || []) {
      const a = this._restore(0, p.a, tol), b = this._restore(1, p.b, tol);
      if (a && b) this._pairs.push({ n: Number(p.n), type: p.type || "definite", a, b });
    }
    this._pairs.sort((p, q) => p.n - q.n);
    this._selected = null;
    this._commit("load", before, this._pairs.map((p) => p.n));
    return this;
  }
  /**
   * Correspondence do contrato: pairs [{i_probe, j_ref, type, n, kind, probe_xy, ref_xy}]
   * (i/j = índice entre as minúcias de cada lado; -1 se a ponta não é minúcia) e
   * transform {angle, tx, ty} (rígido referência → latente).
   */
  toCorrespondence() {
    const t = this.rigid();
    return {
      pairs: this._livePairs().map(({ p, a, b }) => ({
        i_probe: this._minutiaIndex(0, a),
        j_ref: this._minutiaIndex(1, b),
        type: p.type,
        n: p.n,
        kind: _pairKind(a, b),
        probe_xy: [a.x, a.y],
        ref_xy: [b.x, b.y]
      })),
      transform: t ? { angle: t.angle, tx: t.tx, ty: t.ty } : null
    };
  }
  /** Texto .match (dashboard), com linhas #PAIR N TYPE. */
  toMatchText({ q = "probe", g = "reference", label = "manual" } = {}) {
    const live = this._livePairs();
    const rows = live.map(({ a, b }) => ({
      score: 1,
      x1: a.x,
      y1: a.y,
      t1: a.theta ?? 0,
      q1: a.quality ?? 0,
      x2: b.x,
      y2: b.y,
      t2: b.theta ?? 0,
      q2: b.quality ?? 0
    }));
    return formatMatchText({ q, g, label }, rows, live.map(({ p }) => ({ n: p.n, type: p.type })));
  }
  /** Texto #CORR v2 (GT do SD302), com linhas #PAIR N TYPE. */
  toCorrText(meta = {}) {
    const live = this._livePairs();
    const rows = live.map(({ a, b }) => {
      const kind = _pairKind(a, b);
      return {
        kind,
        idxA: kind === "M" ? this._minutiaIndex(0, a) : -1,
        idxB: kind === "M" ? this._minutiaIndex(1, b) : -1,
        xa: a.x,
        ya: a.y,
        xb: b.x,
        yb: b.y
      };
    });
    return formatCorrText(meta, rows, live.map(({ p }) => ({ n: p.n, type: p.type })));
  }
  /**
   * Carrega pares de um texto (.match, #CORR ou lista de índices; 'auto' detecta).
   * Pontas casam com as features do lado pelo índice (quando há) ou pela posição
   * (até `tol` px); sem feature, viram ponto livre (allowPoints) ou são descartadas.
   * Devolve {format, added, dropped, meta}.
   */
  loadText(text, { format = "auto", tol = 2, append = false } = {}) {
    const fmt = format === "auto" ? detectPairsFormat(text) : format;
    let parsed, specs = [];
    if (fmt === "match") {
      parsed = parseMatchText(text);
      specs = parsed.rows.map((r) => [{ x: r.x1, y: r.y1, theta: r.t1 }, { x: r.x2, y: r.y2, theta: r.t2 }]);
    } else if (fmt === "corr") {
      parsed = parseCorrText(text);
      specs = parsed.rows.map((r) => {
        const kind = LETTER_KIND[r.kind] || "point";
        return [
          { kind, index: kind === "minutia" ? r.idxA : -1, x: r.xa, y: r.ya },
          { kind, index: kind === "minutia" ? r.idxB : -1, x: r.xb, y: r.yb }
        ];
      });
    } else if (fmt === "pairs") {
      parsed = parsePairsText(text);
      specs = parsed.rows.map((r) => [{ kind: "minutia", index: r.i }, { kind: "minutia", index: r.j }]);
    } else {
      throw new Error("mntviz CorrespondenceEditor: formato de pares desconhecido");
    }
    const before = this._snap();
    if (!append) {
      this._pairs = [];
      this._selected = null;
    }
    let added = 0, dropped = 0;
    const meta = parsed.pairsMeta || [];
    specs.forEach(([sa, sb], i) => {
      const a = this._match(0, sa, tol), b = this._match(1, sb, tol);
      if (!a || !b) {
        dropped++;
        return;
      }
      const pm = meta[i] || {};
      let n = pm.n != null ? pm.n : this.nextNumber();
      if (this._pairs.some((p) => p.n === n)) n = this.nextNumber();
      this._pairs.push({ n, type: PAIR_TYPES.includes(pm.type) ? pm.type : "definite", a, b });
      added++;
    });
    this._pairs.sort((p, q) => p.n - q.n);
    this._commit("load", before, this._pairs.map((p) => p.n));
    return { format: fmt, added, dropped, meta: parsed.meta || {} };
  }
  beginExport() {
    this._exportMode = true;
    this.render();
  }
  endExport() {
    this._exportMode = false;
    this.render();
  }
  destroy() {
    this._destroyed = true;
    this.setFlicker(false);
    this._ac.abort();
    for (const off of this._offs) off();
    for (const off of this._srcOff) if (off) off();
    if (this._ro) this._ro.disconnect();
    if (this._linesSvg) this._linesSvg.remove();
    this._g.forEach((g) => g.remove());
    if (this._ovLayer) this._ovLayer.remove();
    this.removeAllListeners();
  }
  /* ── desenho ────────────────────────────────────────────── */
  render() {
    if (this._destroyed) return;
    [0, 1].forEach((side) => {
      const g = this._g[side];
      if (!g.isConnected) this._layers[side].el.appendChild(g);
      g.replaceChildren();
      const v = this.viewers[side];
      const s = this._exportMode ? 1 : viewScale(v);
      const R = this._ring();
      for (const p of this._pairs) {
        const ep = this._resolve(side, side === 0 ? p.a : p.b);
        const gone = this._isMissing(p);
        const color = gone ? "#64748b" : PAIR_COLORS[p.type] || PAIR_COLORS.definite;
        const sel = !this._exportMode && p.n === this._selected;
        const pg = svgEl("g", {
          class: `mntviz-ce-pair${sel ? " mntviz-ce-selected" : ""}${gone ? " mntviz-ce-missing" : ""}`,
          "data-n": p.n,
          "data-type": p.type,
          opacity: gone ? 0.6 : null
        }, g);
        if (sel) {
          svgEl("circle", {
            cx: ep.x,
            cy: ep.y,
            r: R + 2 / s,
            fill: "none",
            stroke: "#fff",
            "stroke-width": 4.5,
            "stroke-opacity": 0.9,
            "vector-effect": "non-scaling-stroke"
          }, pg);
        }
        svgEl("circle", {
          cx: ep.x,
          cy: ep.y,
          r: R,
          fill: "none",
          stroke: color,
          "stroke-width": 2,
          "vector-effect": "non-scaling-stroke",
          "stroke-dasharray": p.type === "definite" && !gone ? null : "4 2"
        }, pg);
        const lg = svgEl("g", {
          class: "mntviz-ce-label",
          "data-n": p.n,
          transform: uprightTransform(v, ep.x, ep.y, { exportMode: this._exportMode })
        }, pg);
        const t = svgEl("text", {
          x: this._exportMode ? R + 2 : R * s + 3,
          y: this._exportMode ? -R - 2 : -R * s - 3,
          "font-size": 13,
          "font-weight": 700,
          "font-family": "sans-serif",
          fill: color,
          stroke: "#000",
          "stroke-width": 3,
          "stroke-opacity": 0.8,
          "paint-order": "stroke"
        }, lg);
        t.textContent = gone ? `${p.n}?` : String(p.n);
      }
      if (this._armed && this._armed.side === side && !this._exportMode) {
        const a = this._resolve(side, this._armed.ep);
        svgEl("circle", {
          cx: a.x,
          cy: a.y,
          r: R * 1.25,
          fill: "none",
          stroke: "#fde047",
          "stroke-width": 2,
          "stroke-dasharray": "3 2",
          "vector-effect": "non-scaling-stroke",
          class: "mntviz-ce-armed"
        }, g);
      }
      if (this._ghost && this._ghostPt && this._ghostPt.side === side && !this._exportMode) {
        const { x, y } = this._ghostPt;
        const d = 9 / s;
        const gg = svgEl("g", {
          class: "mntviz-ce-ghost",
          stroke: "#fde047",
          "stroke-width": 1.5,
          "vector-effect": "non-scaling-stroke"
        }, g);
        svgEl("line", { x1: x - d, y1: y, x2: x + d, y2: y, "vector-effect": "non-scaling-stroke" }, gg);
        svgEl("line", { x1: x, y1: y - d, x2: x, y2: y + d, "vector-effect": "non-scaling-stroke" }, gg);
        svgEl("circle", { cx: x, cy: y, r: d * 0.6, fill: "none", "vector-effect": "non-scaling-stroke" }, gg);
      }
    });
  }
  _ring() {
    return this._o.ringRadius != null ? this._o.ringRadius : 9 * this._o.ppi / 500;
  }
  _drawLines() {
    const svg = this._linesSvg;
    if (!svg || this._destroyed) return;
    svg.replaceChildren();
    if (!this._o.lines) return;
    const host = this._o.host.getBoundingClientRect();
    const [ml, mr] = this.viewers.map((v) => screenMapper(v));
    const [rl, rr] = this.viewers.map((v) => v.viewport.getBoundingClientRect());
    const inside = (p, r) => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
    for (const p of this._pairs) {
      const a = this._resolve(0, p.a), b = this._resolve(1, p.b);
      if (a.missing || b.missing) continue;
      const pa = ml(a.x, a.y), pb = mr(b.x, b.y);
      if (!inside(pa, rl) || !inside(pb, rr)) continue;
      svgEl("line", {
        x1: pa.x - host.left,
        y1: pa.y - host.top,
        x2: pb.x - host.left,
        y2: pb.y - host.top,
        stroke: PAIR_COLORS[p.type],
        "stroke-width": p.n === this._selected ? 2.2 : 1.2,
        "stroke-opacity": 0.75,
        "data-n": p.n
      }, svg);
    }
  }
  /** Liga ou desliga as linhas entre os lados (precisa de `host`). */
  setLines(on) {
    this._o.lines = !!on;
    this._drawLines();
    return this;
  }
  _refreshOverlay() {
    if (this._destroyed) return;
    if (this._overlay === "off") {
      if (this._ovLayer) this._ovLayer.hide();
      return;
    }
    const [lv, rv] = this.viewers;
    if (!this._ovLayer) {
      this._ovLayer = lv.layers.ensure(this._o.overlayLayer, { kind: "canvas", z: this._o.overlayZ });
    }
    const layer = this._ovLayer;
    layer.setOpacity(this._o.overlayOpacity);
    const c = layer.el;
    const { width: W, height: H } = lv.imageSize;
    if (!W || !H) return;
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const ctx = c.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const ctrl = this.controls();
    if (!ctrl.length) {
      layer.hide();
      return;
    }
    const src = this._rightPixels();
    if (!src) {
      layer.hide();
      return;
    }
    if (this._overlay === "rigid") {
      const off = document.createElement("canvas");
      off.width = src.width;
      off.height = src.height;
      off.getContext("2d").putImageData(src, 0, 0);
      ctx.setTransform(...rigidCanvasMatrix(estimateRigid(ctrl)));
      ctx.drawImage(off, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      const dst = ctx.createImageData(W, H);
      const w = buildWarp(ctrl);
      warpImage(src, dst, (x, y) => w.leftToRight(x, y));
      ctx.putImageData(dst, 0, 0);
    }
    if (this._o.overlayStyle === "ridges") _ridgeTint(ctx, W, H, this._o.overlayColor);
    if (!this._flicker) layer.show();
  }
  /** Estilo da sobreposição: 'ridges' (cristas da referência coloridas, fundo transparente) ou 'gray'. */
  setOverlayStyle(style, color = null) {
    this._o.overlayStyle = style === "gray" ? "gray" : "ridges";
    if (color) this._o.overlayColor = color;
    this._refreshOverlay();
    return this;
  }
  _rightPixels() {
    if (typeof this._o.rightPixels === "function") {
      const px = this._o.rightPixels();
      if (px) return px;
    }
    const img = this.viewers[1].imageElement;
    if (!img.naturalWidth) return null;
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, c.width, c.height);
  }
  /* ── mouse ──────────────────────────────────────────────── */
  _down(side, e) {
    this._pending = null;
    if (!this._active || e.button !== 0) return;
    const hit = this._hitFeature(side, e);
    const hp = this._hitPairPoint(side, e);
    if (!hit && !hp) {
      if (!this._o.allowPoints) return;
      const p = this.viewers[side].screenToImageCoords(e.clientX, e.clientY);
      if (insideImage(this.viewers[side], p.x, p.y)) this._pending = { side, x: e.clientX, y: e.clientY, p };
      return;
    }
    stopEvent(e);
    const ep = hit ? hit.ep : hp.ep;
    const used = hit ? this._pairUsing(side, ep) : hp.pair;
    this._pick(side, ep, used);
  }
  _up(side, e) {
    const pend = this._pending;
    this._pending = null;
    if (!pend || pend.side !== side || !this._active) return;
    if (Math.abs(e.clientX - pend.x) > 3 || Math.abs(e.clientY - pend.y) > 3) return;
    const p = pend.p;
    this._pick(side, { kind: "point", ref: null, x: Math.round(p.x), y: Math.round(p.y) }, null);
  }
  _pick(side, ep, used) {
    const armed = this._armed;
    if (used) {
      if (armed && armed.side !== side) {
        this.emit("hint", { text: `essa feature j\xE1 est\xE1 no par ${used.n}`, n: used.n });
        return;
      }
      this._armed = null;
      this.select(used.n);
      return;
    }
    if (!armed || armed.side === side) {
      this._armed = { side, ep };
      this.emit("armed", { side, ...ep });
      this.render();
      return;
    }
    const a = side === 0 ? ep : armed.ep;
    const b = side === 0 ? armed.ep : ep;
    this._armed = null;
    this.addPair(a, b);
  }
  _pointer(side, p) {
    if (!this._ghost) return;
    if (p.type === "leave") {
      this._ghostPt = null;
      this.render();
      return;
    }
    if (p.type !== "move") return;
    const q = this.mapPoint(side, p.x, p.y);
    this._ghostPt = q ? { side: 1 - side, x: q.x, y: q.y } : null;
    this.render();
  }
  _hitFeature(side, e) {
    const map = screenMapper(this.viewers[side]);
    let best = null;
    for (const it2 of this._src[side].items()) {
      const c = map(it2.x, it2.y);
      const d = Math.hypot(c.x - e.clientX, c.y - e.clientY);
      if (d <= this._o.hitRadius && (!best || d < best.d)) best = { d, it: it2 };
    }
    if (!best) return null;
    const it = best.it;
    return { d: best.d, ep: { kind: it.kind, ref: it.id, x: it.x, y: it.y } };
  }
  _hitPairPoint(side, e) {
    const map = screenMapper(this.viewers[side]);
    let best = null;
    for (const p of this._pairs) {
      const ep = side === 0 ? p.a : p.b;
      if (ep.ref != null) continue;
      const c = map(ep.x, ep.y);
      const d = Math.hypot(c.x - e.clientX, c.y - e.clientY);
      if (d <= this._o.hitRadius && (!best || d < best.d)) best = { d, pair: p, ep: { ...ep } };
    }
    return best;
  }
  _pairUsing(side, ep) {
    if (ep.ref == null) return null;
    return this._pairs.find((p) => (side === 0 ? p.a : p.b).ref === ep.ref) || null;
  }
  /* ── fontes de features ─────────────────────────────────── */
  _makeSource(spec) {
    if (spec && typeof spec.toFeatures === "function" && typeof spec.get === "function") {
      const ed = spec;
      return {
        editor: ed,
        items: () => ed.items,
        get: (id) => ed.get(id),
        minutiae: () => ed.items.filter((i) => i.kind === "minutia")
      };
    }
    const f = Array.isArray(spec) ? { minutiae: spec } : spec || {};
    const items = [];
    const add = (kind, m) => {
      const theta = m.theta_deg_iso ?? m.theta ?? m.angle;
      items.push({
        id: items.length,
        kind,
        x: Number(m.x),
        y: Number(m.y),
        theta: theta != null ? Number(theta) : void 0,
        quality: m.quality != null ? Number(m.quality) : void 0
      });
    };
    for (const m of f.minutiae || []) add("minutia", m);
    for (const c of f.cores || []) add("core", c);
    for (const d of f.deltas || []) add("delta", d);
    return {
      editor: null,
      items: () => items.map((i) => ({ ...i })),
      get: (id) => items[id] ? { ...items[id] } : null,
      minutiae: () => items.filter((i) => i.kind === "minutia")
    };
  }
  /** Troca as features de um lado (0 latente, 1 referência). */
  setSource(side, spec) {
    this._src[side] = this._makeSource(spec);
    this._watchSource(side);
    this.render();
    this._drawLines();
    this._refreshOverlay();
  }
  /** (Re)assina o 'change' do FeatureEditor do lado (um só por lado). */
  _watchSource(side) {
    if (this._srcOff[side]) {
      this._srcOff[side]();
      this._srcOff[side] = null;
    }
    const ed = this._src[side].editor;
    if (ed) this._srcOff[side] = ed.on("change", () => {
      this.render();
      this._drawLines();
      this._refreshOverlay();
    });
  }
  /** Normaliza uma ponta dada pelo usuário. */
  _endpoint(side, spec) {
    if (!spec) return null;
    const kind = LETTER_KIND[spec.kind] || spec.kind || "minutia";
    const src = this._src[side];
    let ref = spec.ref ?? null;
    if (ref == null && spec.index != null && spec.index >= 0 && kind === "minutia") {
      const m = src.minutiae()[spec.index];
      if (m) ref = m.id;
    }
    if (ref != null) {
      const it = src.get(ref);
      if (!it) return null;
      return { kind: it.kind, ref, x: it.x, y: it.y };
    }
    if (spec.x == null || spec.y == null) return null;
    return { kind: kind === "minutia" ? "point" : kind, ref: null, x: Number(spec.x), y: Number(spec.y) };
  }
  /** Ponta de um estado salvo (toJSON): ver fromJSON. */
  _restore(side, spec, tol) {
    if (!spec) return null;
    const kind = LETTER_KIND[spec.kind] || spec.kind || "minutia";
    const hasXY = _finite(spec.x) && _finite(spec.y);
    const x = hasXY ? Number(spec.x) : null, y = hasXY ? Number(spec.y) : null;
    if (spec.ref != null) {
      const it = this._src[side].get(spec.ref);
      if (it && (!hasXY || Math.hypot(it.x - x, it.y - y) <= tol)) return { kind: it.kind, ref: spec.ref, x: it.x, y: it.y };
    } else if (kind === "point") {
      return hasXY ? { kind: "point", ref: null, x, y } : null;
    }
    const index = spec.index != null && spec.index >= 0 ? spec.index : null;
    return this._match(side, { kind, index, x, y, theta: spec.theta }, tol, { points: !spec.missing });
  }
  /** Casa uma ponta lida de arquivo com as features do lado. */
  _match(side, spec, tol, { points = true } = {}) {
    const src = this._src[side];
    const kind = spec.kind || "minutia";
    const hasXY = _finite(spec.x) && _finite(spec.y);
    if (kind === "minutia" && spec.index != null && spec.index >= 0) {
      const m = src.minutiae()[spec.index];
      if (m && (!hasXY || Math.hypot(m.x - spec.x, m.y - spec.y) <= tol)) {
        return { kind: "minutia", ref: m.id, x: m.x, y: m.y };
      }
    }
    if (!hasXY) return null;
    let best = null;
    for (const it of src.items()) {
      if (kind !== "point" && it.kind !== kind) continue;
      const d = Math.hypot(it.x - spec.x, it.y - spec.y);
      if (!(d <= tol)) continue;
      const dt = spec.theta != null && it.theta != null ? Math.abs(((it.theta - spec.theta) % 360 + 540) % 360 - 180) : 0;
      const score = d + dt / 360;
      if (!best || score < best.score) best = { score, it };
    }
    if (best) return { kind: best.it.kind, ref: best.it.id, x: best.it.x, y: best.it.y };
    if (!points || !this._o.allowPoints) return null;
    return { kind: kind === "minutia" ? "point" : kind, ref: null, x: Number(spec.x), y: Number(spec.y) };
  }
  /**
   * Ponta com os dados atuais da feature (movida, ou com outro tipo, no editor). Sem a
   * feature (apagada), devolve a última posição conhecida com `missing: true`.
   */
  _resolve(side, ep) {
    if (ep.ref == null) return { ...ep };
    const it = this._src[side].get(ep.ref);
    if (!it) return { ...ep, missing: true };
    ep.x = it.x;
    ep.y = it.y;
    ep.kind = it.kind;
    return { ...ep, x: it.x, y: it.y, kind: it.kind, theta: it.theta, quality: it.quality, type: it.type };
  }
  _isMissing(p) {
    return !!(this._resolve(0, p.a).missing || this._resolve(1, p.b).missing);
  }
  /** Pares com as duas pontas resolvidas: [{p, a, b}] (o que entra no ajuste e na exportação). */
  _livePairs() {
    const out = [];
    for (const p of this._pairs) {
      const a = this._resolve(0, p.a), b = this._resolve(1, p.b);
      if (!a.missing && !b.missing) out.push({ p, a, b });
    }
    return out;
  }
  _minutiaIndex(side, ep) {
    if (ep.ref == null || ep.kind !== "minutia") return -1;
    return this._src[side].minutiae().findIndex((m) => m.id === ep.ref);
  }
  _publicPair(p) {
    const a = this._resolve(0, p.a), b = this._resolve(1, p.b);
    return {
      n: p.n,
      type: p.type,
      kind: _pairKind(a, b),
      missing: !!(a.missing || b.missing),
      a: { ...a, index: this._minutiaIndex(0, a) },
      b: { ...b, index: this._minutiaIndex(1, b) }
    };
  }
  _snap() {
    return { pairs: clone(this._pairs), selected: this._selected };
  }
  _load(s) {
    this._pairs = clone(s.pairs);
    this._selected = s.selected != null && this._pairs.some((p) => p.n === s.selected) ? s.selected : null;
    this._armed = null;
  }
  _commit(type, before, ns) {
    this._history.push(before);
    this._changed(type, ns);
  }
  _changed(type, ns) {
    this.render();
    this._drawLines();
    this._refreshOverlay();
    const payload = { source: "correspondence-editor", type, n: ns, pairs: this.pairs };
    this.emit("change", payload);
    for (const v of this.viewers) if (typeof v._emit === "function") v._emit("change", payload);
  }
};
function _ridgeTint(ctx, W, H, color) {
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const c = parseInt(String(color).replace("#", ""), 16);
  const r = c >> 16 & 255, g = c >> 8 & 255, b = c & 255;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = Math.round((255 - v) * d[i + 3] / 255);
  }
  ctx.putImageData(img, 0, 0);
}
function _finite(v) {
  return v != null && v !== "" && Number.isFinite(Number(v));
}
function _pairKind(a, b) {
  if (a.kind === b.kind && (a.kind === "minutia" || a.kind === "core" || a.kind === "delta")) return KIND_LETTER[a.kind];
  return "P";
}
var _i = (v) => String(Math.round(Number(v)));
function detectPairsFormat(text) {
  if (/^#MATCH\b/m.test(text) || /^#MMIN\b/m.test(text)) return "match";
  if (/^#CORR\b/m.test(text)) return "corr";
  const rows = text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (rows.length && rows.every((l) => /^-?\d+\s+-?\d+$/.test(l))) return "pairs";
  return null;
}
function _pairLines(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^#PAIR\s+(\d+)\s+(\w+)/);
    if (m) out.push({ n: Number(m[1]), type: m[2] });
  }
  return out;
}
function parseMatchText(text) {
  let q = null, g = null, label = null, score = null;
  const rows = [];
  for (let line of text.split("\n")) {
    line = line.trim();
    if (!line) continue;
    if (line.startsWith("#MATCH Q")) {
      q = line.split(/\s+/).slice(2).join(" ");
      continue;
    }
    if (line.startsWith("#MATCH G")) {
      g = line.split(/\s+/).slice(2).join(" ");
      continue;
    }
    if (line.startsWith("#MATCH LABEL")) {
      label = line.split(/\s+/).slice(2).join(" ");
      continue;
    }
    if (line.startsWith("#MATCH SCORE")) {
      score = Number(line.split(/\s+/)[2]);
      continue;
    }
    if (line.startsWith("#")) continue;
    const f = line.split(/\s+/);
    if (f.length < 9) continue;
    rows.push({ score: +f[0], x1: +f[1], y1: +f[2], t1: +f[3], q1: +f[4], x2: +f[5], y2: +f[6], t2: +f[7], q2: +f[8] });
  }
  return { q, g, label, score, rows, meta: { q, g, label, score }, pairsMeta: _pairLines(text) };
}
function formatMatchText({ q = "probe", g = "reference", label = "manual", score = 0 } = {}, rows = [], pairsMeta = []) {
  const lines = [
    `#MATCH SCORE ${Number(score).toFixed(6)}`,
    `#MATCH LABEL ${label}`,
    `#MATCH Q ${q}`,
    `#MATCH G ${g}`,
    "#MMIN SCORE X1 Y1 THETA1 Q1 X2 Y2 THETA2 Q2"
  ];
  for (const r of rows) {
    lines.push(`${Number(r.score ?? 1).toFixed(6)} ${_i(r.x1)} ${_i(r.y1)} ${_i(r.t1 ?? 0)} ${_i(r.q1 ?? 0)} ${_i(r.x2)} ${_i(r.y2)} ${_i(r.t2 ?? 0)} ${_i(r.q2 ?? 0)}`);
  }
  if (pairsMeta.length) lines.push("#PAIR N TYPE", ...pairsMeta.map((p) => `#PAIR ${p.n} ${p.type}`));
  return lines.join("\n") + "\n";
}
function parseCorrText(text) {
  const meta = {};
  const rows = [];
  for (let line of text.split("\n")) {
    line = line.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const m = line.match(/^#\s*([A-Za-z_]+)\s*=\s*(.*)$/);
      if (m) meta[m[1]] = m[2].trim();
      continue;
    }
    const f = line.split(/\s+/);
    if (f.length < 7) continue;
    rows.push({ kind: f[0], idxA: +f[1], idxB: +f[2], xa: +f[3], ya: +f[4], xb: +f[5], yb: +f[6] });
  }
  return { meta, rows, pairsMeta: _pairLines(text) };
}
function formatCorrText(meta = {}, rows = [], pairsMeta = []) {
  const keys = ["A", "B", "impression", "decision", "rotation", "source"];
  const lines = [];
  for (const k of keys) if (meta[k] != null) lines.push(`# ${k} = ${meta[k]}`);
  for (const [k, v] of Object.entries(meta)) if (!keys.includes(k) && v != null) lines.push(`# ${k} = ${v}`);
  lines.push("#CORR KIND IDX_A IDX_B XA YA XB YB");
  for (const r of rows) lines.push(`${r.kind} ${r.idxA} ${r.idxB} ${_i(r.xa)} ${_i(r.ya)} ${_i(r.xb)} ${_i(r.yb)}`);
  if (pairsMeta.length) lines.push("#PAIR N TYPE", ...pairsMeta.map((p) => `#PAIR ${p.n} ${p.type}`));
  return lines.join("\n") + "\n";
}
function parsePairsText(text) {
  const meta = {};
  const rows = [];
  for (let line of text.split("\n")) {
    line = line.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const m = line.match(/^#\s*([A-Za-z_]+)\s*:\s*(.*)$/);
      if (m) meta[m[1]] = m[2].trim();
      continue;
    }
    const f = line.split(/\s+/);
    if (f.length >= 2) rows.push({ i: +f[0], j: +f[1] });
  }
  return { meta, rows, pairsMeta: _pairLines(text) };
}

// src/measure.js
function mmFromPx(px, ppi) {
  return ppi > 0 ? px / ppi * 25.4 : NaN;
}
function ridgeProfile(img, p1, p2, { channel = 0 } = {}) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy);
  const n = Math.max(2, Math.floor(length) + 1);
  const values = new Float64Array(n), xs = new Float64Array(n), ys = new Float64Array(n);
  const W = img.width, H = img.height, d = img.data;
  const at = (x, y) => d[4 * (y * W + x) + channel];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = p1.x + t * dx, y = p1.y + t * dy;
    xs[i] = x;
    ys[i] = y;
    const cx = Math.min(Math.max(x, 0), W - 1), cy = Math.min(Math.max(y, 0), H - 1);
    const x0 = Math.floor(cx), y0 = Math.floor(cy);
    const x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
    const a = cx - x0, b = cy - y0;
    values[i] = (1 - b) * ((1 - a) * at(x0, y0) + a * at(x1, y0)) + b * ((1 - a) * at(x0, y1) + a * at(x1, y1));
  }
  return { values, xs, ys, length };
}
function smoothProfile(values, sigma = 1) {
  const n = values.length;
  if (!(sigma > 0)) return Float64Array.from(values);
  const r = Math.max(1, Math.ceil(3 * sigma));
  const k = new Float64Array(2 * r + 1);
  let sum = 0;
  for (let j = -r; j <= r; j++) {
    k[j + r] = Math.exp(-(j * j) / (2 * sigma * sigma));
    sum += k[j + r];
  }
  for (let j = 0; j < k.length; j++) k[j] /= sum;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = -r; j <= r; j++) {
      const idx = Math.min(Math.max(i + j, 0), n - 1);
      acc += k[j + r] * values[idx];
    }
    out[i] = acc;
  }
  return out;
}
function findRidges(smoothed, { minProminence = 8, exclude = 3, polarity = "dark", minSeparation = null } = {}) {
  const n = smoothed.length;
  const s = polarity === "light" ? Array.from(smoothed, (v) => -v) : smoothed;
  const out = [];
  for (let i = Math.max(1, exclude); i <= Math.min(n - 2, n - 1 - exclude); i++) {
    if (!(s[i] < s[i - 1] && s[i] <= s[i + 1])) continue;
    let lm = s[i], rm = s[i];
    for (let j = i - 1; j >= 0 && !(s[j] < s[i]); j--) if (s[j] > lm) lm = s[j];
    for (let j = i + 1; j < n && !(s[j] < s[i]); j++) if (s[j] > rm) rm = s[j];
    const prom = Math.min(lm, rm) - s[i];
    if (prom >= minProminence) out.push({ i, prominence: prom });
  }
  let sep = minSeparation;
  if (sep == null) {
    sep = 0;
    if (out.length >= 3) {
      const gaps = [];
      for (let k = 1; k < out.length; k++) gaps.push(out[k].i - out[k - 1].i);
      gaps.sort((a, b) => a - b);
      const mid = gaps.length >> 1;
      sep = 0.35 * (gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2);
    }
  }
  if (sep > 0) {
    for (let k = 1; k < out.length; ) {
      const a = out[k - 1], b = out[k];
      if (b.i - a.i >= sep) {
        k++;
        continue;
      }
      const keepB = b.prominence > a.prominence || b.prominence === a.prominence && s[b.i] < s[a.i];
      out.splice(keepB ? k - 1 : k, 1);
      if (keepB && k > 1) k--;
    }
  }
  return out;
}
var RULER_DEFAULTS = { ppi: 500, layer: "measure", z: 45, color: "#fbbf24", keep: false, mode: "ruler" };
var Ruler = class extends Emitter {
  /**
   * @param {import('./viewer.js').Viewer} viewer
   * @param {object} [opts] - ppi, color, keep (true: várias medidas), mode ('ruler').
   */
  constructor(viewer, opts = {}) {
    super();
    this.viewer = viewer;
    this._o = { ...RULER_DEFAULTS, ...opts };
    this._layer = viewer.layers.ensure(this._o.layer, { kind: "svg", z: this._o.z });
    this._g = svgEl("g", { class: "mntviz-measure mntviz-ruler" }, this._layer.el);
    this._items = [];
    this._drag = null;
    this._active = false;
    this._exportMode = false;
    this._ac = new AbortController();
    const sig = { signal: this._ac.signal };
    viewer.viewport.addEventListener("mousedown", (e) => this._down(e), { capture: true, ...sig });
    window.addEventListener("mousemove", (e) => this._move(e), { capture: true, ...sig });
    window.addEventListener("mouseup", (e) => this._up(e), { capture: true, ...sig });
    this._offView = onViewFrame(viewer, () => this.render());
  }
  get ppi() {
    return this._o.ppi;
  }
  setPpi(ppi) {
    this._o.ppi = Number(ppi);
    this._items = this._items.map((m) => this._measure(m));
    this.render();
    return this;
  }
  get measurements() {
    return this._items.map((m) => ({ ...m }));
  }
  get active() {
    return this._active;
  }
  setMode(mode) {
    this._active = mode === this._o.mode;
    if (!this._active) this._drag = null;
  }
  /** Mede de p1 a p2 (coordenadas da imagem); devolve a medida. */
  measure(p1, p2, { keep = this._o.keep } = {}) {
    const m = this._measure({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    if (!keep) this._items = [];
    this._items.push(m);
    this.render();
    this.emit("measure", { ...m });
    this._emitChange();
    return { ...m };
  }
  clear() {
    this._items = [];
    this.render();
    this._emitChange();
  }
  serialize() {
    return { kind: "ruler", ppi: this._o.ppi, items: this.measurements };
  }
  restore(state) {
    this._items = (state && state.items || []).map((m) => this._measure(m));
    this.render();
    return this;
  }
  handleKey(e, ctx) {
    if (!this._active || ctx && ctx.focus && ctx.focus !== this.viewer) return false;
    if (e.key === "Escape" && (this._drag || this._items.length)) {
      this._drag = null;
      this.clear();
      return true;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && this._items.length) {
      this._items.pop();
      this.render();
      this._emitChange();
      return true;
    }
    return false;
  }
  beginExport() {
    this._exportMode = true;
    this.render();
  }
  endExport() {
    this._exportMode = false;
    this.render();
  }
  destroy() {
    this._ac.abort();
    this._offView();
    this._g.remove();
    this.removeAllListeners();
  }
  _measure(m) {
    const px = Math.hypot(m.x2 - m.x1, m.y2 - m.y1);
    return { x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2, px, mm: mmFromPx(px, this._o.ppi), ppi: this._o.ppi };
  }
  _down(e) {
    if (!this._active || e.button !== 0) return;
    const p = this.viewer.screenToImageCoords(e.clientX, e.clientY);
    if (!insideImage(this.viewer, p.x, p.y)) return;
    stopEvent(e);
    this._drag = { x1: p.x, y1: p.y, x2: p.x, y2: p.y, keep: e.shiftKey || this._o.keep };
    this.render();
  }
  _move(e) {
    if (!this._drag) return;
    const p = this.viewer.screenToImageCoords(e.clientX, e.clientY);
    this._drag.x2 = p.x;
    this._drag.y2 = p.y;
    this.render();
    const m = this._measure(this._drag);
    this.emit("preview", m);
  }
  _up(e) {
    if (!this._drag) return;
    const d = this._drag;
    this._drag = null;
    const p = this.viewer.screenToImageCoords(e.clientX, e.clientY);
    d.x2 = p.x;
    d.y2 = p.y;
    if (Math.hypot(d.x2 - d.x1, d.y2 - d.y1) * viewScale(this.viewer) < 3) {
      this.render();
      return;
    }
    this.measure({ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 }, { keep: d.keep });
  }
  render() {
    this._g.replaceChildren();
    const all = this._drag ? [...this._items, this._measure(this._drag)] : this._items;
    for (const m of all) _drawSegment(this._g, this.viewer, m, this._o.color, _rulerLabel(m), this._exportMode);
  }
  _emitChange() {
    const payload = { source: "ruler", type: "measure", items: this.measurements };
    this.emit("change", payload);
    if (typeof this.viewer._emit === "function") this.viewer._emit("change", payload);
  }
};
function _rulerLabel(m) {
  const px = `${m.px.toFixed(1)} px`;
  return Number.isFinite(m.mm) ? `${m.mm.toFixed(2)} mm (${px})` : px;
}
var RIDGE_DEFAULTS = {
  ppi: 500,
  layer: "measure",
  z: 45,
  color: "#22d3ee",
  mode: "ridges",
  sigma: 1,
  minProminence: 8,
  exclude: 3,
  polarity: "dark",
  channel: 0,
  source: null
};
var RidgeCount = class extends Emitter {
  /**
   * @param {import('./viewer.js').Viewer} viewer
   * @param {object} [opts] - ppi; source: () => ImageData (padrão: pixels do <img>);
   *        sigma, minProminence, exclude, polarity ('dark' = cristas escuras).
   */
  constructor(viewer, opts = {}) {
    super();
    this.viewer = viewer;
    this._o = { ...RIDGE_DEFAULTS, ...opts };
    this._layer = viewer.layers.ensure(this._o.layer, { kind: "svg", z: this._o.z });
    this._g = svgEl("g", { class: "mntviz-measure mntviz-ridgecount" }, this._layer.el);
    this._items = [];
    this._drag = null;
    this._active = false;
    this._exportMode = false;
    this._fallback = null;
    this._ac = new AbortController();
    const sig = { signal: this._ac.signal };
    viewer.viewport.addEventListener("mousedown", (e) => this._down(e), { capture: true, ...sig });
    window.addEventListener("mousemove", (e) => this._move(e), { capture: true, ...sig });
    window.addEventListener("mouseup", (e) => this._up(e), { capture: true, ...sig });
    this._offView = onViewFrame(viewer, () => this.render());
  }
  get measurements() {
    return this._items.map(_publicCount);
  }
  setPpi(ppi) {
    this._o.ppi = Number(ppi);
    return this;
  }
  setMode(mode) {
    this._active = mode === this._o.mode;
    if (!this._active) this._drag = null;
  }
  /** Conta as cristas de p1 a p2. Devolve {x1, y1, x2, y2, px, mm, count, minima, profile, smoothed}. */
  count(p1, p2, { keep = false } = {}) {
    const img = this._pixels();
    if (!img) throw new Error("mntviz RidgeCount: sem pixels (imagem n\xE3o carregada)");
    const o = this._o;
    const prof = ridgeProfile(img, p1, p2, { channel: o.channel });
    const sm = smoothProfile(prof.values, o.sigma);
    const ridges = findRidges(sm, { minProminence: o.minProminence, exclude: o.exclude, polarity: o.polarity });
    const m = {
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      px: prof.length,
      mm: mmFromPx(prof.length, o.ppi),
      ppi: o.ppi,
      count: ridges.length,
      minima: ridges.map((r) => ({ i: r.i, x: prof.xs[r.i], y: prof.ys[r.i], v: sm[r.i], prominence: r.prominence })),
      profile: Array.from(prof.values),
      smoothed: Array.from(sm),
      params: { sigma: o.sigma, minProminence: o.minProminence, exclude: o.exclude, polarity: o.polarity }
    };
    if (!keep) this._items = [];
    this._items.push(m);
    this.render();
    this.emit("measure", _publicCount(m, true));
    const payload = { source: "ridgecount", type: "measure", items: this.measurements };
    this.emit("change", payload);
    if (typeof this.viewer._emit === "function") this.viewer._emit("change", payload);
    return _publicCount(m, true);
  }
  clear() {
    this._items = [];
    this.render();
  }
  serialize() {
    return { kind: "ridgecount", ppi: this._o.ppi, items: this.measurements };
  }
  handleKey(e, ctx) {
    if (!this._active || ctx && ctx.focus && ctx.focus !== this.viewer) return false;
    if (e.key === "Escape" && (this._drag || this._items.length)) {
      this._drag = null;
      this.clear();
      return true;
    }
    return false;
  }
  beginExport() {
    this._exportMode = true;
    this.render();
  }
  endExport() {
    this._exportMode = false;
    this.render();
  }
  destroy() {
    this._ac.abort();
    this._offView();
    this._g.remove();
    this.removeAllListeners();
  }
  _pixels() {
    if (typeof this._o.source === "function") {
      const px = this._o.source();
      if (px) return px;
    }
    const img = this.viewer.imageElement;
    if (!img.naturalWidth) return null;
    if (!this._fallback || this._fallback.src !== img.src) {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      this._fallback = { src: img.src, data: ctx.getImageData(0, 0, c.width, c.height) };
    }
    return this._fallback.data;
  }
  _down(e) {
    if (!this._active || e.button !== 0) return;
    const p = this.viewer.screenToImageCoords(e.clientX, e.clientY);
    if (!insideImage(this.viewer, p.x, p.y)) return;
    stopEvent(e);
    this._drag = { x1: p.x, y1: p.y, x2: p.x, y2: p.y, keep: e.shiftKey };
    this.render();
  }
  _move(e) {
    if (!this._drag) return;
    const p = this.viewer.screenToImageCoords(e.clientX, e.clientY);
    this._drag.x2 = p.x;
    this._drag.y2 = p.y;
    this.render();
  }
  _up(e) {
    if (!this._drag) return;
    const d = this._drag;
    this._drag = null;
    const p = this.viewer.screenToImageCoords(e.clientX, e.clientY);
    if (Math.hypot(p.x - d.x1, p.y - d.y1) * viewScale(this.viewer) < 3) {
      this.render();
      return;
    }
    this.count({ x: d.x1, y: d.y1 }, { x: p.x, y: p.y }, { keep: d.keep });
  }
  render() {
    this._g.replaceChildren();
    for (const m of this._items) {
      _drawSegment(this._g, this.viewer, m, this._o.color, `${m.count} cristas \xB7 ${m.px.toFixed(0)} px`, this._exportMode);
      for (const t of m.minima) {
        svgEl("circle", { cx: t.x, cy: t.y, r: 1.6, fill: this._o.color, stroke: "none" }, this._g);
      }
    }
    if (this._drag) {
      const d = this._drag;
      _drawSegment(
        this._g,
        this.viewer,
        { ...d, px: Math.hypot(d.x2 - d.x1, d.y2 - d.y1) },
        this._o.color,
        "\u2026",
        this._exportMode
      );
    }
  }
};
function _publicCount(m, withProfile = false) {
  const out = {
    x1: m.x1,
    y1: m.y1,
    x2: m.x2,
    y2: m.y2,
    px: m.px,
    mm: m.mm,
    ppi: m.ppi,
    count: m.count,
    minima: m.minima.map((t) => ({ ...t })),
    params: { ...m.params }
  };
  if (withProfile) {
    out.profile = m.profile.slice();
    out.smoothed = m.smoothed.slice();
  }
  return out;
}
function _drawSegment(g, viewer, m, color, text, exportMode) {
  const line = { x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2 };
  svgEl("line", {
    ...line,
    stroke: "#000",
    "stroke-width": 3.2,
    "stroke-opacity": 0.55,
    "vector-effect": "non-scaling-stroke",
    "stroke-linecap": "round"
  }, g);
  svgEl("line", {
    ...line,
    stroke: color,
    "stroke-width": 1.6,
    "vector-effect": "non-scaling-stroke",
    "stroke-linecap": "round"
  }, g);
  const s = exportMode ? 1 : viewScale(viewer);
  const len = Math.hypot(m.x2 - m.x1, m.y2 - m.y1) || 1;
  const nx = -(m.y2 - m.y1) / len * 5 / s, ny = (m.x2 - m.x1) / len * 5 / s;
  for (const [x, y] of [[m.x1, m.y1], [m.x2, m.y2]]) {
    svgEl("line", {
      x1: x - nx,
      y1: y - ny,
      x2: x + nx,
      y2: y + ny,
      stroke: color,
      "stroke-width": 1.6,
      "vector-effect": "non-scaling-stroke"
    }, g);
  }
  const lg = svgEl("g", {
    transform: uprightTransform(viewer, (m.x1 + m.x2) / 2, (m.y1 + m.y2) / 2, { exportMode }),
    class: "mntviz-measure-label"
  }, g);
  const t = svgEl("text", {
    x: 6,
    y: -6,
    "font-size": 12,
    "font-family": "sans-serif",
    fill: color,
    stroke: "#000",
    "stroke-width": 3,
    "stroke-opacity": 0.7,
    "paint-order": "stroke"
  }, lg);
  t.textContent = text;
}
var NICE_MM = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];
var ScaleBar = class {
  constructor(viewer, { ppi = 500, position = "TL", minPx = 60, maxPx = 160 } = {}) {
    this.viewer = viewer;
    this._o = { ppi, position, minPx, maxPx };
    this._el = document.createElement("div");
    this._el.className = `mntviz-scalebar mntviz-scalebar-${position.toLowerCase()}`;
    this._bar = document.createElement("div");
    this._bar.className = "mntviz-scalebar-bar";
    this._txt = document.createElement("div");
    this._txt.className = "mntviz-scalebar-text";
    this._el.append(this._bar, this._txt);
    viewer.viewport.appendChild(this._el);
    this._off = viewer.on("view", () => this.update());
    this.update();
  }
  setPpi(ppi) {
    this._o.ppi = Number(ppi);
    this.update();
    return this;
  }
  /** Comprimento atual {mm, px} (px de tela). */
  get value() {
    return { mm: this._mm, px: this._px };
  }
  update() {
    const pxPerMm = viewScale(this.viewer) * this._o.ppi / 25.4;
    let mm = NICE_MM[NICE_MM.length - 1];
    for (const v of NICE_MM) {
      if (v * pxPerMm >= this._o.minPx) {
        mm = v;
        break;
      }
    }
    if (mm * pxPerMm > this._o.maxPx) {
      for (let i = NICE_MM.length - 1; i >= 0; i--) if (NICE_MM[i] * pxPerMm <= this._o.maxPx) {
        mm = NICE_MM[i];
        break;
      }
    }
    this._mm = mm;
    this._px = mm * pxPerMm;
    this._bar.style.width = `${this._px.toFixed(1)}px`;
    this._txt.textContent = `${mm} mm`;
  }
  destroy() {
    this._off();
    this._el.remove();
  }
};
function scaleBarSVG(width, height, ppi, { mm = null, position = "BR", color = "#fff" } = {}) {
  const pxPerMm = ppi / 25.4;
  let len = mm;
  if (len == null) {
    len = 1;
    for (const v of NICE_MM) if (v * pxPerMm <= width * 0.25) len = v;
  }
  const px = len * pxPerMm;
  const pad = Math.max(8, Math.round(width * 0.02));
  const fs = Math.max(10, Math.round(width * 0.022));
  const x0 = position.endsWith("R") ? width - pad - px : pad;
  const y0 = position.startsWith("B") ? height - pad : pad + fs + 6;
  const g = svgEl("g", { class: "mntviz-scalebar-export", "data-mm": len, "data-px": px.toFixed(3) });
  svgEl("rect", { x: x0 - 4, y: y0 - fs - 8, width: px + 8, height: fs + 14, fill: "#000", "fill-opacity": 0.55, rx: 3 }, g);
  svgEl("line", { x1: x0, y1: y0, x2: x0 + px, y2: y0, stroke: color, "stroke-width": 3 }, g);
  const t = svgEl("text", {
    x: x0 + px / 2,
    y: y0 - 6,
    "text-anchor": "middle",
    "font-size": fs,
    "font-family": "sans-serif",
    fill: color
  }, g);
  t.textContent = `${len} mm`;
  return g;
}

// src/report-exporter.js
var MNTVIZ_VERSION = "0.2.0";
var ReportExporter = class {
  /**
   * @param {import('./viewer.js').Viewer} viewer
   * @param {object} [opts]
   * @param {import('./image-adjust.js').ImageAdjust} [opts.adjust] - Realce (rótulo e pixels).
   * @param {Array<object>} [opts.tools] - FeatureEditor, CorrespondenceEditor, Ruler, RidgeCount...
   * @param {number} [opts.ppi=500]
   * @param {object} [opts.provenance] - Campos do host (usuário, caso, engine, versão...).
   * @param {string} [opts.name] - Base dos nomes de arquivo.
   */
  constructor(viewer, {
    adjust = null,
    tools = [],
    ppi = 500,
    provenance = {},
    name = "mntviz",
    scaleBar = true,
    labelProcessed = true
  } = {}) {
    this.viewer = viewer;
    this._o = { adjust, tools: [...tools], ppi, provenance: { ...provenance }, name, scaleBar, labelProcessed };
  }
  setPpi(ppi) {
    this._o.ppi = Number(ppi);
    return this;
  }
  addTool(tool) {
    this._o.tools.push(tool);
    return this;
  }
  setProvenance(p) {
    this._o.provenance = { ...this._o.provenance, ...p };
    return this;
  }
  /** SVG na vista nativa (string). */
  async exportSVG({ scaleBar = this._o.scaleBar, label = this._o.labelProcessed, metadata = true } = {}) {
    if (this._o.adjust && this._o.adjust.ready) await this._o.adjust.ready;
    const tools = this._o.tools.filter((t) => t && typeof t.beginExport === "function");
    let text;
    try {
      for (const t of tools) t.beginExport();
      text = this.viewer.exportSVG();
    } finally {
      for (const t of tools) t.endExport();
    }
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    const root = doc.documentElement;
    const { width: W, height: H } = this.viewer.imageSize;
    root.setAttribute("width", W);
    root.setAttribute("height", H);
    root.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const adj = this._o.adjust;
    const processed = !!(adj && !adj.isIdentity());
    if (label && processed) root.appendChild(doc.importNode(_processedLabel(W, `PROCESSADO: ${adj.label()}`), true));
    if (scaleBar && this._o.ppi > 0) root.appendChild(doc.importNode(scaleBarSVG(W, H, this._o.ppi), true));
    if (metadata) {
      const md = doc.createElementNS("http://www.w3.org/2000/svg", "metadata");
      md.setAttribute("id", "mntviz-provenance");
      md.textContent = JSON.stringify(this._provenance(null));
      root.insertBefore(md, root.firstChild);
    }
    return new XMLSerializer().serializeToString(doc);
  }
  /** PNG (Blob) no tamanho natural × scale. */
  async exportPNG({ scale = 1, ...svgOpts } = {}) {
    const canvas = await this._rasterize(scale, svgOpts);
    return new Promise((resolve, reject) => canvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error("mntviz: toBlob falhou")),
      "image/png"
    ));
  }
  /** PNG como data URL. */
  async exportPNGDataURL({ scale = 1, ...svgOpts } = {}) {
    const canvas = await this._rasterize(scale, svgOpts);
    return canvas.toDataURL("image/png");
  }
  /** JSON do relatório (objeto). */
  async exportJSON({ imageHash = true } = {}) {
    const adj = this._o.adjust;
    if (adj && adj.ready) await adj.ready;
    const sha = imageHash ? await this.imageSha256() : null;
    const out = {
      schema: "mntviz.report/1",
      created_utc: (/* @__PURE__ */ new Date()).toISOString(),
      provenance: this._provenance(sha),
      processed: !!(adj && !adj.isIdentity()),
      label: adj ? adj.label() : "",
      view: this.viewer.getView(),
      layers: this.viewer.layers.serialize(),
      adjust: adj ? adj.serialize() : null,
      editors: [],
      correspondence: null,
      measurements: []
    };
    for (const t of this._o.tools) {
      if (!t) continue;
      if (typeof t.toCorrespondence === "function") {
        out.correspondence = { contract: t.toCorrespondence(), state: t.toJSON() };
      } else if (typeof t.toFeatures === "function") {
        out.editors.push({ layer: t.layerName, features: t.toFeatures(), state: t.serialize() });
      } else if (typeof t.serialize === "function") {
        out.measurements.push(t.serialize());
      }
    }
    return out;
  }
  /** sha256 (hex) dos bytes da imagem do viewer, ou null se não der para ler. */
  async imageSha256() {
    const src = this.viewer.imageElement.src;
    if (!src) return null;
    try {
      const r = await fetch(src);
      if (!r.ok) return null;
      return await sha256Hex(new Uint8Array(await r.arrayBuffer()));
    } catch {
      return null;
    }
  }
  /** Baixa 'png' | 'svg' | 'json'. */
  async download(kind = "png", filename = null) {
    let blob;
    if (kind === "png") blob = await this.exportPNG();
    else if (kind === "svg") blob = new Blob([await this.exportSVG()], { type: "image/svg+xml" });
    else if (kind === "json") blob = new Blob([JSON.stringify(await this.exportJSON(), null, 2)], { type: "application/json" });
    else throw new Error(`mntviz ReportExporter: tipo desconhecido '${kind}'`);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename || `${this._o.name}_report.${kind}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
    return blob;
  }
  async _rasterize(scale, svgOpts) {
    const svg = await this.exportSVG(svgOpts);
    const { width: W, height: H } = this.viewer.imageSize;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error("mntviz: falha ao rasterizar o SVG"));
        im.src = url;
      });
      const c = document.createElement("canvas");
      c.width = Math.round(W * scale);
      c.height = Math.round(H * scale);
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = scale !== 1;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return c;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  _provenance(sha) {
    const img = this.viewer.imageElement;
    const adj = this._o.adjust;
    const { width, height } = this.viewer.imageSize;
    return {
      mntviz: { version: MNTVIZ_VERSION },
      ...this._o.provenance,
      image: {
        src: img.src && img.src.startsWith("data:") ? "data:" : img.src || null,
        width,
        height,
        ppi: this._o.ppi,
        sha256: sha,
        decode: adj ? adj.decode : "browser",
        color_managed: adj ? adj.colorManaged : null
      }
    };
  }
};
function _processedLabel(W, text) {
  const fs = Math.max(10, Math.round(W * 0.02));
  const g = svgEl("g", { class: "mntviz-processed-label" });
  const w = Math.min(W - 8, text.length * fs * 0.62 + 12);
  svgEl("rect", { x: 4, y: 4, width: w, height: fs + 10, fill: "#7f1d1d", "fill-opacity": 0.85, rx: 3 }, g);
  const t = svgEl("text", { x: 10, y: fs + 7, "font-size": fs, "font-family": "sans-serif", fill: "#fff" }, g);
  t.textContent = text;
  return g;
}
var K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
function sha256HexSync(bytes) {
  const ror = (x, n) => x >>> n | x << 32 - n;
  const l = bytes.length;
  const total = l + 9 + 63 >> 6 << 6;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[l] = 128;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(l / 536870912));
  dv.setUint32(total - 4, l << 3 >>> 0);
  const H = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225]);
  const W = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + 4 * i);
    for (let i = 16; i < 64; i++) {
      const a2 = W[i - 15], b2 = W[i - 2];
      const s0 = ror(a2, 7) ^ ror(a2, 18) ^ a2 >>> 3;
      const s1 = ror(b2, 17) ^ ror(b2, 19) ^ b2 >>> 10;
      W[i] = W[i - 16] + s0 + W[i - 7] + s1 | 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
      const ch = e & f ^ ~e & g;
      const t1 = h + S1 + ch + K[i] + W[i] | 0;
      const S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const t2 = S0 + maj | 0;
      h = g;
      g = f;
      f = e;
      e = d + t1 | 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 | 0;
    }
    H[0] += a;
    H[1] += b;
    H[2] += c;
    H[3] += d;
    H[4] += e;
    H[5] += f;
    H[6] += g;
    H[7] += h;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, "0")).join("");
}
async function sha256Hex(bytes) {
  const c = globalThis.crypto;
  if (c && c.subtle && globalThis.isSecureContext) {
    const d = await c.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
  }
  return sha256HexSync(bytes);
}

// src/plots.js
var SVG_NS11 = "http://www.w3.org/2000/svg";
var Z = { segments: 10, uv: 10, minutiae: 20, singularities: 30, shapes: 40 };
function _createShapeElement(shape) {
  if (shape.type === "polygon") {
    const poly = document.createElementNS(SVG_NS11, "polygon");
    poly.setAttribute("points", shape.points.map((p) => p.join(",")).join(" "));
    poly.setAttribute("stroke", shape.stroke || "#ff0000");
    poly.setAttribute("stroke-width", shape.strokeWidth || 2);
    poly.setAttribute("fill", shape.fill || "none");
    if (shape.opacity != null) poly.setAttribute("opacity", shape.opacity);
    return poly;
  }
  if (shape.type === "circle") {
    const c = document.createElementNS(SVG_NS11, "circle");
    c.setAttribute("cx", shape.x);
    c.setAttribute("cy", shape.y);
    c.setAttribute("r", shape.r != null ? shape.r : 3);
    c.setAttribute("fill", shape.fill != null ? shape.fill : "none");
    if (shape.stroke != null) c.setAttribute("stroke", shape.stroke);
    if (shape.strokeWidth != null) c.setAttribute("stroke-width", shape.strokeWidth);
    if (shape.opacity != null) c.setAttribute("opacity", shape.opacity);
    return c;
  }
  if (shape.type === "cross") {
    const g = document.createElementNS(SVG_NS11, "g");
    g.setAttribute("stroke", shape.stroke || "#00ff00");
    g.setAttribute("stroke-width", shape.strokeWidth || 1);
    const s = shape.size || 10;
    const h = document.createElementNS(SVG_NS11, "line");
    h.setAttribute("x1", shape.x - s / 2);
    h.setAttribute("y1", shape.y);
    h.setAttribute("x2", shape.x + s / 2);
    h.setAttribute("y2", shape.y);
    const v = document.createElementNS(SVG_NS11, "line");
    v.setAttribute("x1", shape.x);
    v.setAttribute("y1", shape.y - s / 2);
    v.setAttribute("x2", shape.x);
    v.setAttribute("y2", shape.y + s / 2);
    g.append(h, v);
    if (shape.opacity != null) g.setAttribute("opacity", shape.opacity);
    return g;
  }
  if (shape.type === "minutia") {
    const g = document.createElementNS(SVG_NS11, "g");
    const color = shape.stroke || "#00ff00";
    g.setAttribute("stroke", color);
    g.setAttribute("fill", "none");
    g.setAttribute("stroke-width", shape.strokeWidth || 1.5);
    const r = shape.radius || 6;
    const circle = document.createElementNS(SVG_NS11, "circle");
    circle.setAttribute("cx", shape.x);
    circle.setAttribute("cy", shape.y);
    circle.setAttribute("r", r);
    g.appendChild(circle);
    const segLen = shape.segmentLength || r * 2;
    const rad = (shape.angle || 0) * Math.PI / 180;
    const dx = Math.cos(rad) * segLen;
    const dy = Math.sin(rad) * segLen;
    const line = document.createElementNS(SVG_NS11, "line");
    line.setAttribute("x1", shape.x);
    line.setAttribute("y1", shape.y);
    line.setAttribute("x2", shape.x + dx);
    line.setAttribute("y2", shape.y + dy);
    g.appendChild(line);
    if (shape.opacity != null) g.setAttribute("opacity", shape.opacity);
    return g;
  }
  if (shape.type === "path") {
    const path = document.createElementNS(SVG_NS11, "path");
    path.setAttribute("d", shape.d);
    path.setAttribute("stroke", shape.stroke || "#ff0000");
    path.setAttribute("stroke-width", shape.strokeWidth || 2);
    path.setAttribute("fill", shape.fill || "none");
    if (shape.opacity != null) path.setAttribute("opacity", shape.opacity);
    return path;
  }
  if (shape.type === "conic-ring") {
    const g = document.createElementNS(SVG_NS11, "g");
    if (shape.opacity != null) g.setAttribute("opacity", shape.opacity);
    const cx = shape.x, cy = shape.y, r = shape.r;
    const sw = shape.strokeWidth != null ? shape.strokeWidth : 2;
    const pad = sw;
    const bx = cx - r - pad, by = cy - r - pad;
    const bs = (r + pad) * 2;
    const maskId = "mntviz-conic-mask-" + Math.random().toString(36).slice(2, 10);
    const defs = document.createElementNS(SVG_NS11, "defs");
    const mask = document.createElementNS(SVG_NS11, "mask");
    mask.setAttribute("id", maskId);
    mask.setAttribute("maskUnits", "userSpaceOnUse");
    mask.setAttribute("x", bx);
    mask.setAttribute("y", by);
    mask.setAttribute("width", bs);
    mask.setAttribute("height", bs);
    const bg = document.createElementNS(SVG_NS11, "rect");
    bg.setAttribute("x", bx);
    bg.setAttribute("y", by);
    bg.setAttribute("width", bs);
    bg.setAttribute("height", bs);
    bg.setAttribute("fill", "black");
    mask.appendChild(bg);
    const ringCircle = document.createElementNS(SVG_NS11, "circle");
    ringCircle.setAttribute("cx", cx);
    ringCircle.setAttribute("cy", cy);
    ringCircle.setAttribute("r", r);
    ringCircle.setAttribute("fill", "none");
    ringCircle.setAttribute("stroke", "white");
    ringCircle.setAttribute("stroke-width", sw);
    mask.appendChild(ringCircle);
    defs.appendChild(mask);
    g.appendChild(defs);
    let stops;
    if (Array.isArray(shape.gradient)) {
      const arr = shape.gradient;
      const n = arr.length;
      if (n < 2) {
        stops = (arr[0] || "#000") + " 0deg, " + (arr[0] || "#000") + " 360deg";
      } else {
        stops = arr.map((c, i) => `${c} ${(i / (n - 1) * 360).toFixed(3)}deg`).join(", ");
      }
    } else {
      stops = String(shape.gradient || "red, yellow, lime, cyan, blue, magenta, red");
    }
    const fromDeg = shape.fromAngle != null ? shape.fromAngle : 0;
    const fo = document.createElementNS(SVG_NS11, "foreignObject");
    fo.setAttribute("x", bx);
    fo.setAttribute("y", by);
    fo.setAttribute("width", bs);
    fo.setAttribute("height", bs);
    fo.setAttribute("mask", `url(#${maskId})`);
    const div = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    div.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    div.style.width = "100%";
    div.style.height = "100%";
    div.style.background = `conic-gradient(from ${fromDeg}deg at 50% 50%, ${stops})`;
    fo.appendChild(div);
    g.appendChild(fo);
    return g;
  }
  if (shape.type === "lines") {
    const g = document.createElementNS(SVG_NS11, "g");
    if (shape.strokeWidth != null) g.setAttribute("stroke-width", shape.strokeWidth);
    if (shape.stroke != null) g.setAttribute("stroke", shape.stroke);
    if (shape.opacity != null) g.setAttribute("opacity", shape.opacity);
    if (shape.linecap != null) g.setAttribute("stroke-linecap", shape.linecap);
    let defs = null;
    let gradPrefix = null;
    const lineList = shape.lines || [];
    for (let i = 0; i < lineList.length; i++) {
      const l = lineList[i];
      const ln = document.createElementNS(SVG_NS11, "line");
      ln.setAttribute("x1", l.x1);
      ln.setAttribute("y1", l.y1);
      ln.setAttribute("x2", l.x2);
      ln.setAttribute("y2", l.y2);
      if (l.colorStart != null && l.colorEnd != null) {
        if (defs == null) {
          defs = document.createElementNS(SVG_NS11, "defs");
          gradPrefix = "mntviz-grad-" + Math.random().toString(36).slice(2, 8);
          g.insertBefore(defs, g.firstChild);
        }
        const id = `${gradPrefix}-${i}`;
        const grad = document.createElementNS(SVG_NS11, "linearGradient");
        grad.setAttribute("id", id);
        grad.setAttribute("gradientUnits", "userSpaceOnUse");
        grad.setAttribute("x1", l.x1);
        grad.setAttribute("y1", l.y1);
        grad.setAttribute("x2", l.x2);
        grad.setAttribute("y2", l.y2);
        const s0 = document.createElementNS(SVG_NS11, "stop");
        s0.setAttribute("offset", "0%");
        s0.setAttribute("stop-color", l.colorStart);
        const s1 = document.createElementNS(SVG_NS11, "stop");
        s1.setAttribute("offset", "100%");
        s1.setAttribute("stop-color", l.colorEnd);
        grad.append(s0, s1);
        defs.appendChild(grad);
        ln.setAttribute("stroke", `url(#${id})`);
      } else if (l.stroke != null) {
        ln.setAttribute("stroke", l.stroke);
      }
      if (l.strokeWidth != null) ln.setAttribute("stroke-width", l.strokeWidth);
      if (l.opacity != null) ln.setAttribute("opacity", l.opacity);
      g.appendChild(ln);
    }
    return g;
  }
  return null;
}
function _renderShapes(svgTarget, shapes) {
  if (!shapes || shapes.length === 0) return;
  const g = document.createElementNS(SVG_NS11, "g");
  g.setAttribute("class", "mntviz-shapes-layer");
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
  wrap._legendItems = items;
  for (const { label, color, shape } of items) {
    const row = document.createElement("div");
    row.classList.add("mntviz-legend-item");
    const size = 16;
    const r = 5;
    const svg = document.createElementNS(SVG_NS11, "svg");
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
    const sr = new SegmentsRenderer(viewer.layers.add("segments", { z: Z.segments }));
    sr.draw(config.minutiae, config.segments, config.segmentOptions ?? {});
  }
  const renderer = new MinutiaeRenderer(viewer.layers.add("minutiae", { z: Z.minutiae }));
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
  _maybeEnablePicker(viewer, config);
  return viewer;
}
async function plotSingularities(host, config) {
  const viewer = new Viewer(host, { minimap: true });
  await viewer.loadImage(config.imageSrc);
  const renderer = new SingularityRenderer(viewer.layers.add("singularities", { z: Z.singularities }));
  const baseOpts = config.rendererOptions ?? {};
  const layers = Array.isArray(config.layers) && config.layers.length ? config.layers : Array.isArray(config.singularities) ? [{
    singularities: config.singularities,
    color: config.color ?? "#22c55e",
    options: {}
  }] : [];
  for (const layer of layers) {
    renderer.draw(
      layer.singularities ?? [],
      layer.color ?? "#22c55e",
      { ...baseOpts, ...layer.options ?? {} }
    );
  }
  if (config.legend) {
    renderLegend(viewer, config.legend);
  }
  _maybeEnablePicker(viewer, config);
  return viewer;
}
async function plotOverlay(host, config) {
  const viewer = new Viewer(host, { minimap: true });
  await viewer.loadImage(config.imageSrc);
  if (config.overlaySrc) await _loadOverlay(viewer, config);
  _maybeEnablePicker(viewer, config);
  return viewer;
}
async function _loadOverlay(viewer, config) {
  const lut = config.overlayColormap || null;
  const overlay = new OverlayLayer(viewer.canvasContainer, {
    opacity: config.overlayOpacity ?? 1,
    insertBefore: viewer.svgLayer,
    ...lut ? { colormap: lut, alpha: config.overlayAlpha ?? "value" } : {}
  });
  await overlay.load(config.overlaySrc);
  if (config.pixelated && overlay.setRenderMode) overlay.setRenderMode("pixelated");
  overlay.show();
  if (lut) viewer.addOverlay(config.overlayName ?? "overlay", overlay);
  return overlay;
}
async function plotHuv(host, config) {
  const viewer = new Viewer(host, { minimap: true });
  await viewer.loadImage(config.imageSrc);
  if (config.overlaySrc) await _loadOverlay(viewer, config);
  if (config.arrows && config.arrows.length > 0) {
    const uvRenderer = new UVFieldRenderer(viewer.layers.add("uv", { z: Z.uv }));
    uvRenderer.draw(config.arrows, config.arrowOptions ?? {});
  }
  if (config.shapes && config.shapes.length) {
    _renderShapes(viewer.layers.add("shapes", { z: Z.shapes }).el, config.shapes);
  }
  _maybeEnablePicker(viewer, config);
  return viewer;
}
function _maybeEnablePicker(viewer, config) {
  if (!config.picker) return null;
  const opts = config.picker === true ? {} : config.picker;
  const picker = viewer.enablePointPicker(opts);
  if (typeof config.onPickerChange === "function") {
    picker.on("change", config.onPickerChange);
  }
  return picker;
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
  const svg = document.createElementNS(SVG_NS11, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  if (config.pixelated) svg.style.imageRendering = "pixelated";
  const bgImage = document.createElementNS(SVG_NS11, "image");
  bgImage.setAttribute("href", config.imageSrc);
  bgImage.setAttribute("width", w);
  bgImage.setAttribute("height", h);
  if (config.pixelated) bgImage.setAttribute("image-rendering", "pixelated");
  svg.appendChild(bgImage);
  if (config.overlaySrc) {
    const ovImage = document.createElementNS(SVG_NS11, "image");
    ovImage.setAttribute("href", config.overlaySrc);
    ovImage.setAttribute("width", w);
    ovImage.setAttribute("height", h);
    ovImage.setAttribute("opacity", config.overlayOpacity ?? 1);
    if (config.pixelated) ovImage.setAttribute("image-rendering", "pixelated");
    svg.appendChild(ovImage);
  }
  if (config.arrows && config.arrows.length > 0) {
    const arrowGroup = document.createElementNS(SVG_NS11, "g");
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
    showSegmentsOnLoad: config.showSegments ?? false,
    markerVisibility: config.markerVisibility ?? "all"
  });
  await mv.loadImages(config.leftImageSrc, config.rightImageSrc);
  return mv;
}
export {
  ADJUST_OPS,
  COLORMAP_NAMES,
  CorrespondenceEditor,
  DEFAULT_MODE_KEYS,
  Emitter,
  FeatureEditor,
  FieldProbe,
  GYRO,
  GYRO_KEYS,
  History,
  ImageAdjust,
  Layer,
  LayerStack,
  MINUTIA_TYPES,
  MNTVIZ_VERSION,
  MODES,
  MODE_LABELS,
  MatchViewer,
  MinutiaeInspector,
  MinutiaeRenderer,
  MultiViewer,
  OverlayLayer,
  PAIR_COLORS,
  PAIR_TYPES,
  PAIR_TYPE_LABELS,
  PointPicker,
  ReportExporter,
  RidgeCount,
  Ruler,
  ScaleBar,
  SegmentsRenderer,
  Selection,
  SingularityRenderer,
  ToolModes,
  UVFieldRenderer,
  Viewer,
  applyColormap,
  applyRigid,
  buildLut,
  buildWarp,
  createMarkerShape,
  describeAdjust,
  detectPairsFormat,
  estimateRigid,
  estimateTransform,
  findRidges,
  formatCorrText,
  formatMatchText,
  invertRigid,
  isoAngle,
  minutiaDataMap,
  mlsRigid,
  mmFromPx,
  parseCorrText,
  parseMatchText,
  parseMinutiaeText,
  parsePairsText,
  parseSingularityText,
  plotHuv,
  plotHuvThumbnail,
  plotMatch,
  plotMinutiae,
  plotOverlay,
  plotSingularities,
  renderLegend,
  ridgeProfile,
  scaleBarSVG,
  segmentDataMap,
  sha256Hex,
  sha256HexSync,
  singularityDataMap,
  smoothProfile,
  uprightTransform,
  warpImage
};

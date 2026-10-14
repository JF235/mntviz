/**
 * mntviz/render-target.js — Alvo de desenho dos renderers (interno).
 *
 * Um renderer pode receber:
 *   - uma camada da LayerStack (`viewer.layers.add(...)`): desenha no grupo dela;
 *   - um Viewer: desenha no SVG comum (`viewer.svgLayer`), como a API antiga;
 *   - qualquer elemento SVG (<svg> ou <g>) do consumidor.
 *
 * Regra do `clear()`: num alvo próprio (camada, <g> ou <svg> do consumidor) o
 * alvo inteiro é esvaziado, como antes; no SVG comum do viewer saem só os nós
 * que aquele renderer desenhou, e as outras camadas ficam intactas.
 */

/** Elemento SVG de desenho a partir de uma camada, de um Viewer ou de um elemento. */
export function resolveTarget(target) {
    if (!target) throw new Error('mntviz: renderer target is required');
    if (target.svgLayer && typeof target.loadImage === 'function') return target.svgLayer;   // Viewer
    if (target.el && typeof target.serialize === 'function' && target.kind) {                // Layer
        if (target.kind !== 'svg') throw new Error(`mntviz: layer '${target.name}' is not an svg layer`);
        return target.el;
    }
    return target;
}

/** O alvo é o SVG raiz compartilhado de um Viewer? */
export function isSharedRoot(el) {
    return !!(el && el.classList && el.classList.contains('mntviz-mnt-layer'));
}

/**
 * Remove o que o renderer desenhou: só os próprios nós no SVG comum; o alvo
 * inteiro (ou o que `selector` escolher) num alvo próprio.
 */
export function clearOwned(target, nodes, selector = null) {
    if (isSharedRoot(target)) {
        for (const n of nodes) n.remove();
    } else if (selector) {
        for (const el of target.querySelectorAll(selector)) el.remove();
    } else {
        target.replaceChildren();
    }
    nodes.length = 0;
}

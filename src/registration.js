/**
 * mntviz/registration.js — Alinhamento entre duas impressões a partir de pares.
 *
 * Portado sem mudar a matemática do matching.js do stitch-dashboard (layout-v2,
 * 364d6b7, linhas 747-815):
 *   - mlsRigid: Moving Least Squares rígido (Schaefer et al., 2006), pesos 1/|p - v|²;
 *     interpola os pontos de controle exatamente; com 1 controle vira translação.
 *   - estimateTransform: ajuste rígido global por mínimos quadrados, da direita para a
 *     esquerda (convenção do MatchViewer):
 *         x_l =  cos(b)·x_r + sin(b)·y_r + tx
 *         y_l = -sin(b)·x_r + cos(b)·y_r + ty         angle = b em graus
 *
 * Esquerda = latente (probe), direita = referência. Um par é {l: [x, y], r: [x, y]}.
 *
 * Uso:
 *   const t = estimateRigid(pairs);               // {angle, tx, ty, n, rms}
 *   const p = applyRigid(t, xr, yr);              // referência → latente
 *   const w = buildWarp(pairs);                   // {rightToLeft(x, y), leftToRight(x, y)}
 */

/**
 * MLS rígido em (x, y). controls: [{p: [px, py], q: [qx, qy]}] leva p → q.
 * Devolve {x, y}.
 */
export function mlsRigid(controls, x, y) {
    const n = controls.length;
    if (n === 0) return { x, y };
    const EPS = 1e-8;
    let W = 0, pcx = 0, pcy = 0, qcx = 0, qcy = 0;
    const w = new Array(n);
    for (let i = 0; i < n; i++) {
        const p = controls[i].p;
        const dx = p[0] - x, dy = p[1] - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < EPS) { const q = controls[i].q; return { x: q[0], y: q[1] }; }
        const wi = 1 / d2;
        w[i] = wi; W += wi;
        pcx += wi * p[0]; pcy += wi * p[1];
        qcx += wi * controls[i].q[0]; qcy += wi * controls[i].q[1];
    }
    pcx /= W; pcy /= W; qcx /= W; qcy /= W;
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

/** Warp elástico (MLS rígido) nos dois sentidos, a partir de pares {l, r}. */
export function buildWarp(pairs) {
    const r2l = pairs.map(pr => ({ p: [pr.r[0], pr.r[1]], q: [pr.l[0], pr.l[1]] }));
    const l2r = pairs.map(pr => ({ p: [pr.l[0], pr.l[1]], q: [pr.r[0], pr.r[1]] }));
    return {
        rightToLeft: (x, y) => mlsRigid(r2l, x, y),
        leftToRight: (x, y) => mlsRigid(l2r, x, y),
    };
}

/**
 * Ajuste rígido global (direita → esquerda), com a assinatura do dashboard:
 * cs = [{leftIdx, rightIdx}], left/right = listas de {x, y}. Devolve
 * {angle, tx, ty} ou null sem pares.
 */
export function estimateTransform(cs, left, right) {
    const n = cs.length;
    if (n < 1) return null;
    let lx = 0, ly = 0, rx = 0, ry = 0;
    for (const c of cs) {
        const L = left[c.leftIdx], R = right[c.rightIdx];
        lx += L.x; ly += L.y; rx += R.x; ry += R.y;
    }
    lx /= n; ly /= n; rx /= n; ry /= n;
    let A = 0, B = 0;
    for (const c of cs) {
        const L = left[c.leftIdx], R = right[c.rightIdx];
        const ax = L.x - lx, ay = L.y - ly, bx = R.x - rx, by = R.y - ry;
        A += ax * bx + ay * by;
        B += ax * by - ay * bx;
    }
    const beta = (n >= 2 && (A !== 0 || B !== 0)) ? Math.atan2(B, A) : 0;
    const c = Math.cos(beta), s = Math.sin(beta);
    return { angle: beta * 180 / Math.PI, tx: lx - (c * rx + s * ry), ty: ly - (-s * rx + c * ry) };
}

/**
 * Ajuste rígido a partir de pares {l: [x, y], r: [x, y]}: {angle, tx, ty, n, rms}
 * (rms = resíduo médio quadrático em px, na latente), ou null sem pares.
 */
export function estimateRigid(pairs) {
    if (!pairs || !pairs.length) return null;
    const left = pairs.map(p => ({ x: p.l[0], y: p.l[1] }));
    const right = pairs.map(p => ({ x: p.r[0], y: p.r[1] }));
    const cs = pairs.map((_, i) => ({ leftIdx: i, rightIdx: i }));
    const t = estimateTransform(cs, left, right);
    let ss = 0;
    for (const p of pairs) {
        const q = applyRigid(t, p.r[0], p.r[1]);
        ss += (q.x - p.l[0]) ** 2 + (q.y - p.l[1]) ** 2;
    }
    return { ...t, n: pairs.length, rms: Math.sqrt(ss / pairs.length) };
}

/** Aplica o rígido (direita → esquerda) a um ponto da referência. */
export function applyRigid(t, x, y) {
    const b = t.angle * Math.PI / 180;
    const c = Math.cos(b), s = Math.sin(b);
    return { x: c * x + s * y + t.tx, y: -s * x + c * y + t.ty };
}

/** Inverso do rígido (esquerda → direita). */
export function invertRigid(t, x, y) {
    const b = t.angle * Math.PI / 180;
    const c = Math.cos(b), s = Math.sin(b);
    const u = x - t.tx, v = y - t.ty;
    return { x: c * u - s * v, y: s * u + c * v };
}

/**
 * Matriz de canvas (a, b, c, d, e, f) que desenha a referência no quadro da
 * latente pelo rígido: ctx.setTransform(...rigidCanvasMatrix(t)).
 */
export function rigidCanvasMatrix(t) {
    const b = t.angle * Math.PI / 180;
    const c = Math.cos(b), s = Math.sin(b);
    return [c, -s, s, c, t.tx, t.ty];
}

/**
 * Reamostra a imagem da referência no quadro da latente (warp inverso):
 * cada pixel (x, y) da saída lê a referência em map(x, y). O mapa é calculado
 * numa grade de `step` px e interpolado (bilinear) entre os nós; a amostra é
 * bilinear. src/dst são ImageData (RGBA). Devolve dst.
 */
export function warpImage(src, dst, map, { step = 8 } = {}) {
    const W = dst.width, H = dst.height;
    // Nós em x = i·step (i = 0..gw-1); o último passa da borda, então todo pixel
    // tem os 4 nós vizinhos (o mapa vale fora da imagem também).
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
            if (!(u >= 0 && v >= 0 && u <= sw - 1 && v <= sh - 1)) { dd[o + 3] = 0; continue; }
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

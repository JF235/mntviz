/**
 * mntviz/events.js — Emissor de eventos e seleção compartilhada.
 *
 * Emitter: on/off/once/emit mínimos, sem dependências. Um listener que lança
 * exceção não derruba os outros (o erro vai para o console).
 *
 * Selection: conjunto ordenado de itens selecionados, comum a viewers e tabelas
 * (brushing & linking). Um item é um objeto livre; a chave padrão é
 * `${layer}:${kind}:${id}` e pode ser trocada pela opção `key`.
 *
 * Uso:
 *   import { Selection } from './mntviz/index.js';
 *   const sel = new Selection();
 *   sel.on('change', ({ items, added, removed, source }) => ...);
 *   viewerA.setSelection(sel); viewerB.setSelection(sel);   // os dois destacam os mesmos itens
 *   sel.set([{ layer: 'analise', kind: 'minutia', id: 7 }], { source: 'tabela' });
 */

export class Emitter {
    constructor() {
        this._listeners = new Map();   // evento -> Set<fn>
    }

    /** Registra `fn` para `event`. Devolve uma função que remove o registro. */
    on(event, fn) {
        if (typeof fn !== 'function') throw new TypeError('mntviz: listener must be a function');
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event).add(fn);
        return () => this.off(event, fn);
    }

    /** Como `on`, mas o listener roda uma vez só. */
    once(event, fn) {
        const off = this.on(event, (payload) => { off(); fn(payload); });
        return off;
    }

    off(event, fn) {
        const subs = this._listeners.get(event);
        if (!subs) return;
        if (fn) subs.delete(fn); else subs.clear();
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
            try { fn(payload); } catch (err) { console.error(`mntviz: listener de '${event}' falhou`, err); }
        }
    }

    removeAllListeners() { this._listeners.clear(); }
}

const _defaultKey = (it) => {
    if (it == null) return 'null';
    if (typeof it !== 'object') return String(it);
    if (it.key != null) return String(it.key);
    return `${it.layer ?? ''}:${it.kind ?? ''}:${it.id ?? ''}`;
};

export class Selection extends Emitter {
    /**
     * @param {object} [options]
     * @param {(item:any) => string} [options.key] - Chave de identidade do item.
     */
    constructor({ key } = {}) {
        super();
        this._key = key || _defaultKey;
        this._items = new Map();   // chave -> item (ordem de inserção)
    }

    /** Chave de identidade de um item (a mesma usada internamente). */
    keyOf(item) { return this._key(item); }

    get items() { return [...this._items.values()]; }
    get size() { return this._items.size; }
    get keys() { return [...this._items.keys()]; }

    has(item) { return this._items.has(this._key(item)); }

    /** Substitui a seleção. */
    set(items, { source = null } = {}) {
        const next = new Map();
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
        this._items = new Map();
        this._changed([], removed, source);
    }

    _changed(added, removed, source) {
        this.emit('change', { items: this.items, added, removed, source });
    }
}

function _asArray(items) {
    if (items == null) return [];
    return Array.isArray(items) ? items : [items];
}

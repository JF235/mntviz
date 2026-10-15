/**
 * mntviz/html-escape.js — Escape de texto para montar HTML (tooltips e popups).
 *
 * Valores que vêm dos dados ou da configuração (nomes de camada, rótulos, cores) nunca vão
 * crus para innerHTML: o mesmo escape serve para o conteúdo e para valores de atributo entre aspas.
 */

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa & < > " ' (aceita qualquer valor; null/undefined viram ''). */
export function escapeHtml(text) {
    return text == null ? '' : String(text).replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

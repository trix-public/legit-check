/**
 * Точка входа для esbuild: highlight.js (core + только javascript).
 * Результат: vendor/highlight-bundle.js — один файл для страницы без node_modules.
 */
import hljs from "highlight.js/lib/core"
import javascript from "highlight.js/lib/languages/javascript"

hljs.registerLanguage("javascript", javascript)

export function highlightJavaScript(code) {
  return hljs.highlight(code, {
    language: "javascript",
    ignoreIllegals: true,
  }).value
}

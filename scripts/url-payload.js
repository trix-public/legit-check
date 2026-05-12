/**
 * Работа со ссылкой на раунд
 * --------------------------
 * Полный JSON раунда (особенно длинный fairness_preimage) кладём в ХЭШ
 * адреса (#d=…), а не в путь страницы. Так длинные данные не попадают
 * в логи веб-сервера как обычный query-string.
 *
 * Порядок разбора в decodePayloadFromLocation:
 *   #d → ?p → #p   (сжатый хеш приоритетнее; затем query; затем не-сжатый хеш)
 *
 * Форматы:
 *   #d=<base64url(gzip(JSON))>  — основной, сжатый (меньше длина ссылки)
 *   #p=<base64url(JSON)>        — без сжатия, если gzip недоступен
 *   ?p=<base64url(JSON)>        — запасной вариант через query
 */

function base64UrlEncode(bytes) {
  let bin = ""
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64UrlDecode(b64url) {
  const norm = b64url.replace(/-/g, "+").replace(/_/g, "/")
  const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function gzipBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(
    new CompressionStream("gzip"),
  )
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzipBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(
    new DecompressionStream("gzip"),
  )
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Собрать фрагмент ссылки вида "#d=…" или "#p=…" из объекта раунда. */
export async function encodePayloadToHash(obj) {
  const json = JSON.stringify(obj)
  const utf8 = new TextEncoder().encode(json)
  if (typeof CompressionStream === "function") {
    try {
      const gz = await gzipBytes(utf8)
      return "#d=" + base64UrlEncode(gz)
    } catch {}
  }
  return "#p=" + base64UrlEncode(utf8)
}

function pickHashParam(hash, key) {
  if (!hash) return null
  const stripped = hash.startsWith("#") ? hash.slice(1) : hash
  for (const piece of stripped.split("&")) {
    const eq = piece.indexOf("=")
    if (eq < 0) continue
    const k = piece.slice(0, eq)
    if (k === key) return piece.slice(eq + 1)
  }
  return null
}

/**
 * Значение p из query (?p=… или ?round=…).
 * Берём только часть URL до # — иначе длинный base64 в ?p= обрезается по # внутри закодированного фрагмента.
 */
function extractSearchParamP(loc) {
  const href = typeof loc?.href === "string" ? loc.href : ""
  const search = loc?.search || ""
  const beforeHash = (href.split("#")[0] || "").trim()
  const keys = ["p", "P", "round", "ROUND"]

  const fromQueryString = (queryString) => {
    const q = queryString.startsWith("?") ? queryString.slice(1) : queryString
    if (!q) return null
    try {
      const sp = new URLSearchParams(q)
      for (const k of keys) {
        const v = sp.get(k)
        if (v) return v
      }
    } catch {
      /* noop */
    }
    return null
  }

  if (beforeHash) {
    try {
      const u = new URL(beforeHash)
      for (const k of keys) {
        const v = u.searchParams.get(k)
        if (v) return v
      }
    } catch {
      /* file:// или необычный href */
    }
    const qi = beforeHash.indexOf("?")
    if (qi >= 0) {
      const q = beforeHash.slice(qi)
      const v = fromQueryString(q)
      if (v) return v
    }
  }

  const fromLocSearch = fromQueryString(
    search.startsWith("?") ? search : search ? `?${search}` : "",
  )
  if (fromLocSearch) return fromLocSearch

  const hay = beforeHash || href
  const m = hay.match(/[?&](?:p|P|round|ROUND)=([^&#]*)/)
  if (m?.[1]) {
    let raw = m[1]
    try {
      raw = decodeURIComponent(raw.replace(/\+/g, "%20"))
    } catch {
      /* оставляем как есть */
    }
    return raw
  }

  return null
}

function parseJsonFromBase64Payload(p, label) {
  if (!p) return null
  const tryOne = (s) => {
    const utf8 = base64UrlDecode(s)
    return JSON.parse(new TextDecoder().decode(utf8))
  }

  const safeDecodeUriComponent = (s) => {
    try {
      return decodeURIComponent(s.replace(/\+/g, "%20"))
    } catch {
      return s
    }
  }

  /** Разное кодирование в ссылках: пробелы вместо +, percent-encoding и т.д. */
  const variants = []
  variants.push(p)
  variants.push(safeDecodeUriComponent(p))
  if (/ /.test(p)) variants.push(p.replace(/ /g, "+"))
  const seen = new Set()
  let lastErr = null
  for (const s of variants) {
    if (seen.has(s)) continue
    seen.add(s)
    try {
      return tryOne(s)
    } catch (e) {
      lastErr = e
    }
  }
  console.warn(`[legit-check] не удалось разобрать ${label}`, lastErr)
  return null
}

/** Прочитать раунд из location.hash или location.search. */
export async function decodePayloadFromLocation(loc) {
  const hash = loc?.hash || ""

  const gz = pickHashParam(hash, "d")
  if (gz) {
    try {
      const compressed = base64UrlDecode(gz)
      const utf8 = await gunzipBytes(compressed)
      return JSON.parse(new TextDecoder().decode(utf8))
    } catch (e) {
      console.warn("[legit-check] не удалось разобрать #d=", e)
    }
  }

  const qp = extractSearchParamP(loc)
  if (qp) {
    const data = parseJsonFromBase64Payload(qp, "?p=")
    if (data !== null) return data
  }

  const raw = pickHashParam(hash, "p")
  if (raw) {
    const data = parseJsonFromBase64Payload(raw, "#p=")
    if (data !== null) return data
  }

  return null
}

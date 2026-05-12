/**
 * Работа со ссылкой на раунд (без сервера)
 * ----------------------------------------
 * Полный JSON раунда (особенно длинный fairness_preimage) кладём в ХЭШ
 * адреса (#d=…), а не в путь страницы. Так длинные данные не попадают
 * в логи веб-сервера как обычный query-string.
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

/** Прочитать раунд из location.hash или location.search. */
export async function decodePayloadFromLocation(loc) {
  const hash = loc?.hash || ""
  const search = loc?.search || ""

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

  const raw = pickHashParam(hash, "p")
  if (raw) {
    try {
      const utf8 = base64UrlDecode(raw)
      return JSON.parse(new TextDecoder().decode(utf8))
    } catch (e) {
      console.warn("[legit-check] не удалось разобрать #p=", e)
    }
  }

  try {
    const u = new URLSearchParams(search)
    const p = u.get("p")
    if (p) {
      const utf8 = base64UrlDecode(p)
      return JSON.parse(new TextDecoder().decode(utf8))
    }
  } catch (e) {
    console.warn("[legit-check] не удалось разобрать ?p=", e)
  }

  return null
}

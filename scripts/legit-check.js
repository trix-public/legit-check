/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ПРОВЕРКА ЧЕСТНОСТИ РАУНДА PvP-РУЛЕТКИ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Схема commit → reveal и пояснения для пользователя — на странице и в README;
 *  здесь только реализация: verifyPvpRoundFairness(), findWinningParty() и вспомогательные функции.
 *
 *  Шаги в коде (A–G):
 *
 *    Шаг A:  salt_bytes     = расшифровать base64(salt)
 *    Шаг B:  preimage_bytes = JSON fairness_preimage в кодировке UTF-8
 *    Шаг C:  склеить        = preimage_bytes ПОТОМ salt_bytes (подряд)
 *    Шаг D:  commit         = SHA-256(склеенные байты) → ровно 32 байта
 *    Шаг E:  сравнить commit с base64(commit_hash) — байт-в-байт
 *    Шаг F:  если задан client_commit_hash — SHA-256(commit) должен совпасть
 *    Шаг G:  если задана roulette_position — позиция из commit и сверка
 *
 */

/**
 * Главная функция проверки.
 *
 * Вход (поля с сервера / из API):
 *   fairness_preimage   — JSON со всеми данными раунда, участвующими в расчёте
 *                         итога; UTF-8 строка байт-в-байт как у сервера
 *   salt                — соль в base64
 *   commit_hash         — обещанный SHA-256 в base64 (ровно 32 байта после декода)
 *   client_commit_hash  — необязательно; если есть — второй слой проверки
 *   roulette_position   — необязательно; если есть — сверяем с формулой из commit
 *
 * Выход:
 *   { ok: true,  computed: { commitHex, commitBase64, …, position } }
 *   { ok: false, code: "…", computed? }  — code см. FAIL_CODES
 */
export async function verifyPvpRoundFairness(input) {
  // Без Web Crypto (например, не-HTTPS в старых браузерах) считать нельзя
  if (typeof globalThis.crypto?.subtle?.digest !== "function") {
    return { ok: false, code: FAIL_CODES.NO_WEB_CRYPTO }
  }

  const preimage =
    typeof input?.fairness_preimage === "string" ? input.fairness_preimage : ""
  if (!preimage.trim()) {
    return { ok: false, code: FAIL_CODES.MISSING_PREIMAGE }
  }

  const saltStr = typeof input?.salt === "string" ? input.salt : ""
  if (!saltStr.trim()) {
    return { ok: false, code: FAIL_CODES.MISSING_SALT }
  }

  const commitB64 =
    typeof input?.commit_hash === "string" ? input.commit_hash : ""
  if (!commitB64.trim()) {
    return { ok: false, code: FAIL_CODES.MISSING_COMMIT }
  }

  const saltBytes = base64ToBytes(saltStr)
  if (!saltBytes) return { ok: false, code: FAIL_CODES.INVALID_SALT_B64 }

  const expectedCommit = base64ToBytes(commitB64)
  if (!expectedCommit || expectedCommit.length !== 32) {
    return { ok: false, code: FAIL_CODES.INVALID_COMMIT_B64 }
  }

  // UTF-8 JSON-строки preimage + байты соли — ровно как на сервере
  const preimageUtf8 = new TextEncoder().encode(preimage)
  const combined = new Uint8Array(preimageUtf8.length + saltBytes.length)
  combined.set(preimageUtf8, 0)
  combined.set(saltBytes, preimageUtf8.length)

  let computedCommit
  try {
    computedCommit = await sha256(combined)
  } catch {
    return { ok: false, code: FAIL_CODES.NO_WEB_CRYPTO }
  }

  // client_commit = SHA-256(commit); сверяется с полем client_commit_hash
  const computedMask = await sha256(computedCommit)
  const computedPos = deriveRoulettePositionFromCommit(computedCommit)
  const computed = {
    commitHex: bytesToHex(computedCommit),
    commitBase64: bytesToBase64(computedCommit),
    clientCommitHex: bytesToHex(computedMask),
    clientCommitBase64: bytesToBase64(computedMask),
    position: computedPos,
  }

  if (!timingSafeEqual(computedCommit, expectedCommit)) {
    return { ok: false, code: FAIL_CODES.COMMIT_MISMATCH, computed }
  }

  const clientB64 =
    typeof input?.client_commit_hash === "string"
      ? input.client_commit_hash
      : ""
  if (clientB64.trim()) {
    const expectedMask = base64ToBytes(clientB64)
    if (!expectedMask || expectedMask.length !== 32) {
      return { ok: false, code: FAIL_CODES.INVALID_CLIENT_B64, computed }
    }
    if (!timingSafeEqual(computedMask, expectedMask)) {
      return { ok: false, code: FAIL_CODES.MASK_MISMATCH, computed }
    }
  }

  const wantedPos = normalizeNumeric(input?.roulette_position)
  if (wantedPos !== null && computedPos !== wantedPos) {
    return { ok: false, code: FAIL_CODES.POSITION_MISMATCH, computed }
  }

  return { ok: true, computed }
}

/**
 * Какая партия выиграла при данной позиции колеса (0…99999).
 * Ищется первая партия, у которой sector_from ≤ позиция ≤ sector_to.
 */
export function findWinningParty(parties, position) {
  if (!Array.isArray(parties) || position == null) return null
  const p = Number(position)
  if (!Number.isFinite(p)) return null
  return (
    parties.find(
      (q) => Number(q.sector_from) <= p && p <= Number(q.sector_to),
    ) ?? null
  )
}

/**
 * Декодирует base64 в массив байтов (0…255).
 * Поддерживаются URL-варианты (- и _ вместо + и /).
 */
export function base64ToBytes(b64) {
  const trimmed = String(b64 ?? "").trim()
  if (!trimmed) return null
  try {
    const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/")
    const pad = normalized.length % 4
    const padded = pad === 0 ? normalized : normalized + "=".repeat(4 - pad)
    const bin = atob(padded)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

/** Байты → шестнадцатеричная строка. */
export function bytesToHex(bytes) {
  let s = ""
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, "0")
  }
  return s
}

/** Байты → обычный base64 (для отображения вычисленного commit). */
export function bytesToBase64(bytes) {
  let bin = ""
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

/** Сравнение двух массивов байт за фиксированное время (снижает риск атак по времени). */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let x = 0
  for (let i = 0; i < a.length; i++) x |= a[i] ^ b[i]
  return x === 0
}

/** Одна операция SHA-256 в браузере (Web Crypto). */
async function sha256(data) {
  const buf = await crypto.subtle.digest("SHA-256", data.slice())
  return new Uint8Array(buf)
}

/**
 * Из 32-байтового commit берётся «лотерейное число» для колеса:
 *   берутся первые 8 байт как БОЛЬШОЕ целое (big-endian), остаток от деления на 100_000.
 * Диапазон результата: 0 … 99999 (сто тысяч дискретных позиций на полный круг).
 */
export function deriveRoulettePositionFromCommit(commit32) {
  if (commit32.length < 8) return 0
  const dv = new DataView(
    commit32.buffer,
    commit32.byteOffset,
    Math.min(8, commit32.byteLength),
  )
  return Number(dv.getBigUint64(0, false) % 100000n)
}

/** Число из поля ввода: принимает и число, и строку вроде "88676". */
function normalizeNumeric(value) {
  if (value == null) return null
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : null
  }
  if (typeof value === "string") {
    const t = value.trim()
    if (!t) return null
    const n = Number(t)
    return Number.isFinite(n) ? Math.trunc(n) : null
  }
  return null
}

/** Коды ошибок */
export const FAIL_CODES = Object.freeze({
  MISSING_PREIMAGE: "missing_preimage",
  MISSING_SALT: "missing_salt",
  MISSING_COMMIT: "missing_commit_hash",
  INVALID_SALT_B64: "invalid_salt_base64",
  INVALID_COMMIT_B64: "invalid_commit_hash_base64",
  INVALID_CLIENT_B64: "invalid_client_commit_hash_base64",
  COMMIT_MISMATCH: "commit_mismatch",
  MASK_MISMATCH: "mask_mismatch",
  POSITION_MISMATCH: "position_mismatch",
  NO_WEB_CRYPTO: "web_crypto_unavailable",
})

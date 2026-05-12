/**
 * Связка интерфейса: строки из i18n, раунд из URL, кнопка → verifyPvpRoundFairness.
 */
import {
  FAIL_CODES,
  base64ToBytes,
  findWinningParty,
  verifyPvpRoundFairness,
} from "./legit-check.js"
import { highlightJavaScript } from "../vendor/highlight-bundle.js"
import { decodePayloadFromLocation, encodePayloadToHash } from "./url-payload.js"
import { t } from "./i18n.js"

const $ = (id) => document.getElementById(id)

/**
 * В поле fairness_preimage JSON показываем с отступами (читабельно).
 * Перед проверкой тот же JSON приводим к однострочному виду JSON.stringify(JSON.parse(…)),
 * как обычно от сервера — так не зависим от пробелов в textarea.
 */

/** Pretty JSON для отображения; не JSON — строка как есть. */
function formatJsonPreimageForDisplay(raw) {
  if (typeof raw !== "string" || !raw.trim()) return raw ?? ""
  const t = raw.trim()
  if (!(t.startsWith("{") || t.startsWith("["))) return raw
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

/** Перед verify: валидный JSON → каноническая однострочная строка; иначе как в поле. */
function normalizeFairnessPreimageForVerify(s) {
  if (typeof s !== "string") return ""
  const t = s.trim()
  if (!t || !(t.startsWith("{") || t.startsWith("["))) return s
  try {
    return JSON.stringify(JSON.parse(s))
  } catch {
    return s
  }
}

function setPreimageFieldFromRound(round) {
  const raw = round?.fairness_preimage
  if (typeof raw !== "string") {
    $("input-preimage").value = ""
    return
  }
  $("input-preimage").value = formatJsonPreimageForDisplay(raw)
}

/** Подставляет русские строки из i18n в разметку (data-i18n, placeholder, title). */
function applyStaticI18n() {
  document.title = t("pageTitle")
  const md = document.querySelector('meta[name="description"]')
  if (md) md.setAttribute("content", t("metaDescription"))

  for (const el of document.querySelectorAll("[data-i18n]")) {
    const key = el.getAttribute("data-i18n")
    if (key) el.textContent = t(key)
  }
  for (const el of document.querySelectorAll("[data-i18n-placeholder]")) {
    const key = el.getAttribute("data-i18n-placeholder")
    if (key) el.setAttribute("placeholder", t(key))
  }
  for (const el of document.querySelectorAll("[data-i18n-title]")) {
    const key = el.getAttribute("data-i18n-title")
    if (key) el.setAttribute("title", t(key))
  }

  const codeEl = $("script-source")
  if (codeEl && !codeEl.textContent.trim()) {
    codeEl.textContent = t("scriptLoading")
  }
}

function setText(id, text) {
  const el = $(id)
  if (el) el.textContent = text ?? ""
}

function setHTML(id, html) {
  const el = $(id)
  if (el) el.innerHTML = html
}

function toMs(ts) {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return null
  return ts < 1e12 ? ts * 1000 : ts
}

function formatDateTime(ms) {
  if (ms == null) return "—"
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, "0")
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatTon(nano) {
  if (typeof nano !== "number" || !Number.isFinite(nano)) return "0"
  const ton = nano / 1e9
  const fixed = ton.toFixed(2)
  return fixed.replace(/\.?0+$/, "") || "0"
}

function shortId(s, n = 8) {
  return typeof s === "string" ? s.slice(0, n) : "?"
}

function initials(name) {
  const s = (name || "").trim()
  if (!s) return "?"
  const parts = s.split(/\s+/)
  const first = parts[0]?.[0] ?? ""
  const second = parts[1]?.[0] ?? ""
  return (first + second).toUpperCase() || s[0].toUpperCase()
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

let toastTimer = null
function toast(message, kind = "ok") {
  const el = $("toast")
  if (!el) return
  el.textContent = message
  el.dataset.kind = kind
  el.classList.add("toast--visible")
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove("toast--visible"), 2000)
}

async function copyText(value) {
  if (!value) return
  try {
    await navigator.clipboard.writeText(String(value))
    toast(t("copied"))
  } catch {
    toast(t("copyFailed"), "err")
  }
}

function updateBytesNote(inputId, noteId, expectLen = null) {
  const input = $(inputId)
  const note = $(noteId)
  if (!input || !note) return
  const val = input.value.trim()
  if (!val) {
    note.textContent = ""
    note.dataset.warn = "false"
    return
  }
  const bytes = base64ToBytes(val)
  if (!bytes) {
    note.textContent = t("invalidBase64")
    note.dataset.warn = "true"
    return
  }
  note.textContent = t("bytesNote", { n: bytes.length })
  note.dataset.warn = String(expectLen != null && bytes.length !== expectLen)
}

function aggregateBets(round) {
  const tonBets = Array.isArray(round?.bets)
    ? round.bets.filter(
        (b) => b.asset_class === "TON" && typeof b.amount === "number",
      )
    : []
  if (tonBets.length > 0) {
    const byUser = new Map()
    for (const b of tonBets) {
      const id = b.user_data?.user_id ?? "?"
      const at = toMs(b.created_at) ?? 0
      const cur = byUser.get(id)
      if (!cur) {
        byUser.set(id, {
          amount: b.amount,
          lastAt: at,
          partyId: b.party_id,
          user: b.user_data ?? {},
        })
      } else {
        cur.amount += b.amount
        if (at > cur.lastAt) cur.lastAt = at
        cur.partyId = b.party_id || cur.partyId
      }
    }
    const total = [...byUser.values()].reduce((s, v) => s + v.amount, 0)
    return [...byUser.values()]
      .map((v) => ({
        user: v.user,
        partyId: v.partyId,
        amountNano: v.amount,
        lastAt: v.lastAt,
        pct: total > 0 ? (v.amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amountNano - a.amountNano)
  }

  const flat = Array.isArray(round?.parties)
    ? round.parties.flatMap((p) =>
        (p.player_banks || []).map((pb) => ({ pb, partyId: p.id })),
      )
    : []
  const total = flat.reduce((s, x) => s + (x.pb.bank ?? 0), 0)
  const roundAt = toMs(round?.created_at) ?? 0
  return flat
    .map(({ pb, partyId }) => ({
      user: pb.user_data ?? {},
      partyId,
      amountNano: pb.bank ?? 0,
      lastAt: roundAt,
      pct: total > 0 ? ((pb.bank ?? 0) / total) * 100 : 0,
    }))
    .sort((a, b) => b.amountNano - a.amountNano)
}

function renderParticipants(round, winningPartyId) {
  const list = $("participants-list")
  if (!list) return
  const rows = aggregateBets(round)
  if (rows.length === 0) {
    list.innerHTML = `<div class="empty">${escapeHtml(t("participantsEmpty"))}</div>`
    return
  }
  list.innerHTML = rows
    .map((r) => {
      const name = r.user.username || shortId(r.user.user_id)
      const photo = r.user.photo_url
      const isWin = winningPartyId != null && r.partyId === winningPartyId
      const avatar = photo
        ? `<img class="row__avatar" src="${escapeHtml(photo)}" referrerpolicy="no-referrer" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'row__avatar row__avatar--fallback',textContent:${JSON.stringify(initials(name))}}))" />`
        : `<div class="row__avatar row__avatar--fallback">${escapeHtml(initials(name))}</div>`
      return `
        <div class="row${isWin ? " row--win" : ""}">
          <div class="row__main">
            ${avatar}
            <div class="row__meta">
              <span class="row__name">${escapeHtml(name)}</span>
              <span class="row__when">${escapeHtml(formatDateTime(r.lastAt))}</span>
            </div>
          </div>
          <div class="row__right">
            <span class="row__pct">${r.pct.toFixed(2)}%</span>
            <span class="row__amount">${escapeHtml(formatTon(r.amountNano))} ${escapeHtml(t("tonLabel"))}</span>
          </div>
        </div>
      `
    })
    .join("")
}

function renderSummary(round, winningParty) {
  setText("summary-game", round?.number != null ? `#${round.number}` : "—")
  setText("summary-date", formatDateTime(toMs(round?.created_at)))
  setText("summary-room", round?.room_name ?? "—")

  const winnerEl = $("summary-winner")
  if (winnerEl) {
    if (winningParty) {
      const isSolo = winningParty.type === "SOLO"
      const banks = winningParty.player_banks || []
      const primary = banks[0]?.user_data
      const name = isSolo
        ? primary?.username || shortId(primary?.user_id ?? "?")
        : winningParty.id
      const chance =
        typeof winningParty.win_probability === "number"
          ? `${(winningParty.win_probability * 100).toFixed(1)}% ${t("chance")}`
          : ""
      winnerEl.innerHTML = `
        <span class="badge badge--${isSolo ? "solo" : "team"}">${escapeHtml(isSolo ? t("soloShort") : t("teamShort"))}</span>
        <span class="winner__name">${escapeHtml(name)}</span>
        ${chance ? `<span class="winner__chance">${escapeHtml(chance)}</span>` : ""}
      `
    } else {
      winnerEl.textContent = "—"
    }
  }

  setText(
    "summary-position",
    round?.roulette_position != null ? String(round.roulette_position) : "—",
  )
}

function populateFields(round) {
  setPreimageFieldFromRound(round)
  $("input-salt").value = round?.salt ?? ""
  $("input-commit").value = round?.commit_hash ?? ""
  $("input-client-commit").value = round?.client_commit_hash ?? ""
  $("input-position").value =
    round?.roulette_position != null ? String(round.roulette_position) : ""

  updateBytesNote("input-salt", "note-salt", null)
  updateBytesNote("input-commit", "note-commit", 32)
  updateBytesNote("input-client-commit", "note-client-commit", 32)
  resetCheckButtonState()
}

function resultPanel(result, round, { scrollToResult = true } = {}) {
  const panel = $("result-panel")
  const fail = $("result-fail")
  const success = $("result-success")
  if (!panel || !fail || !success) return

  if (result.ok) {
    panel.dataset.state = "ok"
    success.textContent = round?.number
      ? t("legitSuccess", { number: round.number })
      : t("legitSuccessGeneric")
    fail.textContent = ""
  } else {
    panel.dataset.state = "fail"
    success.textContent = ""
    const code = result.code
    const detail = t(`fail.${code}`) || code
    fail.textContent = `${t("legitFail")} — ${detail}`
  }
  panel.hidden = false

  const computed = result.computed
  const computedBlock = $("computed-block")
  if (computed && computedBlock) {
    setText("computed-commit", computed.commitHex)
    setText("computed-mask", computed.clientCommitHex)
    setText("computed-position", String(computed.position))
    computedBlock.hidden = false
  } else if (computedBlock) {
    computedBlock.hidden = true
  }

  if (scrollToResult) {
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }
}

function resetCheckButtonState() {
  const btn = $("btn-check")
  const labelEl = $("btn-check-label")
  if (btn) {
    btn.dataset.verify = ""
    btn.classList.remove("btn--verified")
  }
  if (labelEl) labelEl.textContent = t("checkAction")
}

function clearResult() {
  resetCheckButtonState()
  const panel = $("result-panel")
  if (panel) panel.hidden = true
  const computed = $("computed-block")
  if (computed) computed.hidden = true
}

function setCheckButtonVerified(round) {
  const btn = $("btn-check")
  const labelEl = $("btn-check-label")
  if (!btn || !labelEl) return
  btn.dataset.verify = "ok"
  btn.classList.add("btn--verified")
  labelEl.textContent =
    round?.number != null
      ? t("legitSuccess", { number: round.number })
      : t("legitSuccessGeneric")
}

function currentRound() {
  return window.__legitCheckRound ?? null
}

function refreshWinnerForPosition() {
  const round = currentRound()
  if (!round) return
  const posInput = $("input-position").value.trim()
  const posNum = posInput ? Number(posInput) : round?.roulette_position
  const winning = findWinningParty(round.parties, posNum)
  renderSummary({ ...round, roulette_position: posNum }, winning)
  renderParticipants(round, winning?.id ?? null)
}

async function runVerification(options = {}) {
  const { scrollToResult = true } = options
  const btn = $("btn-check")
  if (!btn) return
  const labelEl = $("btn-check-label")

  btn.disabled = true
  try {
    if (labelEl) labelEl.textContent = t("verifying")

    const round = currentRound() ?? {}
    const input = {
      fairness_preimage: normalizeFairnessPreimageForVerify(
        $("input-preimage")?.value ?? "",
      ),
      salt: $("input-salt")?.value?.trim() ?? "",
      commit_hash: $("input-commit")?.value?.trim() ?? "",
      client_commit_hash: $("input-client-commit")?.value?.trim() ?? "",
      roulette_position: $("input-position")?.value?.trim() || null,
    }

    const result = await verifyPvpRoundFairness(input)
    resultPanel(result, round, { scrollToResult })

    if (result.ok && result.computed) {
      const winning = findWinningParty(round.parties, result.computed.position)
      renderSummary(
        { ...round, roulette_position: result.computed.position },
        winning,
      )
      renderParticipants(round, winning?.id ?? null)
    }
    if (result.ok) {
      setCheckButtonVerified(round)
    } else {
      resetCheckButtonState()
    }
  } catch (e) {
    console.error(e)
    toast(t("initFailed"), "err")
    resetCheckButtonState()
  } finally {
    btn.disabled = false
    if (btn.dataset.verify !== "ok" && labelEl) {
      labelEl.textContent = t("checkAction")
    }
  }
}

async function loadScriptSource() {
  const codeEl = $("script-source")
  if (!codeEl) return
  try {
    const res = await fetch("./scripts/legit-check.js", { cache: "no-cache" })
    const text = await res.text()
    codeEl.className = "hljs language-javascript"
    codeEl.innerHTML = highlightJavaScript(text)
    codeEl.dataset.source = "remote"
  } catch (e) {
    codeEl.className = ""
    codeEl.textContent = t("scriptLoadFailed")
    console.warn(e)
  }
}

function wireEvents() {
  $("input-preimage").addEventListener("input", () => {
    clearResult()
  })
  $("input-salt").addEventListener("input", () => {
    updateBytesNote("input-salt", "note-salt", null)
    clearResult()
  })
  $("input-commit").addEventListener("input", () => {
    updateBytesNote("input-commit", "note-commit", 32)
    clearResult()
  })
  $("input-client-commit").addEventListener("input", () => {
    updateBytesNote("input-client-commit", "note-client-commit", 32)
    clearResult()
  })
  $("input-position").addEventListener("input", () => {
    refreshWinnerForPosition()
    clearResult()
  })

  $("btn-check").addEventListener("click", runVerification)

  const deepDiveLink = $("guide-deep-dive-link")
  if (deepDiveLink) {
    deepDiveLink.addEventListener("click", (e) => {
      e.preventDefault()
      $("deep-dive")?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  for (const el of document.querySelectorAll("[data-copy-target]")) {
    el.addEventListener("click", () => {
      const targetId = el.getAttribute("data-copy-target")
      const target = document.getElementById(targetId)
      const val = target?.value ?? target?.textContent ?? ""
      copyText(val)
    })
  }
}

async function bootstrap() {
  applyStaticI18n()
  loadScriptSource()
  wireEvents()

  const round = await decodePayloadFromLocation(location)
  if (round && typeof round === "object") {
    window.__legitCheckRound = round
    populateFields(round)
    const winning = findWinningParty(round.parties, round.roulette_position)
    renderSummary(round, winning)
    renderParticipants(round, winning?.id ?? null)
    await runVerification({ scrollToResult: false })
  }
}

bootstrap().catch((e) => {
  console.error(e)
  toast(t("initFailed"), "err")
})

window.legitCheck = {
  verifyPvpRoundFairness,
  findWinningParty,
  encodePayloadToHash,
  FAIL_CODES,
}

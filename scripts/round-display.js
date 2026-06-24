/**
 * Имена участников в UI legit-check.
 * Поддерживает оба формата user_data из ссылки: v2 (full_name) и v1 (username/user_id).
 * fairness_version в payload не нужен — версию по полям не определяем, только fallback по имени.
 */

export function userDisplayName(userData, shortId) {
  const ud = userData ?? {}
  const fullName = typeof ud.full_name === "string" ? ud.full_name.trim() : ""
  if (fullName) return fullName
  const username = typeof ud.username === "string" ? ud.username.trim() : ""
  if (username) return username
  if (typeof ud.user_id === "string" && ud.user_id.trim()) {
    return shortId(ud.user_id)
  }
  return "?"
}

export function userAggregateKey(userData, partyId, index) {
  const ud = userData ?? {}
  if (typeof ud.user_id === "string" && ud.user_id.trim()) return ud.user_id
  const fullName = typeof ud.full_name === "string" ? ud.full_name.trim() : ""
  if (fullName) return `full_name:${fullName}`
  const username = typeof ud.username === "string" ? ud.username.trim() : ""
  if (username) return `username:${username}`
  return `party:${partyId ?? "?"}:${index}`
}

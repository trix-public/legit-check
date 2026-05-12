/**
 * Все пользовательские строки на русском.
 * Ключи fail.* совпадают с кодами из legit-check.js (англ. коды для совместимости с API).
 */
export const STRINGS = {
  ru: {
    pageTitle: "PvP Рулетка — проверка честности",
    heroTitle: "Проверка честности",
    metaDescription:
      "Самостоятельно проверьте завершённый раунд в браузере: тот же алгоритм commit–reveal, что в приложении.",
    subtitle:
      "Проверка выполняется только у вас в браузере, без запросов к серверу. Ниже — тот же код, который считает кнопку «Проверить».",
    guideTitle: "Простыми словами",
    guideP1:
      "До конца раунда сервер публикует короткий «отпечаток» (хэш). После раунда отдаёт длинный текст и соль. Если сложить их так же, как на сервере, получится ровно тот отпечаток — значит, исход не подменили задним числом.",
    guideP2:
      "Число на колесе (0…99999) однозначно выводится из этого отпечатка. Победитель — партия, в чей сектор попало это число.",
    guideP3:
      "Поля ниже можно править вручную: так можно проверить, что малейшее изменение текста ломает совпадение с хэшем.",
    gameLabel: "Игра",
    dateLabel: "Дата",
    roomLabel: "Комната",
    hash: "Хэш",
    seedLabel: "Соль (seed)",
    rouletteLabel: "Позиция колеса",
    winnerLabel: "Победитель",
    soloShort: "Соло",
    teamShort: "Сквад",
    chance: "шанс",
    participantsTitle: "Участники",
    participantsEmpty: "В этом раунде нет ставок.",
    fieldsTitle: "Данные для проверки",
    fieldsHint:
      "Ниже всё можно менять. Правки не меняют ссылку в адресе — только то, что пересчитает скрипт.",
    preimageLabel: "Раскрытый текст (fairness_preimage), UTF-8",
    preimagePlaceholder:
      "Точная строка, которую хэшировал сервер (часто большой JSON)",
    saltLabel: "Соль (salt), base64",
    commitLabel: "Обещание (commit_hash), base64, 32 байта",
    clientCommitLabel: "Вторая маска (client_commit_hash), base64, не обязательно",
    positionLabel: "Позиция (roulette_position), 0…99999, не обязательно",
    bytesNote: "после base64: {n} байт",
    bytesWarn32: "ожидается 32 байта",
    invalidBase64: "неверный base64",
    checkAction: "Проверить честность",
    verifying: "Считаем…",
    legitSuccess: "Игра #{number} честная",
    legitSuccessGeneric: "Раунд честный",
    legitFail: "Проверка не прошла",
    copy: "Копировать",
    copied: "Скопировано",
    copyFailed: "Не удалось скопировать",
    downloadScript: "Скачать legit-check.js",
    downloadScriptBtn: "Скачать",
    tonLabel: "TON",
    scriptTitle: "Исходный код проверки",
    scriptHint:
      "Это тот же файл, который реально выполняется при нажатии кнопки. Без сборщика, без сжатия кода, без загрузок с интернета.",
    repositoryLink: "Ссылка на репозиторий",
    computedTitle: "Что получилось при пересчёте",
    computedCommit: "Шаг 1: SHA-256( текст UTF-8 + байты соли ) = commit",
    computedMask: "Шаг 2: SHA-256( commit ) = client_commit",
    computedPosition:
      "Шаг 3: первые 8 байт commit как число, по модулю 100 000 = позиция",
    footerNote:
      "После первой загрузки страница работает без интернета. Нужен современный браузер и crypto.subtle (SHA-256).",
    scriptLoading: "// Загрузка…",
    scriptLoadFailed:
      "// Не удалось показать файл legit-check.js.\n// Кнопка «Проверить» всё равно работает — не подгрузился только предпросмотр кода.\n",
    initFailed: "Ошибка при запуске страницы",
    copyHashTitle: "Копировать хэш",
    copySeedTitle: "Копировать соль",
    fail: {
      missing_preimage: "Пустой fairness_preimage — нечего хэшировать.",
      missing_salt: "Пустая соль salt.",
      missing_commit_hash: "Пустой commit_hash.",
      invalid_salt_base64: "Соль salt — не похожа на корректный base64.",
      invalid_commit_hash_base64:
        "commit_hash после base64 не даёт ровно 32 байта.",
      invalid_client_commit_hash_base64:
        "client_commit_hash после base64 не даёт ровно 32 байта.",
      commit_mismatch:
        "Пересчитанный commit не совпадает с commit_hash — изменили текст, соль или хэш.",
      mask_mismatch:
        "SHA-256 от commit не совпадает с client_commit_hash — «вторая маска» не от этого раунда.",
      position_mismatch:
        "Позиция из commit не совпадает с roulette_position — исход не из этого обещания.",
      web_crypto_unavailable:
        "В браузере недоступен Web Crypto. Откройте страницу по https:// или в другом браузере.",
    },
  },
}

export function pickLocale() {
  return "ru"
}

export function t(key, params) {
  const dict = STRINGS[pickLocale()] ?? STRINGS.ru
  const segs = key.split(".")
  let v = dict
  for (const s of segs) {
    if (v && typeof v === "object" && s in v) v = v[s]
    else return key
  }
  if (typeof v !== "string") return key
  if (!params) return v
  return v.replace(/\{(\w+)\}/g, (_, k) =>
    params[k] == null ? `{${k}}` : String(params[k]),
  )
}

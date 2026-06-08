const TelegramBot = require("node-telegram-bot-api");

// Если Node ниже 18, раскомментируй:
// const fetch = require("node-fetch");

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
const OPENROUTER_FALLBACK_MODELS =
  process.env.OPENROUTER_FALLBACK_MODELS || "openrouter/free";
const BOOT_TIME = new Date().toISOString();
const DEBUG_EVENTS_LIMIT = 60;
const debugEvents = [];

console.log(`[Amio] boot ${BOOT_TIME}`);
console.log(`[Amio] OpenRouter model: ${OPENROUTER_MODEL}`);
console.log(`[Amio] OpenRouter fallback models: ${OPENROUTER_FALLBACK_MODELS}`);
console.log("[Amio] redeploy marker: 2026-06-08-openrouter-failover-v4");
pushDebugEvent("boot", {
  model: OPENROUTER_MODEL,
  fallbackModels: getCandidateModels(),
  hasOpenRouterKey: Boolean(OPENROUTER_API_KEY),
});

if (!TELEGRAM_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is missing in env");
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// =========================
// ХРАНЕНИЕ В ПАМЯТИ
// =========================
const users = {};

function getUser(chatId) {
  if (!users[chatId]) {
    users[chatId] = {
      onboardingStep: "new",
      profile: {
        name: "",
        gender: "neutral",
        tone: "Мягко и тепло",
        supportMode: "Просто побудь рядом",
      },
      history: [],
    };
  }
  return users[chatId];
}

function resetUser(chatId) {
  users[chatId] = {
    onboardingStep: "ask_name",
    profile: {
      name: "",
      gender: "neutral",
      tone: "Мягко и тепло",
      supportMode: "Просто побудь рядом",
    },
    history: [],
  };
  return users[chatId];
}

// =========================
// КЛАВИАТУРЫ
// =========================
function mainKeyboard() {
  return {
    keyboard: [
      [{ text: "Мне одиноко" }, { text: "Мне тревожно" }],
      [{ text: "Поговори со мной" }, { text: "Побудь рядом" }],
      [{ text: "Помоги собраться" }],
      [{ text: "⚙️ Настройки" }, { text: "🔄 Пройти опрос заново" }],
    ],
    resize_keyboard: true,
  };
}

function genderKeyboard() {
  return {
    keyboard: [
      [{ text: "Женский род" }],
      [{ text: "Мужской род" }],
      [{ text: "Нейтрально, без рода" }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

function toneKeyboard() {
  return {
    keyboard: [
      [{ text: "Мягко и тепло" }],
      [{ text: "Спокойно и по делу" }],
      [{ text: "Как близкий друг" }],
      [{ text: "Коротко и бережно" }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

function supportModeKeyboard() {
  return {
    keyboard: [
      [{ text: "Просто побудь рядом" }],
      [{ text: "Задавай вопросы" }],
      [{ text: "Помоги успокоиться" }],
      [{ text: "Помоги собраться по шагам" }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

// =========================
// УТИЛИТЫ
// =========================
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateTyping(chatId, text = "") {
  const words = text.split(/\s+/).filter(Boolean).length;
  let delay = words * randomBetween(90, 140);

  if (delay < 500) delay = randomBetween(500, 900);
  if (delay > 2600) delay = randomBetween(1800, 2600);

  await bot.sendChatAction(chatId, "typing");
  await sleep(delay);
}

function normalizeTextForCompare(text = "") {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isTooSimilar(a = "", b = "") {
  const x = normalizeTextForCompare(a);
  const y = normalizeTextForCompare(b);

  if (!x || !y) return false;
  if (x === y) return true;

  if (x.length > 20 && y.length > 20) {
    return x.includes(y) || y.includes(x);
  }

  return false;
}

function truncateText(value, max = 220) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 0) || "";

  const clean = text.replace(/https?:\/\/\S+/gi, "[link]").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}

function getCandidateModels() {
  const models = [
    OPENROUTER_MODEL,
    ...OPENROUTER_FALLBACK_MODELS.split(","),
  ]
    .map((model) => model.trim())
    .filter(Boolean);

  return [...new Set(models)];
}

function pushDebugEvent(type, details = {}) {
  const event = {
    time: new Date().toISOString(),
    type,
    ...details,
  };

  debugEvents.push(event);

  while (debugEvents.length > DEBUG_EVENTS_LIMIT) {
    debugEvents.shift();
  }

  return event;
}

function getDebugEventsForChat(chatId) {
  const id = String(chatId);

  return debugEvents
    .filter((event) => !event.chatId || String(event.chatId) === id)
    .slice(-20);
}

function clearDebugEventsForChat(chatId) {
  const id = String(chatId);

  for (let i = debugEvents.length - 1; i >= 0; i -= 1) {
    if (String(debugEvents[i].chatId) === id) {
      debugEvents.splice(i, 1);
    }
  }

  pushDebugEvent("debug-cleared", { chatId });
}

function formatDebugReport(chatId, user) {
  const events = getDebugEventsForChat(chatId);
  const lines = [
    "🛠 Amio debug report",
    "",
    `Boot: ${BOOT_TIME}`,
    `Now: ${new Date().toISOString()}`,
    `Chat ID: ${chatId}`,
    `Model env: ${OPENROUTER_MODEL}`,
    `Fallback models: ${getCandidateModels().join(", ")}`,
    `OpenRouter key: ${OPENROUTER_API_KEY ? "present" : "missing"}`,
    `Onboarding: ${user.onboardingStep}`,
    `History messages: ${user.history.length}`,
    `Profile: ${truncateText(user.profile, 500)}`,
    "",
    "Recent events:",
  ];

  if (!events.length) {
    lines.push("— пока нет событий для этого чата");
  } else {
    events.forEach((event, index) => {
      const { time, type, chatId: eventChatId, ...details } = event;
      const timePart = time ? time.slice(11, 19) : "--:--:--";
      lines.push(
        `${index + 1}. ${timePart} ${type}: ${truncateText(details, 700)}`
      );
    });
  }

  const report = lines.join("\n");
  return report.length > 3900
    ? `${report.slice(0, 3800)}\n\n…обрезано. Используй /debug_clear и повтори тест.`
    : report;
}

function parseOpenRouterError(errorText = "") {
  let parsed = null;
  let rawParsed = null;

  try {
    parsed = JSON.parse(errorText);
  } catch (error) {
    return {
      message: truncateText(errorText, 300),
    };
  }

  const error = parsed?.error || parsed;
  const metadata = error?.metadata || {};

  if (metadata.raw) {
    try {
      rawParsed = JSON.parse(metadata.raw);
    } catch (rawError) {
      rawParsed = null;
    }
  }

  return {
    message: truncateText(rawParsed?.message || error?.message || errorText, 300),
    code: rawParsed?.code || error?.code,
    providerName: metadata.provider_name,
    isByok: metadata.is_byok,
    retryAfterSeconds:
      rawParsed?.retry_after_seconds ||
      rawParsed?.retry_after_seconds_raw ||
      metadata.retry_after_seconds,
  };
}

function logAiDiagnostic(reason, details = {}) {
  pushDebugEvent(reason, details);

  console.warn("[Amio] AI diagnostic:", {
    reason,
    model: OPENROUTER_MODEL,
    ...details,
  });
}

// =========================
// ПРОМПТ
// =========================
function buildSystemPrompt(profile) {
  const nameLine = profile.name
    ? `Имя пользователя: ${profile.name}.`
    : "Имя пользователя неизвестно.";

  const genderRule =
    profile.gender === "female"
      ? "Если уместно, можно использовать женский род, но не слишком часто."
      : profile.gender === "male"
      ? "Если уместно, можно использовать мужской род, но не слишком часто."
      : "Не используй фразы, где нужно угадывать род пользователя.";

  return `
Ты — Amio. Ты не бот-психолог и не шаблонный помощник. Ты звучишь как живой, тактичный, теплый человек в переписке.

Факты:
- Тебя зовут Amio.
- Если спрашивают, как тебя зовут, отвечай: "Я Amio."
- ${nameLine}
- Стиль общения пользователя: ${profile.tone}.
- Предпочитаемый формат поддержки: ${profile.supportMode}.
- ${genderRule}

Главные правила:
- Отвечай по-русски.
- Пиши естественно, как человек в мессенджере.
- Чаще пиши коротко: 1–4 предложения.
- Не делай каждый ответ одинаковым по структуре.
- Не начинай каждый ответ с сочувствия.
- Не повторяй фразы "Слышу тебя", "Я рядом", "Понимаю тебя", "Это нормально".
- Не используй шаблонные психологические формулировки.
- Не пиши пафосно.
- Не пиши слишком литературно.
- Не пиши как коуч, психотерапевт или служба поддержки.
- Если пользователь написал что-то бытовое или обычное, отвечай просто и по-человечески.
- Если пользователь задал прямой вопрос, сначала ответь на него.
- Если пользователь дал конкретику, опирайся на неё.
- Иногда можно ответить совсем коротко.
- Не задавай вопрос в каждом сообщении.
- Не задавай больше одного вопроса за раз.
- Не возвращай разговор назад.
- Не проси описать подробнее, если пользователь уже всё объяснил.
- Не говори о себе как об ИИ, модели или программе.
- Не путай имя пользователя и имя бота.
- Если пользователь спрашивает, как зовут его, а имя известно, ответь этим именем.

Если пользователь пишет про прогулку, фильм, дождь, улицу, еду, день, усталость, одиночество, спорт, матч, игру, команду, счёт — реагируй как нормальный живой человек, а не как бот поддержки.

Если есть явный риск самоповреждения, суицида или угрозы жизни:
- отвечай очень бережно;
- советуй срочно обратиться к живому человеку рядом;
- предложи немедленно связаться с экстренной помощью или кризисной линией.

Отвечай так, чтобы человеку хотелось продолжать разговор.
`.trim();
}

// =========================
// ИСТОРИЯ
// =========================
function pushHistory(chatId, role, content) {
  const user = getUser(chatId);
  user.history.push({ role, content });

  if (user.history.length > 12) {
    user.history = user.history.slice(-12);
  }
}

// =========================
// ПРЯМЫЕ ОТВЕТЫ
// =========================
function customDirectReply(text, profile = {}) {
  const t = text.toLowerCase().trim();

  if (t.includes("как тебя зовут") || t === "ты кто?" || t === "кто ты?") {
    return "Я Amio.";
  }

  if (
    t.includes("а меня как зовут") ||
    t.includes("как меня зовут") ||
    t.includes("ты помнишь, как меня зовут")
  ) {
    if (profile.name) {
      return `Тебя зовут ${profile.name}.`;
    }
    return "Ты ещё не говорил, как к тебе обращаться.";
  }

  return null;
}

// =========================
// FALLBACK
// =========================
function getFallbackReply(text, profile = {}) {
  const t = (text || "").toLowerCase().trim();

  if (t.includes("как тебя зовут") || t === "кто ты?" || t === "ты кто?") {
    return "Я Amio.";
  }

  if (
    t.includes("как меня зовут") ||
    t.includes("а меня как зовут") ||
    t.includes("ты помнишь, как меня зовут")
  ) {
    if (profile.name) return `Тебя зовут ${profile.name}.`;
    return "Ты ещё не говорил, как к тебе обращаться.";
  }

  if (t.includes("трев")) {
    return "Похоже, тебя сейчас потряхивает.\n\nХочешь, побуду с тобой спокойно или попробуем чуть выдохнуть?";
  }

  if (t.includes("одинок")) {
    return "Непростое ощущение.\n\nМожем просто поговорить, без лишнего.";
  }

  if (t.includes("побудь рядом")) {
    return "Хорошо.\n\nЯ здесь. Пиши как идёт.";
  }

  if (t.includes("собраться")) {
    return "Давай без рывка.\n\nКакая одна вещь сейчас самая первая?";
  }

  if (t.includes("набереж")) {
    return "По набережной — звучит хорошо.\n\nВ такую погоду там, наверное, особенно атмосферно.";
  }

  if (t.includes("дожд")) {
    return "Дождь правда меняет настроение у всего вокруг.\n\nИногда даже приятно в таком пройтись.";
  }

  if (t.includes("поговори")) {
    return "Давай.\n\nО чём хочется начать?";
  }

  if (
    t.includes("проигры") ||
    t.includes("финал") ||
    t.includes("матч") ||
    t.includes("счёт") ||
    /\b\d+\s*:\s*\d+\b/.test(t)
  ) {
    return "Блин, неприятно, когда переживаешь, а всё идёт не туда.\n\nЕсть ещё ощущение, что могут зацепиться?";
  }

  return "Понял тебя.\n\nСейчас нейросеть не ответила нормально, поэтому я пишу запасным ответом. Попробуй ещё раз через минуту — я подхвачу.";
}

// =========================
// ОЧИСТКА ОТВЕТОВ AI
// =========================
function sanitizeAiReply(
  reply,
  originalText = "",
  profile = {},
  history = [],
  chatId = "unknown"
) {
  if (!reply) {
    logAiDiagnostic("sanitize-empty-input", { chatId });
    return null;
  }

  let text = reply.trim();

  if (text.length < 2) {
    logAiDiagnostic("sanitize-too-short", { chatId, length: text.length });
    return null;
  }

  text = text.replace(/^Amio:\s*/i, "").trim();

  const softStarts = [
    "Слышу тебя",
    "Я тебя слышу",
    "Понимаю тебя",
    "Я рядом",
    "Это нормально",
  ];

  for (const start of softStarts) {
    if (text.startsWith(start)) {
      logAiDiagnostic("soft-start-detected-but-not-blocked", {
        chatId,
        start,
      });
      break;
    }
  }

  const lowerOriginal = originalText.toLowerCase().trim();

  if (
    (lowerOriginal.includes("как тебя зовут") ||
      lowerOriginal === "кто ты?" ||
      lowerOriginal === "ты кто?") &&
    /ты зовут|меня зовут ты|просто "ты"/i.test(text)
  ) {
    logAiDiagnostic("fixed-bot-name-answer", { chatId });
    return "Я Amio.";
  }

  if (
    lowerOriginal.includes("как меня зовут") ||
    lowerOriginal.includes("а меня как зовут") ||
    lowerOriginal.includes("ты помнишь, как меня зовут")
  ) {
    logAiDiagnostic("fixed-user-name-answer", {
      chatId,
      hasName: Boolean(profile.name),
    });
    if (profile.name) return `Тебя зовут ${profile.name}.`;
    return "Ты ещё не говорил, как к тебе обращаться.";
  }

  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
  if (lastAssistant && isTooSimilar(text, lastAssistant.content)) {
    logAiDiagnostic("similar-to-last-assistant-but-not-blocked", {
      chatId,
      replyLength: text.length,
    });
  }

  return text;
}

// =========================
// OPENROUTER
// =========================
async function askOpenRouter(chatId, userText) {
  if (!OPENROUTER_API_KEY) {
    logAiDiagnostic("missing-openrouter-api-key", { chatId });
    return null;
  }

  const user = getUser(chatId);
  const systemPrompt = buildSystemPrompt(user.profile);
  const candidateModels = getCandidateModels();

  const messages = [
    { role: "system", content: systemPrompt },
    ...user.history,
    { role: "user", content: userText },
  ];

  pushDebugEvent("openrouter-model-plan", {
    chatId,
    models: candidateModels,
  });

  for (const model of candidateModels) {
    pushDebugEvent("openrouter-request", {
      chatId,
      model,
      historyMessages: user.history.length,
      userTextLength: userText.length,
      userTextPreview: userText.slice(0, 160),
    });

    console.log("[Amio] OpenRouter request:", {
      chatId,
      model,
      historyMessages: user.history.length,
    });

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://amio.local",
        "X-Title": "Amio Telegram Bot",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.8,
        top_p: 0.9,
        presence_penalty: 0.3,
        frequency_penalty: 0.2,
        max_tokens: 450,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const parsedError = parseOpenRouterError(errorText);

      logAiDiagnostic("openrouter-http-error", {
        chatId,
        model,
        status: response.status,
        ...parsedError,
      });

      if ([400, 429, 500, 502, 503, 504].includes(response.status)) {
        pushDebugEvent("openrouter-try-next-model", {
          chatId,
          failedModel: model,
          status: response.status,
          reason: parsedError.message,
        });
        continue;
      }

      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    const finishReason = data?.choices?.[0]?.finish_reason;

    pushDebugEvent("openrouter-response", {
      chatId,
      requestedModel: model,
      returnedModel: data?.model,
      finishReason,
      hasContent: Boolean(content),
      contentLength: content ? content.length : 0,
      contentPreview: content ? content.slice(0, 220) : "",
    });

    console.log("[Amio] OpenRouter response:", {
      chatId,
      requestedModel: model,
      returnedModel: data?.model,
      finishReason,
      hasContent: Boolean(content),
      contentLength: content ? content.length : 0,
    });

    if (!content) {
      logAiDiagnostic("openrouter-empty-content", {
        chatId,
        requestedModel: model,
        returnedModel: data?.model,
        finishReason,
      });
      continue;
    }

    return content;
  }

  logAiDiagnostic("openrouter-all-models-failed", {
    chatId,
    triedModels: candidateModels,
  });

  return null;
}

// =========================
// ONBOARDING
// =========================
async function startOnboarding(chatId) {
  resetUser(chatId);

  return bot.sendMessage(
    chatId,
    "Привет. Я рядом, когда тревожно, одиноко или просто тяжело.\n\nДавай сначала я немного настроюсь под тебя.\n\nКак мне к тебе обращаться?",
    {
      reply_markup: { remove_keyboard: true },
    }
  );
}

async function handleOnboarding(chatId, text) {
  const user = getUser(chatId);

  if (user.onboardingStep === "ask_name") {
    user.profile.name = text.trim().slice(0, 40);
    user.onboardingStep = "ask_gender";

    return bot.sendMessage(chatId, "Как тебе комфортнее, чтобы я обращался?", {
      reply_markup: genderKeyboard(),
    });
  }

  if (user.onboardingStep === "ask_gender") {
    if (text === "Женский род") user.profile.gender = "female";
    else if (text === "Мужской род") user.profile.gender = "male";
    else user.profile.gender = "neutral";

    user.onboardingStep = "ask_tone";

    return bot.sendMessage(chatId, "Какой тон общения тебе ближе?", {
      reply_markup: toneKeyboard(),
    });
  }

  if (user.onboardingStep === "ask_tone") {
    user.profile.tone = text;
    user.onboardingStep = "ask_support_mode";

    return bot.sendMessage(chatId, "Как тебе обычно лучше помогать?", {
      reply_markup: supportModeKeyboard(),
    });
  }

  if (user.onboardingStep === "ask_support_mode") {
    user.profile.supportMode = text;
    user.onboardingStep = "ready";

    return bot.sendMessage(
      chatId,
      "Готово. Я настроился.\n\nМожешь просто написать мне, что происходит.",
      { reply_markup: mainKeyboard() }
    );
  }
}

// =========================
// СООБЩЕНИЯ
// =========================
bot.onText(/\/start/, async (msg) => {
  await startOnboarding(msg.chat.id);
});

bot.onText(/\/debug(?:@\w+)?/, async (msg) => {
  const chatId = msg.chat.id;
  const user = getUser(chatId);

  pushDebugEvent("debug-command", { chatId });

  return bot.sendMessage(chatId, formatDebugReport(chatId, user), {
    disable_web_page_preview: true,
  });
});

bot.onText(/\/debug_clear(?:@\w+)?/, async (msg) => {
  const chatId = msg.chat.id;

  clearDebugEventsForChat(chatId);

  return bot.sendMessage(
    chatId,
    "Debug-отчёт очищен для этого чата. Теперь отправь тестовое сообщение и вызови /debug.",
    { disable_web_page_preview: true }
  );
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith("/start") || text.startsWith("/debug")) return;

  const user = getUser(chatId);

  if (text === "🔄 Пройти опрос заново") {
    return startOnboarding(chatId);
  }

  if (text === "⚙️ Настройки") {
    return bot.sendMessage(
      chatId,
      `Сейчас я настроен так:\n\nИмя: ${user.profile.name || "не указано"}\nОбращение: ${
        user.profile.gender === "female"
          ? "женский род"
          : user.profile.gender === "male"
          ? "мужской род"
          : "без рода"
      }\nТон: ${user.profile.tone}\nФормат поддержки: ${user.profile.supportMode}\n\nМожно пройти опрос заново.`,
      { reply_markup: mainKeyboard() }
    );
  }

  if (user.onboardingStep !== "ready") {
    return handleOnboarding(chatId, text);
  }

  const directReply = customDirectReply(text, user.profile);
  if (directReply) {
    pushDebugEvent("direct-reply", {
      chatId,
      textPreview: text.slice(0, 160),
      replyPreview: directReply.slice(0, 160),
    });
    pushHistory(chatId, "user", text);
    pushHistory(chatId, "assistant", directReply);
    await simulateTyping(chatId, directReply);
    return bot.sendMessage(chatId, directReply, { reply_markup: mainKeyboard() });
  }

  pushHistory(chatId, "user", text);

  let aiReply = null;
  let usedFallback = false;

  try {
    const rawAiReply = await askOpenRouter(chatId, text);
    aiReply = sanitizeAiReply(rawAiReply, text, user.profile, user.history, chatId);
  } catch (error) {
    logAiDiagnostic("ai-exception", {
      chatId,
      message: error?.message,
    });
    console.error("AI error:", error);
  }

  if (!aiReply) {
    usedFallback = true;
    logAiDiagnostic("fallback-used", {
      chatId,
      textLength: text.length,
    });
  }

  const reply = aiReply || getFallbackReply(text, user.profile);

  pushDebugEvent("reply-selected", {
    chatId,
    source: usedFallback ? "fallback" : "ai",
    length: reply.length,
    replyPreview: reply.slice(0, 220),
  });

  console.log("[Amio] reply selected:", {
    chatId,
    source: usedFallback ? "fallback" : "ai",
    length: reply.length,
  });

  pushHistory(chatId, "assistant", reply);

  await simulateTyping(chatId, reply);
  return bot.sendMessage(chatId, reply, { reply_markup: mainKeyboard() });
});
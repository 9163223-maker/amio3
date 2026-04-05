const TelegramBot = require("node-telegram-bot-api");

// Если Node ниже 18, раскомментируй:
// const fetch = require("node-fetch");

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";

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

Если пользователь пишет про прогулку, фильм, дождь, улицу, еду, день, усталость, одиночество — реагируй как нормальный живой человек, а не как бот поддержки.

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

  return "Понял.\n\nПродолжай.";
}

// =========================
// ОЧИСТКА ОТВЕТОВ AI
// =========================
function sanitizeAiReply(reply, originalText = "", profile = {}, history = []) {
  if (!reply) return null;

  let text = reply.trim();

  const bannedStarts = [
    "Слышу тебя",
    "Я тебя слышу",
    "Понимаю тебя",
    "Я рядом",
    "Это нормально",
  ];

  for (const bad of bannedStarts) {
    if (text.startsWith(bad)) {
      return null;
    }
  }

  const lowerOriginal = originalText.toLowerCase().trim();

  if (
    (lowerOriginal.includes("как тебя зовут") ||
      lowerOriginal === "кто ты?" ||
      lowerOriginal === "ты кто?") &&
    /ты зовут|меня зовут ты|просто "ты"/i.test(text)
  ) {
    return "Я Amio.";
  }

  if (
    lowerOriginal.includes("как меня зовут") ||
    lowerOriginal.includes("а меня как зовут") ||
    lowerOriginal.includes("ты помнишь, как меня зовут")
  ) {
    if (profile.name) return `Тебя зовут ${profile.name}.`;
    return "Ты ещё не говорил, как к тебе обращаться.";
  }

  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
  if (lastAssistant && isTooSimilar(text, lastAssistant.content)) {
    return null;
  }

  if (text.length < 2) return null;

  return text;
}

// =========================
// OPENROUTER
// =========================
async function askOpenRouter(chatId, userText) {
  if (!OPENROUTER_API_KEY) {
    return null;
  }

  const user = getUser(chatId);
  const systemPrompt = buildSystemPrompt(user.profile);

  const messages = [
    { role: "system", content: systemPrompt },
    ...user.history,
    { role: "user", content: userText },
  ];

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://amio.local",
      "X-Title": "Amio Telegram Bot",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages,
      temperature: 0.8,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("OpenRouter error:", response.status, errorText);
    return null;
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content?.trim();

  if (!content) return null;
  return content;
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

    return bot.sendMessage(chatId, "Какой стиль общения тебе ближе?", {
      reply_markup: toneKeyboard(),
    });
  }

  if (user.onboardingStep === "ask_tone") {
    user.profile.tone = text;
    user.onboardingStep = "ask_support_mode";

    return bot.sendMessage(chatId, "Когда тебе тяжело, что обычно нужнее?", {
      reply_markup: supportModeKeyboard(),
    });
  }

  if (user.onboardingStep === "ask_support_mode") {
    user.profile.supportMode = text;
    user.onboardingStep = "done";

    return bot.sendMessage(
      chatId,
      `Спасибо${user.profile.name ? `, ${user.profile.name}` : ""}. Я запомнил настройки и буду общаться так, как тебе комфортно.`,
      {
        reply_markup: mainKeyboard(),
      }
    );
  }
}

// =========================
// НОРМАЛИЗАЦИЯ КНОПОК ДЛЯ AI
// =========================
function mapButtonToPrompt(text, profile = {}) {
  const namePart = profile.name ? `Пользователя зовут ${profile.name}. ` : "";

  switch (text) {
    case "Мне тревожно":
      return `${namePart}Пользователь написал: "Мне тревожно". Ответь как живой, спокойный человек. Без шаблонов, без фразы "я рядом", без психотерапевтического тона. Коротко откликнись и мягко продолжи разговор.`;

    case "Мне одиноко":
      return `${namePart}Пользователь написал: "Мне одиноко". Ответь тепло, по-человечески, без пафоса и без шаблонов поддержки.`;

    case "Побудь рядом":
      return `${namePart}Пользователь просит просто побыть рядом. Не давай технику, не анализируй. Просто ответь очень живо и спокойно, как человек в переписке.`;

    case "Поговори со мной":
      return `${namePart}Пользователь хочет обычного разговора. Ответь естественно, как хороший собеседник, а не как психолог.`;

    case "Помоги собраться":
      return `${namePart}Пользователь просит помочь собраться. Ответь конкретно, спокойно и очень по-человечески. Помоги начать с одного маленького шага.`;

    default:
      return text;
  }
}

// =========================
// ОТВЕТ ЧЕРЕЗ AI
// =========================
async function replyWithAI(chatId, originalText) {
  const user = getUser(chatId);

  const directReply = customDirectReply(originalText, user.profile);
  if (directReply) {
    pushHistory(chatId, "user", originalText);
    pushHistory(chatId, "assistant", directReply);

    await simulateTyping(chatId, directReply);

    return bot.sendMessage(chatId, directReply, {
      reply_markup: mainKeyboard(),
    });
  }

  const aiInput = mapButtonToPrompt(originalText, user.profile);

  pushHistory(chatId, "user", originalText);

  let aiReply = null;
  try {
    aiReply = await askOpenRouter(chatId, aiInput);
  } catch (e) {
    console.error("AI request failed:", e);
  }

  aiReply = sanitizeAiReply(
    aiReply,
    originalText,
    user.profile,
    user.history
  );

  const finalReply = aiReply || getFallbackReply(originalText, user.profile);

  pushHistory(chatId, "assistant", finalReply);

  await simulateTyping(chatId, finalReply);

  return bot.sendMessage(chatId, finalReply, {
    reply_markup: mainKeyboard(),
  });
}

// =========================
// КОМАНДЫ
// =========================
bot.onText(/\/start/, async (msg) => {
  await startOnboarding(msg.chat.id);
});

bot.onText(/\/reset/, async (msg) => {
  await startOnboarding(msg.chat.id);
});

// =========================
// ОСНОВНОЙ ОБРАБОТЧИК
// =========================
bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();

    if (!text) return;
    if (text === "/start" || text === "/reset") return;

    const user = getUser(chatId);

    if (text === "🔄 Пройти опрос заново" || text === "⚙️ Настройки") {
      return startOnboarding(chatId);
    }

    if (
      user.onboardingStep === "ask_name" ||
      user.onboardingStep === "ask_gender" ||
      user.onboardingStep === "ask_tone" ||
      user.onboardingStep === "ask_support_mode"
    ) {
      return handleOnboarding(chatId, text);
    }

    if (user.onboardingStep === "new") {
      return startOnboarding(chatId);
    }

    return replyWithAI(chatId, text);
  } catch (error) {
    console.error("Bot error:", error);

    return bot.sendMessage(
      msg.chat.id,
      "У меня сейчас что-то не сработало, но можешь написать ещё раз.",
      {
        reply_markup: mainKeyboard(),
      }
    );
  }
});

console.log("Bot is running...");

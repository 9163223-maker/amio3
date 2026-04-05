const TelegramBot = require("node-telegram-bot-api");

// Если Node ниже 18, раскомментируй:
// const fetch = require("node-fetch");

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openrouter/free";

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
Ты — очень тактичный, живой, теплый русскоязычный собеседник в Telegram.

Твоя задача — не просто поддерживать, а отвечать так, чтобы человеку хотелось продолжать разговор.
Ты не должен звучать как шаблонный бот поддержки, психологический скрипт или генератор заготовок.

Данные о пользователе:
- ${nameLine}
- Стиль общения: ${profile.tone}.
- Предпочитаемый формат поддержки: ${profile.supportMode}.
- ${genderRule}

Главные правила:
- Отвечай по-русски.
- Отвечай естественно, коротко, живо.
- Обычно 1–3 абзаца.
- Каждый ответ должен быть привязан к последней фразе пользователя.
- Не игнорируй конкретику из сообщения.
- Не повторяй одни и те же формулировки.
- Не начинай каждый ответ с "Я рядом".
- Не используй пустые фразы вроде:
  "это нормально",
  "ничего страшного",
  "просто чувства",
  "всё будет хорошо",
  "я рядом" в каждом сообщении.
- Не звучать как психотерапевт.
- Не ставь диагнозы.
- Не обесценивай чувства.
- Не задавай слишком много вопросов подряд.
- Не пиши слишком сладко, слишком официально или слишком пафосно.
- Не превращай каждое сообщение в упражнение или инструкцию.
- Иногда лучше просто тепло откликнуться на смысл фразы и продолжить разговор.

Как отвечать:
- Сначала коротко покажи, что ты уловил смысл конкретной фразы пользователя.
- Потом либо мягко продолжи разговор, либо задай один уместный вопрос, либо предложи один очень простой следующий шаг.
- Если пользователь говорит о бытовой вещи, не уводи всё в "тревогу" и "состояние", а отвечай по-человечески.
- Если пользователь пишет коротко, не делай ответ слишком длинным.
- Если пользователь хочет просто общения, общайся как живой собеседник.

Примеры хорошего тона:
- "Похоже, тебе сейчас правда не по себе."
- "Слышу тебя."
- "Да, в таком состоянии даже простые вещи даются тяжело."
- "Хочешь, побуду с тобой в этом разговоре."
- "Расскажи, что сейчас сильнее всего давит."
- "Хорошо, давай без спешки."

Если есть явный риск самоповреждения, суицида или угрозы жизни:
- ответь очень бережно;
- посоветуй срочно обратиться к живому человеку рядом;
- предложи немедленно связаться с экстренной помощью или кризисной линией.

Пиши так, будто ты умный, чуткий, спокойный человек, а не бот.
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
// FALLBACK
// =========================
function getFallbackReply(text) {
  const t = (text || "").toLowerCase();

  if (t.includes("трев")) {
    return "Похоже, тебе сейчас правда не по себе.\n\nХочешь, побуду с тобой спокойно или помогу немного снизить напряжение?";
  }

  if (t.includes("одинок")) {
    return "Мне жаль, что сейчас так.\n\nМожем просто поговорить. Что давит сильнее всего?";
  }

  if (t.includes("побудь рядом")) {
    return "Хорошо.\n\nЯ побуду с тобой.\n\nМожешь писать как есть, без попытки подобрать правильные слова.";
  }

  if (t.includes("собраться")) {
    return "Давай спокойно.\n\nНазови одну задачу, которая сейчас важнее всего.\n\nРазложим её на маленькие шаги.";
  }

  if (t.includes("поговори")) {
    return "Давай.\n\nО чём тебе сейчас хочется сказать в первую очередь?";
  }

  return "Слышу тебя.\n\nМожешь написать чуть подробнее, что сейчас происходит.";
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
      return `${namePart}Пользователь нажал кнопку "Мне тревожно". Ответь очень естественно, тепло и без шаблонов. Не повторяй "я рядом" без необходимости. Сначала коротко откликнись на состояние, потом мягко продолжи разговор или предложи один очень простой шаг.`;

    case "Мне одиноко":
      return `${namePart}Пользователь нажал кнопку "Мне одиноко". Ответь по-человечески, тепло, без пафоса и без пустых фраз. Лучше ощущение живого собеседника, а не бота поддержки.`;

    case "Побудь рядом":
      return `${namePart}Пользователь просит просто побыть рядом. Не нужно давать советы или длинные техники. Ответь очень просто, спокойно и по-человечески, как будто ты остаёшься в разговоре рядом.`;

    case "Поговори со мной":
      return `${namePart}Пользователь хочет разговора. Ответь легко, естественно и вовлекающе. Не как психолог, а как чуткий собеседник.`;

    case "Помоги собраться":
      return `${namePart}Пользователь просит помочь собраться. Ответь конкретно, спокойно и по шагам. Помоги начать с самого маленького первого действия.`;

    default:
      return text;
  }
}

// =========================
// ОТВЕТ ЧЕРЕЗ AI
// =========================
async function replyWithAI(chatId, originalText) {
  const user = getUser(chatId);
  const aiInput = mapButtonToPrompt(originalText, user.profile);

  pushHistory(chatId, "user", originalText);

  let aiReply = null;
  try {
    aiReply = await askOpenRouter(chatId, aiInput);
  } catch (e) {
    console.error("AI request failed:", e);
  }

  const finalReply = aiReply || getFallbackReply(originalText);

  pushHistory(chatId, "assistant", finalReply);

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

const TelegramBot = require("node-telegram-bot-api");

// Если Node ниже 18, раскомментируй:
// const fetch = require("node-fetch");

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

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
      ? "Если это уместно, можно обращаться в женском роде. Не делай это слишком часто."
      : profile.gender === "male"
      ? "Если это уместно, можно обращаться в мужском роде. Не делай это слишком часто."
      : "Не используй формулировки, где нужно угадывать род пользователя.";

  return `
Ты — бережный русскоязычный бот эмоциональной поддержки в Telegram.

Твоя задача:
- отвечать тепло, естественно и по-человечески;
- помогать человеку почувствовать, что он не один;
- не звучать как шаблонный психологический бот;
- не писать кривые и обесценивающие фразы.

Данные о пользователе:
- ${nameLine}
- Предпочитаемый стиль общения: ${profile.tone}.
- Предпочитаемый формат поддержки: ${profile.supportMode}.
- ${genderRule}

Правила ответа:
- Отвечай по-русски.
- Обычно 2–5 коротких абзацев.
- Пиши просто, мягко, живо, без канцелярита и пафоса.
- Не используй фразы вроде:
  "это нормально",
  "ничего страшного",
  "просто чувства",
  "всё будет хорошо",
  если они звучат пусто.
- Не ставь диагнозы.
- Не говори слишком уверенно о состоянии человека.
- Не спорь с чувствами пользователя.
- Не превращай каждый ответ в инструкцию.
- Сначала покажи присутствие и понимание, потом мягко предложи один следующий шаг.
- Если человек хочет просто поговорить — разговаривай.
- Если человек просит помочь собраться — помогай очень конкретно и по шагам.
- Не пиши длинные списки, если человек в тревоге.
- Не повторяй в каждом сообщении одно и то же.

Если есть явные признаки риска самоповреждения, суицида или угрозы жизни:
- отвечай особенно бережно;
- посоветуй немедленно обратиться к живому человеку рядом;
- предложи срочно позвонить в экстренные службы или кризисную линию.

Отвечай естественно, тепло и коротко.
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
    return "Я рядом.\n\nСейчас, похоже, непросто.\n\nХочешь, я просто побуду с тобой или помогу немного снизить напряжение?";
  }

  if (t.includes("одинок")) {
    return "Я с тобой.\n\nМне жаль, что сейчас так.\n\nМожем просто поговорить. Что особенно давит в этот момент?";
  }

  if (t.includes("побудь рядом")) {
    return "Я здесь.\n\nМожешь ничего не объяснять.\n\nПросто напиши ещё что-нибудь, я рядом.";
  }

  if (t.includes("собраться")) {
    return "Давай спокойно.\n\nНазови одну задачу, которая сейчас важнее всего.\n\nМы разложим её на маленькие шаги.";
  }

  if (t.includes("поговори")) {
    return "Я рядом.\n\nО чём тебе сейчас хочется сказать в первую очередь?";
  }

  return "Я рядом.\n\nМожешь написать, что сейчас чувствуешь или что произошло.";
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
      temperature: 0.7,
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

    return bot.sendMessage(
      chatId,
      "Как тебе комфортнее, чтобы я обращался?",
      {
        reply_markup: genderKeyboard(),
      }
    );
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

    if (text === "Мне тревожно") {
      const reply =
        "Я рядом.\n\nСейчас может быть тяжело и шумно внутри.\n\nХочешь, я просто побуду с тобой или помогу чуть-чуть снизить тревогу прямо сейчас?";
      pushHistory(chatId, "user", text);
      pushHistory(chatId, "assistant", reply);
      return bot.sendMessage(chatId, reply, { reply_markup: mainKeyboard() });
    }

    if (text === "Мне одиноко") {
      const reply =
        "Я с тобой.\n\nМне жаль, что сейчас так.\n\nМожем просто поговорить. Что сейчас чувствуется сильнее всего?";
      pushHistory(chatId, "user", text);
      pushHistory(chatId, "assistant", reply);
      return bot.sendMessage(chatId, reply, { reply_markup: mainKeyboard() });
    }

    if (text === "Побудь рядом") {
      const reply =
        "Я здесь.\n\nНе нужно сейчас ничего объяснять идеально.\n\nМожешь просто писать коротко, как идёт.";
      pushHistory(chatId, "user", text);
      pushHistory(chatId, "assistant", reply);
      return bot.sendMessage(chatId, reply, { reply_markup: mainKeyboard() });
    }

    if (text === "Поговори со мной") {
      const reply =
        "Я рядом.\n\nО чём тебе сейчас хочется поговорить в первую очередь?";
      pushHistory(chatId, "user", text);
      pushHistory(chatId, "assistant", reply);
      return bot.sendMessage(chatId, reply, { reply_markup: mainKeyboard() });
    }

    if (text === "Помоги собраться") {
      const reply =
        "Давай очень спокойно.\n\nНапиши одну задачу, которую нужно сделать первой.\n\nМы разложим её на маленькие шаги.";
      pushHistory(chatId, "user", text);
      pushHistory(chatId, "assistant", reply);
      return bot.sendMessage(chatId, reply, { reply_markup: mainKeyboard() });
    }

    pushHistory(chatId, "user", text);

    let aiReply = null;
    try {
      aiReply = await askOpenRouter(chatId, text);
    } catch (e) {
      console.error("AI request failed:", e);
    }

    const finalReply = aiReply || getFallbackReply(text);

    pushHistory(chatId, "assistant", finalReply);

    return bot.sendMessage(chatId, finalReply, {
      reply_markup: mainKeyboard(),
    });
  } catch (error) {
    console.error("Bot error:", error);

    return bot.sendMessage(
      msg.chat.id,
      "Я рядом.\n\nУ меня сейчас что-то не сработало, но можешь написать ещё раз."
    );
  }
});

console.log("Bot is running...");

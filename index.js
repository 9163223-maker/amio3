const TelegramBot = require("node-telegram-bot-api");

// ===== ТОКЕНЫ =====
const BOT_TOKEN = process.env.BOT_TOKEN || "PASTE_BOT_TOKEN";
const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY || "PASTE_OPENROUTER_KEY";

// 👉 ВАЖНО: используем авто (бесплатные модели)
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openrouter/auto";

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ===== ХРАНЕНИЕ =====
const users = {};

function getUser(id) {
  if (!users[id]) {
    users[id] = {
      step: "new",
      profile: {
        name: "",
        gender: "neutral",
        tone: "Мягко и тепло",
        mode: "Просто побудь рядом",
      },
      history: [],
    };
  }
  return users[id];
}

// ===== КНОПКИ =====
function mainKeyboard() {
  return {
    keyboard: [
      [{ text: "Мне одиноко" }, { text: "Мне тревожно" }],
      [{ text: "Поговори со мной" }, { text: "Побудь рядом" }],
      [{ text: "Помоги собраться" }],
      [{ text: "⚙️ Настройки" }],
    ],
    resize_keyboard: true,
  };
}

function genderKeyboard() {
  return {
    keyboard: [
      [{ text: "Женский род" }],
      [{ text: "Мужской род" }],
      [{ text: "Нейтрально" }],
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
      [{ text: "Как друг" }],
      [{ text: "Коротко и бережно" }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

function modeKeyboard() {
  return {
    keyboard: [
      [{ text: "Просто побудь рядом" }],
      [{ text: "Задавай вопросы" }],
      [{ text: "Помоги успокоиться" }],
      [{ text: "Помоги собраться" }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

// ===== ПРОМПТ =====
function buildPrompt(profile) {
  const genderRule =
    profile.gender === "female"
      ? "Можно использовать женский род."
      : profile.gender === "male"
      ? "Можно использовать мужской род."
      : "Не используй род.";

  return `
Ты — бережный русскоязычный бот поддержки.

Правила:
- Пиши просто, тепло и по-человечески
- 2–4 коротких абзаца
- Не используй фразы:
  "это нормально"
  "ничего страшного"
  "просто чувства"
- Не обесценивай
- Не философствуй
- Не играй в психолога
- Сначала поддержка → потом мягкий шаг

Стиль: ${profile.tone}
Формат помощи: ${profile.mode}
${genderRule}

Примеры хорошего тона:
- Я рядом
- Понимаю, сейчас тяжело
- Давай спокойно
- Хочешь, я побуду с тобой?
  `.trim();
}

// ===== ИСТОРИЯ =====
function addHistory(user, role, text) {
  user.history.push({ role, content: text });
  if (user.history.length > 10) user.history.shift();
}

// ===== AI =====
async function askAI(user, text) {
  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [
            { role: "system", content: buildPrompt(user.profile) },
            ...user.history,
            { role: "user", content: text },
          ],
        }),
      }
    );

    const data = await response.json();
    return data?.choices?.[0]?.message?.content;
  } catch (e) {
    return null;
  }
}

// ===== START =====
bot.onText(/\/start/, (msg) => {
  const user = getUser(msg.chat.id);
  user.step = "ask_name";

  bot.sendMessage(
    msg.chat.id,
    "Привет. Я рядом.\n\nДавай немного настрою общение под тебя.\n\nКак мне к тебе обращаться?"
  );
});

// ===== ОСНОВНОЙ ОБРАБОТЧИК =====
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text === "/start") return;

  const user = getUser(chatId);

  // ===== НАСТРОЙКИ =====
  if (text === "⚙️ Настройки") {
    user.step = "ask_name";
    return bot.sendMessage(chatId, "Как мне к тебе обращаться?");
  }

  // ===== ONBOARDING =====
  if (user.step === "ask_name") {
    user.profile.name = text;
    user.step = "ask_gender";

    return bot.sendMessage(chatId, "Как обращаться?", {
      reply_markup: genderKeyboard(),
    });
  }

  if (user.step === "ask_gender") {
    if (text.includes("Жен")) user.profile.gender = "female";
    else if (text.includes("Муж")) user.profile.gender = "male";
    else user.profile.gender = "neutral";

    user.step = "ask_tone";

    return bot.sendMessage(chatId, "Стиль общения?", {
      reply_markup: toneKeyboard(),
    });
  }

  if (user.step === "ask_tone") {
    user.profile.tone = text;
    user.step = "ask_mode";

    return bot.sendMessage(chatId, "Что важно в поддержке?", {
      reply_markup: modeKeyboard(),
    });
  }

  if (user.step === "ask_mode") {
    user.profile.mode = text;
    user.step = "done";

    return bot.sendMessage(chatId, "Я рядом.", {
      reply_markup: mainKeyboard(),
    });
  }

  // ===== БЫСТРЫЕ СЦЕНАРИИ =====
  if (text === "Мне тревожно") {
    return bot.sendMessage(
      chatId,
      "Я рядом.\n\nХочешь просто побыть в тишине или немного снизим тревогу?"
    );
  }

  if (text === "Мне одиноко") {
    return bot.sendMessage(
      chatId,
      "Я с тобой.\n\nМожем просто поговорить. Что сейчас больше всего чувствуешь?"
    );
  }

  if (text === "Побудь рядом") {
    return bot.sendMessage(chatId, "Я здесь.\n\nМожешь просто писать.");
  }

  if (text === "Помоги собраться") {
    return bot.sendMessage(
      chatId,
      "Давай спокойно.\n\nНазови одну задачу — разложим её."
    );
  }

  // ===== AI ОТВЕТ =====
  addHistory(user, "user", text);

  let reply = await askAI(user, text);

  if (!reply) {
    reply = "Я рядом.\n\nНапиши, что сейчас происходит.";
  }

  addHistory(user, "assistant", reply);

  bot.sendMessage(chatId, reply, {
    reply_markup: mainKeyboard(),
  });
});

console.log("Bot is running...");

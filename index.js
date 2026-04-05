import express from "express";
import axios from "axios";

const TELEGRAM_TOKEN = "8592428203:AAFNlV4m-zD2FOP65ZMn96pl01q6EXXjNaQ";
const OPENROUTER_API_KEY = "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";

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// ---------------- UI ----------------
function keyboard() {
  return {
    keyboard: [
      [{ text: "Мне одиноко" }, { text: "Мне тревожно" }],
      [{ text: "Поговори со мной" }, { text: "Побудь рядом" }],
      [{ text: "Помоги собраться" }],
      [{ text: "⚙️ Настройки" }, { text: "⭐ Amio Pro" }]
    ],
    resize_keyboard: true
  };
}

// ---------------- Utils ----------------
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clean(text) {
  let t = text || "";

  const bad = [
    "я понимаю",
    "давай попробуем",
    "звучит как",
    "это может ощущаться",
    "я здесь, чтобы помочь",
    "хочешь, я помогу"
  ];

  bad.forEach(p => {
    t = t.replace(new RegExp(p, "gi"), "");
  });

  return t.trim();
}

// ---------------- Amio prompt ----------------
function prompt() {
  return `
Ты — Amio.

Стиль:
коротко, по-человечески, без книжных фраз.

Нельзя:
- "я понимаю"
- длинные объяснения
- списки
- быть слишком правильным

Тон:
тёплый, спокойный, немного живой

Формат:
1–3 коротких предложения

Иногда можно:
"ок", "ну да", "жёстко", "классика" (редко)

Ты не решаешь проблему.
Ты рядом.
`;
}

// ---------------- AI ----------------
async function generateReply(userMessage) {
  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "mistralai/mistral-7b-instruct",
      messages: [
        { role: "system", content: prompt() },
        { role: "user", content: userMessage }
      ]
    },
    {
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  return res.data.choices[0].message.content;
}

// ---------------- Telegram ----------------
async function sendMessage(chatId, text) {
  await axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text,
    reply_markup: keyboard()
  });
}

// ---------------- Webhook ----------------
app.post(`/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
  try {
    const message = req.body.message;
    const chatId = message.chat.id;
    const text = message.text;

    if (!text) return res.sendStatus(200);

    if (text === "/start") {
      await sendMessage(chatId, "привет. я amio. как ты?");
      return res.sendStatus(200);
    }

    let reply = await generateReply(text);
    reply = clean(reply);

    await delay(900);
    await sendMessage(chatId, reply);

    res.sendStatus(200);
  } catch (err) {
    console.log(err.response?.data || err.message);
    res.sendStatus(200);
  }
});

// ---------------- Health ----------------
app.get("/", (req, res) => {
  res.send("Amio running");
});

app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});
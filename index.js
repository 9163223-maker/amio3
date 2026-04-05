import express from "express";
import axios from "axios";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

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

  return t.trim() || "я здесь";
}

function prompt() {
  return `
Ты — Amio.

Коротко, просто, по-человечески.
1–3 коротких предложения.

Не используй:
- "я понимаю"
- длинные объяснения
- списки
- слишком книжный язык

Тон:
тёплый, спокойный, немного живой.

Ты рядом, а не решаешь проблему.
`;
}

async function generateReply(userMessage) {
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openrouter/free",
        messages: [
          { role: "system", content: prompt() },
          { role: "user", content: userMessage }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "X-Title": "Amio"
        }
      }
    );

    console.log("AI RESPONSE:", JSON.stringify(res.data, null, 2));

    return res.data.choices?.[0]?.message?.content || "я здесь";
  } catch (err) {
    console.log("OPENROUTER ERROR:", err.response?.data || err.message);
    return "сейчас не отвечаю. попробуй ещё раз";
  }
}

async function sendMessage(chatId, text) {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text,
      reply_markup: keyboard()
    });
  } catch (err) {
    console.log("TELEGRAM SEND ERROR:", err.response?.data || err.message);
  }
}

app.post("/webhook", async (req, res) => {
  try {
    const message = req.body?.message;

    console.log("WEBHOOK BODY:", JSON.stringify(req.body, null, 2));

    if (!message) {
      return res.sendStatus(200);
    }

    const chatId = message.chat?.id;
    const text = message.text;

    console.log("USER:", text);

    if (!chatId || !text) {
      return res.sendStatus(200);
    }

    if (text === "/start") {
      await sendMessage(chatId, "привет. я amio. как ты?");
      return res.sendStatus(200);
    }

    let reply = await generateReply(text);
    reply = clean(reply);

    await delay(900);
    await sendMessage(chatId, reply);

    return res.sendStatus(200);
  } catch (err) {
    console.log("SERVER ERROR:", err.response?.data || err.message);
    return res.sendStatus(200);
  }
});

app.get("/", (req, res) => {
  res.send("Amio running");
});

app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
  console.log("TOKEN PRESENT:", !!TELEGRAM_TOKEN);
  console.log("OPENROUTER KEY PRESENT:", !!OPENROUTER_API_KEY);
});

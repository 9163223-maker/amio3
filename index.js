import express from "express";
import axios from "axios";
import OpenAI from "openai";

const TELEGRAM_TOKEN = "8592428203:AAFNlV4m-zD2FOP65ZMn96pl01q6EXXjNaQ";
const OPENAI_API_KEY = "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";
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

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
  return text
    .replace(/я понимаю/gi, "")
    .replace(/давай попробуем/gi, "")
    .replace(/звучит как/gi, "")
    .trim();
}

async function sendMessage(chatId, text) {
  await axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text,
    reply_markup: keyboard()
  });
}

function prompt() {
  return `
Ты — Amio.
Коротко, просто, по-человечески.
Без книжных фраз, без "я понимаю", без длинных объяснений.
1-3 коротких предложения.
`;
}

app.post(`/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
  try {
    const msg = req.body.message;
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === "/start") {
      await sendMessage(chatId, "привет. я amio. как ты?");
      return res.sendStatus(200);
    }

    const response = await client.responses.create({
      model: "gpt-5.4-mini",
      input: [
        { role: "developer", content: prompt() },
        { role: "user", content: text }
      ]
    });

    let reply = response.output_text || "я здесь";
    reply = clean(reply);

    await delay(800);
    await sendMessage(chatId, reply);

    res.sendStatus(200);
  } catch (e) {
    console.log(e);
    res.sendStatus(200);
  }
});

app.get("/", (req, res) => {
  res.send("Amio running");
});

app.listen(PORT, () => {
  console.log("Server started");
});

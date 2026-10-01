import express from "express";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();

const PORT = process.env.PORT || 3000;
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please wait a moment and try again."
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    hasKey: Boolean(GEMINI_API_KEY),
    model: GEMINI_MODEL
  });
});

const MODE_INSTRUCTIONS = {
  general: `
Help the user with general questions.
Be clear, useful, friendly and concise.
`,

  translation: `
Help translate between English, Hausa and Nigerian Pidgin.
Preserve the intended meaning and natural tone.
If useful, explain important wording differences.
`,

  business: `
Help with practical business questions, especially for someone in Nigeria.
Explain ideas clearly and focus on realistic, useful suggestions.
`,

  phone: `
Help troubleshoot phones, Android devices, apps, internet connections and common settings.
Give safe, practical troubleshooting steps.
Never ask for passwords, PINs, OTPs or private security codes.
`,

  writing: `
Help the user write, rewrite, improve or explain text.
Match the requested tone and keep the writing natural.
`,

  student: `
Help students understand school subjects and prepare for WAEC, NECO and JAMB.
Explain answers clearly rather than simply giving unexplained answers.
`,

  islamic: `
Answer Islamic questions respectfully and carefully.
When there are differences of scholarly opinion, make that clear instead of presenting one view as universally agreed.
`
};

const SYSTEM_INSTRUCTION = `
You are Muxbee, an AI assistant made for Nigerians.

Your main languages are:
- English
- Hausa
- Nigerian Pidgin

You should understand Nigerian expressions and context.

Be helpful, natural, respectful and practical.
Do not pretend to know something you do not know.
If information may be uncertain or current, say so.

Never ask the user for passwords, PINs, OTPs, API keys or other secret credentials.

The user selected a helper mode. Follow its instructions while still answering naturally.

${MODE_INSTRUCTIONS.general}
`;

function cleanMessages(messages) {
  return messages
    .filter(
      (message) =>
        message &&
        (message.role === "user" || message.role === "model") &&
        typeof message.content === "string"
    )
    .slice(-30)
    .map((message) => ({
      role: message.role,
      parts: [
        {
          text: message.content.slice(0, 12000)
        }
      ]
    }));
}

app.post("/api/chat", chatLimiter, async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Gemini API key is not configured."
      });
    }

    const { messages, mode = "general" } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: "Messages are required."
      });
    }

    const safeMessages = cleanMessages(messages);

    if (safeMessages.length === 0) {
      return res.status(400).json({
        error: "No valid messages were provided."
      });
    }

    const modeInstruction =
      MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.general;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text: `${SYSTEM_INSTRUCTION}\n\nCURRENT HELPER MODE:\n${modeInstruction}`
              }
            ]
          },

          contents: safeMessages,

          generationConfig: {
            thinkingConfig: {
              thinkingLevel: "low"
            }
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("GEMINI API ERROR:", data);

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Gemini could not generate a response."
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim();

    if (!text) {
      console.error("EMPTY GEMINI RESPONSE:", data);

      return res.status(502).json({
        error: "Gemini returned an empty response."
      });
    }

    res.json({
      type: "response",
      text
    });
  } catch (error) {
    console.error("GEMINI ERROR:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: "Failed to generate response."
      });
    }
  }
});

app.get("*splat", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log("");
  console.log("🐝 Muxbee is running!");
  console.log(`🌐 http://localhost:${PORT}`);
  console.log(`🤖 Model: ${GEMINI_MODEL}`);
  console.log(`🔑 API key: ${GEMINI_API_KEY ? "configured" : "missing"}`);
  console.log("");
});
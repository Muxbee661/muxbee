import crypto from "node:crypto";
import fs from "node:fs";
import express from "express";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();

const PORT = process.env.PORT || 3000;
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const statsFile = path.join(
  __dirname,
  "data",
  "admin.json"
);

const usersFile = path.join(
  __dirname,
  "data",
  "users.json"
);

const conversationsFile = path.join(
  __dirname,
  "data",
  "conversations.json"
);

app.use(
  express.json({
    limit: "1mb"
  })
);

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);


// ============================================================
// FILE HELPERS
// ============================================================

function getStats() {
  try {
    const stats = JSON.parse(
      fs.readFileSync(
        statsFile,
        "utf8"
      )
    );

    return {
      users: Number(stats.users) || 0,
      chats: Number(stats.chats) || 0,
      messages: Number(stats.messages) || 0
    };

  } catch (error) {
    return {
      users: 0,
      chats: 0,
      messages: 0
    };
  }
}


function saveStats(stats) {
  fs.writeFileSync(
    statsFile,
    JSON.stringify(
      stats,
      null,
      2
    )
  );
}


function getUsers() {
  try {
    const users = JSON.parse(
      fs.readFileSync(
        usersFile,
        "utf8"
      )
    );

    return Array.isArray(users)
      ? users
      : [];

  } catch (error) {
    return [];
  }
}


function saveUsers(users) {
  fs.writeFileSync(
    usersFile,
    JSON.stringify(
      users,
      null,
      2
    )
  );
}


function getConversations() {
  try {
    const conversations =
      JSON.parse(
        fs.readFileSync(
          conversationsFile,
          "utf8"
        )
      );

    return Array.isArray(
      conversations
    )
      ? conversations
      : [];

  } catch (error) {
    return [];
  }
}


function saveConversations(
  conversations
) {
  fs.writeFileSync(
    conversationsFile,
    JSON.stringify(
      conversations,
      null,
      2
    )
  );
}


// ============================================================
// USER TRACKING
// ============================================================

function trackUser(userId) {
  if (
    !userId ||
    typeof userId !== "string"
  ) {
    return;
  }

  if (
    userId.length < 20 ||
    userId.length > 100
  ) {
    return;
  }

  const users = getUsers();

  const existingUser =
    users.find(
      (user) =>
        typeof user === "string"
          ? user === userId
          : user?.id === userId
    );

  if (existingUser) {

    if (
      typeof existingUser ===
      "object"
    ) {
      existingUser.lastSeen =
        Date.now();
    }

    saveUsers(users);

    const stats = getStats();

    stats.users = users.length;

    saveStats(stats);

    return;
  }

  users.push({
    id: userId,
    firstSeen: Date.now(),
    lastSeen: Date.now()
  });

  saveUsers(users);

  const stats = getStats();

  stats.users = users.length;

  saveStats(stats);
}


// ============================================================
// CONVERSATION STORAGE
// ============================================================

function saveConversation({
  chatId,
  userId,
  mode,
  messages
}) {
  if (
    !chatId ||
    !userId ||
    !Array.isArray(messages)
  ) {
    return;
  }

  const conversations =
    getConversations();

  const existingIndex =
    conversations.findIndex(
      (conversation) =>
        conversation.id === chatId
    );

  const now = Date.now();

  const existing =
    existingIndex >= 0
      ? conversations[
          existingIndex
        ]
      : null;

  const conversation = {
    id: chatId,

    userId,

    mode:
      mode || "general",

    messages,

    createdAt:
      existing?.createdAt || now,

    updatedAt: now
  };

  if (existingIndex >= 0) {

    conversations[
      existingIndex
    ] = conversation;

  } else {

    conversations.push(
      conversation
    );

  }

  conversations.sort(
    (a, b) =>
      b.updatedAt -
      a.updatedAt
  );

  saveConversations(
    conversations
  );
}


// ============================================================
// ADMIN AUTH
// ============================================================

const adminTokens = new Set();


function createAdminToken() {
  const token =
    crypto.randomUUID();

  adminTokens.add(token);

  return token;
}


function requireAdmin(
  req,
  res,
  next
) {
  const token =
    req.headers.authorization
      ?.replace(
        "Bearer ",
        ""
      );

  if (
    !token ||
    !adminTokens.has(token)
  ) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  next();
}


// ============================================================
// ADMIN LOGIN
// ============================================================

app.post(
  "/api/admin/login",
  (req, res) => {

    const {
      username,
      password
    } = req.body;

    if (
      username !==
        ADMIN_USERNAME ||
      password !==
        ADMIN_PASSWORD
    ) {
      return res
        .status(401)
        .json({
          error:
            "Invalid username or password."
        });
    }

    const token =
      createAdminToken();

    res.json({
      success: true,
      token
    });
  }
);


// ============================================================
// RATE LIMIT
// ============================================================

const chatLimiter =
  rateLimit({
    windowMs:
      60 * 1000,

    limit: 30,

    standardHeaders:
      "draft-8",

    legacyHeaders:
      false,

    message: {
      error:
        "Too many requests. Please wait a moment and try again."
    }
  });


// ============================================================
// ADMIN STATS
// ============================================================

app.get(
  "/api/admin/stats",
  requireAdmin,
  (req, res) => {

    const stats =
      getStats();

    res.json({
      success: true,

      message:
        "Welcome to the Muxbee admin dashboard",

      stats
    });
  }
);


// ============================================================
// ADMIN USERS
// ============================================================

app.get(
  "/api/admin/users",
  requireAdmin,
  (req, res) => {

    const users =
      getUsers();

    const conversations =
      getConversations();

    const formattedUsers =
      users.map(
        (user) => {

          const userId =
            typeof user ===
            "string"
              ? user
              : user.id;

          const userChats =
            conversations.filter(
              (conversation) =>
                conversation.userId ===
                userId
            );

          const messageCount =
            userChats.reduce(
              (
                total,
                conversation
              ) =>
                total +
                (
                  Array.isArray(
                    conversation.messages
                  )
                    ? conversation
                        .messages
                        .length
                    : 0
                ),
              0
            );

          return {
            id: userId,

            firstSeen:
              typeof user ===
              "object"
                ? user.firstSeen
                : null,

            lastSeen:
              typeof user ===
              "object"
                ? user.lastSeen
                : null,

            conversations:
              userChats.length,

            messages:
              messageCount
          };
        }
      );

    formattedUsers.sort(
      (a, b) =>
        (b.lastSeen || 0) -
        (a.lastSeen || 0)
    );

    res.json({
      success: true,
      users:
        formattedUsers
    });
  }
);


// ============================================================
// ADMIN CONVERSATIONS
// ============================================================

app.get(
  "/api/admin/conversations",
  requireAdmin,
  (req, res) => {

    const conversations =
      getConversations();

    res.json({
      success: true,
      conversations
    });
  }
);


// ============================================================
// HEALTH
// ============================================================

app.get(
  "/api/health",
  (req, res) => {

    res.json({
      ok: true,

      hasKey:
        Boolean(
          GEMINI_API_KEY
        ),

      model:
        GEMINI_MODEL
    });
  }
);


// ============================================================
// MODES
// ============================================================

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


// ============================================================
// SYSTEM INSTRUCTION
// ============================================================

const SYSTEM_INSTRUCTION = `
You are Muxbee, an AI assistant made for Nigerians.

LANGUAGE RULES:

- Your default language is natural, standard English.
- Use clear, conversational English unless the user asks for another language.
- If the user speaks in Nigerian Pidgin, respond naturally in Nigerian Pidgin.
- If the user speaks in Hausa, respond naturally in Hausa.
- If the user explicitly asks you to use a particular language, follow that request.
- If the user mixes English with Pidgin or Hausa, you may naturally match their language mix.
- Do not randomly switch to Pidgin, Hausa, or another language when the user is speaking normal English.
- Do not use exaggerated Nigerian slang unless the user uses that style first.
- Match the user's level of formality and tone naturally.

You are made for Nigerian users, so understand Nigerian expressions, context, schools, businesses, phones, internet services and everyday situations.

Be helpful, natural, respectful and practical.

Do not pretend to know something you do not know.

If information may be uncertain or current, say so.

Never ask the user for passwords, PINs, OTPs, API keys or other secret credentials.

The user selected a helper mode. Follow its instructions while still answering naturally.

${MODE_INSTRUCTIONS.general}
`;


// ============================================================
// MESSAGE CLEANING
// ============================================================

function cleanMessages(messages) {

  return messages

    .filter(
      (message) =>
        message &&
        (
          message.role ===
            "user" ||
          message.role ===
            "model"
        ) &&
        typeof message.content ===
          "string"
    )

    .slice(-30)

    .map(
      (message) => ({
        role:
          message.role,

        parts: [
          {
            text:
              message.content.slice(
                0,
                12000
              )
          }
        ]
      })
    );
}


// ============================================================
// CHAT
// ============================================================

app.post(
  "/api/chat",
  chatLimiter,
  async (req, res) => {

    try {

      if (!GEMINI_API_KEY) {

        return res
          .status(500)
          .json({
            error:
              "Gemini API key is not configured."
          });

      }


      const {
        messages,
        mode = "general",
        userId,
        chatId
      } = req.body;


      if (
        !Array.isArray(
          messages
        ) ||
        messages.length === 0
      ) {

        return res
          .status(400)
          .json({
            error:
              "Messages are required."
          });

      }


      const safeMessages =
        cleanMessages(
          messages
        );


      if (
        safeMessages.length === 0
      ) {

        return res
          .status(400)
          .json({
            error:
              "No valid messages were provided."
          });

      }


      const modeInstruction =
        MODE_INSTRUCTIONS[
          mode
        ] ||
        MODE_INSTRUCTIONS.general;


      const response =
        await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,

          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "x-goog-api-key":
                GEMINI_API_KEY
            },

            body:
              JSON.stringify({

                system_instruction: {
                  parts: [
                    {
                      text:
                        `${SYSTEM_INSTRUCTION}\n\nCURRENT HELPER MODE:\n${modeInstruction}`
                    }
                  ]
                },

                contents:
                  safeMessages,

                generationConfig: {

                  thinkingConfig: {
                    thinkingLevel:
                      "low"
                  }

                }

              })
          }
        );


      const data =
        await response.json();


      if (!response.ok) {

        console.error(
          "GEMINI API ERROR:",
          data
        );

        return res
          .status(
            response.status
          )
          .json({
            error:
              data?.error?.message ||
              "Gemini could not generate a response."
          });

      }


      const text =
        data?.candidates?.[0]
          ?.content?.parts
          ?.map(
            (part) =>
              part.text || ""
          )
          .join("")
          .trim();


      if (!text) {

        console.error(
          "EMPTY GEMINI RESPONSE:",
          data
        );

        return res
          .status(502)
          .json({
            error:
              "Gemini returned an empty response."
          });

      }


      // ======================================================
      // SAVE USER
      // ======================================================

      trackUser(userId);


      // ======================================================
      // SAVE CONVERSATION
      // ======================================================

      const conversationMessages =
        messages
          .filter(
            (message) =>
              message &&
              (
                message.role ===
                  "user" ||
                message.role ===
                  "model"
              ) &&
              typeof message.content ===
                "string"
          )
          .map(
            (message) => ({
              role:
                message.role,

              content:
                message.content
            })
          );


      conversationMessages.push({
        role: "model",
        content: text
      });


      saveConversation({
        chatId,
        userId,
        mode,
        messages:
          conversationMessages
      });


      // ======================================================
      // UPDATE STATS
      // ======================================================

      const stats =
        getStats();

      stats.chats += 1;

      stats.messages += 1;

      saveStats(stats);


      res.json({
        type:
          "response",

        text
      });

    } catch (error) {

      console.error(
        "GEMINI ERROR:",
        error
      );

      if (
        !res.headersSent
      ) {

        res
          .status(500)
          .json({
            error:
              "Failed to generate response."
          });

      }

    }

  }
);


// ============================================================
// FRONTEND
// ============================================================

app.get(
  "*splat",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );

  }
);


// ============================================================
// START
// ============================================================

app.listen(
  PORT,
  () => {

    console.log("");

    console.log(
      "🐝 Muxbee is running!"
    );

    console.log(
      `🌐 http://localhost:${PORT}`
    );

    console.log(
      `🤖 Model: ${GEMINI_MODEL}`
    );

    console.log(
      `🔑 API key: ${
        GEMINI_API_KEY
          ? "configured"
          : "missing"
      }`
    );

    console.log("");

  }
);
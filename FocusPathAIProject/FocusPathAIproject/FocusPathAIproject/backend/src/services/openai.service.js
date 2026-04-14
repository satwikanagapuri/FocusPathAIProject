const { OpenAI } = require("openai");

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;

let primaryClient = null;
let primaryModel = null;

if (OPENAI_KEY) {
  primaryClient = new OpenAI({ apiKey: OPENAI_KEY });
  primaryModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
  console.log("[AI] Using OpenAI:", primaryModel);
} else if (GROQ_KEY) {
  primaryClient = new OpenAI({
    apiKey: GROQ_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });
  primaryModel = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  console.log("[AI] Using Groq (LLaMA 3.3 70B):", primaryModel);
} else {
  console.warn("[AI] No API key found (OPENAI_API_KEY or GROQ_API_KEY). AI features will use smart fallbacks.");
}

async function chat({ systemPrompt, userPrompt, temperature = 0.7 }) {
  if (!primaryClient) return null;

  try {
    const resp = await primaryClient.chat.completions.create({
      model: primaryModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
    });
    return resp.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("[AI] chat() error:", err?.message || err);
    return null;
  }
}

async function chatWithHistory({ systemPrompt, messages, temperature = 0.7 }) {
  if (!primaryClient) return null;

  try {
    const resp = await primaryClient.chat.completions.create({
      model: primaryModel,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      temperature,
    });
    return resp.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("[AI] chatWithHistory() error:", err?.message || err);
    return null;
  }
}

function isLLMAvailable() {
  return !!primaryClient;
}

function getProviderName() {
  if (OPENAI_KEY) return "OpenAI";
  if (GROQ_KEY) return "Groq (LLaMA 3)";
  return "none";
}

module.exports = { chat, chatWithHistory, isLLMAvailable, getProviderName };

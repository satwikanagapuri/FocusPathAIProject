const { z } = require("zod");

// Load environment from backend/.env if present, otherwise fall back to process.env.
require("dotenv").config();

const envSchema = z.object({
  NODE_ENV: z.string().optional().default("development"),
  BACKEND_PORT: z.coerce.number().int().positive().default(4000),
  JWT_SECRET: z.string().min(10),
  FRONTEND_ORIGIN: z.string().url().optional().default("http://localhost:5173"),
  OPENAI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  LOG_LEVEL: z.string().optional().default("info"),
  DEMO_MODE: z.string().optional().default("true"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Missing/invalid environment variables");
}

module.exports = parsed.data;


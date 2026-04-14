import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const schemaPath = process.env.PRISMA_SCHEMA_PATH || "prisma/schema.postgres.prisma";

export default defineConfig({
  schema: schemaPath,
  datasource: {
    url: env("DATABASE_URL"),
  },
});


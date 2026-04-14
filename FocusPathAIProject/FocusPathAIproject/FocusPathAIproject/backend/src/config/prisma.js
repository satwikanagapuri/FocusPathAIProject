const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const databaseUrl = process.env.DATABASE_URL || "";

function buildAdapter() {
  if (databaseUrl.startsWith("postgres") || databaseUrl.startsWith("postgresql")) {
    return new PrismaPg({ connectionString: databaseUrl });
  }

  // SQLite dev support (requires Prisma SQLite adapter + better-sqlite3).
  if (databaseUrl.startsWith("file:")) {
    try {
      // eslint-disable-next-line global-require
      const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
      return new PrismaBetterSqlite3({ url: databaseUrl.replace(/^file:/, "") });
    } catch (err) {
      throw new Error(
        "SQLite is not available. Install `@prisma/adapter-better-sqlite3` + `better-sqlite3` (requires native build tools).",
      );
    }
  }

  throw new Error("Unsupported DATABASE_URL format for Prisma adapter.");
}

// Avoid creating multiple Prisma clients in dev (hot reload).
const globalForPrisma = global;
const prisma =
  globalForPrisma.__prisma ||
  new PrismaClient({
    adapter: buildAdapter(),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = prisma;

module.exports = { prisma };


import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "/app/data/out/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL || "file:/app/data/app.db"
  },
  verbose: true,
  strict: true,
  // SQLite固有の設定
  migrations: {
    prefix: "timestamp",
    table: "drizzle_migrations",
    schema: "public",
  },
});
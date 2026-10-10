import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

if (!process.env.DATABASE_URL) { console.error("DATABASE_URL missing in .env"); process.exit(1); }
const sql = neon(process.env.DATABASE_URL);
const stmts = readFileSync(new URL("./schema.sql", import.meta.url), "utf8")
  .split(";").map((s) => s.replace(/--.*$/gm, "").trim()).filter(Boolean);
for (const s of stmts) await sql.query(s);
console.log(`Schema applied (${stmts.length} statements).`);

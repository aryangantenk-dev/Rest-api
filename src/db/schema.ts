import { integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const apiStats = pgTable("api_stats", {
  path: varchar("path", { length: 120 }).primaryKey(),
  hits: integer("hits").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const shortLinks = pgTable("short_links", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 16 }).notNull().unique(),
  url: text("url").notNull(),
  hits: integer("hits").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bannedIps = pgTable("banned_ips", {
  ip: varchar("ip", { length: 64 }).primaryKey(),
  reason: text("reason").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

import {
  sqliteTable,
  integer,
  text,
} from "drizzle-orm/sqlite-core";

// 搜索记录表
export const searches = sqliteTable("searches", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  topic: text("topic").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// 文献表
export const articles = sqliteTable("articles", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  searchId: integer("search_id").notNull(),
  pmid: text("pmid").notNull(),
  title: text("title").notNull(),
  authors: text("authors").notNull(), // JSON array
  journal: text("journal").notNull(),
  year: text("year").notNull(),
  abstract: text("abstract"),
  doi: text("doi"),
  url: text("url"),
  selected: integer("selected", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// 综述表
export const reviews = sqliteTable("reviews", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  searchId: integer("search_id").notNull(),
  title: text("title").notNull(),
  abstract: text("abstract").notNull(),
  content: text("content").notNull(),
  sections: text("sections").notNull(), // JSON array
  references: text("references").notNull(), // JSON array
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

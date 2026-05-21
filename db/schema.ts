import {
  mysqlTable,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  boolean,
} from "drizzle-orm/mysql-core";

// 搜索记录表
export const searches = mysqlTable("searches", {
  id: serial("id").primaryKey(),
  topic: varchar("topic", { length: 500 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 文献表
export const articles = mysqlTable("articles", {
  id: serial("id").primaryKey(),
  searchId: bigint("search_id", { mode: "number", unsigned: true }).notNull(),
  pmid: varchar("pmid", { length: 50 }).notNull(),
  title: varchar("title", { length: 1000 }).notNull(),
  authors: text("authors").notNull(), // JSON array
  journal: varchar("journal", { length: 500 }).notNull(),
  year: varchar("year", { length: 10 }).notNull(),
  abstract: text("abstract"),
  doi: varchar("doi", { length: 255 }),
  url: varchar("url", { length: 500 }),
  selected: boolean("selected").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 综述表
export const reviews = mysqlTable("reviews", {
  id: serial("id").primaryKey(),
  searchId: bigint("search_id", { mode: "number", unsigned: true }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  abstract: text("abstract").notNull(),
  content: text("content").notNull(), // 完整Markdown
  sections: text("sections").notNull(), // JSON数组
  references: text("references").notNull(), // JSON数组
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

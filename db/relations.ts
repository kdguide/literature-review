import { relations } from "drizzle-orm";
import { searches, articles, reviews } from "./schema";

export const searchesRelations = relations(searches, ({ many }) => ({
  articles: many(articles),
  reviews: many(reviews),
}));

export const articlesRelations = relations(articles, ({ one }) => ({
  search: one(searches, {
    fields: [articles.searchId],
    references: [searches.id],
  }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  search: one(searches, {
    fields: [reviews.searchId],
    references: [searches.id],
  }),
}));

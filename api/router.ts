import { createRouter, publicQuery } from "./middleware";
import { pubmedRouter } from "./routers/pubmed";
import { reviewRouter } from "./routers/review";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  pubmed: pubmedRouter,
  review: reviewRouter,
});

export type AppRouter = typeof appRouter;

import "dotenv/config";

export const env = {
  appId: process.env["APP_ID"] ?? "",
  appSecret: process.env["APP_SECRET"] ?? "",
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: process.env["DATABASE_URL"] ?? "db.sqlite",
  deepseekApiKey: process.env["DEEPSEEK_API_KEY"] ?? "",
};

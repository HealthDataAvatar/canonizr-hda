/**
 * Dev mode fixtures and flag.
 *
 * Set DEV_MODE=true in .env to bypass real auth and external services.
 * All service modules (apim, stripe, app-insights) check this flag
 * and return fixture data instead of making real calls.
 */

export const DEV_MODE = process.env.DEV_MODE === "true";

export const DEV_USER = {
  id: "dev-user-001",
  email: process.env.DEV_USER_EMAIL ?? "dev@canonizr.local",
  name: "Dev User",
  image: null,
  emailVerified: null,
};

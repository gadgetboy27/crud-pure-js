import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test_db",
      NEXTAUTH_SECRET: "test-secret-key-for-nextauth",
      NEXTAUTH_URL: "http://localhost:3000",
      STRIPE_SECRET_KEY: "sk_test_placeholder",
      STRIPE_WEBHOOK_SECRET: "whsec_test_placeholder",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_placeholder",
      TRACKINGMORE_API_KEY: "test_tracking_key",
      CRON_SECRET: "test-cron-secret",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

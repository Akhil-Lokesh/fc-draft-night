import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The browser only ever talks to this one origin: socket.io traffic is proxied through to the game
// server on :8080. One origin means one https link (e.g. a Cloudflare tunnel) is all friends in
// other houses need — and https is what lets browsers use the mic for voice chat.
const GAME_SERVER = process.env.GAME_SERVER ?? "http://localhost:8080";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: { "/socket.io": { target: GAME_SERVER, ws: true, changeOrigin: true } },
    // Accept requests arriving through a public tunnel, not just localhost / LAN IPs.
    allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".ngrok.app"],
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
} as any);

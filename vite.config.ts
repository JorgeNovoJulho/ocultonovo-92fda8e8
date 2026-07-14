import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";
import { visualizer } from "rollup-plugin-visualizer";

/**
 * Plugin: gera APP_VERSION (timestamp + commit curto se disponível) e:
 *  - injeta como `__APP_VERSION__` no bundle (via define)
 *  - escreve `dist/version.json` no fim do build
 * Em dev, escreve em `public/version.json` para que /version.json responda.
 */
function appVersionPlugin(version: string): Plugin {
  return {
    name: "oculto-app-version",
    apply: () => true,
    configResolved(config) {
      // garante que /version.json exista em dev
      if (config.command === "serve") {
        try {
          const file = path.resolve(__dirname, "public/version.json");
          fs.writeFileSync(
            file,
            JSON.stringify({ version, mode: "dev", builtAt: new Date().toISOString() }, null, 2),
          );
        } catch {
          /* noop */
        }
      }
    },
    closeBundle() {
      try {
        const outDir = path.resolve(__dirname, "dist");
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(
          path.join(outDir, "version.json"),
          JSON.stringify(
            { version, mode: "production", builtAt: new Date().toISOString() },
            null,
            2,
          ),
        );
      } catch {
        /* noop */
      }
    },
  };
}

function resolveAppVersion(): string {
  // Prioridade: env explícita > git short hash > timestamp do build
  const envVer =
    process.env.APP_VERSION ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.COMMIT_SHA;
  if (envVer) return String(envVer).slice(0, 12);
  try {
    // tenta ler HEAD do git sem depender de child_process
    const head = fs.readFileSync(path.resolve(__dirname, ".git/HEAD"), "utf8").trim();
    const m = head.match(/ref: (.+)/);
    if (m) {
      const ref = fs
        .readFileSync(path.resolve(__dirname, ".git", m[1]), "utf8")
        .trim();
      if (ref) return ref.slice(0, 12);
    } else if (head) {
      return head.slice(0, 12);
    }
  } catch {
    /* noop */
  }
  return `b${Date.now()}`;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load .env files so we can read VITE_ vars at config time
  const env = loadEnv(mode, process.cwd(), '');

  const APP_VERSION = resolveAppVersion();

  // Define globals injetados no bundle
  const define: Record<string, string> = {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  };

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
      // Warmup: pre-transforma rotas mais usadas no startup do dev server,
      // evitando que o primeiro acesso pague a latência fria + reduzindo
      // chance de full-reload em cascata durante HMR.
      warmup: {
        clientFiles: [
          "./src/main.tsx",
          "./src/App.tsx",
          "./src/layouts/DashboardLayout.tsx",
          "./src/layouts/AdminLayout.tsx",
          "./src/pages/Index.tsx",
          "./src/pages/MyProfilePage.tsx",
          "./src/pages/CreatorProfilePage.tsx",
          "./src/pages/MessagesPage.tsx",
          "./src/pages/NotificationsPage.tsx",
          "./src/pages/SettingsPage.tsx",
          "./src/pages/admin/AdminDashboard.tsx",
          "./src/components/ErrorBoundary.tsx",
          "./src/lib/supabaseExternal.ts",
        ],
      },
      // Watcher: ignora diretórios que não afetam o bundle do app, evitando
      // que mudanças em SQL/memorias/docs/build artifacts disparem reloads.
      watch: {
        ignored: [
          "**/.git/**",
          "**/dist/**",
          "**/node_modules/**",
          "**/supabase/external_sql/**",
          "**/supabase/migrations/**",
          "**/mem/**",
          "**/docs/**",
          "**/.workspace/**",
          "**/.agents/**",
          "**/.claude/**",
          "**/.lovable/**",
          "**/coverage/**",
          "**/*.sql",
          "**/*.md",
        ],
      },
      proxy: {
        '/sb-proxy': {
          target: 'https://rvybbrkzmboqbhcemqar.supabase.co',
          changeOrigin: true,
          secure: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/sb-proxy/, ''),
        },
      },
    },
    define,
    // Pré-bundling explícito apenas das libs realmente compartilhadas pelo
    // boot inicial (React, router, query, supabase, sonner, zustand).
    // framer-motion e lucide-react foram REMOVIDOS daqui: ao estarem listados,
    // o Vite os pré-bundle e força sua presença no payload do primeiro paint,
    // mesmo quando só são usados em rotas/componentes lazy. Sem o include,
    // continuam sendo bundlados sob demanda junto com seus consumidores.
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-router-dom",
        "@tanstack/react-query",
        "@supabase/supabase-js",
        "sonner",
        "zustand",
      ],
    },
    plugins: [
      react(),
      appVersionPlugin(APP_VERSION),
      mode === "development" && componentTagger(),
      mode === "analyze" && visualizer({
        filename: "dist/bundle-stats.html",
        gzipSize: true,
        brotliSize: true,
        template: "treemap",
      }),
      mode === "analyze" && visualizer({
        filename: "dist/bundle-stats.json",
        template: "raw-data",
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        // Redirect ALL supabase client imports to the external client
        "@/integrations/supabase/client": path.resolve(__dirname, "./src/lib/supabaseExternal.ts"),
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      // IMPORTANT: Do NOT use manualChunks here. Custom chunking repeatedly
      // caused "Cannot read properties of undefined (reading 'createContext' /
      // 'forwardRef')" in production because libraries that depend on React
      // (radix, leaflet, framer-motion, etc.) ended up in chunks that were
      // evaluated before the React chunk was ready. Vite/Rollup's default
      // splitting honors the dependency graph and avoids this class of bug.
      rollupOptions: {
        output: {},
      },
      // modulePreload DESLIGADO: com 100+ rotas lazy e grafo gigante de admin,
      // o Vite emitia <link rel="modulepreload"> para centenas de chunks no
      // primeiro paint (225 chunks / 2174 KB observados). Chunks são baixados
      // sob demanda — o prefetch das rotas quentes continua em
      // src/lib/routePrefetch.ts (em idle, conservador).
      modulePreload: false,
      chunkSizeWarningLimit: 1500,
    },
  };
});

import { defineConfig } from "vite";
import { resolve } from "path";
import fs from "fs";

const manifest = JSON.parse(
  fs.readFileSync(resolve(__dirname, "src/manifest.json"), "utf-8")
);

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/index.ts"),
        content: resolve(__dirname, "src/content/index.ts"),
        popup: resolve(__dirname, "src/popup.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
  plugins: [
    {
      name: "manifest",
      buildStart() {
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: JSON.stringify(manifest, null, 2),
        });
      },
    },
    {
      name: "copy-assets",
      buildStart() {
        // Copy popup.html
        const popupHtml = fs.readFileSync(resolve(__dirname, "src/popup.html"), "utf-8");
        this.emitFile({
          type: "asset",
          fileName: "popup.html",
          source: popupHtml,
        });

        // Copy extension icons
        const iconsDir = resolve(__dirname, "src/icons");
        const iconFiles = fs.readdirSync(iconsDir);
        for (const file of iconFiles) {
          const source = fs.readFileSync(resolve(iconsDir, file));
          this.emitFile({
            type: "asset",
            fileName: `icons/${file}`,
            source,
          });
        }
      },
    },
  ],
});

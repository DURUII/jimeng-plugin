import { strToU8, zipSync, type Zippable } from "fflate";
import type { LikeItem } from "./types";

const guessExt = (url: string, contentType: string | null): string => {
  if (contentType) {
    if (contentType.includes("image/png")) return "png";
    if (contentType.includes("image/webp")) return "webp";
    if (contentType.includes("image/jpeg")) return "jpg";
  }
  const match = url.split("?")[0].match(/\.([a-zA-Z0-9]+)$/);
  if (match) return match[1].toLowerCase();
  return "png";
};

export type DownloadedImage = {
  filename: string;
  blob: Blob;
};

const sanitizeFilename = (name: string): string => {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/[\s。]/g, "_")
    .substring(0, 100);
};

const createImageFilename = (
  index: number,
  url: string,
  contentType: string | null,
  title?: string,
  seed?: number
): string => {
  const ext = guessExt(url, contentType);
  const padded = String(index + 1).padStart(4, "0");

  if (title && seed) {
    const safeTitle = sanitizeFilename(title);
    return `${padded}_${safeTitle}_${seed}.${ext}`;
  } else if (seed) {
    return `${padded}_${seed}.${ext}`;
  }
  return `${padded}.${ext}`;
};

export const buildZip = async (
  items: LikeItem[],
  images: DownloadedImage[],
): Promise<Blob> => {
  const zipFiles: Zippable = {};

  for (const image of images) {
    const bytes = new Uint8Array(await image.blob.arrayBuffer());
    zipFiles[`images/${image.filename}`] = bytes;
  }

  const metadata = {
    exported_at: new Date().toISOString(),
    total: items.length,
    items,
  };
  zipFiles["metadata.json"] = strToU8(JSON.stringify(metadata, null, 2));

  const readme = buildReadme(items);
  zipFiles["README.md"] = strToU8(readme);

  const zipped = zipSync(zipFiles, { level: 6 });
  return new Blob([zipped], { type: "application/zip" });
};

export const buildMarkdown = (items: LikeItem[]): string => {
  let md = `# Jimeng Liked AIGC Images\n\n`;
  md += `Exported: ${new Date().toISOString()}\n`;
  md += `Total items: ${items.length}\n\n`;
  md += `---\n\n`;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    md += `## ${i + 1}. ${item.title || "Untitled"}\n\n`;
    md += `**ID:** ${item.id || "N/A"}\n`;
    md += `**Author:** ${item.author}\n`;

    if (item.seed) {
      md += `**Seed:** ${item.seed}\n`;
    }

    if (item.model) {
      md += `**Model:** ${item.model}\n`;
    }

    if (item.createdAt) {
      md += `**Created:** ${item.createdAt}\n`;
    }

    md += `\n### Prompt\n${item.prompt || "(no prompt)"}\n\n`;

    if (item.negativePrompt) {
      md += `### Negative Prompt\n${item.negativePrompt}\n\n`;
    }

    md += `![${item.title || item.seed}](images/${createImageFilename(
      i,
      item.imageUrl,
      null,
      item.title,
      item.seed
    )})\n\n`;
    md += `---\n\n`;
  }

  return md;
};

const buildReadme = (items: LikeItem[]): string => {
  return `# Jimeng Liked AIGC Export

## Export Information
- **Date:** ${new Date().toISOString()}
- **Total Items:** ${items.length}

## Items
${items.map((item, i) => `${i + 1}. ${item.title || "Untitled"} by ${item.author}`).join("\n")}

## Generated with jimeng-plugin
`;
};

export { createImageFilename };

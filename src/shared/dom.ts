import { SELECTORS } from "./site";
import type { LikeItem } from "./types";

const normalizeText = (text: string): string =>
  text.replace(/\s+/g, " ").trim();

const pickText = (el: Element | null): string => {
  if (!el) return "";
  const text = el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "";
  return normalizeText(text);
};

const pickImageUrl = (img: HTMLImageElement | null): string => {
  if (!img) return "";
  const src = img.currentSrc || img.src || img.getAttribute("data-src") || "";
  if (src) return src;
  const srcset = img.getAttribute("srcset");
  if (!srcset) return "";
  return srcset.split(",")[0]?.trim().split(" ")[0] || "";
};

const nearestCard = (img: HTMLImageElement): Element => {
  const card = img.closest(SELECTORS.card);
  if (card) return card;
  return img.parentElement || img;
};

const dedupe = <T>(items: T[]): T[] => Array.from(new Set(items));

export const collectLikeItemsFromDom = (): LikeItem[] => {
  const images = Array.from(document.querySelectorAll(SELECTORS.image)) as HTMLImageElement[];
  const cards = dedupe(images.map(nearestCard));

  const items: LikeItem[] = [];
  for (const card of cards) {
    const img = card.querySelector(SELECTORS.image) as HTMLImageElement | null;
    const imageUrl = pickImageUrl(img);
    if (!imageUrl) continue;

    const promptEl = card.querySelector(SELECTORS.prompt) as Element | null;
    const authorEl = card.querySelector(SELECTORS.author) as Element | null;

    const prompt = pickText(promptEl);
    const author = pickText(authorEl);

    const link = card.querySelector("a[href]") as HTMLAnchorElement | null;

    items.push({
      imageUrl,
      prompt,
      author,
      sourceUrl: link?.href,
    });
  }

  return items;
};

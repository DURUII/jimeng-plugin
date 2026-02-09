export const SITE = {
  domain: "jimeng.jianying.com",
  likeUrlHints: ["/like", "/likes", "liked", "favorite", "collection"],
  likeTextHints: ["点赞", "喜欢", "收藏"],
};

export const SELECTORS = {
  // These are best-effort guesses. Update if the site DOM changes.
  card: "[data-like-card], [data-item], article, li, .card",
  image: "img",
  prompt: "[data-prompt], .prompt, .desc, .description, .title",
  author: "[data-author], .author, .user, a[href*='/user'], a[href*='/profile']",
};

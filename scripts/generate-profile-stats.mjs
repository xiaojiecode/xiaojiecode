import fs from "node:fs";

const username = process.env.PROFILE_USERNAME || "xiaojiecode";
const token = process.env.GITHUB_TOKEN;
const apiHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "profile-stats-generator",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

async function getJson(url) {
  const response = await fetch(url, { headers: apiHeaders });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${url}`);
  }
  return response.json();
}

const [user, repos] = await Promise.all([
  getJson(`https://api.github.com/users/${username}`),
  getJson(`https://api.github.com/users/${username}/repos?type=owner&sort=updated&per_page=100`),
]);

const ownedRepos = repos.filter((repo) => !repo.fork);
const languageResults = await Promise.all(
  ownedRepos.map((repo) => getJson(repo.languages_url)),
);

const languageBytes = new Map();
for (const result of languageResults) {
  for (const [language, bytes] of Object.entries(result)) {
    languageBytes.set(language, (languageBytes.get(language) || 0) + bytes);
  }
}

const totalLanguageBytes = [...languageBytes.values()].reduce((sum, value) => sum + value, 0);
const languages = [...languageBytes.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6)
  .map(([name, bytes]) => ({
    name,
    percent: totalLanguageBytes ? (bytes / totalLanguageBytes) * 100 : 0,
  }));

const stats = [
  ["Repositories", user.public_repos],
  ["Stars earned", ownedRepos.reduce((sum, repo) => sum + repo.stargazers_count, 0)],
  ["Forks", ownedRepos.reduce((sum, repo) => sum + repo.forks_count, 0)],
  ["Followers", user.followers],
];

const themes = {
  dark: {
    background: "#09070f",
    border: "#49375d",
    title: "#f0f6fc",
    text: "#d2a8ff",
    muted: "#8b949e",
    accent: "#79c0ff",
  },
  light: {
    background: "#fbfaff",
    border: "#c7b8e0",
    title: "#1f2328",
    text: "#24292f",
    muted: "#59636e",
    accent: "#6639ba",
  },
};

const languageColors = ["#58a6ff", "#56d364", "#f778ba", "#a371f7", "#ffa657", "#f2cc60"];
const escapeXml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
})[character]);

function cardShell(theme, body, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="210" viewBox="0 0 460 210" role="img" aria-label="${escapeXml(label)}">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .title { font-size: 18px; font-weight: 600; }
    .value { font-size: 24px; font-weight: 700; }
    .label { font-size: 12px; }
  </style>
  <rect x="0.5" y="0.5" width="459" height="209" rx="6" fill="${theme.background}" stroke="${theme.border}" />
  ${body}
</svg>\n`;
}

function renderStats(theme) {
  const items = stats.map(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 28 + column * 216;
    const y = 103 + row * 68;
    return `<text x="${x}" y="${y}" class="value" fill="${theme.accent}">${value}</text>
  <text x="${x}" y="${y + 21}" class="label" fill="${theme.muted}">${escapeXml(label)}</text>`;
  }).join("\n  ");

  return cardShell(theme, `<text x="28" y="38" class="title" fill="${theme.title}">GitHub overview</text>
  <text x="28" y="59" class="label" fill="${theme.muted}">@${escapeXml(username)} · public repositories</text>
  ${items}`, `${username} GitHub overview`);
}

function renderLanguages(theme) {
  let offset = 28;
  const barWidth = 404;
  const segments = languages.map((language, index) => {
    const width = index === languages.length - 1
      ? 432 - offset
      : Math.max(2, (language.percent / 100) * barWidth);
    const segment = `<rect x="${offset.toFixed(2)}" y="70" width="${width.toFixed(2)}" height="12" fill="${languageColors[index]}" />`;
    offset += width;
    return segment;
  }).join("\n  ");

  const legend = languages.map((language, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 28 + column * 216;
    const y = 112 + row * 32;
    return `<circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${languageColors[index]}" />
  <text x="${x + 17}" y="${y}" class="label" fill="${theme.text}">${escapeXml(language.name)}</text>
  <text x="${x + 188}" y="${y}" class="label" text-anchor="end" fill="${theme.muted}">${language.percent.toFixed(1)}%</text>`;
  }).join("\n  ");

  return cardShell(theme, `<text x="28" y="38" class="title" fill="${theme.title}">Most used languages</text>
  <text x="28" y="59" class="label" fill="${theme.muted}">Calculated from public repository bytes</text>
  <clipPath id="bar"><rect x="28" y="70" width="404" height="12" rx="6" /></clipPath>
  <g clip-path="url(#bar)">${segments}</g>
  ${legend}`, `${username} most used languages`);
}

fs.mkdirSync("assets", { recursive: true });
for (const [name, theme] of Object.entries(themes)) {
  fs.writeFileSync(`assets/github-stats-${name}.svg`, renderStats(theme));
  fs.writeFileSync(`assets/top-languages-${name}.svg`, renderLanguages(theme));
}

console.log(`Generated profile statistics for ${username}.`);

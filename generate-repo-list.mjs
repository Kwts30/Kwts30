import fs from 'node:fs/promises';

const README_PATH = new URL('../README.md', import.meta.url);
const START_MARK = '<!-- REPO_LIST:START -->';
const END_MARK = '<!-- REPO_LIST:END -->';

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const repoEnv = process.env.GITHUB_REPOSITORY; // e.g., owner/repo when running in Actions
const defaultOwner = repoEnv ? repoEnv.split('/')[0] : 'Kwts30';
const username = (process.env.TARGET_USERNAME || defaultOwner).trim();

const featuredRepo = (process.env.FEATURED_REPO || '').trim().toLowerCase() || null;
const listLimit = Number.parseInt(process.env.REPO_LIST_LIMIT || '', 10);
const limit = Number.isFinite(listLimit) && listLimit > 0 ? listLimit : null;

async function fetchAllRepos(user) {
  const perPage = 100;
  let page = 1;
  let repos = [];
  while (true) {
    const url = `https://api.github.com/users/${encodeURIComponent(user)}/repos?type=owner&per_page=${perPage}&page=${page}&sort=updated&direction=desc`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch repos: ${res.status} ${res.statusText} - ${text}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos = repos.concat(batch);
    if (batch.length < perPage) break;
    page += 1;
  }
  return repos;
}

function formatRepoLine(r) {
  const parts = [];
  parts.push(`- [${r.name}](${r.html_url})`);
  if (r.description) {
    parts.push(`— ${r.description.trim()}`);
  }
  const meta = [];
  if (r.stargazers_count > 0) meta.push(`⭐ ${r.stargazers_count}`);
  if (r.language) meta.push(r.language);
  if (r.updated_at) meta.push(`updated ${r.updated_at.slice(0, 10)}`);
  if (meta.length) parts.push(`(${meta.join(' • ')})`);
  return parts.join(' ');
}

async function updateReadme(listMarkdown) {
  const readme = await fs.readFile(README_PATH, 'utf8');
  if (!readme.includes(START_MARK) || !readme.includes(END_MARK)) {
    const section = `\n\n## Featured repository\n\n${START_MARK}\n${END_MARK}\n`;
    await fs.writeFile(README_PATH, readme + section, 'utf8');
    return updateReadme(listMarkdown);
  }
  const pattern = new RegExp(`${START_MARK}[\\s\\S]*?${END_MARK}`);
  const replacement = `${START_MARK}\n${listMarkdown}\n${END_MARK}`;
  const updated = readme.replace(pattern, replacement);
  if (updated !== readme) {
    await fs.writeFile(README_PATH, updated, 'utf8');
    return true;
  }
  return false;
}

async function main() {
  console.log(`Generating repository list for ${username}...`);
  let repos = await fetchAllRepos(username);

  // Sort by updated date desc
  repos.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  // Filter to specific repo if provided
  if (featuredRepo) {
    repos = repos.filter(r => r.name.toLowerCase() === featuredRepo);
  }

  // Apply limit if set
  if (limit) {
    repos = repos.slice(0, limit);
  }

  const lines = repos.map(formatRepoLine);
  const listMarkdown = lines.length ? lines.join('\n') : '_No repositories found._';

  const changed = await updateReadme(listMarkdown);
  console.log(changed ? 'README updated.' : 'No changes to README.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

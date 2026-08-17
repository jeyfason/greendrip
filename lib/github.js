const API = "https://api.github.com";

export function createGithub({ token, username, fetchImpl = fetch }) {
  const headers = {
    Authorization: `token ${token}`,
    "User-Agent": "gogreen",
    Accept: "application/vnd.github+json",
  };

  async function request(path, opts = {}) {
    const res = await fetchImpl(`${API}${path}`, { ...opts, headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GitHub API ${res.status} on ${path}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  return {
    async getUser() {
      const user = await request(`/users/${username}`);
      return {
        name: user.name || username,
        email: user.email || `${username}@users.noreply.github.com`,
        creationYear: new Date(user.created_at).getUTCFullYear(),
      };
    },

    async ensurePrivateRepo(repoName) {
      const exists = await fetchImpl(`${API}/repos/${username}/${repoName}`, { headers })
        .then((res) => res.status === 200)
        .catch(() => false);
      if (!exists) {
        await request(`/user/repos`, {
          method: "POST",
          body: JSON.stringify({ name: repoName, private: true }),
        });
      }
      return repoName;
    },

    remoteUrl(repoName) {
      return `https://x-access-token:${token}@github.com/${username}/${repoName}.git`;
    },
  };
}
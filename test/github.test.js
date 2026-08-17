import { test } from "node:test";
import assert from "node:assert/strict";
import { createGithub } from "../lib/github.js";

function mockFetch(routes) {
  return async (url, opts = {}) => {
    const key = `${opts.method ?? "GET"} ${url}`;
    const route = routes[key];
    if (!route) return { ok: false, status: 404, text: async () => "not found" };
    if (route.status !== 200) return { ok: false, status: route.status, text: async () => route.body ?? "" };
    return { ok: true, status: 200, json: async () => route.body };
  };
}

test("getUser extracts name, email and creation year", async () => {
  const fetchImpl = mockFetch({
    "GET https://api.github.com/users/fenrir2608": {
      status: 200,
      body: {
        login: "fenrir2608",
        name: "Fason King",
        email: "fason@example.com",
        created_at: "2016-04-05T14:00:00Z",
      },
    },
  });
  const github = createGithub({ token: "tok", username: "fenrir2608", fetchImpl });
  const user = await github.getUser();
  assert.equal(user.name, "Fason King");
  assert.equal(user.email, "fason@example.com");
  assert.equal(user.creationYear, 2016);
});

test("getUser falls back to username and noreply email", async () => {
  const fetchImpl = mockFetch({
    "GET https://api.github.com/users/ghost": {
      status: 200,
      body: { login: "ghost", name: null, email: null, created_at: "2020-01-01T00:00:00Z" },
    },
  });
  const github = createGithub({ token: "tok", username: "ghost", fetchImpl });
  const user = await github.getUser();
  assert.equal(user.name, "ghost");
  assert.equal(user.email, "ghost@users.noreply.github.com");
  assert.equal(user.creationYear, 2020);
});

test("ensurePrivateRepo creates the repo when it does not exist", async () => {
  const fetchImpl = mockFetch({
    "GET https://api.github.com/repos/fenrir2608/daily-log": { status: 404, body: "not found" },
    "POST https://api.github.com/user/repos": { status: 200, body: { name: "daily-log" } },
  });
  const github = createGithub({ token: "tok", username: "fenrir2608", fetchImpl });
  const name = await github.ensurePrivateRepo("daily-log");
  assert.equal(name, "daily-log");
});

test("ensurePrivateRepo skips creation when repo exists", async () => {
  let postCalled = false;
  const base = mockFetch({
    "GET https://api.github.com/repos/fenrir2608/daily-log": { status: 200, body: { name: "daily-log" } },
  });
  const fetchImpl = async (url, opts) => {
    if (opts?.method === "POST") postCalled = true;
    return base(url, opts);
  };
  const github = createGithub({ token: "tok", username: "fenrir2608", fetchImpl });
  await github.ensurePrivateRepo("daily-log");
  assert.equal(postCalled, false);
});

test("API errors throw with status and path", async () => {
  const fetchImpl = mockFetch({
    "GET https://api.github.com/users/ghost": { status: 401, body: "Bad credentials" },
  });
  const github = createGithub({ token: "bad", username: "ghost", fetchImpl });
  await assert.rejects(() => github.getUser(), /401.*users\/ghost/);
});

test("remoteUrl embeds the token", () => {
  const github = createGithub({ token: "tok123", username: "fenrir2608" });
  assert.equal(
    github.remoteUrl("daily-log"),
    "https://x-access-token:tok123@github.com/fenrir2608/daily-log.git"
  );
});
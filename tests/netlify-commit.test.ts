import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const guardPath = fileURLToPath(new URL("../scripts/verify-netlify-commit.mjs", import.meta.url));
const commit = "a".repeat(40);

function runGuard(body?: string, commitRef?: string, isHook = false) {
  const env = { ...process.env };
  delete env.INCOMING_HOOK_BODY;
  delete env.INCOMING_HOOK_URL;
  delete env.COMMIT_REF;
  if (body !== undefined) env.INCOMING_HOOK_BODY = body;
  if (commitRef !== undefined) env.COMMIT_REF = commitRef;
  if (isHook) env.INCOMING_HOOK_URL = "https://api.netlify.com/build_hooks/test";
  return spawnSync(process.execPath, [guardPath], { env, encoding: "utf8" });
}

describe("Netlify checked commit guard", () => {
  it("allows manual builds without a hook payload", () => {
    expect(runGuard().status).toBe(0);
  });

  it("accepts the checked commit in raw JSON", () => {
    expect(runGuard(JSON.stringify({ commit }), commit).status).toBe(0);
  });

  it("accepts the documented URL-encoded payload", () => {
    expect(runGuard(encodeURIComponent(JSON.stringify({ commit })), commit).status).toBe(0);
  });

  it("rejects a newer or different branch head", () => {
    expect(runGuard(JSON.stringify({ commit }), "b".repeat(40)).status).toBe(1);
  });

  it.each(["broken", "%zz", "null", "[]", "{}", '{"commit":"main"}'])("rejects a malformed payload: %s", (body) => {
    const result = runGuard(body, commit);
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain(body);
  });

  it("rejects a hook without a payload", () => {
    expect(runGuard(undefined, commit, true).status).toBe(1);
  });

  it("requires Netlify to identify the checked-out commit", () => {
    expect(runGuard(JSON.stringify({ commit })).status).toBe(1);
  });
});

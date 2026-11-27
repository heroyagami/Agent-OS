import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpath } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { TextDecoder } from "node:util";
import { RuntimeBlockedError } from "./contracts.mjs";

const exec = promisify(execFile);
const deny = message => { throw new RuntimeBlockedError(message); };
export const isPinnedRevision = value => typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
export const isSafeRepoPath = value => typeof value === "string" && value.length <= 512 &&
  value.split("/").every(part => /^[\p{L}\p{N}._ -]+$/u.test(part) && part !== "." && part !== ".." &&
    part.toLowerCase() !== ".git" && !part.endsWith(".") && !part.endsWith(" "));

// Read-only object database reader: never checkout, execute or import project code.
export async function openPinnedGitSource({ root, revision, repository, maxFileBytes = 65536 }) {
  if (typeof root !== "string" || !isAbsolute(root) || !isPinnedRevision(revision) ||
      typeof repository !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
      !Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > 2_000_000) deny("Invalid pinned Git source.");
  const cwd = await realpath(root);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  Object.assign(env, { GIT_TERMINAL_PROMPT:"0", GIT_NO_REPLACE_OBJECTS:"1", GIT_CONFIG_NOSYSTEM:"1" });
  const git = async (args, maxBuffer = 8192) => {
    try {
      const result = await exec("git", ["--no-replace-objects", "--literal-pathspecs", "-C", cwd, ...args], {
        env, encoding:"buffer", maxBuffer, timeout:15000, windowsHide:true
      });
      return result.stdout;
    } catch { deny("Pinned Git object read failed."); }
  };
  if (await realpath((await git(["rev-parse","--show-toplevel"])).toString("utf8").trim()) !== cwd ||
      (await git(["cat-file","-t",revision])).toString("utf8").trim() !== "commit") deny("Source must be an exact checkout and commit.");
  // A checkout's owner/repository mapping is independently verified by the operator;
  // the repository label alone is not authentication.
  return Object.freeze({ repository, revision, async read(path, requestedRevision = revision) {
    if (requestedRevision !== revision || !isSafeRepoPath(path)) deny("Invalid pinned read request.");
    const listing = (await git(["ls-tree","-z",revision,"--",path])).toString("utf8");
    const match = /^(100644|100755) blob ([0-9a-f]{40})\t([^\0]+)\0$/.exec(listing);
    if (!match || match[3] !== path) deny("Only exact regular tracked files may be loaded.");
    const size = Number((await git(["cat-file","-s",match[2]])).toString("utf8").trim());
    if (!Number.isSafeInteger(size) || size < 1 || size > maxFileBytes) deny("Pinned file exceeds byte limit.");
    const raw = await git(["cat-file","blob",match[2]],maxFileBytes+1024);
    if (raw.length !== size || raw.includes(0)) deny("Invalid text blob.");
    try { return new TextDecoder("utf-8",{fatal:true}).decode(raw); } catch { deny("File is not UTF-8 text."); }
  }});
}

/**
 * Which RPC may the phone submit deposits to (server.info.clientRpc)?
 *
 * Exact-host allowlist (no substring matching):
 *   - api.devnet.solana.com
 *   - devnet.helius-rpc.com and *.devnet.helius-rpc.com   (suffix on a dot boundary)
 *   - *.solana-devnet.quiknode.pro
 *   - localhost / 127.0.0.1 / ::1 and private LAN IPv4 (10/8, 172.16/12, 192.168/16)
 * over http or https. "mainnet" anywhere in the URL is refused.
 *
 * A non-local host must also report the devnet genesis hash (5s timeout) before it is
 * trusted. Local/LAN hosts are allowed in __DEV__ builds only and skip the genesis check on purpose: a solana-test-validator has its own fresh genesis
 * every reset, and a LAN host can only be reached on the dev's own network.
 * A 5s genesis timeout is reported (timedOut) so the sheet can say "Network is slow" with
 * Try again; other failures (not allowlisted, wrong genesis) fall back to the app's normal RPC.
 */
export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

const EXACT = new Set(["api.devnet.solana.com", "devnet.helius-rpc.com"]);
const SUFFIXES = [".devnet.helius-rpc.com", ".solana-devnet.quiknode.pro"];

function parse(raw: string | null | undefined): URL | string {
  if (!raw) return "empty";
  try {
    return new URL(String(raw).trim());
  } catch {
    return "not a URL";
  }
}

const hostOf = (u: URL) => u.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");

export function isLocalHost(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some((x) => x > 255)) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function isAllowedDevnetHost(host: string): boolean {
  return EXACT.has(host) || SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length);
}

export type RpcGuardOpts = {
  /** Local/LAN hosts (no genesis check) are only allowed in development builds (__DEV__). */
  allowLocal?: boolean;
};

/** Synchronous host/scheme check. null = allowed (remote hosts still need the genesis check). */
export function clientRpcProblem(raw: string | null | undefined, opts: RpcGuardOpts = {}): string | null {
  const u = parse(raw);
  if (typeof u === "string") return u;
  if (u.protocol !== "http:" && u.protocol !== "https:") return "must be http(s)";
  if (u.username || u.password) return "credentials in URL not allowed";
  if (/mainnet/i.test(u.href)) return "mainnet is not allowed";
  const host = hostOf(u);
  if (isLocalHost(host)) return opts.allowLocal ? null : "local/LAN RPC only in development builds";
  if (isAllowedDevnetHost(host)) return null;
  return "host not on the devnet/localnet allowlist";
}

/**
 * Full check: allowlist, then (non-local only) getGenesisHash === devnet. Returns the URL to
 * use, or null → fall back to the normal RPC. Never throws.
 */
export async function vetClientRpc(
  raw: string | null | undefined,
  getGenesisHash: (url: string) => Promise<string>,
  opts: RpcGuardOpts & { timeoutMs?: number } = {}
): Promise<{ url: string | null; reason: string | null; timedOut?: boolean }> {
  const problem = clientRpcProblem(raw, opts);
  if (problem) return { url: null, reason: problem };
  const url = String(raw).trim();
  const host = hostOf(new URL(url));
  if (isLocalHost(host)) return { url, reason: null }; // only reachable with allowLocal (dev)
  const timeoutMs = opts.timeoutMs ?? 5000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const g = await Promise.race([
      getGenesisHash(url),
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    return g === DEVNET_GENESIS ? { url, reason: null } : { url: null, reason: `genesis ${g} is not devnet` };
  } catch (e: any) {
    const timedOut = /timed out after/.test(String(e?.message));
    return { url: null, reason: `genesis check failed: ${e?.message ?? e}`, timedOut };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Tracks server.info's clientRpc, including a server.info that arrives after mount.
 * `source` is the match client (escrowInfo + on("server.info")).
 */
export function trackClientRpc(
  source: { escrowInfo: { clientRpc?: string | null }; on: (ev: string, cb: (m: any) => void) => () => void },
  onChange: (rpc: string | null) => void
): () => void {
  onChange(source.escrowInfo.clientRpc ?? null);
  return source.on("server.info", (m: any) => onChange(m?.escrow?.clientRpc ?? null));
}

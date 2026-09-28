/**
 * Which RPC may the phone submit deposits to (server.info.clientRpc)? Devnet hosts and
 * localhost/LAN (localnet on a device) only. Mainnet — or anything else — is refused.
 */
export function clientRpcProblem(raw: string | null | undefined): string | null {
  if (!raw) return "empty";
  let u: URL;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return "not a URL";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "must be http(s)";
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const all = (host + " " + u.search + " " + u.pathname).toLowerCase();
  if (/mainnet/.test(all)) return "mainnet is not allowed";
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) return null;
  if (/^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(host)) return null;
  if (/(^|[.-])devnet([.-]|$)/.test(host)) return null;
  return "only devnet or localhost/LAN RPCs";
}

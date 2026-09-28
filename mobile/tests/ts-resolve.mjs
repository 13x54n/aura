// Node test loader: resolve extensionless relative imports in src/*.ts ("./depositTx" → .ts).
import { register } from "node:module";
register(
  "data:text/javascript," +
    encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (/^\\.{1,2}\\//.test(spec) && !/\\.[cm]?[jt]sx?$/.test(spec)) {
    try { return await next(spec + ".ts", ctx); } catch {}
  }
  return next(spec, ctx);
}`),
  import.meta.url
);

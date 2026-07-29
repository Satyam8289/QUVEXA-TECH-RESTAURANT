/* Authentication — bcrypt password hashing + JWT sessions + role guards. */
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

export const hashPassword = (plain) => bcrypt.hash(plain, 10);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

export const signToken = (user) =>
  jwt.sign({ uid: user.id, tid: user.tenant_id, role: user.role, name: user.name }, SECRET, { expiresIn: "7d" });

/* Require a valid staff token; attaches req.user = { uid, tid, role, name }. */
export function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not signed in" });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: "Session expired — please sign in again" });
  }
}

/* Restrict a route to specific roles. */
export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: "You don't have access to this" });

/* Tiny in-memory rate limiter — no external dependency. Enough to stop
   password brute-forcing (the login routes were previously unlimited: a few
   thousand guesses/second against a 4-char-minimum password). Keyed by client
   IP + a label so login and platform-login count separately. Counters are
   swept lazily as they expire; a single node process is all we run. */
export function rateLimit({ windowMs, max, label }) {
  const hits = new Map(); // key -> { count, resetAt }
  return (req, res, next) => {
    const now = Date.now();
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
    const key = `${label}:${ip}`;
    let rec = hits.get(key);
    if (!rec || rec.resetAt <= now) { rec = { count: 0, resetAt: now + windowMs }; hits.set(key, rec); }
    rec.count += 1;
    if (rec.count > max) {
      const retry = Math.ceil((rec.resetAt - now) / 1000);
      res.set("Retry-After", String(retry));
      return res.status(429).json({ error: `Too many attempts. Try again in ${retry}s.` });
    }
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    next();
  };
}

/* ---- Platform (Super Admin) auth — entirely separate token scope from
   restaurant staff, so a tenant JWT can never be reused here or vice versa. ---- */
export const signPlatformToken = (admin) =>
  jwt.sign({ pid: admin.id, scope: "platform" }, SECRET, { expiresIn: "12h" });

export function platformAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not signed in" });
  try {
    const payload = jwt.verify(token, SECRET);
    if (payload.scope !== "platform") return res.status(403).json({ error: "Not a platform admin session" });
    req.admin = payload;
    next();
  } catch (e) {
    res.status(401).json({ error: "Session expired — please sign in again" });
  }
}

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

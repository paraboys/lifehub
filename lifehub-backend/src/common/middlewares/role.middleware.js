export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    const roles = (req.user?.roles || []).map(role => String(role).toUpperCase());
    const allowed = allowedRoles.map(role => String(role).toUpperCase());

    if (!roles.some(r => allowed.includes(r))) {
      return res.status(403).json({ error: "Access denied" });
    }

    next();
  };
};

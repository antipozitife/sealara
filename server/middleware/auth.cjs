function createAuthMiddleware({ tokenCookie, jwtVerifyAsync, jwtSecret, getUserById }) {
  return async function authMiddleware(req, res, next) {
    const token = req.cookies[tokenCookie];
    if (!token) return res.status(401).json({ error: "Не авторизован" });
    try {
      const payload = await jwtVerifyAsync(token, jwtSecret);
      if (payload?.typ !== "access") return res.status(401).json({ error: "Неверный тип токена" });
      const user = await getUserById(payload.sub);
      if (!user) return res.status(401).json({ error: "Пользователь не найден" });
      req.user = user;
      return next();
    } catch {
      return res.status(401).json({ error: "Сессия истекла" });
    }
  };
}

function doctorOnly(req, res, next) {
  const isDoctorFlag = Boolean(req.user?.profile?.isDoctor);
  if (!isDoctorFlag) {
    return res.status(403).json({ error: "Доступ только для врача" });
  }
  return next();
}

module.exports = {
  createAuthMiddleware,
  doctorOnly,
};

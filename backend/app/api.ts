import api from "core-kit/packages/server";

api.use((req, res, next) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, api-token",
    "Access-Control-Allow-Credentials": "true",
  });

  if (req.method === "OPTIONS") {
    res.status(204).send();
    return;
  }

  next();
});
export default api;

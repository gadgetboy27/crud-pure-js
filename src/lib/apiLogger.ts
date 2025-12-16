export function logApiCall(req: any, res: any, meta: any = {}) {
  console.info(
    JSON.stringify({
      type: "API_CALL",
      method: req.method,
      path: req.url,
      userId: req.user?.id ?? null,
      timestamp: new Date().toISOString(),
      meta,
    })
  );
}

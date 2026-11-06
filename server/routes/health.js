/** Registers process-level routes outside business domains. */
export const registerHealthRoutes = (app, { version }) => {
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'online', system: 'PRTS CORE API', version, time: new Date().toISOString() });
  });
};

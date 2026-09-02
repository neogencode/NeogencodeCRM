let app;
let initError = null;

try {
  app = require('../backend/server');
} catch (err) {
  initError = err;
  console.error("Vercel Serverless Module Init Error:", err);
}

module.exports = (req, res) => {
  if (initError) {
    return res.status(500).json({
      error: "Vercel Backend Module Initialization Failed",
      details: initError.message || String(initError),
      stack: initError.stack || ''
    });
  }

  try {
    return app(req, res);
  } catch (err) {
    return res.status(500).json({
      error: "Vercel Backend Execution Error",
      details: err.message || String(err),
      stack: err.stack || ''
    });
  }
};

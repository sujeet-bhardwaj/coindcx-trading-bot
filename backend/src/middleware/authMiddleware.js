const config = require('../config/env');

/**
 * Authentication middleware to secure bot control and configuration routes.
 * Validates 'Authorization: Bearer <API_SECRET_KEY>' or 'x-api-key: <API_SECRET_KEY>'.
 */
function authMiddleware(req, res, next) {
  // If no secret key is configured, allow in development with warning
  if (!config.apiSecretKey) {
    if (config.nodeEnv === 'development') {
      return next();
    }
    return res.status(500).json({
      success: false,
      error: 'Server security misconfiguration: API_SECRET_KEY is not defined in backend environment.',
    });
  }

  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];

  let token = null;
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
      token = authHeader.trim();
    }
  } else if (apiKeyHeader) {
    token = apiKeyHeader.trim();
  }

  if (!token || token !== config.apiSecretKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or missing API secret key. Provide a valid Authorization Bearer token or x-api-key header.',
    });
  }

  next();
}

module.exports = authMiddleware;

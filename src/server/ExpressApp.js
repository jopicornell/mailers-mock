const path = require('path');
const express = require('express');
const basicAuth = require('express-basic-auth');
const { rateLimit } = require('express-rate-limit');
const { loggerFactory } = require('./logger/log4js');
const RequestHandler = require('./RequestHandler');

const logger = loggerFactory('ExpressApp');

const setupExpressApp = (
  mailHandler, 
  apiAuthentication, 
  mockedApiAuthenticationKey, 
  rateLimitConfiguration,
) => {

  const app = express();

  if (rateLimitConfiguration.enabled) {

    const rateLimitWindowInMs = rateLimitConfiguration.windowInMs;
    const rateLimitMaxRequests = rateLimitConfiguration.maxRequests;

    logger.info(`Rate limit enabled with ${rateLimitMaxRequests} requests per ${rateLimitWindowInMs} ms.`);

    const definedRateLimit = rateLimit({
      windowMs: rateLimitWindowInMs,
      max: rateLimitMaxRequests,
      standardHeaders: true,
    });

    app.use(definedRateLimit);  

  } else {
    logger.warn('Rate limit is disabled!');
  }

  // Request handler for non-static requests.
  RequestHandler(app, mockedApiAuthenticationKey, mailHandler);

  // We configure this middleware after the API request handlers because we want basic auth to only apply to the static content.
  if (apiAuthentication.enabled) {
    app.use(basicAuth({ challenge: true, users: apiAuthentication.users }));
  }

  // Static content.
  app.use(express.static(path.join(__dirname, '../../dist')));
  app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, '../../dist', 'index.html'));
  });

  return app;
};

module.exports = {
  setupExpressApp,
};

import { loggerFactory } from './logger/log4js.ts';
import { setupExpressApp } from './ExpressApp.ts';
import MailHandler from './handler/MailHandler.ts';

const logger = loggerFactory('Server');

const authenticationUsers = (usersString: string): { [x: string]: string; } => {

  const authenticationParams = usersString.split(';');

  const users = authenticationParams.map(auth => {
    const userPasswordPair = auth.split(':');
    return { [userPasswordPair[0]]: userPasswordPair[1] };
  });

  return users.reduce((acc, curr) => {
    return { ...acc, ...curr };
  }, {});
};

const mailHandler = new MailHandler(process.env.MAIL_HISTORY_DURATION);

const apiAuthentication = process.env.AUTHENTICATION
  ? { enabled: true, users: authenticationUsers(process.env.AUTHENTICATION) }
  : { enabled: false, users: {} };

const rateLimitConfiguration = {
  enabled: process.env.RATE_LIMIT_ENABLED === 'true',
  windowInMs: process.env.RATE_LIMIT_WINDOW_IN_MS ? process.env.RATE_LIMIT_WINDOW_IN_MS : 60000,
  maxRequests: process.env.RATE_LIMIT_MAX_REQUESTS ? process.env.RATE_LIMIT_MAX_REQUESTS : 100,
};

const app = setupExpressApp(
  mailHandler,
  apiAuthentication,
  process.env.API_KEY,
  rateLimitConfiguration,
);

const serverPort = 3000;
app.listen(serverPort);

logger.info(`Started sendgrid-mock on port ${serverPort}!`);

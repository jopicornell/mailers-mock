import bodyParser from 'body-parser';
import express, { Express, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import {Validator, ValidationError} from 'express-json-validator-middleware';
import MailHandler from '@/server/handler/MailHandler.ts';
import { loggerFactory } from './logger/log4js.ts';

import { JSONSchema7 } from 'json-schema';
import { Mail } from '@/types/Mail.ts';

const logger = loggerFactory('RequestHandler');

const jsonSchema: Record<string, JSONSchema7> = {
  v3MailSend: {
    type: 'object',
    required: ['personalizations', 'from'],
    if: {
      properties: {
        template_id: { const: null }
      }
    },
    then: {
      required: ['content', 'subject']
    },
    properties: {
      content: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            value: { type: 'string' }
          },
        },
      },
      from: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string' },
          name: { type: ['string', 'null'] },
        },
      },
      personalizations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            to: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  email: { type: 'string' }
                },
              },
            },
            custom_args: { type: ['object', 'null'] }
          },
        },
      },
      subject: { type: 'string' },
      template_id: { type: ['string', 'null'] },
      categories: {
        type: ['array', 'null'],
        items: { type: 'string' }
      },
      custom_args: {
        type: ['object', 'null']
      },
      attachments: {
        type: ['array', 'null'],
        items: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            type: { type: 'string' },
            filename: { type: 'string' },
            disposition: { type: 'string' },
            content_id: { type: 'string' }
          }
        }
      }
    }
  }
};

/**
 * Creates a request handler for the given express app.
 *
 * @param {*} app express app
 * @param {*} apiAuthenticationKey api key for authentication
 * @param {*} mailHandler  mail handler
 */
const RequestHandler = (app: Express, apiAuthenticationKey: any, mailHandler: MailHandler) => {

  const { validate } = new Validator({});

  const bodyParserLimitMb = process.env.BODY_PARSER_LIMIT_MB ? parseInt(process.env.BODY_PARSER_LIMIT_MB, 10) : 5;
  const bodyParserLimit = `${bodyParserLimitMb}mb`;

  app.use(bodyParser.json({ limit: bodyParserLimit }));

  app.post('/api/mail.send.json', express.urlencoded({ extended: true, limit: bodyParserLimit }), (req: Request, res: Response) => {
    const reqApiKey = req.headers.authorization;

    if (reqApiKey === `Bearer ${apiAuthenticationKey}`) {
      const messageId = crypto.randomUUID();
      logger.debug('Received mail.send.json request', { body: req.body });
      const mailToAdd: Mail = {
        from: {
          name: req.body.fromname,
          email: req.body.from
        },
        subject: req.body.subject,
        content: [{
          type: 'text/html',
          value: req.body.html
        }],
        datetime: new Date(),
        personalizations: [{
          to: [{
            name: req.body.toname,
            email: req.body.to
          }],
          cc: [{
            name: req.body.ccname,
            email: req.body.cc
          }],
          bcc: [{
            name: req.body.bccname,
            email: req.body.bcc
          }]
        }]
      }

      try {
        // Simulate adding mail - this should map to your actual mail processing logic
        mailHandler.addMail(mailToAdd, messageId);
        logger.info(`Mail added via mail.send.json endpoint`, { messageId, to: req.body.to });
        res.status(200).header({ 'X-Message-ID': messageId }).send();
      } catch (error) {
        logger.error('Error processing mail.send.json request', { error, messageId, body: req.body });
        res.status(500).send({ error: 'Internal Server Error', details: (error as Error).message });
      }
    } else {
      res.status(403).send({
        errors: [{
          message: 'Failed authentication',
          field: 'authorization',
          help: 'check used API key for authentication',
        }],
        id: 'forbidden',
      });
    }
  });

  app.post('/api/v1/send', express.urlencoded({ extended: true, limit: bodyParserLimit }), (req: Request, res: Response) => {
    const reqApiKey = req.headers['mailpace-server-token'];

    if (reqApiKey === apiAuthenticationKey) {
      const messageId = crypto.randomUUID();
      logger.debug('Received MailPace API request', { body: req.body });

      const mailToAdd: Mail = {
        from: {
          name: req.body.fromname,
          email: req.body.from
        },
        subject: req.body.subject,
        content: [{
          type: 'text/html',
          value: req.body.htmlbody
        }],
        datetime: new Date(),
        personalizations: [{
          to: [{ email: req.body.to }],
          bcc: req.body.bcc ? [{ email: req.body.bcc }] : undefined,
        }]
      };

      try {
        mailHandler.addMail(mailToAdd, messageId);
        logger.info(`Mail added via MailPace API`, { messageId, to: req.body.to });
        res.status(200).header({ 'X-Message-ID': messageId }).send();
      } catch (error) {
        logger.error('Error processing MailPace API request', { error, messageId, body: req.body });
        res.status(500).send({ error: 'Internal Server Error', details: (error as Error).message });
      }
    } else {
      logger.warn('MailPace API authentication failed');
      res.status(403).send({
        errors: [{
          message: 'Failed authentication',
          field: 'MailPace-Server-Token',
          help: 'check used API key for authentication',
        }],
        id: 'forbidden',
      });
    }
  });

  app.post(
    '/v3/mail/send',
    // @ts-ignore
    validate({ body: jsonSchema.v3MailSend }),
    (req, res) => {
      const reqApiKey = req.headers.authorization;

      if (reqApiKey === `Bearer ${apiAuthenticationKey}`) {
        const messageId = crypto.randomUUID();
        logger.debug('Received SendGrid v3 mail/send request', { 
          messageId,
          hasAttachments: !!req.body.attachments,
          attachmentCount: req.body.attachments?.length ?? 0
        });

        try {
          mailHandler.addMail(req.body, messageId);
          logger.info(`Mail added via SendGrid v3 API`, { 
            messageId, 
            to: req.body.personalizations?.[0]?.to?.[0]?.email,
            hasAttachments: !!req.body.attachments
          });
          res.status(202).header({
            'X-Message-ID': messageId,
          }).send();
        } catch (error) {
          logger.error('Error processing SendGrid v3 mail/send request', { 
            error: (error as Error).message,
            stack: (error as Error).stack,
            messageId,
            hasAttachments: !!req.body.attachments,
            attachmentCount: req.body.attachments?.length ?? 0
          });
          res.status(500).send({ 
            error: 'Internal Server Error', 
            details: (error as Error).message 
          });
        }
      } else {
        logger.warn('SendGrid v3 API authentication failed');
        res.status(403).send({
          errors: [{
            message: 'Failed authentication',
            field: 'authorization',
            help: 'check used api-key for authentication',
          }],
          id: 'forbidden',
        });
      }
    }
  );

  app.get('/api/mails', (req, res) => {

    const filterCriteria = {
      to: req.query.to?.toString(),
      subject: req.query.subject?.toString(),
      dateTimeSince: req.query.dateTimeSince?.toString(),
    };

    const paginationCriteria = {
      page: Number(req.query.page?.toString() ?? '0'),
      pageSize: Number(req.query.pageSize?.toString() ?? '10'),
    };

    const mails = mailHandler.getMails(filterCriteria, paginationCriteria);

    res.send(mails);
  });

  app.delete('/api/mails/:id', (req, res) => {
    const { id } = req.params;

    if (!id) {
      res.status(400).send({ error: 'Email ID is required' });
      return;
    }

    const deleted = mailHandler.deleteMailById(id);

    if (deleted) {
      res.status(200).send({ success: true, message: 'Email deleted successfully' });
    } else {
      res.status(404).send({ error: 'Email not found' });
    }
  });

  app.delete('/api/mails', (req, res) => {

    const filterCriteria = {
      to: req.query.to?.toString() ?? '',
    };

    mailHandler.clear(filterCriteria);

    res.sendStatus(202);
  });

  app.get('/zero_bounce', (req, res) => {
    const email = req.query.email?.toString().toLowerCase() || '';

    let response: any = {
      address: email,
      status: 'valid',
      sub_status: '',
      free_email: false,
      did_you_mean: '',
      account: '',
      domain: email.split('@')[1] || '',
      domain_age_days: 0,
      free_email_provider: false,
      mx_found: true,
      mx_record: '',
      smtp_provider: '',
      firstname: '',
      lastname: '',
      gender: '',
      country: '',
      region: '',
      city: '',
      zipcode: '',
      processed_at: new Date().toISOString()
    };

    // Check if email contains "invalid" - return invalid status
    if (email.includes('invalid')) {
      response.status = 'invalid';
      response.sub_status = '';
    }
    // Check for temporary/toxic email indicators
    else if (email.includes('disposable')) {
      response.status = 'invalid';
      response.sub_status = 'disposable';
    } else if (email.includes('toxic')) {
      response.status = 'invalid';
      response.sub_status = 'toxic';
    }
    // Check for other error conditions
    else if (email.includes('smtp_connection')) {
      response.status = 'invalid';
      response.sub_status = 'failed_smtp_connection';
    } else if (email.includes('syntax_check')) {
      response.status = 'invalid';
      response.sub_status = 'failed_syntax_check';
    } else if (email.includes('no_response')) {
      response.status = 'invalid';
      response.sub_status = 'mail_server_did_not_respond';
    } else if (email.includes('temp_error')) {
      response.status = 'invalid';
      response.sub_status = 'mail_server_temporary_error';
    } else if (email.includes('timeout')) {
      response.status = 'invalid';
      response.sub_status = 'timeout_exceeded';
    } else if (email.includes('global_suppression')) {
      response.status = 'invalid';
      response.sub_status = 'global_suppression';
    } else if (email.includes('quota_exceeded')) {
      response.status = 'invalid';
      response.sub_status = 'mailbox_quota_exceeded';
    }

    res.json(response);
  });
  
  // Error handler that returns a 400 status code if the request body does not
  // match the given json schema.
  app.use((
      error: Error | ValidationError,
      req: Request,
      response: Response,
      next: NextFunction
  )  => {
    if (error instanceof ValidationError) {
      logger.warn('Request validation failed', {
        path: req.path,
        method: req.method,
        errors: error.validationErrors.body
      });
      const responseBody = {
        errors: error.validationErrors.body?.map(validationError => {
          return {
            field: validationError.params.missingProperty
              ? validationError.params.missingProperty
              : validationError.propertyName,
            message: validationError.message,
            path: validationError.schemaPath,
          };
        }),
      };
      response.status(400).send(responseBody);
      next();
    } else {
      next(error);
    }
  });

  // Global error handler for uncaught errors
  app.use((
      error: Error,
      req: Request,
      response: Response,
      // eslint-disable-next-line no-unused-vars
      _next: NextFunction
  ) => {
    logger.error('Unhandled error in request', {
      path: req.path,
      method: req.method,
      error: error.message,
      stack: error.stack
    });
    response.status(500).send({
      error: 'Internal Server Error',
      message: error.message
    });
  });
};

export default RequestHandler;

import bodyParser from 'body-parser';
import express, { Express, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import {Validator, ValidationError} from 'express-json-validator-middleware';
import MailHandler from '@/server/handler/MailHandler.ts';

import { JSONSchema7 } from 'json-schema';
import { Mail } from '@/types/Mail.ts';

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
      console.log(req.body);
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

        res.status(200).header({ 'X-Message-ID': messageId }).send();
      } catch (error) {
        // @ts-ignore
        res.status(500).send({ error: 'Internal Server Error', details: error.message });
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
        res.status(200).header({ 'X-Message-ID': messageId }).send();
      } catch (error) {
        res.status(500).send({ error: 'Internal Server Error', details: (error as Error).message });
      }
    } else {
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

        mailHandler.addMail(req.body, messageId);

        res.status(202).header({
          'X-Message-ID': messageId,
        }).send();
      } else {
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

  app.delete('/api/mails', (req, res) => {

    const filterCriteria = {
      to: req.query.to?.toString() ?? '',
    };

    mailHandler.clear(filterCriteria);

    res.sendStatus(202);
  });

  // Error handler that returns a 400 status code if the request body does not
  // match the given json schema.
  app.use((
      error: Error | ValidationError,
      _: Request,
      response: Response,
      next: NextFunction
  )  => {
    if (error instanceof ValidationError) {
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
};

export default RequestHandler;

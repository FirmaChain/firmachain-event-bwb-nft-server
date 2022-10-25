import Morgan from 'morgan';

import { isIgnoreRoute } from '../utils/loggerUtil';
import { logger } from '../utils/logger';

const morganMiddleware = Morgan(
  (tokens: any, req: any, res: any) => {
    if (isIgnoreRoute(req.path) === false) {
      return ['📘[ END ]', tokens.method(req, res), tokens.url(req, res), tokens.status(req, res)].join(' ');
    }
  },
  {
    stream: {
      write: (message: string) => {
        logger.debug(message.substring(0, message.lastIndexOf('\n')));
      },
    },
  }
);

export default morganMiddleware;

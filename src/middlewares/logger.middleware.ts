import { NextFunction, Request, Response } from 'express';

import { isIgnoreRoute } from '../utils/loggerUtil';
import { logger } from '../utils/logger';

const loggerMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (isIgnoreRoute(req.path) === false) {
    logger.debug(['📘[START]', req.method, req.path].join(' '));
  }
  next();
};

export default loggerMiddleware;

import type { Request, Response, NextFunction } from "express";

const sanitizer = (req: Request, _res: Response, next: NextFunction) => {
  // basic theoretical sanitizer middleware, replace with custom DOM/string sanitizer if needed
  next();
};

export default sanitizer;

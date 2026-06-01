import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ParamsDictionary, Query } from "express-serve-static-core";

type AsyncRequestHandler<
  Params extends ParamsDictionary = ParamsDictionary,
  ResponseBody = unknown,
  RequestBody = Request["body"],
  RequestQuery extends Query = Query
> = (
  req: Request<Params, ResponseBody, RequestBody, RequestQuery>,
  res: Response<ResponseBody>,
  next: NextFunction
) => Promise<unknown>;

const asyncHandler = <
  Params extends ParamsDictionary = ParamsDictionary,
  ResponseBody = unknown,
  RequestBody = Request["body"],
  RequestQuery extends Query = Query
>(
  handler: AsyncRequestHandler<Params, ResponseBody, RequestBody, RequestQuery>
): RequestHandler<Params, ResponseBody, RequestBody, RequestQuery> => {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};

export default asyncHandler;

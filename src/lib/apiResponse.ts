import type { Response } from 'express';

type Pagination = Readonly<{
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}>;

type SuccessResponse = Readonly<{
  success: true;
  statusCode: number;
  message: string;
  data: unknown;
}>;

type PaginatedResponse = Readonly<{
  success: true;
  statusCode: 200;
  message: string;
  data: unknown;
  pagination: Pagination;
}>;

type ErrorResponse = Readonly<{
  success: false;
  statusCode: number;
  message: string;
  errors?: readonly unknown[];
}>;

export class ApiResponse {
  public static success(res: Response, data: unknown, message = 'Success', statusCode = 200): void {
    const payload: SuccessResponse = {
      success: true,
      statusCode,
      message,
      data,
    };

    res.status(statusCode).json(payload);
  }

  public static paginated(
    res: Response,
    data: unknown,
    pagination: Pagination,
    message = 'Fetched',
  ): void {
    const payload: PaginatedResponse = {
      success: true,
      statusCode: 200,
      message,
      data,
      pagination,
    };

    res.status(200).json(payload);
  }

  public static error(
    res: Response,
    message: string,
    statusCode = 500,
    errors: readonly unknown[] = [],
  ): void {
    const payload: ErrorResponse =
      errors.length > 0
        ? { success: false, statusCode, message, errors }
        : { success: false, statusCode, message };

    res.status(statusCode).json(payload);
  }

  public static noContent(res: Response): void {
    res.status(204).send();
  }
}

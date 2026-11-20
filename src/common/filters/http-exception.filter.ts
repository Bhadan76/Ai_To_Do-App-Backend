import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled request error for ${request.method} ${request.url}`,
      );
    }

    const validationErrors = this.getValidationErrors(exception);
    const statusName = HttpStatus[status] ?? 'REQUEST_FAILED';
    const message =
      status >= HttpStatus.INTERNAL_SERVER_ERROR
        ? 'Internal server error'
        : statusName
            .toLowerCase()
            .split('_')
            .map((word) => word[0].toUpperCase() + word.slice(1))
            .join(' ');

    response.status(status).json({
      success: false,
      message,
      errors: validationErrors,
    });
  }

  private getValidationErrors(exception: unknown): string[] {
    if (!(exception instanceof HttpException)) {
      return [];
    }

    const body = exception.getResponse();
    if (typeof body !== 'object' || body === null || !('message' in body)) {
      return [];
    }

    const messages = (body as { message?: unknown }).message;
    if (Array.isArray(messages)) {
      return messages.filter(
        (message): message is string => typeof message === 'string',
      );
    }
    return [];
  }
}

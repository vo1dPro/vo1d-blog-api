import { ArgumentsHost, Catch, Logger, type ExceptionFilter } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const response = host
      .switchToHttp()
      .getResponse<{ status(code: number): { json(value: unknown): void } }>();
    const mapping: Record<string, { statusCode: number; message: string }> = {
      P2002: { statusCode: 409, message: 'A record with the same unique value already exists' },
      P2025: { statusCode: 404, message: 'Record not found' },
      P2003: { statusCode: 409, message: 'A referenced record is missing or still in use' },
      P2004: { statusCode: 400, message: 'Database constraint violated' },
    };
    const result = mapping[exception.code] ?? {
      statusCode: 500,
      message: 'Database operation failed',
    };
    if (result.statusCode === 500) this.logger.error(`Database error ${exception.code}`);
    response.status(result.statusCode).json(result);
  }
}

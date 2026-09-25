import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export const IS_PUBLIC = 'isPublic';

/** Marks an endpoint that does not need an access token. Everything else does. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export interface AuthContext {
  userId: string;
  sessionId: string;
}

export type AuthenticatedRequest = Request & { auth?: AuthContext };

/** The authenticated user and session of the current request. */
export const Auth = createParamDecorator((_: unknown, context: ExecutionContext): AuthContext => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.auth) throw new Error('@Auth() used on a public endpoint');
  return request.auth;
});

/** Client IP for rate limits (Express `trust proxy` decides which header is trusted). */
export const ClientIp = createParamDecorator((_: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<Request>();
  return request.ip ?? request.socket.remoteAddress ?? 'unknown';
});

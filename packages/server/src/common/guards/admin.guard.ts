import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { isAdmin?: boolean } | undefined;

    if (!user?.isAdmin) {
      throw new ForbiddenException('Admin permission required');
    }

    return true;
  }
}

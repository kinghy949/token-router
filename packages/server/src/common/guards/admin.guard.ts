import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { isAdmin?: boolean } | undefined;

    if (!user?.isAdmin) {
      throw new ForbiddenException('需要管理员权限');
    }

    return true;
  }
}

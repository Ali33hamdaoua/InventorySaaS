import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { branch: { select: { id: true, name: true, slug: true } } },
    });
    if (!user || !user.isActive) {
      // Same generic message for "not found" / "disabled" / "bad password" so
      // we don't leak which one it is.
      throw new UnauthorizedException('Identifiants invalides');
    }

    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('Identifiants invalides');

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        branchId: user.branchId,
      },
      {
        secret: this.cfg.getOrThrow('JWT_SECRET'),
        expiresIn: this.cfg.get('JWT_EXPIRES_IN') ?? '1d',
      },
    );

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        branchId: user.branchId,
        branch: user.branch,
      },
    };
  }
}

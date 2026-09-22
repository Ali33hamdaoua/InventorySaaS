import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(q: PaginationDto) {
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      }),
      this.prisma.auditLog.count(),
    ]);
    return { data, total, page: q.page, pageSize: q.pageSize };
  }
}

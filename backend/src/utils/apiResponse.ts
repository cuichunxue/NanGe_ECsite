import { Response } from 'express';

export function ok<T>(res: Response, data: T, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}

export function okPaginated<T>(
  res: Response,
  items: T[],
  pagination: { page: number; pageSize: number; total: number },
) {
  return res.status(200).json({
    success: true,
    data: items,
    pagination: {
      ...pagination,
      totalPages: Math.max(1, Math.ceil(pagination.total / pagination.pageSize)),
    },
  });
}

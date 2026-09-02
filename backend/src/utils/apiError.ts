export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }

  static badRequest(message: string, code = 'BAD_REQUEST') {
    return new ApiError(400, code, message);
  }

  static unauthorized(message = '認証が必要です', code = 'UNAUTHORIZED') {
    return new ApiError(401, code, message);
  }

  static forbidden(message = 'この操作を行う権限がありません', code = 'FORBIDDEN') {
    return new ApiError(403, code, message);
  }

  static notFound(message = 'リソースが見つかりません', code = 'NOT_FOUND') {
    return new ApiError(404, code, message);
  }

  static conflict(message: string, code = 'CONFLICT') {
    return new ApiError(409, code, message);
  }

  static internal(message = 'サーバー内部エラーが発生しました', code = 'INTERNAL_ERROR') {
    return new ApiError(500, code, message);
  }

  /** 決済代行など外部サービスとの通信に失敗したとき */
  static badGateway(message = '外部サービスとの通信に失敗しました', code = 'BAD_GATEWAY') {
    return new ApiError(502, code, message);
  }
}

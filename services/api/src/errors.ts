export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new ApiError(404, 'not_found', `${what} no existe`);
export const unauthorized = (msg = 'Autenticación requerida') => new ApiError(401, 'unauthorized', msg);
export const badRequest = (msg: string, details?: unknown) => new ApiError(400, 'bad_request', msg, details);
export const conflict = (code: string, msg: string) => new ApiError(409, code, msg);

export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

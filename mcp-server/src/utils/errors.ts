export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

export class PathSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathSecurityError';
  }
}

export class FileReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileReadError';
  }
}

/**
 * Converts any unknown error into a clean string message.
 * Avoids leaking internal stack traces to MCP tool consumers.
 */
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

/**
 * Strips the workspace root from a path so we never expose
 * absolute host paths in error messages returned to agents.
 */
export function sanitizePath(absPath: string, workspaceRoot: string): string {
  if (absPath.startsWith(workspaceRoot)) {
    const rel = absPath.slice(workspaceRoot.length);
    return rel.startsWith('/') || rel.startsWith('\\') ? rel.slice(1) : rel;
  }
  return '<path>';
}


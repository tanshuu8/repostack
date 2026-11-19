/**
 * @fileoverview Strict workspace boundary validation and symlink protection.
 */
import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * Validates and resolves a user-supplied relative path within the workspace root.
 * Rejects: absolute paths, path traversal (../), symlink escapes.
 * Returns the resolved absolute path on success.
 */
export function validateAndResolvePath(
  workspaceRoot: string,
  userPath: string
): { valid: true; resolved: string } | { valid: false; reason: string } {

  // Reject empty path — callers should supply '.' for root
  if (userPath === null || userPath === undefined) {
    return { valid: false, reason: 'Path must be provided.' };
  }

  const normalizedInput = userPath.trim();

  // Reject absolute paths (both Unix '/' and Windows 'C:\' or '\\')
  if (path.isAbsolute(normalizedInput)) {
    return { valid: false, reason: 'Absolute paths are not allowed. Supply a relative path within the workspace.' };
  }

  // Reject obvious traversal attempts early
  // Normalize with forward slashes for consistent check
  const forwardSlashed = normalizedInput.replace(/\\/g, '/');
  const parts = forwardSlashed.split('/');
  for (const part of parts) {
    if (part === '..') {
      return { valid: false, reason: 'Path traversal (../) is not permitted.' };
    }
  }

  // Resolve against workspace root
  const joined = path.join(workspaceRoot, normalizedInput);
  // path.resolve ensures we get an absolute canonical path
  const resolved = path.resolve(joined);

  // Confirm the resolved path is still inside the workspace root
  // Add path separator to prevent prefix attacks (e.g. /workspace-extra)
  const rootWithSep = workspaceRoot.endsWith(path.sep)
    ? workspaceRoot
    : workspaceRoot + path.sep;

  if (resolved !== workspaceRoot && !resolved.startsWith(rootWithSep)) {
    return { valid: false, reason: 'Resolved path escapes the configured workspace.' };
  }

  // Symlink escape check: realpath resolves symlinks
  try {
    const real = fs.realpathSync(resolved);
    const realRoot = fs.realpathSync(workspaceRoot);
    const realRootWithSep = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
    if (real !== realRoot && !real.startsWith(realRootWithSep)) {
      return { valid: false, reason: 'Path resolves via symlink to a location outside the workspace.' };
    }
  } catch {
    // Path doesn't exist yet — that's fine, we'll handle it in tool logic
  }

  return { valid: true, resolved };
}


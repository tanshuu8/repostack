/**
 * @fileoverview Workspace path resolution and environment configuration.
 */
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface WorkspaceConfig {
  root: string;
}

export function loadWorkspaceConfig(): WorkspaceConfig {
  const raw = process.env['REPOSTACK_WORKSPACE'];
  if (!raw) {
    throw new Error(
      'REPOSTACK_WORKSPACE environment variable is not set.\n' +
      'Set it to the absolute path of the repository you want to expose.\n' +
      'Example (PowerShell): $env:REPOSTACK_WORKSPACE = "C:\\path\\to\\repo"\n' +
      'Example (bash): export REPOSTACK_WORKSPACE=/path/to/repo'
    );
  }

  const resolved = path.resolve(raw);

  if (!fs.existsSync(resolved)) {
    throw new Error(
      `REPOSTACK_WORKSPACE path does not exist: ${resolved}\n` +
      'Please set REPOSTACK_WORKSPACE to an existing directory.'
    );
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(
      `REPOSTACK_WORKSPACE is not a directory: ${resolved}`
    );
  }

  return { root: resolved };
}


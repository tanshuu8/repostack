/**
 * @fileoverview Implementation of read_file MCP tool with size and range validation.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validateAndResolvePath } from '../security/path-validator.js';
import { isSensitiveFile, isBinaryFile } from '../security/file-filter.js';
import { toErrorMessage } from '../utils/errors.js';

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB

export function registerReadFileTool(mcp: McpServer, workspaceRoot: string): void {
  mcp.registerTool(
    'read_file',
    {
      description:
        'Read the contents of a source code file or configuration file in the workspace. ' +
        'Supply a relative file path. Supports UTF-8 text files up to 1 MB. ' +
        'Binary files, sensitive files (.env, keys, certs), and paths outside the workspace are rejected. ' +
        'Use list_files first to discover available files.',
      inputSchema: {
        path: z.string().min(1).describe(
          'Relative path to the file within the workspace (e.g., "src/index.ts" or "package.json").'
        ),
      },
    },
    async (args) => {
      try {
        const filePath = (args as { path: string }).path;

        const validation = validateAndResolvePath(workspaceRoot, filePath);
        if (!validation.valid) {
          return { content: [{ type: 'text' as const, text: `Security error: ${validation.reason}` }], isError: true };
        }

        const absPath = validation.resolved;

        // Sensitive file check
        if (isSensitiveFile(absPath)) {
          return { content: [{ type: 'text' as const, text: `Access denied: "${path.basename(filePath)}" is a protected file.` }], isError: true };
        }

        // Existence check
        if (!fs.existsSync(absPath)) {
          return { content: [{ type: 'text' as const, text: `File not found: ${filePath}` }], isError: true };
        }

        const stat = fs.statSync(absPath);
        if (!stat.isFile()) {
          return { content: [{ type: 'text' as const, text: `Path is not a file: ${filePath}` }], isError: true };
        }

        // Binary file check
        if (isBinaryFile(absPath)) {
          return { content: [{ type: 'text' as const, text: `Cannot read binary file: ${filePath}. Only UTF-8 text files are supported.` }], isError: true };
        }

        // Size limit
        if (stat.size > MAX_FILE_SIZE_BYTES) {
          return {
            content: [{
              type: 'text' as const,
              text: `File too large: ${filePath} is ${(stat.size / 1024).toFixed(1)} KB. Maximum allowed size is ${MAX_FILE_SIZE_BYTES / 1024} KB.`,
            }],
            isError: true,
          };
        }

        // Read file
        const content = fs.readFileSync(absPath, 'utf-8');
        const lines = content.split('\n').length;

        const result = {
          path: filePath,
          size_bytes: stat.size,
          lines,
          last_modified: stat.mtime.toISOString(),
          content,
        };

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error reading file: ${toErrorMessage(err)}` }],
          isError: true,
        };
      }
    }
  );
}


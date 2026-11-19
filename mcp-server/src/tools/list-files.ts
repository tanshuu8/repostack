/**
 * @fileoverview Implementation of list_files MCP tool for directory inspection.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validateAndResolvePath } from '../security/path-validator.js';
import { isExcludedDirectory, isSensitiveFile, isHiddenFile } from '../security/file-filter.js';
import { toErrorMessage } from '../utils/errors.js';

const MAX_RESULTS = 2000;
const MAX_DEPTH = 10;

interface FileEntry {
  path: string;
  type: 'file' | 'directory';
  size?: number;
}

function listRecursive(
  absDir: string,
  workspaceRoot: string,
  options: {
    recursive: boolean;
    maxDepth: number;
    includeHidden: boolean;
    currentDepth: number;
  },
  results: FileEntry[]
): void {
  if (results.length >= MAX_RESULTS) return;
  if (options.currentDepth > options.maxDepth) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= MAX_RESULTS) break;

    const name = entry.name;

    // Skip hidden unless requested
    if (!options.includeHidden && isHiddenFile(name)) continue;

    // Skip excluded directories
    if (entry.isDirectory() && isExcludedDirectory(name)) continue;

    // Skip sensitive files
    if (entry.isFile() && isSensitiveFile(name)) continue;

    const absPath = path.join(absDir, name);
    const relPath = path.relative(workspaceRoot, absPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      results.push({ path: relPath, type: 'directory' });
      if (options.recursive && options.currentDepth < options.maxDepth) {
        listRecursive(absPath, workspaceRoot, { ...options, currentDepth: options.currentDepth + 1 }, results);
      }
    } else if (entry.isFile()) {
      let size: number | undefined;
      try {
        size = fs.statSync(absPath).size;
      } catch { /* ignore */ }
      results.push({ path: relPath, type: 'file', size });
    }
  }
}

export function registerListFilesTool(mcp: McpServer, workspaceRoot: string): void {
  mcp.registerTool(
    'list_files',
    {
      description:
        'List files and directories in the workspace repository. ' +
        'Use this to explore the repository structure before reading specific files. ' +
        'Set recursive=true to explore subdirectories. ' +
        'Results exclude node_modules, .git, build outputs, and sensitive files.',
      inputSchema: {
        path: z.string().optional().default('.').describe(
          'Relative directory path within the workspace. Defaults to workspace root.'
        ),
        recursive: z.boolean().optional().default(false).describe(
          'Whether to list files recursively into subdirectories.'
        ),
        max_depth: z.number().int().min(1).max(MAX_DEPTH).optional().default(3).describe(
          `Maximum recursion depth (1-${MAX_DEPTH}). Only relevant when recursive=true.`
        ),
        include_hidden: z.boolean().optional().default(false).describe(
          'Whether to include hidden files and directories (those starting with a dot).'
        ),
      },
    },
    async (args) => {
      try {
        const dirPath = (args as { path?: string }).path ?? '.';
        const recursive = (args as { recursive?: boolean }).recursive ?? false;
        const maxDepth = (args as { max_depth?: number }).max_depth ?? 3;
        const includeHidden = (args as { include_hidden?: boolean }).include_hidden ?? false;

        const validation = validateAndResolvePath(workspaceRoot, dirPath);
        if (!validation.valid) {
          return { content: [{ type: 'text' as const, text: `Security error: ${validation.reason}` }], isError: true };
        }

        const absDir = validation.resolved;

        if (!fs.existsSync(absDir)) {
          return { content: [{ type: 'text' as const, text: `Directory not found: ${dirPath}` }], isError: true };
        }

        const stat = fs.statSync(absDir);
        if (!stat.isDirectory()) {
          return { content: [{ type: 'text' as const, text: `Path is not a directory: ${dirPath}` }], isError: true };
        }

        const results: FileEntry[] = [];
        listRecursive(absDir, workspaceRoot, {
          recursive,
          maxDepth,
          includeHidden,
          currentDepth: 0,
        }, results);

        const summary = {
          workspace_path: dirPath === '.' ? '(workspace root)' : dirPath,
          total_entries: results.length,
          truncated: results.length >= MAX_RESULTS,
          entries: results,
        };

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(summary, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error listing files: ${toErrorMessage(err)}` }],
          isError: true,
        };
      }
    }
  );
}


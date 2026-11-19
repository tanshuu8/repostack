/**
 * @fileoverview Implementation of search_workspace MCP tool with glob filtering.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validateAndResolvePath } from '../security/path-validator.js';
import { isExcludedDirectory, isSensitiveFile, isBinaryFile, isHiddenFile } from '../security/file-filter.js';
import { toErrorMessage } from '../utils/errors.js';

const MAX_RESULTS = 200;
const MAX_FILE_SIZE_SEARCH = 512 * 1024; // 512 KB per file for search

interface SearchMatch {
  file: string;
  line: number;
  column: number;
  text: string;
}

function matchesGlob(filename: string, pattern: string): boolean {
  // Simple glob matching: supports * and ? wildcards
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexStr = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${regexStr}$`, 'i').test(filename);
}

function searchFile(
  absPath: string,
  workspaceRoot: string,
  query: string | RegExp,
  results: SearchMatch[],
  maxResults: number
): void {
  if (results.length >= maxResults) return;

  let content: string;
  try {
    const stat = fs.statSync(absPath);
    if (stat.size > MAX_FILE_SIZE_SEARCH) return;
    content = fs.readFileSync(absPath, 'utf-8');
  } catch {
    return;
  }

  const relPath = path.relative(workspaceRoot, absPath).replace(/\\/g, '/');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length && results.length < maxResults; i++) {
    const line = lines[i];
    if (typeof query === 'string') {
      const idx = line.indexOf(query);
      if (idx !== -1) {
        results.push({
          file: relPath,
          line: i + 1,
          column: idx + 1,
          text: line.trim(),
        });
      }
    } else {
      const match = query.exec(line);
      if (match) {
        results.push({
          file: relPath,
          line: i + 1,
          column: (match.index ?? 0) + 1,
          text: line.trim(),
        });
      }
    }
  }
}

function searchDirectory(
  absDir: string,
  workspaceRoot: string,
  query: string | RegExp,
  filePattern: string | undefined,
  includeHidden: boolean,
  results: SearchMatch[],
  maxResults: number
): void {
  if (results.length >= maxResults) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= maxResults) break;
    const name = entry.name;

    if (!includeHidden && isHiddenFile(name)) continue;

    if (entry.isDirectory()) {
      if (isExcludedDirectory(name)) continue;
      searchDirectory(
        path.join(absDir, name),
        workspaceRoot,
        query,
        filePattern,
        includeHidden,
        results,
        maxResults
      );
    } else if (entry.isFile()) {
      if (isSensitiveFile(name)) continue;
      if (isBinaryFile(name)) continue;
      if (filePattern && !matchesGlob(name, filePattern)) continue;
      searchFile(path.join(absDir, name), workspaceRoot, query, results, maxResults);
    }
  }
}

export function registerSearchWorkspaceTool(mcp: McpServer, workspaceRoot: string): void {
  mcp.registerTool(
    'search_workspace',
    {
      description:
        'Search for a text string or pattern across all source files in the workspace. ' +
        'Returns matching file paths, line numbers, and the matching line content. ' +
        'Excludes node_modules, .git, build directories, binary files, and sensitive files. ' +
        'Use file_pattern to restrict search to specific file types (e.g., "*.ts", "*.json").',
      inputSchema: {
        query: z.string().min(1).describe(
          'The text string to search for in source files.'
        ),
        path: z.string().optional().default('.').describe(
          'Relative directory path to search within. Defaults to workspace root.'
        ),
        file_pattern: z.string().optional().describe(
          'Optional glob pattern to filter files by name (e.g., "*.ts", "*.json", "package.json").'
        ),
        case_sensitive: z.boolean().optional().default(false).describe(
          'Whether the search is case-sensitive. Defaults to false (case-insensitive).'
        ),
        max_results: z.number().int().min(1).max(MAX_RESULTS).optional().default(50).describe(
          `Maximum number of matches to return (1-${MAX_RESULTS}). Defaults to 50.`
        ),
      },
    },
    async (args) => {
      try {
        const query = (args as { query: string }).query.trim();
        const searchPath = (args as { path?: string }).path ?? '.';
        const filePattern = (args as { file_pattern?: string }).file_pattern;
        const caseSensitive = (args as { case_sensitive?: boolean }).case_sensitive ?? false;
        const maxResults = (args as { max_results?: number }).max_results ?? 50;

        if (!query) {
          return { content: [{ type: 'text' as const, text: 'Search query cannot be empty.' }], isError: true };
        }

        const validation = validateAndResolvePath(workspaceRoot, searchPath);
        if (!validation.valid) {
          return { content: [{ type: 'text' as const, text: `Security error: ${validation.reason}` }], isError: true };
        }

        const absSearchDir = validation.resolved;

        if (!fs.existsSync(absSearchDir)) {
          return { content: [{ type: 'text' as const, text: `Directory not found: ${searchPath}` }], isError: true };
        }

        // Build search query
        const searchQuery: string | RegExp = caseSensitive
          ? query
          : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

        const results: SearchMatch[] = [];
        searchDirectory(absSearchDir, workspaceRoot, searchQuery, filePattern, false, results, maxResults);

        const summary = {
          query,
          search_path: searchPath === '.' ? '(workspace root)' : searchPath,
          case_sensitive: caseSensitive,
          file_pattern: filePattern ?? '*',
          total_matches: results.length,
          truncated: results.length >= maxResults,
          matches: results,
        };

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(summary, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error searching workspace: ${toErrorMessage(err)}` }],
          isError: true,
        };
      }
    }
  );
}


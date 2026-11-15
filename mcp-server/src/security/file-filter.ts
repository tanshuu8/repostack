import * as path from 'node:path';

/** Directories that are always excluded from listing and search */
export const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.venv',
  'venv',
  '__pycache__',
  '.nyc_output',
  '.cache',
  'out',
  '.turbo',
  '.parcel-cache',
]);

/** Glob-style patterns for sensitive files (matched by basename) */
const SENSITIVE_BASENAME_PATTERNS: RegExp[] = [
  /^\.env$/i,
  /^\.env\./i,        // .env.local, .env.production, etc.
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /^credentials\.json$/i,
  /^secrets\.json$/i,
  /^\.npmrc$/i,
  /^\.netrc$/i,
  /^id_rsa$/i,
  /^id_ed25519$/i,
  /^id_ecdsa$/i,
  /^id_dsa$/i,
];

/** Extensions considered binary / non-text */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.mp3', '.mp4', '.wav', '.ogg', '.avi', '.mov', '.mkv',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.wasm', '.class', '.pyc',
  '.ttf', '.woff', '.woff2', '.eot',
  '.db', '.sqlite', '.sqlite3',
]);

export function isSensitiveFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  return SENSITIVE_BASENAME_PATTERNS.some(re => re.test(basename));
}

export function isExcludedDirectory(dirName: string): boolean {
  return EXCLUDED_DIRECTORIES.has(dirName);
}

export function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

export function isHiddenFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  return basename.startsWith('.');
}


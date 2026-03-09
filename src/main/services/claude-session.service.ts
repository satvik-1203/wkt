import { readFile, readdir, stat, open } from 'fs/promises';
import path from 'path';
import os from 'os';

const summaryCache = new Map<string, string>();
const latestSessionCache = new Map<string, string>(); // projectKey → sessionId

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isClaudeCommand(command: string): boolean {
  const first = command.split(/\s+/)[0];
  return first === 'claude';
}

function extractSessionId(command: string): string | null {
  const tokens = command.split(/\s+/);
  const idx = tokens.indexOf('--resume');
  if (idx >= 0 && idx + 1 < tokens.length) {
    const val = tokens[idx + 1];
    if (UUID_RE.test(val)) return val;
  }
  return null;
}

function cwdToProjectKey(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

async function findLatestSession(projectDir: string): Promise<string | null> {
  try {
    const entries = await readdir(projectDir);
    const jsonlFiles = entries.filter((e) => e.endsWith('.jsonl'));
    if (jsonlFiles.length === 0) return null;

    let best: string | null = null;
    let bestMtime = 0;
    for (const file of jsonlFiles) {
      const s = await stat(path.join(projectDir, file));
      if (s.mtimeMs > bestMtime) {
        bestMtime = s.mtimeMs;
        best = file.replace('.jsonl', '');
      }
    }
    return best;
  } catch {
    return null;
  }
}

async function readSessionSummary(sessionId: string, projectKey: string): Promise<string> {
  const claudeDir = path.join(os.homedir(), '.claude');
  const jsonlPath = path.join(claudeDir, 'projects', projectKey, `${sessionId}.jsonl`);

  try {
    // Read only the first 64KB — enough for the header lines with slug/first message
    const fh = await open(jsonlPath, 'r');
    const buf = Buffer.alloc(64 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    await fh.close();
    const content = buf.toString('utf-8', 0, bytesRead);
    const lines = content.split('\n').slice(0, 50);

    let slug: string | null = null;
    let firstUserMessage: string | null = null;

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);

        // Look for slug
        if (!slug && entry.slug && typeof entry.slug === 'string') {
          slug = entry.slug;
        }

        // Look for first user message
        if (!firstUserMessage && entry.type === 'user' && entry.message) {
          const msg = typeof entry.message === 'string'
            ? entry.message
            : entry.message?.content;
          if (typeof msg === 'string' && msg.trim().length > 0) {
            firstUserMessage = msg.trim();
          } else if (Array.isArray(entry.message?.content)) {
            // Handle content blocks (e.g., [{type: "text", text: "..."}])
            const textBlock = entry.message.content.find(
              (b: { type: string; text?: string }) => b.type === 'text' && b.text,
            );
            if (textBlock) firstUserMessage = textBlock.text.trim();
          }
        }

        if (slug && firstUserMessage) break;
      } catch {
        // skip malformed lines
      }
    }

    // Try plan title from slug
    if (slug) {
      try {
        const planPath = path.join(claudeDir, 'plans', `${slug}.md`);
        const planContent = await readFile(planPath, 'utf-8');
        const headingMatch = planContent.match(/^#\s+(.+)$/m);
        if (headingMatch) {
          const title = headingMatch[1].trim();
          if (title.length > 0) {
            return title.length > 80 ? title.substring(0, 80) + '…' : title;
          }
        }
      } catch {
        // no plan file — fall through
      }
    }

    // Fall back to first user message
    if (firstUserMessage) {
      // Take first line only
      const firstLine = firstUserMessage.split('\n')[0];
      return firstLine.length > 80 ? firstLine.substring(0, 80) + '…' : firstLine;
    }
  } catch {
    // file not readable
  }

  return 'claude code';
}

/**
 * If the command is a Claude Code session, return a human-readable summary.
 * Returns null if the command is not a claude session.
 */
export async function getClaudeSessionSummary(
  command: string,
  cwd: string,
): Promise<string | null> {
  if (!isClaudeCommand(command)) return null;

  let sessionId = extractSessionId(command);
  const projectKey = cwdToProjectKey(cwd);

  if (!sessionId) {
    // Fresh `claude` — resolve via CWD, cached to avoid readdir+stat on every refresh
    const cachedLatest = latestSessionCache.get(projectKey);
    if (cachedLatest) {
      sessionId = cachedLatest;
    } else {
      const projectDir = path.join(os.homedir(), '.claude', 'projects', projectKey);
      sessionId = await findLatestSession(projectDir);
      if (sessionId) latestSessionCache.set(projectKey, sessionId);
    }
  }

  if (!sessionId) return 'claude code';

  const cached = summaryCache.get(sessionId);
  if (cached) return cached;

  const summary = await readSessionSummary(sessionId, projectKey);
  summaryCache.set(sessionId, summary);
  return summary;
}

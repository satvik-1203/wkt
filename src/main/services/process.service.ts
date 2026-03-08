import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type PidCwdMap = Record<number, string>;
export type PidTtyMap = Record<number, string>;
export type PidParentMap = Record<number, number>;

/**
 * Build PID -> cwd map from lsof -d cwd.
 */
export async function getPidCwdMap(): Promise<PidCwdMap> {
  const map: PidCwdMap = {};
  try {
    const { stdout } = await execFileAsync('lsof', ['-d', 'cwd', '-Fpn', '-w'], {
      maxBuffer: 10 * 1024 * 1024,
    });
    let currentPid = 0;
    for (const line of stdout.split('\n')) {
      if (!line) continue;
      if (line[0] === 'p') {
        currentPid = parseInt(line.substring(1), 10);
      } else if (line[0] === 'n') {
        map[currentPid] = line.substring(1);
      }
    }
  } catch {
    // lsof may require elevated permissions
  }
  return map;
}

/**
 * Build PID -> tty and PID -> ppid maps from a single ps call.
 */
export async function getPidMaps(): Promise<{ pidTtyMap: PidTtyMap; pidParentMap: PidParentMap }> {
  const pidTtyMap: PidTtyMap = {};
  const pidParentMap: PidParentMap = {};
  try {
    const { stdout } = await execFileAsync('ps', ['-eo', 'pid,ppid,tty']);
    for (const line of stdout.split('\n').slice(1)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 3) {
        const pid = parseInt(parts[0], 10);
        const ppid = parseInt(parts[1], 10);
        pidParentMap[pid] = ppid;
        if (parts[2] !== '??' && parts[2] !== '?') {
          pidTtyMap[pid] = parts[2];
        }
      }
    }
  } catch {
    // ps might fail in rare cases
  }
  return { pidTtyMap, pidParentMap };
}

/**
 * Walk up the process tree from `pid` to find if any ancestor is on `targetTty`.
 * Stops after maxDepth to avoid infinite loops.
 */
export function hasAncestorOnTty(
  pid: number,
  targetTty: string,
  pidTtyMap: PidTtyMap,
  pidParentMap: PidParentMap,
  maxDepth = 10
): boolean {
  let current = pid;
  for (let i = 0; i < maxDepth; i++) {
    if (pidTtyMap[current] === targetTty) return true;
    const parent = pidParentMap[current];
    if (!parent || parent === current || parent <= 1) break;
    current = parent;
  }
  return false;
}

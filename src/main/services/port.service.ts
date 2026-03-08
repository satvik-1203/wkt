import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface ListeningPort {
  pid: number;
  port: number;
}

// Well-known HTTP dev server port ranges.
// Filters out ephemeral OS ports and internal service ports.
const HTTP_PORT_RANGES: [number, number][] = [
  [80, 80],
  [443, 443],
  [1024, 1099],
  [3000, 3999],
  [4000, 4999],
  [5000, 5999],
  [6000, 6999],
  [7000, 7999],
  [8000, 9999],
];

function isHttpDevPort(port: number): boolean {
  return HTTP_PORT_RANGES.some(([lo, hi]) => port >= lo && port <= hi);
}

/**
 * Get all listening TCP ports, filtered to likely HTTP dev ports.
 */
export async function getListeningPorts(): Promise<ListeningPort[]> {
  const ports: ListeningPort[] = [];
  try {
    const { stdout } = await execFileAsync(
      'lsof',
      ['-i', '-P', '-n', '-sTCP:LISTEN', '-Fpn', '-w'],
      { maxBuffer: 10 * 1024 * 1024 }
    );
    let currentPid = 0;
    for (const line of stdout.split('\n')) {
      if (!line) continue;
      if (line[0] === 'p') {
        currentPid = parseInt(line.substring(1), 10);
      } else if (line[0] === 'n') {
        const match = line.match(/:(\d+)$/);
        if (match) {
          const port = parseInt(match[1], 10);
          if (isHttpDevPort(port)) {
            // Avoid duplicate pid+port combos
            if (!ports.some((p) => p.pid === currentPid && p.port === port)) {
              ports.push({ pid: currentPid, port });
            }
          }
        }
      }
    }
  } catch {
    // lsof may fail
  }
  return ports;
}

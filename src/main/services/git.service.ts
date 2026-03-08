import { execFile } from 'child_process';
import { promisify } from 'util';
import type { Worktree } from '../../shared/types';

const execFileAsync = promisify(execFile);

const MAIN_WORKSPACE_LABEL = 'Main Workspace';

export async function getWorktrees(repoPath: string): Promise<Worktree[]> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoPath, 'worktree', 'list', '--porcelain']);
    return parsePorcelainOutput(stdout);
  } catch {
    // If worktree list fails, treat the repo itself as a single worktree
    const { stdout: headOut } = await execFileAsync('git', ['-C', repoPath, 'rev-parse', 'HEAD']);
    const head = headOut.trim();

    let branch: string | null = null;
    try {
      const { stdout: branchOut } = await execFileAsync('git', ['-C', repoPath, 'rev-parse', '--abbrev-ref', 'HEAD']);
      branch = branchOut.trim();
      if (branch === 'HEAD') branch = null;
    } catch {
      // detached HEAD
    }

    return [{
      path: repoPath,
      head,
      branch,
      isBare: false,
      isMain: true,
      label: MAIN_WORKSPACE_LABEL,
    }];
  }
}

function parsePorcelainOutput(output: string): Worktree[] {
  const worktrees: Worktree[] = [];
  const blocks = output.trim().split('\n\n');

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const lines = block.split('\n');

    let path = '';
    let head = '';
    let branch: string | null = null;
    let isBare = false;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.substring('worktree '.length);
      } else if (line.startsWith('HEAD ')) {
        head = line.substring('HEAD '.length);
      } else if (line.startsWith('branch ')) {
        branch = line.substring('branch '.length);
        // Convert refs/heads/main -> main
        if (branch.startsWith('refs/heads/')) {
          branch = branch.substring('refs/heads/'.length);
        }
      } else if (line === 'bare') {
        isBare = true;
      }
    }

    if (path) {
      const isMain = i === 0;
      worktrees.push({
        path,
        head,
        branch,
        isBare,
        isMain,
        label: isMain ? MAIN_WORKSPACE_LABEL : (path.split('/').pop() || path),
      });
    }
  }

  return worktrees;
}

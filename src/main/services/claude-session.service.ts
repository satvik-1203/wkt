/**
 * Detects Claude Code sessions and replaces raw commands with "claude code".
 */
export function getClaudeSessionSummary(command: string): string | null {
  const first = command.split(/\s+/)[0];
  if (first !== 'claude') return null;
  return 'claude code';
}

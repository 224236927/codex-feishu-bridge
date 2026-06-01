const CONTROL_COMMANDS = new Set(['new', 'reset', 'status']);

export function parseIncomingText(input = '') {
  const text = String(input).trim();

  if (text.startsWith('/')) {
    const command = text.slice(1).trim().toLowerCase();
    if (CONTROL_COMMANDS.has(command)) {
      return {
        kind: 'command',
        command,
      };
    }
  }

  return {
    kind: 'chat',
    text,
  };
}

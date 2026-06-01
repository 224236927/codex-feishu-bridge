export function parseCodexJsonl(output = '') {
  let threadId = null;
  let replyText = null;

  for (const line of String(output).split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (event.type === 'thread.started' && typeof event.thread_id === 'string') {
      threadId = event.thread_id;
      continue;
    }

    const item = event.item;
    if (
      event.type === 'item.completed' &&
      item &&
      item.type === 'agent_message' &&
      typeof item.text === 'string'
    ) {
      replyText = item.text;
    }
  }

  return {
    threadId,
    replyText,
  };
}

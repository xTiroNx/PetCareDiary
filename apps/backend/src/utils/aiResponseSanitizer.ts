export function sanitizeAiFinalAnswer(content: string, maxLength: number) {
  const withoutThinkBlocks = content.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "");
  const withoutUnclosedThink = withoutThinkBlocks.replace(/<think\b[^>]*>[\s\S]*$/gi, "");
  const withoutOrphanClosingThink = withoutUnclosedThink.replace(/^[\s\S]*?<\/think>/gi, "");
  const withoutOrphanThinkTags = withoutOrphanClosingThink.replace(/<\/?think\b[^>]*>/gi, "");
  const text = withoutOrphanThinkTags.trim().slice(0, maxLength);
  return {
    text,
    reasoningStripped: withoutOrphanThinkTags !== content
  };
}

export function generateChatId(appCode: string, user1: string, user2: string): string {
  const [sortedA, sortedB] = [user1, user2].sort();
  return `chat_${appCode}_${sortedA}-${sortedB}`;
}

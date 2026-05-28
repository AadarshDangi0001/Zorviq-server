export class RagService {
  async retrieveComponents(_prompt: string): Promise<string[]> {
    // Replace with real Pinecone query — see architecture docs
    // Returns array of HTML strings (top-K matching components)
    return [];
  }
 
  buildAugmentedPrompt(userPrompt: string, chunks: string[]): string {
    if (chunks.length === 0) return userPrompt;
    return [
      `Here are ${chunks.length} reference components that match this request.`,
      `Use them as layout/Tailwind inspiration — write original HTML, do not copy directly.\n`,
      ...chunks.map((html, i) => `--- Reference ${i + 1} ---\n${html}`),
      `\n--- User request ---`,
      userPrompt,
    ].join("\n");
  }
}
 
export const ragService = new RagService();
 
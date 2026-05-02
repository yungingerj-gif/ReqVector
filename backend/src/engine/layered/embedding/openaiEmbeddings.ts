/**
 * OpenAI embeddings API (requires OPENAI_API_KEY). Used by semantic pre-filter / clustering.
 */

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
};

const BATCH = 64;

export async function embedTextsOpenAI(
  apiKey: string,
  model: string,
  texts: string[]
): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  const out: number[][] = [];
  for (let off = 0; off < texts.length; off += BATCH) {
    const chunk = texts.slice(off, off + BATCH);
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input: chunk }),
    });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as EmbeddingResponse;
    if (!body.data || body.data.length !== chunk.length) {
      return null;
    }
    for (let i = 0; i < chunk.length; i++) {
      const emb = body.data[i]?.embedding;
      if (!emb || !Array.isArray(emb)) return null;
      out.push(emb);
    }
  }
  return out;
}

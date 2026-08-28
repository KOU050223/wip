export function speechEndpoint(isDevelopment = import.meta.env.DEV): string {
  const baseUrl = isDevelopment ? "" : (import.meta.env.VITE_API_BASE_URL ?? "");
  return `${baseUrl}/ai/speech`;
}

export async function requestSpeech(
  text: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<Blob | null> {
  try {
    const response = await fetchImplementation(speechEndpoint(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return response.ok ? response.blob() : null;
  } catch {
    return null;
  }
}

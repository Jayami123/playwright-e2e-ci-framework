export async function getStatus(url: string, timeoutMs: number): Promise<number | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });
    return response.status;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

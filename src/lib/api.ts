export interface ParsedApiResponse<T> {
  data: T | null;
  isJson: boolean;
  rawText: string;
}

export async function parseApiResponse<T>(res: Response): Promise<ParsedApiResponse<T>> {
  const rawText = await res.text();
  if (!rawText) {
    return { data: null, isJson: false, rawText: '' };
  }
  try {
    const parsed = JSON.parse(rawText) as T;
    return { data: parsed, isJson: true, rawText };
  } catch {
    return { data: null, isJson: false, rawText };
  }
}

export function buildUnexpectedApiResponseError(res: Response, fallback: string): string {
  if (res.status === 404 || res.status === 200) {
    return `Backend API endpoint returned an HTML page instead of JSON (HTTP ${res.status}). Ensure the backend server or Netlify Functions for /api/* are active.`;
  }
  return `${fallback} (HTTP ${res.status}).`;
}

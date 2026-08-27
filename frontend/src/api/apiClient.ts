export class ApiError<TError = unknown> extends Error {
  readonly status: number;
  readonly data?: TError;

  constructor(message: string, status: number, data?: TError) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export type ErrorType<TError> = ApiError<TError>;

export function createApiClient(fetchImplementation: typeof fetch) {
  return async function apiClient<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetchImplementation(url, options);
    const body = [204, 205, 304].includes(response.status) ? null : await response.text();
    const data = body ? (JSON.parse(body) as unknown) : undefined;

    if (!response.ok) {
      const message =
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof data.error === "string"
          ? data.error
          : `Request failed with status ${response.status}`;
      throw new ApiError(message, response.status, data);
    }

    return data as T;
  };
}

export const apiClient = createApiClient(fetch);

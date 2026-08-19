import { HttpClient } from '@actions/http-client'

export const USER_AGENT = 'Flagsmith/setup-cli'

/**
 * Perform a GET request, or a POST when `postJson` is given, and return the
 * response body. A non-200 status throws an error with the caller's message
 * for that status, plus a short snippet of the response body to aid debugging.
 */
export async function fetchOrThrow(
  url: string,
  errorFor: (status: number) => string,
  postJson?: string,
  http: HttpClient = new HttpClient(USER_AGENT),
): Promise<string> {
  const response =
    postJson === undefined
      ? await http.get(url)
      : await http.post(url, postJson, {
          'content-type': 'application/json',
          accept: 'application/json',
        })
  const body = await response.readBody()
  const status = response.message.statusCode ?? 0
  if (status !== 200) {
    const snippet = body.replace(/\s+/g, ' ').trim().slice(0, 500)
    throw new Error(
      errorFor(status) + (snippet ? `\nResponse body: ${snippet}` : ''),
    )
  }
  return body
}

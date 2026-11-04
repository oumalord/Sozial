export type R = Record<string, any>;

async function call(url: string, method: string, body?: any): Promise<any> {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err: any = new Error(data.error || 'Something went wrong');
    err.data = data;
    throw err;
  }
  return data;
}

export const get = (url: string): Promise<any> => call(url, 'GET');
export const post = (url: string, body?: any): Promise<any> => call(url, 'POST', body ?? {});
export const put = (url: string, body?: any): Promise<any> => call(url, 'PUT', body ?? {});
export const del = (url: string): Promise<any> => call(url, 'DELETE');

import app from '../server.js';

export default function handler(req: any, res: any) {
  const path = typeof req.query?.path === 'string'
    ? req.query.path
    : Array.isArray(req.query?.path)
      ? req.query.path.join('/')
      : '';

  const originalQuery = req.url?.includes('?')
    ? req.url.slice(req.url.indexOf('?') + 1)
        .split('&')
        .filter((part: string) => !part.startsWith('path='))
        .join('&')
    : '';

  req.url = `/api/${path}${originalQuery ? `?${originalQuery}` : ''}`;
  return app(req, res);
}

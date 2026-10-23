import { examVerificationRouter } from '../server/routes/examVerification';

/** Invoke the real Express handler in memory: no listening port, credentials or Cloud IO. */
export async function invokeVerification(body: any) {
  const handler = (examVerificationRouter as any).stack.find((layer: any) => layer.route?.path === '/pass').route.stack[0].handle;
  let status = 200, value: any;
  await handler({ body }, { status(code: number) { status = code; return this; }, json(data: any) { value = data; return this; } });
  return { status, value };
}

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';

const blocked = () => { throw new Error('NETWORK_DISABLED: offline tests cannot open external connections'); };
http.request = http.get = https.request = https.get = blocked;
net.connect = net.createConnection = tls.connect = blocked;
syncBuiltinESMExports();
globalThis.fetch = async (...args) => {
  if (typeof globalThis.__examOfflineFetch === 'function') return globalThis.__examOfflineFetch(...args);
  return blocked();
};

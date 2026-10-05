import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { socraticRouter } from './server/routes/socratic.js';
import { gradingRouter } from './server/routes/grading.js';
import { remedialRouter } from './server/routes/remedial.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const HOST = '0.0.0.0';

// Hỗ trợ JSON body cho các request ngữ cảnh Socratic & bài làm học sinh (ảnh base64)
app.use(express.json({ limit: '50mb' }));

// Health check endpoint
app.get(['/api/health', '/health', '/api/v1/health'], (_req: Request, res: Response) => {
  return res.status(200).json({
    status: 'ok',
    service: 'TOAN-THCS-BACKEND',
    timestamp: new Date().toISOString(),
  });
});

// AI Studio preview iframe upload fallback handler
app.all(['/_/upload*', '/upload*'], (_req: Request, res: Response) => {
  return res.status(200).json({ success: true, message: 'Upload endpoint ready' });
});

// Mount Routes (Standard & v1 prefixes)
app.use(['/api/tutor/socratic', '/api/v1/tutor/socratic'], socraticRouter);
app.use(['/api/grading', '/api/v1/grading'], gradingRouter);
app.use(['/api/remedial', '/api/v1/remedial'], remedialRouter);

// Aliases tương thích tiện lợi với quy chuẩn Matsuda
app.use(['/api/tutor/verify-scratchpad', '/api/v1/tutor/verify-scratchpad'], (req, res, next) => {
  req.url = '/verify-correction';
  gradingRouter(req, res, next);
});
app.use(['/api/remedial/reroll', '/api/v1/remedial/reroll'], (req, res, next) => {
  req.url = '/generate';
  remedialRouter(req, res, next);
});

// Khởi chạy Vite middlewares trong môi trường Development, hoặc serve dist trong Production
const isProd = process.env.NODE_ENV === 'production';

if (!isProd) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  const distDir = path.resolve(__dirname, 'dist');
  app.use(express.static(distDir));
  app.get('*', (req: Request, res: Response, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    res.sendFile(path.resolve(distDir, 'index.html'));
  });
}

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error('[Server Unhandled Error]:', err);
  if (res.headersSent) return;
  return res.status(500).json({
    success: false,
    message: err?.message || 'Lỗi xử lý nội bộ máy chủ.',
  });
});

if (process.env.VERCEL !== '1') {
  app.listen(PORT, HOST, () => {
    console.log(`[TOÁN THCS] Server running at http://${HOST}:${PORT}`);
  });
}

export default app;

import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// 纯静态输出（output: 'static' 默认）：构建产物 frontend/dist 由 Cloudflare Worker 的
// assets binding 直接伺服，运行时零框架 JS（Astro 不引入任何岛屿/水合）。
export default defineConfig({
  vite: { plugins: [tailwindcss()] },
});

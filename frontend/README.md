# 每日接龙 · 社区共创小说前端

Astro（纯静态 SSG）+ Tailwind CSS v4 + DaisyUI v5。构建产物 `dist/` 由 Cloudflare Worker 的
assets binding 直接伺服；运行时是零框架水合的原生 JS（`src/scripts/app.ts`），与 `/api/*` 契约不变。

```bash
npm install
npm run dev    # 本地开发（astro dev，API 请另开 wrangler dev）
npm run build  # 构建到 dist/（产物入库，保证任意部署命令都能发布最新前端）
```

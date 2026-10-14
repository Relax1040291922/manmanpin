# 缓存与 GitHub Pages

没有打包器。浏览器会把 `css/`、`js/` 按 URL 缓存；HTML 有时也会被中间层留一会。

## 规则

1. 每个 CSS/JS 入口带 `?v=数字`，写在 `index.html`。
2. **改过的文件才 +1**，没改的不要跟着涨，避免无意义刷新。
3. 发版当天把 `index.html` 里的版本号和实际改动对齐再推 `main`。
4. 贴图 / 音效文件名不变时，内容替换可能被强缓存；必要时改文件名或在失败重试时加 `?r=时间戳`（仅失败路径，不作为常驻策略）。
5. 回滚 = 回上一份静态文件；不要靠清 `localStorage`。

## 本轮收口（第 5 批）

| 文件 | `?v=` |
|---|---|
| `css/app.css` | 29 |
| `js/store.js` | 19 |
| `js/economy.js` | 20 |
| `js/sfx.js` | 23 |
| `js/puzzle.js` | 24 |
| `js/catalog.js` | 23 |
| `js/app.js` | 26 |

预览：用户强刷；iOS Safari 可关标签再开。地址仍是仓库 Pages 的 `main`。

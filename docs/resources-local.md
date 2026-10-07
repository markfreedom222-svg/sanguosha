# 本机图片和声音

运行 `pnpm resources:install` 下载资源，再运行 `pnpm dev`。打开 `/resource-check.html` 查看图片、试听音效和检查音频解码。此页面检查服务器已安装资源；游戏中仍以资源包管理的启用状态为准。

资源来自 https://github.com/Mogara/QSanguosha ，固定提交 `85baa7489157c023bb2528a40ce4ef4e12863387`。下载器核验 Git blob SHA-1，已存在且校验通过的文件不重复下载；所有下载完成后才发布 manifest。资源文件保持原始 PNG/JPG/OGG 格式，本地不需要 FFmpeg。

上游素材为 CC BY-NC-ND 4.0，仅非商业使用，需署名，不得分发修改版素材。资源包中保留上游授权全文、README 和 ATTRIBUTION.md。素材不属于本项目 MIT 许可；资源仍由 `.gitignore` 排除。

补充武将图片和死亡语音来自 https://github.com/Mogara/QSanguosha-v2 ，固定提交 `e8768851bd8054db9fd1b63cd6f1feca813590d7`。该仓库 LICENSE 声明 GPLv3 加 MCFR（禁止商业用途）；资源包保留这两份文件及上游 README，补充资源文件保持原样。两处来源的授权分别记录在 ATTRIBUTION.md。

卡牌按名称共享原始插图，界面单独显示实际花色、点数；火杀和雷杀加载对应插图。部分界武将共用同名标准武将原图，不代表已获得界限突破专属皮肤。未匹配武将保留默认界面，清单见 `public/packs/base/coverage.json`。操作音效部分复用上游 UI 短音，不是逐项独立制作的音效。

基础资源包默认启用；已有浏览器若手动禁用了 base，请到游戏资源包管理中勾选。音频需浏览器首次点击解锁，静音时不会播放。

## 无名杀动作声音和背景音乐

参照 https://github.com/RainEggplant/noname 的固定提交 `f9e2ca727159855677f44ac2230491e83c2508c6`，接入 16 个原始动作 MP3 和 `audio/background/music_default.mp3`。素材文件保持原样，上游 GPLv3 全文和 README 位于资源包 `upstream/noname/`，来源说明见 `NONAME-ATTRIBUTION.md`；没有复制上游程序代码。

回合及阶段切换静音，摸牌、弃牌、判定和装备使用对应动作声音。客户端音效默认降低操作声，牌名及死亡语音不变调；同一文件在 120ms 内重复播放会被抑制，超过 500ms 才下载完的动作音不追补。串行播放间隔按真实音频时长换算为毫秒。资源缓存按 URL 复用，换资源包后生效。

首页及游戏顶部“声音”按钮展开两个独立控制：背景音乐、游戏音效。音乐滑块默认 50%，播放端统一乘以 0.4（默认实际播放音量 20%），首次点击后开始循环，使用流式播放，静音时暂停，关闭页面停止。两种音量及静音设置分别存储在 `sgs:sound`，兼容以前只存音效设置的格式；多个面板和标签页同步。已有用户音效音量保持原值。

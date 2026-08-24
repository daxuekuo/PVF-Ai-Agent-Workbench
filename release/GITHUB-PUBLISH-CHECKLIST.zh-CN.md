# GitHub 发布清单

本清单只用于维护者发布。提交、推送、打 tag、创建 Release 和修改 `VERSION` 都需要单独明确授权。

## 发布前

1. 确认 `VERSION` 和更新日志符合本次发布计划，没有把未完成能力写成已发布。
2. 运行 `workbench.bat release all`，只接受 Gate1、Gate2、Gate3 全部通过的源码树。
3. 如果修改过 `AGENTS.md`、随包 Skill、安全路由或 Agent 行为，在全新发布 stage 中再完成一次真实外部 Agent 黑盒；内置 eval 不能代替。
4. 检查 `git status --short`，确认没有真实 PVF、客户端、NPK/IMG、密钥、本机 profile、数据库、缓存、压缩包或运行报告。
5. 确认 `runtime/node/node.exe` 是普通 Git blob，不是 Git LFS pointer。它会触发 GitHub 50 MiB 警告，但必须保留在 Source code zip 中才能开箱即用。

发布门禁报告、黑盒报告、真实 PVF、客户端和本机状态全部留在 Workbench 外。

## 远端复查

1. 推送后从目标 tag 下载 GitHub 自动生成的 Source code zip。
2. 在解压后的独立目录重新运行 `check`、受控写入自检、客户端部署自检、备用后端自检和 Gate3。
3. 结果通过后，再按仓库 `VERSION` 创建对应的 `v<VERSION>` Release。

## 发布措辞边界

- 可以声明支持 64 位 Windows，随包携带 Node.js，普通任务不依赖 npm、外部 MCP 或已下架插件。
- native 无法加载时只能声明“只读查询仍可用”；不能声明 PVF 写入可用。工作台不会自动下载或安装 Microsoft DLL。
- 可以声明完整中文等文字、同文件联动、准确计数和受控范围修改；不能宣传成任意中文、`.str`、StringLink 或高风险文件都能写。
- 可以声明同一 PVF 内普通文本文件复制、路径受限的 titlebook 邮件文字，以及既有 NUT 的 ASCII 专用路线；必须同时说明各自的路径、证明和实机验证边界。
- 可以声明已复查的独立 PVF 可在单独预览和确认后部署到测试客户端并恢复；不能把权限扩大到 NPK、IMG、UI 或其他客户端资源，也不能把部署成功宣传为实机通过。
- 在 native Rust 源码和锁文件恢复前，不能声明该预编译后端可由本仓库完整复现。

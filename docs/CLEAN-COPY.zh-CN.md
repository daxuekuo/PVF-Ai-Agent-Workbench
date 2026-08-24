# 干净复制到新电脑

Workbench 可以直接复制到另一台 64 位 Windows 电脑。干净包只包含规则、工具、知识、示例和固定 runtime。

## 不要复制

- `config/providers.local.json`、`config/*.secret.json` 和旧版 `config/workspace-profiles.local.json`；
- 真实 `.pvf`、`.bak`、`.npk`、`.img` 和客户端；
- 本机 profile、索引缓存、运行报告、研究材料、外部清单和查询结果；
- 密钥、账号信息、数据库、压缩包或发布门禁产物。

这些内容应保存在 Workbench 外。环境检查会拒绝发布包内常见的本机产物，但不能代替发布前人工确认。

## 新电脑启动

1. 解压或复制完整目录，运行 `workbench.bat check`。
2. 让 Agent 先加载 `dnf-pvf-xpilot` Skill 并读取 `AGENTS.md`。
3. 需要固定 PVF、客户端或输出目录时，在新电脑重新创建本机 profile；不要复制旧电脑的用户状态目录。
4. 支持用户级 Skill 的宿主可从新目录重新运行 Skill 安装命令。

随包 Node.js 不需要 npm 或构建。native 后端因缺少兼容 VC++ 运行库而无法加载时，会自动进入只读模式：查询仍可用，所有 PVF 写入都会停止。详见 [READONLY-FALLBACK.zh-CN.md](READONLY-FALLBACK.zh-CN.md)。

## 发布前确认

- `workbench.bat check` 无错误、无警告；
- `workbench.bat release gate3` 在独立 stage 中通过；
- 维护发布时再运行完整 `workbench.bat release all`，并检查 Git 状态中没有真实 PVF、客户端、本机配置或运行产物。

详细发布步骤见 [../release/GITHUB-PUBLISH-CHECKLIST.zh-CN.md](../release/GITHUB-PUBLISH-CHECKLIST.zh-CN.md)。

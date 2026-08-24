# PVF 只读备用后端

Workbench 优先使用随包 native 后端。native 无法加载时，会自动切换到由固定 Node.js 直接执行的 TypeScript 只读后端，不需要 npm、网络、构建或外部插件。

即使 native 正常，中文搜索、`.str`、StringLink 和含非 ASCII 的脚本读取也可能使用备用后端的语义结果。普通用户不需要手工选择后端。

## 可以做什么

- 打开、列出、读取和搜索 PVF 文件；
- 解析常见脚本、LST、StringLink、NUT 和已支持的 ANI；
- 执行登记解析、索引、只读规划和不需要临时写出的普通预演。

## 不能做什么

- 保存、替换、删除、导入、导出或生成 PVF；
- 为写入创建备份；
- 完成必须真实写出临时 PVF 才能验证的中文等文字预演。

这些入口会以 `READ_ONLY_FALLBACK` 停止，不会因为用户确认而放宽。需要生成 PVF 时，应按 `workbench.bat check` 的提示修复 native 运行环境。

## 已知限制

- 不自动转换简繁体；
- 大型 PVF 的全文搜索可能比 native 慢；
- 未识别的二进制 ANI 保留为二进制，不猜测文本；
- 搜索、会话、缓存和单次读取都有资源上限，损坏文件不会被伪装成普通未命中。

维护时使用 `workbench.bat fallback-self-test` 检查合成读取、stdio 接入和写入阻断。完整中文写入与编码规则由 [../knowledge-pack/safety/README.zh-CN.md](../knowledge-pack/safety/README.zh-CN.md) 统一维护。

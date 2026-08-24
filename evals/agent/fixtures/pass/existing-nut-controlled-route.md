可以继续，但不能把既有 NUT 当成普通低风险参数文件直接生成。它必须走 `existing-nut-controlled-edit` 专用受控路线，并读取 `pvf-existing-nut-controlled-change` 任务卡；改动只包含数字、英文和常见符号，中文等文字仍继续阻断。

开始时用一次 `read-batch --raw` 读取目标 NUT、`load_state`、passive 入口和 API 证据脚本，绑定完整原文 SHA256（`sourceTextSha256`），并证明 `load_state -> passive -> appendage` 已有加载链。每个 API 还要先经 `knowledge-query nut` 核对内置声明，再用目标 `pvf-read search-script` 和原始读回确认目标 PVF 的既有调用证据。注释、字符串不算加载、API 或 APID 证据；APID 必须作为已声明 DNF API 调用的独立整数参数，不能只藏在 `APID_9901` 之类标识符或无关数字中。

如果原 NUT 的旧注释在 Cn/Tw 下含不可还原字节，不应要求用户先清洗或换源。专用路线只把已定位原文映射到唯一的原始 ASCII 字节区间，不重编码整份文件，并证明区间外每个原始字节保持不变；若替换触及中文、位置不唯一或非目标字节漂移则继续停止。

同一 NUT 的全部变化放在一个 change-set，并复制完全一致的证明。先运行 `pvf-change validate`，只按返回的 `agentHandoff.nextCommandOnly` 进入预演（检查方案；中文改动会用临时文件验证并立即清理）。预演会写出临时独立 PVF、独立读回并立即清理；通过且另行授权后，才生成独立的修改版 PVF，建立内容寻址备份，生成后重新检查最终独立读回和源 PVF 未变化。

静态检查通过不等于实机行为正确，仍要验证异常状态、持续时间、刷新/叠加和普通受击边界。普通 NUT 以及既有 `.co`、`.sqr`、`.str` 仍继续保护；这条路线也不会允许覆盖源 PVF。

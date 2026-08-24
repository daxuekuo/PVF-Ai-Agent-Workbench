# 既有 NUT 专用受控修改任务卡

状态：默认可用

## 适用范围

本卡只用于目标 PVF 中已经存在、位于 `sqr/` 下、且已由 `load_state -> passive_skill -> appendage` 链实际加载的 `.nut`。它解决的是少量运行时逻辑需要修改、普通高风险保护又不应整体解除的场景。

默认保护没有取消：没有专用证明的既有 `.nut` 仍停止；既有 `.co/.sqr/.str` 仍停止；中文等文字、StringLink 显示文本、客户端资源和覆盖源 PVF 不在本路线权限内。

## 开始前

1. 对目标 NUT、load_state、passive 入口和每个 API 目标证据脚本做一次 `pvf-read read-batch --raw`。返回的 `textUsage.rawTextBindings[].sourceTextSha256` 可直接填写目标 NUT 的原文哈希；若 `complete=false`，先扩大读取上限，不能使用截断文本。
2. 每个 API/常量先用一次 `knowledge-query nut --name <symbol> --group dnf --exact`，再用一次目标 `pvf-read search-script --keyword <symbol>`；只把实际读回并含精确符号的目标脚本写进 `targetEvidencePaths`。
3. 改动内容必须只包含数字、英文和常见符号，以及 Tab/CR/LF。中文等文字继续走各自安全路线，不能混进 NUT 证明。

目标 NUT 即使含有在 Cn/Tw 下显示为 Unicode 替代字符（U+FFFD）的既有旧注释字节，也不需要先重写或清洗整份文件。工作台会把完整原文与原始字节绑定，只替换已经精确定位的 ASCII 字节区间；指定区间外的原始字节必须逐段完全一致。替换原文或新内容触及中文等文字、字节位置不唯一或任一保留区间不一致时仍会停止。

## writeProof

同一 `.nut` 的每条 `replace-text` 必须复制完全相同的证明：

```json
"writeProof": {
  "mode": "existing-nut-controlled-edit",
  "sourceTextSha256": "从完整 --raw 读回取得的 64 位 SHA256",
  "structureCheckRequired": true,
  "temporaryRoundTripRequired": true,
  "runtimeValidationRequired": true,
  "loadChain": [
    {
      "fromPvfPath": "sqr/character/job_load_state.nut",
      "toPvfPath": "sqr/character/job/passive_skill_job.nut",
      "requiredText": "从 load_state 原始读回复制、且把下一路径作为函数调用参数的完整 ASCII 片段"
    },
    {
      "fromPvfPath": "sqr/character/job/passive_skill_job.nut",
      "toPvfPath": "sqr/character/job/appendage/ap_job_fixture.nut",
      "requiredText": "从 passive 原始读回复制、且把目标 appendage 路径作为函数调用参数的完整 ASCII 片段"
    }
  ],
  "touchedFunctions": ["实际新增或修改的函数名"],
  "apiSymbols": [
    {
      "name": "sq_ExampleApi",
      "kind": "function",
      "targetEvidencePaths": ["sqr/目标版本内实际含该符号的样本.nut"]
    }
  ],
  "apidPlan": {
    "namespace": "稳定的任务用途名",
    "ids": [9901],
    "conflictSearchRequired": true
  }
}
```

本轮不新增 APID 时明确写 `"ids": []`。新增 APID 时，工作台会搜索目标 PVF 的整个 `sqr/`，任何精确数字冲突、搜索截断/错误或同一原子 change-set 内重复声明都会停止。

## 工作台会检查

- `sourceTextSha256` 与目标 NUT 的完整原始文本一致。
- load chain 连续、从 `*_load_state.nut` 开始、包含 `passive_skill_*.nut`，并以目标 NUT 结束；每段精确引用都存在于目标 PVF 的执行代码中，目标路径必须是函数调用参数。注释、与调用无关的孤立字符串或“先写无关可执行代码、再把路径藏到行尾注释”的片段都不算加载证据。
- 最终脚本的引号、注释、括号和函数体闭合；既有函数不能删除，未声明函数不能改动，非函数顶层代码不能改变。
- 每个 `apiSymbols` 都有大小写精确的内置 DNF 声明、目标 PVF 既有执行代码证据，并在最终目标脚本中实际使用；函数名只作为变量、函数定义、注释或字符串出现都不算调用。
- 每个 APID 在目标源脚本中无冲突、在最终脚本中作为已声明 DNF API 调用的独立整数参数实际出现，并在同一原子 change-set 内唯一；注释、字符串、`APID_9901` 之类标识符片段或与 API 无关的闲置数字不算 APID 使用或冲突。
- 不重新编码整份 NUT；每项替换都把已定位文字位置映射到唯一原始 ASCII 字节区间，并核对所有非目标字节的逐段 SHA256。源文件中已经存在的不可还原 Cn/Tw 旧字节会原样保留。
- 预演期间生成临时独立 PVF，重新打开后由 TypeScript 解析器独立读回，既核对完整最终 token，也核对目标 NUT 原始字节 SHA256；临时文件立即清理，源 PVF SHA256 不变。
- 正式生成重新执行以上静态审计，并绑定预演核验记录、确认码、内容寻址源备份、独立输出和最终文本/原始字节读回。

## 固定流程

1. 使用 `workspaces/examples/change-set.existing-nut-controlled.example.json` 作为字段形状参考；替换其中全部占位内容，不照抄路径、哈希、函数或 APID。
2. 运行 `pvf-change validate --file ...`，随后只执行返回的 `agentHandoff.nextCommandOnly`。
3. 预演（检查方案；中文改动会用临时文件验证并立即清理）。本路线本身不允许中文，但仍沿用同一安全表述和核验记录。
4. 预演无阻断且用户明确授权后，生成独立的修改版 PVF；不得覆盖源 PVF。
5. 生成后重新检查目标 NUT、源 PVF SHA256、受保护备份和输出 SHA256。
6. 必须做实机异常状态、持续时间、刷新/叠加、普通受击与边界回归。静态检查通过不等于行为正确，核验记录会持续标明 `runtimeValidationRequired=true`。

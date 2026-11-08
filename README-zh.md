# dsh-response-letter

**每一条审稿意见都有回复——而且可以按编号核实。**

*解析审稿意见（Reviewer/Referee/审稿人 标题行，编号模式或段落模式），按回复编号检查逐条回复信（缺失、过短、多余、重复），并导出带覆盖表的 Markdown 回复信。*

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24.9-brightgreen.svg)]()

[English](README.md) · 简体中文

---

## 它做什么

- **`letter_parse`** — 识别 `Reviewer 1`、`Referee #2`、`审稿人 2`、`R1` 标题行以及编号标记（`1.`、`2)`、`Comment 3:`、`Q4:`），为每条意见分配一个**全局编号**（也就是回复必须引用的编号）、一个审稿人标签和一个字符位置。没有编号时回退到按段落解析，并给出明确警告。
- **`letter_check`** — 把回复编号与意见编号对应起来，并报告：缺失的编号、少于 20 个字符的回复、重复的回复编号，以及引用了不存在意见编号的回复。
- **`letter_export`** — 输出一张 Markdown 表格（#、审稿人、意见、回复），未回答的条目加粗，并附覆盖表。Markdown 就是交付物；不发送邮件，也不上传任何内容。

## 它不做什么

- **不做充分性判断。** 覆盖统计只计入带编号的回复，不判断回复是否有说服力、是否礼貌、是否有证据支撑。
- **不改动审稿意见文本。** 意见原样转载，回复由作者撰写。
- **不处理 DOCX/PDF。** 请先转换为 `.md`/`.txt`（PDF 文本可用 `dsh-doc-anchor`）。
- **不负责投稿。** 不会接触期刊系统。
- **不生成 AI 反驳信。** 插件只做解析和检查，措辞始终由作者自己写。

## 编号规则

意见按文档顺序在所有审稿人之间统一编号为 1..N（不是每位审稿人各自编号），回复信必须引用同一套全局编号。如果回复信使用自己的按审稿人编号，编号就对不上，检查会直接指出这一点，而不是猜测。

## 工具

### `letter_parse`

`{ text? | path?, persist? }` → `{ ok, parse: {comments, reviewers, mode, warnings}, evidenceId?, recordPath? }`.

### `letter_check`

`{ comments? | reviewText? | reviewPath?, letterText? | letterPath? }` → `{ ok, coverage, comments, responses, warnings }`.

### `letter_export`

`{ comments, responses? | letterText?, title? }` → `{ ok, markdown, coverage }`.

### 错误码

`INVALID_INPUT` · `NOT_FOUND` · `PATH_ESCAPE` · `NOT_A_FILE` · `TOO_LARGE` · `UNSUPPORTED_FILE` · `STORE_ERROR`

## 兼容性与安装

| | |
|---|---|
| DeepSeek Harness | **`dsh-v0.2.1-rc.5`**（2026-11-08 实测）；peer `>=0.2.1-0 <0.3.0 \|\| >=0.2.2-0 <0.3.0` |
| Node | `^22.19.0 \|\| >=24.9.0`（实测 `24.22.1`），仅 ESM |
| Peer 依赖 | `@perrylink/dsh-research-core ^0.1.0`、`@deepseek-ai/cordis ^4.0.5-alpha.1`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/schemastery ^3.18.5-alpha.1` |
| 运行时依赖 | **零** |

```sh
dsh plugin --profile <name> add @perrylink/dsh-research-core dsh-response-letter
dsh --profile <name> --dump-config | grep dsh-response-letter
```

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `enabled` | `true` | `false` 时不挂载任何内容 |
| `root` | `.response-letter` | 存储/记录根目录 |
| `workspaceRoot` | `process.cwd()` | 路径必须解析到该目录内 |
| `maxChars` | `1000000` | 字符上限（超限即失败，绝不截断） |
| `persist` | `true` | 把解析后的审稿意见存为 REP 证据 + 记录 |

## 安全边界

- 对审稿意见和回复信文件只读；只在 `root` 下写入。
- 用 `realpath` 做包含性校验，拒绝符号链接逃逸。
- 超出字符上限时明确失败；DOCX/PDF 会被拒绝并给出转换提示。
- 审稿意见一律视为数据；其中的任何指令性文本都不会被执行（插件没有执行器）。

## 评测

**21 个测试**：带审稿人标题（含 `R1`）和 CRLF 文本的编号解析、段落回退及警告、空文本拒绝、回复提取、完整/部分覆盖（缺失、过短、多余）、重复编号与重复导出的一致性、运行时（有效的 REP 记录、文件和文本路径、路径穿越/符号链接/DOCX/超大文件拒绝、畸形 JSON 载荷）、工具（schema、parse→check→export 端到端、失败分支）、插件契约、包契约。

不宣称任何基准成绩：这里的正确性指的是解析器在明确格式上的行为，由 fixture 校验；并不存在真实回复信的人工标注语料。

## 已知限制（v0.1）

- 解析器要求每条编号行/块对应一条意见；跨多个无编号段落的意见会被拆开。
- 不会自动重映射按审稿人各自的编号；检查会报告不匹配。
- 回复质量（语气、证据）不在范围内。
- 仅支持英文/中文标记；其他语言需要新增模式。

## 许可

Apache-2.0。运行时零第三方代码。

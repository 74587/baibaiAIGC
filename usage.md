# 使用说明

本目录是一套根目录直放式 skill，核心文件如下：

- `SKILL.md`：总控规则，负责定义触发条件、三轮顺序执行和最终输出要求。
- `prompts/baibaiAIGC1.md`：第 1 轮改写提示词。
- `prompts/baibaiAIGC2.md`：第 2 轮改写提示词。
- `prompts/baibaiAIGC3.md`：第 3 轮改写提示词。
- `checklist.md`：最终检查与评分规则。

## 执行顺序

必须严格按以下顺序执行：

1. `prompts/baibaiAIGC1.md`
2. `prompts/baibaiAIGC2.md`
3. `prompts/baibaiAIGC3.md`
4. `checklist.md`

上一轮输出必须作为下一轮输入，禁止合并三轮一次性处理。

## 推荐调用示例

### 示例 1：直接处理文本

```text
请使用当前目录下的降 AIGC skill，按 prompts/baibaiAIGC1.md、prompts/baibaiAIGC2.md、prompts/baibaiAIGC3.md 的顺序对下面这段论文文本做三轮改写，最后按 checklist.md 检查并评分。默认只展示终稿、简要修改总结和评分。
```

### 示例 2：只输出终稿

```text
请使用当前 skill 对下面文本按 1 -> 2 -> 3 三轮顺序降 AIGC，只输出终稿，不展示中间过程，不新增事实。
```

### 示例 3：要求展示中间轮次

```text
请使用当前 skill，对下面文本按 prompts/baibaiAIGC1.md、prompts/baibaiAIGC2.md、prompts/baibaiAIGC3.md 顺序改写，并展示第 1 轮结果、第 2 轮结果、第 3 轮终稿，最后根据 checklist.md 评分。
```

## 使用约束

- 不新增数据、文献、案例、结论。
- 不破坏原文术语、编号和段落结构。
- 如果原文已经较自然，应最小化修改。
- 默认保持论文语体，不改成营销文案或过度口语化表达。

# DOCX 原格式回写设计

## 目标

让 `.docx` 输入在 Web 模式和 Skill 模式下完成降 AIGC 后，都能生成保留原文档结构和格式的新 Word 文件，同时保持现有 TXT 分块、模型调用、断点续跑、历史记录和局部处理能力不变。

## 当前根因

当前 Word 流程分为两步：

1. `scripts/skill_round_helper.py` 通过 `scripts/docx_pipeline.py:read_docx_text()` 将 Word 正文提取为纯文本。
2. 降 AIGC 结束后，`scripts/app_service.py:export_round_output()` 使用 `Document()` 新建文档，再把输出文本逐段写入。

第一步没有保存 Word 格式信息，第二步也没有使用原始文档作为模板，因此导出结果只能保留文本和段落顺序，无法保留原格式。

## 方案

新增公共的 DOCX 模板回写能力。模型处理阶段仍只接收纯文本；回写阶段使用原始 `.docx` 作为模板，只修改主文档正文中已参与降 AIGC 的文本节点。

公共接口职责：

```text
render_docx_from_template(
    template_path,
    output_text_path,
    output_docx_path,
    manifest_path
) -> output_docx_path
```

实现约束：

- 使用 `zipfile` 读取和写入 DOCX 包。
- 使用命名空间感知的 XML 解析器处理 `word/document.xml`。
- 按现有提取规则定位主文档正文中的非空段落。
- 根据 manifest 的段落顺序匹配降 AIGC 输出。
- 只修改对应段落中的 `w:t` 文本节点。
- 保留原始段落属性、run 属性、编号、页面设置、表格、图片、页眉页脚和其他 DOCX 包部件。
- 不能使用 `paragraph.text = ...` 作为整段替换方式，因为它会破坏段落内的 run 结构和字符级格式。
- 回写前校验模板段落数、manifest 段落数和输出段落数；不一致时失败且不生成结果文件。

原始输入为 `.txt` 时，继续使用当前新建 DOCX 的兼容逻辑，因为 TXT 没有可继承的 Word 模板。

## 公共数据流

### Web 模式

```text
原始 docx
  -> 提取中间 txt
  -> 现有 run_round 分块处理
  -> 生成 roundN.txt 和 manifest
  -> 公共回写层生成 roundN.docx
  -> Web 导出 roundN.docx
```

`run_round_for_app()` 在文本 round 成功后，为 DOCX 输入调用公共回写层。`RoundResult` 和历史记录增加可选的 `docx_output_path`，使当前结果和历史版本都能直接导出已经生成的 Word 文件。旧记录没有该字段时，根据原始模板延迟生成。

Web 的导出接口保留现有 TXT 行为；DOCX 导出优先复制对应的 `docx_output_path`。为兼容旧记录，导出接口接受可选原始 `sourcePath`，在格式化结果不存在时使用该模板重新生成。

### Skill 模式

```text
输入 docx
  -> ensure_skill_input_text() 提取中间 txt
  -> 现有 run_skill_round 分块处理
  -> 生成 roundN.txt 和 manifest
  -> 公共回写层生成 roundN.docx
  -> 输出并记录 txt、docx 两个结果路径
```

`RoundContext` 增加 DOCX 模板和 DOCX 输出路径信息。`run_skill_round()` 在 `run_round()` 成功后调用同一公共回写层，并将 `docx_output_path` 返回给 Skill。Skill 规则更新为：DOCX 输入在每轮完成时同时生成格式保留后的 DOCX；TXT 输入仍只生成文本结果。

## 格式边界

第一版保证：

- 文档包中未修改的 XML 部件原样保留。
- 页面设置、节、段落样式、缩进、行距、对齐方式、列表编号、表格、图片、页眉和页脚保持不变。
- 普通单一字符格式的正文段落保持原有字体、字号、颜色、加粗、斜体等 run 属性。
- 当前项目只处理主文档正文段落；表格、页眉和页脚中的文字不参与降 AIGC，但会保持原样。

限制：

- 改写后的文本与原文本不同，程序无法从语义上判断新文字应继承原段落中的哪一段混合字符格式。
- 对包含多个不同字符格式 run 的段落，保留原 run 结构并按原文本区域尽量分配新文本；无法精确恢复改写后新词对应的语义格式。
- 不在本次范围内新增表格、页眉、页脚和批注文本的降 AIGC。

## 文件变更范围

### 新增或修改的后端文件

- `scripts/docx_pipeline.py`
  - 新增模板回写和段落文本节点替换函数。
  - 保留现有纯文本导入和 TXT 导出函数。
- `scripts/skill_round_helper.py`
  - 为 DOCX round context 保存模板路径和 DOCX 输出路径。
- `scripts/app_service.py`
  - 在 Web round 完成后生成 DOCX。
  - 导出时优先使用格式化 DOCX，兼容旧记录的延迟生成。
- `scripts/aigc_records.py`
  - 为 round/revision 记录增加可选 `docx_output_path`。
- `scripts/web_app.py`
  - 传递可选模板路径或 DOCX 输出路径，并返回明确的导出错误。
- `SKILL.md`
  - 更新 DOCX 输入的输出约定。
- `references/usage.md`
  - 更新 Web 和 Skill 的 DOCX 使用流程。

### 新增或修改的前端文件

- `app/src/types/app.ts`
  - 增加可选 DOCX 输出路径和导出请求字段。
- `app/src/lib/appService.ts`
  - 更新导出服务接口。
- `app/src/lib/desktopService.ts`
  - 传递 DOCX 输出路径或原始模板路径。
- `app/src/lib/webService.ts`
  - 将新增字段传给 Web API。
- `app/src/App.tsx`
  - 当前结果和历史结果导出时传递对应文档模板信息。
- `app/src/components/HistoryCard.tsx`
  - 为历史版本导出保留所属文档的模板路径。

## 错误处理

- 模板不存在、模板不是 `.docx`、XML 解析失败或输出段落数量不一致时，导出失败并返回具体错误。
- 回写使用临时输出文件，成功完成后再替换目标文件，避免生成半成品。
- 文本 round 失败或中断时不生成 DOCX 结果，不改变现有断点状态。
- TXT 输入和已有 TXT 导出路径保持现有行为。
- 旧历史记录缺少 DOCX 输出路径时，仅在用户导出 DOCX 时按原始模板延迟生成。

## 测试设计

新增 `tests/test_docx_pipeline.py`，使用程序生成的最小 DOCX fixture：

1. 模板回写后正文文本等于输出文本。
2. 段落样式、段落属性和普通 run 属性保留。
3. 表格、图片关系、页眉页脚和未参与处理的 XML 部件保留。
4. 段落数量不一致时抛出错误且目标文件不存在。
5. TXT 输入仍可按原逻辑导出普通 DOCX。
6. 多轮结果和局部结果可以基于同一个原始 DOCX 模板回写。

扩展现有服务测试：

- Web round 成功后返回 DOCX 输出路径。
- Skill round 成功后返回 DOCX 输出路径。
- 历史记录中的旧版本可以延迟生成 DOCX。
- DOCX 导出失败时不会返回成功文件。

验证命令：

```powershell
pytest -q
git diff --check
```

## 验收标准

- Web 上传 DOCX，执行任意一轮后，可以导出保留原格式的 DOCX。
- Skill 处理 DOCX 后，`finish/intermediate/` 同时存在本轮 TXT 和 DOCX 结果。
- 第二轮、当前轮修订和下一轮局部处理都基于同一个原始 DOCX 模板生成结果。
- 原始 DOCX 不被修改。
- TXT 文档的现有行为不回归。
- 现有测试和新增 DOCX 测试全部通过。

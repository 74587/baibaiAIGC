# DOCX 原格式回写 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DOCX reduction results available in both Web and Skill modes while preserving the original Word package and formatting.

**Architecture:** Keep the existing text-only chunking and round engine unchanged. Add a shared DOCX template renderer that copies the original DOCX package and edits only main-body text nodes, then call it after a successful text round from both entry points. Store the generated DOCX path alongside the existing text output so Web exports and Skill results use the same artifact.

**Tech Stack:** Python 3, `zipfile`, `xml.etree.ElementTree`, `python-docx`, existing Flask/Web/Tauri services, existing unittest/pytest test runner.

---

### Task 1: Add failing tests for template-based DOCX rendering

**Files:**
- Create: `tests/test_docx_pipeline.py`
- Modify: `scripts/docx_pipeline.py`

- [ ] **Step 1: Add a generated DOCX fixture helper and the first regression test**

Create a temporary DOCX with a custom paragraph style, a bold run, a table, and a header. The test should call the wished-for `render_docx_from_template()` API and assert the rewritten body text plus preserved structure.

```python
def test_render_docx_from_template_replaces_text_and_preserves_document_structure(self) -> None:
    template_path = self.temp_dir / "template.docx"
    output_text_path = self.temp_dir / "result.txt"
    output_docx_path = self.temp_dir / "result.docx"
    self.write_template_docx(template_path)
    output_text_path.write_text("改写后的第一段。\n\n改写后的第二段。", encoding="utf-8")

    render_docx_from_template(
        template_path,
        output_text_path,
        output_docx_path,
    )

    document = Document(str(output_docx_path))
    self.assertEqual(
        [paragraph.text for paragraph in document.paragraphs],
        ["改写后的第一段。", "改写后的第二段。"],
    )
    self.assertEqual(document.paragraphs[0].style.name, "Custom Body")
    self.assertTrue(document.paragraphs[0].runs[0].bold)
    self.assertEqual(len(document.tables), 1)
    self.assertEqual(document.sections[0].header.paragraphs[0].text, "页眉保留")
```

- [ ] **Step 2: Add mismatch and atomic-output tests**

Add tests asserting a paragraph-count mismatch raises `ValueError` and leaves no target file. Add a test that an existing target is not replaced when rendering fails.

```python
def test_render_docx_from_template_rejects_paragraph_count_mismatch(self) -> None:
    template_path = self.temp_dir / "template.docx"
    output_text_path = self.temp_dir / "result.txt"
    output_docx_path = self.temp_dir / "result.docx"
    self.write_template_docx(template_path)
    output_text_path.write_text("只有一段。", encoding="utf-8")

    with self.assertRaisesRegex(ValueError, "paragraph count"):
        render_docx_from_template(template_path, output_text_path, output_docx_path)

    self.assertFalse(output_docx_path.exists())
```

- [ ] **Step 3: Run the new tests and verify the expected RED failure**

Run:

```powershell
pytest -q tests/test_docx_pipeline.py
```

Expected: FAIL because `render_docx_from_template` does not exist yet. The failure must be an import or missing-symbol failure, not a fixture/setup error.

- [ ] **Step 4: Commit the failing tests**

```powershell
git add -- tests/test_docx_pipeline.py
git commit -m "test: cover preserved docx rendering"
```

### Task 2: Implement the shared DOCX template renderer

**Files:**
- Modify: `scripts/docx_pipeline.py`
- Test: `tests/test_docx_pipeline.py`

- [ ] **Step 1: Add namespace helpers and XML paragraph extraction**

Add constants for `w:body`, `w:p`, and `w:t`. Implement helpers that enumerate only direct body paragraphs, extract their text from text nodes, and select non-empty paragraphs in the same order as the existing `read_docx_text()` behavior.

```python
WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W_BODY = f"{{{WORD_NS}}}body"
W_PARAGRAPH = f"{{{WORD_NS}}}p"
W_TEXT = f"{{{WORD_NS}}}t"


def _main_body_paragraphs(root: ET.Element) -> list[ET.Element]:
    body = root.find(f".//{W_BODY}")
    if body is None:
        raise ValueError("DOCX main document body is missing.")
    return [child for child in list(body) if child.tag == W_PARAGRAPH]


def _paragraph_text(paragraph: ET.Element) -> str:
    return "".join(node.text or "" for node in paragraph.iter(W_TEXT))
```

- [ ] **Step 2: Add run-preserving text replacement**

Implement `_replace_paragraph_text()` so it keeps paragraph properties, run properties, drawings, and all non-text XML. For a paragraph with multiple text nodes, distribute the new text across the existing text-node lengths and put any remaining characters in the last text node. Preserve existing `xml:space` handling when leading or trailing whitespace is present.

```python
def _replace_paragraph_text(paragraph: ET.Element, new_text: str) -> None:
    text_nodes = list(paragraph.iter(W_TEXT))
    if not text_nodes:
        raise ValueError("DOCX paragraph has no writable text node.")
    old_lengths = [len(node.text or "") for node in text_nodes]
    old_total = sum(old_lengths)
    remaining = new_text
    for index, node in enumerate(text_nodes):
        if index == len(text_nodes) - 1:
            value = remaining
        elif old_total:
            target_length = round(len(new_text) * old_lengths[index] / old_total)
            value = remaining[:target_length]
            remaining = remaining[target_length:]
        else:
            value = ""
        node.text = value
        if value.startswith((" ", "\t")) or value.endswith((" ", "\t")):
            node.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
```

- [ ] **Step 3: Add atomic ZIP-package rendering**

Implement `render_docx_from_template(template_path, output_text_path, output_docx_path, manifest_path=None)`. It must:

- validate the template and output paths;
- read output paragraphs with `_split_text_into_blocks`;
- parse `word/document.xml`;
- compare non-empty template paragraph count, output paragraph count, and optional manifest paragraph count;
- modify only `word/document.xml`;
- copy every other ZIP entry unchanged;
- write to a temporary file in the destination directory and use `os.replace()` only after successful ZIP completion.

```python
def render_docx_from_template(
    template_path: Path,
    output_text_path: Path,
    output_docx_path: Path,
    manifest_path: Path | None = None,
) -> Path:
    ...
```

- [ ] **Step 4: Run the DOCX tests and verify GREEN**

Run:

```powershell
pytest -q tests/test_docx_pipeline.py
```

Expected: all DOCX renderer tests pass.

- [ ] **Step 5: Run the existing test suite**

Run:

```powershell
pytest -q
```

Expected: all existing and new tests pass.

- [ ] **Step 6: Commit the shared renderer**

```powershell
git add -- scripts/docx_pipeline.py tests/test_docx_pipeline.py
git commit -m "feat: render docx results from original template"
```

### Task 3: Persist DOCX output metadata and create DOCX artifacts for Skill rounds

**Files:**
- Modify: `scripts/aigc_records.py`
- Modify: `scripts/skill_round_helper.py`
- Modify: `SKILL.md`
- Modify: `references/usage.md`
- Test: `tests/test_docx_pipeline.py`

- [ ] **Step 1: Add record fields and normalization coverage**

Add optional `docx_output_path` to `RoundRecord` and `RevisionRecord`. Normalize it as a record path, prune it only when absent, include it in generated-artifact collection for safe deletion, and expose it in mapped history data.

```python
docx_output_path: Optional[str] = None
```

Add a record test that a stored relative DOCX path survives `load_records_normalized()` and round deletion includes that artifact.

- [ ] **Step 2: Add DOCX paths to `RoundContext`**

Add `docx_output_path: Path | None` to `RoundContext`. Compute deterministic paths in `build_round_context()` and `_build_targeted_context()`:

```text
finish/intermediate/<stem>_round1.docx
finish/intermediate/<stem>_round2.docx
finish/intermediate/<stem>_round1_rev1.docx
```

Set the field only when `source_path.suffix.lower() == ".docx"`. Keep TXT contexts unchanged.

- [ ] **Step 3: Materialize DOCX output in `run_skill_round()`**

After `run_round()` returns successfully, call `render_docx_from_template()` when `context.docx_output_path` is present. Update the completed round or revision record with the generated DOCX path and return it as `docx_output_path`. Do not generate the file when `run_round()` raises a paused or stopped error.

```python
if context.docx_output_path is not None:
    render_docx_from_template(
        context.source_path,
        context.output_text_path,
        context.docx_output_path,
        context.manifest_path,
    )
    update_docx_output_path(context.doc_id, context.round_number, context.docx_output_path, context.revision_number)
```

- [ ] **Step 4: Update Skill documentation**

Change the DOCX workflow documentation so each completed DOCX round produces both the intermediate TXT and a format-preserved DOCX. State that TXT input retains the existing plain-document export behavior and that only main-body paragraphs participate in reduction.

- [ ] **Step 5: Add Skill integration tests**

Test `run_skill_round()` with an offline identity transform and a generated DOCX source. Assert that the text output, DOCX output, and record field all exist. Assert that the chunk manifest paragraph count is unchanged.

- [ ] **Step 6: Run Skill-related tests and commit**

Run:

```powershell
pytest -q tests/test_docx_pipeline.py tests/test_aigc_round_service.py
```

Expected: all selected tests pass.

```powershell
git add -- scripts/aigc_records.py scripts/skill_round_helper.py SKILL.md references/usage.md tests/test_docx_pipeline.py
git commit -m "feat: generate preserved docx outputs for skill rounds"
```

### Task 4: Create DOCX artifacts and expose them through the Web backend

**Files:**
- Modify: `scripts/app_service.py`
- Modify: `scripts/web_app.py`
- Test: `tests/test_docx_pipeline.py`

- [ ] **Step 1: Extend app history mapping and round result payloads**

Expose `docxOutputPath` from round and revision history entries. Keep missing values as empty strings for old records. Add the field to the result returned by `run_round_for_app()`.

- [ ] **Step 2: Materialize the DOCX after a successful app round**

After `run_round()` completes and before returning the final app payload, call the shared renderer for DOCX source files. Update the final round/revision record with the path. Keep the existing TXT-only path untouched.

- [ ] **Step 3: Update export behavior**

Change `export_round_output()` to accept optional `source_path`, `docx_output_path`, and `manifest_path`. For DOCX:

1. copy an existing generated DOCX artifact;
2. otherwise lazily render from the supplied original DOCX template;
3. if the source is TXT, retain the current new-document export;
4. if a DOCX source is required but missing, raise a clear error.

Use a temporary file for lazy rendering so failed exports do not leave a successful-looking file.

- [ ] **Step 4: Pass safe paths through the Web API**

Extend `/api/export-round` to accept optional `sourcePath`, `docxOutputPath`, and `manifestPath`. Validate source paths with the existing managed-source validator and generated paths with the existing managed-output validator before calling `export_round_output()`.

- [ ] **Step 5: Add backend integration tests**

Cover:

- `run_round_for_app()` returns a DOCX output path for DOCX input;
- a DOCX export keeps the original table/header/style fixture;
- a TXT export remains unchanged;
- an old record can lazily render from its source template;
- a missing template returns an error and no output file.

- [ ] **Step 6: Run backend tests and commit**

Run:

```powershell
pytest -q
```

Expected: all backend tests pass.

```powershell
git add -- scripts/app_service.py scripts/web_app.py tests/test_docx_pipeline.py
git commit -m "feat: preserve docx format in web outputs"
```

### Task 5: Wire desktop and Web frontend export calls

**Files:**
- Modify: `app/src/types/app.ts`
- Modify: `app/src/lib/appService.ts`
- Modify: `app/src/lib/desktopService.ts`
- Modify: `app/src/lib/webService.ts`
- Modify: `app/src/hooks/useAppState.ts`
- Modify: `app/src/App.tsx`
- Modify: `app/src/components/HistoryCard.tsx`

- [ ] **Step 1: Extend frontend types**

Add optional `docxOutputPath` to `RoundResult`, `HistoryRound`, and `HistoryRevision`. Update `AppService.exportRound()` to accept:

```ts
exportRound(
  outputPath: string,
  targetFormat: "txt" | "docx",
  sourcePath?: string,
  docxOutputPath?: string,
  manifestPath?: string,
): Promise<ExportResult>;
```

- [ ] **Step 2: Update desktop and Web service implementations**

Pass the optional fields to the Tauri command or Web query string. Do not alter TXT export behavior or save-dialog behavior.

- [ ] **Step 3: Track DOCX output in active previews**

Add `docxOutputPath` to `ActivePreview`. Populate it from current round results and history versions so the result page can export the exact selected version.

- [ ] **Step 4: Pass source/template information for current and history exports**

Update `handleExport()` to pass the current document source path and active preview DOCX path. Update `HistoryCard` callbacks so nested round/revision actions pass their parent document `sourcePath` and their own `docxOutputPath` and `manifestPath`.

- [ ] **Step 5: Build the frontend**

Run:

```powershell
cd app
npm run build
```

Expected: TypeScript compilation and Vite build complete successfully.

- [ ] **Step 6: Commit frontend integration**

```powershell
git add -- app/src/types/app.ts app/src/lib/appService.ts app/src/lib/desktopService.ts app/src/lib/webService.ts app/src/hooks/useAppState.ts app/src/App.tsx app/src/components/HistoryCard.tsx
git commit -m "feat: export preserved docx from web and desktop clients"
```

### Task 6: Final regression verification and documentation review

**Files:**
- Modify: `README.md`
- Test: `tests/test_docx_pipeline.py`

- [ ] **Step 1: Update user-facing workflow documentation**

Document that DOCX input produces a format-preserved DOCX result in both Web and Skill modes, while TXT input still exports a newly generated plain DOCX.

- [ ] **Step 2: Run the complete verification suite**

Run:

```powershell
pytest -q
cd app
npm run build
cd ..
git diff --check
git status --short
```

Expected: Python tests pass, frontend build succeeds, `git diff --check` reports no whitespace errors, and only intended feature files remain changed.

- [ ] **Step 3: Inspect a real generated DOCX package**

Use the test fixture and one local DOCX input to verify:

- source DOCX hash is unchanged;
- result text is updated;
- table/header/style XML remains present;
- result opens through `python-docx`.

- [ ] **Step 4: Commit documentation and final verification**

```powershell
git add -- README.md
git commit -m "docs: describe preserved docx outputs"
```


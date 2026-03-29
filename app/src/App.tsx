import { useEffect } from "react";
import { DocumentCard } from "./components/DocumentCard";
import { HistoryCard } from "./components/HistoryCard";
import { ModelConfigCard } from "./components/ModelConfigCard";
import { ResultCard } from "./components/ResultCard";
import { useAppState } from "./hooks/useAppState";
import {
  exportRound,
  getDocumentHistory,
  getDocumentStatus,
  loadModelConfig,
  pickInputFile,
  readOutput,
  runRound,
  saveModelConfig,
} from "./lib/tauri";

export function App() {
  const {
    modelConfig,
    documentStatus,
    history,
    roundResult,
    previewText,
    runtimeStep,
    notice,
    busy,
    error,
    setModelConfig,
    setDocumentStatus,
    setHistory,
    setRoundResult,
    setPreviewText,
    setRuntimeStep,
    setNotice,
    setBusy,
    setError,
  } = useAppState();

  useEffect(() => {
    loadModelConfig()
      .then((config) => setModelConfig(config))
      .catch((appError: unknown) => setError(String(appError)));
  }, [setError, setModelConfig]);

  async function refreshDocumentState(sourcePath: string) {
    const [status, nextHistory] = await Promise.all([
      getDocumentStatus(sourcePath),
      getDocumentHistory(sourcePath),
    ]);
    setDocumentStatus(status);
    setHistory(nextHistory);
    return status;
  }

  async function handleSaveModelConfig() {
    try {
      setBusy(true);
      setError("");
      setNotice("");
      setRuntimeStep("正在保存模型设置");
      const saved = await saveModelConfig(modelConfig);
      setModelConfig(saved);
      setNotice("模型设置已保存到本地。");
      setRuntimeStep("模型设置已保存");
    } catch (appError) {
      setError(String(appError));
      setRuntimeStep("保存模型设置失败");
    } finally {
      setBusy(false);
    }
  }

  async function handlePickFile() {
    try {
      setBusy(true);
      setError("");
      setNotice("");
      setRuntimeStep("正在选择并读取文档");
      const filePath = await pickInputFile();
      if (!filePath) {
        setNotice("已取消选择文档。");
        setRuntimeStep("待命");
        return;
      }
      const status = await refreshDocumentState(filePath);
      setRoundResult(null);
      setPreviewText("");
      setRuntimeStep(`已载入文档，当前到第 ${status.nextRound} 轮`);
      setNotice(`已导入文档，当前可执行第 ${status.nextRound} 轮。`);
    } catch (appError) {
      setError(String(appError));
      setRuntimeStep("读取文档失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleRunRound() {
    if (!documentStatus) {
      setNotice("请先导入一个 txt 或 docx 文档。");
      return;
    }
    try {
      setBusy(true);
      setError("");
      setNotice("");
      setRuntimeStep(`准备执行第 ${documentStatus.nextRound} 轮`);
      const result = await runRound(documentStatus.sourcePath, modelConfig);
      setRuntimeStep(`第 ${result.round} 轮处理中，正在读取预览`);
      setRoundResult(result);
      const preview = await readOutput(result.outputPath);
      setPreviewText(preview.text);
      setRuntimeStep(`第 ${result.round} 轮已完成，正在刷新历史`);
      const status = await refreshDocumentState(documentStatus.sourcePath);
      setRuntimeStep(`第 ${result.round} 轮完成，下一步可执行第 ${status.nextRound} 轮`);
      setNotice(`第 ${result.round} 轮已完成，可以继续导出或进入下一轮。`);
    } catch (appError) {
      setError(String(appError));
      setRuntimeStep("执行轮次失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleExport(targetFormat: "txt" | "docx") {
    if (!roundResult) {
      setNotice("请先执行至少一轮处理，再导出结果。");
      return;
    }
    try {
      setBusy(true);
      setError("");
      setNotice("");
      setRuntimeStep(`正在导出 ${targetFormat.toUpperCase()}`);
      const result = await exportRound(roundResult.outputPath, targetFormat);
      setNotice(`已导出 ${result.format.toUpperCase()}：${result.path}`);
    } catch (appError) {
      setError(String(appError));
      setRuntimeStep("导出失败");
    } finally {
      if (!error) {
        setRuntimeStep("导出完成");
      }
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <div className="hero-panel">
        <div>
          <p className="eyebrow">baibaiAIGC</p>
          <h1>超级超级好用的降AI神器！</h1>
          <p className="hero-copy">
            这是一个面向中文论文与技术文档的 Windows 桌面工作台。你可以配置模型、导入 txt 或 Word，逐轮执行改写，并在每轮结束后导出 txt 或 Word。
          </p>
        </div>
        {busy ? <span className="status-tag">处理中</span> : <span className="status-tag idle">待命</span>}
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="notice-banner">{notice}</div> : null}

      <div className="runtime-log" aria-live="polite">
        <span className="runtime-log-label">运行步骤</span>
        <strong>{runtimeStep}</strong>
      </div>

      <section className="content-grid">
        <ModelConfigCard
          value={modelConfig}
          busy={busy}
          onChange={setModelConfig}
          onSave={handleSaveModelConfig}
        />
        <DocumentCard
          value={documentStatus}
          busy={busy}
          onPickFile={handlePickFile}
          onRunRound={handleRunRound}
        />
      </section>

      <HistoryCard value={history} />

      <ResultCard
        result={roundResult}
        previewText={previewText}
        busy={busy}
        onExportTxt={() => handleExport("txt")}
        onExportDocx={() => handleExport("docx")}
      />
    </main>
  );
}

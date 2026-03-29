import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { DocumentHistory, DocumentStatus, ExportResult, ModelConfig, RoundResult } from "../types/app";

const defaultModelConfig: ModelConfig = {
  baseUrl: "",
  apiKey: "",
  model: "",
  temperature: 0.7,
  offlineMode: false,
};

export async function loadModelConfig(): Promise<ModelConfig> {
  const config = await invoke<Partial<ModelConfig>>("load_model_config");
  return { ...defaultModelConfig, ...config };
}

export async function saveModelConfig(config: ModelConfig): Promise<ModelConfig> {
  const saved = await invoke<Partial<ModelConfig>>("save_model_config", { config });
  return { ...defaultModelConfig, ...saved };
}

export async function pickInputFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Documents", extensions: ["txt", "docx"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function getDocumentStatus(sourcePath: string): Promise<DocumentStatus> {
  return invoke<DocumentStatus>("get_document_status", { sourcePath });
}

export async function getDocumentHistory(sourcePath: string): Promise<DocumentHistory> {
  return invoke<DocumentHistory>("get_document_history", { sourcePath });
}

export async function runRound(sourcePath: string, modelConfig: ModelConfig): Promise<RoundResult> {
  return invoke<RoundResult>("run_aigc_round", { sourcePath, modelConfig });
}

export async function readOutput(outputPath: string): Promise<{ path: string; text: string }> {
  return invoke<{ path: string; text: string }>("read_output_text", { outputPath });
}

export async function exportRound(outputPath: string, targetFormat: "txt" | "docx"): Promise<ExportResult> {
  const exportPath = await save({
    defaultPath: targetFormat === "docx" ? "当前轮结果.docx" : "当前轮结果.txt",
    filters: [{ name: "Export", extensions: [targetFormat] }],
  });
  if (!exportPath || Array.isArray(exportPath)) {
    throw new Error("Export cancelled");
  }
  return invoke<ExportResult>("export_round_output", { outputPath, exportPath, targetFormat });
}

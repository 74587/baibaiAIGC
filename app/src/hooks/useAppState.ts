import { create } from "zustand";
import type { DocumentHistory, DocumentStatus, ModelConfig, RoundResult } from "../types/app";

const defaultModelConfig: ModelConfig = {
  baseUrl: "",
  apiKey: "",
  model: "",
  temperature: 0.7,
  offlineMode: false,
};

type AppState = {
  modelConfig: ModelConfig;
  documentStatus: DocumentStatus | null;
  history: DocumentHistory | null;
  roundResult: RoundResult | null;
  previewText: string;
  runtimeStep: string;
  notice: string;
  busy: boolean;
  error: string;
  setModelConfig: (config: ModelConfig) => void;
  setDocumentStatus: (status: DocumentStatus | null) => void;
  setHistory: (history: DocumentHistory | null) => void;
  setRoundResult: (result: RoundResult | null) => void;
  setPreviewText: (text: string) => void;
  setRuntimeStep: (text: string) => void;
  setNotice: (notice: string) => void;
  setBusy: (busy: boolean) => void;
  setError: (error: string) => void;
};

export const useAppState = create<AppState>((set) => ({
  modelConfig: defaultModelConfig,
  documentStatus: null,
  history: null,
  roundResult: null,
  previewText: "",
  runtimeStep: "待命",
  notice: "",
  busy: false,
  error: "",
  setModelConfig: (modelConfig) => set({ modelConfig }),
  setDocumentStatus: (documentStatus) => set({ documentStatus }),
  setHistory: (history) => set({ history }),
  setRoundResult: (roundResult) => set({ roundResult }),
  setPreviewText: (previewText) => set({ previewText }),
  setRuntimeStep: (runtimeStep) => set({ runtimeStep }),
  setNotice: (notice) => set({ notice }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
}));

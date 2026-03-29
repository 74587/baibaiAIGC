export type ModelConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  offlineMode: boolean;
};

export type DocumentStatus = {
  docId: string;
  sourcePath: string;
  sourceKind: string;
  completedRounds: number[];
  nextRound: number;
  currentInputPath: string;
  currentOutputPath: string;
  manifestPath: string;
  latestOutputPath: string;
  extractedFromDocx: boolean;
};

export type RoundResult = {
  round: number;
  outputPath: string;
  manifestPath: string;
  chunkLimit: number;
  inputSegmentCount: number;
  outputSegmentCount: number;
  paragraphCount: number;
  offlineMode: boolean;
  docEntry: Record<string, unknown>;
  skillContext: Record<string, unknown>;
};

export type HistoryRound = {
  round: number;
  prompt: string;
  inputPath: string;
  outputPath: string;
  manifestPath: string;
  scoreTotal: number | null;
  chunkLimit: number | null;
  inputSegmentCount: number | null;
  outputSegmentCount: number | null;
  timestamp: string;
};

export type DocumentHistory = {
  docId: string;
  sourcePath: string;
  rounds: HistoryRound[];
};

export type ExportResult = {
  format: "txt" | "docx";
  path: string;
};

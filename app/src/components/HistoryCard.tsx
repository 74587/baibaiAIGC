import type { DocumentHistory } from "../types/app";

type Props = {
  value: DocumentHistory | null;
};

function formatTimestamp(value: string): string {
  if (!value) {
    return "时间未知";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function HistoryCard({ value }: Props) {
  return (
    <section className="glass-card section-stack history-card">
      <div className="section-header">
        <div>
          <h2>历史记录</h2>
          <p>显示当前文档已经完成过的轮次与产物路径。</p>
        </div>
      </div>
      {value && value.rounds.length ? (
        <div className="history-list">
          {value.rounds.map((item) => (
            <article key={item.round} className="history-item">
              <div className="history-item-head">
                <strong>第 {item.round} 轮</strong>
                <span>{formatTimestamp(item.timestamp)}</span>
              </div>
              <div className="history-metrics">
                <span>输入块数 {item.inputSegmentCount ?? "-"}</span>
                <span>输出块数 {item.outputSegmentCount ?? "-"}</span>
                <span>切块上限 {item.chunkLimit ?? "-"}</span>
              </div>
              <div className="path-box compact-box">
                <span>输出路径</span>
                <strong>{item.outputPath || "暂无"}</strong>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state history-empty">
          <strong>还没有历史记录</strong>
          <p>执行至少一轮处理后，这里会显示每一轮的完成时间和输出信息。</p>
        </div>
      )}
    </section>
  );
}
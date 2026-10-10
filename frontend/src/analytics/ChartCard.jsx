import { useState } from "react";

/**
 * Card around one chart: title, subtitle, the chart, and a "Show table" toggle so every value
 * is readable without hovering. `columns` is [{ key, label, format? }] and `rows` the table data.
 */
export default function ChartCard({ title, subtitle, columns, rows, empty, dimmed, children }) {
  const [table, setTable] = useState(false);
  return (
    <section className={`a-card${dimmed ? " dimmed" : ""}`}>
      <header className="a-card-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="a-sub">{subtitle}</p>}
        </div>
        {rows?.length > 0 && (
          <button className="a-toggle" onClick={() => setTable((t) => !t)} aria-pressed={table}>
            {table ? "Show chart" : "Show table"}
          </button>
        )}
      </header>
      {!rows?.length ? (
        <div className="a-empty">{empty}</div>
      ) : table ? (
        <div className="a-table-wrap">
          <table className="a-table">
            <thead>
              <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => <td key={c.key}>{c.format ? c.format(r[c.key], r) : r[c.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

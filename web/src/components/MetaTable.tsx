import { formatValue } from '../lib/format';

export interface MetaRow {
  key: string;
  value: string;
}

/** Renders every key of a record; nulls render as "--". Optional formatter per key. */
export function MetaTable({
  data,
  omit = [],
  format = {},
}: {
  data: Record<string, unknown>;
  omit?: string[];
  format?: Record<string, (v: unknown) => string>;
}) {
  const rows: MetaRow[] = Object.entries(data)
    .filter(([k]) => !omit.includes(k))
    .map(([k, v]) => ({ key: k, value: format[k] ? format[k]!(v) : formatValue(v) }));
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b border-line/60 last:border-0">
            <td className="hmi-label w-1/3 py-1 pr-2 align-top">{r.key}</td>
            <td className="num break-all py-1 text-text">{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

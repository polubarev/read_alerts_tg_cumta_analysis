export function downloadCsv(rows: Record<string, string | number>[], filename: string): void {
  if (rows.length === 0) {
    return;
  }

  const columns = Object.keys(rows[0]);
  const body = rows
    .map((row) =>
      columns
        .map((column) => {
          const value = String(row[column] ?? "");
          return `"${value.replaceAll("\"", "\"\"")}"`;
        })
        .join(",")
    )
    .join("\n");
  const csv = `${columns.join(",")}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

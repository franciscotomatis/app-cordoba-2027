"use client";

// Exportación de casos a CSV, Excel y PDF. Las librerías pesadas se cargan
// solo cuando el usuario aprieta el botón, para no engordar el bundle inicial.

export type Columna<T> = {
  clave: keyof T | string;
  titulo: string;
  ancho?: number;
  valor?: (fila: T) => string | number | null;
};

function valorDe<T extends Record<string, unknown>>(fila: T, col: Columna<T>) {
  if (col.valor) return col.valor(fila);
  const v = fila[col.clave as keyof T];
  return v === null || v === undefined ? "" : (v as string | number);
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportarCsv<T extends Record<string, unknown>>(
  filas: T[],
  columnas: Columna<T>[],
  nombre: string
) {
  const escapar = (v: string | number | null) => {
    const texto = String(v ?? "");
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };

  // Punto y coma: es lo que espera Excel en configuración regional es-AR.
  const lineas = [
    columnas.map((c) => escapar(c.titulo)).join(";"),
    ...filas.map((f) => columnas.map((c) => escapar(valorDe(f, c))).join(";")),
  ];

  // BOM para que Excel reconozca los acentos.
  descargar(
    new Blob(["﻿" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8;" }),
    `${nombre}.csv`
  );
}

export async function exportarExcel<T extends Record<string, unknown>>(
  filas: T[],
  columnas: Columna<T>[],
  nombre: string,
  titulo = "Siniestros"
) {
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  libro.creator = "Programa Córdoba";
  libro.created = new Date();

  const hoja = libro.addWorksheet(titulo, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  hoja.columns = columnas.map((c) => ({
    header: c.titulo,
    key: String(c.clave),
    width: c.ancho ?? 18,
  }));

  for (const f of filas) {
    hoja.addRow(
      Object.fromEntries(columnas.map((c) => [String(c.clave), valorDe(f, c)]))
    );
  }

  hoja.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  hoja.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD97757" },
  };
  hoja.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columnas.length },
  };

  const buffer = await libro.xlsx.writeBuffer();
  descargar(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${nombre}.xlsx`
  );
}

export async function exportarPdf<T extends Record<string, unknown>>(
  filas: T[],
  columnas: Columna<T>[],
  nombre: string,
  titulo = "Listado de siniestros"
) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(14);
  doc.text(titulo, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `${filas.length} casos · generado el ${new Date().toLocaleDateString("es-AR")}`,
    40,
    56
  );

  autoTable(doc, {
    startY: 70,
    head: [columnas.map((c) => c.titulo)],
    body: filas.map((f) => columnas.map((c) => String(valorDe(f, c) ?? ""))),
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [217, 119, 87], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [247, 245, 242] },
    margin: { left: 40, right: 40 },
  });

  doc.save(`${nombre}.pdf`);
}

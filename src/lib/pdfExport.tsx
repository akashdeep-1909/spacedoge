import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { ReportTable } from "@/lib/adminReports";

// No PDF generation existed anywhere in this repo before this feature
// (confirmed: no pdf-lib/jspdf/puppeteer/@react-pdf dependency at all).
// @react-pdf/renderer specifically because it's pure JS — no headless
// Chrome/Puppeteer binary to install or fit inside this app's cPanel
// Node hosting (NODE_OPTIONS --max-old-space-size=1024, see deploy.sh)
// — renderToBuffer() runs entirely in-process.
const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 8, fontFamily: "Helvetica" },
  title: { fontSize: 14, marginBottom: 3, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 8, marginBottom: 14, color: "#666666" },
  headerRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#000000", paddingVertical: 4, backgroundColor: "#f0f0f0" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#cccccc", paddingVertical: 3 },
  cell: { flex: 1, paddingHorizontal: 3, fontSize: 7 },
  headerCell: { flex: 1, paddingHorizontal: 3, fontSize: 7, fontFamily: "Helvetica-Bold" },
});

// One shared tabular layout for every export type (deposits,
// withdrawals, game results, mining contracts, transfers, and the
// combined per-user report) — a new report type only ever needs to
// supply data (ReportTable, src/lib/adminReports.ts), never a new PDF
// layout. Landscape A4: these tables run 8-13 columns wide, which
// portrait can't fit legibly.
function ReportDocument({ table, subtitle }: { table: ReportTable; subtitle: string }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>Space DOGE — {table.title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View>
          <View style={styles.headerRow} fixed>
            {table.headers.map((h, i) => (
              <Text key={i} style={styles.headerCell}>
                {h}
              </Text>
            ))}
          </View>
          {table.rows.map((row, i) => (
            <View key={i} style={styles.row} wrap={false}>
              {row.map((cell, j) => (
                <Text key={j} style={styles.cell}>
                  {String(cell)}
                </Text>
              ))}
            </View>
          ))}
          {table.rows.length === 0 && <Text style={{ ...styles.cell, marginTop: 8 }}>No rows.</Text>}
        </View>
      </Page>
    </Document>
  );
}

export async function renderReportPdf(table: ReportTable, subtitle: string): Promise<Buffer> {
  return renderToBuffer(<ReportDocument table={table} subtitle={subtitle} />);
}

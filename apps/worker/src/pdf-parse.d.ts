declare module 'pdf-parse' {
  interface PdfData {
    text: string;
  }
  export default function pdfParse(data: Buffer, options?: unknown): Promise<PdfData>;
}

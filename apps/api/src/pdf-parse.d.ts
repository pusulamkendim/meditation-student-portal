declare module 'pdf-parse' {
  interface PdfData {
    numpages: number;
    text: string;
  }

  export default function pdfParse(data: Buffer, options?: unknown): Promise<PdfData>;
}

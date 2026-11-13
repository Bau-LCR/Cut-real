/// <reference types="vite/client" />
declare module 'mammoth/mammoth.browser' { const m: { extractRawText(o: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }> }; export default m }
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' { const u: string; export default u }

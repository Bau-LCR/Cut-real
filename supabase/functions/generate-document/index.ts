import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'
import { Document, Footer, HeadingLevel, Packer, Paragraph, TextRun, ImageRun, AlignmentType, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, PageBreak } from 'npm:docx@8.5.0'
import { corsHeaders, errorResponse, HttpError } from '../_shared/cors.ts'
import { authenticate, rateLimit } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Método no permitido.')
    const ctx = await authenticate(req)
    await rateLimit(ctx.db, 'document:' + ctx.userId, 12)
    const body = await req.json().catch(() => null)
    if (!body || !['pdf', 'docx'].includes(body.format) || typeof body.title !== 'string' || typeof body.content !== 'string' || (body.html !== undefined && typeof body.html !== 'string') || (body.images !== undefined && (!Array.isArray(body.images) || body.images.length > 8 || !body.images.every((image: any) => image && typeof image.id === 'string' && /^[0-9a-f-]{36}$/i.test(image.id)))))
      throw new HttpError(400, 'bad_request', 'Se requiere formato PDF o DOCX, título, contenido y hasta 8 referencias de imágenes válidas.')
    const title = body.title.trim().slice(0, 160), rawContent = (typeof body.html === 'string' && body.html.trim() ? htmlToMarkdown(body.html.slice(0, 300000)) : body.content).trim(), hasCover = /^<!--CUTREAL_COVER-->/i.test(rawContent), content = rawContent.replace(/^<!--CUTREAL_COVER-->\\s*/i, '')
    if (!title || !content || content.length > 300000) throw new HttpError(400, 'invalid_document', 'El documento está vacío o supera el límite permitido.')
    const safeTitle = title.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 100) || 'Documento'
    const documentImages = await loadDocumentImages(ctx, Array.isArray(body.images) ? body.images : [])
    if (body.format === 'pdf') return new Response(toArrayBuffer(await makePdf(safeTitle, content, documentImages, hasCover)), { headers: { ...corsHeaders(req), 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="documento.pdf"', 'Cache-Control': 'no-store' } })
    return new Response(toArrayBuffer(await makeDocx(safeTitle, content, documentImages, hasCover)), { headers: { ...corsHeaders(req), 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': 'attachment; filename="documento.docx"', 'Cache-Control': 'no-store' } })
  } catch (e) { return errorResponse(req, e) }
})

interface DocumentImage { id: string; mimeType: string; data: Uint8Array; alt: string }
async function loadDocumentImages(ctx: Awaited<ReturnType<typeof authenticate>>, requested: {id:string;alt?:string}[]): Promise<Map<string,DocumentImage>> {
  const output = new Map<string,DocumentImage>()
  if (!requested.length) return output
  const ids = [...new Set(requested.map((item) => item.id))]
  const { data: rows, error } = await ctx.db.from('cr_generated_images')
    .select('id, user_id, storage_path, mime_type, alt_text').in('id', ids).eq('user_id', ctx.userId)
  if (error || !rows || rows.length !== ids.length) throw new HttpError(403, 'image_access_denied', 'Una o más imágenes no pertenecen a tu cuenta o ya no están disponibles.')
  let totalBytes = 0
  for (const row of rows) {
    const { data: blob, error: downloadError } = await ctx.db.storage.from('cr-generated-images').download(row.storage_path)
    if (downloadError || !blob) throw new HttpError(404, 'image_missing', 'No se pudo recuperar una imagen del documento.')
    totalBytes += blob.size
    if (blob.size > 12 * 1024 * 1024 || totalBytes > 24 * 1024 * 1024) throw new HttpError(413, 'images_too_large', 'Las imágenes superan el tamaño permitido para el documento.')
    output.set(row.id, { id: row.id, mimeType: row.mime_type, data: new Uint8Array(await blob.arrayBuffer()), alt: row.alt_text })
  }
  return output
}
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}
function clean(s: string) {
  return s.replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1').replace(/\*(.*?)\*/g, '$1')
    .replace(/\x60([^\x60]+)\x60/g, '$1').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[—–]/g, '-')
    .replace(/…/g, '...').replace(/[^\u0009\u000A\u000D\u0020-\u00FF]/g, '').trim()
}
function decodeEntities(value: string) {
  return value.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
}
function htmlToMarkdown(html: string) {
  return decodeEntities(html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<(h1|h2|h3)\b[^>]*>/gi, (_, tag) => '\n\n' + '#'.repeat(Number(tag[1])) + ' ')
    .replace(/<\/h[1-3]>/gi, '\n\n')
    .replace(/<(strong|b)\b[^>]*>/gi, '**').replace(/<\/(strong|b)>/gi, '**')
    .replace(/<(em|i)\b[^>]*>/gi, '*').replace(/<\/(em|i)>/gi, '*')
    .replace(/<u\b[^>]*>/gi, '__').replace(/<\/u>/gi, '__')
    .replace(/<(s|strike|del)\b[^>]*>/gi, '~~').replace(/<\/(s|strike|del)>/gi, '~~')
    .replace(/<code\b[^>]*>/gi, '`').replace(/<\/code>/gi, '`')
    .replace(/<li\b[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '\n')
    .replace(/<blockquote\b[^>]*>/gi, '\n> ').replace(/<\/blockquote>/gi, '\n\n')
    .replace(/<\/(p|div|section|ul|ol|table|tr)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')).trim()
}
function parse(s: string) {
  const lines = s.replace(/\\r/g, '').replace(/^<!--CUTREAL_COVER-->\\s*/i, '').split('\\n')
  const blocks: any[] = []
  let inCode = false
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (/^\\x60{3}/.test(t)) { inCode = !inCode; continue }
    if (!t || /^!\\[[^\\]]*\\]\\(cutreal-image:[0-9a-f-]{36}\\)$/i.test(t)) continue
    if (inCode) { blocks.push({ kind: 'code', raw: t, text: clean(t) }); continue }
    if (/^\\|/.test(t)) {
      const rows: string[][] = []
      while (i < lines.length && /^\\s*\\|/.test(lines[i])) {
        const row = lines[i].trim()
        if (!/^\\|[\\s:|-]+\\|?$/.test(row)) rows.push(row.replace(/^\\||\\|$/g, '').split('|').map((cell) => clean(cell.trim())))
        i++
      }
      i--
      if (rows.length) blocks.push({ kind: 'table', rows })
      continue
    }
    const image = t.match(/^<!--CUTREAL_IMAGE:([0-9a-f-]{36})\\|([^>]*)-->$/i)
    if (image) { blocks.push({ kind: 'image', raw: image[1], text: image[2].trim() }); continue }
    const make = (kind: string, raw: string) => blocks.push({ kind, raw, text: clean(raw) })
    if (/^#{1,3}\\s/.test(t)) make('h' + Math.min(3, t.match(/^#+/)![0].length), t.replace(/^#{1,3}\\s*/, ''))
    else if (/^[-*+]\\s/.test(t)) make('bullet', t.replace(/^[-*+]\\s*/, ''))
    else if (/^\\d+[.)]\\s/.test(t)) make('number', t.replace(/^\\d+[.)]\\s*/, ''))
    else if (/^>\\s?/.test(t)) make('quote', t.replace(/^>\\s?/, ''))
    else make('p', t)
  }
  return blocks.filter((block) => block.kind === 'image' || block.kind === 'table' || !!block.text)
}
function inlineSegments(value: string) {
  const runs: { text: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; code?: boolean }[] = []
  const token = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|`[^`]+`)/g
  let cursor = 0
  for (const match of value.matchAll(token)) {
    const index = match.index ?? 0
    if (index > cursor) runs.push({ text: clean(value.slice(cursor, index)) })
    const item = match[0]
    const bold = item.startsWith('**'), underline = item.startsWith('__'), strike = item.startsWith('~~'), code = item.startsWith('`')
    const text = item.slice(bold || underline || strike ? 2 : 1, -(bold || underline || strike ? 2 : 1))
    runs.push({ text: clean(text), bold, italic: !bold && !underline && !strike && !code, underline, strike, code })
    cursor = index + item.length
  }
  if (cursor < value.length) runs.push({ text: clean(value.slice(cursor)) })
  return runs.length ? runs : [{ text: clean(value) }]
}
function inlineRuns(value: string) {
  return inlineSegments(value).map(run => new TextRun({ text: run.text, bold: run.bold, italics: run.italic, underline: run.underline ? {} : undefined, strike: run.strike, font: run.code ? 'Consolas' : undefined }))
}
async function makePdf(title: string, md: string, images: Map<string,DocumentImage>, hasCover: boolean): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(), regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold), italic = await pdf.embedFont(StandardFonts.HelveticaOblique)
  pdf.setTitle(title)
  const W=595.28,H=841.89,M=58, max=W-M*2
  let page=pdf.addPage([W,H]), y=H-72
  const next=()=>{page=pdf.addPage([W,H]);y=H-72}
  const draw=(txt:string,font:any,size:number,color=rgb(.16,.18,.22),indent=0)=>{
    const lines:string[]=[];let line=''
    for(const word of txt.split(/\s+/)){const candidate=line?line+' '+word:word;if(font.widthOfTextAtSize(candidate,size)>max-indent&&line){lines.push(line);line=word}else line=candidate}
    if(line)lines.push(line)
    for(const l of lines){if(y<65)next();page.drawText(l,{x:M+indent,y,size,font,color});y-=size+5}
  }
  const drawRich=(raw:string,baseFont:any,size:number,color=rgb(.16,.18,.22),indent=0)=>{
    const tokens=inlineSegments(raw).flatMap(run=>(run.text.match(/\s+|\S+/g)||[]).map(text=>({text,bold:run.bold,italic:run.italic,code:run.code})))
    let line:{text:string;font:any;width:number}[]=[];let lineWidth=0
    const flush=()=>{if(!line.length)return;if(y<65)next();let x=M+indent;for(const part of line){page.drawText(part.text,{x,y,size,font:part.font,color});x+=part.width}y-=size+5;line=[];lineWidth=0}
    for(const token of tokens){const font=token.bold?bold:token.italic?italic:token.code?regular:baseFont;const width=font.widthOfTextAtSize(token.text,size)
      if(lineWidth+width>max-indent&&line.length)flush()
      line.push({text:token.text,font,width});lineWidth+=width
    }
    flush()
  }
  if (hasCover) {
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(.035,.09,.19) })
    page.drawRectangle({ x: 0, y: 0, width: 13, height: H, color: rgb(.16,.43,.82) })
    page.drawCircle({ x: W-65, y: H-65, size: 170, borderColor: rgb(.17,.38,.68), borderWidth: 1.5, opacity: .45 })
    page.drawCircle({ x: W-65, y: H-65, size: 125, borderColor: rgb(.17,.38,.68), borderWidth: 1, opacity: .35 })
    page.drawText('CUT-REAL  /  DOCUMENTO', { x:M, y:H-150, size:10, font:bold, color:rgb(.48,.72,1) })
    page.drawText(title, { x:M, y:H-270, size:30, font:bold, color:rgb(1,1,1), maxWidth:max })
    page.drawLine({ start:{x:M,y:H-300}, end:{x:M+100,y:H-300}, thickness:3, color:rgb(.25,.58,.98) })
    page.drawText('Documento elaborado con estructura y contenido original', { x:M, y:H-330, size:11, font:regular, color:rgb(.78,.84,.93) })
    page.drawText(new Date().toLocaleDateString('es-AR', { year:'numeric', month:'long', day:'numeric' }), { x:M, y:95, size:10, font:regular, color:rgb(.68,.76,.88) })
    next()
  }
  page.drawText(title,{x:M,y,size:23,font:bold,color:rgb(.06,.18,.42),maxWidth:max});y-=38
  page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:1,color:rgb(.12,.34,.72)});y-=28
  let orderedIndex=0
  for(const b of parse(md)){
    if (b.kind === 'image') {
      const image = images.get(b.raw)
      if (image && (image.mimeType === 'image/png' || image.mimeType === 'image/jpeg')) {
        const embedded = image.mimeType === 'image/jpeg' ? await pdf.embedJpg(image.data) : await pdf.embedPng(image.data)
        const scale = Math.min(max / embedded.width, 340 / embedded.height, 1)
        const width = embedded.width * scale, height = embedded.height * scale
        if (y - height < 65) next()
        page.drawImage(embedded, { x: M + (max - width) / 2, y: y - height, width, height })
        y -= height + 18
      }
      continue
    }
    if (b.kind === 'table') {
      orderedIndex = 0
      const cols = Math.max(...b.rows.map((row: string[]) => row.length))
      const widths = Array.from({ length: cols }, () => max / cols)
      b.rows.forEach((row: string[], rowIndex: number) => {
        const cells = Array.from({ length: cols }, (_, i) => row[i] ?? '')
        const wrapped = cells.map((cell: string, i: number) => {
          const words = cell.split(/\\s+/); const lines: string[] = []; let line = ''
          for (const word of words) { const nextLine = line ? line + ' ' + word : word; if (regular.widthOfTextAtSize(nextLine, 8.5) > widths[i] - 12 && line) { lines.push(line); line = word } else line = nextLine }
          if (line) lines.push(line); return lines
        })
        const rowHeight = Math.max(25, Math.max(...wrapped.map((lines: string[]) => lines.length)) * 11 + 12)
        if (y - rowHeight < 65) next()
        page.drawRectangle({ x:M, y:y-rowHeight+2, width:max, height:rowHeight, color: rowIndex === 0 ? rgb(.09,.22,.42) : rowIndex % 2 ? rgb(.95,.96,.98) : rgb(.985,.988,.995), borderColor:rgb(.82,.85,.9), borderWidth:.45 })
        let x=M
        cells.forEach((cell: string, i: number) => {
          const font = rowIndex === 0 ? bold : regular
          wrapped[i].forEach((line: string, lineIndex: number) => page.drawText(line, { x:x+6, y:y-13-lineIndex*11, size:8.5, font, color:rowIndex===0?rgb(1,1,1):rgb(.16,.18,.22) }))
          if (i > 0) page.drawLine({ start:{x,y:y-rowHeight+2}, end:{x,y:y+2}, thickness:.4, color:rgb(.82,.85,.9) })
          x += widths[i]
        })
        y -= rowHeight
      })
      y -= 12
      continue
    }
    if(b.kind==='number'){orderedIndex++;drawRich(`${orderedIndex}. ${b.raw}`,regular,10.5,undefined,14);y-=5;continue}
    orderedIndex=0
    if(b.kind[0]==='h'){y-=8;drawRich(b.raw,bold,b.kind==='h1'?17:b.kind==='h2'?14:12,rgb(.08,.22,.43));y-=5}
    else if(b.kind==='bullet')drawRich('•  '+b.raw,regular,10.5,undefined,14)
    else if(b.kind==='quote')drawRich(b.raw,italic,10.5,rgb(.35,.38,.43),18)
    else if(b.kind==='code')drawRich(b.raw,regular,9,rgb(.20,.28,.38),14)
    else drawRich(b.raw,regular,10.5)
    y-=5
  }
  const pages=pdf.getPages()
  pages.forEach((p,i)=>{p.drawLine({start:{x:M,y:42},end:{x:W-M,y:42},thickness:.5,color:rgb(.82,.84,.88)});p.drawText('Cut-real',{x:M,y:27,size:8,font:regular,color:rgb(.45,.48,.54)});p.drawText('Página '+(i+1)+' de '+pages.length,{x:W-M-70,y:27,size:8,font:regular,color:rgb(.45,.48,.54)})})
  return pdf.save()
}
async function makeDocx(title:string,md:string,images:Map<string,DocumentImage>,hasCover:boolean):Promise<Uint8Array>{
  const children:any[]=[]
  if (hasCover) {
    children.push(new Paragraph({ children:[new TextRun({text:'CUT-REAL  /  DOCUMENTO',bold:true,color:'315B9B',size:22})], alignment:AlignmentType.CENTER, spacing:{before:2200,after:900} }))
    children.push(new Paragraph({ text:title, heading:HeadingLevel.TITLE, alignment:AlignmentType.CENTER, spacing:{after:500} }))
    children.push(new Paragraph({ children:[new TextRun({text:'Documento elaborado con estructura y contenido original',color:'66758A',size:22})], alignment:AlignmentType.CENTER, spacing:{after:1800} }))
    children.push(new Paragraph({ children:[new TextRun({text:new Date().toLocaleDateString('es-AR',{year:'numeric',month:'long',day:'numeric'}),color:'7A8190',size:18})], alignment:AlignmentType.CENTER }))
    children.push(new Paragraph({ children:[new PageBreak()] }))
  }
  children.push(new Paragraph({text:title,heading:HeadingLevel.TITLE,spacing:{after:280}}),new Paragraph({children:[new TextRun({text:'CUT-REAL',bold:true,color:'315B9B',size:18})],spacing:{after:240}}))
  let orderedIndex=0
  for(const b of parse(md)){
    if (b.kind === 'image') {
      const image = images.get(b.raw)
      if (image && (image.mimeType === 'image/png' || image.mimeType === 'image/jpeg')) {
        children.push(new Paragraph({ children: [new ImageRun({ data: image.data, transformation: { width: 480, height: 320 } })], alignment: AlignmentType.CENTER, spacing: { before: 120, after: 180 } }))
      }
      continue
    }
    if (b.kind === 'table') {
      orderedIndex = 0
      const cols = Math.max(...b.rows.map((row: string[]) => row.length))
      const rows = b.rows.map((row: string[], rowIndex: number) => new TableRow({
        tableHeader: rowIndex === 0,
        children: Array.from({ length: cols }, (_, i) => new TableCell({
          width: { size: Math.floor(100 / cols), type: WidthType.PERCENTAGE },
          shading: rowIndex === 0 ? { fill: '173B70', type: ShadingType.CLEAR } : { fill: rowIndex % 2 ? 'F1F4F8' : 'FFFFFF', type: ShadingType.CLEAR },
          children: [new Paragraph({ children: rowIndex === 0 ? [new TextRun({ text: row[i] ?? '', bold:true, color:'FFFFFF' })] : inlineRuns(row[i] ?? '') })],
        })),
      }))
      children.push(new Table({ rows, width:{size:100,type:WidthType.PERCENTAGE}, columnWidths:Array.from({length:cols},()=>Math.floor(9000/cols)), borders:{ top:{style:BorderStyle.SINGLE,size:4,color:'D4DCE8'}, bottom:{style:BorderStyle.SINGLE,size:4,color:'D4DCE8'}, left:{style:BorderStyle.SINGLE,size:4,color:'D4DCE8'}, right:{style:BorderStyle.SINGLE,size:4,color:'D4DCE8'}, insideHorizontal:{style:BorderStyle.SINGLE,size:3,color:'D4DCE8'}, insideVertical:{style:BorderStyle.SINGLE,size:3,color:'D4DCE8'} } }))
      continue
    }
    if(b.kind==='number'){orderedIndex++;children.push(new Paragraph({children:[new TextRun({text:`${orderedIndex}. `}),...inlineRuns(b.raw)],spacing:{after:70}}));continue}
    orderedIndex=0
    if(b.kind[0]==='h'){const level=b.kind==='h1'?HeadingLevel.HEADING_1:b.kind==='h2'?HeadingLevel.HEADING_2:HeadingLevel.HEADING_3;children.push(new Paragraph({children:inlineRuns(b.raw),heading:level,spacing:{before:220,after:100},keepNext:true}))}
    else if(b.kind==='bullet')children.push(new Paragraph({children:inlineRuns(b.raw),bullet:{level:0},spacing:{after:70}}))
    else if(b.kind==='quote')children.push(new Paragraph({children:inlineRuns(b.raw),indent:{left:420},spacing:{after:100}}))
    else if(b.kind==='code')children.push(new Paragraph({children:inlineRuns(b.raw),indent:{left:240},spacing:{after:70}}))
    else children.push(new Paragraph({children:inlineRuns(b.raw),alignment:AlignmentType.JUSTIFIED,spacing:{after:120,line:300}}))
  }
  const doc=new Document({title,creator:'Cut-real',sections:[{properties:{page:{margin:{top:1440,right:1440,bottom:1440,left:1440}}},footers:{default:new Footer({children:[new Paragraph({children:[new TextRun({text:'Generado con Cut-real',size:16,color:'7A8190'})],alignment:AlignmentType.CENTER})]})},children}]})
  return new Uint8Array(await Packer.toBuffer(doc))
}

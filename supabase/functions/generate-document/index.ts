import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'
import { Document, Footer, HeadingLevel, Packer, Paragraph, TextRun, AlignmentType } from 'npm:docx@8.5.0'
import { corsHeaders, errorResponse, HttpError } from '../_shared/cors.ts'
import { authenticate, rateLimit } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Método no permitido.')
    const ctx = await authenticate(req)
    await rateLimit(ctx.db, 'document:' + ctx.userId, 12)
    const body = await req.json().catch(() => null)
    if (!body || !['pdf', 'docx'].includes(body.format) || typeof body.title !== 'string' || typeof body.content !== 'string' || (body.html !== undefined && typeof body.html !== 'string'))
      throw new HttpError(400, 'bad_request', 'Se requiere formato PDF o DOCX, título y contenido.')
    const title = body.title.trim().slice(0, 160), content = (typeof body.html === 'string' && body.html.trim() ? htmlToMarkdown(body.html.slice(0, 300000)) : body.content).trim()
    if (!title || !content || content.length > 300000) throw new HttpError(400, 'invalid_document', 'El documento está vacío o supera el límite permitido.')
    const safeTitle = title.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 100) || 'Documento'
    if (body.format === 'pdf') return new Response(await makePdf(safeTitle, content), { headers: { ...corsHeaders(req), 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="documento.pdf"', 'Cache-Control': 'no-store' } })
    return new Response(await makeDocx(safeTitle, content), { headers: { ...corsHeaders(req), 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': 'attachment; filename="documento.docx"', 'Cache-Control': 'no-store' } })
  } catch (e) { return errorResponse(req, e) }
})

function clean(s: string) {
  return s.replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1').replace(/\*(.*?)\*/g, '$1')
    .replace(/\x60([^\x60]+)\x60/g, '$1').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[—–]/g, '-')
    .replace(/…/g, '...').replace(/[^\u0009\u000A\u000D\u0020-\u00FF]/g, '').trim()
}
function decodeEntities(value: string) {
  return value.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
}
function htmlToMarkdown(html: string) {
  return decodeEntities(html.replace(/<!--[\\s\\S]*?-->/g, '').replace(/<(script|style|iframe)[^>]*>[\\s\\S]*?<\\/\\1>/gi, '')
    .replace(/<br\\s*\\/?\s*>/gi, '\n')
    .replace(/<(h1|h2|h3)\\b[^>]*>/gi, (_, tag) => '\n\n' + '#'.repeat(Number(tag[1])) + ' ')
    .replace(/<\\/h[1-3]>/gi, '\n\n')
    .replace(/<(strong|b)\\b[^>]*>/gi, '**').replace(/<\\/(strong|b)>/gi, '**')
    .replace(/<(em|i)\\b[^>]*>/gi, '*').replace(/<\\/(em|i)>/gi, '*')
    .replace(/<u\\b[^>]*>/gi, '__').replace(/<\\/u>/gi, '__')
    .replace(/<(s|strike|del)\\b[^>]*>/gi, '~~').replace(/<\\/(s|strike|del)>/gi, '~~')
    .replace(/<code\\b[^>]*>/gi, '`').replace(/<\\/code>/gi, '`')
    .replace(/<li\\b[^>]*>/gi, '\n- ').replace(/<\\/li>/gi, '\n')
    .replace(/<blockquote\\b[^>]*>/gi, '\n> ').replace(/<\\/blockquote>/gi, '\n\n')
    .replace(/<\\/(p|div|section|ul|ol|table|tr)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/[ \\t]+\\n/g, '\n').replace(/\\n{3,}/g, '\n\n')).trim()
}
function parse(s: string) {
  return s.replace(/\\r/g, '').split('\\n').map(line => {
    const t = line.trim()
    if (!t || /^\x60{3}/.test(t)) return null
    const make = (kind: string, raw: string) => ({ kind, raw, text: clean(raw) })
    if (/^#{1,3}\\s/.test(t)) return make('h' + Math.min(3, t.match(/^#+/)![0].length), t.replace(/^#{1,3}\\s*/, ''))
    if (/^[-*+]\\s/.test(t)) return make('bullet', t.replace(/^[-*+]\\s*/, ''))
    if (/^\\d+[.)]\\s/.test(t)) return make('number', t.replace(/^\\d+[.)]\\s*/, ''))
    if (/^>\\s?/.test(t)) return make('quote', t.replace(/^>\\s?/, ''))
    if (/^\\|/.test(t)) { if (/^\\|[\\s:|-]+\\|?$/.test(t)) return null; return make('table', t.replace(/^\\||\\|$/g, '').split('|').join('   •   ')) }
    return make('p', t)
  }).filter((x): x is {kind:string;text:string;raw:string} => !!x && !!x.text)
}
function inlineRuns(value: string) {
  const runs: TextRun[] = []
  const token = /(\\*\\*[^*]+\\*\\*|__[^_]+__|~~[^~]+~~|\\*[^*]+\\*|`[^`]+`)/g
  let cursor = 0
  for (const match of value.matchAll(token)) {
    const index = match.index ?? 0
    if (index > cursor) runs.push(new TextRun({ text: clean(value.slice(cursor, index)) }))
    const item = match[0]
    const bold = item.startsWith('**'), underline = item.startsWith('__'), strike = item.startsWith('~~'), code = item.startsWith('`')
    const text = item.slice(bold || underline || strike ? 2 : 1, -(bold || underline || strike ? 2 : 1))
    runs.push(new TextRun({ text: clean(text), bold, italics: !bold && !underline && !strike && !code, underline: underline ? {} : undefined, strike, font: code ? 'Consolas' : undefined }))
    cursor = index + item.length
  }
  if (cursor < value.length) runs.push(new TextRun({ text: clean(value.slice(cursor)) }))
  return runs.length ? runs : [new TextRun({ text: clean(value) })]
}
async function makePdf(title: string, md: string): Promise<Uint8Array> {
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
  page.drawText(title,{x:M,y,size:23,font:bold,color:rgb(.06,.18,.42),maxWidth:max});y-=38
  page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:1,color:rgb(.12,.34,.72)});y-=28
  let orderedIndex=0
  for(const b of parse(md)){
    if(b.kind==='number'){orderedIndex++;draw(`${orderedIndex}. ${b.text}`,regular,10.5,undefined,14);y-=5;continue}
    orderedIndex=0
    if(b.kind[0]==='h'){y-=8;draw(b.text,bold,b.kind==='h1'?17:b.kind==='h2'?14:12,rgb(.08,.22,.43));y-=5}
    else if(b.kind==='bullet'||b.kind==='number')draw((b.kind==='bullet'?'•  ':'-  ')+b.text,regular,10.5,undefined,14)
    else if(b.kind==='quote')draw(b.text,italic,10.5,rgb(.35,.38,.43),18)
    else draw(b.text,regular,10.5,undefined,b.kind==='table'?8:0)
    y-=5
  }
  const pages=pdf.getPages()
  pages.forEach((p,i)=>{p.drawLine({start:{x:M,y:42},end:{x:W-M,y:42},thickness:.5,color:rgb(.82,.84,.88)});p.drawText('Cut-real',{x:M,y:27,size:8,font:regular,color:rgb(.45,.48,.54)});p.drawText('Página '+(i+1)+' de '+pages.length,{x:W-M-70,y:27,size:8,font:regular,color:rgb(.45,.48,.54)})})
  return pdf.save()
}
async function makeDocx(title:string,md:string):Promise<Uint8Array>{
  const children:Paragraph[]=[new Paragraph({text:title,heading:HeadingLevel.TITLE,spacing:{after:280}}),new Paragraph({children:[new TextRun({text:'CUT-REAL',bold:true,color:'315B9B',size:18})],spacing:{after:240}})]
  for(const b of parse(md)){
    if(b.kind[0]==='h'){const level=b.kind==='h1'?HeadingLevel.HEADING_1:b.kind==='h2'?HeadingLevel.HEADING_2:HeadingLevel.HEADING_3;children.push(new Paragraph({children:inlineRuns(b.raw),heading:level,spacing:{before:220,after:100},keepNext:true}))}
    else if(b.kind==='bullet')children.push(new Paragraph({children:inlineRuns(b.raw),bullet:{indent:360},spacing:{after:70}}))
    else if(b.kind==='number')children.push(new Paragraph({children:[new TextRun({text:'• ' }),...inlineRuns(b.raw)],spacing:{after:70}}))
    else if(b.kind==='quote')children.push(new Paragraph({children:inlineRuns(b.raw).map(run => run),indent:{left:420},spacing:{after:100}}))
    else children.push(new Paragraph({children:inlineRuns(b.raw),alignment:AlignmentType.JUSTIFIED,spacing:{after:120,line:300}}))
  }
  const doc=new Document({title,creator:'Cut-real',sections:[{properties:{page:{margin:{top:1440,right:1440,bottom:1440,left:1440}}},footers:{default:new Footer({children:[new Paragraph({children:[new TextRun({text:'Generado con Cut-real',size:16,color:'7A8190'})],alignment:AlignmentType.CENTER})]})},children}]})
  return new Uint8Array(await Packer.toBuffer(doc))
}

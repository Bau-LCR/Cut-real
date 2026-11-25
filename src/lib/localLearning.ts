const PREF='cutreal.local-chat-learning.enabled.v1';
const DATA='cutreal.local-chat-learning.data.v1';
export type LocalChatRecord={id:string;conversationId:string;createdAt:string;question:string;answer:string;intent:string};
export function localLearningEnabled(){try{return localStorage.getItem(PREF)!=='false'}catch{return true}}
export function setLocalLearningEnabled(value:boolean){try{localStorage.setItem(PREF,String(value));window.dispatchEvent(new CustomEvent('cutreal:local-learning',{detail:value}))}catch{}}
export function readLocalLearning():LocalChatRecord[]{try{return JSON.parse(localStorage.getItem(DATA)||'[]') as LocalChatRecord[]}catch{return[]}}
export function recordLocalConversation(conversationId:string,question:string,answer:string){
 if(!localLearningEnabled()||!question.trim()||!answer.trim())return;
 const intent=/\b(hola|buenas|buenos dias)\b/i.test(question)?'saludo':/\b(gracias|te agradezco)\b/i.test(question)?'agradecimiento':/\b(adios|hasta luego|chau)\b/i.test(question)?'despedida':/\b(quien sos|quien eres)\b/i.test(question)?'identidad':'busqueda';
 const all=readLocalLearning();all.push({id:Math.random().toString(36).slice(2),conversationId,createdAt:new Date().toISOString(),question:question.slice(0,6000),answer:answer.slice(0,12000),intent});
 try{localStorage.setItem(DATA,JSON.stringify(all.slice(-150)))}catch{try{localStorage.setItem(DATA,JSON.stringify(all.slice(-30)))}catch{}}
 window.dispatchEvent(new CustomEvent('cutreal:local-learning',{detail:true}));
}
export function clearLocalLearning(){try{localStorage.removeItem(DATA);window.dispatchEvent(new CustomEvent('cutreal:local-learning',{detail:localLearningEnabled()}))}catch{}}

const SHARE_PREF='cutreal.shared-neural-contribution.enabled.v1';
export function sharedLearningEnabled(){try{return localStorage.getItem(SHARE_PREF)==='true'}catch{return false}}
export function setSharedLearningEnabled(value:boolean){try{localStorage.setItem(SHARE_PREF,String(value));window.dispatchEvent(new CustomEvent('cutreal:shared-learning',{detail:value}))}catch{}}
export function anonymizeTrainingText(value:string){return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,' [correo] ').replace(/https?:\/\/\S+/gi,' [enlace] ').replace(/\b(?:\+?\d[\d .()/-]{7,}\d)\b/g,' [numero] ').replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi,' [id] ').replace(/@\w+/g,' [usuario] ').replace(/\s+/g,' ').trim().slice(0,800)}
export function inferLocalIntent(question:string){const q=question.toLowerCase();return /\b(hola|buenas|buenos dias|buen dia)\b/.test(q)?'saludo':/\b(gracias|agradezco)\b/.test(q)?'agradecimiento':/\b(quien sos|quien eres|que sos)\b/.test(q)?'identidad':/\b(que es|qué es|explica|define)\b/.test(q)?'definicion':'busqueda'}


export function importLocalConversations(rows:{conversation_id:string;role:string;content:string;created_at?:string}[]){
 const grouped=new Map<string,{question:string;answer:string;createdAt:string}[]>();
 const byConversation=new Map<string,typeof rows>();
 for(const row of rows){const list=byConversation.get(row.conversation_id)||[];list.push(row);byConversation.set(row.conversation_id,list)}
 let imported=0;
 for(const [conversationId,list] of byConversation){
  list.sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||'')));
  let question='';
  for(const row of list){
   if(row.role==='user'){question=row.content||'';continue}
   if(row.role==='assistant'&&question&&row.content?.trim()){
    const bucket=grouped.get(conversationId)||[];
    bucket.push({question,answer:row.content,createdAt:row.created_at||new Date().toISOString()});
    grouped.set(conversationId,bucket);question='';
   }
  }
 }
 const existing=readLocalLearning();const seen=new Set(existing.map(x=>x.conversationId+'|'+x.question.slice(0,120)+'|'+x.createdAt));
 for(const [conversationId,pairs] of grouped)for(const pair of pairs){
  const key=conversationId+'|'+pair.question.slice(0,120)+'|'+pair.createdAt;if(seen.has(key))continue;
  const question=pair.question.slice(0,6000),answer=pair.answer.slice(0,12000);
  const intent=/\\b(hola|buenas|buenos dias)\\b/i.test(question)?'saludo':/\\b(gracias|te agradezco)\\b/i.test(question)?'agradecimiento':/\\b(adios|hasta luego|chau)\\b/i.test(question)?'despedida':/\\b(quien sos|quien eres)\\b/i.test(question)?'identidad':/\\b(que es|qué es|explica|explicame|derivada|define)\\b/i.test(question)?'definicion':'busqueda';
  existing.push({id:Math.random().toString(36).slice(2),conversationId,createdAt:pair.createdAt,question,answer,intent});seen.add(key);imported++;
 }
 try{localStorage.setItem(DATA,JSON.stringify(existing.slice(-500)))}catch{try{localStorage.setItem(DATA,JSON.stringify(existing.slice(-120)))}catch{}}
 window.dispatchEvent(new CustomEvent('cutreal:local-learning',{detail:true}));
 return {imported,total:readLocalLearning().length};
}

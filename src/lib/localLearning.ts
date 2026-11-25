const PREF='cutreal.local-chat-learning.enabled.v1';
const DATA='cutreal.local-chat-learning.data.v1';
export type LocalChatRecord={id:string;conversationId:string;createdAt:string;question:string;answer:string;intent:string};
export function localLearningEnabled(){try{return localStorage.getItem(PREF)!=='false'}catch{return true}}
export function setLocalLearningEnabled(value:boolean){try{localStorage.setItem(PREF,String(value));window.dispatchEvent(new CustomEvent('cutreal:local-learning',{detail:value}))}catch{}}
export function readLocalLearning():LocalChatRecord[]{try{return JSON.parse(localStorage.getItem(DATA)||'[]') as LocalChatRecord[]}catch{return[]}}
export function recordLocalConversation(conversationId:string,question:string,answer:string){
 if(!localLearningEnabled()||!question.trim())return;
 const intent=inferLocalIntent(question);
 const all=readLocalLearning();
 all.push({id:Math.random().toString(36).slice(2),conversationId,createdAt:new Date().toISOString(),question:question.slice(0,6000),answer:'',intent});
 try{localStorage.setItem(DATA,JSON.stringify(all.slice(-500)))}catch{try{localStorage.setItem(DATA,JSON.stringify(all.slice(-100)))}catch{}}
 window.dispatchEvent(new CustomEvent('cutreal:local-learning',{detail:true}));
}

export function clearLocalLearning(){try{localStorage.removeItem(DATA);window.dispatchEvent(new CustomEvent('cutreal:local-learning',{detail:localLearningEnabled()}))}catch{}}

const SHARE_PREF='cutreal.shared-neural-contribution.enabled.v1';
export function sharedLearningEnabled(){try{return localStorage.getItem(SHARE_PREF)==='true'}catch{return false}}
export function setSharedLearningEnabled(value:boolean){try{localStorage.setItem(SHARE_PREF,String(value));window.dispatchEvent(new CustomEvent('cutreal:shared-learning',{detail:value}))}catch{}}
export function anonymizeTrainingText(value:string){return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,' [correo] ').replace(/https?:\/\/\S+/gi,' [enlace] ').replace(/\b(?:\+?\d[\d .()/-]{7,}\d)\b/g,' [numero] ').replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi,' [id] ').replace(/@\w+/g,' [usuario] ').replace(/\s+/g,' ').trim().slice(0,800)}
export function inferLocalIntent(question:string){const q=question.toLowerCase();return /\b(hola|buenas|buenos dias|buen dia)\b/.test(q)?'saludo':/\b(gracias|agradezco)\b/.test(q)?'agradecimiento':/\b(quien sos|quien eres|que sos)\b/.test(q)?'identidad':/\b(que es|qué es|explica|define)\b/.test(q)?'definicion':'busqueda'}


export function importLocalConversations(rows:{conversation_id:string;role:string;content:string;created_at?:string}[]){
 const existing=readLocalLearning();
 const seen=new Set(existing.map(x=>x.conversationId+'|'+x.question.slice(0,160)+'|'+x.createdAt));
 let imported=0;
 for(const row of rows){
  if(row.role!=='user'||!row.content?.trim())continue;
  const createdAt=row.created_at||new Date().toISOString();
  const key=row.conversation_id+'|'+row.content.slice(0,160)+'|'+createdAt;
  if(seen.has(key))continue;
  existing.push({id:Math.random().toString(36).slice(2),conversationId:row.conversation_id,createdAt,question:row.content.slice(0,6000),answer:'',intent:inferLocalIntent(row.content)});
  seen.add(key);imported++;
 }
 try{localStorage.setItem(DATA,JSON.stringify(existing.slice(-500)))}catch{try{localStorage.setItem(DATA,JSON.stringify(existing.slice(-100)))}catch{}}
 window.dispatchEvent(new CustomEvent('cutreal:local-learning',{detail:true}));
 return {imported,total:readLocalLearning().length};
}

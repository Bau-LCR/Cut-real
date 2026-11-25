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

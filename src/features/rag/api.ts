export type Source={document_name:string;chunk_index:number;content:string}; export type ChatResponse={answer:string;sources:Source[]};
const base=import.meta.env.VITE_RAG_API_URL;
export async function ask(question:string):Promise<ChatResponse>{const r=await fetch(`${base}/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question})});if(!r.ok)throw new Error((await r.json()).detail??'Request failed');return r.json()}
export async function upload(file:File){const f=new FormData();f.append('file',file);const r=await fetch(`${base}/documents`,{method:'POST',body:f});if(!r.ok)throw new Error((await r.json()).detail??'Upload failed');return r.json()}

import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const cards=JSON.parse(fs.readFileSync(path.join(root,'cards.json')));
const prompts=JSON.parse(fs.readFileSync(path.join(root,'prompts.json')));
const app=express();app.use(express.static(path.join(root,'public')));app.get('/health',(_,res)=>res.json({ok:true,rooms:rooms.size}));
const http=createServer(app);const io=new Server(http,{cors:{origin:false}});const rooms=new Map();
const random=()=>crypto.randomInt(0,1000000).toString().padStart(6,'0');
const shuffle=a=>[...a].sort(()=>Math.random()-.5);
const getPlayer=(r,token)=>r.players.find(p=>p.token===token);
const err=(ack,msg)=>typeof ack==='function'&&ack({ok:false,error:msg});
const ok=(ack,data={})=>typeof ack==='function'&&ack({ok:true,...data});
const broadcast=r=>{
  for(const p of r.players){
    const round=r.round;
    const state={code:r.code,hostId:r.hostId,me:p.id,players:r.players.map(q=>({id:q.id,name:q.name,connected:!!q.socketId,score:q.score,submitted:!!round?.submissions[q.id]})),settings:r.settings,phase:r.phase,roundNumber:r.roundNumber,mode:round?.mode,prompt:round?.prompt,cards:round?.mode==='blind'&&r.phase==='playing'?round.cards.slice(0,(round.blindProgress?.[p.id]?.length||0)+1):round?.cards,blindProgress:round?.blindProgress?.[p.id]||[],rankerId:round?.rankerId,mySubmission:round?.submissions[p.id]||null,revealed:round?.revealed||null,judgeId:round?.judgeId,argumentCards:round?.argumentCards||null,selectedWinner:round?.selectedWinner||null};
    if(p.socketId)io.to(p.socketId).emit('state',state);
  }
};
function startRound(r){
 const mode='classic';
 const pool=cards.filter(c=>r.settings.categories.includes(c.category));
 if(pool.length<5)throw Error('Select categories containing at least five cards.');
 const picked=shuffle(pool).slice(0,5);
 const active=r.players.filter(p=>p.socketId);
 if(active.length<2)throw Error('At least two connected players are required.');
 const ranker=active[r.roundNumber%active.length];
 r.roundNumber++;r.phase='playing';
 r.round={mode,prompt:prompts[crypto.randomInt(prompts.length)],cards:picked,rankerId:ranker.id,judgeId:ranker.id,submissions:{},blindProgress:{},revealed:null,selectedWinner:null,argumentCards:mode==='defend'?Object.fromEntries(active.filter(p=>p.id!==ranker.id).map((p,i)=>[p.id,picked[i%picked.length]])):null};
 broadcast(r);
}
function finish(r){
 const round=r.round;
 if(round.mode==='classic'){
 const target=round.submissions[round.rankerId];
 if(!target)throw Error('Ranker has not submitted.');
 const scoring={};
 for(const p of r.players){if(p.id===round.rankerId)continue;const guess=round.submissions[p.id];if(!guess)continue;const exact=guess.filter((id,i)=>id===target[i]).length;const points=exact+(exact===5?2:0);p.score+=points;scoring[p.id]={points,exact};}
 round.revealed={target,scoring};
 }else if(round.mode==='blind'){
 const scoring={};
 // The designated Ranker's blind order is the benchmark, not an arbitrary random order.
 const target=round.submissions[round.rankerId];
 for(const p of r.players){const guess=round.submissions[p.id];if(!guess)continue;const exact=guess.filter((id,i)=>id===target[i]).length;const points=exact+(exact===5?2:0);p.score+=points;scoring[p.id]={points,exact};}
 round.revealed={target,scoring};
 }else{
 round.revealed={arguments:Object.fromEntries(r.players.filter(p=>round.submissions[p.id]).map(p=>[p.id,round.submissions[p.id]]))};
 }
 r.phase='reveal';broadcast(r);
}
function safeCall(socket,ack,fn){try{fn()}catch(e){err(ack,e.message||'Something went wrong.')}}
io.on('connection',socket=>{
 socket.on('create',({name,token},ack)=>safeCall(socket,ack,()=>{
  name=String(name||'').trim().slice(0,24);if(!name)return err(ack,'Enter a name.');
  let code;do{code=random()}while(rooms.has(code));
  const id=crypto.randomUUID();token=typeof token==='string'&&token.length>15?token:crypto.randomUUID();
  const categories=[...new Set(cards.map(c=>c.category))];const r={code,hostId:id,players:[{id,name,token,socketId:socket.id,score:0}],settings:{mode:'classic',categories},phase:'lobby',roundNumber:0,round:null};rooms.set(code,r);socket.data={code,token};ok(ack,{code,token});broadcast(r);
 }));
 socket.on('join',({code,name,token},ack)=>safeCall(socket,ack,()=>{
  code=String(code||'').trim();const r=rooms.get(code);if(!r)return err(ack,'Room not found.');
  let p=typeof token==='string'?getPlayer(r,token):null;
  if(!p){if(r.phase!=='lobby')return err(ack,'Game already started. Rejoin using your original device.');if(r.players.length>=16)return err(ack,'Room is full.');name=String(name||'').trim().slice(0,24);if(!name)return err(ack,'Enter a name.');p={id:crypto.randomUUID(),name,token:crypto.randomUUID(),socketId:null,score:0};r.players.push(p)}
  if(p.socketId&&p.socketId!==socket.id)io.to(p.socketId).emit('replaced');p.socketId=socket.id;socket.data={code,token:p.token};ok(ack,{code,token:p.token});broadcast(r);
 }));
 function action(ack,fn){safeCall(socket,ack,()=>{const {code,token}=socket.data||{};const r=rooms.get(code);const p=r&&getPlayer(r,token);if(!r||!p||p.socketId!==socket.id)return err(ack,'Join a room first.');fn(r,p)})}
 socket.on('restart',(data,ack)=>action(ack,(r,p)=>{
  if(r.hostId!==p.id)return err(ack,'Only the host can restart the game.');
  r.players.forEach(q=>{q.score=0});r.round=null;r.roundNumber=0;r.phase='lobby';
  ok(ack);broadcast(r);
 }));
 socket.on('leave',(data,ack)=>action(ack,(r,p)=>{
  r.players=r.players.filter(q=>q.id!==p.id);
  socket.data={};
  if(r.players.length===0){rooms.delete(r.code)}else{
   if(r.hostId===p.id)r.hostId=r.players[0].id;
   if(r.phase!=='lobby'){r.phase='lobby';r.round=null;r.roundNumber=0;r.players.forEach(q=>q.score=0)}
   broadcast(r);
  }
  ok(ack);
 }));
 socket.on('settings',(data,ack)=>action(ack,(r,p)=>{if(r.hostId!==p.id||r.phase!=='lobby')return err(ack,'Only the host can change settings in the lobby.');if(data.mode!=='classic')return err(ack,'Only Classic Pecking is available.');const allowed=[...new Set(cards.map(c=>c.category))];const selected=allowed.filter(c=>data.categories?.includes(c));if(cards.filter(c=>selected.includes(c.category)).length<5)return err(ack,'Choose at least five cards.');r.settings={mode:data.mode,categories:selected};ok(ack);broadcast(r)}));
 socket.on('start',(data,ack)=>action(ack,(r,p)=>{if(r.hostId!==p.id)return err(ack,'Only the host can start rounds.');if(!['lobby','reveal'].includes(r.phase))return err(ack,'Round already underway.');startRound(r);ok(ack)}));
 socket.on('blind_place',({position},ack)=>action(ack,(r,p)=>{const rd=r.round;if(r.phase!=='playing'||rd?.mode!=='blind')return err(ack,'Not a blind round.');if(rd.submissions[p.id])return err(ack,'Already finished.');const seq=rd.blindProgress[p.id]||[];if(!Number.isInteger(position)||position<0||position>seq.length)return err(ack,'Invalid position.');const next=rd.cards[seq.length];if(!next)return err(ack,'No cards left.');seq.splice(position,0,next.id);rd.blindProgress[p.id]=seq;if(seq.length===5)rd.submissions[p.id]=seq;ok(ack);const needed=r.players.filter(q=>q.socketId);if(needed.every(q=>rd.submissions[q.id]))finish(r);else broadcast(r)}));
 socket.on('submit',({order,argument},ack)=>action(ack,(r,p)=>{
 const rd=r.round;if(r.phase!=='playing'||!rd)return err(ack,'No active round.');if(rd.submissions[p.id])return err(ack,'Already submitted.');
 if(rd.mode==='blind')return err(ack,'Place cards one at a time.');
 if(rd.mode==='defend'){
  if(p.id===rd.judgeId)return err(ack,'The judge does not submit an argument.');const str=String(argument||'').trim().slice(0,400);if(!str)return err(ack,'Write your argument.');rd.submissions[p.id]=str;
 }else{
  if(!Array.isArray(order)||order.length!==5||new Set(order).size!==5||!order.every(id=>rd.cards.some(c=>c.id===id)))return err(ack,'Invalid ranking.');rd.submissions[p.id]=order;
 }
 ok(ack);const needed=r.players.filter(q=>q.socketId&&(rd.mode!=='defend'||q.id!==rd.judgeId));if(needed.every(q=>rd.submissions[q.id]))finish(r);else broadcast(r);
 }));
 socket.on('award',({winnerId},ack)=>action(ack,(r,p)=>{
 const rd=r.round;if(r.phase!=='reveal'||rd?.mode!=='defend'||rd.judgeId!==p.id)return err(ack,'Only the judge can select a winner.');if(rd.selectedWinner)return err(ack,'Winner already chosen.');if(!rd.submissions[winnerId])return err(ack,'Choose a player who submitted.');rd.selectedWinner=winnerId;r.players.find(q=>q.id===winnerId).score+=3;ok(ack);broadcast(r);
 }));
 socket.on('disconnect',()=>{const {code,token}=socket.data||{};const r=rooms.get(code),p=r&&getPlayer(r,token);if(p&&p.socketId===socket.id){p.socketId=null;broadcast(r)}});
});
setInterval(()=>{for(const [code,r] of rooms){if(!r.players.some(p=>p.socketId))rooms.delete(code)}},1000*60*60);
http.listen(process.env.PORT||3000,()=>console.log(`Pecking Order listening on ${process.env.PORT||3000}`));

/** Candidate generation is mechanical. No candidate text is invented by Jev. */
export function textCandidates(transcript,limit=24){
  const raw=String(transcript);
  let end=raw.length;
  while(end>0&&/[\s，,。.!！?？；;]/.test(raw[end-1]))end--;
  if(!end)return [];
  const starts=new Set();
  // Short trailing spans cover unquoted phrases such as “改成开始使用”.
  for(let start=end-1;start>=Math.max(0,end-18);start--)starts.add(start);
  // Boundaries help preserve longer user text without enumerating every substring.
  for(let index=Math.max(0,end-80);index<end;index++){
    if(/[\s，,：:「“]/.test(raw[index]))starts.add(index+1);
    if(/[成上写为是叫个]/.test(raw[index]))starts.add(index+1);
  }
  const candidates=[...starts].filter(start=>start<end&&end-start<=80&&!/^\s/.test(raw[start]))
    .sort((a,b)=>b-a).slice(0,limit)
    .map((start,index)=>({id:'span_'+index,start,end,text:raw.slice(start,end)}));
  return candidates;
}

/** The model returns only an ID. This function retrieves exact characters. */
export function selectOriginalText(transcript,candidates,answer){
  if(answer?.type!=='choice'||typeof answer.confidence!=='number'||answer.confidence<.8)
    throw Error('Jev 对文字片段的判断不够明确；画布未修改。');
  if(answer.choice==='none')throw Error('没有找到明确要显示的文字；画布未修改。');
  const candidate=candidates.find(item=>item.id===answer.choice);
  if(!candidate)throw Error('Jev 选择的文字候选不在本句转写中；画布未修改。');
  const original=String(transcript).slice(candidate.start,candidate.end);
  if(original!==candidate.text||!original.trim())throw Error('文字候选与原始转写不一致；画布未修改。');
  return {kind:'text',text:original,source:{start:candidate.start,end:candidate.end}};
}

export async function selectContentSpan(transcript,context,key,fetchImpl){
  const candidates=textCandidates(transcript);
  if(!candidates.length)throw Error('本句没有可选的原文文字。');
  const criteria={none:'没有明确需要显示在画布上的原文片段'};
  for(const item of candidates)criteria[item.id]=
    `语音转写原文的第 ${item.start} 到 ${item.end} 个字符：${JSON.stringify(item.text)}`;
  const response=await fetchImpl('https://api.typesafe.ai/v1/systemone',{
    method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({
      model:'jev-latest',
      state:{original_transcript:transcript,conversation:context},
      questions:{contentSpan:{
        type:'choice',
        instructions:'哪个候选片段正是用户要显示在画布上的文字？只选候选编号；不要选目标名称、位置词或动作词。没有准确候选时选“没有明确片段”。',
        criteria
      }}
    }),
    signal:AbortSignal.timeout(8000)
  });
  if(!response.ok)throw Error('Jev 文字候选请求失败（HTTP '+response.status+'）。');
  const data=await response.json();
  return {value:selectOriginalText(transcript,candidates,data.answers?.contentSpan),
    confidence:data.answers.contentSpan.confidence,model:data.model};
}

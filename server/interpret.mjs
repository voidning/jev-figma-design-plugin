import {questions} from './questions.mjs';
import {compose,UncertainChoiceError,additionalCopies,parseLength} from './compose.mjs';
import {selectContentSpan} from './text-content.mjs';
export {additionalCopies,parseLength};

const endpoint='https://api.typesafe.ai/v1/systemone';

async function evaluate(utterance,key,context,fetchImpl,asked=questions){
  const response=await fetchImpl(endpoint,{
    method:'POST',
    headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({model:'jev-latest',state:{utterance,conversation:context},questions:asked}),
    signal:AbortSignal.timeout(8000)
  });
  if(!response.ok)throw Error('Jev 请求失败（HTTP '+response.status+'）。');
  const data=await response.json();
  if(!data||typeof data.answers!=='object')throw Error('Jev 响应缺少结构化答案。');
  return data;
}

const confident=answer=>answer?.type==='choice'&&answer.confidence>=.8;

function knownIntent(answers,uncertainAxis){
  return Object.fromEntries(Object.keys(questions).filter(axis=>axis!==uncertainAxis&&confident(answers?.[axis]))
    .map(axis=>[axis,answers[axis].choice]));
}

/** One clause: parallel judgments, then focused Jev questions only for axes
 * the command composer actually needs. No phrase-based intent fallback. */
async function interpretClause(clause,key,context,fetchImpl,first,offset=0){
  const response=first||await evaluate(clause,key,context,fetchImpl);
  let answers=response.answers;
  let content;
  let contentConfidence=1;
  const maxFocusedRequests=3;
  for(let focusedCount=0;;){
    try{
      const mayContainVisibleText=['add','set'].includes(answers?.operation?.choice)&&
        (answers?.operand?.choice==='text'||answers?.operation?.choice==='add'&&
          answers?.operand?.choice==='object'&&answers?.objectFamily?.choice==='text');
      if(mayContainVisibleText&&!confident(answers?.valueKind))
        throw new UncertainChoiceError('valueKind');
      const contentRequested=answers?.valueKind?.choice==='text'&&confident(answers.valueKind)&&
        mayContainVisibleText;
      if(contentRequested&&!content){
        const selected=await selectContentSpan(clause,context,key,fetchImpl);
        // Preserve exact characters and offsets from this final transcript.
        selected.value.source.start+=offset;
        selected.value.source.end+=offset;
        content=selected.value;
        contentConfidence=selected.confidence;
      }
      const composed=compose(answers,clause,context,content);
      return {...composed,confidence:Math.min(composed.confidence,contentConfidence)};
    }catch(error){
      if(!(error instanceof UncertainChoiceError)||focusedCount>=maxFocusedRequests)throw error;
      focusedCount++;
      const axis=error.axis;
      const previous=answers?.[axis];
      const focused=await evaluate(clause,key,{...context,knownIntent:knownIntent(answers,axis)},
        fetchImpl,{[axis]:questions[axis]});
      let answer=focused.answers?.[axis];
      if(!confident(answer)&&axis==='operand')
        answer=resolveCreateOperand({...answers,operand:answer})||answer;
      if(!confident(answer)&&axis==='target')
        answer=resolveUniqueTarget(context,previous,answer)||answer;
      if(!confident(answer))throw error;
      answers={...answers,[axis]:answer};
    }
  }
}

function resolveUniqueTarget(context,previous,focused){
  const unique=context.activeCount===1&&(!context.selectedCount||context.selectedMatchesActive===true);
  const implicit=['current','selected'].includes(focused?.choice)||
    ['current','selected'].includes(previous?.choice);
  return unique&&implicit?{type:'choice',choice:'current',confidence:1}:null;
}

/** Resolve only a uniquely specified creation from other confident Jev axes.
 * This never reads wording from the transcript and cannot turn text or styling
 * requests into object creation. Every supporting axis must pass the gate. */
function resolveCreateOperand(answers){
  const confident=(key,choices)=>{
    const answer=answers?.[key];
    return answer?.type==='choice'&&answer.confidence>=.8&&choices.includes(answer.choice)?answer:null;
  };
  const operation=confident('operation',['add']);
  const family=confident('objectFamily',['graphic','component']);
  const position=confident('position',['here','left','right','above','below']);
  const category=confident('attributeCategory',['none']);
  const value=confident('valueKind',['none']);
  if(!operation||!family||!position||!category||!value)return null;
  const specific=family.choice==='graphic'?confident('shapeKind',['circle','rectangle']):
    confident('componentSemantic',['button']);
  if(!specific)return null;
  return {type:'choice',choice:'object',confidence:Math.min(operation.confidence,family.confidence,
    position.confidence,category.confidence,value.confidence,specific.confidence)};
}

function splitClauses(utterance){
  const clauses=[];
  const boundary=/[，,；;]|然后/g;
  let start=0,match;
  while((match=boundary.exec(utterance))){
    const raw=utterance.slice(start,match.index);
    const trimmed=raw.trim();
    if(trimmed)clauses.push({text:trimmed,offset:start+raw.indexOf(trimmed)});
    start=match.index+match[0].length;
  }
  const raw=utterance.slice(start),trimmed=raw.trim();
  if(trimmed)clauses.push({text:trimmed,offset:start+raw.indexOf(trimmed)});
  return clauses;
}

/** Dependent clauses become an ordered command sequence. Jev classifies each
 * clause with the preceding command summaries; code resolves IDs at execution. */
export async function interpretWithJev(text,key,context={},fetchImpl=fetch){
  if(typeof text!=='string'||!text.trim()||text.length>500)throw Error('请输入不超过 500 字的指令。');
  if(!key)throw Error('未配置 TYPESAFE_API_KEY，Jev 自动执行不可用。');
  const utterance=text.trim();
  const first=await evaluate(utterance,key,context,fetchImpl);
  const clauses=splitClauses(utterance);
  let relation=first.answers.clauseRelation;
  if(clauses.length===1||confident(relation)&&relation.choice==='continuation'){
    const composed=await interpretClause(utterance,key,context,fetchImpl,first);
    return {...composed,source:'jev',model:first.model};
  }
  if(!confident(relation)){
    const focused=await evaluate(utterance,key,{...context,
      knownIntent:knownIntent(first.answers,'clauseRelation')},fetchImpl,
    {clauseRelation:questions.clauseRelation});
    relation=focused.answers?.clauseRelation;
  }
  if(confident(relation)&&relation.choice==='continuation'){
    const composed=await interpretClause(utterance,key,context,fetchImpl,first);
    return {...composed,source:'jev',model:first.model};
  }
  if(!relation||relation.type!=='choice'||relation.confidence<.8||
    !['separate','dependent'].includes(relation.choice))
    throw Error('Jev 无法确定分句关系，请分开说；画布未修改。');
  if(clauses.length>3)throw Error('请把这句话拆成更短的步骤。');
  if(relation.choice==='dependent'){
    const steps=[];
    for(const clause of clauses){
      const step=await interpretClause(clause.text,key,{...context,priorSteps:steps.map(item=>item.command)},fetchImpl,undefined,clause.offset);
      if(step.command.kind!=='edit'||step.command.operation==='undo')
        throw Error('依赖分句只能包含可顺序执行的编辑。');
      if(steps.length===0&&!(step.command.operation==='add'&&
        ['object','property'].includes(step.command.operand)))
        throw Error('依赖分句须从明确的添加操作开始。');
      if(steps.length>0&&step.command.target!=='previous')
        throw Error('后续分句须明确指向刚创建或修改的对象。');
      steps.push(step);
    }
    return {command:{kind:'sequence',commands:steps.map(item=>item.command)},
      confidence:Math.min(relation.confidence,...steps.map(item=>item.confidence)),source:'jev',model:first.model};
  }
  const edits=await Promise.all(clauses.map(part=>interpretClause(part.text,key,context,fetchImpl,undefined,part.offset)));
  if(edits.some(edit=>edit.command.kind!=='edit'||!['set','adjust'].includes(edit.command.operation)||edit.command.operand!=='property'))
    throw Error('独立分句只能修改不同目标；请分开说。');
  const targets=edits.map(edit=>edit.command.target);
  if(new Set(targets).size!==targets.length)throw Error('同一句话对同一目标有冲突修改。');
  return {
    command:{kind:'batch',commands:edits.map(edit=>edit.command)},
    confidence:Math.min(relation.confidence,...edits.map(edit=>edit.confidence)),
    source:'jev',model:first.model
  };
}

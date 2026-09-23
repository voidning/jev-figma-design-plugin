import {describe,it,expect} from 'vitest';
import {AckQueue,collectSpeech,isStopPhrase} from '../src/voice-queue';

describe('continuous voice steps',()=>{
  it('keeps interim text and ignores repeated final result indices',()=>{
    const seen=new Set<number>();
    const results=[{isFinal:true,0:{transcript:'创建主要按钮'}},{isFinal:false,0:{transcript:'复制成三'}}];
    expect(collectSpeech(results,0,seen)).toEqual({final:['创建主要按钮'],interim:'复制成三'});
    expect(collectSpeech(results,0,seen)).toEqual({final:[],interim:'复制成三'});
    results[1]={isFinal:true,0:{transcript:'复制成三个按钮'}};
    expect(collectSpeech(results,1,seen)).toEqual({final:['复制成三个按钮'],interim:''});
  });
  it('waits for each execution acknowledgement before dispatching the next step',()=>{
    const sent:number[]=[];
    const queue=new AckQueue<number>(value=>sent.push(value));
    queue.enqueue(1);queue.enqueue(2);queue.enqueue(3);
    expect(sent).toEqual([1]);
    queue.finish();expect(sent).toEqual([1,2]);
    queue.finish();expect(sent).toEqual([1,2,3]);
  });
  it('recognizes either order of a spoken stop command',()=>{
    expect(isStopPhrase('好，就这样，停')).toBe(true);
    expect(isStopPhrase('停，就这样')).toBe(true);
    expect(isStopPhrase('三个都大一点')).toBe(false);
  });
});

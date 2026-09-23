import {describe,it,expect} from 'vitest';
import {parse} from '../src/parser';
describe('constrained parser',()=>{
 it('parses exact values',()=>{expect(parse('间距改成 8 px').intent).toEqual({kind:'gap',value:8});expect(parse('宽度设为 120 px').intent).toEqual({kind:'width',value:120});});
 it('rejects inferred values',()=>{expect(parse('间距小一点').error).toMatch(/明确数值/);expect(parse('宽度 120000 px').error).toMatch(/0–10000/);});
 it('recognizes design commands',()=>{expect(parse('这个按钮小一点').intent).toEqual({kind:'smaller'});expect(parse('应用 Brand/Primary 填充样式').intent).toEqual({kind:'style',name:'Brand/Primary'});});
});
describe('ambiguous wording regression',()=>{
 it('uses the requested final value',()=>{expect(parse('2 个按钮间距改成 8 px').intent).toEqual({kind:'gap',value:8});expect(parse('内边距从 16 改成 12 px').intent).toEqual({kind:'padding',value:12});expect(parse('间距改成 8 px，应用到 2 个按钮').intent).toEqual({kind:'gap',value:8});expect(parse('宽度设为 120 px，处理 3 个卡片').intent).toEqual({kind:'width',value:120});expect(parse('间距改成 8 px 然后应用到 2 个按钮').intent).toEqual({kind:'gap',value:8});expect(parse('宽度由 100 px 调整为 120 px').intent).toEqual({kind:'width',value:120});expect(parse('内边距从 16 px 调整到 12 px').intent).toEqual({kind:'padding',value:12});expect(parse('gap from 8 px to 12 px').intent).toEqual({kind:'gap',value:12});expect(parse('间距 8 或 12').error).toMatch(/多个候选/);expect(parse('间距 8 或 12 px').error).toMatch(/多个候选/);expect(parse('间距 8 px 或 12').error).toMatch(/多个候选/);expect(parse('间距 8 px，或者 12 px').error).toMatch(/多个候选/);});
 it('resolves distribution before direction',()=>{expect(parse('纵向等距分布').intent).toEqual({kind:'distribute',value:'vertical'});expect(parse('横向等距分布').intent).toEqual({kind:'distribute',value:'horizontal'});});
 it('retains the alignment axis',()=>{expect(parse('顶部对齐').intent).toEqual({kind:'align',axis:'vertical',value:'MIN'});});
});
describe('button workflow',()=>{
 it('parses the complete sequence',()=>{
  expect(parse('在这里创建一个按钮').intent).toEqual({kind:'createButton'});
  expect(parse('在这里创建一个主要按钮').intent).toEqual({kind:'createButton',role:'primary'});
  expect(parse('复制成三个按钮').intent).toEqual({kind:'duplicateButtons',total:3});
  expect(parse('把这个按钮复制成三个，横向并排').intent).toEqual({kind:'duplicateButtons',total:3});
  expect(parse('第一个保持主要按钮').intent).toEqual({kind:'ensurePrimary'});
  expect(parse('第二个改成灰色的次要按钮，第三个改成红色的危险按钮').intent).toEqual({kind:'setButtonTypes',changes:[{index:2,role:'secondary'},{index:3,role:'danger'}]});
  expect(parse('第二个改成灰色的，第三个改成红色的').intent).toEqual({kind:'colorButtons',changes:[{index:2,color:'gray'},{index:3,color:'red'}]});
 });
 it('rejects incomplete or conflicting batch colors',()=>{
  expect(parse('第二个改成灰色的，第二个改成红色的').error).toMatch(/分别说明/);
  expect(parse('第二个改成灰色的，第三个改成灰色的').error).toMatch(/明确指定/);
 });
});

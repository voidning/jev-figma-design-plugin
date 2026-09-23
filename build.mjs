import { build, context } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
const opts = { entryPoints: ['src/code.ts'], outfile: 'dist/code.js', bundle: true, target: 'es2020', format: 'iife' };
const ui = async () => {
  const js = await build({entryPoints:['src/ui.ts'], bundle:true, target:'es2020', format:'iife', write:false});
  const html = await readFile('src/ui.html','utf8');
  await writeFile('dist/ui.html', html.replace('<!-- SCRIPT -->', `<script>${js.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`));
};
if (process.argv.includes('--watch')) {
  const ctx = await context(opts); await ctx.watch(); await ui();
  console.log('Watching plugin code. Run npm run build after changing UI.');
} else { await build(opts); await ui(); console.log('Built dist/code.js and dist/ui.html'); }

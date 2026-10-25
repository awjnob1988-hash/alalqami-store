const fs=require('node:fs');
const path=require('node:path');
const esbuild=require('esbuild');
async function build(){
 const font=fs.readFileSync(path.join(__dirname,'fonts/Amiri-Regular.ttf')).toString('base64');
 const result=await esbuild.build({entryPoints:[path.join(__dirname,'browser.mjs')],bundle:true,minify:true,platform:'browser',format:'iife',target:['es2020'],write:false,plugins:[{name:'invoice-font',setup(b){b.onLoad({filter:/\.ttf$/},()=>({contents:'export default '+JSON.stringify(font),loader:'js'}))}}]});
 fs.writeFileSync(path.join(__dirname,'invoice.bundle.txt'),result.outputFiles[0].contents);
}
build().catch(e=>{console.error(e);process.exitCode=1});

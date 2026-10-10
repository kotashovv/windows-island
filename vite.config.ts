import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({command,mode})=>({
  define:{__ISLAND_WEB__:JSON.stringify(command==='serve'||mode==='demo')},
  plugins:[react(),{name:'strip-production-demo-styles',enforce:'pre',transform(code,id){
    if(command==='build'&&mode!=='demo'&&id.endsWith('/src/style.css'))return code.replace(/[^{}]*\.(?:demo-|preview)[^{]*\{[^{}]*\}/g,'');
  }}],base:'./',server:{port:5173,strictPort:true}
}));

import fs from 'node:fs';
import zlib from 'node:zlib';
const size=256,raw=Buffer.alloc((size*4+1)*size);
const rounded=(x,y,l,t,w,h,r)=>{const dx=Math.max(l+r-x,0,x-(l+w-r));const dy=Math.max(t+r-y,0,y-(t+h-r));return x>=l&&x<=l+w&&y>=t&&y<=t+h&&dx*dx+dy*dy<=r*r;};
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=y*(size*4+1)+1+x*4;let rr=0,gg=0,bb=0,aa=0;
  for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++){
    const px=x+(sx+.5)/4,py=y+(sy+.5)/4;
    if(!rounded(px,py,4,4,248,248,60))continue;
    const mark=rounded(px,py,75,78,42,100,21)||rounded(px,py,135,99,42,58,21);
    rr+=mark?193:25;gg+=mark?217:29;bb+=mark?185:28;aa+=255;
  }
  raw[i]=aa?Math.round(rr/(aa/255)):0;raw[i+1]=aa?Math.round(gg/(aa/255)):0;raw[i+2]=aa?Math.round(bb/(aa/255)):0;raw[i+3]=Math.round(aa/16);
}
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type);const result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);name.copy(result,4);data.copy(result,8);result.writeUInt32BE(crc32(Buffer.concat([name,data])),data.length+8);return result;}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
fs.mkdirSync('electron/assets',{recursive:true});fs.writeFileSync('electron/assets/icon.png',png);fs.writeFileSync('electron/assets/icon.ico',Buffer.concat([header,png]));

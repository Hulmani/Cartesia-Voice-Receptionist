import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
const files=['silero_vad_v5.onnx','vad.worklet.bundle.min.js','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'];
for(const file of files){
 const source=await readFile(join('public/vad',file));
 const built=await readFile(join('dist/client/vad',file));
 if(!source.length || !source.equals(built)) throw new Error(`Missing, empty, or mismatched deployed speech detector asset: ${file}`);
}
console.log('Verified all four speech detector assets in deployment output.');

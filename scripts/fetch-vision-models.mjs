import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const models = {
  'face-detector.tflite': 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
  'object-detector.tflite': 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite'
};
const destination = 'public/workspace/vendor/mediapipe/models';
await mkdir(destination, {recursive: true});
const manifest = {};
for (const [filename, url] of Object.entries(models)) {
  let data;
  try { data = await readFile(`${destination}/${filename}`); }
  catch {
    const response = await fetch(url, {signal: AbortSignal.timeout(60000)});
    if (!response.ok) throw new Error(`Official model download failed: ${filename} (${response.status})`);
    data = Buffer.from(await response.arrayBuffer());
    if (data.length < 1000 || data.subarray(4, 8).toString() !== 'TFL3') throw new Error(`Invalid TensorFlow Lite model: ${filename}`);
    await writeFile(`${destination}/${filename}`, data);
  }
  manifest[filename] = {source: url, size: data.length, sha256: createHash('sha256').update(data).digest('hex')};
  console.log(`Prepared ${filename}: ${data.length} bytes`);
}
await writeFile(`${destination}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');

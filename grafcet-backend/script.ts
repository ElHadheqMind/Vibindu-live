import { Disk } from 'flydrive';
import { FSDriver } from 'flydrive/drivers/fs';

const driver = new FSDriver({ location: './data', visibility: 'private' });
const disk = new Disk(driver);

async function test() {
  await disk.put('test10/modes/.keep', '');
  try {
    const listRes = await disk.listAll('test10', { recursive: true });
    const items = Array.from(listRes.objects || []);
    for (const obj of items) {
      console.log('Object keys:', Object.keys(obj));
      console.log('Is obj a directory?', (obj as any).isDirectory);
      console.log('Name:', (obj as any).name);
      console.log('Path:', (obj as any).path || (obj as any).key || (obj as any).prefix);
    }
  } catch(e) { console.log('list err:', (e as Error).stack); }
}
test();

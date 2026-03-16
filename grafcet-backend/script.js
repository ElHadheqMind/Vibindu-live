import { Disk } from 'flydrive';
import { FSDriver } from 'flydrive/drivers/fs';

const driver = new FSDriver({ location: './data', visibility: 'private' });
const disk = new Disk(driver);

async function test() {
  const result = disk.flatList('/');
  console.log('flatList returns:', result);
  try {
     const awaited = await result;
     console.log('awaited:', awaited);
  } catch (e) {
     console.log('flatList error:', e.message);
  }
}
test();

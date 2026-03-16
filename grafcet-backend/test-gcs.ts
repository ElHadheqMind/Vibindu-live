import { Disk } from 'flydrive';
import { GCSDriver } from 'flydrive/drivers/gcs';

const driver = new GCSDriver({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  bucket: process.env.STORAGE_BUCKET || 'vibindu-storage'
});

async function test() {
  try {
    const storage = (driver as any).storage || (driver as any)._storage || (driver as any)['#storage'];
    console.log('Storage object exists:', !!storage);
    
    if (storage && typeof storage.bucket === 'function') {
      const bucket = storage.bucket(process.env.STORAGE_BUCKET || 'vibindu-storage');
      
      console.log('Putting a test file...');
      await driver.put('test-delete/file.txt', 'hello');
      
      console.log('File successfully created. Now deleting prefix...');
      
      const [files] = await bucket.getFiles({ prefix: 'test-delete/' });
      console.log('Files before delete:', files.map((f: any) => f.name));
      
      await bucket.deleteFiles({ prefix: 'test-delete/', force: true });
      
      const [filesAfter] = await bucket.getFiles({ prefix: 'test-delete/' });
      console.log('Files after delete:', filesAfter.map((f: any) => f.name));
    } else {
      console.log('Storage object structure is different.');
    }
  } catch(e) {
    console.error('Error:', e);
  }
}

test();

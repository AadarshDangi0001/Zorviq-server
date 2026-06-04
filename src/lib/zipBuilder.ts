import JSZip from 'jszip';
import {
  buildIndexHtml,
  buildReadme,
  type BuildProjectZipInput,
  toSafeFileName,
} from './projectFiles.js';

export type { BuildProjectZipInput };

export async function buildProjectZip(input: BuildProjectZipInput): Promise<{
  buffer: Buffer;
  fileName: string;
}> {
  const zip = new JSZip();
  zip.file('index.html', buildIndexHtml(input));
  zip.file('README.md', buildReadme(input));

  return {
    buffer: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
    fileName: `${toSafeFileName(input.projectName)}.zip`,
  };
}

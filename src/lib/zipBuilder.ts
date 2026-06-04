import JSZip from 'jszip';

type BuildProjectZipInput = {
  projectName: string;
  currentCode: string;
};

const toSafeFileName = (name: string): string => {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'zorviq-project';
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildIndexHtml = ({
  projectName,
  currentCode,
}: BuildProjectZipInput): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(projectName)}</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
${currentCode}
  </body>
</html>
`;

const buildReadme = ({ projectName }: BuildProjectZipInput): string => `# ${projectName}

This archive was exported from Zorviq.

## Run locally

Open \`index.html\` in a modern browser. The page uses the Tailwind CDN for styling.
`;

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

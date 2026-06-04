export type BuildProjectZipInput = {
  projectName: string;
  currentCode: string;
};

export type ProjectFile = {
  path: string;
  content: string;
};

export const toSafeFileName = (name: string): string => {
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

export const buildIndexHtml = ({
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

export const buildReadme = ({ projectName }: BuildProjectZipInput): string => `# ${projectName}

This archive was exported from Zorviq.

## Run locally

Open \`index.html\` in a modern browser. The page uses the Tailwind CDN for styling.
`;

export function getProjectFiles(input: BuildProjectZipInput): ProjectFile[] {
  return [
    { path: 'index.html', content: buildIndexHtml(input) },
    { path: 'README.md', content: buildReadme(input) },
  ];
}

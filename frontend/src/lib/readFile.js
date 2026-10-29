/**
 * readFile.js – turns an uploaded .txt or .docx into plain text IN THE BROWSER.
 *
 * The file itself is never sent to the server: the back end only accepts JSON
 * text (its threat model rules out file-upload attacks for that reason). We
 * extract the words here and send them exactly like pasted text, so the same
 * back-end size and content checks apply.
 */

export const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB is far more than 10,000 characters of text
export const ACCEPTED = '.txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export class FileReadError extends Error {}

export async function readTextFromFile(file) {
  const name = file.name || 'file';
  const ext = name.toLowerCase().split('.').pop();

  if (file.size > MAX_FILE_BYTES) {
    throw new FileReadError(`“${name}” is larger than 2 MB. Please upload a smaller file or paste the text.`);
  }
  if (file.size === 0) {
    throw new FileReadError(`“${name}” is empty.`);
  }

  if (ext === 'txt') {
    const text = await file.text();
    if (text.includes('\u0000')) {
      throw new FileReadError(`“${name}” doesn’t look like a text file.`);
    }
    return { text, source: 'txt' };
  }

  if (ext === 'docx') {
    // Loaded only when needed, so the first page load stays small.
    const mammoth = await import('mammoth');
    try {
      const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return { text: value, source: 'docx' };
    } catch {
      throw new FileReadError(`“${name}” couldn’t be read. Is it a Word (.docx) document?`);
    }
  }

  throw new FileReadError('Only .txt and .docx files are supported. For other formats, copy and paste the text.');
}

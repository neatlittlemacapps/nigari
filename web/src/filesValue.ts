// A Files & media value in the browser (spec 028): reading what is stored,
// and the edits the interface makes to it. Pure, so check-filesvalue.mjs can
// pin the rules down.
//
// The stored shape is the server's (server/filesprop.go, plan D1):
//   [{ "url": "/files/<stored name>", "name": "<name as uploaded>" }, …]
// readFiles accepts only that. Anything else (a value left over from before a
// type change, which keeps its values: plan D10) reads as no files, so a
// property changed to Files & media shows an empty cell, not a crash or a
// broken image.

import type { FileListItem } from './ui/FileList';

/** One file of a value. `claim` only on a public form's upload before it is
 *  sent: the server takes it back with the submission (form_uploads.go) and
 *  never stores it. */
export type FileItem = { url: string; name: string; claim?: string };

/** A plain upload of this instance: one path segment under /files/. */
export function isStoredFileUrl(url: string): boolean {
  if (!url.startsWith('/files/')) return false;
  const name = url.slice('/files/'.length);
  return name !== '' && name !== '.' && name !== '..' && !/[/\\%?#\u0000-\u001f\u007f]/.test(name);
}

/** The files of a stored value, in order; [] for any other shape. */
export function readFiles(value: unknown): FileItem[] {
  if (!Array.isArray(value)) return [];
  const out: FileItem[] = [];
  for (const it of value) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) continue;
    const { url, name, claim } = it as { url?: unknown; name?: unknown; claim?: unknown };
    if (typeof url !== 'string' || !isStoredFileUrl(url)) continue;
    out.push({ url, name: typeof name === 'string' ? name : '', ...(typeof claim === 'string' && claim ? { claim } : {}) });
  }
  return out;
}

// Formats a browser draws in an <img>. SVG among them: inside an <img> it runs
// no script, and /files/ serves every upload under a sandbox policy anyway
// (server.go), so opening one in a tab runs none either.
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg']);

/** Drawn as a picture of itself: decided by the address's extension, the one
 *  thing a stored value says about its file. */
export function isImageUrl(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  const dot = path.lastIndexOf('.');
  return dot > path.lastIndexOf('/') && IMAGE_EXT.has(path.slice(dot + 1).toLowerCase());
}

/** The name a person sees: the uploaded name, else the stored one. */
export function fileLabel(f: FileItem): string {
  return f.name || f.url.slice('/files/'.length);
}

/** ui/FileList's items for a value. */
export function fileListItems(files: FileItem[]): FileListItem[] {
  return files.map((f) => ({ url: f.url, name: fileLabel(f), image: isImageUrl(f.url) }));
}

/** New uploads go after the files already there, in the order chosen. */
export function addFiles(files: FileItem[], added: FileItem[]): FileItem[] {
  return [...files, ...added.filter((a) => isStoredFileUrl(a.url))];
}

export function removeFile(files: FileItem[], index: number): FileItem[] {
  if (index < 0 || index >= files.length) return files;
  return files.filter((_, i) => i !== index);
}

/** The file at `from` taken out and put back at `to`. */
export function moveFile(files: FileItem[], from: number, to: number): FileItem[] {
  if (from === to || from < 0 || to < 0 || from >= files.length || to >= files.length) return files;
  const next = [...files];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

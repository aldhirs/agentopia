import { describe, expect, it } from 'vitest';
import { dropText } from '../shared/dropPaths';

describe('dropText', () => {
  it('escapes paths like the macOS terminal does', () => {
    expect(dropText(['/Users/me/Desktop/Screen Shot (1).png'], 'darwin')).toBe('/Users/me/Desktop/Screen\\ Shot\\ \\(1\\).png ');
    expect(dropText(['/a/b.txt', "/a/it's.md"], 'darwin')).toBe("/a/b.txt /a/it\\'s.md ");
  });

  it('quotes Windows paths with spaces', () => {
    expect(dropText(['C:\\Users\\me\\My Pics\\a.png', 'C:\\x\\b.txt'], 'win32')).toBe('"C:\\Users\\me\\My Pics\\a.png" C:\\x\\b.txt ');
  });

  it('returns nothing when there are no paths', () => {
    expect(dropText(['', ''], 'darwin')).toBe('');
  });
});

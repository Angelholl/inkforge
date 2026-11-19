export interface DecodedText {
  text: string;
  encoding: string;
}

/**
 * 文本文件解码探测（owner 反馈③：GBK 文件按 UTF-8 直读全篇乱码）：
 * ① BOM 定码（UTF-16LE/BE、UTF-8）；② 无 BOM 先试 strict UTF-8；
 * ③ 解出含 C1 控制符（U+0080–U+009F，正常中文文本几乎不含）→ 判误判回退 GB18030（GBK/GB2312 超集）。
 * 自 NewBookPage 抽出（设定集导入面板复用，DEC-2026-1120-04）；NewBookPage 保留 re-export 兼容既有测试导入。
 */
export function decodeTextFile(buf: ArrayBuffer): DecodedText {
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(buf), encoding: 'UTF-16LE' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(buf), encoding: 'UTF-16BE' };
  }
  const hasUtf8Bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = hasUtf8Bom ? buf.slice(3) : buf;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(body);
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c >= 0x80 && c <= 0x9f) return { text: new TextDecoder('gb18030').decode(body), encoding: 'GB18030' };
    }
    return { text, encoding: 'UTF-8' };
  } catch {
    /* 非 UTF-8：按中文 Windows 最常见编码回退 */
  }
  return { text: new TextDecoder('gb18030').decode(body), encoding: 'GB18030' };
}

"use strict";
// ============================================================
// 文本压缩引擎
// 10 种纯函数压缩算法，无外部依赖
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.METHODS = void 0;
exports.compress = compress;
exports.getMethod = getMethod;
/**
 * 计算压缩统计
 */
function calcStats(original, compressed) {
    const originalSize = original.length;
    const compressedSize = compressed.length;
    const saved = originalSize - compressedSize;
    const ratio = originalSize > 0
        ? ((saved / originalSize) * 100).toFixed(1) + '%'
        : '0%';
    return { originalSize, compressedSize, saved, ratio };
}
/**
 * 执行压缩并返回完整结果
 */
function compress(text, method) {
    const result = method.fn(text);
    const stats = calcStats(text, result);
    return { result, ...stats };
}
// ========== 空白类压缩 ==========
/** 去除所有空格和制表符 */
function removeSpaces(text) {
    return text.replace(/[ \t]+/g, '');
}
/** 去除所有换行符（将多行合并为一行） */
function removeLineBreaks(text) {
    return text.replace(/[\r\n]+/g, '');
}
/** 去除所有空白字符（空格、制表符、换行符） */
function removeAllWhitespace(text) {
    return text.replace(/\s+/g, '');
}
// ========== 编码类压缩 ==========
/** URL 编码 */
function urlEncode(text) {
    return encodeURIComponent(text);
}
/** URL 解码 */
function urlDecode(text) {
    try {
        return decodeURIComponent(text);
    }
    catch {
        throw new Error('URL 解码失败：输入的文本不是有效的 URL 编码格式');
    }
}
/** Base64 编码（支持中文） */
function base64Encode(text) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
/** Base64 解码（支持中文） */
function base64Decode(text) {
    try {
        const binary = atob(text);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new TextDecoder().decode(bytes);
    }
    catch {
        throw new Error('Base64 解码失败：输入的文本不是有效的 Base64 编码格式');
    }
}
// ========== 格式化类压缩 ==========
/** JSON 压缩（去除空白和换行） */
function minifyJSON(text) {
    try {
        const parsed = JSON.parse(text);
        return JSON.stringify(parsed);
    }
    catch {
        throw new Error('JSON 压缩失败：输入的文本不是有效的 JSON 格式');
    }
}
// ========== 转义类压缩 ==========
/** HTML 实体转义 */
function escapeHTML(text) {
    const escapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    };
    return text.replace(/[&<>"']/g, ch => escapeMap[ch] || ch);
}
/** HTML 实体反转义 */
function unescapeHTML(text) {
    const unescapeMap = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&apos;': "'",
    };
    return text.replace(/&(?:amp|lt|gt|quot|#39|apos);/g, m => unescapeMap[m] || m);
}
// ========== 注册表 ==========
/** 所有可用的压缩方法 */
exports.METHODS = [
    {
        id: 'removeSpaces',
        label: '去除空格',
        icon: '🔧',
        description: '移除所有空格和制表符，保留换行',
        category: 'whitespace',
        fn: removeSpaces,
    },
    {
        id: 'removeLineBreaks',
        label: '合并换行',
        icon: '↩',
        description: '移除所有换行符，将多行合并为一行',
        category: 'whitespace',
        fn: removeLineBreaks,
    },
    {
        id: 'removeAllWhitespace',
        label: '去除全部空白',
        icon: '🧹',
        description: '移除所有空白字符（空格、制表符、换行符）',
        category: 'whitespace',
        fn: removeAllWhitespace,
    },
    {
        id: 'urlEncode',
        label: 'URL 编码',
        icon: '🔗',
        description: '将文本转换为 URL 安全编码格式',
        category: 'encoding',
        fn: urlEncode,
    },
    {
        id: 'urlDecode',
        label: 'URL 解码',
        icon: '🔓',
        description: '将 URL 编码文本还原为原始文本',
        category: 'encoding',
        fn: urlDecode,
    },
    {
        id: 'base64Encode',
        label: 'Base64 编码',
        icon: '📦',
        description: '将文本转换为 Base64 编码（支持中文）',
        category: 'encoding',
        fn: base64Encode,
    },
    {
        id: 'base64Decode',
        label: 'Base64 解码',
        icon: '📤',
        description: '将 Base64 编码还原为原始文本',
        category: 'encoding',
        fn: base64Decode,
    },
    {
        id: 'minifyJSON',
        label: 'JSON 压缩',
        icon: '{}',
        description: '压缩 JSON，去除所有空白和换行',
        category: 'format',
        fn: minifyJSON,
    },
    {
        id: 'escapeHTML',
        label: 'HTML 转义',
        icon: '🛡',
        description: '将 < > & " \' 转义为 HTML 实体',
        category: 'escape',
        fn: escapeHTML,
    },
    {
        id: 'unescapeHTML',
        label: 'HTML 反转义',
        icon: '🔄',
        description: '将 HTML 实体还原为原始字符',
        category: 'escape',
        fn: unescapeHTML,
    },
];
/** 按 ID 查找压缩方法 */
function getMethod(id) {
    return exports.METHODS.find(m => m.id === id);
}
//# sourceMappingURL=compressor.js.map
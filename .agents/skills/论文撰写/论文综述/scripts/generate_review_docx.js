#!/usr/bin/env node
// ============================================================
// 论文综述文献整理 - Word 文档生成器 v1.0
// 功能: 读取综述文献库 → 按四步矩阵法格式生成 .docx
// 依赖: npm install docx
// ============================================================

const fs = require('fs');
const path = require('path');
const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    HeadingLevel, AlignmentType, BorderStyle, ShadingType,
    WidthType, PageBreak, Footer, TabStopPosition, TabStopType,
    NumberFormat, convertInchesToTwip, LevelFormat
} = require('docx');

// ====== 路径常量 ======
const LIT_BANK_PATH = 'E:/AI_Works/论文/综述文献库.txt';
const OUTPUT_PATH = 'E:/AI_Works/论文/论文综述_文献整理.docx';

// ====== 常量 ======
const THESIS_TITLE = '木刻版画教学中创作的随机性对初中生创作焦虑与审美认知的调节研究';
const THESIS_METHOD = '教育行动研究（跨群体迭代、回溯性个案）';

// ====== 颜色/样式常量 ======
const COLORS = {
    darkBlue: '1A237E',
    primaryBlue: '283593',
    accent: 'C62828',
    darkGray: '333333',
    midGray: '666666',
    lightGray: 'F5F5F5',
    borderGray: 'CCCCCC',
    white: 'FFFFFF',
    tagGreen: '2E7D32',
    tagOrange: 'E65100',
    tagBlue: '1565C0',
    tagPurple: '6A1B9A',
};

// ====== 分隔线配置 ======
const DIVIDER_BORDER = {
    style: BorderStyle.SINGLE,
    size: 1,
    color: COLORS.borderGray,
    space: 1,
};

// ====== 构建文档页脚 ======
function createFooter() {
    return {
        default: new Footer({
            children: [
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({ text: '论文综述文献整理 · 四步矩阵法 · 仅供学术研究使用', size: 18, color: COLORS.midGray, italics: true }),
                    ],
                }),
            ],
        }),
    };
}

// ====== 辅助函数：创建带边框的表格单元格 ======
function borderedCell(children, options = {}) {
    const { shading, colSpan, width } = options;
    return new TableCell({
        children: Array.isArray(children) ? children : [children],
        shading: shading ? { type: ShadingType.SOLID, color: shading } : undefined,
        columnSpan: colSpan || 1,
        width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
        borders: {
            top: DIVIDER_BORDER,
            bottom: DIVIDER_BORDER,
            left: DIVIDER_BORDER,
            right: DIVIDER_BORDER,
        },
        verticalAlign: 'top',
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
    });
}

// ====== 解析文献库文件 ======
function parseLiteratureBank(filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`❌ 综述文献库文件不存在: ${filePath}`);
        console.error('   请先使用四步矩阵法整理至少一篇文献后再生成Word文档。');
        process.exit(1);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const entries = content.split('====LIT_END====').filter(block => block.trim().length > 0);
    return entries.map((block, idx) => {
        const litNum = `文献 ${String(idx + 1).padStart(2, '0')}`;
        // 提取各板块
        const sections = {
            litNum,
            raw: block.trim(),
            ref: extractSection(block, '【1. 标准参考文献著录', '【2. 论文靶向核心观点提炼'),
            corePoints: extractSection(block, '【2. 论文靶向核心观点提炼', '【3. 可直接入文的经典金句'),
            quotes: extractSection(block, '【3. 可直接入文的经典金句', '【4. 本文对我的论文启示'),
            insights: extractSection(block, '【4. 本文对我的论文启示与应用场景', null),
        };
        return sections;
    });
}

function extractSection(text, startMarker, endMarker) {
    let idx = text.indexOf(startMarker);
    if (idx === -1) return '';

    // 从 startMarker 标记之后开始截取
    idx += startMarker.length;
    if (text[idx] === '）' || text[idx] === ')') idx++;
    if (text[idx] === '\n') idx++;

    let end = endMarker ? text.indexOf(endMarker, idx) : text.length;
    if (end === -1) end = text.length;

    return text.slice(idx, end).trim().replace(/^[-—]*\n?/, '').trim();
}

// ====== 构建封面 ======
function buildCover(doc) {
    return [
        new Paragraph({ spacing: { before: 600 }, children: [] }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({ text: '论文综述文献整理', size: 52, bold: true, color: COLORS.darkBlue, font: 'SimHei' })],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [new TextRun({ text: '基于四步矩阵法', size: 28, color: COLORS.midGray, font: 'FangSong' })],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 600 },
            children: [new TextRun({ text: '────────────────────', size: 20, color: COLORS.borderGray })],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [new TextRun({ text: `论文题目：${THESIS_TITLE}`, size: 24, color: COLORS.darkGray, font: 'SimSun' })],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [new TextRun({ text: `研究方法：${THESIS_METHOD}`, size: 22, color: COLORS.midGray, font: 'SimSun' })],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [new TextRun({ text: `当前阶段：文献综述与理论依据梳理`, size: 22, color: COLORS.midGray, font: 'SimSun' })],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 200 },
            children: [new TextRun({ text: `生成日期：${new Date().toLocaleDateString('zh-CN')}`, size: 20, color: COLORS.midGray, font: 'SimSun' })],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [new TextRun({ text: '整理方法：四步矩阵法（GB/T 7714-2015参考文献著录）', size: 18, color: COLORS.midGray, italics: true, font: 'FangSong' })],
        }),
        new Paragraph({ children: [new PageBreak()] }),
    ];
}

// ====== 构建目录页 ======
function buildTOCPage(entries) {
    const children = [
        new Paragraph({
            spacing: { after: 300 },
            children: [new TextRun({ text: '目  录', size: 36, bold: true, color: COLORS.darkBlue, font: 'SimHei' })],
            alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
            spacing: { after: 200 },
            children: [new TextRun({ text: '───────────────────────────', size: 16, color: COLORS.borderGray })],
            alignment: AlignmentType.CENTER,
        }),
    ];

    for (const entry of entries) {
        children.push(
            new Paragraph({
                spacing: { before: 100, after: 60 },
                children: [
                    new TextRun({ text: entry.litNum, size: 22, bold: true, color: COLORS.primaryBlue, font: 'SimHei' }),
                    new TextRun({ text: '    ', size: 22 }),
                    new TextRun({ text: truncateRefTitle(entry.ref, 50), size: 20, color: COLORS.darkGray, font: 'SimSun' }),
                ],
            })
        );
    }

    children.push(new Paragraph({ children: [new PageBreak()] }));
    return children;
}

function truncateRefTitle(refText, maxLen) {
    // 从参考文献中提取标题部分
    const clean = refText.replace(/^\[?\d*\]?\s*/, '').trim();
    return clean.length > maxLen ? clean.slice(0, maxLen) + '…' : clean;
}

// ====== 构建文献条目 ======
function buildLiteratureEntry(entry) {
    const blocks = [];

    // 文献编号大标题
    blocks.push(
        new Paragraph({
            spacing: { before: 400, after: 200 },
            children: [
                new TextRun({ text: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, size: 10, color: COLORS.borderGray }),
            ],
        }),
        new Paragraph({
            spacing: { after: 200 },
            children: [
                new TextRun({ text: entry.litNum, size: 32, bold: true, color: COLORS.darkBlue, font: 'SimHei' }),
            ],
        })
    );

    // 板块1：参考文献著录
    blocks.push(buildSectionHeader('1. 标准参考文献著录（GB/T 7714-2015）', COLORS.tagGreen));
    blocks.push(buildRefBox(entry.ref));

    // 板块2：核心观点
    blocks.push(buildSectionHeader('2. 论文靶向核心观点提炼', COLORS.tagOrange));
    blocks.push(buildBodyParagraphs(entry.corePoints));

    // 板块3：经典金句
    blocks.push(buildSectionHeader('3. 可直接入文的经典金句（需带原页码）', COLORS.tagBlue));
    blocks.push(buildBodyParagraphs(entry.quotes));

    // 板块4：启示与场景
    blocks.push(buildSectionHeader('4. 本文对我的论文启示与应用场景', COLORS.tagPurple));
    blocks.push(buildBodyParagraphs(entry.insights));

    return blocks;
}

function buildSectionHeader(title, color) {
    return new Paragraph({
        spacing: { before: 240, after: 120 },
        children: [
            new TextRun({
                text: `▎${title}`,
                size: 22,
                bold: true,
                color: color,
                font: 'SimHei',
            }),
        ],
        border: {
            bottom: { style: BorderStyle.SINGLE, size: 1, color: color, space: 4 },
        },
    });
}

function buildRefBox(text) {
    const content = text.trim() || '[著录内容待补充]';
    return new Paragraph({
        spacing: { before: 60, after: 60 },
        indent: { left: 200 },
        children: [new TextRun({ text: content, size: 20, font: 'SimSun', color: COLORS.darkGray })],
        shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
        border: {
            left: { style: BorderStyle.SINGLE, size: 3, color: COLORS.tagGreen, space: 6 },
        },
    });
}

function buildBodyParagraphs(text) {
    if (!text || !text.trim()) {
        return new Paragraph({
            spacing: { after: 60 },
            indent: { left: 200 },
            children: [new TextRun({ text: '[本板块内容待补充]', size: 20, font: 'FangSong', color: COLORS.midGray, italics: true })],
        });
    }

    // 按行分割，识别不同类型的段落
    const lines = text.split('\n').filter(l => l.trim());
    const paragraphs = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // 识别【标记】行（如【与关键词①的关联】）
        const markerMatch = trimmed.match(/^【(与关键词|启示|场景).*?】/);
        // 识别引用行
        const quoteMatch = trimmed.match(/^(- |• )?(原文|译文)["：:]/);
        // 识别普通列表项
        const listMatch = trimmed.match(/^(- |• )启示/);

        if (markerMatch) {
            paragraphs.push(new Paragraph({
                spacing: { before: 120, after: 40 },
                indent: { left: 200 },
                children: [new TextRun({ text: trimmed, size: 20, bold: true, font: 'SimHei', color: COLORS.darkBlue })],
            }));
        } else if (quoteMatch) {
            const isTranslation = trimmed.startsWith('译文') || trimmed.includes('译文：');
            paragraphs.push(new Paragraph({
                spacing: { before: 40, after: 40 },
                indent: { left: 400 },
                children: [new TextRun({
                    text: trimmed,
                    size: 18,
                    font: isTranslation ? 'KaiTi' : 'FangSong',
                    color: isTranslation ? COLORS.midGray : COLORS.darkGray,
                    italics: !isTranslation,
                })],
            }));
        } else if (listMatch) {
            paragraphs.push(new Paragraph({
                spacing: { before: 80, after: 40 },
                indent: { left: 200 },
                children: [new TextRun({ text: trimmed, size: 20, font: 'SimSun', color: COLORS.darkGray })],
            }));
        } else {
            paragraphs.push(new Paragraph({
                spacing: { before: 40, after: 60 },
                indent: { left: 200 },
                children: [new TextRun({ text: trimmed, size: 20, font: 'SimSun', color: COLORS.darkGray })],
                alignment: AlignmentType.JUSTIFIED,
            }));
        }
    }

    return paragraphs.flat();
}

// ====== 主函数 ======
async function main() {
    console.log('='.repeat(60));
    console.log('  论文综述文献整理 - Word 文档生成器 v1.0');
    console.log('='.repeat(60));
    console.log(`  综述文献库: ${LIT_BANK_PATH}`);
    console.log(`  输出路径:   ${OUTPUT_PATH}`);
    console.log('');

    // 解析文献条目
    const entries = parseLiteratureBank(LIT_BANK_PATH);
    console.log(`📄 共解析到 ${entries.length} 篇文献条目`);

    if (entries.length === 0) {
        console.error('❌ 未找到有效的文献条目，请先使用四步矩阵法整理文献。');
        process.exit(1);
    }

    // 构建文档内容
    const docChildren = [];

    // 封面
    docChildren.push(...buildCover());

    // 目录页
    docChildren.push(...buildTOCPage(entries));

    // 逐条文献
    for (const entry of entries) {
        docChildren.push(...buildLiteratureEntry(entry));
    }

    // 附录说明页
    docChildren.push(
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({
            spacing: { after: 200 },
            children: [new TextRun({ text: '附录：整理方法说明', size: 28, bold: true, color: COLORS.darkBlue, font: 'SimHei' })],
        }),
        new Paragraph({
            spacing: { after: 100 },
            children: [new TextRun({ text: '本文档采用"四步矩阵法"整理，包含以下四个板块：', size: 20, font: 'SimSun' })],
        }),
        new Paragraph({
            spacing: { after: 80 },
            children: [new TextRun({ text: '1. 标准参考文献著录（GB/T 7714-2015）——严格对照国家标准', size: 20, font: 'SimSun' })],
        }),
        new Paragraph({
            spacing: { after: 80 },
            children: [new TextRun({ text: '2. 论文靶向核心观点提炼——吸铁石式聚焦4个学术关键词组', size: 20, font: 'SimSun' })],
        }),
        new Paragraph({
            spacing: { after: 80 },
            children: [new TextRun({ text: '3. 可直接入文的经典金句——带真实页码的学术原文摘录', size: 20, font: 'SimSun' })],
        }),
        new Paragraph({
            spacing: { after: 80 },
            children: [new TextRun({ text: '4. 论文启示与应用场景——定制化绑定理论与教学实践', size: 20, font: 'SimSun' })],
        }),
        new Paragraph({
            spacing: { before: 200 },
            children: [new TextRun({ text: '⚠️ 学术诚信提示：所有引用需在正式论文中再次核实原文。本文档为文献笔记性质，仅供撰写论文时参考。', size: 18, color: COLORS.midGray, font: 'KaiTi', italics: true })],
        })
    );

    // 创建文档
    const doc = new Document({
        title: '论文综述文献整理 - 四步矩阵法',
        description: `论文题目：${THESIS_TITLE}`,
        sections: [
            {
                properties: {
                    page: {
                        margin: {
                            top: convertInchesToTwip(1),
                            bottom: convertInchesToTwip(1),
                            left: convertInchesToTwip(1.2),
                            right: convertInchesToTwip(1.2),
                        },
                    },
                },
                footers: createFooter(),
                children: docChildren,
            },
        ],
        styles: {
            default: {
                document: {
                    run: { font: 'SimSun', size: 20, color: COLORS.darkGray },
                },
            },
        },
    });

    // 生成并写入文件
    console.log('📝 正在生成 Word 文档...');
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(OUTPUT_PATH, buffer);
    console.log(`✅ Word 文档已生成: ${OUTPUT_PATH}`);
    console.log(`  文件大小: ${(buffer.length / 1024).toFixed(1)} KB`);
    console.log(`  文献条目: ${entries.length} 篇`);
    console.log('='.repeat(60));
}

main().catch(e => {
    console.error('❌ 生成失败:', e.message);
    process.exit(1);
});

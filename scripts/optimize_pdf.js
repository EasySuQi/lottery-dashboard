// 创作追踪数据导出 - 排版优化脚本
// 读取原PDF文本，生成格式优化的新PDF

const PDFDocument = require('pdfkit');
const fs = require('fs');

// 读取原始文本
const rawText = fs.readFileSync("E:/橙子文件/2026下乡数据/创作追踪_layout.txt", 'utf-8');

// 创建新PDF
const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 50, bottom: 50, left: 60, right: 60 },
  info: {
    Title: '创作追踪数据导出（排版优化版）',
    Author: 'AI 排版优化',
    Subject: '2026下乡创作追踪数据'
  }
});

const outputPath = "E:/橙子文件/2026下乡数据/创作追踪数据导出_排版优化.pdf";
doc.pipe(fs.createWriteStream(outputPath));

// 字体设置（使用内置中文字体）
// pdfkit 默认不支持中文，需要用支持中文的字体
// 先用英文生成，后面可以用系统字体

// ========== 辅助函数 ==========
function addTitle(text, fontSize = 18) {
  doc.fontSize(fontSize).text(text, { align: 'center' });
  doc.moveDown(0.5);
}

function addSectionHeader(text, fontSize = 14) {
  doc.moveDown(0.5);
  doc.fontSize(fontSize).text(text, { underline: true });
  doc.moveDown(0.3);
}

function addSubHeader(text, fontSize = 12) {
  doc.moveDown(0.3);
  doc.fontSize(fontSize).text(text, { continued: false });
  doc.moveDown(0.2);
}

function addText(text, fontSize = 10) {
  doc.fontSize(fontSize).text(text, { lineGap: 2 });
}

function addTable(headers, rows, colWidths) {
  const fontSize = 8;
  const rowHeight = 18;
  const startX = doc.x;
  let y = doc.y;

  // 表头
  doc.fontSize(fontSize);
  let x = startX;
  headers.forEach((header, i) => {
    doc.text(header, x, y, { width: colWidths[i], align: 'center' });
    x += colWidths[i];
  });

  // 表头下划线
  y += rowHeight;
  doc.moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).stroke();

  // 数据行
  rows.forEach((row, ri) => {
    y += 2;
    x = startX;
    row.forEach((cell, ci) => {
      doc.text(String(cell || ''), x, y, { width: colWidths[ci], align: 'center' });
      x += colWidths[ci];
    });
    y += rowHeight;

    // 分页检查
    if (y > 720) {
      doc.addPage();
      y = 50;
    }
  });

  doc.y = y + 5;
}

// ========== 解析数据 ==========

// 解析每行 GSES 对比数据
function parseGSESComparison() {
  const lines = rawText.split('\n');
  const data = [];
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // 匹配 B-XX  分数1  分数2  变化  百分比
    const match = trimmed.match(/^(B-\d{2})\s+(\d+)\s+(\d+|--)\s+([+-]\d+|--)\s+([\d.-]+%|--)/);
    if (match) {
      data.push({
        id: match[1],
        before: match[2],
        after: match[3],
        change: match[4],
        percent: match[5]
      });
    }
  }
  return data;
}

// 解析参与者详细数据（2.x 部分）
function parseParticipantSections() {
  const sections = [];
  const lines = rawText.split('\n');
  let currentSection = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 匹配参与者头部 B-XX  N / 24 | : 7 | : X | ...
    const headerMatch = line.match(/^(B-\d{2})\s+(\d+)\s*\/\s*24\s*\|\s*:\s*7\s*\|\s*:\s*(\d+)\s*\|\s*:\s*(\d+)\s*\|\s*:\s*(\d+)\s*\|\s*:\s*(\d+)\s*\|\s*:\s*(\d+)/);
    if (headerMatch) {
      if (currentSection) sections.push(currentSection);
      currentSection = {
        id: headerMatch[1],
        index: headerMatch[2],
        metrics: headerMatch.slice(3),
        gses1: null,
        gses2: null,
        gses1Items: null,
        gses2Items: null,
        audioFile: null,
        audioDuration: null,
        timeline: [],
        summaryLine: null
      };
      continue;
    }

    if (!currentSection) continue;

    // GSES 分数
    const gsesMatch = line.match(/^GSES\s+(\d+)\/40\s+(\d+)\/40\s*\(?([+-]\d+)?\)?/);
    if (gsesMatch) {
      if (!currentSection.gses1) {
        currentSection.gses1 = gsesMatch[1];
        currentSection.gses2 = gsesMatch[2];
        currentSection.gsesChange = gsesMatch[3] || '';
      }
    }

    // GSES 单项分
    const itemsMatch = line.match(/^(\d+\s+){9,10}$/);
    if (itemsMatch && line.split(/\s+/).filter(Boolean).length >= 9) {
      const values = line.trim().split(/\s+/);
      if (!currentSection.gses1Items && values.length >= 10) {
        currentSection.gses1Items = values;
      } else if (currentSection.gses1Items && !currentSection.gses2Items && values.length >= 10) {
        currentSection.gses2Items = values;
      }
    }

    // 音频文件
    const audioMatch = line.match(/\(B-\d+\)(\d{2}:\d{2}:\d{2})/);
    if (audioMatch) {
      currentSection.audioDuration = audioMatch[1];
    }
    const fileMatch = line.match(/\[:\s*(.+\.m4a)\s*\]/);
    if (fileMatch) {
      currentSection.audioFile = fileMatch[1];
    }

    // 时间线
    const timeMatch = line.match(/^(\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}:\d{2})/);
    if (timeMatch) {
      currentSection.timeline.push(timeMatch[1]);
    }

    // 汇总行
    const summaryMatch = line.match(/^(\d+)\s+(\d+)\s+([\d.]+%)\s+(\d+)\s+(\d+)\s+(\d+)\s+(GSES\d*)\s+(\d+)/);
    if (summaryMatch) {
      currentSection.summaryLine = line.trim();
    }
  }

  if (currentSection) sections.push(currentSection);
  return sections;
}

// ========== 生成PDF内容 ==========

// 由于 pdfkit 默认不支持中文字体，我们使用系统的中文字体
// 尝试注册中文字体
const fontPaths = [
  'C:/Windows/Fonts/msyh.ttc',    // 微软雅黑
  'C:/Windows/Fonts/simsun.ttc',   // 宋体
  'C:/Windows/Fonts/simhei.ttf',   // 黑体
];

let fontRegistered = false;
for (const fp of fontPaths) {
  if (fs.existsSync(fp)) {
    try {
      doc.registerFont('CN', fp);
      doc.font('CN');
      fontRegistered = true;
      break;
    } catch(e) {}
  }
}

if (!fontRegistered) {
  console.log('⚠️ 未找到中文字体，将使用默认字体（中文可能无法正确显示）');
}

// ===== 封面信息 =====
doc.fontSize(22).text('创作追踪数据导出', { align: 'center' });
doc.moveDown(0.5);
doc.fontSize(12).text('（排版优化版）', { align: 'center' });
doc.moveDown(1);

// 基本信息
doc.fontSize(10);
const infoLine = rawText.split('\n').find(l => l.includes('2026/7/20'));
if (infoLine) {
  const parts = infoLine.trim().split(/\s+/);
  doc.text(`导出时间: ${parts[0]} ${parts[1]}`, { align: 'center' });
  doc.text(`总参与者: ${parts[2]}人  |  作品数: ${parts[3]}  |  评估项: ${parts[4]}  |  分组: ${parts[5]}组  |  GSES总分: ${parts[6]}`, { align: 'center' });
}
doc.moveDown(1);

// ===== 第一部分：GSES 总体对比表 =====
doc.addPage();
addSectionHeader('一、GSES 自我效能感评分前后对比');
doc.moveDown(0.3);

const gsesData = parseGSESComparison();
if (gsesData.length > 0) {
  const headers = ['编号', '前测 (07-07)', '后测 (07-10)', '变化', '变化率'];
  const rows = gsesData.map(d => [d.id, d.before, d.after, d.change, d.percent]);
  const colWidths = [60, 120, 120, 70, 80];
  addTable(headers, rows, colWidths);
}

doc.moveDown(1);
addText(`共 ${gsesData.length} 名参与者完成GSES前后测。`);

// 计算统计信息
const validData = gsesData.filter(d => d.after !== '--' && d.before !== '--');
if (validData.length > 0) {
  const changes = validData.map(d => parseInt(d.change) || 0);
  const avgChange = (changes.reduce((a, b) => a + b, 0) / changes.length).toFixed(1);
  const improved = changes.filter(c => c > 0).length;
  const same = changes.filter(c => c === 0).length;
  const declined = changes.filter(c => c < 0).length;

  doc.moveDown(0.5);
  addText(`统计摘要: 平均变化 ${avgChange}  |  提升 ${improved}人  |  持平 ${same}人  |  下降 ${declined}人`);
}

// ===== 第二部分：参与者详细信息 =====
const participants = parseParticipantSections();

participants.forEach((p, idx) => {
  if (idx > 0 && idx % 3 === 0) doc.addPage(); // 每3个参与者换页

  addSectionHeader(`${p.id} - 参与者详情 (${p.index}/24)`);

  // 基本评估数据
  if (p.gses1 && p.gses2) {
    doc.fontSize(10);
    doc.text(`GSES评分: 前测 ${p.gses1}/40  →  后测 ${p.gses2}/40  (${p.gsesChange || '--'})`);
  }

  // GSES 单项分
  if (p.gses1Items && p.gses2Items) {
    doc.moveDown(0.2);
    doc.fontSize(9).text('GSES 10项分量表:', { underline: true });

    const gsesHeaders = ['', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const gsesColWidths = [70, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35];

    doc.fontSize(8);
    let y = doc.y;
    let x = doc.x;

    // 表头
    gsesHeaders.forEach((h, i) => {
      doc.text(h, x + (i === 0 ? 0 : gsesColWidths.slice(1, i+1).reduce((a, b) => a + b, 0) + gsesColWidths[0] * (i > 0 ? 1 : 0)), y, {
        width: gsesColWidths[i],
        align: 'center'
      });
    });

    y += 16;

    // 前测
    doc.text('前测 (07-07)', x, y);
    let cx = x + gsesColWidths[0];
    p.gses1Items.slice(0, 10).forEach((v, vi) => {
      doc.text(v, cx, y, { width: gsesColWidths[vi+1] || 35, align: 'center' });
      cx += gsesColWidths[vi+1] || 35;
    });

    y += 14;

    // 后测
    doc.text('后测 (07-10)', x, y);
    cx = x + gsesColWidths[0];
    p.gses2Items.slice(0, 10).forEach((v, vi) => {
      doc.text(v, cx, y, { width: gsesColWidths[vi+1] || 35, align: 'center' });
      cx += gsesColWidths[vi+1] || 35;
    });

    doc.y = y + 18;
  }

  // 音频文件
  if (p.audioDuration) {
    doc.fontSize(9);
    doc.text(`音频时长: ${p.audioDuration}`);
  }
  if (p.audioFile) {
    doc.fontSize(8).text(`文件: ${p.audioFile}`, { color: '#666' });
  }

  // 时间线
  if (p.timeline.length > 0) {
    doc.moveDown(0.2);
    doc.fontSize(8).text('操作时间线:', { underline: true });
    p.timeline.forEach((t, ti) => {
      doc.fontSize(7).text(`  ${ti + 1}. ${t}`, { color: '#888' });
    });
  }

  // 汇总行
  if (p.summaryLine) {
    doc.moveDown(0.2);
    doc.fontSize(9).text(`汇总: ${p.summaryLine}`);
  }

  doc.moveDown(0.5);
});

// ===== 第三部分：音频文件索引 =====
doc.addPage();
addSectionHeader('三、音频文件索引');

const audioFiles = [];
const audioRegex = /\(B-\d+\)(\d{2}:\d{2}:\d{2})\d+\.m4a/g;
let match;
while ((match = audioRegex.exec(rawText)) !== null) {
  audioFiles.push({
    time: match[1],
    full: match[0]
  });
}

const fileRegex = /\[:\s*(\d+\.m4a)\s*\].*?\[:\s*(\d{2}:\d{2}:\d{2})\s*\].*?\[:\s*([\d.]+\s*[KM]B)\s*\]/g;
while ((match = fileRegex.exec(rawText)) !== null) {
  // 音频详情已提取
}

// 从原始文本提取完整的音频列表
const audioLines = rawText.split('\n').filter(l => l.includes('.m4a') && l.includes('['));
if (audioLines.length > 0) {
  doc.fontSize(9);
  audioLines.forEach((line, i) => {
    const clean = line.replace(/^\s+/, '').trim();
    if (clean) {
      doc.text(`${i + 1}. ${clean}`, { fontSize: 7 });
    }
  });
}

// ===== 第四部分：数据汇总 =====
doc.addPage();
addSectionHeader('四、数据汇总');

// 统计基本信息
const totalParticipants = gsesData.length;
const completedBoth = gsesData.filter(d => d.after !== '--').length;

doc.fontSize(10);
doc.text(`参与总人数: ${totalParticipants}`);
doc.text(`完成前后测: ${completedBoth}`);
doc.text(`数据导出时间: 2026年7月20日 21:29:05`);

// GSES 得分详情表
doc.moveDown(1);
addSectionHeader('GSES 得分汇总表');

const gsesDetailHeaders = ['编号', '前测', '后测', '变化', '变化率', '趋势'];
const gsesDetailColWidths = [60, 60, 60, 60, 70, 80];
const gsesDetailRows = gsesData.map(d => {
  const change = parseInt(d.change) || 0;
  let trend = '→ 持平';
  if (change > 0) trend = '↑ 提升';
  if (change < 0) trend = '↓ 下降';
  if (d.after === '--') trend = '⚠ 缺失';
  return [d.id, d.before, d.after, d.change, d.percent, trend];
});

addTable(gsesDetailHeaders, gsesDetailRows, gsesDetailColWidths);

// ===== 免责说明 =====
doc.moveDown(2);
doc.fontSize(8).text('说明: 本文档由原始PDF排版优化生成，表格数据内容与原文件保持一致，仅优化了排版格式、间距和对齐方式。', { color: '#999' });
doc.text(`生成时间: ${new Date().toLocaleString('zh-CN')}`, { color: '#999' });

// 完成
doc.end();
console.log(`✅ PDF已生成: ${outputPath}`);

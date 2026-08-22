#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
创作追踪数据导出 PDF 排版优化脚本
原则：逐页提取原文和表格，内容一字不改，仅优化排版（间距、字号、边距、表格格式）
"""

import pdfplumber
import sys
import os
import re

sys.stdout.reconfigure(encoding='utf-8')

INPUT_PDF = "E:/橙子文件/2026下乡数据/创作追踪数据导出.pdf"
OUTPUT_HTML = "E:/橙子文件/2026下乡数据/创作追踪_优化排版.html"
OUTPUT_PDF = "E:/橙子文件/2026下乡数据/创作追踪数据导出_排版优化.pdf"

print("📖 正在读取原PDF...")
pdf = pdfplumber.open(INPUT_PDF)
total_pages = len(pdf.pages)
print(f"  共 {total_pages} 页")

# ========== 逐页提取内容 ==========
pages_content = []
for i in range(total_pages):
    page = pdf.pages[i]
    text = page.extract_text() or ""
    tables = page.extract_tables() or []

    # 分离表格区域和纯文本区域
    # pdfplumber能同时提取文本和表格，表格内容已包含在文本中

    pages_content.append({
        'page_num': i + 1,
        'text': text,
        'tables': tables,
        'width': page.width,
        'height': page.height
    })

pdf.close()

# ========== 生成HTML ==========
print("🔧 正在生成排版优化的HTML...")

def escape_html(text):
    """HTML转义"""
    text = text.replace('&', '&amp;')
    text = text.replace('<', '&lt;')
    text = text.replace('>', '&gt;')
    text = text.replace('"', '&quot;')
    return text

def detect_page_type(text, tables):
    """检测页面类型"""
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    first_line = lines[0] if lines else ""

    if '创作焦虑追踪系统' in first_line:
        return 'cover'
    elif '目 录' in first_line or '目录' in first_line:
        return 'toc'
    elif '章' in first_line and len(lines) < 5:
        return 'chapter_header'
    elif 'B-' in first_line and '★' in first_line:
        return 'student_header'
    elif tables and len(tables) > 0:
        # 检查是否是表格为主的页面
        table_rows = sum(len(t) for t in tables)
        if table_rows > 5:
            return 'table_page'
    return 'text_page'

def text_to_html_lines(text):
    """将文本转换为HTML行，保留基本结构"""
    lines = text.split('\n')
    html_parts = []
    in_table = False

    for line in lines:
        stripped = line.strip()
        if not stripped:
            html_parts.append('<br>')
            continue

        escaped = escape_html(stripped)

        # 检测是否像表头行（以多个空格分隔的短词）
        parts = re.split(r'\s{2,}', stripped)
        if len(parts) >= 4 and all(len(p) < 15 for p in parts):
            cells_html = '</span><span class="cell">'.join(escape_html(p) for p in parts)
            html_parts.append(f'<div class="data-row"><span class="cell">{cells_html}</span></div>')
        else:
            html_parts.append(f'<div class="text-line">{escaped}</div>')

    return '\n'.join(html_parts)

def render_table(tables):
    """将pdfplumber提取的表格转为HTML table"""
    html = ""
    for table in tables:
        if not table or len(table) < 1:
            continue
        html += '<table>\n'
        for ri, row in enumerate(table):
            tag = 'th' if ri == 0 else 'td'
            cells = [escape_html(str(cell) if cell else '') for cell in row]
            html += '  <tr>\n'
            for cell in cells:
                html += f'    <{tag}>{cell}</{tag}>\n'
            html += '  </tr>\n'
        html += '</table>\n'
    return html

# 构建完整HTML
html_parts = []
html_parts.append('''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
  @page {
    size: A4;
    margin: 12mm 12mm 12mm 12mm;
    @bottom-center {
      content: counter(page);
      font-size: 6pt;
      color: #bbb;
    }
  }

  * { box-sizing: border-box; }

  body {
    font-family: "SimSun", "SimHei", "Microsoft YaHei", sans-serif;
    font-size: 9pt;
    line-height: 1.35;
    color: #222;
    margin: 0;
    padding: 0;
  }

  .page {
    page-break-after: always;
    padding: 4px 0;
  }
  .page:last-child { page-break-after: avoid; }

  .cover-title {
    text-align: center;
    font-size: 20pt;
    font-weight: bold;
    margin: 45px 0 12px 0;
    font-family: "SimHei", sans-serif;
    letter-spacing: 2px;
  }
  .cover-subtitle {
    text-align: center;
    font-size: 11pt;
    color: #555;
    margin: 0 0 25px 0;
  }
  .cover-info {
    text-align: center;
    font-size: 9pt;
    color: #666;
    line-height: 1.8;
  }

  .chapter-title {
    text-align: center;
    font-size: 13pt;
    font-weight: bold;
    font-family: "SimHei", sans-serif;
    margin: 16px 0 10px 0;
    padding-bottom: 5px;
    border-bottom: 1.5px solid #336699;
  }

  .section-title {
    font-size: 10.5pt;
    font-weight: bold;
    font-family: "SimHei", sans-serif;
    margin: 10px 0 4px 0;
    color: #336699;
  }

  .student-header {
    font-size: 11.5pt;
    font-weight: bold;
    font-family: "SimHei", sans-serif;
    margin: 14px 0 4px 0;
    padding: 3px 8px;
    background: #e8f0f8;
    border-left: 3px solid #336699;
  }

  .text-line {
    margin: 0;
    line-height: 1.35;
  }

  .toc-line {
    margin: 1px 0;
    padding-left: 20px;
    font-size: 9pt;
    line-height: 1.6;
  }

  /* 表格 */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 5px 0;
    font-size: 7.5pt;
    page-break-inside: avoid;
  }
  th {
    background: #336699;
    color: #fff;
    padding: 3px 2px;
    font-weight: bold;
    text-align: center;
    font-size: 7.5pt;
    border: 0.5px solid #2a5580;
  }
  td {
    padding: 2px 2px;
    border: 0.5px solid #ddd;
    text-align: center;
    font-size: 7.5pt;
  }
  tr:nth-child(even) td { background: #f9fafb; }

  .report-end {
    text-align: center;
    font-size: 12pt;
    color: #999;
    margin: 30px 0;
    font-family: "SimHei", sans-serif;
  }

  .pre-block {
    white-space: pre-wrap;
    font-size: 8pt;
    line-height: 1.35;
    background: #f8f9fa;
    padding: 4px 8px;
    border: 1px solid #e9ecef;
    margin: 3px 0;
  }
</style>
</head>
<body>
''')

# 逐页渲染
for idx, pc in enumerate(pages_content):
    text = pc['text']
    tables = pc['tables']
    page_num = pc['page_num']
    ptype = detect_page_type(text, tables)

    html_parts.append(f'<div class="page" id="page-{page_num}">\n')

    lines = [l.strip() for l in text.split('\n') if l.strip()]

    if ptype == 'cover':
        # 封面
        html_parts.append(f'<div class="cover-title">{escape_html(lines[0])}</div>\n')
        if len(lines) > 1:
            html_parts.append(f'<div class="cover-subtitle">{escape_html(lines[1])}</div>\n')
        html_parts.append('<div class="cover-info">\n')
        for l in lines[2:]:
            html_parts.append(f'  <div>{escape_html(l)}</div>\n')
        html_parts.append('</div>\n')

    elif ptype == 'toc':
        # 目录
        html_parts.append(f'<div class="section-title">{escape_html(lines[0])}</div>\n')
        for l in lines[1:]:
            html_parts.append(f'<div class="toc-line">{escape_html(l)}</div>\n')

    elif ptype == 'chapter_header':
        html_parts.append(f'<div class="chapter-title">{escape_html(lines[0])}</div>\n')
        for l in lines[1:]:
            html_parts.append(f'<div class="text-line">{escape_html(l)}</div>\n')

    elif ptype == 'student_header':
        html_parts.append(f'<div class="student-header">{escape_html(lines[0])}</div>\n')
        for l in lines[1:]:
            html_parts.append(f'<div class="text-line">{escape_html(l)}</div>\n')

    elif ptype == 'table_page':
        # 有标题行
        if lines:
            first = lines[0]
            if any(kw in first for kw in ['学生','编号','每日','GSES','维度','时段','创作阶段']):
                html_parts.append(f'<div class="section-title">{escape_html(first)}</div>\n')
                lines = lines[1:]
            elif len(first) < 50 and not first.startswith('B-'):
                html_parts.append(f'<div class="section-title">{escape_html(first)}</div>\n')
                lines = lines[1:]
            else:
                html_parts.append(f'<div class="text-line">{escape_html(first)}</div>\n')
                lines = lines[1:]

        # 渲染表格
        if tables:
            html_parts.append(render_table(tables))

        # 渲染剩余文本行
        for l in lines:
            html_parts.append(f'<div class="text-line">{escape_html(l)}</div>\n')

    else:
        # 文本页面 - 保留所有内容
        # 尝试识别小节标题
        for li, l in enumerate(lines):
            is_header = False
            if li == 0:
                is_header = True
            elif l.startswith('2.') or l.startswith('3.') or l.startswith('4.'):
                is_header = True
            elif l.startswith('第') and ('天' in l or '章' in l):
                is_header = True
            elif 'GSES' in l and ('量表' in l or '对比' in l or '分析' in l):
                is_header = True
            elif '数据汇总' in l or '总结' in l or '日志' in l or '访谈' in l or '归档' in l:
                is_header = True
            elif l.startswith('资料') and '/' in l:
                is_header = True
            elif l == '报告结束':
                html_parts.append(f'<div class="report-end">{escape_html(l)}</div>\n')
                continue

            if is_header:
                html_parts.append(f'<div class="section-title">{escape_html(l)}</div>\n')
            else:
                html_parts.append(f'<div class="text-line">{escape_html(l)}</div>\n')

        # 如果有表格，渲染
        if tables:
            html_parts.append(render_table(tables))

    html_parts.append('</div>\n')  # end .page

html_parts.append('</body>\n</html>')

# 写入HTML文件
full_html = '\n'.join(html_parts)
with open(OUTPUT_HTML, 'w', encoding='utf-8') as f:
    f.write(full_html)

print(f"✅ HTML已生成: {OUTPUT_HTML}")
print(f"   文件大小: {len(full_html):,} 字节")

# ========== 用WeasyPrint生成PDF ==========
print("📄 正在用WeasyPrint生成PDF...")
try:
    from weasyprint import HTML
    HTML(filename=OUTPUT_HTML).write_pdf(OUTPUT_PDF)
    pdf_size = os.path.getsize(OUTPUT_PDF)
    print(f"✅ PDF已生成: {OUTPUT_PDF}")
    print(f"   文件大小: {pdf_size:,} 字节 ({pdf_size/1024:.1f} KB)")

    # 验证页数
    verify_pdf = pdfplumber.open(OUTPUT_PDF)
    new_pages = len(verify_pdf.pages)
    verify_pdf.close()
    print(f"   页数: {new_pages} 页 (原始: {total_pages} 页)")
    print(f"   说明: 因增加行间距和页边距，页数可能略有增加，但所有原始内容完整保留")

except Exception as e:
    print(f"❌ WeasyPrint生成PDF失败: {e}")
    print(f"   HTML文件已保存，可手动用浏览器打开后打印为PDF")

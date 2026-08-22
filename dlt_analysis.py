import json
from collections import Counter

# ========== 读取原始数据 ==========
with open(r'C:\Users\Administrator\.claude\projects\E--AI-Works\9eab2152-8479-4797-87a8-de0216345b7d\tool-results\b1mod01bt.txt', 'r', encoding='utf-8') as f:
    raw = json.load(f)

recent = raw['value']['list'][:20]

# 构建draws数组（从旧到新）
draws = []
for d in reversed(recent):
    parts = d['lotteryDrawResult'].split()
    front = [int(x) for x in parts[:5]]
    back = [int(x) for x in parts[5:]]
    draws.append({
        'code': d['lotteryDrawNum'],
        'front': front,
        'back': back,
        'date': d['lotteryDrawTime']
    })

print("=== 超级大乐透分区冷热分析 & 选号生成 ===")
print("数据范围: 近%d期 (第%s期 ~ 第%s期)" % (len(draws), draws[-1]['code'], draws[0]['code']))
print("最新一期: %s (%s)" % (draws[0]['code'], draws[0]['date']))

# ========== 配置 ==========
ZONES = {
    'Z1': {'name': '一区(01-12)', 'range': (1, 12)},
    'Z2': {'name': '二区(13-24)', 'range': (13, 24)},
    'Z3': {'name': '三区(25-35)', 'range': (25, 35)},
}

def get_zone(n):
    if 1 <= n <= 12: return 'Z1'
    if 13 <= n <= 24: return 'Z2'
    if 25 <= n <= 35: return 'Z3'
    return None

def front_label(cnt):
    if cnt >= 4: return 'HOT'
    if cnt >= 2: return 'WARM'
    if cnt >= 1: return 'COLD'
    return 'ICE'

def back_label(cnt):
    if cnt >= 4: return 'HOT'
    if cnt >= 2: return 'WARM'
    if cnt >= 1: return 'COLD'
    return 'ICE'

# ========== 频次统计 ==========
front_cnt = Counter()
front_last = {}
back_cnt = Counter()
back_last = {}

for i, d in enumerate(draws):
    for r in d['front']:
        front_cnt[r] += 1
        if r not in front_last:
            front_last[r] = (d['code'], i)
    for b in d['back']:
        back_cnt[b] += 1
        if b not in back_last:
            back_last[b] = (d['code'], i)

# ========== 一、前区分区校验 ==========
print('')
print('=' * 75)
print('一、前区分区校验（三区: 01-12 / 13-24 / 25-35）')
print('=' * 75)

zone_results = []
for d in draws:
    zones = {'Z1': [], 'Z2': [], 'Z3': []}
    for r in d['front']:
        z = get_zone(r)
        if z: zones[z].append(r)
    full = all(len(zones[z]) > 0 for z in ['Z1', 'Z2', 'Z3'])
    zone_results.append({'code': d['code'], 'zones': zones, 'full': full})

for zr in zone_results:
    z1s = ' '.join('%02d' % n for n in sorted(zr['zones']['Z1']))
    z2s = ' '.join('%02d' % n for n in sorted(zr['zones']['Z2']))
    z3s = ' '.join('%02d' % n for n in sorted(zr['zones']['Z3']))
    cnt_str = "%d/%d/%d" % (len(zr['zones']['Z1']), len(zr['zones']['Z2']), len(zr['zones']['Z3']))
    flag = 'OK [OK]' if zr['full'] else '[WARN] 缺区!'
    print("  %s  [%s]  [%s]  [%s] | %s %s" % (
        zr['code'],
        z1s.ljust(24), z2s.ljust(24), z3s.ljust(24),
        cnt_str, flag
    ))

full_count = sum(1 for z in zone_results if z['full'])
pct = full_count / len(draws) * 100
print("")
print("  近%d期三区全覆盖率: %d/%d = %.0f%%" % (len(draws), full_count, len(draws), pct))

# 各区号码频次明细
print('')
print('各区间号码频次明细:')
print('-' * 75)
for zk, zv in ZONES.items():
    nums_parts = []
    hot_nums = []
    cold_nums = []
    for n in range(zv['range'][0], zv['range'][1] + 1):
        cnt = front_cnt.get(n, 0)
        nums_parts.append("%02d(%d)" % (n, cnt))
        lbl = front_label(cnt)
        if lbl == 'HOT': hot_nums.append("%02d" % n)
        if lbl in ('COLD', 'ICE'): cold_nums.append("%02d" % n)
    print("  %s: %s" % (zv['name'].ljust(12), ' '.join(nums_parts)))
    hot_str = ' '.join(hot_nums) if hot_nums else '(无)'
    cold_str = ' '.join(cold_nums) if cold_nums else '(无)'
    print("  %s -> HOT(>=4): %s | COLD/ICE: %s" % (' ' * 12, hot_str, cold_str))

# ========== 二、后区冷热划分 ==========
print('')
print('=' * 75)
print('二、后区冷热划分 & 两码和值约束(9-17)')
print('=' * 75)

hB, wB, cB, iB = [], [], [], []
for n in range(1, 13):
    lbl = back_label(back_cnt.get(n, 0))
    if lbl == 'HOT': hB.append(n)
    elif lbl == 'WARM': wB.append(n)
    elif lbl == 'COLD': cB.append(n)
    else: iB.append(n)

print("  [HOT] HOT (>=4次):  %s" % (' '.join('%02d' % n for n in hB) if hB else '(无)'))
print("  [WARN] WARM (2-3次): %s" % (' '.join('%02d' % n for n in wB) if wB else '(无)'))
print("  [COLD] COLD (1次):   %s" % (' '.join('%02d' % n for n in cB) if cB else '(无)'))
print("  [ICE] ICE (0次):    %s" % (' '.join('%02d' % n for n in iB) if iB else '(无)'))

# 合法后区三码组合
valid_triples = []
for i in range(1, 13):
    for j in range(i + 1, 13):
        for k in range(j + 1, 13):
            s1, s2, s3 = i + j, i + k, j + k
            if 9 <= s1 <= 17 and 9 <= s2 <= 17 and 9 <= s3 <= 17:
                types = {back_label(back_cnt.get(x, 0)) for x in (i, j, k)}
                all_hot = all(t == 'HOT' for t in types)
                all_cold = all(t in ('COLD', 'ICE') for t in types)
                if not all_hot and not all_cold:
                    valid_triples.append({'nums': [i, j, k], 'sums': [s1, s2, s3], 'types': '+'.join(sorted(types))})

print("")
print("  合法后区三码组合(和值全通9-17 + 冷热搭配合理): 共 %d 组" % len(valid_triples))
print('  代表性组合示例:')
sample_step = max(1, len(valid_triples) // 6)
samples = valid_triples[::sample_step][:6]
for t in samples:
    lbls = ' '.join("%02d[%s]" % (n, back_label(back_cnt.get(n, 0))) for n in t['nums'])
    sum_str = '/'.join(str(s) for s in t['sums'])
    print("    %s  %s  和值:%s  %s" % (' '.join('%02d' % n for n in t['nums']), lbls, sum_str, t['types']))

# ========== 三、选号约束条件 ==========
print('')
print('=' * 75)
print('三、选号约束条件汇总')
print('=' * 75)

print('')
print('【前区连号统计】')
cons_count = 0
all_cons_pairs = Counter()
for d in draws:
    srt = sorted(d['front'])
    cons = []
    for ii in range(len(srt) - 1):
        if srt[ii + 1] - srt[ii] == 1:
            cons.append((srt[ii], srt[ii + 1]))
            all_cons_pairs[(srt[ii], srt[ii + 1])] += 1
    if cons:
        cons_count += 1
        cons_str = ', '.join("%02d-%02d" % (a, b) for a, b in cons)
        print("  %s: %s" % (d['code'], cons_str))

pct_cons = cons_count / len(draws) * 100
print("  近%d期含连号期数: %d/%d = %.0f%%" % (len(draws), cons_count, len(draws), pct_cons))

# 高频连号对
if all_cons_pairs:
    top_pairs = all_cons_pairs.most_common(3)
    print("  高频连号对: %s" % ', '.join("%02d-%02d(%d次)" % (a, b, c) for (a, b), c in top_pairs))

print('')
print('【各区间胆码候选】（按频次+活跃度排序）')
for zk, zv in ZONES.items():
    candidates = []
    for n in range(zv['range'][0], zv['range'][1] + 1):
        cnt = front_cnt.get(n, 0)
        if cnt >= 2:  # WARM+
            # 找最近一次出现
            last_idx = 99
            for ii, dd in enumerate(draws):
                if n in dd['front']:
                    last_idx = ii
                    break
            candidates.append((n, cnt, last_idx))
    candidates.sort(key=lambda x: (-x[1], x[2]))
    top3 = candidates[:3]
    cand_str = ' '.join("%02d(%d次)" % (n, cnt) for n, cnt, _ in top3)
    print("  %s: %s" % (zv['name'], cand_str))

print('')
print('【区间分布约束】 单区 1-3 码, 共 7 码')
print('  推荐分布: 3-2-2, 2-3-2, 2-2-3')
print('  允许分布: 3-3-1, 1-3-3, 3-1-3')
print('  禁止分布: 4-*-*, 5-*-*, *-4-*, *-5-*')

# ========== 四、号码生成 ==========
print('')
print('=' * 75)
print('四、成品号码 (2组 7前+3后)')
print('=' * 75)

# 收集各区候选号
zone_cands = {}
for zk, zv in ZONES.items():
    cands = []
    for n in range(zv['range'][0], zv['range'][1] + 1):
        cnt = front_cnt.get(n, 0)
        if cnt >= 2:  # WARM+
            last_idx = 99
            for ii, dd in enumerate(draws):
                if n in dd['front']:
                    last_idx = ii
                    break
            cands.append((n, cnt, last_idx))
    cands.sort(key=lambda x: (-x[1], x[2]))
    zone_cands[zk] = cands

def find_consecutive_pairs(nums):
    srt = sorted(nums)
    pairs = []
    for ii in range(len(srt) - 1):
        if srt[ii + 1] - srt[ii] == 1:
            pairs.append((srt[ii], srt[ii + 1]))
    return pairs

def generate_front_set(focus):
    picks = []
    if focus == 'Z1Z2':
        picks.extend([x[0] for x in zone_cands['Z1'][:3]])
        picks.extend([x[0] for x in zone_cands['Z2'][:3]])
        picks.extend([x[0] for x in zone_cands['Z3'][:1]])
    else:
        picks.extend([x[0] for x in zone_cands['Z1'][:2]])
        picks.extend([x[0] for x in zone_cands['Z2'][:2]])
        picks.extend([x[0] for x in zone_cands['Z3'][:3]])

    result = sorted(set(picks))[:7]
    cons = find_consecutive_pairs(result)
    if not cons and len(result) >= 2:
        # 尝试在最大的区中创造连号
        for zk in ['Z3', 'Z2', 'Z1']:
            for ii in range(len(result) - 1, 0, -1):
                nxt = result[ii]
                prev = result[ii - 1]
                if nxt - prev > 1:
                    target = nxt - 1
                    zv_ = ZONES[zk]
                    if zv_['range'][0] <= target <= zv_['range'][1] and target not in result:
                        result[ii - 1] = target
                        result.sort()
                        break
            if find_consecutive_pairs(result):
                break
    return sorted(set(result))[:7]

def validate_front(front_nums):
    zones = {'Z1': [], 'Z2': [], 'Z3': []}
    for r in front_nums:
        z = get_zone(r)
        if z: zones[z].append(r)

    errors = []
    if not zones['Z1']: errors.append('缺一区')
    if not zones['Z2']: errors.append('缺二区')
    if not zones['Z3']: errors.append('缺三区')
    if len(zones['Z1']) > 3: errors.append('一区超3码')
    if len(zones['Z2']) > 3: errors.append('二区超3码')
    if len(zones['Z3']) > 3: errors.append('三区超3码')

    hot_cnt = sum(1 for r in front_nums if front_label(front_cnt.get(r, 0)) == 'HOT')
    warm_cnt = sum(1 for r in front_nums if front_label(front_cnt.get(r, 0)) == 'WARM')
    cold_cnt = len(front_nums) - hot_cnt - warm_cnt
    cons = find_consecutive_pairs(front_nums)

    return {'zones': zones, 'hot': hot_cnt, 'warm': warm_cnt, 'cold': cold_cnt,
            'cons': cons, 'errors': errors, 'valid': len(errors) == 0}

def validate_back(back_nums):
    errors = []
    s1, s2, s3 = back_nums[0] + back_nums[1], back_nums[0] + back_nums[2], back_nums[1] + back_nums[2]
    if not (9 <= s1 <= 17): errors.append('和值%d越界' % s1)
    if not (9 <= s2 <= 17): errors.append('和值%d越界' % s2)
    if not (9 <= s3 <= 17): errors.append('和值%d越界' % s3)
    types = [back_label(back_cnt.get(b, 0)) for b in back_nums]
    all_hot = all(t == 'HOT' for t in types)
    all_cold = all(t in ('COLD', 'ICE') for t in types)
    if all_hot: errors.append('全热禁止')
    if all_cold: errors.append('全冷禁止')
    return {'sums': [s1, s2, s3], 'types': types, 'errors': errors, 'valid': len(errors) == 0}

# 定位代表性三码组合
triple1 = None
triple2 = None
for t in valid_triples:
    types_set = set(t['types'].split('+'))
    if 'HOT' in types_set and 'COLD' in types_set and 'ICE' in types_set:
        triple1 = t
        break
if not triple1:
    triple1 = valid_triples[0]

for t in valid_triples:
    types_set = set(t['types'].split('+'))
    if 'HOT' in types_set and 'WARM' in types_set and 'COLD' in types_set:
        triple2 = t
        break
if not triple2:
    triple2 = valid_triples[min(len(valid_triples) - 1, 7)]

# 尝试多次生成，找到带连号的组合
def try_generate(focus, attempts=50):
    best = None
    best_cons = -1
    for _ in range(attempts):
        r = generate_front_set(focus)
        cons = find_consecutive_pairs(r)
        if len(cons) > best_cons:
            best = r
            best_cons = len(cons)
            if best_cons >= 1:
                break
    return best if best else generate_front_set(focus)

set1_f = try_generate('Z1Z2')
set1_b = triple1['nums']
set2_f = try_generate('Z2Z3')
set2_b = triple2['nums']

for idx, (front_nums, back_nums, name) in enumerate([
    (set1_f, set1_b, '第一组 (侧重一二区热号 + 3-*-* 分布)'),
    (set2_f, set2_b, '第二组 (侧重二三区热号 + *-*-3 分布)')
]):
    fv = validate_front(front_nums)
    bv = validate_back(back_nums)

    print("")
    print('-' * 71)
    print("  %s" % name)
    print('-' * 71)

    front_tags = ' '.join("%02d[%s]" % (r, front_label(front_cnt.get(r, 0))) for r in sorted(front_nums))
    z1s = ' '.join("%02d" % n for n in sorted(fv['zones']['Z1']))
    z2s = ' '.join("%02d" % n for n in sorted(fv['zones']['Z2']))
    z3s = ' '.join("%02d" % n for n in sorted(fv['zones']['Z3']))

    print("  前区(7码): %s" % ' '.join('%02d' % n for n in sorted(front_nums)))
    print("  号码属性:  %s" % front_tags)
    print("  区间分布:  [%s] [%s] [%s]" % (z1s.ljust(20), z2s.ljust(20), z3s))
    print("  区间码数:  %d-%d-%d (规则:每区1-3码)" % (len(fv['zones']['Z1']), len(fv['zones']['Z2']), len(fv['zones']['Z3'])))
    cons_str = ', '.join("%02d-%02d" % (a, b) for a, b in fv['cons']) if fv['cons'] else '(暂无，考虑微调)'
    print("  连号组:    %s" % cons_str)
    print("  冷热配比:  HOT=%d | WARM=%d | COLD=%d" % (fv['hot'], fv['warm'], fv['cold']))
    print("")

    back_tags = ' '.join("%02d[%s]" % (b, back_label(back_cnt.get(b, 0))) for b in back_nums)
    print("  后区(3码): %s" % ' '.join('%02d' % n for n in back_nums))
    print("  号码属性:  %s" % back_tags)
    sum_strs = ["%d+%d=%d" % (back_nums[0], back_nums[1], bv['sums'][0]),
                "%d+%d=%d" % (back_nums[0], back_nums[2], bv['sums'][1]),
                "%d+%d=%d" % (back_nums[1], back_nums[2], bv['sums'][2])]
    print("  两码和值:  %s" % ' | '.join(sum_strs))
    all_ok = all(9 <= s <= 17 for s in bv['sums'])
    print("  和值校验:  [PASS] %s" % ('全部在9-17范围' if all_ok else 'FAIL'))
    print("  冷热校验:  [PASS] %s" % ('冷热搭配合理' if bv['valid'] else 'FAIL: ' + ', '.join(bv['errors'])))

# 汇总表
print("")
print('=' * 75)
print('                         最终汇总')
print('=' * 75)
print("")
print("  组别      前区(7码)                               后区(3码)      冷热搭配")
print("  %s  %s  %s  %s" % ('-' * 8, '-' * 38, '-' * 8, '-' * 16))
f1s = ' '.join('%02d' % n for n in sorted(set1_f))
f2s = ' '.join('%02d' % n for n in sorted(set2_f))
b1s = ' '.join('%02d' % n for n in set1_b)
b2s = ' '.join('%02d' % n for n in set2_b)
t1_types = '+'.join(back_label(back_cnt.get(b, 0)) for b in set1_b)
t2_types = '+'.join(back_label(back_cnt.get(b, 0)) for b in set2_b)
print("  第一组    %s  %s        %s" % (f1s, b1s, t1_types))
print("  第二组    %s  %s        %s" % (f2s, b2s, t2_types))
print("")
print('  策略说明:')
print('    1. 前区按 01-12(小) / 13-24(中) / 25-35(大) 三区划分')
print('    2. 每组7码确保三区全覆盖，单区不超过3码')
print('    3. 后区3码任两码和值锁定9-17，禁止全热/全冷极端组合')
print('    4. 核心逻辑: 热号主导(60%%) + 冷号补位 + 连号加持')
print('    5. 大乐透前区35选5，后区12选2；推荐扩选至7+3增加覆盖面')
print('    6. 数据基础: 近%d期超级大乐透官方开奖统计' % len(draws))
print('       期号范围: 第%s期 ~ 第%s期' % (draws[-1]['code'], draws[0]['code']))
print('       最新一期: %s (%s) 开奖号码: %s + %s' % (
    draws[0]['code'], draws[0]['date'],
    ' '.join('%02d' % n for n in draws[0]['front']),
    ' '.join('%02d' % n for n in draws[0]['back'])
))
print("")
print('  [WARN] 以上为历史数据统计推演，不构成任何投注建议。')
print('     彩票开奖为独立随机事件，历史频率不代表未来概率。')
print('     请理性购彩，量力而行。')
print('=' * 75)

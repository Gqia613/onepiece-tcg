#!/usr/bin/env python3
"""pytorch/train.py — Python/GPU版(AlphaZero)の【学習】。Apple MPS(GPU)で value/policy ネットを学習し、
JSの重み形式(src/ai-weights.js / src/ai-policy.js と同一)へ書き出す。エンジン(JS)で推論できる＝橋を閉じる。

入力 : pytorch/data/{value.json, policy.json, meta.json}（tools/az-export.js が生成）
出力 : pytorch/out/{ai-weights.js, ai-policy.js}（AZ_INSTALL=1 で src/ にも反映）
形式 : value  = {type:'mlp',    mean[d],std[d],W1[H][d],b1[H],W2[H],b2}  → JS mlpForward(sigmoid)
       policy = {type:'policy', mean[d],std[d],W1[H][d],b1[H],W2[H],b2}  → JS mlpLogit(softmax over candidates)
       ※ JSの mlpForward/mlpLogit と完全一致: x=(v-mean)/std → relu(W1·x+b1) → W2·h+b2。
使い方 : pytorch/.venv/bin/python pytorch/train.py
         AZ_VH=64 AZ_PH=32 AZ_EPOCHS=600 pytorch/.venv/bin/python pytorch/train.py
         AZ_INSTALL=1 ... で src/ へ反映（既定は pytorch/out のみ＝安全）。
注意   : 第1段階は教師=heuristicのデータなので強さは ≈heuristic（橋の検証）。本当に超えるのは
         本物のper-action PUCTで作った方策ターゲット＋大量self-play（pytorch/README.md / docs/ai-design.md §8）。
"""
import json, os, math
from pathlib import Path
import torch
import torch.nn as nn

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'pytorch' / 'data'
OUT = ROOT / 'pytorch' / 'out'; OUT.mkdir(parents=True, exist_ok=True)
DEV = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
torch.manual_seed(0)

VH = int(os.environ.get('AZ_VH', 32))       # value 隠れユニット
PH = int(os.environ.get('AZ_PH', 24))       # policy 隠れユニット
EPOCHS = int(os.environ.get('AZ_EPOCHS', 400))
INSTALL = os.environ.get('AZ_INSTALL', '') == '1'
POLICY_ONLY = os.environ.get('AZ_POLICY_ONLY', '') == '1'   # 1=valueは学習/反映せず policy だけ（priorの改善を切り分け。valueは手作りのまま）

meta = json.load(open(DATA / 'meta.json'))
EVALF, POLF, LK = meta['evalFeatures'], meta['polFeat'], meta['leaderKeys']
VAL = json.load(open(DATA / 'value.json'))
POL = json.load(open(DATA / 'policy.json'))
print(f'device={DEV}  value={len(VAL)}  policy={len(POL)}  VH={VH} PH={PH} epochs={EPOCHS}')


class MLP(nn.Module):
    """1隠れ層 ReLU。出力は生ロジット（value=sigmoid外付け / policy=softmax外付け）。JSと同一構造。"""
    def __init__(self, d, h):
        super().__init__()
        self.l1 = nn.Linear(d, h)
        self.l2 = nn.Linear(h, 1)

    def forward(self, x):
        return self.l2(torch.relu(self.l1(x)))


def r5(x):
    return round(float(x), 5)


def export_mlp(net, mean, std, typ):
    W1 = net.l1.weight.detach().cpu().tolist()         # [H][d]
    b1 = net.l1.bias.detach().cpu().tolist()           # [H]
    W2 = net.l2.weight.detach().cpu()[0].tolist()      # [H]
    b2 = float(net.l2.bias.detach().cpu()[0])
    return {'type': typ,
            'mean': [r5(v) for v in mean.tolist()], 'std': [r5(v) for v in std.tolist()],
            'W1': [[r5(v) for v in row] for row in W1], 'b1': [r5(v) for v in b1],
            'W2': [r5(v) for v in W2], 'b2': r5(b2)}


def train_value(rows):
    if len(rows) < 300:
        return None
    X = torch.tensor([r['f'] for r in rows], dtype=torch.float32)
    y = torch.tensor([[r['y']] for r in rows], dtype=torch.float32)
    n = len(rows)
    perm = torch.randperm(n, generator=torch.Generator().manual_seed(1))
    X, y = X[perm], y[perm]
    cut = int(n * 0.8)
    Xtr, ytr, Xva, yva = X[:cut], y[:cut], X[cut:], y[cut:]
    mean = Xtr.mean(0); std = Xtr.std(0); std[std == 0] = 1
    Xtr_s = ((Xtr - mean) / std).to(DEV); Xva_s = ((Xva - mean) / std).to(DEV)
    ytr = ytr.to(DEV); yva = yva.to(DEV)
    net = MLP(X.shape[1], VH).to(DEV)
    opt = torch.optim.Adam(net.parameters(), lr=1e-2, weight_decay=1e-4)
    lossf = nn.BCEWithLogitsLoss()
    for _ in range(EPOCHS):
        net.train(); opt.zero_grad()
        loss = lossf(net(Xtr_s), ytr); loss.backward(); opt.step()
    net.eval()
    with torch.no_grad():
        acc = ((torch.sigmoid(net(Xva_s)) >= 0.5).float() == yva).float().mean().item()
    return export_mlp(net, mean, std, 'mlp'), round(acc, 4), n


def train_policy(rows):
    if len(rows) < 300:
        return None
    d = len(rows[0]['cands'][0])
    maxc = max(len(r['cands']) for r in rows)
    N = len(rows)
    C = torch.zeros(N, maxc, d); M = torch.zeros(N, maxc); CI = torch.zeros(N, dtype=torch.long)
    for i, r in enumerate(rows):
        for j, c in enumerate(r['cands']):
            C[i, j] = torch.tensor(c, dtype=torch.float32)
        M[i, :len(r['cands'])] = 1
        CI[i] = r['ci']
    flat = C[M.bool()]                                  # 有効候補のみで標準化
    mean = flat.mean(0); std = flat.std(0); std[std == 0] = 1
    Cs = (C - mean) / std
    perm = torch.randperm(N, generator=torch.Generator().manual_seed(2))
    cut = int(N * 0.85)
    tr, va = perm[:cut], perm[cut:]
    net = MLP(d, PH).to(DEV)
    opt = torch.optim.Adam(net.parameters(), lr=5e-3, weight_decay=1e-4)
    Cs_d = Cs.to(DEV); M_d = M.to(DEV); CI_d = CI.to(DEV)

    def logits_of(idx):
        z = net(Cs_d[idx].reshape(-1, d)).reshape(len(idx), maxc)
        return z.masked_fill(M_d[idx] == 0, -1e9)
    for _ in range(EPOCHS):
        net.train(); opt.zero_grad()
        loss = nn.functional.cross_entropy(logits_of(tr), CI_d[tr]); loss.backward(); opt.step()
    net.eval()
    with torch.no_grad():
        top1 = (logits_of(va).argmax(1) == CI_d[va]).float().mean().item()
    return export_mlp(net, mean, std, 'policy'), round(top1, 4), N


def build(rows, key, trainer):
    by, rep = {}, []
    for lk in sorted(set(r[key] for r in rows if r[key])):
        res = trainer([r for r in rows if r[key] == lk])
        if res:
            by[lk] = res[0]; rep.append(f'{lk}(n={res[2]},m={res[1]})')
    dft = trainer(rows)
    return by, (dft[0] if dft else None), rep, (dft[1] if dft else None)


def js_file(varname, obj, header):
    return f'/* {header} */\nwindow.{varname} = {json.dumps(obj, separators=(",", ":"))};\n'


VALUE_ONLY = os.environ.get('AZ_VALUE_ONLY', '') == '1'   # 1=policyは学習/反映せず value だけ（part3: 価値レバーの切り分け）

# ---- value（POLICY_ONLY または VAL 空ならスキップ＝手作りevalのまま） ----
if not POLICY_ONLY and len(VAL) >= 300:
    vby, vdef, vrep, vacc = build(VAL, 'lk', train_value)
    weights = {'features': EVALF, 'leaderKeys': LK, 'byLeader': vby, 'default': vdef,
               'meta': {'samples': len(VAL), 'perLeader': vrep, 'defaultAcc': vacc, 'hidden': VH, 'src': 'pytorch/train.py(MPS)'}}
    print('VALUE  per-leader:', ' '.join(vrep), '| default acc=', vacc)
    vjs = js_file('AI_WEIGHTS', weights, f'pytorch/train.py(MPS) 生成: 盤面評価(value)NN。{len(VAL)}サンプル/H={VH}/defaultAcc={vacc}。手で編集しない。')
    (OUT / 'ai-weights.js').write_text(vjs)
else:
    vjs = None
    print('VALUE  skip（POLICY_ONLY or VAL<300）= 手作りeval(ai-weights=null)のまま')

# ---- policy（VALUE_ONLY ならスキップ） ----
if not VALUE_ONLY:
    pby, pdef, prep, ptop = build(POL, 'lk', train_policy)
    policy = {'feat': POLF, 'leaderKeys': LK, 'byLeader': pby, 'default': pdef,
              'meta': {'samples': len(POL), 'perLeader': prep, 'defaultTop1': ptop, 'hidden': PH, 'src': 'pytorch/train.py(MPS)'}}
    print('POLICY per-leader:', ' '.join(prep), '| default top1=', ptop)
    pjs = js_file('AI_POLICY', policy, f'pytorch/train.py(MPS) 生成: アタック方策(policy)NN。{len(POL)}サンプル/H={PH}/defaultTop1={ptop}。手で編集しない。')
    (OUT / 'ai-policy.js').write_text(pjs)
else:
    pjs = None
    print('POLICY skip（VALUE_ONLY）= 既存 ai-policy.js のまま')
print('wrote', ('ai-weights.js ' if vjs else '') + ('ai-policy.js' if pjs else ''))
if INSTALL:
    if vjs: (ROOT / 'src' / 'ai-weights.js').write_text(vjs)
    if pjs: (ROOT / 'src' / 'ai-policy.js').write_text(pjs)
    print('INSTALL=1 → ' + (('src/ai-weights.js ' if vjs else '') + ('src/ai-policy.js' if pjs else '')))

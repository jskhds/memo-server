// src/utils/svg-parse.js
import fs from 'fs';
import path from 'path';

const dirname = import.meta.dirname;

const config = {
  inputDir: path.join(dirname, '../../public/kanjivg-raw'),
  outputDir: path.join(dirname, '../../public/stroke-data'),
  samplesPerStroke: 50,
  samplesPerSegment: 10, // bezier 每段采样点数
};

// ── 贝塞尔曲线采样 ──────────────────────────────────────────────────────────

function sampleCubic(x0, y0, x1, y1, x2, y2, x3, y3, n) {
  const pts = [];
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const mt = 1 - t;
    const mt2 = mt * mt,
      t2 = t * t;
    const mt3 = mt2 * mt,
      t3 = t2 * t,
      mt2t = 3 * mt2 * t,
      mtt2 = 3 * mt * t2;
    pts.push({
      x: round(mt3 * x0 + mt2t * x1 + mtt2 * x2 + t3 * x3),
      y: round(mt3 * y0 + mt2t * y1 + mtt2 * y2 + t3 * y3),
    });
  }
  return pts;
}

function sampleQuad(x0, y0, x1, y1, x2, y2, n) {
  const pts = [];
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const mt = 1 - t;
    const mt2 = mt * mt,
      t2 = t * t,
      mtt2 = 2 * mt * t;
    pts.push({
      x: round(mt2 * x0 + mtt2 * x1 + t2 * x2),
      y: round(mt2 * y0 + mtt2 * y1 + t2 * y2),
    });
  }
  return pts;
}

function round(v) {
  return Math.round(v * 100) / 100;
}

// ── SVG path 解析 ───────────────────────────────────────────────────────────

function parsePathData(d) {
  const N = config.samplesPerSegment;
  const points = [];
  let cx = 0,
    cy = 0;
  let lastCtrlX = 0,
    lastCtrlY = 0;
  let lastCmd = '';

  // 将 path 字符串拆成 token 序列（命令字母 | 数字）
  const tokens = d.match(/[MmCcQqSsTtLlHhVvAaZz]|[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g) || [];
  let i = 0;

  const num = () => parseFloat(tokens[i++]);

  while (i < tokens.length) {
    // 若当前 token 是命令字母则读取，否则隐式重复上一条命令
    let cmd;
    if (/[MmCcQqSsTtLlHhVvAaZz]/.test(tokens[i])) {
      cmd = tokens[i++];
      // M 之后的隐式命令是 L/l
      lastCmd = cmd === 'M' ? 'L' : cmd === 'm' ? 'l' : cmd;
    } else {
      cmd = lastCmd;
    }

    switch (cmd) {
      case 'M':
        cx = num();
        cy = num();
        points.push({ x: round(cx), y: round(cy) });
        lastCtrlX = cx;
        lastCtrlY = cy;
        break;
      case 'm':
        cx += num();
        cy += num();
        points.push({ x: round(cx), y: round(cy) });
        lastCtrlX = cx;
        lastCtrlY = cy;
        break;

      case 'L':
        cx = num();
        cy = num();
        points.push({ x: round(cx), y: round(cy) });
        lastCtrlX = cx;
        lastCtrlY = cy;
        break;
      case 'l':
        cx += num();
        cy += num();
        points.push({ x: round(cx), y: round(cy) });
        lastCtrlX = cx;
        lastCtrlY = cy;
        break;

      case 'H':
        cx = num();
        points.push({ x: round(cx), y: round(cy) });
        lastCtrlX = cx;
        lastCtrlY = cy;
        break;
      case 'h':
        cx += num();
        points.push({ x: round(cx), y: round(cy) });
        lastCtrlX = cx;
        lastCtrlY = cy;
        break;
      case 'V':
        cy = num();
        points.push({ x: round(cx), y: round(cy) });
        lastCtrlX = cx;
        lastCtrlY = cy;
        break;
      case 'v':
        cy += num();
        points.push({ x: round(cx), y: round(cy) });
        lastCtrlX = cx;
        lastCtrlY = cy;
        break;

      case 'C': {
        const x1 = num(),
          y1 = num(),
          x2 = num(),
          y2 = num(),
          x3 = num(),
          y3 = num();
        points.push(...sampleCubic(cx, cy, x1, y1, x2, y2, x3, y3, N));
        lastCtrlX = x2;
        lastCtrlY = y2;
        cx = x3;
        cy = y3;
        break;
      }
      case 'c': {
        const dx1 = num(),
          dy1 = num(),
          dx2 = num(),
          dy2 = num(),
          dx = num(),
          dy = num();
        points.push(
          ...sampleCubic(cx, cy, cx + dx1, cy + dy1, cx + dx2, cy + dy2, cx + dx, cy + dy, N),
        );
        lastCtrlX = cx + dx2;
        lastCtrlY = cy + dy2;
        cx += dx;
        cy += dy;
        break;
      }

      case 'S': {
        const x1 = 2 * cx - lastCtrlX,
          y1 = 2 * cy - lastCtrlY;
        const x2 = num(),
          y2 = num(),
          x3 = num(),
          y3 = num();
        points.push(...sampleCubic(cx, cy, x1, y1, x2, y2, x3, y3, N));
        lastCtrlX = x2;
        lastCtrlY = y2;
        cx = x3;
        cy = y3;
        break;
      }
      case 's': {
        const x1 = 2 * cx - lastCtrlX,
          y1 = 2 * cy - lastCtrlY;
        const dx2 = num(),
          dy2 = num(),
          dx = num(),
          dy = num();
        points.push(...sampleCubic(cx, cy, x1, y1, cx + dx2, cy + dy2, cx + dx, cy + dy, N));
        lastCtrlX = cx + dx2;
        lastCtrlY = cy + dy2;
        cx += dx;
        cy += dy;
        break;
      }

      case 'Q': {
        const x1 = num(),
          y1 = num(),
          x2 = num(),
          y2 = num();
        points.push(...sampleQuad(cx, cy, x1, y1, x2, y2, N));
        lastCtrlX = x1;
        lastCtrlY = y1;
        cx = x2;
        cy = y2;
        break;
      }
      case 'q': {
        const dx1 = num(),
          dy1 = num(),
          dx = num(),
          dy = num();
        points.push(...sampleQuad(cx, cy, cx + dx1, cy + dy1, cx + dx, cy + dy, N));
        lastCtrlX = cx + dx1;
        lastCtrlY = cy + dy1;
        cx += dx;
        cy += dy;
        break;
      }

      case 'T': {
        const x1 = 2 * cx - lastCtrlX,
          y1 = 2 * cy - lastCtrlY;
        const x2 = num(),
          y2 = num();
        points.push(...sampleQuad(cx, cy, x1, y1, x2, y2, N));
        lastCtrlX = x1;
        lastCtrlY = y1;
        cx = x2;
        cy = y2;
        break;
      }
      case 't': {
        const x1 = 2 * cx - lastCtrlX,
          y1 = 2 * cy - lastCtrlY;
        const dx = num(),
          dy = num();
        points.push(...sampleQuad(cx, cy, x1, y1, cx + dx, cy + dy, N));
        lastCtrlX = x1;
        lastCtrlY = y1;
        cx += dx;
        cy += dy;
        break;
      }

      case 'Z':
      case 'z':
        lastCtrlX = cx;
        lastCtrlY = cy;
        break;

      default:
        break;
    }
  }

  return points;
}

// ── 等距重采样 ──────────────────────────────────────────────────────────────

function resample(points, numSamples) {
  if (points.length === 0) return [];
  if (points.length <= numSamples) return points;

  const result = [points[0]];
  const totalLength = getTotalLength(points);
  const interval = totalLength / (numSamples - 1);

  let accumulated = 0;
  let target = interval;

  for (let i = 1; i < points.length; i++) {
    const segLen = distance(points[i - 1], points[i]);
    while (accumulated + segLen >= target && result.length < numSamples) {
      const t = (target - accumulated) / segLen;
      result.push({
        x: round(points[i - 1].x + t * (points[i].x - points[i - 1].x)),
        y: round(points[i - 1].y + t * (points[i].y - points[i - 1].y)),
      });
      target += interval;
    }
    accumulated += segLen;
  }

  if (result.length < numSamples) result.push(points[points.length - 1]);
  return result.slice(0, numSamples);
}

function getTotalLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += distance(points[i - 1], points[i]);
  return len;
}

function distance(p1, p2) {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

// ── 文件处理 ────────────────────────────────────────────────────────────────

function parseSVGFile(filePath) {
  const svgContent = fs.readFileSync(filePath, 'utf-8');
  const pathRegex = /<path[^>]+d="([^"]+)"/g;
  const strokes = [];

  let match;
  while ((match = pathRegex.exec(svgContent)) !== null) {
    const raw = parsePathData(match[1]);
    const sampled = resample(raw, config.samplesPerStroke);
    if (sampled.length > 0) {
      strokes.push({ id: strokes.length, points: sampled });
    }
  }

  return strokes;
}

function batchProcess() {
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  const files = fs.readdirSync(config.inputDir).filter((f) => f.endsWith('.svg'));
  console.log(`找到 ${files.length} 个 SVG 文件\n`);

  files.forEach((file, index) => {
    const strokes = parseSVGFile(path.join(config.inputDir, file));
    const unicode = file.replace('.svg', '');
    const data = {
      character: String.fromCodePoint(parseInt(unicode, 16)),
      unicode,
      strokes,
    };
    fs.writeFileSync(path.join(config.outputDir, `${unicode}.json`), JSON.stringify(data, null, 2));
    console.log(
      `[${index + 1}/${files.length}] ✅ ${data.character} (${unicode}) — ${strokes.length} 笔`,
    );
  });

  console.log('\n🎉 完成！');
}

batchProcess();

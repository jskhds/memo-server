// src/utils/svg-parse.js
import fs from 'fs';
import path from 'path';

const dirname = import.meta.dirname;

// 配置
const config = {
  inputDir: path.join(dirname, '../../public/kanjivg-raw'),
  outputDir: path.join(dirname, '../../public/stroke-data'),
  samplesPerStroke: 50,
};

/**
 * 简单解析 SVG path 的 d 属性，提取所有坐标点
 */
function parsePathData(d) {
  const points = [];
  let currentX = 0;
  let currentY = 0;

  // 提取所有数字（包括负数和小数）
  const numbers = d.match(/-?\d+\.?\d*/g);
  if (!numbers) return points;

  let i = 0;
  const commands = d.match(/[MmLlHhVvCcSsQqTtAaZz]/g) || [];

  for (const cmd of commands) {
    switch (cmd) {
      case 'M': // 绝对移动
        currentX = parseFloat(numbers[i++]);
        currentY = parseFloat(numbers[i++]);
        points.push({ x: currentX, y: currentY });
        break;

      case 'm': // 相对移动
        currentX += parseFloat(numbers[i++]);
        currentY += parseFloat(numbers[i++]);
        points.push({ x: currentX, y: currentY });
        break;

      case 'L': // 绝对直线
        currentX = parseFloat(numbers[i++]);
        currentY = parseFloat(numbers[i++]);
        points.push({ x: currentX, y: currentY });
        break;

      case 'l': // 相对直线
        currentX += parseFloat(numbers[i++]);
        currentY += parseFloat(numbers[i++]);
        points.push({ x: currentX, y: currentY });
        break;

      case 'C': // 绝对三次贝塞尔曲线
        i += 4; // 跳过控制点
        currentX = parseFloat(numbers[i++]);
        currentY = parseFloat(numbers[i++]);
        points.push({ x: currentX, y: currentY });
        break;

      case 'c': // 相对三次贝塞尔曲线
        i += 4; // 跳过控制点
        currentX += parseFloat(numbers[i++]);
        currentY += parseFloat(numbers[i++]);
        points.push({ x: currentX, y: currentY });
        break;

      case 'Q': // 绝对二次贝塞尔曲线
        i += 2; // 跳过控制点
        currentX = parseFloat(numbers[i++]);
        currentY = parseFloat(numbers[i++]);
        points.push({ x: currentX, y: currentY });
        break;

      case 'q': // 相对二次贝塞尔曲线
        i += 2; // 跳过控制点
        currentX += parseFloat(numbers[i++]);
        currentY += parseFloat(numbers[i++]);
        points.push({ x: currentX, y: currentY });
        break;

      default:
        // 其他命令暂时忽略
        break;
    }
  }

  return points;
}

/**
 * 重新采样到固定数量的点
 */
function resample(points, numSamples) {
  if (points.length === 0) return [];
  if (points.length <= numSamples) return points;

  const result = [points[0]];
  const totalLength = getTotalLength(points);
  const interval = totalLength / (numSamples - 1);

  let accumulatedLength = 0;
  let targetLength = interval;

  for (let i = 1; i < points.length; i++) {
    const segmentLength = distance(points[i - 1], points[i]);

    while (accumulatedLength + segmentLength >= targetLength && result.length < numSamples) {
      const t = (targetLength - accumulatedLength) / segmentLength;
      const point = {
        x: Math.round((points[i - 1].x + t * (points[i].x - points[i - 1].x)) * 100) / 100,
        y: Math.round((points[i - 1].y + t * (points[i].y - points[i - 1].y)) * 100) / 100,
      };
      result.push(point);
      targetLength += interval;
    }

    accumulatedLength += segmentLength;
  }

  // 确保包含终点
  if (result.length < numSamples) {
    result.push(points[points.length - 1]);
  }

  return result.slice(0, numSamples);
}

function getTotalLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += distance(points[i - 1], points[i]);
  }
  return length;
}

function distance(p1, p2) {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * 解析单个 SVG 文件
 */
function parseSVGFile(filePath) {
  const svgContent = fs.readFileSync(filePath, 'utf-8');

  // 提取所有 path 的 d 属性
  const pathRegex = /<path[^>]+d="([^"]+)"/g;
  const strokes = [];

  let match;
  while ((match = pathRegex.exec(svgContent)) !== null) {
    const d = match[1];
    const points = parsePathData(d);
    const sampledPoints = resample(points, config.samplesPerStroke);

    if (sampledPoints.length > 0) {
      strokes.push({
        id: strokes.length,
        points: sampledPoints,
      });
    }
  }

  return strokes;
}

/**
 * 批量处理
 */
function batchProcess() {
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  const files = fs.readdirSync(config.inputDir).filter((f) => f.endsWith('.svg'));

  console.log(`找到 ${files.length} 个 SVG 文件\n`);

  files.forEach((file, index) => {
    const svgPath = path.join(config.inputDir, file);
    const strokes = parseSVGFile(svgPath);
    const unicode = file.replace('.svg', '');

    const data = {
      character: String.fromCharCode(parseInt(unicode, 16)),
      unicode: unicode,
      strokes: strokes,
    };

    const outputPath = path.join(config.outputDir, `${unicode}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

    console.log(
      `[${index + 1}/${files.length}] ✅ ${data.character} (${unicode}) - ${strokes.length} 笔`,
    );
  });

  console.log(`\n🎉 完成！`);
}

batchProcess();

# 双星环绕 · Binary Stars

一段 2 分钟的科普动画，讲解双星系统如何绕共同质心运动，用 [HyperFrames](https://hyperframes.heygen.com)（HTML → MP4）制作。画面和背景音乐都由代码生成，按同一套 128 BPM 节拍网格对齐，所以画面切换都踩在鼓点上。

## 内容（8 段 × 15 秒）

| 时间 | 段落 |
| --- | --- |
| 0:00 | 开场倒计时：夜空中的一颗星，可能是两颗 |
| 0:15 | 标题 + 01 什么是双星 |
| 0:30 | 02 共同质心：m₁r₁ = m₂r₂ |
| 0:45 | 03 开普勒第三定律：用双星「称」质量 |
| 1:00 | 04 椭圆轨道与开普勒第二定律 |
| 1:15 | 05 三种方法发现双星：目视 / 分光（多普勒）/ 食双星（光变曲线） |
| 1:30 | 06 极端双星：物质交流、黑洞旋近并合与引力波 |
| 1:45 | 回顾与结尾 |

## 目录

```
video/index.html      主合成：Canvas 绘制物理动画 + GSAP 文字时间线
video/meta.json       HyperFrames 项目信息
tools/make-bgm.mjs    背景音乐生成器（Node 合成 128 BPM 电子乐，输出 WAV）
```

## 渲染

需要 Node.js 18+ 和 ffmpeg（在 PATH 里）。

```bash
npm install
node tools/make-bgm.mjs video/bgm.wav
cd video
npx hyperframes@0.9.14 check
npx hyperframes@0.9.14 render --fps 30 --quality looks -o ../binary-stars.mp4
```

背景音乐 `bgm.wav` 和渲染出的 MP4 不放进仓库，用上面的命令重新生成即可。

## 实现要点

- 所有动画只依赖时间 `t`：画面在运行时的 `hf-seek` 事件里按帧重绘，没有 `Math.random()` / `Date.now()`，每次渲染结果相同。
- 鼓点、镲片的时间表在 `index.html` 和 `make-bgm.mjs` 里用同一套小节 / 拍子计算，画面的闪白、震动、文字弹出都对齐音乐。
- 物理部分：质心关系、开普勒方程（牛顿迭代求椭圆轨道）、圆面重叠算食双星光变、旋近时距离按 x^(1/4) 缩小。

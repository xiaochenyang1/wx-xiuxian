# 修仙主页美术素材交付规范

## 基准画布

- 设计尺寸：`750 x 1334 px`，竖屏，sRGB。
- 坐标均以屏幕左上角为 `(0, 0)`。
- PNG 透明素材不要带文字、红点、数值或按钮底板；这些内容由程序动态绘制。
- 文件导入 Cocos 后不要改名。对应 `.meta` 文件由 Cocos Creator 自动生成并需要一起保留。
- 下文各表里的「按钮中心坐标」是**底板**中心。图案实际画在底板中心上方一小段距离的一个更小的方框里，每一节各自写明底板尺寸和图案框。图案按 `contain` 等比缩放（不裁切、不变形），所以 `256 x 256` 的方图进正方形框刚好填满。

## 主背景

四个一级页签各一张全屏底图。缺哪一张，该页签就退回程序绘制的山影底色，不会报错。

| 页签 | 文件位置 | 推荐尺寸 |
| --- | --- | --- |
| 修炼 | `assets/resources/art/backgrounds/cultivation.png` | `750 x 1334` |
| 伴侣 | `assets/resources/art/backgrounds/partner.png` | `750 x 1334` |
| 排行 | `assets/resources/art/backgrounds/ranking.png` | `750 x 1334` |
| 洞府 | `assets/resources/art/backgrounds/cave.png` | `750 x 1334` |

- 文件名必须正好是这四个（大小写不敏感，可以放在子目录里）。程序整目录加载后按名字认领，名字不对的图会被静默忽略。
- 背景按 `cover` 铺满：`缩放 = max(750 / 源宽, 1334 / 源高)`，居中裁切。给足 `750 x 1334` 就一像素不裁；比例不同的图会在长边两侧被切掉，构图重心请放在中央。
- 只要山水、建筑、天空，不要人物、按钮、文字和数值。
- 伴侣、排行、洞府这三张会被程序压到 `224/255` 不透明度，再叠一层 21% 的黑色蒙版，好让上面的白字读得清。这三张请画得比修炼页更亮、对比更低，压暗之后才不会糊成一片。修炼页那张按原色显示。

## 必须提供

| 素材 | 文件位置 | 推荐尺寸 | 画面位置 | 要求 |
| --- | --- | --- | --- | --- |
| 男修人物 | `assets/resources/art/characters/cultivator-male.png` | `640 x 900` | 中心约 `(375, 625)` | 透明 PNG，人物完整，不要光环和界面 |
| 女修人物 | `assets/resources/art/characters/cultivator-female.png` | `640 x 900` | 中心约 `(375, 625)` | 与男修保持相同构图、比例和光照 |
| 男修头像 | `assets/resources/art/avatars/player-male.png` | `256 x 256` | 显示区约 `x=12..126, y=12..142` | 透明或正方形头像，不要等级、VIP 和边框 |
| 女修头像 | `assets/resources/art/avatars/player-female.png` | `256 x 256` | 显示区约 `x=12..126, y=12..142` | 与女修人物的面貌、服饰和配色一致 |

## 右侧一级导航

图标统一使用 `256 x 256` 透明 PNG，图案居中并保留约 12% 安全边距。程序会负责按钮底板、选中态和文字。

| 入口 | 文件位置 | 按钮中心坐标 |
| --- | --- | --- |
| 修炼 | `assets/resources/art/navigation/main/cultivation.png` | `(694, 237)` |
| 伴侣 | `assets/resources/art/navigation/main/partner.png` | `(694, 345)` |
| 排行 | `assets/resources/art/navigation/main/ranking.png` | `(694, 453)` |
| 洞府 | `assets/resources/art/navigation/main/cave.png` | `(694, 561)` |

右侧导航整体占用约 `x=638..750, y=179..619`。按钮底板是 `100 x 98` 的圆角矩形（点击区 `104 x 102`），图案框 `58 x 58`、中心在坐标**上方 17 px**（例如「修炼」的图案落在 `x=665..723, y=191..249`），底板下半留给程序写的文字。

## 底部功能栏

图标统一使用 `256 x 256` 透明 PNG。底栏占用 `y=1160..1334`，七个入口等宽排列，间距 107。

| 入口 | 文件位置 | 按钮中心坐标 |
| --- | --- | --- |
| 功法 | `assets/resources/art/navigation/features/technique.png` | `(54, 1247)` |
| 法宝 | `assets/resources/art/navigation/features/treasure.png` | `(161, 1247)` |
| 炼丹 | `assets/resources/art/navigation/features/alchemy.png` | `(268, 1247)` |
| 炼器 | `assets/resources/art/navigation/features/crafting.png` | `(375, 1247)` |
| 试炼塔 | `assets/resources/art/navigation/features/trial-tower.png` | `(482, 1247)` |
| 宗门 | `assets/resources/art/navigation/features/sect.png` | `(589, 1247)` |
| 历练 | `assets/resources/art/navigation/features/training.png` | `(696, 1247)` |

按钮底板是 `100 x 158` 的圆角矩形（点击区 `104 x 166`）。图案画在一枚直径 68 的黑色圆牌上，圆牌中心在坐标**上方 27 px**，图案框 `66 x 66`（例如「功法」的图案落在 `x=21..87, y=1187..1253`）。圆牌永远在图案下面，所以图案要在纯黑底上读得清，浅色和金色描边最稳；方框四角会探出圆牌，图案宜作圆形构图。

## 修炼页左侧快捷

同样是 `256 x 256` 透明 PNG，与底栏共用一套图标目录。这三格只在修炼页出现，各带一个程序绘制的数字角标（待领任务数、收获箱件数、未领日常数），角标压在图标右上角外侧，图案本身不要画红点。

| 入口 | 文件位置 | 按钮中心坐标 |
| --- | --- | --- |
| 任务 | `assets/resources/art/navigation/features/tasks.png` | `(53, 412)` |
| 行囊 | `assets/resources/art/navigation/features/inventory.png` | `(53, 517)` |
| 日常 | `assets/resources/art/navigation/features/daily.png` | `(53, 622)` |

底板是直径 70 的深蓝灰色圆盘（`#1b2f3b`，金色描边外径 74），圆心在坐标**上方 12 px**；图案框 `58 x 58`、中心在坐标**上方 14 px**。方框的四角会探出圆盘，所以图案宜作圆形构图，主体收在中央约 85% 的范围内。点击区 `86 x 96`。

档案不在这张表里：它的入口是顶栏头像，用的是上面那两张 `player-*.png`。

## 道具、装备与功法图标（尚无程序入口）

行囊、法宝、功法三个面板现在是纯文字列表，每行只有名称和数量，品质靠名字的颜色区分。加一套图标是这三处观感提升最大的一步，但**程序侧还没有加载和绘制这类图标的代码**——现在把文件放进仓库不会有任何变化，要先改代码。所以这一节是规格，不是待交付清单；真要做，先定粒度。

### 方案 A：按槽位出图（推荐，22 张）

| 组 | 张数 | 文件位置 |
| --- | --- | --- |
| 装备槽 | 5 | `art/slots/equipment/{weapon,armor,accessory,mount,pet}.png` |
| 功法槽 | 4 | `art/slots/technique/{mind,movement,divine,secret}.png` |
| 道具 | 13 | `art/items/{id}.png`，`id` 取 `ITEM_CONFIGS` 那 13 个：`exp_pill_small`、`exp_pill_large`、`breakthrough_pill`、`dual_cultivation_pill`、`enhance_stone`、`technique_page`、`treasure_token`、`rename_card`、`wood`、`stone`、`ore`、`spiritual_soil`、`spiritual_herb` |

品质与段位不进美术：名字已经按品质着色，段位写在行内文字里，所以同一个槽位的凡阶木剑和天阶仙剑共用一张剑的图标。

### 方案 B：按配置逐件出图（65 张）

20 件装备 + 32 本功法 + 13 个道具，文件名对应 `EQUIPMENT_CONFIGS` / `TECHNIQUE_CONFIGS` / `ITEM_CONFIGS` 里的 `id`。

### 取舍

- 工作量差 3 倍（22 对 65），而列表里图标只占约 `64 x 64` 设计像素，逐件出图的细节在这个尺寸上大半看不出来。
- 方案 B 把美术钉在配置表上：以后加第 5 段位要再补 13 张（5 件装备 + 8 本功法）。方案 A 与段位解耦，加段位一张图都不用补。
- 所以推荐 A。个别重点物件（比如天阶那把 `void_immortal_sword`）想单独出图也不冲突：程序按「有逐件图用逐件图，没有回落到槽位图」来找，两套可以并存。

统一 `256 x 256` 透明 PNG，与其它图标一致。列表里按 `contain` 缩到约 `64 x 64`，所以主体要占满画布、别留大边距，细描边缩放后会消失。

## 可选增强素材

| 素材 | 文件位置 | 推荐尺寸 | 画面位置 |
| --- | --- | --- | --- |
| 修炼光环 | `assets/resources/art/effects/cultivation-halo.png` | `700 x 700` | 中心约 `(375, 500)` |
| 修炼信息框 | `assets/resources/art/ui/cultivation-panel.png` | `480 x 300` | 中心约 `(375, 920)` |
| 突破按钮底图 | `assets/resources/art/ui/breakthrough-button.png` | `360 x 110` | 中心约 `(375, 1010)` |
| 自动修炼图标 | `assets/resources/art/actions/auto-cultivation.png` | `180 x 180` | 中心约 `(70, 990)` |
| 在线奖励图标 | `assets/resources/art/actions/online-reward.png` | `180 x 180` | 中心约 `(680, 990)` |
| 灵石图标 | `assets/resources/art/currency/spirit-stone.png` | `96 x 96` | 顶栏动态排版 |
| 仙玉图标 | `assets/resources/art/currency/immortal-jade.png` | `96 x 96` | 顶栏动态排版 |

## 导出检查

- 所有透明图片使用直边透明，不要带白边、黑底或整张截图背景。
- 男修、女修素材文件名必须带 `-male`、`-female` 后缀，程序按存档中的角色形象加载，不能用一张通用图覆盖两种选择。
- 同一组图标保持一致的光照方向、描边粗细和视觉占比。
- 四张主背景要用同一套光照与色调，切页签时不该有明显跳色。
- 主背景必须是无界面的干净底图，才能让名字、等级、战力、货币和进度显示真实本地数据。
- 如果提供两套按钮状态，文件名后缀使用 `-normal.png` 和 `-selected.png`。

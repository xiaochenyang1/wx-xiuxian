# 修仙主页美术素材交付规范

## 基准画布

- 设计尺寸：`750 x 1334 px`，竖屏，sRGB。
- 坐标均以屏幕左上角为 `(0, 0)`。
- PNG 透明素材不要带文字、红点、数值或按钮底板；这些内容由程序动态绘制。
- 文件导入 Cocos 后不要改名。对应 `.meta` 文件由 Cocos Creator 自动生成并需要一起保留。

## 必须提供

| 素材 | 文件位置 | 推荐尺寸 | 画面位置 | 要求 |
| --- | --- | --- | --- | --- |
| 修炼场景背景 | `assets/resources/art/backgrounds/cultivation.png` | `750 x 1334` | `(0, 0)` 全屏 | 只要山水、建筑、天空，不要人物、按钮、文字和数值 |
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

右侧导航整体占用约 `x=638..750, y=179..619`。

## 底部功能栏

图标统一使用 `256 x 256` 透明 PNG。底栏占用 `y=1160..1334`，七个入口等宽排列。

| 入口 | 文件位置 | 按钮中心坐标 |
| --- | --- | --- |
| 功法 | `assets/resources/art/navigation/features/technique.png` | `(54, 1247)` |
| 法宝 | `assets/resources/art/navigation/features/treasure.png` | `(161, 1247)` |
| 炼丹 | `assets/resources/art/navigation/features/alchemy.png` | `(268, 1247)` |
| 炼器 | `assets/resources/art/navigation/features/crafting.png` | `(375, 1247)` |
| 灵宠 | `assets/resources/art/navigation/features/pet.png` | `(482, 1247)` |
| 宗门 | `assets/resources/art/navigation/features/sect.png` | `(589, 1247)` |
| 历练 | `assets/resources/art/navigation/features/training.png` | `(696, 1247)` |

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
- 主背景必须是无界面的干净底图，才能让名字、等级、战力、货币和进度显示真实本地数据。
- 如果提供两套按钮状态，文件名后缀使用 `-normal.png` 和 `-selected.png`。
